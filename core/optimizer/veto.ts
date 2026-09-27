// atelier/core/optimizer/veto.ts — A READER THAT MAY BLOCK, NEVER CLEAR.
//
// The regression floor protects what the standard measures. Most of a voice is not measured: when to
// concede, what counts as enough evidence, how a piece should end. A search that improves the counts
// can quietly make those worse, and the counts will not say so. Something has to read.
//
// SSO lets one model's reading both steer the search and approve its result, and this repository has
// measured why that fails: model judges prefer model-like text, and an instrument that approves its own
// optimisation target approves what it was optimised against. So the reader here is adopted with its
// authority cut to the one direction that is safe:
//
//   it may BLOCK a candidate it reads as worse than the champion on an unmeasured rule;
//   it may NEVER clear one, and its agreement adds nothing toward a promotion.
//
// And even blocking is earned. The reader starts OBSERVE (reported, ignored by the gate) and holds VETO
// only after its readings have been checked against the owner's own blind picks
// (../fidelity/judgement.ts), on the rules it is asked about: at least MIN_COMPARABLE pairs where both
// ruled, with MIN_EACH_WAY in each direction, agreeing beyond chance (Cohen's kappa of VETO_KAPPA). A
// reader that disagrees with the owner as often as not is noise, and noise that can block would stall
// every improvement.
//
// The comparisons use the existing swap test (../fidelity/run-observer.ts): a verdict that flips when
// the two texts change places is no verdict, and never blocks.

import type { ObserverPermission } from '../measurement/permission.js';
import { MIN_COMPARABLE, type JudgementRecord } from '../fidelity/judgement.js';
import type { ObserverResult } from '../fidelity/rule-observer.js';

/** How strongly the reader must agree with the owner, beyond chance, before it may block. */
export const VETO_KAPPA = 0.6;
/** The fewest owner rulings in EACH direction: a reader that always says "keep the old one" must be
 *  caught by the rulings where the owner kept the new one. */
export const MIN_EACH_WAY = 5;

/** Wilson score lower bound, 95%. */
export function wilsonLower(successes: number, n: number): number {
  if (!n) return 0;
  const z = 1.959964; const p = successes / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / (1 + (z * z) / n));
}

/** Cohen's kappa over a 2×2 table of (reader's pick, owner's pick). */
export function cohensKappa(t: { readonly both: number; readonly neither: number; readonly readerOnly: number; readonly ownerOnly: number }): number {
  const n = t.both + t.neither + t.readerOnly + t.ownerOnly;
  if (!n) return 0;
  const po = (t.both + t.neither) / n;
  const pr = (t.both + t.readerOnly) / n; const pw = (t.both + t.ownerOnly) / n;
  const pe = pr * pw + (1 - pr) * (1 - pw);
  return pe === 1 ? 0 : (po - pe) / (1 - pe);
}

/**
 * What the reader may do, from its record against the owner's own rulings on the rules nothing measures
 * (the only rules it is ever asked about). Raw agreement is not enough: a reader that always says "keep
 * the current version" agrees whenever the owner rejects, and owners reject most candidates. So it must
 * agree beyond chance (Cohen's kappa), with enough rulings in each direction to tell. Never CERTIFY.
 */
export function readerPermission(records: readonly JudgementRecord[], unmeasured: ReadonlySet<string>): { permission: ObserverPermission; why: string } {
  const rows = records.filter((r) => unmeasured.has(r.requirementId) && r.human && r.observer?.orderInvariant
    && (r.observer.result === 'CANDIDATE_COMPLIES_BETTER' || r.observer.result === 'CHAMPION_COMPLIES_BETTER'));
  const t = { both: 0, neither: 0, readerOnly: 0, ownerOnly: 0 };   // "both" = both preferred the candidate
  for (const r of rows) {
    const reader = r.observer!.result === 'CANDIDATE_COMPLIES_BETTER'; const owner = r.human!.choice === 'CANDIDATE';
    if (reader && owner) t.both += 1; else if (!reader && !owner) t.neither += 1; else if (reader) t.readerOnly += 1; else t.ownerOnly += 1;
  }
  const n = rows.length; const ownerCand = t.both + t.ownerOnly; const ownerChamp = t.neither + t.readerOnly;
  const k = cohensKappa(t);
  if (n < MIN_COMPARABLE || ownerCand < MIN_EACH_WAY || ownerChamp < MIN_EACH_WAY) {
    return { permission: 'OBSERVE', why: `${n} of the ${MIN_COMPARABLE} comparisons it needs with your rulings on unmeasured rules (${ownerCand} kept the new version, ${ownerChamp} the old; it needs ${MIN_EACH_WAY} of each); its readings are reported, never acted on` };
  }
  return k >= VETO_KAPPA
    ? { permission: 'VETO', why: `agrees with you beyond chance (kappa ${k.toFixed(2)} over ${n}); it may block, never approve` }
    : { permission: 'OBSERVE', why: `agrees with you too little beyond chance to block (kappa ${k.toFixed(2)} over ${n}, needs ${VETO_KAPPA})` };
}

export interface Reading { readonly requirementId: string; readonly result: ObserverResult; readonly orderInvariant: boolean }

/**
 * The rules the reader would block on: read as worse under the candidate on more tasks than better,
 * with at least two order-invariant readings saying so. Whether that blocks anything is the
 * permission's business, not this function's.
 */
export function vetoedRules(readings: readonly Reading[]): string[] {
  const by = new Map<string, { worse: number; better: number }>();
  for (const r of readings) {
    if (!r.orderInvariant) continue;
    const t = by.get(r.requirementId) ?? { worse: 0, better: 0 };
    if (r.result === 'CHAMPION_COMPLIES_BETTER') t.worse += 1;
    if (r.result === 'CANDIDATE_COMPLIES_BETTER') t.better += 1;
    by.set(r.requirementId, t);
  }
  return [...by.entries()].filter(([, t]) => t.worse >= 2 && t.worse > t.better).map(([id]) => id);
}
