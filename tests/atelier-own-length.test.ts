// The length an output is held to when the request names none: the span of the author's own pieces.
// Found on ten explanations built from twelve examples of 202 to 217 words: the skill said "about 200 words",
// nothing checked it, and three outputs ran 238 to 248. The run writes two drafts by default: where the author's
// length applies, it now chooses between them by it, after every rule. No extra draft is written.
import { describe, it, expect } from 'vitest';
import { ownLengthBand, againstBand } from '../core/intake/length.js';
import { lengthSpan } from '../core/compiler/voice.js';
import { ownLengthApplies, wordsOutside, draftOrder, type DraftScore } from '../cli/commands/invoke.js';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i % 7}`).join(' ') + '.';

describe('the band comes from the pieces, and every piece is inside it', () => {
  it('the span is the shortest and the longest piece, and needs three', () => {
    expect(lengthSpan([words(202), words(217), words(210)])).toEqual([202, 217]);
    expect(lengthSpan([words(202), words(217)])).toBeNull();
  });
  it('the band is the span widened by its own width on each side', () => {
    expect(ownLengthBand([202, 217])).toEqual([187, 232]);
    expect(ownLengthBand([300, 3000])).toEqual([1, 5700]);
    expect(ownLengthBand([150, 150])).toEqual([149, 151]);
    expect(ownLengthBand(null)).toBeNull();
    expect(ownLengthBand(undefined)).toBeNull();
  });
  it('a count is inside it, short of it or long of it', () => {
    expect([186, 187, 232, 233].map((n) => againstBand(n, [187, 232]))).toEqual(['short', 'met', 'met', 'long']);
  });
});

describe('it applies in one context, and is said to', () => {
  const yes = { stated: false, asked: false, shape: false, contract: false, answers: false, outOfRegister: false, sections: false };
  it('a request that names no length, to a skill that writes pieces in their register', () => {
    expect(ownLengthApplies(yes)).toBe(true);
  });
  it('not when the request states a length, asks for detail or brevity, or for a shape of its own', () => {
    for (const k of ['stated', 'asked', 'shape'] as const) expect(ownLengthApplies({ ...yes, [k]: true }), k).toBe(false);
  });
  it('not for answers, a contract check, a request out of register, or a piece planned by section', () => {
    for (const k of ['answers', 'contract', 'outOfRegister', 'sections'] as const) expect(ownLengthApplies({ ...yes, [k]: true }), k).toBe(false);
  });
});

describe('drafts are chosen by it after every rule, and before the finer features', () => {
  const base: DraftScore = { req: 0, taste: 0, tells: 0, all: 0, signal: null, style: 0 };
  it('how far outside the band a count is', () => {
    expect([150, 187, 232, 248].map((n) => wordsOutside(n, [187, 232]))).toEqual([37, 0, 0, 16]);
  });
  it('of two drafts that break the same rules, the one at the author\'s length is chosen', () => {
    expect(draftOrder({ ...base, lengthOff: 0, outside: 3 }, { ...base, lengthOff: 16, outside: 0 })).toBeLessThan(0);
    expect(draftOrder({ ...base, lengthOff: 6 }, { ...base, lengthOff: 16 })).toBeLessThan(0);
  });
  it('a draft at the right length that breaks a rule does not win on length', () => {
    expect(draftOrder({ ...base, req: 1, lengthOff: 0 }, { ...base, req: 0, lengthOff: 40 })).toBeGreaterThan(0);
    expect(draftOrder({ ...base, all: 1, lengthOff: 0 }, { ...base, all: 0, lengthOff: 40 })).toBeGreaterThan(0);
  });
  it('where it does not apply, nothing changes: no length is counted', () => {
    expect(draftOrder({ ...base, outside: 1 }, { ...base, outside: 2 })).toBeLessThan(0);
  });
});
