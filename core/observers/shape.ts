// atelier/core/observers/shape.ts — THE SHAPE OF ONE SHORT PIECE, READ WHOLE, WITH NO FLOOR.
//
// A tweet is 25 words. Nothing per 1,000 words can be read off it, and nothing here tries to: what a short piece
// has is a SHAPE, which is read whole at any length. How many characters, as the platform counts them; how many
// words and sentences, and how long the longest runs; where the line breaks and blank lines fall; what kind of
// sentence it opens on (a claim, a question, a number, an order) and closes on (its shortest sentence, an order, a
// question); how many hashtags, mentions, links and emoji it carries; whether the first word is capitalised.
//
// Each is a number or a kind per piece, so twenty tweets give twenty readings, and the band of them is the
// author's range (read as ../method/standard.ts reads a section's length: the span of the pieces, widened). The
// observer holds a text to one shape at a time. It never judges whether the shape is good: an author who opens
// every post on a question has that as their range, and a draft that opens on a claim is outside it.
//
// Characters are counted the way the platform counts them where a format says so (./formats.ts, `charsOf`): a
// link on X is 23 characters whatever its length. The platform's limit is never assumed here: it comes from the
// format or from the owner (`--limit`), and is a separate fact the band is clipped to.

import type { Observer, ObserverResult, Span } from './registry.js';
import { sentencesOf, proseWordsOf, maskCode, type Sentence } from './text.js';
import { charsOf } from './formats.js';
import { IMPERATIVES } from './features.js';

export const NUMERIC_SHAPES = ['characters', 'words', 'sentences', 'longestSentence', 'lineBreaks', 'blankLines', 'hashtags', 'mentions', 'links', 'emoji'] as const;
export type NumericShape = (typeof NUMERIC_SHAPES)[number];
export const KIND_SHAPES = ['opening', 'closing', 'firstWord'] as const;
export type KindShape = (typeof KIND_SHAPES)[number];
export type ShapeId = NumericShape | KindShape;

export type OpeningKind = 'claim' | 'question' | 'number' | 'imperative';
export type ClosingKind = 'statement' | 'shortest' | 'imperative' | 'question';
export type FirstWordCase = 'capital' | 'lower' | 'digit' | 'symbol';
export const OPENING_KINDS: readonly OpeningKind[] = ['claim', 'question', 'number', 'imperative'];
export const CLOSING_KINDS: readonly ClosingKind[] = ['statement', 'shortest', 'imperative', 'question'];
export const FIRST_WORD_CASES: readonly FirstWordCase[] = ['capital', 'lower', 'digit', 'symbol'];
export const KINDS_OF: Readonly<Record<KindShape, readonly string[]>> = { opening: OPENING_KINDS, closing: CLOSING_KINDS, firstWord: FIRST_WORD_CASES };

export const SHAPE_LABEL: Readonly<Record<ShapeId, string>> = {
  characters: 'characters', words: 'words', sentences: 'sentences', longestSentence: 'the longest sentence (words)',
  lineBreaks: 'line breaks', blankLines: 'blank lines', hashtags: 'hashtags', mentions: 'mentions (@)', links: 'links', emoji: 'emoji',
  opening: 'what it opens on', closing: 'what it closes on', firstWord: 'the first word',
};
const KIND_LABEL: Readonly<Record<string, string>> = {
  claim: 'a claim', question: 'a question', number: 'a number', imperative: 'an instruction',
  statement: 'a statement', shortest: 'its shortest sentence',
  capital: 'capitalised', lower: 'in lower case', digit: 'a digit', symbol: 'a symbol or emoji',
};
export const sayKind = (k: string): string => KIND_LABEL[k] ?? k;
/** A count with its unit, singular for one: "1 sentence", "1 word in the longest sentence", "3 line breaks". */
export const countOf = (n: number, unit: string): string => `${n} ${n === 1 ? unit.replace(/^(characters|words|sentences|line breaks|blank lines|hashtags|mentions|links)\b/, (u) => u.slice(0, -1)) : unit}`;

export interface Shape {
  readonly characters: number; readonly words: number; readonly sentences: number; readonly longestSentence: number;
  readonly lineBreaks: number; readonly blankLines: number;
  readonly hashtags: number; readonly mentions: number; readonly links: number; readonly emoji: number;
  readonly opening: OpeningKind | null; readonly closing: ClosingKind | null; readonly firstWord: FirstWordCase | null;
}

/** The text as a reader of the platform has it: no front matter, no surrounding blank lines. */
export const bodyOf = (text: string): string => text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

const HASHTAG = /(?<![\w&])#[\p{L}\p{N}_]+/gu;
const MENTION = /(?<![\w.])@[\w.]{2,}/g;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/g;
const EMOJI = /\p{Extended_Pictographic}/gu;
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const firstWordOf = (s: Sentence): string => (s.text.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z']/g, '');

/** What a sentence opens on: a question, a number, an instruction, or (otherwise) a claim. */
export function openingKindOf(s: Sentence): OpeningKind {
  if (s.text.trim().endsWith('?')) return 'question';
  if (/^[\d$€£]/.test(s.text.trim()) || /^(?:one|two|three|four|five|six|seven|eight|nine|ten|half|most|every|no)\b/i.test(s.text.trim()) && /\d/.test(s.text)) return 'number';
  return IMPERATIVES.has(firstWordOf(s)) ? 'imperative' : 'claim';
}

/** What a piece closes on: its shortest sentence, an instruction, a question, or (otherwise) a statement. */
export function closingKindOf(ss: readonly Sentence[]): ClosingKind | null {
  const last = ss[ss.length - 1];
  if (!last) return null;
  if (last.text.trim().endsWith('?')) return 'question';
  if (IMPERATIVES.has(firstWordOf(last))) return 'imperative';
  return ss.length >= 2 && ss.every((s) => s === last || s.words > last.words) ? 'shortest' : 'statement';
}

export function firstWordCaseOf(body: string): FirstWordCase | null {
  // A markdown marker is markup, not the first word: "# A cosy launch" opens on "A", and a findings list ("- Rollout: no
  // rollback.") on "Rollout", not on "-", which read every list of the author's as opening on a symbol. The markers are
  // the ones ./text.ts strips: a blockquote's, a list item's, a heading's.
  const c = body.trim().replace(/^(?:>\s?)+/, '').replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/^#{1,6}[ \t]+/, '')[0];
  if (!c) return null;
  return /\p{Lu}/u.test(c) ? 'capital' : /\p{Ll}/u.test(c) ? 'lower' : /\d/.test(c) ? 'digit' : 'symbol';
}

/** Every shape of one piece. `urlChars`: what the platform counts a link as, where it says (X: 23). */
export function shapeOf(text: string, urlChars?: number): Shape {
  const body = bodyOf(text);
  const ss = sentencesOf(body);
  // a link, a tag or an emoji inside code is the code's, never one the piece carries (./text.ts, maskCode)
  const prose = maskCode(body);
  return {
    characters: charsOf(body, { id: 'shape', label: 'this piece', strictSpecifics: false, ...(urlChars !== undefined ? { urlChars } : {}) }),
    words: proseWordsOf(body), sentences: ss.length, longestSentence: ss.length ? Math.max(...ss.map((s) => s.words)) : 0,
    lineBreaks: count(body, /\n/g), blankLines: count(body, /\n[ \t]*\n/g),
    hashtags: count(prose, HASHTAG), mentions: count(prose, MENTION), links: count(prose, LINK), emoji: count(prose, EMOJI),
    opening: ss.length ? openingKindOf(ss[0]) : null, closing: closingKindOf(ss), firstWord: firstWordCaseOf(body),
  };
}

const num = (p: Readonly<Record<string, unknown>>, k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const list = (p: Readonly<Record<string, unknown>>, k: string): readonly string[] => { const v = p[k]; return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : []; };
const shapeIdOf = (p: Readonly<Record<string, unknown>>): ShapeId | null => { const id = list(p, 'shape')[0]; return (NUMERIC_SHAPES as readonly string[]).includes(id) || (KIND_SHAPES as readonly string[]).includes(id) ? id as ShapeId : null; };
const isKind = (id: ShapeId): id is KindShape => (KIND_SHAPES as readonly string[]).includes(id);
const or = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/**
 * SHAPE: one shape of the piece, held to a band (a numeric shape) or to a set of kinds. Read whole, at any length;
 * never "too short". A miss on the count of something that can be pointed at (a hashtag, a link, an over-long
 * sentence) points at each extra one; a miss on the piece's own size points at the piece.
 */
export const SHAPE: Observer = {
  id: 'SHAPE',
  describe: (p) => {
    const id = shapeIdOf(p);
    if (!id) return 'an unknown shape';
    if (isKind(id)) {
      const kinds = list(p, 'kinds');
      return id === 'firstWord' ? `the first word ${or(kinds.map(sayKind))}` : `${id === 'opening' ? 'opens' : 'closes'} on ${or(kinds.map(sayKind))}`;
    }
    const lo = num(p, 'min'); const hi = num(p, 'max'); const url = num(p, 'urlChars');
    const range = lo !== null && hi !== null ? (lo === hi ? `exactly ${lo}` : `${lo} to ${hi}`) : hi !== null ? (hi === 0 ? 'no' : `at most ${hi}`) : `at least ${lo}`;
    const what = id === 'longestSentence' ? `the longest sentence ${range} words` : `${range} ${SHAPE_LABEL[id]}`;
    return `${what}${id === 'characters' && url !== null ? ` (a link counts as ${url})` : ''}`;
  },
  validate: (p) => {
    const id = shapeIdOf(p);
    if (!id) return `needs shape=<one of: ${[...NUMERIC_SHAPES, ...KIND_SHAPES].join(', ')}>`;
    if (isKind(id)) {
      const kinds = list(p, 'kinds');
      if (!kinds.length) return `${id} needs kinds=<one or more of: ${KINDS_OF[id].join(', ')}>`;
      const bad = kinds.filter((k) => !KINDS_OF[id].includes(k));
      return bad.length ? `${id} does not take ${bad.join(', ')}; one of ${KINDS_OF[id].join(', ')}` : null;
    }
    const lo = num(p, 'min'); const hi = num(p, 'max');
    if (lo === null && hi === null) return 'needs min, max or both';
    if ((lo ?? 0) < 0 || (hi ?? 0) < 0) return 'a shape count cannot be negative';
    return lo !== null && hi !== null && lo > hi ? 'min cannot exceed max' : null;
  },
  observe(text, p): ObserverResult {
    const id = shapeIdOf(p);
    if (!id) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'unknown shape' };
    const body = bodyOf(text);
    if (!body) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no text' };
    const url = num(p, 'urlChars');
    const shape = shapeOf(text, url ?? undefined);
    const at = text.indexOf(body);
    if (isKind(id)) {
      const kinds = list(p, 'kinds'); const seen = shape[id];
      if (seen === null) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no sentence to read' };
      if (kinds.includes(seen)) return { verdict: 'MET', spans: [], value: null, detail: `${SHAPE_LABEL[id]}: ${sayKind(seen)}` };
      const ss = sentencesOf(body); const s = id === 'closing' ? ss[ss.length - 1] : ss[0];
      const span: Span = s ? { start: at + s.start, end: at + s.end, text: s.text, why: `${sayKind(seen)}, where your pieces have ${or(kinds.map(sayKind))}` } : { start: at, end: at + body.length, text: body.slice(0, 80), why: sayKind(seen) };
      return { verdict: 'VIOLATED', spans: [span], value: null, detail: `${SHAPE_LABEL[id]}: ${sayKind(seen)}, where your pieces have ${or(kinds.map(sayKind))}` };
    }
    const lo = num(p, 'min'); const hi = num(p, 'max'); const v = shape[id];
    const off = lo !== null && v < lo ? 'short' : hi !== null && v > hi ? 'long' : null;
    const asked = lo !== null && hi !== null ? `${lo} to ${hi}` : hi !== null ? `at most ${hi}` : `at least ${lo}`;
    const unit = id === 'longestSentence' ? 'words in the longest sentence' : SHAPE_LABEL[id];
    if (!off) return { verdict: 'MET', spans: [], value: v, error: 0, detail: `${countOf(v, unit)} (${asked})` };
    const by = off === 'long' ? v - (hi ?? v) : (lo ?? v) - v;
    const width = lo !== null && hi !== null && hi > lo ? hi - lo : 1;
    const error = Math.round(((off === 'long' ? by : -by) / width) * 1000) / 1000;
    // Each extra one the text carries, where there is one to point at; otherwise the piece itself.
    const re = id === 'hashtags' ? HASHTAG : id === 'mentions' ? MENTION : id === 'links' ? LINK : id === 'emoji' ? EMOJI : null;
    let spans: Span[];
    if (off === 'long' && re) {
      spans = [...maskCode(body).matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].slice(hi ?? 0)
        .map((m) => ({ start: at + (m.index ?? 0), end: at + (m.index ?? 0) + m[0].length, text: m[0], why: `one ${SHAPE_LABEL[id].replace(/ \(.*\)$/, '').replace(/s$/, '')} over the ${hi} your pieces carry` }));
    } else if (off === 'long' && id === 'longestSentence') {
      spans = sentencesOf(body).filter((s) => s.words > (hi ?? 0)).map((s) => ({ start: at + s.start, end: at + s.end, text: s.text, why: `${s.words} words, where your longest sentence runs ${hi}` }));
    } else if (off === 'long' && id === 'sentences') {
      spans = sentencesOf(body).slice(hi ?? 0).map((s) => ({ start: at + s.start, end: at + s.end, text: s.text, why: `a sentence over the ${hi} your pieces carry` }));
    } else {
      spans = [{ start: at, end: at + body.length, text: body.slice(0, 80), why: `${countOf(v, unit)}; your pieces run ${asked}: ${off} by ${by}` }];
    }
    // A ceiling of none is said as none: "no hashtags; this has 3", not "3 hashtags (at most 0): long by 3".
    const detail = hi === 0 && off === 'long' ? `no ${unit}; this has ${v}` : `${countOf(v, unit)} (${asked}): ${off} by ${by}`;
    return { verdict: 'VIOLATED', spans, value: v, error, detail };
  },
};
