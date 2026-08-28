// The two guards that stand between a study and an unreadable result.
import { describe, it, expect } from 'vitest';
import { budgetFromProbe, budgetFromOverride, describeBudget, CensoredProbe } from '../core/contract/budget-probe.js';
import { headroomOf, measurable, unmeasurableReason, screenCandidate, isDegenerateInterval } from '../core/contract/headroom.js';

describe('a budget may not be estimated from a censored sample', () => {
  it('refuses when ANY probe generation was cut off — one is enough', () => {
    // THE EXACT ERROR THIS EXISTS TO STOP. Amendment 2 set max_tokens to 8000 from "worst complete
    // answer 4376", measured on a run capped at 1200 where every long answer had already been cut.
    // Nine clean observations do not launder one censored one: the truncated case is a LOWER BOUND,
    // and the true maximum is unknown and above it.
    const probe = [...Array(9)].map(() => ({ outputTokens: 1000, censored: false }));
    probe.push({ outputTokens: 1200, censored: true });
    expect(() => budgetFromProbe(probe, 1200)).toThrow(CensoredProbe);
    expect(() => budgetFromProbe(probe, 1200)).toThrow(/rerun the PREFLIGHT/);
  });

  it('POLARITY: an uncensored probe yields a budget, with headroom over the largest seen', () => {
    const b = budgetFromProbe([{ outputTokens: 1000, censored: false }, { outputTokens: 4376, censored: false }], 16_000);
    expect(b.basis).toBe('UNCENSORED_PROBE');
    expect(b.observedMaxOutputTokens).toBe(4376);
    expect(b.maxTokens).toBe(8752);
    expect(b.probeTerminationCounts.MAX_TOKENS).toBe(0);
  });

  it('an empty probe is no evidence, not a clean one', () => {
    // "Nothing was censored" is trivially true of zero observations, and would license any budget.
    expect(() => budgetFromProbe([], 16_000)).toThrow(CensoredProbe);
  });

  it('a supplied budget is recorded as supplied, so no report can call it measured', () => {
    const b = budgetFromOverride(8000);
    expect(b.basis).toBe('EXPLICIT_OVERRIDE');
    expect(b.observedMaxOutputTokens).toBeNull();
    expect(describeBudget(b)).toMatch(/supplied, not measured/);
  });
});

describe('measurability has a direction', () => {
  const ceiling = headroomOf(1.0, 8);
  const floor = headroomOf(0.0, 8);

  it('a control at ceiling destroys LIFT but is the ideal baseline for HARM', () => {
    // The coverage endpoint: bare 1.000 in every arm. Reported as a pass; nothing was measured.
    expect(measurable(ceiling, 'LIFT')).toBe(false);
    expect(unmeasurableReason(ceiling, 'LIFT')).toMatch(/UNMEASURABLE_FOR_LIFT/);
    // The restraint endpoint: bare near 1.000 is exactly what let a −0.208 regression be seen.
    expect(measurable(ceiling, 'HARM')).toBe(true);
    expect(unmeasurableReason(ceiling, 'HARM')).toBeNull();
  });

  it('and a control at the floor is the mirror image', () => {
    expect(measurable(floor, 'HARM')).toBe(false);
    expect(measurable(floor, 'LIFT')).toBe(true);
  });

  it('an unmeasurable endpoint is never described as a null result', () => {
    expect(unmeasurableReason(ceiling, 'LIFT')).toMatch(/not a null result/);
  });
});

describe('a candidate behaviour qualifies only when both sides can move', () => {
  const screen = (a: number, r: number) =>
    screenCandidate({ behaviourId: 'b', activation: headroomOf(a, 16), restraint: headroomOf(r, 16) });

  it('rejects the regime that wasted the last study: activation already universal', () => {
    expect(screen(1.0, 1.0).qualifies).toBe(false);
    expect(screen(1.0, 1.0).why).toMatch(/ceiling/);
  });

  it('rejects a control that already over-applies, where false firing is unattributable', () => {
    expect(screen(0.5, 0.4).qualifies).toBe(false);
    expect(screen(0.5, 0.4).why).toMatch(/already over-applies/);
  });

  it('rejects activation at the floor — that measures capability, not compilation', () => {
    expect(screen(0.0, 1.0).qualifies).toBe(false);
  });

  it('ACCEPTS the regime worth studying: room to rise, restraint intact', () => {
    const v = screen(0.45, 0.96);
    expect(v.qualifies).toBe(true);
    expect(v.why).toMatch(/both sides can move/);
  });
});

describe('a zero-width interval is a constant, not a precise estimate', () => {
  it('flags the exact interval the remeasurement reported as a pass', () => {
    expect(isDegenerateInterval(0, 0)).toBe(true);
    expect(isDegenerateInterval(0.083, 0.458)).toBe(false);
  });
});
