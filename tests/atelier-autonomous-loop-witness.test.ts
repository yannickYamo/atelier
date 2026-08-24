/**
 * AUTONOMOUS_LOOP_READY — the full lifecycle over a real on-disk store, no paid inference.
 *
 * The claim being witnessed is NOT that the loop converges. It is that there is no missing
 * architecture between evidence and autonomous convergence: every stage exists, is wired, and stops
 * truthfully at whichever gate is unearned. Semantic verdicts are supplied as literal fixtures
 * because the instruments that would produce them are frozen negative evidence.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initStore, putObservation, listObservations, appendEvent, readEvents, type StoreLayout } from '../core/state/store.js';
import { foldRepairs, foldProhibitions } from '../core/architecture/repair-memory.js';
import { runSpine } from '../core/convergence/controller.js';
import { NOTHING_EARNED, type Gates } from '../core/convergence/state-machine.js';
import { assertNotCertification, applyToHypotheses, checkSpec, type ProbeResult } from '../core/convergence/probe.js';
import { compare } from '../core/comparison/compare.js';
import { resolvePromotion } from '../core/convergence/promotion.js';
import type { Observation } from '../core/measurement/observation.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';
import { A_BINDING } from './fixtures.js';
import { observeRuntime } from '../core/runtime/binding.js';

const store = (): StoreLayout => {
  const L = { root: mkdtempSync(join(tmpdir(), 'atelier-loop-')), skillName: 'my-voice' };
  initStore(L); return L;
};
const inv = (id: string, ctx: string, matched = true): InvocationRecord => ({
  invocationId: id, skillName: 'my-voice', standardVersionHash: 'sv1', skillVersionHash: 'k1',
  architectureHash: 'a1', servedPackageHash: 'p1', runtimeBinding: A_BINDING, observedRuntime: observeRuntime(A_BINDING, 'test-model', '2026-01-01T00:00:00.000Z'),
  invocationSurface: 'ATELIER_CLI', request: { resolvedTaskHash: 'th', servedTaskHash: 'th', source: 'POSITIONAL' }, provenance: 'ORGANIC_USE', inputHash: ctx, outputHash: 'o',
  at: '2026-08-22T00:00:00Z',
  delivery: { expectedPackageHash: 'p1', servedPackageHash: matched ? 'p1' : 'pX', matched, servedFiles: [], outputContract: null },
  input: 'task', output: 'out' });
const ob = (o: Partial<Observation>): Observation => ({
  requirementId: 'g1', domain: 'BEHAVIOR', contextId: 'c1', invocationId: 'i1', generationIndex: 0,
  verdict: 'VIOLATED', producer: 'expert', producerVersion: '1', authority: 'HUMAN',
  evidence: null, at: '2026-08-22T00:00:00Z', ...o });

const spine = (L: StoreLayout, invs: InvocationRecord[], gates: Gates = NOTHING_EARNED, over = {}) =>
  runSpine({ requirementId: 'g1', invocations: invs, observations: listObservations(L),
    repairs: foldRepairs(readEvents(L)), prohibitions: foldProhibitions(readEvents(L)),
    gates, currentCarrier: 'PROSE', nextCarrier: 'SELF_CHECK', ...over });

const diffs = (n: number, delta: number) =>
  Array.from({ length: n }, (_, i) => ({ contextId: `c${i}`, delta }));

const IDENTITY = { incumbentStandardHash: 'sv1', candidateStandardHash: 'sv1',
  evaluatedPackageHash: 'pkgC', candidatePackageHash: 'pkgC', deliveryValid: true,
  deterministicRegression: false };

describe('the full lifecycle runs over a real store', () => {
  it('WITNESS: use → evidence → symptom → diagnosis → hypothesis → need → action → comparison → decision', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));

    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')], NOTHING_EARNED, {
      differences: diffs(4, 0.4), generationsPerContext: 3, worthwhile: 0.2,
      promotionEvidence: IDENTITY, candidateEvaluated: true });

    expect(s.evidence.independentContexts).toBe(2);        // aggregation
    expect(s.symptom.kind).toBe('RECURRENT_MISS');         // symptom
    expect(s.route).toBe('IMPLEMENTATION_MISS');           // diagnosis
    expect(s.hypothesis).not.toBeNull();                   // falsifiable hypothesis
    expect(s.hypothesis!.disconfirmedBy.length).toBeGreaterThan(10);
    expect(s.needs.length).toBeGreaterThan(0);             // evidence need
    expect(s.action.kind).toBeTruthy();                    // next action
    expect(s.comparison).not.toBeNull();                   // comparison
    expect(s.promotion).not.toBeNull();                    // promotion decision
    expect(s.decision.terminal).toBeTruthy();              // convergence state
  });

  it('13.1 one miss can form a candidate but cannot promote', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    const s = spine(L, [inv('i1', 'cA')]);
    expect(s.action.kind).toBe('FORM_REPAIR_CANDIDATE');
    expect(s.action.eligibility).toBe('CANDIDATE_ELIGIBLE');
    expect(s.decision.terminal).not.toBe('PROMOTE');
  });

  it('13.2 recurrence across independent contexts strengthens evidence', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    expect(spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]).action.eligibility).toBe('PROMOTION_ELIGIBLE');
  });

  it('13.3 repeated generations in one context do not inflate n', () => {
    const L = store();
    for (let i = 0; i < 9; i++) putObservation(L, ob({ contextId: 'cA', invocationId: `i${i}`, generationIndex: i }));
    const s = spine(L, [inv('i0', 'cA')]);
    expect(s.evidence.observations).toBe(9);
    expect(s.evidence.independentContexts).toBe(1);
    expect(s.decision.terminal).toBe('UNDERPOWERED');
    // and the comparison layer agrees, independently
    const c = compare({ differences: diffs(2, 0.5), worthwhile: 0.1, generationsPerContext: 20 });
    expect(c.verdict).toBe('UNDERPOWERED');
    expect(c.observations).toBe(40);
    expect(c.independentContexts).toBe(2);
  });

  it('13.4 a DEV probe changes a hypothesis but cannot certify', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    const base = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    const two = [base.hypothesis!, { ...base.hypothesis!, failingMechanism: 'grounding failure' }];
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')], NOTHING_EARNED, { competingHypotheses: two });

    expect(s.action.kind).toBe('RUN_DEV_PROBE');
    expect(s.probeSpec).not.toBeNull();
    expect(checkSpec(s.probeSpec!)).toHaveLength(0);
    expect(s.probeSpec!.evidenceClass).toBe('DEV_PROBE');
    expect(s.probeSpec!.provenance).toBe('OPTIMIZATION_CONTEXT');

    // it MAY narrow the search
    const result: ProbeResult = { probeId: s.probeSpec!.probeId, evidenceClass: 'DEV_PROBE',
      provenance: 'OPTIMIZATION_CONTEXT', survived: two[0].failingMechanism,
      eliminated: ['grounding failure'], manipulationVerified: true, at: 'now' };
    const after = applyToHypotheses(two, result);
    expect(after.remaining).toHaveLength(1);
    expect(after.why).toContain('says nothing about whether the surviving one generalises');

    // and it may NEVER certify
    expect(() => { assertNotCertification(result); }).toThrow(/may never establish that the result generalises/);
  });

  it('13.4b a probe whose arms did not actually differ eliminates nothing', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    const base = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    const two = [base.hypothesis!, { ...base.hypothesis!, failingMechanism: 'grounding failure' }];
    const bad: ProbeResult = { probeId: 'p', evidenceClass: 'DEV_PROBE', provenance: 'OPTIMIZATION_CONTEXT',
      survived: null, eliminated: ['grounding failure'], manipulationVerified: false, at: 'now' };
    const after = applyToHypotheses(two, bad);
    expect(after.remaining).toHaveLength(2);
    expect(after.why).toContain('the answer is about something else');
  });

  it('13.5 a failed prior repair changes future search', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    const before = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]).action.kind;
    appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', skillName: 'my-voice', requirementId: 'g1',
      from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 's', candidateSkillVersionHash: 'c1',
      evidenceBasis: { missContexts: 9, invocationIds: [] }, at: '2026-08-01' });
    appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: 'r1', outcome: 'REJECTED',
      evaluationBasis: { generations: 9, instrument: 'HUMAN_EYE', orderInvariant: null }, at: '2026-08-02', note: 'nagging' });
    const after = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    expect(before).toBe('FORM_REPAIR_CANDIDATE');
    expect(after.hypothesis).toBeNull();
    expect(after.decision.terminal).toBe('NO_LEGAL_REPAIR');
  });

  it('13.6 delivery failure stops semantic reasoning', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB', false)]);
    expect(s.route).toBe('DELIVERY_FAILURE');
    expect(s.hypothesis).toBeNull();
    expect(s.action.kind).toBe('REPAIR_DELIVERY');
  });

  it('13.7 a STANDARD_GAP exits to human authority', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    // no carrier: the requirement is carried by nothing, so no implementation change can reach it
    const s = spine(L, [inv('i1', 'cA')], NOTHING_EARNED, { currentCarrier: undefined, nextCarrier: undefined });
    expect(s.hypothesis).toBeNull();
    expect(['REQUEST_AUTHORITY', 'COLLECT_MORE_CONTEXTS']).toContain(s.action.kind);
  });

  it('13.8 an underpowered comparison returns MORE_EVIDENCE, never PLATEAU', () => {
    // PLATEAU is legal ONLY when the interval EXCLUDES a worthwhile improvement.
    expect(compare({ differences: diffs(2, 0.0), worthwhile: 0.2, generationsPerContext: 5 }).verdict).toBe('UNDERPOWERED');
    const wide = compare({ differences: [{ contextId: 'a', delta: -0.9 }, { contextId: 'b', delta: 0.9 }, { contextId: 'c', delta: 0.1 }],
      worthwhile: 0.2, generationsPerContext: 1 });
    expect(wide.verdict).toBe('INCONCLUSIVE');
    expect(wide.why).toContain('an unmeasured one');
    // and a genuine plateau IS reachable, so the state is real
    const flat = compare({ differences: diffs(6, 0.001), worthwhile: 0.2, generationsPerContext: 1 });
    expect(flat.verdict).toBe('PLATEAU');
    expect(flat.why).toContain('could have seen one and did not');
  });

  it('13.9 unqualified fidelity blocks PROMOTE', () => {
    const d = resolvePromotion({ ...IDENTITY, fidelityAuthority: 'OBSERVE', comparison: 'IMPROVED',
      distinctiveness: 'EARNED', floor: 'NONINFERIOR' });
    expect(d.authority).toBe('HUMAN_GATED');
    expect(d.unmet.join(' ')).toContain('CERTIFY');
  });

  it('13.10 unqualified distinctiveness blocks PROMOTE — even on NONINFERIOR', () => {
    const d = resolvePromotion({ ...IDENTITY, fidelityAuthority: 'CERTIFY', comparison: 'IMPROVED',
      distinctiveness: 'UNQUALIFIED', floor: 'NONINFERIOR' });
    expect(d.authority).toBe('HUMAN_GATED');
    expect(d.unmet.join(' ')).toContain('distinctiveness');
  });

  it('13.11 an all-EARNED fixture reaches PROMOTE — so the gate is real, not a stub', () => {
    const d = resolvePromotion({ ...IDENTITY, fidelityAuthority: 'CERTIFY', comparison: 'IMPROVED',
      distinctiveness: 'EARNED', floor: 'NONINFERIOR' });
    expect(d.authority).toBe('AUTO_PROMOTE');
    expect(d.unmet).toHaveLength(0);
  });

  it('13.12 the exact evaluated candidate must be the exact promoted candidate', () => {
    const d = resolvePromotion({ ...IDENTITY, evaluatedPackageHash: 'pkgA', candidatePackageHash: 'pkgB',
      fidelityAuthority: 'CERTIFY', comparison: 'IMPROVED', distinctiveness: 'EARNED', floor: 'NONINFERIOR' });
    expect(d.authority).toBe('AUTO_REJECT');
    expect(d.why).toContain('it was not this');
  });

  it('13.12b and a standard change under cover of an implementation change is refused', () => {
    const d = resolvePromotion({ ...IDENTITY, candidateStandardHash: 'sv2',
      fidelityAuthority: 'CERTIFY', comparison: 'IMPROVED', distinctiveness: 'EARNED', floor: 'NONINFERIOR' });
    expect(d.authority).toBe('AUTO_REJECT');
    expect(d.why).toContain('what good means');
  });

  it('13.12c a protected regression AUTO_REJECTs — the floor blocks but never promotes', () => {
    const d = resolvePromotion({ ...IDENTITY, fidelityAuthority: 'CERTIFY', comparison: 'IMPROVED',
      distinctiveness: 'EARNED', floor: 'REGRESSION' });
    expect(d.authority).toBe('AUTO_REJECT');
    expect(d.why).toContain('never promote on its own');
  });

  it('13.13 the next iteration starts with prior history, not forgetting it', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', skillName: 'my-voice', requirementId: 'g1',
      from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 's', candidateSkillVersionHash: 'c1',
      evidenceBasis: { missContexts: 1, invocationIds: [] }, at: '2026-08-01' });
    appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: 'r1', outcome: 'REJECTED',
      evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null }, at: '2026-08-02', note: 'nagging' });

    // a fresh spine run, reading only from disk, still knows
    const s = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]);
    expect(s.evidence.repairs).toHaveLength(1);
    expect(s.evidence.repairs[0].note).toBe('nagging');
    // stronger evidence now than the attempt that failed, so it is reconsiderable
    expect(s.hypothesis).not.toBeNull();
    expect(s.hypothesis!.priorAttempts).toHaveLength(1);
  });
});

describe('the three convergence terminals §9 required', () => {
  const L2 = () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1', verdict: 'SATISFIED' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2', verdict: 'SATISFIED' }));
    return L;
  };

  it('TARGET_REACHED only when the evidence COULD have shown a miss', () => {
    const L = L2();   // HUMAN authority, no miss
    expect(spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]).decision.terminal).toBe('TARGET_REACHED');
  });

  it('and an unqualified instrument finding nothing is MORE_EVIDENCE, not TARGET_REACHED', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1', verdict: 'NO_VETO', authority: 'OBSERVE_ONLY', producer: 'v3' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2', verdict: 'NO_VETO', authority: 'OBSERVE_ONLY', producer: 'v3' }));
    const d = spine(L, [inv('i1', 'cA'), inv('i2', 'cB')]).decision;
    expect(d.terminal).toBe('MORE_EVIDENCE');
    expect(d.why).toContain('absence of a finding rather than a finding of absence');
  });

  it('DELIVERY_FAILURE outranks everything semantic', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    expect(spine(L, [inv('i1', 'cA'), inv('i2', 'cB', false)]).decision.terminal).toBe('DELIVERY_FAILURE');
  });

  it('PLATEAU only from a resolved comparison; UNDERPOWERED otherwise', () => {
    const L = store();
    putObservation(L, ob({ contextId: 'cA', invocationId: 'i1' }));
    putObservation(L, ob({ contextId: 'cB', invocationId: 'i2' }));
    const at = (d: { contextId: string; delta: number }[]) =>
      spine(L, [inv('i1', 'cA'), inv('i2', 'cB')], NOTHING_EARNED,
        { differences: d, worthwhile: 0.2, generationsPerContext: 2, candidateEvaluated: true }).decision.terminal;
    expect(at(diffs(6, 0.001))).toBe('PLATEAU');                        // resolution excludes it
    expect(at([{ contextId: 'a', delta: -0.9 }, { contextId: 'b', delta: 0.9 }, { contextId: 'c', delta: 0.1 }]))
      .toBe('UNDERPOWERED');                                            // interval spans the question
    expect(at(diffs(2, 0.5))).toBe('UNDERPOWERED');                     // too few contexts
  });
});
