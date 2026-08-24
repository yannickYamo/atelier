/**
 * The v3 CONTRACT — semantics made checkable. No instrument here, no prompt, no inference.
 *
 * The load-bearing assertion is that NO_VETO cannot express satisfaction. Everything else guards the
 * ways an unpaid claim could sneak in beside a verdict.
 */
import { describe, it, expect } from 'vitest';
import {
  checkContract, meansSatisfied, admitsToVetoSensor, NO_VETO_MEANING,
  assertRequirementAuthorised, assertSpanIsReal,
  type VetoObservation,
} from '../core/fidelity/veto-contract.js';

/** g11 and g7 as frozen, so the regression tests bite against the real statements. */
const G11 = 'I do not end sections with inspirational or aspirational language; instead I conclude with concrete implications or the next logical question the analysis raises.';
const G7 = 'I do not rely on analogies to other companies or industries; instead I build arguments from first principles about the specific system dynamics at play.';
const OUTPUT = 'The pool saturates and the future is bright for teams who instrument it.';
const AGAINST = { requirementStatement: G11, output: OUTPUT };

const veto = (o: Partial<VetoObservation['evidence'] & object> = {}): VetoObservation => ({
  verdict: 'VETO', escalationReason: null,
  evidence: { requirementId: 'g11', authorisingClause: 'I do not end sections with inspirational or aspirational language',
    evidenceType: 'PRESENCE', outputSpan: 'the future is bright',
    locus: null, rationale: 'closes on aspirational language', ...o },
});

describe('the contract has no way to say the rule holds', () => {
  it('NO_VETO never means SATISFIED, and the function that says so returns false', () => {
    expect(meansSatisfied('NO_VETO')).toBe(false);
    expect(meansSatisfied('VETO')).toBe(false);
    expect(NO_VETO_MEANING).toContain('NOT that the rule holds');
  });

  it('NO_VETO carries nothing — evidence attached to it would read as a positive finding', () => {
    const bad = checkContract({ verdict: 'NO_VETO', evidence: veto().evidence, escalationReason: null });
    expect(bad).toHaveLength(1);
    expect(bad[0].problem).toContain('positive finding');
  });

  it('a clean NO_VETO is legal and silent', () => {
    expect(checkContract({ verdict: 'NO_VETO', evidence: null, escalationReason: null })).toHaveLength(0);
  });
});

describe('a VETO must be paid for in evidence', () => {
  it('a bare VETO is an assertion, not an observation', () => {
    const bad = checkContract({ verdict: 'VETO', evidence: null, escalationReason: null });
    expect(bad[0].problem).toContain('nobody can audit');
  });

  it('PRESENCE must point at the text that breaks the rule', () => {
    expect(checkContract(veto({ outputSpan: '  ' }), AGAINST)[0].field).toBe('outputSpan');
  });

  it('OMISSION must NOT be quoted — a span proving absence is invented or irrelevant', () => {
    // This is where a wording proxy gets rebuilt inside a semantic sensor.
    const bad = checkContract(veto({ evidenceType: 'OMISSION', outputSpan: 'no concrete example here', locus: 'the opening' }), AGAINST);
    expect(bad[0].field).toBe('outputSpan');
    expect(bad[0].problem).toContain('invented');
  });

  it('OMISSION must name WHERE the required thing would have appeared', () => {
    const bad = checkContract(veto({ evidenceType: 'OMISSION', outputSpan: null, locus: null }), AGAINST);
    expect(bad[0].field).toBe('locus');
    expect(bad[0].problem).toContain('unfalsifiable');
  });

  it('a well-formed OMISSION veto is legal', () => {
    expect(checkContract(veto({ evidenceType: 'OMISSION', outputSpan: null,
      locus: 'the first two paragraphs, before the system view is introduced' }), AGAINST)).toHaveLength(0);
  });

  it('every veto must say why THIS evidence breaks THIS rule', () => {
    expect(checkContract(veto({ rationale: '' }), AGAINST).some((b) => b.field === 'rationale')).toBe(true);
  });
});

describe('REGRESSION: a VETO must be authorised by the frozen requirement, not the task brief', () => {
  // THE WITNESSED ERROR. In DEV the sensor vetoed under g7 — a rule about analogies — because the
  // output was "only approximately 80 words, falling far short of the required 400-word analysis
  // section". The criterion came from the TASK BRIEF. It was not a hallucination: it observed a real
  // property and enforced it under a requirement that says nothing about length.
  it('the exact g7 / 400-word error class is caught', () => {
    const leaked = checkContract({
      verdict: 'VETO', escalationReason: null,
      evidence: { requirementId: 'g7',
        authorisingClause: 'the task explicitly calls for a 400-word analysis section',
        evidenceType: 'OMISSION', outputSpan: null, locus: 'the entire analysis section',
        rationale: 'the output is only approximately 80 words, falling far short of the required 400-word analysis section' },
    }, { requirementStatement: G7, output: 'short output' });
    const hit = leaked.find((b) => b.field === 'authorisingClause');
    expect(hit).toBeDefined();
    expect(hit!.problem).toContain('task-brief leak, caught');
  });

  it('a clause genuinely from the requirement passes', () => {
    expect(assertRequirementAuthorised('I do not rely on analogies to other companies or industries', G7)).toBeNull();
  });

  it('a paraphrase does not pass — the clause must be the requirement\'s own words', () => {
    expect(assertRequirementAuthorised('no comparisons to other firms allowed', G7)).not.toBeNull();
  });

  it('a fragment too short to identify a clause does not pass', () => {
    expect(assertRequirementAuthorised('I do', G7)!.problem).toContain('too short');
  });

  it('and a fabricated quotation is caught separately', () => {
    // Found while closing the first hole: nothing checked that outputSpan was real, so an invented
    // quote satisfied every other rule in the contract.
    expect(assertSpanIsReal('a sentence nobody wrote', OUTPUT)).not.toBeNull();
    expect(assertSpanIsReal('the future is bright', OUTPUT)).toBeNull();
  });

  it('checking WITHOUT the requirement and output says so rather than passing quietly', () => {
    const weak = checkContract(veto());
    expect(weak.some((b) => b.field === 'against')).toBe(true);
  });
});

describe('ESCALATE is an answer, not silence', () => {
  it('it must say what could not be decided', () => {
    const bad = checkContract({ verdict: 'ESCALATE', evidence: null, escalationReason: '' });
    expect(bad[0].problem).toContain('indistinguishable from silence');
  });

  it('it carries no violation evidence — an undecided case must not accumulate as a block', () => {
    const bad = checkContract({ verdict: 'ESCALATE', evidence: veto().evidence, escalationReason: 'two readings disagree' });
    expect(bad.some((b) => b.field === 'evidence')).toBe(true);
  });

  it('a well-formed ESCALATE is legal', () => {
    expect(checkContract({ verdict: 'ESCALATE', evidence: null,
      escalationReason: 'the rule does not state whether a rhetorical question counts as aspirational' })).toHaveLength(0);
  });
});

describe('applicability is decided elsewhere, and the sensor may not revise it', () => {
  it('only APPLIES enters the sensor', () => {
    expect(admitsToVetoSensor('APPLIES').admit).toBe(true);
    expect(admitsToVetoSensor('DOES_NOT_APPLY').admit).toBe(false);
  });

  it('AMBIGUOUS is terminal — never coerced to either side', () => {
    const r = admitsToVetoSensor('AMBIGUOUS');
    expect(r.admit).toBe(false);
    expect(r.why).toContain('never be read as either');
  });
});
