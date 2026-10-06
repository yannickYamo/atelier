// atelier/core/observers/text.ts — TEXT, READ THE WAY A READER COUNTS IT. Shared by every observer.

import type { Span } from './registry.js';

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
    // A setext heading: one line of text underlined with === or ---. The line was a heading, not prose.
    if (/^(=+|-+)$/.test(t) && cur?.kind === 'PARA' && cur.segs.length === 1) { cur = null; return; }
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

/** Every prose block joined into one line, with each character's offset in the original text. */
export function proseBlocks(text: string): { readonly kind: 'PARA' | 'ITEM'; readonly text: string; readonly at: readonly number[] }[] {
  return blocksOf(text).map((b) => ({ kind: b.kind, ...join(b) }));
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
  const re = /[.!?]+["'”’)\]*_]*(?=\s+(?:\*{1,2}|_{1,2})?["'“‘([]?[A-Z0-9]|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const end = m.index + m[0].length;
    if (m[0].startsWith('.') && m[0].length === 1) {
      const word = /([A-Za-z.]+)$/.exec(t.slice(begin, m.index))?.[1]?.toLowerCase() ?? '';
      // An initial is a capital letter after a capitalised word ("John F. Kennedy"); "plan B." ends one.
      const prev = /([A-Za-z]+)\s+[A-Za-z]$/.exec(t.slice(begin, m.index))?.[1] ?? '';
      const raw = /([A-Za-z])$/.exec(t.slice(begin, m.index))?.[1] ?? '';
      const initial = word.length === 1 && /^[A-Z]$/.test(raw) && (/^[A-Z]/.test(prev) || begin === m.index - 1);
      if (ABBREVIATIONS.has(word) || initial) continue;                    // "Dr.", "e.g.", an initial
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

/** Sentences of paragraphs only, not list items: a bullet is a fragment by design and says nothing of a writer's pace. */
export function proseSentencesOf(text: string): Sentence[] {
  return blocksOf(text).filter((b) => b.kind === 'PARA').flatMap((b) => splitSentences(join(b)));
}

/** Paragraphs of prose — not list items — with their extent in the original text. */
export function paragraphsOf(text: string): { start: number; end: number; text: string; sentences: number }[] {
  return blocksOf(text).filter((b) => b.kind === 'PARA').map((b) => {
    const last = b.segs[b.segs.length - 1];
    const start = b.segs[0].start; const end = last.start + last.text.length;
    return { start, end, text: text.slice(start, end), sentences: splitSentences(join(b)).length };
  });
}

/**
 * Each prose paragraph with its sentences, as the paragraph-length rule counts them. A repair that splits a long
 * paragraph reads the text through this, so it and the rule can never disagree about what a paragraph or a sentence
 * is (core/loop/mechanical-repair.ts).
 */
export function paragraphSentences(text: string): { start: number; end: number; sentences: Sentence[] }[] {
  return blocksOf(text).filter((b) => b.kind === 'PARA').map((b) => {
    const last = b.segs[b.segs.length - 1];
    return { start: b.segs[0].start, end: last.start + last.text.length, sentences: splitSentences(join(b)) };
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

