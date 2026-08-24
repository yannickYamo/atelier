/**
 * ACCEPTANCE WITNESS — real stored events through the whole spine, and back out as a decision.
 *
 * No model is called. Every observation is either DETERMINISTIC or HUMAN authority, written to a
 * real store on disk and read back through the same functions the CLI uses. The point is not that
 * the functions work in isolation; it is that the EDGES carry, and that changing the evidence
 * changes the decision for the reason it should.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initStore, putObservation, listObservations, appendEvent, readEvents, type StoreLayout } from '../core/state/store.js';
import { foldRepairs, foldProhibitions } from '../core/architecture/repair-memory.js';
import { runSpine, explainSpine, MISS_VERDICTS } from '../core/convergence/controller.js';
import { planNext } from '../core/convergence/planner.js';
import { NOTHING_EARNED, type Gates } from '../core/convergence/state-machine.js';
import type { Observation } from '../core/measurement/observation.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';
import { A_BINDING } from './fixtures.js';
import { observeRuntime } from '../core/runtime/binding.js';

const store = (): StoreLayout => {
  const L = { root: mkdtempSync(join(tmpdir(), 'atelier-spine-')), skillName: 'my-voice' };
  initStore(L); return L;
};

const inv = (id: string, ctx: string, matched = true): InvocationRecord => ({
  invocationId: id, skillName: 'my-voice', standardVersionHash: 'sv1', skillVersionHash: 'k1',
  architectureHash: 'a1', servedPackageHash: 'p1', runtimeBinding: A_BINDING, observedRuntime: observeRuntime(A_BINDING, 'test-model', '2026-01-01T00:00:00.000Z'),
  invocationSurface: 'ATELIER_CLI', request: { resolvedTaskHash: 'th', servedTaskHash: 'th', source: 'POSITIONAL' }, provenance: 'ORGANIC_USE', inputHash: ctx, outputHash: 'o',
  at: '2026-08-22T00:00:00Z', delivery: { expectedPackageHash: 'p1', servedPackageHash: matched ? 'p1' : 'pX', matched, servedFiles: [], outputContract: null },
  input: 'task', output: 'out',
});

const ob = (o: Partial<Observation>): Observation => ({
  requirementId: 'g1', domain: 'BEHAVIOR', contextId: 'c1', invocationId: 'i1', generationIndex: 0, verdict: 'VETO',
  producer: 'veto-sensor', producerVersion: 'v3', authority: 'OBSERVE_ONLY', evidence: null,
  at: '2026-08-22T00:00:00Z', ...o });

/** The whole pipeline, exactly as the CLI runs it: store -> fold -> spine. */
const spine = (L: StoreLayout, invocations: InvocationRecord[], gates: Gates = NOTHING_EARNED, over = {}) =>
  runSpine({ requirementId: 'g1', invocations, observations: listObservations(L),
    repairs: foldRepairs(readEvents(L)), prohibitions: foldProhibitions(readEvents(L)),
    gates, currentCarrier: 'PROSE', nextCarrier: 'SELF_CHECK', ...over });

describe('the spine runs over real stored events', () => {
  it('WITNESS: stored events -> aggregation -> recurrent symptom -> diagnosis -> hypothesis -> decision', () => {
    const L = store();
    // two SEPARATE situations, each missing the same requirement
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));

    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);

    expect(listObservations(L)).toHaveLength(2);            // the edge: written and read back
    expect(s.evidence.independentContexts).toBe(2);
    expect(s.symptom.kind).toBe('RECURRENT_MISS');
    expect(s.route).toBe('IMPLEMENTATION_MISS');
    expect(s.hypothesis).not.toBeNull();
    expect(s.hypothesisProblems).toHaveLength(0);
    expect(s.hypothesis!.disconfirmedBy).toContain('recurring at SELF_CHECK');
    expect(s.decision.terminal).toBe('MORE_EVIDENCE');       // candidate not yet evaluated
    expect(explainSpine(s)).toContain('wrong if:');
  });

  it('repeated generations in ONE context do not inflate independent n', () => {
    const L = store();
    for (let i = 0; i < 8; i++) putObservation(L, ob({ contextId: 'cA', invocationId: `i${i}`, generationIndex: i }));
    const s = spine(L, [inv('i0', 'cA')]);
    expect(s.evidence.observations).toBe(8);
    expect(s.evidence.independentContexts).toBe(1);
    expect(s.symptom.kind).toBe('ISOLATED_MISS');            // NOT recurrent
    expect(s.decision.terminal).toBe('UNDERPOWERED');
  });

  it('recurrence across SEPARATE contexts does', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    expect(spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]).symptom.kind).toBe('RECURRENT_MISS');
  });

  it('unqualified observations cannot become fidelity; a human observation can', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    expect(spine(L, [inv('i1', 'cA')]).evidence.claim.claimable).toBe(false);

    const H = store();
    putObservation(H, ob({ contextId: 'cA', invocationId: 'i1', authority: 'HUMAN', producer: 'expert' }));
    expect(spine(H, [inv('i1', 'cA')]).evidence.claim.claimable).toBe(true);
  });

  it('a prior failed repair is remembered, and reconsiderable on stronger evidence', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', skillName: 'my-voice', requirementId: 'g1',
      from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 's', candidateSkillVersionHash: 'cand1',
      evidenceBasis: { missContexts: 1, invocationIds: [] }, at: '2026-08-01' });
    appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: 'r1', outcome: 'REJECTED',
      evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null },
      at: '2026-08-02', note: 'it started nagging' });

    // remembered: the prior attempt travels with the hypothesis
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    expect(s.hypothesis).not.toBeNull();                      // 2 miss contexts > the 1 that failed
    expect(s.hypothesis!.priorAttempts).toHaveLength(1);
    expect(s.hypothesis!.priorAttempts[0].note).toBe('it started nagging');
    expect(explainSpine(s)).toContain('tried before');
  });

  it('and NOT reconsiderable on evidence no stronger than what already failed', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', skillName: 'my-voice', requirementId: 'g1',
      from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 's', candidateSkillVersionHash: 'c',
      evidenceBasis: { missContexts: 9, invocationIds: [] }, at: '2026-08-01' });
    appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: 'r1', outcome: 'REJECTED',
      evaluationBasis: { generations: 9, instrument: 'HUMAN_EYE', orderInvariant: null }, at: '2026-08-02', note: null });
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    expect(s.hypothesis).toBeNull();
    expect(s.decision.terminal).toBe('NO_LEGAL_REPAIR');
  });

  it('underpowered evidence produces UNDERPOWERED, never a plateau claim', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    const d = spine(L, [inv('i1', 'cA')]).decision;
    expect(d.terminal).toBe('UNDERPOWERED');
    expect(d.why).toContain('not additional evidence');
  });

  it('a delivery mismatch prevents semantic diagnosis entirely', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB', false)]);
    expect(s.symptom.kind).toBe('DELIVERY_MISMATCH');
    expect(s.route).toBe('DELIVERY_FAILURE');
    expect(s.hypothesis).toBeNull();                          // no implementation repair proposed
    expect(s.routeWhy).toContain('the standard is not implicated');
  });

  it('an unearned distinctiveness gate prevents PROMOTE even with the observer earned', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1', authority: 'HUMAN' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2', authority: 'HUMAN' }));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')],
      { ...NOTHING_EARNED, observerPermission: 'CERTIFY', comparisonPowered: true }, { candidateEvaluated: true });
    expect(s.decision.terminal).toBe('DISTINCTIVENESS_UNQUALIFIED');
    expect(s.decision.blockedBy.join(' ')).toContain('distinctiveness');
  });

  it('and all EARNED gates make PROMOTE reachable — so the guard is real, not a stub', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1', authority: 'HUMAN' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2', authority: 'HUMAN' }));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')],
      { ...NOTHING_EARNED, observerPermission: 'CERTIFY', distinctiveness: 'EARNED', comparisonPowered: true },
      { candidateEvaluated: true });
    expect(s.decision.terminal).toBe('PROMOTE');
    expect(s.unreachable).toHaveLength(0);
  });

  it('changing ONE gate changes the decision, and names the next one', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1', authority: 'HUMAN' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2', authority: 'HUMAN' }));
    const at = (g: Partial<Gates>) => spine(L, [inv('i1', 'cA'), inv('i2', 'cB')],
      { ...NOTHING_EARNED, ...g }, { candidateEvaluated: true }).decision.terminal;
    expect(at({})).toBe('OBSERVER_UNQUALIFIED');
    expect(at({ observerPermission: 'CERTIFY' })).toBe('DISTINCTIVENESS_UNQUALIFIED');
    expect(at({ observerPermission: 'CERTIFY', distinctiveness: 'EARNED' })).toBe('AUTHORITY_REQUIRED');
  });

  it('a missing rule surfaces as AUTHORITY_REQUIRED, never as an implementation repair', () => {
    // STANDARD_GAP territory: the requirement is not carried by the architecture at all, so there is
    // no transition to propose and nothing an implementation change could reach.
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1', authority: 'HUMAN' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2', authority: 'HUMAN' }));
    const s = runSpine({ requirementId: 'g1', invocations: [inv('i1', 'cA'), inv('i2', 'cB')],
      observations: listObservations(L), repairs: [], prohibitions: [],
      gates: { ...NOTHING_EARNED, observerPermission: 'CERTIFY', distinctiveness: 'EARNED', comparisonPowered: true },
      currentCarrier: undefined, nextCarrier: undefined, candidateEvaluated: true });
    expect(s.hypothesis).toBeNull();
    expect(s.decision.terminal).toBe('NO_LEGAL_REPAIR');
  });

  it('MISS_VERDICTS spans every instrument vocabulary in the system', () => {
    expect(MISS_VERDICTS.has('VETO')).toBe(true);       // v3
    expect(MISS_VERDICTS.has('VIOLATED')).toBe(true);   // v1/v2 and human
    expect(MISS_VERDICTS.has('NO_VETO')).toBe(false);   // never a miss, and never a pass
  });
});

describe('CORRECTION 1 — candidate eligibility is not promotion eligibility', () => {
  const human = (ctx: string, i: string) => ob({ contextId: ctx, invocationId: i, authority: 'HUMAN', producer: 'expert' });

  it('ONE authoritative miss forms a hypothesis and justifies a reversible candidate', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    const s = spine(L, [inv('i1', 'cA')]);
    expect(s.route).toBe('IMPLEMENTATION_MISS');          // authority decides the route, not count
    expect(s.hypothesis).not.toBeNull();
    expect(s.hypothesisProblems).toHaveLength(0);
    expect(s.action.eligibility).toBe('CANDIDATE_ELIGIBLE');
    expect(s.action.kind).toBe('FORM_REPAIR_CANDIDATE');
    expect(s.action.neverLicenses).toContain('promotion');
  });

  it('but it cannot promote, whatever the gates say', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    const s = spine(L, [inv('i1', 'cA')],
      { ...NOTHING_EARNED, observerPermission: 'CERTIFY', distinctiveness: 'EARNED', comparisonPowered: true },
      { candidateEvaluated: true });
    expect(s.decision.terminal).not.toBe('PROMOTE');
    expect(s.decision.terminal).toBe('UNDERPOWERED');
  });

  it('recurrence strengthens it to PROMOTION_ELIGIBLE', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    putObservation(L, human('cB', 'i2'));
    expect(spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]).action.eligibility).toBe('PROMOTION_ELIGIBLE');
  });

  it('one miss from an UNQUALIFIED instrument is not enough even to build on', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));   // OBSERVE_ONLY
    const s = spine(L, [inv('i1', 'cA')]);
    expect(s.action.eligibility).toBe('HYPOTHESIS_ELIGIBLE');
    expect(s.action.kind).toBe('COLLECT_QUALIFICATION_EVIDENCE');
  });

  it('THE g9 HISTORY STAYS LEGAL: one natural miss -> hypothesis -> candidate -> rejected', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    const before = spine(L, [inv('i1', 'cA')]);
    expect(before.action.kind).toBe('FORM_REPAIR_CANDIDATE');   // every g9 step was eligible
    appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', skillName: 'my-voice', requirementId: 'g1',
      from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 's', candidateSkillVersionHash: 'c1',
      evidenceBasis: { missContexts: 1, invocationIds: [] }, at: '2026-08-01' });
    appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: 'r1', outcome: 'REJECTED',
      evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null }, at: '2026-08-02', note: 'nagging' });
    // and the SAME evidence no longer re-proposes it
    const after = spine(L, [inv('i1', 'cA')]);
    expect(after.hypothesis).toBeNull();
    expect(after.action.kind).not.toBe('FORM_REPAIR_CANDIDATE');
  });
});

describe('CORRECTION 2 — delivery evidence can never become fidelity', () => {
  it('POLARITY: 100 successful delivery observations, zero behavioural', () => {
    const L = store();
    for (let i = 0; i < 100; i++) {
      putObservation(L, ob({ domain: 'DELIVERY', contextId: `c${i}`, invocationId: `i${i}`,
        verdict: 'DELIVERED', producer: 'delivery-check', producerVersion: '1', authority: 'DETERMINISTIC' }));
    }
    const s = spine(L, Array.from({ length: 100 }, (_, i) => inv(`i${i}`, `c${i}`)));

    expect(s.evidence.delivery).toBe('PROVEN');            // DELIVERY_PROVEN
    expect(s.evidence.behavior).toBe('UNOBSERVED');        // BEHAVIOR_UNOBSERVED
    expect(s.evidence.claim.claimable).toBe(false);        // and NEVER behavioural fidelity
    expect(s.evidence.behaviorObservations).toBe(0);
    expect(s.symptom.kind).toBe('UNOBSERVED');
    expect(s.action.kind).toBe('WAIT_FOR_ORGANIC_EVIDENCE');
    expect(s.action.why).toContain('delivery evidence cannot answer that');
    // the refusal names the domain confusion rather than blaming authority
    if (!s.evidence.claim.claimable) expect(s.evidence.claim.reason).toContain('another domain');
  });

  it('and DETERMINISTIC authority alone does not rescue it', () => {
    const L = store();
    putObservation(L, ob({ domain: 'DELIVERY', authority: 'DETERMINISTIC', verdict: 'DELIVERED' }));
    expect(spine(L, [inv('i1', 'c1')]).evidence.claim.claimable).toBe(false);
  });
});

describe('the planner chooses the next legal action, deterministically', () => {
  const human = (ctx: string, i: string) => ob({ contextId: ctx, invocationId: i, authority: 'HUMAN', producer: 'expert' });

  it('competing hypotheses route to a DEV probe, not to a repair', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    putObservation(L, human('cB', 'i2'));
    const base = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    const two = [base.hypothesis!, { ...base.hypothesis!, failingMechanism: 'grounding failure — the rule was read and the evidence to apply it was absent' }];
    const s = runSpine({ requirementId: 'g1', invocations: [inv('i1', 'cA'), inv('i2', 'cB')],
      observations: listObservations(L), repairs: [], prohibitions: [],
      currentCarrier: 'PROSE', nextCarrier: 'SELF_CHECK', competingHypotheses: two });
    expect(s.action.kind).toBe('RUN_DEV_PROBE');
    expect(s.action.reduces).toBe('NEED_DISCRIMINATING_PROBE');
    expect(s.action.discrimination!.betweenHypotheses).toHaveLength(2);
    // and the probe it would produce may never certify
    expect(s.action.discrimination!.evidenceClass).toBe('DEV_PROBE');
    expect(s.action.neverLicenses).toContain('DEV_PROBE');
  });

  it('a STANDARD_GAP routes to authority, never to a probe or a repair', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    const s = runSpine({ requirementId: 'g1', invocations: [inv('i1', 'cA')],
      observations: listObservations(L), repairs: [], prohibitions: [],
      currentCarrier: 'PROSE', nextCarrier: 'SELF_CHECK' });
    // force the route: a gap is diagnosed elsewhere, and the planner must not try to close it
    const gap = { ...s, route: 'STANDARD_GAP' as const };
    const a = planNext({ evidence: gap.evidence, symptom: gap.symptom, route: 'STANDARD_GAP',
      hypotheses: [], gates: NOTHING_EARNED });
    expect(a.kind).toBe('REQUEST_AUTHORITY');
    expect(a.neverLicenses).toContain('no action here mutates a standard');
  });

  it('a delivery mismatch routes to REPAIR_DELIVERY before anything semantic', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    putObservation(L, human('cB', 'i2'));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB', false)]);
    expect(s.action.kind).toBe('REPAIR_DELIVERY');
  });

  it('an unearned distinctiveness gate routes to its evidence need before PROMOTE', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    putObservation(L, human('cB', 'i2'));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')],
      { ...NOTHING_EARNED, observerPermission: 'CERTIFY', comparisonPowered: true },
      { candidatePresent: true, candidateEvaluated: false });
    expect(s.action.kind).toBe('BUILD_DISTINCTIVENESS_BASELINE');
    expect(s.action.reduces).toBe('NEED_DISTINCTIVENESS_BASELINE');
  });

  it('an underpowered comparison asks for contexts, never declares a plateau', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    putObservation(L, human('cB', 'i2'));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')],
      { ...NOTHING_EARNED, observerPermission: 'CERTIFY', distinctiveness: 'EARNED' },
      { candidatePresent: true, candidateEvaluated: false });
    expect(s.action.kind).toBe('COLLECT_MORE_CONTEXTS');
    expect(s.action.reduces).toBe('NEED_MORE_INDEPENDENT_CONTEXTS');
  });

  it('CHANGING ONLY THE EVIDENCE CHANGES THE ACTION', () => {
    const L = store();
    // nothing observed -> wait
    expect(spine(L, [inv('i1', 'cA')]).action.kind).toBe('WAIT_FOR_ORGANIC_EVIDENCE');
    // one unqualified miss -> qualify the instrument
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    expect(spine(L, [inv('i1', 'cA')]).action.kind).toBe('COLLECT_QUALIFICATION_EVIDENCE');
    // one AUTHORITATIVE miss -> build a reversible candidate
    const H = store();
    putObservation(H, human('cA', 'i1'));
    expect(spine(H, [inv('i1', 'cA')]).action.kind).toBe('FORM_REPAIR_CANDIDATE');
  });

  it('every action names the uncertainty it reduces, and what it never licenses', () => {
    const L = store();
    putObservation(L, human('cA', 'i1'));
    const a = spine(L, [inv('i1', 'cA')]).action;
    expect(a.why.length).toBeGreaterThan(20);
    expect(a.neverLicenses.length).toBeGreaterThan(10);
  });
});
