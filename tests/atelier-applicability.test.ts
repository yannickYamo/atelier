/**
 * A1 — applicability is mechanically real, and it gates EVIDENCE.
 *
 * The defect this closes: every requirement entered every context, so the v3 run judged 33 of 33 as
 * applicable and produced verdicts on cases where the rule barely arises. Forced verdicts on
 * marginal cases look exactly like an instrument that cannot judge.
 */
import { describe, it, expect } from 'vitest';
import { resolveFromFrozenText, admitsEvidence, canProveApplicableFromText, census } from '../core/measurement/applicability.js';
import type { Requirement } from '../core/state/canonical-state.js';

const req = (id: string, appliesWhen: string): Requirement => ({ requirementId: id,
  statement: 's', appliesWhen, kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
  provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: null, evidenceItemId: null });

describe('applicability gates evidence', () => {
  it('APPLIES enters the denominator', () => {
    const d = resolveFromFrozenText(req('g7', 'GENERAL'), 'c1');
    expect(d.state).toBe('APPLIES');
    expect(admitsEvidence(d)).toBe(true);
  });

  it('a CONDITIONAL rule is UNRESOLVED and does NOT enter the denominator', () => {
    const d = resolveFromFrozenText(req('g11', 'At section transitions and conclusions'), 'c1');
    expect(d.state).toBe('UNRESOLVED');
    expect(admitsEvidence(d)).toBe(false);
    expect(d.why).toContain('the text alone cannot settle');
  });

  it('UNRESOLVED is not a weak APPLIES and not a DOES_NOT_APPLY', () => {
    const d = resolveFromFrozenText(req('g4', 'When discussing market transformations'), 'c1');
    expect(d.state).not.toBe('APPLIES');
    expect(d.state).not.toBe('DOES_NOT_APPLY');
  });

  it('DOES_NOT_APPLY is also excluded', () => {
    expect(admitsEvidence({ requirementId: 'g1', contextId: 'c1', state: 'DOES_NOT_APPLY',
      why: 'x', decidedBy: 'INSTRUMENT' })).toBe(false);
  });

  it('the deterministic layer NEVER guesses a condition — that would be a semantic instrument in disguise', () => {
    // every non-GENERAL form resolves the same way, whatever it says
    for (const w of ['At section transitions', 'When proposing solutions', 'if the reader is technical']) {
      expect(resolveFromFrozenText(req('x', w), 'c').state).toBe('UNRESOLVED');
    }
  });

  it('output can never retroactively alter applicability — the decision has no output parameter', () => {
    // structural: resolveFromFrozenText takes (requirement, contextId). There is no output to pass.
    expect(resolveFromFrozenText.length).toBe(2);
  });

  it('census reports the share A2 is trying to move', () => {
    const c = census([req('a', 'GENERAL'), req('b', 'GENERAL'), req('c', 'At conclusions')]);
    expect(c.provenGeneralShare).toBeCloseTo(2 / 3);
    expect(c.conditional).toBe(1);
  });

  it('canProveApplicableFromText is exact, not a prefix match', () => {
    expect(canProveApplicableFromText(req('a', 'GENERAL'))).toBe(true);
    expect(canProveApplicableFromText(req('a', ' general '))).toBe(true);
    expect(canProveApplicableFromText(req('a', 'GENERAL except in summaries'))).toBe(false);
  });
});
