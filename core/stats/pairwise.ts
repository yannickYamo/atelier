// atelier/core/stats/pairwise.ts — STRENGTHS FROM PAIRWISE WINS (BRADLEY-TERRY).
//
// Given how often each item beat each other one, find strengths p such that P(i beats j) = p_i / (p_i + p_j). The
// fit is the classic minorise-maximise iteration: p_i ← W_i / Σ_j n_ij / (p_i + p_j), then rescale to sum 1. An
// item with no wins goes to 0 (no finite strength fits it); `prior` adds that many virtual games against every
// other item, split evenly, so every strength stays positive.

export interface BradleyTerryOptions {
  /** virtual games added between every pair, half won by each side (default 0) */
  readonly prior?: number;
  readonly maxIterations?: number;
  readonly tolerance?: number;
}

export interface BradleyTerryFit {
  /** strengths summing to 1, in the order of the input */
  readonly strengths: readonly number[];
  readonly iterations: number;
  readonly converged: boolean;
}

/**
 * Fit strengths from `wins[i][j]`, the times i beat j (the diagonal is ignored). Counts may be fractional, so a
 * tie can count half to each side.
 */
export function fitBradleyTerry(wins: readonly (readonly number[])[], o: BradleyTerryOptions = {}): BradleyTerryFit {
  const k = wins.length;
  if (k === 0) return { strengths: [], iterations: 0, converged: true };
  const prior = o.prior ?? 0, maxIt = o.maxIterations ?? 10_000, tol = o.tolerance ?? 1e-10;
  const w = (i: number, j: number): number => (i === j ? 0 : (wins[i]?.[j] ?? 0) + prior / 2);
  const total = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => w(i, j)).reduce((s, x) => s + x, 0));
  let p: number[] = Array<number>(k).fill(1 / k);
  for (let it = 1; it <= maxIt; it += 1) {
    const next = p.map((pi, i) => {
      let den = 0;
      for (let j = 0; j < k; j += 1) {
        const n = w(i, j) + w(j, i);
        if (j === i || n === 0 || pi + p[j] === 0) continue;
        den += n / (pi + p[j]);
      }
      return den > 0 ? total[i] / den : 0;
    });
    const sum = next.reduce((s, x) => s + x, 0);
    if (sum === 0) return { strengths: p, iterations: it, converged: true };
    const scaled = next.map((x) => x / sum);
    const change = Math.max(...scaled.map((x, i) => Math.abs(x - p[i])));
    p = scaled;
    if (change < tol) return { strengths: p, iterations: it, converged: true };
  }
  return { strengths: p, iterations: maxIt, converged: false };
}

/** P(i beats j) under the fitted strengths; 0.5 when both are 0. */
export function winProbability(pi: number, pj: number): number {
  return pi + pj === 0 ? 0.5 : pi / (pi + pj);
}
