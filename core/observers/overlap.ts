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
// Words are lowercased letters, digits and apostrophes; punctuation and markdown do not break a run.

import { sentencesOf } from './text.js';

const wordsOf = (t: string): string[] => t.toLowerCase().match(/[a-z0-9'’]+/g) ?? [];
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
  const words = corpus.map(wordsOf);
  const grams = new Set(words.flatMap(gramsOf));
  const joined = words.map((w) => ` ${w.join(' ')} `);
  const standard = new Set(standardWording);
  return (text) => {
    const w = wordsOf(text);
    let shared6 = 0; let longestShared = 0; let left = 0;
    for (let i = 0; i + N <= w.length; i++) {
      const gram = w.slice(i, i + N).join(' ');
      if (!grams.has(gram)) continue;
      if (standard.has(gram)) left += 1; else shared6 += 1;
      let j = i + N;
      while (j < w.length && joined.some((c) => c.includes(` ${w.slice(i, j + 1).join(' ')} `))) j++;
      // WHAT COUNTS OF THE RUN is the longest stretch of its words that some six-word run outside the standard wording
      // covers. A clause the author uses everywhere counts for nothing; the words lifted from one piece beside it
      // count in full, and a standard phrase inside a lifted sentence does not cut the sentence in two.
      if (!standard.size) { longestShared = Math.max(longestShared, j - i); continue; }
      let stretch = 0; let reach = -1;
      for (let k = i; k < j; k++) {
        if (k + N <= j && !standard.has(w.slice(k, k + N).join(' '))) reach = k + N - 1;
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
 * what recurs. Pieces are told apart by their text, so one piece given twice is one piece. Sorted, so that the same
 * corpus gives the same list.
 */
export function standardWordingOf(pieces: readonly string[]): string[] {
  const separate = [...new Set(pieces.map((p) => wordsOf(p).join(' ')))].map((p) => p.split(' '));
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
