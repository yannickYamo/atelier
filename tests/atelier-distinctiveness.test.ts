/**
 * The recovered anti-collapse floor: mechanism ported, qualification NOT inherited.
 *
 * The assertions that carry the pass are the refusals — no default contract, no EARNED without a
 * measurement on this estimand, and no silent pass when a protected dimension went unscored.
 */
import { describe, it, expect } from 'vitest';
import {
  dimensionVerdict, evaluateQualityFloor, requireFloorContract, gateState,
  type QualityFloorContract, type FrozenBaselineEntry,
} from '../core/distinctiveness/floor.js';

const CONTRACT: QualityFloorContract = {
  instrument: 'scoreDimensionByPolicy',
  dimensions: {
    voice: { nonInferiorityMargin: 0.25, gateRole: 'ENFORCE', rationale: 'authored for this test' },
  },
};
const frozen = (scores: number[]): FrozenBaselineEntry => ({
  perFireScores: { voice: scores }, model: 'm', capturedAt: '2026-01-01', hash: 'h',
} as unknown as FrozenBaselineEntry);

describe('the mechanism transferred', () => {
  it('INCONCLUSIVE is first-class and reachable — computed, not elicited', () => {
    // The point the whole observer arc kept circling: an interval that spans the margin IS the
    // abstention. No model was asked whether it felt sure.
    const v = dimensionVerdict({ mean: 3.0, sd: 1.2, n: 4 }, { mean: 3.1, sd: 1.2, n: 4 }, 0.25);
    expect(v.verdict).toBe('INCONCLUSIVE');
  });

  it('a clear regression is called, and a clear hold is called', () => {
    expect(dimensionVerdict({ mean: 1.0, sd: 0.05, n: 12 }, { mean: 4.0, sd: 0.05, n: 12 }, 0.25).verdict).toBe('REGRESSION');
    expect(dimensionVerdict({ mean: 4.0, sd: 0.05, n: 12 }, { mean: 4.0, sd: 0.05, n: 12 }, 0.25).verdict).toBe('NONINFERIOR');
  });

  it('F2b: a quality-NEUTRAL candidate is not disqualified', () => {
    // The historical boolean `candidateMean < frozenMean` at tolerance 0 was a coin flip under a
    // true null. A neutral candidate that happens to score a hair lower must not read as regression.
    const v = dimensionVerdict({ mean: 3.98, sd: 0.4, n: 6 }, { mean: 4.0, sd: 0.4, n: 6 }, 0.25);
    expect(v.verdict).not.toBe('REGRESSION');
  });

  it('F1: an unscored protected dimension THROWS rather than reading as "floor held"', () => {
    expect(() => evaluateQualityFloor({}, frozen([4, 4, 4]), CONTRACT)).toThrow();
  });
});

describe('the qualification did NOT transfer', () => {
  it('there is no default contract — another product\'s ratified margins cannot be inherited', () => {
    expect(() => requireFloorContract(null)).toThrow(/cannot be defaulted/);
    expect(() => requireFloorContract({ instrument: 'scoreDimensionByPolicy', dimensions: {} })).toThrow();
  });

  it('the gate reports UNQUALIFIED, not MISSING — a real state change, not an earned one', () => {
    expect(gateState(null, false, null).state).toBe('UNQUALIFIED');
    expect(gateState(null, false, null).why).toContain('the mechanism exists');
  });

  it('a contract and a baseline are still not EARNED — apparatus is not measurement', () => {
    const g = gateState(CONTRACT, true, null);
    expect(g.state).toBe('UNQUALIFIED');
    expect(g.why).toContain('having the apparatus is not the measurement');
  });

  it('EARNED requires a false-alarm rate measured on THIS estimand, and is reachable', () => {
    const g = gateState(CONTRACT, true, {
      estimand: 'anti-collapse on my-voice, carrier escalations', falseAlarmUpper95: 0.12,
      independentContexts: 22, decidedAt: '2026-08-22' });
    expect(g.state).toBe('EARNED');
    expect(g.why).toContain('anti-collapse on my-voice');
  });

  it('each intermediate state says what is missing, so the next step is named', () => {
    expect(gateState(CONTRACT, false, null).why).toContain('nothing has been scored and frozen');
  });
});
