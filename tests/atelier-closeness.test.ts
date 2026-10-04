// tests/atelier-closeness.test.ts — CLOSENESS TO AN AUTHOR, MEASURED AS A DISTRIBUTION, BOTH WAYS.
//
// Each instrument is tried on a case it must call close and a case it must call far: the shrunk covariance
// stays invertible with fewer pieces than features, the conformal p-value of an author's own piece is high
// and a model's wall of text low, a classifier cannot tell two draws of one distribution apart and always
// tells two separable ones, a kernel test agrees, and the Vendi score counts distinct texts.
import { describe, it, expect } from 'vitest';
import { shrunkCovariance, invert, mahalanobis, vendi, mmdTest, colMeans } from '../core/stats/multivariate.js';
import { calibrateTypicality, calibrateFromValues, restrictCalibration, typicalityOf, typicalityOfValues, standardise } from '../core/fidelity/typicality.js';
import { c2st, closeness, vendiAtEqualSize } from '../core/fidelity/twosample.js';
import { mulberry32 } from '../core/fidelity/qualify.js';
import { valuesOf } from '../core/fidelity/profile.js';
import { densityRatio, drawIndex, seedOf } from '../core/fidelity/sampling.js';

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
    const own = typicalityOf(authorPiece(20), cal!)!;
    const wall = typicalityOf(modelDraft(3), cal!)!;
    expect(own.p).toBeGreaterThan(wall.p);
    expect(wall.p).toBeLessThanOrEqual(1 / 13 + 1e-9);
  });
  it('the two-sample readings tell the model\'s drafts from the author\'s pieces', () => {
    const outputs = Array.from({ length: 8 }, (_, k) => standardise(valuesOf(modelDraft(k)), cal!.features, cal!.center, cal!.scale));
    expect(closeness(cal!.vectors, outputs).c2st?.auc).toBeGreaterThan(0.9);
  });
});

describe('drawing among tied drafts by density ratio', () => {
  it('draws each index in proportion to its weight, over many seeds', () => {
    const w = [1, 3, 6]; const counts = [0, 0, 0];
    for (let s = 0; s < 6000; s++) counts[drawIndex(w, s * 2654435761)] += 1;
    expect(counts[0] / 6000).toBeCloseTo(0.1, 1);
    expect(counts[2] / 6000).toBeCloseTo(0.6, 1);
  });
  it('the ratio is P(author)/P(model), clipped, and a seed is fixed by the drafts', () => {
    expect(densityRatio(0.5)).toBeCloseTo(1, 9);
    expect(densityRatio(0.2)).toBeCloseTo(4, 9);
    expect(densityRatio(1)).toBe(0.01);
    expect(seedOf(['a', 'b'])).toBe(seedOf(['a', 'b']));
    expect(seedOf(['a', 'b'])).not.toBe(seedOf(['b', 'a']));
  });
});

describe('found by the gap analysis', () => {
  it('Vendi sees a tight cluster: outputs shrunk toward one point read as less varied than the author', () => {
    const author = gaussianRows(20, 5, 0, 11);
    const tight = gaussianRows(20, 5, 0, 12).map((r) => r.map((v) => v * 0.05));
    const v = vendiAtEqualSize(author, tight)!;
    expect(v.outputs).toBeLessThan(v.author);
  });
  it('the conformal p-value is valid under exchangeable draws: at most about 10% of new texts fall at or below 0.1', () => {
    const r = mulberry32(7);
    const g = (): number => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    const row = (): Record<string, number> => Object.fromEntries(['a', 'b', 'c', 'd'].map((k) => [k, Math.exp(g() * 0.5)]));
    let low = 0; const trials = 150;
    for (let t = 0; t < trials; t++) {
      const cal = calibrateFromValues(Array.from({ length: 15 }, row))!;
      if (typicalityOfValues(row(), cal)!.p <= 0.1) low += 1;
    }
    expect(low / trials).toBeLessThan(0.15);
  });
  it('a text that measures too few of the features gets no reading, not "100% typical"', () => {
    const cal = calibrateTypicality(Array.from({ length: 12 }, (_, k) => authorPiece(k)), ['paragraphP50', 'paragraphP90', 'sentencesPerParagraph', 'paragraphSpread'])!;
    expect(typicalityOf('Yes.', cal)).toBeNull();
  });
  it('a calibration restricted to the ratified features keeps only those, recomputed from the stored vectors', () => {
    const cal = calibrateTypicality(Array.from({ length: 12 }, (_, k) => authorPiece(k)), ['paragraphP50', 'paragraphP90', 'sentencesPerParagraph', 'paragraphSpread'])!;
    const fewer = restrictCalibration(cal, ['paragraphP50', 'paragraphSpread'])!;
    expect(fewer.features).toEqual(['paragraphP50', 'paragraphSpread']);
    expect(fewer.scores).toHaveLength(12);
    expect(restrictCalibration(cal, cal.features)).toBe(cal);
  });
});
