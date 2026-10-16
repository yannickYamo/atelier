// tests/atelier-tweet-voice.test.ts — A TWEET KEEPS THE AUTHOR'S VOICE.
//
// On a skill built from twenty short pieces, "Shipping beats planning. Every time. No exceptions." passed as too
// short to measure. The run of very short sentences was read in the middle of two of the author's own tweets
// ("...a shell script. It ran for eleven months. Nobody needed..."), so the move counted as theirs and was never
// banned. A run is now three whole sentences, and with short pieces a move absent from every one is never theirs:
// a ban, checked at any length. A move the author does make in a short piece stays theirs.
import { describe, it, expect } from 'vitest';
import { GOOD } from './fixtures/shortform.js';
import { machineTellRule } from '../core/observers/contrast.js';
import { tellOffers } from '../core/method/standard.js';
import { findPattern } from '../core/observers/style.js';
import { measure } from '../core/observers/registry.js';
import type { Measurement } from '../core/state/canonical-state.js';

const STACCATO = 'Shipping beats planning. Every time. No exceptions.';
const runs = (t: string): string[] => findPattern(t, 'MACHINE_TELL').filter((s) => s.family === 'STACCATO_RUN').map((s) => s.text);
const cases = (texts: readonly string[]) => texts.map((reference, i) => ({ id: `t${i}`, reference }));
const tellRule = (never: readonly string[], cap: number): Measurement => ({ observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: cap, never: [...never], role: ['machine-tell'] } });
const offered = (texts: readonly string[]): Measurement => {
  const m = tellOffers(cases(texts)).find((p) => p.measurement?.params.role)?.measurement;
  if (!m) throw new Error('no machine-tell rule offered');
  return m;
};

// An author who does write runs of short sentences: four of twenty tweets, each a run of three whole sentences.
const RUNS_OF_THEIR_OWN = [
  'Rewrote the importer over the weekend. It works. It is fast. Nobody asked.',
  'Closed the oldest ticket in the queue today. Two years old. Still valid. Fixed now.',
  'We tried a queue for the sync job last spring. Too slow. Too clever. Gone.',
  'The new onboarding email went out this morning. Short. Plain. Already answered.',
];
const STACCATO_AUTHOR = [...GOOD.slice(0, 16), ...RUNS_OF_THEIR_OWN];

describe('a run of very short sentences is three whole sentences', () => {
  it('counted in any text of three sentences', () => {
    expect(runs(STACCATO)).toEqual([STACCATO]);
  });
  it('two short sentences are not a run', () => {
    expect(runs('Every time. No exceptions.')).toEqual([]);
  });
  it('the tail of a long sentence is not a short sentence', () => {
    expect(runs('The first version of the migration tool was a shell script. It ran for eleven months. Nobody needed the second version.')).toEqual([]);
    expect(runs('Two support tickets in a day about the same button means the button is wrong. Not the users. Move the button.')).toEqual([]);
  });
  it('a run after a long sentence is counted from its first whole sentence', () => {
    expect(runs('We moved the approval earlier in the pipeline last week. It works. Ship it. Done.')).toEqual(['It works. Ship it. Done.']);
  });
  it('none of the twenty tweets holds a run', () => {
    expect(GOOD.filter((t) => runs(t).length > 0)).toEqual([]);
  });
});

describe('a skill built from tweets bans the moves the author never makes', () => {
  for (const [label, texts] of [['five tweets', GOOD.slice(0, 5)], ['twenty tweets', GOOD]] as const) {
    it(`${label}: the run is never theirs; the staccato tweet fails, every one of theirs passes`, () => {
      // Built from examples (a method build) and from a folder (discovery): the same rule.
      for (const m of [offered(texts), tellRule(machineTellRule(texts).never, machineTellRule(texts).cap)]) {
        expect(m.params.never).toContain('STACCATO_RUN');
        const r = measure(STACCATO, m);
        expect(r.verdict).toBe('VIOLATED');
        expect(r.detail).toBe('1 move(s) you never make');
        expect(GOOD.filter((t) => measure(t, m).verdict === 'VIOLATED')).toEqual([]);
      }
    });
  }
  it('short pieces: a move absent from every piece is never theirs, a move in one of them is', () => {
    // "Your best releases are the ones nobody talks about" is the one insight claim in the twenty.
    expect(GOOD.filter((t) => findPattern(t, 'MACHINE_TELL').some((s) => s.family === 'INSIGHT_CLAIM'))).toHaveLength(1);
    expect(machineTellRule(GOOD).never).not.toContain('INSIGHT_CLAIM');
    expect(machineTellRule(GOOD).never).toContain('EM_DASH');
  });
});

describe('an author who writes runs of short sentences keeps them', () => {
  it('four of twenty tweets hold a run: the run is not banned, and each of the twenty passes', () => {
    expect(STACCATO_AUTHOR.filter((t) => runs(t).length > 0)).toEqual(RUNS_OF_THEIR_OWN);
    for (const m of [offered(STACCATO_AUTHOR), tellRule(machineTellRule(STACCATO_AUTHOR).never, machineTellRule(STACCATO_AUTHOR).cap)]) {
      expect(m.params.never).not.toContain('STACCATO_RUN');
      expect(STACCATO_AUTHOR.filter((t) => measure(t, m).verdict === 'VIOLATED')).toEqual([]);
    }
  });
});
