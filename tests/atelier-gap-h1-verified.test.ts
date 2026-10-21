// WITH MATERIAL BOUND, A CLEAN RUN READ BY A TRUSTED INSTRUMENT IS VERIFIED (gap audit 2026-10-22, H1).
// The claim check's action at a level (block, review, list) says what a finding meets; it is not a reason to doubt a
// text in which nothing was found. Review only where something is listed or open. With no material, nothing is
// decided: the specifics are unverifiable. A creative skill lists, so it never decides.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRunEval, type RunEvalInput } from '../cli/eval-run.js';
import { NO_MATERIAL } from '../core/loop/claim-extract.js';
import type { VerifyReport } from '../core/observers/verify.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';

const L = { root: mkdtempSync(join(tmpdir(), 'atelier-h1-')), skillName: 'memo' };
const rec = { invocationId: 'i0000000009', skillVersionHash: 'sv1', at: '2026-10-22T00:00:00Z', output: 'The reserve is 2,552 dollars.',
  observedRuntime: { resolvedModel: 'm' }, runtimeBinding: { requestedModel: 'm' } } as unknown as InvocationRecord;
const line = (id: string, verdict: 'MET' | 'VIOLATED', spans = 0, materiality = 'REQUIRED') => ({ requirementId: id, statement: id, materiality,
  result: { verdict, value: spans, detail: `${id} detail`, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: `s${i}`, why: '' })) } });
const report = (...checked: ReturnType<typeof line>[]): VerifyReport => ({ skill: 'memo', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });
const std = { standardVersionHash: 'h', requirements: [] } as never;
const sensor = (qualified: boolean, gate: 'reader' | 'pattern') => ({ instrument: 'x', version: qualified ? 'a173339d' : null, qualified, gate, degraded: false, reading: () => undefined }) as never;
const input = (over: Partial<RunEvalInput>): RunEvalInput => ({ L, rec, std, sensor: sensor(true, 'reader'), claimsOff: false, answers: false, profile: null,
  format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: 0, durationMs: 1, drafts: 1, applicability: [], contract: false,
  report: report(line('UNSOURCED', 'MET')), ...over });

describe('the claim check decides from its action and its instrument', () => {
  it('grounded (review), material bound, nothing found, a qualified reader: VERIFIED', () => {
    expect(buildRunEval(input({ claimAct: 'review', unmeasured: 'the skill is held grounded' })).record?.state).toBe('VERIFIED');
  });
  it('strict (block), material bound, nothing found, the pattern check gating: VERIFIED', () => {
    expect(buildRunEval(input({ claimAct: 'block', unmeasured: 'the skill is held strict', sensor: sensor(false, 'pattern') })).record?.state).toBe('VERIFIED');
  });
  it('grounded with one specific open: NEEDS_REVIEW', () => {
    expect(buildRunEval(input({ claimAct: 'review', unmeasured: 'held grounded', report: report(line('UNSOURCED', 'MET'), line('UNSOURCED·check', 'VIOLATED', 1, 'PREFERRED')) })).record?.state).toBe('NEEDS_REVIEW');
  });
  it('an unqualified reader made to gate anyway does not decide: NEEDS_REVIEW', () => {
    expect(buildRunEval(input({ claimAct: 'review', unmeasured: 'held grounded', sensor: sensor(false, 'reader') })).record?.state).toBe('NEEDS_REVIEW');
  });
  it('creative (list) decides nothing, and no material decides nothing', () => {
    expect(buildRunEval(input({ claimAct: 'list', unmeasured: 'held creative' })).record?.state).toBe('NEEDS_REVIEW');
    expect(buildRunEval(input({ claimAct: 'list', unmeasured: NO_MATERIAL })).record?.state).toBe('NEEDS_REVIEW');
  });
});
