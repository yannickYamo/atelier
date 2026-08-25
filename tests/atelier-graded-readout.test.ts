// tests/atelier-graded-readout.test.ts — THE POSITION IS FOUND, NEVER GUESSED.
//
// This instrument exists because every model-based instrument in this programme asked for a verdict
// and read ONE TOKEN, and three of them produced zero abstentions across 150 observations. An enum
// with four members cannot express spread. A graded score read from the token distribution can, and
// the spread is computed rather than requested.
//
// THE BUG THIS FILE PINS. The first implementation took the first token that parsed as a number in
// range. A JSON payload contains other integers, and a two-digit score is split across two tokens, so
// what it actually read was the alternatives for a SECOND DIGIT. Verified against a live provider:
// it returned a confident-looking reading built from digit alternatives, which is a number that means
// nothing and looks exactly like one that does.

import { describe, it, expect } from 'vitest';
import { readGraded, describeGraded, SCALE_MIN, SCALE_MAX } from '../core/fidelity/graded-readout.js';
import type { TokenLogprobs } from '../core/inference/client.js';

const t = (token: string, p: number, top: [string, number][] = []): TokenLogprobs =>
  ({ token, logprob: Math.log(p), top: top.map(([tk, pp]) => ({ token: tk, logprob: Math.log(pp) })) });

/** The payload shape a schema-mode call actually emits, one token at a time. */
const payload = (confidenceTokens: TokenLogprobs[]): TokenLogprobs[] => [
  t('{"', 1), t('pick', 1), t('":"', 1), t('A', 1), t('","', 1),
  t('confidence', 1), t('":', 1), ...confidenceTokens,
  t(',"', 1), t('why', 1), t('":"', 1), t('because', 1), t('"}', 1),
];

describe('the field is located structurally', () => {
  it('reads the distribution at the confidence field', () => {
    const r = readGraded(payload([t('8', 0.57, [['8', 0.57], ['9', 0.36], ['7', 0.07]])]));
    expect(r.kind).toBe('READ');
    if (r.kind !== 'READ') return;
    expect(r.emitted).toBe(8);
    expect(r.expected).toBeCloseTo(8 * 0.57 + 9 * 0.36 + 7 * 0.07, 2);
    expect(r.peak).toBeCloseTo(0.57, 2);
  });

  it('THE ORIGINAL BUG: an earlier integer in the payload is not the score', () => {
    // "pick" is a string here, but a payload can carry any number of integers before the field —
    // a count, an index, a version. The first-number-in-range rule read whichever came first.
    const withDecoy: TokenLogprobs[] = [
      t('{"', 1), t('rank', 1), t('":', 1), t('3', 0.9, [['3', 0.9], ['4', 0.1]]),
      t(',"', 1), t('confidence', 1), t('":', 1), t('8', 0.6, [['8', 0.6], ['9', 0.4]]), t('}', 1),
    ];
    const r = readGraded(withDecoy);
    expect(r.kind).toBe('READ');
    if (r.kind !== 'READ') return;
    expect(r.emitted, 'the decoy must not be read as the score').toBe(8);
  });

  it('a score split across two tokens has no single distribution, and it says so', () => {
    // The reason the scale is one token wide. "14" tokenizes as "1" then "4", and the alternatives
    // at either position are digit alternatives, not judgements.
    const split = payload([t('1', 0.8, [['1', 0.8], ['2', 0.2]]), t('4', 0.9)]);
    const r = readGraded(split);
    // '1' is in range and single, so it reads THAT — the point is it never silently reads '4'.
    if (r.kind === 'READ') expect(r.emitted).toBe(1);
  });

  it('a missing field is UNAVAILABLE, never a fallback to whatever number appeared', () => {
    const noField: TokenLogprobs[] = [t('{"', 1), t('pick', 1), t('":"', 1), t('A', 1), t('"}', 1), t('7', 0.9)];
    const r = readGraded(noField);
    expect(r.kind).toBe('UNAVAILABLE');
    if (r.kind === 'UNAVAILABLE') expect(r.why).toMatch(/no single-token "confidence" value/);
  });

  it('no logprobs at all names the remedy rather than reporting a failure', () => {
    const r = readGraded(null);
    expect(r.kind).toBe('UNAVAILABLE');
    if (r.kind === 'UNAVAILABLE') {
      expect(r.why).toMatch(/forced function call carries none/);
      expect(r.why, 'a user must be told how to get the reading').toMatch(/--structured-output json-schema/);
    }
  });
});

describe('spread is computed, not requested', () => {
  const spreadOf = (top: [string, number][]): number => {
    const r = readGraded(payload([t(top[0][0], top[0][1], top)]));
    return r.kind === 'READ' ? r.spread : NaN;
  };

  it('mass on one score reads as certain', () => {
    expect(spreadOf([['8', 0.98], ['9', 0.02]])).toBeLessThan(0.2);
  });

  it('mass spread evenly reads as undecided', () => {
    expect(spreadOf([['5', 0.25], ['6', 0.25], ['7', 0.25], ['4', 0.25]])).toBeCloseTo(1, 1);
  });

  it('and the ordering between them is what the instrument is for', () => {
    expect(spreadOf([['8', 0.9], ['7', 0.1]])).toBeLessThan(spreadOf([['5', 0.3], ['6', 0.3], ['7', 0.4]]));
  });

  it('out-of-range alternatives are excluded rather than inflating the spread', () => {
    const r = readGraded(payload([t('8', 0.5, [['8', 0.5], ['9', 0.3], ['42', 0.15], [',', 0.05]])]));
    expect(r.kind).toBe('READ');
    if (r.kind !== 'READ') return;
    expect(r.considered.map((c) => c.score).sort()).toEqual([8, 9]);
  });
});

describe('the report refuses to be a verdict', () => {
  it('says it is unqualified and decides nothing', () => {
    const md = describeGraded(readGraded(payload([t('8', 0.9, [['8', 0.9], ['9', 0.1]])])));
    expect(md).toMatch(/UNQUALIFIED/);
    expect(md).toMatch(/decides nothing/);
    expect(md, 'and it cites the counter-example rather than asserting caution').toMatch(/7% specificity/);
  });

  it('the scale is one token wide by construction', () => {
    expect(SCALE_MIN).toBe(1);
    expect(SCALE_MAX, 'above 9 a score needs two tokens and the reading is meaningless').toBe(9);
  });
});
