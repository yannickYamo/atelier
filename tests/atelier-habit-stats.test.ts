// HOW OFTEN, AND WHETHER A SITUATION EXPLAINS IT, FROM COUNTS (core/stats/habit.ts). Every number is a posterior under
// the Jeffreys prior; every decision is the more probable of two hypotheses. Checked against closed forms and against
// what the counts plainly say; no threshold is tuned here, so none is asserted as one.
import { describe, it, expect } from 'vitest';
import { lgamma, logBeta, regularizedBeta, betaQuantile, posterior, pGreater, situationEffect, inferHabit, describeRate } from '../core/stats/habit.js';

describe('the special functions', () => {
  it('lgamma, logBeta and the incomplete beta match their closed forms', () => {
    expect(lgamma(1)).toBeCloseTo(0, 12); expect(lgamma(5)).toBeCloseTo(Math.log(24), 12); expect(lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    expect(logBeta(2, 3)).toBeCloseTo(Math.log(1 / 12), 12);
    expect(regularizedBeta(0.5, 1, 1)).toBeCloseTo(0.5, 12);            // uniform
    expect(regularizedBeta(0.3, 2, 1)).toBeCloseTo(0.09, 12);           // x^2
    expect(regularizedBeta(0.3, 1, 2)).toBeCloseTo(1 - 0.49, 12);       // 1 - (1-x)^2
    expect(betaQuantile(0.5, 1, 1)).toBeCloseTo(0.5, 9); expect(betaQuantile(0.09, 2, 1)).toBeCloseTo(0.3, 9);
  });
});

describe('the rate of a habit', () => {
  it('k of n gives the Jeffreys posterior: the mean, a 95% interval that narrows with n, and the probability of a majority', () => {
    const p = posterior(12, 12);
    expect(p.mean).toBeCloseTo(12.5 / 13, 12); expect(p.lo).toBeGreaterThan(0.8); expect(p.hi).toBeGreaterThan(0.99); expect(p.pMajority).toBeGreaterThan(0.999);
    const few = posterior(3, 12);
    expect(few.mean).toBeCloseTo(3.5 / 13, 12); expect(few.pMajority).toBeLessThan(0.05); expect(few.hi - few.lo).toBeGreaterThan(0.3);
    const one = posterior(1, 1);
    expect(one.mean).toBeCloseTo(0.75, 12); expect(one.pMajority).toBeCloseTo(1 - regularizedBeta(0.5, 1.5, 0.5), 12); expect(one.lo).toBeLessThan(0.2); expect(one.hi).toBeGreaterThan(0.99);
    const none = posterior(0, 4);
    expect(none.pMajority).toBeLessThan(0.05);
    // the interval narrows as n grows at the same proportion
    expect(posterior(20, 40).hi - posterior(20, 40).lo).toBeLessThan(posterior(2, 4).hi - posterior(2, 4).lo);
  });
  it('is said with its counts, and with its interval unless the counts leave none to say', () => {
    expect(describeRate(posterior(12, 12))).toBe('in 12 of 12 pieces');
    expect(describeRate(posterior(3, 12))).toMatch(/^in 3 of 12 pieces \[0\.\d\d, 0\.\d\d\]$/);
    expect(describeRate(posterior(1, 1))).toMatch(/^in 1 of 1 piece \[0\.\d\d, (?:0\.\d\d|1\.00)\]$/);
  });
});

describe('whether a situation explains a habit', () => {
  it('a move made in every piece in the situation and in none outside: two rates win, the situation raises the rate, it explains', () => {
    const e = situationEffect(4, 0, 0, 8);
    expect(e.bayesFactor).toBeGreaterThan(1); expect(e.pRaises).toBeGreaterThan(0.95); expect(e.explains).toBe(true);
    expect(e.in.mean).toBeGreaterThan(0.8); expect(e.out.mean).toBeLessThan(0.1);
  });
  it('a move made at the same rate in and out of the situation: one rate wins, it does not explain', () => {
    const e = situationEffect(2, 3, 2, 5);
    expect(e.bayesFactor).toBeLessThan(1); expect(e.explains).toBe(false);
    const same = situationEffect(6, 6, 6, 6);
    expect(same.bayesFactor).toBeLessThan(1); expect(same.pRaises).toBeCloseTo(0.5, 2);
  });
  it('a situation that lowers the rate does not explain the habit as a trigger, even when two rates fit better', () => {
    const e = situationEffect(0, 5, 5, 0);
    expect(e.bayesFactor).toBeGreaterThan(1); expect(e.pRaises).toBeLessThan(0.01); expect(e.explains).toBe(false);
  });
  it('P(X > Y) is symmetric and exact where it can be checked', () => {
    expect(pGreater(2, 2, 2, 2)).toBeCloseTo(0.5, 3);
    expect(pGreater(5, 1, 1, 5)).toBeGreaterThan(0.99);
    expect(pGreater(1, 1, 1, 1)).toBeCloseTo(0.5, 3);
  });
});

describe('the inference for a habit', () => {
  it('kind is a decision from the counts: situational when the situation explains it, standing when a majority is more probable than not, occasional otherwise; nothing is unknown', () => {
    expect(inferHabit(12, 12, null).kind).toBe('standing');
    expect(inferHabit(3, 12, null).kind).toBe('occasional');
    expect(inferHabit(4, 12, { a: 4, b: 0, c: 0, d: 8 }).kind).toBe('situational');
    expect(inferHabit(4, 12, { a: 2, b: 3, c: 2, d: 5 }).kind).toBe('occasional');
    // a majority habit whose situation explains the rest is situational: the better model names its reach
    expect(inferHabit(9, 12, { a: 8, b: 0, c: 1, d: 3 }).kind).toBe('situational');
    // the situation seen on one side only cannot be compared: the rate alone decides
    expect(inferHabit(6, 6, { a: 6, b: 0, c: 0, d: 0 })).toMatchObject({ situation: null, kind: 'standing' });
    // one piece, one habit: a posterior, a wide interval, a decision all the same
    const one = inferHabit(1, 1, null);
    expect(one.kind).toBe('standing'); expect(one.rate.hi - one.rate.lo).toBeGreaterThan(0.8);
    expect(inferHabit(0, 1, null).kind).toBe('occasional');
  });
  it('the same arithmetic on three pieces and on forty: the intervals carry the difference, the decision follows the counts', () => {
    const small = inferHabit(3, 3, null), large = inferHabit(40, 40, null);
    expect(small.kind).toBe('standing'); expect(large.kind).toBe('standing');
    expect(small.rate.lo).toBeLessThan(large.rate.lo);
  });
});
