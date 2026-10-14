// tests/atelier-claim-counts.test.ts — A COUNT WRITTEN IN WORDS IS A FIGURE.
//
// A delivered draft said "three of your prospects will believe the products overlap" and "Twelve-plus
// optimizers": counts of people and of competitors the material never gave. The pattern check read only
// digits, so `patternSensor(...).reading(text)` returned no claims for either, while the reader's own
// definition of FIGURE ("nine people", "47 of them") and `numbersIn` already read spelled-out numbers.
// These pin the agreement: the pattern check reads a spelled-out count as the same figure the reader
// would, supported by the same value in the material in words or in digits, with the exclusions kept.

import { describe, it, expect } from 'vitest';
import { patternSensor, numbersIn } from '../core/loop/claim-extract.js';
import { unsourcedClaims } from '../core/loop/claims.js';
import { spelledCounts } from '../core/loop/numbers.js';

const read = (text: string, material = ''): string[] => patternSensor(material, false).reading(text).claims.map((c) => c.text);
const kinds = (text: string, material = ''): string[] => patternSensor(material, false).reading(text).claims.map((c) => c.kind);

describe('the pattern check reads a spelled-out count as a figure', () => {
  const delivered = [
    'In the first call, three of your prospects will believe the products overlap.',
    'Twelve-plus optimizers now compete for the same budget.',
    'The port is a few engineer-months of work.',
  ];
  it('the two invented counts of the delivered draft are FIGURE claims; a vague quantity with no number is not', () => {
    const r = patternSensor('', false).reading(delivered.join(' '));
    expect(r.claims.map((c) => c.text)).toEqual([delivered[0], delivered[1]]);
    expect(r.claims.map((c) => c.kind)).toEqual(['FIGURE', 'FIGURE']);
    expect(read(delivered[2])).toEqual([]);
    expect(read('It took a few weeks and several people.')).toEqual([]);
    // an estimated range is a count all the same, on the number the thing follows
    expect(read('Two or three of them may call back.')).toEqual(['Two or three of them may call back.']);
    expect(read('Two or three of them may call back.', 'about 3 of them')).toEqual([]);
  });

  it('a count the material gives, in digits or in words, is supported, not cut', () => {
    const t = 'Three of your prospects will believe the products overlap.';
    expect(read(t, 'We spoke to 3 prospects last quarter.')).toEqual([]);
    expect(read(t, 'Three prospects said the products looked the same.')).toEqual([]);
    expect(read(t, 'Thirty prospects were on the list.')).toEqual([t]);
    expect(read('Twelve-plus optimizers compete for the budget.', 'there are 12 optimizers, maybe more')).toEqual([]);
    expect(read('A dozen customers wrote in.', 'twelve customers wrote in')).toEqual([]);
  });

  it('the exclusions hold: "one" where it does not quantify, ordinals as structure, idioms, a set already named', () => {
    for (const t of ['One of the reasons is cost.', 'The first reason is speed.', 'No one knew.', 'One day it will matter.',
      'The three teams agreed on the plan.', 'These two are the same.', 'Thousands of users saw hundreds of errors.']) {
      expect(read(t), t).toEqual([]);
    }
  });

  it('digit figures are read as before: a plain count is not a finding, a statistic presented as one is', () => {
    expect(read('I think loops matter. We should ship 3 things this week.')).toEqual([]);
    expect(kinds('According to the survey, 40% of teams agree.')).toEqual(['FIGURE']);
    expect(read('According to the survey, 40% of teams agree.', 'the survey said 400 teams')).toHaveLength(1);
    // and the two spellings now support each other, as the reader's decision always did
    expect(read('According to the survey, 40% of teams agree.', 'the survey: forty percent of teams agree')).toEqual([]);
    expect(read('Forty percent of teams agree.', 'the survey: 40% of teams agree')).toEqual([]);
  });

  it('the count is the same figure for the pattern check and for the reader: one tokenisation, one value', () => {
    for (const t of ['three of your prospects', 'twelve-plus optimizers', 'nine people', 'forty percent', 'two hundred and fifty users', 'a dozen customers', 'twenty-one days']) {
      const counts = spelledCounts(t);
      expect(counts.length, t).toBe(1);
      expect(numbersIn(t), t).toEqual(counts);
    }
    expect(spelledCounts('one engineer, one of the reasons, the first reason, no one')).toEqual([]);
    expect(spelledCounts('two or three, three more, nine 9s')).toEqual([]);
    expect(spelledCounts('12+ vendors')).toEqual([]); // digits are the statistic patterns' to read, unchanged
  });

  it('a mixed text lists the same claims every time, in order of position', () => {
    const t = 'According to the survey, 40% of teams agree. Nine people showed up. The first reason is speed. '
      + 'Years ago I worked on a ground-segment integration. Twelve-plus optimizers compete for the budget. One of them left.';
    const a = unsourcedClaims(t, '');
    const b = unsourcedClaims(t, '');
    expect(a).toEqual(b);
    expect(a.map((c) => [c.kind, c.text])).toEqual([
      ['FIGURE', 'According to the survey, 40% of teams agree.'],
      ['FIGURE', 'Nine people showed up.'],
      ['EXPERIENCE', 'Years ago I worked on a ground-segment integration.'],
      ['FIGURE', 'Twelve-plus optimizers compete for the budget.'],
    ]);
    expect(a.map((c) => c.start)).toEqual([...a.map((c) => c.start)].sort((x, y) => x - y));
  });
});
