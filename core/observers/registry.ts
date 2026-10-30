// atelier/core/observers/registry.ts — THE RULES A MACHINE CAN CHECK WITHOUT AN OPINION.
//
// Every observer here returns a FACT about a piece of text: a phrase occurs or it does not, a median is
// a number, a paragraph has so many sentences. None of them judges whether the writing is good, and
// none of them decides whether a rule applies — which rule a text is held to is the standard's
// business, and which rules carry a measurement is the owner's (see `Measurement`).
//
// That is the whole scope, deliberately. The aphorism study showed what happens one step past it: a
// property of the relationship between a sentence and its argument is not observable by any of these,
// and pretending it is would manufacture confidence where confidence has repeatedly been wrong. Voice
// rules that are about WHEN or WHY stay with a person, or with a reader that certifies nothing.
//
// What these buy is the part of a house style that is measurable — banned words, substitution
// tables, sentence and paragraph length, hedging, the rates and proportions in ./balance.ts, the
// model's habits in ./style.ts, the opening, close and headings in ./structure.ts — checked on every output, with the exact span that
// broke the rule, so a repair can rewrite that span and nothing else.

import type { Measurement, ObserverId } from '../state/canonical-state.js';
import { TERM_RATE, RATIO, DISTRIBUTION, RHYTHM } from './balance.js';
import { OPENING, CLOSING, HEADINGS, PRESENCE } from './structure.js';
import { FEATURE } from './features.js';
import { TABLE, CITED, LINES, LENGTH, NAMES_TEST } from './obligations.js';
import { GRAMMAR } from './grammar.js';
import { SHAPE } from './shape.js';
import { CHECK } from './written.js';
import { findPattern, PATTERN_LABEL, PATTERN_IDS, proseWords, styleDistanceDocs, authorSelfMargins, type PatternId } from './style.js';

export interface Span {
  readonly start: number; readonly end: number; readonly text: string; readonly why: string;
  /** for a machine-writing move, the family it belongs to (./tells.ts): what a per-family rule keys on, never the wording of `why` */
  readonly family?: string;
  /** for a mechanical error (./grammar.ts): the text that corrects it in place, "" to remove it; absent where the checker offers none */
  readonly replacement?: string;
}

export interface ObserverResult {
  readonly verdict: 'MET' | 'VIOLATED' | 'NOT_APPLICABLE';
  /** where the text broke the rule. Empty when met. */
  readonly spans: readonly Span[];
  /** the measured quantity, for distributions and the distinctiveness floor. Null for presence checks. */
  readonly value: number | null;
  readonly detail: string;
  /**
   * For a rule that holds a value to a band: the signed distance past the band's edge, in widths of the band (1 when
   * the band has no width or one edge), positive above it, negative below, 0 inside. A repair reads direction and
   * how far from it; a rule that has no band leaves it unset.
   */
  readonly error?: number;
}

/**
 * WHAT A CHECK MAY READ BESIDE THE OUTPUT: the request the output answers, and the material it was written from,
 * each file by name. Most rules are about the text alone and never look. A rule about what the work was made from
 * ("every figure is in a source you gave", "each company the brief names has its row") cannot be read off the
 * output, and without this each such rule became a line built by hand outside the registry.
 *
 * Absent, a check that needs it says NOT_APPLICABLE: a rule that could not be read is never a rule that held.
 */
export interface CheckContext {
  readonly request?: string;
  readonly material?: readonly { readonly name: string; readonly text: string }[];
  /** the text the run works on (a review's proposal), when there is one: what it quotes of it is not its own style (./quoted.ts) */
  readonly worksOn?: string;
}

export interface Observer {
  readonly id: ObserverId;
  /** the measurement in words, for the review screen and the skill file */
  describe(params: Measurement['params']): string;
  /** refuse a malformed measurement before it is stored, not when it is first run */
  validate(params: Measurement['params']): string | null;
  observe(text: string, params: Measurement['params'], context?: CheckContext): ObserverResult;
}

export { proseRegions, wordsOf, sentencesOf, paragraphsOf, quantile, findTerms, splitTerm, DEFAULT_HEDGES, proseBlocks } from './text.js';
export type { Sentence } from './text.js';
import { proseRegions, wordsOf, sentencesOf, paragraphsOf, quantile, findTerms, splitTerm, DEFAULT_HEDGES } from './text.js';
import { BAN_ONLY_FAMILIES } from './tells.js';
import { pooledOut, expectedBand } from './pooled.js';

const num = (p: Measurement['params'], k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const list = (p: Measurement['params'], k: string): readonly string[] | null => {
  const v = p[k];
  return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : null;
};
const nums = (p: Measurement['params'], k: string): readonly number[] | null => {
  const v = p[k];
  return Array.isArray(v) && v.every((x): x is number => typeof x === 'number') ? v : null;
};

const OBSERVERS: Readonly<Record<ObserverId, Observer>> = {
  LEXICON: {
    id: 'LEXICON',
    describe: (p) => `none of: ${(list(p, 'terms') ?? []).map((t) => { const x = splitTerm(t); return x.prefer ? `${x.avoid} (write ${x.prefer})` : x.avoid; }).join(', ')}`,
    validate: (p) => ((list(p, 'terms') ?? []).length ? null : 'a lexicon needs at least one term'),
    observe(text, p) {
      const spans = findTerms(text, list(p, 'terms') ?? []);
      return { verdict: spans.length ? 'VIOLATED' : 'MET', spans, value: spans.length,
        detail: spans.length ? `${spans.length} use(s): ${[...new Set(spans.map((s) => s.text.toLowerCase()))].join(', ')}` : 'none used' };
    },
  },
  SENTENCE_LENGTH: {
    id: 'SENTENCE_LENGTH',
    describe: (p) => `median sentence ≤ ${num(p, 'medianMax')} words, nine in ten ≤ ${num(p, 'p90Max')}`,
    validate: (p) => {
      const med = num(p, 'medianMax'); const p90 = num(p, 'p90Max');
      if (med === null || p90 === null) return 'needs medianMax and p90Max';
      if (med <= 0 || p90 <= 0) return 'targets must be greater than zero';
      return med > p90 ? 'medianMax cannot exceed p90Max — a median above the 90th percentile describes no text' : null;
    },
    observe(text, p) {
      const ss = sentencesOf(text);
      if (ss.length < 3) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'fewer than three sentences' };
      const lens = ss.map((s) => s.words);
      const med = quantile(lens, 0.5); const p90 = quantile(lens, 0.9);
      const medMax = num(p, 'medianMax') ?? Infinity; const p90Max = num(p, 'p90Max') ?? Infinity;
      // The sentences to shorten: over the 90th-percentile cap when that is what broke; when only the
      // median is too high, the ones above the median target, so a repair always has somewhere to act.
      const cut = p90 > p90Max ? p90Max : medMax;
      const long = ss.filter((s) => s.words > cut)
        .map((s) => ({ start: s.start, end: s.end, text: s.text, why: `${s.words} words, over ${cut}` }));
      const ok = med <= medMax && p90 <= p90Max;
      return { verdict: ok ? 'MET' : 'VIOLATED', spans: ok ? [] : long, value: med,
        detail: `median ${med}, 90th percentile ${p90} (targets ${medMax}, ${p90Max})` };
    },
  },
  PARAGRAPH_LENGTH: {
    id: 'PARAGRAPH_LENGTH',
    describe: (p) => `paragraphs of at most ${num(p, 'maxSentences')} sentences`,
    validate: (p) => { const n = num(p, 'maxSentences'); return n === null ? 'needs maxSentences' : n < 1 ? 'maxSentences must be at least 1' : null; },
    observe(text, p) {
      const ps = paragraphsOf(text);
      if (!ps.length) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no paragraphs' };
      const max = num(p, 'maxSentences') ?? Infinity;
      const over = ps.filter((x) => x.sentences > max)
        .map((x) => ({ start: x.start, end: x.start + x.text.length, text: x.text, why: `${x.sentences} sentences, over ${max}` }));
      return { verdict: over.length ? 'VIOLATED' : 'MET', spans: over, value: Math.max(...ps.map((x) => x.sentences)),
        detail: over.length ? `${over.length} paragraph(s) over ${max} sentences` : ((n) => `longest ${n} sentence${n === 1 ? '' : 's'}`)(Math.max(...ps.map((x) => x.sentences))) };
    },
  },
  HEDGE_RATE: {
    id: 'HEDGE_RATE',
    describe: (p) => `at most ${num(p, 'maxPer1000')} hedging words per thousand`,
    validate: (p) => { const n = num(p, 'maxPer1000'); return n === null ? 'needs maxPer1000' : n < 0 ? 'maxPer1000 cannot be negative' : null; },
    observe(text, p) {
      const words = proseRegions(text).reduce((n, r) => n + wordsOf(r.text).length, 0);
      if (words < 100) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'too short to measure: under 100 words' };
      const spans = findTerms(text, list(p, 'terms') ?? DEFAULT_HEDGES);
      const rate = Math.round((spans.length / words) * 10000) / 10;
      const max = num(p, 'maxPer1000') ?? Infinity;
      return { verdict: rate <= max ? 'MET' : 'VIOLATED', spans: rate <= max ? [] : spans, value: rate,
        detail: `${rate} per thousand words (target ≤ ${max})` };
    },
  },
  // ── Counted against the model's own habits (see core/observers/style.ts) ─────────────────────
  PATTERN_RATE: {
    id: 'PATTERN_RATE',
    describe: (p) => {
      const id = (list(p, 'pattern') ?? [])[0] as PatternId | undefined;
      const lo = num(p, 'minPer1000'); const hi = num(p, 'maxPer1000');
      const what = id ? PATTERN_LABEL[id] : 'a pattern';
      const prefer = (list(p, 'prefer') ?? [])[0];
      if (hi === 0) return `no ${what}${prefer ? `; write "${prefer}" instead` : ''}`;
      const never = list(p, 'never');
      if (never?.length) return `${what}: none of ${never.length} kind(s) you never use, and at most ${hi} per 1,000 words of the rest`;
      const pooled = num(p, 'pooledPerWord') !== null ? '; a short piece is held to the count its length expects at your pooled rate' : '';
      return `${what}: ${lo !== null ? `at least ${lo}` : ''}${lo !== null && hi !== null ? ' and ' : ''}${hi !== null ? `at most ${hi}` : ''} per 1,000 words${pooled}`;
    },
    validate: (p) => {
      const id = (list(p, 'pattern') ?? [])[0];
      if (!id || !PATTERN_IDS.includes(id as PatternId)) return `pattern must be one of ${PATTERN_IDS.join(', ')}`;
      if (num(p, 'minPer1000') === null && num(p, 'maxPer1000') === null) return 'needs minPer1000, maxPer1000 or both';
      const pooled = num(p, 'pooledPerWord');
      if (pooled !== null && (pooled < 0 || (num(p, 'pooledWords') ?? 0) <= 0)) return 'a pooled rate needs pooledPerWord ≥ 0 and pooledWords > 0';
      return null;
    },
    observe(text, p) {
      const id = (list(p, 'pattern') ?? [])[0] as PatternId;
      const words = proseWords(text);
      const prefer = (list(p, 'prefer') ?? [])[0];
      // A move the author never makes is banned outright, so it is checked at any length: a two-line
      // support reply that opens "Let me be blunt" has made it. A RATE needs 150 words to mean anything,
      // unless the rule carries one pooled over the author's short pieces (./pooled.ts): then a short text is
      // held to the count expected of its length, and "under 150 words" is never the answer.
      // A BAN READ AT ANY LENGTH (`anyLength`, written on bans built from 1.1 on): one hit in a short post breaks it,
      // none meets it. A ban a 1.0 store holds keeps its 1.0 verdict under 150 words.
      if (words < 150 && words > 0 && num(p, 'maxPer1000') === 0 && num(p, 'anyLength') === 1) {
        const never0 = new Set(list(p, 'never') ?? []);
        const found = findPattern(text, id).filter((s) => !(s.family !== undefined && BAN_ONLY_FAMILIES.has(s.family) && !never0.has(s.family)))
          .map((s) => (prefer ? { ...s, why: `${s.why}; write "${prefer}" instead` } : s));
        return found.length ? { verdict: 'VIOLATED', spans: found, value: found.length, detail: `${found.length} in ${words} words (none allowed)` }
          : { verdict: 'MET', spans: [], value: 0, detail: `none in ${words} words` };
      }
      if (words < 150) {
        const neverShort = new Set(list(p, 'never') ?? []);
        const bannedShort = neverShort.size ? findPattern(text, id).filter((s) => s.family !== undefined && neverShort.has(s.family)) : [];
        if (bannedShort.length) return { verdict: 'VIOLATED', spans: bannedShort, value: null, detail: `${bannedShort.length} move(s) you never make` };
        const pooled = num(p, 'pooledPerWord');
        // A SHORT TEXT FREE OF EVERY BANNED MOVE MEETS THE BAN. Read as "too short", a short answer whose em dash
        // was fixed counted as no nearer holding, the fix was thrown away, and the dash shipped. The rate is still
        // not read under 150 words, and the detail says so.
        if (pooled === null && words > 0 && neverShort.size) return { verdict: 'MET', spans: [], value: null, detail: 'none of the moves you never make; the rate is not read under 150 words' };
        if (pooled === null || words === 0) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: words === 0 ? 'no prose to count' : 'too short to measure: under 150 words' };
        const hits = findPattern(text, id).filter((s) => !(s.family !== undefined && (neverShort.has(s.family) || BAN_ONLY_FAMILIES.has(s.family))))
          .map((s) => (prefer ? { ...s, why: `${s.why}; write "${prefer}" instead` } : s));
        const lambda = pooled * words; const k = hits.length;
        const [okLo, okHi] = expectedBand(lambda);
        const side = num(p, 'maxPer1000') !== null && num(p, 'minPer1000') !== null ? 'both' : num(p, 'minPer1000') !== null ? 'low' : 'high';
        const out = pooledOut(k, lambda, side);
        const expected = `about ${Math.round(lambda * 10) / 10} expected in ${words} words (${side === 'high' ? `at most ${okHi}` : side === 'low' ? `at least ${okLo}` : `${okLo} to ${okHi}`} is within your rate)`;
        if (!out) return { verdict: 'MET', spans: [], value: k, detail: `${k} in ${words} words; ${expected}` };
        return out === 'high'
          ? { verdict: 'VIOLATED', spans: hits.slice(okHi), value: k, detail: `${k} in ${words} words; ${expected}` }
          : { verdict: 'VIOLATED', spans: [], value: k, detail: `${k} in ${words} words; ${expected}` };
      }
      const all = findPattern(text, id).map((s) => (prefer ? { ...s, why: `${s.why}; write "${prefer}" instead` } : s));
      // A MOVE THE AUTHOR NEVER MAKES IS NEVER ALLOWED. `never` names families (./tells.ts) absent from
      // every piece of the author's: each instance breaks the rule whatever the rate. A pooled rate let a
      // 4,000-word piece spend the author's small budget on moves they never make.
      const never = new Set(list(p, 'never') ?? []);
      const banned = all.filter((s) => s.family !== undefined && never.has(s.family));
      // A ban-only family the author does use is theirs: it is held by its own rule, not by this rate.
      const hits = all.filter((s) => !(s.family !== undefined && (never.has(s.family) || BAN_ONLY_FAMILIES.has(s.family))));
      const rate = Math.round((hits.length / words) * 10000) / 10;
      const lo = num(p, 'minPer1000'); const hi = num(p, 'maxPer1000');
      if (banned.length) {
        const over = hi !== null && rate > hi ? hits.slice(Math.floor((hi * words) / 1000)) : [];
        return { verdict: 'VIOLATED', spans: [...banned, ...over].sort((a, b) => a.start - b.start), value: Math.round((all.length / words) * 10000) / 10,
          detail: `${banned.length} move(s) you never make${over.length ? `, and ${rate} per 1,000 words of the rest (at most ${hi})` : ''}` };
      }
      // Only the EXCESS is sent to be rewritten: at a cap of 1 per 1,000 words, a 1,500-word piece keeps
      // one; the later occurrences are the ones over the line.
      if (hi !== null && rate > hi) {
        const allowed = Math.floor((hi * words) / 1000);
        return { verdict: 'VIOLATED', spans: hits.slice(allowed), value: rate, detail: `${rate} per 1,000 words (at most ${hi})` };
      }
      // Too FEW is a real violation and has no span to point at; it is reported, and draft selection prefers texts that meet it.
      if (lo !== null && rate < lo) return { verdict: 'VIOLATED', spans: [], value: rate, detail: `${rate} per 1,000 words (at least ${lo})` };
      return { verdict: 'MET', spans: [], value: rate, detail: `${rate} per 1,000 words` };
    },
  },
  FRAGMENT_SHARE: {
    id: 'FRAGMENT_SHARE',
    describe: (p) => `sentences of ${num(p, 'maxWords')} words or fewer: at most ${Math.round((num(p, 'maxShare') ?? 0) * 100)}% of all sentences`,
    validate: (p) => {
      const w = num(p, 'maxWords'); const s = num(p, 'maxShare');
      return w === null || s === null ? 'needs maxWords and maxShare' : s <= 0 || s >= 1 ? 'maxShare is a share between 0 and 1' : null;
    },
    observe(text, p) {
      const w = num(p, 'maxWords') ?? 5; const max = num(p, 'maxShare') ?? 1;
      const ss = sentencesOf(text);
      if (ss.length < 8) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'fewer than eight sentences' };
      const frags = ss.filter((s) => s.words <= w);
      const share = frags.length / ss.length;
      const pct = Math.round(share * 100);
      // The excess only, shortest first: those read most like a tic and cost least to fold into a neighbour.
      const excess = frags.length - Math.floor(max * ss.length);
      const toFix = [...frags].sort((a, b) => a.words - b.words || a.start - b.start).slice(0, Math.max(0, excess)).sort((a, b) => a.start - b.start);
      return share > max
        ? { verdict: 'VIOLATED', spans: toFix.map((s) => ({ start: s.start, end: s.end, text: s.text, why: `a ${s.words}-word fragment; ${pct}% of sentences are this short (at most ${Math.round(max * 100)}%)` })), value: pct, detail: `${pct}% of sentences are ${w} words or fewer (at most ${Math.round(max * 100)}%)` }
        : { verdict: 'MET', spans: [], value: pct, detail: `${pct}% of sentences are ${w} words or fewer` };
    },
  },
  STYLE_DISTANCE: {
    id: 'STYLE_DISTANCE',
    describe: () => 'closer to the author\'s function-word profile than to the model\'s own (Burrows\' Delta, per document)',
    validate: (p) => {
      const k = (list(p, 'words') ?? []).length;
      const a = nums(p, 'authorDocs')?.length ?? 0; const m = nums(p, 'modelDocs')?.length ?? 0;
      return k && nums(p, 'mean')?.length === k && nums(p, 'sd')?.length === k && a && m && a % k === 0 && m % k === 0
        ? null : 'needs words, mean, sd and per-document authorDocs/modelDocs profiles';
    },
    observe(text, p) {
      if (proseWords(text) < 300) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'under 300 words' };
      const words = list(p, 'words') ?? []; const k = words.length;
      const chunk = (xs: readonly number[]): number[][] => Array.from({ length: xs.length / k }, (_, i) => xs.slice(i * k, (i + 1) * k));
      const ref = { words, mean: nums(p, 'mean') ?? [], sd: nums(p, 'sd') ?? [], authorDocs: chunk(nums(p, 'authorDocs') ?? []), modelDocs: chunk(nums(p, 'modelDocs') ?? []) };
      const d = styleDistanceDocs(text, ref);
      const closer = d.author < d.model;
      // A CEILING AT THE AUTHOR'S OWN MARGIN. Higher used to be better without limit, which rewards a draft
      // for being more typical of the author than any piece they wrote (see authorSelfMargins).
      const own = authorSelfMargins(ref);
      const ceiling = own.length >= 3 ? quantile(own, 0.9) : null;
      const raw = d.model - d.author;
      const over = ceiling !== null && raw > ceiling;
      return { verdict: closer ? 'MET' : 'VIOLATED', spans: [], value: Math.round((over ? ceiling : raw) * 1000) / 1000,
        detail: `distance to the author ${d.author}, to the model ${d.model}: ${closer ? 'closer to the author' : 'closer to the model'}${over ? '; closer to your average than your own pieces sit, so it scores as your own pieces do and no higher' : ''}` };
    },
  },
  // ── Proportions: rates with floors, ratios between word lists, the mix of sentence lengths ────
  TERM_RATE, RATIO, DISTRIBUTION, RHYTHM,
  // ── Position: the opening, the close, the headings (see ./structure.ts) ────────────────────────
  OPENING, CLOSING, HEADINGS,
  // ── What must be there: sections, mentions, figures, how the close starts (./structure.ts) ────
  PRESENCE,
  FEATURE,
  // ── What a method requires of the work: a table, figures the writer was given, lines it cites, a test it names (./obligations.ts) ──
  TABLE, CITED, LINES, LENGTH, NAMES_TEST,
  // ── The shape of one short piece, read whole at any length (./shape.ts) ──
  SHAPE,
  // ── Mechanical errors: spelling, agreement, punctuation, by an engine the process wires in (./grammar.ts) ──
  GRAMMAR,
  // ── A check written for one step of a method, run in a sandbox (./written.ts) ──
  CHECK,
};

export const observerFor = (id: ObserverId): Observer => OBSERVERS[id];
export const OBSERVER_IDS = Object.keys(OBSERVERS) as ObserverId[];

export function measure(text: string, m: Measurement, context?: CheckContext): ObserverResult {
  return OBSERVERS[m.observer].observe(text, m.params, context);
}

export function validateMeasurement(m: Measurement): string | null {
  const o = OBSERVERS[m.observer] as Observer | undefined;
  if (!o) return `unknown observer "${m.observer}". Available: ${OBSERVER_IDS.join(', ')}`;
  return o.validate(m.params);
}
