// tests/atelier-citation-steps.test.ts — A JUDGEMENT STEP CODE CAN READ IN PART IS READ BY CODE, WITHOUT A MODEL.
//
// A review method says "cite the file and line for every finding" and "name the test that would have caught it".
// Each was left to judgement unless it named the path:line form, and a review with a finding that pointed at nothing
// passed with a tick beside the rule. Now a step that asks for citations, however worded, is held by looking each one
// up; one that asks for one on every finding reads each finding for one; and one that asks the work to name a test
// looks for the name. Each is read in part, always: whether the cited line supports the finding, and whether the
// named test is the right one, stay the owner's, and a pass alone never verifies the work.
import { describe, it, expect } from 'vitest';
import { methodProposals } from '../core/method/standard.js';
import { citesPlaces, namesTest, sectionsMentioned } from '../core/method/step-readers.js';
import { citesLines } from '../core/loop/locators.js';
import { measure } from '../core/observers/registry.js';
import { findingsOf } from '../core/observers/obligations.js';
import { observesOf } from '../core/eval/observes.js';
import { planFor } from '../core/plan/execution-plan.js';
import { buildRecord } from '../core/eval/record-build.js';
import type { Requirement } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const DIFF = '--- a/src/client.ts\n+++ b/src/client.ts\n@@ -80,0 +81,6 @@\n+export function send(req, options) {\n+  let attempts = 0;\n+  while (true) {\n+    attempts += 1;\n+    if (attempts > options.maxRetries) break;\n+  }\n';
const REVIEW = '## Verdict\nNot correct.\n\n## Findings\n- src/client.ts:85 treats maxRetries 0 as retry forever.\n- src/client.ts:81 changes the public signature of send.\n\n## Test\n`test_zero_retries` in client.test.ts would have caught it.\n';
const example = { task: 'Review this change.', material: [{ name: 'diff', text: DIFF }], reference: REVIEW };
const first = (step: string) => methodProposals(`- ${step}\n`, example)[0];
const check = (step: string): unknown => { const m = first(step).measurement; return m ? [m.observer, m.params] : null; };

describe('a step about citing places, however it is worded, is held by looking each citation up', () => {
  it('the wordings owners use are read as the citation check', () => {
    for (const step of ['Cite only lines in the diff.', 'Point to the line.', 'Reference the changed line.', 'Quote the line you mean.', 'Give the file and line.', 'Cite as path:line.'])
      expect(check(step), step).toEqual(['LINES', { min: 0 }]);
  });
  it('one that asks for a citation on every finding reads each finding for one', () => {
    for (const step of ['Every claim about the code points at the code.', 'Each comment cites its line.', 'Cite the file and line for every remark.', 'Cite each item as path:line.'])
      expect(check(step), step).toEqual(['LINES', { min: 0, perItem: 1 }]);
    // and where the example has a section of that name, the findings are the items under it
    for (const step of ['Every finding points at the code.', 'Each finding cites its line.', 'Cite the file and line for every finding.'])
      expect(check(step), step).toEqual(['LINES', { min: 0, perItem: 1, sections: ['Findings'] }]);
  });
  it('where the step names one of the example\'s sections, the findings are the items under it', () => {
    const reviewed = { ...example, reference: '## Blocking Issues\n- src/client.ts:85 retries forever.\n\n## Nits\n- rename it.\n' };
    const m = methodProposals('- Each blocking issue cites the file path with a line number.\n', reviewed)[0].measurement;
    expect(m).toEqual({ observer: 'LINES', params: { min: 0, perItem: 1, sections: ['Blocking Issues'] } });
    expect(sectionsMentioned('Cite each Must fix item as path:line.', ['Summary', 'Must fix', 'Verdict'])).toEqual(['Must fix']);
  });
  it('a step that forbids the form, or asks for it only sometimes, stays a judgement', () => {
    for (const step of ['Do not cite as path:line; link to the file instead.', 'Never point to a line in the summary.', 'Point to the line where there is one.', 'If a finding is about code, give the file and line.', 'Quote the line unless it is long.'])
      expect(check(step), step).toBeNull();
  });
  it('the word "line" alone cites nothing', () => {
    for (const step of ['Start with a one-line summary of what the change does.', 'Keep every sentence under one line.', 'Quote the offending code exactly as it stands in the diff, in inline code.'])
      expect(check(step), step).toBeNull();
    // a line that names a section is that section's check, not a citation
    expect(check('End with a Verdict line.')).toEqual(['PRESENCE', expect.objectContaining({ sections: ['Verdict'] }) as unknown]);
    expect(citesPlaces('Open with a one-line summary.', citesLines)).toBeNull();
  });
  it('the statement, in the owner\'s words, is the step; only its check changed', () => {
    const p = first('Every finding points at the code.');
    expect(p).toMatchObject({ statement: 'Every finding points at the code.', origin: 'STATED', obligation: 'EXECUTION', conflict: null });
  });
});

describe('each finding is read for a citation (LINES perItem)', () => {
  const lines = (text: string, params: Record<string, number | string[]> = { min: 0, perItem: 1 }) => measure(text, { observer: 'LINES', params }, { request: 'Review this change.', material: [{ name: 'diff', text: DIFF }] });
  it('a review whose every finding cites a real line is MET', () => {
    expect(lines(REVIEW)).toMatchObject({ verdict: 'MET', detail: expect.stringContaining('2 of 2 finding(s) point at a line') as string });
  });
  it('a finding that points at no line fails with its own span and says so', () => {
    const r = lines('## Findings\n- src/client.ts:85 treats maxRetries 0 as retry forever.\n- The loop never checks the response status.\n');
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toEqual([{ start: 71, end: 113, text: 'The loop never checks the response status.', why: 'this finding points at no line' }]);
    expect(r.detail).toContain('1 of 2 finding(s) point at a line (1 at none)');
  });
  it('a citation that is no line still fails, beside a finding with none', () => {
    const r = lines('## Issues\n- src/client.ts:85 retries forever.\n- src/client.ts:999 is never reached by the tests.\n- Nothing guards the options argument against null.\n');
    expect(r.spans.map((s) => s.why)).toEqual(['src/client.ts:999 is no such line in the material', 'this finding points at no line']);
  });
  it('"None." and "no issues found" are not findings, and a review with nothing to find holds the step', () => {
    expect(lines('## Findings\nNone.\n').verdict).toBe('MET');
    expect(lines('## Risks\n- No issues found in the retry loop.\n').verdict).toBe('MET');
    expect(lines('## Summary\nThe change adds backoff to the client and keeps its tests green.\n').verdict).toBe('MET');
  });
  it('under a findings heading with no list, each paragraph is a finding', () => {
    expect(findingsOf('## Problems\nThe loop at src/client.ts:85 has no upper bound when maxRetries is 0.\n\nThe new parameter changes the public signature without a changelog entry.\n').map((f) => f.text.slice(0, 12))).toEqual(['The loop at ', 'The new para']);
    expect(lines('## Problems\nThe loop at src/client.ts:85 has no upper bound.\n\nThe new parameter changes the signature without a note.\n').spans.map((s) => s.text)).toEqual(['The new parameter changes the signature without a note.']);
  });
  it('with no findings heading, every list item is a finding; prose is not', () => {
    expect(lines('The change is small.\n\n- src/client.ts:85 retries forever.\n- The handler swallows the error.\n').spans.map((s) => s.text)).toEqual(['The handler swallows the error.']);
    expect(lines('The change is small and the handler swallows the error, which nobody will see.\n').verdict).toBe('MET');
  });
  it('a sub-bullet carries its parent\'s citation, and code blocks are not findings', () => {
    expect(lines('## Findings\n- The retry loop has no bound.\n  - see src/client.ts:85\n\n```\n- not a finding\n```\n').verdict).toBe('MET');
  });
  it('with sections named, only the items under them are read', () => {
    const text = '## Blocking Issues\n- src/client.ts:85 retries forever.\n\n## Next Steps\n1. Rebase on main.\n';
    expect(lines(text, { min: 0, perItem: 1, sections: ['Blocking Issues'] }).verdict).toBe('MET');
    expect(lines('## Blocking Issues\n- The loop retries forever and never checks the status.\n', { min: 0, perItem: 1, sections: ['Blocking Issues'] }).verdict).toBe('VIOLATED');
  });
  it('a review written with labels, not headings, is read by its labels', () => {
    expect(lines('BLOCKING:\n- src/client.ts:85 retries forever.\n\nNITS:\n- Rename attempts to tries.\n', { min: 0, perItem: 1, sections: ['Blocking'] }).verdict).toBe('MET');
  });
  it('without perItem the check reads exactly as before', () => {
    expect(lines('## Findings\n- The loop never checks the status.\n', { min: 0 }).verdict).toBe('MET');
    expect(measure('x', { observer: 'LINES', params: { min: 0, sections: ['a'] } }, {}).verdict).toBeDefined();
  });
});

describe('the work names a test (NAMES_TEST)', () => {
  const names = (text: string) => measure(text, { observer: 'NAMES_TEST', params: {} });
  it('a test file, a test name in backticks, or "test" before a backticked name is a named test', () => {
    for (const text of ['A case in client.test.ts would have caught it.', 'Add `test_zero_retries` beside the others.', 'The test `retries once then stops` covers it.', 'test_retry.py misses the zero case.', 'A spec in retry.spec.js would catch it.', '`shouldStopAtZero` in the client suite.'])
      expect(names(text).verdict, text).toBe('MET');
  });
  it('a text that names none fails with no span, and says what is missing', () => {
    for (const text of ['Tests should cover this.', 'Add a test for the zero case.', 'The client is tested elsewhere.', '```\nclient.test.ts\n```\nNothing named outside the code.'])
      expect(names(text), text).toMatchObject({ verdict: 'VIOLATED', spans: [], detail: 'no test is named' });
  });
  it('is mapped from a step that asks the work to name, add, write, propose or suggest a test, and not under a condition', () => {
    for (const step of ['Name the test that would have caught it.', 'Suggest a test for each fix.', 'Write the test\'s name in backticks.', 'Propose tests for the change.', 'Add a test case for the bug.'])
      expect(check(step), step).toEqual(['NAMES_TEST', {}]);
    for (const step of ['Ask whether the change needs a test, and say which test if it does.', 'Never name a test you did not run.', 'Name the test where one exists.', 'Test Coverage is a table with the columns Scenario, Covered and Where.', 'Put between 3 and 6 rows in the Test Coverage table.', 'Add a Test Coverage section.'])
      expect(check(step), step).not.toEqual(['NAMES_TEST', {}]);
    expect(namesTest('Write the Test Coverage table first.')).toBe(false);
    expect(first('Name the test that would have caught it.')).toMatchObject({ obligation: 'DELIVERABLE', conflict: null });
  });
});

describe('each is read in part, so a pass alone never verifies', () => {
  const stated = (id: string, statement: string, measurement: Requirement['measurement'] | null, o: Partial<Requirement> = {}): Requirement =>
    aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', ...(measurement ? { measurement } : {}), ...o });
  const CITES = stated('m2', 'Cite the file and line for every finding.', { observer: 'LINES', params: { min: 0, perItem: 1 } }, { obligation: 'EXECUTION' });
  const TEST = stated('m3', 'Name the test that would have caught it.', { observer: 'NAMES_TEST', params: {} }, { obligation: 'DELIVERABLE' });
  const VERDICT = stated('m1', 'Say whether the change is correct.', null, { obligation: 'JUDGEMENT', materiality: null });
  it('coverage is PARTIAL, with the part not read named', () => {
    expect(observesOf(CITES.statement, CITES.measurement, false)).toEqual({ proposition: 'every path:line cited is a line of the material with something on it, and every finding carries one', coverage: 'PARTIAL', unchecked: 'whether the cited line supports the claim' });
    expect(observesOf(TEST.statement, TEST.measurement, false)).toEqual({ proposition: 'the work names a test (a test file, or a test function or case in backticks)', coverage: 'PARTIAL', unchecked: 'whether the named test is the right one' });
    expect(observesOf('x', { observer: 'LINES', params: { min: 0 } }, false)?.unchecked).toBe('whether each item carries a citation, and whether the cited line is the right one');
  });
  it('a miss of either is written again, never rewritten sentence by sentence', () => {
    const plan = planFor({ requirements: [CITES, TEST, VERDICT] });
    expect(plan.rules.map((p) => [p.id, p.role, p.enforced, p.onMiss])).toEqual([['m2', 'RULE', true, 'REDRAFT'], ['m3', 'RULE', true, 'REDRAFT'], ['m1', 'JUDGEMENT', false, 'NONE']]);
  });
  const record = (lines: { id: string; verdict: 'MET' | 'VIOLATED'; detail: string }[], reqs: Requirement[] = [CITES, TEST, VERDICT]) =>
    buildRecord({ requirements: reqs, checked: lines.map((l) => ({ ...l, required: true })), waived: new Map(), request: null, claims: null, copying: null });
  it('two checks held and one judgement: NEEDS_REVIEW, with the judgement in the owner\'s words and nothing read of it', () => {
    const r = record([{ id: 'm2', verdict: 'MET', detail: 'held' }, { id: 'm3', verdict: 'MET', detail: 'names a test: client.test.ts' }]);
    expect(r.state).toBe('NEEDS_REVIEW');
    expect(r.entries.map((e) => [e.id, e.result, e.reason])).toEqual([['m2', 'UNVERIFIED', 'PARTLY_CHECKED'], ['m3', 'UNVERIFIED', 'PARTLY_CHECKED'], ['m1', 'UNVERIFIED', 'NOT_MACHINE_CHECKABLE']]);
    expect(r.entries[2]).toMatchObject({ statement: 'Say whether the change is correct.', required: true, observation: { proposition: null, coverage: 'NONE' } });
  });
  it('with no judgement step at all, two PARTIAL checks that held are still NEEDS_REVIEW, never VERIFIED', () => {
    expect(record([{ id: 'm2', verdict: 'MET', detail: 'held' }, { id: 'm3', verdict: 'MET', detail: 'held' }], [CITES, TEST]).state).toBe('NEEDS_REVIEW');
  });
  it('a finding at no line, or no test named, blocks', () => {
    expect(record([{ id: 'm2', verdict: 'VIOLATED', detail: '1 at none' }, { id: 'm3', verdict: 'MET', detail: 'held' }]).state).toBe('BLOCKED');
    expect(record([{ id: 'm2', verdict: 'MET', detail: 'held' }, { id: 'm3', verdict: 'VIOLATED', detail: 'no test is named' }]).state).toBe('BLOCKED');
  });
});

describe('a verdict step', () => {
  it('names its options: a check; names none: a judgement, in the owner\'s words', () => {
    const named = first('End with a Verdict section that holds one of: Approve, Request changes, Comment.');
    expect(named.measurement).toMatchObject({ observer: 'PRESENCE', params: { options: ['Approve', 'Request changes', 'Comment'] } });
    const open = first('Say whether the change is correct.');
    expect(open).toMatchObject({ statement: 'Say whether the change is correct.', obligation: 'JUDGEMENT', measurement: null });
  });
});
