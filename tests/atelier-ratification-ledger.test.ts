import { describe, it, expect } from 'vitest';
import { draftHash, appendDecision, stampVersion, survival, HISTORICAL_SURVIVAL_INFERRED,
  type RatificationLedger } from '../core/ratification/decision-record.js';
import type { Requirement } from '../core/state/canonical-state.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL', kind: 'GENERATIVE',
  authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: 'a quote', evidenceItemId: 'u1', wouldBeAbsentIf: 'you would see X', materiality: null, realizationTolerance: null, outputShape: null, ...over });
const empty = (h: string): RatificationLedger => ({ standardDraftHash: h, records: [] });
const AT = '2026-08-22T00:00:00Z';

describe('the ledger records what was SHOWN, not what survived', () => {
  it('captures the exact proposed state including scope and counterfactual', () => {
    const shown = req('g1', { appliesWhen: 'when reviewing', wouldBeAbsentIf: 'you would see hedging', materiality: null, realizationTolerance: null, outputShape: null });
    const l = appendDecision(empty('d1'), shown, 'APPROVE', { decidedAt: AT });
    expect(l.records[0].shown.appliesWhen).toBe('when reviewing');
    expect(l.records[0].shown.wouldBeAbsentIf).toBe('you would see hedging');
    expect(l.records[0].shown.evidence).toBe('a quote');
    expect(l.records[0].standardDraftHash).toBe('d1');
  });

  it('an EDIT keeps BOTH the proposal and the replacement', () => {
    const shown = req('g1');
    const mine = req('g1', { statement: 'what I actually do', authority: 'EXPERT_AUTHORED' });
    const l = appendDecision(empty('d1'), shown, 'EDIT', { humanRevision: mine, decidedAt: AT });
    expect(l.records[0].shown.statement).toBe('rule g1');
    expect(l.records[0].humanRevision!.statement).toBe('what I actually do');
  });

  it('refuses an EDIT with no revision, and a revision on a non-EDIT', () => {
    expect(() => appendDecision(empty('d1'), req('g1'), 'EDIT', { decidedAt: AT }))
      .toThrow(/without recording what/);
    expect(() => appendDecision(empty('d1'), req('g1'), 'APPROVE', { humanRevision: req('g1'), decidedAt: AT }))
      .toThrow(/the decision is EDIT/);
  });

  it('is APPEND-ONLY — re-deciding needs a new draft', () => {
    const l = appendDecision(empty('d1'), req('g1'), 'REJECT', { decidedAt: AT });
    expect(() => appendDecision(l, req('g1'), 'APPROVE', { decidedAt: AT }))
      .toThrow(/append-only/);
  });

  it('a note is optional — an answer is authority without a reason', () => {
    const l = appendDecision(empty('d1'), req('g1'), 'REJECT', { decidedAt: AT });
    expect(l.records[0].note).toBeNull();
  });

  it('the draft hash covers scope and counterfactual, not just the statement', () => {
    const base = [req('g1')];
    expect(draftHash(base)).toBe(draftHash([req('g1')]));
    expect(draftHash(base)).not.toBe(draftHash([req('g1', { appliesWhen: 'when X' })]));
    expect(draftHash(base)).not.toBe(draftHash([req('g1', { wouldBeAbsentIf: 'something else', materiality: null, realizationTolerance: null, outputShape: null })]));
    // order-independent — the same set shown in another order is the same draft
    expect(draftHash([req('a'), req('b')])).toBe(draftHash([req('b'), req('a')]));
  });

  it('stamps the minted version once, without rewriting decisions', () => {
    let l = appendDecision(empty('d1'), req('g1'), 'APPROVE', { decidedAt: AT });
    l = appendDecision(l, req('g2'), 'REJECT', { decidedAt: AT });
    const s = stampVersion(l, 'v-abc');
    expect(s.records.every((r) => r.resultingStandardVersionHash === 'v-abc')).toBe(true);
    expect(s.records.map((r) => r.decision)).toEqual(['APPROVE', 'REJECT']);
  });
});

describe('recorded survival and inferred survival can never be confused', () => {
  it('recorded survival counts approvals AND edits as kept', () => {
    let l = empty('d1');
    l = appendDecision(l, req('g1'), 'APPROVE', { decidedAt: AT });
    l = appendDecision(l, req('g2'), 'EDIT', { humanRevision: req('g2'), decidedAt: AT });
    l = appendDecision(l, req('g3'), 'REJECT', { decidedAt: AT });
    l = appendDecision(l, req('g4'), 'DEFER', { decidedAt: AT });
    const s = survival(l);
    expect(s).toMatchObject({ shown: 4, approved: 1, edited: 1, rejected: 1, deferred: 1 });
    expect(s.survivalRate).toBe(0.5);
    expect(s.provenance).toBe('RECORDED');
  });

  it('the historical 12→8 is kept as INFERRED and is a different type', () => {
    expect(HISTORICAL_SURVIVAL_INFERRED.provenance).toBe('INFERRED_FROM_ID_GAPS');
    expect(HISTORICAL_SURVIVAL_INFERRED.why).toMatch(/NOT a measurement of precision/);
    expect(HISTORICAL_SURVIVAL_INFERRED.why).toMatch(/never to be pooled with recorded decisions/);
  });
});
