// tests/atelier-conditional-fidelity.test.ts — POLARITY FIXTURES FOR THE INSTRUMENT THAT REPLACES
// "DID IT VIOLATE ANYTHING".
//
// The endpoint this replaces was measured three times and failed three times: 138 scored outputs, 3
// violations, COMPLETE at 100% for every arm including a base model that won 3 of 46 contexts. It
// rewarded avoiding engagement, because a conditional rule marked N/A cannot be violated and silence
// buys the N/A.
//
// So these fixtures are built to make the old endpoint fail and the new one pass. Every one has a
// known-correct answer, and the instrument must produce it BEFORE any real held-out case is scored.

import { describe, it, expect } from 'vitest';
import {
  classify, contextSuccess, coverage, underCovered, assertNotPooled, summarise, MIN_PER_SIDE,
  type ApplicabilityEntry, type ExpressionEntry, type RequirementMeta, type DecisionRuling,
  type HeldOutCase,
} from '../core/fidelity/conditional-fidelity.js';

const REQ: RequirementMeta[] = [
  { requirementId: 'r1', materiality: 'REQUIRED' },
  { requirementId: 'r2', materiality: 'REQUIRED' },
  { requirementId: 'r3', materiality: 'PREFERRED' },
];
const ok: DecisionRuling = { caseId: 'B1', arm: 'S', generation: 1, decisionCorrect: true, forbiddenTaken: false };
const ap = (r: string, a: 'APPLIES' | 'DOES_NOT_APPLY'): ApplicabilityEntry =>
  ({ caseId: 'B1', requirementId: r, applies: a });
const ex = (r: string, e: 'PRESENT' | 'ABSENT' | 'UNCERTAIN'): ExpressionEntry =>
  ({ caseId: 'B1', requirementId: r, arm: 'S', generation: 1, expressed: e });
const run = (A: ApplicabilityEntry[], E: ExpressionEntry[], d: DecisionRuling = ok) =>
  contextSuccess('B1', 'S', 1, d, REQ, A, E);

describe('the four cells, each fixture with a known answer', () => {
  it('applies + present = SATISFIED', () => { expect(classify('APPLIES', 'PRESENT')).toBe('SATISFIED'); });
  it('applies + absent = MISSED', () => { expect(classify('APPLIES', 'ABSENT')).toBe('MISSED'); });
  it('does not apply + present = FALSE_APPLICATION', () => {
    expect(classify('DOES_NOT_APPLY', 'PRESENT')).toBe('FALSE_APPLICATION');
  });
  it('does not apply + absent = CORRECT_RESTRAINT', () => {
    expect(classify('DOES_NOT_APPLY', 'ABSENT')).toBe('CORRECT_RESTRAINT');
  });
  it('uncertain expression is UNRESOLVED on either side', () => {
    expect(classify('APPLIES', 'UNCERTAIN')).toBe('UNRESOLVED');
    expect(classify('DOES_NOT_APPLY', 'UNCERTAIN')).toBe('UNRESOLVED');
  });
});

describe('THE FIXTURE THE OLD ENDPOINT PASSED AND THIS ONE MUST FAIL', () => {
  it('an output that engages with nothing FAILS, where COMPLETE scored it perfect', () => {
    // Both binding rules apply here and the output does neither. Under "no violations" this was a
    // clean pass, because a scorer looking at silence would have marked them N/A.
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'ABSENT'), ex('r2', 'ABSENT'), ex('r3', 'ABSENT')]);
    expect(o.success).toBe(false);
    expect(o.why).toHaveLength(2);
    expect(o.cells.r1).toBe('MISSED');
  });

  it('and silence is CORRECT when the expert sealed the rules as inapplicable', () => {
    // The same silent output is right here. The difference is not in the output at all — it is that
    // applicability was decided by the expert before the output existed.
    const o = run([ap('r1', 'DOES_NOT_APPLY'), ap('r2', 'DOES_NOT_APPLY'), ap('r3', 'DOES_NOT_APPLY')],
      [ex('r1', 'ABSENT'), ex('r2', 'ABSENT'), ex('r3', 'ABSENT')]);
    expect(o.success).toBe(true);
    expect(o.cells.r1).toBe('CORRECT_RESTRAINT');
  });
});

describe('the caricature failure fails, which one-sided metrics cannot see', () => {
  it('applying a binding rule where it does not belong FAILS', () => {
    const o = run([ap('r1', 'DOES_NOT_APPLY'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'PRESENT'), ex('r2', 'PRESENT'), ex('r3', 'PRESENT')]);
    expect(o.success).toBe(false);
    expect(o.cells.r1).toBe('FALSE_APPLICATION');
    expect(o.why[0]).toContain('applied anyway');
  });

  it('so neither over-applying nor under-applying can win', () => {
    const eager = run([ap('r1', 'DOES_NOT_APPLY'), ap('r2', 'DOES_NOT_APPLY'), ap('r3', 'DOES_NOT_APPLY')],
      [ex('r1', 'PRESENT'), ex('r2', 'PRESENT'), ex('r3', 'PRESENT')]);
    const silent = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'ABSENT'), ex('r2', 'ABSENT'), ex('r3', 'ABSENT')]);
    expect(eager.success).toBe(false);
    expect(silent.success).toBe(false);
  });
});

describe('two simultaneously applicable requirements, and the PREFERRED layer', () => {
  it('both binding rules satisfied plus the correct decision succeeds', () => {
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'PRESENT'), ex('r2', 'PRESENT'), ex('r3', 'ABSENT')]);
    expect(o.success).toBe(true);   // r3 is PREFERRED and missing it does not decide the primary
    expect(o.cells.r3).toBe('MISSED');
  });

  it('one of two binding rules missed still fails', () => {
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'DOES_NOT_APPLY')],
      [ex('r1', 'PRESENT'), ex('r2', 'ABSENT'), ex('r3', 'ABSENT')]);
    expect(o.success).toBe(false);
    expect(o.why).toEqual(['r2: required and applicable, not expressed']);
  });
});

describe('the decision and the forbidden move outrank every requirement', () => {
  it('perfect rule adherence with the wrong decision FAILS', () => {
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'PRESENT'), ex('r2', 'PRESENT'), ex('r3', 'PRESENT')],
      { ...ok, decisionCorrect: false });
    expect(o.success).toBe(false);
    expect(o.why[0]).toBe('the sealed expert decision was not reached');
  });

  it('taking an explicitly forbidden decision FAILS and is reported first', () => {
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'PRESENT'), ex('r2', 'PRESENT'), ex('r3', 'PRESENT')],
      { ...ok, forbiddenTaken: true });
    expect(o.success).toBe(false);
    expect(o.why[0]).toContain('forbidden');
  });

  it('a wrong engagement level fails, and an absent one is not scored', () => {
    const A = [ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')];
    const E = [ex('r1', 'PRESENT'), ex('r2', 'PRESENT'), ex('r3', 'PRESENT')];
    expect(run(A, E, { ...ok, engagementCorrect: false }).success).toBe(false);
    expect(run(A, E, { ...ok, engagementCorrect: true }).success).toBe(true);
    expect(run(A, E, ok).success).toBe(true);          // undefined = not observable, not scored
  });
});

describe('unscorable states are refused rather than guessed', () => {
  it('a requirement with no sealed applicability is reported unscorable, never inferred', () => {
    const o = run([ap('r1', 'APPLIES'), ap('r3', 'APPLIES')], [ex('r1', 'PRESENT')]);
    expect(o.why.some((w) => w.includes('NO SEALED APPLICABILITY'))).toBe(true);
    expect(o.cells.r2).toBeUndefined();
  });

  it('an undetermined binding expression fails rather than passing by default', () => {
    // Otherwise ambiguity accrues to whichever arm writes the most equivocal prose.
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')],
      [ex('r1', 'UNCERTAIN'), ex('r2', 'PRESENT'), ex('r3', 'PRESENT')]);
    expect(o.success).toBe(false);
    expect(o.cells.r1).toBe('UNRESOLVED');
  });

  it('a missing expression is UNCERTAIN, not a pass', () => {
    const o = run([ap('r1', 'APPLIES'), ap('r2', 'APPLIES'), ap('r3', 'APPLIES')], []);
    expect(o.success).toBe(false);
  });
});

describe('coverage is computed before generation, and one-sided coverage is flagged', () => {
  const many = (r: string, n: number, a: 'APPLIES' | 'DOES_NOT_APPLY'): ApplicabilityEntry[] =>
    Array.from({ length: n }, (_, i) => ({ caseId: `B${i}`, requirementId: r, applies: a }));

  it('counts both sides per requirement', () => {
    const c = coverage(REQ, [...many('r1', 4, 'APPLIES'), ...many('r1', 5, 'DOES_NOT_APPLY')]);
    expect(c[0]).toMatchObject({ requirementId: 'r1', applies: 4, doesNotApply: 5, required: true });
  });

  it('flags a binding rule with no cases at all — the exact failure that shipped undetected', () => {
    const c = coverage(REQ, many('r1', 6, 'APPLIES'));
    const bad = underCovered(c).map((x) => x.requirementId);
    expect(bad).toContain('r2');   // zero cases either side
    expect(bad).toContain('r1');   // six positives, zero negatives: a boundary needs both
  });

  it('does not flag a PREFERRED rule', () => {
    expect(underCovered(coverage(REQ, [])).some((x) => x.requirementId === 'r3')).toBe(false);
  });

  it('passes a binding rule with enough on both sides', () => {
    const c = coverage([REQ[0]], [...many('r1', MIN_PER_SIDE, 'APPLIES'), ...many('r1', MIN_PER_SIDE, 'DOES_NOT_APPLY')]);
    expect(underCovered(c)).toHaveLength(0);
  });
});

describe('B and C may not be pooled', () => {
  const c = (id: string, set: 'B_NATURAL' | 'C_TARGETED'): HeldOutCase => ({
    caseId: id, context: '', expectedDecision: '', expectedRationale: '', forbiddenDecisions: [],
    provenance: 'p', clusterId: 'k', set });

  it('refuses a mixed set', () => {
    expect(() => { assertNotPooled([c('B1', 'B_NATURAL'), c('C1', 'C_TARGETED')]); })
      .toThrow(/POOLING REFUSED/);
  });
  it('allows either set alone', () => {
    expect(() => { assertNotPooled([c('B1', 'B_NATURAL'), c('B2', 'B_NATURAL')]); }).not.toThrow();
    expect(() => { assertNotPooled([c('C1', 'C_TARGETED')]); }).not.toThrow();
  });
});

describe('the context is the unit and generations are nested', () => {
  it('reports the per-context success distribution, never a flat n', () => {
    const o = (id: string, g: number, ok: boolean) =>
      ({ caseId: id, arm: 'S', generation: g, success: ok, why: [], cells: {} });
    const r = summarise([
      o('B1', 1, true), o('B1', 2, true), o('B1', 3, true),
      o('B2', 1, true), o('B2', 2, false), o('B2', 3, true),
      o('B3', 1, false), o('B3', 2, false), o('B3', 3, false),
    ], 'S', 3);
    expect(r.contexts).toBe(3);                 // NOT 9
    expect(r.majoritySuccess).toBe(2);
    expect(r.byRate).toEqual({ '3/3': 1, '2/3': 1, '0/3': 1 });
  });
});
