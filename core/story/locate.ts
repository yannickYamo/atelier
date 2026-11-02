// atelier/core/story/locate.ts — WHERE A QUOTED SPAN SITS IN A PIECE, AS A POSITION IN [0,1].
//
// A story reading names its findings by quoting the piece. The model never says where a quote falls: code finds the
// quote and computes its position, t = word offset / total words. A quote code cannot find is not evidence of
// anything and its finding is dropped. Matching is by words, so whitespace, case, curly apostrophes and emphasis
// markers in the quote do not matter; the words and their order do.

import { paragraphSentences } from '../observers/text.js';

const WORD = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;
const norm = (w: string): string => w.toLowerCase().replace(/’/g, "'");

/** A quote shorter than this many words is too short to place: it could sit almost anywhere. */
export const MIN_QUOTE_WORDS = 2;

export interface TextIndex {
  readonly text: string;
  /** every word, normalised, in order */
  readonly words: readonly string[];
  /** where each word starts and ends in the text */
  readonly starts: readonly number[];
  readonly ends: readonly number[];
  /** prose sentences (paragraphs only, not list items), each with the paragraph it belongs to */
  readonly sentences: readonly { readonly start: number; readonly end: number; readonly text: string; readonly words: number; readonly paragraph: number }[];
}

export interface Located {
  /** the index of the quote's first word */
  readonly word: number;
  /** one past the quote's last word */
  readonly endWord: number;
  /** character extent in the text */
  readonly start: number;
  readonly end: number;
  /** position in the piece: first word / total words */
  readonly t: number;
  /** the prose sentence the quote starts in, or -1 when it starts outside one (a heading, a list item) */
  readonly sentence: number;
}

export function indexText(text: string): TextIndex {
  const words: string[] = []; const starts: number[] = []; const ends: number[] = [];
  for (const m of text.matchAll(WORD)) { words.push(norm(m[0])); starts.push(m.index); ends.push(m.index + m[0].length); }
  const sentences = paragraphSentences(text).flatMap((p, paragraph) => p.sentences.map((s) => ({ start: s.start, end: s.end, text: s.text, words: s.words, paragraph })));
  return { text, words, starts, ends, sentences };
}

/** The prose sentence a character offset falls in, or -1. */
export function sentenceAt(index: TextIndex, char: number): number {
  return index.sentences.findIndex((s) => s.start <= char && char < s.end);
}

/** The first place at or after word `from` where the quote's words occur in order, or null. */
export function locateQuote(index: TextIndex, quote: string, from = 0): Located | null {
  const q = (quote.match(WORD) ?? []).map(norm);
  const n = index.words.length;
  if (q.length < MIN_QUOTE_WORDS || !n) return null;
  for (let i = Math.max(0, from); i + q.length <= n; i++) {
    let k = 0;
    while (k < q.length && index.words[i + k] === q[k]) k++;
    if (k === q.length) {
      const start = index.starts[i];
      return { word: i, endWord: i + q.length, start, end: index.ends[i + q.length - 1], t: i / n, sentence: sentenceAt(index, start) };
    }
  }
  return null;
}

/** The character extent of words [from, to), clamped to the text. */
export function charSpan(index: TextIndex, fromWord: number, toWord: number): { start: number; end: number } | null {
  const n = index.words.length;
  const a = Math.max(0, Math.min(n - 1, fromWord)); const b = Math.max(a + 1, Math.min(n, toWord));
  return n ? { start: index.starts[a], end: index.ends[b - 1] } : null;
}

/** A short quote of the words starting at `fromWord`, as written in the text. */
export function excerptAt(index: TextIndex, fromWord: number, words = 10): string {
  const s = charSpan(index, fromWord, fromWord + words);
  return s ? index.text.slice(s.start, s.end).replace(/\s+/g, ' ') : '';
}

/** The word index at position t. */
export const wordAt = (index: TextIndex, t: number): number => Math.round(t * index.words.length);
