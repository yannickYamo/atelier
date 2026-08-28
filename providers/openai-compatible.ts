// atelier/providers/openai-compatible.ts — THE SECOND PROTOCOL, WHICH IS THE ONE THAT PROVES THE SEAM.
//
// One implementation, many backends: OpenAI, Groq, Together, DeepSeek, Fireworks, vLLM, llama.cpp and
// Ollama all speak `/v1/chat/completions`. That is a claim about a WIRE PROTOCOL and nothing else. It
// does not mean those backends behave alike, price alike, or support the same features, and this file
// is careful never to imply otherwise — see `providers/conformance` for the difference between an
// adapter that is implemented and a backend that has been verified.
//
// ─── WHY THERE IS NO SDK HERE ──────────────────────────────────────────────────────────────────
//
// `fetch` is enough for one POST, and reaching for a vendor SDK would add a second runtime dependency
// to a project whose portability claim is the product. It would also pin us to that SDK's idea of
// which backends are legitimate, which is exactly the coupling being removed.
//
// ─── THE INTERFACE DID NOT NEED REDESIGNING, AND THAT IS THE FINDING ───────────────────────────
//
// `InferenceRequest` is tool-shaped, which looked like an Anthropic assumption baked into core. It is
// not: every field maps onto this protocol without loss. `stableBlock`/`variableBlock` become two
// system messages, `toolName`/`schema` become a forced function call, `maxTokens` is `max_tokens`. The
// one thing that does not survive is CACHE CONTROL — this protocol has no per-block cache marker, and
// caching, where a backend has it, is automatic and prefix-based. So the split is honoured by ORDER
// rather than by annotation: stable first, variable second, which is what a prefix cache rewards
// anyway. Nothing in the contract had to change to say that.

import type { InferenceClient, InferenceRequest, InferenceResult, InferenceTermination } from '../core/inference/client.js';
import { budgetUsd, inferenceTimeoutMs, GenerationIncomplete } from '../core/inference/client.js';
import { OPENAI_COMPATIBLE_PRICING, costOf, isLocalBackend, priceFor, type Pricing } from './pricing.js';

/**
 * How the backend is asked to produce a typed object.
 *
 * Two modes because backends genuinely differ, not because the choice is stylistic. A forced function
 * call is the widest-supported; `json_schema` response format is stricter where it exists and absent
 * where it does not. Recorded in the RuntimeBinding, because the same model under the two modes is not
 * reliably the same system.
 */
export type StructuredOutputMode = 'FORCED_TOOL_CALL' | 'JSON_SCHEMA_RESPONSE_FORMAT';

/**
 * WHAT THIS BACKEND CALLS THE OUTPUT TOKEN LIMIT.
 *
 * One protocol, two spellings, and the split is not cosmetic. `max_tokens` is the widely-supported
 * name and the only one most self-hosted and third-party servers accept. OpenAI has deprecated it in
 * favour of `max_completion_tokens` and rejects it outright on its reasoning-model families.
 *
 * So this is BACKEND CONFIGURATION, not a global switch. Changing the default to satisfy one vendor
 * would break every generic server behind the same adapter — the exact trade the adapter exists to
 * avoid making. The default stays on the widest-supported spelling and a backend that needs the other
 * one says so.
 */
export type TokenLimitParam = 'max_tokens' | 'max_completion_tokens';

export interface OpenAICompatibleConfig {
  readonly modelId: string;
  /** e.g. `https://api.openai.com/v1`, `http://localhost:11434/v1`, `https://api.groq.com/openai/v1` */
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly structuredOutput?: StructuredOutputMode;
  /** pass a price when the backend is billed and this build does not know the rate. */
  readonly pricing?: Pricing | null;
  /** identifies the backend in a RuntimeBinding when the URL alone is not meaningful. */
  readonly backendName?: string;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  /** defaults to `max_tokens`, the spelling most backends accept. OpenAI proper needs the other. */
  readonly tokenLimitParam?: TokenLimitParam;
  /**
   * WHETHER THE BACKEND IS ASKED TO ENFORCE THE SCHEMA EXACTLY. Defaults to true.
   *
   * `strict` is the strongest guarantee this protocol offers: the backend validates arguments against
   * the schema rather than letting the model approximate it. OpenAI and OpenRouter accept it. A large
   * part of the self-hosted fleet — llama.cpp, older vLLM, several routed models — returns HTTP 400 on
   * an unrecognised argument, and this was sent unconditionally, which made every one of those
   * backends UNUSABLE rather than merely less guaranteed. An agnosticism claim was failing on one
   * hardcoded field.
   *
   * It is CONFIGURATION, not a fallback. Atelier does not retry without it: dropping the constraint
   * silently would produce a run whose output was never validated against the schema, recorded as
   * though it had been. The user turns it off knowing the trade, and the binding records which ran.
   */
  readonly strictSchema?: boolean;
}

/**
 * Backends whose quirks someone has checked, so a user names a backend rather than a set of flags.
 *
 * Deliberately tiny and deliberately not a support claim: an entry here records a documented protocol
 * difference, not that anyone has run a call against it. `atelier check` is what turns an entry into
 * a verified backend, and the README table is written from those runs.
 */
export const BACKEND_PRESETS: Readonly<Record<string, { baseUrl: string; tokenLimitParam: TokenLimitParam }>> = {
  openai: { baseUrl: 'https://api.openai.com/v1', tokenLimitParam: 'max_completion_tokens' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', tokenLimitParam: 'max_tokens' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', tokenLimitParam: 'max_tokens' },
  together: { baseUrl: 'https://api.together.xyz/v1', tokenLimitParam: 'max_tokens' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', tokenLimitParam: 'max_tokens' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', tokenLimitParam: 'max_tokens' },
  ollama: { baseUrl: 'http://localhost:11434/v1', tokenLimitParam: 'max_tokens' },
  vllm: { baseUrl: 'http://localhost:8000/v1', tokenLimitParam: 'max_tokens' },
  'llama-cpp': { baseUrl: 'http://localhost:8080/v1', tokenLimitParam: 'max_tokens' },
};

/** Named so an error can say which capability was missing rather than "something went wrong". */

/**
 * OpenAI's `finish_reason` vocabulary, mapped to the one core understands. Exported so the mapping
 * is checkable without a backend. `tool_calls` is COMPLETE for the same reason `tool_use` is on the
 * Anthropic side: the request forced one, so ending in one is success.
 */
export const openAiTermination = (finishReason: string | null | undefined): InferenceTermination => {
  switch (finishReason) {
    case 'stop': case 'tool_calls': case 'function_call': return { kind: 'COMPLETE' };
    case 'length': return { kind: 'MAX_TOKENS' };
    case 'content_filter': return { kind: 'CONTENT_FILTER' };
    default: return { kind: 'OTHER', providerValue: finishReason ?? 'null' };
  }
};

export class CapabilityUnsupported extends Error {
  constructor(readonly capability: string, readonly backend: string, detail: string) {
    super(`${backend} does not support ${capability}. ${detail}\n`
      + `  Atelier fails here rather than continuing, because the alternative is a discovery run whose\n`
      + `  candidates were never constrained by the schema and whose provenance would say otherwise.`);
    this.name = 'CapabilityUnsupported';
  }
}

/** The wire shape of a logprobs block on this protocol. */
interface WireLogprobs {
  content?: { token: string; logprob: number; top_logprobs?: { token: string; logprob: number }[] }[];
}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; logprobs?: WireLogprobs | null; message?: {
    content?: string | null;
    refusal?: string | null;
    tool_calls?: { function?: { name?: string; arguments?: string } }[];
  } }[];
  usage?: {
    prompt_tokens?: number; completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export class OpenAICompatibleInferenceClient implements InferenceClient {
  private readonly mode: StructuredOutputMode;
  private readonly backend: string;
  private readonly local: boolean;

  constructor(private readonly cfg: OpenAICompatibleConfig) {
    this.mode = cfg.structuredOutput ?? 'FORCED_TOOL_CALL';
    this.backend = cfg.backendName ?? cfg.baseUrl;
    this.local = isLocalBackend(cfg.baseUrl);
    if (!this.local && !this.key()) {
      throw new Error(
        `no API key for ${this.backend}.\n`
        + `  export OPENAI_API_KEY=...           (or pass --api-key-env <VAR>)\n`
        + `A backend on localhost needs no key; a hosted one does, and Atelier will not send a\n`
        + `keyless request that the backend would reject anyway.`);
    }
  }

  private key(): string | undefined { return this.cfg.apiKey ?? process.env.OPENAI_API_KEY; }

  /** Public so a conformance run can report the binding it exercised. */
  describe(): { backend: string; baseUrl: string; model: string; mode: StructuredOutputMode; local: boolean; tokenLimitParam: TokenLimitParam; strictSchema: boolean } {
    return { backend: this.backend, baseUrl: this.cfg.baseUrl, model: this.cfg.modelId, mode: this.mode,
      local: this.local, tokenLimitParam: this.cfg.tokenLimitParam ?? 'max_tokens',
      strictSchema: this.cfg.strictSchema !== false };
  }

  async complete(req: InferenceRequest): Promise<InferenceResult> {
    // STABLE FIRST. There is no cache_control on this protocol, so the only lever is prefix stability,
    // and putting the invariant instructions ahead of the corpus is what a prefix cache can act on.
    const messages = [
      { role: 'system', content: req.stableBlock },
      ...(req.variableBlock ? [{ role: 'system', content: req.variableBlock }] : []),
      { role: 'user', content: req.userMessage },
    ];

    const body: Record<string, unknown> = {
      model: this.cfg.modelId, messages,
      [this.cfg.tokenLimitParam ?? 'max_tokens']: req.maxTokens,
      ...(this.cfg.temperature === undefined ? {} : { temperature: this.cfg.temperature }),
      // ASKED FOR ONLY WHERE A CALLER WANTS THEM. Logprobs enlarge every response, and a reading
      // nobody consumes is a cost with no consumer. The instrument that reads a distribution sets
      // `wantLogprobs`; ordinary generation does not.
      ...(req.wantLogprobs ? { logprobs: true, top_logprobs: 20 } : {}),
    };
    const strict = this.cfg.strictSchema !== false;
    if (this.mode === 'FORCED_TOOL_CALL') {
      body.tools = [{ type: 'function', function: { name: req.toolName, description: req.toolDescription, parameters: req.schema, ...(strict ? { strict: true } : {}) } }];
      body.tool_choice = { type: 'function', function: { name: req.toolName } };
    } else {
      body.response_format = { type: 'json_schema', json_schema: { name: req.toolName, description: req.toolDescription, schema: req.schema, ...(strict ? { strict: true } : {}) } };
    }

    const res = await this.post(body, req.maxTokens);
    // NO CHOICES AT ALL IS A DIFFERENT FAULT FROM A CHOICE WITHOUT A TOOL CALL, and conflating them
    // sent users to change a setting that was never the problem: an empty array was reported as
    // "this backend does not support forced function calling", advice that cannot help and that
    // `atelier check` would then record as a capability the backend may well have.
    if (!res.choices?.length) {
      throw new Error(
        `${this.backend} returned HTTP 200 with no choices for model "${this.cfg.modelId}".\n`
        + `  That is a backend or routing fault rather than a missing capability — nothing was generated,\n`
        + `  so there is no output to inspect and no setting here that would change it.\n`
        + `  Check that the model id is one this backend serves, and that any router in front of it is healthy.`);
    }
    const choice = res.choices[0];
    const finish = choice?.finish_reason ?? 'unknown';

    // ── EVERY WAY THIS CAN FAIL, NAMED ─────────────────────────────────────────────────────────
    if (choice?.message?.refusal) {
      throw new GenerationIncomplete({ kind: 'REFUSAL' },
        `${this.backend} refused the request: ${choice.message.refusal}. No candidates were produced.`);
    }
    // TERMINATION BEFORE PAYLOAD. A call the backend never let finish must not be reported as a
    // content failure, and the fact must travel as a typed value so a study can COUNT it.
    const termination = openAiTermination(finish);
    if (termination.kind === 'MAX_TOKENS') {
      throw new GenerationIncomplete(termination,
        `${this.backend} stopped at the ${req.maxTokens}-token limit before completing the object.\n`
        + `  A truncated structured output is not a partial answer, it is an unparseable one. Nothing was recorded.`,
        res.usage?.completion_tokens ?? null);
    }
    if (termination.kind === 'CONTENT_FILTER') {
      throw new GenerationIncomplete(termination,
        `${this.backend} filtered the response (finish_reason: content_filter). Nothing was recorded.`);
    }

    const raw = this.mode === 'FORCED_TOOL_CALL'
      ? choice?.message?.tool_calls?.[0]?.function?.arguments
      : choice?.message?.content;

    if (raw === undefined || raw === null || raw === '') {
      throw new CapabilityUnsupported(
        this.mode === 'FORCED_TOOL_CALL' ? 'forced function calling' : 'json_schema response format',
        this.backend,
        `The request asked for a "${req.toolName}" object and the response carried none (finish_reason: ${finish}).`
        + (this.mode === 'FORCED_TOOL_CALL'
          ? ` Some backends accept a tools array and ignore tool_choice. Try --structured-output json-schema.`
          : ` Some backends accept response_format and ignore the schema. Try --structured-output tool-call.`));
    }

    let json: unknown;
    try { json = JSON.parse(raw); } catch {
      throw new Error(
        `${this.backend} returned a "${req.toolName}" payload that is not valid JSON.\n`
        + `  This is a structured-output failure, not a taste failure — the model was never constrained.\n`
        + `  First 200 characters: ${raw.slice(0, 200)}`);
    }

    const u = res.usage ?? {};
    const cacheRead = u.prompt_tokens_details?.cached_tokens ?? 0;
    const usage = {
      // `prompt_tokens` on this protocol INCLUDES cached tokens; the contract's `inputTokens` is the
      // uncached remainder, so subtracting is what makes the two providers' numbers comparable.
      inputTokens: Math.max(0, (u.prompt_tokens ?? 0) - cacheRead),
      cacheReadTokens: cacheRead, cacheWriteTokens: 0, outputTokens: u.completion_tokens ?? 0,
    };
    const pricing = this.cfg.pricing !== undefined ? this.cfg.pricing : priceFor(OPENAI_COMPATIBLE_PRICING, this.cfg.modelId);
    const cost = costOf(pricing, usage, this.local);
    // MAPPED, NEVER INVENTED. A backend on this protocol that returns nothing here yields null,
    // which is the honest answer and the one a reader has to handle.
    const lp = choice.logprobs?.content;
    const logprobs = lp?.length
      ? lp.map((t) => ({ token: t.token, logprob: t.logprob,
          top: (t.top_logprobs ?? []).map((a) => ({ token: a.token, logprob: a.logprob })) }))
      : null;
    return { json, modelId: res.model ?? this.cfg.modelId, ...usage, cost, costUsd: budgetUsd(cost), logprobs, termination };
  }

  private async post(body: unknown, maxTokens: number): Promise<ChatResponse> {
    const url = `${this.cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const key = this.key();
    const ac = new AbortController();
    // A local model on modest hardware is slow rather than broken, so the default is generous and
    // scales with what was asked for. `fetch` alone would hang forever.
    const t = setTimeout(() => { ac.abort(); }, this.cfg.timeoutMs ?? inferenceTimeoutMs(maxTokens));
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...this.cfg.headers },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const why = (e as Error).name === 'AbortError' ? 'it timed out' : (e as Error).message;
      // `cause` keeps the original. Without it a DNS failure, a refused connection and a bad TLS
      // handshake all read as the same sentence, and the one detail that identifies which is lost.
      throw new Error(`could not reach ${this.backend} at ${url}: ${why}`, { cause: e });
    } finally { clearTimeout(t); }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      // A backend that rejects `strict` is not a broken backend, and the raw 400 does not say so.
      // Naming the flag is the difference between "this tool does not work with my server" and one
      // documented option.
      if (r.status === 400 && /\bstrict\b/i.test(text) && this.cfg.strictSchema !== false) {
        throw new Error(
          `${this.backend} does not accept \`strict\` schema enforcement.\n`
          + `  ${text.slice(0, 200)}\n`
          + `  Ask for the schema without it:  --strict-schema off\n`
          + `  The model is then instructed by the schema rather than validated against it, which is a\n`
          + `  weaker guarantee. Atelier will not drop it silently, so the record says which you used.`);
      }
      throw new Error(`${this.backend} returned HTTP ${r.status} for ${url}. ${text.slice(0, 400)}`);
    }
    return await r.json() as ChatResponse;
  }
}
