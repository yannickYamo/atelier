// tests/atelier-composite-instructions.test.ts — WHAT TO DO NEVER HOLDS TWO INSTRUCTIONS THAT CANNOT BOTH BE FOLLOWED.
//
// Routes by which two contradictory instructions still reached a composite skill, each held here:
//   `--set <id>=required` on a rule the person's own answer had set aside made it instruct beside the rule that answer
//   chose ("Use headings…" and "Write in continuous prose with no headings and no lists" both shipped);
//   a worded quantity on a subject a count measures ("long, winding sentences of thirty words or more") was never
//   compared with the count's band ("a median under 6 words"), nor with a "both" range;
//   a ban on a general subject did not cover its kinds ("Never use lists of any kind" against "Use bullet lists");
//   a conflict the person answered, opened again by the final guard, was shown as a plain open question with no reason
//   and left out of the open count; a "both" range was shown at its carrier's limits, not the limits it is built with;
//   wordings the keywords cannot see: a model reads the final instructions once, and every pair it names is asked.
import { describe, it, expect } from 'vitest';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { buildTraitTable, relationOf, singular, labelOf, type TraitClass } from '../core/composite/traits.js';
import { composeSelection, describeComposite, openQuestions, standOf, type CompositeAuthor, type CompositeDecision, type CompositeRecord, type ConflictAnswer } from '../core/composite/selection.js';
import { readContradictions } from '../core/composite/contradictions.js';
import { processSpendByPurpose, type InferenceClient } from '../core/inference/client.js';
import { decisionsFor, instructionLines, openLine } from '../cli/commands/composite.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const worded = (statement: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, kind: 'GENERATIVE' });
const counted = (measurement: Measurement): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement: 'counted', measurement, kind: 'GENERATIVE' });
const SL = (medianMax: number, p90Max: number): Measurement => ({ observer: 'SENTENCE_LENGTH', params: { medianMax, p90Max } });
const sentences = (id: string, m: number, p: number): Requirement => rule(id, `I keep sentences short: a median under ${m} words, and nine in ten under ${p}.`, SL(m, p));
const author = (name: string, classes: TraitClass[] = []): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired: classes.length ? 'everything' : null, classes });
const instructs = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly && !d.mergedInto;

interface Case { readonly rules: Requirement[]; readonly source: Record<string, string> }
const setup = (byAuthor: Record<string, Requirement[]>): Case => ({
  rules: Object.values(byAuthor).flat(),
  source: Object.fromEntries(Object.entries(byAuthor).flatMap(([a, rs]) => rs.map((r) => [r.requirementId, a]))),
});
const tableOf = (c: Case): ReturnType<typeof buildTraitTable> => buildTraitTable(c.rules, (id) => c.source[id]);
const nOf = (rec: { conflicts: readonly { n: number; sides: readonly { id: string }[] }[] }, a: string, b: string): number =>
  rec.conflicts.find((x) => x.sides.some((s) => s.id === a) && x.sides.some((s) => s.id === b))?.n ?? -1;

/** Every pair of rules that will be ratified REQUIRED or will instruct, from two authors, that contradict and were not answered "both". */
function shippedContradictions(rec: CompositeRecord, rules: readonly Requirement[], changes: ReadonlyMap<string, string> = new Map()): string[] {
  const byId = new Map(rules.map((p) => [p.requirementId, p]));
  const ruled = new Map(decisionsFor(rec, rules, new Map(), changes).map((d) => [d.id, d]));
  const dec = new Map(rec.decisions.map((d) => [d.id, d]));
  const live = rec.decisions.filter((d) => ruled.get(d.id)?.decision === 'APPROVE' && (ruled.get(d.id)?.materiality === 'REQUIRED' || instructs(d)) && !d.mergedInto && !d.shownOnly);
  const out: string[] = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i]; const b = live[j];
    const read = (d: CompositeDecision): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement: byId.get(d.id)?.statement ?? '', measurement: dec.get(d.id)?.range ?? byId.get(d.id)?.measurement, kind: 'GENERATIVE' });
    if (a.author === b.author || relationOf(read(a), read(b)) !== 'CONFLICT') continue;
    const both = rec.conflicts.some((c) => c.answer === 'both' && c.resolvedBy === 'ANSWER' && c.sides.some((s) => s.id === a.id) && c.sides.some((s) => s.id === b.id));
    if (!both) out.push(`${a.id}/${b.id}`);
  }
  return out;
}

// ── 1. ONE PATH: --set GOES THROUGH THE GUARD ───────────────────────────────────────────────────────
describe('a rule made required with --set goes through the same guard', () => {
  const x = setup({
    ada: [rule('p2', 'Use headings to break up the piece.'), rule('p3', 'Use bullet lists for any set of three items.')],
    bram: [rule('p11', 'Write in continuous prose with no headings and no lists.'), rule('p12', 'Use contractions freely.')],
  });
  const t = tableOf(x);
  const authors = [author('ada', ['structure']), author('bram', ['structure', 'voice'])];
  const n = nOf(t, 'p2', 'p11');
  it('the reviewer\'s run: answer A for headings, then --set the other side required: the --set wins, and only it ships', () => {
    expect(n).toBeGreaterThan(0);
    const changes = new Map([['p11', 'required']]);
    const rec = composeSelection(t, x.rules, authors, { [n]: 'A' }, { forced: new Set(['p11']) });
    const ruled = new Map(decisionsFor(rec, x.rules, new Map(), changes).map((d) => [d.id, d]));
    expect(ruled.get('p11')).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
    expect(ruled.get('p2')?.decision).toBe('REJECT');
    expect(shippedContradictions(rec, x.rules, changes)).toEqual([]);
    // said on the screen, in one line, and the conflict says how it stands
    const screen = describeComposite(rec, (id) => x.rules.find((r) => r.requirementId === id)?.statement ?? id);
    expect(screen.filter((l) => l.startsWith('--set p11=required:'))).toHaveLength(1);
    expect(screen.join('\n')).toContain(`which you chose in conflict ${n}; your --set is your latest word, so p2 is set aside.`);
    const c = rec.conflicts.find((y) => y.n === n);
    expect(c).toMatchObject({ answer: 'B', resolvedBy: 'SET' });
    expect(c && standOf(c, rec.decisions.find((d) => d.id === 'p2'), rec.decisions.find((d) => d.id === 'p11'))).toBe('→ bram (your --set, your latest word)');
  });
  it('a --set against a rule that instructs by admiration alone wins without a note', () => {
    const rec = composeSelection(t, x.rules, [author('ada', ['structure']), author('bram')], {}, { forced: new Set(['p11']) });
    expect(instructs(rec.decisions.find((d) => d.id === 'p11'))).toBe(true);
    expect(instructs(rec.decisions.find((d) => d.id === 'p2'))).toBe(false);
    expect(shippedContradictions(rec, x.rules, new Map([['p11', 'required']]))).toEqual([]);
  });
  it('two --sets that cannot both be followed: neither ships, and the screen asks', () => {
    const changes = new Map([['p11', 'required'], ['p2', 'required']]);
    const rec = composeSelection(t, x.rules, [author('ada'), author('bram')], {}, { forced: new Set(['p11', 'p2']) });
    const ruled = new Map(decisionsFor(rec, x.rules, new Map(), changes).map((d) => [d.id, d]));
    expect(ruled.get('p11')?.decision).toBe('REJECT');
    expect(ruled.get('p2')?.decision).toBe('REJECT');
    expect(ruled.get('p2')?.suggested?.why).toMatch(/^--set p2=required could not instruct/);
    expect(rec.notes?.some((l) => l.includes('--set p2=required and --set p11=required cannot both be followed'))).toBe(true);
    expect(shippedContradictions(rec, x.rules, changes)).toEqual([]);
  });
});

// ── 2. WORDED NUMBERS AGAINST COUNTED BANDS ─────────────────────────────────────────────────────────
describe('a worded quantity on a counted subject is compared with the band', () => {
  const m1 = SL(6, 7); const m3 = SL(23, 49);
  it('the reviewer\'s cases: non-overlap is a conflict, room for both is not', () => {
    const p9 = worded('Write long, winding sentences of thirty words or more.');
    expect(relationOf(p9, counted(m1))).toBe('CONFLICT');
    expect(relationOf(p9, counted(m3))).toBe('CONFLICT'); // every sentence 30 or more puts the median at 30, over 23
    expect(relationOf(counted(m1), p9)).toBe('CONFLICT');
    for (const s of ['Write long sentences.', 'Write long, winding sentences.']) {
      expect(relationOf(worded(s), counted(m1))).toBe('CONFLICT');
      expect(relationOf(worded(s), counted(m3))).not.toBe('CONFLICT');
    }
    expect(relationOf(worded('Prefer sentences of forty words.'), counted(m1))).toBe('CONFLICT');
    expect(relationOf(worded('Prefer sentences of forty words.'), counted(m3))).toBe('CONFLICT');
    expect(relationOf(worded('Let sentences run to thirty words or more.'), counted(m3))).not.toBe('CONFLICT');
    expect(relationOf(worded('Keep sentences under eight words.'), counted(m1))).toBe('SAME');
    expect(relationOf(worded('Avoid long sentences.'), counted(m1))).not.toBe('CONFLICT');
  });
  it('paragraph length, word count, headings and lists', () => {
    expect(relationOf(worded('Let a paragraph run long when the argument needs room.'), counted({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 2 } }))).toBe('CONFLICT');
    expect(relationOf(worded('Keep paragraphs short.'), counted({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 2 } }))).not.toBe('CONFLICT');
    expect(relationOf(worded('Keep it under 500 words.'), counted({ observer: 'LENGTH', params: { min: 800, max: 1200 } }))).toBe('CONFLICT');
    expect(relationOf(worded('Write at least 1,500 words.'), counted({ observer: 'LENGTH', params: { min: 800, max: 1200 } }))).toBe('CONFLICT');
    expect(relationOf(worded('Write 900 to 1,000 words.'), counted({ observer: 'LENGTH', params: { min: 800, max: 1200 } }))).not.toBe('CONFLICT');
    expect(relationOf(worded('Use headings to break up the piece.'), counted({ observer: 'HEADINGS', params: { maxPer1000: 0 } }))).toBe('CONFLICT');
    expect(relationOf(worded('Never use headings.'), counted({ observer: 'HEADINGS', params: { minPer1000: 2 } }))).toBe('CONFLICT');
    const lists = counted({ observer: 'FEATURE', params: { feature: ['listItem'], minValue: 2, maxValue: 9 } });
    expect(relationOf(worded('Never use lists of any kind.'), lists)).toBe('CONFLICT');
    expect(relationOf(worded('Use bullet lists for options.'), lists)).not.toBe('CONFLICT');
  });
  it('the reviewer\'s run: bram\'s thirty-word sentences never ship with a "both" range under them', () => {
    const x = setup({ ada: [sentences('m1', 6, 7)], bram: [rule('p9', 'Write long, winding sentences of thirty words or more.'), sentences('m3', 23, 49)] });
    const t = tableOf(x);
    expect(nOf(t, 'm1', 'p9')).toBeGreaterThan(0);
    const rec = composeSelection(t, x.rules, [author('ada', ['pace']), author('bram', ['pace'])], { [nOf(t, 'm1', 'm3')]: 'both' });
    const carrier = rec.decisions.find((d) => d.range);
    expect(carrier?.range).toEqual(SL(23, 49));
    expect(instructs(carrier) && instructs(rec.decisions.find((d) => d.id === 'p9'))).toBe(false);
    expect(shippedContradictions(rec, x.rules)).toEqual([]);
  });
});

// ── 3. A SUBJECT COVERS ITS KINDS ───────────────────────────────────────────────────────────────────
describe('a ban on a general subject covers its kinds', () => {
  const pairs: [string, string][] = [
    ['Use bullet lists for options.', 'Never use lists of any kind.'],
    ['Use numbered lists for steps.', 'Never use lists of any kind.'],
    ['Use subheadings to break up long sections.', 'Never use headings.'],
    ['Set long quotations as block quotes.', 'Never use quotes.'],
    ['Walk through a worked example.', 'Avoid examples.'],
  ];
  for (const [a, b] of pairs) it(`${a} / ${b}`, () => { expect(relationOf(worded(a), worded(b))).toBe('CONFLICT'); expect(relationOf(worded(b), worded(a))).toBe('CONFLICT'); });
  it('a ban on one kind leaves the general subject and its other kinds', () => {
    expect(relationOf(worded('Never use subheadings.'), worded('Use headings for each section.'))).not.toBe('CONFLICT');
    expect(relationOf(worded('Avoid block quotes.'), worded('Use quotes from the interview.'))).not.toBe('CONFLICT');
  });
  it('the reviewer\'s five authors: the list ban meets both kinds of list in the table, and neither pair ships', () => {
    const x = setup({
      esme: [rule('p7', 'Use numbered lists for steps.'), rule('p8', 'Use bullet lists for options.')],
      faro: [rule('p12', 'Never use lists of any kind.')],
    });
    const t = tableOf(x);
    expect(nOf(t, 'p7', 'p12')).toBeGreaterThan(0);
    expect(nOf(t, 'p8', 'p12')).toBeGreaterThan(0);
    expect(t.conflicts.map((c) => c.label)).toEqual(['lists', 'lists']);
    const rec = composeSelection(t, x.rules, [author('esme', ['structure']), author('faro', ['structure'])]);
    expect(shippedContradictions(rec, x.rules)).toEqual([]);
  });
});

// ── 4. THE MODEL'S READING OF THE FINAL INSTRUCTIONS ────────────────────────────────────────────────
describe('a pair the model reads as impossible to follow together is asked, never resolved', () => {
  const x = setup({ ada: [rule('a1', 'Write as a column of crisp fragments.')], bram: [rule('b1', 'Let every sentence earn its subordinate clause.')] });
  const t = tableOf(x);
  const authors = [author('ada', ['pace']), author('bram', ['pace'])];
  const pair = { a: 'a1', b: 'b1', reason: '"crisp fragments" against "every sentence earns its subordinate clause"' };
  it('the keywords see nothing, so both would instruct without the reading', () => {
    expect(t.conflicts).toEqual([]);
    expect(composeSelection(t, x.rules, authors).decisions.every(instructs)).toBe(true);
  });
  it('with it, neither instructs until answered, and the record says where the question came from', () => {
    const rec = composeSelection(t, x.rules, authors, {}, { modelPairs: [pair] });
    expect(rec.decisions.map((d) => d.outcome)).toEqual(['OPEN', 'OPEN']);
    expect(rec.conflicts).toHaveLength(1);
    expect(rec.conflicts[0]).toMatchObject({ n: 1, provenance: 'read by the model at build', reason: pair.reason, answer: null });
    expect(openQuestions(rec)).toHaveLength(1);
    const screen = describeComposite(rec, (id) => x.rules.find((r) => r.requirementId === id)?.statement ?? id).join('\n');
    expect(screen).toContain(`1. one statement against another (read by the model at build: ${pair.reason})`);
  });
  it('an answer decides it as the person said: A, B or both', () => {
    const a = composeSelection(t, x.rules, authors, { 1: 'A' }, { modelPairs: [pair] });
    expect(a.decisions.map((d) => d.outcome)).toEqual(['SELECTED', 'REJECTED']);
    const both = composeSelection(t, x.rules, authors, { 1: 'both' }, { modelPairs: [pair] });
    expect(both.decisions.every(instructs)).toBe(true);
  });
  it('a pair inside one author, or naming a rule that does not instruct, asks nothing', () => {
    const rec = composeSelection(t, x.rules, [author('ada', ['pace']), author('bram')], {}, { modelPairs: [pair, { a: 'a1', b: 'a1', reason: 'x' }] });
    expect(rec.conflicts).toEqual([]);
  });
  it('the reading: one call, numbered statements with their authors, its own purpose on the ledger, mapped back to ids', async () => {
    const lines = [{ id: 'a1', author: 'ada', statement: 'Write as a column of crisp fragments.' }, { id: 'b1', author: 'bram', statement: 'Let every sentence earn its subordinate clause.' }];
    const sent: string[] = [];
    const client = { complete: (req: { variableBlock: string; toolName: string }) => {
      sent.push(`${req.toolName}\n${req.variableBlock}`);
      return Promise.resolve({ json: { pairs: [{ a: 2, b: 1, reason: 'they clash' }, { a: 1, b: 2, reason: 'again' }, { a: 1, b: 9, reason: 'no such line' }] }, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' });
    } } as unknown as InferenceClient;
    const before = processSpendByPurpose().find((l) => l.purpose === 'composite contradictions')?.calls ?? 0;
    const pairs = await readContradictions(client, { spentUsd: 0, capUsd: 1, maxCalls: 1 }, lines);
    expect(pairs).toEqual([{ a: 'b1', b: 'a1', reason: 'they clash' }]);
    expect(sent).toEqual(['emit_contradictions\n1. (ada) Write as a column of crisp fragments.\n2. (bram) Let every sentence earn its subordinate clause.']);
    expect(processSpendByPurpose().find((l) => l.purpose === 'composite contradictions')?.calls).toBe(before + 1);
    await expect(readContradictions({ complete: () => Promise.resolve({ json: {}, cost: { basis: 'API_METERED', billingUsd: 0 }, termination: 'COMPLETE', modelId: 'm' }) } as unknown as InferenceClient,
      { spentUsd: 0, capUsd: 1 }, lines)).rejects.toThrow(/nothing usable/);
  });
  it('the list it is given is the rules that will instruct, a range at its merged limits', () => {
    const y = setup({ kai: [sentences('k1', 5, 13)], nora: [sentences('n1', 16, 22)] });
    const t2 = tableOf(y);
    const rec = composeSelection(t2, y.rules, [author('kai'), author('nora')], { 1: 'both' });
    expect(instructionLines(rec, y.rules)).toEqual([{ id: 'k1', author: 'kai', statement: 'I keep sentences short: a median under 16 words, and nine in ten under 22.' }]);
  });
});

// ── 5. AN ANSWER OPENED AGAIN IS SAID SO, AND COUNTED ───────────────────────────────────────────────
describe('a conflict the person answered, opened again by the guard', () => {
  // The reviewer's five-author run: "both" for kai and nora makes one range; "B" for lena against otto chooses otto;
  // the range and otto cannot both instruct, and nothing the person said decides between them.
  const x = setup({ kai: [sentences('k1', 5, 13)], lena: [sentences('l1', 40, 49)], nora: [sentences('n1', 16, 22)], otto: [sentences('o1', 11, 12)] });
  const t = tableOf(x);
  const answers: Record<number, ConflictAnswer> = { [nOf(t, 'k1', 'n1')]: 'both', [nOf(t, 'l1', 'o1')]: 'B' };
  const rec = composeSelection(t, x.rules, ['kai', 'lena', 'nora', 'otto'].map((a) => author(a)), answers);
  const statementOf = (id: string): string => x.rules.find((r) => r.requirementId === id)?.statement ?? id;
  const screen = describeComposite(rec, statementOf, (id) => x.rules.find((r) => r.requirementId === id)?.measurement).join('\n');
  const both = rec.conflicts.find((c) => c.n === nOf(t, 'k1', 'n1'));
  const chose = rec.conflicts.find((c) => c.n === nOf(t, 'l1', 'o1'));
  const opener = nOf(t, 'k1', 'o1');
  it('says why, quoting what would ship, and which conflict to answer', () => {
    expect(both?.reopened?.in).toBe(opener);
    expect(both?.reopened?.why).toBe(`your answer "both" would ship two instructions that cannot both be followed: kai's "I keep sentences short: a median under 16 words, and nine in ten under 22." (one range, by your answer "both") and otto's "I keep sentences short: a median under 11 words, and nine in ten under 12.". Neither instructs until you answer conflict ${opener}`);
    expect(screen).toContain(`→ open again: your answer "both" would ship two instructions that cannot both be followed`);
    expect(chose?.reopened?.why).toMatch(/^your answer B would ship two instructions that cannot both be followed/);
  });
  it('counts it among the open questions, so the record, the count and the screen agree', () => {
    const open = openQuestions(rec).map((c) => c.n);
    expect(open).toContain(both?.n);
    expect(open).toContain(chose?.n);
    expect(open).toContain(opener);
    // every conflict whose chosen side does not instruct and is held open is counted open, and is never shown as standing
    const dec = new Map(rec.decisions.map((d) => [d.id, d]));
    for (const c of rec.conflicts) {
      const held = c.sides.some((s) => dec.get(s.id)?.outcome === 'OPEN') && !c.sides.some((s) => instructs(dec.get(s.id)));
      if (held) expect(open).toContain(c.n);
      const stand = standOf(c, dec.get(c.sides[0].id), dec.get(c.sides[1].id));
      if (open.includes(c.n)) expect(stand).not.toMatch(/^→ (?:both|kai|lena|nora|otto) /);
    }
    expect(openLine(rec)).toContain(`${openQuestions(rec).length} conflict(s) kept as open question(s)`);
  });
  it('the screen shows a "both" range at its merged limits, as the build states it', () => {
    const y = setup({ kai: [sentences('k1', 5, 13)], nora: [sentences('n1', 16, 22)] });
    const r = composeSelection(tableOf(y), y.rules, [author('kai'), author('nora')], { 1: 'both' });
    const lines = describeComposite(r, (id) => y.rules.find((p) => p.requirementId === id)?.statement ?? id, (id) => y.rules.find((p) => p.requirementId === id)?.measurement);
    expect(lines.find((l) => l.includes('k1  '))).toContain('I keep sentences short: a median under 16 words, and nine in ten under 22.   (as one range with the other side)');
    const built = decisionsFor(r, y.rules, new Map(), new Map()).find((d) => d.id === 'k1');
    expect(built).toMatchObject({ statement: 'I keep sentences short: a median under 16 words, and nine in ten under 22.' });
  });
});

describe('small readings', () => {
  it('one word as its subject', () => {
    expect(singular('focus')).toBe('focus');
    expect(singular('quizzes')).toBe('quiz');
    expect(singular('status')).toBe('status');
    expect(singular('dashes')).toBe('dash');
    expect(singular('sources')).toBe('source');
  });
  it('a conflict on grammatical person is labelled "person"', () => {
    expect(labelOf(rule('a', 'Never use the first person.'), rule('b', 'Use the first person in the closing paragraph.'))).toBe('person');
  });
});
