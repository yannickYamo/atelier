// tests/atelier-context-bands.test.ts — THE AUTHOR'S RANGE ON THE REQUEST'S SUBJECT, BOTH WAYS.
//
// A request near the author's pieces on one subject moves the SIGNAL bands toward those pieces, by how many are
// near; a request near none of them gets no local target; a RULE band never moves; and the paired AUC difference
// is zero for one scoring against itself and positive for a scoring that separates where the other does not.
import { describe, it, expect } from 'vitest';
import { weightedQuantile } from '../core/stats/weighted.js';
import { effectiveSize, localContext, localiseBands, pieceWeights, CONTEXT_PRIOR_PIECES } from '../core/fidelity/context.js';
import { calibrateFromValues } from '../core/fidelity/typicality.js';
import { buildRetrievalIndex } from '../core/fidelity/retrieval.js';
import { readValues } from '../core/fidelity/profile.js';
import { aucDifferenceWithCi, mulberry32 } from '../core/fidelity/qualify.js';
import type { FeatureBand, FidelityProfile } from '../core/fidelity/types.js';

describe('weighted quantiles and effective size', () => {
  it('equal weights give the Hazen quantile; zero weights do not count; no weight is no quantile', () => {
    expect(weightedQuantile([1, 2, 3, 4], [1, 1, 1, 1], 0.5)).toBeCloseTo(2.5);
    expect(weightedQuantile([1, 2, 3, 4], [1, 1, 1, 1], 0)).toBe(1);
    expect(weightedQuantile([1, 2, 3, 100], [1, 1, 1, 0], 1)).toBe(3);
    expect(weightedQuantile([1, 2], [0, 0], 0.5)).toBeNull();
    expect(weightedQuantile([1, 10], [9, 1], 0.5)).toBeLessThan(2);
  });
  it('n equal weights are n pieces; one weight alone is one', () => {
    expect(effectiveSize([1, 1, 1, 1])).toBeCloseTo(4);
    expect(effectiveSize([0.7, 0, 0])).toBeCloseTo(1);
    expect(effectiveSize([0, 0])).toBe(0);
  });
});

// Two subjects, two habits: pieces about caches run short paragraphs (feature a low), pieces about hiring long ones.
const CACHE = 'The cache never expired and the database kept serving stale rows to every replica we had. We traced the eviction policy, the invalidation path and the replica lag before anyone found the timestamp bug in the cache layer.';
const HIRING = 'Hiring a senior engineer means reading how candidates reason about tradeoffs in an interview loop. A careful interviewer listens for judgement, for the questions candidates ask, and for how they handle being wrong about a design.';
const pieces = Array.from({ length: 12 }, (_, k) => ({ id: `p${k}`, text: k < 6 ? `${CACHE} ${CACHE}\n\n${CACHE}` : `${HIRING} ${HIRING}\n\n${HIRING}` }));
const rows = pieces.map((_, k) => ({ a: k < 6 ? 1 + k * 0.1 : 5 + k * 0.1, b: 3 + ((k * 7) % 5) * 0.2 }));
const cal = calibrateFromValues(rows, undefined, pieces.map((p) => p.id));
const index = buildRetrievalIndex(pieces);
const band = (id: string, role: FeatureBand['role'], lo: number, hi: number): FeatureBand => ({ id, cls: 'all', band: [lo, hi], median: (lo + hi) / 2, spread: 1, n: 12, role, auc: 0.9 });

describe('the local target', () => {
  it('a request about caches weighs the cache pieces and none of the hiring ones', () => {
    const w = pieceWeights(index, 'Write about a stale cache and replica lag', pieces.map((p) => p.id));
    expect(w.slice(0, 6).every((x) => x > 0)).toBe(true);
    expect(w.slice(6).every((x) => x === 0)).toBe(true);
  });
  it('moves a SIGNAL band toward the near pieces by λ = n_eff / (n_eff + k), and leaves RULE and MONITOR bands where they are', () => {
    expect(cal).not.toBeNull();
    const ctx = localContext('Write about a stale cache and replica lag', cal!, index);
    expect(ctx).not.toBeNull();
    expect(ctx!.nEff).toBeCloseTo(6, 0);
    expect(ctx!.lambda).toBeCloseTo(ctx!.nEff / (ctx!.nEff + CONTEXT_PRIOR_PIECES), 2);
    expect(ctx!.bands.a[1]).toBeLessThan(2.5);
    const moved = localiseBands([band('a', 'SIGNAL', 0.5, 7), band('a', 'RULE', 0.5, 7), band('a', 'MONITOR', 0.5, 7)], ctx!);
    expect(moved[0].band[1]).toBeLessThan(7);
    expect(moved[0].band[1]).toBeGreaterThan(ctx!.bands.a[1]);
    expect(moved[1].band).toEqual([0.5, 7]);
    expect(moved[2].band).toEqual([0.5, 7]);
  });
  it('a request near none of the pieces gets no local target', () => {
    expect(localContext('Plan a wedding menu', cal!, index)).toBeNull();
  });
  it('a calibration that does not know its pieces gives none', () => {
    const anon = calibrateFromValues(rows);
    expect(localContext('stale cache', anon!, index)).toBeNull();
  });
  it('a reading with a local target says so, and a text the local band holds can be out of the pooled one', () => {
    const ctx = localContext('Write about a stale cache and replica lag', cal!, index)!;
    const profile: FidelityProfile = { version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: [band('paragraphP50', 'SIGNAL', 0, 1000)] };
    const r = readValues({ paragraphP50: 10 }, 'medium', { ...profile, context: ctx });
    expect(r.bandsFrom).toBe('local');
    expect(readValues({ paragraphP50: 10 }, 'medium', profile).bandsFrom).toBe('all');
  });
});

describe('the paired AUC difference', () => {
  const rnd = mulberry32(3);
  const noise = (): number => rnd();
  it('one scoring against itself differs by zero', () => {
    const pos = Array.from({ length: 10 }, () => { const x = noise(); return [x, x] as const; });
    const neg = Array.from({ length: 10 }, () => { const x = noise(); return [x, x] as const; });
    const d = aucDifferenceWithCi([{ pos, neg }]);
    expect(d.diff).toBe(0);
    expect(d.ci95).toEqual([0, 0]);
  });
  it('a scoring that separates where the other is noise is better, with an interval above zero', () => {
    const pos = Array.from({ length: 12 }, () => [noise(), 1 + noise()] as const);
    const neg = Array.from({ length: 12 }, () => [noise(), noise()] as const);
    const d = aucDifferenceWithCi([{ pos, neg }, { pos: pos.slice(0, 6), neg: neg.slice(0, 6) }]);
    expect(d.b).toBe(1);
    expect(d.diff).toBeGreaterThan(0.2);
    expect(d.ci95[0]).toBeGreaterThan(0);
  });
  it('refuses a stratum with an empty side', () => {
    expect(() => aucDifferenceWithCi([{ pos: [[1, 1]], neg: [] }])).toThrow();
  });
});
