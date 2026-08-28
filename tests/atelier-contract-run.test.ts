// tests/atelier-contract-run.test.ts — TWO KINDS OF LOOKING, KEPT APART UNDER PRESSURE.
//
// No model is called. A stub client returns whatever a test needs, which is what lets the whole loop
// be driven offline and lets the awkward answers — UNCLEAR, a verdict with nothing quoted, a
// prohibition the reader says YES to — be produced on demand rather than waited for.
//
// The property under test throughout is that an unqualified reading never reaches `passed` or
// `failed`. The temptation is one bucket and one number, because a number is what a person wants;
// that number would be a measurement of an instrument nobody qualified.

import { describe, it, expect } from 'vitest';
import { runCase, foldOutcomes, type CaseOutcome } from '../core/contract/run.js';
import { generateCases, GenerationRefused } from '../core/contract/generate.js';
import { sealSuite, SuiteRefused, type ContractTestCase, type ContractTestSuite } from '../core/contract/suite.js';
import { obligationsForStandard } from '../core/contract/obligation.js';
import { authorityStateOf, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient, Budget, InferenceResult } from '../core/inference/client.js';

const budget = (): Budget => ({ spentUsd: 0, capUsd: 5, maxCalls: 200 });

/** Returns a fixed json payload for every call, and counts how often it was asked. */
const stub = (json: unknown): InferenceClient & { calls: number } => {
  const c = {
    calls: 0,
    complete: (): Promise<InferenceResult> => {
      c.calls++;
      return Promise.resolve({
        json, modelId: 'stub', inputTokens: 1, outputTokens: 1,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        cost: { billingUsd: 0 }, costUsd: 0, logprobs: null,
      } as InferenceResult);
    },
  };
  return c;
};

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

const standard = (rs: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: null, workType: 'writing', requirements: rs,
  authorityState: authorityStateOf(rs), mintedAt: '2026-01-01T00:00:00.000Z',
  supersedes: null, reason: null,
});

const aCase = (over: Partial<ContractTestCase> = {}): ContractTestCase => ({
  caseId: 'c1', obligationId: 'should_fire:x1', requirementIds: ['x1'],
  task: 'write something', expectation: 'the output must do this: lead with the action',
  observation: 'UNQUALIFIED', provenance: 'MODEL_GENERATED', ...over,
});

describe('an unqualified reading never becomes a verdict', () => {
  it('a positive rule the reader says YES to is APPARENT_PASS, not PASS', async () => {
    const o = await runCase(stub({ holds: 'YES', evidence: 'the first line' }), budget(),
      aCase(), () => Promise.resolve('some output'));
    expect(o.verdict).toBe('APPARENT_PASS');
    expect(o.why).toMatch(/certifies nothing/);
  });

  it('a prohibition the reader says YES to is APPARENT_FAIL — polarity comes from the obligation', async () => {
    // Carried from the expectation rather than re-derived from the statement. Re-deriving it is the
    // inversion that already happened once in this codebase.
    const o = await runCase(stub({ holds: 'YES', evidence: 'Let me know if...' }), budget(),
      aCase({ expectation: 'the output must NOT do this: end with a generic offer' }),
      () => Promise.resolve('...Let me know if you need anything else.'));
    expect(o.verdict).toBe('APPARENT_FAIL');
  });

  it('a prohibition the reader says NO to is APPARENT_PASS', async () => {
    const o = await runCase(stub({ holds: 'NO', evidence: 'ends on the recommendation' }), budget(),
      aCase({ expectation: 'the output must NOT do this: end with a generic offer' }),
      () => Promise.resolve('...so ship it.'));
    expect(o.verdict).toBe('APPARENT_PASS');
  });

  it('UNCLEAR is recorded as unobserved, not folded into a failure', async () => {
    const o = await runCase(stub({ holds: 'UNCLEAR', evidence: null }), budget(),
      aCase(), () => Promise.resolve('x'));
    expect(o.verdict).toBe('UNOBSERVED');
    expect(o.why).toMatch(/real answer and not a failure/);
  });

  it('a verdict with nothing quoted is downgraded to unobserved', async () => {
    // Three model-based instruments in this programme produced zero abstentions across 150
    // observations. A confident answer with no span behind it is the shape that produces.
    const o = await runCase(stub({ holds: 'YES', evidence: null }), budget(),
      aCase(), () => Promise.resolve('x'));
    expect(o.verdict).toBe('UNOBSERVED');
  });

  it('a requirement needing a person is never read by a model at all', async () => {
    const client = stub({ holds: 'YES', evidence: 'anything' });
    const o = await runCase(client, budget(), aCase({ observation: 'HUMAN' }),
      () => Promise.resolve('x'));
    expect(o.verdict).toBe('UNOBSERVED');
    expect(client.calls, 'a model was asked about a requirement marked as needing a person').toBe(0);
  });
});

describe('a machine-checkable shape is decided without a model', () => {
  const shapeCase = aCase({
    observation: 'DETERMINISTIC',
    expectation: 'the output must validate against the declared shape: {"verdict":{"type":"string"}}',
  });

  it('passes when every declared field is present, with no model consulted', async () => {
    const client = stub({});
    const o = await runCase(client, budget(), shapeCase,
      () => Promise.resolve('{"verdict":"ship"}'));
    expect(o.verdict).toBe('PASS');
    expect(client.calls, 'a shape check consulted a model').toBe(0);
  });

  it('fails a missing declared field and says which', async () => {
    const o = await runCase(stub({}), budget(), shapeCase, () => Promise.resolve('{"other":1}'));
    expect(o.verdict).toBe('FAIL');
    expect(o.why).toMatch(/missing declared field\(s\): verdict/);
  });

  it('fails output that is not JSON at all, rather than guessing', async () => {
    const o = await runCase(stub({}), budget(), shapeCase, () => Promise.resolve('ship it'));
    expect(o.verdict).toBe('FAIL');
    expect(o.why).toMatch(/not JSON/);
  });
});

describe('folding keeps the buckets separate', () => {
  const v = standard([req('x1'), req('x2')]);
  const obligations = obligationsForStandard(v);
  const cases = obligations.map((o, i) => aCase({ caseId: `c${i}`, obligationId: o.obligationId }));
  const sealed = sealSuite(v, cases) as ContractTestSuite;

  const outcome = (caseId: string, verdict: CaseOutcome['verdict']): CaseOutcome =>
    ({ caseId, output: 'o', verdict, evidence: null, why: 'w' });

  it('apparent readings do not land in passed or failed', () => {
    const r = foldOutcomes(sealed, 'sv', 'SEARCH', [
      outcome('c0', 'APPARENT_PASS'), outcome('c1', 'APPARENT_FAIL'), outcome('c2', 'PASS'),
    ]);
    expect(r.passed).toEqual(['c2']);
    expect(r.failed).toEqual([]);
    expect(r.apparentPass).toEqual(['c0']);
    expect(r.apparentFail).toEqual(['c1']);
  });

  it('counts obligations actually exercised, not obligations that exist', () => {
    const r = foldOutcomes(sealed, 'sv', 'SEARCH', [outcome('c0', 'PASS')]);
    expect(r.obligationsCovered).toBe(1);
    expect(r.obligationsTotal).toBe(obligations.length);
    expect(r.obligationsTotal).toBeGreaterThan(1);
  });
});

describe('generation invents the situation and never the verdict', () => {
  const v = standard([req('x1'), req('x2', { kind: 'BOUNDARY' })]);
  const obligations = obligationsForStandard(v);

  it('copies the expectation from the obligation rather than taking one back', async () => {
    // The generator is shown the expectation so it can build the right situation. It has no channel
    // to send a different one back: the schema accepts one field, and only `task` is read.
    const cases = await generateCases(
      stub({ task: 'a realistic request', expectation: 'SOMETHING THE MODEL MADE UP' }),
      budget(), obligations, 'writing');
    expect(cases).not.toBeInstanceOf(GenerationRefused);
    if (cases instanceof GenerationRefused) return;
    for (const [i, c] of cases.entries()) {
      expect(c.expectation).toBe(obligations[i].expectation);
      expect(c.obligationId).toBe(obligations[i].obligationId);
      expect(c.observation).toBe(obligations[i].observation);
    }
  });

  it('refuses rather than sealing a partial suite', async () => {
    // The obligations that failed to generate are exactly the ones nothing will test, and a suite
    // quietly missing its negative cases looks like a suite that passed them.
    const r = await generateCases(stub({ task: '' }), budget(), obligations, 'writing');
    expect(r).toBeInstanceOf(GenerationRefused);
  });

  it('a generated suite seals, because every case claims a real obligation', async () => {
    const cases = await generateCases(stub({ task: 'a request' }), budget(), obligations, 'writing');
    if (cases instanceof GenerationRefused) throw new Error('refused');
    const s = sealSuite(v, cases);
    expect(s).not.toBeInstanceOf(SuiteRefused);
  });
});
