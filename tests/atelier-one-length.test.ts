// tests/atelier-one-length.test.ts — NO LENGTH BAND THAT MEANS NOTHING.
//
// A folder of 69-word and 1,706-word pieces gave "1 to 3,343 words": a band that constrains nothing and says something
// false about the author. Pieces whose longest runs more than four times their shortest hold no length in common: none
// is offered, the build says so, and a request that names a length sets it. Pieces that agree keep their band.
import { describe, it, expect } from 'vitest';
import { usualLength, lengthSpan } from '../core/compiler/voice.js';
import { shapeBandRules, shortFormLimits } from '../core/observers/short-form.js';
import { oneLength } from '../core/intake/length.js';
import { GOOD } from './fixtures/shortform.js';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';

describe('one length, or none', () => {
  it('the rule: the longest at most four times the shortest', () => {
    expect(oneLength(100, 400)).toBe(true);
    expect(oneLength(100, 401)).toBe(false);
    expect(oneLength(69, 1706)).toBe(false);
  });
  it('a mixed folder of 69- to 1,706-word pieces: no usual length and no span', () => {
    const mixed = [words(69), words(80), words(1706), words(1500), words(900)];
    expect(usualLength(mixed)).toBeNull();
    expect(lengthSpan(mixed)).toBeNull();
  });
  it('pieces that agree keep their length', () => {
    const even = [words(800), words(950), words(1100), words(1200)];
    expect(usualLength(even)).not.toBeNull();
    expect(lengthSpan(even)).toEqual([800, 1200]);
  });
  it('short pieces of very different lengths: no length band among the shapes, and the screen says why', () => {
    const mixed = [words(12), words(15), words(140), words(130), words(20)];
    const bands = shapeBandRules(mixed).map((b) => b.shape);
    expect(bands).not.toContain('words');
    expect(bands).not.toContain('characters');
    expect(shortFormLimits(mixed, shapeBandRules(mixed), [], null).join('\n')).toMatch(/vary too much in length to hold one band/);
  });
  it('the five-tweet fixture keeps its length bands', () => {
    const bands = shapeBandRules(GOOD.slice(0, 5)).map((b) => b.shape);
    expect(bands).toEqual(expect.arrayContaining(['characters', 'words']));
  });
});
