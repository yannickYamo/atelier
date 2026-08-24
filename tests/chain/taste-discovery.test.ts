// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

import { describe, it, expect } from 'vitest';
import { aggregateTasteFactorEvidence, assembleSkillStandardBlueprint, probesNeeded, type TasteFactorHypothesis } from '../../core/discovery/chain/taste-discovery.js';
import { assignPriority } from '../../core/discovery/chain/taste-factor-evidence.js';
import type { MethodologyEvidence } from '../../core/discovery/chain/methodology-evidence.js';

const SCOPE = { skillIds: ['strategic-narrative'], standardDimensions: ['voice'] };
const hyp = (): TasteFactorHypothesis => ({
  proposedId: 'concise_directional_recommendation', description: 'expert prefers concise directional recommendations',
  constructScope: SCOPE, appliesWhen: [{ id: 'evidence_sufficient', describe: 'evidence supports a call' }],
  provenance: { proposedBy: 'M3-discovery', fromGoldens: ['g1', 'g2'] },
});
const strongObs = {
  golden: [{ contextId: 'c1', applicable: true, present: true }, { contextId: 'c2', applicable: true, present: true }],
  discrimination: [{ contextId: 'c1', contextFamilyId: 'c1', preferenceMovedWithFactor: true }, { contextId: 'c2', contextFamilyId: 'c2', preferenceMovedWithFactor: true }],
  boundary: [{ contextId: 'c1', preferredLevel: 'ACCEPTABLE' as const }],
};

describe('Stage 3 — deterministic aggregation into FOUR separate channels', () => {
  it('folds observations correctly; recurrence uses applicable denominator', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), strongObs);
    expect(ev.goldenRecurrence.applicableContexts).toBe(2);
    expect(ev.expertPreferenceDiscrimination.supporting).toBe(2);
    expect(ev.boundarySupport.supporting).toBe(1);
    expect(ev.confidence).toBe('SUPPORTED');
  });
  it('INDIFFERENT is a SCOPE signal (contextsIndifferent), NOT global counter-evidence', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), { ...strongObs, boundary: [{ contextId: 'c3', preferredLevel: 'INDIFFERENT' }] });
    expect(ev.counterEvidence.supporting).toBe(0);      // indifference is not disagreement
    expect(ev.contextsIndifferent).toBe(1);
  });
  it('only preference moved AGAINST is counter-evidence (genuine disagreement)', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), { discrimination: [{ contextId: 'c1', contextFamilyId: 'c1', preferenceMovedWithFactor: false }] });
    expect(ev.counterEvidence.supporting).toBe(1);
  });
});

describe('Stage 3 — discovery grants NO authority (DERIVED stays ADVISORY until ratified)', () => {
  it('a DERIVED hypothesis with STRONG evidence is still ADVISORY (ratification candidate), never CORE', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), strongObs, false); // not ratified
    expect(ev.authorityStatus).toBe('DERIVED_UNRATIFIED');
    expect(assignPriority(ev).priority).toBe('ADVISORY');
  });
  it('RATIFIED + load-bearing evidence → CORE (importance from evidence, not the ratification bit)', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), strongObs, true); // ratified + strong discrimination + boundary
    expect(ev.authorityStatus).toBe('EXPERT_RATIFIED');
    expect(assignPriority(ev).priority).toBe('CORE');
  });
  it('POINT 1: ratified factor EXISTENCE with NO load-bearing evidence is NOT CORE (ratification ≠ importance)', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), { golden: strongObs.golden }, true); // ratified, but only recurrence
    expect(ev.authorityStatus).toBe('EXPERT_RATIFIED');
    expect(assignPriority(ev).priority).not.toBe('CORE'); // recurrence alone never core
    expect(assignPriority(ev).priority).toBe('ADVISORY');
  });
  it('POINT 2: preferred in c1,c2 but INDIFFERENT in c3 → CONTEXTUAL (Q(y|x)), NOT globally ADVISORY', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), { ...strongObs, boundary: [{ contextId: 'c1', preferredLevel: 'ACCEPTABLE' }, { contextId: 'c3', preferredLevel: 'INDIFFERENT' }] }, true);
    expect(assignPriority(ev).priority).toBe('CONTEXTUAL'); // one indifferent context must not erase the c1/c2 preference
  });
  it('POINT 2: preference moved AGAINST in a context → ADVISORY (genuine contest, needs calibration)', () => {
    const ev = aggregateTasteFactorEvidence(hyp(), { discrimination: [{ contextId: 'c1', contextFamilyId: 'c1', preferenceMovedWithFactor: true }, { contextId: 'c2', contextFamilyId: 'c2', preferenceMovedWithFactor: false }], boundary: strongObs.boundary }, true);
    expect(assignPriority(ev).priority).toBe('ADVISORY');
  });
  it('probesNeeded true until SUPPORTED and uncontested', () => {
    expect(probesNeeded(hyp(), aggregateTasteFactorEvidence(hyp(), { golden: strongObs.golden }))).toBe(true);
    expect(probesNeeded(hyp(), aggregateTasteFactorEvidence(hyp(), strongObs, true))).toBe(false);
  });
});

describe('Stage 3 — TERMINAL blueprint folds taste + methodology (omission = load-bearing)', () => {
  const missingMethod: MethodologyEvidence = {
    methodologyId: 'pricing_value_metric_audit', authority: 'EXPERT_RATIFIED',
    presence: 'ABSENT', applicability: 'REQUIRED', applicabilityIs: 'CONTRACT_CONSISTENCY', semanticAppropriateness: 'UNCALIBRATED',
    status: 'REQUIRED_BUT_MISSING', execution: 'NOT_ASSESSABLE', obligationsSatisfied: [], obligationsMissing: [], obligationsNotAssessable: [], composition: 'COMPATIBLE',
  };
  it('a REQUIRED_BUT_MISSING authored method becomes a CORE requirement in the blueprint', () => {
    const bp = assembleSkillStandardBlueprint('su1', 'pricing-strategy',
      [{ evidence: aggregateTasteFactorEvidence(hyp(), strongObs, true), recommendedSurface: 'DELIVERY_TASTE' }],
      [missingMethod], { standardDimensions: ['pricing_rigor'] });
    const methodReq = bp.requirements.find((r) => r.tasteFactorId === 'method:pricing_value_metric_audit');
    expect(methodReq).toBeDefined();
    expect(methodReq!.priority).toBe('CORE');
    expect(methodReq!.rationale.join(' ')).toMatch(/omission/);
    // ranked CORE-first
    expect(bp.requirements[0].priority).toBe('CORE');
    // derived taste hypotheses surface as ratification candidates, never auto-required
    expect(bp.ratificationCandidates).not.toContain('method:pricing_value_metric_audit');
  });
});
