// tests/atelier-structure.test.ts — THE STRUCTURE READER: CLOSED LABELS, TWO READS, FEATURES FROM THE SEQUENCE.
import { describe, it, expect } from 'vitest';
import { canonicalMove, checkLabels, readStructure, STRUCTURE_MOVES, type StructureMove } from '../core/structure/moves.js';
import { structureFeatures, entropyRate, transitions } from '../core/structure/features.js';
import { cohenKappa } from '../core/stats/agreement.js';
import { chainOf, sampleSkeleton, skeletonBlock, typicalLength, followed } from '../core/structure/skeleton.js';
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

describe('the skeleton: a shape sampled from the author\'s own chain', () => {
  const author: (StructureMove | null)[][] = [
    ['STORY', 'CLAIM', 'EXAMPLE', 'CONCESSION', 'TURN', 'CLAIM'],
    ['STORY', 'CLAIM', 'EVIDENCE', 'EXPLAIN', 'TURN', 'CLAIM', 'EXAMPLE'],
    ['QUESTION', 'STORY', 'CLAIM', 'EXAMPLE', 'TURN', 'CLAIM'],
    ['STORY', 'CLAIM', 'EXAMPLE', 'CONCESSION', 'CLAIM'],
  ];
  it('a sampled skeleton starts and moves the way the author does, and replays for a seed', () => {
    const chain = chainOf(author);
    const runs = Array.from({ length: 300 }, (_, k) => sampleSkeleton(chain, 6, k + 1));
    // with no length given, lengths are drawn from the author's own (5, 6 or 7 here)
    const lengths = new Set(Array.from({ length: 50 }, (_, k) => sampleSkeleton(chain, null, k + 1).length));
    expect([...lengths].every((n) => n >= 5 && n <= 7) && lengths.size > 1).toBe(true);
    expect(runs.filter((r) => r[0] === 'STORY').length / runs.length).toBeGreaterThan(0.6);
    const afterStory = runs.flatMap((r) => r.slice(1).filter((_, i) => r[i] === 'STORY'));
    expect(afterStory.filter((m) => m === 'CLAIM').length / afterStory.length).toBeGreaterThan(0.7);
    expect(sampleSkeleton(chain, 6, 42)).toEqual(sampleSkeleton(chain, 6, 42));
    expect(typicalLength(chain)).toBe(6);
  });
  it('nearer pieces count more, and the instruction carries moves, not content', () => {
    const near = chainOf(author, [10, 1, 1, 1]);
    expect(near.transitions[STRUCTURE_MOVES.indexOf('EXAMPLE')][STRUCTURE_MOVES.indexOf('CONCESSION')]).toBeGreaterThan(
      chainOf(author).transitions[STRUCTURE_MOVES.indexOf('EXAMPLE')][STRUCTURE_MOVES.indexOf('CONCESSION')]);
    const block = skeletonBlock(['STORY', 'CLAIM']);
    expect(block).toMatch(/1\. STORY: tell what happened/);
    expect(block).toMatch(/without inventing one/);
  });
  it('adherence aligns the plan with what was read: one cut paragraph does not zero the rest', () => {
    expect(followed(['STORY', 'CLAIM', 'TURN'], ['STORY', 'CLAIM', 'EXAMPLE'])).toBeCloseTo(2 / 3, 3);
    expect(followed(['STORY', 'CLAIM', 'EXAMPLE', 'TURN', 'CLAIM'], ['CLAIM', 'EXAMPLE', 'TURN', 'CLAIM'])).toBe(0.8);
    expect(followed([], ['CLAIM'])).toBeNull();
  });
  it('a move the author never followed with anything backs off to how pieces open, not to a uniform draw', () => {
    const chain = chainOf([['STORY', 'CLAIM', 'SUMMARY'], ['STORY', 'CLAIM', 'SUMMARY'], ['STORY', 'EXAMPLE', 'SUMMARY']]);
    const after = Array.from({ length: 200 }, (_, k) => sampleSkeleton(chain, 4, k + 7)).filter((r) => r[2] === 'SUMMARY').map((r) => r[3]);
    expect(after.filter((m) => m === 'STORY').length / after.length).toBeGreaterThan(0.8);
  });
});
