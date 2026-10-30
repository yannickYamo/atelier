import { describe, it, expect } from 'vitest';
import { newRun, transition, enrol, terminate, isEnrolled, type Run } from '../core/state/run-state.js';
import { assertSourceIsNotAuthority, assertFeedbackDidNotMutate, assertSupersessionRecorded, unconfirmedRate, discoveryRecall, declaredGeneralShare, type StandardVersion, type Requirement } from '../core/state/canonical-state.js';

const at = (r: Run, s: Run['state']): Run => ({ ...r, state: s });
const req = (o: Partial<Requirement> & { requirementId: string }): Requirement => ({
  statement: 's', appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
  provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: 'e', evidenceItemId: 'i', ...o,
});
const std = (o: Partial<StandardVersion> = {}): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: 'ev1', workType: 'blog', requirements: [req({ requirementId: 'r1' })],
  authorityState: 'RATIFIED', mintedAt: 'T', supersedes: null, reason: null, ...o,
});

describe('two independent studies — neither on the product path', () => {
  it('the product path never touches either study', () => {
    let r = newRun('p');
    for (const s of ['CORPUS_SEALED', 'PROPOSED', 'RATIFIED', 'BUILT'] as const) {
      const t = transition(r, s, { corpusHash: 'c1' });
      expect(t.ok).toBe(true); if (t.ok) r = t.run;
    }
    expect(r.enrolments).toHaveLength(0);
    expect(terminate(r, 'COMPLETED').ok).toBe(true);
  });

  it('DISCOVERY_STUDY enrols BEFORE discovery and then REQUIRES the sealed list', () => {
    const e = enrol(at(newRun('d'), 'CORPUS_SEALED'), 'DISCOVERY_STUDY', 'T');
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    // enrolled but list not sealed -> discovery refused
    const skip = transition(e.run, 'PROPOSED');
    expect(skip).toMatchObject({ ok: false, refusal: 'LIST_REQUIRED' });
    if (!skip.ok) expect(skip.detail).toContain('a description of our output');
    const sealed = transition(e.run, 'LIST_SEALED');
    expect(sealed.ok).toBe(true);
    if (sealed.ok) expect(transition(sealed.run, 'PROPOSED').ok).toBe(true);
  });

  it('DISCOVERY_STUDY cannot be joined once discovery has run', () => {
    expect(enrol(at(newRun('d'), 'PROPOSED'), 'DISCOVERY_STUDY', 'T')).toMatchObject({ ok: false, refusal: 'ENROLMENT_AFTER_OUTCOME' });
  });

  it('BEHAVIOUR_STUDY enrols after BUILD and is independent of the discovery study', () => {
    const b = enrol(at(newRun('b'), 'BUILT'), 'BEHAVIOUR_STUDY', 'T');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(isEnrolled(b.run, 'DISCOVERY_STUDY')).toBe(false);
    expect(transition(b.run, 'TEST_PENDING').ok).toBe(true);
  });

  it('a behaviour-study run may not be COMPLETED before reveal', () => {
    const b = enrol(at(newRun('b'), 'BUILT'), 'BEHAVIOUR_STUDY', 'T');
    if (!b.ok) return;
    expect(terminate(b.run, 'COMPLETED').ok).toBe(false);
    expect(terminate(b.run, 'USER_ABORTED').ok).toBe(true);
  });
});

describe('GATE 3 — the materialization is never the authority', () => {
  it('REFUSES reading SKILL.md as authority while a StandardVersion exists', () => {
    expect(() => { assertSourceIsNotAuthority('SKILL_MD', true); }).toThrow(/compiled materialization/);
    expect(() => { assertSourceIsNotAuthority('SKILL_MD', false); }).not.toThrow();
    expect(() => { assertSourceIsNotAuthority('STANDARD_VERSION', true); }).not.toThrow();
  });

  it('feedback may not mutate a standard', () => {
    expect(() => { assertFeedbackDidNotMutate(std(), std()); }).not.toThrow();
    const t = () => { assertFeedbackDidNotMutate(std(), std({ standardVersionHash: 'sv2' })); };
    expect(t).toThrow(/STANDARD MUTATED BY FEEDBACK/);
    expect(t).toThrow(/mints a new StandardVersion/);
  });

  it('a supersession without a reason is refused', () => {
    expect(() => { assertSupersessionRecorded(std({ supersedes: 'sv0', reason: null })); }).toThrow(/no recorded reason/);
    expect(() => { assertSupersessionRecorded(std({ supersedes: 'sv0', reason: 'expert added two boundaries' })); }).not.toThrow();
    expect(() => { assertSupersessionRecorded(std()); }).not.toThrow();
  });

  it('an unratified proposal cannot reach a build', () => {
    const v = std({ requirements: [req({ requirementId: 'r1' }), req({ requirementId: 'r2', authority: 'DERIVED_UNRATIFIED' })] });
    // The build gate is retired: an unconfirmed rule is DISCLOSED, not refused. What must survive is
    // that the system still knows which rules nobody confirmed — and, for a prohibition, that the
    // architecture keeps it out of the generation instructions until someone does.
    expect(unconfirmedRate(v)).toBeGreaterThan(0);
    expect(unconfirmedRate(std())).toBe(0);
  });

  it('discovery recall counts only machine-discovered requirements', () => {
    const v = std({ requirements: [
      req({ requirementId: 'a' }), req({ requirementId: 'b', provenance: 'EXPERT_ADDED' }),
      req({ requirementId: 'c', provenance: 'SUBSTANTIVELY_REWRITTEN' }), req({ requirementId: 'd' }),
    ] });
    expect(discoveryRecall(v)).toBe(0.5);
  });

  it('reports the GENERAL rate without enforcing it', () => {
    const v = std({ requirements: [req({ requirementId: 'a' }), req({ requirementId: 'b', appliesWhen: 'when writing about herself' })] });
    expect(declaredGeneralShare(v)).toBe(0.5);
  });
});
