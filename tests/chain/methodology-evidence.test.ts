// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

import { describe, it, expect } from 'vitest';
import { MethodRegistry, canBeRequired, type MethodSpec } from '../../core/discovery/chain/method-registry.js';
import { assessContractApplicability, buildMethodologyEvidence, sweepMethodologies, type MethodSituation } from '../../core/discovery/chain/methodology-evidence.js';

// SEED method (DERIVED_UNRATIFIED proposal, provenance-linked — agent does NOT author authority)
const pricingAudit = (over: Partial<MethodSpec> = {}): MethodSpec => ({
  id: 'pricing_value_metric_audit', version: '0', authority: 'EXPERT_RATIFIED',
  constructScope: { standardDimensions: ['pricing_method'] }, necessity: 'REQUIRED',
  requiredInputs: ['usage_data'], forbiddenContextTags: ['pre_revenue'],
  obligations: [
    { id: 'candidate_metric', describe: 'identify candidate value metric', signature: 'value metric|candidate metric' },
    { id: 'segmentation', describe: 'test segmentation spread', signature: 'segment|spread' },
    { id: 'correlation', describe: 'test correlation to value/WTP', signature: 'correlat|willingness to pay|WTP' },
    { id: 'falsification', describe: 'identify what would falsify selection', signature: 'falsif|would reverse|kill' },
    { id: 'no_premature_tier', describe: 'avoid committing tier structure before evidence', signature: undefined },
  ],
  conflictsWith: ['flat_rate_default'], provenance: { authoredBy: 'seed', sourceRef: 'pricing-strategy SKILL.md' }, ...over
});
const sit = (over: Partial<MethodSituation> = {}): MethodSituation => ({ standardDimension: 'pricing_method', availableInputs: ['usage_data'], contextTags: [], ...over });
const FULL = 'We identify the value metric, test segmentation spread, check correlation to WTP, and name what would falsify it.';

describe('Stage 2 — Present ≠ Applicable ≠ ExecutedCorrectly (never merged)', () => {
  it('present-but-INAPPLICABLE (forbidden context) → INAPPLICABLE_BUT_PRESENT (authority ≠ applicability)', () => {
    const m = pricingAudit(); // EXPERT_RATIFIED
    const e = buildMethodologyEvidence(m, sit({ contextTags: ['pre_revenue'] }), FULL);
    expect(e.presence).toBe('PRESENT');
    expect(e.applicability).toBe('INAPPLICABLE');     // authored authority does NOT make it applicable here
    expect(e.status).toBe('INAPPLICABLE_BUT_PRESENT');
  });

  it('OMISSION first-class: REQUIRED method absent from output → REQUIRED_BUT_MISSING', () => {
    const e = buildMethodologyEvidence(pricingAudit(), sit(), 'A generic answer with no methodology.');
    expect(e.presence).toBe('ABSENT');
    expect(e.applicability).toBe('REQUIRED');
    expect(e.status).toBe('REQUIRED_BUT_MISSING');
  });

  it('execution is decomposable obligations, not a scalar: PARTIAL lists the missing obligation', () => {
    const partial = 'We identify the value metric and test segmentation spread.'; // no correlation, no falsification
    const e = buildMethodologyEvidence(pricingAudit(), sit(), partial);
    expect(e.execution).toBe('PARTIAL');
    expect(e.obligationsMissing).toContain('falsification');
    expect(e.obligationsNotAssessable).toContain('no_premature_tier'); // no signature → honestly not assessed
    expect(typeof (e as unknown as { score?: number }).score).toBe('undefined');
  });
});

describe('Stage 2 — authority ≠ applicability; DERIVED cannot be required', () => {
  it('DERIVED_UNRATIFIED method with REQUIRED necessity is capped to OPTIONAL', () => {
    const m = pricingAudit({ authority: 'DERIVED_UNRATIFIED' });
    expect(canBeRequired(m)).toBe(false);
    expect(assessContractApplicability(m, sit())).toBe('OPTIONAL'); // proposal, not load-bearing
  });
  it('missing required input → UNKNOWN (contract unsatisfiable), never a fabricated "applicable"', () => {
    expect(assessContractApplicability(pricingAudit(), sit({ availableInputs: [] }))).toBe('UNKNOWN');
  });
});

describe('Stage 2 — anti-circularity: applicability is labeled CONTRACT_CONSISTENCY; appropriateness UNCALIBRATED', () => {
  it('every evidence object marks the deterministic layer as contract-consistency, not quality', () => {
    const e = buildMethodologyEvidence(pricingAudit(), sit(), FULL);
    expect(e.applicabilityIs).toBe('CONTRACT_CONSISTENCY');
    expect(e.semanticAppropriateness).toBe('UNCALIBRATED'); // the real "right method?" is deferred, never gates
  });
});

describe('Stage 2 — composition + registry sweep', () => {
  it('CONFLICTING when a conflicting method is co-present', () => {
    const e = buildMethodologyEvidence(pricingAudit(), sit(), FULL, ['flat_rate_default']);
    expect(e.composition).toBe('CONFLICTING');
  });
  it('sweep surfaces REQUIRED_BUT_MISSING across in-scope methods', () => {
    const reg = new MethodRegistry(); reg.register(pricingAudit());
    const out = sweepMethodologies(reg, sit(), 'nothing methodological here');
    expect(out.find((e) => e.methodologyId === 'pricing_value_metric_audit')!.status).toBe('REQUIRED_BUT_MISSING');
  });
  it('registry rejects a method with no construct scope (no universal methods)', () => {
    const reg = new MethodRegistry();
    expect(() => { reg.register(pricingAudit({ constructScope: { standardDimensions: [] } })); }).toThrow();
  });
});
