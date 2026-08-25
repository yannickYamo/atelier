// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

/**
 * DISCOVERY CONTRACT — the anti-circularity guards.
 * The load-bearing tests: recurrence measured on a golden the proposer READ is a restatement, not
 * evidence; and no amount of recurrence may make a discovered factor load-bearing.
 */
import { describe, it, expect } from 'vitest';
import {
  validateDiscovery, toHypotheses, discoverySummary,
  MIN_PROPOSAL_GOLDENS, MIN_HELD_OUT_GOLDENS,
  type DiscoveryInput, type GoldenRef, type ProposedFactor,
} from '../../core/discovery/chain/discovery-contract.js';
import { aggregateTasteFactorEvidence } from '../../core/discovery/chain/taste-discovery.js';
import { assignPriority } from '../../core/discovery/chain/taste-factor-evidence.js';

const SCOPE = { standardDimensions: ['positioning_discipline'] };

const goldens = (proposal: string[], heldOut: string[]): GoldenRef[] => [
  ...proposal.map(id => ({ contextId: id, role: 'PROPOSAL' as const })),
  ...heldOut.map(id => ({ contextId: id, role: 'HELD_OUT' as const })),
];

const factor = (o: Partial<ProposedFactor> = {}): ProposedFactor => ({
  proposedId: 'names_the_contradiction',
  description: 'names the contradiction in the buyer\'s current belief before introducing the position',
  appliesWhen: [{ id: 'buyer_holds_a_prior', describe: 'the buyer already believes something the position must displace' }],
  readFrom: ['g1', 'g2'],
  wouldBeAbsentIf: 'the draft introduces the position without ever naming what the buyer currently believes', quote: '',
  ...o,
});

const input = (o: Partial<DiscoveryInput> = {}): DiscoveryInput => ({
  skillId: 'positioning-messaging',
  goldens: goldens(['g1', 'g2'], ['g3', 'g4']),
  proposed: [factor()],
  observations: [
    { proposedId: 'names_the_contradiction', observation: { contextId: 'g3', applicable: true, present: true } },
    { proposedId: 'names_the_contradiction', observation: { contextId: 'g4', applicable: true, present: true } },
  ],
  ...o,
});

describe('discovery contract — circularity designed out', () => {
  it('accepts a clean split', () => {
    expect(validateDiscovery(input())).toEqual([]);
  });

  it('REFUSES recurrence counted on a golden the proposer read', () => {
    // The central guard. Measuring a pattern on the examples it was read off is a restatement.
    const problems = validateDiscovery(input({
      observations: [{ proposedId: 'names_the_contradiction', observation: { contextId: 'g1', applicable: true, present: true } }],
    }));
    expect(problems.join(' ')).toMatch(/not held out/i);
  });

  it('REFUSES a factor read off a held-out golden', () => {
    const problems = validateDiscovery(input({ proposed: [factor({ readFrom: ['g1', 'g3'] })] }));
    expect(problems.join(' ')).toMatch(/read off HELD-OUT golden g3/);
    expect(problems.join(' ')).toMatch(/saw what it is being scored against/);
  });

  it('REFUSES overlapping sets', () => {
    const problems = validateDiscovery(input({
      goldens: [...goldens(['g1', 'g2'], ['g2', 'g3'])],
    }));
    expect(problems.join(' ')).toMatch(/in BOTH sets/);
  });

  it('REFUSES a corpus too small for either side to mean anything', () => {
    const problems = validateDiscovery(input({ goldens: goldens(['g1'], ['g2']) }));
    expect(problems.join(' ')).toMatch(new RegExp(`fewer than ${MIN_PROPOSAL_GOLDENS}|only 1 proposal`, 'i'));
    expect(problems.join(' ')).toMatch(new RegExp(`${MIN_HELD_OUT_GOLDENS}\\+ examples|only 1 held-out`, 'i'));
  });

  it('REFUSES a factor with no conditions — taste is Q(y|x), never Q(y)', () => {
    const problems = validateDiscovery(input({ proposed: [factor({ appliesWhen: [] })] }));
    expect(problems.join(' ')).toMatch(/caricature/);
  });

  it('REFUSES a hypothesis that cannot be shown absent', () => {
    const problems = validateDiscovery(input({ proposed: [factor({ wouldBeAbsentIf: '  ' })] }));
    expect(problems.join(' ')).toMatch(/cannot be tested/);
  });

  it('toHypotheses THROWS on an invalid run rather than yielding evidence quietly', () => {
    expect(() => toHypotheses(input({ proposed: [factor({ appliesWhen: [] })] }), SCOPE, 'model'))
      .toThrow(/discovery run refused/i);
  });

  it('THE CAP HOLDS: perfect held-out recurrence still cannot make a factor load-bearing', () => {
    // The honest-yield mechanism, end to end. Present in every held-out golden, no expert labels
    // -> UNDERIDENTIFIED -> DERIVED_UNRATIFIED -> capped at ADVISORY. Recurrence is a pattern,
    // never a preference, and only the expert can supply the difference.
    const [{ hypothesis, golden }] = toHypotheses(input(), SCOPE, 'model');
    const ev = aggregateTasteFactorEvidence(hypothesis, { golden });
    expect(ev.goldenRecurrence.supporting).toBe(2);
    expect(ev.confidence).toBe('UNDERIDENTIFIED');
    expect(ev.authorityStatus).toBe('DERIVED_UNRATIFIED');

    const decision = assignPriority(ev);
    expect(decision.priority).toBe('ADVISORY');
    // NOTE: it lands ADVISORY via the recurrence-only path, so the explicit DERIVED cap message
    // is not appended — the cap only speaks when it actually bites (i.e. when some other path
    // would otherwise have promoted the factor). Two independent reasons, same floor.
    expect(decision.rationale.join(' ')).toMatch(/recurrence-only or underidentified/i);
    // and the cap DOES bite if discrimination evidence arrives without ratification
    const withDiscrim = assignPriority({ ...ev, contextsDiscriminative: 2,
      expertPreferenceDiscrimination: { supporting: 2, contradicting: 0, distinctContexts: 2 },
      boundarySupport: { supporting: 1, contradicting: 0, distinctContexts: 1 },
      confidence: 'SUPPORTED' });
    expect(withDiscrim.priority).toBe('ADVISORY');
    expect(withDiscrim.rationale.join(' ')).toMatch(/cannot be load-bearing/i);
  });

  it('the user-facing summary refuses to overclaim', () => {
    const s = discoverySummary(3, 4, 3);
    expect(s).toMatch(/had not seen/);
    expect(s).toMatch(/shows a pattern, not that you would object if it were missing/);
    expect(s).toMatch(/only you can answer/);
  });

  it('and says so plainly when nothing was found', () => {
    expect(discoverySummary(0, 4, 0)).toMatch(/Nothing distinctive was found/);
  });
});
