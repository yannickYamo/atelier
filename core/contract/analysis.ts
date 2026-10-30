// atelier/core/contract/analysis.ts — SEEDED RESAMPLING, STATED ONCE.
//
// The resampling helpers the product reaches: the two
// functions the product still reaches. `drawWithReplacement` is the one statement of resampling with replacement;
// the detector's qualification (../fidelity/qualify.ts) calls it once per class, so class sizes hold. `seededShuffle`
// blinds a round. Both take their randomness from a seed the caller records, so a result can be re-derived from the
// artifact: a draw whose seed came from the clock has two possible causes for "the interval moved slightly".

/** Deterministic PRNG, seeded by the caller. The seed is an input and is recorded. */
const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; };
};

/**
 * A seeded permutation (Fisher–Yates), for blinding: which letter a version gets must not depend on the
 * version, and must be re-derivable from the recorded seed.
 */
export function seededShuffle<T>(xs: readonly T[], seed: number): T[] {
  const rnd = lcg(seed); const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * One bootstrap draw: as many elements as `xs` holds, each drawn at random WITH REPLACEMENT by `rnd`.
 * A stratified bootstrap calls it once per stratum (../fidelity/qualify.ts resamples author and model
 * scores separately), so class sizes hold.
 */
export function drawWithReplacement<T>(xs: readonly T[], rnd: () => number): T[] {
  return xs.map(() => xs[Math.floor(rnd() * xs.length)]);
}
