// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
// Ported rather than rewritten, and the original kept running while this one earned its callers:
// copy-then-delete in one movement is how a reference implementation is lost before the port has
// survived use. Its behaviour is pinned by this repository's own tests; the tree it came from is
// not public, and no claim in this repository rests on it.
//
// Nothing here does I/O or calls a model. The whole chain is pure, which is why it ports at all: the
// inference boundary is a PARAMETER, so Atelier supplies its own client and the logic never knew.

// THE GOLDENS → EVIDENCE PLUMBING.
//
// The predecessor harness was a thin scratch shell: every rule already lives in production
// (`discovery-contract.ts` owns the split, validation and folding; `taste-discovery.ts` owns
// aggregation; `taste-factor-evidence.ts` owns priority). What the harness alone held was
// COORDINATION — enumeration, prompt construction, the two-call order, result collection — and it
// held it in scratch, where the campaign would have been the first thing to execute it.
//
// So this module owns coordination and NOTHING else. It re-implements no discovery semantics; it
// imports `validateDiscovery` and `toHypotheses` and would fail loudly if they disagreed with it.
//
// ─── ONE OBVIOUS PLACE WHERE MONEY BEGINS ─────────────────────────────────────────────────────
//
// `planDiscovery` is deterministic and free: it produces every prompt, freezes them with a hash, and
// stops. `ingestProbeResults` is deterministic and free: it accepts results and continues into
// evidence. Between them is the ONLY inference boundary, and it is a parameter rather than an import
// so the same consumer accepts cached historical results today and prospective results later.
//
// There is deliberately no test-only path. A fake alternate route would mean the campaign's first
// call exercises code the tests never ran.
//
// ─── THE TWO-CALL ORDER IS LOAD-BEARING, NOT STYLISTIC ────────────────────────────────────────
//
// The PROPOSER sees only PROPOSAL goldens and never learns what it will be scored against. The
// OBSERVER sees one HELD_OUT golden plus a factor description and never sees the proposal goldens, so
// it cannot recognise "the example this was read off" and mark it present out of loyalty. Collapsing
// them into one call makes the run circular, and the plan encodes the separation structurally rather
// than trusting a caller to preserve it.

import { createHash } from 'node:crypto';
import {
  validateDiscovery, toHypotheses, MIN_PROPOSAL_GOLDENS, MIN_HELD_OUT_GOLDENS,
  type DiscoveryInput, type GoldenRef, type ProposedFactor,
} from './discovery-contract.js';
import type { GoldenObservation } from './taste-discovery.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Where inference results came from. Cached evidence can never support a new product claim. */
export type EvidenceProvenance = 'CACHED_HISTORICAL_RESULT' | 'PROSPECTIVE_RESULT';

/** A unit of inference the campaign will pay for. Inspectable and freezable BEFORE paying. */
export type InferenceRequest =
  | { readonly kind: 'PROPOSE'; readonly requestId: string; readonly systemPrompt: string; readonly contextPrompt: string; readonly readsGoldens: readonly string[] }
  | { readonly kind: 'OBSERVE'; readonly requestId: string; readonly systemPrompt: string; readonly contextPrompt: string; readonly proposedId: string; readonly contextId: string };

export interface DiscoveryPlan {
  readonly skillId: string;
  readonly goldens: readonly GoldenRef[];
  readonly proposeRequest: InferenceRequest;
  /** built only AFTER proposals return — observation prompts name the factor being checked */
  readonly observeRequestsFor: (proposed: readonly ProposedFactor[]) => readonly InferenceRequest[];
  readonly planHash: string;
}

export type PlanRefusal =
  | { readonly refusal: 'INSUFFICIENT_DISCOVERY_EVIDENCE'; readonly detail: string }
  | { readonly refusal: 'SPLIT_INVALID'; readonly detail: string };

/**
 * Build the deterministic plan. No inference, no cost.
 *
 * Refuses rather than throws: too few goldens is an epistemic condition, not a crash, and the caller
 * must be able to tell the two apart (a crash means the harness is broken; a refusal means the
 * evidence is thin and the expert needs to supply more examples).
 */
export function planDiscovery(
  skillId: string,
  goldens: readonly GoldenRef[],
  textOf: (contextId: string) => string,
  prompts: { readonly proposer: (proposalIds: readonly string[]) => string; readonly observer: (f: ProposedFactor) => string },
): DiscoveryPlan | PlanRefusal {
  const proposal = goldens.filter((g) => g.role === 'PROPOSAL');
  const heldOut = goldens.filter((g) => g.role === 'HELD_OUT');
  if (proposal.length < MIN_PROPOSAL_GOLDENS || heldOut.length < MIN_HELD_OUT_GOLDENS) {
    return { refusal: 'INSUFFICIENT_DISCOVERY_EVIDENCE', detail: `need >=${MIN_PROPOSAL_GOLDENS} PROPOSAL and >=${MIN_HELD_OUT_GOLDENS} HELD_OUT goldens; have ${proposal.length} and ${heldOut.length}` };
  }
  const dupes = goldens.map((g) => g.contextId).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupes.length) {
    return { refusal: 'SPLIT_INVALID', detail: `golden(s) appear more than once: ${[...new Set(dupes)].join(', ')} — a golden on both sides of the split would let a factor validate itself` };
  }

  const proposalIds = proposal.map((g) => g.contextId);
  const proposerSys = prompts.proposer(proposalIds);
  // THE PROPOSER CONTEXT CONTAINS PROPOSAL GOLDENS ONLY. Enforced here, not left to the caller.
  const proposeRequest: InferenceRequest = {
    kind: 'PROPOSE', requestId: `propose:${sha(proposerSys + proposalIds.join(','))}`,
    systemPrompt: proposerSys,
    contextPrompt: proposalIds.map((id) => `### EXAMPLE ${id}\n\n${textOf(id)}`).join('\n\n'),
    readsGoldens: proposalIds,
  };

  const observeRequestsFor = (proposed: readonly ProposedFactor[]): readonly InferenceRequest[] =>
    proposed.flatMap((f) => heldOut.map((g): InferenceRequest => ({
      kind: 'OBSERVE', requestId: `observe:${sha(f.proposedId + g.contextId)}`,
      systemPrompt: prompts.observer(f),
      // ONE held-out document, and never a proposal golden — the observer must not recognise the source.
      contextPrompt: `### DOCUMENT\n\n${textOf(g.contextId)}`,
      proposedId: f.proposedId, contextId: g.contextId,
    })));

  return {
    skillId, goldens, proposeRequest, observeRequestsFor,
    planHash: sha([skillId, proposeRequest.requestId, proposalIds.join(','), heldOut.map((g) => g.contextId).join(',')].join('|')),
  };
}

export interface ProbeResults {
  readonly provenance: EvidenceProvenance;
  readonly proposed: readonly ProposedFactor[];
  readonly observations: readonly { readonly proposedId: string; readonly observation: GoldenObservation }[];
}

export type IngestOutcome =
  | { readonly ok: true; readonly input: DiscoveryInput; readonly hypotheses: ReturnType<typeof toHypotheses>; readonly provenance: EvidenceProvenance }
  | { readonly ok: false; readonly refusal: 'PROBE_RESULTS_INCOMPLETE' | 'DISCOVERY_REFUSED'; readonly detail: string };

/**
 * Continue deterministically from inference results into hypotheses.
 *
 * Completeness is checked BEFORE validation because a partial observation set produces a real but
 * misleading `DiscoveryInput`: factors observed on fewer held-out goldens look better-supported than
 * factors observed on all of them, and nothing downstream would notice. Missing observations are an
 * incomplete run, not a weak result.
 */
export function ingestProbeResults(plan: DiscoveryPlan, results: ProbeResults, scope: Parameters<typeof toHypotheses>[1], modelPin: string): IngestOutcome {
  const heldOut = plan.goldens.filter((g) => g.role === 'HELD_OUT').map((g) => g.contextId);
  const missing: string[] = [];
  for (const f of results.proposed) {
    for (const id of heldOut) {
      if (!results.observations.some((o) => o.proposedId === f.proposedId && o.observation.contextId === id)) missing.push(`${f.proposedId}@${id}`);
    }
  }
  if (missing.length) {
    return { ok: false, refusal: 'PROBE_RESULTS_INCOMPLETE', detail: `${missing.length} factor x held-out observation(s) missing: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}. A partial set makes under-observed factors look better supported.` };
  }
  // OBSERVATIONS MAY ONLY REFERENCE HELD-OUT GOLDENS. A factor scored on the example it was read off
  // is self-confirming, and `validateDiscovery` owns that rule — this only surfaces it early.
  const leaked = results.observations.filter((o) => !heldOut.includes(o.observation.contextId)).map((o) => o.observation.contextId);
  if (leaked.length) {
    return { ok: false, refusal: 'DISCOVERY_REFUSED', detail: `observation(s) reference non-held-out golden(s): ${[...new Set(leaked)].join(', ')} — a factor may not be validated on the evidence that produced it` };
  }

  const input: DiscoveryInput = { skillId: plan.skillId, goldens: plan.goldens, proposed: results.proposed, observations: results.observations };
  const problems = validateDiscovery(input);
  if (problems.length) return { ok: false, refusal: 'DISCOVERY_REFUSED', detail: problems.join('; ') };
  return { ok: true, input, hypotheses: toHypotheses(input, scope, modelPin), provenance: results.provenance };
}

/** Cached evidence proves the plumbing. It may never become a prospective product claim. */
export function assertProspective(o: IngestOutcome): void {
  if (!o.ok) throw new Error(`DISCOVERY: outcome is ${o.refusal} — ${o.detail}`);
  if (o.provenance !== 'PROSPECTIVE_RESULT') {
    throw new Error(`DISCOVERY: refusing a product claim from ${o.provenance}. Cached historical results prove the orchestration executes, never that discovery found something true.`);
  }
}
