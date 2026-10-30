// atelier/core/stats/t.ts — THE ONE OWNER OF THE t DISTRIBUTION.
//
// This existed twice, byte-identical across ninety lines, in `core/distinctiveness/stats.ts` and
// `core/comparison/resolution.ts`. The first of those opened by declaring itself "the ONE owner of
// the t distribution", which was false in the file that claimed it.
//
// Duplication is not the interesting part. DRIFT is: `eslint.config.js` names the tCrit in
// `resolution.ts` as one of three sites "repaired by making the TYPE honest", and the identical twin
// in `stats.ts` was never repaired. So the two copies had already diverged at precisely the spot the
// project documented as fixed. The repaired version is the one kept here.
//
// Placed under a neutral `core/stats/` rather than inside either consumer, because a shared
// primitive living in one of its callers is how the second copy gets made: the next module needing a
// t value reads the import path, decides it does not belong to distinctiveness or to comparison, and
// writes its own.

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


/** The SIGNIFICANCE THRESHOLD (two-sided 95%): smallest difference that would be significant. */
export function resolutionFloor(se: number, df: number): number {
  return tCrit(df, 0.975) * se;
}
