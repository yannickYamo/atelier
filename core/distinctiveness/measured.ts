// atelier/core/distinctiveness/measured.ts — THE FLOOR, FED BY THE STANDARD'S OWN COUNTS.
//
// The floor in ./floor.ts is a careful comparator with nothing to compare: it needs, per dimension,
// several scores for the champion and several for a candidate, and nothing produced them. This module
// produces them from the one instrument in the system whose readings are facts rather than opinions:
// the measured rules the owner ratified (../observers/).
//
//   dimension   one live, measured, everywhere-applicable rule, named by its key (../state/rule-key.ts)
//   score       the observer's reading, ORIENTED so higher is always better: a cap's reading negated,
//               a floor's kept, a band's distance outside it negated. A draft that does not apply
//               (too short for a rate) gives no score, never a zero.
//   margin      how much worse a candidate may score before the floor calls it a regression. Proposed
//               from the AUTHOR'S OWN SPREAD on that dimension across their pieces, the owner's to
//               accept or edit (see `proposeMargins`).
//
// A margin from the author's spread is not a margin from instrument noise, which floor.ts rightly
// forbids. The instruments here are deterministic: they have no noise. The spread is how much the
// author's own pieces differ from one another on the count, which is a fact about the writer. A
// change smaller than the difference between two of their own typical pieces is not a regression of
// their voice; a larger one is worth stopping for. The owner can overrule either way.
//
// Every dimension starts OBSERVE (reported, never blocks), as floor.ts requires. The owner promotes a
// dimension to ENFORCE, and only a floor whose false-alarm rate was measured on this skill (an A/A run,
// `qualifyFromAA`) is EARNED, which is what lets the promotion gate act without a person.

import type { Measurement, Requirement, StandardVersion } from '../state/canonical-state.js';
import { isGeneralScope } from '../state/canonical-state.js';
import { keysOf } from '../state/rule-key.js';
import { measure, type ObserverResult } from '../observers/registry.js';
import { quantile, wordsOf, sentencesOf } from '../observers/text.js';
import { dimensionVerdict, type DimScores, type DimensionFloor, type DimFloorResult, type FloorQualification, type FloorVerdict, type FrozenBaselineEntry, type QualityFloorContract, type QualityFloorResult } from './floor.js';
import { tCrit, mean, sd, sampleFrom, type Sample } from './stats.js';
import type { ComparisonVerdict } from '../comparison/compare.js';

export interface FloorDimension { readonly key: string; readonly rule: Requirement }

/** The rules the floor watches: live, measured, and applying to every text. */
export function floorDimensions(v: StandardVersion): FloorDimension[] {
  const keys = keysOf(v.requirements);
  return v.requirements
    .map((r, i) => ({ key: keys[i], rule: r }))
    .filter(({ rule: r }) => r.measurement && r.authority !== 'EXPERT_REJECTED' && r.materiality !== 'INCIDENTAL' && isGeneralScope(r.appliesWhen));
}

const num = (m: Measurement, k: string): number | null => (typeof m.params[k] === 'number' ? m.params[k] : null);

/** An observer's reading, turned so that higher is better. Null when the rule did not apply. */
export function orientedScore(m: Measurement, r: ObserverResult): number | null {
  if (r.verdict === 'NOT_APPLICABLE' || r.value === null) return null;
  const s = oriented(m, r.value);
  return s === 0 ? 0 : s;   // never -0: a stored score is compared and serialised
}

function oriented(m: Measurement, v: number): number {
  switch (m.observer) {
    case 'STYLE_DISTANCE': return v;                   // (distance to the model) − (distance to the author)
    case 'PATTERN_RATE': case 'TERM_RATE': {
      const lo = num(m, 'minPer1000'); const hi = num(m, 'maxPer1000');
      if (lo !== null && hi !== null) return -(Math.max(0, lo - v) + Math.max(0, v - hi));
      return lo !== null ? v : -v;
    }
    case 'RATIO': {
      const lo = num(m, 'minShare'); const hi = num(m, 'maxShare');
      if (lo !== null && hi !== null) return -(Math.max(0, lo - v) + Math.max(0, v - hi));
      return lo !== null ? v : -v;
    }
    // Counts, lengths, rates and distances where less is better.
    default: return -v;
  }
}

/** One output's scores on every floor dimension that applied to it. */
export function scoreOutput(dims: readonly FloorDimension[], text: string): DimScores {
  const out: DimScores = {};
  for (const d of dims) {
    const s = orientedScore(d.rule.measurement!, measure(text, d.rule.measurement!));
    if (s !== null) out[d.key] = s;
  }
  return out;
}

/** Per-output score lists, keyed by dimension: the shape the floor's comparator reads. */
export function perFire(dims: readonly FloorDimension[], outputs: readonly string[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const t of outputs) for (const [k, s] of Object.entries(scoreOutput(dims, t))) (out[k] ??= []).push(s);
  return out;
}

export interface MarginProposal {
  readonly key: string;
  readonly margin: number;
  /** the author's interquartile range on this dimension, the basis of the margin */
  readonly spread: number;
  /** how many of the author's pieces the dimension applied to */
  readonly pieces: number;
}

/** The smallest margin ever proposed: below this a rounding difference would read as a regression. */
export const MIN_MARGIN = 0.05;

/**
 * The smallest change a rule can register, in its own units, at the author's typical length: one
 * occurrence of a counted thing, one sentence of a share, one word of a median. A margin finer than
 * this is finer than the rule can measure (found in a real run: an author who never writes "not X,
 * it's Y" has no spread at all, and a margin of 0.05 per 1,000 words sat far below the 0.4 that one
 * occurrence in one of their pieces is), so no difference could ever resolve.
 */
export function resolution(m: Measurement, authorTexts: readonly string[]): number {
  const med = (xs: number[]): number => (xs.length ? quantile(xs, 0.5) : 0);
  const words = med(authorTexts.map((t) => wordsOf(t).length)) || 1000;
  const sentences = med(authorTexts.map((t) => sentencesOf(t).length)) || 30;
  switch (m.observer) {
    case 'PATTERN_RATE': case 'TERM_RATE': case 'HEDGE_RATE': return Math.round((1000 / words) * 100) / 100;   // one occurrence, per 1,000 words
    case 'FRAGMENT_SHARE': return Math.round((100 / sentences) * 100) / 100;                                     // one sentence, in percent
    case 'DISTRIBUTION': return Math.round((1 / sentences) * 1000) / 1000;                                        // one sentence moving band
    case 'RATIO': return 0.1;
    case 'STYLE_DISTANCE': return MIN_MARGIN;
    default: return 1;                                                                                            // one use, one word, one sentence, one heading
  }
}

/**
 * Default margins from the author's own pieces: half their interquartile range on each dimension, and
 * never finer than the rule can register (`resolution`). A dimension that applied to fewer than three
 * pieces has no spread to speak of and gets none; it is left out of the proposal rather than guessed.
 */
export function proposeMargins(dims: readonly FloorDimension[], authorTexts: readonly string[]): MarginProposal[] {
  const scores = perFire(dims, authorTexts);
  return dims.flatMap((d) => {
    const xs = scores[d.key] ?? [];
    if (xs.length < 3) return [];
    const spread = quantile(xs, 0.75) - quantile(xs, 0.25);
    const margin = Math.max(MIN_MARGIN, resolution(d.rule.measurement!, authorTexts), Math.round((spread / 2) * 1000) / 1000);
    return [{ key: d.key, margin, spread: Math.round(spread * 1000) / 1000, pieces: xs.length }];
  });
}

/** A contract from proposed margins, keeping any role or margin the owner already set. */
export function buildContract(proposals: readonly MarginProposal[], dims: readonly FloorDimension[],
  prior: QualityFloorContract | null): QualityFloorContract {
  const statement = new Map(dims.map((d) => [d.key, d.rule.statement]));
  const dimensions: Record<string, DimensionFloor> = {};
  for (const p of proposals) {
    const had = prior?.dimensions[p.key];
    // A margin the owner set stands; a proposed one is re-proposed. The role is always the owner's.
    dimensions[p.key] = had?.rationale === 'set by the owner' ? had : { nonInferiorityMargin: p.margin, gateRole: had?.gateRole ?? 'OBSERVE',
      rationale: `half the author's interquartile range (${p.spread}) across ${p.pieces} piece(s), and at least one occurrence at their length, on: ${statement.get(p.key) ?? p.key}` };
  }
  return { instrument: 'scoreDimensionByPolicy', dimensions };
}

/**
 * One task's floor verdict.
 *
 * Built on floor.ts's `dimensionVerdict`, with two differences that matter for counts:
 *
 *   UNSCORABLE IS INCONCLUSIVE. A dimension can be unscorable for an honest reason (a rate rule on a
 *   reply under 150 words). It is reported INCONCLUSIVE for this task rather than dropped, so an
 *   ENFORCE dimension that could not be measured holds the composite at INCONCLUSIVE: never "held".
 *
 *   A VARIANCE FLOOR. Counts are sparse: two drafts that both used a banned word zero times have no
 *   spread, and Welch then resolves ANY difference with certainty, so one extra use in each of two
 *   drafts reads as a proven regression. Each side's spread is taken as at least half the dimension's
 *   margin: with three drafts a side, a drop of one margin stays INCONCLUSIVE and a drop of two
 *   resolves. (A floor of the whole margin would need about eight drafts a side to resolve anything.)
 *
 * `exclude` leaves dimensions out of the composite, never out of the report: the rule a repair is
 * about is its target, and guarding the target with the floor double-counts it (floor.ts).
 */
export function evaluateTask(candidate: Record<string, readonly number[]>, frozen: FrozenBaselineEntry, contract: QualityFloorContract,
  exclude: ReadonlySet<string> = new Set()): QualityFloorResult {
  const perDim: DimFloorResult[] = Object.entries(contract.dimensions).map(([dim, d]) => {
    const c = candidate[dim] ?? []; const f = frozen.perFireScores?.[dim] ?? [];
    if (c.length < 2 || f.length < 2) {
      return { dim, verdict: 'INCONCLUSIVE', gateRole: d.gateRole, margin: d.nonInferiorityMargin, delta: 0, lowerBound: -Infinity, upperBound: Infinity };
    }
    return { dim, gateRole: d.gateRole, margin: d.nonInferiorityMargin, ...flooredVerdict(c, f, d.nonInferiorityMargin) };
  });
  const enforced = perDim.filter((d) => d.gateRole === 'ENFORCE' && !exclude.has(d.dim));
  if (!enforced.length) return { perDim, composite: 'INCONCLUSIVE', drivenBy: [] };
  const regressed = enforced.filter((d) => d.verdict === 'REGRESSION');
  const unresolved = enforced.filter((d) => d.verdict === 'INCONCLUSIVE');
  return { perDim, composite: regressed.length ? 'REGRESSION' : unresolved.length ? 'INCONCLUSIVE' : 'NONINFERIOR',
    drivenBy: (regressed.length ? regressed : unresolved).map((d) => d.dim) };
}

/** floor.ts's verdict with each side's spread taken as at least half the margin (see `evaluateTask`). */
function flooredVerdict(candidate: readonly number[], frozen: readonly number[], margin: number): ReturnType<typeof dimensionVerdict> {
  const floorSd = (xs: readonly number[]): Sample => { const x = sampleFrom(xs); return { ...x, sd: Math.max(x.sd, margin / 2) }; };
  return dimensionVerdict(floorSd(candidate), floorSd(frozen), margin);
}

/** The regression a floor must be able to see: twice what it is told to tolerate. */
export const PLANTED_MARGINS = 2;
/** How often it must see it, and over how many plantings at least. */
export const MIN_SENSITIVITY = 0.8;
export const MIN_PLANTED = 20;

/**
 * SENSITIVITY: would this floor notice a real regression? A false-alarm rate says how often it blocks a
 * version that is no worse, and a false alarm errs toward safety. The failure that matters for letting
 * the floor act alone is the other one: a version that IS worse, passed. So on the same fresh A/A draws,
 * each enforced dimension of the second half is shifted down by PLANTED_MARGINS × its margin, and the
 * floor is asked again. The share of plantings it calls REGRESSION is its sensitivity to a regression of
 * that size, measured on this skill's own spread.
 */
export function plantedDetections(candidate: Record<string, readonly number[]>, frozen: FrozenBaselineEntry, contract: QualityFloorContract): { hits: number; trials: number } {
  let hits = 0; let trials = 0;
  for (const [dim, d] of Object.entries(contract.dimensions)) {
    if (d.gateRole !== 'ENFORCE') continue;
    const c = candidate[dim] ?? []; const f = frozen.perFireScores?.[dim] ?? [];
    if (c.length < 2 || f.length < 2) continue;
    trials += 1;
    if (flooredVerdict(c.map((x) => x - PLANTED_MARGINS * d.nonInferiorityMargin), f, d.nonInferiorityMargin).verdict === 'REGRESSION') hits += 1;
  }
  return { hits, trials };
}

/** Across tasks, the worst verdict wins: one task regressing is a regression. */
export function compositeAcross(results: readonly QualityFloorResult[]): FloorVerdict {
  if (!results.length) return 'INCONCLUSIVE';
  if (results.some((r) => r.composite === 'REGRESSION')) return 'REGRESSION';
  if (results.some((r) => r.composite === 'INCONCLUSIVE')) return 'INCONCLUSIVE';
  return 'NONINFERIOR';
}

/**
 * Did the candidate improve on ONE dimension (the rule a repair was about)?
 *
 * TASKS ARE THE UNIT, NOT GENERATIONS. Several drafts of one task are not independent evidence about
 * the skill (see ../stats/t.ts), so each task contributes one number, the candidate's mean minus the
 * champion's mean on it, and the test is across tasks: IMPROVED when the one-sided 95% lower bound of
 * the mean difference is above zero, REGRESSED when the upper bound is below zero. Fewer than two tasks
 * cannot resolve anything. A deterministic count needs no qualification to CERTIFY this; how many tasks
 * it takes is the whole cost.
 */
export function targetComparison(perTask: readonly { readonly candidate: readonly number[]; readonly champion: readonly number[] }[]): ComparisonVerdict {
  const deltas = perTask.filter((t) => t.candidate.length && t.champion.length).map((t) => mean(t.candidate) - mean(t.champion));
  // Three tasks at least: two that happen to move by the same amount would otherwise read as proof.
  if (deltas.length < 3) return 'INCONCLUSIVE';
  const m = mean(deltas); const s = sd(deltas);
  // Every task moved by exactly the same amount (a count that never varies): the sign decides.
  if (s === 0) return m > 0 ? 'IMPROVED' : m < 0 ? 'REGRESSED' : 'PLATEAU';
  const half = tCrit(deltas.length - 1, 0.95) * (s / Math.sqrt(deltas.length));
  return m - half > 0 ? 'IMPROVED' : m + half < 0 ? 'REGRESSED' : 'INCONCLUSIVE';
}

/**
 * An A/A run's tally. Each run fires the SAME version twice as many times as a check would, splits
 * the drafts for each task into two halves, and compares one half with the other as if it were a
 * baseline, so both sides are fresh in every run and runs are independent of one another. (Comparing
 * every run with one frozen baseline is not independent: a baseline that happened to be a lucky draw
 * would make every run look clean.) The unit is the task: a task whose composite over the enforced
 * dimensions is REGRESSION is one false alarm, and a task that resolved either way is one trial.
 */
export function countAA(results: readonly QualityFloorResult[]): { falseAlarms: number; trials: number } {
  const resolved = results.filter((r) => r.composite !== 'INCONCLUSIVE');
  return { trials: resolved.length, falseAlarms: resolved.filter((r) => r.composite === 'REGRESSION').length };
}

/**
 * The false-alarm rate, from independent A/A runs (see `countAA`), AND the sensitivity to a planted
 * regression (see `plantedDetections`). The upper one-sided 95% bound on false alarms is exact
 * (Clopper–Pearson); with none at all it takes 59 resolved task comparisons to bring it to 5% (twenty
 * tasks and three runs, say). The floor must also catch at least MIN_SENSITIVITY of MIN_PLANTED or more
 * planted regressions. Qualified only over at least three distinct tasks; otherwise null, and the gate
 * stays UNQUALIFIED.
 */
export function qualifyFromAA(tally: { falseAlarms: number; trials: number; plantedHits?: number; planted?: number }, tasks: number, estimand: string,
  maxRate = 0.05, at = new Date().toISOString()): { qualification: FloorQualification | null; upper95: number; sensitivity: number | null } {
  const upper95 = tally.trials ? clopperPearsonUpper(tally.falseAlarms, tally.trials, 0.95) : 1;
  const planted = tally.planted ?? 0;
  const sensitivity = planted ? (tally.plantedHits ?? 0) / planted : null;
  // Both halves of the claim: it rarely blocks a version that is no worse, AND it catches one that is.
  const sensitive = planted >= MIN_PLANTED && (sensitivity ?? 0) >= MIN_SENSITIVITY;
  const qualification = tally.trials && tasks >= 3 && upper95 <= maxRate && sensitive
    ? { estimand, falseAlarmUpper95: upper95, independentContexts: tasks, decidedAt: at } : null;
  return { qualification, upper95, sensitivity };
}

/** Exact one-sided upper confidence bound for a binomial proportion, by bisection on the tail. */
export function clopperPearsonUpper(k: number, n: number, level: number): number {
  if (k >= n) return 1;
  // P(X ≤ k | p) = 1 − level at the bound.
  const cdf = (p: number): number => {
    let term = (1 - p) ** n; let sum = term;
    for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; }
    return sum;
  };
  let lo = 0; let hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (cdf(mid) > 1 - level) lo = mid; else hi = mid; }
  return Math.round(hi * 10000) / 10000;
}
