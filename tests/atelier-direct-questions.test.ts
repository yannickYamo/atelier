// tests/atelier-direct-questions.test.ts — WHAT AN EDITOR ASKS BEFORE THE DRAFT, AND WHAT THE WRITER IS SHOWN.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { EDITOR_QUESTIONS, editorNote, statedIn, INTENT_HEAD, type EditorInput } from '../core/direct/questions.js';
import { taskBlock, reviewAsk, methodBlock, METHOD_SHOWN } from '../core/direct/prompt.js';

const INPUT: EditorInput = { request: 'Write a post on why founders should keep their own notes.', material: [{ name: 'notes', head: 'Founders lose context every time a tool shuts down.' }], method: 'End on the idea.', told: [] };
const none = (ask: string, options: string[], def: string): Record<string, unknown> => ({ statedIn: 'NONE', quote: null, ask, options, default: def });

const stated = (where: string, quote: string): Record<string, unknown> => ({ statedIn: where, quote, ask: null, options: [] });
const fields = (over: Record<string, Record<string, unknown>> = {}): Record<string, Record<string, unknown>> => ({
  point: none('What are you saying that others miss?', ['Your notes are your memory', 'Tools die, files stay'], 'x'),
  goal: none('What should the reader do after?', ['Export their notes tonight', 'Pick a plain-text tool'], 'x'),
  record: none('What will you name?', [], 'x'),
  reader: stated('material', 'Founders lose context every time a tool shuts down'),
  ...over });

describe('the editor questions reading is shown what the author\'s pieces are built on', () => {
  // WHAT THE SAMPLES SHOW REACHES THE QUESTIONS. The reading saw the request, the notes and the method and never the
  // author's pieces, so it could not ask for what their pieces always rest on and this request leaves out.
  it('the habits read from the pieces are in what the reading is given, each with the author\'s own sentence', () => {
    const said = EDITOR_QUESTIONS.prompt({ ...INPUT, habits: [{ text: 'Carries one image through the whole piece', theirs: 'The lock is a clock the canal keeps.' }] });
    expect(said).toContain('Carries one image through the whole piece');
    expect(said).toContain('The lock is a clock the canal keeps.');
  });
  it('with none read, nothing is said of them', () => {
    expect(EDITOR_QUESTIONS.prompt(INPUT)).toBe(EDITOR_QUESTIONS.prompt({ ...INPUT, habits: [] }));
    expect(EDITOR_QUESTIONS.prompt(INPUT)).not.toContain('their finished pieces');
  });
  it('the reading has room to answer in full: cut off, it asked nothing', () => {
    expect(EDITOR_QUESTIONS.maxTokens).toBeGreaterThanOrEqual(4000);
  });
  it('at most three are asked, in the order point, goal, record, reader', () => {
    const open = fields({ reader: none('Who reads it?', ['Founders', 'PMs'], 'x') });
    expect(EDITOR_QUESTIONS.ground({ fields: open }, INPUT)?.questions.map((q) => q.id)).toEqual(['point', 'goal', 'record']);
  });
});

describe('the editor questions reading, grounded by code', () => {
  it('a stated one is held to its quote; a quote the source lacks is no statement', () => {
    expect(statedIn('material', 'lose context every time a tool shuts down', INPUT)).toBe(true);
    expect(statedIn('material', 'founders hate every tool', INPUT)).toBe(false);
    expect(statedIn('method', 'End on the idea', INPUT)).toBe(true);
    expect(statedIn('request', 'short', INPUT)).toBe(false);
  });
  it('stated, not needed, or asked: Enter picks nothing for the person, and the record has no options', () => {
    const r = EDITOR_QUESTIONS.ground({ fields: fields({ goal: { statedIn: 'NOT_NEEDED', quote: null, ask: null, options: [] }, record: none('What will you name?', ['made up', 'also made up'], 'x') }) }, INPUT);
    expect(r?.questions).toEqual([{ id: 'point', ask: 'What are you saying that others miss?', options: ['Your notes are your memory', 'Tools die, files stay'], default: '' }, { id: 'record', ask: 'What will you name?', options: [], default: '' }]);
    expect(r?.decisions.map((d) => [d.kind, d.why ?? 'asked', d.quote ?? null])).toEqual([['point', 'asked', null], ['goal', 'not needed for this piece', null], ['record', 'asked', null], ['reader', 'stated in the material', 'Founders lose context every time a tool shuts down']]);
  });
  it('a point, goal or reader asked with fewer than two options is not asked', () => {
    const r = EDITOR_QUESTIONS.ground({ fields: fields({ point: none('What?', ['only one'], 'x') }) }, INPUT);
    expect(r?.questions.map((q) => q.id)).toEqual(['goal', 'record']);
  });
  it('what the skill is for counts as stated where its words are there', () => {
    const card: NonNullable<EditorInput['card']> = { kind: 'blog posts', reader: 'founders and product managers', purpose: 'change how they build', settles: [], by: 'you' };
    const r = EDITOR_QUESTIONS.ground({ fields: fields({ reader: stated('card', 'founders and product managers') }) }, { ...INPUT, card });
    expect(r?.decisions.find((d) => d.kind === 'reader')?.stated).toBe('card');
  });
  it('a reading that asks a tactic is told not to: the rule is in what it reads', () => {
    expect(EDITOR_QUESTIONS.system).toContain('Never ask for a choice among things already given');
  });
  it('everything stated and nothing open asks nothing', () => {
    const all = fields({ point: stated('request', 'why founders should keep their own notes'), goal: stated('method', 'End on the idea'), record: { statedIn: 'NOT_NEEDED', quote: null, ask: null, options: [] } });
    expect(EDITOR_QUESTIONS.ground({ fields: all }, INPUT)?.questions).toEqual([]);
  });
  it('a claimed statement with a made-up quote is asked', () => {
    const r = EDITOR_QUESTIONS.ground({ fields: fields({ reader: { ...none('Who reads it?', ['A', 'B'], 'x'), statedIn: 'request', quote: 'the reader keeps nothing' } }) }, INPUT);
    expect(r?.questions.map((q) => q.id)).toEqual(['point', 'goal', 'record']);
    expect(r?.decisions.find((d) => d.kind === 'reader')?.question?.id).toBe('reader');
  });
  it('the kind of work, where it was read, is shown to the reader', () => {
    expect(EDITOR_QUESTIONS.prompt({ ...INPUT, kind: 'pricing memo' })).toContain('The kind of work: pricing memo');
    expect(EDITOR_QUESTIONS.prompt(INPUT)).not.toContain('The kind of work');
  });
  it('an empty request asks nothing, and so does no model', () => {
    expect(EDITOR_QUESTIONS.decide({ ...INPUT, request: ' ' })).toEqual({ decisions: [], questions: [] });
    expect(EDITOR_QUESTIONS.floor(INPUT)).toEqual({ decisions: [], questions: [] });
  });
});

describe('what reaches the writer', () => {
  it('only what the person answered, in their words, under what the author wants; nothing when nobody answered', () => {
    expect(editorNote([])).toBe('');
    expect(editorNote([{ id: 'point', answer: 'Tools die, files stay' }, { id: 'record', answer: 'Our two shutdowns this year' }, { id: 'also', answer: 'Keep it short' }, { id: 'nope', answer: 'x' }, { id: 'goal', answer: ' ' }]))
      .toBe(`${INTENT_HEAD}\n\n- What the author is saying that others are not, and why now: Tools die, files stay\n- What the author puts on record beyond the material (names, news, figures, a story of theirs): Our two shutdowns this year\n- The author adds: Keep it short`);
  });
  it('the answers lead what the writer reads, before the material', () => {
    const b = taskBlock({ intent: 'INTENT', material: [{ name: 'notes', text: 'N' }], task: 'T' });
    expect(b.indexOf('INTENT')).toBe(0);
    expect(b.indexOf('INTENT')).toBeLessThan(b.indexOf('<material'));
  });
  it('the method is shown whole before the rules, a rule it already says is not repeated, and the answers come before the task', () => {
    const b = taskBlock({ material: [], task: 'Write it.', method: 'Open on the pain.\nNo em dashes.', rules: ['No em dashes.', 'Keep paragraphs short.'], settled: 'Before writing, the author settled these.' });
    expect(b).toBe('The author\'s method for their pieces, in their words. Follow it wherever it applies to this piece. Where the method and the pieces differ, the method decides.\n\n<method>\nOpen on the pain.\nNo em dashes.\n</method>\n\n'
      + 'The author\'s own rules for their writing, in their words. Each one holds in this piece wherever it applies:\n\n<rules>\n- Keep paragraphs short.\n</rules>\n\n'
      + 'Before writing, the author settled these.\n\nThe task:\n\n<task>\nWrite it.\n</task>');
    expect(methodBlock('')).toBe('');
    expect(methodBlock('x'.repeat(METHOD_SHOWN + 50)).length).toBeLessThan(METHOD_SHOWN + 200);
    expect(taskBlock({ material: [], task: 'T' })).toBe('The task:\n\n<task>\nT\n</task>');
  });
  it('the review holds claims to the strength of what was given, the author\'s answers included where there are some', () => {
    expect(reviewAsk('d', { material: [{ name: 'n', text: 't' }], answered: true })).toContain('does not come from the material, the author\'s answers and the task, and any claim made stronger than these support.');
    expect(reviewAsk('d', { material: [] })).toContain('does not come from the task, and any claim made stronger than it supports.');
  });
  it('the review holds the draft to the method where there is one', () => {
    expect(reviewAsk('d', { material: [], method: 'End on the idea.' })).toContain('Fix anything they would not write, anything that goes against their method, any figure');
    expect(reviewAsk('d', { material: [] })).not.toContain('method');
  });
});
