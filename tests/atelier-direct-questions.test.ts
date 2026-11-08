// tests/atelier-direct-questions.test.ts — WHAT AN EDITOR ASKS BEFORE THE DRAFT, AND WHAT THE WRITER IS SHOWN.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { EDITOR_QUESTIONS, editorNote, statedIn, type EditorInput } from '../core/direct/questions.js';
import { taskBlock, reviewAsk, methodBlock, METHOD_SHOWN } from '../core/direct/prompt.js';

const INPUT: EditorInput = { request: 'Write a post on why founders should keep their own notes.', material: [{ name: 'notes', head: 'Founders lose context every time a tool shuts down.' }], method: 'End on the idea.', told: [] };
const none = (ask: string, options: string[], def: string): Record<string, unknown> => ({ statedIn: 'NONE', quote: null, ask, options, default: def });

describe('the editor questions reading, grounded by code', () => {
  it('a stated one is held to its quote; a quote the source lacks is no statement', () => {
    expect(statedIn('material', 'lose context every time a tool shuts down', INPUT)).toBe(true);
    expect(statedIn('material', 'founders hate every tool', INPUT)).toBe(false);
    expect(statedIn('method', 'End on the idea', INPUT)).toBe(true);
    expect(statedIn('request', 'short', INPUT)).toBe(false);
  });
  it('asks only what nothing states, each with 2 to 4 options and one picked among them', () => {
    const r = EDITOR_QUESTIONS.ground({
      idea: none('What should the reader keep?', ['Your notes are your memory', 'Tools die, files stay'], 'Tools die, files stay'),
      pain: { statedIn: 'material', quote: 'Founders lose context every time a tool shuts down', ask: null, options: [], default: null },
      proof: none('What shows it?', ['only one'], 'only one'),
    }, INPUT);
    expect(r?.questions.map((q) => [q.id, q.default])).toEqual([['idea', 'Tools die, files stay']]);
    expect(r?.decisions.map((d) => [d.kind, d.why ?? 'asked'])).toEqual([['idea', 'asked'], ['pain', 'stated in the material'], ['proof', 'the question came without 2 to 4 options and one picked among them']]);
  });
  it('a claimed statement with a made-up quote is asked; last time\'s answer is the suggestion', () => {
    const r = EDITOR_QUESTIONS.ground({
      idea: { ...none('What should the reader keep?', ['A', 'B'], 'A'), statedIn: 'request', quote: 'the reader keeps nothing' },
      pain: none('What do they live with?', ['C', 'D'], 'C'), proof: none('What shows it?', ['E', 'F'], 'E'),
    }, { ...INPUT, told: [{ id: 'pain', ask: 'x', answer: 'Lost context', at: '' }] });
    expect(r?.questions.map((q) => [q.id, q.default, q.last ?? null])).toEqual([['idea', 'A', null], ['pain', 'Lost context', 'Lost context'], ['proof', 'E', null]]);
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
