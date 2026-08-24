/**
 * The aggregation layer and the convergence state machine.
 *
 * Two assertions carry the pass: nested generations never become independent n, and PROMOTE is
 * unreachable while any gate is unearned — with the reason named rather than implied.
 */
import { describe, it, expect } from 'vitest';
import { tally, claimability, normalisedWeights, authorityOf, type Observation } from '../core/measurement/observation.js';
import { evidenceFor, describeEvidence } from '../core/measurement/longitudinal.js';
import { decide, unreachableGates, NOTHING_EARNED, type Gates } from '../core/convergence/state-machine.js';

const obs = (o: Partial<Observation>): Observation => ({
  requirementId: 'g1', domain: 'BEHAVIOR', contextId: 'c1', invocationId: 'i1', generationIndex: 0,
  verdict: 'NO_VETO', producer: 'veto-sensor', producerVersion: 'v3',
  authority: 'OBSERVE_ONLY', evidence: null, at: '2026-08-22T00:00:00Z', ...o });

const MISS = new Set(['VETO', 'VIOLATED']);

describe('nested generations are never independent n', () => {
  it('SSO normalisation: ten generations of one task carry the weight of one task', () => {
    // Σ_c |e_ic| = 1 applied to contexts. Borrowed rather than invented — the same mechanism that
    // stops one SSO probe dominating a ranking stops one task dominating a denominator.
    const ten = Array.from({ length: 10 }, (_, i) => obs({ generationIndex: i, invocationId: `i${i}` }));
    const w = normalisedWeights(ten);
    expect([...w.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('the tally shows raw and normalised side by side so the inflation cannot hide', () => {
    const t = tally(Array.from({ length: 6 }, (_, i) => obs({ generationIndex: i, invocationId: `i${i}` })));
    expect(t[0].observations).toBe(6);
    expect(t[0].weight).toBeCloseTo(1);
    expect(t[0].contexts).toBe(1);
  });

  it('THE v2 CAMPAIGN SHAPE: 60 observations across 2 contexts reads as 2', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      obs({ contextId: i < 36 ? 'cA' : 'cB', generationIndex: i, invocationId: `i${i}` }));
    const e = evidenceFor('g1', many, [], [], MISS);
    expect(e.observations).toBe(60);
    expect(e.independentContexts).toBe(2);
    expect(describeEvidence(e)).toContain('NOT independent evidence');
  });

  it('names contexts that answered the same task two different ways', () => {
    const e = evidenceFor('g1', [
      obs({ contextId: 'c1', generationIndex: 0, verdict: 'VETO' }),
      obs({ contextId: 'c1', generationIndex: 1, verdict: 'NO_VETO' }),
    ], [], [], MISS);
    expect(e.mixedWithinContext).toEqual(['c1']);
    expect(describeEvidence(e)).toContain('judged both ways');
  });

  it('a miss in one context is an anecdote, in several a recurrence', () => {
    const one = evidenceFor('g1', [obs({ verdict: 'VETO' })], [], [], MISS);
    expect(describeEvidence(one)).toContain('anecdote');
    const many = evidenceFor('g1', [obs({ contextId: 'a', verdict: 'VETO' }), obs({ contextId: 'b', verdict: 'VETO' })], [], [], MISS);
    expect(describeEvidence(many)).toContain('not one bad day');
  });
});

describe('authority propagates with every observation', () => {
  it('an unqualified producer may be counted but may not make a claim', () => {
    const c = claimability([obs({})], 'BEHAVIOR');
    expect(c.claimable).toBe(false);
    if (!c.claimable) {
      expect(c.reason).toContain('OBSERVE_ONLY');
      expect(c.reason).toContain('not findings that a requirement is met');
    }
  });

  it('a human or a deterministic check can', () => {
    expect(claimability([obs({ authority: 'HUMAN' })], 'BEHAVIOR').claimable).toBe(true);
    expect(claimability([obs({ authority: 'DETERMINISTIC' })], 'BEHAVIOR').claimable).toBe(true);
  });

  it('VETO_QUALIFIED still cannot clear — it earned the right to block, not to certify', () => {
    expect(claimability([obs({ authority: 'VETO_QUALIFIED' })], 'BEHAVIOR').claimable).toBe(false);
  });

  it('one unqualified observation poisons the claim, not just its own row', () => {
    expect(claimability([obs({ authority: 'HUMAN' }), obs({ authority: 'OBSERVE_ONLY' })], 'BEHAVIOR').claimable).toBe(false);
  });

  it('permission maps to authority in one direction, with no inference', () => {
    expect(authorityOf('OBSERVE')).toBe('OBSERVE_ONLY');
    expect(authorityOf('VETO')).toBe('VETO_QUALIFIED');
    expect(authorityOf('CERTIFY')).toBe('CERTIFY_QUALIFIED');
  });
});

describe('the convergence machine stops truthfully', () => {
  // The parameter this took was `Partial<Parameters<typeof evidenceFor>[0]>`, which resolves to
  // `Partial<string>` — an empty object type — and was never passed anything. Removed rather than
  // repaired: an override nobody used is not a fixture feature.
  const ev = () =>
    evidenceFor('g1', [
      obs({ contextId: 'a', verdict: 'VETO' }), obs({ contextId: 'b', verdict: 'VETO' }),
    ], [], [], MISS);

  const run = (gates: Partial<Gates> = {}, over: Partial<Parameters<typeof decide>[0]> = {}) =>
    decide({ evidence: ev(), gates: { ...NOTHING_EARNED, ...gates },
      legalRepairAvailable: true, candidateEvaluated: true, ...over });

  it('PROMOTE is unreachable with nothing earned, and says which gate first', () => {
    const d = run();
    expect(d.terminal).toBe('OBSERVER_UNQUALIFIED');
    expect(d.blockedBy).toHaveLength(3);
    expect(d.why).toContain('not a reason to reject either');
  });

  it('earning the observer moves the answer to the NEXT gate, not to PROMOTE', () => {
    expect(run({ observerPermission: 'CERTIFY' }).terminal).toBe('DISTINCTIVENESS_UNQUALIFIED');
    expect(run({ observerPermission: 'CERTIFY', distinctiveness: 'EARNED' }).terminal).toBe('AUTHORITY_REQUIRED');
  });

  it('PROMOTE requires ALL of them — and is reachable in code, so the test is real', () => {
    const d = run({ observerPermission: 'CERTIFY', distinctiveness: 'EARNED', comparisonPowered: true });
    expect(d.terminal).toBe('PROMOTE');
    expect(d.blockedBy).toHaveLength(0);
  });

  it('UNDERPOWERED beats OBSERVER_UNQUALIFIED — do not send someone to qualify an instrument when nothing has happened', () => {
    const thin = evidenceFor('g1', [obs({ contextId: 'a', verdict: 'VETO' })], [], [], MISS);
    const d = decide({ evidence: thin, gates: NOTHING_EARNED, legalRepairAvailable: true, candidateEvaluated: true });
    expect(d.terminal).toBe('UNDERPOWERED');
    expect(d.why).toContain('not additional evidence');
  });

  it('never observed, no miss, no legal repair and no budget each end differently', () => {
    const none = evidenceFor('gX', [], [], [], MISS);
    expect(decide({ evidence: none, gates: NOTHING_EARNED, legalRepairAvailable: true, candidateEvaluated: true }).terminal).toBe('MORE_EVIDENCE');
    const clean = evidenceFor('g1', [obs({ contextId: 'a' }), obs({ contextId: 'b' })], [], [], MISS);
    expect(decide({ evidence: clean, gates: NOTHING_EARNED, legalRepairAvailable: true, candidateEvaluated: true }).terminal).toBe('MORE_EVIDENCE');
    expect(run({}, { legalRepairAvailable: false }).terminal).toBe('NO_LEGAL_REPAIR');
    expect(run({ budgetExhausted: true }).terminal).toBe('BUDGET_LIMIT');
  });

  it('reports every unreachable gate with a reason', () => {
    const u = unreachableGates(NOTHING_EARNED);
    expect(u).toHaveLength(3);
    expect(u.map((x) => x.gate).join(' ')).toContain('distinctiveness');
    // the default moved MISSING -> UNQUALIFIED when the floor was ported, and the reason moved with
    // it: the instrument exists now, and having it is not the same as having earned anything with it
    expect(u.find((x) => x.gate.includes('distinctiveness'))!.why)
      .toContain('Recovering an instrument is not inheriting its qualification');
  });
});
