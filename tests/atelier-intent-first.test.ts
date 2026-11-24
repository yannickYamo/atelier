// tests/atelier-intent-first.test.ts — THE QUESTIONS ASKED BEFORE A PIECE, OVER TWO RUNS OF ONE REQUEST.
// The reading is stubbed: each call names its questions afresh, as a model does when it reads again.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type * as store from '../core/state/store.js';
import type * as ReadingModule from '../core/inference/reading.js';

let calls = 0;
vi.mock('../core/inference/reading.js', async (importOriginal) => {
  const real = await importOriginal<typeof ReadingModule>();
  return { ...real, readContext: async (reading: { id: string }, input: unknown, ...rest: unknown[]) => {
    if (reading.id !== 'editor-questions') return (real.readContext as (...a: unknown[]) => unknown)(reading, input, ...rest);
    calls += 1;
    return { by: 'model', reader: 'stub', value: { decisions: [], questions: [{ id: `point-${calls}`, ask: 'What are you saying?', options: ['A', 'B'], default: 'A', about: 'the point' }] } };
  } };
});
const { editorQuestions } = await import('../cli/direct.js');

describe('an answer given once is used on every later run of the same request', () => {
  beforeEach(() => { calls = 0; });
  it('the second run reads nothing again, keeps the question ids, and sends the first answer to the writer', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const said: string[] = [];
    const typed = ['my own point', ''];
    const prompts: string[] = [];
    const base = { L, asked: 'Write a post on keeping notes.', material: [], read: async (p: string) => { prompts.push(p); return typed.shift() ?? ''; }, say: (s: string) => { said.push(s); } };
    const first = await editorQuestions({ ...base, interactive: true }, '');
    // one prompt for the open question, then one to say anything else
    expect(prompts.length).toBe(2);
    expect(first.answers).toEqual([{ id: 'point-1', answer: 'my own point' }]);
    const second = await editorQuestions({ ...base, interactive: false }, '');
    expect(calls).toBe(1);
    expect(second.questions.map((q) => q.id)).toEqual(['point-1']);
    expect(second.answers).toEqual([{ id: 'point-1', answer: 'my own point' }]);
    expect(second.note).toContain('my own point');
  });
});

describe('at a terminal, one prompt per open question; enter leaves it to the writer, and is remembered', () => {
  beforeEach(() => { calls = 0; });
  it('enter tells the writer nothing, and the same request does not ask it again', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const prompts: string[] = [];
    const base = { L, asked: 'Write a post on keeping notes.', material: [], read: async (p: string) => { prompts.push(p); return ''; }, say: () => undefined };
    const first = await editorQuestions({ ...base, interactive: true }, '');
    expect(first.answers).toEqual([]);
    expect(first.note).toBe('');
    expect(first.passed).toEqual(['point-1']);
    prompts.length = 0;
    const second = await editorQuestions({ ...base, interactive: true }, '');
    expect(prompts).toEqual([]);
    expect(second.passed).toEqual(['point-1']);
  });
  it('words after the questions reach the writer as the author\'s', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const typed = ['b', 'Name our two shutdowns'];
    const r = await editorQuestions({ L, asked: 'Write a post on keeping notes.', material: [], interactive: true, read: async () => typed.shift() ?? '', say: () => undefined }, '');
    expect(r.answers).toEqual([{ id: 'point-1', answer: 'B' }, { id: 'also', answer: 'Name our two shutdowns' }]);
    expect(r.note).toContain('The author adds: Name our two shutdowns');
  });
});
