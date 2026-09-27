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
import { type DimScores, type DimensionFloor, type DimFloorResult, type FloorQualification, type FloorVerdict, type FrozenBaselineEntry, type QualityFloorContract, type QualityFloorResult } from './floor.js';
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
    case 'RHYTHM': {
      const lo = num(m, 'minCv'); const hi = num(m, 'maxCv');
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
    case 'RHYTHM': return 0.05;
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

// ─── THE VERDICT: TASKS ARE THE UNIT ────────────────────────────────────────────────────────────
//
// An earlier version gave a verdict per task, from several drafts of each, and let the worst task decide.
// On a real model that could not be earned: drafts of one task vary so much that three a side resolved
// nothing, and qualifying needed about 360 drafts. Tasks are the right unit anyway (several drafts of
// one task are not independent evidence about the skill), so the test is now one per rule, ACROSS tasks:
// each task contributes the difference between the candidate's mean and the champion's mean on it, and
// the rule holds when the one-sided 95% lower bound of the mean difference is above −margin. One draft
// per task per version is enough; more tasks, not more drafts, is what narrows it.

/** Fewer tasks than this give no verdict: a t-test over two or three differences says little. */
export const MIN_TASKS_FOR_VERDICT = 5;

export interface Paired { readonly candidate: readonly number[]; readonly champion: readonly number[] }

/**
 * One rule's verdict across tasks. Each side's spread is taken as at least half the margin, so a count
 * that never varies cannot resolve a difference with false certainty. `shift` subtracts from the
 * candidate, to plant a regression of known size.
 */
export function acrossTasks(pairs: readonly Paired[], margin: number, shift = 0): { verdict: FloorVerdict; delta: number; lowerBound: number; upperBound: number } {
  const deltas = pairs.filter((p) => p.candidate.length && p.champion.length).map((p) => mean(p.candidate) - shift - mean(p.champion));
  if (deltas.length < MIN_TASKS_FOR_VERDICT) return { verdict: 'INCONCLUSIVE', delta: deltas.length ? mean(deltas) : 0, lowerBound: -Infinity, upperBound: Infinity };
  const m = mean(deltas);
  const spread = Math.max(sd(deltas), margin / 2);
  const half = tCrit(deltas.length - 1, 0.95) * (spread / Math.sqrt(deltas.length));
  const lowerBound = m - half; const upperBound = m + half;
  const verdict: FloorVerdict = upperBound < -margin ? 'REGRESSION' : lowerBound > -margin ? 'NONINFERIOR' : 'INCONCLUSIVE';
  return { verdict, delta: m, lowerBound, upperBound };
}

/** The pairs for one dimension: each candidate task matched to the champion's same task. */
export const pairsFor = (dim: string, candidate: readonly FrozenBaselineEntry[], champion: readonly FrozenBaselineEntry[]): Paired[] =>
  candidate.flatMap((c) => {
    const f = champion.find((b) => b.fixtureContextId === c.fixtureContextId);
    return f ? [{ candidate: c.perFireScores?.[dim] ?? [], champion: f.perFireScores?.[dim] ?? [] }] : [];
  });

/**
 * The floor's verdict on a candidate: every dimension across tasks, and the composite over the ENFORCE
 * dimensions not excluded. `exclude` leaves the repair's own rule out of the composite (guarding the
 * target with the floor double-counts it) but never out of the report. An enforced dimension that could
 * not be resolved holds the composite at INCONCLUSIVE: never read as "held".
 */
export function evaluateAcross(candidate: readonly FrozenBaselineEntry[], champion: readonly FrozenBaselineEntry[], contract: QualityFloorContract,
  exclude: ReadonlySet<string> = new Set(), shift: Readonly<Record<string, number>> = {}): QualityFloorResult {
  const perDim: DimFloorResult[] = Object.entries(contract.dimensions).map(([dim, d]) =>
    ({ dim, gateRole: d.gateRole, margin: d.nonInferiorityMargin, ...acrossTasks(pairsFor(dim, candidate, champion), d.nonInferiorityMargin, shift[dim] ?? 0) }));
  const enforced = perDim.filter((d) => d.gateRole === 'ENFORCE' && !exclude.has(d.dim));
  if (!enforced.length) return { perDim, composite: 'INCONCLUSIVE', drivenBy: [] };
  const regressed = enforced.filter((d) => d.verdict === 'REGRESSION');
  const unresolved = enforced.filter((d) => d.verdict === 'INCONCLUSIVE');
  return { perDim, composite: regressed.length ? 'REGRESSION' : unresolved.length ? 'INCONCLUSIVE' : 'NONINFERIOR',
    drivenBy: (regressed.length ? regressed : unresolved).map((d) => d.dim) };
}

/**
 * Did the candidate improve on ONE dimension (the rule a repair was about)? The same test pointed the
 * other way: IMPROVED when the lower bound of the mean difference across tasks is above zero, REGRESSED
 * when the upper bound is below zero. A deterministic count needs no qualification to CERTIFY this; how
 * many tasks it takes is the whole cost.
 */
export function targetComparison(perTask: readonly Paired[]): ComparisonVerdict {
  const deltas = perTask.filter((t) => t.candidate.length && t.champion.length).map((t) => mean(t.candidate) - mean(t.champion));
  if (deltas.length < 3) return 'INCONCLUSIVE';
  const m = mean(deltas); const s = sd(deltas);
  // Every task moved by exactly the same amount (a count that never varies): the sign decides.
  if (s === 0) return m > 0 ? 'IMPROVED' : m < 0 ? 'REGRESSED' : 'PLATEAU';
  const half = tCrit(deltas.length - 1, 0.95) * (s / Math.sqrt(deltas.length));
  return m - half > 0 ? 'IMPROVED' : m + half < 0 ? 'REGRESSED' : 'INCONCLUSIVE';
}

// ─── QUALIFICATION ──────────────────────────────────────────────────────────────────────────────
//
// Two different failures, weighed differently (docs/MEASURED-RULES.md, "The regression floor"):
//
//   passing a worse version   the dangerous one. SENSITIVITY: on fresh A/A draws, each enforced rule is
//                             shifted down by PLANTED_MARGINS margins, and the floor must call at least
//                             MIN_SENSITIVITY of at least MIN_PLANTED such plantings a regression.
//   blocking a version that is no worse   costs a missed improvement, which is the safe direction, and
//                             the across-task test controls it at a nominal 5%. The A/A check is a
//                             calibration check against gross miscalibration (heavy-tailed tasks): the
//                             exact upper bound on false alarms over at least MIN_AA_TRIALS resolved
//                             comparisons must be at most AA_BAR.
//
// Each A/A run drafts the same version twice per task and compares one half with the other, so both
// sides are fresh and runs are independent. Every enforced rule's verdict in a run is one trial.

export const PLANTED_MARGINS = 2;
export const MIN_SENSITIVITY = 0.8;
export const MIN_PLANTED = 10;
export const AA_BAR = 0.25;
export const MIN_AA_TRIALS = 11;

/** An A/A run's tally: each enforced rule that resolved is a trial; each REGRESSION a false alarm. */
export function countAA(result: QualityFloorResult): { falseAlarms: number; trials: number } {
  const resolved = result.perDim.filter((d) => d.gateRole === 'ENFORCE' && d.verdict !== 'INCONCLUSIVE');
  return { trials: resolved.length, falseAlarms: resolved.filter((d) => d.verdict === 'REGRESSION').length };
}

/** Plant a regression of PLANTED_MARGINS margins on each enforced rule, and count the ones the floor calls. */
export function plantedDetections(candidate: readonly FrozenBaselineEntry[], champion: readonly FrozenBaselineEntry[], contract: QualityFloorContract): { hits: number; trials: number } {
  const enforced = Object.entries(contract.dimensions).filter(([, d]) => d.gateRole === 'ENFORCE');
  const shift = Object.fromEntries(enforced.map(([k, d]) => [k, PLANTED_MARGINS * d.nonInferiorityMargin]));
  const r = evaluateAcross(candidate, champion, contract, new Set(), shift);
  const shifted = r.perDim.filter((d) => d.gateRole === 'ENFORCE');
  return { trials: shifted.length, hits: shifted.filter((d) => d.verdict === 'REGRESSION').length };
}

export function qualifyFromAA(tally: { falseAlarms: number; trials: number; plantedHits?: number; planted?: number }, tasks: number, estimand: string,
  at = new Date().toISOString()): { qualification: FloorQualification | null; upper95: number; sensitivity: number | null } {
  const upper95 = tally.trials ? clopperPearsonUpper(tally.falseAlarms, tally.trials, 0.95) : 1;
  const planted = tally.planted ?? 0;
  const sensitivity = planted ? (tally.plantedHits ?? 0) / planted : null;
  const sensitive = planted >= MIN_PLANTED && (sensitivity ?? 0) >= MIN_SENSITIVITY;
  const calibrated = tally.trials >= MIN_AA_TRIALS && upper95 <= AA_BAR;
  const qualification = tasks >= MIN_TASKS_FOR_VERDICT && sensitive && calibrated
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
