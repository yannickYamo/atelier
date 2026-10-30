// atelier/core/inference/provider-conformance.ts — ONE SUITE, POINTED AT WHATEVER YOU LIKE.
//
// Written once and parameterized, because the alternative is a folder of near-identical per-backend
// tests that drift. It takes an InferenceClient and nothing else, so it can check the Anthropic
// adapter, an OpenAI-compatible endpoint, a local Ollama, or an adapter that does not exist yet.
//
// ─── WHAT A GREEN RUN HERE ENTITLES YOU TO SAY ─────────────────────────────────────────────────
//
// That this MODEL on this BACKEND through this ADAPTER answered correctly, at this moment. Nothing
// about any other model, any other backend behind the same protocol, or the same model tomorrow. The
// suite is cheap precisely so that the honest claim can be re-earned rather than generalized.
//
// ─── THE NEGATIVE PROBE IS THE ONE THAT MATTERS ────────────────────────────────────────────────
//
// Three of these checks confirm that a working thing works, which is worth little on its own. The
// fourth gives the backend a budget it cannot possibly complete in and requires the adapter to THROW.
// A truncated structured output is not a partial answer; it is an unparseable one, and an adapter that
// returns something anyway has handed a half-object to a discovery run that will record it as evidence.
// Failing closed is the property; this is where it is established.

import type { InferenceClient, InferenceRequest } from './client.js';

export type ProbeOutcome = 'PASS' | 'FAIL' | 'SKIPPED';

export interface ProbeResult {
  readonly id: string;
  readonly establishes: string;
  readonly outcome: ProbeOutcome;
  readonly detail: string;
}

export interface ProviderConformanceReport {
  readonly target: string;
  readonly probes: readonly ProbeResult[];
  readonly passed: boolean;
  /** what the backend said answered — the thing a RuntimeBinding needs and some backends omit */
  readonly reportedModel: string | null;
  readonly totalCostUsd: number;
  readonly costBasis: string | null;
}

/**
 * HEADROOM FOR A MODEL THAT THINKS IN VISIBLE TOKENS.
 *
 * This was 200, which encoded an assumption nobody had stated: that a model emits its tool call
 * immediately. The probe deliberately asks for a small piece of reasoning — count the words in a
 * phrase — and a reasoning-style model spends completion tokens working that out before it calls the
 * tool. Measured against a real router: four vendors passed all five probes at 200, and one returned
 * `finish_reason: length` and was reported as a backend that could not complete a structured object.
 * It could. The BUDGET could not.
 *
 * A conformance pack that fails a working backend is worse than no pack, because the verdict is
 * recorded and looks like a property of the model. The cost of the headroom is a fraction of a cent.
 */
const PROBE_TOKENS = 2000;

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { colour: { type: 'string' }, count: { type: 'integer' } },
  required: ['colour', 'count'], additionalProperties: false,
};

const REQUEST: InferenceRequest = {
  stableBlock: 'You return structured data. Answer using the tool and nothing else.',
  variableBlock: 'The sky at noon on a clear day. Count the words in the phrase "one two three".',
  userMessage: 'Answer now.',
  toolName: 'emit_answer', toolDescription: 'The colour, and the count.',
  schema: SCHEMA, maxTokens: PROBE_TOKENS,
};

/**
 * Run the suite.
 *
 * `client` is used as-is: the caller has already decided which adapter, backend, model and
 * structured-output mode to exercise, and this function must not quietly try a second configuration
 * when the first fails. A fallback here would report a pass for a binding that never worked.
 */
export async function runProviderConformance(
  client: InferenceClient, target: string,
  /** a client identical to `client` except for a budget too small to complete. Omit to skip the negative probe. */
  truncating?: InferenceClient,
): Promise<ProviderConformanceReport> {
  const probes: ProbeResult[] = [];
  let reportedModel: string | null = null;
  let totalCostUsd = 0;
  let costBasis: string | null = null;

  // 1 + 2 + 3 + 5 all ride on one call. Separate calls would cost four times as much to establish
  // properties that are all observable in a single response.
  let ok = false;
  try {
    const r = await client.complete(REQUEST);
    ok = true;
    reportedModel = r.modelId || null;
    totalCostUsd += r.costUsd;
    costBasis = r.cost.basis;

    probes.push({ id: 'REQUEST_SUCCEEDS', outcome: 'PASS', establishes: 'a call reaches the backend and returns',
      detail: `answered in ${r.inputTokens + r.outputTokens} tokens` });

    const j = r.json as { colour?: unknown; count?: unknown } | null;
    const shaped = Boolean(j) && typeof j?.colour === 'string' && Number.isInteger(j?.count);
    probes.push({ id: 'STRUCTURED_OBJECT_RETURNED', outcome: shaped ? 'PASS' : 'FAIL',
      establishes: 'the response satisfies the requested schema, with the requested types',
      detail: shaped ? `got {colour: "${String(j?.colour).slice(0, 24)}", count: ${String(j?.count)}}`
        : `the object did not match the schema: ${JSON.stringify(r.json).slice(0, 160)}` });

    const usable = r.outputTokens > 0 && (r.inputTokens > 0 || r.cacheReadTokens > 0);
    probes.push({ id: 'USAGE_CAPTURED', outcome: usable ? 'PASS' : 'FAIL',
      establishes: 'token usage came back, so cost and provenance can be recorded',
      detail: `in ${r.inputTokens} · cacheRead ${r.cacheReadTokens} · cacheWrite ${r.cacheWriteTokens} · out ${r.outputTokens} · basis ${r.cost.basis} · billed ${r.cost.billingUsd === null ? 'nothing' : `$${r.cost.billingUsd.toFixed(6)}`}` });

    probes.push({ id: 'MODEL_IDENTITY_CAPTURED', outcome: reportedModel ? 'PASS' : 'FAIL',
      establishes: 'the backend names which model answered, so a silent version flip is detectable',
      detail: reportedModel ? `reported "${reportedModel}"`
        : 'the backend reported no model. A provider-side version change on this binding would be invisible.' });
  } catch (e) {
    const msg = (e as Error).message;
    // A LENGTH STOP IS THIS PACK'S FAULT BEFORE IT IS THE BACKEND'S. The distinction matters because
    // the verdict is written to a profile and read later as a fact about the model.
    const outOfRoom = msg.includes('token limit before completing');
    probes.push({ id: 'REQUEST_SUCCEEDS', outcome: 'FAIL', establishes: 'a call reaches the backend and returns',
      detail: outOfRoom
        ? `${msg}\n  This probe allows ${PROBE_TOKENS} tokens and asks for a small piece of reasoning. A model that `
          + 'reasons in visible tokens can spend that budget before it calls the tool, which is a limit of this '
          + 'check rather than a limit of the backend. Nothing is recorded as verified either way.'
        : msg });
    for (const id of ['STRUCTURED_OBJECT_RETURNED', 'USAGE_CAPTURED', 'MODEL_IDENTITY_CAPTURED']) {
      probes.push({ id, outcome: 'SKIPPED', establishes: 'not reached', detail: 'the first call did not return' });
    }
  }

  // 4. THE NEGATIVE PROBE. A pass here is a THROW.
  if (!truncating) {
    probes.push({ id: 'FAILS_CLOSED', outcome: 'SKIPPED',
      establishes: 'a truncated or refused response raises rather than returning a partial object',
      detail: 'no truncating client was supplied' });
  } else if (!ok) {
    probes.push({ id: 'FAILS_CLOSED', outcome: 'SKIPPED',
      establishes: 'a truncated or refused response raises rather than returning a partial object',
      detail: 'the positive call did not return, so a failure here would prove nothing' });
  } else {
    try {
      const r = await truncating.complete({ ...REQUEST, maxTokens: 1 });
      totalCostUsd += r.costUsd;
      probes.push({ id: 'FAILS_CLOSED', outcome: 'FAIL',
        establishes: 'a truncated or refused response raises rather than returning a partial object',
        detail: `given a one-token budget the adapter returned ${JSON.stringify(r.json).slice(0, 120)} instead of raising. `
          + 'A discovery run would record that as a candidate.' });
    } catch (e) {
      probes.push({ id: 'FAILS_CLOSED', outcome: 'PASS',
        establishes: 'a truncated or refused response raises rather than returning a partial object',
        detail: `raised: ${(e as Error).message.split('\n')[0]}` });
    }
  }

  return { target, probes, reportedModel, totalCostUsd, costBasis,
    passed: probes.every((p) => p.outcome !== 'FAIL') };
}

/**
 * What a person reads, ending in the sentence the README has to agree with.
 *
 * The last line is deliberately narrow. "OpenAI-compatible" describes a wire protocol shared by many
 * backends; a green run describes one of them.
 */
export function describeProviderConformance(r: ProviderConformanceReport): string {
  const rows = r.probes.map((p) => `  ${p.outcome.padEnd(8)} ${p.id.padEnd(28)} ${p.establishes}\n           ${p.detail}`).join('\n\n');
  const verdict = r.passed
    ? `VERIFIED: ${r.target}${r.reportedModel ? `, answering as "${r.reportedModel}"` : ''}.`
    : `NOT VERIFIED: ${r.target}.`;
  return `Provider conformance — ${r.target}\n\n${rows}\n\n${verdict}\n`
    + `This says nothing about any other backend that speaks the same protocol, or about any other model\n`
    + `on this one. Those are separate runs.\n`;
}
