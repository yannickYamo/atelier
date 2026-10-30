// tests/atelier-stats.test.ts — THE t DISTRIBUTION HAS ONE OWNER, AND ITS ARITHMETIC IS PINNED.
//
// Two defects motivated this file and neither was visible to the suite.
//
// The interval was 26% too narrow at n=3 — the SMALLEST sample the function admits, and the most
// common one — because a second t-table keyed from df=3 fell back to t(3) where t(2) was needed.
// Nothing asserted the bounds, only the verdicts, and the verdicts happened to be robust there.
//
// And `compare()` divided by one table's value for the .975 quantile and multiplied by another's,
// while the comment above it claimed single ownership of the standard error.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tCrit, sd, mean, welchDiff, sampleFrom } from '../core/stats/t.js';
import { contextClusteredInterval } from '../core/comparison/resolution.js';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
  return [p];
});

describe('the critical values are the published ones', () => {
  it('reads the small-df rows exactly, which is where the error was', () => {
    expect(tCrit(1, 0.975)).toBeCloseTo(12.706, 3);
    expect(tCrit(2, 0.975)).toBeCloseTo(4.303, 3);   // the value the old fallback skipped
    expect(tCrit(3, 0.975)).toBeCloseTo(3.182, 3);   // the value it wrongly returned for df=2
  });

  it('interpolates between rows rather than stepping', () => {
    const t9 = tCrit(9, 0.975);
    expect(t9).toBeLessThan(tCrit(8, 0.975));
    expect(t9).toBeGreaterThan(tCrit(10, 0.975));
  });

  it('reaches the normal quantile in the tail instead of flattening to 2.0', () => {
    // The old fallback returned a flat 2.0 for every df above 25. The table's last row IS the normal
    // quantile, so the limit is exact rather than approached by a constant.
    expect(tCrit(1e9, 0.975)).toBeCloseTo(1.96, 3);
    expect(tCrit(200, 0.975)).toBeLessThan(tCrit(120, 0.975));
  });
});

describe('the clustered interval at the smallest permitted sample', () => {
  it('uses t(2) at n=3, so the interval crosses zero where the bug reported a direction', () => {
    const r = contextClusteredInterval([
      { contextId: 'a', delta: 1 }, { contextId: 'b', delta: 2 }, { contextId: 'c', delta: 3 }]);
    expect(r.df).toBe(2);
    expect(r.mean).toBeCloseTo(2, 6);
    // t(2,.975)=4.303 * (1/sqrt(3)) = 2.484. The old fallback used 3.182 -> half-width 1.837.
    expect(r.hi - r.mean).toBeCloseTo(4.303 / Math.sqrt(3), 3);
    expect(r.lo).toBeLessThan(0);
    expect(r.hi).toBeGreaterThan(0);
  });

  it('refuses below three contexts rather than returning a wider guess', () => {
    expect(() => contextClusteredInterval([{ contextId: 'a', delta: 1 }])).toThrow();
  });
});

describe('sd and mean have one implementation', () => {
  it('sd is the sample standard deviation, n-1 in the denominator', () => {
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(mean([2, 4, 6])).toBeCloseTo(4, 9);
  });

  it('welch degrees of freedom sit between the two sample sizes for unequal variances', () => {
    const a = sampleFrom([1, 2, 3, 4, 5]);
    const b = sampleFrom([10, 10.1, 9.9, 10.05, 9.95]);
    const w = welchDiff(a, b);
    expect(w.df).toBeGreaterThan(0);
    expect(w.df).toBeLessThanOrEqual(8);
    expect(w.se).toBeGreaterThan(0);
  });
});

describe('there is exactly one t-table in the tree', () => {
  // The duplicate was byte-identical across ninety lines, and the two copies had already drifted at
  // the one spot the project documents as repaired. A census is the only check that sees a copy
  // nobody imports yet.
  it('no shipped module declares its own table of critical values', () => {
    const offenders = ['core', 'cli', 'renderers', 'adapters', 'providers']
      .flatMap((d) => walk(d))
      .filter((f) => f.endsWith('.ts') && f !== join('core', 'stats', 't.ts'))
      // COMMENTS STRIPPED FIRST. CONTRIBUTING warns that a grep over source text "will one day fail
      // on the comment explaining the very fix it is checking", and the first run of this test did
      // exactly that: it flagged the sentence in resolution.ts that documents why the table moved.
      .filter((f) => /12\.706|4\.303|2\.776/.test(
        readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
    expect(offenders, `import from core/stats/t.ts instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
