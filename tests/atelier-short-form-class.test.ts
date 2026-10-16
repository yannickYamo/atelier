// tests/atelier-short-form-class.test.ts — A FOLDER IS SHORT FORM ONLY WHEN ITS PIECES HOLD ONE LENGTH.
// Expected values are read off the folders: a median of 108 words with pieces up to 1,706 is not short form, and gets
// no shape bands; five tweets are short form and keep theirs.
import { describe, it, expect } from 'vitest';
import { isShortForm } from '../core/observers/pooled.js';
import { shortFormOffers } from '../core/method/standard.js';
import { GOOD } from './fixtures/shortform.js';

const piece = (n: number): string => Array.from({ length: n }, (_, i) => `word${i % 50}`).join(' ') + '.';
const MIXED = [69, 90, 108, 120, 1706].map(piece);   // median 108, longest 1,706

describe('what counts as short form', () => {
  it('pieces of 69 to 1,706 words are not short form, and get no shape bands', () => {
    expect(isShortForm(MIXED)).toBe(false);
    expect(shortFormOffers(MIXED.map((reference, i) => ({ id: `m${i}`, reference }))).proposals).toEqual([]);
  });
  it('five tweets are short form, and keep their bands', () => {
    expect(isShortForm(GOOD.slice(0, 5))).toBe(true);
    expect(shortFormOffers(GOOD.slice(0, 5).map((reference, i) => ({ id: `t${i}`, reference }))).proposals.length).toBeGreaterThan(0);
  });
  it('short pieces close in words are short form even when one is four times another', () => {
    expect(isShortForm([5, 12, 20, 30, 40].map(piece))).toBe(true);
  });
});
