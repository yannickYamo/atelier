// atelier/core/fidelity/nearness.ts — WHICH OF THE AUTHOR'S PIECES A REQUEST IS NEAR, AS ONE RECORDED READING.
//
// Five parts of a run ask the same question: the passages shown to the writer, the typical-of-you reading, the
// range for the subject (`context=local`), the plan-first skeleton and the register monitor. Each answered it with
// the same TF-IDF cosine (./retrieval.ts), separately, and none of them said so on the panel: a text was read against
// the author's pieces "nearest the request" without the person ever seeing which pieces those were, or how few.
//
// A Nearness is that answer made once per run, recorded with the run and shown (the CONTEXT block,
// ../eval/summary.ts). It has two sources:
//
//   lexical   the TF-IDF cosine, as before. Offline, deterministic, the default (decision 0008: the default release
//             does not change). On a request that is only a title it finds little: in the context-bands study 12 of
//             36 newsletter requests were near anything at all.
//   reader    a small model's reading of the subject (./subject-reader.ts): each piece graded same, related or
//             neither against the request, from a subject card written once per piece. Opt-in
//             (`fidelity --set nearness=reader`), validated in code, with the lexical reading as its floor.
//
// A NEARNESS STEERS NOTHING BY ITSELF AND GATES NOTHING. It decides which of the author's own passages the writer is
// shown and which pieces a reading weighs more. RULE bands never move (./context.ts), and no feature gains a role.

import { createHash } from 'node:crypto';
import { cosine, retrieve, vectorOf, type RetrievalIndex } from './retrieval.js';
import { effectiveSize, pieceWeights } from './context.js';

export type SubjectGrade = 'same' | 'related';

/** Fewer near pieces than this and the request is on a subject the corpus barely covers: said on the panel. */
export const MIN_NEAR_PIECES = 2;
/** How many top passages name the near pieces under the lexical reading: what the typical-of-you weighting has used since 1.1. */
export const LEXICAL_NEAR_PASSAGES = 6;
/** A reader's grade as a weight between 0 and 1. Not tuned on outputs: a related piece counts half a same-subject one. */
export const GRADE_WEIGHT: Readonly<Record<SubjectGrade, number>> = { same: 1, related: 0.5 };

export interface NearPiece {
  readonly id: string;
  /** between 0 and 1: the cosine under the lexical reading, the grade's weight under the reader's */
  readonly weight: number;
  readonly grade?: SubjectGrade;
}

export interface Nearness {
  readonly version: 1;
  readonly source: 'reader' | 'lexical';
  /** the model and prompt version that graded, for the reader's reading */
  readonly reader?: string;
  /** the subject cards it graded against */
  readonly cards?: string;
  /** why the reader's reading was not used, when it was asked for and the lexical one ran instead */
  readonly fellBack?: string;
  /** the pieces near the request, nearest first; a piece that is not near is not listed */
  readonly pieces: readonly NearPiece[];
  /** how many of the author's pieces were compared */
  readonly of: number;
  /** the effective number of pieces the weights amount to (Kish) */
  readonly nEff: number;
  /** fewer than MIN_NEAR_PIECES are near: readings fall back to the author's whole range */
  readonly thin: boolean;
  /** the retrieval index the pieces came from */
  readonly index: string;
  readonly hash: string;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const r4 = (x: number): number => Math.round(x * 10000) / 10000;

/** The pieces an index holds, in the order their first passage appears. */
export const piecesOf = (index: RetrievalIndex): string[] => [...new Set(index.passages.map((p) => p.piece))];

function seal(body: Omit<Nearness, 'hash'>): Nearness {
  return { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16) };
}

/**
 * The lexical reading. NEAR is what the run has always treated as near: the pieces holding the request's
 * LEXICAL_NEAR_PASSAGES closest passages. Each carries its piece-level cosine, and the effective size is the one
 * `context=local` computes, so the panel reports the numbers the run used and no others.
 */
export function lexicalNearness(index: RetrievalIndex, request: string, fellBack?: string): Nearness {
  const ids = piecesOf(index);
  const w = pieceWeights(index, request, ids);
  const near = new Set(retrieve(index, request, LEXICAL_NEAR_PASSAGES).map((k) => index.passages[k].piece));
  const pieces = ids.map((id, i) => ({ id, weight: r4(w[i]) })).filter((p) => near.has(p.id))
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  return seal({ version: 1, source: 'lexical', ...(fellBack ? { fellBack } : {}), pieces, of: ids.length, nEff: r3(effectiveSize(w)),
    thin: pieces.length < MIN_NEAR_PIECES, index: index.hash });
}

/** The reader's reading, from its grades. A grade for a piece the index does not hold is dropped. */
export function readerNearness(index: RetrievalIndex, grades: ReadonlyMap<string, SubjectGrade>, reader: string, cards: string): Nearness {
  const ids = piecesOf(index);
  const order = new Map(ids.map((id, i) => [id, i]));
  const pieces = ids.flatMap((id) => { const g = grades.get(id); return g ? [{ id, weight: GRADE_WEIGHT[g], grade: g }] : []; })
    .sort((a, b) => b.weight - a.weight || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return seal({ version: 1, source: 'reader', reader, cards, pieces, of: ids.length, nEff: r3(effectiveSize(pieces.map((p) => p.weight))),
    thin: pieces.length < MIN_NEAR_PIECES, index: index.hash });
}

/** A piece's weight in a nearness: 0 when it is not near. */
export const nearWeight = (n: Nearness, id: string): number => n.pieces.find((p) => p.id === id)?.weight ?? 0;

/**
 * How much a piece counts in a weighted reference (the typical-of-you reading, the plan-first chain): 1 for a piece
 * that is not near, up to `nearest` for the nearest. Under the lexical reading every near piece counts `nearest`
 * times, as it has since 1.1; under the reader's, a related piece counts halfway.
 */
export function referenceWeight(n: Nearness, id: string, nearest: number): number {
  const p = n.pieces.find((x) => x.id === id);
  if (!p) return 1;
  return n.source === 'lexical' ? nearest : 1 + (nearest - 1) * p.weight;
}

/**
 * The `k` passages to show the writer. Under the lexical reading, exactly `retrieve`. Under the reader's, passages
 * of the nearest pieces come first (a same-subject piece before a related one), and within a piece the passage whose
 * words are closest to the request; a request that shares no word with a near piece still gets its opening
 * passages, which is the case the lexical reading could not serve. A piece that is not near gives no passage.
 */
export function retrieveNear(index: RetrievalIndex, query: string, k: number, n: Nearness | null): number[] {
  if (!n || n.source === 'lexical') return retrieve(index, query, k);
  if (k <= 0 || !n.pieces.length) return [];
  const q = vectorOf(index, query);
  return index.passages
    .map((p, i) => ({ i, w: nearWeight(n, p.piece), s: q.size ? cosine(q, vectorOf(index, p.text)) : 0 }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || b.s - a.s || a.i - b.i)
    .slice(0, k)
    .map((x) => x.i);
}

/** What a run did with its nearness: the readings and steps that weighed the near pieces. Said on the panel. */
export type NearnessUse = 'passages' | 'typicality' | 'range' | 'skeleton';
