// tests/atelier-request-pages.test.ts — A LENGTH ASKED IN PAGES IS READ, TOLD TO THE WRITER, AND HELD.
//
// Teardowns asked "Quick mode: one to two pages." came back at 1,400 to 1,900 words. The request's length was not seen (a count spelled out after a label like "Quick mode:" was skipped), and a
// length in pages, where it was seen, was never counted: the writer was not held to it and nothing was written again.
import { describe, it, expect } from 'vitest';
import { statedLength, notHeldBecause, inWords, WORDS_PER_PAGE } from '../core/intake/length.js';

const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');

describe('a length said after a label is read', () => {
  it('"Quick mode: one to two pages." states one to two pages', () => {
    expect(statedLength('Write the competitive teardown. Quick mode: one to two pages.')).toMatchObject({ unit: 'pages', kind: 'range', min: 1, max: 2, raw: 'one to two pages' });
    expect(statedLength('Summarise the call. Length: two pages.')).toMatchObject({ unit: 'pages', target: 2 });
  });
  it('and a count after a label that says what is there is still no length', () => {
    expect(statedLength('Note: two pages were missing from the scan. Write the summary.')).toBeNull();
    expect(statedLength('Context: three paragraphs of the draft are mine. Tighten it.')).toBeNull();
  });
});

describe('a length in pages is held in words, at a stated number of words a page', () => {
  it('one to two pages is held as one to two pages of words, and says how it was read', () => {
    const s = statedLength('Write the teardown. Quick mode: one to two pages.')!;
    expect(notHeldBecause('Write the teardown. Quick mode: one to two pages.', s)).toBeNull();
    const w = inWords(s)!;
    expect(w).toMatchObject({ unit: 'words', kind: 'range', min: WORDS_PER_PAGE, max: 2 * WORDS_PER_PAGE, raw: 'one to two pages' });
    expect(w.read).toBe(`at ${WORDS_PER_PAGE} words a page`);
  });
  it('a length in words is unchanged, and one in sentences or paragraphs is still not counted', () => {
    const s = statedLength('Explain caching in 400 words.')!;
    expect(inWords(s)).toEqual(s);
    expect(inWords(statedLength('Explain caching in 3 sentences.')!)).toBeNull();
    expect(notHeldBecause('Explain caching in 3 sentences.', statedLength('Explain caching in 3 sentences.')!)).toBe('a length in sentences is not counted');
  });
  it('a request that names pages and words both is the person\'s to say, never guessed', () => {
    const r = 'Write a two-page brief, each section under 200 words.';
    expect(notHeldBecause(r, statedLength(r)!)).toMatch(/more than one count/);
  });
});

describe('what the run does with it', () => {
  it('a draft past two pages is too long, said in the request\'s words, and is one more thing to write again for', async () => {
    const { requestLength, unmetReader, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const asked = inWords(statedLength('Write the teardown. Quick mode: one to two pages.')!)!;
    const long = words(1717);
    const r = requestLength(long, asked);
    expect(r).toMatchObject({ asked: 'one to two pages', met: false });
    expect(r.detail).toBe(`1,717 words written: too long, it allows ${WORDS_PER_PAGE} to ${(2 * WORDS_PER_PAGE).toLocaleString('en-US')} (at ${WORDS_PER_PAGE} words a page)`);
    expect(requestLength(words(800), asked).met).toBe(true);
    const unmet = unmetReader({ requirements: [] } as never, null, asked)?.({ output: long, report: { checked: [], unchecked: [], failed: false } as never });
    expect(unmet).toEqual([expect.objectContaining({ id: LENGTH_ID, of: 'request', statement: 'Write it at the length the request asks for: one to two pages' })]);
  });
  it('a request in pages sets aside the method\'s length in words for that run', async () => {
    const { lengthRulesTheRequestSets } = await import('../cli/commands/invoke.js');
    const rule = (id: string, unit: string) => ({ requirementId: id, statement: `${id}.`, measurement: { observer: 'LENGTH', params: { unit: [unit], max: 100 } } });
    const std = { requirements: [rule('words', 'words'), rule('longest', 'sentence')] } as never;
    expect(lengthRulesTheRequestSets(std, statedLength('Write the teardown. Quick mode: one to two pages.')).map((q) => q.requirementId)).toEqual(['words']);
  });
});

describe('the length asked is counted in words, never in the marks that draw a table or a heading', () => {
  // A teardown of four tables counted its "|" and "---" as words: 1,135 counted for 1,006 written, and it was cut
  // three times for words it did not have.
  const table = '## Moat\n\n| Moat | Present |\n|---|---|\n| Scale | Yes |\n| Brand | No |';
  it('a table of six words and a heading of one is seven words', async () => {
    const { wordsWritten } = await import('../core/eval/size.js');
    expect(wordsWritten(table)).toBe(7);
    expect(wordsWritten('**Known.** A 2026 figure — 40% of it.')).toBe(7);
  });
  it('and the request\'s length is held on that count', async () => {
    const { requestLength, unmetReader } = await import('../cli/commands/invoke.js');
    const asked = statedLength('Write it in 7 words.')!;
    expect(requestLength(table, asked)).toMatchObject({ met: true, detail: '7 words written' });
    expect(unmetReader({ requirements: [] } as never, null, asked)?.({ output: table, report: { checked: [], unchecked: [], failed: false } as never })).toEqual([]);
  });
});
