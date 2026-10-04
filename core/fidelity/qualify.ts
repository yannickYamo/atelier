// atelier/core/fidelity/qualify.ts — WHAT A SENSOR MUST CLEAR BEFORE IT MAY STEER ANYTHING.
//
// WHY A BAR AT ALL. A sensor that separates the author from the model on the texts it was built on has
// shown only that it can memorise them. Steering drafts toward a sensor that does not hold on texts it has
// never seen pushes them toward noise, and an instrument steered toward is no longer one to judge by. So
// a sensor is measured the way it will be used: on texts held out of everything it learned from.
//
// THREE HOLD-OUTS, ONE QUESTION EACH.
//
//   source     leave one source out. Does it hold on a piece it has never seen, and on the imitations
//              made from that piece? A source is a group: an author piece and its imitations share one.
//   topic      leave one topic out. Does it read style, or does it read what the pieces are about?
//   generator  leave one generator out. Does it catch a model it was never trained against? Author texts
//              have no generator, so they are dealt into the generator folds by source: the author sources,
//              sorted by name, go round-robin to the folds (generators sorted by name), every text of one
//              source to the same fold. A fold's test set is that generator's texts plus its share of author
//              sources; its training set is every other generator and every other author source. With at
//              least as many author sources as generators, every fold has both labels.
//
// WHAT IS REPORTED. Per fold, the AUC where the fold has both labels. Pooled, the AUC of every held-out
// score together, with a 95% interval from a stratified bootstrap (author and model texts resampled
// separately, so every resample keeps the class sizes). The bootstrap uses a small seeded generator, so a
// result is reproducible from its seed. AUC is ORIENTED: above 0.5 means the sensor scores model texts
// higher. A trained sensor's orientation is set by its training. A feature sensor has no training; its
// direction is declared (`direction`) or, when it is not, read from the pooled data, and the
// orientation-free separation |AUC - 0.5| is reported beside it.
//
// THE BARS (QUALIFY_BARS). Separation of at least 0.25 (the same distance ../observers/selection.ts asks of
// a feature) and a lower 95% bound of at least 0.65 on the oriented pooled AUC. A sensor qualifies only if
// every hold-out the data supports passes. A hold-out with fewer than 2 distinct values cannot be run, and
// the result says so rather than counting it as a pass.

import { createHash } from 'node:crypto';
import { drawWithReplacement } from '../contract/analysis.js';
import { scoreDetector, trainDetector, type DetectorOptions } from './stylometry.js';

/** The bars a pooled, held-out result must clear. */
export const QUALIFY_BARS = { minSeparation: 0.25, minCiLow: 0.65 } as const;

/** One labelled text. `source` groups an author piece with the imitations made from it. */
export interface QualifyItem {
  readonly text: string;
  readonly label: 'author' | 'model';
  readonly source: string;
  readonly topic?: string;
  /** which model wrote it; author texts have none */
  readonly generator?: string;
}

export type HoldOut = 'source' | 'topic' | 'generator';
export const HOLD_OUTS: readonly HoldOut[] = ['source', 'topic', 'generator'];

/**
 * A sensor under test. A `feature` sensor measures a text with nothing learned; a `trained` sensor is
 * trained inside each fold on that fold's training texts only, and returns the scorer for its test texts.
 * Either may return null for a text it cannot read; such texts are counted and left out.
 */
export type Sensor =
  | { readonly kind: 'feature'; readonly measure: (text: string) => number | null; readonly direction?: 'model-higher' | 'model-lower' }
  | { readonly kind: 'trained'; readonly train: (train: readonly QualifyItem[]) => (text: string) => number | null };

export interface AucCi { readonly auc: number; readonly ci95: readonly [number, number] }

export interface HeldOutResult {
  readonly holdOut: HoldOut;
  readonly folds: readonly {
    readonly held: string;
    readonly n: { readonly author: number; readonly model: number };
    /** oriented AUC in this fold, null when it lacks a label or could not be trained */
    readonly auc: number | null;
  }[];
  /** the oriented pooled AUC of every held-out score, with its interval; null when a label has no scores */
  readonly pooled: (AucCi & { readonly separation: number; readonly orientation: 'model-higher' | 'model-lower'; readonly n: { readonly author: number; readonly model: number } }) | null;
  /** texts the sensor returned null for, or whose fold could not be trained */
  readonly unscored: number;
  readonly passes: boolean;
  readonly why: string;
}

export interface QualifyResult {
  readonly results: readonly HeldOutResult[];
  readonly skipped: readonly { readonly holdOut: HoldOut; readonly why: string }[];
  readonly passes: boolean;
  readonly bars: typeof QUALIFY_BARS;
}

// ── Seeded resampling ──────────────────────────────────────────────────────────────────────────

/** mulberry32: a small, fast, seeded generator of uniform numbers in [0, 1). Deterministic per seed. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** P(a positive score > a negative score), ties counted half. Rank-based, so a bootstrap stays cheap. */
export function aucRaw(pos: readonly number[], neg: readonly number[]): number {
  const all = [...pos.map((v) => ({ v, p: 1 })), ...neg.map((v) => ({ v, p: 0 }))].sort((a, b) => a.v - b.v);
  let rankSum = 0;
  for (let i = 0; i < all.length;) {
    let j = i; while (j < all.length && all[j].v === all[i].v) j++;
    const mid = (i + 1 + j) / 2;                       // average rank of the tied run
    for (let k = i; k < j; k++) if (all[k].p) rankSum += mid;
    i = j;
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

const r4 = (x: number): number => Math.round(x * 10000) / 10000;

/**
 * AUC of `pos` over `neg` with a 95% percentile interval from a stratified bootstrap: each resample draws
 * `pos` and `neg` with replacement within themselves. Deterministic for a seed. Throws on an empty side.
 */
export function aucWithCi(pos: readonly number[], neg: readonly number[], opts: { resamples?: number; seed?: number } = {}): AucCi {
  if (!pos.length || !neg.length) throw new Error(`aucWithCi needs scores on both sides (pos ${pos.length}, neg ${neg.length})`);
  const resamples = opts.resamples ?? 2000; const rnd = mulberry32(opts.seed ?? 1);
  const boots: number[] = [];
  for (let i = 0; i < resamples; i++) boots.push(aucRaw(drawWithReplacement(pos, rnd), drawWithReplacement(neg, rnd)));
  boots.sort((a, b) => a - b);
  const at = (q: number): number => boots[Math.min(boots.length - 1, Math.max(0, Math.floor(q * boots.length)))];
  const auc = aucRaw(pos, neg);
  // A percentile interval can, on a tiny or tied sample, sit just beside its own point; it is widened to hold it.
  return { auc: r4(auc), ci95: resamples ? [r4(Math.min(at(0.025), auc)), r4(Math.max(at(0.975), auc))] : [r4(auc), r4(auc)] };
}

/**
 * HOW MUCH ONE SCORING TELLS TWO GROUPS APART BETTER THAN ANOTHER, ON THE SAME TEXTS. `a` and `b` score the same
 * texts, in the same order, two ways; the difference is AUC(b) − AUC(a). The bootstrap draws texts, not scores,
 * within each stratum and side, so a text keeps both its scores and the pairing is kept. Deterministic for a seed.
 */
export function aucDifferenceWithCi(strata: readonly { readonly pos: readonly (readonly [number, number])[]; readonly neg: readonly (readonly [number, number])[] }[],
  opts: { resamples?: number; seed?: number } = {}): { a: number; b: number; diff: number; ci95: readonly [number, number] } {
  if (!strata.length || strata.some((s) => !s.pos.length || !s.neg.length)) throw new Error('aucDifferenceWithCi needs texts on both sides of every stratum');
  const pooled = (ss: readonly { pos: readonly (readonly [number, number])[]; neg: readonly (readonly [number, number])[] }[], k: 0 | 1): number =>
    aucRaw(ss.flatMap((s) => s.pos.map((x) => x[k])), ss.flatMap((s) => s.neg.map((x) => x[k])));
  const a = pooled(strata, 0); const b = pooled(strata, 1);
  const resamples = opts.resamples ?? 2000; const rnd = mulberry32(opts.seed ?? 1);
  const boots: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const drawn = strata.map((s) => ({ pos: drawWithReplacement(s.pos, rnd), neg: drawWithReplacement(s.neg, rnd) }));
    boots.push(pooled(drawn, 1) - pooled(drawn, 0));
  }
  boots.sort((x, y) => x - y);
  const at = (q: number): number => boots[Math.min(boots.length - 1, Math.max(0, Math.floor(q * boots.length)))];
  const diff = b - a;
  return { a: r4(a), b: r4(b), diff: r4(diff), ci95: resamples ? [r4(Math.min(at(0.025), diff)), r4(Math.max(at(0.975), diff))] : [r4(diff), r4(diff)] };
}

// ── Folds ──────────────────────────────────────────────────────────────────────────────────────

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The value of an item on a hold-out key. A missing topic is its own value, '(none)'. */
function keyOf(it: QualifyItem, h: HoldOut): string | undefined {
  return h === 'source' ? it.source : h === 'topic' ? (it.topic ?? '(none)') : it.generator;
}

/**
 * The folds of one hold-out: a fold name and the indices of its test items. For `generator`, author items
 * are dealt into the generator folds by source, round-robin over sorted names (see the header).
 */
export function holdOutFolds(items: readonly QualifyItem[], h: HoldOut): { held: string; test: number[] }[] {
  if (h !== 'generator') {
    const values = [...new Set(items.map((it) => keyOf(it, h) ?? ''))].sort(byName);
    return values.map((v) => ({ held: v, test: items.flatMap((it, i) => ((keyOf(it, h) ?? '') === v ? [i] : [])) }));
  }
  const gens = [...new Set(items.filter((it) => it.label === 'model').map((it) => it.generator ?? '(unnamed)'))].sort(byName);
  const authorSources = [...new Set(items.filter((it) => it.label === 'author').map((it) => it.source))].sort(byName);
  const foldOfSource = new Map(authorSources.map((s, i) => [s, i % Math.max(1, gens.length)]));
  return gens.map((g, f) => ({
    held: g,
    test: items.flatMap((it, i) => (it.label === 'model' ? ((it.generator ?? '(unnamed)') === g ? [i] : []) : foldOfSource.get(it.source) === f ? [i] : [])),
  }));
}

/** How many distinct values a hold-out has in these items (generators count model items only). */
function distinct(items: readonly QualifyItem[], h: HoldOut): number {
  return h === 'generator' ? holdOutFolds(items, h).length : new Set(items.map((it) => keyOf(it, h))).size;
}

/**
 * Leave-one-group-out over a hold-out key. Every item is scored once, by a sensor that (if trained) never
 * saw its group; the scores are pooled into one oriented AUC with a bootstrap interval and held to
 * QUALIFY_BARS.
 */
export function heldOutAuc(items: readonly QualifyItem[], sensor: Sensor, holdOut: HoldOut, opts: { resamples?: number; seed?: number } = {}): HeldOutResult {
  const folds = holdOutFolds(items, holdOut);
  const scores = new Array<number | null>(items.length).fill(null);
  const trainable = new Set<number>();
  for (const [f, fold] of folds.entries()) {
    const inTest = new Set(fold.test);
    if (sensor.kind === 'feature') { for (const i of fold.test) scores[i] = sensor.measure(items[i].text); trainable.add(f); continue; }
    const train = items.filter((_, i) => !inTest.has(i));
    if (!train.some((it) => it.label === 'author') || !train.some((it) => it.label === 'model')) continue;
    const scorer = trainOrNull(sensor.train, train);   // a fold that cannot be trained leaves its texts unscored
    if (!scorer) continue;
    trainable.add(f);
    for (const i of fold.test) scores[i] = scorer(items[i].text);
  }
  const sides = (idx: readonly number[]): { pos: number[]; neg: number[] } => {
    const pos: number[] = []; const neg: number[] = [];
    for (const i of idx) {
      const v = scores[i];
      if (v === null || !Number.isFinite(v)) continue;
      (items[i].label === 'model' ? pos : neg).push(v);
    }
    return { pos, neg };
  };
  const all = sides(items.map((_, i) => i));
  const unscored = items.length - all.pos.length - all.neg.length;
  if (!all.pos.length || !all.neg.length) {
    return { holdOut, folds: folds.map((f) => ({ held: f.held, n: countOf(items, f.test), auc: null })), pooled: null, unscored, passes: false, why: 'no held-out scores on one side; nothing to measure' };
  }
  const raw = aucWithCi(all.pos, all.neg, opts);
  const flip = sensor.kind === 'feature' && (sensor.direction ? sensor.direction === 'model-lower' : raw.auc < 0.5);
  const orient = (a: number): number => r4(flip ? 1 - a : a);
  const orientation: 'model-higher' | 'model-lower' = flip ? 'model-lower' : 'model-higher';
  const ci95: readonly [number, number] = flip ? [orient(raw.ci95[1]), orient(raw.ci95[0])] : [raw.ci95[0], raw.ci95[1]];
  const pooled = {
    auc: orient(raw.auc),
    ci95,
    separation: r4(Math.abs(raw.auc - 0.5)),
    orientation,
    n: { author: all.neg.length, model: all.pos.length },
  };
  const foldRows = folds.map((f, k) => {
    const s = sides(f.test);
    return { held: f.held, n: countOf(items, f.test), auc: trainable.has(k) && s.pos.length && s.neg.length ? orient(aucRaw(s.pos, s.neg)) : null };
  });
  const sepOk = pooled.separation >= QUALIFY_BARS.minSeparation;
  const ciOk = pooled.ci95[0] >= QUALIFY_BARS.minCiLow;
  const passes = sepOk && ciOk && pooled.auc > 0.5;
  const why = passes
    ? `holds with ${holdOut}s held out: AUC ${pooled.auc} (95% CI ${pooled.ci95[0]} to ${pooled.ci95[1]})`
    : `does not hold with ${holdOut}s held out: AUC ${pooled.auc} (95% CI ${pooled.ci95[0]} to ${pooled.ci95[1]}); `
      + `needs separation >= ${QUALIFY_BARS.minSeparation} and a lower bound >= ${QUALIFY_BARS.minCiLow}`;
  return { holdOut, folds: foldRows, pooled, unscored, passes, why };
}

function trainOrNull(train: (t: readonly QualifyItem[]) => (text: string) => number | null, items: readonly QualifyItem[]): ((text: string) => number | null) | null {
  try { return train(items); } catch { return null; }
}

function countOf(items: readonly QualifyItem[], idx: readonly number[]): { author: number; model: number } {
  const model = idx.filter((i) => items[i].label === 'model').length;
  return { author: idx.length - model, model };
}

/** Whether an item carries a real topic label: present, not blank, and not the placeholder for a missing one. */
export const hasTopic = (it: QualifyItem): boolean => typeof it.topic === 'string' && it.topic.trim() !== '' && it.topic !== '(none)';

/**
 * Run every hold-out the data supports. One with fewer than 2 distinct values is skipped with the reason.
 * Qualifies only when at least one hold-out ran and every one that ran passes.
 *
 * `requireTopics`: the topic hold-out asks whether a sensor reads style or subject, and a text without a
 * real topic label makes it measure something else (a missing topic is its own value, '(none)', which then
 * groups every unlabelled text together). With it set, the topic hold-out runs only when every item has a
 * real topic; otherwise it is NOT RUN (missing labels), and a sensor whose topic hold-out did not run
 * cannot qualify.
 */
export function qualifyAll(items: readonly QualifyItem[], sensor: Sensor, opts: { resamples?: number; seed?: number; requireTopics?: boolean } = {}): QualifyResult {
  const results: HeldOutResult[] = []; const skipped: { holdOut: HoldOut; why: string }[] = [];
  let topicMissing = false;
  for (const h of HOLD_OUTS) {
    if (h === 'topic' && opts.requireTopics) {
      const unlabelled = items.filter((it) => !hasTopic(it)).length;
      if (unlabelled) {
        topicMissing = true;
        skipped.push({ holdOut: h, why: `NOT RUN (missing labels): ${unlabelled} of ${items.length} text(s) have no topic label` });
        continue;
      }
    }
    const n = distinct(items, h);
    if (n < 2) {
      if (h === 'topic' && opts.requireTopics) topicMissing = true;
      skipped.push({ holdOut: h, why: `only ${n} distinct ${h}${n === 1 ? '' : 's'}; a hold-out needs at least 2` });
      continue;
    }
    results.push(heldOutAuc(items, sensor, h, opts));
  }
  return { results, skipped, passes: !topicMissing && results.length > 0 && results.every((r) => r.passes), bars: QUALIFY_BARS };
}

/**
 * The stylometric detector as a trained sensor: inside each fold it is trained on that fold's author and
 * model texts (grouped by source for its own calibration) and scores with its raw logit.
 */
export function detectorSensor(opts: DetectorOptions = {}): Sensor {
  return {
    kind: 'trained',
    train: (train) => {
      const pieces = (l: QualifyItem['label']): { text: string; group: string }[] => train.filter((it) => it.label === l).map((it) => ({ text: it.text, group: it.source }));
      const m = trainDetector(pieces('author'), pieces('model'), opts);
      return (text) => scoreDetector(m, text)?.logit ?? null;
    },
  };
}

/** A short hash of the items a result was measured on, for the record. */
export function itemsHash(items: readonly QualifyItem[]): string {
  const body = JSON.stringify(items.map((it) => [it.label, it.source, it.topic ?? null, it.generator ?? null, it.text]));
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
