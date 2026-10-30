// atelier/core/delivery/budget.ts — WHICH CHECKS MAY STOP DELIVERY, DECIDED BY EVIDENCE AGAINST A BUDGET THE LATITUDE SETS.
//
// A chain of gates multiplies. A good output ships only if every gate that may stop it passes it, so the share of good
// work that ships is the product of the gates' specificities, and it must stay above 1 − B:
//
//     P(ship | good) = ∏ s_g  ≥  1 − B
//
// B is the false-stop budget, and the latitude sets it: a contract or a claims decision has a high cost of letting a
// defect through, so a STRICT skill may spend more of its good work on stops (20%); a blog post has a high cost of
// stopping good work, so a CREATIVE skill spends 5%. A gate's specificity is not what it claims but what it has proven:
// a check whose specificity follows from its definition (a count at zero where the standard says zero, a schema, a
// cited document that is in the material, a stated length range) is 1 by construction; any other check, written by a
// model or code with a tuned threshold, has only the lower bound its clean goldens give it (zero false stops on n
// goldens proves a false-stop rate under 1 − 0.05^(1/n): ten clean goldens prove under 26%, twenty-nine prove under
// 10%). Gates are admitted to block in order of proof while the product holds; the rest steer and rank, and never stop.
// On the 10-22c runs five unqualified written checks held every claims memo and seven held every label; on 10-21 the
// copying check, pure code with a tuned threshold, stopped 30 of 36 clean labels: the rule here is what those cost.

import type { LatitudeLevel } from '../state/canonical-state.js';
import { binomTail } from '../stats/sign-test.js';

/** The share of good outputs a skill may lose to stops, by how strictly its work is held. */
export const FALSE_STOP_BUDGET: Readonly<Record<LatitudeLevel, number>> = { STRICT: 0.20, GROUNDED: 0.10, CREATIVE: 0.05 };
export const budgetFor = (latitude: LatitudeLevel): number => FALSE_STOP_BUDGET[latitude];

import type { Proof } from '../eval/record.js';
/**
 * definitional: specificity follows from the definition (code decides, no threshold was tuned, the standard states the
 * value); owner: the owner said this check stops the work, in so many words, which is their responsibility; goldens:
 * proven on `n` outputs that met the standard, `falseStops` of which the check stopped.
 */
export type GateEvidence = Proof;

export interface Gate { readonly id: string; readonly evidence: GateEvidence }
export type GateTier = 'BLOCK' | 'STEER';
export interface GateDecision { readonly id: string; readonly tier: GateTier; readonly specificity: number; readonly why: string }
export interface Allocation {
  readonly budget: number;
  /** the proven lower bound on P(ship | good) with the admitted gates */
  readonly shipsGood: number;
  readonly gates: readonly GateDecision[];
}

const ALPHA = 0.05;

/**
 * One-sided 95% upper bound on a check's false-stop rate from `falseStops` stops on `n` clean goldens (Clopper–Pearson,
 * exact). No goldens prove nothing: the bound is 1.
 */
export function falseStopUpper(falseStops: number, n: number, alpha = ALPHA): number {
  if (n <= 0) return 1;
  if (falseStops >= n) return 1;
  if (falseStops === 0) return 1 - Math.pow(alpha, 1 / n);
  // P(X <= x | n, f) = alpha, and P(X <= x) = 1 − P(X >= x + 1) falls as f rises
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (1 - binomTail(n, mid, falseStops + 1) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/** The proven lower bound on a gate's specificity. */
export function provenSpecificity(e: GateEvidence): number {
  if (e.kind === 'definitional' || e.kind === 'owner') return 1;
  return 1 - falseStopUpper(e.falseStops, e.n);
}
/** Clean goldens needed to prove a false-stop rate under `rate` with none observed. */
export const goldensNeeded = (rate: number, alpha = ALPHA): number => (rate <= 0 || rate >= 1 ? Infinity : Math.ceil(Math.log(alpha) / Math.log(1 - rate)));

/**
 * Admit gates to block in order of proof while ∏ s_g ≥ 1 − B holds; every other gate steers. Ties in proof are broken by
 * id so the same skill allocates the same way on every run.
 */
export function allocate(gates: readonly Gate[], budget: number): Allocation {
  const ranked = gates.map((g) => ({ g, s: provenSpecificity(g.evidence) }))
    .sort((a, b) => b.s - a.s || a.g.id.localeCompare(b.g.id));
  let product = 1;
  const out: GateDecision[] = [];
  for (const { g, s } of ranked) {
    const e = g.evidence;
    const proof = e.kind === 'definitional' ? 'specificity 1 by definition'
      : e.kind === 'owner' ? 'the owner made it blocking'
      : e.n === 0 ? 'no clean goldens: nothing proven'
      : `${e.falseStops} false stop${e.falseStops === 1 ? '' : 's'} on ${e.n} clean goldens: false-stop rate under ${(100 * (1 - s)).toFixed(1)}%`;
    if (s > 0 && product * s >= 1 - budget - 1e-12) {
      product *= s;
      out.push({ id: g.id, tier: 'BLOCK', specificity: s, why: proof });
    } else {
      const need = e.kind === 'goldens' ? `; to block within the budget it needs ${goldensNeeded(Math.max(1e-9, 1 - (1 - budget) / product))} clean goldens with no false stop` : '';
      out.push({ id: g.id, tier: 'STEER', specificity: s, why: `${proof}${need}` });
    }
  }
  const byId = new Map(out.map((d) => [d.id, d]));
  return { budget, shipsGood: product, gates: gates.flatMap((g) => { const d = byId.get(g.id); return d ? [d] : []; }) };
}
