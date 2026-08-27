// tests/atelier-coverage.test.ts — StandardCoverage, and the two things it must never do.

import { describe, it, expect } from 'vitest';
import { coverageFor, coverageOf, statesOf, describeCoverage, assertCoverageIsNotAuthority,
  COVERAGE_AUTHORITY, signalsFromObservations, type CoverageSignals } from '../core/coverage/standard-coverage.js';
import type { Requirement } from '../core/state/canonical-state.js';
import type { GoldenUnit } from '../core/golden/golden-unit.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL', kind: 'GENERATIVE',
  authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, ...over,
});
const sig = (over: Partial<CoverageSignals> = {}): CoverageSignals => ({
  supportingUnitIds: [], counterUnitIds: [], contextIds: [], clusterIds: [],
  boundaryProbed: false, heldOutRecurrence: 0, framingsFound: [], hasCounterfactual: false, ...over,
});

describe('coverage is a set of signals, never a score', () => {
  it('reports EVERY applicable state, not a level', () => {
    const s = statesOf(req('g1'), sig({ contextIds: ['c1'], framingsFound: ['A'] }));
    expect(s).toContain('SINGLE_CONTEXT');
    expect(s).toContain('BOUNDARY_UNRESOLVED');
    expect(s).toContain('LOW_PRECISION_RISK');
    expect(s.length).toBeGreaterThan(1);          // several at once — findings, not a ladder
  });

  it('names the Barnum shape: one vantage, one context, no counterfactual, never seen again', () => {
    expect(statesOf(req('g1'), sig({ contextIds: ['c1'], framingsFound: ['A'] }))).toContain('LOW_PRECISION_RISK');
    // any ONE of the four missing pieces clears it
    expect(statesOf(req('g1'), sig({ contextIds: ['c1'], framingsFound: ['A', 'B'] }))).not.toContain('LOW_PRECISION_RISK');
    expect(statesOf(req('g1'), sig({ contextIds: ['c1'], framingsFound: ['A'], hasCounterfactual: true }))).not.toContain('LOW_PRECISION_RISK');
    expect(statesOf(req('g1'), sig({ contextIds: ['c1'], framingsFound: ['A'], heldOutRecurrence: 1 }))).not.toContain('LOW_PRECISION_RISK');
    // and an expert-authored rule is never suspected — the author is the authority on their own rule
    expect(statesOf(req('g1', { provenance: 'EXPERT_ADDED' }), sig({ contextIds: ['c1'] }))).not.toContain('LOW_PRECISION_RISK');
  });

  it('a scoped rule is not asked to justify a boundary it never claimed', () => {
    expect(statesOf(req('g1'), sig())).toContain('BOUNDARY_UNRESOLVED');
    expect(statesOf(req('g1', { appliesWhen: 'when reviewing a migration' }), sig())).not.toContain('BOUNDARY_UNRESOLVED');
  });

  it('STRONG_SIGNAL needs held-out recurrence AND several contexts AND no counterevidence', () => {
    const strong = sig({ heldOutRecurrence: 2, contextIds: ['c1', 'c2'], supportingUnitIds: ['u1', 'u2'] });
    expect(statesOf(req('g1'), strong)).toContain('STRONG_SIGNAL');
    expect(statesOf(req('g1'), { ...strong, counterUnitIds: ['u3'] })).not.toContain('STRONG_SIGNAL');
    expect(statesOf(req('g1'), { ...strong, heldOutRecurrence: 1 })).not.toContain('STRONG_SIGNAL');
  });
});

describe('coverage ranks EVIDENCE ACQUISITION', () => {
  it('a contradiction outranks everything — the object is unstable until it is settled', () => {
    const c = coverageFor(req('g1'), sig({ supportingUnitIds: ['u1'], counterUnitIds: ['u2'], contextIds: ['c1'] }));
    expect(c.nextAction).toBe('RESOLVE_CONTRADICTION');
    expect(c.informationValue).toBe(100);
    expect(c.why).toMatch(/two different rules wearing one statement/);
  });

  it('the Barnum shape asks a QUESTION, not for another document', () => {
    const c = coverageFor(req('g1'), sig({ contextIds: ['c1'], framingsFound: ['A'] }));
    expect(c.nextAction).toBe('ASK_DISCRIMINATING_QUESTION');
    expect(c.why).toMatch(/a question beats another document here/);
  });

  it('one context inside one artifact asks for a different ARTIFACT, not another section', () => {
    const inOne = coverageFor(req('g1', { appliesWhen: 'when X' }),
      sig({ contextIds: ['c1'], clusterIds: ['repo-a'], heldOutRecurrence: 1, framingsFound: ['A', 'B'] }));
    expect(inOne.nextAction).toBe('NEED_ANOTHER_ARTIFACT');
    expect(inOne.why).toMatch(/the author or the occasion/);
  });

  it('orders the queue by information value and drops what nothing would help', () => {
    const rs = [req('g1'), req('g2', { appliesWhen: 'when X' }), req('g3', { appliesWhen: 'when Y' })];
    const cov = coverageOf(rs, (r) => (
      r.requirementId === 'g1' ? sig({ supportingUnitIds: ['u1'], counterUnitIds: ['u2'], contextIds: ['c1'] })
        : r.requirementId === 'g2' ? sig({ contextIds: ['c1'], framingsFound: ['A'] })
          : sig({ heldOutRecurrence: 3, contextIds: ['c1', 'c2'], clusterIds: ['a', 'b'], supportingUnitIds: ['u1'], boundaryProbed: true })));
    expect(cov.acquisitionQueue.map((c) => c.requirementId)).toEqual(['g1', 'g2']);
    expect(cov.saturatedIds).toEqual(['g3']);
    expect(cov.why).toMatch(/It does not say any of them is right — only you can do that/);
    expect(describeCoverage(cov)).toMatch(/Ask about g1 first/);
  });

  it('produces no scalar readiness number anywhere on the surface', () => {
    const cov = coverageOf([req('g1')], () => sig({ contextIds: ['c1'] }));
    expect(cov).not.toHaveProperty('score');
    expect(cov).not.toHaveProperty('confidence');
    expect(cov).not.toHaveProperty('readiness');
  });
});

describe('coverage has NO authority', () => {
  it('states what it may and may never support', () => {
    expect(COVERAGE_AUTHORITY.mayNeverSupport).toContain('this StandardVersion is certified');
    expect(COVERAGE_AUTHORITY.mayNeverSupport).toContain('promotion');
  });

  it('throws if a caller reaches for certification or ratification', () => {
    expect(() => { assertCoverageIsNotAuthority('this StandardVersion is certified'); }).toThrow(/cannot support/);
    expect(() => { assertCoverageIsNotAuthority('promotion is authorised'); }).toThrow(/cannot support/);
    expect(() => { assertCoverageIsNotAuthority('which ambiguity deserves an active query'); }).not.toThrow();
  });
});

describe('signals wire from held-out observations', () => {
  const u = (id: string, cluster: string, ctx: string): GoldenUnit => ({
    unitId: id, kind: 'PROSE_SECTION', context: 'c', task: 't', expertAction: 'a', artifact: 'x',
    provenance: { sourceRef: id, clusterId: cluster, contextId: ctx, clusterBasis: 'USER_DECLARED', consumedBy: [] },
  });

  it('separates counterevidence from mere absence, and counts only held-out recurrence', () => {
    const s = signalsFromObservations([
      { unit: u('a', 'r1', 'x1'), applicable: true, present: true, heldOut: true },
      { unit: u('b', 'r2', 'x2'), applicable: true, present: true, heldOut: false },
      { unit: u('c', 'r1', 'x3'), applicable: true, present: false, heldOut: true },   // counterevidence
      { unit: u('d', 'r3', 'x4'), applicable: false, present: false, heldOut: true },  // NOT counterevidence
    ], ['A', 'B', 'A'], true, true);
    expect(s.supportingUnitIds).toEqual(['a', 'b']);
    expect(s.counterUnitIds).toEqual(['c']);          // 'd' did not apply, so it says nothing
    expect(s.heldOutRecurrence).toBe(1);              // only 'a' both supports and was held out
    expect(s.clusterIds).toEqual(['r1', 'r2']);
    expect(s.framingsFound).toEqual(['A', 'B']);
  });
});
