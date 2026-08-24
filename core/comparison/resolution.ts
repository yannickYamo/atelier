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

const T_TABLE: readonly (readonly [df: number, t80: number, t95: number, t975: number])[] = [
  [1, 1.376, 6.314, 12.706],
  [2, 1.061, 2.920, 4.303],
  [3, 0.978, 2.353, 3.182],
  [4, 0.941, 2.132, 2.776],
  [5, 0.920, 2.015, 2.571],
  [6, 0.906, 1.943, 2.447],
  [7, 0.896, 1.895, 2.365],
  [8, 0.889, 1.860, 2.306],
  [10, 0.879, 1.812, 2.228],
  [12, 0.873, 1.782, 2.179],
  [14, 0.868, 1.761, 2.145],
  [16, 0.865, 1.746, 2.120],
  [20, 0.860, 1.725, 2.086],
  [30, 0.854, 1.697, 2.042],
  [40, 0.851, 1.684, 2.021],
  [60, 0.848, 1.671, 2.000],
  [120, 0.845, 1.658, 1.980],
  [1e9, 0.842, 1.645, 1.960],
];

export type TQuantile = 0.8 | 0.95 | 0.975;
const COLUMN: Record<TQuantile, 1 | 2 | 3> = { 0.8: 1, 0.95: 2, 0.975: 3 };

/**
 * One-sided upper critical value t_p(df), linearly interpolated on df between table rows.
 * df below the first row clamps to df=1 (the most conservative row), never extrapolates.
 */
export function tCrit(df: number, p: TQuantile): number {
  // Possibly absent by type as well as at runtime. `Record<TQuantile, …>` promises total coverage of
  // the union, so a caller reaching this with a value cast into `TQuantile` gets undefined and the
  // guard fires — while the compiler called the guard unnecessary.
  const col: (typeof COLUMN)[TQuantile] | undefined = COLUMN[p];
  if (!col) throw new Error(`stats: unsupported t quantile ${p} (supported: 0.80, 0.95, 0.975)`);
  if (!Number.isFinite(df) || df <= 0) throw new Error(`stats: degrees of freedom must be positive, got ${df}`);
  if (df <= T_TABLE[0][0]) return T_TABLE[0][col];
  for (let i = 1; i < T_TABLE.length; i++) {
    const lo = T_TABLE[i - 1], hi = T_TABLE[i];
    if (df <= hi[0]) return lo[col] + ((hi[col] - lo[col]) * (df - lo[0])) / (hi[0] - lo[0]);
  }
  return T_TABLE[T_TABLE.length - 1][col];
}

/** Sample standard deviation (n-1). Throws below n=2 rather than returning a fabricated 0. */
export function sd(xs: readonly number[]): number {
  if (xs.length < 2) throw new Error(`stats: sample SD needs n>=2, got n=${xs.length}`);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** One arm of a two-sample comparison: an estimated mean with its spread and sample size. */
export interface Sample { readonly mean: number; readonly sd: number; readonly n: number }

/** Build a Sample from per-fire scores (the shape both the frozen baseline and a candidate carry). */
export function sampleFrom(perFire: readonly number[]): Sample {
  return { mean: mean(perFire), sd: sd(perFire), n: perFire.length };
}

/**
 * Welch standard error of the difference (a − b) and its Welch–Satterthwaite degrees of freedom.
 * Welch rather than pooled because the candidate and the frozen champion have no reason to share a
 * variance — and assuming they do understates uncertainty exactly when the candidate is erratic.
 */
export function welchDiff(a: Sample, b: Sample): { readonly se: number; readonly df: number } {
  if (a.n < 2 || b.n < 2) throw new Error(`stats: Welch needs n>=2 per arm, got ${a.n} and ${b.n}`);
  const va = a.sd ** 2 / a.n, vb = b.sd ** 2 / b.n;
  const se = Math.sqrt(va + vb);
  // Both arms with zero spread: the difference is exact, df is undefined by the formula. Report the
  // smallest honest df rather than NaN — the interval collapses to the point estimate either way.
  const denom = va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1);
  const df = denom === 0 ? 1 : (va + vb) ** 2 / denom;
  return { se, df };
}

/**
 * The MINIMUM DETECTABLE EFFECT at a stated power — (t_{1-alpha/2} + t_{1-beta}) * SE.
 *
 * This is NOT the same quantity as the significance threshold t_{1-alpha/2} * SE, which is the
 * smallest observed difference that would reach significance and is detected only ~50% of the time
 * when the true effect equals it. Conflating the two understates the required effect by ~1.41x.
 * See `resolutionFloor` for the other quantity, and keep the two names apart.
 */
export function mdeAtPower(se: number, df: number, power: 0.8 = 0.8): number {
  return (tCrit(df, 0.975) + tCrit(df, power)) * se;
}

/** The SIGNIFICANCE THRESHOLD (two-sided 95%): smallest difference that would be significant. */
export function resolutionFloor(se: number, df: number): number {
  return tCrit(df, 0.975) * se;
}

// ─── THE CLUSTER-AWARE HALF ────────────────────────────────────────────────────────────────────
//
// PORTED from two-phase-estimator.ts. `contextDifferences` there folds adjudicated records through
// a Horvitz-Thompson rate; Atelier's unit is a per-context mean score, so the FOLD is supplied by the
// caller and only the inference travels. The interval itself is unchanged.

/** One paired difference. The context is the independent unit; both arms share it. */
export interface ContextDifference { readonly contextId: string; readonly delta: number }

// ── inference: small-sample, at the context level, never a normal approximation ────────────────

/** Two-sided 95% t critical values. n is small by construction; z would understate the interval. */
const T95: Readonly<Record<number, number>> = {
  3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101,
  19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
};
export const tCrit95 = (df: number): number => T95[df] ?? (df > 25 ? 2.0 : 3.182);

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
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const h = tCrit95(n - 1) * (sd / Math.sqrt(n));
  return { mean, lo: mean - h, hi: mean + h, n, df: n - 1 };
}

