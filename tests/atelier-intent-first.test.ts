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
    expect(prompts[0]).toContain('enter for a');
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
    expect(s).toContain('This skill writes: Blog posts, read by founders and product managers, to change how they build. Never ask what this already says.');
    expect(s.indexOf('This skill writes')).toBeLessThan(s.indexOf('## After you write'));
    expect(hostSteps('posts')).not.toContain('This skill writes');
  });
  it('the material\'s wording is kept only on words found in the request, the method or the material', async () => {
    const { PIECE_ROUTE } = await import('../core/direct/route.js');
    const x = { request: 'Write the launch note.', material: 'APPROVED MESSAGING, use verbatim: Atelier writes like you.', method: '', pieces: [{ id: 'p1', text: '# One\nA', request: null, kept: false }, { id: 'p2', text: '# Two\nB', request: null, kept: false }] };
    const base = { asks_for: 'a launch note', pieces: ['p1'], length: null };
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: 'messaging, use verbatim' }, x)?.keepWording).toBe('messaging, use verbatim');
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: 'keep every line as written' }, x)?.keepWording).toBeUndefined();
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: null }, x)?.keepWording).toBeUndefined();
  });
});

describe('what the agent writes, in one sentence', () => {
  it('kind, reader, purpose read as one sentence, whatever words each came in', async () => {
    const { cardSentence } = await import('../core/direct/card.js');
    expect(cardSentence({ kind: 'blog posts', reader: 'founders and product managers', purpose: 'to reframe the painful parts of building software.' }))
      .toBe('Blog posts for founders and product managers, to reframe the painful parts of building software.');
    expect(cardSentence({ kind: 'board notes', reader: 'read by the harbour board', purpose: null })).toBe('Board notes for the harbour board.');
    expect(cardSentence({ kind: null, reader: null, purpose: 'help members vote' })).toBe('To help members vote.');
    expect(cardSentence({ kind: null, reader: null, purpose: null })).toBe('');
  });
  it('an open question is asked once: the question, its options, and what enter does', async () => {
    const { questionPrompt, briefLines } = await import('../cli/direct.js');
    expect(questionPrompt({ id: 'goal', ask: 'What should the reader do after?', options: ['Export tonight', 'Pick a plain tool'], default: 'Pick a plain tool' }))
      .toEqual({ head: 'Goal: What should the reader do after?\n  a) Export tonight\n  b) Pick a plain tool', prompt: '  enter for b, or your own words: ' });
    expect(questionPrompt({ id: 'record', ask: 'What shows it?', options: [], default: '' }).prompt).toBe('  your words, or enter to skip: ');
    // the brief shows only what is already settled, one short line each; nothing settled shows nothing
    expect(briefLines([{ kind: 'reader', stated: 'material', quote: 'Founders lose context every time a tool shuts down' } as never], [{ id: 'point', answer: 'Tools die, files stay' }]))
      .toEqual(['Before I write, here is what I have:', '  Point  Tools die, files stay', '  For    Founders lose context every time a tool shuts down']);
    expect(briefLines([], [])).toEqual([]);
  });
});

describe('audit of 25 Nov', () => {
  it('a stray fragment is not a request to keep the wording: it takes three words or more, found where it is said', async () => {
    const { PIECE_ROUTE } = await import('../core/direct/route.js');
    const x = { request: 'Write the launch note.', material: 'Use these lines as written: Atelier writes like you.', method: '', pieces: [{ id: 'p1', text: '# One\nA', request: null, kept: false }, { id: 'p2', text: '# Two\nB', request: null, kept: false }] };
    const base = { asks_for: 'a launch note', pieces: ['p1'], length: null };
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: 'note' }, x)?.keepWording).toBeUndefined();
    expect(PIECE_ROUTE.ground({ ...base, keep_wording: 'lines as written' }, x)?.keepWording).toBe('lines as written');
  });
  it('the sentence keeps a name\'s own capitals, ends once, and keeps "for"', async () => {
    const { cardSentence } = await import('../core/direct/card.js');
    expect(cardSentence({ kind: 'iOS release notes', reader: null, purpose: null })).toBe('iOS release notes.');
    expect(cardSentence({ kind: 'posts', reader: null, purpose: 'why bother?' })).toBe('Posts, to why bother.');
    expect(cardSentence({ kind: 'posts', reader: null, purpose: 'for fun' })).toBe('Posts, for fun.');
  });
  it('an empty answer kept from an earlier reading is never said as settled', async () => {
    const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-intent-')), skillName: 's' };
    const real = await import('../core/state/store.js');
    const { sha } = await import('../core/state/receipt.js');
    // a "you decide" kept for a kind this reading does not ask (the record), from an earlier reading of this request
    real.addTold(L, [{ id: 'record', ask: 'What shows it?', answer: '', at: new Date().toISOString(), for: sha('Write a post on keeping notes.') }]);
    const said: string[] = [];
    const r = await editorQuestions({ L, asked: 'Write a post on keeping notes.', material: [], interactive: false, read: async () => '', say: (x) => { said.push(x); } }, '');
    expect(r.answers.find((a) => a.id === 'record')).toBeUndefined();
    expect(said.join('\n')).not.toMatch(/Settled.*record/);
  });
});
