// tests/atelier-dealer.test.ts — DIRECTIONS DEALT BY CODE (KIND, FIT, RECENCY, A SEED), ONE CHOSEN BY A READING, THE
// CONVENTIONAL WAY ALWAYS OFFERED AND NEVER THE FLOOR'S PICK, FORM ONLY, AND AN APPEND-ONLY HISTORY.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { weightedSample, dealWeights, dealAngles, chooseAngle, directionNote, recordAngleUse, recentAngles, recentAngleUses, FIT, CANON, FORM_ONLY, type DealContext } from '../core/library/dealer.js';
import type { Angle } from '../core/library/schema.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { anInferenceResult } from './fixtures.js';

const angle = (id: string, kind = 'blog', fitsWhen = `when ${id} fits`): Angle => ({ id, kind, idea: `the ${id} idea`, structure: `${id} structure`, openingMove: `${id} opening`, evidenceType: 'a case', fitsWhen, pitfalls: [], steal: 'a move' });
const ANGLES = ['a', 'b', 'c', 'd', 'e'].map((id) => angle(id)).concat([angle('x', 'newsletter')]);
const CTX: DealContext = { kind: 'blog', requestSummary: 'A post on the harbour reopening with traders\' figures.', inventoryCount: 6, recent: [], seed: 's1' };
const budget = () => ({ spentUsd: 0, capUsd: 1 });
const scripted = (json: unknown, seen: InferenceRequest[] = []): InferenceClient => ({ complete: async (req) => { seen.push(req); return anInferenceResult({ json }); } });

describe('the seeded draw', () => {
  it('is deterministic for a seed, draws without replacement, and never draws a zero weight', () => {
    const items = [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }, { id: 'c', weight: 0 }, { id: 'd', weight: 1 }];
    const one = weightedSample(items, 3, 'seed');
    expect(weightedSample(items, 3, 'seed')).toEqual(one);
    expect(new Set(one).size).toBe(3);
    expect(one).not.toContain('c');
    expect(weightedSample(items, 5, 'seed')).toHaveLength(3);
  });
  it('draws in proportion to weight: a 3-to-1 weight comes first about three times in four', () => {
    let first = 0; const n = 4000;
    for (let i = 0; i < n; i++) if (weightedSample([{ id: 'heavy', weight: 3 }, { id: 'light', weight: 1 }], 1, `seed-${i}`)[0] === 'heavy') first++;
    expect(Math.abs(first / n - 0.75)).toBeLessThan(0.03);
  });
  it('different seeds give different deals', () => {
    const items = ANGLES.filter((a) => a.kind === 'blog').map((a) => ({ id: a.id, weight: 1 }));
    expect(new Set(Array.from({ length: 20 }, (_, i) => weightedSample(items, 3, `s${i}`).join(','))).size).toBeGreaterThan(5);
  });
});

describe('the weights: kind, fit, recency', () => {
  it('only the request\'s kind; uniform with no fit; recent ids kept out while three others are left', () => {
    expect(dealWeights(ANGLES, { ...CTX, recent: ['a', 'b'] }, new Map(), 3)).toEqual([
      { id: 'a', weight: 0 }, { id: 'b', weight: 0 }, { id: 'c', weight: 1 }, { id: 'd', weight: 1 }, { id: 'e', weight: 1 }]);
  });
  it('recent ids are only penalised where excluding them would leave fewer than k', () => {
    const w = dealWeights(ANGLES, { ...CTX, recent: ['a', 'b', 'c'] }, new Map([['a', 'STRONG' as const]]), 3);
    expect(w.find((x) => x.id === 'a')?.weight).toBeCloseTo(3 * 0.2);
    expect(w.find((x) => x.id === 'd')?.weight).toBe(1);
  });
});

describe('the fit reading and the deal', () => {
  it('a fit is held to a quote from the request; an unknown id is dropped', () => {
    const input = { requestSummary: CTX.requestSummary, inventoryCount: 6, angles: ANGLES.slice(0, 3) };
    const g = FIT.ground({ fits: [{ id: 'a', fit: 'STRONG', quote: "traders' figures" }, { id: 'b', fit: 'STRONG', quote: 'a scene at dawn' }, { id: 'zz', fit: 'SOME', quote: 'harbour' }] }, input);
    expect([...(g ?? [])]).toEqual([['a', 'STRONG'], ['b', 'NONE']]);
  });
  it('with no model every direction weighs alike, the deal is three of the kind, and the same seed deals the same', async () => {
    const d1 = await dealAngles(ANGLES, CTX); const d2 = await dealAngles(ANGLES, CTX);
    expect(d1.dealt).toEqual(d2.dealt);
    expect(d1.dealt).toHaveLength(3);
    expect(d1.dealt).not.toContain('x');
    expect([d1.fitBy, d1.seed]).toEqual(['floor', 's1']);
    expect(Object.values(d1.weights)).toEqual([1, 1, 1, 1, 1]);
  });
  it('with a reader, the grounded fit sets the weights', async () => {
    const d = await dealAngles(ANGLES, CTX, 3, { client: scripted({ fits: [{ id: 'c', fit: 'STRONG', quote: 'harbour reopening' }] }), model: 'm', budget: budget() });
    expect(d.fitBy).toBe('model');
    expect(d.weights).toEqual({ a: 1, b: 1, c: 3, d: 1, e: 1 });
  });
});

describe('the choice', () => {
  const cands = ANGLES.slice(0, 3);
  it('the model picks one with a reason; the conventional way is offered last and named not recommended', async () => {
    const seen: InferenceRequest[] = [];
    const c = await chooseAngle(cands, CTX, scripted({ choice: 'b', reason: 'the figures carry a case' }, seen), 'm');
    expect(c).toEqual({ dealt: ['a', 'b', 'c'], choice: 'b', reason: 'the figures carry a case', seed: 's1', by: 'model' });
    expect(seen[0].userMessage).toMatch(/Standing exit \(canon, not recommended\)/);
    expect((seen[0].schema.properties as { choice: { enum: string[] } }).choice.enum).toEqual(['a', 'b', 'c', 'canon']);
  });
  it('a choice outside the deal is no choice; the floor takes the first dealt, never the conventional way', async () => {
    const c = await chooseAngle(cands, CTX, scripted({ choice: 'e', reason: 'blend' }), 'm');
    expect([c.choice, c.by]).toEqual(['a', 'floor']);
    expect((await chooseAngle(cands, CTX, null)).choice).toBe('a');
    expect((await chooseAngle([], CTX, null)).choice).toBe(CANON);
  });
  it('the writer is told the direction is form only', () => {
    expect(directionNote(cands[0])).toContain('How it opens: a opening');
    expect(directionNote(cands[0]).endsWith(FORM_ONLY)).toBe(true);
    expect(directionNote(CANON).endsWith('the position it takes comes from the material and the author.')).toBe(true);
  });
});

describe('the history', () => {
  it('appends, reads back the last N oldest first, and filters by kind', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'dealer-')), skillName: 's' };
    expect(recentAngles(L, 3)).toEqual([]);
    for (const [a, k] of [['a', 'blog'], ['x', 'newsletter'], ['b', 'blog'], ['c', 'blog']]) recordAngleUse(L, { angle: a, kind: k, dealt: [a], seed: 'z', at: 't' });
    expect(recentAngles(L, 2)).toEqual(['b', 'c']);
    expect(recentAngles(L, 5, 'blog')).toEqual(['a', 'b', 'c']);
    expect(recentAngleUses(L, 1)[0]).toEqual({ angle: 'c', kind: 'blog', dealt: ['c'], seed: 'z', at: 't' });
  });
});
