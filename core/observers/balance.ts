// atelier/core/observers/balance.ts — HOW MUCH, NOT WHETHER: RATES, RATIOS AND MIXES.
//
// A ban says a word never appears. Most of a voice is not bans. It is proportion: this writer says
// "but" where the model says "however", keeps "so" as their connective, and mixes short sentences with
// long ones in a shape the model flattens to one medium length. Three observers count those
// proportions, each as a fact about the text with a target the owner ratified:
//
//   TERM_RATE     how often any of a list of words occurs, per 1,000 words: a floor ("use but/so at
//                 least 4 per 1,000"), a cap, or both. A LEXICON can only ban; this can ask for more.
//   RATIO         the share one list takes of two competing lists: "but" against "however", "so"
//                 against "therefore/thus/hence". Length-independent, so it holds on a reply and an essay.
//   DISTRIBUTION  the mix of sentence lengths across bands, held to the author's own mix within a
//                 tolerance (total variation distance). Catches the uniform medium sentence a median
//                 cannot see.
//
// Every violation points at spans a rewrite can act on — the excess occurrences, the competing word to
// swap, the sentences in the band that is over-represented — or at nothing, when the fix is to add
// something (a floor), in which case the verdict still counts and draft selection prefers texts that
// meet it. None of these judges quality; each counts.

import type { Measurement } from '../state/canonical-state.js';
import type { Observer, Span } from './registry.js';
import { findTerms, sentencesOf, proseSentencesOf, proseRegions, wordsOf, paragraphsOf } from './text.js';
import { headingsOf } from './structure.js';

const num = (p: Measurement['params'], k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const list = (p: Measurement['params'], k: string): readonly string[] | null => {
  const v = p[k];
  return Array.isArray(v) && v.length > 0 && v.every((x): x is string => typeof x === 'string') ? v : null;
};
const nums = (p: Measurement['params'], k: string): readonly number[] | null => {
  const v = p[k];
  return Array.isArray(v) && v.every((x): x is number => typeof x === 'number') ? v : null;
};
const proseWordCount = (text: string): number => proseRegions(text).reduce((n, r) => n + wordsOf(r.text).length, 0);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const quoted = (xs: readonly string[]): string => xs.map((x) => `"${x}"`).join('/');

// ── TERM_RATE ────────────────────────────────────────────────────────────────────────────────────

export const TERM_RATE: Observer = {
  id: 'TERM_RATE',
  describe: (p) => {
    const lo = num(p, 'minPer1000'); const hi = num(p, 'maxPer1000');
    const what = quoted(list(p, 'terms') ?? []);
    return `${what}: ${lo !== null ? `at least ${lo}` : ''}${lo !== null && hi !== null ? ' and ' : ''}${hi !== null ? `at most ${hi}` : ''} per 1,000 words`;
  },
  validate: (p) => {
    if (!list(p, 'terms')) return 'needs terms';
    const lo = num(p, 'minPer1000'); const hi = num(p, 'maxPer1000');
    if (lo === null && hi === null) return 'needs minPer1000, maxPer1000 or both';
    if (lo !== null && hi !== null && lo > hi) return 'minPer1000 cannot exceed maxPer1000';
    return null;
  },
  observe(text, p) {
    const words = proseWordCount(text);
    // A rate over fewer words than this is one occurrence either way, and says nothing.
    if (words < 150) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'under 150 words' };
    const hits = findTerms(text, list(p, 'terms') ?? []);
    const rate = r1((hits.length / words) * 1000);
    const lo = num(p, 'minPer1000'); const hi = num(p, 'maxPer1000');
    if (hi !== null && rate > hi) {
      // Only the excess is sent to be rewritten; the first occurrences up to the cap stay.
      const allowed = Math.floor((hi * words) / 1000);
      return { verdict: 'VIOLATED', value: rate, detail: `${rate} per 1,000 words (at most ${hi})`,
        spans: hits.slice(allowed).map((s) => ({ ...s, why: `${s.text} over the rate: ${rate} per 1,000 words (at most ${hi})` })) };
    }
    if (lo !== null && rate < lo) return { verdict: 'VIOLATED', spans: [], value: rate, detail: `${rate} per 1,000 words (at least ${lo})` };
    return { verdict: 'MET', spans: [], value: rate, detail: `${rate} per 1,000 words` };
  },
};

// ── RATIO ────────────────────────────────────────────────────────────────────────────────────────

/** The fewest occurrences of either list for a share to mean anything. */
export const RATIO_MIN_EVENTS = 4;

export const RATIO: Observer = {
  id: 'RATIO',
  describe: (p) => {
    const lo = num(p, 'minShare'); const hi = num(p, 'maxShare');
    const a = quoted(list(p, 'numerator') ?? []); const b = quoted(list(p, 'denominator') ?? []);
    const band = lo !== null && hi !== null ? `between ${Math.round(lo * 100)}% and ${Math.round(hi * 100)}%`
      : lo !== null ? `at least ${Math.round(lo * 100)}%` : `at most ${Math.round((hi ?? 1) * 100)}%`;
    return `${a} rather than ${b}: ${band} of the uses of either`;
  },
  validate: (p) => {
    if (!list(p, 'numerator') || !list(p, 'denominator')) return 'needs numerator and denominator word lists';
    const lo = num(p, 'minShare'); const hi = num(p, 'maxShare');
    if (lo === null && hi === null) return 'needs minShare, maxShare or both';
    for (const x of [lo, hi]) if (x !== null && (x < 0 || x > 1)) return 'shares are between 0 and 1';
    if (lo !== null && hi !== null && lo > hi) return 'minShare cannot exceed maxShare';
    return null;
  },
  observe(text, p) {
    const numer = list(p, 'numerator') ?? []; const denom = list(p, 'denominator') ?? [];
    // One stretch of text is one use: "it is not" must not count as both "it is" and "is not". Longer
    // matches win, then earlier ones; anything overlapping a kept match is dropped.
    const all = [...findTerms(text, numer).map((s) => ({ s, side: 'a' as const })), ...findTerms(text, denom).map((s) => ({ s, side: 'b' as const }))]
      .sort((x, y) => (y.s.end - y.s.start) - (x.s.end - x.s.start) || x.s.start - y.s.start);
    const kept: typeof all = [];
    for (const m of all) if (!kept.some((k) => m.s.start < k.s.end && k.s.start < m.s.end)) kept.push(m);
    kept.sort((x, y) => x.s.start - y.s.start);
    const a = kept.filter((m) => m.side === 'a').map((m) => m.s); const b = kept.filter((m) => m.side === 'b').map((m) => m.s);
    // Lists given in matching order ("it's"/"it is", "don't"/"do not") suggest the one counterpart.
    const counterpart = (word: string, from: readonly string[], to: readonly string[]): string => {
      const i = from.findIndex((w) => w.toLowerCase() === word.toLowerCase().replace(/’/g, '\''));
      return from.length === to.length && i >= 0 ? `"${to[i]}"` : quoted(to);
    };
    const n = a.length + b.length;
    if (n < RATIO_MIN_EVENTS) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `${n} use(s) of either; a share needs ${RATIO_MIN_EVENTS}` };
    const share = a.length / n;
    const pct = Math.round(share * 100);
    const lo = num(p, 'minShare'); const hi = num(p, 'maxShare');
    const detail = `${quoted(numer)} is ${pct}% of ${n} uses (${a.length} against ${b.length})`;
    // Too few of the preferred words: the competing ones are the spans, each to be swapped. Only as many
    // as it takes to reach the floor, so a text is not rewritten further than the rule asks.
    if (lo !== null && share < lo) {
      const need = Math.ceil(lo * n - a.length);
      const swap: Span[] = b.slice(0, Math.max(1, need)).map((s) => ({ ...s, why: `write ${counterpart(s.text, denom, numer)} here, not "${s.text}": ${detail}, at least ${Math.round(lo * 100)}%` }));
      return { verdict: 'VIOLATED', spans: swap, value: r2(share), detail: `${detail}; at least ${Math.round(lo * 100)}%` };
    }
    if (hi !== null && share > hi) {
      const need = Math.ceil(a.length - hi * n);
      const swap: Span[] = a.slice(0, Math.max(1, need)).map((s) => ({ ...s, why: `write ${counterpart(s.text, numer, denom)} here, not "${s.text}": ${detail}, at most ${Math.round(hi * 100)}%` }));
      return { verdict: 'VIOLATED', spans: swap, value: r2(share), detail: `${detail}; at most ${Math.round(hi * 100)}%` };
    }
    return { verdict: 'MET', spans: [], value: r2(share), detail };
  },
};

// ── DISTRIBUTION ─────────────────────────────────────────────────────────────────────────────────

/** Sentences per band, as shares. `edges` are inclusive upper bounds; the last band is open. */
export function lengthMix(text: string, edges: readonly number[]): { shares: number[]; bands: number[][] } {
  const ss = sentencesOf(text);
  const bands: number[][] = Array.from({ length: edges.length + 1 }, () => []);
  ss.forEach((s, i) => {
    const b = edges.findIndex((e) => s.words <= e);
    bands[b === -1 ? edges.length : b].push(i);
  });
  const n = ss.length || 1;
  return { shares: bands.map((b) => b.length / n), bands };
}

/** Total variation distance between two mixes: the share of sentences that would have to move band. */
export const mixDistance = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((s, x, i) => s + Math.abs(x - (b[i] ?? 0)), 0) / 2;

export const bandLabel = (edges: readonly number[], i: number): string =>
  i === 0 ? `${edges[0]} words or fewer` : i === edges.length ? `over ${edges[edges.length - 1]} words` : `${edges[i - 1] + 1}–${edges[i]} words`;

/** The fewest sentences for a mix to be a mix. */
export const DISTRIBUTION_MIN_SENTENCES = 10;

export const DISTRIBUTION: Observer = {
  id: 'DISTRIBUTION',
  describe: (p) => {
    const edges = nums(p, 'edges') ?? []; const shares = nums(p, 'shares') ?? [];
    const mix = shares.map((s, i) => `${Math.round(s * 100)}% ${bandLabel(edges, i)}`).join(', ');
    return `a sentence-length mix near ${mix} (at most ${Math.round((num(p, 'tolerance') ?? 0) * 100)}% of sentences in a different band)`;
  },
  validate: (p) => {
    const edges = nums(p, 'edges'); const shares = nums(p, 'shares'); const tol = num(p, 'tolerance');
    if (!edges?.length || !shares || tol === null) return 'needs edges, shares and tolerance';
    if (shares.length !== edges.length + 1) return 'shares needs one more entry than edges (the last band is open)';
    if (edges.some((e, i) => e <= 0 || (i > 0 && e <= edges[i - 1]))) return 'edges are positive and increasing';
    if (shares.some((x) => x < 0 || x > 1)) return 'each share is between 0 and 1';
    if (Math.abs(shares.reduce((s, x) => s + x, 0) - 1) > 0.02) return 'shares sum to 1';
    if (tol <= 0 || tol >= 1) return 'tolerance is a share between 0 and 1';
    return null;
  },
  observe(text, p) {
    const edges = nums(p, 'edges') ?? []; const want = nums(p, 'shares') ?? []; const tol = num(p, 'tolerance') ?? 1;
    const ss = sentencesOf(text);
    if (ss.length < DISTRIBUTION_MIN_SENTENCES) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `fewer than ${DISTRIBUTION_MIN_SENTENCES} sentences` };
    const { shares, bands } = lengthMix(text, edges);
    const d = mixDistance(shares, want);
    const mix = shares.map((s, i) => `${Math.round(s * 100)}% ${bandLabel(edges, i)}`).join(', ');
    if (d <= tol) return { verdict: 'MET', spans: [], value: r2(d), detail: `${mix}; ${Math.round(d * 100)}% off the target mix` };
    // The band furthest over its share is where the rewrite acts: its sentences, as many as the excess.
    const over = shares.map((s, i) => s - want[i]);
    const worst = over.indexOf(Math.max(...over));
    const toward = over.map((x, i) => ({ x, i })).filter((b) => b.x < 0).sort((a, b) => a.x - b.x)[0]?.i;
    // As many as the over-full band exceeds its share by, and no more than the band they are sent to
    // lacks: moving more would overfill that band and the next pass would move them back.
    const excess = Math.ceil((over[worst] - tol / 2) * ss.length);
    const room = toward === undefined ? excess : Math.ceil(-over[toward] * ss.length);
    const spans: Span[] = bands[worst].slice(0, Math.max(1, Math.min(excess, room))).map((i) => {
      const s = ss[i];
      return { start: s.start, end: s.end, text: s.text,
        why: `a ${s.words}-word sentence; ${Math.round(shares[worst] * 100)}% of sentences are ${bandLabel(edges, worst)} (target ${Math.round(want[worst] * 100)}%)`
          + (toward !== undefined ? `; rewrite it as ${bandLabel(edges, toward)}` : '') };
    });
    return { verdict: 'VIOLATED', spans, value: r2(d), detail: `${mix}; ${Math.round(d * 100)}% off the target mix (at most ${Math.round(tol * 100)}%)` };
  },
};

// ── RHYTHM ───────────────────────────────────────────────────────────────────────────────────────
//
// Pace is not how long sentences are on average; it is how much they vary. A writer who follows three
// long sentences with a short one has a rhythm; a model's plain prose tends to hold one medium length,
// and one medium paragraph after another, which a reader hears as flat. RHYTHM measures the variation
// (coefficient of variation: standard deviation over mean) of sentence, paragraph or section lengths,
// held to a floor, a cap, or both. It points at nothing to rewrite: it is used to choose between
// drafts, and to watch that a new version does not flatten the pace.

export type RhythmUnit = 'SENTENCE' | 'PARAGRAPH' | 'SECTION';

/** Lengths in words of each unit, in order. Sections are the prose between section headings. */
export function unitLengths(text: string, unit: RhythmUnit): number[] {
  // Sentences of prose only: list items are fragments by design, and counting them made bullets read as varied pace.
  if (unit === 'SENTENCE') return proseSentencesOf(text).map((s) => s.words);
  if (unit === 'PARAGRAPH') return paragraphsOf(text).map((p) => wordsOf(p.text).length);
  const hs = headingsOf(text);
  if (!hs.length) return [];
  const bounds = [...hs.map((h) => h.start), text.length];
  return hs.map((_, i) => proseRegions(text.slice(hs[i].end, bounds[i + 1])).reduce((n, r) => n + wordsOf(r.text).length, 0)).filter((n) => n > 0);
}

export const coefficientOfVariation = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!m) return 0;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return Math.round((sd / m) * 100) / 100;
};

/** The fewest units a variation means anything over. */
export const RHYTHM_MIN_UNITS: Readonly<Record<RhythmUnit, number>> = { SENTENCE: 10, PARAGRAPH: 5, SECTION: 3 };

const UNIT_LABEL: Readonly<Record<RhythmUnit, string>> = { SENTENCE: 'sentence', PARAGRAPH: 'paragraph', SECTION: 'section' };

export const RHYTHM: Observer = {
  id: 'RHYTHM',
  describe: (p) => {
    const u = (list(p, 'unit') ?? ['SENTENCE'])[0] as RhythmUnit;
    const lo = num(p, 'minCv'); const hi = num(p, 'maxCv');
    return `${UNIT_LABEL[u] ?? 'sentence'} lengths that vary: ${lo !== null ? `at least ${lo}` : ''}${lo !== null && hi !== null ? ' and ' : ''}${hi !== null ? `at most ${hi}` : ''} (standard deviation over mean)`;
  },
  validate: (p) => {
    const u = (list(p, 'unit') ?? [])[0];
    if (u === undefined || !['SENTENCE', 'PARAGRAPH', 'SECTION'].includes(u)) return 'unit is SENTENCE, PARAGRAPH or SECTION';
    const lo = num(p, 'minCv'); const hi = num(p, 'maxCv');
    if (lo === null && hi === null) return 'needs minCv, maxCv or both';
    if (lo !== null && hi !== null && lo > hi) return 'minCv cannot exceed maxCv';
    return null;
  },
  observe(text, p) {
    const u = (list(p, 'unit') ?? ['SENTENCE'])[0] as RhythmUnit;
    const xs = unitLengths(text, u);
    if (xs.length < RHYTHM_MIN_UNITS[u]) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `fewer than ${RHYTHM_MIN_UNITS[u]} ${UNIT_LABEL[u]}s` };
    const cv = coefficientOfVariation(xs);
    const lo = num(p, 'minCv'); const hi = num(p, 'maxCv');
    const detail = `${UNIT_LABEL[u]} lengths vary by ${cv} (over ${xs.length})`;
    if (lo !== null && cv < lo) return { verdict: 'VIOLATED', spans: [], value: cv, detail: `${detail}; at least ${lo}: the pace is flat` };
    if (hi !== null && cv > hi) return { verdict: 'VIOLATED', spans: [], value: cv, detail: `${detail}; at most ${hi}` };
    return { verdict: 'MET', spans: [], value: cv, detail };
  },
};
