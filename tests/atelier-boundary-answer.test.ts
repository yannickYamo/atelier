import { describe, it, expect } from 'vitest';
import { applyBoundaryAnswer, BOUNDARY_ANSWER_AUTHORITY, type BoundaryQuery } from '../core/ratification/boundary-answer.js';
import { survival, type RatificationLedger } from '../core/ratification/decision-record.js';
import { coverageFor } from '../core/coverage/standard-coverage.js';
import type { Requirement } from '../core/state/canonical-state.js';

const shown: Requirement = { requirementId: 'g1', statement: 'I ground abstract concepts in concrete moments.',
  appliesWhen: 'introducing a multi-step technical system', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED',
  provenance: 'MACHINE_DISCOVERED', evidence: 'q', evidenceItemId: 'u1', wouldBeAbsentIf: 'you would see the system named before any scene', materiality: null, realizationTolerance: null, outputShape: null };
const q: BoundaryQuery = { queryId: 'q-g1', requirementId: 'g1',
  optionAScope: 'GENERAL', optionBScope: 'introducing a multi-step technical system' };
const L = (): RatificationLedger => ({ standardDraftHash: 'd1', records: [] });
const AT = '2026-08-22T00:00:00Z';

describe('a targeted scope answer is applied AND recorded', () => {
  it('choosing the option that differs records an EDIT with the revision', () => {
    const r = applyBoundaryAnswer(L(), shown, q, { choice: 'A' }, AT);
    expect(r.revised.appliesWhen).toBe('GENERAL');
    expect(r.revised.authority).toBe('EXPERT_RATIFIED');
    expect(r.changedFromProposal).toBe(true);
    expect(r.ledger.records[0].decision).toBe('EDIT');
    expect(r.ledger.records[0].humanRevision!.appliesWhen).toBe('GENERAL');
    expect(r.ledger.records[0].shown.appliesWhen).toBe('introducing a multi-step technical system');
  });

  it('confirming what was shown records an APPROVE, not an edit of nothing', () => {
    const r = applyBoundaryAnswer(L(), shown, q, { choice: 'B' }, AT);
    expect(r.changedFromProposal).toBe(false);
    expect(r.ledger.records[0].decision).toBe('APPROVE');
    expect(r.ledger.records[0].humanRevision).toBeNull();
  });

  it('NEITHER is a real answer and is the only path to a scope nobody proposed', () => {
    const r = applyBoundaryAnswer(L(), shown, q, { choice: 'NEITHER', condition: 'when the reader has no stake yet' }, AT);
    expect(r.revised.appliesWhen).toBe('when the reader has no stake yet');
    expect(r.ledger.records[0].decision).toBe('EDIT');
    expect(r.ledger.records[0].note).toMatch(/author's own condition/);
  });

  it('refuses NEITHER with no condition, and a query about another requirement', () => {
    expect(() => applyBoundaryAnswer(L(), shown, q, { choice: 'NEITHER', condition: '  ' }, AT))
      .toThrow(/without recording what is right/);
    expect(() => applyBoundaryAnswer(L(), { ...shown, requirementId: 'g9' }, q, { choice: 'A' }, AT))
      .toThrow(/is about g1/);
  });
});

describe('BEFORE -> QUERY -> AFTER moves exactly one coverage state', () => {
  const sig = (boundaryProbed: boolean) => ({
    supportingUnitIds: ['u1'], counterUnitIds: [], contextIds: ['c1'], clusterIds: ['piece-1'],
    boundaryProbed, heldOutRecurrence: 0, framingsFound: ['A'], hasCounterfactual: true,
  });

  it('BOUNDARY_UNRESOLVED clears once the author has answered', () => {
    const general: Requirement = { ...shown, appliesWhen: 'GENERAL' };
    expect(coverageFor(general, sig(false)).states).toContain('BOUNDARY_UNRESOLVED');
    expect(coverageFor(general, sig(true)).states).not.toContain('BOUNDARY_UNRESOLVED');
    expect(coverageFor(general, sig(false)).nextAction).toBe('PROBE_BOUNDARY');
  });

  it('and settles NOTHING about the neighbours', () => {
    expect(BOUNDARY_ANSWER_AUTHORITY.doesNotSettle).toContain('any other requirement in the same draft');
    expect(BOUNDARY_ANSWER_AUTHORITY.doesNotSettle).toContain('that the requirement itself is correct');
  });

  it('the ledger reports RECORDED survival, unlike the historical reconstruction', () => {
    const r = applyBoundaryAnswer(L(), shown, q, { choice: 'A' }, AT);
    expect(survival(r.ledger)).toMatchObject({ shown: 1, edited: 1, survivalRate: 1, provenance: 'RECORDED' });
  });
});
