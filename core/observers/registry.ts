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
// The text is first cut into BLOCKS the way a markdown reader sees them: a paragraph may be hard-
// wrapped over several lines and is still one paragraph; a list item is its own block; front matter,
// fenced code (blank lines inside it included), tables, headings and rules are not prose at all; a
// blockquote's `>` markers are not words. Sentences are then found inside a block, where a period
// ends a sentence only when what follows starts one — so "Dr. Smith", "e.g. this", "3.5", a URL
// and `obj.method()` are not sentence breaks. Every offset refers to the original text, because
// spans are what a repair rewrites.

interface Seg { readonly start: number; readonly text: string }
interface Block { readonly kind: 'PARA' | 'ITEM'; readonly segs: readonly Seg[] }

/** A block joined into one line of prose, with each character's offset in the original text. */
interface Joined { readonly text: string; readonly at: readonly number[] }

function blocksOf(text: string): Block[] {
  const lines = text.split('\n');
  const out: Block[] = [];
  let offset = 0; let fence: string | null = null; let front = false; let cur: { kind: Block['kind']; segs: Seg[] } | null = null;
  const flush = (): void => { if (cur?.segs.length) out.push(cur); cur = null; };
  lines.forEach((line, i) => {
    const lineStart = offset;
    offset += line.length + 1;
    const t = line.trim();
    if (i === 0 && t === '---') { front = true; return; }
    if (front) { if (t === '---' || t === '...') front = false; return; }
    const f = /^(```|~~~)/.exec(t);
    if (fence) { if (f && t.startsWith(fence)) fence = null; return; }
    if (f) { flush(); fence = f[1]; return; }
    if (!t) { flush(); return; }
    if (/^#{1,6}\s/.test(t) || /^([-*_])(\s*\1){2,}$/.test(t) || t.startsWith('|') || /^<\/?[a-z][^>]*>$/i.test(t)) { flush(); return; }
    // Strip blockquote markers, then list markers, keeping the offset of what remains.
    const quote = /^(\s*>\s?)+/.exec(line)?.[0] ?? '';
    const rest = line.slice(quote.length);
    const item = /^\s*([-*+]|\d+[.)])\s+/.exec(rest);
    const lead = quote.length + (item ? item[0].length : rest.length - rest.trimStart().length);
    const seg: Seg = { start: lineStart + lead, text: line.slice(lead).trimEnd() };
    if (!seg.text) return;
    if (item) { flush(); cur = { kind: 'ITEM', segs: [seg] }; return; }
    cur ??= { kind: 'PARA', segs: [] };
    cur.segs.push(seg);
  });
  flush();
  return out;
}

function join(b: Block): Joined {
  let text = ''; const at: number[] = [];
  b.segs.forEach((sg, i) => {
    if (i > 0) { text += ' '; at.push(sg.start - 1); }
    for (let k = 0; k < sg.text.length; k++) at.push(sg.start + k);
    // Inline code is not prose: a banned word inside `obj.method()` is an identifier, not a choice.
    text += sg.text.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  });
  return { text, at };
}

/** Prose regions with their offsets — one per block, each hard-wrapped block joined into one line. */
export function proseRegions(text: string): { start: number; text: string }[] {
  return blocksOf(text).map((b) => ({ start: b.segs[0].start, text: join(b).text }));
}

export const wordsOf = (s: string): string[] => s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? [];

export interface Sentence { readonly start: number; readonly end: number; readonly text: string; readonly words: number }

/** Words after which a period does not end a sentence. Lowercased, without the period. */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'vs', 'etc', 'e.g', 'i.e', 'eg', 'ie',
  'cf', 'inc', 'ltd', 'co', 'corp', 'no', 'fig', 'al', 'approx', 'u.s', 'u.k', 'a.m', 'p.m', 'mt', 'jan', 'feb', 'mar',
  'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);

function splitSentences(j: Joined): Sentence[] {
  const out: Sentence[] = [];
  const t = j.text;
  let begin = 0;
  const emit = (end: number): void => {
    const raw = t.slice(begin, end);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    const w = wordsOf(body).length;
    if (w) out.push({ start: j.at[begin + lead], end: j.at[begin + lead + body.length - 1] + 1, text: body, words: w });
  };
  const re = /[.!?]+["'”’)\]]*(?=\s+["'“‘([]?[A-Z0-9]|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const end = m.index + m[0].length;
    if (m[0].startsWith('.') && m[0].length === 1) {
      const word = /([A-Za-z.]+)$/.exec(t.slice(begin, m.index))?.[1]?.toLowerCase() ?? '';
      if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word)) continue;     // "Dr.", "e.g.", an initial
    }
    emit(end);
    begin = end;
  }
  if (begin < t.length) emit(t.length);
  return out;
}

export function sentencesOf(text: string): Sentence[] {
  return blocksOf(text).flatMap((b) => splitSentences(join(b)));
}

/** Paragraphs of prose — not list items — with their extent in the original text. */
export function paragraphsOf(text: string): { start: number; end: number; text: string; sentences: number }[] {
  return blocksOf(text).filter((b) => b.kind === 'PARA').map((b) => {
    const last = b.segs[b.segs.length - 1];
    const start = b.segs[0].start; const end = last.start + last.text.length;
    return { start, end, text: text.slice(start, end), sentences: splitSentences(join(b)).length };
  });
}

export const quantile = (xs: readonly number[], q: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A term matches whole words, across any whitespace, with straight and curly apostrophes alike. */
const termRe = (term: string): RegExp => new RegExp(
  `(?<![A-Za-z0-9])${escapeRe(term.trim()).replace(/['’‘]/g, "['’‘]").replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'gi');

/**
 * A term may carry its replacement — `leverage=>use` — which is how a substitution table is written:
 * the left side is what must not appear, the right side is what the owner writes instead.
 */
export const splitTerm = (term: string): { avoid: string; prefer: string | null } => {
  const i = term.indexOf('=>');
  return i === -1 ? { avoid: term.trim(), prefer: null } : { avoid: term.slice(0, i).trim(), prefer: term.slice(i + 2).trim() || null };
};

/** Every occurrence of any term, in prose only. Each pattern is compiled once, not once per line. */
export function findTerms(text: string, terms: readonly string[]): Span[] {
  const spans: Span[] = [];
  const compiled = terms.map((raw) => ({ ...splitTerm(raw), re: termRe(splitTerm(raw).avoid) })).filter((c) => c.avoid);
  for (const b of blocksOf(text)) {
    const j = join(b);
    for (const c of compiled) {
      c.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = c.re.exec(j.text)) !== null) {
        const start = j.at[m.index]; const end = j.at[m.index + m[0].length - 1] + 1;
        spans.push({ start, end, text: text.slice(start, end),
          why: c.prefer ? `"${c.avoid}" is on the list; write "${c.prefer}"` : `"${c.avoid}" is on the list` });
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
    validate: (p) => { const n = num(p, 'maxSentences'); return n === null ? 'needs maxSentences' : n < 1 ? 'maxSentences must be at least 1' : null; },
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
    validate: (p) => { const n = num(p, 'maxPer1000'); return n === null ? 'needs maxPer1000' : n < 0 ? 'maxPer1000 cannot be negative' : null; },
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
