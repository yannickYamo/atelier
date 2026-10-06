// tests/atelier-fitted-limits.test.ts — A LIMIT IS SET WHERE THE AUTHOR'S OWN PIECES ARE.
//
// A counted rule's limit is computed from the author's pooled numbers with a fixed margin and then checked piece by
// piece, so pieces of the author's own broke the author's own rule (four posts of one blog, with a median of 19 to
// 22 words, against "a median under 19"). Suggesting the rule as a preference kept the wrong number and lost the
// rule: one blog standard went from 13 required rules to 5. Pinned here: the limit moved just far enough
// (core/observers/derive.ts, `fitToCorpus`), a new skill's rules quoting the moved number and saying so, the
// suggestion that follows (core/ratification/suggest.ts), and the command a skill built before is offered
// (cli/commands/amend.ts, `amendToFit`).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fitToCorpus, fitNote, restateLimits, piecesBreaking, deriveMeasuredRules } from '../core/observers/derive.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { measure } from '../core/observers/registry.js';
import { suggest, suggestAll, allowed, CORPUS_RULE_SHARE, type ProposalEvidence } from '../core/ratification/suggest.js';
import { formatMeasure, amendToFit } from '../cli/commands/amend.js';
import { parseMeasure } from '../cli/commands/ratify.js';
import type { Measurement } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

/** A sentence of exactly `n` words, with `extra` in place of its first words. */
const sentence = (n: number, ...extra: string[]): string => {
  const words = [...extra, ...Array.from({ length: n - extra.length }, () => 'stone')];
  return `${words.join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
};
/** A piece whose sentences have these lengths, three to a paragraph. */
const pieceOf = (lengths: readonly number[], perParagraph = 3): string =>
  lengths.map((n, i) => `${sentence(n)}${i % perParagraph === perParagraph - 1 ? '\n\n' : ' '}`).join('').trim();
/** A piece of `sentences` ten-word sentences, with each of `words` opening one sentence. */
const pieceWith = (sentences: number, words: readonly string[]): string =>
  Array.from({ length: sentences }, (_, i) => `${sentence(10, ...(words[i] ? [words[i]] : []))}${i % 3 === 2 ? '\n\n' : ' '}`).join('').trim();
const even = (n: number, sentences = 12): string => pieceOf(Array.from({ length: sentences }, () => n));
const lim = (m: Measurement | null, key: string): number => m?.params[key] as number;

describe('a limit is loosened just enough that the author\'s own pieces meet it', () => {
  // Twenty pieces with a median of 10 words, and four of the author's own with medians of 21, 22, 23 and 25.
  const blog = [...Array.from({ length: 20 }, () => even(10)), even(21), even(22), even(23), even(25)];
  const tight: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 19, p90Max: 40 } };

  it('SENTENCE_LENGTH: the median limit goes to the piece that leaves exactly the allowed number over it, and no further', () => {
    expect(piecesBreaking(blog, tight)).toEqual([20, 21, 22, 23]);
    const one = fitToCorpus(tight, blog, 1);
    expect(one).toEqual({ observer: 'SENTENCE_LENGTH', params: { medianMax: 23, p90Max: 40 } });
    expect(piecesBreaking(blog, one!)).toEqual([23]);
    // one step tighter would leave two pieces over it: 23 is the smallest loosening
    expect(piecesBreaking(blog, { ...tight, params: { medianMax: 22, p90Max: 40 } }).length).toBe(2);
    expect(lim(fitToCorpus(tight, blog, 2), 'medianMax')).toBe(22);
    expect(lim(fitToCorpus(tight, blog, 0), 'medianMax')).toBe(25);
    expect(lim(fitToCorpus(tight, blog, 3), 'medianMax')).toBe(21);
  });
  it('SENTENCE_LENGTH: the nine-in-ten limit moves on its own when that is what the pieces break, and both move when both are broken', () => {
    // Ten sentences, two of them long: the median stays 10 and the 90th percentile is the long one.
    const tailed = (long: number): string => pieceOf([10, 10, 10, 10, 10, 10, 10, 10, long, long]);
    const corpus = [...Array.from({ length: 20 }, () => even(10)), tailed(33), tailed(36), tailed(38)];
    const m: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 12, p90Max: 30 } };
    expect(fitToCorpus(m, corpus, 1)).toEqual({ observer: 'SENTENCE_LENGTH', params: { medianMax: 12, p90Max: 36 } });
    // a piece long throughout breaks both limits: both go to where it is, and stay whole numbers
    const both = fitToCorpus(m, [...corpus, even(20), even(20)], 1);
    expect(both).toEqual({ observer: 'SENTENCE_LENGTH', params: { medianMax: 20, p90Max: 36 } });
    for (const k of ['medianMax', 'p90Max']) expect(Number.isInteger(lim(both, k))).toBe(true);
  });
  it('a limit is never tightened, and never moved past twice what it was: then there is no limit to offer', () => {
    const far = [...Array.from({ length: 20 }, () => even(10)), even(39), even(45), even(50)];
    // 45 would be needed and twice 19 is 38
    expect(fitToCorpus(tight, far, 1)).toBeNull();
    // polarity: at exactly twice the limit it is still offered
    expect(lim(fitToCorpus(tight, [...Array.from({ length: 20 }, () => even(10)), even(38), even(50)], 1), 'medianMax')).toBe(38);
    // a rule far looser than the pieces is left as it is, not pulled in to them
    expect(fitToCorpus({ observer: 'SENTENCE_LENGTH', params: { medianMax: 60, p90Max: 90 } }, blog, 1)).toBeNull();
  });
  it('a rule that already holds is left alone: null, whether no piece breaks it or only the allowed number do', () => {
    expect(fitToCorpus(tight, blog.slice(0, 21), 1)).toBeNull();
    expect(fitToCorpus(tight, blog.slice(0, 20), 0)).toBeNull();
    expect(fitToCorpus(tight, blog, 4)).toBeNull();
  });
  it('PARAGRAPH_LENGTH: the cap goes to the longest paragraph of the piece that leaves the allowed number over it', () => {
    const paragraphs = (longest: number): string => `${pieceOf(Array.from({ length: longest }, () => 8), longest)}\n\n${pieceOf([8, 8, 8])}`;
    const corpus = [...Array.from({ length: 10 }, () => paragraphs(3)), paragraphs(5), paragraphs(6), paragraphs(7)];
    const m: Measurement = { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } };
    expect(fitToCorpus(m, corpus, 1)).toEqual({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 6 } });
    expect(lim(fitToCorpus(m, corpus, 0), 'maxSentences')).toBe(7);
    // nine sentences would need a cap past twice four
    expect(fitToCorpus(m, [...corpus, paragraphs(9), paragraphs(9)], 1)).toBeNull();
  });
  it('HEDGE_RATE: a rate keeps its one decimal, and a rate of zero, which means never, is not loosened', () => {
    // 300 words with one hedge is 3.3 per thousand; 400 with two is 5; 300 with two is 6.7.
    const corpus = [...Array.from({ length: 10 }, () => pieceWith(30, [])), pieceWith(30, ['perhaps']), pieceWith(40, ['perhaps', 'maybe']), pieceWith(30, ['perhaps', 'maybe'])];
    const m: Measurement = { observer: 'HEDGE_RATE', params: { maxPer1000: 3 } };
    expect(piecesBreaking(corpus, m)).toEqual([10, 11, 12]);
    expect(fitToCorpus(m, corpus, 2)).toEqual({ observer: 'HEDGE_RATE', params: { maxPer1000: 3.3 } });
    expect(lim(fitToCorpus(m, corpus, 1), 'maxPer1000')).toBe(5);
    // 6.7 is past twice 3
    expect(fitToCorpus(m, corpus, 0)).toBeNull();
    const never: Measurement = { observer: 'HEDGE_RATE', params: { maxPer1000: 0 } };
    expect(piecesBreaking(corpus, never).length).toBe(3);
    expect(fitToCorpus(never, corpus, 1)).toBeNull();
  });
  it('PATTERN_RATE: a ban stays a ban, a ceiling goes up, a floor goes down, and a move the author never makes is not excused by any rate', () => {
    // 200 words with n semicolons is 5n per thousand.
    const semis = (n: number): string => Array.from({ length: 20 }, (_, i) => `${i < n ? sentence(10).replace(' stone', '; stone') : sentence(10)}${i % 3 === 2 ? '\n\n' : ' '}`).join('').trim();
    const rate = (t: string): number | null => measure(t, { observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], maxPer1000: 1000 } }).value;
    const corpus = [...Array.from({ length: 10 }, () => semis(2)), semis(0), semis(1), semis(4), semis(5), semis(6)];
    expect(corpus.map(rate).slice(9)).toEqual([10, 0, 5, 20, 25, 30]);
    const ban: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], maxPer1000: 0 } };
    expect(piecesBreaking(corpus, ban).length).toBe(14);
    expect(fitToCorpus(ban, corpus, 1)).toBeNull();
    const band: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 8, maxPer1000: 15 } };
    expect(piecesBreaking(corpus, band)).toEqual([10, 11, 12, 13, 14]);
    // Two pieces may break it. The piece with none is out whatever is done: a floor never goes under half of what it
    // was. That leaves one more. Keeping the floor (the piece at 5 stays out) and raising the ceiling to the heaviest
    // piece moves one limit by its whole size; lowering the floor to 5 and raising the ceiling to 25 moves two limits
    // by more than that in total. The smaller movement is taken.
    const fitted = fitToCorpus(band, corpus, 2);
    expect(fitted).toEqual({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 8, maxPer1000: 30 } });
    expect(piecesBreaking(corpus, fitted!)).toEqual([10, 11]);
    // with three allowed, the ceiling need only reach 25
    expect(fitToCorpus(band, corpus, 3)).toEqual({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 8, maxPer1000: 25 } });
    // and a ceiling that cannot reach is helped by the floor: at 12 the bound is 24, so both limits move
    expect(fitToCorpus({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 8, maxPer1000: 12 } }, corpus, 3))
      .toEqual({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 5, maxPer1000: 20 } });
    // a floor never goes under half of what it was: the piece with none cannot be brought in
    expect(fitToCorpus({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 8 } }, corpus, 0)).toBeNull();
    expect(fitToCorpus({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 8 } }, corpus, 1))
      .toEqual({ observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 5 } });
    // A move recorded as one the author never makes breaks the rule at any rate, so no ceiling brings those pieces in.
    const tells = [...Array.from({ length: 8 }, () => pieceWith(20, [])), ...Array.from({ length: 3 }, () => pieceWith(20, ['where plans go to die']))];
    const held: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 3, never: ['GOES_TO_DIE'] } };
    expect(piecesBreaking(tells, held)).toEqual([8, 9, 10]);
    expect(fitToCorpus(held, tells, 1)).toBeNull();
    // polarity: the same pieces against the same ceiling without that record are a rate, and the ceiling goes to it
    const { never: _never, ...rateOnly } = held.params; void _never;
    expect(piecesBreaking(tells, { ...held, params: rateOnly })).toEqual([8, 9, 10]);
    expect(fitToCorpus({ ...held, params: rateOnly }, tells, 1)).toEqual({ observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 4.9 } });
  });
  it('TERM_RATE, FRAGMENT_SHARE, RATIO, RHYTHM, DISTRIBUTION and OPENING: each numeric limit moves to the pieces, at its own precision', () => {
    // TERM_RATE: 200 words with n uses of "but" is 5n per thousand.
    const buts = (n: number): string => pieceWith(20, Array.from({ length: n }, () => 'but'));
    const terms = [...Array.from({ length: 8 }, () => buts(1)), buts(2), buts(3), buts(3)];
    expect(fitToCorpus({ observer: 'TERM_RATE', params: { terms: ['but'], maxPer1000: 8 } }, terms, 2)).toEqual({ observer: 'TERM_RATE', params: { terms: ['but'], maxPer1000: 10 } });
    expect(lim(fitToCorpus({ observer: 'TERM_RATE', params: { terms: ['but'], maxPer1000: 8 } }, terms, 0), 'maxPer1000')).toBe(15);
    // FRAGMENT_SHARE: f of ten sentences are four words long.
    const frags = (f: number): string => pieceOf([...Array.from({ length: f }, () => 4), ...Array.from({ length: 10 - f }, () => 12)]);
    const fragments = [...Array.from({ length: 8 }, () => frags(1)), frags(2), frags(3), frags(3)];
    const share: Measurement = { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.15 } };
    expect(fitToCorpus(share, fragments, 2)).toEqual({ observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.2 } });
    expect(fitToCorpus(share, fragments, 0)).toEqual({ observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.3 } });
    // RATIO: "but" in a of ten uses of "but" or "however".
    const uses = (a: number): string => pieceWith(12, [...Array.from({ length: a }, () => 'but'), ...Array.from({ length: 10 - a }, () => 'however')]);
    const ratios = [...Array.from({ length: 8 }, () => uses(9)), uses(7), uses(6), uses(6)];
    const ratio: Measurement = { observer: 'RATIO', params: { numerator: ['but'], denominator: ['however'], minShare: 0.8 } };
    expect(piecesBreaking(ratios, ratio)).toEqual([8, 9, 10]);
    expect(fitToCorpus(ratio, ratios, 2)).toEqual({ observer: 'RATIO', params: { numerator: ['but'], denominator: ['however'], minShare: 0.7 } });
    expect(lim(fitToCorpus(ratio, ratios, 0), 'minShare')).toBe(0.6);
    // RHYTHM: a floor on how much sentence lengths vary goes down to the flattest piece allowed in.
    const rhythm: Measurement = { observer: 'RHYTHM', params: { unit: ['SENTENCE'], minCv: 0.5 } };
    const varied = [...Array.from({ length: 8 }, () => pieceOf([4, 30, 4, 30, 4, 30, 4, 30, 4, 30, 4, 30])), pieceOf([8, 20, 8, 20, 8, 20, 8, 20, 8, 20, 8, 20]), pieceOf([9, 19, 9, 19, 9, 19, 9, 19, 9, 19, 9, 19])];
    const cv = varied.map((t) => measure(t, rhythm).value!);
    expect(cv[8]).toBeLessThan(0.5); expect(cv[9]).toBeLessThan(cv[8]);
    expect(lim(fitToCorpus(rhythm, varied, 1), 'minCv')).toBe(cv[8]);
    expect(lim(fitToCorpus(rhythm, varied, 0), 'minCv')).toBe(cv[9]);
    // DISTRIBUTION: only the tolerance moves; the mix it is a tolerance around stays the author's.
    const mix: Measurement = { observer: 'DISTRIBUTION', params: { edges: [8, 18], shares: [0.5, 0.5, 0], tolerance: 0.1 } };
    const mixed = (short: number): string => pieceOf([...Array.from({ length: short }, () => 6), ...Array.from({ length: 20 - short }, () => 12)]);
    const mixes = [...Array.from({ length: 8 }, () => mixed(10)), mixed(13), mixed(14)];
    const loosened = fitToCorpus(mix, mixes, 1);
    const tolerance = lim(loosened, 'tolerance');
    expect(loosened).toEqual({ observer: 'DISTRIBUTION', params: { edges: [8, 18], shares: [0.5, 0.5, 0], tolerance } });
    // 13 short sentences of 20 against a target of half is 15% off: the tolerance is the first hundredth the observer
    // itself counts that piece as meeting, and one hundredth less leaves it out again
    expect(tolerance).toBeGreaterThanOrEqual(0.15); expect(tolerance).toBeLessThanOrEqual(0.16);
    expect(piecesBreaking(mixes, loosened!)).toEqual([9]);
    expect(piecesBreaking(mixes, { ...mix, params: { ...mix.params, tolerance: Math.round(tolerance * 100 - 1) / 100 } })).toEqual([8, 9]);
    expect(piecesBreaking(mixes, fitToCorpus(mix, mixes, 0)!)).toEqual([]);
    // OPENING: the maximum goes up; the minimum is never moved, so a piece under it cannot be brought in.
    const opens = (words: number): string => `${sentence(words)}\n\n${pieceOf(Array.from({ length: 12 }, () => 12))}`;
    const openings = [...Array.from({ length: 8 }, () => opens(20)), opens(34), opens(38)];
    const opening: Measurement = { observer: 'OPENING', params: { minWords: 10, maxWords: 30 } };
    expect(fitToCorpus(opening, openings, 1)).toEqual({ observer: 'OPENING', params: { minWords: 10, maxWords: 34 } });
    expect(fitToCorpus(opening, [...openings.slice(0, 8), opens(4), opens(5)], 1)).toBeNull();
  });
  it('a measurement with no numeric limit to move has none: a banned-phrase list, a presence check, a counted feature\'s band', () => {
    const uses = Array.from({ length: 6 }, () => pieceWith(30, ['leverage']));
    const lexicon: Measurement = { observer: 'LEXICON', params: { terms: ['leverage'] } };
    expect(piecesBreaking(uses, lexicon).length).toBe(6);
    expect(fitToCorpus(lexicon, uses, 1)).toBeNull();
    const presence: Measurement = { observer: 'PRESENCE', params: { sections: ['recommendation'] } };
    expect(piecesBreaking(uses, presence).length).toBe(6);
    expect(fitToCorpus(presence, uses, 1)).toBeNull();
    const feature: Measurement = { observer: 'FEATURE', params: { feature: ['sentenceP90'], maxValue: 5 } };
    expect(piecesBreaking(uses, feature).length).toBe(6);
    expect(fitToCorpus(feature, uses, 1)).toBeNull();
    // and a banned phrase in the opening is not excused by a longer opening
    const stock = Array.from({ length: 6 }, () => `In today's world ${sentence(40).toLowerCase()}\n\n${pieceOf([12, 12, 12, 12, 12, 12])}`);
    const edge: Measurement = { observer: 'OPENING', params: { avoid: ['in today\'s world'], maxWords: 30 } };
    expect(piecesBreaking(stock, edge).length).toBe(6);
    expect(fitToCorpus(edge, stock, 1)).toBeNull();
  });
});

// ── At discovery ────────────────────────────────────────────────────────────────────────────────

/** A piece of the author's: 30 sentences of 10 words in paragraphs of three; `long` makes every sentence that long. */
const post = (i: number, long = 10): { id: string; text: string } => ({ id: `p${i}.md`, text: even(long, 30) });
/** What discover.ts records with each counted rule (cli/commands/discover.ts): its conformance and the corpus's count. */
const recorded = (rules: ReturnType<typeof deriveMeasuredRules>, own: readonly string[]): Record<string, ProposalEvidence> =>
  Object.fromEntries(rules.map((m) => [m.requirement.requirementId, { framings: [], heldOut: null, needs: null, inSample: m.conformance,
    corpus: m.requirement.measurement ? { pieces: own.length, breaking: piecesBreaking(own, m.requirement.measurement) } : null }]));

describe('a new skill\'s counted rules are true of its author from the start', () => {
  // 24 pieces, four of them with long sentences: medians of 14, 15, 16 and 17 words against a pooled median of 10.
  const pieces = [...Array.from({ length: 20 }, (_, i) => post(i)), post(20, 14), post(21, 15), post(22, 16), post(23, 17)];
  const read = pieces.slice(0, 18).concat(pieces.slice(20, 22)); const held = pieces.slice(18, 20).concat(pieces.slice(22));
  const own = [...read, ...held].map((p) => p.text);

  it('the sentence rule quotes the limit its author\'s pieces meet, says that it was moved, and is suggested required on that', () => {
    expect(allowed(24, CORPUS_RULE_SHARE)).toBe(1);
    const rules = deriveMeasuredRules(read, held, 'MACHINE_DISCOVERED');
    const sentenceRule = rules.find((r) => r.requirement.measurement?.observer === 'SENTENCE_LENGTH');
    // as computed: the pooled median and 90th percentile are both 10 words, so 10 × 1.2 + 1 = 13 and 10 × 1.15 + 1 = 12.5 → 13.
    // The long pieces are long throughout, so they sit past both limits, and both go to the third of the four.
    expect(sentenceRule?.requirement.measurement?.params).toEqual({ medianMax: 16, p90Max: 16 });
    const { medianMax, p90Max } = sentenceRule?.requirement.measurement?.params as { medianMax: number; p90Max: number };
    expect(sentenceRule?.requirement.statement).toBe(`I keep sentences short: a median under ${medianMax} words, and nine in ten under ${p90Max}.`);
    expect(sentenceRule?.requirement.evidence).toMatch(/^your median is 10 words and nine in ten are under \d+, over 600 sentences in 20 pieces; set at a median of 16 \(not 13\) and nine in ten under 16 \(not 13\) so that all but one of your 24 pieces meet it$/);
    expect(sentenceRule?.requirement.measurement ? piecesBreaking(own, sentenceRule.requirement.measurement).length : null).toBe(1);
    // the counts kept with it are the held-out pieces against the limit BEFORE it moved: two of the four held out break 13
    expect(sentenceRule?.conformance).toEqual({ applicable: 4, present: 2, independent: true, fitted: true });

    const { suggestions, corpus } = suggestAll(rules.map((r) => r.requirement), recorded(rules, own), 'GENERATE');
    const at = rules.indexOf(sentenceRule!);
    expect(suggestions[at]).toEqual({ decision: 'APPROVE', materiality: 'REQUIRED', needs: null, strength: 3, why: 'set where 23 of your 24 pieces meet it; checked on every output' });
    expect(corpus?.moved).toEqual([]);
    expect(corpus?.pieces).toBe(24);
    expect(corpus?.passing).toBe(23);
  });
  it('polarity: the same rule with its limit left as computed is not suggested required, and one fitted with nothing held out is shown, not instructed', () => {
    const rules = deriveMeasuredRules(read, held, 'MACHINE_DISCOVERED');
    const rule = rules[0];
    const meta = recorded(rules, own)[rule.requirement.requirementId];
    // without the mark, the same counts read as they always did: 2 of 4 held-out pieces is not four in five
    expect(suggest(rule.requirement, { ...meta, inSample: { applicable: 4, present: 2, independent: true } }, 'GENERATE').materiality).toBe('PREFERRED');
    // marked fitted, but more pieces break it than a required rule allows: the mark alone earns nothing
    expect(suggest(rule.requirement, { ...meta, corpus: { pieces: 24, breaking: [1, 2] } }, 'GENERATE').materiality).toBe('PREFERRED');
    // marked fitted with no count of the corpus at all (a session from before the count was kept)
    expect(suggest(rule.requirement, { ...meta, corpus: null }, 'GENERATE').materiality).toBe('PREFERRED');
    // nothing held out: a fitted limit passes the pieces it was fitted to by construction, like any in-sample check
    const alone = deriveMeasuredRules([...read, ...held], [], 'MACHINE_DISCOVERED');
    expect(alone[0].conformance.fitted).toBe(true);
    expect(alone[0].conformance.independent).toBe(false);
    expect(suggest(alone[0].requirement, recorded(alone, own)[alone[0].requirement.requirementId], 'GENERATE').materiality).toBe('PREFERRED');
  });
  it('a fitted limit is not rejected for what the held-out pieces did against the limit it replaced', () => {
    // All four long pieces held out: none of them meets the computed limit, which used to read "suggest rejecting it".
    const longHeld = pieces.slice(20); const rest = pieces.slice(0, 20);
    const rules = deriveMeasuredRules(rest, longHeld, 'MACHINE_DISCOVERED');
    const all = [...rest, ...longHeld].map((p) => p.text);
    expect(rules[0].conformance).toEqual({ applicable: 4, present: 0, independent: true, fitted: true });
    const meta = recorded(rules, all)[rules[0].requirement.requirementId];
    expect(suggest(rules[0].requirement, meta, 'GENERATE').materiality).toBe('REQUIRED');
    expect(suggest(rules[0].requirement, { ...meta, inSample: { applicable: 4, present: 0, independent: true } }, 'GENERATE').decision).toBe('REJECT');
  });
  it('polarity: on a corpus whose pieces all meet the computed limits nothing is fitted, and every proposal is what the formula gives', () => {
    const uniform = Array.from({ length: 24 }, (_, i) => post(i));
    const rules = deriveMeasuredRules(uniform.slice(0, 20), uniform.slice(20), 'MACHINE_DISCOVERED');
    // 600 sentences of 10 words in 200 paragraphs of three: 10 × 1.2 + 1 = 13, 10 × 1.15 + 1 = 12.5 → 13, and a cap of 3.
    expect(rules.map((r) => r.requirement.statement)).toEqual([
      'I keep sentences short: a median under 13 words, and nine in ten under 13.',
      'I keep paragraphs to 3 sentences at most.',
      'I hedge rarely: at most 2 hedging words per thousand.',
      expect.stringMatching(/^Never use stock model phrasing: delve, /),
    ]);
    expect(rules.map((r) => r.requirement.measurement?.params).slice(0, 3)).toEqual([{ medianMax: 13, p90Max: 13 }, { maxSentences: 3 }, { maxPer1000: 2 }]);
    expect(rules.map((r) => r.requirement.evidence).slice(0, 3)).toEqual([
      'your median is 10 words and nine in ten are under 11, over 600 sentences in 20 pieces',
      '95% of your 200 paragraphs have 3 sentences or fewer',
      'you use about 0 per thousand, over 6000 words',
    ]);
    for (const r of rules) {
      expect(r.conformance).toEqual({ applicable: 4, present: 4, independent: true });
      expect('fitted' in r.conformance).toBe(false);
    }
  });
  it('the evidence line says what a limit was moved to and from, and how many pieces meet it', () => {
    const corpus = [...Array.from({ length: 20 }, () => even(10)), even(21), even(22), even(23), even(25)];
    const was: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 19, p90Max: 20 } };
    expect(fitNote(was, { observer: 'SENTENCE_LENGTH', params: { medianMax: 23, p90Max: 23 } }, corpus))
      .toBe('set at a median of 23 (not 19) and nine in ten under 23 (not 20) so that all but one of your 24 pieces meet it');
    expect(fitNote(was, { observer: 'SENTENCE_LENGTH', params: { medianMax: 25, p90Max: 25 } }, corpus)).toMatch(/so that every one of your 24 pieces meets it$/);
    expect(fitNote({ observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.15 } }, { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.99 } }, corpus)).toMatch(/^set at 99% \(not 15%\) /);
  });
});

describe('the rules read from the gap between the author and the model are fitted the same way', () => {
  // An author who contracts: every piece has contractions, and two of 24 also write a form out now and then.
  const contracting = (i: number, whole: number): { id: string; text: string } => ({ id: `c${i}.md`,
    text: pieceWith(60, [...Array.from({ length: whole }, () => 'it is'), ...Array.from({ length: 6 }, () => 'don\'t')]) });
  const corpus = [...Array.from({ length: 22 }, (_, i) => contracting(i, 0)), contracting(22, 1), contracting(23, 2)];
  const read = corpus.slice(0, 19).concat(corpus.slice(22)); const held = corpus.slice(19, 22);

  it('a cap more of the author\'s pieces break than the review allows is set where they are, and its statement and evidence say the new number', () => {
    const rules = deriveContrastRules(read, held, [], 'MACHINE_DISCOVERED');
    const cap = rules.find((r) => r.requirement.statement.startsWith("Contract as I do"));
    const own = [...read, ...held].map((p) => p.text);
    const fittedTo = cap?.requirement.measurement?.params.maxPer1000 as number;
    // the computed cap is 1 per 1,000 words (nine in ten pieces write nothing out); one written-out form in 601 words is 1.7
    expect(fittedTo).toBe(1.7);
    expect(cap?.requirement.statement).toBe('Contract as I do ("don\'t", "it\'s", "you\'re"): at most 1.7 uncontracted forms ("do not", "it is") per 1,000 words.');
    expect(cap?.requirement.evidence).toMatch(/; set at a ceiling of 1\.7 \(not 1\) so that all but one of your 24 pieces meet it$/);
    expect(cap?.conformance).toEqual({ applicable: 3, present: 3, independent: true, fitted: true });
    expect(cap?.requirement.measurement ? piecesBreaking(own, cap.requirement.measurement).length : null).toBe(1);
  });
  it('polarity: with one such piece, which the review allows, the cap stays as computed and nothing is marked', () => {
    const one = [...Array.from({ length: 23 }, (_, i) => contracting(i, 0)), contracting(23, 2)];
    const rules = deriveContrastRules(one.slice(0, 19).concat(one.slice(22)), one.slice(19, 22), [], 'MACHINE_DISCOVERED');
    const cap = rules.find((r) => r.requirement.statement.startsWith("Contract as I do"));
    expect(cap?.requirement.measurement?.params.maxPer1000).toBe(1);
    expect(cap?.requirement.evidence).not.toMatch(/set at/);
    expect(cap?.conformance).toEqual({ applicable: 3, present: 3, independent: true });
    // and no rule of this pass is marked fitted on a corpus that meets what was computed
    expect(rules.filter((r) => r.conformance.fitted)).toEqual([]);
  });
});

// ── For a skill built before ────────────────────────────────────────────────────────────────────

describe('the command a skill built before is offered', () => {
  it('a measurement is written in the words --measure takes: parsed again, it is the same measurement, for every observer whose limit moves', () => {
    const all: Measurement[] = [
      { observer: 'SENTENCE_LENGTH', params: { medianMax: 23, p90Max: 41 } },
      { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 6 } },
      { observer: 'HEDGE_RATE', params: { maxPer1000: 3.3 } },
      { observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], minPer1000: 0.5, maxPer1000: 20 } },
      { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0.4, prefer: [' - '] } },
      { observer: 'TERM_RATE', params: { terms: ['but', 'so'], maxPer1000: 10 } },
      { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.2 } },
      { observer: 'RATIO', params: { numerator: ['it\'s', 'don\'t'], denominator: ['it is', 'do not'], minShare: 0.7 } },
      { observer: 'RATIO', params: { numerator: ['but'], denominator: ['however'], maxShare: 0 } },
      { observer: 'DISTRIBUTION', params: { edges: [8, 18, 30], shares: [0.2, 0.5, 0.3, 0], tolerance: 0.15 } },
      { observer: 'RHYTHM', params: { unit: ['SENTENCE'], minCv: 0.42 } },
      { observer: 'OPENING', params: { minWords: 0, maxWords: 34 } },
      { observer: 'CLOSING', params: { avoid: ['in conclusion'], maxWords: 60 } },
    ];
    for (const m of all) {
      const spec = formatMeasure(m);
      expect(spec, JSON.stringify(m)).not.toBeNull();
      expect(parseMeasure(spec!)).toEqual(m);
    }
    expect(formatMeasure(all[0])).toBe('SENTENCE_LENGTH:medianMax=23,p90Max=41');
  });
  it('polarity: what --measure cannot say is not written at all, because a command that dropped part of a rule would loosen it further', () => {
    // discovery's own records on a rule, which the flag does not take
    expect(formatMeasure({ observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 0.5, never: ['candour'], role: ['machine-tell'] } })).toBeNull();
    expect(formatMeasure({ observer: 'TERM_RATE', params: { terms: ['crucial'], maxPer1000: 0.5, role: ['model-vocabulary'] } })).toBeNull();
    // a word the parser would change, a separator inside a value, a quote that would end the printed command
    expect(formatMeasure({ observer: 'TERM_RATE', params: { terms: ['But'], maxPer1000: 4 } })).toBeNull();
    expect(formatMeasure({ observer: 'TERM_RATE', params: { terms: ['well, then'], maxPer1000: 4 } })).toBeNull();
    expect(formatMeasure({ observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 1, prefer: ['"'] } })).toBeNull();
    // observers whose limit is never moved
    expect(formatMeasure({ observer: 'LEXICON', params: { terms: ['leverage'] } })).toBeNull();
    expect(formatMeasure({ observer: 'FEATURE', params: { feature: ['colon'], maxValue: 3 } })).toBeNull();
  });
  it('the statement is carried with the new number where it quotes the old one, left where it quotes none, and left to the owner where it is ambiguous', () => {
    const was: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 19, p90Max: 36 } };
    const is: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 23, p90Max: 36 } };
    expect(restateLimits('I keep sentences short: a median under 19 words, and nine in ten under 36.', was, is)).toBe('I keep sentences short: a median under 23 words, and nine in ten under 36.');
    // a number inside another number is not the limit
    expect(restateLimits('Since 2019 I keep 1.19 ideas a sentence, with a median under 19 words.', was, is)).toBe('Since 2019 I keep 1.19 ideas a sentence, with a median under 23 words.');
    expect(restateLimits('I keep sentences short.', was, is)).toBe('I keep sentences short.');
    // a mix's statement quotes its shares, never its tolerance: "20%" there is not the 0.2 that moved
    const mix = (tolerance: number) => ({ observer: 'DISTRIBUTION' as const, params: { edges: [8, 20], shares: [0.2, 0.4, 0.4], tolerance } });
    expect(restateLimits('About 20% under 8 words, 40% up to 20.', mix(0.2), mix(0.31))).toBe('About 20% under 8 words, 40% up to 20.');
    expect(restateLimits('Under 19 words, I said 19.', was, is)).toBeNull();
    // both limits moved, and both were the same number: which is which would be a guess
    expect(restateLimits('A median under 20 and nine in ten under 20.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 20, p90Max: 20 } }, { observer: 'SENTENCE_LENGTH', params: { medianMax: 22, p90Max: 30 } })).toBeNull();
    // a share is quoted as a percentage
    expect(restateLimits('At most 15% of sentences are five words or fewer.', { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.15 } }, { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.2 } }))
      .toBe('At most 20% of sentences are five words or fewer.');
  });
  it('the offered command sets the limit the pieces meet, with the statement; a rule with no limit to move is offered none', () => {
    const corpus = [...Array.from({ length: 20 }, () => even(10)), even(21), even(22), even(23), even(25)];
    const rule = aRequirement({ requirementId: 'm1', statement: 'I keep sentences short: a median under 19 words, and nine in ten under 36.', materiality: 'REQUIRED',
      measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 19, p90Max: 36 } } });
    const line = amendToFit('blog', rule, corpus, allowed(corpus.length, CORPUS_RULE_SHARE));
    expect(line).toBe('atelier amend --skill blog --rule m1 --measure "SENTENCE_LENGTH:medianMax=23,p90Max=36" '
      + '--statement "I keep sentences short: a median under 23 words, and nine in ten under 36." --reason "set where 23 of my 24 pieces meet it"');
    // the measurement in the command is the one the pieces meet, as the parser reads it back
    const spec = /--measure "([^"]+)"/.exec(line ?? '')?.[1] ?? '';
    expect(piecesBreaking(corpus, parseMeasure(spec)).length).toBe(1);
    // a statement in the owner's own words that quotes no limit is not touched
    expect(amendToFit('blog', { ...rule, statement: 'Short sentences.' }, corpus, 1)).toBe('atelier amend --skill blog --rule m1 --measure "SENTENCE_LENGTH:medianMax=23,p90Max=36" --reason "set where 23 of my 24 pieces meet it"');
    // one that quotes it twice is the owner's to reword, and the line says so
    expect(amendToFit('blog', { ...rule, statement: 'Under 19 words. I mean 19.' }, corpus, 1)).toMatch(/ --statement "<the rule, with its new limit>" --reason "set where 23 of my 24 pieces meet it"$/);
    // a statement with a double quote in it goes in single quotes
    expect(amendToFit('blog', { ...rule, statement: 'Keep it "short": under 19 words.' }, corpus, 1)).toContain(' --statement \'Keep it "short": under 23 words.\' ');
    // polarity: nothing to move, already holding, out of reach, or not sayable in --measure
    expect(amendToFit('blog', aRequirement({ requirementId: 'x1', measurement: { observer: 'LEXICON', params: { terms: ['stone'] } } }), corpus, 1)).toBeNull();
    expect(amendToFit('blog', rule, corpus.slice(0, 21), 1)).toBeNull();
    expect(amendToFit('blog', { ...rule, measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 11, p90Max: 36 } } }, corpus, 1)).toBeNull();
    expect(amendToFit('blog', aRequirement({ requirementId: 'x2' }), corpus, 1)).toBeNull();
  });
});

// ── Through the shipped binary ──────────────────────────────────────────────────────────────────

describe('through the binary: a new skill is true of its author, and one built before is brought in line by one ruling', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  const data = mkdtempSync(join(tmpdir(), 'atelier-fit-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-fit-proj-'));
  const dir = join(proj, 'posts');
  // 24 posts, four of them long throughout (14, 15, 16 and 17 words a sentence). One short post is reserved by name,
  // so the author's own pieces are the other 23, the four long ones among them.
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 24; i++) writeFileSync(join(dir, `post-${String(i).padStart(2, '0')}.md`), `# Note ${i}\n\n${even(i < 20 ? 10 : i - 6, 30)}\n`);
  // A developer's own ATELIER_* settings must not decide which calls reach the scripted backend.
  const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ATELIER_')));
  const run = (...args: string[]): string => {
    try {
      return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
        encoding: 'utf8', cwd: proj, env: { ...cleanEnv(), ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' } });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
  };
  const build = (): string => run('build', '--name', 'limits');
  const r = { screen: '', built: '', before: '', offered: '', after: '', noLimit: '' };

  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-00.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_factors: { factors: [factor('Lead with the decision, then the reasoning.')] },
      emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
      emit_observation: { applicable: true, present: true, why: 'seen' },
      emit_persona: { points: [] },
      emit_piece: { piece: 'We decided first, and explained after. The reasoning follows the decision, and it is short.' },
    } }) });
    const NEW = ['new', dir, 'write me a blog post in the voice and style of these', '--name', 'limits', '--reserve', 'post-00.md'];
    r.screen = run(...NEW);
    r.built = run(...NEW, '--accept');
    // A SKILL BUILT BEFORE: the sentence rule as the pooled margin alone set it, which four of the author's pieces break.
    run('amend', '--skill', 'limits', '--rule', 'm1', '--measure', 'SENTENCE_LENGTH:medianMax=12,p90Max=14',
      '--statement', 'I keep sentences short: a median under 12 words, and nine in ten under 14.', '--reason', 'as an earlier build set it');
    r.before = build();
    // The owner runs the command the build offered for m1, exactly as printed.
    const line = /^ {4}m1: atelier amend (.*)$/m.exec(r.before)?.[1] ?? '';
    const args = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
    r.offered = line;
    if (args.length) run('amend', ...args);
    r.after = build();
    // A rule with no limit to move, which every piece breaks.
    run('amend', '--skill', 'limits', '--rule', 'm2', '--measure', 'LEXICON:stone', '--reason', 'a ban every piece breaks');
    r.noLimit = build();
  }, 300_000);
  afterAll(() => { backend.kill(); });

  it('a new skill: the sentence rule is proposed at the limit the author\'s pieces meet, suggested required, and the build finds the pieces meeting it', () => {
    expect(r.screen).toMatch(/^ {2}m1 {3}I keep sentences short: a median under 16 words, and nine in ten under \d+\.$/m);
    expect(r.screen).toMatch(/REQUIRED.*set where 22 of your 23 pieces meet it; checked on every output/);
    expect(r.screen).toMatch(/Your own pieces: 22 of 23 meet every counted rule suggested as required\./);
    expect(r.built).toMatch(/Your own pieces: 22 of 23 meet every required rule that is counted\./);
    // polarity: within what the review allows, the build offers nothing
    expect(r.built).not.toMatch(/They break/);
  });
  it('a skill built before: the build offers the limit the pieces meet, with the statement saying the new number, as a ready command', () => {
    expect(r.before).toMatch(/Your own pieces: 19 of 23 meet every required rule that is counted\./);
    expect(r.before).toMatch(/^ {2}They break m1 \(4\) most\. For each, the limit your own pieces meet, which keeps the rule required; where no limit can be moved, the rule as a preference, which still counts and still chooses between drafts:$/m);
    expect(r.offered).toBe('--skill limits --rule m1 --measure "SENTENCE_LENGTH:medianMax=16,p90Max=16" '
      + '--statement "I keep sentences short: a median under 16 words, and nine in ten under 16." --reason "set where 22 of my 23 pieces meet it"');
  });
  it('run as printed, that command brings the skill in line: the next build counts the pieces against the amended check and offers nothing more', () => {
    expect(r.after).toMatch(/Your own pieces: 22 of 23 meet every required rule that is counted\./);
    expect(r.after).not.toMatch(/They break/);
  });
  it('polarity: a rule with no limit to move is offered as a preference, on its own line, and nothing else is', () => {
    expect(r.noLimit).toMatch(/Your own pieces: 0 of 23 meet every required rule that is counted\./);
    expect(r.noLimit).toMatch(/^ {2}They break m2 \(23\), m1 \(1\) most\./m);
    expect(r.noLimit).toMatch(/^ {4}m2: atelier amend --skill limits --rule m2 --materiality PREFERRED --reason "<why>"$/m);
    // m1 is within what a rule is allowed (one piece), so there is no limit to move for it either
    expect(r.noLimit).toMatch(/^ {4}m1: atelier amend --skill limits --rule m1 --materiality PREFERRED --reason "<why>"$/m);
  });
});
