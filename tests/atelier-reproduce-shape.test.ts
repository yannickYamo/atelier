// tests/atelier-reproduce-shape.test.ts — "REPRODUCED" MEANS THE OUTPUT HAS THE SHAPE OF THE WORK HELD BACK.
//
// A reproduction was the run's own verdict, and a skill with two rules of style gives that verdict to anything
// tidy: 67 words of boilerplate for the wrong clause read "1 of 1 reproduced". The held-back piece is the expert's
// answer to the same task. Never served, it can still be read in code beside the output: the sections it has, the
// output must have, each with something in it. The output answers the same task from the same material, so the
// piece's own headings are fair to ask of it.
import { describe, it, expect } from 'vitest';
import { shapeAgainst, hasShape, countsOf, renderReproduction, type ReproductionRecord, type CaseOutcome } from '../core/eval/reproduce.js';

const reference = '## What the clause does\n\nIt assigns to Pellow every invention made in the course of the work.\n\n## Who carries the risk\n\nThe contractor, who warrants that nothing assigned is a third party\'s.\n\n## What Pellow should ask for\n\nA carve-out for tools the contractor built before the engagement.\n';

describe('the sections of the held-back piece, read on the output', () => {
  it('an output with every one of them, each with something in it, has its shape', () => {
    const out = '## What the clause does\n\nIt gives Pellow the inventions made during the work.\n\n## Who carries the risk\n\nMarchetti does, by warranty.\n\n## What Pellow should ask for\n\nA carve-out for earlier tools.\n';
    expect(shapeAgainst(out, reference)).toEqual({ sections: { of: 3, held: 3, missing: [] } });
  });
  it('tidy boilerplate has none of it', () => {
    const bland = 'This clause covers an important area of the agreement. Both parties should read it with care. It is advisable to seek advice before signing.';
    expect(shapeAgainst(bland, reference)).toEqual({ sections: { of: 3, held: 0, missing: ['What the clause does', 'Who carries the risk', 'What Pellow should ask for'] } });
  });
  it('a bare heading is not the section', () => {
    const shell = '## What the clause does\n\n## Who carries the risk\n\nMarchetti does, by warranty.\n\n## What Pellow should ask for\n\nA carve-out for earlier tools.\n';
    expect(shapeAgainst(shell, reference).sections).toEqual({ of: 3, held: 2, missing: ['What the clause does'] });
  });
  it('a held-back piece with no sections asks for none', () => {
    expect(shapeAgainst('Anything.', 'A piece written as three plain paragraphs, with no heading in it at all.')).toEqual({ sections: { of: 0, held: 0, missing: [] } });
  });
});

describe('a section is the same section however two writers mark and spell it', () => {
  const ref = '## 1. Risks & mitigations\n\nThe loop can spin.\n\n## What’s next\n\nCap the delay.\n\n### A detail\n\nSmall.\n\n## Verdict\n\nSafe.\n';
  it('numbering, "&", curly marks and case do not make it another section; a sub-heading is not asked for', () => {
    const out = "## Risks and mitigations\n\nIt may spin.\n\n## what's next\n\nA cap.\n\n## Verdict\n\nSafe to merge.\n";
    expect(shapeAgainst(out, ref)).toEqual({ sections: { of: 3, held: 3, missing: [] } });
  });
  it('an output that marks its sections with labels has them', () => {
    expect(shapeAgainst('**Risks and mitigations**\n\nIt may spin.\n\nWhat\'s next: a cap.\n\nVerdict: safe to merge.\n', ref).sections.held).toBe(3);
  });
  it('a piece of prose with a bold lead-in and an aside has no sections to ask for', () => {
    expect(shapeAgainst('Anything.', '**Acme Corp** signed on Tuesday and has asked for terms.\n\nNote: call me before Friday.\n\nThe rest is prose.').sections.of).toBe(0);
  });
  it('most of the sections is the shape; one heading alone is not a shape to hold anything to', () => {
    expect([[3, 3], [2, 3], [1, 3], [0, 3], [2, 4], [1, 4], [0, 1], [1, 2], [0, 2]].map(([held, of]) => hasShape({ sections: { of, held, missing: [] } }))).toEqual([true, true, false, false, true, false, true, true, false]);
  });
});

describe('the record counts the shape, and says it', () => {
  const one = (o: Partial<CaseOutcome>): CaseOutcome => ({ id: 'ip.md', state: 'ran', conformant: true, required: { held: 2, applicable: 2 }, claims: null, reference: { met: 2, applicable: 2 },
    words: { output: 67, reference: 240 }, costUsd: 0, ...o });
  const record = (cases: CaseOutcome[]): ReproductionRecord => ({ schema: 1, skill: 'clauses', skillVersion: 'a', standardVersion: 'b', at: '', heldBack: { full: cases.length, taskOnly: 0, referenceOnly: 0 }, cases, notCheckable: 0, timesRun: 1, costUsd: 0 });
  it('sections held of sections there, over the cases', () => {
    const r = record([one({ shape: { sections: { of: 3, held: 3, missing: [] } } }), one({ id: 'fm.md', conformant: false, shape: { sections: { of: 4, held: 1, missing: ['a', 'b', 'c'] } }, why: 'it lacks 3 section(s) your held-back piece has: a, b, c' })]);
    expect(countsOf(r).shape).toEqual({ held: 4, of: 7 });
    expect(renderReproduction(r)).toMatch(/ {2}4 of 7 {3}sections of your held-back pieces are in the outputs, each with something in it/);
    expect(renderReproduction(r)).toMatch(/1 of 2 {3}reproduced: the run's own verdict was "conformant", and the output has most of the sections of the piece held back/);
  });
});
