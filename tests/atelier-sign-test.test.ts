// tests/atelier-sign-test.test.ts — THE INSTRUMENT IS PINNED TO KNOWN VALUES BEFORE IT JUDGES.
//
// The external-expert preregistration's power table was recomputed independently and every cell
// matched; these tests freeze that agreement so the shipped test can never drift from the sealed
// design's arithmetic.

import { describe, it, expect } from 'vitest';
import { mcnemarExactP, clopperPearson, MIN_DISCORDANT } from '../core/stats/sign-test.js';

describe('exact two-sided sign test', () => {
  it('matches the preregistration power table criticals', () => {
    expect(mcnemarExactP(15, 5)).toBeCloseTo(0.0414, 4);   // n=20, crit 15
    expect(mcnemarExactP(19, 7)).toBeCloseTo(0.0290, 4);   // n=26, crit 19
    expect(mcnemarExactP(21, 9)).toBeCloseTo(0.0428, 4);   // n=30, crit 21
    expect(mcnemarExactP(27, 13)).toBeCloseTo(0.0385, 4);  // n=40, crit 27
  });

  it('one below the critical is not significant — the boundary is exact, not approximate', () => {
    expect(mcnemarExactP(20, 10)).toBeGreaterThan(0.05);
    expect(mcnemarExactP(21, 9)).toBeLessThan(0.05);
  });

  it('is symmetric and sane at the edges', () => {
    expect(mcnemarExactP(9, 21)).toBeCloseTo(mcnemarExactP(21, 9), 12);
    expect(mcnemarExactP(0, 0)).toBe(1);
    expect(mcnemarExactP(5, 5)).toBeCloseTo(1, 5);
  });

  it('the moat study number reproduces: 9 vs 7 (T10 against) is a coin flip', () => {
    expect(mcnemarExactP(9, 7)).toBeGreaterThan(0.6);
  });
});

describe('Clopper–Pearson exact interval', () => {
  it('matches the published reference value for 9/16', () => {
    const { lo, hi } = clopperPearson(9, 16);
    expect(lo).toBeCloseTo(0.2986, 3);
    expect(hi).toBeCloseTo(0.8025, 3);
  });

  it("matches the reviewer's own F2 arithmetic: two-sided upper bound for 0/8", () => {
    const { lo, hi } = clopperPearson(0, 8);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(1 - Math.pow(0.025, 1 / 8), 4);
  });

  it('degenerate cases hold', () => {
    expect(clopperPearson(0, 0)).toEqual({ lo: 0, hi: 1 });
    expect(clopperPearson(5, 5).hi).toBe(1);
  });
});

describe('the floor', () => {
  it('MIN_DISCORDANT is 25, and at 25 the critical is 18', () => {
    expect(MIN_DISCORDANT).toBe(25);
    expect(mcnemarExactP(18, 7)).toBeLessThan(0.05);
    expect(mcnemarExactP(17, 8)).toBeGreaterThan(0.05);
  });
});
