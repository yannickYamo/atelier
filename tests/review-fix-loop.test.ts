import { describe, expect, it } from 'vitest';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { runFixLoop, FIXES_APPLIED, type SpanWriter } from '../core/review/fix-loop.js';
import type { Fix, Review } from '../core/review/reviewer.js';
import { anInferenceResult } from './fixtures.js';

const DRAFT = 'One. Two. Three. Four. Five.';
const fix = (quote: string, instruction = `sharpen ${quote}`): Fix => ({ quote, instruction, criterion: null });
const review = (fixes: Fix[], verdict: Review['verdict'] = 'fix'): Review => ({
  verdict, overall: 6, weightedAverage: 6, scores: [], capsFired: [], mainFailure: 'craft', missingFacts: [], fixes, droppedFixes: 0, keep: null,
  inventory: { claims: [], dropped: 0, by: 'model' }, by: 'model', reader: 'r',
});
const budget = () => ({ spentUsd: 0, capUsd: 10 });
const upper: SpanWriter = async ({ span }) => span.toUpperCase();

function checker(answer: (req: InferenceRequest) => unknown) {
  const seen: InferenceRequest[] = [];
  const client: InferenceClient = { complete: async (req) => { seen.push(req); return anInferenceResult({ json: answer(req) }); } };
  return { client, seen };
}

describe('runFixLoop', () => {
  it('applies only the top three fixes, span-locally, then checks once and stops', async () => {
    const writes: string[] = [];
    const w: SpanWriter = async (r) => { writes.push(r.span); return r.span.toUpperCase(); };
    const c = checker(() => ({ fixes: [{ n: 1, score: 9 }, { n: 2, score: 8 }, { n: 3, score: 3 }], regressions: [] }));
    const out = await runFixLoop(DRAFT, review([fix('One.'), fix('Two.'), fix('Four.'), fix('Five.')]), w, { client: c.client, model: 'm', budget: budget() });
    expect(FIXES_APPLIED).toBe(3);
    expect(writes).toEqual(['One.', 'Two.', 'Four.']);
    expect(out.draft).toBe('ONE. TWO. Three. FOUR. Five.');
    expect(out.revised).toBe(true);
    expect(c.seen).toHaveLength(1);                                  // one verdict pass, never more
    expect(out.history.map((h) => h.step)).toEqual(['review', 'apply', 'check', 'stop']);
    const check = out.history.find((h) => h.step === 'check');
    expect(check?.step === 'check' ? check.check.scores.map((s) => s.done) : null).toEqual([true, true, false]);
  });

  it('keeps at most three regressions and only those quoted from the revised draft', async () => {
    const c = checker(() => ({ fixes: [{ n: 1, score: 8 }], regressions: [
      { quote: 'ONE.', why: 'a' }, { quote: 'not there', why: 'b' }, { quote: 'Two.', why: 'c' }, { quote: 'Three.', why: 'd' }, { quote: 'Four.', why: 'e' }] }));
    const out = await runFixLoop(DRAFT, review([fix('One.')]), upper, { client: c.client, model: 'm', budget: budget() });
    const check = out.history.find((h) => h.step === 'check');
    expect(check?.step === 'check' ? check.check.regressions.map((g) => g.why) : null).toEqual(['a', 'c', 'd']);
    expect(out.revised).toBe(true);                                  // a fix landed, so the revision stands
  });

  it('keeps the original when nothing landed and something got worse', async () => {
    const c = checker(() => ({ fixes: [{ n: 1, score: 2 }], regressions: [{ quote: 'ONE.', why: 'shouting' }] }));
    const out = await runFixLoop(DRAFT, review([fix('One.')]), upper, { client: c.client, model: 'm', budget: budget() });
    expect(out.draft).toBe(DRAFT); expect(out.revised).toBe(false);
  });

  it('does nothing on a verdict other than fix', async () => {
    for (const v of ['ship', 'redraft', 'regather', 'unverified'] as const) {
      const out = await runFixLoop(DRAFT, review([fix('One.')], v), upper, { client: null, model: null, budget: budget() });
      expect(out.draft).toBe(DRAFT); expect(out.history.map((h) => h.step)).toEqual(['review', 'stop']);
    }
  });

  it('skips a span an earlier fix changed and a writer that fails; with no model the revision stands unchecked', async () => {
    let n = 0;
    const w: SpanWriter = async ({ span }) => { n += 1; if (n === 2) throw new Error('boom'); return span === 'One. Two.' ? 'Uno. Dos.' : span.toUpperCase(); };
    const out = await runFixLoop(DRAFT, review([fix('One. Two.'), fix('Two.'), fix('Three.'), fix('Four.')]), w, { client: null, model: null, budget: budget() });
    expect(out.draft).toBe('Uno. Dos. Three. Four. Five.');
    const apply = out.history.find((h) => h.step === 'apply');
    expect(apply?.step === 'apply' ? apply.skipped.map((s) => s.fix.quote) : null).toEqual(['Two.', 'Three.']);
    const check = out.history.find((h) => h.step === 'check');
    expect(check?.step === 'check' ? check.check.by : null).toBe('floor');
    expect(out.revised).toBe(true);
  });
});
