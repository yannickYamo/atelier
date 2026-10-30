// tests/atelier-break-rates.test.ts — HOW OFTEN EACH RULE BREAKS, PER VERSION (internal).
//
// The loop keeps each measured rule's first-draft break rate per skill version, and `tend --auto` undoes
// an install of its own that made a rule break clearly more often. These pin the counting and the rule
// for "clearly more often"; the person is never shown the rates.

import { describe, it, expect } from 'vitest';
import { ruleBreakRates, regressedRules, REGRESSION_MIN_RUNS } from '../core/mining/recurrence.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';

const use = (skillVersionHash: string, at: string, broken: string[], standardVersionHash = 'S'): InvocationRecord =>
  ({ skillVersionHash, standardVersionHash, at, repair: broken.length ? { passes: 1, violatedBefore: broken, violatedAfter: [], originalOutputHash: 'h', why: '' } : null } as unknown as InvocationRecord);

describe('break rates per version', () => {
  const uses = [
    use('v1', '2026-01-01', ['r1']), use('v1', '2026-01-02', []), use('v1', '2026-01-03', []), use('v1', '2026-01-04', ['r2']),
    use('v2', '2026-02-01', ['r1']), use('v2', '2026-02-02', ['r1']), use('v2', '2026-02-03', ['r1', 'r2']),
    use('v9', '2026-03-01', ['r1'], 'OTHER'),
  ];
  const rates = ruleBreakRates(uses, 'S');

  it('counts first-draft breaks per version, in the order versions were first used, on one standard', () => {
    expect(rates.map((r) => r.skillVersionHash)).toEqual(['v1', 'v2']);
    expect(rates[0]).toMatchObject({ runs: 4, broken: { r1: 1, r2: 1 } });
    expect(rates[1]).toMatchObject({ runs: 3, broken: { r1: 3, r2: 1 } });
  });

  it('a rule that breaks clearly more often on the newer version is a regression', () => {
    expect(regressedRules(rates, 'v2', 'v1')).toEqual([{ requirementId: 'r1', before: 0.25, after: 1 }]);
  });

  it('a small rise is not', () => {
    const small = ruleBreakRates([use('a', '1', ['r']), use('a', '2', []), use('a', '3', []), use('b', '4', ['r']), use('b', '5', []), use('b', '6', [])]);
    expect(regressedRules(small, 'b', 'a')).toEqual([]);
  });

  it(`too few uses of either version (under ${REGRESSION_MIN_RUNS}) compare nothing`, () => {
    const few = ruleBreakRates([use('a', '1', []), use('a', '2', []), use('a', '3', []), use('b', '4', ['r']), use('b', '5', ['r'])]);
    expect(regressedRules(few, 'b', 'a')).toEqual([]);
  });
});
