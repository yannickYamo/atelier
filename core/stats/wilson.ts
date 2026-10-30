// atelier/core/stats/wilson.ts — A RATE WITH ITS UNCERTAINTY, FOR A PAGE A PERSON READS.
//
// A pass rate over 14 runs is not a pass rate over 1,400, and a page that prints "93%" for both says the same
// thing about both. The Wilson score interval stays inside [0, 1] and behaves at small n and at 0 or n
// successes, where the plain normal interval does not; it is what a rate on a status page is printed with.

/** The 95% Wilson score interval for `x` successes in `n` trials; [0, 1] when n is 0. */
export function wilson(x: number, n: number, z = 1.96): { readonly lo: number; readonly hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = x / n; const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * Newcombe's score interval for a difference of two independent proportions (method 10, 1998): the two Wilson
 * intervals combined. A normal approximation on the difference ran past 100% in a bench report (19/20 vs 7/20 gave
 * 37 to 83 points, with the upper end only held in by the count); this one stays inside [−1, 1] and is honest at the
 * edges where the counts sit.
 */
export function newcombe(x1: number, n1: number, x2: number, n2: number, z = 1.96): { readonly diff: number; readonly lo: number; readonly hi: number } {
  if (n1 === 0 || n2 === 0) return { diff: 0, lo: -1, hi: 1 };
  const p1 = x1 / n1, p2 = x2 / n2, d = p1 - p2;
  const a = wilson(x1, n1, z), b = wilson(x2, n2, z);
  return {
    diff: d,
    lo: d - Math.sqrt((p1 - a.lo) ** 2 + (b.hi - p2) ** 2),
    hi: d + Math.sqrt((a.hi - p1) ** 2 + (p2 - b.lo) ** 2),
  };
}
