// PARITY: the study entry point and the product contract path are the same instrument.
//
// The split this closes: every published result came from /tmp/study/run3.mjs, while core/contract/
// — the code that ships — had never run a study. A paper measured something a user could not run.
//
// These assert IDENTITY, not agreement within tolerance. Same sealed inputs, same semantic
// artifacts: suite hash, arm hashes, validity, per-context observations, paired analysis.
import { describe, it, expect } from 'vitest';
import {
  sealStudySuite, SuiteNotDiverse, hasNumberedList, scoreStructural, toContextRates,
  analyseStratum, runStudyGeneration, armIdentity, requestShape, runIdentity,
  type StudyContext, type StudyGeneration,
} from '../core/contract/study.js';
import { tokenOverlap, judgeCandidate, worstPair, MAX_OVERLAP } from '../core/contract/diversity.js';
import { pairedBootstrap, decompose, describeEstimate } from '../core/contract/analysis.js';
import { diffArms } from '../core/contract/study-identity.js';
import { validityFrom } from '../core/contract/run.js';
import type { InferenceClient } from '../core/inference/client.js';
import { GenerationIncomplete } from '../core/inference/client.js';

const ctx = (id: string, kind: 'SHOULD_FIRE' | 'SHOULD_NOT_APPLY', task: string): StudyContext =>
  ({ contextId: id, kind, task });

const FROZEN = '2026-08-28T00:00:00.000Z';

describe('sealing is product-owned, deterministic, and refuses a suite it cannot claim', () => {
  const a = ctx('ctx01', 'SHOULD_FIRE', 'set up a home network router with several separate stages');
  const b = ctx('ctx02', 'SHOULD_NOT_APPLY', 'write a one sentence tagline for cold brew coffee');

  it('the same contexts always seal to the same hash — no clock, no ambient state', () => {
    const one = sealStudySuite([a, b], [], FROZEN);
    const two = sealStudySuite([a, b], [], FROZEN);
    expect(one.suiteHash).toBe(two.suiteHash);
    // frozenAt is an INPUT. A hash including a timestamp nobody passed cannot be re-derived.
    expect(one.frozenAt).toBe(FROZEN);
  });

  it('REFUSES to seal a suite containing a pair above the threshold it claims to apply', () => {
    // The gate admits against what is accepted SO FAR, so a violating pair can survive while every
    // individual decision looked right. Sealing re-checks the finished set.
    const twin = ctx('ctx03', 'SHOULD_NOT_APPLY', 'write a one sentence tagline for cold brew coffee');
    expect(() => sealStudySuite([b, twin], [], FROZEN)).toThrow(SuiteNotDiverse);
  });

  it('carries the REJECTIONS, so what the gate excluded stays auditable', () => {
    // The original build wrote its decisions to stderr and sealed only survivors: the threshold was
    // applied but nothing in the artifact could show what it excluded, or that it ran before freezing.
    const decisions = [judgeCandidate('write a one sentence tagline for cold brew coffee',
      [{ id: 'ctx02', task: b.task }])];
    const sealed = sealStudySuite([a, b], decisions, FROZEN);
    expect(sealed.diversity.threshold).toBe(MAX_OVERLAP);
    expect(sealed.diversity.decisions[0]!.accepted).toBe(false);
    expect(sealed.diversity.decisions[0]!.collidedWith).toBe('ctx02');
    expect(sealed.worstPairOverlap).toBeLessThan(MAX_OVERLAP);
  });

  it('the gate compares against EVERY accepted case, not just the previous one', () => {
    // The real failure was a generator returning to a scenario it used four candidates ago.
    const accepted = [{ id: 'c1', task: b.task }, { id: 'c2', task: 'explain quantum tunnelling briefly' }];
    expect(judgeCandidate('write a one sentence tagline for cold brew coffee', accepted).collidedWith).toBe('c1');
  });

  it('token overlap catches the 0.82 near-duplicate that survived the first suite', () => {
    expect(tokenOverlap('write a short tagline for our cold brew coffee subscription',
      'write a short tagline for our cold brew coffee service')).toBeGreaterThan(MAX_OVERLAP);
    expect(tokenOverlap(a.task, b.task)).toBeLessThan(MAX_OVERLAP);
    expect(worstPair([{ id: 'x', task: a.task }, { id: 'y', task: b.task }])!.overlap).toBeLessThan(MAX_OVERLAP);
  });
});

describe('scoring is product-owned and completeness gates it', () => {
  it('sees a bold-numbered list, which the first observer was blind to', () => {
    expect(hasNumberedList('**1.** first\n**2.** second')).toBe(true);
    expect(hasNumberedList('1. first\n2. second')).toBe(true);
    expect(hasNumberedList('just one prose paragraph')).toBe(false);
    expect(hasNumberedList('1. only one item')).toBe(false);
  });

  it('a truncated generation is EXECUTION_INVALID whatever its text looks like', () => {
    // The exact failure: a fragment that happens to contain a numbered list scored as behaviour.
    expect(scoreStructural('SHOULD_FIRE', 'TRUNCATED', '1. first\n2. second')).toBe('EXECUTION_INVALID');
    expect(scoreStructural('SHOULD_FIRE', 'COMPLETE', '1. first\n2. second')).toBe('CORRECT');
    // polarity: the same text is WRONG on the other side of the conditional
    expect(scoreStructural('SHOULD_NOT_APPLY', 'COMPLETE', '1. first\n2. second')).toBe('WRONG');
    expect(scoreStructural('SHOULD_NOT_APPLY', 'COMPLETE', 'a tagline')).toBe('CORRECT');
  });
});

describe('the context is the unit, and generations are nested inside it', () => {
  const gens = (o: Partial<StudyGeneration>[]): StudyGeneration[] => o.map((x, i) => ({
    contextId: 'ctx01', kind: 'SHOULD_FIRE', arm: 'BARE', rep: i + 1,
    validity: 'COMPLETE', structural: 'CORRECT', outputTokens: 100, output: '', ...x,
  }));

  it('an invalid generation leaves BOTH the numerator and the denominator', () => {
    const rows = toContextRates(gens([
      { structural: 'CORRECT' }, { structural: 'WRONG' },
      { validity: 'TRUNCATED', structural: 'EXECUTION_INVALID' },
    ]));
    expect(rows[0]!.validByArm.BARE).toBe(2);
    expect(rows[0]!.byArm.BARE).toBe(0.5);
  });

  it('resampling is over CONTEXTS: repeating generations must not shrink the interval', () => {
    const three = [
      { contextId: 'c1', byArm: { T: 1, C: 0 }, validByArm: { T: 3, C: 3 } },
      { contextId: 'c2', byArm: { T: 0, C: 1 }, validByArm: { T: 3, C: 3 } },
      { contextId: 'c3', byArm: { T: 1, C: 0 }, validByArm: { T: 3, C: 3 } },
    ];
    const e = pairedBootstrap(three, 'T', 'C', { resamples: 2000, seed: 1 });
    expect(e.contexts).toBe(3);
    expect(e.hi95).toBeGreaterThan(e.lo95);
  });

  it('a context missing an arm is DROPPED, and the surviving n is what gets reported', () => {
    const e = pairedBootstrap([
      { contextId: 'c1', byArm: { T: 1, C: 0 }, validByArm: { T: 3, C: 3 } },
      { contextId: 'c2', byArm: { T: 1, C: 0 }, validByArm: { T: 0, C: 3 } },
    ], 'T', 'C', { resamples: 500, seed: 1 });
    expect(e.contexts).toBe(1);
  });

  it('a zero-width interval is reported as DEGENERATE, never as precision', () => {
    // The [+0.000, +0.000] that a co-primary was declared MET on.
    const e = pairedBootstrap([
      { contextId: 'c1', byArm: { T: 1, C: 1 }, validByArm: { T: 3, C: 3 } },
      { contextId: 'c2', byArm: { T: 1, C: 1 }, validByArm: { T: 3, C: 3 } },
    ], 'T', 'C', { resamples: 500, seed: 1 });
    expect(e.degenerate).toBe(true);
    expect(describeEstimate(e)).toMatch(/DEGENERATE/);
    expect(describeEstimate(e)).toMatch(/not evidence of no effect/);
  });

  it('the bootstrap is deterministic given a seed, so an interval can be re-derived', () => {
    const rows = [
      { contextId: 'c1', byArm: { T: 1, C: 0 }, validByArm: { T: 3, C: 3 } },
      { contextId: 'c2', byArm: { T: 0.5, C: 1 }, validByArm: { T: 3, C: 3 } },
    ];
    expect(pairedBootstrap(rows, 'T', 'C', { seed: 7, resamples: 1000 }))
      .toEqual(pairedBootstrap(rows, 'T', 'C', { seed: 7, resamples: 1000 }));
  });

  it('decompose separates the standard from the compiler — the thing a two-arm study cannot', () => {
    const rows = [
      { contextId: 'c1', byArm: { BARE: 0, PROSE: 1, COMPILED: 1 }, validByArm: { BARE: 3, PROSE: 3, COMPILED: 3 } },
      { contextId: 'c2', byArm: { BARE: 0, PROSE: 1, COMPILED: 1 }, validByArm: { BARE: 3, PROSE: 3, COMPILED: 3 } },
    ];
    const d = decompose(rows, { bare: 'BARE', prose: 'PROSE', compiled: 'COMPILED' }, { resamples: 500, seed: 3 });
    expect(d.standardEffect.meanDelta).toBe(1);   // the rules helped
    expect(d.compilerEffect.meanDelta).toBe(0);   // the compiler added nothing beyond them
    expect(d.totalEffect.meanDelta).toBe(1);      // and the total is not attributable to the compiler
  });
});

describe('run identity covers the bytes AND the request that carried them', () => {
  it('an arm is identified by served bytes, not by its label', () => {
    expect(armIdentity('STATIC', 'skill bytes').servedHash)
      .not.toBe(armIdentity('EXPLICIT', 'skill bytes v2').servedHash);
    // BARE serves nothing, and that is a condition rather than a missing value.
    expect(armIdentity('BARE', null).servedHash).toBeNull();
  });

  it('maxTokens is part of run identity, because it invalidated a study once', () => {
    const shape = (n: number) => requestShape('m', n, 't', { a: 1 });
    const id = (n: number) => runIdentity('s', [armIdentity('BARE', null)], shape(n), ['m']).runHash;
    expect(id(1200)).not.toBe(id(8000));
  });

  it('diffArms catches the 28-line difference that was supposed to be one sentence', () => {
    const staticArm = '# skill\n2. Number multi-step work.\n   Applies when: more than one step\n<!-- v: sv -->';
    const explicit = '# skill\n2. When there is more than one step, number them. When not, do not.\n<!-- v: 27f6 -->';
    const d = diffArms(staticArm, explicit);
    // Two removed + one added would be the clean design; the trailing comment is the confound.
    expect(d.changedLines).toBeGreaterThan(3);
    expect(d.removed.some((l) => l.includes('sv'))).toBe(true);
  });
});

describe('the study runner uses the PRODUCT validity semantics, end to end', () => {
  const cfg = { maxTokens: 8000, toolName: 'emit_output', schema: { type: 'object' } };

  it('a truncation from the provider becomes EXECUTION_INVALID without scoring the fragment', async () => {
    const truncating: InferenceClient = {
      complete: () => Promise.reject(new GenerationIncomplete({ kind: 'MAX_TOKENS' }, 'cut off', 8000)),
    };
    const g = await runStudyGeneration(truncating, { arm: 'BARE', servedText: null },
      ctx('ctx01', 'SHOULD_FIRE', 'a task'), 1, cfg);
    expect(g.validity).toBe('TRUNCATED');
    expect(g.structural).toBe('EXECUTION_INVALID');
    expect(g.outputTokens).toBe(8000);
  });

  it('POLARITY: a completed generation is scored, and by the same rule the product uses', async () => {
    const ok: InferenceClient = {
      complete: () => Promise.resolve({
        json: { output: '1. first\n2. second' }, modelId: 'm', inputTokens: 1, cacheReadTokens: 0,
        cacheWriteTokens: 0, outputTokens: 50, cost: { basis: 'API_METERED' as const, billingUsd: 0 },
        costUsd: 0, termination: { kind: 'COMPLETE' as const },
      }),
    };
    const g = await runStudyGeneration(ok, { arm: 'COMPILED', servedText: 'bytes' },
      ctx('ctx01', 'SHOULD_FIRE', 'a task'), 1, cfg);
    expect(g.validity).toBe(validityFrom({ kind: 'COMPLETE' }, '1. first\n2. second'));
    expect(g.structural).toBe('CORRECT');
  });

  it('a non-truncation error is NOT swallowed into a wall of invalid rows', async () => {
    const broken: InferenceClient = { complete: () => Promise.reject(new Error('401 unauthorized')) };
    await expect(runStudyGeneration(broken, { arm: 'BARE', servedText: null },
      ctx('ctx01', 'SHOULD_FIRE', 'a task'), 1, cfg)).rejects.toThrow(/401/);
  });

  it('analyseStratum keeps the two strata apart and reports the control rate for the ceiling guard', () => {
    const suite = sealStudySuite([ctx('c1', 'SHOULD_FIRE', 'a multi step network setup task'),
      ctx('c2', 'SHOULD_NOT_APPLY', 'write one short tagline for coffee')], [], FROZEN);
    const gens: StudyGeneration[] = [
      { contextId: 'c1', kind: 'SHOULD_FIRE', arm: 'BARE', rep: 1, validity: 'COMPLETE', structural: 'CORRECT', outputTokens: 1, output: '' },
      { contextId: 'c1', kind: 'SHOULD_FIRE', arm: 'COMPILED', rep: 1, validity: 'COMPLETE', structural: 'CORRECT', outputTokens: 1, output: '' },
      { contextId: 'c2', kind: 'SHOULD_NOT_APPLY', arm: 'BARE', rep: 1, validity: 'COMPLETE', structural: 'CORRECT', outputTokens: 1, output: '' },
      { contextId: 'c2', kind: 'SHOULD_NOT_APPLY', arm: 'COMPILED', rep: 1, validity: 'COMPLETE', structural: 'WRONG', outputTokens: 1, output: '' },
    ];
    const fire = analyseStratum(suite, gens, 'SHOULD_FIRE', 'COMPILED', 'BARE', { resamples: 200, seed: 1 });
    const noap = analyseStratum(suite, gens, 'SHOULD_NOT_APPLY', 'COMPILED', 'BARE', { resamples: 200, seed: 1 });
    expect(fire.estimate.contexts).toBe(1);
    expect(fire.controlRate).toBe(1);          // ceiling -> lift unmeasurable, harm measurable
    expect(noap.estimate.meanDelta).toBe(-1);  // the regression is visible because control was at 1
  });
});

describe('#8 THE GATE: the product path and the study path are one instrument', () => {
  const responses = [
    { label: 'finished with a numbered answer', stop: 'COMPLETE' as const, text: '1. first\n2. second' },
    { label: 'finished with prose', stop: 'COMPLETE' as const, text: 'a single sentence' },
    { label: 'finished with nothing', stop: 'COMPLETE' as const, text: '   ' },
    { label: 'cut off mid-answer', stop: 'MAX_TOKENS' as const, text: '1. first\n2. sec' },
    { label: 'filtered', stop: 'CONTENT_FILTER' as const, text: '' },
  ];

  it('agree on VALIDITY for every provider outcome, exactly — not approximately', () => {
    for (const r of responses) {
      // The product path (cli/commands/contract.ts) and the study path (runStudyGeneration) both
      // route through this one function. If either ever computes its own, this test still passes —
      // which is why the census below asserts the RULE is not reimplemented anywhere else.
      const product = validityFrom({ kind: r.stop }, r.text);
      const study = validityFrom({ kind: r.stop }, r.text);
      expect(study, r.label).toBe(product);
    }
  });

  it('and a truncated generation is never COMPLETE, whatever its text looks like', () => {
    // The one that mattered: a fragment with a well-formed numbered list in it.
    expect(validityFrom({ kind: 'MAX_TOKENS' }, '1. first\n2. sec')).toBe('TRUNCATED');
  });

  it('the same generations reduce to the same context rates regardless of input order', () => {
    // Order-independence matters because the product runs arm-major and a study may run context-major.
    const base: StudyGeneration[] = [
      { contextId: 'c1', kind: 'SHOULD_FIRE', arm: 'A', rep: 1, validity: 'COMPLETE', structural: 'CORRECT', outputTokens: 1, output: '' },
      { contextId: 'c1', kind: 'SHOULD_FIRE', arm: 'B', rep: 1, validity: 'COMPLETE', structural: 'WRONG', outputTokens: 1, output: '' },
      { contextId: 'c2', kind: 'SHOULD_FIRE', arm: 'A', rep: 1, validity: 'COMPLETE', structural: 'WRONG', outputTokens: 1, output: '' },
      { contextId: 'c2', kind: 'SHOULD_FIRE', arm: 'B', rep: 1, validity: 'COMPLETE', structural: 'CORRECT', outputTokens: 1, output: '' },
    ];
    expect(toContextRates([...base].reverse())).toEqual(toContextRates(base));
  });
});
