// tests/atelier-diagnosis.test.ts — THE ROUTER, AND EVERY WAY IT MUST REFUSE.
//
// The diagnoser's job is to say what KIND of failure this is. Three of its four answers authorise
// nothing, and those three are the ones worth testing hardest: a router that only ever finds work to
// do is not a router, it is a justification engine.

import { describe, it, expect } from 'vitest';
import { checkDelivery, routeFrom, standardForDiagnosis, type CoverageMapping } from '../core/diagnosis/diagnose.js';
import type { StandardVersion, InvocationRecord, Requirement } from '../core/state/canonical-state.js';
import { A_BINDING } from './fixtures.js';
import { observeRuntime } from '../core/runtime/binding.js';

const req = (id: string, statement: string): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
  provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: 'span', evidenceItemId: 'w1',
});
const std: StandardVersion = {
  standardVersionHash: 'sv1', evidenceId: 'ev1', workType: 'writing',
  requirements: [req('g1', 'Open on the concrete moment.'), req('g2', 'Never end on inspirational language.')],
  authorityState: 'RATIFIED', mintedAt: '2026-08-20T00:00:00Z', supersedes: null, reason: null,
};
const inv = (matched: boolean): InvocationRecord => ({
  invocationId: 'i1', skillName: 'my-voice', standardVersionHash: 'sv1', skillVersionHash: 'k1',
  architectureHash: 'a1', servedPackageHash: matched ? 'p1' : 'pTAMPERED',
  runtimeBinding: A_BINDING, observedRuntime: observeRuntime(A_BINDING, 'test-model', '2026-01-01T00:00:00.000Z'), invocationSurface: 'ATELIER_CLI', request: { resolvedTaskHash: 'th', servedTaskHash: 'th', source: 'POSITIONAL' }, provenance: 'ORGANIC_USE',
  inputHash: 'ih', outputHash: 'oh', at: '2026-08-20T01:00:00Z',
  delivery: { expectedPackageHash: 'p1', servedPackageHash: matched ? 'p1' : 'pTAMPERED', matched, servedFiles: ['SKILL.md'], outputContract: null },
  input: 'task', output: 'out',
});
const map = (o: Partial<CoverageMapping>): CoverageMapping =>
  ({ coverage: 'AMBIGUOUS', requirementIds: [], proposedRequirement: null, question: null, reasoning: 'r', ...o });

describe('delivery is decided first, deterministically, without a model', () => {
  it('a package-hash mismatch is DELIVERY_FAILURE and short-circuits everything', () => {
    const d = checkDelivery(inv(false))!;
    expect(d.route).toBe('DELIVERY_FAILURE');
    // Naming both hashes is the point — "delivery failed" is not actionable, "these two differ" is.
    expect(d.reason).toContain('pTAMPERED');
    expect(d.reason).toContain('p1');
    expect(d.requirementId).toBeNull();
  });

  it('a matching package does not short-circuit — it returns null so semantic routing can run', () => {
    expect(checkDelivery(inv(true))).toBeNull();
  });
});

describe('the router authorises a repair only in one shape', () => {
  it('COVERED by exactly one KNOWN requirement is the only path to IMPLEMENTATION_MISS', () => {
    const d = routeFrom(map({ coverage: 'COVERED', requirementIds: ['g2'] }), std);
    expect(d.route).toBe('IMPLEMENTATION_MISS');
    expect(d.requirementId).toBe('g2');
  });

  it('REFUSES an id the standard does not contain — that is hallucinated authority, not coverage', () => {
    // The load-bearing refusal. A model naming `g9` has not found a missed requirement; it has
    // invented one, and repairing against it would serve a rule nobody ever authorised.
    const d = routeFrom(map({ coverage: 'COVERED', requirementIds: ['g9'] }), std);
    expect(d.route).toBe('UNCERTAIN');
    expect(d.requirementId).toBeNull();
    expect(d.reason).toContain('g9');
  });

  it('REFUSES to attribute one complaint across several requirements', () => {
    // Not a scoring problem — a scope problem. One observation cannot say which of two rules broke,
    // and repairing both spends specialization the evidence never paid for.
    const d = routeFrom(map({ coverage: 'COVERED', requirementIds: ['g1', 'g2'] }), std);
    expect(d.route).toBe('UNCERTAIN');
    expect(d.question).toContain('g1');
  });

  it('ABSENT with a proposal is STANDARD_GAP — and carries NO requirementId to repair', () => {
    const d = routeFrom(map({ coverage: 'ABSENT', proposedRequirement: 'I leave some roughness in.' }), std);
    expect(d.route).toBe('STANDARD_GAP');
    expect(d.proposedRequirement).toBe('I leave some roughness in.');
    expect(d.requirementId).toBeNull();   // nothing may be escalated on a gap
  });

  it('ABSENT with NO proposal is UNCERTAIN, not a silent gap', () => {
    expect(routeFrom(map({ coverage: 'ABSENT' }), std).route).toBe('UNCERTAIN');
  });

  it('AMBIGUOUS carries the one question worth asking and authorises nothing', () => {
    const d = routeFrom(map({ coverage: 'AMBIGUOUS', question: 'Which part felt wrong?' }), std);
    expect(d.route).toBe('UNCERTAIN');
    expect(d.question).toBe('Which part felt wrong?');
    expect(d.requirementId).toBeNull();
    expect(d.proposedRequirement).toBeNull();
  });

  it('EVERY route states a reason — a routing decision with no reason is not auditable', () => {
    for (const m of [map({ coverage: 'COVERED', requirementIds: ['g1'] }), map({ coverage: 'ABSENT', proposedRequirement: 'x' }), map({})]) {
      expect(routeFrom(m, std).reason.length).toBeGreaterThan(20);
    }
  });
});

describe('what the diagnoser is shown', () => {
  it('sees ids and statements — never evidence spans or provenance', () => {
    const text = standardForDiagnosis(std);
    expect(text).toContain('g1.');
    expect(text).toContain('Open on the concrete moment.');
    // Discovery provenance is not part of "does this standard cover the complaint", and feeding it
    // in would let a span the model itself once wrote come back as support for its own mapping.
    expect(text).not.toContain('span');
    expect(text).not.toContain('MACHINE_DISCOVERED');
  });
});
