// tests/atelier-contract-suite.test.ts — CONSTRUCTED CHALLENGES, AND THE CLAIM THEY MAY NOT MAKE.
//
// Two properties, and they fail in completely different ways.
//
// The first is that the STANDARD decides what must be tested. A generator may invent a situation; it
// may not invent what success means, because that is authorship and nobody ratified it. The
// obligations below are derived from typed fields with no model consulted, which is what makes that
// boundary checkable rather than aspirational.
//
// The second is statistical and is the one most likely to be lost later. Twenty-six constructed cases
// from one generation procedure are not twenty-six independent draws from any deployment
// distribution. This programme has already published a confidence claim built on non-independent
// observations and withdrawn it. So the census at the bottom fails if the contract modules ever reach
// for the holdout arithmetic, and `ContractResult` carries no field a rate could hide in.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { obligationsFor, obligationsForStandard, coverageOf } from '../core/contract/obligation.js';
import { sealSuite, roleOf, searchCases, describeContractResult, SuiteRefused,
  type ContractTestCase, type ContractResult } from '../core/contract/suite.js';
import { authorityStateOf, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

const standard = (requirements: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: null, workType: 'writing', requirements,
  authorityState: authorityStateOf(requirements), mintedAt: '2026-01-01T00:00:00.000Z',
  supersedes: null, reason: null,
});

const caseFor = (id: string, obligationId: string, over: Partial<ContractTestCase> = {}): ContractTestCase => ({
  caseId: id, obligationId, obligationKind: 'SHOULD_FIRE', requirementIds: ['x1'], task: `task ${id}`,
  expectation: 'the expectation, carried from the obligation', observation: 'UNQUALIFIED',
  provenance: 'MODEL_GENERATED', ...over,
});

describe('the standard decides what must be tested', () => {
  it('a positive rule owes a presence; a prohibition owes an absence', () => {
    // Read from `kind`, never from the statement's wording. `add` defaulting kind to BOUNDARY turned
    // "lead with the next action" into a prohibition and served the model its opposite; an obligation
    // derived from the wording would have inverted with it and agreed.
    expect(obligationsFor(req('x1', { kind: 'GENERATIVE' }))[0].kind).toBe('SHOULD_FIRE');
    expect(obligationsFor(req('x1', { kind: 'BOUNDARY' }))[0].kind).toBe('SHOULD_NOT_FIRE');
  });

  it('a conditional rule owes a case where its condition does NOT hold', () => {
    // Without it, a rule that fires everywhere passes every positive test. That is the exact failure
    // the pricing study measured: compilation kept what to say and lost when not to say it.
    const kinds = obligationsFor(req('x1', { appliesWhen: 'the answer has more than one step' }))
      .map((o) => o.kind);
    expect(kinds).toContain('SHOULD_FIRE');
    // SHOULD_NOT_APPLY, not SHOULD_NOT_FIRE. A conditional rule invoked where its condition is
    // absent is an OVER-APPLICATION; a prohibition that was violated is a different failure with the
    // opposite repair, and giving them one name made them indistinguishable downstream.
    expect(kinds).toContain('SHOULD_NOT_APPLY');
    expect(kinds).not.toContain('SHOULD_NOT_FIRE');
    expect(kinds).toContain('BOUNDARY');
  });

  it('an unconditional rule owes no negative case, because there is no context where it lapses', () => {
    expect(obligationsFor(req('x1', { appliesWhen: 'GENERAL' })).map((o) => o.kind))
      .toEqual(['SHOULD_FIRE']);
  });

  it('a rule the author declared not taste owes nothing', () => {
    // INCIDENTAL reaches the model through nothing. Testing for it would test a rule the standard
    // says it does not have.
    expect(obligationsFor(req('x1', { materiality: 'INCIDENTAL' }))).toEqual([]);
  });

  it('a machine-checkable shape owes a deterministic obligation', () => {
    const os = obligationsFor(req('x1', { materiality: 'REQUIRED', outputShape: { v: { type: 'string' } } }));
    const shape = os.find((o) => o.kind === 'OUTPUT_SHAPE');
    expect(shape?.observation).toBe('DETERMINISTIC');
  });

  it('rules that both apply everywhere owe an interaction, where skills actually fail', () => {
    const os = obligationsForStandard(standard([req('x1'), req('x2')]));
    const inter = os.filter((o) => o.kind === 'INTERACTION');
    expect(inter).toHaveLength(1);
    expect([...inter[0].requirementIds].sort()).toEqual(['x1', 'x2']);
  });

  it('every obligation says why it exists and what the standard expects', () => {
    for (const o of obligationsForStandard(standard([req('x1'), req('x2', { kind: 'BOUNDARY' })]))) {
      expect(o.why, o.obligationId).toBeTruthy();
      expect(o.expectation, o.obligationId).toBeTruthy();
      expect(o.requirementIds.length, o.obligationId).toBeGreaterThan(0);
    }
  });
});

describe('observability is derived only where the derivation is honest', () => {
  it('no shape means UNQUALIFIED, not a guess at structure', () => {
    // Reading prose to decide a rule is "structurally checkable" is the word-list-as-proxy mistake,
    // and it would manufacture confidence exactly where this programme has been wrong before.
    expect(obligationsFor(req('x1'))[0].observation).toBe('UNQUALIFIED');
    expect(obligationsFor(req('x1', { statement: 'never end with a generic closing offer' }))[0].observation)
      .toBe('UNQUALIFIED');
  });

  it('coverage reports how little is automatic, per requirement', () => {
    const cov = coverageOf(standard([
      req('x1'),
      req('x2', { materiality: 'REQUIRED', outputShape: { v: { type: 'string' } } }),
    ]));
    expect(cov.find((c) => c.requirementId === 'x1')?.automaticallyObservable).toBe(0);
    expect(cov.find((c) => c.requirementId === 'x2')?.automaticallyObservable).toBeGreaterThan(0);
  });
});

describe('the suite is sealed before anything optimizes against it', () => {
  const v = standard([req('x1'), req('x2', { appliesWhen: 'when the task has steps' }), req('x3')]);
  const ids = obligationsForStandard(v).map((o) => o.obligationId);
  const cases = ids.map((o, i) => caseFor(`c${i}`, o));

  it('splits into a search half and a holdout half', () => {
    const s = sealSuite(v, cases);
    expect(s).not.toBeInstanceOf(SuiteRefused);
    if (s instanceof SuiteRefused) return;
    expect(s.searchCaseIds.length).toBeGreaterThan(0);
    expect(s.holdoutCaseIds.length).toBeGreaterThan(0);
    expect(s.searchCaseIds.length + s.holdoutCaseIds.length).toBe(cases.length);
  });

  it('the split is reproducible, so a run cannot re-roll its way to a kinder holdout', () => {
    const a = sealSuite(v, cases); const b = sealSuite(v, cases);
    if (a instanceof SuiteRefused || b instanceof SuiteRefused) throw new Error('refused');
    expect(a.holdoutCaseIds).toEqual(b.holdoutCaseIds);
    expect(a.suiteHash).toBe(b.suiteHash);
  });

  it('no case is in both halves, and the optimizer cannot reach the holdout', () => {
    const s = sealSuite(v, cases);
    if (s instanceof SuiteRefused) throw new Error('refused');
    expect(s.searchCaseIds.filter((id) => s.holdoutCaseIds.includes(id))).toEqual([]);
    const reachable = new Set(searchCases(s).map((c) => c.caseId));
    for (const id of s.holdoutCaseIds) expect(reachable.has(id)).toBe(false);
    for (const id of s.holdoutCaseIds) expect(roleOf(s, id)).toBe('HOLDOUT');
  });

  it('cases for the same obligation stay on the same side', () => {
    // Two cases for one obligation are near duplicates. One in each half means the optimizer has
    // effectively been shown its own holdout.
    const twoEach = ids.flatMap((o, i) => [caseFor(`a${i}`, o), caseFor(`b${i}`, o)]);
    const s = sealSuite(v, twoEach);
    if (s instanceof SuiteRefused) throw new Error('refused');
    for (const o of ids) {
      const mine = twoEach.filter((c) => c.obligationId === o).map((c) => c.caseId);
      const roles = new Set(mine.map((id) => roleOf(s, id)));
      expect(roles.size, `obligation ${o} was split across both halves`).toBe(1);
    }
  });

  it('refuses a case claiming an obligation the standard never placed', () => {
    const s = sealSuite(v, [...cases, caseFor('rogue', 'should_fire:invented')]);
    expect(s).toBeInstanceOf(SuiteRefused);
    expect((s as SuiteRefused).message).toMatch(/nobody ratified/);
  });

  it('names the obligations no case covers, because a silent gap reads as a pass', () => {
    const s = sealSuite(v, cases.slice(0, 4));   // enough to split, not enough to cover
    if (s instanceof SuiteRefused) throw new Error('refused');
    expect(s.uncoveredObligationIds.length).toBeGreaterThan(0);
  });
});

describe('a contract run cannot claim deployment reliability', () => {
  const result: ContractResult = {
    suiteHash: 'h', skillVersionHash: 'sv', role: 'HOLDOUT',
    passed: ['a', 'b', 'c'], failed: ['d'],
    apparentPass: ['f', 'g'], apparentFail: ['h'], unobservable: ['e'],
    obligationsCovered: 4, obligationsTotal: 6,
  };

  it('the result type carries counts and no rate, bound or interval', () => {
    const keys = Object.keys(result);
    for (const forbidden of ['rate', 'bound', 'interval', 'confidence', 'upperBound', 'failureRate']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase())),
        `ContractResult carries "${forbidden}" — somebody will quote it as reliability`).toBe(false);
    }
  });

  it('the sentence a person may quote says constructed, and says what it does not estimate', () => {
    const s = describeContractResult(result);
    expect(s).toContain('constructed');
    expect(s).toMatch(/not independent samples/i);
    expect(s).toMatch(/do not estimate/i);
    expect(s).toContain('8 constructed case(s)');
    // The two readings are reported separately, or the weaker one gets quoted as the stronger.
    expect(s).toMatch(/decided: 3 passed, 1 failed/);
    expect(s).toMatch(/unqualified reader: 2 appear to pass, 1 appear to fail/);
    expect(s).toMatch(/certifies nothing/);
  });

  const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
    return /\.m?ts$/.test(p) ? [p] : [];
  });

  it('the census can see the contract modules', () => {
    expect(walk('core/contract').length).toBeGreaterThanOrEqual(2);
  });

  it('no contract module reaches for the holdout arithmetic', () => {
    // `upperBound95` and `nForBar` assume independent samples from the distribution the claim is
    // about. Applied to a suite's own output they would manufacture a confidence interval from a
    // procedure's self-report — the same shape as the pooled binomial this programme withdrew.
    const offenders = walk('core/contract').filter((f) => {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return /upperBound95|nForBar|holdout-integrity/.test(code);
    });
    expect(offenders, `constructed cases are not independent samples; this arithmetic does not apply:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
