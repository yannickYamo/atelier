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
