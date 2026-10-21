// tests/written-check.test.ts — A CHECK WRITTEN FOR ONE STEP RUNS IN A SANDBOX, AND IS ONLY EVER A VERDICT ON THE TEXT.
import { describe, it, expect } from 'vitest';
import { compileCheck, runCheck, CHECK, checkQualified, CHECK_TIME_LIMIT_MS } from '../core/observers/written.js';
import { measure, validateMeasurement } from '../core/observers/registry.js';

const HEX = `(text) => { const hits = []; const re = /#[0-9a-fA-F]{3,8}\\b/g; let m; while ((m = re.exec(text))) hits.push({ start: m.index, end: m.index + m[0].length, why: 'a colour written as a hex value' }); return { ok: hits.length === 0, detail: hits.length ? hits.length + ' hex colour(s)' : 'no hex colour', spans: hits, value: hits.length }; }`;
const UNITS = `function check(text) { const nums = [...text.matchAll(/\\b(\\d+)\\s*(min|minutes|h|hours|days?|weeks?)?\\b/g)]; const bare = nums.filter((m) => !m[2]); return { ok: bare.length === 0, detail: bare.length + ' estimate(s) without a unit', spans: bare.map((m) => ({ start: m.index, end: m.index + m[0].length })) }; }`;

describe('compiling and running a written check', () => {
  it('an arrow function and a function named check both compile, and give a verdict with the spans they read', () => {
    const hex = compileCheck(HEX); const units = compileCheck(UNITS);
    expect(hex.problem).toBeUndefined(); expect(units.problem).toBeUndefined();
    const bad = runCheck(hex.fn!, 'Use #bbbbbb on white.', undefined, 'no hex colour');
    expect(bad.verdict).toBe('VIOLATED'); expect(bad.spans.map((s) => s.text)).toEqual(['#bbbbbb']); expect(bad.value).toBe(1);
    expect(runCheck(hex.fn!, 'Use the token color.border.', undefined, 'no hex colour').verdict).toBe('MET');
    expect(runCheck(units.fn!, 'This takes 20.', undefined, 'units').verdict).toBe('VIOLATED');
    expect(runCheck(units.fn!, 'This takes 20 minutes.', undefined, 'units').verdict).toBe('MET');
  });
  it('null means nothing to read; a wrong shape, a throw or a run past the limit has not run', () => {
    expect(runCheck(compileCheck('() => null').fn!, 'x', undefined, 'w').verdict).toBe('NOT_APPLICABLE');
    expect(runCheck(compileCheck('() => 42').fn!, 'x', undefined, 'w')).toMatchObject({ verdict: 'NOT_APPLICABLE', detail: expect.stringContaining('returned no { ok } object') as string });
    expect(runCheck(compileCheck('() => { throw new Error("boom"); }').fn!, 'x', undefined, 'w')).toMatchObject({ verdict: 'NOT_APPLICABLE', detail: 'the check could not run (boom)' });
    const t0 = Date.now();
    const slow = runCheck(compileCheck('() => { for (;;) {} }').fn!, 'x', undefined, 'w');
    expect(slow.verdict).toBe('NOT_APPLICABLE'); expect(slow.detail).toMatch(/could not run/);
    expect(Date.now() - t0).toBeLessThan(CHECK_TIME_LIMIT_MS * 20);
  });
  it('the sandbox has no way out: no require, no process, no fetch, no this', () => {
    for (const src of ['() => ({ ok: typeof require === "undefined" })', '() => ({ ok: typeof process === "undefined" })', '() => ({ ok: typeof fetch === "undefined" })', '() => ({ ok: typeof globalThis.setTimeout === "undefined" })']) {
      expect(runCheck(compileCheck(src).fn!, 'x', undefined, 'w').verdict, src).toBe('MET');
    }
    expect(compileCheck('(text) => eval("1")').problem).toBeUndefined();
    expect(runCheck(compileCheck('(text) => ({ ok: eval("1") === 1 })').fn!, 'x', undefined, 'w').verdict).toBe('NOT_APPLICABLE');
  });
  it('spans outside the text are dropped, and a span carries the text it covers', () => {
    const r = runCheck(compileCheck('(t) => ({ ok: false, spans: [{ start: 0, end: 3 }, { start: 2, end: 99 }, { start: -1, end: 2 }] })').fn!, 'abcdef', undefined, 'w');
    expect(r.spans).toEqual([{ start: 0, end: 3, text: 'abc', why: 'w' }]);
  });
  it('the request and the material reach the check as plain values', () => {
    const r = runCheck(compileCheck('(text, request, material) => ({ ok: request === "r" && material.length === 1 && material[0].name === "m" && material[0].text === "mt" })').fn!, 'x', { request: 'r', material: [{ name: 'm', text: 'mt' }] }, 'w');
    expect(r.verdict).toBe('MET');
  });
});

describe('the CHECK observer', () => {
  const m = { observer: 'CHECK' as const, params: { source: [HEX], means: ['no colour written as a hex value'] } };
  it('validates by compiling and running on plain text; refuses what does not compile or is not a function', () => {
    expect(validateMeasurement(m)).toBeNull();
    expect(validateMeasurement({ observer: 'CHECK', params: { source: ['(text) => {'], means: ['x'] } })).toMatch(/does not compile/);
    expect(validateMeasurement({ observer: 'CHECK', params: { source: ['42'], means: ['x'] } })).toBe('the check is not a function');
    expect(validateMeasurement({ observer: 'CHECK', params: { source: ['(t) => { if (t.length) throw new Error("no"); return { ok: true }; }'], means: ['x'] } })).toMatch(/throws on plain text/);
  });
  it('measures through the registry like any observer, and says in words what it checks and whether it is qualified', () => {
    expect(measure('Border #fff.', m).verdict).toBe('VIOLATED');
    expect(CHECK.describe(m.params)).toBe('no colour written as a hex value (a check written for this step, not yet qualified: it reports and blocks nothing)');
    expect(checkQualified(m)).toBe(false);
    const q = { ...m, params: { ...m.params, qualified: 1 } };
    expect(checkQualified(q)).toBe(true);
    expect(CHECK.describe(q.params)).toMatch(/qualified on your examples/);
  });
});
