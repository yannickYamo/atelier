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
    steps[p.statement.split(/\s+/).slice(0, 5).join(' ')] = p.conflict ? 'to settle' : !x ? 'judgement'
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
      // the owner named both: both are checked, and the example that lacks one is said to
      expect((p.measurement?.params.sections as string[]).length, step).toBe(2);
      expect(p.conflict, step).toMatch(/your example does not do this/);
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
  const check = (step: string): string | null => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.conflict ? 'to settle' : p.measurement ? (p.measurement.params.sections as string[]).join('+') : null; };
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
    expect(first('End with a Verdict section that holds one of: Approve, Request changes, Comment.')).toMatchObject({ obligation: 'DELIVERABLE', conflict: null });
  });
  it('an example whose verdict is none of them: the rule stands as the owner wrote it, and the example is said to disagree', () => {
    expect(first('End with a Verdict section that holds one of: Approve, Reject, Comment.')).toMatchObject({ obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE' }, conflict: expect.stringContaining('does not start with one of') as string });
  });
  it('"cite each item as path:line" is held by looking each citation up, and asks for none where there is none', () => {
    expect(first('Cite each Must fix item as path:line, the line number in the new file, and cite only lines the diff adds.')).toMatchObject({ obligation: 'EXECUTION', measurement: { observer: 'LINES', params: { min: 0 } } });
  });
  it('a step that forbids the form, or asks for it only sometimes, is a judgement', () => {
    for (const step of ['Do not cite as path:line; link to the file instead.', 'If a finding is about code, cite it as file:line.', 'Cite each item as path:line where there is one.'])
      expect(first(step).measurement, step).toBeNull();
  });
});

// One method, a folder of examples: a check read off the first is held against all of them.
describe('a method held against every example', () => {
  const piece = (verdict: string, extra = ''): string => `## Summary\nIt adds a runner. It is small.\n\n## Must fix\nNone.\n\n${extra}## Verdict\n${verdict}\n`;
  const cases = (refs: readonly string[]) => refs.map((reference, i) => ({ id: `e${i + 1}.md`, task: 'Review this change.', material: [], reference }));
  const NOTE = '- Open with a Summary section.\n- Then a Must fix section.\n- End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
  it('a step every example holds keeps its check, and says how many it was held in', async () => {
    const { acrossExamples } = await import('../core/method/standard.js');
    const all = cases([piece('Approve'), piece('Request changes'), piece('Comment')]);
    const ps = acrossExamples(methodProposals(NOTE, all[0]), all.slice(1));
    expect(ps.filter((p) => p.measurement).map((p) => p.onExample)).toEqual(['held in all 3 of your examples', 'held in all 3 of your examples', 'held in all 3 of your examples']);
  });
  it('a step one example breaks stays the owner\'s rule, checked, with the count and the piece named', async () => {
    const { acrossExamples } = await import('../core/method/standard.js');
    const all = cases([piece('Approve'), piece('Looks fine to me'), piece('Comment')]);
    const verdict = acrossExamples(methodProposals(NOTE, all[0]), all.slice(1)).find((p) => p.statement.startsWith('End with'));
    expect(verdict).toMatchObject({ obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE' }, onExample: 'held in 2 of your 3 examples' });
    expect(verdict?.conflict).toContain('1 of your examples does not do this: e2.md');
  });
  it('what only the first example shows is that piece\'s own, and is dropped', async () => {
    const { acrossExamples } = await import('../core/method/standard.js');
    const all = cases([piece('Approve', '## Risks\nNone seen.\n\n## Rollback\nRevert the commit.\n\n'), piece('Approve'), piece('Comment')]);
    const lead = methodProposals(NOTE, all[0]);
    expect(lead.some((p) => p.origin === 'SHOWN_BY_EXAMPLE')).toBe(true);
    expect(acrossExamples(lead, all.slice(1)).some((p) => p.origin === 'SHOWN_BY_EXAMPLE')).toBe(false);
  });
  it('with one example nothing changes', async () => {
    const { acrossExamples } = await import('../core/method/standard.js');
    const lead = methodProposals(NOTE, cases([piece('Approve')])[0]);
    expect(acrossExamples(lead, [])).toEqual(lead);
  });
});

describe('which example the checks are read from, and which examples a check can be read on', () => {
  const piece = (sections: readonly string[]): string => sections.map((x) => `## ${x}\nSomething is said here about it.\n`).join('\n');
  const NOTE = '- Open with a Summary section.\n- Then a Must fix section.\n- End with a Verdict section.\n';
  it('the odd one out, first by name, is not what the checks are read from', async () => {
    const { proposalsAcross } = await import('../core/method/standard.js');
    const cases = [['Summary', 'Verdict'], ['Summary', 'Must fix', 'Verdict'], ['Summary', 'Must fix', 'Verdict'], ['Summary', 'Must fix', 'Verdict']]
      .map((x, i) => ({ id: `e${i + 1}.md`, task: 'Review this.', material: [], reference: piece(x) }));
    const { lead, proposals } = proposalsAcross(NOTE, cases);
    expect(lead).toBe(1);
    // the step is a check the first piece fails: it stays required, and the piece is named. Never a silent judgement
    expect(proposals.find((p) => p.statement.startsWith('Then a Must fix'))).toMatchObject({ obligation: 'DELIVERABLE', conflict: expect.stringContaining('e1.md') as string });
    expect(proposals.filter((p) => p.measurement).length).toBe(3);
  });
  it('a check against the material is read only on the examples that carry theirs', async () => {
    const { acrossExamples } = await import('../core/method/standard.js');
    const diff = '--- a/a.js\n+++ b/a.js\n@@ -1,0 +1,2 @@\n+const a = 1;\n+run(a);\n';
    const review = '## Must fix\n- a.js:2 runs too early.\n';
    const withIt = { id: 'e1.md', task: 'Review this.', material: [{ name: 'diff', text: diff }], reference: review };
    const without = { id: 'e2.md', task: 'Review this.', material: [], reference: review };
    const lines = acrossExamples(methodProposals('- Cite each item as path:line.\n', withIt), [without, { ...withIt, id: 'e3.md' }])[0];
    expect(lines).toMatchObject({ obligation: 'EXECUTION', onExample: 'held in all 2 of your 3 examples it can be read on (those that carry their material)' });
  });
});

// What the owner states as a count, or as exact words, is held as they said it.
describe('a rule stated as a count or as quoted words', () => {
  const sentence = 'You plug it in and the current pushes the charge across to the far side.';
  const example = { task: 'Explain a battery.', material: [], reference: `${Array.from({ length: 9 }, () => sentence).join(' ')}\n\nImagine a dam holding water uphill.\n\nIn short, a battery stores energy as a chemical gap.\n` };
  const check = (step: string): unknown => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.conflict ? 'to settle' : p.measurement ? [p.measurement.observer, p.measurement.params] : null; };
  it('a length, in the unit it was stated in', () => {
    expect(check('Between 100 and 230 words.')).toEqual(['LENGTH', { unit: ['words'], min: 100, max: 230 }]);
    expect(check('Keep it under 2,000 characters.')).toEqual(['LENGTH', { unit: ['characters'], max: 1999 }]);
    expect(check('Write at least 5 sentences.')).toEqual(['LENGTH', { unit: ['sentences'], min: 5 }]);
    expect(check('No sentence is longer than 25 words.')).toEqual(['LENGTH', { unit: ['sentence'], max: 25 }]);
  });
  it('the words a paragraph starts with, and a word never to use', () => {
    expect(check('The last paragraph is one short paragraph that starts with "In short,".')).toEqual(['PRESENCE', { in: ['last'], starts: ['In short,'] }]);
    expect(check('Never use the word "leverage" or "synergy".')).toEqual(['LEXICON', { terms: ['leverage', 'synergy'] }]);
  });
  it('a count the example itself breaks is the owner\'s to settle, not a rule', () => {
    expect(check('Between 300 and 400 words.')).toBe('to settle');
    expect(check('No sentence is longer than 8 words.')).toBe('to settle');
  });
  it('no number and no quoted words, or a rule about when: a judgement', () => {
    for (const step of ['Keep it short.', 'End on a takeaway the reader can use.', 'About 200 words unless the request asks for more.', 'Use at most 3 sentences when the topic is simple.', 'Speak to the reader as "you".'])
      expect(check(step), step).toBeNull();
  });
  it('the checks read as a person would count', async () => {
    const { measure } = await import('../core/observers/registry.js');
    expect(measure('One two three. Four five.', { observer: 'LENGTH', params: { unit: ['sentences'], min: 2, max: 3 } })).toMatchObject({ verdict: 'MET', detail: '2 sentences (2 to 3)' });
    expect(measure('A tweet of thirty-one characters', { observer: 'LENGTH', params: { unit: ['characters'], max: 30 } })).toMatchObject({ verdict: 'VIOLATED', detail: '32 characters (at most 30): long by 2' });
    const long = measure(`Short one. The ${Array.from({ length: 29 }, (_, i) => `w${i}`).join(' ')}.`, { observer: 'LENGTH', params: { unit: ['sentence'], max: 25 } });
    expect(long).toMatchObject({ verdict: 'VIOLATED', detail: '1 sentence(s) over 25 words (the longest: 30)' });
    expect(long.spans).toHaveLength(1);
  });
});

// An independent review of the first version: every one of these was read as a rule the owner did not write.
describe('a count or quoted words are read narrowly', () => {
  const sentence = 'You plug it in and the current pushes the charge across to the far side.';
  const example = { task: 'Explain a battery.', material: [], reference: `${Array.from({ length: 9 }, () => sentence).join(' ')}\n\nImagine a dam holding water uphill.\n\nIn short, a battery stores energy as a chemical gap.\n` };
  const check = (step: string): unknown => { const p = methodProposals(`- ${step}\n`, example)[0]; return p.conflict ? 'to settle' : p.measurement ? [p.measurement.observer, p.measurement.params] : null; };
  it('a negation is never read by its comparator alone', () => {
    for (const step of ['Never go over 100 words.', 'Do not write more than 100 words.', 'Never under 100 words.', 'Don\'t write less than 50 words.',
      'The last line never starts with "In conclusion".', 'The first sentence does not begin with "I".', 'The last paragraph cannot begin with "In short,".']) expect(check(step), step).toBeNull();
  });
  it('the plain forms are read, both ends where both are given', () => {
    expect(check('No more than 300 words.')).toEqual(['LENGTH', { unit: ['words'], max: 300 }]);
    expect(check('No fewer than 3 sentences and no more than 20 sentences.')).toEqual(['LENGTH', { unit: ['sentences'], min: 3, max: 20 }]);
    expect(check('At least 100 words and at most 200 words.')).toEqual(['LENGTH', { unit: ['words'], min: 100, max: 200 }]);
    expect(check('100–230 words.')).toEqual(['LENGTH', { unit: ['words'], min: 100, max: 230 }]);
  });
  it('the length of a part is not the length of the work', () => {
    for (const step of ['Each bullet is at most 12 words.', 'The summary section is under 50 words.', 'Give at most 3 examples of up to 20 words each.', 'The title has no more than 8 words.',
      'Open with a hook of under 15 words.', 'Include between 2 and 4 sentences of context before the ask.', 'Paragraphs of 3-5 sentences.', '200-300 words per section.',
      'No more than 2 sentences per paragraph.', 'Under 100 words for replies, under 300 words for posts.', 'Cap the intro at 100 words and the whole piece at 800 words.']) expect(check(step), step).toBeNull();
  });
  it('a soft or a conditional wording is a judgement', () => {
    for (const step of ['Ideally under 200 words.', 'Aim for at most 200 words.', 'Try to stay under 200 words.', 'Typically between 150 and 230 words.', 'Generally no more than 200 words.',
      'Prefer at most 200 words.', 'At most 200 words, excluding code.', '~150 words, at most 200 words.']) expect(check(step), step).toBeNull();
  });
  it('quoted words keep their apostrophe, every alternative is kept, and a ban ends its sentence', () => {
    expect(check('Never use the phrase "in today\'s world".')).toEqual(['LEXICON', { terms: ['in today\'s world'] }]);
    expect(check('The last paragraph starts with "In short," or "So,".')).toEqual(['PRESENCE', { in: ['last'], starts: ['In short,', 'So,'] }]);
    for (const step of ['Never use "very" in headings.', 'Don\'t use "very" twice.', 'Avoid using "we" in the first sentence.', 'Never say "sorry" without a reason.',
      'The first sentence of the last paragraph starts with "So".']) expect(check(step), step).toBeNull();
  });
  it('a length counts characters less front matter, and the longest sentence needs a limit', async () => {
    const { measure, observerFor } = await import('../core/observers/registry.js');
    expect(measure('---\ntitle: x\n---\nHello', { observer: 'LENGTH', params: { unit: ['characters'], max: 5 } })).toMatchObject({ verdict: 'MET', detail: '5 characters (at most 5)' });
    expect(observerFor('LENGTH').validate({ unit: ['sentence'], min: 3 })).toBe('the longest sentence needs max');
  });
});

// How the examples are written, counted with no model and offered beside the method.
describe('what the examples show about how they are written', () => {
  const sentence = (k: number): string => `The pump moves warmth from part ${k} of the loop to the room you sit in.`;
  const piece = (id: number, paras = 4) => ({ id: `e${id}.md`, reference: Array.from({ length: paras }, (_, p) => Array.from({ length: 5 }, (_x, k) => sentence(p * 5 + k + id)).join(' ')).join('\n\n') });
  it('from enough text, counts every piece meets are offered as shown, each a rule of style', async () => {
    const { countedFromExamples } = await import('../core/method/standard.js');
    const offered = countedFromExamples(Array.from({ length: 6 }, (_, i) => piece(i + 1)));
    expect(offered.length).toBeGreaterThan(0);
    for (const p of offered) expect(p).toMatchObject({ origin: 'SHOWN_BY_EXAMPLE', counted: true, conflict: null, onExample: 'set where all 6 of your examples meet it' });
    // never the length of a sentence: a count is not a rhythm
    expect(offered.map((p) => p.measurement?.observer)).not.toContain('SENTENCE_LENGTH');
    expect(offered.map((p) => p.measurement?.observer)).toContain('PARAGRAPH_LENGTH');
  });
  it('nothing from two pieces, or from too little text to count', async () => {
    const { countedFromExamples } = await import('../core/method/standard.js');
    expect(countedFromExamples([piece(1), piece(2)])).toEqual([]);
    expect(countedFromExamples([1, 2, 3].map((i) => ({ id: `t${i}.md`, reference: 'Shipped the fix at 2am. Nobody noticed. That is the job.' })))).toEqual([]);
  });
  it('the screen says them apart from the method, and the build keeps them as shown', async () => {
    const { describeMethod } = await import('../cli/commands/method.js');
    const { countedFromExamples } = await import('../core/method/standard.js');
    const lines = describeMethod(countedFromExamples(Array.from({ length: 6 }, (_, i) => piece(i + 1))), 'FULL_REPRO_CASE').join('\n');
    expect(lines).toContain('Counted from your examples, and not in your method: how they are written.');
    expect(lines).not.toContain('Shown by your example, and not in your method');
  });
});

// The length of one section: stated by the owner, or kept by every example. The study behind it: twelve HTML
// explainers whose "How it works" section ran 61 to 76 words, and outputs of 98 to 122 that nothing measured.
describe('how long one section runs', () => {
  const filler = (n: number): string => Array.from({ length: n }, (_, i) => `word${i % 9}`).join(' ') + '.';
  const page = (how: number, id: number) => ({ id: `e${id}.md`, task: 'Explain it.', material: [],
    reference: `<!doctype html>\n<html><head><style>p { margin: 0; color: #333; }</style></head><body>\n<h1>Topic ${id}</h1>\n<h2>What it is</h2>\n<p>${filler(30 + id)}</p>\n<h2>How it works</h2>\n<p>${filler(how)}</p>\n<h2>Why it matters</h2>\n<p>${filler(20 + id * 9)}</p>\n</body></html>\n` });
  const examples = [61, 68, 76, 64, 70].map((how, i) => page(how, i + 1));
  it('what every example keeps is offered as shown: the span holds the examples and not an output of 109 words', async () => {
    const { sectionLengthsFromExamples } = await import('../core/method/standard.js');
    const { measure } = await import('../core/observers/registry.js');
    const offered = sectionLengthsFromExamples(examples);
    const how = offered.find((p) => p.statement.startsWith('The How it works section'));
    expect(how).toMatchObject({ statement: 'The How it works section runs 61 to 76 words in my pieces.', counted: true, origin: 'SHOWN_BY_EXAMPLE',
      measurement: { observer: 'LENGTH', params: { unit: ['words'], in: ['How it works'], min: 46, max: 91 } } });
    for (const e of examples) expect(measure(e.reference, how!.measurement!).verdict, e.id).toBe('MET');
    expect(measure(page(109, 9).reference, how!.measurement!)).toMatchObject({ verdict: 'VIOLATED', detail: '"How it works": 109 words (46 to 91): long by 18' });
  });
  it('a section that doubles from one piece to the next has no usual length, and two pieces show none', async () => {
    const { sectionLengthsFromExamples } = await import('../core/method/standard.js');
    expect(sectionLengthsFromExamples(examples).some((p) => p.statement.startsWith('The Why it matters section'))).toBe(false);
    expect(sectionLengthsFromExamples(examples.slice(0, 2))).toEqual([]);
  });
  it('a stated length of a section is held of that section, and only in the plain forms', () => {
    const check = (step: string): unknown => { const p = methodProposals(`- ${step}\n`, examples[0])[0]; return p.conflict ? 'to settle' : p.measurement ? [p.measurement.observer, p.measurement.params] : null; };
    expect(check('Keep the How it works section under 80 words.')).toEqual(['LENGTH', { unit: ['words'], in: ['How it works'], need: 1, max: 79 }]);
    expect(check('The What it is section is between 20 and 60 words.')).toEqual(['LENGTH', { unit: ['words'], in: ['What it is'], need: 1, min: 20, max: 60 }]);
    expect(check('Keep the How it works section under 40 words.')).toBe('to settle');
    for (const step of ['Ideally the How it works section is under 80 words.', 'The How it works section is never over 80 words.', 'Each section is under 80 words.', 'The Mechanics section is under 80 words.'])
      expect(check(step), step).toBeNull();
  });
  it('a text without the section is another rule\'s to fail', async () => {
    const { measure } = await import('../core/observers/registry.js');
    expect(measure('## Other\nSome words here.\n', { observer: 'LENGTH', params: { unit: ['words'], in: ['How it works'], max: 80 } })).toMatchObject({ verdict: 'NOT_APPLICABLE', detail: 'no "How it works" section to measure' });
  });
});

// An independent review of the section lengths and of the counted rules.
describe('what a review of the section lengths found', () => {
  const body = (n: number): string => Array.from({ length: n }, (_, i) => `word${i % 9}`).join(' ') + '.';
  it('a step about something else that mentions a section states no length of it', () => {
    const example = { task: 'Review.', material: [], reference: `## Summary\n${body(12)}\n\n## Verdict\n${body(8)}\n` };
    for (const step of ['Unlike the Summary section, keep the whole piece under 200 words.', 'After the Summary section write at least 300 words.', 'The Summary section has at most 3 bullets and the piece is under 500 words.',
      'Each sentence in the Summary section is under 20 words.', 'The Summary section links to a page of at most 500 words.']) expect(methodProposals(`- ${step}\n`, example)[0].measurement, step).toBeNull();
  });
  it('sections written as bare names are measured one at a time, not to the end of the work', async () => {
    const { sectionBodyOf } = await import('../core/observers/structure.js');
    const { proseWords } = await import('../core/observers/style.js');
    const note = `Summary\n\n${body(10)}\n\nVerdict\n\n${body(20)}\n\nRisks\n\n${body(30)}\n`;
    expect(proseWords(sectionBodyOf(note, 'Summary', true, ['Summary', 'Verdict', 'Risks']) ?? '')).toBe(10);
    expect(proseWords(sectionBodyOf(note, 'Verdict', true, ['Summary', 'Verdict', 'Risks']) ?? '')).toBe(20);
  });
  it('the section of that name is measured, before one whose name only holds it', async () => {
    const { sectionBodyOf } = await import('../core/observers/structure.js');
    const { proseWords } = await import('../core/observers/style.js');
    const text = `## Executive summary\n${body(40)}\n\n## Summary\n${body(7)}\n`;
    expect(proseWords(sectionBodyOf(text, 'Summary') ?? '')).toBe(7);
  });
  it('a stated length is not met by leaving the section out; one only shown does not apply', async () => {
    const { measure } = await import('../core/observers/registry.js');
    const text = `## Other\n${body(5)}\n`;
    expect(measure(text, { observer: 'LENGTH', params: { unit: ['words'], in: ['Summary'], need: 1, max: 80 } }).verdict).toBe('VIOLATED');
    expect(measure(text, { observer: 'LENGTH', params: { unit: ['words'], in: ['Summary'], max: 80 } }).verdict).toBe('NOT_APPLICABLE');
  });
  it('a section every piece writes word for word alike has no length to offer, a stated one is not offered again, and no more than six are', async () => {
    const { sectionLengthsFromExamples, countedOffers } = await import('../core/method/standard.js');
    const piece = (id: number, n: number) => ({ id: `e${id}.md`, reference: `## Summary\n${body(n)}\n\n## Verdict\nRequest changes\n` });
    const cases = [piece(1, 20), piece(2, 24), piece(3, 28)];
    expect(sectionLengthsFromExamples(cases).map((p) => p.statement)).toEqual(['The Summary section runs 20 to 28 words in my pieces.']);
    const stated = methodProposals('- Keep the Summary section under 40 words.\n', { task: 'x', material: [], reference: cases[0].reference });
    expect(countedOffers(stated, cases).some((p) => p.statement.startsWith('The Summary section'))).toBe(false);
    const many = (id: number) => ({ id: `m${id}.md`, reference: Array.from({ length: 9 }, (_, k) => `## Part ${'ABCDEFGHI'[k]}\n${body(20 + id + k)}\n`).join('\n') });
    expect(countedOffers([], [many(1), many(2), many(3)]).length).toBeLessThanOrEqual(6);
  });
});
