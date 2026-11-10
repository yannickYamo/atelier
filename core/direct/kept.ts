// atelier/core/direct/kept.ts — WHAT THE PERSON KEPT, AND HOW THEY CHANGED IT: MEMORY FROM PROVEN WORK.
//
// A skill learned from what the person ships, not from what a reader guesses about them. When they keep a piece a run
// wrote (`atelier keep`), as delivered or as they edited it, it becomes one of the pieces the next request can be written
// from (./pieces.ts), and every sentence they changed or cut becomes a correction the review is shown (./prompt.ts).
// Only what they kept counts: a run nobody kept teaches nothing, as a procedure no run proved is not one.
//
// The pairs are read by code, never by a model: the delivered text and the kept one are split into sentences, the
// sentences both hold are matched in order, and what lies between two matches is paired: one sentence for one is that
// sentence changed, and several are paired by the words they share. A
// sentence of theirs with no counterpart in the draft is an addition, kept in the piece and not paired; a sentence of
// the draft with none in theirs was cut.

export interface EditPair { readonly before: string; readonly after: string }

export interface KeptPiece {
  readonly id: string;
  readonly at: string;
  /** what was asked, as the person typed it */
  readonly request: string | null;
  /** the piece as the person kept it */
  readonly text: string;
  /** the run it came from, when it came from one */
  readonly from: string | null;
  /** how they changed the delivered text, sentence by sentence */
  readonly edits: readonly EditPair[];
  /**
   * A draft the model wrote and rewrote on the person's words (the round at the end of a build): its corrections are
   * shown to every later review, and it is never one of the pieces written from. The pieces a skill is written from
   * are the person's own, and what they chose to keep with `atelier keep`.
   */
  readonly correctionOnly?: true;
}

/** The most pairs one kept piece records. */
export const MAX_PAIRS = 20;
/** The share of words two sentences must have in common to be one sentence changed, not one cut and one added. */
const SAME_SENTENCE = 0.25;

/** Sentences, in order: a paragraph break always ends one, so a heading or a list item is its own. */
export function sentencesOf(text: string): string[] {
  return text.split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.|#))/).flatMap((para) => para.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘(*[])/))
    .map((s) => s.trim()).filter(Boolean);
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const wordSet = (s: string): Set<string> => new Set(norm(s).split(' ').filter(Boolean));
const overlap = (a: string, b: string): number => {
  const x = wordSet(a); const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n += 1;
  return n / Math.max(x.size, y.size);
};

/** How the person changed `delivered` into `kept`, sentence by sentence (see the header). */
/** How many of a text's sentences another holds as written: what tells a person's edit of a run from another piece. */
export function sharedSentences(a: string, b: string): number {
  const nb = new Set(sentencesOf(b).map(norm));
  return sentencesOf(a).map(norm).filter((s) => nb.has(s)).length;
}

export function editPairs(delivered: string, kept: string): EditPair[] {
  const a = sentencesOf(delivered); const b = sentencesOf(kept);
  const na = a.map(norm); const nb = b.map(norm);
  // the longest run of sentences both hold, in order
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = na[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: EditPair[] = [];
  const gap = (from: string[], to: string[]): void => {
    // One sentence out and one in between the same two unchanged neighbours is that sentence changed, however few words
    // it kept: the change that matters most ("faster in every way" to the measured figure) shares the fewest.
    if (from.length === 1 && to.length === 1) { out.push({ before: from[0], after: to[0] }); return; }
    const used = new Set<number>();
    for (const s of from) {
      let best = -1; let score = 0;
      to.forEach((t, k) => { const o = overlap(s, t); if (!used.has(k) && o > score) { score = o; best = k; } });
      if (best >= 0 && score >= SAME_SENTENCE) { used.add(best); out.push({ before: s, after: to[best] }); } else out.push({ before: s, after: '' });
    }
  };
  let i = 0; let j = 0; let da: string[] = []; let db: string[] = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] === nb[j]) { gap(da, db); da = []; db = []; i += 1; j += 1; }
    else if (j >= b.length || (i < a.length && L[i + 1][j] >= L[i][j + 1])) { da.push(a[i]); i += 1; }
    else { db.push(b[j]); j += 1; }
  }
  gap(da, db);
  return out.slice(0, MAX_PAIRS);
}

/** The corrections the review is shown: the newest kept piece's first, at most `n`. */
export function correctionsOf(kept: readonly KeptPiece[], n: number): EditPair[] {
  return [...kept].sort((x, y) => y.at.localeCompare(x.at)).flatMap((k) => k.edits).slice(0, n);
}
