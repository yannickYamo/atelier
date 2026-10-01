// atelier/core/fidelity/stylometry.ts — A DETECTOR THAT TELLS THE AUTHOR'S PIECES FROM MODEL IMITATIONS.
//
// WHY FUNCTION WORDS AND CHARACTER TRIGRAMS. Topic words say what a piece is about; function words and
// short character runs say how it is written, and a writer does not choose them on purpose. An imitation
// can copy the subject and the surface moves of an author and still lean on "than", "that's", "isn't" and
// "because" at a rate the author never does. Those rates are what this reads: a fixed list of English
// function words and contractions per 1,000 prose words, and the K most frequent character trigrams of
// the TRAINING texts per 1,000 prose characters. Code fences, front matter, tables and headings are not
// prose (../observers/text.ts) and are never counted.
//
// WHY THE TRIGRAMS COME FROM TRAINING TEXTS ONLY. A feature list chosen with the text being scored in
// view has seen that text. The list is fixed at training time and stored with the model, so a trigram
// that appears only in a scored text is not a feature and cannot move its score. Inside cross-validation
// the list is re-chosen from each fold's training texts for the same reason.
//
// WHY A PLAIN LOGISTIC REGRESSION. It is small, its weights can be read ("imitations overuse ..."), and
// fitted by full-batch gradient descent from zero with a fixed number of steps it is deterministic: the
// same pieces give the same weights and the same version hash on every machine that runs this Node. No
// Math.random anywhere. Features are standardised by the training mean and standard deviation (with a
// floor, so a feature that never varied cannot divide by zero), L2 regularised, and each class is weighted
// to half the loss so a lopsided corpus does not just learn the base rate.
//
// WHY PLATT SCALING ON HELD-OUT FOLDS. A raw logit is a score, not a probability, and a logit read on the
// texts it was fitted to is overconfident. The calibration is fitted on OUT-OF-FOLD logits from grouped
// k-fold: a group is a source (an author piece and the imitations made from it share one), and a group
// sits in one fold only, so no source is in training and test at once. The same out-of-fold logits give
// `cvAuc`. With fewer than 2 groups or 4 texts per class there is nothing honest to fold, and `cvAuc` is
// null and the calibration is the identity.
//
// WHAT IT IS FOR. A MONITOR (./types.ts): recorded with every output and estimated across outputs. It is
// not a rule and must clear ./qualify.ts before it may steer anything.

import { createHash } from 'node:crypto';
import { proseRegions, wordsOf } from '../observers/text.js';
import { aucOf } from '../observers/selection.js';
import type { DetectorModel } from './types.js';

/** One training text. `group` is its source: texts sharing a group are never split across train and test. */
export interface Piece { readonly text: string; readonly group?: string }

export interface DetectorOptions {
  /** character trigrams kept, the most frequent in the training texts (default 300) */
  readonly trigrams?: number;
  /** L2 penalty on the standardised weights (default 0.1) */
  readonly lambda?: number;
  /** gradient-descent steps (default 300) */
  readonly iterations?: number;
  /** most folds for the calibration (default 5) */
  readonly folds?: number;
}

/** Below this many prose words a text is too short to read: it is left out of training and scores null. */
export const MIN_PROSE_WORDS = 100;

const DEFAULTS = { trigrams: 300, lambda: 0.1, iterations: 300, folds: 5 } as const;

/** Standard deviations below this are raised to it: a feature that barely varied must not explode. */
const SD_FLOOR = 1e-3;

/**
 * English function words and contractions. Fixed, so a model trained on one corpus and a model trained on
 * another read the same words. Lowercase, straight apostrophes.
 */
export const FUNCTION_WORDS: readonly string[] = [
  'a', 'about', 'above', 'actually', 'after', 'again', 'against', 'all', 'almost', 'also', 'although', 'always',
  'am', 'among', 'an', 'and', 'another', 'any', 'are', "aren't", 'around', 'as', 'at', 'be', 'because', 'been',
  'before', 'being', 'between', 'both', 'but', 'by', 'can', "can't", 'could', "couldn't", 'did', "didn't", 'do',
  'does', "doesn't", "don't", 'down', 'during', 'each', 'either', 'enough', 'even', 'ever', 'every', 'few', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'here', "here's", 'him', 'his', 'how', 'however', 'i', "i'm", "i've",
  "i'd", 'if', 'in', 'indeed', 'instead', 'into', 'is', "isn't", 'it', "it's", 'its', 'just', 'less', 'let',
  "let's", 'like', 'many', 'may', 'maybe', 'me', 'might', 'more', 'most', 'much', 'must', 'my', 'never', 'no',
  'nor', 'not', 'nothing', 'now', 'of', 'off', 'often', 'on', 'once', 'one', 'only', 'or', 'other', 'our', 'out',
  'over', 'perhaps', 'quite', 'rather', 'really', 'same', 'she', 'should', 'simply', 'since', 'so', 'some',
  'something', 'still', 'such', 'than', 'that', "that's", 'the', 'their', 'them', 'then', 'there', "there's",
  'these', 'they', "they're", 'this', 'those', 'though', 'through', 'thus', 'to', 'too', 'under', 'until', 'up',
  'us', 'very', 'was', "wasn't", 'we', "we're", 'were', 'what', "what's", 'when', 'whether', 'which', 'while',
  'who', 'why', 'will', 'with', 'without', "won't", 'would', 'yet', 'you', "you're", 'your',
];

// ── Reading a text ─────────────────────────────────────────────────────────────────────────────

/** What a text contributes: its function-word and trigram counts and the totals they are rates of. */
interface Profile {
  readonly words: ReadonlyMap<string, number>;
  readonly nWords: number;
  readonly grams: ReadonlyMap<string, number>;
  readonly nChars: number;
}

const FUNCTION_SET = new Set(FUNCTION_WORDS);
const straight = (s: string): string => s.replace(/[’‘]/g, "'");

/** The prose of a text as one lowercased line, whitespace collapsed: what the trigrams are read from. */
export function proseLine(text: string): string {
  return straight(proseRegions(text).map((r) => r.text).join(' ')).toLowerCase().replace(/\s+/g, ' ').trim();
}

function profileOf(text: string): Profile {
  const line = proseLine(text);
  const tokens = wordsOf(line);
  const words = new Map<string, number>();
  for (const t of tokens) if (FUNCTION_SET.has(t)) words.set(t, (words.get(t) ?? 0) + 1);
  const grams = new Map<string, number>();
  for (let i = 0; i + 3 <= line.length; i++) { const g = line.slice(i, i + 3); grams.set(g, (grams.get(g) ?? 0) + 1); }
  return { words, nWords: tokens.length, grams, nChars: line.length };
}

/** The value of one named feature in a profile: a rate per 1,000 words (`w:`) or per 1,000 characters (`c:`). */
function featureValue(p: Profile, name: string): number {
  if (name.startsWith('w:')) return p.nWords ? ((p.words.get(name.slice(2)) ?? 0) * 1000) / p.nWords : 0;
  return p.nChars ? ((p.grams.get(name.slice(2)) ?? 0) * 1000) / p.nChars : 0;
}

/**
 * The feature list for a set of training profiles: every function word, then the `k` trigrams with the
 * highest total count across those profiles (ties broken alphabetically, so the list is deterministic).
 */
function chooseFeatures(train: readonly Profile[], k: number): string[] {
  const totals = new Map<string, number>();
  for (const p of train) for (const [g, n] of p.grams) totals.set(g, (totals.get(g) ?? 0) + n);
  const top = [...totals].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, k).map(([g]) => `c:${g}`);
  return [...FUNCTION_WORDS.map((w) => `w:${w}`), ...top];
}

// ── Fitting ────────────────────────────────────────────────────────────────────────────────────

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

interface Core { features: string[]; weights: number[]; bias: number; mean: number[]; sd: number[] }

/** Standardise, then fit an L2 logistic regression by full-batch gradient descent from zero. */
function fitCore(train: readonly Profile[], y: readonly number[], o: Required<DetectorOptions>): Core {
  const features = chooseFeatures(train, o.trigrams);
  const raw = train.map((p) => features.map((f) => featureValue(p, f)));
  const n = raw.length; const d = features.length;
  const mean = features.map((_, j) => raw.reduce((s, r) => s + r[j], 0) / n);
  const sd = features.map((_, j) => Math.max(SD_FLOOR, Math.sqrt(raw.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n)));
  const z = raw.map((r) => r.map((v, j) => (v - mean[j]) / sd[j]));
  // Each class carries half the loss, whatever its size.
  const pos = y.filter((v) => v === 1).length; const neg = n - pos;
  const c = y.map((v) => (v === 1 ? 0.5 / Math.max(1, pos) : 0.5 / Math.max(1, neg)));
  // A safe step: the loss's curvature is at most a quarter of the mean squared row norm, plus the penalty.
  const meanSq = z.reduce((s, r) => s + r.reduce((t, v) => t + v * v, 0), 0) / n;
  const lr = 1 / (0.25 * (meanSq + 1) + o.lambda);
  const w = new Array<number>(d).fill(0); let b = 0;
  const g = new Array<number>(d).fill(0);
  for (let it = 0; it < o.iterations; it++) {
    g.fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      const r = z[i];
      let s = b; for (let j = 0; j < d; j++) s += w[j] * r[j];
      const e = c[i] * (sigmoid(s) - y[i]);
      gb += e; for (let j = 0; j < d; j++) g[j] += e * r[j];
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] + o.lambda * w[j]);
    b -= lr * gb;
  }
  return { features, weights: w, bias: b, mean, sd };
}

function logitOf(m: Pick<DetectorModel, 'features' | 'weights' | 'bias' | 'mean' | 'sd'>, p: Profile): number {
  let s = m.bias;
  m.features.forEach((f, j) => { s += m.weights[j] * ((featureValue(p, f) - m.mean[j]) / m.sd[j]); });
  return s;
}

/**
 * Fold assignment by group: every text of one group gets the same fold, so a source is never in training
 * and test at once. Groups are ordered by their majority label and then by name, and dealt round-robin
 * into `k` folds, so each class's groups are spread across folds rather than piled into one.
 * Returns a fold index (0..k-1) per text.
 */
export function groupFolds(groups: readonly string[], labels: readonly number[], k: number): number[] {
  const share = new Map<string, { pos: number; n: number }>();
  groups.forEach((g, i) => { const s = share.get(g) ?? { pos: 0, n: 0 }; s.pos += labels[i] === 1 ? 1 : 0; s.n += 1; share.set(g, s); });
  const major = (g: string): number => { const s = share.get(g) ?? { pos: 0, n: 1 }; return s.pos * 2 >= s.n ? 1 : 0; };
  const order = [...share.keys()].sort((a, b) => major(a) - major(b) || (a < b ? -1 : a > b ? 1 : 0));
  const fold = new Map(order.map((g, i) => [g, i % Math.max(1, k)]));
  return groups.map((g) => fold.get(g) ?? 0);
}

/**
 * Platt scaling: the a, b that make sigmoid(a * logit + b) a calibrated probability, fitted by Newton's
 * method on smoothed targets (Platt's (N+ + 1) / (N+ + 2)), which keeps it finite on separable folds.
 */
export function fitPlatt(logits: readonly number[], labels: readonly number[]): { a: number; b: number } {
  const pos = labels.filter((v) => v === 1).length; const neg = labels.length - pos;
  if (!pos || !neg) return { a: 1, b: 0 };
  const hi = (pos + 1) / (pos + 2); const lo = 1 / (neg + 2);
  const t = labels.map((v) => (v === 1 ? hi : lo));
  let a = 0; let b = Math.log((pos + 1) / (neg + 1));
  for (let it = 0; it < 100; it++) {
    let ga = 0; let gb = 0; let haa = 1e-9; let hab = 0; let hbb = 1e-9;
    logits.forEach((s, i) => {
      const p = sigmoid(a * s + b); const e = p - t[i]; const v = p * (1 - p);
      ga += e * s; gb += e; haa += v * s * s; hab += v * s; hbb += v;
    });
    const det = haa * hbb - hab * hab;
    if (!(det > 0)) break;
    const da = (hbb * ga - hab * gb) / det; const db = (haa * gb - hab * ga) / det;
    a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : { a: 1, b: 0 };
}

/** The version of a model: a hash of everything that decides a score. */
export function detectorVersion(m: Pick<DetectorModel, 'features' | 'weights' | 'bias' | 'mean' | 'sd' | 'platt'>): string {
  const body = JSON.stringify({ features: m.features, weights: m.weights, bias: m.bias, mean: m.mean, sd: m.sd, platt: m.platt });
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/**
 * Train the detector on the author's pieces (label 0) against model imitations (label 1). Texts under
 * MIN_PROSE_WORDS prose words are left out. Deterministic: the same pieces and options give the same model
 * and the same `version`.
 */
export function trainDetector(author: readonly Piece[], model: readonly Piece[], opts: DetectorOptions = {}): DetectorModel {
  const o: Required<DetectorOptions> = { ...DEFAULTS, ...opts };
  const rows = [
    ...author.map((p, i) => ({ p, y: 0, g: p.group ?? `author#${i}` })),
    ...model.map((p, i) => ({ p, y: 1, g: p.group ?? `model#${i}` })),
  ].map((r) => ({ ...r, prof: profileOf(r.p.text) })).filter((r) => r.prof.nWords >= MIN_PROSE_WORDS);
  const nA = rows.filter((r) => r.y === 0).length; const nM = rows.length - nA;
  if (!nA || !nM) throw new Error(`trainDetector needs texts of both kinds with at least ${MIN_PROSE_WORDS} prose words (author ${nA}, model ${nM})`);
  const y = rows.map((r) => r.y);
  const core = fitCore(rows.map((r) => r.prof), y, o);

  // Out-of-fold logits, groups held out whole, for the calibration and the cross-validated AUC.
  const groupsOf = (label: number): number => new Set(rows.filter((r) => r.y === label).map((r) => r.g)).size;
  const foldable = groupsOf(0) >= 2 && groupsOf(1) >= 2 && nA >= 4 && nM >= 4;
  let platt = { a: 1, b: 0 }; let cvAuc: number | null = null;
  if (foldable) {
    const k = Math.min(o.folds, new Set(rows.map((r) => r.g)).size);
    const fold = groupFolds(rows.map((r) => r.g), y, k);
    const oof: { s: number; y: number }[] = [];
    for (let f = 0; f < k; f++) {
      const tr = rows.filter((_, i) => fold[i] !== f);
      const te = rows.filter((_, i) => fold[i] === f);
      // A training fold missing a class cannot be fitted; its test texts simply get no held-out logit.
      if (!te.length || !tr.some((r) => r.y === 0) || !tr.some((r) => r.y === 1)) continue;
      const m = fitCore(tr.map((r) => r.prof), tr.map((r) => r.y), o);
      for (const r of te) oof.push({ s: logitOf(m, r.prof), y: r.y });
    }
    const sPos = oof.filter((r) => r.y === 1).map((r) => r.s); const sNeg = oof.filter((r) => r.y === 0).map((r) => r.s);
    if (sPos.length && sNeg.length) {
      platt = fitPlatt(oof.map((r) => r.s), oof.map((r) => r.y));
      cvAuc = aucOf(sPos, sNeg);                 // P(model text's logit > author text's logit)
    }
  }
  const body = { ...core, platt };
  return { kind: 'stylometric-lr', version: detectorVersion(body), ...body, trainedOn: { author: nA, model: nM }, cvAuc };
}

/**
 * Score one text: the raw logit and the calibrated P(model-written). Null under MIN_PROSE_WORDS prose
 * words, where the rates are too noisy to read.
 */
export function scoreDetector(m: DetectorModel, text: string): { logit: number; p: number } | null {
  const prof = profileOf(text);
  if (prof.nWords < MIN_PROSE_WORDS) return null;
  const logit = logitOf(m, prof);
  return { logit, p: sigmoid(m.platt.a * logit + m.platt.b) };
}

/**
 * The `n` strongest features each way, on the standardised scale. `model` lists what imitations use more
 * than the author (positive weight), `author` what the author uses more; for a report such as
 * "imitations overuse than, that's, isn't".
 */
export function topWeights(m: DetectorModel, n: number): {
  model: { feature: string; weight: number }[];
  author: { feature: string; weight: number }[];
} {
  const all = m.features.map((feature, j) => ({ feature, weight: m.weights[j] }));
  const byName = (a: { feature: string }, b: { feature: string }): number => (a.feature < b.feature ? -1 : a.feature > b.feature ? 1 : 0);
  return {
    model: all.filter((x) => x.weight > 0).sort((a, b) => b.weight - a.weight || byName(a, b)).slice(0, n),
    author: all.filter((x) => x.weight < 0).sort((a, b) => a.weight - b.weight || byName(a, b)).slice(0, n),
  };
}
