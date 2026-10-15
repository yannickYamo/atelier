// tests/atelier-composite-quantity-grammar.test.ts — ONE GRAMMAR FOR A QUANTITY SAID IN WORDS (core/composite/quantity.ts).
//
// Each wording below is read into { measure, unit, min, max } with the value written from its words: numbers in digits
// or words of any size, the comparators and their negations, ranges, approximations (a fifth either side), and the
// conversions (six characters a word; 230 words a minute of reading). The reading is shown on the composite screen
// beside each side of a length conflict, and merges nothing on its own: whether two lengths can both be followed is
// never decided by it (tests/atelier-composite-length-asked.test.ts).
import { describe, it, expect } from 'vitest';
import { quantitiesOf, quantityOf, type Quantity } from '../core/composite/quantity.js';

const q = (measure: Quantity['measure'], unit: Quantity['unit'], min: number | null, max: number | null, flag?: 'about' | 'allows'): Quantity => ({ measure, unit, min, max, ...(flag ? { [flag]: true } : {}) });
const CASES: readonly (readonly [string, Quantity | null])[] = [
  ['Keep the piece to about 300 words.', q('piece', 'words', 240, 360, 'about')],
  ['Keep it under 2,000 characters.', q('piece', 'words', null, 333.17)],
  ['Write at least eight hundred words.', q('piece', 'words', 800, null)],
  ['Aim for a five-minute read.', q('piece', 'words', 920, 1380, 'about')],
  ['Write roughly 1,200 words.', q('piece', 'words', 960, 1440, 'about')],
  ['Keep each piece under three minutes of reading.', q('piece', 'words', null, 690)],
  ['Keep it under a two-minute read.', q('piece', 'words', null, 460)],
  ['Keep the piece at least 5,000 characters long.', q('piece', 'words', 833.33, null)],
  ['Write no more than 1,000 words.', q('piece', 'words', null, 1000)],
  ['Write not more than 1,000 words.', q('piece', 'words', null, 1000)],
  ['Never more than fifteen words in a sentence.', q('sentence', 'words', null, 15)],
  ['Do not write more than 500 words.', q('piece', 'words', null, 500)],
  ['Write over 900 words.', q('piece', 'words', 901, null)],
  ['Write more than 900 words.', q('piece', 'words', 901, null)],
  ['Write 800 words or more.', q('piece', 'words', 800, null)],
  ['Write 300+ words.', q('piece', 'words', 300, null)],
  ['Write ~300 words.', q('piece', 'words', 240, 360, 'about')],
  ['Write approximately twenty-five hundred words.', q('piece', 'words', 2000, 3000, 'about')],
  ['Keep the piece between 250 and 400 words.', q('piece', 'words', 250, 400)],
  ['Keep the piece 250-400 words.', q('piece', 'words', 250, 400)],
  ['Never write a sentence over 15 words.', q('sentence', 'words', null, 15)],
  ['No sentence longer than twenty words.', q('sentence', 'words', null, 20)],
  ['Sentences should be at least eighteen words long.', q('sentence', 'words', 18, null)],
  ['Keep sentences under twenty-five words.', q('sentence', 'words', null, 24)],
  ['Keep sentences to twenty-five words at most.', q('sentence', 'words', null, 25)],
  ['Keep sentences short, never more than twenty words.', q('sentence', 'words', null, 20)],
  ['Let sentences run between 25 and 40 words.', q('sentence', 'words', 25, 40)],
  ['Write paragraphs of between two and four sentences.', q('paragraph', 'sentences', 2, 4)],
  ['Keep paragraphs to two to four sentences.', q('paragraph', 'sentences', 2, 4)],
  ['Keep paragraphs short, around two sentences.', q('paragraph', 'sentences', 1.6, 2.4, 'about')],
  ['Keep each paragraph to a single sentence.', q('paragraph', 'sentences', 1, 1)],
  ['Write a sentence or two per paragraph.', q('paragraph', 'sentences', 1, 2)],
  ['Keep paragraphs under 100 words.', q('paragraph', 'words', null, 99)],
  ['Write one or two paragraphs.', q('piece', 'paragraphs', 1, 2)],
  ['Let a paragraph run to eight sentences when the evidence needs room.', q('paragraph', 'sentences', null, 8, 'allows')],
  ['Paragraphs may go up to ten sentences.', q('paragraph', 'sentences', null, 10, 'allows')],
  ['Keep headings under ten words.', null],
  ['Open with a summary of under 50 words.', null],
  ['Use three examples.', null],
  ['Keep it short.', null],
  // a reviewer's wordings the grammar once misread
  ["Paragraphs shouldn't run over four sentences.", q('paragraph', 'sentences', null, 4)],
  ["Sentences mustn't be longer than 20 words.", q('sentence', 'words', null, 20)],
  ['Cut any sentence over 30 words.', q('sentence', 'words', null, 30)],
  ['Split paragraphs that run past five sentences.', q('paragraph', 'sentences', null, 5)],
  ['Twenty-five words per sentence, max.', q('sentence', 'words', null, 25)],
  ['Cap the piece at 500 words.', q('piece', 'words', null, 500)],
  ['Sentences can be as long as 40 words.', q('sentence', 'words', null, 40, 'allows')],
  ['At least 500 and at most 800 words.', q('piece', 'words', 500, 800)],
  ['Write less than 1,000 words but more than 600.', q('piece', 'words', 601, 999)],
  ['Reading time of four minutes.', q('piece', 'words', 736, 1104, 'about')],
  ['A 5 min read.', q('piece', 'words', 920, 1380, 'about')],
  ['Write 2k words.', q('piece', 'words', 1600, 2400, 'about')],
  // numbers that are not a length of the piece, a sentence or a paragraph
  ['Cite three sources per 1,000 words.', null],
  ['Every 300 words, add a subheading.', null],
  ['Include a 50-word bio.', null],
  ['End with a 20-word takeaway.', null],
];
describe('a quantity, however it is said', () => {
  for (const [said, want] of CASES) it(said, () => { expect(quantityOf(said)).toEqual(want); });
  it('two quantities on one measure are what both allow', () => {
    expect(quantitiesOf('Keep the piece between 250 and 400 words, and never more than 350 words.')).toEqual([q('piece', 'words', 250, 350)]);
  });
});
