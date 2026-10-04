// atelier/core/fidelity/context.ts — THE AUTHOR'S RANGE ON THIS KIND OF SUBJECT, NOT ON EVERYTHING THEY WROTE.
//
// A band is the author's range over all their pieces of one length (./profile.ts). An author who writes short
// paragraphs about tools and long ones about careers has one pooled band for paragraph length, wide enough to hold
// both, and a draft about a tool can sit at the career end of it and still read as in range. The pooled band is
// right about the author and wrong about the request.
//
// So, with `context=local`, each request gets its own target: the author's pieces weighted by how near each is to
// what was asked (TF-IDF cosine over the retrieval index, the same nearness every other part of Atelier uses), and
// the band read from those weights. This is a Nadaraya–Watson estimate of the author's range given the request.
//
// PARTIAL POOLING, NOT A HARD SWITCH. Three near pieces are too few to set a range on their own. The local band is
// pulled toward the band the reading would otherwise use (the class's own, or the pooled one) in proportion to how
// little the request's neighbourhood holds:
//
//   band = λ · local + (1 − λ) · base,   λ = n_eff / (n_eff + k),   n_eff = (Σ w)² / Σ w²
//
// k is CLASS_MIN_PIECES, the number of pieces a class already needs before its own band is used: a neighbourhood
// as large as that counts half. Nothing here was tuned on outputs.
//
// ONLY SIGNAL BANDS MOVE. A RULE band is the owner's ratified range and part of the standard; an implementation
// setting that moved it per request would move the standard (decision 0001). A MONITOR band steers nothing. And no
// feature gains a role here: conditioning narrows where a qualified feature points, it never qualifies one.
//
// The per-piece values come from the typicality calibration (./typicality.ts), which already holds every read piece
// on the steering features. A value a piece did not measure sits there at the author's centre; it pulls a local
// band toward the middle, never outside the author's range.

import { createHash } from 'node:crypto';
import { SELECTION } from '../observers/selection.js';
import { weightedQuantile } from '../stats/weighted.js';
import { cosine, vectorOf, type RetrievalIndex } from './retrieval.js';
import type { TypicalityCalibration } from './typicality.js';
import { CLASS_MIN_PIECES, type FeatureBand } from './types.js';

/** The prior strength: how many pieces the neighbourhood must hold to count as much as the base band. */
export const CONTEXT_PRIOR_PIECES = CLASS_MIN_PIECES;
/** Fewer near pieces than this (by effective size) and the request gets no local target: the base band holds. */
export const MIN_EFFECTIVE_PIECES = 1.5;

export interface LocalContext {
  readonly version: 1;
  /** the author's pieces with a weight above zero, nearest first */
  readonly pieces: readonly { readonly id: string; readonly weight: number }[];
  /** the effective number of pieces the weights amount to */
  readonly nEff: number;
  /** how far each band moves toward the local one */
  readonly lambda: number;
  /** feature id -> the local band (weighted 10th to 90th percentile, widened as selection widens a band) */
  readonly bands: Readonly<Record<string, readonly [number, number]>>;
  /** the calibration and the index it was read from */
  readonly calibration: string;
  readonly index: string;
  readonly hash: string;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const r4 = (x: number): number => Math.round(x * 10000) / 10000;

/** Each piece's nearness to the request: the cosine of the request with the piece's passages taken together. */
export function pieceWeights(index: RetrievalIndex, request: string, ids: readonly string[]): number[] {
  const q = vectorOf(index, request);
  if (!q.size) return ids.map(() => 0);
  const textOf = new Map<string, string[]>();
  for (const p of index.passages) textOf.set(p.piece, [...(textOf.get(p.piece) ?? []), p.text]);
  return ids.map((id) => { const t = textOf.get(id); return t ? Math.max(0, cosine(q, vectorOf(index, t.join('\n\n')))) : 0; });
}

/** The effective sample size of a set of weights (Kish): n for equal weights, 1 for one weight alone. */
export function effectiveSize(w: readonly number[]): number {
  const s = w.reduce((a, b) => a + b, 0); const s2 = w.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

/**
 * The local target for one request, or null when the calibration does not know its pieces, the index does not
 * hold them, or the request is near too few of them to say anything (`MIN_EFFECTIVE_PIECES`).
 */
export function localContext(request: string, cal: TypicalityCalibration, index: RetrievalIndex): LocalContext | null {
  const ids = cal.ids;
  if (ids?.length !== cal.vectors.length) return null;
  const w = pieceWeights(index, request, ids);
  const nEff = effectiveSize(w);
  if (nEff < MIN_EFFECTIVE_PIECES) return null;
  const lambda = nEff / (nEff + CONTEXT_PRIOR_PIECES);
  const bands: Record<string, readonly [number, number]> = {};
  cal.features.forEach((f, j) => {
    const xs = cal.vectors.map((v) => v[j] * cal.scale[j] + cal.center[j]);
    const lo = weightedQuantile(xs, w, 0.1); const hi = weightedQuantile(xs, w, 0.9);
    if (lo === null || hi === null) return;
    const pad = (hi - lo) * SELECTION.widen || Math.max(Math.abs(lo) * 0.1, 0.001);
    bands[f] = [r3(lo - pad), r3(hi + pad)];
  });
  const pieces = ids.map((id, i) => ({ id, weight: r4(w[i]) })).filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  const body = { version: 1 as const, pieces, nEff: r3(nEff), lambda: r3(lambda), bands, calibration: cal.hash, index: index.hash };
  return { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16) };
}

/** The bands a reading uses, with every SIGNAL band that has a local estimate moved toward it by λ. */
export function localiseBands(bands: readonly FeatureBand[], ctx: LocalContext): FeatureBand[] {
  return bands.map((b) => {
    const loc = ctx.bands[b.id];
    if (b.role !== 'SIGNAL' || !loc) return b;
    const l = ctx.lambda;
    return { ...b, band: [r3(l * loc[0] + (1 - l) * b.band[0]), r3(l * loc[1] + (1 - l) * b.band[1])] as const };
  });
}
