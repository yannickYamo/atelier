// atelier/core/fidelity/twosample.ts — CAN THE OUTPUTS BE TOLD APART FROM THE AUTHOR'S PIECES?
//
// One text's typicality (./typicality.ts) says where it sits. Whether a skill writes like its author is a
// question about the whole run of its outputs against the whole set of the author's pieces, and it has a
// standard answer: a two-sample test. Three readings, each over the same standardised feature vectors:
//
//   C2ST    a classifier two-sample test (Lopez-Paz & Oquab, 2017). A ridge logistic regression is trained
//           to tell author pieces from outputs, with every text scored only by a model that never saw it
//           (k-fold). The AUC of those held-out scores is how distinguishable the two are: 0.5 means a
//           classifier cannot tell them apart; 1 means it always can. A study of AI fiction separated
//           human from model stories this way at 93% F1 on structure alone (arXiv 2604.03136).
//   MMD     the maximum mean discrepancy under a Gaussian kernel, with a permutation p-value: the same
//           question without a classifier.
//   Vendi   the effective number of distinct texts in each sample, at equal sample sizes. Model text
//           clusters; an author spreads. A run of outputs less varied than the author is detectable even
//           when each output is typical on its own.
//
// These are instruments of EVALUATION. Whatever steers drafts must be trained on other data, or the reading
// measures the steering (docs/decisions/0010-closeness-is-a-two-sample-test.md).

import { aucWithCi, mulberry32, type AucCi } from './qualify.js';
import { fitLogistic, logit, mmdTest, vendi, type Mat } from '../stats/multivariate.js';

export interface ClosenessReading {
  readonly author: number;
  readonly outputs: number;
  /** AUC of telling outputs from author pieces, held out; null when either side is too small */
  readonly c2st: AucCi | null;
  readonly mmd: { readonly mmd2: number; readonly p: number } | null;
  /** effective number of distinct texts in equal-size samples of each */
  readonly vendi: { readonly author: number; readonly outputs: number; readonly size: number } | null;
}

/** Fewer texts than this on either side and a test is not run: it could not reject anything. */
export const MIN_SAMPLE = 6;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Held-out classifier scores for every text, k folds stratified by label. Positive = an output. */
export function c2st(author: Mat, outputs: Mat, opts: { folds?: number; seed?: number } = {}): AucCi | null {
  if (author.length < MIN_SAMPLE || outputs.length < MIN_SAMPLE) return null;
  const k = Math.min(opts.folds ?? 5, author.length, outputs.length);
  const rand = mulberry32(opts.seed ?? 1);
  const deal = (n: number): number[] => {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const fold = new Array<number>(n);
    idx.forEach((i, r) => { fold[i] = r % k; });
    return fold;
  };
  const fa = deal(author.length); const fo = deal(outputs.length);
  const scoreA = new Array<number>(author.length); const scoreO = new Array<number>(outputs.length);
  for (let f = 0; f < k; f++) {
    const rows = [...author.filter((_, i) => fa[i] !== f), ...outputs.filter((_, i) => fo[i] !== f)];
    const labels = [...author.filter((_, i) => fa[i] !== f).map(() => 0), ...outputs.filter((_, i) => fo[i] !== f).map(() => 1)];
    const m = fitLogistic(rows, labels);
    author.forEach((x, i) => { if (fa[i] === f) scoreA[i] = logit(m, x); });
    outputs.forEach((x, i) => { if (fo[i] === f) scoreO[i] = logit(m, x); });
  }
  return aucWithCi(scoreO, scoreA, { seed: opts.seed ?? 1, resamples: 1000 });
}

/** Vendi of each sample at a common size, averaged over seeded subsamples so the larger side gains nothing from its size. */
export function vendiAtEqualSize(author: Mat, outputs: Mat, seed = 1, draws = 20): ClosenessReading['vendi'] {
  const size = Math.min(author.length, outputs.length);
  if (size < MIN_SAMPLE) return null;
  const rand = mulberry32(seed);
  const sub = (rows: Mat): Mat => {
    const idx = rows.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, size).map((i) => rows[i]);
  };
  let a = 0; let o = 0;
  for (let t = 0; t < draws; t++) { a += vendi(sub(author)); o += vendi(sub(outputs)); }
  return { author: r3(a / draws), outputs: r3(o / draws), size };
}

/** The three readings at once. */
export function closeness(author: Mat, outputs: Mat, seed = 1): ClosenessReading {
  const enough = author.length >= MIN_SAMPLE && outputs.length >= MIN_SAMPLE;
  const m = enough ? mmdTest(author, outputs, mulberry32(seed)) : null;
  return { author: author.length, outputs: outputs.length, c2st: c2st(author, outputs, { seed }),
    mmd: m ? { mmd2: r3(m.mmd2), p: r3(m.p) } : null, vendi: vendiAtEqualSize(author, outputs, seed) };
}
