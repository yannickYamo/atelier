// atelier/core/stats/weighted.ts — QUANTILES OF A WEIGHTED SAMPLE.

/**
 * The q-quantile of `xs` with weights `w`: each value sits at the midpoint of its share of the total weight, and
 * the quantile is read by linear interpolation between those points, held at the ends. With equal weights it is
 * the Hazen quantile. Values with zero weight do not count. Null when no weight is positive.
 */
export function weightedQuantile(xs: readonly number[], w: readonly number[], q: number): number | null {
  const pts = xs.map((x, i) => ({ x, w: w[i] ?? 0 })).filter((p) => p.w > 0 && Number.isFinite(p.x)).sort((a, b) => a.x - b.x);
  if (!pts.length) return null;
  const total = pts.reduce((a, p) => a + p.w, 0);
  let cum = 0;
  const at = pts.map((p) => { const mid = (cum + p.w / 2) / total; cum += p.w; return mid; });
  if (q <= at[0]) return pts[0].x;
  if (q >= at[at.length - 1]) return pts[pts.length - 1].x;
  for (let i = 1; i < pts.length; i++) {
    if (q <= at[i]) {
      const t = (q - at[i - 1]) / (at[i] - at[i - 1] || 1);
      return pts[i - 1].x + t * (pts[i].x - pts[i - 1].x);
    }
  }
  return pts[pts.length - 1].x;
}
