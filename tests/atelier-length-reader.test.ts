// tests/atelier-length-reader.test.ts — A LENGTH IS READ THE WAY PEOPLE SAY IT, AND A NUMBER IN A TITLE IS NOT ONE.
//
// Read from a title, "10 words" took the author's usual length out of the prompt and told the writer to write ten
// words. Said as people say it ("a 20,000 word book", "roughly two thousand words", "a two-page brief"), a length
// went unseen. And a request that states two (words, and paragraphs) kept only the last.
import { describe, it, expect } from 'vitest';
import { statedLength, statedLengths } from '../core/intake/length.js';

const read = (r: string): [number | null, string, string] | null => { const s = statedLength(r); return s ? [s.target ?? s.max ?? s.min, s.unit, s.raw] : null; };

describe('what is inside quotation marks is a title or a quotation, never the length to write to', () => {
  it('a number in a title states no length', () => {
    expect(statedLength('Write a post titled "10 words that changed our roadmap"')).toBeNull();
    expect(statedLength('Write a post titled “10 words that changed our roadmap”')).toBeNull();
    expect(statedLength('Reply to the customer who wrote "please keep it under 50 words"')).toBeNull();
  });
  it('and the length said outside the title is still read', () => {
    expect(read('Write about 800 words titled "10 words that changed our roadmap"')).toEqual([800, 'words', '800 words']);
  });
});

describe('a count before the kind of piece is its length', () => {
  it('"a 20,000 word book", "a 300 word summary"', () => {
    expect(read('Write a 20,000 word book')).toEqual([20000, 'words', '20,000 word']);
    expect(read('Give me a 300 word summary of the call')).toEqual([300, 'words', '300 word']);
  });
  it('never when it points at text that is already there', () => {
    expect(statedLength('Tighten the 500 word draft I pasted')).toBeNull();
    expect(statedLength('Fix my 500 word essay')).toBeNull();
  });
});

describe('a number spelled out is a number', () => {
  it('reads thousands, hundreds and small counts', () => {
    expect(read('Write roughly two thousand words')).toEqual([2000, 'words', 'two thousand words']);
    expect(read('Write about fifteen hundred words on pricing')).toEqual([1500, 'words', 'fifteen hundred words']);
    expect(read('Keep it under two thousand five hundred words')).toEqual([2500, 'words', 'under two thousand five hundred words']);
    expect(read('Write a two-page brief')).toEqual([2, 'pages', 'two-page']);
    expect(read('Write three paragraphs on pricing')).toEqual([3, 'paragraphs', 'three paragraphs']);
    expect(read('About a thousand words, please')).toEqual([1000, 'words', 'a thousand words']);
    expect(read('Around twenty-five hundred words')).toEqual([2500, 'words', 'twenty-five hundred words']);
  });
  it('a number word that states no length is left alone', () => {
    expect(statedLength('No one words it better than she does')).toBeNull();
    expect(statedLength('One of the two words in the title is wrong')).toBeNull();
    expect(statedLength('I have two pages of notes for you')).toBeNull();
  });
});

describe('a request may state more than one length, one for each unit', () => {
  it('both are kept, in the order they were said, and the count of words is the one a draft is measured against', () => {
    const all = statedLengths('Write a 500-word introduction in 3 paragraphs');
    expect(all.map((s) => [s.target, s.unit, s.raw])).toEqual([[500, 'words', '500-word'], [3, 'paragraphs', '3 paragraphs']]);
    expect(read('Write a 500-word introduction in 3 paragraphs')).toEqual([500, 'words', '500-word']);
  });
  it('of two said in the same unit, the later one is the length', () => {
    expect(statedLengths('About 300 words. Actually, make it about 600 words.').map((s) => s.target)).toEqual([600]);
  });
  it('none stated is an empty list', () => { expect(statedLengths('Write something good about pricing')).toEqual([]); });
});
