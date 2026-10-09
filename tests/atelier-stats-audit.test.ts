// tests/atelier-stats-audit.test.ts — THE STATISTICS HOLD AT EVERY SIZE THEY CAN BE ASKED FOR.
//
// The exact binomial tail started from (1 - p)^n, which is zero to a computer once n is large: from n = 90 an exact
// interval came back as {1, 1} with no error, and a paired test on a thousand pairs returned p = 0. The reference
// values below are scipy's (beta.ppf for the interval, binom for the tails), computed apart from this code.
import { describe, it, expect } from 'vitest';
import { clopperPearson, mcnemarExactP, binomialUpperTailP, signTestOneSidedP } from '../core/stats/sign-test.js';
import { mcnemarExactP as referenceArmP } from '../core/reference/reference-test.js';
import { dominates, finalists, paretoFront } from '../core/optimizer/pareto.js';
import { moveEvidence } from '../core/compiler/applicability.js';
import { rule } from '../core/evolve/loop.js';
import { rhythmSignature } from '../core/observers/rhythm-signature.js';

describe('the exact interval at the sizes a study is run at', () => {
  const cases: [number, number, number, number][] = [
    [89, 90, 0.9396, 0.99972], [147, 150, 0.9427, 0.9959], [180, 180, 0.9797, 1], [245, 250, 0.954, 0.993],
    [360, 400, 0.866, 0.928], [323, 538, 0.558, 0.642], [1, 2000, 0.0000127, 0.00278], [39, 48, 0.674, 0.911],
  ];
  for (const [k, n, lo, hi] of cases) {
    it(`${k} of ${n}`, () => {
      const got = clopperPearson(k, n);
      expect(got.lo).toBeCloseTo(lo, lo < 0.001 ? 6 : 3);
      expect(got.hi).toBeCloseTo(hi, hi < 0.01 ? 4 : 3);
    });
  }
});

describe('the exact tails at large n, and at the ends of p', () => {
  it('a paired test on a thousand pairs that split evenly is not significant', () => {
    expect(mcnemarExactP(540, 535)).toBeCloseTo(0.903, 2);
    expect(referenceArmP(540, 535)).toBeCloseTo(0.903, 2);
    expect(referenceArmP(600, 500)).toBeCloseTo(0.0028, 3);
  });
  it('an upper tail at a high chance rate, and at certainty', () => {
    expect(binomialUpperTailP(300, 330, 0.9)).toBeCloseTo(0.330, 2);
    expect(binomialUpperTailP(5, 10, 1)).toBe(1);
    expect(binomialUpperTailP(0, 10, 0)).toBe(1);
    expect(binomialUpperTailP(1, 10, 0)).toBe(0);
  });
  it('and the small sizes read as they always did', () => {
    expect(mcnemarExactP(18, 7)).toBeCloseTo(0.0433, 4);
    expect(signTestOneSidedP(9, 10)).toBeCloseTo(0.0107, 4);
  });
});

describe('a screen that allows for noise does not lose every candidate to a cycle', () => {
  const a = { x: 3, y: 2.4, z: 1.5 }; const b = { x: 1.5, y: 3, z: 2.4 }; const c = { x: 2.4, y: 1.5, z: 3 };
  it('three candidates that each beat the next on one rule are all kept, and all go on against a champion they beat', () => {
    expect(paretoFront([a, b, c], (s) => s)).toHaveLength(3);
    expect(finalists([a, b, c], (s) => s, { x: 0, y: 0, z: 0 }, 3, 1)).toHaveLength(3);
  });
  it('a rule one side could not be scored on decides nothing', () => {
    expect(dominates({ x: 1, y: 5 }, { x: NaN, y: 1 })).toBe(true);
    expect(dominates({ x: NaN, y: 1 }, { x: 1, y: 1 })).toBe(false);
    // a champion that has no score on a rule can be beaten on the rules it has
    expect(finalists([{ x: 2, y: 5 }], (s) => s, { x: NaN, y: 1 }, 1)).toHaveLength(1);
  });
});

describe('a threshold is compared with the number, not with the number rounded for the screen', () => {
  it('11 of 23 has a lower bound of 0.296, which is under 0.3', () => {
    expect(moveEvidence({ present: 11, applicable: 23 }, 23, { general: true, answers: true })).toMatchObject({ carrier: 'exemplar', presentBound: 0.3 });
    expect(moveEvidence({ present: 12, applicable: 23 }, 23, { general: true, answers: true }).carrier).not.toBe('exemplar');
  });
});

describe('a change that costs exactly what its gain buys is bought', () => {
  it('two of six gained allows 110% more, and 110% more is kept', () => {
    expect(rule({ ok: 6, n: 6, costUsd: 2.1, missing: {} }, 4, 1, 1, 'MORE_DRAFTS').keep).toBe(true);
    expect(rule({ ok: 6, n: 6, costUsd: 2.2, missing: {} }, 4, 1, 1, 'MORE_DRAFTS').keep).toBe(false);
  });
});

describe('a rhythm is read on the middle of each side, whichever side has an even number', () => {
  const words = (n: number, seed: number): string => Array.from({ length: n }, (_, k) => ['road', 'night', 'engine', 'river', 'town', 'light', 'rain', 'music'][(k * 7 + seed) % 8]).join(' ');
  const piece = (len: number, seed: number): string => Array.from({ length: 30 }, (_, i) => `${words(len, seed + i).replace(/^./, (ch) => ch.toUpperCase())}.${i % 3 === 2 ? '\n\n' : ' '}`).join('').trim();
  it('a writer level with one of two drafts is not apart from the model because the other draft is shorter', () => {
    const r = rhythmSignature([0, 1, 2, 3].map((s) => piece(28, s)), [piece(20, 9), piece(28, 10)]);
    expect(r.signature).toBeNull();
    expect(r.why).toMatch(/^too little to tell a rhythm from a piece: 4 of your pieces and 2 of the model's drafts/);
  });
  it('with three drafts, every one of the writer\'s pieces must stand beyond every draft', () => {
    const drafts = [piece(12, 20), piece(14, 21), piece(16, 22)];
    expect(rhythmSignature([piece(40, 0), piece(42, 1), piece(41, 2), piece(15, 3)], drafts).signature).toBeNull();
    expect(rhythmSignature([piece(40, 0), piece(42, 1), piece(41, 2), piece(39, 3)], drafts).signature).toBe('LONG');
  });
});
