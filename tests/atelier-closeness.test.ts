// tests/atelier-closeness.test.ts — CLOSENESS TO AN AUTHOR, MEASURED AS A DISTRIBUTION, BOTH WAYS.
//
// Each instrument is tried on a case it must call close and a case it must call far: the shrunk covariance
// stays invertible with fewer pieces than features, the conformal p-value of an author's own piece is high
// and a model's wall of text low, a classifier cannot tell two draws of one distribution apart and always
// tells two separable ones, a kernel test agrees, and the Vendi score counts distinct texts.
import { describe, it, expect } from 'vitest';
import { shrunkCovariance, invert, mahalanobis, vendi, mmdTest, colMeans } from '../core/stats/multivariate.js';
import { calibrateTypicality, typicalityOf, standardise } from '../core/fidelity/typicality.js';
import { c2st, closeness } from '../core/fidelity/twosample.js';
import { mulberry32 } from '../core/fidelity/qualify.js';
import { valuesOf } from '../core/fidelity/profile.js';

const SENTENCES = [
  'We shipped the change on a Tuesday.', 'Nobody noticed for a week.', "Then the support queue doubled, and it didn't stop.",
  'The cause was a cache that never expired.', "We'd read the docs and still missed it.", 'The fix took an hour.',
  'Finding it took four days.', 'I keep a list of these now.', "Most of it is boring on purpose.", 'Boring is what lets you sleep.',
  'The team argued about the rollback.', 'We kept the flag and moved on.', "It was the right call, mostly.", 'The graph went flat by Friday.',
];
const sentence = (i: number): string => SENTENCES[i % SENTENCES.length];
/** The author: short paragraphs of uneven length. */
const authorPiece = (k: number): string => Array.from({ length: 30 + (k % 5) * 3 }, (_, p) =>
  Array.from({ length: 1 + ((p * 3 + k) % 3) }, (_, s) => sentence(k * 7 + p * 3 + s)).join(' ')).join('\n\n');
/** The model: the same sentences as one wall, with the contractions spelled out. */
const modelDraft = (k: number): string => Array.from({ length: 70 }, (_, s) => sentence(k * 5 + s)).join(' ')
  .replace(/didn't/g, 'did not').replace(/We'd/g, 'We had');

const gaussianRows = (n: number, d: number, shift: number, seed: number): number[][] => {
  const r = mulberry32(seed);
  const g = (): number => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: n }, () => Array.from({ length: d }, () => g() + shift));
};

describe('the matrix tools', () => {
  it('the shrunk covariance inverts with fewer pieces than features, and a point at the mean is at distance 0', () => {
    const rows = gaussianRows(8, 20, 0, 1);
    const { cov, shrinkage } = shrunkCovariance(rows);
    expect(shrinkage).toBeGreaterThan(0);
    const p = invert(cov);
    expect(mahalanobis(colMeans(rows), colMeans(rows), p)).toBeCloseTo(0, 9);
    expect(mahalanobis(rows[0].map((v) => v + 10), colMeans(rows), p)).toBeGreaterThan(mahalanobis(rows[0], colMeans(rows), p));
  });
  it('Vendi counts distinct texts: copies count once, far-apart ones count each', () => {
    expect(vendi(Array.from({ length: 5 }, () => [1, 2, 3]))).toBeCloseTo(1, 6);
    expect(vendi([[0, 0], [100, 0], [0, 100], [100, 100]], 1)).toBeCloseTo(4, 3);
  });
  it('the kernel test finds no difference within one distribution, and finds a shifted one', () => {
    expect(mmdTest(gaussianRows(20, 4, 0, 2), gaussianRows(20, 4, 0, 3), mulberry32(1), 200).p).toBeGreaterThan(0.05);
    expect(mmdTest(gaussianRows(20, 4, 0, 4), gaussianRows(20, 4, 2, 5), mulberry32(1), 200).p).toBeLessThan(0.05);
  });
});

describe('the classifier two-sample test', () => {
  it('cannot tell two draws of one distribution apart, and always tells separable ones', () => {
    const same = c2st(gaussianRows(30, 5, 0, 6), gaussianRows(30, 5, 0, 7));
    expect(same?.ci95[0]).toBeLessThan(0.5);
    expect(same?.ci95[1]).toBeGreaterThan(0.5);
    expect(c2st(gaussianRows(30, 5, 0, 8), gaussianRows(30, 5, 3, 9))?.auc).toBeGreaterThan(0.95);
  });
  it('is not run on too few texts', () => {
    expect(c2st(gaussianRows(3, 5, 0, 1), gaussianRows(30, 5, 0, 2))).toBeNull();
    expect(closeness(gaussianRows(3, 5, 0, 1), gaussianRows(3, 5, 0, 2)).vendi).toBeNull();
  });
});

describe('typicality, conformal', () => {
  const pieces = Array.from({ length: 12 }, (_, k) => authorPiece(k));
  // The features that would steer for this author: how paragraphs run and how the author contracts.
  const steering = ['paragraphP50', 'paragraphP90', 'sentencesPerParagraph', 'oneSentenceParagraph', 'paragraphSpread', 'thatsContraction', 'negation'];
  const cal = calibrateTypicality(pieces, steering);
  it('calibrates on the author, and refuses too few pieces', () => {
    expect(cal).not.toBeNull();
    expect(calibrateTypicality(pieces.slice(0, 4), steering)).toBeNull();
    expect(cal?.features.every((f) => steering.includes(f))).toBe(true);
  });
  it('a new piece by the author is typical; a model wall of text is not', () => {
    const own = typicalityOf(authorPiece(20), cal!);
    const wall = typicalityOf(modelDraft(3), cal!);
    expect(own.p).toBeGreaterThan(wall.p);
    expect(wall.p).toBeLessThanOrEqual(1 / 13 + 1e-9);
  });
  it('the two-sample readings tell the model\'s drafts from the author\'s pieces', () => {
    const outputs = Array.from({ length: 8 }, (_, k) => standardise(valuesOf(modelDraft(k)), cal!.features, cal!.center, cal!.scale));
    expect(closeness(cal!.vectors, outputs).c2st?.auc).toBeGreaterThan(0.9);
  });
});
