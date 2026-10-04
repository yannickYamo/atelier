// atelier/providers/anthropic.ts — ONE implementation of InferenceClient. Not core, not an adapter.
//
// Deliberately outside core/: this file knows a vendor, and core must not. Deliberately outside
// adapters/: a host is where a skill RUNS, a provider is what INFERS — conflating them is how a system
// ends up unable to change model without changing harness.
//
// The stable/variable split from the interface is honoured here, which is where the ~9x saving lives:
// the instructions are marked cache_control and the corpus is not.

import Anthropic from '@anthropic-ai/sdk';
import type { InferenceClient, InferenceRequest, InferenceResult, InferenceTermination } from '../core/inference/client.js';
import { budgetUsd, inferenceTimeoutMs, INFERENCE_MAX_RETRIES, GenerationIncomplete, ModelUnavailable, isUnknownModel } from '../core/inference/client.js';
import { ANTHROPIC_PRICING, costOf, priceFor, type Pricing } from './pricing.js';

export type { Pricing } from './pricing.js';

/**
 * Anthropic's `stop_reason` vocabulary, mapped to the one core understands.
 *
 * Exported because a mapping that can only be exercised through a paid API call is a mapping nobody
 * checks. `null` happens on a streaming-shaped response and is not a completion.
 *
 * `tool_use` is COMPLETE: every request here asks for a tool call, so ending in one is the success
 * path. See `isReadableTermination`.
 */
export const anthropicTermination = (stopReason: string | null): InferenceTermination => {
  switch (stopReason) {
    case 'end_turn': case 'stop_sequence': case 'tool_use': return { kind: 'COMPLETE' };
    case 'max_tokens': return { kind: 'MAX_TOKENS' };
    case 'refusal': return { kind: 'REFUSAL' };
    default: return { kind: 'OTHER', providerValue: stopReason ?? 'null' };
  }
};

/**
 * AN ACCOUNT REFUSAL, SAID IN ONE LINE. A provider that will not serve this key (no credit left, a key it
 * does not recognise, one it forbids, or one over its rate or budget limit) answered with its raw error
 * JSON, which the CLI printed whole: a wall of braces around the one sentence a person needed. This
 * returns that sentence, with the request id a support ticket needs, or null when the failure is anything else.
 *
 * Shared by both providers and the CLI's last-resort error path, so the wording lives in one place.
 */
export function accountRefusal(status: number | undefined, body: string, requestId?: string | null): string | null {
  const id = requestId ?? /"request_id"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? /\b(req_[A-Za-z0-9]+)/.exec(body)?.[1] ?? null;
  const tail = id ? ` (request id ${id})` : '';
  if (status === 400 && /credit balance is too low|insufficient[_ ](?:credit|funds|quota)|exceeded your current quota/i.test(body)) {
    return `the API key has no credit left: add credits, or set another key${tail}.`;
  }
  if (status === 401) return `the API key was not accepted (HTTP 401): check it, or set another key${tail}.`;
  if (status === 403) return `the API key is not allowed to make this call (HTTP 403): check its permissions, or set another key${tail}.`;
  if (status === 429) return `the backend is limiting this key (HTTP 429: a rate or budget limit). Nothing more was spent; try again when the limit resets${tail}.`;
  return null;
}

// ── FORCED TOOL CHOICE, WHERE THE MODEL STILL ACCEPTS IT ─────────────────────────────────────────
//
// Every call here asks for one tool call whose input is the answer. Forcing it (`tool_choice: tool`) is
// what the qualified instruments were measured with, so it stays wherever a model accepts it. Claude Opus
// 5.5, Sonnet 5.5 and Fable 5.1 answer it with a 400; for those the call is made with `auto` and an
// explicit instruction to use the tool, and a reply without the tool call still fails closed below.
// Structured outputs (`output_config.format`) were not used: they do not support the number bounds and
// some array constraints these schemas carry, and moving every instrument to them would change what was
// measured (docs/decisions/0005-forced-tool-choice.md).

/** Models this process has seen refuse forced tool choice. Learned from the API's own 400, not listed. */
const noForcedChoice = new Set<string>();
/** Models that rejected a `temperature` setting: asked once, then called without one. */
const noTemperature = new Set<string>();

/** Whether an error is the API refusing a temperature setting for this model (a 400 that names it). */
export const refusesTemperature = (e: unknown): boolean => {
  const f = statusAndBody(e);
  return f?.status === 400 && /temperature/i.test(f.body);
};

/**
 * Whether an error is the API refusing forced tool choice for this model: a 400 that names `tool_choice`
 * and says it is not supported. Matched loosely, so a reworded message still takes the fallback; the
 * cost of a false match is one extra call with `auto`, which still fails closed.
 */
export const refusesForcedChoice = (e: unknown): boolean => {
  const f = statusAndBody(e);
  return f?.status === 400 && /tool_choice/i.test(f.body) && /not supported|unsupported|not allowed/i.test(f.body);
};

/** An SDK error's status and body, as `accountRefusal` and `isUnknownModel` read them. */
const statusAndBody = (e: unknown): { status: number | undefined; body: string; requestId: string | null } | null => {
  if (!(e instanceof Anthropic.APIError)) return null;
  const status: unknown = e.status;
  return { status: typeof status === 'number' ? status : undefined, body: JSON.stringify(e.error ?? null) + e.message, requestId: e.requestID ?? null };
};

/** A provider failure said plainly: an account refusal in one line, an unknown model as ModelUnavailable. */
const plainFailure = (e: unknown, modelId: string): Error | null => {
  const f = statusAndBody(e);
  if (!f) return null;
  const refusal = accountRefusal(f.status, f.body, f.requestId);
  if (refusal) return new Error(refusal, { cause: e });
  return isUnknownModel(f.status, f.body) ? new ModelUnavailable(modelId, f.body) : null;
};

export class AnthropicInferenceClient implements InferenceClient {
  private readonly client: Anthropic;
  constructor(private readonly modelId: string, apiKey?: string, private readonly pricing: Pricing | null = priceFor(ANTHROPIC_PRICING, modelId),
    /** `--temperature`, sent on every call that sets none of its own; it used to be recorded and never sent */
    private readonly defaultTemperature?: number) {
    // Two credential forms, both the SDK's own: an API key, or a bearer token (ANTHROPIC_AUTH_TOKEN),
    // which is what a corporate gateway issues. Accepting only the first blocked anyone behind one
    // before the SDK was ever reached. The SDK reads ANTHROPIC_BASE_URL itself.
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    const authToken = apiKey ? undefined : process.env.ANTHROPIC_AUTH_TOKEN;
    if (!key && !authToken) {
      throw new Error(
        'Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is set.\n'
        + '  export ANTHROPIC_API_KEY=sk-...        (or ANTHROPIC_AUTH_TOKEN=... behind a gateway)\n'
        + 'Atelier needs an inference provider for this step. Your corpus, standard and outputs '
        + 'stay on this machine; nothing is sent anywhere except that one call.',
      );
    }
    // Retries stated rather than inherited. The SDK's own default is the same number; naming it
    // here is what lets a reader work out the worst case from this file instead of from the SDK's.
    this.client = new Anthropic({ apiKey: key ?? null, authToken: authToken ?? null, maxRetries: INFERENCE_MAX_RETRIES });
  }

  async complete(req: InferenceRequest): Promise<InferenceResult> {
    let res: Anthropic.Message;
    try {
      res = await this.create(req, !noForcedChoice.has(this.modelId));
    } catch (e) {
      // A model that takes no temperature: remembered, and the same call sent again without one.
      if (refusesTemperature(e) && !noTemperature.has(this.modelId)) {
        noTemperature.add(this.modelId);
        return this.complete(req);
      }
      if (!refusesForcedChoice(e)) throw plainFailure(e, this.modelId) ?? e;
      // A model can refuse both, one 400 at a time: the call without forced choice may then be refused for its
      // temperature. Asked again from the top, each refusal is remembered once, so this ends.
      noForcedChoice.add(this.modelId);
      return this.complete(req);
    }
    return this.read(req, res);
  }

  /** One request. `forced`: the tool call is required; otherwise it is asked for in words. */
  private create(req: InferenceRequest, forced: boolean): Promise<Anthropic.Message> {
    const temperature = noTemperature.has(this.modelId) ? undefined : req.temperature ?? this.defaultTemperature;
    return this.client.messages.create({
      model: this.modelId,
      max_tokens: req.maxTokens,
      ...(temperature === undefined ? {} : { temperature }),
      // STABLE first and cached; VARIABLE second and not. Reversing these still works and costs ~9x.
      //
      // AN EMPTY STABLE BLOCK IS OMITTED, NOT SENT EMPTY. The API rejects `cache_control` on an empty
      // text block outright — "cache_control cannot be set for empty text blocks" — so a request with
      // nothing to cache fails before it is answered.
      //
      // That is not a hypothetical shape. It is exactly what a BARE control arm sends: the condition
      // with no Atelier-derived carrier at all. The whole arm was unrunnable against a real provider
      // and no test saw it, because every test that exercises this path replaces the provider. The
      // first live run found it on its first attempt.
      system: [
        ...(req.stableBlock
          ? [{ type: 'text' as const, text: req.stableBlock, cache_control: { type: 'ephemeral' as const } }]
          : []),
        ...(req.variableBlock ? [{ type: 'text' as const, text: req.variableBlock }] : []),
      ],
      messages: [{ role: 'user', content: forced ? req.userMessage : `${req.userMessage}\n\nAnswer by calling the ${req.toolName} tool, once.` }],
      tools: [{ name: req.toolName, description: req.toolDescription, input_schema: req.schema as Anthropic.Tool.InputSchema }],
      tool_choice: forced ? { type: 'tool', name: req.toolName } : { type: 'auto' },
    }, {
      // Per-request, because the bound depends on how much was asked for. Without it this inherits
      // the SDK's ten-minute default on every call regardless of size, and a stalled discovery run
      // spends twenty minutes over two retries before saying anything.
      timeout: inferenceTimeoutMs(req.maxTokens),
    });
  }

  /** The response, read: termination first, then the tool call. An account refusal or unknown model was said plainly above. */
  private read(req: InferenceRequest, res: Anthropic.Message): InferenceResult {
    const u = res.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    const termination = anthropicTermination(res.stop_reason);

    // TERMINATION IS CHECKED BEFORE THE PAYLOAD, and the order is the point. Asking "is there a
    // tool_use block?" first turns a truncation into "the schema was not satisfied" — a content
    // failure that reads as the model's fault, on a call the model was never allowed to finish.
    // That misattribution is what a retracted coverage effect was built on.
    if (termination.kind !== 'COMPLETE') {
      throw new GenerationIncomplete(termination,
        termination.kind === 'MAX_TOKENS'
          ? `the model stopped at the ${req.maxTokens}-token limit before completing the object. `
            + 'A truncated structured output is not a partial answer, it is an unparseable one. Nothing was recorded.'
          : `${this.modelId} stopped for "${termination.kind === 'OTHER' ? termination.providerValue : termination.kind}" before completing the object (call: ${req.toolName}). Nothing was recorded.`,
        u.output_tokens);
    }

    const block = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    if (!block) throw new Error(`inference returned no tool_use block (stop_reason: ${res.stop_reason}). The schema was not satisfied.`);

    const usage = {
      inputTokens: u.input_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0, outputTokens: u.output_tokens,
    };
    const cost = costOf(this.pricing, usage, false);
    // `res.model` and not `this.modelId`: an alias resolves server-side, and the RuntimeBinding needs
    // to record what answered rather than what we asked for.
    // NULL, AND IT IS A PROTOCOL FACT RATHER THAN AN OMISSION. The Messages API does not expose
    // per-token logprobs, so an instrument that reads a distribution cannot run on this adapter. It
    // must say which backend it needs instead of quietly producing a weaker reading here.
    const temperatureSent = noTemperature.has(this.modelId) ? null : req.temperature ?? this.defaultTemperature ?? null;
    return { json: block.input, modelId: res.model, ...usage, cost, costUsd: budgetUsd(cost), logprobs: null, termination, temperatureSent };
  }
}
