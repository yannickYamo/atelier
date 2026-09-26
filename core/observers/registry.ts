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
// tables, sentence and paragraph length, hedging — checked on every output, with the exact span that
// broke the rule, so a repair can rewrite that span and nothing else.

import type { Measurement, ObserverId } from '../state/canonical-state.js';

export interface Span { readonly start: number; readonly end: number; readonly text: string; readonly why: string }

export interface ObserverResult {
  readonly verdict: 'MET' | 'VIOLATED' | 'NOT_APPLICABLE';
  /** where the text broke the rule. Empty when met. */
  readonly spans: readonly Span[];
  /** the measured quantity, for distributions and the distinctiveness floor. Null for presence checks. */
  readonly value: number | null;
  readonly detail: string;
}

export interface Observer {
  readonly id: ObserverId;
  /** the measurement in words, for the review screen and the skill file */
  describe(params: Measurement['params']): string;
  /** refuse a malformed measurement before it is stored, not when it is first run */
  validate(params: Measurement['params']): string | null;
  observe(text: string, params: Measurement['params']): ObserverResult;
}

// ── Text, read the way a reader counts it ──────────────────────────────────────────────────────
//
// Code blocks, headings and front matter are not prose, and a heading is not a sentence. Lists are
// kept: an item is a sentence a reader reads.

/** Prose regions of a markdown-ish text, with their offsets in the original. */
export function proseRegions(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const lines = text.split('\n');
  let offset = 0; let fenced = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^(```|~~~)/.test(t)) fenced = !fenced;
    else if (!fenced && t && !/^#{1,6}\s/.test(t) && !/^(---|\*\*\*)$/.test(t)) out.push({ start: offset, text: line });
    offset += line.length + 1;
  }
  return out;
}

export const wordsOf = (s: string): string[] => s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? [];

export interface Sentence { readonly start: number; readonly end: number; readonly text: string; readonly words: number }

export function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const region of proseRegions(text)) {
    const body = region.text.replace(/^\s*([-*+]|\d+[.)])\s+/, (m) => ' '.repeat(m.length));
    const re = /[^.!?]+(?:[.!?]+["'”’)]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (!m[0].trim()) { if (re.lastIndex === m.index) re.lastIndex++; continue; }
      const lead = m[0].length - m[0].trimStart().length;
      const s = m[0].trim();
      const w = wordsOf(s).length;
      if (w) out.push({ start: region.start + m.index + lead, end: region.start + m.index + lead + s.length, text: s, words: w });
    }
  }
  return out;
}

export function paragraphsOf(text: string): { start: number; text: string; sentences: number }[] {
  const out: { start: number; text: string; sentences: number }[] = [];
  const re = /(?:^|\n)((?:(?!\n\s*\n)[\s\S])+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const start = m.index + (m[0].length - raw.length);
    const t = raw.trim();
    if (!t || /^(```|~~~|#{1,6}\s)/.test(t)) continue;
    // A list is a run of short items, not one long paragraph.
    if (t.split('\n').every((l) => /^\s*([-*+]|\d+[.)])\s/.test(l))) continue;
    out.push({ start, text: t, sentences: sentencesOf(t).length });
  }
  return out;
}

export const quantile = (xs: readonly number[], q: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = (term: string): RegExp => new RegExp(`(?<![A-Za-z0-9])${escapeRe(term).replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'gi');

/** Every occurrence of any term, in prose only. */
export function findTerms(text: string, terms: readonly string[]): Span[] {
  const spans: Span[] = [];
  for (const region of proseRegions(text)) {
    for (const term of terms) {
      const re = termRe(term);
      let m: RegExpExecArray | null;
      while ((m = re.exec(region.text)) !== null) {
        spans.push({ start: region.start + m.index, end: region.start + m.index + m[0].length, text: m[0], why: `"${term}" is on the list` });
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Hedging, counted as words and short phrases. A list, and named as one: it is a proxy, measured as such. */
export const DEFAULT_HEDGES: readonly string[] = [
  'perhaps', 'maybe', 'might', 'possibly', 'arguably', 'somewhat', 'fairly', 'rather', 'relatively',
  'it seems', 'seems to', 'appears to', 'likely', 'probably', 'in some ways', 'to some extent',
  'sort of', 'kind of', 'generally', 'tends to', 'could be',
];

const num = (p: Measurement['params'], k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const list = (p: Measurement['params'], k: string): readonly string[] | null => (Array.isArray(p[k]) ? p[k] : null);

const OBSERVERS: Readonly<Record<ObserverId, Observer>> = {
  LEXICON: {
    id: 'LEXICON',
    describe: (p) => `none of: ${(list(p, 'terms') ?? []).join(', ')}`,
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
    validate: (p) => (num(p, 'medianMax') !== null && num(p, 'p90Max') !== null ? null : 'needs medianMax and p90Max'),
    observe(text, p) {
      const ss = sentencesOf(text);
      if (ss.length < 3) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'fewer than three sentences' };
      const lens = ss.map((s) => s.words);
      const med = quantile(lens, 0.5); const p90 = quantile(lens, 0.9);
      const medMax = num(p, 'medianMax') ?? Infinity; const p90Max = num(p, 'p90Max') ?? Infinity;
      const long = ss.filter((s) => s.words > p90Max)
        .map((s) => ({ start: s.start, end: s.end, text: s.text, why: `${s.words} words, over ${p90Max}` }));
      const ok = med <= medMax && p90 <= p90Max;
      return { verdict: ok ? 'MET' : 'VIOLATED', spans: ok ? [] : long, value: med,
        detail: `median ${med}, 90th percentile ${p90} (targets ${medMax}, ${p90Max})` };
    },
  },
  PARAGRAPH_LENGTH: {
    id: 'PARAGRAPH_LENGTH',
    describe: (p) => `paragraphs of at most ${num(p, 'maxSentences')} sentences`,
    validate: (p) => (num(p, 'maxSentences') !== null ? null : 'needs maxSentences'),
    observe(text, p) {
      const ps = paragraphsOf(text);
      if (!ps.length) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no paragraphs' };
      const max = num(p, 'maxSentences') ?? Infinity;
      const over = ps.filter((x) => x.sentences > max)
        .map((x) => ({ start: x.start, end: x.start + x.text.length, text: x.text, why: `${x.sentences} sentences, over ${max}` }));
      return { verdict: over.length ? 'VIOLATED' : 'MET', spans: over, value: Math.max(...ps.map((x) => x.sentences)),
        detail: over.length ? `${over.length} paragraph(s) over ${max} sentences` : `longest ${Math.max(...ps.map((x) => x.sentences))} sentences` };
    },
  },
  HEDGE_RATE: {
    id: 'HEDGE_RATE',
    describe: (p) => `at most ${num(p, 'maxPer1000')} hedging words per thousand`,
    validate: (p) => (num(p, 'maxPer1000') !== null ? null : 'needs maxPer1000'),
    observe(text, p) {
      const words = proseRegions(text).reduce((n, r) => n + wordsOf(r.text).length, 0);
      if (words < 100) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'under 100 words' };
      const spans = findTerms(text, list(p, 'terms') ?? DEFAULT_HEDGES);
      const rate = Math.round((spans.length / words) * 10000) / 10;
      const max = num(p, 'maxPer1000') ?? Infinity;
      return { verdict: rate <= max ? 'MET' : 'VIOLATED', spans: rate <= max ? [] : spans, value: rate,
        detail: `${rate} per thousand words (target ≤ ${max})` };
    },
  },
};

export const observerFor = (id: ObserverId): Observer => OBSERVERS[id];
export const OBSERVER_IDS = Object.keys(OBSERVERS) as ObserverId[];

export function measure(text: string, m: Measurement): ObserverResult {
  return OBSERVERS[m.observer].observe(text, m.params);
}

export function validateMeasurement(m: Measurement): string | null {
  const o = OBSERVERS[m.observer] as Observer | undefined;
  if (!o) return `unknown observer "${m.observer}". Available: ${OBSERVER_IDS.join(', ')}`;
  return o.validate(m.params);
}
