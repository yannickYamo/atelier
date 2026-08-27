// atelier/core/comparison/resolution.ts — CAN THIS EXPERIMENT SEE THE DIFFERENCE IT IS LOOKING FOR?
//
// PORTED from the private predecessor this was extracted from: its statistics helpers and its
// two-phase estimator.
//
// ─── WELCH IS THE WRONG STATISTIC HERE, AND THE RIGHT ONE ALREADY EXISTED ──────────────────────
//
// The floor uses Welch, which assumes UNPAIRED, INDEPENDENT samples. Incumbent-vs-candidate is
// neither: both arms answer the SAME contexts, and repeated generations nest inside each context.
// Pooling generations into a Welch test would treat ten answers to one task as ten trials — the
// exact inflation the whole measurement layer refuses.
//
// `contextClusteredInterval` is the correct instrument and it was already written: the per-context
// PAIRED difference is the unit, the interval is computed over contexts, and a small-sample t is
// used because n is small by construction and z would understate it. Nothing new was invented.
//
// ─── AND THE TWO RESOLUTION QUANTITIES ARE KEPT APART, BECAUSE CONFLATING THEM COST A LOOP ─────
//
// resolutionFloor  = t_{.975} * SE   the smallest difference that would be SIGNIFICANT
// mdeAtPower       = (t_{.975} + t_{.8}) * SE   the smallest difference detectable ~80% of the time
//
// They differ by ~1.41x and the historical note records what conflating them did: four candidates
// auto-rejected for "objective not met", one of which had moved the target +0.250 at N=2 where
// resolution was ~1.34. A candidate that could not be evaluated, recorded as one that failed — and
// each rejection spent a strategy. A loop run that way retires its own licensed surfaces on noise
// and calls the result convergence.
//
// **Resolution is an EXPERIMENT-SIZING property, never a bar.** An effect below it is UNMEASURED,
// not absent.


import { tCrit, sd as sdOf, mean as meanOf } from '../stats/t.js';

// ─── THE CLUSTER-AWARE HALF ────────────────────────────────────────────────────────────────────
//
// PORTED from two-phase-estimator.ts. `contextDifferences` there folds adjudicated records through
// a Horvitz-Thompson rate; Atelier's unit is a per-context mean score, so the FOLD is supplied by the
// caller and only the inference travels. The interval itself is unchanged.

/** One paired difference. The context is the independent unit; both arms share it. */
export interface ContextDifference { readonly contextId: string; readonly delta: number }

// ── inference: small-sample, at the context level, never a normal approximation ────────────────

// The interval below uses the shared table via `tCrit(df, 0.975)`. A second, separate 95% table used
// to live here, keyed from df=3 with a fallback of 3.182 — and `contextClusteredInterval` admits n>=3,
// i.e. df=2, which that table did not contain. So at the SMALLEST permitted sample, the most common
// one, it silently returned t(3) = 3.182 where t(2) = 4.303 is correct: an interval 26% too narrow,
// which reported a decided direction where the honest answer crossed zero. `compare()` compounded it
// by dividing by one table's value and multiplying by the other's for the same quantile.

export interface WitnessInterval {
  readonly mean: number;
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly df: number;
}

export function contextClusteredInterval(diffs: readonly ContextDifference[]): WitnessInterval {
  const n = diffs.length;
  if (n < 3) throw new Error(`two-phase-estimator: ${n} contexts — too few for a context-level interval`);
  const v = diffs.map((d) => d.delta);
  const mean = meanOf(v);
  const h = tCrit(n - 1, 0.975) * (sdOf(v) / Math.sqrt(n));
  return { mean, lo: mean - h, hi: mean + h, n, df: n - 1 };
}

