// tests/atelier-claims-digit-cut.test.ts — WHAT IS CUT IS READ FROM DIGITS; A SPELLED COUNT IS ONLY LISTED.
//
// "Our survey found 40% of teams adopted it within two weeks." against material saying "Our survey found 40%
// of teams adopted it." was CUT as an unsupported figure, because the cut check read "two" as a figure the
// material lacked. A spelled number never makes a supported digit sentence unsupported: the cut set for these
// sentences is exactly what the digit-only check gave before spelled counts were read at all (values below
// were recorded from that check, not from the code under test), and spelled counts go to the listed path.

import { describe, it, expect } from 'vitest';
import { unsourcedClaims } from '../core/loop/claims.js';
import { patternSensor } from '../core/loop/claim-extract.js';
import { spelledCounts } from '../core/loop/numbers.js';

const MAT = 'Our survey found 40% of teams adopted it. The report counted 1,200 users in 2023.';
// sentence -> the kinds the digit-only check cut it for ('' = kept)
const BEFORE: ReadonlyArray<readonly [string, string]> = [
  ['Our survey found 40% of teams adopted it within two weeks.', ''],
  ['A 2024 survey found that 40% of teams use two tools.', ''],
  ['The study found 40% of teams, one in three, adopted it.', ''],
  ['According to the report, 40% of the three largest teams adopted it.', ''],
  ['The report found 1,200 users and one of them complained.', ''],
  ['Our survey found 55% of teams adopted it.', 'FIGURE'],
  ['The report found 1,200 users and 300 of them complained within three days.', 'FIGURE'],
  ['We measured 40% faster builds over two sprints.', 'EXPERIENCE'],
  ['According to the study, 3 million people use it.', 'FIGURE'],
  ['Our survey found 40% of teams, about forty in all, adopted it.', ''],
  ['The survey found 70% of engineers prefer it.', 'FIGURE'],
  ['Data shows 40% of teams adopted it.', ''],
];

describe('the cut path reads digit figures exactly as before', () => {
  for (const [s, kinds] of BEFORE) {
    it(JSON.stringify(s), () => {
      expect(unsourcedClaims(s, MAT).map((c) => c.kind).join(',')).toBe(kinds);
      expect(patternSensor(MAT, false).reading(s).claims.map((c) => c.kind).join(',')).toBe(kinds);
    });
  }
  it('the reported sentence is kept, and its spelled span is not even listed (time)', () => {
    const r = patternSensor('Our survey found 40% of teams adopted it.', false).reading('Our survey found 40% of teams adopted it within two weeks.');
    expect(r.claims).toEqual([]);
    expect(r.listed ?? []).toEqual([]);
  });
  it('a spelled count of a measured thing is listed, never cut', () => {
    const r = patternSensor(MAT, false).reading('According to the report, 40% of teams adopted it and nine customers left.');
    expect(r.claims).toEqual([]);
    expect((r.listed ?? []).length).toBe(1);
  });
  it('the material may support a digit figure in words', () => {
    expect(unsourcedClaims('Our survey found 40% of teams adopted it.', 'We found forty percent adopted it.')).toEqual([]);
  });
});

describe('spelled counts that are not a count of a measured thing', () => {
  const none = ["She said 'three customers' left.", 'He earned seven figures last year.', 'Fifty-fifty odds.', 'Their two kids hate it.', "It's 'two customers', she said."];
  for (const s of none) it(`${s} lists nothing`, () => expect(spelledCounts(s)).toEqual([]));
  it('a ratio states both numbers', () => {
    expect(spelledCounts('Three in ten developers use it.')).toEqual(['3', '10']);
    expect(spelledCounts('Seven out of ten readers skip the intro.')).toEqual(['7', '10']);
  });
  it('an apostrophe inside a word opens no quotation', () => expect(spelledCounts("The team's three engineers left.")).toEqual(['3']));
});
