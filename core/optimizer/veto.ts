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
// (../fidelity/judgement.ts): at least MIN_COMPARABLE pairs where both ruled, agreeing often enough
// that the Wilson lower bound on its agreement rate clears VETO_AGREEMENT. A reader that disagrees with
// the owner as often as not is noise, and noise that can block would stall every improvement.
//
// The comparisons use the existing swap test (../fidelity/run-observer.ts): a verdict that flips when
// the two texts change places is no verdict, and never blocks.

import type { ObserverPermission } from '../measurement/permission.js';
import { MIN_COMPARABLE, type Agreement } from '../fidelity/judgement.js';
import type { ObserverResult } from '../fidelity/rule-observer.js';

/** The agreement with the owner the reader must reach (lower 95% bound) before it may block. */
export const VETO_AGREEMENT = 0.7;

/** Wilson score lower bound, 95%. */
export function wilsonLower(successes: number, n: number): number {
  if (!n) return 0;
  const z = 1.959964; const p = successes / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / (1 + (z * z) / n));
}

/** What the reader may do, from how often it has agreed with the owner. Never CERTIFY. */
export function readerPermission(a: Agreement): { permission: ObserverPermission; why: string } {
  if (a.comparable < MIN_COMPARABLE) {
    return { permission: 'OBSERVE', why: `${a.comparable} of the ${MIN_COMPARABLE} comparisons it needs with your own rulings; its readings are reported, never acted on` };
  }
  const lower = wilsonLower(a.agreed, a.comparable);
  return lower >= VETO_AGREEMENT
    ? { permission: 'VETO', why: `agreed with you on ${a.agreed} of ${a.comparable} (at least ${Math.round(lower * 100)}%, 95% bound); it may block, never approve` }
    : { permission: 'OBSERVE', why: `agreed with you on ${a.agreed} of ${a.comparable}, not reliably enough to block (lower bound ${Math.round(lower * 100)}%, needs ${Math.round(VETO_AGREEMENT * 100)}%)` };
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
