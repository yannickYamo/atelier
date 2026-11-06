// tests/atelier-run-report-fixes.test.ts — WHAT A TESTER'S RUN OF THE DIRECT WRITER FOUND IN THE MACHINERY.
//
// 1. "three paragraphs per section" had no check that counts it: the menu offered LENGTH in paragraphs and the observer
//    refused the unit, so the step was read as three sentences per paragraph and a piece written to it was flagged;
// 2. the method's checks ran on the direct path and only a broken required rule was said: the rest looked unrun;
// 3. small invented details beside the notes: "five or six" was not counted, a count in words was not listed where a
//    model read the claims, and a line mostly copied from the notes was dropped with the detail the reader named in it.
// (The editor's questions, kept by what they read and by the request they were answered for: tests/atelier-direct.test.ts.)
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { measure as observe, validateMeasurement } from '../core/observers/registry.js';
import { parseMeasureSpec } from '../core/measurement/spec.js';
import { paragraphsIn } from '../core/observers/obligations.js';
import { spelledCounts } from '../core/loop/numbers.js';
import { checkDraft, CLAIMS_TO_CHECK } from '../core/loop/run-repair.js';
import type { ClaimSensor } from '../core/loop/claim-extract.js';
import { toCheckOf, rulesLines } from '../cli/direct.js';
import type { Entry } from '../core/eval/record.js';

const para = (n: number, tag: string): string => Array.from({ length: n }, (_, i) => `${tag} paragraph ${i + 1} says one thing. It says it plainly.`).join('\n\n');
const PIECE = (counts: number[]): string => `# Title\n\nAn opening before any section.\n\n${counts.map((n, i) => `## Part ${i + 1}\n\n${para(n, `P${i + 1}`)}`).join('\n\n')}\n`;
const EACH3 = (): NonNullable<ReturnType<typeof parseMeasureSpec>['measurement']> => {
  const m = parseMeasureSpec('LENGTH:unit=PARAGRAPHS,min=3,max=3,in=each').measurement;
  if (!m) throw new Error('not parsed');
  return m;
};

describe('1. paragraphs per section are counted as paragraphs, in every section', () => {
  it('a paragraph is a block between blank lines; a heading, a table and code are none, a list is one', () => {
    expect(paragraphsIn('One.\n\nTwo.\nStill two.\n\n## A heading\n\n- a\n- b\n\n| x |\n|---|\n\n```\ncode\n\nmore\n```\n\nThree... four.')).toBe(4);
  });
  it('a piece with three paragraphs in each section holds the step', () => {
    const r = observe(PIECE([3, 3, 3]), EACH3());
    expect(r.verdict).toBe('MET');
    expect(r.detail).toBe('all 3 section(s) at 3 paragraphs');
  });
  it('a section of four fails, named, with its heading as the place', () => {
    const text = PIECE([3, 4, 3]);
    const r = observe(text, EACH3());
    expect(r.verdict).toBe('VIOLATED');
    expect(r.detail).toBe('1 of 3 section(s) not at 3 paragraphs: "Part 2" has 4');
    expect(r.spans.map((s) => text.slice(s.start, s.end))).toEqual(['Part 2']);
  });
  it('the whole text counts its paragraphs too, and in=each takes paragraphs only', () => {
    const m = parseMeasureSpec('LENGTH:unit=PARAGRAPHS,max=3').measurement;
    expect(m && observe('A.\n\nB.\n\nC.\n\nD.', m).detail).toBe('4 paragraphs (at most 3): long by 1');
    expect(parseMeasureSpec('LENGTH:unit=WORDS,max=3,in=each').problem).toContain('in=each counts the paragraphs of every section');
    expect(validateMeasurement(EACH3())).toBeNull();
  });
});

describe('2. each of the author\'s rules is said with the piece', () => {
  const e = (statement: string, result: Entry['result'], reason: Entry['reason'], found?: 'MET' | 'VIOLATED'): Entry => ({
    id: statement.slice(0, 4), dimension: 'STANDARD', source: 'METHOD', statement, required: false, result, reason,
    observation: { proposition: null, coverage: 'FULL', qualification: 'DETERMINISTIC', evidence: null, ...(found ? { found } : {}) },
  });
  it('held, not held, found by a check not yet qualified, and the steps no check reads', () => {
    expect(rulesLines([
      e('No em dashes.', 'PASS', 'MET'), e('Plain headings, no captions.', 'FAIL', 'NOT_MET'),
      e('No ask at the end.', 'UNVERIFIED', 'OBSERVER_UNQUALIFIED', 'VIOLATED'), e('Give every feature its reason.', 'UNVERIFIED', 'NOT_MACHINE_CHECKABLE'),
      { ...e('x', 'PASS', 'MET'), dimension: 'REQUEST' },
    ])).toEqual([
      'Your rules on this piece (4):',
      '  held (1): "No em dashes."',
      '  not held (1): "Plain headings, no captions."',
      '  a check not yet qualified found it broken (blocks nothing) (1): "No ask at the end."',
      '  no check reads it: yours to judge (1): "Give every feature its reason."',
    ]);
    expect(rulesLines([])).toEqual([]);
  });
});

describe('3. small invented details are listed', () => {
  it('a range in words is a count when its second number is', () => {
    expect(spelledCounts('We onboarded five or six teams last year.').sort()).toEqual(['5', '6']);
    expect(spelledCounts('It takes three to four weeks.')).toEqual([]);
  });
  it('where nothing is cut, a count in words a qualified reader passed is listed all the same', () => {
    const sensor: ClaimSensor = { instrument: 'reader', read: () => Promise.resolve(), reading: () => ({ claims: [], publicFacts: [], instrument: 'reader' }),
      notes: [], version: 'v', qualified: true, gate: 'reader', degraded: false, spentUsd: 0 };
    const v = { standardVersionHash: 'h', requirements: [] } as never;
    const text = 'We tried it. We moved eleven or twelve teams over to it.';
    const listed = (o: Record<string, unknown>): string[] => checkDraft('s', v, text, { material: 'notes about the tool', claimSensor: sensor, ...o })
      .checked.filter((c) => c.requirementId === CLAIMS_TO_CHECK).flatMap((c) => c.result.spans.map((sp) => sp.text));
    expect(listed({ listWordCounts: true })).toEqual(['We moved eleven or twelve teams over to it.']);
    // where a qualified reader's reading decides alone (the compiled path), it is as before
    expect(listed({})).toEqual([]);
  });
  const notes = 'Why it matters: Agents read the CRM every morning before the stand-up and plan the day from it.';
  const report = (spans: { text: string; specific?: string }[]): never => ({ checked: [
    { requirementId: 'UNSOURCED·check', result: { verdict: 'VIOLATED', spans: spans.map((s, i) => ({ start: i, end: i + 1, why: 'x', ...s })) } },
  ] }) as never;
  it('a line mostly from the notes stays listed when the detail the reader named is not in them', () => {
    const s = 'Agents read the CRM every morning before the stand-up and plan the day from it, this afternoon too.';
    expect(toCheckOf(report([{ text: s, specific: 'this afternoon' }]), notes)).toEqual([{ sentence: s, specific: 'this afternoon' }]);
    // the same line with nothing named, or with a named part the notes hold, is given
    expect(toCheckOf(report([{ text: s }]), notes)).toEqual([]);
    expect(toCheckOf(report([{ text: s, specific: 'every morning' }]), notes)).toEqual([]);
  });
});
