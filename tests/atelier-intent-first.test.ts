// tests/atelier-intent-first.test.ts — THE QUESTIONS ASKED BEFORE A PIECE, OVER TWO RUNS OF ONE REQUEST.
// The reading is stubbed: each call names its questions afresh, as a model does when it reads again.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as store from '../core/state/store.js';

let calls = 0;
vi.mock('../core/inference/reading.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../core/inference/reading.js')>();
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
    const base = { L, asked: 'Write a post on keeping notes.', material: [], read: async () => 'my own point', say: (s: string) => { said.push(s); } };
    const first = await editorQuestions({ ...base, interactive: true }, '');
    expect(first.answers).toEqual([{ id: 'point-1', answer: 'my own point' }]);
    const second = await editorQuestions({ ...base, interactive: false }, '');
    expect(calls).toBe(1);
    expect(second.questions.map((q) => q.id)).toEqual(['point-1']);
    expect(second.answers).toEqual([{ id: 'point-1', answer: 'my own point' }]);
    expect(second.note).toContain('my own point');
  });
});
