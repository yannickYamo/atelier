// tests/atelier-claim-counts.test.ts — A COUNT WRITTEN IN WORDS IS A FIGURE, LISTED AND NEVER CUT.
//
// A delivered draft said "three of your prospects will believe the products overlap" and "Twelve-plus
// optimizers": counts of people and of competitors the material never gave. The pattern check read only
// digits, so `patternSensor(...).reading(text)` returned no claims for either, while the reader's own
// definition of FIGURE ("nine people", "47 of them") and `numbersIn` already read spelled-out numbers.
// A first fix cut such sentences, and a review found the cut landing on true ones: "It took two weeks",
// "I have two kids", "There are three reasons this matters". So the pattern check reads a spelled-out count
// as the same figure the reader would, supported by the same value in the material in words or in digits,
// and lists it for the person to check (UNSOURCED·check) without ever failing or cutting a draft on it.

import { describe, it, expect } from 'vitest';
import { patternSensor, numbersIn } from '../core/loop/claim-extract.js';
import { unsourcedClaims, wordCountClaims } from '../core/loop/claims.js';
import { spelledCounts } from '../core/loop/numbers.js';
import { checkDraft, enforceClaims, CLAIMS_TO_CHECK } from '../core/loop/run-repair.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 'h', requirements: [] } as unknown as StandardVersion;
const listed = (text: string, material = ''): string[] => (patternSensor(material, false).reading(text).listed ?? []).map((c) => c.text);
const cut = (text: string, material = ''): string[] => patternSensor(material, false).reading(text).claims.map((c) => c.text);
const lines = (text: string, material = '', sensor = true) => {
  const r = checkDraft('d', v, text, { material, ...(sensor ? { claimSensor: patternSensor(material, false) } : {}) });
  const line = (id: string) => r.checked.find((c) => c.requirementId === id);
  return { unsourced: line('UNSOURCED')!, check: line(CLAIMS_TO_CHECK), failed: r.failed };
};

const delivered = [
  'In the first call, three of your prospects will believe the products overlap.',
  'Twelve-plus optimizers now compete for the same budget.',
  'The port is a few engineer-months of work.',
];

describe('the pattern check reads a spelled-out count as a figure', () => {
  it('the two invented counts of the delivered draft are listed, as FIGURE; a vague quantity with no number is not', () => {
    const r = patternSensor('', false).reading(delivered.join(' '));
    expect(r.listed?.map((c) => c.text)).toEqual([delivered[0], delivered[1]]);
    expect(r.listed?.map((c) => c.kind)).toEqual(['FIGURE', 'FIGURE']);
    expect(r.claims).toEqual([]);
    expect(listed(delivered[2])).toEqual([]);
    expect(listed('It took a few weeks and several people.')).toEqual([]);
  });

  it('a count the material gives, in digits or in words, is supported and not listed', () => {
    const t = 'Three of your prospects will believe the products overlap.';
    expect(listed(t, 'We spoke to 3 prospects last quarter.')).toEqual([]);
    expect(listed(t, 'Three prospects said the products looked the same.')).toEqual([]);
    expect(listed(t, 'Thirty prospects were on the list.')).toEqual([t]);
    expect(listed('Twelve-plus optimizers compete for the budget.', 'there are 12 optimizers, maybe more')).toEqual([]);
    expect(listed('A dozen customers wrote in.', 'twelve customers wrote in')).toEqual([]);
  });

  it('what prose counts without asserting a figure is left alone', () => {
    for (const t of [
      // the review's true sentences
      'It took two weeks.', 'Ten minutes later the page loaded.', 'I have two kids.', 'There are three reasons this matters.', 'A hundred small decisions add up.',
      // time and age, family, structure, hyperbole, a quotation
      'She is three years old.', 'We ran a two-week sprint.', 'My two daughters agree.', 'There are several ways to do it.', 'A thousand times, no.',
      'He said "three of them left early."',
      // and the exclusions the number reader always had
      'One of the reasons is cost.', 'The first reason is speed.', 'No one knew.', 'One day it will matter.', 'The three teams agreed on the plan.', 'These two are the same.',
      'Thousands of users saw hundreds of errors.',
    ]) {
      expect(listed(t), t).toEqual([]);
      expect(cut(t), t).toEqual([]);
    }
  });

  it('counts of what a figure measures stay listed: people, customers, companies, tokens, percent, and every "N-plus"', () => {
    for (const t of ['Nine people showed up.', 'Forty percent of users churned.', 'A hundred users signed up.', 'Three companies bid.',
      'Two hundred and fifty tokens per call.', 'Ten-plus years of experience.', 'She has two kids.', 'Two or three of them may call back.']) {
      expect(listed(t), t).toEqual([t]);
      expect(cut(t), t).toEqual([]);
    }
  });

  it('listed is never cut: the check line carries the count, UNSOURCED holds and the draft does not fail, with or without a sensor', async () => {
    const text = `${delivered[0]} We changed the cache.`;
    for (const sensor of [true, false]) {
      const r = lines(text, 'Notes: we changed the cache.', sensor);
      expect(r.unsourced.result.verdict).toBe('MET');
      expect(r.unsourced.result.spans).toEqual([]);
      expect(r.check?.materiality).toBe('PREFERRED');
      expect(r.check?.result.spans.map((s) => s.text)).toEqual([delivered[0]]);
      expect(r.check?.statement).toMatch(/never cut/);
      expect(r.failed).toBe(false);
    }
    const e = await enforceClaims('d', v, text, { material: 'Notes: we changed the cache.', claimSensor: patternSensor('Notes: we changed the cache.', false) });
    expect(e.text).toBe(text);
    expect(e.cut).toEqual([]);
    // the same count the material gives raises no line at all
    expect(lines(text, 'Three prospects said so. We changed the cache.').check).toBeUndefined();
  });

  it('digit figures are read exactly as before: a statistic presented as a finding is cut when unsupported, a plain count is not a finding', async () => {
    const text = 'According to the survey, 40% of teams agree. Nine people showed up. We changed the cache.';
    const r = lines(text, 'Notes: we changed the cache.');
    expect(r.unsourced.result.verdict).toBe('VIOLATED');
    expect(r.unsourced.result.spans.map((s) => s.text)).toEqual(['According to the survey, 40% of teams agree.']);
    expect(r.check?.result.spans.map((s) => s.text)).toEqual(['Nine people showed up.']);
    const e = await enforceClaims('d', v, text, { material: 'Notes: we changed the cache.', claimSensor: patternSensor('Notes: we changed the cache.', false) });
    expect(e.text).toBe('Nine people showed up. We changed the cache.');
    expect(cut('I think loops matter. We should ship 3 things this week.')).toEqual([]);
    expect(cut('According to the survey, 40% of teams agree.', 'the survey said 400 teams')).toHaveLength(1);
    // and the two spellings support each other, as the reader's decision always did
    expect(cut('According to the survey, 40% of teams agree.', 'the survey: forty percent of teams agree')).toEqual([]);
  });

  it('the count is the same figure for the pattern check and for the reader: one tokenisation, one value', () => {
    for (const t of ['three of your prospects', 'twelve-plus optimizers', 'nine people', 'forty percent', 'two hundred and fifty users', 'a dozen customers', 'twenty-one calls']) {
      const counts = spelledCounts(t);
      expect(counts.length, t).toBe(1);
      expect(numbersIn(t), t).toEqual(counts);
    }
    expect(spelledCounts('one engineer, one of the reasons, the first reason, no one')).toEqual([]);
    expect(spelledCounts('two or three, three more, nine 9s')).toEqual([]);
    expect(spelledCounts('12+ vendors')).toEqual([]); // digits are the statistic patterns' to read, unchanged
  });

  it('a mixed text lists the same findings every time, in order of position, cut and listed apart', () => {
    const t = 'According to the survey, 40% of teams agree. Nine people showed up. The first reason is speed. '
      + 'Years ago I worked on a ground-segment integration. Twelve-plus optimizers compete for the budget. One of them left.';
    expect(unsourcedClaims(t, '')).toEqual(unsourcedClaims(t, ''));
    expect(wordCountClaims(t, '')).toEqual(wordCountClaims(t, ''));
    expect(unsourcedClaims(t, '').map((c) => [c.kind, c.text])).toEqual([
      ['FIGURE', 'According to the survey, 40% of teams agree.'],
      ['EXPERIENCE', 'Years ago I worked on a ground-segment integration.'],
    ]);
    const w = wordCountClaims(t, '');
    expect(w.map((c) => c.text)).toEqual(['Nine people showed up.', 'Twelve-plus optimizers compete for the budget.']);
    expect(w.map((c) => c.start)).toEqual([...w.map((c) => c.start)].sort((x, y) => x - y));
  });
});
