// tests/atelier-review-round4.test.ts — WHAT A REVIEW OF ROUND 4 FOUND, EACH HELD BY A CHECK.
//
//   1. An owner's "No em dashes." that their own examples dispute is planned as shown only (it blocks nothing until they
//      confirm it with --yes), and the examples' own dash cap was dropped beside it all the same: nothing held the dash.
//      The cap is dropped only where the ban will be enforced: not disputed, or confirmed.
//   2. A ban on several patterns that include the em dash kept the cap beside it.
//   4. The seam check reverted good repairs: a replacement that opens on "I" or on a name is not a sentence left open.
//      It flags only the joined capital: the replacement opens on the original's own first word, capitalised.
//   6. A pass that shortened an already-short draft a little was refused as "below the length asked".
//   7. A quote the reader typed with curly apostrophes was not found in a source typed with straight ones.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tellOffers, type MethodProposal } from '../core/method/standard.js';
import { seamFragment, belowAsked } from '../core/loop/repair.js';
import { QUESTIONS } from '../core/loop/questions.js';

const FX = resolve('tests/fixtures/reaction-case');
const PIECES = readdirSync(join(FX, 'voice')).sort().map((f) => ({ id: f, reference: readFileSync(join(FX, 'voice', f), 'utf8') }));
const ban = (pattern: string[], conflict: string | null): MethodProposal => ({ statement: 'No em dashes.', origin: 'STATED', obligation: 'DELIVERABLE',
  measurement: { observer: 'PATTERN_RATE', params: { pattern, maxPer1000: 0 } }, onExample: null, conflict });
const CAP = 'Keep em dashes (—) to at most 20.5 per 1,000 words, as the examples do.';
const capOf = (ps: readonly MethodProposal[]): string | undefined => ps.find((p) => p.statement.includes('as the examples do'))?.statement;
const DISPUTED = 'your examples use em dashes (—) in 4 of 5 pieces; your rule bans it; kept as you wrote it';

describe('1-2. the examples\' dash cap is dropped only for a ban that will be enforced', () => {
  it('a disputed ban, not confirmed: the cap stays', () => {
    expect(capOf(tellOffers(PIECES, 'No em dashes.', [ban(['EM_DASH'], DISPUTED)]))).toBe(CAP);
  });
  it('a disputed ban, confirmed with --yes: the cap goes', () => {
    expect(capOf(tellOffers(PIECES, 'No em dashes.', [ban(['EM_DASH'], DISPUTED)], true))).toBeUndefined();
  });
  it('a ban the examples do not dispute: the cap goes', () => {
    expect(capOf(tellOffers(PIECES, 'No em dashes.', [ban(['EM_DASH'], null)]))).toBeUndefined();
  });
  it('a ban on several patterns that include the em dash: the cap goes; one without it keeps the cap', () => {
    expect(capOf(tellOffers(PIECES, 'No em dashes or semicolons.', [ban(['EM_DASH', 'SEMICOLON'], null)]))).toBeUndefined();
    expect(capOf(tellOffers(PIECES, 'No semicolons.', [ban(['SEMICOLON'], null)]))).toBe(CAP);
  });
});

describe('4. the seam check flags only the joined capital', () => {
  it('a replacement opening on "I" or on a name is a sentence of its own', () => {
    expect(seamFragment('It was late and', 'I left early.', ' Nobody minded.', 'we left early.')).toBeNull();
    expect(seamFragment('We moved the office so that', 'Paris gets the team.', ' Then we hired.', 'the team grows.')).toBeNull();
  });
  it('the original\'s own first word, capitalised, is still flagged', () => {
    expect(seamFragment('We know that', 'The remedy works.', ' It is cheap.', 'the remedy works.')).toBe('know that The remedy');
    expect(seamFragment('It was late and', 'We left early.', ' Nobody minded.', 'we left early.')).toBe('late and We left');
  });
});

describe('6. an already-short draft may be shortened a little', () => {
  const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
  it('a 1% cut of a draft under the floor passes; a larger one is refused; a cut through the floor is refused', () => {
    expect(belowAsked(words(600), words(595), 1000)).toBeNull();
    expect(belowAsked(words(600), words(580), 1000)).toBe('it would take the text to 580 words, below the 1000 the request asks for');
    expect(belowAsked(words(1000), words(995), 1000)).toBe('it would take the text to 995 words, below the 1000 the request asks for');
  });
});

describe('7. a quote is found however its apostrophes and quotation marks are typed', () => {
  it('curly in the reading, straight in the request, and the other way round: stated, so not asked', () => {
    const decision = (quote: string) => ({ decisions: [{ kind: 'ANGLE', status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', what: 'the angle', ask: 'Why does it matter now?', options: ['a', 'b'], default: 'a', statedIn: 'request', quote }] });
    const input = (request: string) => ({ request, material: [], method: [], examples: [], told: [] });
    const asked = (quote: string, request: string): number | undefined => QUESTIONS.ground(decision(quote), input(request))?.questions.length;
    expect(asked('the ferry’s “last run”', 'Write about the ferry\'s "last run" this week.')).toBe(0);
    expect(asked('the ferry\'s "last run"', 'Write about the ferry’s “last run” this week.')).toBe(0);
    // a quote the request does not hold is no statement: asked
    expect(asked('the ferry’s first run', 'Write about the ferry\'s "last run" this week.')).toBe(1);
  });
});
