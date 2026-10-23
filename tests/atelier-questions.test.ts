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
import { QUESTIONS, readAnswers, type QuestionsInput } from '../core/loop/questions.js';
import { readContext } from '../core/inference/reading.js';
import { beforeTheDraft } from '../cli/prewrite.js';
import type { InferenceClient } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { anInferenceResult } from './fixtures.js';

const INPUT: QuestionsInput = { request: 'Write a post reacting to the harbour reopening.', material: [{ name: 'notes', head: 'The harbour reopened on Tuesday.' }], method: [], examples: [], told: [] };
const d = (kind: string, status: string, spread: string, extra: Record<string, unknown> = {}) => ({ kind, status, spread, settledBy: 'author-only', what: `${kind.toLowerCase()} of the post`, ask: null, options: [], default: null, ...extra });
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
  it('a letter names an option; anything else is the person\'s own words; a part with no id is skipped', () => {
    expect([...readAnswers('angle=b, news=we opened a second berth, =x', qs).answers]).toEqual([['angle', 'option b'], ['news', 'we opened a second berth, =x']]);
  });
  it('an answer may hold commas: pairs split only where a comma is followed by an id and "="', () => {
    expect([...readAnswers('angle=the cost, not the speed, of it,emphasis = jobs', qs).answers]).toEqual([['angle', 'the cost, not the speed, of it'], ['emphasis', 'jobs']]);
  });
  it('a letter past the options takes the default and says so; it is no answer', () => {
    const r = readAnswers('angle=d', qs);
    expect([...r.answers]).toEqual([]);
    expect(r.said).toEqual(['angle=d: the question has no option d; written with the default (option a).']);
  });
  it('an id that is no question kind is said in one line and ignored', () => {
    const r = readAnswers('tone=casual,angle=b', qs);
    expect([...r.answers]).toEqual([['angle', 'option b']]);
    expect(r.said).toEqual(['tone matched no question; ignored.']);
  });
  it('a known kind this run did not ask is kept as the person\'s words', () => {
    expect([...readAnswers('naming=only the product', qs).answers]).toEqual([['naming', 'only the product']]);
  });
});

describe('what code asks, by form (fault-checked)', () => {
  const four = [
    d('EMPHASIS', 'UNKNOWN', 'DIFFERENT', { ask: 'Stress what?', options: ['jobs', 'ferries'], default: 'jobs' }),
    d('NEWS', 'UNKNOWN', 'DIFFERENT', { ask: 'Any news of yours?', options: ['a new berth', 'none'], default: 'none' }),
    d('NAMING', 'UNKNOWN', 'DIFFERENT', { ask: 'Name the operator?', options: ['yes', 'no'], default: 'no' }),
    ANGLE];
  it('four valid unknown decisions: exactly three asked, angle, naming, news', () => {
    expect(QUESTIONS.ground({ decisions: four }, INPUT)?.questions.map((x) => x.id)).toEqual(['angle', 'naming', 'news']);
  });
  it('an unknown angle with five options is not asked; with four it is', () => {
    const opts = ['one', 'two', 'three', 'four', 'five'];
    expect(QUESTIONS.ground({ decisions: [{ ...ANGLE, options: opts, default: 'one' }] }, INPUT)?.questions).toEqual([]);
    expect(QUESTIONS.ground({ decisions: [{ ...ANGLE, options: opts.slice(0, 4), default: 'one' }] }, INPUT)?.questions.map((x) => x.options)).toEqual([opts.slice(0, 4)]);
  });
  it('only a decision the reader says the author alone settles is asked: a voice question labelled ANGLE but settled by the examples is not', () => {
    const tone = d('ANGLE', 'UNKNOWN', 'DIFFERENT', { settledBy: 'examples', ask: 'Should the tone be casual or formal?', options: ['casual', 'formal'], default: 'casual' });
    expect(QUESTIONS.ground({ decisions: [tone] }, INPUT)?.questions).toEqual([]);
    const { settledBy: _, ...unsaid } = ANGLE;
    expect(QUESTIONS.ground({ decisions: [unsaid] }, INPUT)?.questions).toEqual([]);
    expect(QUESTIONS.ground({ decisions: [ANGLE] }, INPUT)?.questions).toHaveLength(1);
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
  it('a letter past the options: the default, said, and nothing remembered', async () => {
    const l = L();
    const p = await beforeTheDraft({ ...base, L: l, answers: 'angle=d', client: reader() });
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The town\'s jobs', by: 'default' }]);
    expect(p.said).toContain('angle=d: the question has no option d; written with the default (The town\'s jobs).');
    expect(store.getTold(l)).toEqual([]);
  });
  it('an id no question carries is said and ignored; a kind not asked this run is applied and replaces what the skill was told', async () => {
    const l = L();
    store.addTold(l, [{ id: 'naming', ask: 'Name the operator?', answer: 'never the operator', at: 't' }]);
    const p = await beforeTheDraft({ ...base, L: l, answers: 'tone=casual,naming=only the product', client: reader() });
    expect(p.said).toContain('tone matched no question; ignored.');
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The town\'s jobs', by: 'default' }, { id: 'naming', answer: 'only the product', by: 'person' }]);
    expect(p.note).toContain('- Name the operator? only the product');
    expect(p.note).not.toContain('never the operator');
    expect(store.getTold(l).map((t) => [t.id, t.answer]).pop()).toEqual(['naming', 'only the product']);
  });
  it('with no reader set up, nothing is asked and nothing is said; the record keeps only why there is no plan', async () => {
    const p = await beforeTheDraft({ ...base, L: L(), answers: undefined, client: null, model: null });
    expect([p.questions, p.said, p.note]).toEqual([[], [], '']);
    expect(p.record).toEqual({ questions: [], answers: [], questionsBy: 'floor', plan: null, planBy: 'off', noPlan: 'no plan: --no-plan was given' });
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
    expect(p.record?.answers).toEqual([{ id: 'angle', answer: 'The town\'s jobs', by: 'default' }, { id: 'emphasis', answer: 'jobs', by: 'default' }]);    expect(p.said).toEqual(['Asked before writing: 2 question(s); 0 answered by you, 2 with the default (angle: The town\'s jobs; emphasis: jobs).']);
  });
});

describe('the angle and the news are the author\'s where nothing given states them (round 4, item 3)', () => {
  // A reaction post with no stated angle: the reader marked every decision known or inferable, and nothing was asked. The
  // angle (why now) and news of the author's own work are now asked by where they are stated, a closed field the reader
  // fills with a quote code finds there: the request, the material, what the skill was told, or NONE. Unstated, they are
  // the author's, whatever status the reader gave them; stated, they are never asked.
  const REACT: QuestionsInput = { request: 'Write a long post on X reacting to this week\'s news about the wharf, about 450 to 700 words.',
    material: [{ name: 'points', head: '- The regional council voted this week to close the old cargo wharf at Stannard Lock to commercial boats from next spring.' }], method: [], examples: [], told: [] };
  const angle = (extra: Record<string, unknown>) => d('ANGLE', 'INFERABLE', 'SOME', { settledBy: 'material', ask: 'Why does the wharf vote matter to you now?', options: ['The growers lose their wharf', 'The lanes fill with lorries', 'Nobody asked the growers'], default: 'The growers lose their wharf', ...extra });
  it('no stated angle: asked, though the reader called it inferable from the material', () => {
    expect(QUESTIONS.ground({ decisions: [angle({ statedIn: 'NONE', quote: null })] }, REACT)?.questions.map((q) => q.id)).toEqual(['angle']);
  });
  it('an angle said to be stated with a quote that is not there is not stated: asked', () => {
    expect(QUESTIONS.ground({ decisions: [angle({ statedIn: 'request', quote: 'arguing for the ramp' })] }, REACT)?.questions.map((q) => q.id)).toEqual(['angle']);
  });
  it('the request states the angle: nothing is asked, whatever else the reader said', () => {
    const stated = { ...REACT, request: 'Write a long post on X arguing that the council should give the co-op one season to build the ramp.' };
    expect(QUESTIONS.ground({ decisions: [angle({ status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', statedIn: 'request', quote: 'give the co-op one season to build the ramp' })] }, stated)?.questions).toEqual([]);
  });
  it('news of their own work stated in the material is not asked; unstated, it is', () => {
    const news = (extra: Record<string, unknown>) => d('NEWS', 'KNOWN', 'SAME', { settledBy: 'material', ask: 'Any news of the co-op the post may carry?', options: ['None', 'A new orchard joined'], default: 'None', ...extra });
    expect(QUESTIONS.ground({ decisions: [news({ statedIn: 'material', quote: 'close the old cargo wharf at Stannard Lock' })] }, REACT)?.questions).toEqual([]);
    expect(QUESTIONS.ground({ decisions: [news({ statedIn: 'NONE', quote: null })] }, REACT)?.questions.map((q) => q.id)).toEqual(['news']);
  });
  it('the reader is offered where each is stated, NONE among the choices', () => {
    expect(JSON.stringify(QUESTIONS.schema)).toContain('"statedIn"');
    expect(JSON.stringify(QUESTIONS.schema)).toContain('"NONE"');
  });
});
