// tests/atelier-direct-questions.test.ts — WHAT AN EDITOR ASKS BEFORE THE DRAFT, AND WHAT THE WRITER IS SHOWN.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { EDITOR_QUESTIONS, editorNote, statedIn, type EditorInput } from '../core/direct/questions.js';
import { taskBlock, reviewAsk, methodBlock, METHOD_SHOWN } from '../core/direct/prompt.js';

const INPUT: EditorInput = { request: 'Write a post on why founders should keep their own notes.', material: [{ name: 'notes', head: 'Founders lose context every time a tool shuts down.' }], method: 'End on the idea.', told: [] };
const none = (ask: string, options: string[], def: string): Record<string, unknown> => ({ statedIn: 'NONE', quote: null, ask, options, default: def });

const stated = (where: string, quote: string): Record<string, unknown> => ({ statedIn: where, quote, ask: null, options: [], default: null });
const fields = (over: Record<string, Record<string, unknown>> = {}): Record<string, Record<string, unknown>> => ({
  idea: none('What should the reader keep?', ['Your notes are your memory', 'Tools die, files stay'], 'Tools die, files stay'),
  reader: none('Who reads it?', ['Founders in their first year', 'Founders after a shutdown'], 'Founders after a shutdown'),
  pain: stated('material', 'Founders lose context every time a tool shuts down'),
  proof: none('What shows it?', ['only one'], 'only one'),
  next: none('What do they do next?', ['Export their notes tonight', 'Pick a plain-text tool'], 'Export their notes tonight'),
  ...over });
const decision = (id: string, decides: string): Record<string, unknown> => ({ id, decides, ask: `${decides}?`, options: ['A', 'B'], default: 'A' });

describe('the editor questions reading, grounded by code', () => {
  it('a stated one is held to its quote; a quote the source lacks is no statement', () => {
    expect(statedIn('material', 'lose context every time a tool shuts down', INPUT)).toBe(true);
    expect(statedIn('material', 'founders hate every tool', INPUT)).toBe(false);
    expect(statedIn('method', 'End on the idea', INPUT)).toBe(true);
    expect(statedIn('request', 'short', INPUT)).toBe(false);
  });
  it('with no decision of the piece\'s own, the fields nothing states are asked, in order, at most three, each well formed', () => {
    const r = EDITOR_QUESTIONS.ground({ decisions: [], fields: fields() }, INPUT);
    // the pain is stated; the proof came with one option; idea, reader and next are asked
    expect(r?.questions.map((q) => [q.id, q.default])).toEqual([['idea', 'Tools die, files stay'], ['reader', 'Founders after a shutdown'], ['next', 'Export their notes tonight']]);
    expect(r?.decisions.filter((d) => d.from === 'field').map((d) => [d.kind, d.why ?? 'asked'])).toEqual([['idea', 'asked'], ['reader', 'asked'], ['pain', 'stated in the material'], ['proof', 'the question came without 2 to 4 options and one picked among them'], ['next', 'asked']]);
  });
  it('the piece\'s own decisions come first and alone: at most three, the order kept, ids --answers can name, none a field\'s', () => {
    const r = EDITOR_QUESTIONS.ground({ decisions: [decision('Price Anchor!', 'the price it anchors on'), decision('idea', 'a decision named as a field'), decision('price-anchor', 'the same id twice'),
      decision('who pays', 'who pays'), decision('scope', 'what it covers'), decision('extra', 'a fourth')], fields: fields() }, INPUT);
    expect(r?.questions.map((q) => q.id)).toEqual(['price-anchor', 'who-pays', 'scope']);
    expect(r?.questions[0]).toMatchObject({ about: 'the price it anchors on', ask: 'the price it anchors on?', default: 'A' });
  });
  it('a decision with no question that holds falls back to the fields: never nothing asked while something is unstated', () => {
    const r = EDITOR_QUESTIONS.ground({ decisions: [{ id: 'price', decides: 'the price', ask: 'Which?', options: ['only one'], default: 'only one' }], fields: fields() }, INPUT);
    expect(r?.questions.map((q) => q.id)).toEqual(['idea', 'reader', 'next']);
  });
  it('everything stated and nothing open asks nothing', () => {
    const all = fields({ idea: stated('request', 'why founders should keep their own notes'), reader: stated('request', 'Write a post on why founders'), proof: stated('material', 'every time a tool shuts down'), next: stated('method', 'End on the idea') });
    expect(EDITOR_QUESTIONS.ground({ decisions: [], fields: all }, INPUT)?.questions).toEqual([]);
  });
  it('a claimed statement with a made-up quote is asked; last time\'s answer is the suggestion', () => {
    const r = EDITOR_QUESTIONS.ground({ decisions: [], fields: fields({ idea: { ...none('What should the reader keep?', ['A', 'B'], 'A'), statedIn: 'request', quote: 'the reader keeps nothing' } }) },
      { ...INPUT, told: [{ id: 'reader', ask: 'x', answer: 'Founders who lost a tool', at: '' }] });
    expect(r?.questions.map((q) => [q.id, q.default, q.last ?? null])).toEqual([['idea', 'A', null], ['reader', 'Founders who lost a tool', 'Founders who lost a tool'], ['next', 'Export their notes tonight', null]]);
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
  it('only what the person answered, in their words; nothing when nobody answered', () => {
    expect(editorNote([])).toBe('');
    expect(editorNote([{ id: 'idea', answer: 'Tools die, files stay' }, { id: 'angle', answer: 'Why now: two shutdowns this year' }, { id: 'nope', answer: 'x' }]))
      .toBe('Before writing, the author settled these. Write from them; they are the author\'s, not lines to quote:\n\n- The one idea the reader should leave with: Tools die, files stay\n- The angle, and why now: Why now: two shutdowns this year');
  });
  it('a decision of the piece\'s own is told by what it decides; the next step and the reader by their own words', () => {
    const asked = [{ id: 'price-anchor', ask: 'Which price?', options: ['A', 'B'], default: 'A', about: 'the price it anchors on' }];
    expect(editorNote([{ id: 'price-anchor', answer: 'The annual plan' }, { id: 'next', answer: 'Book a call' }, { id: 'reader', answer: 'A CFO at budget time' }, { id: 'other-decision', answer: 'x' }], asked))
      .toBe('Before writing, the author settled these. Write from them; they are the author\'s, not lines to quote:\n\n- the price it anchors on: The annual plan\n- What the reader does next, after reading: Book a call\n- Who reads it, and the situation they read it in: A CFO at budget time');
  });
  it('the method is shown whole before the rules, a rule it already says is not repeated, and the answers come before the task', () => {
    const b = taskBlock({ material: [], task: 'Write it.', method: 'Open on the pain.\nNo em dashes.', rules: ['No em dashes.', 'Keep paragraphs short.'], settled: 'Before writing, the author settled these.' });
    expect(b).toBe('The author\'s method for their pieces, in their words. Follow it wherever it applies to this piece:\n\n<method>\nOpen on the pain.\nNo em dashes.\n</method>\n\n'
      + 'The author\'s own rules for their writing, in their words. Each one holds in this piece wherever it applies:\n\n<rules>\n- Keep paragraphs short.\n</rules>\n\n'
      + 'Before writing, the author settled these.\n\nThe task:\n\n<task>\nWrite it.\n</task>');
    expect(methodBlock('')).toBe('');
    expect(methodBlock('x'.repeat(METHOD_SHOWN + 50)).length).toBeLessThan(METHOD_SHOWN + 200);
    expect(taskBlock({ material: [], task: 'T' })).toBe('The task:\n\n<task>\nT\n</task>');
  });
  it('the review holds the draft to the method where there is one', () => {
    expect(reviewAsk('d', { material: [], method: 'End on the idea.' })).toContain('Fix anything they would not write, anything that goes against their method, and any figure');
    expect(reviewAsk('d', { material: [] })).not.toContain('method');
  });
});
