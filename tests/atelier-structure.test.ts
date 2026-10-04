// tests/atelier-structure.test.ts — THE STRUCTURE READER: CLOSED LABELS, TWO READS, FEATURES FROM THE SEQUENCE.
import { describe, it, expect } from 'vitest';
import { canonicalMove, checkLabels, readStructure, STRUCTURE_MOVES, type StructureMove } from '../core/structure/moves.js';
import { structureFeatures, entropyRate, transitions } from '../core/structure/features.js';
import { cohenKappa } from '../core/stats/agreement.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';

describe('labels', () => {
  it('a near-miss maps onto the one move it can only mean; an ambiguous or unknown one is refused', () => {
    expect(canonicalMove('EXPLANATION')).toBe('EXPLAIN');
    expect(canonicalMove(' instructions ')).toBe('INSTRUCTION');
    expect(canonicalMove('CONCLUSION')).toBeNull();
    expect(canonicalMove('EX')).toBeNull();
    expect(canonicalMove(3)).toBeNull();
  });
  it('a reading must label every paragraph exactly once', () => {
    expect(checkLabels({ labels: [{ n: 2, move: 'CLAIM' }, { n: 1, move: 'STORY' }] }, 2)).toEqual(['STORY', 'CLAIM']);
    expect(checkLabels({ labels: [{ n: 1, move: 'CLAIM' }] }, 2)).toBeNull();
    expect(checkLabels({ labels: [{ n: 1, move: 'CLAIM' }, { n: 1, move: 'STORY' }] }, 2)).toBeNull();
    expect(checkLabels({ labels: [{ n: 3, move: 'CLAIM' }, { n: 1, move: 'STORY' }] }, 2)).toBeNull();
  });
  it('kappa is 1 for identical reads, about 0 for unrelated ones', () => {
    expect(cohenKappa(['A', 'B', 'A', 'C'], ['A', 'B', 'A', 'C'])).toBe(1);
    expect(Math.abs(cohenKappa(['A', 'A', 'B', 'B'], ['A', 'B', 'A', 'B']) ?? 1)).toBeLessThan(0.01);
  });
});

describe('features from the sequence', () => {
  const seq = (...m: (StructureMove | null)[]): (StructureMove | null)[] => m;
  it('shares count only agreed moves; claim support looks two paragraphs ahead', () => {
    const f = structureFeatures(seq('CLAIM', 'EXAMPLE', 'EXPLAIN', null, 'CLAIM', 'EXPLAIN', 'EXPLAIN', 'SUMMARY'));
    expect(f.sExplainShare).toBeCloseTo(3 / 7, 3);
    expect(f.sShowShare).toBeCloseTo(1 / 7, 3);
    expect(f.sClaimSupport).toBe(0.5);
    expect(f.sEndsOnSummary).toBe(1);
  });
  it('a tidy single track is predictable; a varied one is not', () => {
    const track = entropyRate(seq('CLAIM', 'EXPLAIN', 'EXPLAIN', 'EXPLAIN', 'EXPLAIN', 'EXPLAIN', 'EXPLAIN', 'SUMMARY'))!;
    const varied = entropyRate(seq('CLAIM', 'STORY', 'CONCESSION', 'EXAMPLE', 'TURN', 'EVIDENCE', 'QUESTION', 'CLAIM', 'EXPLAIN'))!;
    expect(track).toBeLessThan(varied);
    expect(varied).toBeLessThanOrEqual(1);
  });
  it('transitions skip a pair across an unclear paragraph, and too few agreed moves give no features', () => {
    const t = transitions(seq('CLAIM', null, 'EXPLAIN', 'EXPLAIN'));
    expect(t.flat().reduce((a, b) => a + b, 0)).toBe(1);
    expect(structureFeatures(seq('CLAIM', null, null, 'EXPLAIN')).sExplainShare).toBeNull();
  });
});

describe('read twice, kept where both agree', () => {
  const para = (i: number): string => `Paragraph ${i} says something about the system and why it matters to the people who run it every day.`;
  const text = Array.from({ length: 5 }, (_, i) => para(i + 1)).join('\n\n');
  const scripted = (reads: StructureMove[][]): InferenceClient => {
    let k = 0;
    return { complete: () => { const labels = reads[k++].map((move, i) => ({ n: i + 1, move })); return Promise.resolve({ json: { labels }, termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never); } };
  };
  it('a paragraph the reads label differently is unclear, and kappa is reported', async () => {
    const a: StructureMove[] = ['CLAIM', 'EXPLAIN', 'EXAMPLE', 'EXPLAIN', 'SUMMARY'];
    const b: StructureMove[] = ['CLAIM', 'EXPLAIN', 'EVIDENCE', 'EXPLAIN', 'SUMMARY'];
    const r = await readStructure(scripted([a, b]), { spentUsd: 0, capUsd: 1, maxCalls: 4 }, text);
    expect(r?.moves).toEqual(['CLAIM', 'EXPLAIN', null, 'EXPLAIN', 'SUMMARY']);
    expect(r?.kappa).toBeGreaterThan(0.6);
    expect(STRUCTURE_MOVES).toContain('TURN');
  });
  it('a text of fewer than four paragraphs is not read', async () => {
    expect(await readStructure(scripted([]), { spentUsd: 0, capUsd: 1, maxCalls: 4 }, `${para(1)}\n\n${para(2)}`)).toBeNull();
  });
});
