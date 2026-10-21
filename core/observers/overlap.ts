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
import { visible } from './visible.js';

/** A stretch of a script that puts no space between its words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
export const wordsOf = (t: string): string[] => {
  const runs = t.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}'’][\p{L}\p{N}\p{M}'’]*/gu) ?? [];
  return runs.some((r) => UNSPACED.test(r)) ? runs.flatMap((r) => (UNSPACED.test(r) ? [...segmenter.segment(r)].filter((x) => x.isWordLike).map((x) => x.segment) : [r])) : runs;
};
const N = 6;

/**
 * How much of one text is lifted from the corpus: six-word runs it shares, and its longest shared run in words.
 * `standard` counts the shared six-word runs left out of both as the author's standard wording (see below).
 */
export interface CorpusOverlap { readonly shared6: number; readonly longestShared: number; readonly standard?: number;
  /** the words of the longest shared run, as the text has them: what a person is shown when the run is too long */ readonly longestWords?: string }

/** A six-word run found in at least this many separate pieces of the author's is their standard wording. */
export const STANDARD_WORDING_PIECES = 3;
/**
 * In a corpus of this many pieces or more, a six-word run two pieces share is the house's: two of twelve contracts
 * carrying the same clause is how a template shows, and counting only runs in three or more called 7 of 10 good
 * contracts lifted. Below this, two pieces may be the whole corpus, and three are still asked for.
 */
export const STANDARD_WORDING_FROM_TWO_AT = 4;

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
export function overlapIndex(corpus: readonly string[], standardWording: readonly string[] = [], opts: { /** also return the words of the longest shared run */ words?: boolean } = {}): (text: string) => CorpusOverlap {
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
    // The words a reader sees: the tags two pages share are not a passage copied from one to the other.
    const w = wordsOf(visible(text));
    const grams = w.slice(0, Math.max(0, w.length - N + 1)).map((_, i) => w.slice(i, i + N).join(' '));
    // run[i]: how many words from word i on the text shares with one piece, taking the piece that goes furthest.
    // Read from the end: along one piece, the run from i is one word longer than the run from i + 1.
    const run = new Array<number>(grams.length).fill(0);
    // A place along a piece, as one number: which piece, and how far the piece runs ahead of the text there.
    const pieces = Math.max(1, corpus.length);
    let after = new Map<number, number>();
    for (let i = grams.length - 1; i >= 0; i--) {
      const here = new Map<number, number>();
      for (const h of starts.get(grams[i]) ?? []) {
        const along = (h.at - i + w.length) * pieces + h.piece;
        const length = (after.get(along) ?? N - 1) + 1;
        here.set(along, length);
        if (length > run[i]) run[i] = length;
      }
      after = here;
    }
    let shared6 = 0; let longestShared = 0; let left = 0; let from = 0;
    for (let i = 0; i < grams.length; i++) {
      if (!run[i]) continue;
      if (standard.has(grams[i])) left += 1; else shared6 += 1;
      if (!standard.size) { if (run[i] > longestShared) { longestShared = run[i]; from = i; } continue; }
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
        if (stretch > longestShared) { longestShared = stretch; from = k - stretch + 1; }
      }
    }
    const longestWords = opts.words && longestShared ? { longestWords: w.slice(from, from + longestShared).join(' ') } : {};
    return standard.size ? { shared6, longestShared, standard: left, ...longestWords } : { shared6, longestShared, ...longestWords };
  };
}

const gramsOf = (w: readonly string[]): string[] => w.slice(0, Math.max(0, w.length - N + 1)).map((_, i) => w.slice(i, i + N).join(' '));

/**
 * EVERY SIX-WORD RUN OF A TEXT THE PERSON SUPPLIED (the bound material, the request): wording an output may quote from
 * what it was given, and so no passage lifted from an example, however long the run it shares with one. Passed beside
 * the standard wording, it is left out of the count the same way.
 */
export const suppliedWording = (text: string): string[] => [...new Set(gramsOf(wordsOf(visible(text))))];

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
  const need = separate.length >= STANDARD_WORDING_FROM_TWO_AT ? 2 : STANDARD_WORDING_PIECES;
  const seenIn = new Map<string, number>();
  for (const w of separate) for (const g of new Set(gramsOf(w))) seenIn.set(g, (seenIn.get(g) ?? 0) + 1);
  return [...seenIn].filter(([, n]) => n >= need).map(([g]) => g).sort();
}

/** Above this many pieces the reading below is made on the first of them, by text: it is a bound, not a census. */
const SHARED_AMONG_MOST = 40;

/**
 * HOW MUCH THE AUTHOR'S OWN PIECES SHARE WITH ONE ANOTHER: the longest run of words any one of them shares with
 * another, standard wording left out. An essayist's pieces share a few words; a contract drafter's share whole
 * clauses, in two contracts out of twelve as often as in all of them. New work that shares no more with one example
 * than the examples share among themselves is written the way this author writes, and is not a lifted passage; so
 * this is the most a run may share before it is one (cli/eval-run.ts, `copyLimit`). Nothing is chosen here: the
 * number is read off the pieces. Null on fewer pieces than can tell standard wording at all.
 */
export function sharedAmong(pieces: readonly string[], _standardWording: readonly string[] = []): number | null {
  const separate = [...new Set(pieces.map((p) => p.normalize('NFKC').trim()))].sort().slice(0, SHARED_AMONG_MOST);
  if (separate.length < STANDARD_WORDING_PIECES) return null;
  // READ RAW. With the standard wording left out, the pieces of a template corpus "shared" ten words among themselves
  // and a new contract sharing a sixteen-word clause with one of them was called lifted (11 at most). What the author's
  // own pieces share is read on the pieces as written; the standard wording is left out of a run's count, not of this.
  void _standardWording;
  return Math.max(...separate.map((p, i) => overlapIndex(separate.filter((_, k) => k !== i))(p).longestShared));
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
