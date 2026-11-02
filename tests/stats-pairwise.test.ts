import { describe, expect, it } from 'vitest';
import { fitBradleyTerry, winProbability } from '../core/stats/pairwise.js';

describe('fitBradleyTerry', () => {
  it('two items, 3 wins to 1: strengths 3:1, so 0.75 and 0.25', () => {
    const f = fitBradleyTerry([[0, 3], [1, 0]]);
    expect(f.converged).toBe(true);
    expect(f.strengths[0]).toBeCloseTo(0.75, 8); expect(f.strengths[1]).toBeCloseTo(0.25, 8);
  });
  it('three items whose wins match strengths 4:2:1 exactly recover 4/7, 2/7, 1/7', () => {
    // A-B 3 games (A wins 3*4/6 = 2), A-C 5 games (A wins 5*4/5 = 4), B-C 3 games (B wins 3*2/3 = 2): every pair at
    // its expected count, so the likelihood equations hold at (4, 2, 1)
    const f = fitBradleyTerry([[0, 2, 4], [1, 0, 2], [1, 1, 0]]);
    expect(f.strengths[0]).toBeCloseTo(4 / 7, 6); expect(f.strengths[1]).toBeCloseTo(2 / 7, 6); expect(f.strengths[2]).toBeCloseTo(1 / 7, 6);
  });
  it('a balanced cycle gives equal strengths', () => {
    const f = fitBradleyTerry([[0, 1, 0], [0, 0, 1], [1, 0, 0]]);
    for (const s of f.strengths) expect(s).toBeCloseTo(1 / 3, 8);
  });
  it('an item with no wins goes to 0; a prior keeps it positive', () => {
    expect(fitBradleyTerry([[0, 2], [0, 0]]).strengths[1]).toBeCloseTo(0, 6);
    // prior 2 adds one virtual win each way: 3 to 1, so 0.75 and 0.25
    const f = fitBradleyTerry([[0, 2], [0, 0]], { prior: 2 });
    expect(f.strengths[0]).toBeCloseTo(0.75, 8); expect(f.strengths[1]).toBeCloseTo(0.25, 8);
  });
  it('handles no items, and winProbability reads the strengths', () => {
    expect(fitBradleyTerry([]).strengths).toEqual([]);
    expect(winProbability(0.75, 0.25)).toBe(0.75);
    expect(winProbability(0, 0)).toBe(0.5);
  });
});
