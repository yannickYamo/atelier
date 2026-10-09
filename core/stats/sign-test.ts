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
 * count is 18 (two-sided exact p = 0.043) and power at a 75/25 true split is 0.73 — the
 * floor under which a null is uninterpretable rather than informative.
 */
export const MIN_DISCORDANT = 25;

/**
 * P(X >= from) for X ~ Binomial(n, p), summed over the mass function in logarithms. Started from (1 - p)^n as a plain
 * number it is zero to a computer once n is large, and every term after it is zero times something: from n = 90 an
 * exact interval came back as {1, 1}, and a paired test on a thousand pairs as p = 0, with no error.
 */
export const binomTail = (n: number, p: number, from: number): number => {
  if (from <= 0) return 1;
  if (from > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const step = Math.log(p) - Math.log1p(-p);
  let logPmf = n * Math.log1p(-p);       // log P(X = 0)
  let acc = 0;
  for (let k = 1; k <= n; k++) {
    logPmf += Math.log((n - k + 1) / k) + step;
    if (k >= from) acc += Math.exp(logPmf);
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
 * Exact ONE-sided sign test: P(X ≥ wins | n, ½), the upper binomial tail. For a design that
 * preregistered its direction (the Phase C studies: the skill's output preferred over the model's
 * own); a two-sided design uses `mcnemarExactP`. `n` counts the discordant pairs, ties excluded.
 */
export function signTestOneSidedP(wins: number, n: number): number {
  if (!Number.isInteger(wins) || !Number.isInteger(n) || n < 0 || wins < 0 || wins > n) {
    throw new RangeError(`signTestOneSidedP needs whole numbers 0 ≤ wins ≤ n (got ${wins} of ${n})`);
  }
  return n === 0 ? 1 : binomTail(n, 0.5, wins);
}

/**
 * Exact upper tail P(X ≥ k | n, p) at any chance rate: the blinding check in Phase C, where a reader
 * guessing which of three pieces is the product is right a third of the time by chance.
 */
export function binomialUpperTailP(k: number, n: number, p: number): number {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 0 || k < 0 || k > n || !(p >= 0 && p <= 1)) {
    throw new RangeError(`binomialUpperTailP needs whole numbers 0 ≤ k ≤ n and 0 ≤ p ≤ 1 (got ${k}, ${n}, ${p})`);
  }
  return n === 0 ? 1 : binomTail(n, p, k);
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
