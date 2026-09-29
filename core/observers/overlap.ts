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

/** How much of one text is lifted from the corpus: six-word runs it shares, and its longest shared run in words. */
export interface CorpusOverlap { readonly shared6: number; readonly longestShared: number }

/** An index of a corpus's six-word sequences, built once and reused for every text compared with it. */
export function overlapIndex(corpus: readonly string[]): (text: string) => CorpusOverlap {
  const pieces = corpus.map(wordsOf);
  const grams = new Set(pieces.flatMap((w) => w.slice(0, Math.max(0, w.length - N + 1)).map((_, i) => w.slice(i, i + N).join(' '))));
  const joined = pieces.map((w) => ` ${w.join(' ')} `);
  return (text) => {
    const w = wordsOf(text);
    let shared6 = 0; let longestShared = 0;
    for (let i = 0; i + N <= w.length; i++) {
      if (!grams.has(w.slice(i, i + N).join(' '))) continue;
      shared6 += 1;
      let j = i + N;
      while (j < w.length && joined.some((c) => c.includes(` ${w.slice(i, j + 1).join(' ')} `))) j++;
      longestShared = Math.max(longestShared, j - i);
    }
    return { shared6, longestShared };
  };
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
