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
    expect(shapeAgainst(shell, reference).sections).toEqual({ of: 3, held: 2, missing: ['What the clause does'], empty: ['What the clause does'] });
    // and a piece with a section left empty is not the work reproduced, whatever share the others make
    expect(hasShape(shapeAgainst(shell, reference))).toBe(false);
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
  it('two thirds of the sections is the shape; one heading alone is not a shape to hold anything to', () => {
    expect([[3, 3], [2, 3], [1, 3], [3, 4], [2, 4], [0, 1], [2, 2], [1, 2]].map(([held, of]) => hasShape({ sections: { of, held, missing: [] } }))).toEqual([true, true, false, true, false, true, true, false]);
  });
  it('a placeholder is not a section, and a heading is matched by its words', () => {
    const two = '## Plan\n\nDraw on the facility and cut travel until the end of June.\n\n## Risk\n\nThe bank may not extend the facility on the same terms.\n';
    expect(shapeAgainst('## Plan\n\nTBD\n\n## Risk\n\nTBD\n', two).sections.held).toBe(0);
    expect(shapeAgainst('## Explanation\n\nWe explain at some length what was done here.\n\n## Brisket recipes\n\nSmoke it low and slow for twelve hours.\n', two).sections.held).toBe(0);
    expect(shapeAgainst('## The plan\n\nDraw on the facility now.\n\n## Risk\n\nThe bank may refuse.\n', two).sections.held).toBe(2);
  });
  it('a contract in capitals and the same contract in title case have the same clauses', () => {
    expect(shapeAgainst('1. Definitions\n\n"Service" means the hosted product described here.\n\n2. Term\n\nThe agreement runs for one year from signing.\n\n3. Fees\n\nFees are paid yearly in advance.\n',
      '1. DEFINITIONS\n\n"Service" means the hosted product in Schedule A.\n\n2. TERM\n\nThis agreement runs for the initial period.\n\n3. FEES\n\nFees are due yearly in advance.\n').sections).toMatchObject({ of: 3, held: 3 });
  });
  it('an email is not a set of sections because some of its lines hold a colon', () => {
    expect(shapeAgainst('Anything.', 'Hi Sam,\n\nSubject: the offsite\nPhone: 555 0100\nJo Li: COO\nWhen: Tuesday\n\nSee you there.\n').sections.of).toBe(0);
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
    expect(renderReproduction(r)).toMatch(/1 of 2 {3}reproduced: the run's own verdict was "conformant", and the output has two thirds or more of the sections of the piece held back/);
  });
});

// The tester's sealed cases (D5, D5b) and one real output. One word under each heading, filler text, and two names
// run into one heading were each counted as the work reproduced; so was a real analysis whose Risks section the
// claim cut had emptied.
describe('a section counts when it says something, and one heading is one section', () => {
  const held = '## Situation\nThe client runs 40 sites across three regions and has had two outages this year.\n\n## Options\nThree options were considered: patch, replace, or outsource.\n\n'
    + '## Recommendation\nTake option two, replacing the core switches by March.\n\n## Risks\nSupply delays could push the cutover into the busy season.\n';
  const reproduced = (out: string): boolean => hasShape(shapeAgainst(out, held));
  it('all four sections, briefly: reproduced', () => {
    expect(reproduced('## Situation\nAcme has 12 plants and one recent outage.\n\n## Options\nTwo paths were weighed.\n\n## Recommendation\nPath one, by June.\n\n## Risks\nCost overruns.\n')).toBe(true);
  });
  it('two of them reworded, each still naming its section: reproduced', () => {
    expect(reproduced('## Current situation\nAcme has 12 plants.\n\n## Options\nTwo paths.\n\n## Our recommendation\nPath one.\n\n## Risks\nCost.\n')).toBe(true);
  });
  it('headings only, or none: not', () => {
    expect(reproduced('## Situation\n\n## Options\n\n## Recommendation\n\n## Risks\n\n')).toBe(false);
    expect(reproduced('Acme should take path one because costs are lower and the risks are manageable.')).toBe(false);
  });
  it('one word under each heading: not', () => {
    expect(shapeAgainst('## Situation\nAcme.\n\n## Options\nTwo.\n\n## Recommendation\nOne.\n\n## Risks\nCost.\n', held).sections.held).toBe(0);
  });
  it('filler under each heading, alone or after the section\'s label: not', () => {
    expect(shapeAgainst('## Situation\nLorem ipsum dolor.\n\n## Options\nLorem ipsum dolor.\n\n## Recommendation\nLorem ipsum dolor.\n\n## Risks\nLorem ipsum dolor.\n', held).sections.held).toBe(0);
    expect(shapeAgainst('## Situation\nLorem.\n\n## Options\nOptions: TBD\n\n## Recommendation\nRecommendation: TBD.\n\n## Risks\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\n', held).sections.held).toBe(0);
  });
  it('two names run into one heading are one section, not two', () => {
    const run = shapeAgainst('## Situation analysis of options\nText here about it.\n\n## Recommendation and risks\nMore text here.\n', held);
    expect(run.sections).toMatchObject({ held: 2, missing: ['Options', 'Risks'] });
    expect(hasShape(run)).toBe(false);
  });
  it('a section named twice is read where it says the most', () => {
    expect(reproduced('Contents: Situation, Options, Recommendation, Risks\n\n## Risks\n\n## Situation\nAcme has 12 plants and one outage.\n\n## Options\nTwo paths were weighed.\n\n## Recommendation\nPath one, by June.\n\n## Risks\nCost overruns are likely.\n')).toBe(true);
  });
  it('a real output with its Risks section emptied is not the analysis reproduced', () => {
    const beaconHeld = '## Verdict\nSell to small offices that will not sign a contract.\n\n## Competitors\n| Company | Price |\n|---|---|\n| Sentrix | $45 a month |\n\n## Pricing\nOver three years Sentrix costs $1,620 and we cost $1,080.\n\n'
      + '## Where we lose\nSentrix installs its own hardware and we do not.\n\n## Risks\nSentrix could drop its contract. Hallguard could add monitoring.\n';
    const delivered = '## Verdict\nSell to small offices that already have door sensors in place and will not sign a three-year contract.\n\n## Competitors\n| Company | Price | Strength | Weakness |\n|---|---|---|---|\n| Sentrix | $45 a month, 36 months | Installs its own hardware | 36-month contract |\n\n'
      + '## Pricing\nWe charge $30 a month with no contract.\n\n## Where we lose\nHallguard is cheaper, and an owner who trusts their own phone sees no reason to pay for monitoring.\n\n## Risks\n\n\n\n';
    const shape = shapeAgainst(delivered, beaconHeld);
    expect(shape.sections).toEqual({ of: 5, held: 4, missing: ['Risks'], empty: ['Risks'] });
    expect(hasShape(shape)).toBe(false);
  });
});
