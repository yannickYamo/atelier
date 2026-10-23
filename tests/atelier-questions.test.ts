// tests/atelier-questions.test.ts — UP TO THREE QUESTIONS BEFORE THE DRAFT, ONLY FOR WHAT ONLY THE AUTHOR KNOWS (plan item 6).
//
// Metric the change must move (named before it was built): rounds of editing to an accepted post, and the thesis judged
// the author's own (a study measures both; these tests hold the mechanism). The reading lists the decisions a piece needs;
// code asks only an author-only decision (angle, naming, news, emphasis) that is unknown and whose answers give different
// drafts, at most three, each with 2 to 4 options and a default among them; nothing about voice or form; zero when the
// request carries it; with no model, nothing. Answers given are remembered per skill: last time's answer is the default,
// and what may be named, once said, is never asked again. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QUESTIONS, parseAnswers, type QuestionsInput } from '../core/loop/questions.js';
import { readContext } from '../core/inference/reading.js';
import { beforeTheDraft } from '../cli/prewrite.js';
import type { InferenceClient } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { anInferenceResult } from './fixtures.js';

const INPUT: QuestionsInput = { request: 'Write a post reacting to the harbour reopening.', material: [{ name: 'notes', head: 'The harbour reopened on Tuesday.' }], method: [], examples: [], told: [] };
const d = (kind: string, status: string, spread: string, extra: Record<string, unknown> = {}) => ({ kind, status, spread, what: `${kind.toLowerCase()} of the post`, ask: null, options: [], default: null, ...extra });
const ANGLE = d('ANGLE', 'UNKNOWN', 'DIFFERENT', { ask: 'Why does this matter to you now?', options: ['The ferry I take', 'The town\'s jobs', 'The old quay'], default: 'The town\'s jobs' });

describe('the reading, grounded: only what only the author knows, and only where it changes the draft', () => {
  it('an unknown angle whose answers give different drafts is asked, with its options and its default', () => {
    expect(QUESTIONS.ground({ decisions: [ANGLE] }, INPUT)?.questions).toEqual([
      { id: 'angle', ask: 'Why does this matter to you now?', options: ['The ferry I take', 'The town\'s jobs', 'The old quay'], default: 'The town\'s jobs' }]);
  });
  it('never voice or form, never what is known or inferable, never a decision whose answers give the same or only some difference', () => {
    const q = QUESTIONS.ground({ decisions: [
      d('OTHER', 'UNKNOWN', 'DIFFERENT', { ask: 'Formal or casual?', options: ['formal', 'casual'], default: 'casual' }),
      d('NEWS', 'KNOWN', 'DIFFERENT', { ask: 'Any news?', options: ['yes', 'no'], default: 'no' }),
      d('EMPHASIS', 'UNKNOWN', 'SOME', { ask: 'Stress what?', options: ['jobs', 'ferries'], default: 'jobs' }),
      d('NAMING', 'INFERABLE', 'DIFFERENT', { ask: 'Name the mayor?', options: ['yes', 'no'], default: 'no' }),
    ] }, INPUT);
    expect(q?.questions).toEqual([]);
    expect(q?.decisions).toHaveLength(4);
  });
  it('at most three, one per kind, in a fixed order; a question without 2 to 4 options or a default among them is not asked', () => {
    const q = QUESTIONS.ground({ decisions: [
      d('EMPHASIS', 'UNKNOWN', 'DIFFERENT', { ask: 'Stress what?', options: ['jobs', 'ferries'], default: 'jobs' }),
      d('NEWS', 'UNKNOWN', 'DIFFERENT', { ask: 'Any news of yours?', options: ['a new berth', 'none'], default: 'none' }),
      ANGLE, { ...ANGLE, ask: 'Again?' },
      d('NAMING', 'UNKNOWN', 'DIFFERENT', { ask: 'Name the operator?', options: ['yes', 'no'], default: 'maybe' }),
    ] }, INPUT);
    expect(q?.questions.map((x) => x.id)).toEqual(['angle', 'news', 'emphasis']);
    expect(q?.questions[0].ask).toBe('Why does this matter to you now?');
  });
  it('what may be named, once told, is not asked again; an angle told last time is only the default', () => {
    const told = [{ id: 'naming', ask: 'Name the operator?', answer: 'never the operator', at: 't' }, { id: 'angle', ask: 'Why now?', answer: 'The ferry I take', at: 't' }];
    const q = QUESTIONS.ground({ decisions: [ANGLE, d('NAMING', 'UNKNOWN', 'DIFFERENT', { ask: 'Name the operator?', options: ['yes', 'no'], default: 'no' })] }, { ...INPUT, told });
    expect(q?.questions).toEqual([{ id: 'angle', ask: 'Why does this matter to you now?', options: ['The ferry I take', 'The town\'s jobs', 'The old quay'], default: 'The ferry I take', last: 'The ferry I take' }]);
  });
  it('with no model the floor asks nothing; an empty request is decided by code', async () => {
    const r = await readContext(QUESTIONS, INPUT, null, null, { spentUsd: 0, capUsd: 1 });
    expect([r.by, r.value.questions]).toEqual(['floor', []]);
    expect(QUESTIONS.decide({ ...INPUT, request: ' ' })).toEqual({ decisions: [], questions: [] });
  });
});

describe('answers as typed', () => {
  const qs = [{ id: 'angle', ask: 'Why now?', options: ['a', 'b', 'c'].map((x) => `option ${x}`), default: 'option a' }];
  it('a letter names an option; anything else is the person\'s own words; a malformed part is skipped', () => {
    expect([...parseAnswers('angle=b, news=we opened a second berth, junk, =x', qs)]).toEqual([['angle', 'option b'], ['news', 'we opened a second berth']]);
  });
});

describe('before the draft, outside a terminal: returned as choices, written with the defaults, remembered when answered', () => {
  const reader = (): InferenceClient => ({ complete: async () => anInferenceResult({ json: { decisions: [ANGLE] } }) });
  const L = () => ({ root: mkdtempSync(join(tmpdir(), 'atelier-q-')), skillName: 'quay' }) as unknown as store.StoreLayout;
  const base = { request: INPUT.request, material: [{ name: 'notes', text: 'The harbour reopened on Tuesday.' }], method: [], examples: [], questions: true, plan: false, interactive: false, model: 'reader' };
  it('the question comes back as a choice; the work is written with the default, said in one line; nothing is remembered', async () => {
    const l = L();
    const p = await beforeTheDraft({ ...base, L: l, answers: undefined, client: reader() });
    expect(p.questions.map((q) => q.id)).toEqual(['angle']);
    expect(p.said[0]).toBe('Questions before writing (1): written with the defaults (angle: The town\'s jobs); to answer, run again with --answers "angle=<letter or your words>".');
    expect(p.note).toContain('- Why does this matter to you now? The town\'s jobs');
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The town\'s jobs', by: 'default' }]);
    expect(store.getTold(l)).toEqual([]);
  });
  it('--answers answers it; the answer is remembered, and is the default the next time it is asked', async () => {
    const l = L();
    const p = await beforeTheDraft({ ...base, L: l, answers: 'angle=c', client: reader() });
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The old quay', by: 'person' }]);
    expect(store.getTold(l).map((t) => [t.id, t.answer])).toEqual([['angle', 'The old quay']]);
    const next = await beforeTheDraft({ ...base, L: l, answers: undefined, client: reader() });
    expect(next.questions[0]).toMatchObject({ default: 'The old quay', last: 'The old quay' });
  });
  it('with no reader set up, nothing is asked and nothing is said', async () => {
    const p = await beforeTheDraft({ ...base, L: L(), answers: undefined, client: null, model: null });
    expect([p.questions, p.said, p.note, p.record]).toEqual([[], [], '', null]);
  });
});

describe('at a terminal: asked, a letter or the person\'s own words; "just write it" takes the defaults', () => {
  const reader = (): InferenceClient => ({ complete: async () => anInferenceResult({ json: { decisions: [ANGLE,
    d('EMPHASIS', 'UNKNOWN', 'DIFFERENT', { ask: 'Stress what?', options: ['jobs', 'ferries'], default: 'jobs' })] } }) });
  const L = () => ({ root: mkdtempSync(join(tmpdir(), 'atelier-qt-')), skillName: 'quay' }) as unknown as store.StoreLayout;
  const base = { request: INPUT.request, material: [], method: [], examples: [], questions: true, plan: false, interactive: true, model: 'reader', answers: undefined };
  it('a letter is its option, own words are kept; both remembered', async () => {
    const typed = ['b', 'the night crossings'];
    const p = await beforeTheDraft({ ...base, L: L(), client: reader(), read: async () => typed.shift() ?? '' });
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The town\'s jobs', by: 'person' }, { id: 'emphasis', answer: 'the night crossings', by: 'person' }]);
  });
  it('"just write it" stops asking: the rest is written with the defaults', async () => {
    const p = await beforeTheDraft({ ...base, L: L(), client: reader(), read: async () => 'just write it' });
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The town\'s jobs', by: 'default' }, { id: 'emphasis', answer: 'jobs', by: 'default' }]);
  });
});
