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
  it('both are kept, in the order they were said', () => {
    const all = statedLengths('Write a 500-word introduction in 3 paragraphs');
    expect(all.map((s) => [s.target, s.unit, s.raw])).toEqual([[500, 'words', '500-word'], [3, 'paragraphs', '3 paragraphs']]);
    // the length a draft is held to is the last one said, as it always was
    expect(read('Write a 500-word introduction in 3 paragraphs')).toEqual([3, 'paragraphs', '3 paragraphs']);
    expect(read('A headline of 5 words. Body: 3 paragraphs.')).toEqual([3, 'paragraphs', '3 paragraphs']);
  });
  it('of two said in the same unit, the later one is the length', () => {
    expect(statedLengths('About 300 words. Actually, make it about 600 words.').map((s) => s.target)).toEqual([600]);
  });
  it('none stated is an empty list', () => { expect(statedLengths('Write something good about pricing')).toEqual([]); });
});

describe('what an independent review found the first version of this got wrong', () => {
  const none = (r: string): void => { expect(statedLength(r), r).toBeNull(); };
  it('a count before the kind of piece is a length only when that piece is what is asked for', () => {
    for (const r of ['I wrote a 500 word draft. Tighten it.', 'Here is a 500 word draft, make it better', 'A 300 word essay by a student is attached; grade it', 'Proofread the attached 3 page report',
      'Reply to a 2 sentence email', 'Write a book proposal for a 90,000 word book', 'Write the jacket copy for a 300 page report']) none(r);
    expect(read('Draft me a 300 word summary of the call')).toEqual([300, 'words', '300 word']);
    expect(read('I need a 1,200 word article on pricing')).toEqual([1200, 'words', '1,200 word']);
  });
  it('two numbers side by side are two numbers', () => {
    expect(statedLengths('Write between two and three paragraphs').map((s) => [s.kind, s.min, s.max, s.unit])).toEqual([['range', 2, 3, 'paragraphs']]);
    expect(read('Write five two-sentence blurbs')).toEqual([2, 'sentences', 'two-sentence']);
    expect(read('Write three one-paragraph options')).toEqual([1, 'paragraphs', 'one-paragraph']);
  });
  it('digits and words together keep their size', () => {
    expect(read('Write 2 thousand words')).toEqual([2000, 'words', '2 thousand words']);
    expect(read('about 3 hundred words')).toEqual([300, 'words', '3 hundred words']);
    expect(read('Write one thousand, two hundred words')).toEqual([1200, 'words', 'one thousand, two hundred words']);
  });
  it('a small number spelled out is a length only where the request introduces it as one', () => {
    for (const r of ['Remove three sentences', 'Delete two paragraphs and tighten', 'Add one sentence about pricing', 'Write a review of the film Three Sentences',
      "Write a post titled 'Ten words that matter'", 'In a word, no. Two words: not yet.', 'Why are two pages better than one page?', 'Our style guide: every post opens with a one sentence summary', 'Remove 3 sentences']) none(r);
    expect(read('Write three sentences on why')).toEqual([3, 'sentences', 'three sentences']);
  });
});

describe('what a second review found: a false length is the harmful error, so a doubtful one is not read', () => {
  const none = (r: string): void => { expect(statedLength(r), r).toBeNull(); };
  it('a small number spelled out in a sentence about something else', () => {
    for (const r of ['He said it in three words: "we are done".', 'Write a scene where she ends it in three words.', 'Chapter one is two pages. Write chapter two.', 'It is two pages, and I hate it. Rewrite.',
      'The intro consists of two paragraphs. Make it warmer.', 'Look at two pages, then decide.', 'Compare it to two paragraphs that I wrote before.', 'The summary of three paragraphs, which I pasted, needs a title.',
      'There should be two sentences that mention price.', 'Attachments:\n- two pages on pricing\n- one page on risks\nWrite the cover note.']) none(r);
  });
  it('a piece that exists, or one that is refused, written with a hyphen or without', () => {
    for (const r of ['I wrote a 500-word draft; tighten it.', 'Proofread the attached 3-page report.', 'Write a proposal for a 90,000-word book.', 'Here is a 12-page deck. Write the cover email.',
      "I don't want a 500 word essay, keep it short."]) none(r);
    expect(read('Write a 2,000-word chapter')).toEqual([2000, 'words', '2,000-word']);
    expect(read('Write a 500 word blog post')).toEqual([500, 'words', '500 word']);
  });
  it('an amount to change by, a count of what exists, and a rate', () => {
    for (const r of ['Shorten this by 100 words.', 'Trim it by about 50 words.', 'Expand the second section by 150 words.', 'This draft is 900 words; make it punchier.', 'My bio is 3 sentences. Make it funnier.',
      'I type 80 words per minute; write my bio.', 'We publish 20 pages per week; write the status note.']) none(r);
  });
  it('"more than" and "over" set a floor', () => {
    expect(statedLength('Write more than 500 words.')).toMatchObject({ kind: 'min', min: 500 });
    expect(statedLength('Write over 500 words.')).toMatchObject({ kind: 'min', min: 500 });
  });
  it('the last length said is the one found where it was said, not where its words appear again', () => {
    expect(read('Write about 500 words, in 3 paragraphs. Do not reuse the 500 words I pasted.')).toEqual([3, 'paragraphs', '3 paragraphs']);
    expect(read('Write 2 pages, about 600 words, on the 12 pages attached.')).toEqual([600, 'words', '600 words']);
  });
});
