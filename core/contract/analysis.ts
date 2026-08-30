// atelier/core/contract/analysis.ts — THE CONTEXT IS THE UNIT, AND THAT IS THE WHOLE DESIGN.
//
// ─── WHAT THIS DELIBERATELY IS NOT ─────────────────────────────────────────────────────────────
//
// Not a statistics library. It implements exactly the analysis this contract framework has earned
// and states its assumptions as code rather than as a comment somewhere else:
//
//   • the CONTEXT is the independent unit; generations within a context are NESTED, not independent
//   • arms are PAIRED by context — every arm sees every context
//   • positive and negative strata are analysed SEPARATELY and never averaged into one figure
//   • a degenerate interval is REPORTED as degenerate, never read as precision
//
// Cluster bootstrap, stratified resampling and multiplicity corrections are absent on purpose. Each
// would be added when a study needs it, the way the optimizer interface is being shaped by a working
// instance rather than by imagination. Generality invented ahead of a use is generality nobody has
// checked.
//
// ─── WHY RESAMPLING GENERATIONS WOULD BE WRONG ─────────────────────────────────────────────────
//
// Three generations of one context are three reads of the SAME question. Resampling them treats
// them as three independent observations and shrinks the interval by roughly the square root of the
// repetition count — a tighter interval bought entirely by counting the same context more times.
// So the resample is over contexts, always, and the per-context rate is carried along whole.

/** One context, as every arm saw it. The rate is over that context's own generations. */
export interface ContextRates {
  readonly contextId: string;
  /** arm -> share of that context's VALID generations scored correct */
  readonly byArm: Readonly<Record<string, number>>;
  /** how many valid generations the rate is over, per arm. A rate over zero is not a rate. */
  readonly validByArm: Readonly<Record<string, number>>;
}

export interface PairedEstimate {
  readonly treatment: string;
  readonly control: string;
  readonly contexts: number;
  readonly meanDelta: number;
  readonly lo95: number;
  readonly hi95: number;
  /** lo === hi. The arms agreed on every context; nothing was estimated. */
  readonly degenerate: boolean;
}

/**
 * Deterministic PRNG, seeded by the caller.
 *
 * A bootstrap whose seed comes from the clock cannot be re-derived from the artifact, and "the
 * interval moved slightly" then has two possible causes. The seed is an input and is recorded.
 */
const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; };
};

export const DEFAULT_RESAMPLES = 10_000;

/**
 * Paired context bootstrap. Resamples CONTEXTS with replacement; never generations.
 *
 * Contexts where either arm has no valid generation are DROPPED rather than imputed, and the count
 * that survives is what `contexts` reports — so a study that lost half its cases to truncation says
 * so in the n rather than in a footnote.
 */
export function pairedBootstrap(
  rows: readonly ContextRates[], treatment: string, control: string,
  opts: { readonly resamples?: number; readonly seed?: number } = {},
): PairedEstimate {
  const usable = rows.filter((r) =>
    (r.validByArm[treatment] ?? 0) > 0 && (r.validByArm[control] ?? 0) > 0);
  const deltas = usable.map((r) => (r.byArm[treatment] ?? 0) - (r.byArm[control] ?? 0));

  if (deltas.length === 0) {
    return { treatment, control, contexts: 0, meanDelta: 0, lo95: 0, hi95: 0, degenerate: true };
  }
  const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const n = opts.resamples ?? DEFAULT_RESAMPLES;
  const rnd = lcg(opts.seed ?? 20_260_828);
  const means: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    // AS MANY DRAWS AS THERE ARE CONTEXTS, each drawn at random WITH REPLACEMENT. The element is
    // deliberately unused: this is not an iteration over deltas, it is n independent draws from
    // them, and writing it as an index loop made it read like the former.
    for (const _unused of deltas) sum += deltas[Math.floor(rnd() * deltas.length)];
    means.push(sum / deltas.length);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(n * 0.025)];
  const hi = means[Math.floor(n * 0.975)];
  return { treatment, control, contexts: deltas.length, meanDelta: mean(deltas), lo95: lo, hi95: hi,
    degenerate: lo === hi };
}

/**
 * The three-arm decomposition, reported per stratum and never rolled up.
 *
 * BARE -> PROSE is whether the user's standard helps at all. PROSE -> COMPILED is whether the
 * compiler adds anything beyond handing the model those same rules, and it is the one that decides
 * the product — a two-arm study cannot separate them, and "COMPILED beat BARE" is a claim about
 * prompting until PROSE is in the design.
 */
export interface Decomposition {
  readonly standardEffect: PairedEstimate;
  readonly compilerEffect: PairedEstimate;
  readonly totalEffect: PairedEstimate;
}

export const decompose = (
  rows: readonly ContextRates[],
  arms: { readonly bare: string; readonly prose: string; readonly compiled: string },
  opts: { readonly resamples?: number; readonly seed?: number } = {},
): Decomposition => ({
  standardEffect: pairedBootstrap(rows, arms.prose, arms.bare, opts),
  compilerEffect: pairedBootstrap(rows, arms.compiled, arms.prose, opts),
  totalEffect: pairedBootstrap(rows, arms.compiled, arms.bare, opts),
});

const sign = (v: number): string => (v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3));

/** One line, with the degeneracy said out loud rather than left for a reader to notice. */
export const describeEstimate = (e: PairedEstimate): string =>
  `${e.treatment} - ${e.control}: ${sign(e.meanDelta)} [${sign(e.lo95)}, ${sign(e.hi95)}] over n=${e.contexts} contexts`
  + (e.degenerate
    ? '  DEGENERATE — the arms agreed on every context, so the interval has zero width. This is a '
      + 'constant, not a precise estimate, and it is not evidence of no effect.'
    : '');
