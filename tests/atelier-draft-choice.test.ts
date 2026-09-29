// tests/atelier-draft-choice.test.ts — WHICH OF N DRAFTS `invoke --drafts N` DELIVERS.
//
// The choice said "a count picks it, never a judge's taste" while ranking the taste reader's VETO misses
// first, so a draft breaking a REQUIRED rule could win on the reader's opinion. And a draft whose signal
// distance could not be read ranked as if it sat exactly on the author's typical value (null became 0).
import { describe, it, expect } from 'vitest';
import { draftOrder, type DraftScore } from '../cli/commands/invoke.js';

const d = (o: Partial<DraftScore>): DraftScore => ({ req: 0, taste: 0, tells: 0, all: 0, signal: 1, style: 0, ...o });
const pick = (...xs: DraftScore[]): number => xs.map((x, i) => ({ x, i })).sort((a, b) => draftOrder(a.x, b.x))[0].i;

describe('draft choice: REQUIRED rules outrank the taste reader', () => {
  it('a draft breaking a REQUIRED rule loses to one the reader dislikes', () => {
    expect(pick(d({ req: 1, taste: 0 }), d({ req: 0, taste: 2 }))).toBe(1);
  });
  it('POLARITY — with REQUIRED tied, the reader decides before tells, all rules, signals and style', () => {
    expect(pick(d({ taste: 1 }), d({ taste: 0, tells: 5, all: 5, signal: 9, style: -3 }))).toBe(1);
  });
  it('then tells, then all rules, then signals, then style', () => {
    expect(pick(d({ tells: 1 }), d({ all: 3 }))).toBe(1);
    expect(pick(d({ all: 1 }), d({ signal: 5 }))).toBe(1);
    expect(pick(d({ signal: 2 }), d({ signal: 1, style: -1 }))).toBe(1);
    expect(pick(d({ style: 0.1 }), d({ style: 0.5 }))).toBe(1);
  });
});

describe('draft choice: an unread signal distance ranks last, not as a perfect 0', () => {
  it('null loses to any measured distance', () => {
    expect(pick(d({ signal: null }), d({ signal: 3 }))).toBe(1);
    expect(pick(d({ signal: 3 }), d({ signal: null }))).toBe(0);
  });
  it('two unread distances tie, and style breaks it', () => {
    expect(pick(d({ signal: null, style: 0 }), d({ signal: null, style: 1 }))).toBe(1);
  });
});
