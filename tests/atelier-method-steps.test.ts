// tests/atelier-method-steps.test.ts — A STEP IS CHECKED WHEN IT NAMES A SECTION THE OWNER'S EXAMPLE HAS, HOWEVER EACH IS WRITTEN.
//
// A step's check was guessed from its wording alone, and each round of testing found a wording it did not know:
// of 16 steps in three real methods that name something the work must contain, 2 got a check. The example is the
// better witness. It is read first, as it is written (headings, labels, clauses, or a name alone on a line), and
// a step that names one of its sections followed by "section", "heading", "part" or "line" is about that section.
// The six methods and examples below are the tester's, as their owners wrote them: none uses a markdown heading.
// What stays a judgement stays one: a name in passing asks for nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { methodProposals, outlineOf, stepsOf } from '../core/method/standard.js';
import { sectionHeadsOf } from '../core/observers/structure.js';

const DIR = 'tests/fixtures/methods/';
function read(name: string): { steps: Record<string, string>; sections: string[] } {
  const raw = readFileSync(`${DIR}${name}.md`, 'utf8'); const m = /^---\nrequest: (.*)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${name}.md has no request`);
  const material = existsSync(`${DIR}${name}.material.md`) ? [{ name: 'sources.md', text: readFileSync(`${DIR}${name}.material.md`, 'utf8') }] : [];
  const steps: Record<string, string> = {};
  for (const p of methodProposals(readFileSync(`${DIR}${name}.method.md`, 'utf8'), { task: m[1], material, reference: m[2] })) {
    if (p.origin !== 'STATED') continue;
    const x = p.measurement;
    steps[p.statement.split(/\s+/).slice(0, 5).join(' ')] = !x ? (p.demoted ? 'to settle' : 'judgement')
      : x.observer === 'PRESENCE' ? `section ${(x.params.sections as string[]).join('+').toLowerCase()}${x.params.opens ? ', opens' : ''}${x.params.closes ? ', closes' : ''}`
        : x.observer === 'TABLE' ? `table ${(x.params.columns as string[]).length}` : x.observer.toLowerCase();
  }
  return { steps, sections: outlineOf(m[2]).sections };
}

describe('three methods as their owners wrote them: sections named on a line of their own', () => {
  it('competitive analysis: five of the six things the work must contain are checked', () => {
    const { steps, sections } = read('ca');
    expect(sections).toEqual(['Verdict', 'Competitors', 'Pricing', 'Where we lose', 'Switching costs', 'Risks']);
    expect(steps).toEqual({
      'Every analysis opens with a': 'section verdict, opens',
      'Include a Competitors section that': 'section competitors',
      'Include a table with the': 'table 5',
      // the example's own "under 200 seats" is in no source: the owner's step and example disagree, and that is asked
      'Every figure must come from': 'to settle',
      'Weigh switching costs for the': 'judgement',
      'Call out where our own': 'judgement',
      'Include a Pricing section comparing': 'section pricing',
      'End with a Risks section,': 'section risks, closes',
      'Keep it under two pages.': 'judgement',
    });
  });
  it('market entry: all six; the title is not a step; a name in passing links to nothing', () => {
    const { steps, sections } = read('me');
    expect(sections).toEqual(['Recommendation', 'Market size', 'Competitors', 'Regulation', 'What would change this', 'Next steps']);
    expect(steps).toEqual({
      'The brief answers one question:': 'judgement',
      'Open with a Recommendation section:': 'section recommendation, opens',
      'Size the market with a': 'section market size',
      'Include a table with the': 'table 4',
      'Include a Competitors section naming': 'section competitors',
      'Every figure must cite a': 'to settle',
      'State the regulatory constraints in': 'section regulation',
      // "the recommendation" is named and no section is asked for
      'Name the two or three': 'judgement',
      'End with a Next steps': 'section next steps, closes',
    });
  });
  it('code review: the two headings it names; a summary and a verdict "line" it does not name stay judgement', () => {
    const { steps, sections } = read('cr');
    expect(sections).toEqual(['Summary', 'Blocking', 'Nits', 'Verdict']);
    expect(Object.values(steps).filter((v) => v !== 'judgement')).toEqual(['section blocking+nits']);
    expect(steps['Start with a one-line summary']).toBe('judgement');
    expect(steps['End with a clear verdict:']).toBe('judgement');
  });
  it('the bar: at least 8 of the 16 checked, and no step linked to something it does not ask for', () => {
    const all = ['ca', 'cr', 'me'].flatMap((n) => Object.values(read(n).steps));
    // the 16: CA Verdict, Competitors, table, Pricing, Risks, two pages; CR summary, headings, line refs, verdict; ME all six
    expect(all.filter((v) => v.startsWith('section') || v.startsWith('table'))).toHaveLength(12);
  });
});

describe('three more, written with labels, clauses and bold', () => {
  it('a handover note in capitals with colons: all four', () => {
    expect(read('handover').steps).toEqual({
      'Open with a Status section:': 'section status, opens', 'Include an Open issues section': 'section open issues',
      'Include a Decisions needed section.': 'section decisions needed', 'End with a Next 48': 'section next 48 hours, closes' });
  });
  it('a contract article whose clauses go on after their name: all four', () => {
    expect(read('clause').sections).toEqual(['DEFINITIONS', 'TERM', 'TERMINATION', 'GOVERNING LAW']);
    expect(read('clause').steps).toEqual({
      'Start with a Definitions section.': 'section definitions, opens', 'Include a Term section stating': 'section term',
      'Include a Termination section with': 'section termination', 'End with a Governing law': 'section governing law, closes' });
  });
  it('a review in bold labels, its steps saying "line" and "heading": all four', () => {
    expect(read('review').steps).toEqual({
      'Start with a Summary line.': 'section summary, opens', 'Put blocking comments under a': 'section blocking',
      'Put minor comments under a': 'section nits', 'End with a Verdict line.': 'section verdict, closes' });
  });
});

describe('what is and is not a section when nothing marks it', () => {
  const names = (t: string): string[] => sectionHeadsOf(t, true).map((h) => h.text);
  it('three names each alone on a line with text under them are sections; the sentence that opens one is not', () => {
    expect(names('Verdict\n\nWe win on price.\n\nCompetitors\n\nNotion: ten dollars a seat.\n\nRisks\n\nA price cut.\n')).toEqual(['Verdict', 'Competitors', 'Risks']);
  });
  it('one or two short lines are lines', () => {
    expect(names('Verdict\n\nWe win on price.\n\nRisks\n\nA price cut.\n')).toEqual([]);
    expect(names('A short line\n\nThen a paragraph that says something at more length than a name would.\n')).toEqual([]);
  });
  it('a title over labelled sections is a title, and the labels are still the sections', () => {
    expect(names('Handover\n\nSTATUS: amber, and why.\n\nOPEN ISSUES:\nOne.\n\nDECISIONS NEEDED:\nNone.\n')).toEqual(['STATUS', 'OPEN ISSUES', 'DECISIONS NEEDED']);
  });
  it('a title over the first name, a sign-off, and a line inside a paragraph are not sections', () => {
    expect(names('Market entry brief\n\nRecommendation\n\nGo.\n\nMarket size\n\nLarge.\n\nNext steps\n\nShortlist.\n\nPriya Shah\n')).toEqual(['Recommendation', 'Market size', 'Next steps']);
    expect(names('Verdict\n\nGo.\n\nRisks\n\nFew.\n\nPricing\n\nWe charge ten\nPer seat\nand no more.\n')).toEqual(['Verdict', 'Risks', 'Pricing']);
  });
  it('a clause that goes on after its name in capitals is a clause; a numbered step is a step', () => {
    expect(names('1. DEFINITIONS. "Effective Date" means the date of signing.\n\n2. TERM. Two years.\n')).toEqual(['DEFINITIONS', 'TERM']);
    expect(names('1. Open the file. Then save it.\n\n2. Close it. Then leave.\n')).toEqual([]);
  });
  it('"Next steps" and "Next 48 hours" are names; "Next: nothing to do" is an aside', () => {
    expect(names('Status: green.\n\nNext steps: ship on Friday.\n\nNEXT 48 HOURS:\nWatch the dashboard.\n')).toEqual(['Status', 'Next steps', 'NEXT 48 HOURS']);
    expect(names('Status: green.\n\nRisks: none.\n\nNext: nothing to do.\n')).toEqual(['Status', 'Risks']);
  });
});

describe('a step names a section of the example only by saying it is one', () => {
  const example = { task: 'Write the note.', material: [], reference: 'STATUS: amber, because reconciliation is behind.\n\nOPEN ISSUES:\nThe lag.\n\nSWITCHING COSTS:\nLow.\n' };
  const check = (step: string): string | null => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.measurement ? (p.measurement.params.sections as string[]).join('+') : null; };
  it('in any case, after any verb, with the word that says what it is', () => {
    expect(check('Size the problem with an Open issues section.')).toBe('OPEN ISSUES');
    expect(check('Put what is still broken under an open issues heading.')).toBe('OPEN ISSUES');
    expect(check('Give a status line, then an Open Issues part.')).toBe('STATUS+OPEN ISSUES');
  });
  it('named in passing, forbidden, or asked for only sometimes: a judgement', () => {
    expect(check('Weigh switching costs before recommending anything.')).toBeNull();
    expect(check('Say what would change the status.')).toBeNull();
    expect(check('Do not add an Open issues section unless something is open.')).toBeNull();
    expect(check('Add an Open issues section only when something is open.')).toBeNull();
  });
  it('"go, no-go" in a step is not the step saying no', () => {
    expect(check('Open with a Status section: go, no-go, or wait.')).toBe('STATUS');
  });
});

describe('the title of a note is not a step', () => {
  it('a first line that is a name, with a blank line under it', () => {
    expect(stepsOf('Market entry brief\n\nOpen with a Recommendation section.\nEnd with a Next steps section.\n').map((s) => s.text)).toEqual(['Open with a Recommendation section.', 'End with a Next steps section.']);
  });
  it('a first line that is a sentence is a step, as it was', () => {
    expect(stepsOf('Open with a Recommendation section.\n\nEnd with a Next steps section.\n')).toHaveLength(2);
  });
});
