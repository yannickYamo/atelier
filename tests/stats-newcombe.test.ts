// tests/stats-newcombe.test.ts — A DIFFERENCE OF PROPORTIONS WITH AN INTERVAL THAT STAYS INSIDE THE POSSIBLE.
import { describe, it, expect } from 'vitest';
import { newcombe } from '../core/stats/wilson.js';

describe('Newcombe score interval', () => {
  it("matches the published example (Newcombe 1998, 56/70 vs 48/80): 0.0524 to 0.3339", () => {
    const r = newcombe(56, 70, 48, 80);
    expect(r.diff).toBeCloseTo(0.2, 6);
    expect(r.lo).toBeCloseTo(0.0524, 3);
    expect(r.hi).toBeCloseTo(0.3339, 3);
  });
  it('19/20 vs 7/20 stays under 1 where the normal approximation reached 0.83 on a difference that cannot pass 0.65 + 0.35', () => {
    const r = newcombe(19, 20, 7, 20);
    expect(r.hi).toBeLessThan(0.83);
    expect(r.lo).toBeGreaterThan(0.3);
    expect(r.hi).toBeLessThanOrEqual(1);
  });
  it('10/10 vs 4/10: lower bound above 0.2', () => {
    const r = newcombe(10, 10, 4, 10);
    expect(r.lo).toBeGreaterThan(0.2);
    expect(r.hi).toBeLessThanOrEqual(1);
  });
});
