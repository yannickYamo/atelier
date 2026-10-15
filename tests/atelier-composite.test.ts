// tests/atelier-composite.test.ts — PIECES BY SEVERAL AUTHORS, COMBINED AS THE PERSON CHOSE (core/composite).
//
// Five invented authors, each with labelled traits:
//   A  question openings, an even rhythm          B  dense evidence, a varied rhythm
//   C  fast pace, fragments                       D  formal, no contractions
//   E  narrative openings
// The expected outcomes are written from those labels, not read off the code: A's openings, B's evidence and C's
// pacing are chosen when admired; D is kept only when admired; E's opening is kept though four of five lack it; the
// A-against-B rhythm conflict (two bands that do not meet) is surfaced and stays a question when nobody answers it.
import { describe, it, expect } from 'vitest';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { detectAuthors, frontMatterAuthor } from '../core/composite/authors.js';
import { buildTraitTable, traitClassOf, traitClassesOf, relationOf, mergedMeasurement } from '../core/composite/traits.js';
import { keywordClasses, readAdmiration } from '../core/composite/admire.js';
import { composeSelection, openQuestions, describeComposite, compositeVoiceOf, type CompositeAuthor } from '../core/composite/selection.js';
import { selectCompositePieces, copyGuardPieces, pieceLabel } from '../core/compiler/voice.js';
import { overlapIndex } from '../core/observers/overlap.js';
import { COPY_LIMIT } from '../cli/eval-run.js';
import type { InferenceClient } from '../core/inference/client.js';
import { decisionsFor, parseAdmire, parseConflictAnswers } from '../cli/commands/composite.js';
import type { Suggestion } from '../core/ratification/suggest.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null, kind: Requirement['kind'] = 'GENERATIVE'): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});

// Each author's proposals, as discovery reads them one author at a time (ids numbered across authors).
const PROPOSALS: readonly (readonly [string, Requirement])[] = [
  ['A', rule('p1', 'Open with a question the reader is already asking.')],
  ['A', rule('m1', 'My sentences vary little: a spread between 0.1 and 0.3.', { observer: 'RHYTHM', params: { minCv: 0.1, maxCv: 0.3 } })],
  ['B', rule('p2', 'Back every claim with a cited figure and its source.')],
  ['B', rule('m2', 'My sentences vary widely: a spread between 0.6 and 0.9.', { observer: 'RHYTHM', params: { minCv: 0.6, maxCv: 0.9 } })],
  ['B', rule('m3', 'Hedge at most 3 times per 1000 words.', { observer: 'HEDGE_RATE', params: { maxPer1000: 3 } })],
  ['C', rule('p3', 'Keep the pace fast with sentence fragments.')],
  ['C', rule('m4', 'Half the sentences run 8 words or fewer.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 8, p90Max: 14 } })],
  ['D', rule('p4', 'Never use contractions; keep a formal register.', null, 'BOUNDARY')],
  ['D', rule('m5', 'Hedge at most 2 times per 1000 words.', { observer: 'HEDGE_RATE', params: { maxPer1000: 2 } })],
  ['E', rule('p5', 'Open on a short scene from a story, then turn to the point.')],
  ['E', rule('p6', 'Close on the line of dialogue that started it.')],
];
const proposals = PROPOSALS.map(([, p]) => p);
const sourceOf = (id: string): string | undefined => PROPOSALS.find(([, p]) => p.requirementId === id)?.[0];
const table = buildTraitTable(proposals, sourceOf);
const row = (id: string) => table.rows.find((r) => r.id === id);
const author = (name: string, admired: string | null, classes: CompositeAuthor['classes']): CompositeAuthor => ({ name, pieces: [`${name.toLowerCase()}.md`], admired, classes });
const LIKES = [author('A', 'the way it opens', ['opening']), author('B', 'how deep the evidence goes', ['evidence']),
  author('C', 'the speed of it', ['pace']), author('D', null, []), author('E', 'the story at the start', ['opening'])];

describe('who wrote which piece is declared, never guessed', () => {
  const piece = (id: string, a?: string) => ({ id, text: `${a ? `---\nauthor: ${a}\n---\n` : ''}Some text by someone.` });
  it('front matter, a folder per author, or --authors; otherwise one author exactly as before', () => {
    expect(frontMatterAuthor('---\ntitle: x\nauthor: "Ada"\n---\nbody')).toBe('Ada');
    expect(detectAuthors([piece('a.md', 'Ada'), piece('b.md', 'Bea')])).toMatchObject({ names: ['Ada', 'Bea'], how: 'FRONT_MATTER' });
    expect(detectAuthors([piece('ada/1.md'), piece('bea/2.md')])).toMatchObject({ names: ['ada', 'bea'], how: 'SUBFOLDERS' });
    expect(detectAuthors([piece('a.md'), piece('b.md')], ['a.md', 'b'])).toMatchObject({ names: ['a', 'b'], how: 'LISTED' });
    // one author: no map at all, so nothing downstream changes
    expect(detectAuthors([piece('a.md'), piece('b.md')])).toBeNull();
    expect(detectAuthors([piece('a.md', 'Ada'), piece('b.md', 'Ada')])).toBeNull();
    // a difference in style is never a difference in author: the prose is not read
    expect(detectAuthors([{ id: 'a.md', text: 'Short. Clipped.' }, { id: 'b.md', text: 'A long, winding, subordinate sentence that goes on.' }])).toBeNull();
  });
});

describe('the trait table: classes and kinds, per author, never pooled', () => {
  it('classes the known pairs right', () => {
    expect(traitClassOf(rule('x', 'Open with a question the reader is already asking.'))).toBe('opening');
    expect(traitClassOf(rule('x', 'Back every claim with a cited figure and its source.'))).toBe('evidence');
    expect(traitClassOf(rule('x', 'Keep the pace fast with sentence fragments.'))).toBe('pace');
    expect(traitClassOf(rule('x', 'Never use contractions; keep a formal register.'))).toBe('voice');
    expect(traitClassOf(rule('x', 'Open on a short scene from a story, then turn to the point.'))).toBe('opening');
    expect(traitClassOf(rule('x', 'x', { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 2 } }))).toBe('pace');
    expect(traitClassOf(rule('x', 'Decide what to cut before drafting anything.'))).toBe('method');
    // a rule about two things carries both, whatever order its words come in
    const one = traitClassesOf(rule('x', 'Let a paragraph run long when the evidence needs it.'));
    const other = traitClassesOf(rule('x', 'When the evidence needs it, let a paragraph run long.'));
    expect(one).toEqual(['evidence', 'pace']);
    expect(other).toEqual(one);
    // and the person's lines, read by their words when no model reads them
    expect(keywordClasses('the way it opens', ['opening', 'pace'])).toEqual(['opening']);
    expect(keywordClasses('how deep the evidence goes', ['evidence', 'pace'])).toEqual(['evidence']);
    expect(keywordClasses('the speed of it', ['pace'])).toEqual(['pace']);
    expect(keywordClasses('its formal tone', ['voice'])).toEqual(['voice']);
    expect(keywordClasses('the way it opens', ['pace'])).toEqual([]);
  });
  it('every row belongs to one author; no band stands for two', () => {
    for (const r of table.rows) expect(r.author).toBe(sourceOf(r.id));
    expect(new Set(table.rows.map((r) => r.id)).size).toBe(proposals.length);
  });
  it('shared, unique and conflicting, from the labels', () => {
    expect(row('m3')?.kind).toBe('SHARED');   // B and D both hedge little: 3 and 2 per 1000
    expect(row('m5')?.kind).toBe('SHARED');
    expect(row('p5')?.kind).toBe('UNIQUE');   // E's narrative opening: no other author's
    expect(row('p1')?.kind).toBe('UNIQUE');   // A's question opening is another trait than E's
    expect(row('m1')?.kind).toBe('CONFLICTING');
    expect(row('m2')?.kind).toBe('CONFLICTING');
    expect(table.conflicts).toHaveLength(1);
    expect(table.conflicts[0]).toMatchObject({ label: 'rhythm', sides: [{ author: 'A' }, { author: 'B' }] });
  });
  it('a conflict between authors who write pieces of different lengths is task-dependent, not taste', () => {
    const t = buildTraitTable(proposals, sourceOf, (a) => (a === 'A' ? 'short' : 'long'));
    expect(t.conflicts[0].taskDependent).toBe(true);
    expect(t.rows.find((r) => r.id === 'm1')?.kind).toBe('TASK_DEPENDENT');
  });
  it('a never against a do on one subject conflicts; within tolerance is one trait', () => {
    expect(relationOf(rule('a', 'Use contractions throughout the piece.'), rule('b', 'Never use contractions in the piece.'))).toBe('CONFLICT');
    expect(relationOf(rule('a', 'x', { observer: 'HEDGE_RATE', params: { maxPer1000: 3 } }), rule('b', 'y', { observer: 'HEDGE_RATE', params: { maxPer1000: 2 } }))).toBe('SAME');
    expect(mergedMeasurement({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 2 } }, { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 8 } }))
      .toEqual({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 8 } });
  });
});

describe('the composite: what the person chose, not the average and not any one author', () => {
  const c = composeSelection(table, proposals, LIKES);
  const outcome = (id: string) => c.decisions.find((d) => d.id === id)?.outcome;
  it("selects A's openings, B's evidence and C's pacing", () => {
    expect(outcome('p1')).toBe('SELECTED');
    expect(outcome('p2')).toBe('SELECTED');
    expect(outcome('p3')).toBe('SELECTED');
    expect(outcome('m4')).toBe('SELECTED');
  });
  it("keeps E's unique trait when admired, though four of five authors lack it", () => {
    expect(outcome('p5')).toBe('SELECTED');
    // and drops it when E's line said nothing
    const without = composeSelection(table, proposals, LIKES.map((a) => (a.name === 'E' ? author('E', null, []) : a)));
    expect(without.decisions.find((d) => d.id === 'p5')?.outcome).toBe('REJECTED');
  });
  it('a rule of two classes is taken for what it is mainly about: admiring a class it only mentions does not take it', () => {
    const two = [rule('q1', 'Let a paragraph run long when the evidence needs it.'), rule('q2', 'Never hedge a claim in the opening line.')];
    const src = (id: string): string | undefined => (id === 'q1' ? 'A' : 'B');
    const t = buildTraitTable(two, src);
    expect(t.rows.find((r) => r.id === 'q1')?.classes).toEqual(['evidence', 'pace']);
    const byPace = composeSelection(t, two, [author('A', 'the long paragraphs', ['pace']), author('B', null, [])]);
    expect(byPace.decisions.find((d) => d.id === 'q1')).toMatchObject({ outcome: 'SELECTED', cls: 'pace', byAdmiration: true });
    const byEvidence = composeSelection(t, two, [author('A', 'the evidence', ['evidence']), author('B', null, [])]);
    // it is about how long a paragraph runs, and only mentions evidence: kept as a habit of an admired author, never instructed
    expect(byEvidence.decisions.find((d) => d.id === 'q1')).toMatchObject({ outcome: 'HABIT', cls: 'pace' });
  });
  it('an unselected unique trait of an author the person admired stays a habit, shown and never instructed', () => {
    expect(outcome('p6')).toBe('HABIT');
  });
  it('keeps D only if admired; what D shares with another author is a habit, never instructed', () => {
    expect(outcome('p4')).toBe('REJECTED');
    expect(outcome('m5')).toBe('HABIT');
    const admired = composeSelection(table, proposals, LIKES.map((a) => (a.name === 'D' ? author('D', 'its formal tone', ['voice']) : a)));
    expect(admired.decisions.find((d) => d.id === 'p4')?.outcome).toBe('SELECTED');
  });
  it('surfaces the A-against-B rhythm conflict and stores it as a question when nobody answers', () => {
    expect(outcome('m1')).toBe('OPEN');
    expect(outcome('m2')).toBe('OPEN');
    expect(openQuestions(c)).toHaveLength(1);
    expect(c.conflicts[0]).toMatchObject({ answer: null, resolvedBy: null });
    const screen = describeComposite(c, (id) => proposals.find((p) => p.requirementId === id)?.statement ?? id).join('\n');
    expect(screen).toMatch(/1\. rhythm/);
    expect(screen).toMatch(/A {2}A: My sentences vary little: a spread between 0\.1 and 0\.3/);
    expect(screen).toMatch(/open: neither instructs/);
    expect(screen).toMatch(/From A: openings/);
    expect(screen).toMatch(/D: nothing said, so nothing is taken from this author alone/);
  });
  it('an answer decides the conflict: one side, or both as one range', () => {
    const a = composeSelection(table, proposals, LIKES, { 1: 'A' });
    expect(a.decisions.find((d) => d.id === 'm1')?.outcome).toBe('SELECTED');
    expect(a.decisions.find((d) => d.id === 'm2')?.outcome).toBe('REJECTED');
    const both = composeSelection(table, proposals, LIKES, { 1: 'both' });
    expect(both.decisions.find((d) => d.id === 'm1')).toMatchObject({ outcome: 'SELECTED', range: { observer: 'RHYTHM', params: { minCv: 0.1, maxCv: 0.9 } } });
    expect(both.decisions.find((d) => d.id === 'm2')).toMatchObject({ outcome: 'REJECTED', mergedInto: 'm1' });
  });
  it('admiring exactly one side settles it, and says so', () => {
    const paceA = composeSelection(table, proposals, LIKES.map((x) => (x.name === 'A' ? author('A', 'openings and the even rhythm', ['opening', 'pace']) : x)));
    expect(paceA.conflicts[0]).toMatchObject({ answer: 'A', resolvedBy: 'ADMIRATION' });
  });
  it('every proposal gets exactly one outcome: none dropped in silence', () => {
    expect(c.decisions.map((d) => d.id).sort()).toEqual(proposals.map((p) => p.requirementId).sort());
  });
  it('the rulings go through the normal decide path, each naming its author and pieces, and an open side instructs nothing', () => {
    // thin evidence everywhere, as with one piece per author: the suggestion alone would instruct nothing
    const sugg = new Map<string, Suggestion>(proposals.map((p) => [p.requirementId, { decision: 'APPROVE', materiality: 'PREFERRED', needs: null, why: 'seen', strength: 1 }]));
    const list = decisionsFor(c, proposals, sugg, new Map());
    const of = (id: string) => list.find((d) => d.id === id);
    // what the person selected is their word: a worded rule instructs
    for (const id of ['p1', 'p2', 'p3', 'p5']) expect(of(id), id).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
    expect(of('p1')?.suggested?.why).toMatch(/^selected by you from A \(a\.md\): you admired A's openings/);
    // a counted one they selected is a target, never a failure, until they say otherwise
    expect(of('m4')).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(of('m4')?.suggested?.why).toMatch(/selected by you from C .*never fails a draft/);
    // what nobody selected keeps the evidence's weight
    expect(of('p6')).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(of('p6')?.suggested?.why).toMatch(/^composite, from E/);
    // and the evidence's own rejection of an unselected rule stands, where a selected one is the person's word
    const rejecting = new Map(sugg);
    for (const id of ['p6', 'p1']) rejecting.set(id, { decision: 'REJECT', materiality: null, needs: null, why: 'never seen again', strength: 0 });
    const ruled = decisionsFor(c, proposals, rejecting, new Map());
    expect(ruled.find((d) => d.id === 'p6')).toMatchObject({ decision: 'REJECT' });
    expect(ruled.find((d) => d.id === 'p1')).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
    expect(of('m1')).toMatchObject({ decision: 'REJECT' });
    expect(of('m1')?.suggested?.why).toMatch(/conflict 1 .* unanswered/);
    expect(of('m5')).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(of('p4')).toMatchObject({ decision: 'REJECT' });
    // the person's --set still wins
    expect(decisionsFor(c, proposals, sugg, new Map([['p1', 'required']])).find((d) => d.id === 'p1')).toMatchObject({ materiality: 'REQUIRED' });
    // 'both' carries the range in the grammar `decide` takes
    const both = decisionsFor(composeSelection(table, proposals, LIKES, { 1: 'both' }), proposals, sugg, new Map());
    expect(both.find((d) => d.id === 'm1')).toMatchObject({ decision: 'APPROVE', measure: 'RHYTHM:minCv=0.1,maxCv=0.9' });
  });
  it('the same answers give the same composite, byte for byte', () => {
    expect(JSON.stringify(composeSelection(table, proposals, LIKES))).toBe(JSON.stringify(c));
    expect(JSON.stringify(buildTraitTable(proposals, sourceOf))).toBe(JSON.stringify(table));
  });
  it('the lines and answers are read strictly', () => {
    const map = { names: ['Ada', 'Bea'], of: { 'ada.md': 'Ada', 'bea.md': 'Bea' }, how: 'FRONT_MATTER' as const };
    expect(parseAdmire(['ada.md=the openings, and the pace', 'Bea=its sources', 'bea=and depth'], map)).toEqual({ Ada: 'the openings, and the pace', Bea: 'its sources; and depth' });
    expect(parseConflictAnswers(['1=a', '2=both', '3=later'], 3)).toEqual({ 1: 'A', 2: 'both', 3: null });
  });
});

describe('the admiration is read in one call, restricted to what each author carries', () => {
  it('one call for every line; a class the author has no rule for cannot be chosen', async () => {
    let calls = 0;
    const client = { complete: async () => { calls++; return { json: { picks: [{ author: 'A', classes: ['opening', 'evidence'] }, { author: 'B', classes: ['evidence'] }] }, cost: { basis: 'API_METERED', billingUsd: 0.001 } }; } } as unknown as InferenceClient;
    const out = await readAdmiration(client, { spentUsd: 0, capUsd: 1, maxCalls: 1 }, [
      { author: 'A', text: 'the opening', available: ['opening', 'pace'] }, { author: 'B', text: 'the evidence', available: ['evidence'] }, { author: 'D', text: '', available: ['voice'] }]);
    expect(calls).toBe(1);
    expect(out).toEqual({ A: ['opening'], B: ['evidence'], D: [] });
  });
});

describe('the composite voice', () => {
  const c = composeSelection(table, proposals, LIKES);
  const statementOf = (id: string): string => proposals.find((p) => p.requirementId === id)?.statement ?? id;
  const para = (who: string, n: number): string => Array.from({ length: n }, (_, i) => `${who} wrote paragraph ${i + 1} about the harbour, the tide tables and the ferry that never ran on time in winter.`).join('\n\n');
  it('serves an excerpt from every selected author within the budget, each labelled as theirs', () => {
    const chosen = compositeVoiceOf(c, statementOf);
    expect(chosen.map((a) => a.name)).toEqual(['A', 'B', 'C', 'E']);
    const served = selectCompositePieces(chosen.map((a) => ({ author: a.name, pieces: [para(a.name, 12)] })), 3000, 'excerpts');
    expect(served.map((x) => x.author)).toEqual(['A', 'B', 'C', 'E']);
    // within the compact budget: no author is given more than an equal share
    for (const x of served) expect(x.text.split(/\s+/).length).toBeLessThanOrEqual(750);
    expect(pieceLabel(1, true, 'B')).toMatch(/Passages from one piece by B .*one of the writers this voice is combined from/);
    expect(selectCompositePieces([{ author: 'A', pieces: [para('A', 12)] }], 0)).toEqual([]);
  });
  it('the copying guard covers every author, served or not, and flags a lifted sentence', () => {
    const lifted = 'The ferry from the north quay was cancelled for the third winter running and nobody wrote it down.';
    const voice = { passages: [], pieces: ['A served excerpt about openings and questions only.'], guardPieces: [`D kept this piece. ${lifted} Then more.`] };
    const guard = copyGuardPieces(voice);
    expect(guard).toHaveLength(2);
    const output = `Our own draft begins here. ${lifted} And it goes on.`;
    expect(overlapIndex(guard)(output).longestShared).toBeGreaterThanOrEqual(COPY_LIMIT);
    // the guard of a skill of one author is exactly what it served before
    expect(copyGuardPieces({ passages: ['x'], pieces: ['y'] })).toEqual(['x', 'y']);
  });
});
