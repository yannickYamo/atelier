/**
 * D1 — the floor is a PROJECTION of the standard, and approving it is an authority act.
 *
 * The load-bearing refusals: a dimension with no trace, a contract that protects nothing, and a
 * margin left for the machine to choose.
 */
import { describe, it, expect } from 'vitest';
import { proposeFloor, approveFloor, toQualityFloorContract, revalidate, MARGIN_SEMANTICS,
  type FloorDimension } from '../core/distinctiveness/contract.js';
import { requireFloorContract, evaluateQualityFloor } from '../core/distinctiveness/floor.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

const req = (id: string, statement: string): Requirement => ({ requirementId: id, statement,
  appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
  provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: null, evidenceItemId: null });

const STD: StandardVersion = { standardVersionHash: 'sv1', evidenceId: 'e', workType: 'analysis',
  requirements: [
    req('g7', 'I do not rely on analogies to other companies or industries; instead I build arguments from first principles.'),
    req('g11', 'I do not end sections with inspirational or aspirational language; instead I conclude with concrete implications.'),
    req('g2', "I explicitly connect my direct experience by naming specific projects I've shipped."),
  ],
  authorityState: 'RATIFIED', mintedAt: '2026-08-22T00:00:00Z', supersedes: null, reason: null };

const proposal = proposeFloor(STD, new Set(['g2']), [
  { wanted: 'house_voice', why: 'the standard says nothing about voice' }]);
const dim = (over: Partial<FloorDimension> = {}): FloorDimension =>
  ({ ...proposal.dimensions[0], margin: 0.3, gateRole: 'ENFORCE', ...over });

describe('every dimension traces to a ratified requirement', () => {
  it('one dimension per requirement, never a composite the machine invented', () => {
    expect(proposal.dimensions).toHaveLength(2);              // g7 and g11; g2 rejected
    for (const d of proposal.dimensions) expect(d.sourceRequirementIds).toHaveLength(1);
  });

  it('a requirement needing EXTERNAL VERIFICATION is rejected, with the reason', () => {
    expect(proposal.rejected.map((r) => r.sourceRequirementIds[0])).toEqual(['g2']);
    expect(proposal.rejected[0].disposition).toBe('NEEDS_EXTERNAL_VERIFICATION');
    expect(proposal.rejected[0].reason).toContain('a criterion it cannot score');
  });

  it('a wanted behaviour absent from the standard is a STANDARD_GAP, not a floor entry', () => {
    // A contract ported from elsewhere protects a voice dimension. This standard says nothing about voice.
    expect(proposal.standardGaps.map((g) => g.wanted)).toContain('house_voice');
    expect(proposal.dimensions.some((d) => d.id.includes('voice'))).toBe(false);
  });

  it('and a dimension citing no requirement is REFUSED at approval', () => {
    const r = approveFloor(proposal, [dim({ sourceRequirementIds: [] })], 'expert', 'now');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('inventing authority');
  });

  it('a dimension citing a requirement outside this standard is REFUSED', () => {
    const r = approveFloor(proposal, [dim({ sourceRequirementIds: ['gZZ'] })], 'expert', 'now');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not in this standard');
  });
});

describe('approval is an authority act, and refuses non-decisions', () => {
  it('no margin means the only judgement that cannot be computed was deferred', () => {
    const r = approveFloor(proposal, [dim({ margin: null })], 'expert', 'now');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('cannot be computed');
  });

  it('all-OBSERVE holds nothing — at least one behaviour must be untradeable', () => {
    const r = approveFloor(proposal, [dim({ gateRole: 'OBSERVE' })], 'expert', 'now');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('decided by nothing');
  });

  it('an empty floor is refused', () => {
    expect(approveFloor(proposal, [], 'expert', 'now').ok).toBe(false);
  });

  it('ONE approval of the exact content-addressed contract is sufficient', () => {
    const r = approveFloor(proposal, [dim()], 'expert', '2026-08-22');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version.floorContractHash).toHaveLength(16);
      expect(r.version.standardVersionHash).toBe('sv1');
    }
  });

  it('the hash is content-addressed — a different margin is a different contract', () => {
    const a = approveFloor(proposal, [dim({ margin: 0.3 })], 'e', 'now');
    const b = approveFloor(proposal, [dim({ margin: 0.4 })], 'e', 'now');
    expect(a.ok && b.ok && a.version.floorContractHash !== b.version.floorContractHash).toBe(true);
  });
});

describe('the three identities do not silently carry', () => {
  it('a contract belongs to ONE standard version', () => {
    const r = approveFloor(proposal, [dim()], 'e', 'now');
    if (!r.ok) throw new Error('setup');
    expect(revalidate(r.version, 'sv1').ok).toBe(true);
    const moved = revalidate(r.version, 'sv2');
    expect(moved.ok).toBe(false);
    expect(moved.why).toContain('no longer ratified');
  });

  it('and the floor still fails closed without an approved contract', () => {
    expect(() => requireFloorContract(null)).toThrow(/cannot be defaulted/);
  });

  it('an approved contract converts to floor arithmetic carrying its trace', () => {
    const r = approveFloor(proposal, [dim()], 'e', 'now');
    if (!r.ok) throw new Error('setup');
    const q = toQualityFloorContract(r.version);
    const only = Object.values(q.dimensions)[0];
    expect(only.rationale).toContain('protects g7');
    expect(only.nonInferiorityMargin).toBe(0.3);
    // and it fails closed if the candidate does not score the protected dimension
    expect(() => evaluateQualityFloor({}, { perFireScores: {}, model: 'm', capturedAt: 'x', hash: 'h' } as never, q)).toThrow();
  });
});

describe('margin semantics are stated, and the machine declines to choose', () => {
  it('no margin is proposed by derivation', () => {
    for (const d of proposal.dimensions) expect(d.margin).toBeNull();
  });

  it('and what it may NOT be derived from is explicit', () => {
    expect(MARGIN_SEMANTICS.notDerivableFrom).toContain('instrument noise');
    expect(MARGIN_SEMANTICS.notDerivableFrom).toContain('candidate variance');
    expect(MARGIN_SEMANTICS.authorisedBy).toContain('author of the standard');
  });
});
