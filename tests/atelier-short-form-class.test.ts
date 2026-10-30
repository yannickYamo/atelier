// tests/atelier-short-form-class.test.ts — A FOLDER IS SHORT FORM WHEN ITS MIDDLE IS SHORT AND NO PIECE IS LONG.
// Expected values are read off the folders: a median of 108 words with pieces up to 1,706 is not short form, and gets
// no shape bands; five tweets are short form and keep theirs.
import { describe, it, expect } from 'vitest';
import { isShortForm } from '../core/observers/pooled.js';
import { shortFormOffers } from '../core/method/standard.js';
import { GOOD } from './fixtures/shortform.js';
import { examplePieces } from '../cli/commands/intake.js';

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
  it('a tweet folder of 8 to 60 words, half of them under 200 characters, is short form and keeps every piece', () => {
    const tweets = [8, 12, 15, 20, 35, 40, 50, 60].map(piece);
    expect(tweets.filter((t) => t.length < 200).length).toBe(4);
    expect(isShortForm(tweets)).toBe(true);
    expect(examplePieces(tweets.map((text, i) => ({ id: `t${i}.md`, text })), 'GENERATE')).toHaveLength(8);
  });
  it('a long post on X (about 350 words) beside short ones is still short form', () => {
    expect(isShortForm([10, 20, 30, 40, 350].map(piece))).toBe(true);
  });
});
