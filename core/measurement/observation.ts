// atelier/core/measurement/observation.ts — EVERY OBSERVATION CARRIES WHO SAID IT AND ON WHAT AUTHORITY.
//
// The architecture statement was wrong and this module corrects it. Aggregation is NOT blocked by
// qualification. What is blocked is INTERPRETING unqualified observations as product-grade fidelity.
// An unqualified instrument's outputs may be stored, counted, and read descriptively all day; they
// simply may not become a claim. Conflating those two stopped the evidence layer being built at all,
// which is the more expensive mistake: when a qualified instrument finally exists there would have
// been nothing for it to pour into.
//
// ─── AUTHORITY IS EXTENDED, NOT REINVENTED ─────────────────────────────────────────────────────
//
// Three authority vocabularies already exist and none of them is replaced here:
//   canonical-state.ts   Authority            who stands behind a REQUIREMENT
//   provenance.ts        Provenance           why an INPUT exists
//   observer.ts          ObserverPermission   what an INSTRUMENT has earned  (OBSERVE|VETO|CERTIFY)
//
// `ObservationAuthority` is `ObserverPermission` plus the two producers that are not instruments at
// all — a person, and a deterministic check. A fourth parallel enum would be the drift this codebase
// has already paid for twice with carriers.
//
// ─── AND THE NESTING RULE IS BORROWED, NOT INVENTED ────────────────────────────────────────────
//
// Repeated generations from one context are not independent trials, and counting them as such is
// how a denominator gets inflated. SSO solves the structurally identical problem with per-comparison
// evidence normalisation, Σ_c |e_ic| = 1, so that one probe touching many behaviours cannot dominate
// a ranking (our positioning work marks it BORROW). The same normalisation applied to
// CONTEXTS rather than probes is exactly the rule we need: a context carries total weight 1 however
// many generations it produced, and the generations share it.
//
// So `independentContexts` is a count of contexts and `weight` sums to that count — never to the
// number of observations. Both are reported, because the gap between them is the thing a reader
// needs to see.
//
// ─── AND IT IS A WEIGHTING RULE, NOT AN INDEPENDENCE MODEL ─────────────────────────────────────
//
// This is the correction that matters most about this file. Normalised weight is for DESCRIPTIVE
// evidence: it stops a context that happened to run ten generations from outweighing one that ran
// once. It is NOT a sample size. A weight of 4.0 does not mean four independent trials, and no
// confidence interval, power calculation, resolution estimate or promotion inference may be computed
// from it.
//
// Anything inferential takes `independentContexts` — a count of contexts — or an explicitly
// cluster-aware procedure that models the nesting. `weightedTotal` is deliberately NOT named `n`,
// and `assertNotUsedAsSampleSize` exists so that a caller reaching for it as one has to read why.

import type { ObserverPermission } from './permission.js';

/**
 * WHAT AN OBSERVATION IS ABOUT. The discriminator that authority alone cannot supply.
 *
 * A delivery check is DETERMINISTIC — no model, reproducible, and entirely trustworthy about the
 * thing it measures. It was therefore claim-bearing, and 100 successful delivery checks made
 * behavioural fidelity "claimable" without a single observation of behaviour. The authority was
 * right and the DOMAIN was never asked about.
 *
 * These are different questions and no amount of evidence for one is evidence for the other. A rule
 * can be perfectly delivered and perfectly ignored.
 */
export type MeasurementDomain =
  /** did the compiled artefact reach the model? Answerable without judgement. */
  | 'DELIVERY'
  /** did the output follow the rule? Answerable only by an instrument or a person. */
  | 'BEHAVIOR';

/** Who produced an observation, and what that producer has earned. Extends ObserverPermission. */
export type ObservationAuthority =
  /** a person adjudicated it. The only authority that needs no qualification campaign. */
  | 'HUMAN'
  /** a deterministic check — no model, no judgement, reproducible byte-for-byte */
  | 'DETERMINISTIC'
  /** an instrument that reports and authorises nothing */
  | 'OBSERVE_ONLY'
  /** an instrument qualified to BLOCK. It may never clear. */
  | 'VETO_QUALIFIED'
  /** an instrument qualified to CLEAR. Nothing holds this today. */
  | 'CERTIFY_QUALIFIED';

/** The authorities whose observations may support a positive claim about fidelity. */
export const CLAIM_BEARING: ReadonlySet<ObservationAuthority> =
  new Set<ObservationAuthority>(['HUMAN', 'DETERMINISTIC', 'CERTIFY_QUALIFIED']);

/** Map an instrument's earned permission onto observation authority. One direction, no inference. */
export function authorityOf(p: ObserverPermission): ObservationAuthority {
  return p === 'CERTIFY' ? 'CERTIFY_QUALIFIED' : p === 'VETO' ? 'VETO_QUALIFIED' : 'OBSERVE_ONLY';
}

/**
 * One observation of one requirement in one generation.
 *
 * `verdict` is deliberately open: v1/v2 emit SATISFIED|VIOLATED|UNCERTAIN, v3 emits
 * VETO|NO_VETO|ESCALATE, a human emits their own vocabulary, and a deterministic check emits
 * something else again. Normalising them into one scale here would be the collapse this module
 * exists to prevent — an instrument's verdict means what its own contract says it means, and
 * `producer`/`producerVersion` are how a reader knows which contract to read.
 */
export interface Observation {
  readonly requirementId: string;
  /** REQUIRED. Delivery evidence can never become behavioural evidence — see MeasurementDomain. */
  readonly domain: MeasurementDomain;
  readonly contextId: string;
  readonly invocationId: string;
  /** which generation within the context — nested, never independent */
  readonly generationIndex: number;
  readonly verdict: string;
  readonly producer: string;
  readonly producerVersion: string;
  readonly authority: ObservationAuthority;
  // `unknown` already admits null; `unknown | null` collapses to the same type, so the `| null` is a
  // comment wearing the costume of a constraint.
  readonly evidence: unknown;
  readonly at: string;
}

export interface ClaimRefusal { readonly claimable: false; readonly reason: string }
export interface ClaimPermitted { readonly claimable: true; readonly independentContexts: number }

/** What the evidence supports, per domain. Neither state is inferable from the other. */
export type DomainState = 'PROVEN' | 'UNOBSERVED' | 'OBSERVED_UNQUALIFIED' | 'FAILING';

/**
 * May these observations support a POSITIVE claim about how the skill behaves?
 *
 * The sibling of `measurement/reliability.ts:assertProductClaimable`, which refuses a claim built
 * from cached fixtures. This refuses one built from an instrument that never earned the right to
 * clear anything. Both exist because "we ran the suite" is the sentence that slides into a claim.
 *
 * Returns rather than throws: a caller counting observations descriptively is doing something
 * legitimate and should not have to catch an exception to do it.
 */
export function claimability(
  all: readonly Observation[],
  /** REQUIRED. A claim is always about ONE domain; asking without naming it is the defect. */
  domain: MeasurementDomain,
): ClaimPermitted | ClaimRefusal {
  const obs = all.filter((o) => o.domain === domain);
  if (!obs.length) {
    const other = all.length - obs.length;
    return { claimable: false, reason: other
      ? `no ${domain} observations. There are ${other} observation(s) in another domain, and they say nothing about this one — a rule can be perfectly delivered and perfectly ignored.`
      : 'no observations' };
  }

  const unqualified = obs.filter((o) => !CLAIM_BEARING.has(o.authority));
  if (unqualified.length) {
    const who = [...new Set(unqualified.map((o) => `${o.producer}@${o.producerVersion} (${o.authority})`))];
    return { claimable: false, reason:
      `${unqualified.length} of ${obs.length} observation(s) come from producers that have not earned the right to clear: ${who.join(', ')}. `
      + `They may be counted and read; they may not become a statement about how the skill behaves. `
      + `NO_VETO and "no violation found" are not findings that a requirement is met.` };
  }
  return { claimable: true, independentContexts: new Set(obs.map((o) => o.contextId)).size };
}

/**
 * SSO's Σ_c |e_ic| = 1, applied to contexts.
 *
 * Each independent context contributes total weight 1, divided among its generations. Ten
 * generations of one task carry the evidential weight of one task, which is what they are.
 */
export function normalisedWeights(obs: readonly Observation[]): ReadonlyMap<string, number> {
  const perContext = new Map<string, number>();
  for (const o of obs) perContext.set(o.contextId, (perContext.get(o.contextId) ?? 0) + 1);
  const w = new Map<string, number>();
  for (const o of obs) w.set(`${o.contextId}|${o.invocationId}|${o.generationIndex}`, 1 / perContext.get(o.contextId)!);
  return w;
}

export interface VerdictTally {
  readonly verdict: string;
  /** raw count of observations — inflated by repetition, and shown so the inflation is visible */
  readonly observations: number;
  /** SSO-normalised: contexts, not generations */
  readonly weight: number;
  readonly contexts: number;
}

/**
 * THE GUARD ON THE WEIGHTING RULE.
 *
 * Called wherever a weight might be mistaken for a sample size. There is no flag to bypass it: a
 * caller who needs a denominator for an interval needs `independentContexts`, and a caller who needs
 * to rank descriptive evidence needs the weight and never a bound.
 */
export function assertNotUsedAsSampleSize(context: string): never {
  throw new Error(
    `NORMALISED WEIGHT IS NOT A SAMPLE SIZE (${context}). Per-context normalisation is an evidence-`
    + 'WEIGHTING rule borrowed from SSO to stop one context dominating a descriptive tally. It models '
    + 'no independence. Confidence intervals, power, resolution and promotion inference take '
    + 'independentContexts, or an explicitly cluster-aware procedure.');
}

/** Tally by verdict, reporting raw and normalised side by side so the gap cannot hide. */
export function tally(obs: readonly Observation[]): readonly VerdictTally[] {
  const w = normalisedWeights(obs);
  const by = new Map<string, { n: number; weight: number; ctx: Set<string> }>();
  for (const o of obs) {
    const e = by.get(o.verdict) ?? { n: 0, weight: 0, ctx: new Set<string>() };
    e.n += 1;
    e.weight += w.get(`${o.contextId}|${o.invocationId}|${o.generationIndex}`) ?? 0;
    e.ctx.add(o.contextId);
    by.set(o.verdict, e);
  }
  return [...by.entries()]
    .map(([verdict, e]) => ({ verdict, observations: e.n, weight: e.weight, contexts: e.ctx.size }))
    .sort((a, b) => b.weight - a.weight || a.verdict.localeCompare(b.verdict));
}


/** Where the evidence stands in ONE domain. Reported per domain, never merged. */
export function domainState(all: readonly Observation[], domain: MeasurementDomain, missVerdicts: ReadonlySet<string>): DomainState {
  const obs = all.filter((o) => o.domain === domain);
  if (!obs.length) return 'UNOBSERVED';
  if (obs.some((o) => missVerdicts.has(o.verdict))) return 'FAILING';
  return claimability(all, domain).claimable ? 'PROVEN' : 'OBSERVED_UNQUALIFIED';
}
