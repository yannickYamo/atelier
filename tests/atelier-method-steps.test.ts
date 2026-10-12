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
    expect(check('Report the state in a Status section, then add an Open issues section.')).toBe('STATUS+OPEN ISSUES');
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

// An independent review of the first version of this: it tied steps to sections they forbid or only mention, took a
// rule for a title, and read a signature, a short answer and a list as sections.
describe('what a review of the first version found', () => {
  const example = { task: 'Write it.', material: [], reference: '## Summary\nIt works.\n\n## Status\nGreen today.\n\n## Pricing\nTen a seat.\n\n## Open\nNothing is.\n\n## Risks\nA price cut.\n' };
  const check = (step: string): string | null => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.measurement ? (p.measurement.params.sections as string[]).join('+') : null; };
  it('a step that leaves a section out, weighs it or replaces it asks for none', () => {
    for (const step of ['Avoid a Summary section.', 'Rather than a Summary section, lead with the decision.', 'Write the verdict without a Summary section above it.', 'Replace a Summary section with one sentence.',
      'Consider a Risks section for larger changes.', 'Sometimes a Risks section is worth adding.', 'Skip a Risks section for small changes.']) expect(check(step), step).toBeNull();
  });
  it('"a status line" in the footer, "one summary line per ticket" and "an open line" are not sections', () => {
    for (const step of ['Add a status line to the footer of every page.', 'Keep it to one summary line per ticket.', 'Give each competitor a pricing line in the comparison table.',
      'Leave an open line between paragraphs.', 'Record a summary part of the meeting in the tracker.']) expect(check(step), step).toBeNull();
    expect(check('Start with a Summary line.')).toBe('Summary');
  });
  it('a step that names two sections, one the example lacks, is not checked on the other alone', () => {
    for (const step of ['Open with a Glossary section and include a Summary section.', 'Include a Summary section, then end with a Sources section.']) {
      const p = methodProposals(`- ${step}\n`, example)[0];
      expect(p.measurement, step).toBeNull();
      expect(p.demoted, step).toMatch(/your example does not hold it/);
    }
  });
  it('a first line that is a rule or an instruction is a step, whatever its punctuation; a note called Inputs still has steps', () => {
    expect(stepsOf('Always open with the verdict')).toHaveLength(1);
    expect(stepsOf('Never write more than one page\n\n- Open with the verdict.\n- End with the risks.\n').map((x) => x.text)).toContain('Never write more than one page');
    expect(stepsOf('Open with a Summary section\n\nThen give the evidence in order\n')).toHaveLength(2);
    expect(stepsOf('Inputs\n\n- Open with the verdict.\n- End with the risks.\n')).toHaveLength(2);
  });
  const names = (t: string): string[] => sectionHeadsOf(t, true).map((h) => h.text);
  it('a short answer under a name is its answer; a signature and a list are not sections', () => {
    expect(names('Background\n\nWe met in May.\n\nOur position\n\nWe agree.\n\nRisks\n\nFew.\n\nAnna Lindqvist\nHead of Platform Engineering\nAcme Systems Ltd, Leeds office\n')).toEqual(['Background', 'Our position', 'Risks']);
    expect(names('Shopping\n\nMilk\nEggs\n\nErrands\n\nPost office\nBank\n\nCalls\n\nMum\nDentist\n')).toEqual(['Shopping', 'Errands', 'Calls']);
  });
  it('every line under a name that opens with a label is what the section says', () => {
    expect(names('Verdict\n\nGo.\n\nPricing\n\nNotion: ten a seat.\nCoda: twelve a seat.\n\nRisks\n\nFew.\n')).toEqual(['Verdict', 'Pricing', 'Risks']);
  });
  it('labels that were read before are read still', () => {
    expect(names('**Best Practices**\n\nKeep it short.\n')).toEqual(['Best Practices']);
    expect(names('BEST PRACTICES\n\nKeep it short.\n\nKind: a note.\n')).toEqual(['BEST PRACTICES', 'Kind']);
  });
  it('a numbered list about two agencies is not two clauses', () => {
    expect(names('1. NASA. The agency launched it.\n\n2. ESA. The agency tracked it.\n')).toEqual([]);
  });
});

// A second review of the fixes.
describe('what a second review found', () => {
  const names = (t: string): string[] => sectionHeadsOf(t, true).map((h) => h.text);
  it('a label alone on its line among sections named on a line is still a section', () => {
    expect(names('Verdict\n\nGo.\n\nEvidence\n\nTests pass.\n\nRisks\n\nFew.\n\n**Budget**\n\nTen.\n\n**Owners**\n\nSam.\n')).toEqual(['Verdict', 'Evidence', 'Risks', 'Budget', 'Owners']);
    expect(names('Verdict\n\nGo.\n\nEvidence\n\nTests pass.\n\nRisks\n\nFew.\n\nTesting:\nUnit.\n\nRollout:\nFriday.\n')).toEqual(['Verdict', 'Evidence', 'Risks', 'Testing', 'Rollout']);
  });
  it('a signature below labelled sections is not a section', () => {
    expect(names('STATUS: amber.\n\nBLOCKERS: none.\n\nCONTACTS: Sam.\n\nAnna Lindqvist\n\nHead of Platform\n')).toEqual(['STATUS', 'BLOCKERS', 'CONTACTS']);
  });
  const example = { task: 'x', material: [], reference: '## Summary\nIt works.\n\n## Background\nWe met.\n\n## Risks\nFew.\n\n## Next steps\nShip.\n' };
  const check = (step: string): string | null => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.measurement ? (p.measurement.params.sections as string[]).join('+') : p.demoted ? 'to settle' : null; };
  it('"and" joins two sections of a list, not two clauses', () => {
    expect(check('Include a Summary section, then a Risks section.')).toBe('Summary+Risks');
    expect(check('Include a Summary section and a Risks section.')).toBe('Summary+Risks');
    expect(check('Start with a Summary section, and then a Risks section.')).toBe('Summary+Risks');
    expect(check('Readers skim, and a Summary section helps them.')).toBeNull();
    expect(check('Keep prose tight and a Summary heading short.')).toBeNull();
  });
  it('a section the step names and the example lacks is asked about, not dropped', () => {
    expect(check('Include a Summary section and a Glossary section.')).toBe('to settle');
  });
  it('"provide", "needs" and "there must be" put a section in the work', () => {
    for (const step of ['Provide a Risks section listing three risks.', 'There must be a Risks section.', 'Each review needs a Risks section.']) expect(check(step), step).toBe('Risks');
  });
  // Known, and not read: "with", "in" and "have" also say other things. These three are still tied to the section.
  it('what is still read wrongly is written down', () => {
    for (const step of ['Compare it with a Risks section from last quarter.', 'Do the maths in a Background section of the spreadsheet.']) expect(check(step), step).not.toBeNull();
  });
});

// A third review, of the second round's fixes, found that every way of guessing sections from layout lost a real
// one on some ordinary output. So an output is no longer guessed at: the check knows the names it asks for and looks
// for those. Layout is read only on the owner's example, once, where they see the result before anything is built.
describe('on an output, the sections asked for are looked for by name', () => {
  const found = (t: string, asked: string[]): string[] => sectionHeadsOf(t, true, asked).map((h) => h.text);
  const presence = async (t: string, params: Record<string, number | string[]>): Promise<string> => (await import('../core/observers/registry.js')).measure(t, { observer: 'PRESENCE', params }).detail;
  const ASKED = ['Summary', 'Risks', 'Next steps'];
  it('a one-line answer under a name is its answer, and the next name is still found', () => {
    expect(found('Summary\n\nIt works.\n\nRisks\n\nNone\n\nNext steps\n\nShip it.\n', ASKED)).toEqual(ASKED);
  });
  it('a title, an introduction and a signature are lines: "opens with" is not broken by them', async () => {
    const t = 'Platform Review\n\nPrepared by the team for the board.\n\nSummary\n\nIt works.\n\nRisks\n\nNone\n\nNext steps\n\nShip it.\n\nAnna Lindqvist\n\nHead of Platform\n';
    expect(found(t, ASKED)).toEqual(ASKED);
    expect(await presence(t, { sections: ['Summary'], opens: 1, labels: 1, body: 1 })).toBe('everything it must contain is there');
  });
  it('a label alone on its line with a one-line answer has that answer', async () => {
    expect(await presence('STATUS:\n\nAmber\n\nBLOCKERS:\n\nNone yet\n\nCONTACTS:\n\nSam Lee\n', { sections: ['STATUS', 'BLOCKERS', 'CONTACTS'], labels: 1, body: 1 })).toBe('everything it must contain is there');
  });
  it('lines under a found name that open with a label nobody asked for are what the section says', async () => {
    expect(await presence('Verdict\n\nGo.\n\nCompetitors\n\nNotion: ten a seat.\nCoda: twelve.\n\nRisks\n\nFew.\n', { sections: ['Competitors'], labels: 1, body: 1 })).toBe('everything it must contain is there');
  });
  it('a name with nothing under it is still an empty section', async () => {
    expect(await presence('Verdict\n\nGo.\n\nRisks\n\n\n', { sections: ['Risks'], labels: 1, body: 1 })).toBe('the "Risks" section is empty');
  });
  it('a step that asks for a section only sometimes, or says to leave one out beside one it wants, is not a check', () => {
    const example = { task: 'x', material: [], reference: '## Summary\nIt works.\n\n## Risks\nFew.\n' };
    for (const step of ['It needs a Risks section only for big changes.', 'You rarely need a Risks section.', 'Reviews sometimes need a Risks section.', 'The tone should be a Summary section for executives.']) {
      expect(methodProposals(`- ${step}\n`, example)[0].measurement, step).toBeNull();
    }
  });
  it('a check tied by the example\'s name, where the step\'s own wording would not have said it, is marked as a reading', () => {
    const example = { task: 'x', material: [], reference: 'STATUS: amber, and why.\n\nOPEN ISSUES:\nThe lag.\n\nNEXT STEPS:\nWatch it.\n' };
    expect(methodProposals('- Report the state in a Status section.\n', example)[0]).toMatchObject({ byName: true });
    expect(methodProposals('- Include an Open issues section.\n', example)[0]).toMatchObject({ byName: true });
  });
});

// A fourth round: the code-review method of the standing comparison had two of its six steps checked.
describe('a step that gives its place in the order, a closed set, or the form of a citation', () => {
  const example = { task: 'Review this change.', material: [{ name: 'diff', text: '--- a/src/a.js\n+++ b/src/a.js\n@@ -1,0 +1,2 @@\n+const a = 1;\n+run(a);\n' }],
    reference: '## Summary\nIt adds a runner. It is small.\n\n## Must fix\n- src/a.js:2 runs before the check.\n\n## Suggestions\nNone.\n\n## Glossary\nRunner: the thing that runs.\n\n## Verdict\nRequest changes\n' };
  const first = (step: string) => methodProposals(`- ${step}\n`, example)[0];
  const sections = (step: string): string | null => { const m = first(step).measurement; return m?.observer === 'PRESENCE' ? (m.params.sections as string[]).join('+') : null; };
  it('"Then a Must fix section: ..." asks for the section, and what follows the colon says what goes in it', () => {
    expect(sections('Then a Must fix section: each item is a defect that blocks the merge, most serious first.')).toBe('Must fix');
    expect(sections('Then a Suggestions section: improvements that do not block the merge. Write "None." when there are none.')).toBe('Suggestions');
    expect(sections('Next, a Suggestions section.')).toBe('Suggestions');
    expect(sections('Write a Summary section. Never more than three sentences.')).toBe('Summary');
  });
  it('a sentence that only begins like one asks for nothing', () => {
    for (const step of ['Then a Summary section helps the reader.', 'Then a Summary section would be redundant.', 'First a Glossary section is tempting; resist it.',
      'Last a Glossary section was the old way; we link inline now.', 'Second, a Glossary section slows readers down.']) expect(sections(step), step).toBeNull();
  });
  it('a condition in a later clause still makes the step a judgement about when', () => {
    for (const step of ['Add a Glossary section. Only for billing changes.', 'Add a Glossary section. Billing changes only.', 'Include a Glossary section. Optional for small changes.',
      'Include a Glossary section. For new readers only.', 'End with a Verdict section; omit when nothing was reviewed.', 'Then a Glossary section, unless the change is a doc fix.',
      'Include a Glossary section if the reader is new: define each term.', 'Include a Glossary section. Skip it for internal notes.']) expect(sections(step), step).toBeNull();
  });
  it('"holds one of: A, B, C" is read in the clause that names the section, and nowhere else', () => {
    const options = (step: string): unknown => first(step).measurement?.params.options ?? null;
    expect(options('End with a Verdict section that holds one of: Approve, Request changes, Comment.')).toEqual(['Approve', 'Request changes', 'Comment']);
    expect(options('End with a Verdict section that holds one of: **Approve**, Request changes, or Comment only.')).toEqual(['Approve', 'Request changes', 'Comment']);
    expect(options('End with a Verdict section that is one of Approve, Request changes or Comment (with a reason).')).toEqual(['Approve', 'Request changes', 'Comment']);
    expect(options('End with a Verdict section. In the Summary, name one of the authors, the reviewer or the owner.')).toBeNull();
    expect(options('End with a Verdict section written by one of the leads or their deputy.')).toBeNull();
    expect(first('End with a Verdict section that holds one of: Approve, Request changes, Comment.')).toMatchObject({ obligation: 'DELIVERABLE', demoted: null });
  });
  it('an example whose verdict is none of them is the owner\'s to settle', () => {
    expect(first('End with a Verdict section that holds one of: Approve, Reject, Comment.')).toMatchObject({ obligation: 'JUDGEMENT', measurement: null, demoted: expect.stringContaining('does not start with one of') as string });
  });
  it('"cite each item as path:line" is held by looking each citation up, and asks for none where there is none', () => {
    expect(first('Cite each Must fix item as path:line, the line number in the new file, and cite only lines the diff adds.')).toMatchObject({ obligation: 'EXECUTION', measurement: { observer: 'LINES', params: { min: 0 } } });
  });
  it('a step that forbids the form, or asks for it only sometimes, is a judgement', () => {
    for (const step of ['Do not cite as path:line; link to the file instead.', 'If a finding is about code, cite it as file:line.', 'Cite each item as path:line where there is one.'])
      expect(first(step).measurement, step).toBeNull();
  });
});
