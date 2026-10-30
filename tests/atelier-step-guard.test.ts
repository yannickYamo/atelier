// tests/atelier-step-guard.test.ts — WHILE A REPAIR CHAIN RUNS, NO MODEL CALL OUTSIDE A STEP, WHEREVER IT IS WRITTEN.
//
// The static scan (tests/atelier-one-step.test.ts) reads the chain's own modules; a helper defined in another module,
// or called from a branch no test takes, passed it. The clients a run uses carry a guard at the call
// (core/inference/step-guard.ts): inside a repair chain, a call is allowed in a step (`applyStep`) or in a registered
// read-only reader; any other throws under the suite and is kept as an error elsewhere. And a structured output's one
// draft written again around an invented claim is a step on a ledger of its own (core/loop/run-once.ts, `runOnce`).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { ContextJudge } from '../core/loop/context-judge.js';
import { stepGuarded, inRepairChain, readingAs, outOfStepCalls, STEP_GUARD_ENV, READERS } from '../core/inference/step-guard.js';
import { applyStep } from '../core/loop/repair.js';
import { stepLedger } from '../core/loop/controller.js';
import { verifyText } from '../core/observers/verify.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { runOnce } from '../core/loop/run-once.js';
import { withCoverage } from '../cli/commands/invoke.js';
import { BudgetExceeded } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { anInferenceResult } from './fixtures.js';

const REQ: InferenceRequest = { stableBlock: '', variableBlock: '', userMessage: 'u', toolName: 'emit_x', toolDescription: 'd', schema: {}, maxTokens: 10 };
const raw = (): InferenceClient & { n: number } => { const c = { n: 0, complete: async () => { c.n += 1; return anInferenceResult({ json: {} }); } }; return c; };
const NONE = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const PLAN = { action: 'rewrite' as const, targets: ['x'], why: 'w', expectedGain: 1, expectedCostUsd: 0 };

describe('the guard at the call', () => {
  it('the suite runs with it set to throw', () => { expect(process.env[STEP_GUARD_ENV]).toBe('throw'); });
  it('outside a repair chain every call goes through', async () => {
    const c = stepGuarded(raw());
    await c.complete(REQ);
    expect(c.n).toBe(1);
  });
  it('inside a chain: a call outside any step throws, and the model is never asked', async () => {
    const c = stepGuarded(raw());
    await expect(inRepairChain(() => c.complete(REQ))).rejects.toThrow(/step guard: a model call \(emit_x\)/);
    expect(c.n).toBe(0);
  });
  it('inside a chain: a call inside a step, or from a registered reader, goes through', async () => {
    const c = stepGuarded(raw());
    const text = 'a text';
    const r = await inRepairChain(() => applyStep(stepLedger(), PLAN, { text, report: verifyText('d', NONE, text) },
      async () => { await c.complete(REQ); return { unchanged: 'nothing' }; }, { purposes: ['repair'] }));
    expect(r.kind).toBe('unchanged');
    for (const who of READERS) await inRepairChain(() => readingAs(who, c).complete(REQ));
    expect(c.n).toBe(1 + READERS.length);
  });
  it('a client guarded twice is guarded once, and keeps what else it carries', () => {
    const c = raw(); const g = stepGuarded(c);
    expect(stepGuarded(g)).toBe(g);
    expect(g.n).toBe(0);
  });
});

describe('a helper in another module, reached from the repair, calling the model outside a step', () => {
  // the claim cut leaves "Fix it:" pointing at nothing, so the repair asks the context judge whether a sentence dangles:
  // here a judge that, unregistered, calls the writer's own client directly
  const draft = 'Last year I shipped the retry loop and it broke production for a day.\n\nFix it:\n\n1. Last month we saw retries double the load.\n2. Add a budget.';
  const judgeCalling = (c: InferenceClient): ContextJudge => ({ standsAlone: async (pairs: readonly unknown[]) => { await c.complete(REQ); return pairs.map(() => true); } }) as unknown as ContextJudge;
  const writer = (): InferenceClient => stepGuarded({ complete: async (r: InferenceRequest) => anInferenceResult({ json: r.toolName === 'emit_draft' ? { text: 'Fix it:\n\n1. Add a budget.' } : {} }) });
  const env = process.env[STEP_GUARD_ENV];
  afterEach(() => { process.env[STEP_GUARD_ENV] = env ?? ''; });
  it('under the suite, the repair fails', async () => {
    const w = writer();
    await expect(refineToStandard(w, { spentUsd: 0, capUsd: 1 }, 'd', NONE, draft, 2, { material: '', judge: judgeCalling(w) })).rejects.toThrow(/step guard/);
  });
  it('in a person\'s run, the run goes on and the call is kept as an error', async () => {
    process.env[STEP_GUARD_ENV] = '';
    const w = writer(); const before = outOfStepCalls().length;
    const out = await refineToStandard(w, { spentUsd: 0, capUsd: 1 }, 'd', NONE, draft, 2, { material: '', judge: judgeCalling(w) });
    expect(out.output.length).toBeGreaterThan(0);
    expect(outOfStepCalls().length).toBeGreaterThan(before);
  });
});

describe('SHOULD-FIX 1: a structured output written again around an invented claim is one step, counted, on the one rule', () => {
  const contract = JSON.stringify({ type: 'object', properties: { body: { type: 'string' } }, required: ['body'] });
  const binding = { providerAdapter: 'anthropic', backend: 'x', requestedModel: 'm', structuredOutput: 'NATIVE_TOOL_USE', parameters: {}, runtimeProfile: null } as const;
  const guard = (text: string): Promise<string[]> => Promise.resolve(text.includes('94%') ? ['Revenue rose 94% last quarter.'] : []);
  const run = async (answers: unknown[]) => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-sf1-')), skillName: 'skill' }; store.initStore(L);
    let i = 0;
    const client: InferenceClient = { complete: async () => anInferenceResult({ json: answers[Math.min(i++, answers.length - 1)], cost: { basis: 'API_METERED', billingUsd: 0.001 }, costUsd: 0.001 }) };
    return runOnce(L, { skillVersionHash: 'k1', standardVersionHash: 'sv1', architectureHash: 'ar' }, 'SKILL', 'p1',
      { expectedPackageHash: 'p1', servedPackageHash: 'p1', matched: true, servedFiles: [] },
      'write the quarterly note', client, { spentUsd: 0, capUsd: 1 }, binding, 'ORGANIC_USE', contract, 'POSITIONAL', null, null, guard);
  };
  it('the clean retry is kept, and its call is on its step', async () => {
    const rec = await run([{ body: 'Revenue rose 94% last quarter.' }, { body: 'Revenue rose last quarter.' }]);
    expect(JSON.parse(rec.output)).toEqual({ body: 'Revenue rose last quarter.' });
    const d = rec.repair?.controller?.decisions ?? [];
    expect(d.map((x) => [x.action, x.outcome, x.observed.calls])).toEqual([['claim-redraft', 'kept', 1]]);
  });
  it('a retry that drops the claim and adds a figure no source holds is not kept', async () => {
    // thrown from core; the CLI's one catch (cli/atelier.mts, `main().catch`) prints it and exits 1
    await expect(run([{ body: 'Revenue rose 94% last quarter.' }, { body: 'Revenue rose for 12 weeks.' }])).rejects.toThrow(/still asserts 1 specific.*Nothing was delivered or recorded/s);
  });
});

describe('when the budget runs out before the request is read, it is said in one line', () => {
  it('the coverage judge skipped for the budget', async () => {
    const notes: string[] = [];
    const judge = { covers: async () => { throw new BudgetExceeded(1, 1); } } as unknown as ContextJudge;
    const text = 'A reply.';
    const refine = async (t: string) => ({ output: t, report: verifyText('d', NONE, t), repair: null });
    const d = await withCoverage(refine, { client: raw(), budget: { spentUsd: 1, capUsd: 1 }, judge, asked: 'reply', servedText: 's', task: 't', notes, redraft: true })(text, stepLedger());
    expect(d.output).toBe(text);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/not read against what the request asks: the budget ran out/);
  });
});
