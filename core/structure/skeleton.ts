// atelier/core/structure/skeleton.ts — THE SHAPE OF A PIECE BEFORE ITS WORDS: A SEQUENCE OF MOVES FROM THE AUTHOR'S OWN.
//
// Every other actuator edits text after it is written, and structure is decided before the first sentence: no span
// repair turns a tidy single-track argument into the shape the author builds. So the shape comes first. The author's
// pieces, read by the structure reader (./moves.ts), give a first-order Markov chain over moves: how often each move
// opens a piece, and which move follows which. A skeleton is sampled from that chain, at a length drawn from the
// author's own, and each draft is written against its own skeleton, one paragraph per move. A request that states its
// own length or format gets no skeleton: the request sets the shape then.
//
// SAMPLED, NOT THE MOST LIKELY PATH. The most likely path through an author's chain is their most typical piece,
// and the most typical is what a detector finds (decision 0010). Each draft samples its own skeleton, seeded and
// recorded, so drafts differ in shape the way the author's pieces do.
//
// CLOSER PIECES COUNT MORE. The transitions of the author's pieces nearest the request (TF-IDF over the request,
// ../fidelity/retrieval.ts) are counted NEAR_WEIGHT times: a skeleton for a post about a failure leans on how the
// author builds posts about failures.
//
// A skeleton carries moves, never content: no figure, name or claim. What fills each move comes only from the
// request and the material, and the claim check reads the result like any other draft.

import { mulberry32 } from '../fidelity/qualify.js';
import { STRUCTURE_MOVES, type StructureMove } from './moves.js';

export const NEAR_WEIGHT = 3;
const PRIOR = 0.05;
const K = STRUCTURE_MOVES.length;

export interface MoveChain {
  readonly version: 1;
  /** how often each move opens a piece, then how often each follows each, from the agreed moves */
  readonly start: readonly number[];
  readonly transitions: readonly (readonly number[])[];
  /** paragraphs per piece, labelled, for a length when the request states none */
  readonly lengths: readonly number[];
  readonly pieces: number;
}

const idx = (m: StructureMove): number => STRUCTURE_MOVES.indexOf(m);

/** The chain of a set of readings, each weighted (a nearer piece counts more). UNCLEAR paragraphs break a pair. */
export function chainOf(sequences: readonly (readonly (StructureMove | null)[])[], weights: readonly number[] = []): MoveChain {
  const start = new Array<number>(K).fill(0);
  const t = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  sequences.forEach((seq, s) => {
    const w = weights[s] ?? 1;
    const first = seq.find((m) => m !== null);
    if (first) start[idx(first)] += w;
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1]; const b = seq[i];
      if (a && b) t[idx(a)][idx(b)] += w;
    }
  });
  return { version: 1, start, transitions: t, lengths: sequences.map((s) => s.length).sort((a, b) => a - b), pieces: sequences.length };
}

/** A draw from smoothed counts. */
function draw(counts: readonly number[], rand: () => number): number {
  const w = counts.map((c) => c + PRIOR);
  let u = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { u -= w[i]; if (u < 0) return i; }
  return w.length - 1;
}

/** The median labelled length of the author's pieces, at least four paragraphs. */
export const typicalLength = (chain: MoveChain): number => Math.max(4, chain.lengths[Math.floor(chain.lengths.length / 2)] ?? 8);

/**
 * A skeleton sampled from the chain, deterministic for a seed. Its length is drawn from the author's own piece
 * lengths unless one is given, so drafts and runs differ in length as the author's pieces do. A move the author
 * never followed with anything (a closing summary) backs off to the opening distribution rather than to a uniform
 * draw over all eleven moves.
 */
export function sampleSkeleton(chain: MoveChain, paragraphs: number | null, seed: number): StructureMove[] {
  const rand = mulberry32(seed);
  const n = paragraphs ?? Math.max(4, chain.lengths.length ? chain.lengths[Math.floor(rand() * chain.lengths.length)] : 8);
  const out: StructureMove[] = [STRUCTURE_MOVES[draw(chain.start, rand)]];
  while (out.length < n) {
    const row = chain.transitions[idx(out[out.length - 1])];
    out.push(STRUCTURE_MOVES[draw(row.some((c) => c > 0) ? row : chain.start, rand)]);
  }
  return out;
}

const WHAT: Readonly<Record<StructureMove, string>> = {
  CLAIM: 'state a position the piece stands on', EXPLAIN: 'explain how or why, in general terms', EXAMPLE: 'give a specific case',
  EVIDENCE: 'give support from the material', STORY: 'tell what happened, as events', CONCESSION: 'grant a limit or the other side',
  DEFINITION: 'say what a thing is', INSTRUCTION: 'tell the reader what to do', QUESTION: 'raise a question the piece takes up',
  TURN: 'change direction or reframe', SUMMARY: 'sum up what was said',
};

/**
 * The instruction a draft is written with. One paragraph per move, in order; the moves are how the author builds
 * a piece, and nothing in them is content. A move that needs what the request does not supply (a story, evidence)
 * is written without invented specifics, as every draft is.
 */
export function skeletonBlock(skeleton: readonly StructureMove[]): string {
  return 'Build the piece as this sequence of paragraphs, one paragraph per step, in this order. It is how the author structures '
    + 'their pieces; it says what each paragraph does, never what it says. Fill each step only from the request and the material; '
    + 'where a step needs a story or evidence nobody supplied, make the point without inventing one.\n'
    + skeleton.map((m, i) => `${i + 1}. ${m}: ${WHAT[m]}`).join('\n');
}

/**
 * How closely a written piece followed its skeleton: the longest common subsequence of the skeleton and the agreed
 * moves read from the piece, over the longer of the two. Aligned, not position by position: one paragraph cut or
 * merged would otherwise shift every later position and read as a piece that ignored its plan.
 */
export function followed(skeleton: readonly StructureMove[], read: readonly (StructureMove | null)[]): number | null {
  if (!skeleton.length || !read.length) return null;
  const a = skeleton; const b = read;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return Math.round((dp[a.length][b.length] / Math.max(a.length, b.length)) * 1000) / 1000;
}
