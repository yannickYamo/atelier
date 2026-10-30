// tests/atelier-reference-test.test.ts — the held-out reference protocol, and its refusals.

import { describe, it, expect } from 'vitest';
import { auditHoldout, nForBar, upperBound95, type HoldoutCandidate } from '../core/reference/holdout-integrity.js';
import { scoreReference, outcomeOf, isFailure, UNCERTAIN_HANDLING, PRIMARY_QUESTION,
  type ReferencePair, type ReferenceLabel } from '../core/reference/reference-test.js';

const item = (id: string, consumedBy: HoldoutCandidate['consumedBy'] = []): HoldoutCandidate =>
  ({ itemId: id, path: `/corpus/${id}.md`, consumedBy, taskReusableUnderFrozenSplit: true });

describe('holdout integrity is proved BEFORE any spend', () => {
  it('a real corpus BLOCKS: three read by discovery, one clean, nineteen needed', () => {
    const v = auditHoldout([
      item('piece-1', ['DISCOVERY']), item('piece-2'), item('piece-3', ['DISCOVERY']), item('piece-4', ['DISCOVERY']),
    ], 0.15);
    expect(v.clean.map((c) => c.itemId)).toEqual(['piece-2']);
    expect(v.contaminated).toHaveLength(3);
    expect(v.requiredN).toBe(19);
    expect(v.terminal).toBe('BLOCKED_ON_HOLDOUT_INTEGRITY');
    expect(v.why).toMatch(/STRUCTURAL block and not a budget one/);
  });

  it('every consumption route disqualifies, not just discovery', () => {
    for (const c of ['STANDARD_DRAFT', 'RATIFICATION', 'APPLIES_WHEN', 'IMPLEMENTATION_SELECTION',
      'REPAIR_DEVELOPMENT', 'PROBE_DEVELOPMENT', 'C0', 'SENSOR_TUNING'] as const) {
      expect(auditHoldout([item('x', [c])], 0.4).clean).toHaveLength(0);
    }
  });

  it('proceeds only when the clean count reaches the bar', () => {
    const many = Array.from({ length: 19 }, (_, i) => item(`p${i}`));
    expect(auditHoldout(many, 0.15).terminal).toBe('PROCEED');
    expect(auditHoldout(many.slice(0, 18), 0.15).terminal).toBe('BLOCKED_ON_HOLDOUT_INTEGRITY');
  });

  it('sizes from the bar rather than picking a round number', () => {
    expect(nForBar(0.15, 0)).toBe(19);
    expect(nForBar(0.15, 1)).toBe(30);
    expect(nForBar(0.30, 0)).toBe(9);
    expect(upperBound95(0, 1)).toBeGreaterThan(0.9);   // n=1 excludes nothing
  });
});

describe('the primary question does not ask about authorship', () => {
  it('asks about the standard, never "which did you write"', () => {
    expect(PRIMARY_QUESTION).toMatch(/according to your standard/);
    expect(PRIMARY_QUESTION).not.toMatch(/you write|did you|your own/i);
  });
});

describe('scoring, and the conservative handling declared up front', () => {
  const pair = (id: string, goldenSide: 'A' | 'B'): ReferencePair =>
    ({ contextId: id, task: 't', goldenSide, aText: 'a', bText: 'b' });
  const label = (id: string, judgement: ReferenceLabel['judgement'], recognizedOriginal: ReferenceLabel['recognizedOriginal'] = 'NO'): ReferenceLabel =>
    ({ contextId: id, judgement, recognizedOriginal });

  it('unblinds through the sealed side, not through the label', () => {
    expect(outcomeOf(pair('c', 'A'), label('c', 'A_BETTER'))).toBe('GOLDEN_MATERIALLY_BETTER');
    expect(outcomeOf(pair('c', 'B'), label('c', 'A_BETTER'))).toBe('SKILL_MATERIALLY_BETTER');
  });

  it('UNCERTAIN counts as a failure — the handling that cannot be chosen after the fact', () => {
    expect(UNCERTAIN_HANDLING.rule).toMatch(/counts as GOLDEN_MATERIALLY_BETTER/);
    expect(isFailure('UNCERTAIN')).toBe(true);
    expect(isFailure('NO_MATERIAL_DIFFERENCE')).toBe(false);
    expect(isFailure('SKILL_MATERIALLY_BETTER')).toBe(false);
  });

  it('UNDERPOWERED is not NOT_ESTABLISHED', () => {
    const ps = [pair('a', 'A'), pair('b', 'B')];
    const r = scoreReference(ps, [label('a', 'B_BETTER'), label('b', 'A_BETTER')], 0.15, 19);
    expect(r.failures).toBe(0);                 // the skill won both
    expect(r.decision).toBe('UNDERPOWERED');    // and it still proves nothing at n=2
    expect(r.why).toMatch(/not a negative result/);
  });

  it('establishes only when the BOUND clears the bar, not when the count looks good', () => {
    const ps = Array.from({ length: 19 }, (_, i) => pair(`c${i}`, i % 2 ? 'A' : 'B'));
    const ls = ps.map((p) => label(p.contextId, p.goldenSide === 'A' ? 'B_BETTER' : 'A_BETTER'));
    const r = scoreReference(ps, ls, 0.15, 19);
    expect(r.failures).toBe(0);
    expect(r.decision).toBe('HELD_OUT_REFERENCE_NONINFERIORITY_ESTABLISHED');
    expect(r.why).toMatch(/THIS author and THIS corpus/);   // never stated as absolute
  });

  it('one failure in nineteen does NOT establish it', () => {
    const ps = Array.from({ length: 19 }, (_, i) => pair(`c${i}`, 'A'));
    const ls = ps.map((p, i) => label(p.contextId, i === 0 ? 'A_BETTER' : 'B_BETTER'));
    const r = scoreReference(ps, ls, 0.15, 19);
    expect(r.failures).toBe(1);
    expect(r.decision).toBe('HELD_OUT_REFERENCE_NONINFERIORITY_NOT_ESTABLISHED');
  });

  it('refuses to score a partial tranche', () => {
    expect(() => scoreReference([pair('a', 'A'), pair('b', 'B')], [label('a', 'A_BETTER')], 0.15, 19))
      .toThrow(/no label for b/);
  });

  it('reports the non-recognized subset separately when it is big enough', () => {
    const ps = Array.from({ length: 6 }, (_, i) => pair(`c${i}`, 'A'));
    const ls = ps.map((p, i) => label(p.contextId, 'B_BETTER', i < 4 ? 'NO' : 'YES'));
    const r = scoreReference(ps, ls, 0.15, 19);
    expect(r.nonRecognized?.n).toBe(4);
    // and stays null when there is not enough to say anything
    const r2 = scoreReference(ps, ps.map((p) => label(p.contextId, 'B_BETTER', 'YES')), 0.15, 19);
    expect(r2.nonRecognized).toBeNull();
  });
});
