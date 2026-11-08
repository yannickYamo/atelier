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
import { timeAnchors } from '../core/loop/claims.js';
import { checkDraft, CLAIMS_TO_CHECK } from '../core/loop/run-repair.js';
import { distanceOf } from '../core/loop/repair.js';
import type { ClaimSensor } from '../core/loop/claim-extract.js';
import { toCheckOf, rulesLines, keptReading } from '../cli/direct.js';
import { supersessionReason } from '../cli/commands/ratify.js';
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

describe('1b. what a section is, for that count', () => {
  const three = 'A one.\n\nA two.\n\nA three.';
  it('a setext underline and a label\'s line belong to the heading, never a paragraph', () => {
    expect(observe(`Intro.\n\nOne\n---\n\n${three}\n\nTwo\n---\n\n${three}\n`, EACH3()).verdict).toBe('MET');
    const m = parseMeasureSpec('LENGTH:unit=PARAGRAPHS,min=3,max=3,in=each,labels=1').measurement;
    expect(m && observe(`Summary:\n\n${three}\n\nRisks:\n\n${three}\n`, m).detail).toBe('all 2 section(s) at 3 paragraphs');
  });
  it('a heading with parts under it is not itself a section, intro or not', () => {
    expect(observe(`## Part\n\nAn intro.\n\n### Sub one\n\n${three}\n\n### Sub two\n\n${three}\n`, EACH3()).detail).toBe('all 2 section(s) at 3 paragraphs');
  });
  it('front matter is no paragraph', () => {
    expect(paragraphsIn(`---\ntitle: x\n---\n\n${three}`)).toBe(3);
  });
  it('the value is how far off the sections are, so a repair that puts more off reads further', () => {
    expect(observe(PIECE([3, 4, 3]), EACH3()).value).toBe(1);
    expect(observe(PIECE([1, 5, 3]), EACH3()).value).toBe(4);
    expect(distanceOf({ requirementId: 'r', observer: 'LENGTH', result: observe(PIECE([1, 5, 3]), EACH3()) } as never, () => EACH3().params)).toEqual({ kind: 'value', d: 4 });
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
    // every rule is under one line, so the count adds up
    expect(rulesLines([e('Open on the pain.', 'NOT_APPLICABLE', 'DOES_NOT_APPLY'), e('Plain words.', 'UNVERIFIED', 'OBSERVER_UNQUALIFIED')]))
      .toEqual(['Your rules on this piece (2):', '  a check not yet qualified could not read it (1): "Plain words."', '  does not apply to this piece (1): "Open on the pain."']);
  });
});

describe('3. small invented details are listed', () => {
  it('a range in words is a count when its second number is', () => {
    expect(spelledCounts('We onboarded five or six teams last year.').sort()).toEqual(['5', '6']);
    expect(spelledCounts('It takes three to four weeks.')).toEqual([]);
    expect(spelledCounts('We hired one or two engineers.').sort()).toEqual(['1', '2']);
    expect(spelledCounts('Two or three or four teams joined.').sort()).toEqual(['2', '3', '4']);
    expect(spelledCounts('Three or four in ten developers agree.').sort()).toEqual(['10', '3', '4']);
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
  it('a count in the method\'s rules is no source for the same count in the piece', () => {
    const v = { standardVersionHash: 'h', requirements: [] } as never;
    const text = 'We tried it. We moved five or six teams over to it.';
    const listed = (o: Record<string, unknown>): string[] => checkDraft('s', v, text, o)
      .checked.filter((c) => c.requirementId === CLAIMS_TO_CHECK).flatMap((c) => c.result.spans.map((sp) => sp.text));
    const evidence = 'notes about the tool';
    const rules = 'Write each paragraph in 5 to 6 sentences.';
    expect(listed({ material: `${evidence}\n\n\`\`\`\n${rules}\n\`\`\``, evidence })).toEqual(['We moved five or six teams over to it.']);
    // a count the notes hold is theirs
    expect(listed({ material: 'We moved 5 or 6 teams.', evidence: 'We moved 5 or 6 teams.' })).toEqual([]);
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

describe('4. a kept editor reading is served only whole', () => {
  it('a question missing its options, or a reading of another shape, is read again', () => {
    const q = { id: 'idea', ask: 'What idea?', options: ['a', 'b'], default: 'a' };
    expect(keptReading({ value: { decisions: [], questions: [q] }, by: 'model' })).toEqual({ value: { decisions: [], questions: [q] }, by: 'model' });
    expect(keptReading({ value: { decisions: [], questions: [{ ...q, options: undefined }] }, by: 'model' })).toBeNull();
    expect(keptReading({ value: { questions: [q] }, by: 'model' })).toBeNull();
    expect(keptReading(null)).toBeNull();
  });
});

describe('5. a skill built again is one command', () => {
  it('a close a build makes over a standard records the build as its reason; one typed by hand is asked', () => {
    expect(supersessionReason('old', null, 'new')).toBe('built again with atelier new');
    expect(supersessionReason('old', 'my reason', 'new')).toBe('my reason');
    expect(supersessionReason('old', null, 'ratify-close')).toBeNull();
    expect(supersessionReason(null, null, 'new')).toBeNull();
  });
});

describe('6. the three phrases a replay of stored drafts found unlisted', () => {
  const v = { standardVersionHash: 'h', requirements: [] } as never;
  const listed = (text: string, o: Record<string, unknown> = {}): string[] => checkDraft('s', v, text, { material: 'notes about the tool', evidence: 'notes about the tool', ...o })
    .checked.filter((c) => c.requirementId === CLAIMS_TO_CHECK).flatMap((c) => c.result.spans.map((sp) => sp.text));
  const A = 'Start from the five or six pieces you are proud of.';
  const B = 'I read across fifty pieces before I wrote a word.';
  const C = 'I rewrote the opening this afternoon.';
  it('all three are listed, in the pattern check and beside a model reader', () => {
    expect(listed(`${A} ${B} ${C}`)).toEqual([A, B, C]);
    const sensor: ClaimSensor = { instrument: 'reader', read: () => Promise.resolve(), reading: () => ({ claims: [], publicFacts: [], instrument: 'reader' }),
      notes: [], version: 'v', qualified: true, gate: 'reader', degraded: false, spentUsd: 0 };
    expect(listed(`${A} ${B} ${C}`, { claimSensor: sensor, listWordCounts: true })).toEqual([A, B, C]);
  });
  it('a moment or a count the notes give is theirs', () => {
    expect(listed(C, { material: 'I rewrote the opening this afternoon.', evidence: 'I rewrote the opening this afternoon.' })).toEqual([]);
    expect(listed(B, { material: 'I read 50 pieces.', evidence: 'I read 50 pieces.' })).toEqual([]);
  });
  it('a piece\'s own structure, a span of time and hyperbole stay unlisted', () => {
    expect(spelledCounts('Here are three reasons it works.')).toEqual([]);
    expect(spelledCounts('Ten tips follow.')).toEqual([]);
    expect(spelledCounts('It takes three to four weeks.')).toEqual([]);
    expect(spelledCounts('A hundred small decisions make a product.')).toEqual([]);
    expect(timeAnchors('This week we look at the queue. Today teams plan in it.')).toEqual([]);
  });
  it('the moments read', () => {
    expect(timeAnchors('Last week, and two months ago, and yesterday morning, and a few days ago; not "this afternoon" quoted.'))
      .toEqual(['last week', 'two months ago', 'yesterday morning', 'a few days ago']);
  });
});
