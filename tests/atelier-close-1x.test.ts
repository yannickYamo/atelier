// tests/atelier-close-1x.test.ts — THE SIX DEFECTS NAMED FOR THE CLOSE OF 1.x, EACH HELD BOTH WAYS.
//
// docs/decisions/0016 names them and nothing else: a length stated in numbers, an em dash the author does write, a
// refusal with one model named for every role, a dropped connection, an author's standard wording counted as
// copying, and headings the author never uses.
import { describe, it, expect, afterEach } from 'vitest';
import { statedLength, againstStated } from '../core/intake/length.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { overlapIndex, standardWordingOf } from '../core/observers/overlap.js';
import { nextDistinctModel } from '../cli/commands/discover.js';
import { spend, isDroppedConnection, CONNECTION_RETRIES, type Budget } from '../core/inference/client.js';
import { measure } from '../core/observers/registry.js';

describe('a length the request states in numbers is read off the request', () => {
  it('a target, a range, a floor, a ceiling and an exact count, with the words as written', () => {
    expect(statedLength('Write chapter 3, about 2,000 words, on the first winter.')).toMatchObject({ raw: '2,000 words', unit: 'words', kind: 'target', target: 2000 });
    expect(statedLength('a 1500-word essay')).toMatchObject({ kind: 'target', target: 1500 });
    expect(statedLength('2k words please')).toMatchObject({ kind: 'target', target: 2000 });
    expect(statedLength('between 1,500 and 2,000 words')).toMatchObject({ kind: 'range', min: 1500, max: 2000 });
    expect(statedLength('800-1000 words')).toMatchObject({ kind: 'range', min: 800, max: 1000 });
    expect(statedLength('at least 600 words')).toMatchObject({ kind: 'min', min: 600 });
    expect(statedLength('no more than 3 paragraphs')).toMatchObject({ kind: 'max', max: 3, unit: 'paragraphs' });
    expect(statedLength('exactly 5 sentences')).toMatchObject({ kind: 'exact', target: 5, unit: 'sentences' });
    // From 2.0 a number spelled out is read as a number (tests/atelier-length-reader.test.ts).
    expect(statedLength('two pages')).toMatchObject({ raw: 'two pages', unit: 'pages', target: 2 });
    expect(statedLength('500 words max')).toMatchObject({ kind: 'max', max: 500 });
    expect(statedLength('1,500 words minimum')).toMatchObject({ kind: 'min', min: 1500 });
    expect(statedLength('at least 300 and at most 500 words')).toMatchObject({ kind: 'range', min: 300, max: 500 });
  });
  it('a request that names no number has no stated length, and a number that is not a length is not one', () => {
    expect(statedLength('Write a detailed post about the 2024 budget and its 12 lines.')).toBeNull();
    expect(statedLength('Explain why 17 times 6 is 102.')).toBeNull();
    expect(statedLength('0 words')).toBeNull();
    // a number beside a unit that points at text already there, or numbers a part of it, states no length
    for (const r of ['summarise this 2,000 words essay', 'the 500 words I pasted', 'fix the 3 sentences below', '24 pages of the report say otherwise',
      'chapter 12 words to avoid', 'in 2024 words matter', 'top 10 words', 'between 2019 and 2023 paragraphs changed', 'section 4.2 words', 'My draft has 300 words. Improve it.', 'page 3']) {
      expect(statedLength(r), r).toBeNull();
    }
  });
  it('where a request holds more than one count, the last is the length', () => {
    expect(statedLength("Write 'Why 100 words of docs beat a meeting', about 900 words")).toMatchObject({ kind: 'target', target: 900 });
    expect(statedLength('cut this from 3,000 words to 2,000 words')).toMatchObject({ kind: 'target', target: 2000 });
  });
  it('a count is short of, long of, or inside what was asked; a target is met within a tenth', () => {
    const asked = statedLength('about 2,000 words')!;
    expect([1550, 1800, 2000, 2200, 2400].map((n) => againstStated(n, asked))).toEqual(['short', 'met', 'met', 'met', 'long']);
    expect(againstStated(590, statedLength('at least 600 words')!)).toBe('short');
    expect(againstStated(5000, statedLength('at least 600 words')!)).toBe('met');
    expect(againstStated(1200, statedLength('800-1000 words')!)).toBe('long');
  });
});

describe('an em dash the author writes is theirs, however few of their pieces hold one', () => {
  const sentence = (i: number, k: number): string => `In practice the team reviewed item ${k + i} against the checklist and recorded what changed in the log.`;
  const plain = (i: number): { id: string; text: string } => ({ id: `a${i}.md`, text: Array.from({ length: 40 }, (_, k) => sentence(i, k)).join(' ') });
  const dashed = (i: number): { id: string; text: string } => ({ id: `a${i}.md`, text: `${plain(i).text} The plan held — mostly — through the winter.` });
  const tells = (rules: ReturnType<typeof deriveContrastRules>) => rules.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.includes('MACHINE_TELL'))?.requirement;
  const dashCap = (rules: ReturnType<typeof deriveContrastRules>) => rules.find((r) => r.requirement.measurement?.observer === 'PATTERN_RATE'
    && (r.requirement.measurement.params.pattern as string[]).join() === 'EM_DASH')?.requirement;

  it('in two pieces of eight: not banned, held to the author\'s own rate, and the statement does not name it as a tell', () => {
    const read = [dashed(0), plain(1), plain(2), dashed(3), plain(4), plain(5)]; const held = [plain(6), plain(7)];
    const rules = deriveContrastRules(read, held, [], 'MACHINE_DISCOVERED');
    const t = tells(rules);
    expect(t?.measurement?.params.never).not.toContain('EM_DASH');
    expect(t?.statement).not.toMatch(/an em dash/);
    const cap = dashCap(rules);
    expect(cap?.statement).toMatch(/^Keep .* to at most [\d.]+ per 1,000 words, as I do\.$/);
    expect(cap?.measurement?.params.maxPer1000 as number).toBeGreaterThan(0);
    // the author's own dashed piece meets the cap, and a text that doubles their heaviest piece does not
    expect(measure(dashed(0).text, cap!.measurement!).verdict).toBe('MET');
    expect(measure(`${plain(0).text} ${'It held — barely — again. '.repeat(12)}`, cap!.measurement!).verdict).toBe('VIOLATED');
  });
  it('none in the pieces read and one in a piece held out: the dash is still theirs, and some rule holds it', () => {
    const drafts = [0, 1, 2].map((i) => `${plain(i).text} ${'It held — barely — again. '.repeat(20)}`);
    for (const held of [[plain(6), dashed(7)], [dashed(6), dashed(7)]]) {
      const rules = deriveContrastRules([0, 1, 2, 3, 4, 5].map(plain), held, drafts, 'MACHINE_DISCOVERED');
      expect(tells(rules)?.measurement?.params.never ?? []).not.toContain('EM_DASH');
      expect(rules.filter((r) => r.requirement.measurement?.observer === 'PATTERN_RATE' && (r.requirement.measurement.params.pattern as string[]).join() === 'EM_DASH')).toHaveLength(1);
      expect(dashCap(rules)?.statement).not.toMatch(/^Never use/);
    }
  });
  it('in no piece at all: banned, as before, and no cap is proposed', () => {
    const rules = deriveContrastRules([0, 1, 2, 3, 4, 5].map(plain), [6, 7].map(plain), [], 'MACHINE_DISCOVERED');
    expect(tells(rules)?.measurement?.params.never).toContain('EM_DASH');
    expect(tells(rules)?.statement).toMatch(/an em dash/);
    expect(dashCap(rules)).toBeUndefined();
  });
});

describe('a refusal falls back to the next model that is not the one that declined', () => {
  it('skips the model that answered, and is null when every candidate is that model', () => {
    expect(nextDistinctModel('m', ['m', 'm', 'claude-opus-5', 'claude-fable-5'])).toBe('claude-opus-5');
    expect(nextDistinctModel('claude-opus-5', ['claude-opus-5', 'claude-opus-5', 'claude-opus-5', 'claude-fable-5'])).toBe('claude-fable-5');
    expect(nextDistinctModel('local', ['local', 'local'])).toBeNull();
  });
});

describe('a dropped connection is tried again at the one place every call passes', () => {
  afterEach(() => { delete process.env.ATELIER_RETRY_BASE_MS; });
  const cost = { basis: 'API_METERED', billingUsd: 0.01 } as never;
  it('tells a connection that dropped from a backend that is not there or that answered with an error', () => {
    expect(isDroppedConnection(Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }))).toBe(true);
    expect(isDroppedConnection(new Error('could not reach x', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }))).toBe(true);
    expect(isDroppedConnection(new Error('socket hang up'))).toBe(true);
    expect(isDroppedConnection(new Error('could not reach x', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }) }))).toBe(false);
    expect(isDroppedConnection(new Error('HTTP 500 scripted failure'))).toBe(false);
    expect(isDroppedConnection(new Error('HTTP 429 rate limit'))).toBe(false);
    expect(isDroppedConnection(new Error('HTTP 502: upstream said "Connection error"'))).toBe(false);
    expect(isDroppedConnection(new Error('Request timed out.'))).toBe(false);
    expect(isDroppedConnection(new Error('could not reach x: it timed out'))).toBe(false);
  });
  it('the call that comes back on a later attempt is counted once, at what it cost', async () => {
    process.env.ATELIER_RETRY_BASE_MS = '0';
    const budget: Budget = { spentUsd: 0, capUsd: 1 }; let n = 0;
    const value = await spend(budget, 0.1, () => (++n < 3 ? Promise.reject(new Error('Connection error.')) : Promise.resolve({ value: 'ok', cost })));
    expect(value).toBe('ok');
    expect(n).toBe(3);
    expect(budget.spentUsd).toBeCloseTo(0.01);
    expect(budget.calls).toBe(1);
    expect(budget.inFlightUsd).toBeCloseTo(0);
  });
  it('it gives up after its attempts, and an error that is an answer is never tried again', async () => {
    process.env.ATELIER_RETRY_BASE_MS = '0';
    let n = 0;
    await expect(spend({ spentUsd: 0, capUsd: 1 }, 0.1, () => { n += 1; return Promise.reject(new Error('Connection error.')); })).rejects.toThrow('Connection error.');
    expect(n).toBe(CONNECTION_RETRIES + 1);
    let m = 0;
    await expect(spend({ spentUsd: 0, capUsd: 1 }, 0.1, () => { m += 1; return Promise.reject(new Error('HTTP 500 scripted failure')); })).rejects.toThrow('HTTP 500');
    expect(m).toBe(1);
  });
});

describe('wording found in three or more of the author\'s pieces is their standard wording, not copying', () => {
  const clause = 'the supplier shall indemnify and hold harmless the customer against all claims arising from a breach of this agreement';
  const piece = (i: number, own: string): string => `Clause ${i} opens in its own way with item ${i}. ${clause}. ${own}`;
  const own = ['The fee for the first term is set out in schedule two and falls due on the first day of each quarter without set off.',
    'Either party may end the engagement on ninety days written notice given after the second anniversary of the start date.',
    'The parties will meet each month to review the service levels and agree any credits that have fallen due.',
    'Notices are sent to the address on the cover page and take effect two working days after posting.'];
  const pieces = own.map((o, i) => piece(i, o));
  const output = `For this engagement, ${clause}. ${own[1]}`;

  it('without the pieces the standard clause is a long shared run; with them only what one piece says is counted', () => {
    expect(overlapIndex(pieces)(output).longestShared).toBeGreaterThanOrEqual(19);
    const read = overlapIndex(pieces, standardWordingOf(pieces))(`For this engagement, ${clause}. And nothing else is shared here at all.`);
    expect(read.longestShared).toBeLessThan(12);
    expect(read.standard).toBeGreaterThan(0);
  });
  it('a run lifted from one piece is still copying, beside standard wording or not', () => {
    expect(overlapIndex(pieces, standardWordingOf(pieces))(output).longestShared).toBeGreaterThanOrEqual(12);
    // a standard phrase inside a sentence lifted from one piece does not cut the sentence in two
    const phrase = 'in accordance with the terms of';
    const docs = [`Alpha one two three four five ${phrase} six seven eight nine ten eleven.`, `Beta opens here ${phrase} and goes on its own way entirely.`, `Gamma starts ${phrase} then ends differently from the rest.`];
    const lifted = `one two three four five ${phrase} six seven eight nine ten eleven`;
    expect(overlapIndex(docs)(lifted).longestShared).toBe(17);
    expect(overlapIndex(docs, standardWordingOf(docs))(lifted).longestShared).toBe(17);
  });
  it('with fewer than three separate pieces nothing is left out, and one piece given three times is one piece', () => {
    expect(standardWordingOf(pieces.slice(0, 2))).toEqual([]);
    expect(standardWordingOf([pieces[0], pieces[0], pieces[0]])).toEqual([]);
    expect(overlapIndex(pieces, [])(output)).toEqual(overlapIndex(pieces)(output));
    expect(standardWordingOf(pieces)).toEqual([...standardWordingOf(pieces)].sort());
  });
});

describe('no section headings, where the author writes none, is proposed as shown', () => {
  const body = (i: number): string => Array.from({ length: 40 }, (_, k) => `In practice the team reviewed item ${k + i} against the checklist and recorded what changed in the log.`).join(' ');
  const headed = (i: number): string => `# Title ${i}\n\n## First part\n\n${body(i)}\n\n## Second part\n\n${body(i + 1)}`;
  const find = (rules: ReturnType<typeof deriveContrastRules>) => rules.find((r) => r.requirement.measurement?.observer === 'HEADINGS' && r.requirement.measurement.params.maxPer1000 === 0);
  it('proposed when no piece has one, marked weak so it is suggested as shown; a headed text breaks it', () => {
    const rules = deriveContrastRules([0, 1, 2, 3].map((i) => ({ id: `a${i}.md`, text: `# Title ${i}\n\n${body(i)}` })), [4, 5].map((i) => ({ id: `a${i}.md`, text: body(i) })), [headed(0), headed(1)], 'MACHINE_DISCOVERED');
    const rule = find(rules);
    expect(rule?.requirement.statement).toBe('Write a piece without section headings, as I do.');
    expect(rule?.conformance.weak).toBe(true);
    expect(rule?.requirement.evidence).toMatch(/none of your 4 pieces of 300 words or more has a section heading; 2 of the model's 2 plain drafts have one/);
    expect(measure(headed(0), rule!.requirement.measurement!).verdict).toBe('VIOLATED');
    expect(measure(body(0), rule!.requirement.measurement!).verdict).toBe('MET');
  });
  it('not proposed when a piece of the author\'s has headings', () => {
    const rules = deriveContrastRules([{ id: 'a0.md', text: headed(0) }, ...[1, 2, 3].map((i) => ({ id: `a${i}.md`, text: body(i) }))], [], [headed(0), headed(1)], 'MACHINE_DISCOVERED');
    expect(find(rules)).toBeUndefined();
  });
});
