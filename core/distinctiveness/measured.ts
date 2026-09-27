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
import { quantile } from '../observers/text.js';
import { evaluateQualityFloor, type DimScores, type DimensionFloor, type DimFloorResult, type FloorQualification, type FloorVerdict, type FrozenBaselineEntry, type QualityFloorContract, type QualityFloorResult } from './floor.js';
import { tCrit, mean, sd } from './stats.js';
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
 * Default margins from the author's own pieces: half their interquartile range on each dimension. A
 * dimension that applied to fewer than three pieces has no spread to speak of and gets none; it is left
 * out of the proposal rather than given a guess.
 */
export function proposeMargins(dims: readonly FloorDimension[], authorTexts: readonly string[]): MarginProposal[] {
  const scores = perFire(dims, authorTexts);
  return dims.flatMap((d) => {
    const xs = scores[d.key] ?? [];
    if (xs.length < 3) return [];
    const spread = quantile(xs, 0.75) - quantile(xs, 0.25);
    return [{ key: d.key, margin: Math.max(MIN_MARGIN, Math.round((spread / 2) * 1000) / 1000), spread: Math.round(spread * 1000) / 1000, pieces: xs.length }];
  });
}

/** A contract from proposed margins, keeping any role or margin the owner already set. */
export function buildContract(proposals: readonly MarginProposal[], dims: readonly FloorDimension[],
  prior: QualityFloorContract | null): QualityFloorContract {
  const statement = new Map(dims.map((d) => [d.key, d.rule.statement]));
  const dimensions: Record<string, DimensionFloor> = {};
  for (const p of proposals) {
    const had = prior?.dimensions[p.key];
    dimensions[p.key] = had ?? { nonInferiorityMargin: p.margin, gateRole: 'OBSERVE',
      rationale: `half the author's interquartile range (${p.spread}) across ${p.pieces} piece(s) on: ${statement.get(p.key) ?? p.key}` };
  }
  return { instrument: 'scoreDimensionByPolicy', dimensions };
}

/**
 * One task's floor verdict. The comparator in floor.ts rightly throws on a dimension it cannot score;
 * here a dimension can be unscorable for an honest reason (a rate rule on a reply under 150 words), so
 * such a dimension is reported INCONCLUSIVE for this task rather than dropped. An ENFORCE dimension
 * that could not be measured therefore holds the composite at INCONCLUSIVE: never read as "held".
 */
export function evaluateTask(candidate: Record<string, readonly number[]>, frozen: FrozenBaselineEntry, contract: QualityFloorContract): QualityFloorResult {
  const scored = Object.keys(contract.dimensions).filter((d) => (candidate[d]?.length ?? 0) >= 2 && (frozen.perFireScores?.[d]?.length ?? 0) >= 2);
  const measured = scored.length
    ? evaluateQualityFloor(candidate, frozen, { ...contract, dimensions: Object.fromEntries(scored.map((d) => [d, contract.dimensions[d]])) })
    : { perDim: [], composite: 'INCONCLUSIVE' as FloorVerdict, drivenBy: [] };
  const unscored: DimFloorResult[] = Object.keys(contract.dimensions).filter((d) => !scored.includes(d)).map((d) => ({
    dim: d, verdict: 'INCONCLUSIVE', gateRole: contract.dimensions[d].gateRole, margin: contract.dimensions[d].nonInferiorityMargin,
    delta: 0, lowerBound: -Infinity, upperBound: Infinity }));
  const perDim = [...measured.perDim, ...unscored];
  const enforced = perDim.filter((d) => d.gateRole === 'ENFORCE');
  if (!enforced.length) return { perDim, composite: 'INCONCLUSIVE', drivenBy: [] };
  const regressed = enforced.filter((d) => d.verdict === 'REGRESSION');
  const unresolved = enforced.filter((d) => d.verdict === 'INCONCLUSIVE');
  return { perDim, composite: regressed.length ? 'REGRESSION' : unresolved.length ? 'INCONCLUSIVE' : 'NONINFERIOR',
    drivenBy: (regressed.length ? regressed : unresolved).map((d) => d.dim) };
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
  if (deltas.length < 2) return 'INCONCLUSIVE';
  const m = mean(deltas); const s = sd(deltas);
  // Every task moved by exactly the same amount (a count that never varies): the sign decides.
  if (s === 0) return m > 0 ? 'IMPROVED' : m < 0 ? 'REGRESSED' : 'PLATEAU';
  const half = tCrit(deltas.length - 1, 0.95) * (s / Math.sqrt(deltas.length));
  return m - half > 0 ? 'IMPROVED' : m + half < 0 ? 'REGRESSED' : 'INCONCLUSIVE';
}

/** An A/A run's tally: every ENFORCE comparison is a trial, and every REGRESSION among them a false alarm. */
export function countAA(results: readonly QualityFloorResult[]): { falseAlarms: number; trials: number } {
  const enforced = results.flatMap((r) => r.perDim.filter((d) => d.gateRole === 'ENFORCE' && d.verdict !== 'INCONCLUSIVE'));
  return { trials: enforced.length, falseAlarms: enforced.filter((d) => d.verdict === 'REGRESSION').length };
}

/**
 * The false-alarm rate, from A/A runs: the champion fired again and compared with its own frozen
 * baseline, so every REGRESSION on an ENFORCE dimension is a false alarm. The upper one-sided 95% bound
 * is exact (Clopper–Pearson). With no false alarm at all it takes about 60 resolved comparisons to
 * bring that bound under 5% (ten tasks and six enforced rules, or several runs), and that is the price
 * of letting the floor act alone. Qualified only over at least three tasks; otherwise null, and the
 * gate stays UNQUALIFIED.
 */
export function qualifyFromAA(tally: { falseAlarms: number; trials: number }, tasks: number, estimand: string,
  maxRate = 0.05, at = new Date().toISOString()): { qualification: FloorQualification | null; upper95: number } {
  const upper95 = tally.trials ? clopperPearsonUpper(tally.falseAlarms, tally.trials, 0.95) : 1;
  const qualification = tally.trials && tasks >= 3 && upper95 <= maxRate
    ? { estimand, falseAlarmUpper95: upper95, independentContexts: tasks, decidedAt: at } : null;
  return { qualification, upper95 };
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
