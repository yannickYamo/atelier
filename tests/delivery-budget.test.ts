// tests/delivery-budget.test.ts — THE FALSE-STOP BUDGET: ∏ s_g ≥ 1 − B, with every number checked by hand.
import { describe, it, expect } from 'vitest';
import { allocate, budgetFor, falseStopUpper, goldensNeeded, provenSpecificity } from '../core/delivery/budget.js';

describe('the proof a gate carries', () => {
  it('zero false stops on n goldens: 1 − 0.05^(1/n)', () => {
    expect(falseStopUpper(0, 10)).toBeCloseTo(0.2589, 3);   // ten clean goldens prove under 26%
    expect(falseStopUpper(0, 29)).toBeLessThanOrEqual(0.10); // twenty-nine prove under 10%
    expect(falseStopUpper(0, 28)).toBeGreaterThan(0.10);
    expect(falseStopUpper(0, 0)).toBe(1);
  });
  it('one false stop on 20: the exact one-sided bound is 0.216 (P(X ≤ 1 | 20, 0.216) = 0.050)', () => {
    expect(falseStopUpper(1, 20)).toBeCloseTo(0.2161, 3);
  });
  it('goldens needed with none failing: 29 / 59 / 149 / 239 for 10% / 5% / 2% / 1.25%', () => {
    expect([0.10, 0.05, 0.02, 0.0125].map((r) => goldensNeeded(r))).toEqual([29, 59, 149, 239]);
  });
  it('definitional and owner-made gates are proven by construction', () => {
    expect(provenSpecificity({ kind: 'definitional' })).toBe(1);
    expect(provenSpecificity({ kind: 'owner' })).toBe(1);
    expect(provenSpecificity({ kind: 'goldens', n: 0, falseStops: 0 })).toBe(0);
  });
});

describe('allocation against the budget the latitude sets', () => {
  it('budgets: strict 20%, grounded 10%, creative 5%', () => {
    expect([budgetFor('STRICT'), budgetFor('GROUNDED'), budgetFor('CREATIVE')]).toEqual([0.20, 0.10, 0.05]);
  });
  it('definitional gates always block and cost nothing; an unqualified written check never blocks', () => {
    const a = allocate([{ id: 'dash', evidence: { kind: 'definitional' } }, { id: 'x3', evidence: { kind: 'goldens', n: 0, falseStops: 0 } }], 0.05);
    expect(a.gates.map((g) => g.tier)).toEqual(['BLOCK', 'STEER']);
    expect(a.shipsGood).toBe(1);
    expect(a.gates[1].why).toMatch(/nothing proven/);
  });
  it('two gates at 0 of 29 each (s ≥ 0.902) cannot both block in a 10% budget: 0.902² = 0.814 < 0.9', () => {
    const a = allocate([{ id: 'b', evidence: { kind: 'goldens', n: 29, falseStops: 0 } }, { id: 'a', evidence: { kind: 'goldens', n: 29, falseStops: 0 } }], 0.10);
    expect(a.gates.map((g) => [g.id, g.tier])).toEqual([['b', 'STEER'], ['a', 'BLOCK']]); // the tie breaks by id: "a" first
    expect(a.shipsGood).toBeCloseTo(0.9018, 3);
  });
  it('two gates at 0 of 59 each (s ≥ 0.95) both block in a 10% budget: 0.95² = 0.9025 ≥ 0.9', () => {
    const a = allocate([{ id: 'a', evidence: { kind: 'goldens', n: 59, falseStops: 0 } }, { id: 'b', evidence: { kind: 'goldens', n: 59, falseStops: 0 } }], 0.10);
    expect(a.gates.map((g) => g.tier)).toEqual(['BLOCK', 'BLOCK']);
  });
  it('the same ten clean goldens block on a strict skill (26% < 20%? no) — ten goldens block nowhere; a strict budget admits 0 of 14 (under 19.3%)', () => {
    expect(allocate([{ id: 'c', evidence: { kind: 'goldens', n: 10, falseStops: 0 } }], 0.20).gates[0].tier).toBe('STEER');
    expect(allocate([{ id: 'c', evidence: { kind: 'goldens', n: 14, falseStops: 0 } }], 0.20).gates[0].tier).toBe('BLOCK');
    expect(allocate([{ id: 'c', evidence: { kind: 'goldens', n: 14, falseStops: 0 } }], 0.10).gates[0].tier).toBe('STEER');
  });
  it('the copying check with its 10-21 record (30 stops on 36 clean labels) never blocks on any latitude', () => {
    for (const b of [0.05, 0.10, 0.20]) expect(allocate([{ id: 'lifted', evidence: { kind: 'goldens', n: 36, falseStops: 30 } }], b).gates[0].tier).toBe('STEER');
  });
  it('the order of gates given is the order returned', () => {
    const a = allocate([{ id: 'z', evidence: { kind: 'goldens', n: 59, falseStops: 0 } }, { id: 'dash', evidence: { kind: 'definitional' } }], 0.10);
    expect(a.gates.map((g) => g.id)).toEqual(['z', 'dash']);
  });
});
