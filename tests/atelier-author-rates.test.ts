// tests/atelier-author-rates.test.ts — THE AUTHOR'S RATES ARE FORMED FROM FIVE PIECES, STEERED, AND TOLD (round 3, item 3).
//
// Root cause, read in code on an invented corpus shaped like the evidence (one long piece, four of 12 to 18 sentences, about
// 4.6 "I" per 1,000 words, median sentence 15 words, 1 in 8 sentences under 6 words): discovery reads three of five pieces
// and holds two, a band needs four read pieces, so the profile held no band at all; the first person was no counted
// feature (only a style pattern, PATTERN_RATE, which steering never grades and whose floor no span can repair); and the
// median sentence and the share of short ones were no features. Nothing steered. Now each is read over every piece and is
// a graded target on any miss, and the writer is told them as the author's rates. Expected values are worked by hand.
import { describe, it, expect } from 'vitest';
import { buildProfile, AUTHOR_RATES } from '../core/fidelity/profile.js';
import { signalChecks, authorRatesNote } from '../core/loop/graded.js';
import { gradedRules } from '../core/loop/run-repair.js';

import { piece, WORDS } from './fixtures/author-rates-corpus.js';

// 1,120 + 172 + 192 + 224 + 254 = 1,962 words; "I" 5 + 1 + 1 + 1 + 1 = 9: 4.587 per 1,000.
const AUTHOR = [piece(80), piece(12), piece(14), piece(16), piece(18)];
/**
 * A draft off all three: no first person, sentences of 3 to 9 words, a third of them five words or fewer. 1,140 words: the
 * first person is read at the draft's length (../core/loop/graded.ts, `bandAt`), and at 4.587 per 1,000 a 1,140-word draft
 * expects 5.2, so none is out (P(X = 0) = 0.005); a draft a third as long expects 1.7 and none would be inside.
 */
const OFF = Array.from({ length: 30 }, (_, p) => Array.from({ length: 6 }, (_, j) => `${Array.from({ length: [7, 8, 4, 7, 9, 3][j] }, (_, k) => WORDS[(p + j + k) % 10]).join(' ').replace(/^./, (c) => c.toUpperCase())}.`).join(' ')).join('\n\n');
const MODEL = Array.from({ length: 8 }, () => OFF);

const RATES = [
  { id: 'firstSingular', band: [1, 9], median: 4.587 },    // the counts a 1,000-word text at 4.587 per 1,000 may carry (Poisson, 2.5% each tail)
  { id: 'sentenceP50', band: [13.5, 16.5], median: 15 },   // every piece's median is 15: the band is padded by a tenth
  { id: 'shortSentence', band: [0.068, 0.158], median: 0.125 }, // 1/12, 1/9, 1/8, 1/8, 1/7: 10th to 90th, widened by a quarter
];

describe('the author\'s rates, from five pieces', () => {
  it('discovery\'s split (three read, two held back) forms all three, as steering signals', () => {
    const p = buildProfile({ read: AUTHOR.slice(0, 3).map((text, i) => ({ id: `r${i}`, text })), held: AUTHOR.slice(3).map((text, i) => ({ id: `h${i}`, text })), model: MODEL, corpusHash: 'c' });
    expect(p.bands.filter((b) => b.rate).map((b) => ({ id: b.id, band: b.band, median: b.median, role: b.role, cls: b.cls }))).toEqual(RATES.map((r) => ({ ...r, role: 'SIGNAL', cls: 'all' })));
  });
  it('the method\'s build (all five read, nothing held, no drafts) forms the same; a feature the owner ruled stays theirs', () => {
    const p = buildProfile({ read: AUTHOR.map((text, i) => ({ id: `p${i}`, text })), held: [], model: [], corpusHash: 'c', ruled: new Set(['sentenceP50']) });
    // in the order the features are counted: the sentence pair first, then the first person
    expect(p.bands.filter((b) => b.rate).map((b) => [b.id, b.role])).toEqual([['sentenceP50', 'RULE'], ['shortSentence', 'SIGNAL'], ['firstSingular', 'SIGNAL']]);
    expect(AUTHOR_RATES).toEqual(['firstSingular', 'sentenceP50', 'shortSentence']);
  });
  it('fewer than four pieces form none', () => {
    const p = buildProfile({ read: AUTHOR.slice(0, 3).map((text, i) => ({ id: `p${i}`, text })), held: [], model: [], corpusHash: 'c' });
    expect(p.bands.filter((b) => b.rate)).toEqual([]);
  });
});

describe('steered on any miss, and told to the writer', () => {
  const p = buildProfile({ read: AUTHOR.map((text, i) => ({ id: `p${i}`, text })), held: [], model: [], corpusHash: 'c' });
  it('a draft off them is a graded target on each, at a distance a far-only signal would not steer', () => {
    const off = signalChecks(OFF, p).filter((c) => c.result.verdict === 'VIOLATED').map((c) => [c.requirementId, c.result.value]);
    // no "I"; the median of 3, 4, 7, 7, 8, 9 is 7; 60 of 180 sentences are five words or fewer
    expect(off).toEqual([['signal·sentenceP50', 7], ['signal·shortSentence', 0.333], ['signal·firstSingular', 0]]);
    expect([...gradedRules({ requirements: [] }, 'all', p).keys()].filter((k) => /firstSingular|sentenceP50|shortSentence/.test(k)).sort())
      .toEqual(['signal·firstSingular', 'signal·sentenceP50', 'signal·shortSentence']);
  });
  it('the author\'s own long piece is inside all three', () => {
    expect(signalChecks(AUTHOR[0], p).filter((c) => c.result.verdict === 'VIOLATED')).toEqual([]);
  });
  it('the writer is told them as the author\'s rates', () => {
    expect(authorRatesNote(p)).toBe('How I write, counted over my own pieces: about 4 to 5 "I" per 1,000 words; sentences around 15 words; about 1 in 8 under 6 words. Write at these rates.');
    expect(authorRatesNote(null)).toBe('');
  });
});
