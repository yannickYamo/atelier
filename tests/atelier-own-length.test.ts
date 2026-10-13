// The length an output is held to when the request names none: the span of the author's own pieces.
// Found on ten explanations built from twelve examples of 202 to 217 words: the skill said "about 200 words",
// nothing checked it, and three outputs ran 238 to 248. The run writes two drafts by default: where the author's
// length applies, it now chooses between them by it, after every rule. No extra draft is written.
import { describe, it, expect } from 'vitest';
import { ownLengthBand, againstBand } from '../core/intake/length.js';
import { lengthSpan } from '../core/compiler/voice.js';
import { ownLengthApplies, wordsOutside, draftOrder, type DraftScore } from '../cli/commands/invoke.js';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i % 7}`).join(' ') + '.';

describe('the band comes from the pieces, and every piece is inside it', () => {
  it('the span is the shortest and the longest piece, and needs three', () => {
    expect(lengthSpan([words(202), words(217), words(210)])).toEqual([202, 217]);
    expect(lengthSpan([words(202), words(217)])).toBeNull();
  });
  it('the band is the span widened by its own width on each side', () => {
    expect(ownLengthBand([202, 217])).toEqual([187, 232]);
    expect(ownLengthBand([300, 3000])).toEqual([1, 5700]);
    expect(ownLengthBand([150, 150])).toEqual([149, 151]);
    expect(ownLengthBand(null)).toBeNull();
    expect(ownLengthBand(undefined)).toBeNull();
  });
  it('a count is inside it, short of it or long of it', () => {
    expect([186, 187, 232, 233].map((n) => againstBand(n, [187, 232]))).toEqual(['short', 'met', 'met', 'long']);
  });
});

describe('it applies in one context, and is said to', () => {
  const yes = { stated: false, asked: false, shape: false, contract: false, answers: false, outOfRegister: false, sections: false };
  it('a request that names no length, to a skill that writes pieces in their register', () => {
    expect(ownLengthApplies(yes)).toBe(true);
  });
  it('not when the request states a length, asks for detail or brevity, or for a shape of its own', () => {
    for (const k of ['stated', 'asked', 'shape'] as const) expect(ownLengthApplies({ ...yes, [k]: true }), k).toBe(false);
  });
  it('not for answers, a contract check, a request out of register, or a piece planned by section', () => {
    for (const k of ['answers', 'contract', 'outOfRegister', 'sections'] as const) expect(ownLengthApplies({ ...yes, [k]: true }), k).toBe(false);
  });
});

describe('drafts are chosen by it after every rule, and before the finer features', () => {
  const base: DraftScore = { req: 0, taste: 0, tells: 0, all: 0, signal: null, style: 0 };
  it('how far outside the band a count is', () => {
    expect([150, 187, 232, 248].map((n) => wordsOutside(n, [187, 232]))).toEqual([37, 0, 0, 16]);
  });
  it('of two drafts that break the same rules, the one at the author\'s length is chosen', () => {
    expect(draftOrder({ ...base, lengthOff: 0, outside: 3 }, { ...base, lengthOff: 16, outside: 0 })).toBeLessThan(0);
    expect(draftOrder({ ...base, lengthOff: 6 }, { ...base, lengthOff: 16 })).toBeLessThan(0);
  });
  it('a draft at the right length that breaks a rule does not win on length', () => {
    expect(draftOrder({ ...base, req: 1, lengthOff: 0 }, { ...base, req: 0, lengthOff: 40 })).toBeGreaterThan(0);
    expect(draftOrder({ ...base, all: 1, lengthOff: 0 }, { ...base, all: 0, lengthOff: 40 })).toBeGreaterThan(0);
  });
  it('where it does not apply, nothing changes: no length is counted', () => {
    expect(draftOrder({ ...base, outside: 1 }, { ...base, outside: 2 })).toBeLessThan(0);
  });
});

describe('what the run says, and which stated lengths a request sets aside', () => {
  it('the length line names the span, and the band only when the output is outside it', async () => {
    const { ownLengthLine } = await import('../cli/commands/invoke.js');
    expect(ownLengthLine(words(210), [187, 232], [202, 217])).toBe('Length: 210 words. The request names none; your pieces run 202 to 217, shortest to longest.');
    expect(ownLengthLine(words(248), [187, 232], [202, 217])).toBe('Length: 248 words. The request names none; your pieces run 202 to 217, shortest to longest, and this is long of what they span (187 to 232).');
  });
  it('a request that states a length sets aside the method\'s length in the same unit, and no other', async () => {
    const { lengthRulesTheRequestSets } = await import('../cli/commands/invoke.js');
    const { statedLength } = await import('../core/intake/length.js');
    const rule = (id: string, unit: string) => ({ requirementId: id, statement: `${id}.`, measurement: { observer: 'LENGTH', params: { unit: [unit], max: 100 } } });
    const std = { requirements: [rule('words', 'words'), rule('chars', 'characters'), rule('longest', 'sentence'), { requirementId: 'other', statement: 'x', measurement: { observer: 'LEXICON', params: { terms: ['x'] } } }] } as never;
    expect(lengthRulesTheRequestSets(std, statedLength('Write about 600 words on tides.')).map((q) => q.requirementId)).toEqual(['words']);
    expect(lengthRulesTheRequestSets(std, statedLength('Explain tides in detail.'))).toEqual([]);
    expect(lengthRulesTheRequestSets(null, statedLength('Write about 600 words on tides.'))).toEqual([]);
  });
  it('the citations line counts what was looked up and names what was not a line', async () => {
    const { lineCitationsLine } = await import('../cli/commands/invoke.js');
    const material = [{ name: 'notes.md', text: 'One.\n\nThree.' }];
    expect(lineCitationsLine('See notes.md:1 and notes.md:2.', material)).toBe('Line citations: 1 of 2 point at a line of the material with something on it; not: notes.md:2 (a blank line or a lone bracket).');
    expect(lineCitationsLine('Nothing cited.', material)).toContain('none found in the output');
  });
});

// One more draft, told everything the first did not hold: the method's missing parts, a bad citation, the length.
describe('what a draft left unmet, and what the one more draft is told', () => {
  const rule = (id: string, observer: string, obligation?: string) => ({ requirementId: id, statement: `${id} must hold.`, materiality: 'REQUIRED', ...(obligation ? { obligation } : {}), measurement: { observer, params: {} } });
  const std = { requirements: [rule('x1', 'PRESENCE', 'DELIVERABLE'), rule('x2', 'LINES', 'EXECUTION'), rule('c1', 'LEXICON')] } as never;
  const report = (broken: readonly string[]) => ({ failed: broken.length > 0, checked: ['x1', 'x2', 'c1'].map((id) => ({ requirementId: id, materiality: 'REQUIRED', result: { verdict: broken.includes(id) ? 'VIOLATED' : 'MET', spans: [], value: 0, detail: `${id} detail` } })) }) as never;
  it('a missing part of the method and a bad citation are unmet; a banned word is a sentence to rewrite, and is not', async () => {
    const { unmetReader } = await import('../cli/commands/invoke.js');
    const read = unmetReader(std, null);
    expect(read?.({ output: words(210), report: report(['x1', 'x2', 'c1']) }).map((u) => u.id)).toEqual(['x1', 'x2']);
    expect(read?.({ output: words(210), report: report([]) })).toEqual([]);
  });
  it('the length is unmet when the request named none and the draft is outside what the pieces span', async () => {
    const { unmetReader, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const read = unmetReader(std, { band: [187, 232], span: [202, 217] });
    expect(read?.({ output: words(210), report: report([]) })).toEqual([]);
    expect(read?.({ output: words(248), report: report(['x1']) })).toEqual([
      { id: 'x1', statement: 'x1 must hold.', detail: 'x1 detail' },
      { id: LENGTH_ID, statement: 'Write it at the length my pieces run: 202 to 217 words', detail: '248 words, 16 too many', off: 16, aim: 'aim for 216 words or fewer', whole: true }]);
  });
  it('a skill with nothing of the kind to read has no such step', async () => {
    const { unmetReader } = await import('../cli/commands/invoke.js');
    expect(unmetReader({ requirements: [rule('c1', 'LEXICON')] } as never, null)).toBeNull();
    expect(unmetReader({ requirements: [] } as never, { band: [1, 2], span: [1, 2] })).not.toBeNull();
  });
  it('the note names each with what the check found, and carries the draft it is to keep what it can of', async () => {
    const { redraftNote } = await import('../cli/commands/invoke.js');
    const note = redraftNote([{ id: 'x1', statement: 'Open with a Verdict section.', detail: 'no "Verdict" section' }, { id: 'length', statement: 'Write it at the length my pieces run: 202 to 217 words', detail: '248 words' }], 'The first draft.\n');
    expect(note).toContain('- Open with a Verdict section. (no "Verdict" section)\n- Write it at the length my pieces run: 202 to 217 words (248 words)');
    expect(note).toContain('Keep what the earlier draft says wherever it can stay.');
    expect(note).toContain('<earlier-draft>\nThe first draft.\n</earlier-draft>');
  });
  it('a second draft is nearer with fewer things unmet, or as many and less far off', async () => {
    const { nearer } = await import('../cli/commands/invoke.js');
    const length = (off: number) => ({ id: 'length', statement: 's', detail: 'd', off });
    const x1 = { id: 'x1', statement: 's', detail: 'd' };
    expect(nearer([], [x1])).toBe(true);
    expect(nearer([length(10)], [length(50)])).toBe(true);
    expect(nearer([length(50)], [length(50)])).toBe(false);
    expect(nearer([x1, length(1)], [length(50)])).toBe(false);
    expect(nearer([x1], [x1])).toBe(false);
  });
});

describe('the one more draft: what is kept, what is said, what is recorded', () => {
  interface Out { output: string; repair: null | { violatedBefore: string[]; notes?: string[] }; report: { failed: boolean; checked: { requirementId: string; materiality: string; result: { verdict: string; spans: never[]; value: number; detail: string } }[] } }
  const made = (text: string, broken: readonly string[] = []): Out => ({ output: text, repair: null, report: { failed: broken.length > 0, checked: broken.map((id) => ({ requirementId: id, materiality: 'REQUIRED', result: { verdict: 'VIOLATED', spans: [], value: 1, detail: `${id} is missing` } })) } });
  // a draft of `n` words; one starting "NOSECTION" lacks the required section x1; one starting "BREAKS" breaks another rule
  const drive = async (first: string, second: string | Error) => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const notes: string[] = []; const asked: string[] = [];
    const refine = async (t: string) => made(t, [...(t.startsWith('NOSECTION') ? ['x1'] : []), ...(t.startsWith('BREAKS') ? ['c9'] : [])]) as never;
    const unmet = (d: { output: string; report: Out['report'] }) => {
      const n = d.output.split(/\s+/).length;
      return [...d.report.checked.filter((c) => c.requirementId === 'x1').map(() => ({ id: 'x1', statement: 'Open with a Verdict section.', detail: 'no "Verdict" section' })),
        ...(n > 232 ? [{ id: LENGTH_ID, statement: 'length', detail: `${n} words`, off: n - 232 }] : [])];
    };
    const run = withRedraft(refine, { unmet: unmet as never, notes, redraft: async (note) => { asked.push(note); if (second instanceof Error) throw second; return second; } });
    return { out: await run(first) as unknown as Out, notes, asked };
  };
  it('nothing unmet: delivered as written, with no second call', async () => {
    const r = await drive(words(210), words(200));
    expect(r.asked).toEqual([]);
    expect(r.out.output).toBe(words(210));
  });
  it('long, then inside: kept, said as two lengths, and no rule recorded as broken', async () => {
    const r = await drive(words(272), words(226));
    expect(r.asked[0]).toContain(`<earlier-draft>\n${words(272)}\n</earlier-draft>`);
    expect(r.out.output).toBe(words(226));
    expect(r.notes).toEqual(['Written again for length: the first draft ran 272 words, outside what your pieces span; it is now inside it.']);
    expect(r.out.repair?.violatedBefore).toEqual([]);
  });
  it('long, then nearer and still long: kept and said so; no nearer: the first stands', async () => {
    expect((await drive(words(282), words(242))).notes[0]).toContain('it now runs 242 words, nearer and still outside');
    const same = await drive(words(282), words(290));
    expect(same.out.output).toBe(words(282));
    expect(same.notes[0]).toContain('one more draft did not do better, so the first is kept');
  });
  it('a length is never bought with a rule: a draft at the right length that drops the section is not kept', async () => {
    const r = await drive(words(272), `NOSECTION ${words(200)}`);
    expect(r.out.output).toBe(words(272));
  });
  it('a missing section, then present: kept, and the rule is what is recorded as broken before', async () => {
    const r = await drive(`NOSECTION ${words(200)}`, words(205));
    expect(r.out.output).toBe(words(205));
    expect(r.notes[0]).toMatch(/^Written again: the first draft left out 1 thing\(s\) the method requires \(x1: "Open with a Verdict section\."\); it now leaves out 0\.$/);
    expect(r.out.repair?.violatedBefore).toEqual(['x1']);
  });
  it('a second draft that holds the section and breaks another rule is not kept', async () => {
    expect((await drive(`NOSECTION ${words(200)}`, `BREAKS ${words(200)}`)).out.output).toBe(`NOSECTION ${words(200)}`);
  });
  it('a draft that could not be written costs the person nothing, and is said', async () => {
    const r = await drive(`NOSECTION ${words(200)}`, new Error('no model\nstack'));
    expect(r.out.output).toBe(`NOSECTION ${words(200)}`);
    expect(r.notes[0]).toContain('the draft to add them could not be written (no model)');
  });
});

describe('after a miss of length the writer is given something to aim for, and one more try', () => {
  it('the aim is inside the limit by as much as the draft was outside it, and by a tenth of the limit at most', async () => {
    const { lengthAim } = await import('../cli/commands/invoke.js');
    expect(lengthAim(441, 220, 420)).toBe('aim for 399 words or fewer');
    expect(lengthAim(600, 220, 420)).toBe('aim for 378 words or fewer');
    expect(lengthAim(180, 220, 420)).toBe('aim for 242 words or more');
    expect(lengthAim(300, 220, 420)).toBeUndefined();
  });
  it('a stated length in words that a draft misses is read with how far and what to aim for', async () => {
    const { unmetReader, redraftNote } = await import('../cli/commands/invoke.js');
    const std = { requirements: [{ requirementId: 'x7', statement: 'Between 220 and 420 words.', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } } }] } as never;
    const report = { failed: true, checked: [{ requirementId: 'x7', materiality: 'REQUIRED', result: { verdict: 'VIOLATED', spans: [], value: 471, detail: '471 words (220 to 420): long by 51' } }] } as never;
    const [miss] = unmetReader(std, null)?.({ output: 'x', report }) ?? [];
    expect(miss).toMatchObject({ id: 'x7', off: 51, aim: 'aim for 378 words or fewer' });
    expect(redraftNote([miss], 'd')).toContain('- Between 220 and 420 words. (471 words (220 to 420): long by 51; aim for 378 words or fewer)');
  });
  it('still long after one more draft, and only length unmet: once more, and no third', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const queue = [words(450), words(410), words(300)]; const asked: string[] = []; const notes: string[] = [];
    const made = (t: string) => ({ output: t, repair: null, report: { failed: false, checked: [] } }) as never;
    const unmet = (d: { output: string }) => { const n = d.output.split(/\s+/).length; return n > 420 ? [{ id: LENGTH_ID, statement: 'length', detail: `${n} words`, off: n - 420, aim: 'aim for 399 words or fewer' }] : []; };
    const out = await withRedraft(async (t) => made(t), { unmet: unmet, notes, redraft: async (note) => { asked.push(note); return queue.shift() ?? ''; } })(words(480)) as unknown as { output: string };
    expect(asked).toHaveLength(2);
    expect(out.output).toBe(words(410));
    expect(notes).toHaveLength(2);
  });
});

describe('a draft that only runs long is cut, not written again', () => {
  it('the writer is told how many words to remove from the piece it is shown, and what to leave alone', async () => {
    const { trimNote } = await import('../cli/commands/invoke.js');
    const note = trimNote([{ id: 'x7', statement: 'Between 220 and 420 words.', detail: '439 words (220 to 420): long by 19', off: 19, aim: 'aim for 401 words or fewer', whole: true }], 'the draft');
    expect(note).toContain('runs too long: 439 words (220 to 420): long by 19.');
    expect(note).toContain('until it runs 401 words or fewer (at least 19 fewer than now)');
    expect(note).toContain('Keep every heading, section, table, list item, name, figure and citation exactly as it is');
    expect(note).toContain('<earlier-draft>\nthe draft\n</earlier-draft>');
    expect(note).not.toMatch(/Write the whole piece again/);
  });
  it('it is cut up to three times, each pass from the last, and stops when it is inside', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const words = (n: number): string => Array.from({ length: n }, () => 'w').join(' ');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const unmet = (x: { output: string }) => { const n = x.output.split(/\s+/).length; return n > 420 ? [{ id: LENGTH_ID, statement: 'length', detail: `${n} words`, off: n - 420, aim: 'aim for 400 words or fewer', whole: true as const }] : []; };
    const sizes = [450, 430, 418, 300]; const notes: string[] = [];
    const out = await withRedraft(async (t: string) => d(t), { unmet, notes: [], redraft: async (note) => { notes.push(note); return words(sizes.shift()!); } })(words(469));
    expect(out.output.split(/\s+/).length).toBe(418);
    expect(notes).toHaveLength(3);
    for (const n of notes) expect(n).toMatch(/^The draft below holds what this work requires and runs too long/);
  });
  it('a draft that also lacks something is written again as before, never trimmed', async () => {
    const { withRedraft, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const d = (text: string) => ({ output: text, report: { failed: false, checked: [], unchecked: [] }, repair: null }) as never;
    const notes: string[] = [];
    await withRedraft(async (t: string) => d(t), { unmet: (x) => (x.output === 'first' ? [{ id: 'x1', statement: 'a section', detail: 'missing' }, { id: LENGTH_ID, statement: 'length', detail: '500 words', off: 80, aim: 'aim for 400 words or fewer' }] : []),
      notes: [], redraft: async (note) => { notes.push(note); return 'second'; } })('first');
    expect(notes[0]).toMatch(/^An earlier draft did not hold what this work requires/);
  });
});

describe('a trim is for the length of the whole piece', () => {
  it('a section that runs long is written again for, never trimmed as if it were the piece', async () => {
    const { unmetReader, redraftNote, trimNote } = await import('../cli/commands/invoke.js');
    const section = { requirementId: 's1', statement: 'Keep the Summary section under 30 words.', materiality: 'REQUIRED', obligation: 'DELIVERABLE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_STATED',
      measurement: { observer: 'LENGTH', params: { unit: ['words'], in: ['Summary'], need: 1, max: 29 } } };
    const report = { failed: true, unchecked: [], checked: [{ requirementId: 's1', materiality: 'REQUIRED', result: { verdict: 'VIOLATED', detail: '41 words (at most 29): long by 12', spans: [], value: 41 } }] } as never;
    const [miss] = unmetReader({ requirements: [section] } as never, null)?.({ output: 'x', report }) ?? [];
    expect(miss).toMatchObject({ id: 's1', off: 12 });
    expect(miss.whole).toBeUndefined();
    // so the writer is told to write the piece again with the section named, not to cut the piece to 26 words
    expect(redraftNote([miss], 'd')).toContain('Keep the Summary section under 30 words.');
    expect(trimNote([{ ...miss, whole: true }], 'd')).toContain('words or fewer');
  });
  it('where two limits are both passed, the one missed by most sets how much to cut and to what', async () => {
    const { trimNote } = await import('../cli/commands/invoke.js');
    const note = trimNote([{ id: 'a', statement: 'a', detail: '430 words', off: 10, aim: 'aim for 410 words or fewer', whole: true }, { id: 'b', statement: 'b', detail: '430 words', off: 80, aim: 'aim for 330 words or fewer', whole: true }], 'd');
    expect(note).toContain('until it runs 330 words or fewer (at least 80 fewer than now)');
  });
});

