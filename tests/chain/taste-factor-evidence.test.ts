// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

import { describe, it, expect } from 'vitest';
import { assignPriority, buildBlueprint, EMPTY_EVIDENCE, type TasteFactorEvidence } from '../../core/discovery/chain/taste-factor-evidence.js';
import type { ConstructScope } from '../../core/discovery/chain/construct-scope.js';

const SCOPE: ConstructScope = { skillIds: ['pricing-strategy'], standardDimensions: ['grounded_commitment'] };
const ev = (o: Partial<TasteFactorEvidence> = {}): TasteFactorEvidence => ({
  tasteFactorId: 'f', scope: SCOPE, authorityStatus: 'EXPERT_RATIFIED',
  goldenRecurrence: EMPTY_EVIDENCE, expertPreferenceDiscrimination: EMPTY_EVIDENCE, boundarySupport: EMPTY_EVIDENCE, counterEvidence: EMPTY_EVIDENCE,
  contextsObserved: 0, contextsDiscriminative: 0, confidence: 'UNDERIDENTIFIED', ...o,
});
const strong = { supporting: 3, contradicting: 0, distinctContexts: 3 };

describe('assignPriority — transparent lexicographic, four channels never summed', () => {
  it('ratified + SUPPORTED + broad discriminative + boundary + uncontested → CORE', () => {
    expect(assignPriority(ev({ confidence: 'SUPPORTED', contextsDiscriminative: 3, expertPreferenceDiscrimination: strong, boundarySupport: { supporting: 2, contradicting: 0, distinctContexts: 2 } })).priority).toBe('CORE');
  });
  it('HARD INVARIANT: DERIVED_UNRATIFIED can NEVER be load-bearing → ADVISORY', () => {
    const d = assignPriority(ev({ authorityStatus: 'DERIVED_UNRATIFIED', confidence: 'SUPPORTED', contextsDiscriminative: 5, expertPreferenceDiscrimination: strong, boundarySupport: strong }));
    expect(d.priority).toBe('ADVISORY');
    expect(d.rationale.join(' ')).toMatch(/DERIVED_UNRATIFIED cannot be load-bearing/);
  });
  it('contested is never CORE — routes to ADVISORY, not averaged', () => {
    expect(assignPriority(ev({ confidence: 'SUPPORTED', contextsDiscriminative: 3, expertPreferenceDiscrimination: strong, boundarySupport: strong, counterEvidence: { supporting: 1, contradicting: 0, distinctContexts: 1 } })).priority).toBe('ADVISORY');
  });
  it('recurrence-only → ADVISORY, never CORE', () => {
    expect(assignPriority(ev({ goldenRecurrence: strong, confidence: 'EMERGING' })).priority).toBe('ADVISORY');
  });
  it('discriminative only under specific conditions → CONTEXTUAL', () => {
    expect(assignPriority(ev({ contextsDiscriminative: 1, expertPreferenceDiscrimination: { supporting: 1, contradicting: 0, distinctContexts: 1 } })).priority).toBe('CONTEXTUAL');
  });
  it('AUDIT: high golden recurrence with NO discriminative evidence → ADVISORY (recurrence never promotes)', () => {
    expect(assignPriority(ev({ goldenRecurrence: { supporting: 8, contradicting: 0, distinctContexts: 8, applicableContexts: 8 }, confidence: 'SUPPORTED' })).priority).toBe('ADVISORY');
  });
  it('AUDIT: high recurrence CONTRADICTED by expert preference → ADVISORY, never CORE (discrimination dominates)', () => {
    const d = assignPriority(ev({
      goldenRecurrence: { supporting: 8, contradicting: 0, distinctContexts: 8, applicableContexts: 8 },
      counterEvidence: { supporting: 2, contradicting: 0, distinctContexts: 2 },
      confidence: 'SUPPORTED', contextsDiscriminative: 2, expertPreferenceDiscrimination: strong,
    }));
    expect(d.priority).toBe('ADVISORY');
    expect(d.rationale.join(' ')).toMatch(/contested/);
  });
  it('raw channels preserved; no scalar collapse', () => {
    const d = assignPriority(ev({ goldenRecurrence: strong }));
    expect(d.channels.goldenRecurrence).toEqual(strong);
    expect(typeof (d as unknown as { score?: number }).score).toBe('undefined');
  });
});

describe('buildBlueprint — ranked the discovery chain deliverable + ratification candidates', () => {
  it('ranks CORE→ADVISORY; derived w/ evidence = ratification candidate not auto-CORE', () => {
    const bp = buildBlueprint('su1', 'pricing-strategy', [
      { evidence: ev({ tasteFactorId: 'core1', confidence: 'SUPPORTED', contextsDiscriminative: 3, expertPreferenceDiscrimination: strong, boundarySupport: strong }), recommendedSurface: 'STRUCTURAL_METHODOLOGY' },
      { evidence: ev({ tasteFactorId: 'adv1', goldenRecurrence: strong }), recommendedSurface: 'DELIVERY_TASTE' },
      { evidence: ev({ tasteFactorId: 'derived1', authorityStatus: 'DERIVED_UNRATIFIED', contextsDiscriminative: 2, expertPreferenceDiscrimination: strong }), recommendedSurface: 'DELIVERY_TASTE' },
    ]);
    expect(bp.requirements[0].tasteFactorId).toBe('core1');
    expect(bp.requirements[0].priority).toBe('CORE');
    expect(bp.ratificationCandidates).toContain('derived1');
    expect(bp.requirements.find((r) => r.tasteFactorId === 'derived1')!.priority).toBe('ADVISORY');
  });
});
