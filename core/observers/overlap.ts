// atelier/core/observers/overlap.ts — HOW MUCH OF A TEXT IS THE AUTHOR'S OWN WORDS, LIFTED.
//
// A version that sounds like an author because it reuses their sentences has recall, not voice. In a
// blind round the version given the author's pieces in its prompt reused a signature line of theirs,
// adapted ("we moved the speed of X faster than the speed of Y"), and a judge that rewards sounding
// like the author rewards that too. Measured here, deterministically, so a comparison can count it:
//
//   shared6          how many of the text's six-word sequences appear in the corpus
//   longestShared    the longest run of consecutive words the text shares with any one piece
//
// Words are letters, digits and apostrophes in any script, lowercased, with one spelling for a letter that can be
// written two ways; punctuation and markdown do not break a run. A script written without spaces is cut into its
// words by the platform's own segmenter.

import { sentencesOf } from './text.js';

/** A stretch of a script that puts no space between its words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const wordsOf = (t: string): string[] => {
  const runs = t.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}'’][\p{L}\p{N}\p{M}'’]*/gu) ?? [];
  return runs.some((r) => UNSPACED.test(r)) ? runs.flatMap((r) => (UNSPACED.test(r) ? [...segmenter.segment(r)].filter((x) => x.isWordLike).map((x) => x.segment) : [r])) : runs;
};
const N = 6;

/**
 * How much of one text is lifted from the corpus: six-word runs it shares, and its longest shared run in words.
 * `standard` counts the shared six-word runs left out of both as the author's standard wording (see below).
 */
export interface CorpusOverlap { readonly shared6: number; readonly longestShared: number; readonly standard?: number }

/** A six-word run found in at least this many separate pieces of the author's is their standard wording. */
export const STANDARD_WORDING_PIECES = 3;

/**
 * An index of a corpus's six-word sequences, built once and reused for every text compared with it.
 *
 * THE AUTHOR'S STANDARD WORDING IS NOT COPYING. A contract writer's clauses repeat from one contract to the next
 * ("shall indemnify and hold harmless..."), and a new clause that did not use those words would be the wrong clause:
 * under strict delivery 44 of 100 contract clauses were refused, most for wording the author uses everywhere. Given
 * the author's standard wording (`standardWordingOf`, below), a six-word run that is part of it is left out of the
 * count and reported apart. Words lifted from one or two pieces are still copying, at any length. Without it,
 * nothing is left out and the reading is what it always was.
 */
export function overlapIndex(corpus: readonly string[], standardWording: readonly string[] = []): (text: string) => CorpusOverlap {
  // EVERY SIX-WORD RUN OF EVERY PIECE, WITH WHERE IT STARTS: built once. A text is then read in one pass, and a run
  // it shares with a piece is followed along that piece a word at a time, never searched for again. The check exists
  // for the output that copies a long stretch, and read the earlier way that was the output it was slowest on.
  const starts = new Map<string, { piece: number; at: number }[]>();
  corpus.map(wordsOf).forEach((w, piece) => {
    for (let at = 0; at + N <= w.length; at++) {
      const gram = w.slice(at, at + N).join(' ');
      const list = starts.get(gram);
      if (list) list.push({ piece, at }); else starts.set(gram, [{ piece, at }]);
    }
  });
  const standard = new Set(standardWording);
  return (text) => {
    const w = wordsOf(text);
    const grams = w.slice(0, Math.max(0, w.length - N + 1)).map((_, i) => w.slice(i, i + N).join(' '));
    // run[i]: how many words from word i on the text shares with one piece, taking the piece that goes furthest.
    // Read from the end: along one piece, the run from i is one word longer than the run from i + 1.
    const run = new Array<number>(grams.length).fill(0);
    let after = new Map<string, number>();
    for (let i = grams.length - 1; i >= 0; i--) {
      const here = new Map<string, number>();
      for (const h of starts.get(grams[i]) ?? []) {
        const along = `${h.piece}:${h.at - i}`;
        const length = (after.get(along) ?? N - 1) + 1;
        here.set(along, length);
        if (length > run[i]) run[i] = length;
      }
      after = here;
    }
    let shared6 = 0; let longestShared = 0; let left = 0;
    for (let i = 0; i < grams.length; i++) {
      if (!run[i]) continue;
      if (standard.has(grams[i])) left += 1; else shared6 += 1;
      if (!standard.size) { longestShared = Math.max(longestShared, run[i]); continue; }
      // A run that lies inside the one read just before it holds nothing that one did not.
      if (i > 0 && run[i - 1] > run[i]) continue;
      // WHAT COUNTS OF THE RUN is the longest stretch of its words that some six-word run outside the standard wording
      // covers. A clause the author uses everywhere counts for nothing; the words lifted from one piece beside it
      // count in full, and a standard phrase inside a lifted sentence does not cut the sentence in two.
      const j = i + run[i];
      let stretch = 0; let reach = -1;
      for (let k = i; k < j; k++) {
        if (k + N <= j && !standard.has(grams[k])) reach = k + N - 1;
        stretch = k <= reach ? stretch + 1 : 0;
        longestShared = Math.max(longestShared, stretch);
      }
    }
    return standard.size ? { shared6, longestShared, standard: left } : { shared6, longestShared };
  };
}

const gramsOf = (w: readonly string[]): string[] => w.slice(0, Math.max(0, w.length - N + 1)).map((_, i) => w.slice(i, i + N).join(' '));

/**
 * The author's standard wording: every six-word run found in STANDARD_WORDING_PIECES or more separate pieces. Read
 * at build over the whole corpus the skill was built from, since the few pieces a skill serves are too few to show
 * what recurs. Pieces are told apart by their text as written, so one piece given twice is one piece, and three
 * pieces that are one clause ending three ways are three. Sorted, so that the same
 * corpus gives the same list.
 */
export function standardWordingOf(pieces: readonly string[]): string[] {
  const separate = [...new Set(pieces.map((p) => p.normalize('NFKC').trim()))].map(wordsOf);
  if (separate.length < STANDARD_WORDING_PIECES) return [];
  const seenIn = new Map<string, number>();
  for (const w of separate) for (const g of new Set(gramsOf(w))) seenIn.set(g, (seenIn.get(g) ?? 0) + 1);
  return [...seenIn].filter(([, n]) => n >= STANDARD_WORDING_PIECES).map(([g]) => g).sort();
}

/**
 * HOW MUCH OF A SOURCE A REWRITE KEPT: the share of the output's sentences (six words or longer) whose
 * words are at least 80% those of one sentence of the source. A rewrite toward another author's voice kept
 * 72 to 93% of its source's sentences in every version tried, so a draft that keeps most of what it was
 * given is a restyle, and saying so is how a person learns that new pieces, not rewrites, carry a voice.
 */
export function sentencesKept(output: string, source: string): number {
  const key = (s: string): Set<string> => new Set(wordsOf(s).map((w) => w.toLowerCase()));
  const src = sentencesOf(source).map((s) => key(s.text)).filter((k) => k.size >= 6);
  const out = sentencesOf(output).map((s) => key(s.text)).filter((k) => k.size >= 6);
  if (!out.length || !src.length) return 0;
  const near = (a: Set<string>, b: Set<string>): boolean => {
    let common = 0;
    for (const w of a) if (b.has(w)) common += 1;
    return common / Math.max(a.size, b.size) >= 0.8;
  };
  return out.filter((o) => src.some((s) => near(o, s))).length / out.length;
}

/**
 * WHAT A REWRITE ADDED: the output's sentences (four words or longer) that share under 35% of their words
 * with every sentence of the source. The claim check stops an invented fact; it does not stop an
 * invented argument, and a rewrite toward another author's voice added three, one of them a design
 * rationale for the product that its owner never stated. Listed, so the person can approve or cut each.
 * The threshold was set on that rewrite: at 35% all four added arguments were listed among 13 sentences;
 * at 50%, 21 (heavy rephrasings too); at 30%, one argument was missed. A guard lists too many before it
 * misses one.
 */
/** The share of a sentence's words, in percent, that a source sentence must hold to count as its counterpart. */
const COUNTERPART_PERCENT = 35;

export function sentencesAdded(output: string, source: string): string[] {
  const key = (s: string): Set<string> => new Set(wordsOf(s).map((w) => w.toLowerCase()));
  const src = sentencesOf(source).map((s) => key(s.text));
  const overlap = (a: Set<string>, b: Set<string>): number => {
    let common = 0;
    for (const w of a) if (b.has(w)) common += 1;
    return common / Math.max(a.size, b.size, 1);
  };
  return sentencesOf(output).filter((s) => {
    const k = key(s.text);
    return k.size >= 4 && !src.some((x) => overlap(k, x) * 100 >= COUNTERPART_PERCENT);
  }).map((s) => s.text.trim());
}
