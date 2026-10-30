// HOW STRICTLY OUTPUT IS HELD IS READ FROM THE WORK, NOT OFF ITS NAME, AND IT IS THE OWNER'S. A model names a level only
// with quotes code finds in what it was shown; with no model, or no grounded quote, the floor is GROUNDED and reads no
// words. At run time a request may move the level stricter, never looser. The level is inside the standard's hash.
import { describe, it, expect } from 'vitest';
import { LATITUDE, REQUEST_LATITUDE, latitudeBrief, stricter, parseLatitude } from '../core/observers/latitude.js';
import { readContext } from '../core/inference/reading.js';
import type { InferenceClient } from '../core/inference/client.js';
import { createHash } from 'node:crypto';
import { standardHashOf, latitudeOf } from '../core/state/canonical-state.js';

const scripted = (answers: unknown[]): InferenceClient & { calls: number } => {
  const c = { calls: 0, complete: async () => { const a = answers[c.calls] ?? answers[answers.length - 1]; c.calls += 1; if (a instanceof Error) throw a; return { json: a, text: JSON.stringify(a), cost: { usd: 0 } } as never; } };
  return c;
};
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 5 });
const post = 'Last week I deleted half our dashboards. Here is why I would do it again.';
const input = { purpose: 'write my weekly newsletter', method: null, examples: [post] };

describe('the latitude reading at build', () => {
  it('keeps a model level that quotes the work', async () => {
    const d = await readContext(LATITUDE, input, scripted([{ level: 'CREATIVE', quotes: ['weekly newsletter', 'I deleted half our dashboards'] }]), 'm', budget());
    expect(d.by).toBe('model');
    expect(d.value.level).toBe('CREATIVE');
    expect(d.value.evidence).toEqual(['weekly newsletter', 'I deleted half our dashboards']);
  });
  it('drops quotes that are not in what was shown, and an answer with none left is no answer: the floor decides', async () => {
    const d = await readContext(LATITUDE, input, scripted([{ level: 'STRICT', quotes: ['indemnification clause'] }]), 'm', budget());
    expect(d.by).toBe('floor');
    expect(d.value).toEqual({ level: 'GROUNDED', evidence: [] });
  });
  it('a level outside the three is no answer', async () => {
    const d = await readContext(LATITUDE, input, scripted([{ level: 'LOOSE', quotes: ['weekly newsletter'] }]), 'm', budget());
    expect(d.value.level).toBe('GROUNDED');
  });
  it('with no model the floor is GROUNDED, whatever the work is called', async () => {
    const d = await readContext(LATITUDE, { purpose: 'draft contracts', method: null, examples: [] }, null, null, budget());
    expect(d).toMatchObject({ by: 'floor', value: { level: 'GROUNDED', evidence: [] } });
  });
  it('nothing to read is decided by code, and no model is asked', async () => {
    const c = scripted([{ level: 'CREATIVE', quotes: [] }]);
    const d = await readContext(LATITUDE, { purpose: null, method: null, examples: [] }, c, 'm', budget());
    expect(d.by).toBe('code'); expect(c.calls).toBe(0); expect(d.value.level).toBe('GROUNDED');
  });
});

describe('the request may only tighten', () => {
  const req = 'Announce that revenue grew 40% this quarter.';
  it('a stricter level stands on the request\'s own words', async () => {
    const d = await readContext(REQUEST_LATITUDE, { level: 'CREATIVE', request: req }, scripted([{ level: 'STRICT', quote: 'revenue grew 40%' }]), 'm', budget());
    expect(d.value).toEqual({ level: 'STRICT', quote: 'revenue grew 40%' });
  });
  it('a looser answer is the skill\'s level', async () => {
    const d = await readContext(REQUEST_LATITUDE, { level: 'GROUNDED', request: req }, scripted([{ level: 'CREATIVE', quote: null }]), 'm', budget());
    expect(d.value).toEqual({ level: 'GROUNDED', quote: null });
  });
  it('a tighter answer quoting nothing of the request is no answer: the skill\'s level', async () => {
    const d = await readContext(REQUEST_LATITUDE, { level: 'CREATIVE', request: req }, scripted([{ level: 'STRICT', quote: 'a binding term' }]), 'm', budget());
    expect(d.by).toBe('floor'); expect(d.value.level).toBe('CREATIVE');
  });
  it('a strict skill is not read: nothing is stricter', async () => {
    const c = scripted([{ level: 'STRICT', quote: null }]);
    const d = await readContext(REQUEST_LATITUDE, { level: 'STRICT', request: req }, c, 'm', budget());
    expect(d.by).toBe('code'); expect(c.calls).toBe(0);
  });
  it('stricter and parse', () => {
    expect(stricter('CREATIVE', 'GROUNDED')).toBe('GROUNDED');
    expect(stricter('STRICT', 'CREATIVE')).toBe('STRICT');
    expect(parseLatitude(' creative ')).toBe('CREATIVE');
    expect(parseLatitude('loose')).toBeNull();
  });
});

describe('the brief by level', () => {
  it('creative composes freely and sources only facts presented as real; strict the opposite', () => {
    expect(latitudeBrief('CREATIVE')).toMatch(/compose freely/);
    expect(latitudeBrief('CREATIVE')).toMatch(/hypotheticals marked/);
    expect(latitudeBrief('STRICT')).toMatch(/no analogy, no hypothetical/);
    expect(latitudeBrief('STRICT')).toMatch(/stops the work/);
    expect(latitudeBrief('GROUNDED')).toMatch(/flagged for review/);
    expect(new Set(['STRICT', 'GROUNDED', 'CREATIVE'].map((l) => latitudeBrief(l as 'STRICT')))).toHaveProperty('size', 3);
  });
});

describe('the level is the owner\'s: inside the hash', () => {
  const body = { evidenceId: null, workType: 'posts', requirements: [] };
  it('a standard minted before latitude hashes as it did', () => {
    // the hash of { evidenceId, workType, requirements } alone, as every older standard was minted
    const old = createHash('sha256').update('{"evidenceId":null,"workType":"posts","requirements":[]}').digest('hex').slice(0, 16);
    expect(standardHashOf(body)).toBe(old);
    expect(latitudeOf({})).toBe('GROUNDED');
  });
  it('changing the level, or the rules accepted unmeasured, changes the hash; the evidence does not', () => {
    const a = standardHashOf({ ...body, latitude: { level: 'CREATIVE', evidence: ['x'], by: 'model' } });
    const b = standardHashOf({ ...body, latitude: { level: 'CREATIVE', evidence: ['y'], by: 'owner' } });
    const c = standardHashOf({ ...body, latitude: { level: 'STRICT', evidence: [], by: 'owner' } });
    expect(a).toBe(b); expect(a).not.toBe(c); expect(a).not.toBe(standardHashOf(body));
    expect(standardHashOf({ ...body, acceptedUnmeasured: ['p1'] })).not.toBe(standardHashOf(body));
  });
});
