// atelier/core/stats/sign-test.ts — THE ONE OWNER OF THE PAIRED EXACT TEST.
//
// The external-expert preregistration names `mcnemarExactP` and `MIN_DISCORDANT` as existing
// machinery. They existed only as a comment citing a result computed elsewhere — the exact shape of
// claim this repository refuses: analysis the product does not contain, run by a script nobody can
// audit. So the machinery is built here, with tests pinning it to known values, in the same commit
// that seals the design naming it. A preregistration may not cite an instrument that does not ship.
//
// For paired preferences with two outcomes per discordant pair, McNemar's exact test IS the
// two-sided sign test on discordant pairs; the name is kept for the epidemiology reader and the
// sign-test framing for everyone else.

/**
 * Below this many discordant pairs, no p-value is quoted: the result is UNDERPOWERED, declared in
 * the design rather than discovered in the discussion section. At 25 discordant pairs the critical
 * count is 18 (two-sided exact p = 0.043) and power at a 75/25 true split is barely 0.63 — the
 * floor under which a null is uninterpretable rather than informative.
 */
export const MIN_DISCORDANT = 25;

const binomTail = (n: number, p: number, from: number): number => {
  // P(X >= from) computed by iterating the pmf — stable for the study-sized n this serves.
  let pmf = Math.pow(1 - p, n);          // P(X = 0)
  let acc = from <= 0 ? pmf : 0;
  for (let k = 1; k <= n; k++) {
    pmf *= ((n - k + 1) / k) * (p / (1 - p));
    if (k >= from) acc += pmf;
  }
  return Math.min(1, acc);
};

/**
 * Exact two-sided sign test on discordant pairs: `wins` preferred one way, `losses` the other,
 * ties already excluded (a tie is uninformative under a superiority claim — the direction of
 * conservatism is declared in the design that calls this, not decided here).
 */
export function mcnemarExactP(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.max(wins, losses);
  const oneTail = binomTail(n, 0.5, k);
  return Math.min(1, 2 * oneTail);
}

/**
 * Exact (Clopper–Pearson) two-sided confidence interval for a binomial proportion, by bisection on
 * the exact tails — no approximation, which is the point of reporting it beside the p-value.
 */
export function clopperPearson(successes: number, n: number, alpha = 0.05): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const solve = (f: (p: number) => number, target: number): number => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > target) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const lo = successes === 0 ? 0
    : solve((p) => binomTail(n, p, successes), alpha / 2);
  // P(X <= k | p) = alpha/2  ⇔  P(X >= k+1 | p) = 1 - alpha/2, and the right tail is increasing
  // in p — the first draft inverted this and the pinned reference values caught it immediately.
  const hi = successes === n ? 1
    : solve((p) => binomTail(n, p, successes + 1), 1 - alpha / 2);
  return { lo, hi };
}
