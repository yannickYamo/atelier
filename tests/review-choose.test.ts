import { describe, expect, it } from 'vitest';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { Rubric } from '../core/library/schema.js';
import { chooseDraft, type ChooseContext } from '../core/review/choose.js';
import { anInferenceResult } from './fixtures.js';

const RUBRIC: Rubric = { kind: 'blog', criteria: [{ id: 'proof', weight: 1, question: 'proof?' }], caps: [] };
const SHORT = 'Signups rose 40% after we cut the form to two fields.';
const LONG = 'Onboarding matters a great deal. In this comprehensive post we cover every angle, from mindset to metrics, '
  + 'from culture to craft, and every lesson is important, and together they form a complete picture of success.';
const between = (msg: string, tag: string): string => msg.split(`<${tag}>\n`)[1].split(`\n</${tag}>`)[0];
const client = (pick: (first: string, second: string) => string): { c: InferenceClient; calls: InferenceRequest[] } => {
  const calls: InferenceRequest[] = [];
  return { calls, c: { complete: async (req) => { calls.push(req);
    return anInferenceResult({ json: { better: pick(between(req.userMessage, 'first_draft'), between(req.userMessage, 'second_draft')), reasons: ['why'] } }); } } };
};
const ctx = (c: InferenceClient | null): ChooseContext => ({ request: 'post', material: 'Signups rose 40%.', rubric: RUBRIC, cards: [], client: c, model: c ? 'm' : null, budget: { spentUsd: 0, capUsd: 10 } });

describe('chooseDraft', () => {
  it('a model that follows the content instruction picks the shorter draft with the proof, in both orders', async () => {
    const k = client((f, s) => (f.includes('40%') ? 'first' : s.includes('40%') ? 'second' : 'neither'));
    expect((await chooseDraft(LONG, SHORT, ctx(k.c))).winner).toBe('b');
    expect((await chooseDraft(SHORT, LONG, ctx(k.c))).winner).toBe('a');
    expect(k.calls).toHaveLength(4);
  });
  it('a comparison that cannot be read says why on its reason', async () => {
    const failing: InferenceClient = { complete: async () => { throw new Error('upstream 529 overloaded'); } };
    const r = await chooseDraft(SHORT, LONG, ctx(failing));
    expect(r.winner).toBe('tie');
    expect(r.reasons[0]).toContain('upstream 529 overloaded');
  });
  it('a model that always picks the first position yields a tie', async () => {
    const k = client(() => 'first');
    const r = await chooseDraft(SHORT, LONG, ctx(k.c));
    expect(r).toMatchObject({ winner: 'tie', calls: 2 });
  });
  it('a model that always picks the longer draft wins for it only by agreement, which the code reports as given', async () => {
    const k = client((f, s) => (f.length > s.length ? 'first' : 'second'));
    expect((await chooseDraft(SHORT, LONG, ctx(k.c))).winner).toBe('b');
  });
  it('the draft order is really swapped between the two calls', async () => {
    const k = client(() => 'neither');
    const r = await chooseDraft('AAA draft', 'BBB draft', ctx(k.c));
    expect(between(k.calls[0].userMessage, 'first_draft')).toBe('AAA draft');
    expect(between(k.calls[1].userMessage, 'first_draft')).toBe('BBB draft');
    expect(r.winner).toBe('tie');
  });
  it('no model, or an unreadable answer, is a tie for the caller', async () => {
    expect(await chooseDraft(SHORT, LONG, ctx(null))).toMatchObject({ winner: 'tie', calls: 0 });
    const bad: InferenceClient = { complete: async () => anInferenceResult({ json: { better: 'maybe' } }) };
    expect(await chooseDraft(SHORT, LONG, ctx(bad))).toMatchObject({ winner: 'tie', calls: 2 });
  });
});
