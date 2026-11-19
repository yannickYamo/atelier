// A claim the person gave in an answer reached the writer and came back in another word form ("months" for "month"):
// the trace in code missed it and listed the person's own fact for them to check.
import { describe, it, expect } from 'vitest';
import { supportIsIn, decideSpecifics } from '../core/loop/claim-extract.js';

describe('a claim the person gave in an answer, in other word forms', () => {
  const answer = 'Leave them out and focus on the build; the first version took a month of study and several engineers, and this one took 3 days';
  it('is found in what they supplied when only a singular or plural differs', () => {
    expect(supportIsIn('It took months of study and several engineers', answer)).toBe(true);
  });
  it('a detail the answer never gave still is not', () => {
    expect(supportIsIn('I rebuilt it in three days, on my own', answer)).toBe(false);
    expect(supportIsIn('Most of my three days went on deciding what correct meant and how to measure it', answer)).toBe(false);
  });
});

// THE PERSON'S OWN FACT, CITED FROM THEIR ANSWER AND SAID IN OTHER WORDS. A story told as lived must share its
// substance with the passage cited; a figure of the passage, or two of its words that make up most of it, is that substance.
describe('a lived claim cited from the person\'s own answer, in other words', () => {
  const ANSWER = 'from a month with a team to 2 days alone';
  const TEXT = 'I spent the last two days building it. It was two days and one person. Not long ago this would have been a team and the better part of a month. I spent a week in Tokyo testing it.';
  const sp = (text: string, support: string) => ({ text, sentence: TEXT.split('. ').findIndex((x) => x.includes(text)) + 1, kind: 'FIRST_PERSON_EVENT' as const, attributed: false, source: 'MATERIAL' as const, support });
  const flagged = (specifics: ReturnType<typeof sp>[]) => decideSpecifics(TEXT, specifics, `${ANSWER}\n\nOne vendor, 1 part.`, '', false, 'test').claims.map((c) => c.specific);
  it('is traced when it carries a figure of the passage cited', () => {
    expect(flagged([sp('It was two days and one person', ANSWER), sp('I spent the last two days building it', ANSWER)])).toEqual([]);
  });
  it('is traced when two words of the passage make most of it', () => {
    expect(flagged([sp('Not long ago this would have been a team and the better part of a month', ANSWER)])).toEqual([]);
  });
  it('a story the passage does not hold is still listed', () => {
    expect(flagged([sp('I spent a week in Tokyo testing it', ANSWER)])).toEqual(['I spent a week in Tokyo testing it']);
  });
});
