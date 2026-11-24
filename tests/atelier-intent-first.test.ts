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

describe('at a terminal, one prompt per open question; enter takes the suggestion, and is remembered', () => {
  beforeEach(() => { calls = 0; });
  it('enter takes the suggestion the person saw, as theirs, and the same request does not ask it again', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const prompts: string[] = [];
    const base = { L, asked: 'Write a post on keeping notes.', material: [], read: async (p: string) => { prompts.push(p); return ''; }, say: () => undefined };
    const first = await editorQuestions({ ...base, interactive: true }, '');
    expect(first.answers).toEqual([{ id: 'point-1', answer: 'A' }]);
    expect(first.note).toContain('A');
    expect(first.note).not.toMatch(/suggest/i);
    expect(prompts[0]).toContain('enter for "A"');
    prompts.length = 0;
    const second = await editorQuestions({ ...base, interactive: true }, '');
    expect(prompts).toEqual([]);
    expect(second.answers).toEqual([{ id: 'point-1', answer: 'A' }]);
  });
  it('a suggestion nobody saw is never served: off a terminal nothing is answered', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const r = await editorQuestions({ L, asked: 'Write a post on keeping notes.', material: [], interactive: false, read: async () => '', say: () => undefined }, '');
    expect(r.answers).toEqual([]);
    expect(r.note).toBe('');
  });
  it('words after the questions reach the writer as the author\'s', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const typed = ['b', 'Name our two shutdowns'];
    const r = await editorQuestions({ L, asked: 'Write a post on keeping notes.', material: [], interactive: true, read: async () => typed.shift() ?? '', say: () => undefined }, '');
    expect(r.answers).toEqual([{ id: 'point-1', answer: 'B' }, { id: 'also', answer: 'Name our two shutdowns' }]);
    expect(r.note).toContain('The author adds: Name our two shutdowns');
    // the same request again: nothing is read or asked again, and the words added reach the writer again
    const again = await editorQuestions({ L, asked: 'Write a post on keeping notes.', material: [], interactive: true, read: async () => { throw new Error('asked again'); }, say: () => undefined }, '');
    expect(calls).toBe(1);
    expect(again.answers).toEqual([{ id: 'point-1', answer: 'B' }, { id: 'also', answer: 'Name our two shutdowns' }]);
    // another request is another piece: the words added for this one are not its own
    const other = await editorQuestions({ L, asked: 'Write a post on plain files.', material: [], interactive: false, read: async () => '', say: () => undefined }, '');
    expect(other.note).not.toContain('Name our two shutdowns');
  });
});

describe('the owner\'s rulings of 24 Nov', () => {
  it('the installed skill says what the work is and who it is for, so the host never asks it', async () => {
    const { hostSteps } = await import('../renderers/agent-skill/render.js');
    const s = hostSteps('posts', 'Blog posts, read by founders and product managers, to change how they build.');
    expect(s).toContain('What this work is and who it is for: Blog posts, read by founders and product managers, to change how they build. Never ask what this already says.');
    expect(s.indexOf('What this work is')).toBeLessThan(s.indexOf('## After you write'));
    expect(hostSteps('posts')).not.toContain('What this work is');
  });
  it('the material\'s wording is kept only on words found in the request, the method or the material', async () => {
    const { PIECE_ROUTE } = await import('../core/direct/route.js');
    const x = { request: 'Write the launch note.', material: 'APPROVED MESSAGING, use verbatim: Atelier writes like you.', method: '', pieces: [{ id: 'p1', text: '# One\nA', request: null, kept: false }, { id: 'p2', text: '# Two\nB', request: null, kept: false }] };
    const base = { asks_for: 'a launch note', pieces: ['p1'], length: null };
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: 'use verbatim' }, x)?.keepWording).toBe('use verbatim');
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: 'keep every line as written' }, x)?.keepWording).toBeUndefined();
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: null }, x)?.keepWording).toBeUndefined();
  });
});
