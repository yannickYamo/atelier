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
  it('fidelity is descriptive, with the reserved-piece baseline and its n; never a percentage', () => {
    const p = flat(renderPanel(base));
    expect(p).toMatch(/in your range {5}7 of 9 steering features · your reserved pieces: median 8 of 9 \(n=3\)/);
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

// ── what the gap analysis found, pinned ───────────────────────────────────────────────────────────
import { buildRunEval, type RunEvalInput } from '../cli/eval-run.js';
import { DISPUTED_WHY } from '../core/loop/claim-extract.js';
import type { VerifyReport } from '../core/observers/verify.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';

describe('the verdict is counted on the delivered text, and can never say CONFORMANT wrongly', () => {
  const L = { root: mkdtempSync(join(tmpdir(), 'atelier-rv-')), skillName: 'posts' };
  const rec = { invocationId: 'i0000000002', skillVersionHash: 'sv1', at: '2026-10-02T00:00:00Z', output: 'I pulled our last 200 tickets and 63% were about billing.',
    observedRuntime: { resolvedModel: 'claude-opus-5' }, runtimeBinding: { requestedModel: 'claude-opus-5' } } as unknown as InvocationRecord;
  const line = (id: string, verdict: 'MET' | 'VIOLATED', spans = 0, materiality = 'REQUIRED') => ({ requirementId: id, statement: id, materiality,
    result: { verdict, value: spans, detail: `${id} detail`, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: `s${i}`, why: '' })) } });
  const report = (...checked: ReturnType<typeof line>[]): VerifyReport => ({ skill: 'posts', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });
  const std = { standardVersionHash: 'h', requirements: [] } as never;
  const sensor = (instrument: string, qualified = true, agreement?: { both: number; either: number }) => ({ instrument, version: 'a173339d', qualified, gate: qualified ? 'reader' : 'pattern', degraded: false,
    reading: () => (agreement ? { claims: [], publicFacts: [], instrument, agreement } : undefined) }) as never;
  const input = (over: Partial<RunEvalInput>): RunEvalInput => ({ L, rec, std, sensor: sensor('claim reader (claude-haiku-4-5, prompt a173339d)'), claimsOff: false, answers: false, profile: null,
    format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: 0.1, durationMs: 1000, drafts: 2, applicability: [], contract: false,
    report: report(line('c1', 'MET'), line('UNSOURCED', 'MET')), ...over });

  it('a clean delivered text, read by the qualified reader: CONFORMANT, with its measured rates', () => {
    const e = buildRunEval(input({}));
    expect(e.result.conformant).toBe(true);
    expect(e.gates.claims.measured).toMatchObject({ caught: 46, planted: 46 });
  });
  it('invented claims still in the text (--no-repair, nothing recorded): counted on the text, NOT CONFORMANT', () => {
    const e = buildRunEval(input({ report: report(line('c1', 'MET'), line('UNSOURCED', 'VIOLATED', 2)) }));
    expect(e.gates.claims.delivered).toBe(2);
    expect(e.result.conformant).toBe(false);
  });
  it('a broken REQUIRED FORMAT or learned-phrase line counts, and the format row fails', () => {
    const e = buildRunEval(input({ report: report(line('c1', 'MET'), line('FORMAT', 'VIOLATED', 1), line('c2·learned', 'VIOLATED', 1), line('UNSOURCED', 'MET')) }));
    expect(e.gates.required.broken.map((b) => b.id)).toEqual(['FORMAT', 'c2·learned']);
    expect(e.gates.format.held).toBe(false);
    expect(e.result.conformant).toBe(false);
  });
  it('claims turned off, a check that could not run, or a reader that degraded: NOT CONFORMANT', () => {
    expect(buildRunEval(input({ claimsOff: true })).result.reasons.join()).toMatch(/turned off/);
    expect(buildRunEval(input({ report: null })).gates.claims.state).toBe('not-checked');
    expect(buildRunEval(input({ report: report(line('UNSOURCED', 'MET'), line('UNSOURCED·unread', 'VIOLATED')) })).result.conformant).toBe(false);
  });
  it('unconfirmed specifics are counted from their own line, not from the whole listed set', () => {
    const e = buildRunEval(input({ report: report(line('UNSOURCED', 'MET'), line('UNSOURCED·inconclusive', 'VIOLATED', 3), line('UNSOURCED·check', 'VIOLATED', 5, 'PREFERRED')) }));
    expect(e.gates.claims).toMatchObject({ unconfirmed: 3, listed: 5 });
    expect(e.result.conformant).toBe(false);
  });
  it('no borrowed rates: an unqualified reader, another model, or an answer shows none', () => {
    expect(buildRunEval(input({ sensor: sensor('claim reader (my-small-model, prompt a173339d)', false) })).gates.claims.measured).toBeNull();
    expect(buildRunEval(input({ sensor: sensor('claim reader (other-model, prompt a173339d)') })).gates.claims.measured).toBeNull();
    expect(buildRunEval(input({ answers: true })).gates.claims.measured).toBeNull();
  });
  it('a structured output is held by its contract: no prose rules counted against JSON', () => {
    const e = buildRunEval(input({ contract: true, report: null }));
    expect(e.gates.required.contract).toBe(true);
    expect(e.result.conformant).toBe(true);
  });
  it('one claim verdict: a flag only one read raised is disputed, listed apart, never a failure; the reads\' agreement is shown', () => {
    const disputed = { requirementId: 'UNSOURCED·public', statement: 'public', materiality: 'PREFERRED',
      result: { verdict: 'VIOLATED' as const, value: 3, detail: '', spans: [
        { start: 0, end: 1, text: 'a', why: DISPUTED_WHY }, { start: 2, end: 3, text: 'b', why: DISPUTED_WHY }, { start: 4, end: 5, text: 'c', why: 'general knowledge' }] } };
    const e = buildRunEval(input({ sensor: sensor('claim reader (claude-haiku-4-5, prompt a173339d)', true, { both: 1, either: 3 }),
      report: report(line('c1', 'MET'), line('UNSOURCED', 'MET'), disputed) }));
    expect(e.gates.claims).toMatchObject({ delivered: 0, disputed: 2, listed: 1, agreement: { both: 1, either: 3 } });
    expect(e.result.conformant).toBe(true);
    const p = flat(renderPanel(e));
    expect(p).toMatch(/PASS {2}invented claims {2}0 delivered · 0 cut.+2 disputed \(one of two reads flagged it: check before you publish\).+1 listed to check.+reads agreed on 1 of 3 flags/);
  });
  it('a broken rule is named by what it is, not only its id', () => {
    const c9 = { ...line('c9', 'VIOLATED', 1), statement: 'Keep every paragraph under four sentences, so a reader can scan the piece on a phone.' };
    const e = buildRunEval(input({ report: report(c9, line('UNSOURCED', 'MET')) }));
    expect(e.gates.required.broken[0].label).toBe('Keep every paragraph under four sentences, so…');
    expect(e.result.reasons[0]).toMatch(/c9 "Keep every paragraph under four sentences/);
    expect(flat(renderPanel(e))).toMatch(/broken c9 "Keep every paragraph/);
  });
});
