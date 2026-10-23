// tests/atelier-request-pages.test.ts — A LENGTH ASKED IN PAGES IS READ, TOLD TO THE WRITER, AND HELD.
//
// Teardowns asked "Quick mode: one to two pages." came back at 1,400 to 1,900 words. The request's length was not seen (a count spelled out after a label like "Quick mode:" was skipped), and a
// length in pages, where it was seen, was never counted: the writer was not held to it and nothing was written again.
import { stepLedger } from '../core/loop/controller.js';
import { describe, it, expect } from 'vitest';
import { statedLength, statedLengths, notHeldBecause, inWords, WORDS_PER_PAGE } from '../core/intake/length.js';

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
    const unmet = unmetReader({ requirements: [] } as never, asked)?.({ output: long, report: { checked: [], unchecked: [], failed: false } as never });
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
    expect(requestLength(table, asked)).toMatchObject({ met: true, detail: '7 words written, within the 6 to 8 it allows' });
    expect(unmetReader({ requirements: [] } as never, asked)?.({ output: table, report: { checked: [], unchecked: [], failed: false } as never })).toEqual([]);
  });
});

describe('a draft that only runs long is cut by what the writer picks and code removes', () => {
  // Asked to return the whole piece shorter, a writer removed 5 to 21 words of the 50 to 170 asked, three times over.
  // Asked to name what to delete, copied from the draft, it named enough, and code removes exactly that.
  const draft = [
    '## Read', '',
    'The one-line read is plain. It is also worth saying again here, in other words, for emphasis.', '',
    '| Moat | Present |', '|---|---|', '| Scale is the moat in this market | Yes |', '',
    '- A list item that stays whole.',
    '- It costs $0.17 for 120 claims, which is the price.', '',
    'A closing point. Which repeats the closing point at some length so that it can go.',
  ].join('\n');
  it('removes the sentences picked, stops once inside, and refuses figures, headings, table rows and whole list items', async () => {
    const { applyCuts } = await import('../cli/commands/invoke.js');
    const picks = [
      '"It is also worth saying again here, in other words, for emphasis."',
      'It costs $0.17 for 120 claims, which is the price.',
      'Scale is the moat in this market',
      '## Read',
      '- A list item that stays whole.',
      'a sentence that is not in the draft at all',
      'Which repeats the closing point at some length so that it can go.',
    ];
    const all = applyCuts(draft, picks, 0);
    expect(all.applied).toEqual(['It is also worth saying again here, in other words, for emphasis.', 'Which repeats the closing point at some length so that it can go.']);
    expect(all.text).toContain('The one-line read is plain.\n');
    expect(all.text).toContain('A closing point.');
    expect(all.text).toContain('| Scale is the moat in this market | Yes |');
    expect(all.text).toContain('$0.17');
    // stops at the first cut that brings it inside
    const one = applyCuts(draft, picks, wordsWrittenOf(draft) - 5);
    expect(one.applied).toHaveLength(1);
  });
  it('the writer is asked to name deletions copied from the draft, never to write it again', async () => {
    const { cutNote, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const note = cutNote([{ id: LENGTH_ID, whole: true, statement: 'length', detail: '1,169 words, 169 too many', off: 169, aim: 'aim for 900 words or fewer' }], 'the draft');
    expect(note).toMatch(/^The draft below holds what this work requires and runs too long/);
    expect(note).toContain('at least 169');
    expect(note).toContain('copied exactly from the draft');
    expect(note).toContain('<earlier-draft>\nthe draft\n</earlier-draft>');
  });
  it('in the run: the cut text is what is kept; where nothing picked can be removed, the next pass writes it shorter as before', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const unmet = (x: { output: string }) => { const n = wordsWrittenOf(x.output); return n > 20 ? [{ id: LENGTH_ID, whole: true as const, statement: 'length', detail: `${n} words`, off: n - 20, aim: 'aim for 18 words or fewer' }] : []; };
    const long = 'Keep this opening sentence here, as it is. Drop this whole sentence because it only repeats the opening one again. Keep the end of it.';
    const notes: string[] = [];
    const out = await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async (note) => { notes.push(note); return 'Drop this whole sentence because it only repeats the opening one again.'; } })(long, stepLedger()) as unknown as { output: string };
    expect(out.output).toBe('Keep this opening sentence here, as it is. Keep the end of it.');
    expect(notes).toHaveLength(1);
    // nothing it picks is in the draft: that pass changes nothing, and the next is the rewrite
    const asked: string[] = [];
    const out2 = await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async (note) => { asked.push(note); return asked.length === 1 ? 'not in the draft at all, this line' : 'Short now.'; } })(long, stepLedger()) as unknown as { output: string };
    expect(asked[0]).toContain('copied exactly from the draft');
    expect(asked[1]).toContain('Return the same piece with words removed');
    expect(out2.output).toBe('Short now.');
  });
});

function wordsWrittenOf(s: string): number { return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length; }

describe('review: a page count that describes the material is never the length to write to', () => {
  it('a source\'s length in pages, after a label that names a document, is not read', () => {
    const pages = (r: string) => statedLengths(r).filter((s) => s.unit === 'pages');
    expect(pages('Summarise the contract. Original: 12 pages.')).toEqual([]);
    expect(pages('Write a one-paragraph abstract. Paper length: eight pages.')).toEqual([]);
    expect(pages('Draft a reply to the attached letter (Letter: three pages).')).toEqual([]);
    expect(pages('Write a summary. Attachments: two pages.')).toEqual([]);
    // and a label that names the piece's own length or mode still introduces it
    expect(pages('Write the competitive teardown. Quick mode: one to two pages.')).toHaveLength(1);
    expect(pages('Summarise the call. Length: two pages.')).toHaveLength(1);
  });
  it('a length in words is still held when the request mentions a page count of the material', () => {
    const r = 'Write a 200-word summary of this ten-page report.';
    expect(statedLength(r)).toMatchObject({ unit: 'words', target: 200 });
    expect(notHeldBecause(r, statedLength(r)!)).toBeNull();
  });
  it('the method\'s words are set aside for a request in pages only where the pages are held', async () => {
    const { lengthRulesTheRequestSets } = await import('../cli/commands/invoke.js');
    const rule = { requirementId: 'words', statement: 'w.', measurement: { observer: 'LENGTH', params: { unit: ['words'], max: 100 } } };
    const std = { requirements: [rule] } as never; const s = statedLength('Write the teardown. Quick mode: one to two pages.');
    expect(lengthRulesTheRequestSets(std, s, false).map((q) => q.requirementId)).toEqual([]);
    expect(lengthRulesTheRequestSets(std, s, true).map((q) => q.requirementId)).toEqual(['words']);
  });
});

describe('review: a cut removes whole sentences and never breaks the markup around them', () => {
  it('a pick inside emphasis, code, a link or brackets, or part of a word or a sentence, is refused', async () => {
    const { applyCuts } = await import('../cli/commands/invoke.js');
    const keep = (draft: string, pick: string) => { expect(applyCuts(draft, [pick], 0), pick).toMatchObject({ applied: [], text: draft }); };
    keep('It was **really quite remarkable and new** today.', 'really quite remarkable and new');
    keep('Then *a lovely remark here* went.', 'a lovely remark here');
    keep('Run the `npm install now` please. Then go.', 'npm install now` please.');
    keep('See [the guide for more](http://x) more.', 'the guide for more](http://x) more.');
    keep('This is a long aside text here. Next.', 'his is a long aside text here.');
    keep('He said that it is important. It is.', 'it is important.');
    keep('Alpha beta, which is an aside here, gamma.', 'which is an aside here');
    keep('A point here. Another sentence repeated twice. Another sentence repeated twice.', 'Another sentence repeated twice.');
    keep('It is twelve times the price of the other one. Next.', 'It is twelve times the price of the other one.');
    keep('Name | Present | Why\nScale | Yes | it is the moat here.\n', 'it is the moat here.');
  });
  it('a whole sentence goes cleanly, and a line it empties goes with it', async () => {
    const { applyCuts } = await import('../cli/commands/invoke.js');
    expect(applyCuts('First point. A sentence that only repeats the point. Last point.', ['A sentence that only repeats the point.'], 0).text).toBe('First point. Last point.');
    expect(applyCuts('Intro.\n\n> The quotation opens here.\n> A quoted line that can go entirely here.\n\nEnd.', ['A quoted line that can go entirely here.'], 0).text).toBe('Intro.\n\n> The quotation opens here.\n\nEnd.');
    expect(applyCuts('Intro.\r\nA whole line that can go entirely here.\r\nEnd.', ['A whole line that can go entirely here.'], 0).text).toBe('Intro.\r\nEnd.');
  });
  it('a pass whose picks cannot be removed says so', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const unmet = (x: { output: string }) => (x.output.length > 30 ? [{ id: LENGTH_ID, whole: true as const, statement: 'length', detail: 'long', off: 5, aim: 'aim for 3 words or fewer' }] : []);
    const notes: string[] = [];
    await withRedraft(async (t: string) => d(t), { unmet, notes, redraft: async (n) => (n.includes('copied exactly') ? 'nothing here matches' : 'Short.') })('A long enough draft to be cut down.', stepLedger());
    expect(notes.join(' ')).toMatch(/named nothing that could be removed as written/);
  });
});

describe('correction after the blind read: the writer aims inside the length, and a cut never breaks what the text refers to', () => {
  // Told "about 500 to 1,000 words", eight writers aimed at the top and ran 1,006 to 1,104; six were cut, and four of
  // those read broken: "the citation test above" was gone, "three honest limits" listed two.
  it('the writer is told a length inside what the request allows, with the reason', async () => {
    const { lengthToWriteTo } = await import('../cli/commands/invoke.js');
    const r = 'Write the teardown. Quick mode: one to two pages.';
    expect(lengthToWriteTo(r, statedLength(r)!)).toBe('\n\nThe request states its length: one to two pages (about 500 to 1,000 words). Write to that length: aim for about 800 words, since drafts run past what they aim for. The length my own pieces run does not apply to this request.');
    expect(lengthToWriteTo('Explain caching in about 300 words.', statedLength('Explain caching in about 300 words.')!)).toContain('aim for about 300 words');
    expect(lengthToWriteTo('Keep it under 200 words.', statedLength('Keep it under 200 words.')!)).toContain('aim for about 170 words');
    // a length not held is told as it was said, with no aim
    expect(lengthToWriteTo('Explain caching in 3 sentences.', statedLength('Explain caching in 3 sentences.')!)).toBe('\n\nThe request states its length: 3 sentences. Write to that length. The length my own pieces run does not apply to this request.');
  });
  it('a sentence the next one refers back to, the first sentence of a paragraph, and a sentence in a list item are never cut', async () => {
    const { applyCuts } = await import('../cli/commands/invoke.js');
    const keep = (draft: string, pick: string) => { expect(applyCuts(draft, [pick], 0), pick).toMatchObject({ applied: [] }); };
    keep('Lead sentence here. Run the citation test on ten claims today. That test is the experiment.', 'Run the citation test on ten claims today.');
    keep('Lead sentence here. The category is crowded with similar tools. But the buyer stands elsewhere.', 'The category is crowded with similar tools.');
    keep('This topic sentence carries the claim of the paragraph. Then more.', 'This topic sentence carries the claim of the paragraph.');
    keep('- **Limit.** The sample is one spring of operations only. More.', 'The sample is one spring of operations only.');
    expect(applyCuts('Lead sentence here. A restated point that adds nothing at all. Next claim stands.', ['A restated point that adds nothing at all.'], 0).text).toBe('Lead sentence here. Next claim stands.');
  });
  it('the cut asks for that too, and the run keeps the draft before the cut', async () => {
    const { cutNote, withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    expect(cutNote([{ id: LENGTH_ID, whole: true, statement: 'l', detail: 'd', off: 9, aim: 'aim for 9 words or fewer' }], 'x')).toContain('never a sentence that another sentence points to, counts or continues');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const unmet = (x: { output: string }) => { const n = wordsWrittenOf(x.output); return n > 20 ? [{ id: LENGTH_ID, whole: true as const, statement: 'length', detail: `${n} words`, off: n - 20, aim: 'aim for 18 words or fewer' }] : []; };
    const long = 'Keep this opening sentence here, as it is. Drop this whole sentence because it only restates the opening again. Keep the end of it.';
    const out = await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async () => 'Drop this whole sentence because it only restates the opening again.' })(long, stepLedger()) as unknown as { output: string; repair: { draft: string } };
    expect(out.output).toBe('Keep this opening sentence here, as it is. Keep the end of it.');
    expect(out.repair.draft).toBe(long);
  });
});

describe('final review: the cut counts as the rule it serves counts, and falls back when a cut is refused', () => {
  const table = '| Name | Present | Why it matters here |\n|---|---|---|\n| Scale | Yes | the network grows with every new account added |\n| Brand | No | nobody asks for it by name in this market yet |';
  const sentences = Array.from({ length: 12 }, (_, i) => `Restated point number ${'abcdefghijkl'[i]} adds little to the argument here.`);
  const draft = `Lead sentence of the piece stands here.\n\n${table}\n\nOpening claim of this paragraph. ${sentences.join(' ')}`;
  it('a method limit counted in prose words stops the cut when the prose is inside, whatever the table holds', async () => {
    const { withRedraft, cutTarget } = await import('../cli/commands/invoke.js');
    const { proseWords } = await import('../core/observers/style.js');
    expect(typeof cutTarget).toBe('function');
    const prose0 = proseWords(draft); const max = prose0 - 20;
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const unmet = (x: { output: string }) => { const n = proseWords(x.output); return n > max ? [{ id: 'x9', whole: true as const, statement: `At most ${max} words.`, detail: `${n} words (at most ${max}): long by ${n - max}`, off: n - max, aim: `aim for ${max - 5} words or fewer` }] : []; };
    const out = await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async () => sentences.join('\n') })(draft, stepLedger()) as unknown as { output: string };
    expect(proseWords(out.output)).toBeLessThanOrEqual(max);
    expect(proseWords(out.output)).toBeGreaterThan(max - 25);
  });
  it('a cut the checks refuse (it ran short of a band) is followed by the rewrite, not the end of the step', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const n = (t: string) => wordsWrittenOf(t);
    const unmet = (x: { output: string }) => { const k = n(x.output); return k > 60 ? [{ id: LENGTH_ID, whole: true as const, of: 'request' as const, statement: 'l', detail: `${k}`, off: k - 60, aim: 'aim for 30 words or fewer' }] : k < 52 ? [{ id: LENGTH_ID, whole: true as const, of: 'request' as const, statement: 'l', detail: `${k}`, off: 52 - k, aim: 'aim for 55 words or more' }] : []; };
    const long = `Opening claim of this paragraph. ${sentences.slice(0, 7).join(' ')}`;
    const asked: string[] = [];
    // the cut lands short of the band (52 to 60), is refused, and the rewrite follows
    await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async (note) => { asked.push(note); return asked.length === 1 ? sentences.slice(1, 7).join('\n') : Array.from({ length: 55 }, () => 'w').join(' '); } })(long, stepLedger());
    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(asked.at(-1)).toContain('Return the same piece with words removed');
  });
});

describe('final review: a page count is read only after a label that names the length, and held as a ceiling', () => {
  const pages = (r: string) => statedLengths(r).filter((s) => s.unit === 'pages');
  it('a label that names a document, whatever document, is not a length in pages', () => {
    for (const r of ['Summarize the attached contract. Contract: 30 pages.', 'Summarize this proposal. Proposal: 10 pages.', 'Write a summary of the case study (Case study: 15 pages).', 'Present it. Slides: 10 pages.', 'Write a one-paragraph abstract. Paper length: eight pages.'])
      expect(pages(r), r).toEqual([]);
    for (const r of ['Write the teardown. Quick mode: one to two pages.', 'Summarise the call. Length: two pages.', 'Draft the memo. Output length: 2 pages.', 'Draft the memo. Target length: one page.'])
      expect(pages(r), r).toHaveLength(1);
  });
  it('a length in words after a label is read as before', () => {
    expect(statedLength('Write the launch post. Blog post: 800 words.')).toMatchObject({ unit: 'words', target: 800 });
  });
  it('"a one-page cover letter" is held at most one page: shorter is inside it', async () => {
    const { requestLength } = await import('../cli/commands/invoke.js');
    const w = inWords(statedLength('Write a one-page cover letter.')!)!;
    expect(w).toMatchObject({ kind: 'max', max: WORDS_PER_PAGE });
    expect(requestLength(Array.from({ length: 400 }, () => 'w').join(' '), w).met).toBe(true);
  });
});

describe('final review: more of what a cut must leave alone', () => {
  it('after an abbreviation, an ordinal, a pronoun across a blank line, inside code, a figure in words', async () => {
    const { applyCuts } = await import('../cli/commands/invoke.js');
    const keep = (draft: string, pick: string) => { expect(applyCuts(draft, [pick], 0), pick).toMatchObject({ applied: [] }); };
    keep('Intro here. We met Dr. Smith at the office today. He agreed.', 'Smith at the office today.');
    keep('Intro here. First, the cost matters a lot to us. Second, the time matters.', 'First, the cost matters a lot to us.');
    keep('Intro here. Smith joined the firm early on in its life. He later left.', 'Smith joined the firm early on in its life.');
    keep('Intro here. A sentence that ends the paragraph now.\n\nThis means the point stands.', 'A sentence that ends the paragraph now.');
    keep('Intro.\n\n```\nKeep this line. Remove me now please.\n```\n', 'Remove me now please.');
    keep('Intro here. It happened twice in the last year alone. Next one.', 'It happened twice in the last year alone.');
  });
});

describe('final review: the record and the report say the same thing', () => {
  it('the hash of the draft kept is the hash of that draft', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const { sha } = await import('../cli/runtime.js');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const unmet = (x: { output: string }) => { const n = wordsWrittenOf(x.output); return n > 20 ? [{ id: LENGTH_ID, whole: true as const, of: 'request' as const, statement: 'length', detail: `${n} words`, off: n - 20, aim: 'aim for 18 words or fewer' }] : []; };
    const long = 'Keep this opening sentence here, as it is. Drop this whole sentence because it only restates the opening again. Keep the end of it.';
    const out = await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async () => 'Drop this whole sentence because it only restates the opening again.' })(long, stepLedger()) as unknown as { repair: { draft: string; originalOutputHash: string } };
    expect(out.repair.originalOutputHash).toBe(sha(out.repair.draft));
  });
});
