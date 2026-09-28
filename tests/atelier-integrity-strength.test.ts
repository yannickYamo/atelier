// tests/atelier-integrity-strength.test.ts — A REWRITE MAY NOT MAKE A CLAIM STRONGER BY ADDING A WORD.
//
// The meaning check guarded what a rewrite could LOSE (figures, negation, qualifiers, names, slots) and
// accepted every tightening that kept them: "reduces" → "eliminates", "we expect to ship" → "we ship",
// "the old link" → "any link". These are the moves tightening a sentence makes. Pinned here, with the
// inflations the check deliberately does not catch, so its claim stays exactly as wide as its code.
import { describe, it, expect } from 'vitest';
import { spanIntegrity } from '../core/loop/integrity.js';

const judge = (a: string, b: string): boolean => spanIntegrity(a, b, new Set(), false).ok;

describe('strength carried by a word the rewrite added, or an intention it dropped', () => {
  it.each([
    ['The design reduces the outage risk.', 'The design eliminates the outage risk.'],
    ['We expect to ship in March.', 'We ship in March.'],
    ['Latency is lower than on the old link.', 'Latency is lower than on any link.'],
    ['The checklist helps reviewers.', 'The checklist ensures reviewers catch it.'],
    ['We plan to migrate the billing service.', 'We migrate the billing service.'],
  ])('refused: "%s" → "%s"', (a, b) => { expect(judge(a, b)).toBe(false); });

  it('an honest tightening is still accepted', () => {
    expect(judge('It is the case that the team decided, after some discussion, to move on.', 'After some discussion, the team decided to move on.')).toBe(true);
  });

  it('a universal the original already carried may stay', () => {
    expect(judge('Every team we asked said the same thing, in all cases.', 'Every team we asked said the same, in all cases.')).toBe(true);
  });

  it('NOT CAUGHT, and said so: causality and a dropped scope clause (the list is kept tight on purpose)', () => {
    expect(judge('Churn fell after the change.', 'The change cut churn.')).toBe(true);
    expect(judge('This holds for defense buyers who own their gateway.', 'This holds for buyers.')).toBe(true);
  });
});
