// atelier/core/contract/budget-probe.ts — HOW MANY TOKENS THE WORK NEEDS, ESTABLISHED HONESTLY.
//
// ─── WHY THIS IS A MODULE AND NOT A CONSTANT ───────────────────────────────────────────────────
//
// The contract runner carried `maxTokens: 1200` for its whole life. A bare answer to a multi-step
// task runs a measured 6606-token median. 54 of 144 generations in one study were cut off before an
// answer existed, an observer read the fragments as choices, and the effect built on them was
// published and retracted.
//
// ─── THE RULE THAT MATTERS, AND WE LEARNED IT THE EXPENSIVE WAY ────────────────────────────────
//
// The remeasurement raised the cap to 8000 on the measured grounds that "the worst complete answer
// is 4376 tokens". That measurement was taken on the run whose cap was 1200 — so every long answer
// had ALREADY been cut, and "worst complete" was drawn from the surviving short tail. It is a
// censored sample, and an estimate from one is not a measurement however carefully it is quoted.
// Two more generations hit the new ceiling.
//
//     A SAMPLE CONTAINING ANY RIGHT-CENSORED OUTPUT IS INADMISSIBLE FOR ESTIMATING A BUDGET.
//
// So a censored probe does not produce a smaller number, a warning, or a best effort. It REFUSES,
// and what gets rerun is the preflight, never the study. Fixing the cap does not fix an estimate
// derived under the old cap, and the only way to stop making that mistake is to make it unsayable.

/** One probe generation, reduced to the two facts a budget depends on. */
export interface ProbeObservation {
  readonly outputTokens: number;
  /** true when the provider stopped this at the limit — i.e. the observation is right-censored */
  readonly censored: boolean;
}

export type BudgetBasis =
  /** measured from a probe in which nothing was cut off. The only basis that licenses a study. */
  | 'UNCENSORED_PROBE'
  /** a person supplied it and owns the consequence */
  | 'EXPLICIT_OVERRIDE';

/**
 * WHERE THE NUMBER CAME FROM, recorded beside the number.
 *
 * Carried into the run record so the exact failure that cost us a finding is mechanically auditable
 * afterwards rather than reconstructable only from memory: a reader can see the basis, the probe it
 * came from, and how many of its generations terminated each way.
 */
export interface BudgetProvenance {
  readonly maxTokens: number;
  readonly basis: BudgetBasis;
  readonly probeSuiteHash: string | null;
  /** termination kind -> count, over the probe. Under `UNCENSORED_PROBE` MAX_TOKENS is 0 by construction. */
  readonly probeTerminationCounts: Readonly<Record<string, number>>;
  /** the largest COMPLETE generation the probe saw, which is what the headroom multiplies */
  readonly observedMaxOutputTokens: number | null;
  readonly headroom: number;
}

/** Raised when a probe cannot license a budget. The preflight is rerun; the study is not started. */
export class CensoredProbe extends Error {
  constructor(readonly censoredCount: number, readonly probeCap: number, readonly suggestedCap: number) {
    super(
      `${censoredCount} of the probe generations were cut off at the ${probeCap}-token limit, so this `
      + 'sample cannot say how many tokens the work needs — every censored observation is a lower '
      + `bound, not a length. Raise the probe cap to at least ${suggestedCap} and rerun the PREFLIGHT. `
      + 'Do not start the study: an estimate taken under a cap that bound is exactly the error that '
      + 'produced a retracted coverage effect.');
    this.name = 'CensoredProbe';
  }
}

/** Multiplier over the largest complete generation observed. */
export const DEFAULT_HEADROOM = 2;

/**
 * Turn a probe into a budget, or refuse.
 *
 * Refuses an empty probe too. Zero observations is not "nothing was censored"; it is no evidence,
 * and the difference is the whole point of the module.
 */
export function budgetFromProbe(
  probe: readonly ProbeObservation[], probeCap: number,
  opts: { readonly suiteHash?: string | null; readonly headroom?: number } = {},
): BudgetProvenance {
  const headroom = opts.headroom ?? DEFAULT_HEADROOM;
  if (probe.length === 0) throw new CensoredProbe(0, probeCap, probeCap * 2);

  const censored = probe.filter((p) => p.censored);
  if (censored.length > 0) throw new CensoredProbe(censored.length, probeCap, Math.ceil(probeCap * 2));

  const observedMax = Math.max(...probe.map((p) => p.outputTokens));
  return {
    maxTokens: Math.ceil(observedMax * headroom),
    basis: 'UNCENSORED_PROBE',
    probeSuiteHash: opts.suiteHash ?? null,
    probeTerminationCounts: { COMPLETE: probe.length, MAX_TOKENS: 0 },
    observedMaxOutputTokens: observedMax,
    headroom,
  };
}

/** A person named the budget. Recorded as such so no report can call it measured. */
export const budgetFromOverride = (maxTokens: number): BudgetProvenance => ({
  maxTokens, basis: 'EXPLICIT_OVERRIDE', probeSuiteHash: null,
  probeTerminationCounts: {}, observedMaxOutputTokens: null, headroom: 1,
});

/** The line a run record carries, so the basis travels with the number. */
export const describeBudget = (b: BudgetProvenance): string =>
  b.basis === 'EXPLICIT_OVERRIDE'
    ? `max_tokens ${b.maxTokens} (supplied, not measured)`
    : `max_tokens ${b.maxTokens} = ${b.observedMaxOutputTokens} observed x${b.headroom} headroom, `
      + `over ${b.probeTerminationCounts.COMPLETE ?? 0} uncensored probe generations`;
