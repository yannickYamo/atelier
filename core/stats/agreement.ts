// atelier/core/stats/agreement.ts — HOW MUCH TWO READINGS OF THE SAME ITEMS AGREE, BEYOND CHANCE.

/**
 * Cohen's κ for two label sequences of equal length: (observed agreement − agreement expected by chance) /
 * (1 − chance), chance from each reading's own label frequencies. 1 is perfect, 0 is chance. Null when there is
 * nothing to compare or chance agreement is already total.
 */
export function cohenKappa(a: readonly string[], b: readonly string[]): number | null {
  if (a.length !== b.length || !a.length) return null;
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const labels = [...new Set([...a, ...b])];
  const pe = labels.reduce((s, l) => s + (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n), 0);
  return pe >= 1 ? null : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
}
