// tests/atelier-eval-panel.test.ts — THE EVALUATION PANEL: ONE BINARY RESULT, GATES, FIDELITY, MONITORS, AND WHAT IS NOT MEASURED.
//
// The four states the panel must never get wrong (conformant; not conformant; the claim reader down, which is
// not a pass; a skill with no profile), the rules it is drawn by (no overall score, every instrument with how it
// was validated, monitors apart, ASCII tags), the Wilson interval `atelier eval` prints rates with, and the
// ratings store.

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPanel, type EvalSummary } from '../core/eval/summary.js';
import { wilson } from '../core/stats/wilson.js';
import { putEval, getEval, listEvals, putRating, latestRatings } from '../core/state/eval-store.js';

const base: EvalSummary = {
  schema: 1, invocationId: 'i0000000001', skill: 'posts', at: '2026-10-02T00:00:00Z', release: '96a48e75aaaabbbb', model: 'claude-opus-5',
  drafts: 2, costUsd: 0.42, durationMs: 31000,
  result: { conformant: true, reasons: [] },
  gates: {
    required: { held: 6, applicable: 6, broken: [] },
    claims: { state: 'checked', delivered: 0, unconfirmed: 0, cut: 1, listed: 0, instrument: 'claim reader (claude-haiku-4-5, prompt a173339d)', answers: false,
      measured: { caught: 46, planted: 46, leftAlone: 39, clean: 48, on: 'product essays' } },
    copying: { longest: 6, limit: 12 },
    format: { kind: 'bare', words: 'return only the post', withheld: 0 },
    applicability: { applied: 31, notApplicable: 1, waived: [{ id: 'p4', why: 'the material it needs is not bound' }] },
  },
  fidelity: { inBand: 7, measured: 9, baseline: { medianInBand: 8, medianMeasured: 9, n: 3 }, pieces: 9, profile: 'cfd55277aaaa',
    outside: [{ id: 'cadence', label: 'cadence', value: 0.41, band: [0.05, 0.32] }], facts: { used: 0, supplied: 1 }, edits: { tried: 0, kept: 0 } },
  monitors: { detector: { p: 0.57, families: ['claude-opus-5'], qualified: null },
    taste: { followed: 7, missed: 0, unclear: 4, waiting: 0, labelled: null, acts: false } },
  notMeasured: ['argument, stance and content (read by the taste reader, a monitor)', 'voice beyond the 9 counted features'],
};

/** The panel with wrapped lines joined back, for matching a whole line's content. */
const flat = (p: string): string => p.replace(/\n {23}/g, ' ');

describe('the panel', () => {
  it('a conformant run: one RESULT line first, gates with PASS, the reader with its measured rates and where', () => {
    const p = flat(renderPanel(base));
    const lines = p.split('\n');
    expect(lines[0]).toMatch(/^── Atelier · posts · release 96a48e75 · claude-opus-5 · 2 drafts ─+ \$0\.42 · 31 s ──$/);
    expect(lines[1]).toBe('  RESULT  CONFORMANT');
    expect(p).toMatch(/PASS {2}invented claims {2}0 delivered · 1 cut.+claim reader .*caught 46\/46 planted, left 39\/48 clean alone, on product essays/);
    expect(p).toMatch(/standard applied in full/);
    expect(p).toMatch(/6 waived|1 waived, each with a reason \(the material it needs is not bound\)/);
  });
  it('fidelity is descriptive, with the held-back baseline and its n; never a percentage', () => {
    const p = flat(renderPanel(base));
    expect(p).toMatch(/in your range {5}7 of 9 steering features · your held-back pieces: median 8 of 9 \(n=3\)/);
    expect(p).not.toMatch(/\d+%/);
  });
  it('monitors are apart and say how they are validated; nothing adds up to a score', () => {
    const p = flat(renderPanel(base));
    expect(p).toMatch(/MONITORS {2}shown only, never gate/);
    expect(p).toMatch(/style detector {4}P\(model-written\) 0\.57 · valid for claude-opus-5 · not qualified yet/);
    expect(p).toMatch(/taste reader .*not validated: label it with atelier taste --calibrate/);
    expect(p).not.toMatch(/score|overall/i);
    expect(p).toMatch(/not measured: argument, stance and content/);
  });
  it('a broken required rule: NOT CONFORMANT, and the gate is FAIL, never a green line under a red result', () => {
    const e: EvalSummary = { ...base, result: { conformant: false, reasons: ['1 required rule broken (c12)'] },
      gates: { ...base.gates, required: { held: 5, applicable: 6, broken: [{ id: 'c12', detail: 'the opening paragraph: 62 words' }] } } };
    const p = flat(renderPanel(e));
    expect(p.split('\n')[1]).toBe('  RESULT  NOT CONFORMANT: 1 required rule broken (c12)');
    expect(p).toMatch(/FAIL {2}required rules {3}5\/6 held: broken c12/);
  });
  it('the claim reader down: FAIL "not checked", never a pass', () => {
    const e: EvalSummary = { ...base, result: { conformant: false, reasons: ['invented claims not checked: the claim reader could not run'] },
      gates: { ...base.gates, claims: { ...base.gates.claims, state: 'not-checked' } } };
    expect(flat(renderPanel(e))).toMatch(/FAIL {2}invented claims {2}not checked: the claim reader could not run, so this is not a pass/);
  });
  it('no fidelity profile: no FIDELITY section, and the boundary says so', () => {
    const e: EvalSummary = { ...base, fidelity: null, monitors: { detector: null, taste: null }, notMeasured: ['your range (this skill has no fidelity profile: build it from a corpus)'] };
    const p = renderPanel(e);
    expect(p).not.toMatch(/FIDELITY/);
    expect(p).not.toMatch(/MONITORS/);
    expect(p).toMatch(/not measured: your range \(this skill has no fidelity profile/);
  });
  it('fits the width it is given by wrapping, never by cutting, and colour only when asked', () => {
    const narrow = renderPanel(base, { width: 70 });
    for (const l of narrow.split('\n')) expect(l.length).toBeLessThanOrEqual(70);
    expect(flat(narrow)).toContain('left 39/48 clean alone, on product essays');   // nothing cut
    expect(renderPanel(base).includes(`${String.fromCharCode(27)}[`)).toBe(false);
    expect(renderPanel(base, { color: true }).includes(`${String.fromCharCode(27)}[32mPASS`)).toBe(true);
  });
});

describe('rates are printed with their uncertainty', () => {
  it('the Wilson interval stays in [0, 1], contains the rate, and narrows with n', () => {
    const a = wilson(9, 10); const b = wilson(90, 100);
    expect(a.lo).toBeGreaterThan(0.5); expect(a.hi).toBeLessThanOrEqual(1);
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
    expect(wilson(0, 5).lo).toBe(0); expect(wilson(5, 5).hi).toBe(1);
    expect(wilson(0, 0)).toEqual({ lo: 0, hi: 1 });
  });
});

describe('the evaluation and rating stores', () => {
  it('an evaluation is written once; ratings are appended and the latest of each run stands', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-ev-')), skillName: 'posts' };
    putEval(L, base);
    putEval(L, { ...base, result: { conformant: false, reasons: ['x'] } });   // a second write is ignored
    expect(getEval(L, base.invocationId)?.result.conformant).toBe(true);
    expect(listEvals(L)).toHaveLength(1);
    putRating(L, { invocationId: base.invocationId, ship: false, why: 'too long', at: '2026-10-02T00:00:01Z', release: null });
    putRating(L, { invocationId: base.invocationId, ship: true, why: null, at: '2026-10-02T00:00:02Z', release: null });
    expect(latestRatings(L)).toEqual([expect.objectContaining({ ship: true })]);
    expect(() => { putRating(L, { invocationId: '../x', ship: true, why: null, at: 'a', release: null }); }).toThrow(/not an invocation id/);
  });
});
