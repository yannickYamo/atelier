// atelier/core/comparison/compare.ts — INCUMBENT VS CANDIDATE, AT THE RIGHT UNIT.
//
// The comparison the promotion decision rests on. Its whole job is to be honest about what the
// evidence can and cannot distinguish, which means most of this file is about the cases where the
// answer is "we could not tell".
//
// ─── THE UNIT IS THE CONTEXT, AND THAT IS NOT A PREFERENCE ─────────────────────────────────────
//
// Both arms answer the same tasks, and each task may be answered several times. So generations nest
// inside contexts and the arms are PAIRED. The per-context difference is the observation;
// `contextClusteredInterval` computes the interval over those. Ten generations of one task
// contribute one difference, computed from a mean — never ten data points.
//
// ─── AND PLATEAU IS THE STATE THIS FILE EXISTS TO WITHHOLD ─────────────────────────────────────
//
// "No improvement found" and "no improvement detectable" are different sentences and only one of
// them justifies stopping. The historical loop conflated them: four candidates auto-rejected for
// "objective not met", one having moved the target +0.250 at N=2 where resolution was ~1.34. Each
// rejection spent a strategy, so the loop retired its own licensed surfaces on noise.
//
// PLATEAU is therefore legal ONLY when the interval excludes a practically meaningful improvement —
// when `hi < worthwhile`. Anything else is UNDERPOWERED, and the difference is computed from the
// interval rather than asserted.

import { contextClusteredInterval, type ContextDifference, type WitnessInterval } from './resolution.js';
import { tCrit, resolutionFloor } from '../stats/t.js';

export type ComparisonVerdict =
  /** the candidate is better by an amount worth having, and the interval says so */
  | 'IMPROVED'
  /** a worthwhile improvement is excluded — the experiment could have seen one and did not */
  | 'PLATEAU'
  /** the candidate is worse */
  | 'REGRESSED'
  /** the interval spans the question; more evidence would help */
  | 'INCONCLUSIVE'
  /** not enough contexts to compute an interval at all */
  | 'UNDERPOWERED';

export interface ComparisonInput {
  /** paired per-context differences: candidate − incumbent, one per context */
  readonly differences: readonly ContextDifference[];
  /**
   * The smallest improvement worth having, authored not measured. It answers "how much better would
   * this have to be to be worth adopting?", which resolution cannot answer — resolution says what
   * the experiment can see, never what is worth seeing.
   */
  readonly worthwhile: number;
  /** generations per context, carried for the report so nesting is visible rather than implied */
  readonly generationsPerContext: number;
}

export interface ComparisonResult {
  readonly verdict: ComparisonVerdict;
  readonly interval: WitnessInterval | null;
  /** independent contexts — the real n. Never the observation count. */
  readonly independentContexts: number;
  readonly observations: number;
  /** the smallest difference this experiment could have called significant */
  readonly resolution: number | null;
  readonly why: string;
}

const MIN_CONTEXTS = 3;

/**
 * Compare, and refuse to conclude more than the interval supports.
 *
 * ORDER IS THE POLICY. Underpowered is checked before anything else, because an experiment that
 * cannot compute an interval has not produced a negative result — it has produced no result, and
 * reporting that as PLATEAU is how a search retires strategies it never tested.
 */
export function compare(input: ComparisonInput): ComparisonResult {
  const n = input.differences.length;
  const observations = n * input.generationsPerContext;

  if (n < MIN_CONTEXTS) {
    return { verdict: 'UNDERPOWERED', interval: null, independentContexts: n, observations,
      resolution: null,
      why: `${n} independent context(s). An interval needs at least ${MIN_CONTEXTS}, and ${observations} generation(s) do not substitute — repeated answers to the same task are one observation of that task.` };
  }

  const interval = contextClusteredInterval(input.differences);
  // The interval half-width IS t_{.975} * SE, so SE recovers by dividing it back out. Computing SE
  // from the raw deltas again would be a second owner of the same quantity.
  const halfWidth = interval.hi - interval.mean;
  // The SAME quantile from the SAME table the interval was built with. This used to divide by
  // one t-table and then multiply by another's value for the identical quantile.
  const se = halfWidth / tCrit(interval.df, 0.975);
  const resolution = resolutionFloor(se, interval.df);

  // REGRESSED: the whole interval is below zero.
  if (interval.hi < 0) {
    return { verdict: 'REGRESSED', interval, independentContexts: n, observations, resolution,
      why: `the candidate is worse across contexts (95% interval ${interval.lo.toFixed(3)} to ${interval.hi.toFixed(3)}, entirely below zero)` };
  }

  // IMPROVED: the whole interval clears the worth boundary.
  if (interval.lo > input.worthwhile) {
    return { verdict: 'IMPROVED', interval, independentContexts: n, observations, resolution,
      why: `the improvement exceeds what you said is worth having (interval starts at ${interval.lo.toFixed(3)}, worthwhile is ${input.worthwhile})` };
  }

  // PLATEAU: a worthwhile improvement is EXCLUDED. This is the only sentence that justifies stopping.
  if (interval.hi < input.worthwhile) {
    return { verdict: 'PLATEAU', interval, independentContexts: n, observations, resolution,
      why: `a worthwhile improvement is excluded — the interval tops out at ${interval.hi.toFixed(3)}, below the ${input.worthwhile} you said would be worth having. This experiment could have seen one and did not.` };
  }

  return { verdict: 'INCONCLUSIVE', interval, independentContexts: n, observations, resolution,
    why: `the interval (${interval.lo.toFixed(3)} to ${interval.hi.toFixed(3)}) spans the ${input.worthwhile} worth boundary, so this evidence cannot say whether the improvement is worth having. Not a negative result — an unmeasured one.` };
}

/** What a person reads. Says the unit out loud, because that is the thing usually misread. */
export function describeComparisonResult(r: ComparisonResult): string {
  let out = `  ${r.verdict}  over ${r.independentContexts} independent context(s)`;
  out += r.observations !== r.independentContexts
    ? `, ${r.observations} generation(s) — the generations nest inside the contexts and do not add to n\n`
    : `\n`;
  out += `    ${r.why}\n`;
  if (r.interval && r.resolution !== null) {
    out += `    this experiment could have called a difference of ${r.resolution.toFixed(3)} significant; `
      + `resolution is what it CAN see, never what is worth seeing.\n`;
  }
  return out;
}
