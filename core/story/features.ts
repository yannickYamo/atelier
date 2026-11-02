// atelier/core/story/features.ts — THE STATISTICS OF A LOOP GRAPH. PURE FUNCTIONS, NO MODEL.
//
// Every position is t ∈ [0,1] (word offset / total words). open(t) is the number of loops with open ≤ t < close; an
// unclosed loop stays open to the end of the piece (t = 1). The horizon H is the last close, or the end of the piece
// when nothing closes: tension and dead air are measured on [0, H], because what follows the last payoff is the
// landing, not a stretch where the reader is left with nothing.
//
//   stakes position     min t over stated stakes
//   loop count, density L; L per 1,000 words
//   closure rate        closed ÷ opened
//   loop span           close − open for each closed loop; median and max
//   tension coverage    the share of [0, H] where open(t) ≥ 1
//   dead air            the longest stretch of [0, H] where open(t) = 0, and where it is
//   rehook interval     the gaps between successive opens; mean, and CV = sample sd ÷ mean (needs three opens)
//   causal-link share   K = (BUT + THEREFORE) ÷ links; and the longest run of consecutive AND_THEN links

import { sd } from '../stats/t.js';
import type { LoopGraph, PlacedLink } from './loops.js';

export interface LoopFeatures {
  readonly words: number;
  readonly stakesPosition: number | null;
  readonly loopCount: number;
  /** loops per 1,000 words; null for an empty piece */
  readonly loopDensity: number | null;
  readonly closureRate: number | null;
  readonly spanMedian: number | null;
  readonly spanMax: number | null;
  readonly tensionCoverage: number | null;
  readonly deadAir: number | null;
  readonly deadAirSpan: { readonly from: number; readonly to: number } | null;
  readonly rehookMean: number | null;
  readonly rehookCV: number | null;
  readonly causalShare: number | null;
  readonly longestAndThenRun: number;
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The union of [from, to) intervals, clipped to [0, h], as sorted disjoint intervals. */
export function unionWithin(intervals: readonly (readonly [number, number])[], h: number): [number, number][] {
  const xs = intervals.map(([a, b]) => [Math.max(0, a), Math.min(h, b)] as [number, number]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [a, b] of xs) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

/** The horizon: the last close, or 1 when no loop closes. */
export const horizonOf = (g: LoopGraph): number => {
  const closes = g.loops.map((l) => l.close).filter((c): c is number => c !== null);
  return closes.length ? Math.max(...closes) : 1;
};

const openIntervals = (g: LoopGraph): [number, number][] => g.loops.map((l) => [l.open, l.close ?? 1]);

/** The longest stretch of [0, h] no loop covers, or null when the whole of it is covered. Ties go to the earliest. */
export function deadAirStretch(g: LoopGraph): { from: number; to: number } | null {
  const h = horizonOf(g); const covered = unionWithin(openIntervals(g), h);
  let best: { from: number; to: number } | null = null; let at = 0;
  for (const [a, b] of [...covered, [h, h] as [number, number]]) {
    if (a - at > (best ? best.to - best.from : 0)) best = { from: at, to: a };
    at = Math.max(at, b);
  }
  return best;
}

/** Runs of consecutive AND_THEN links at least `min` long, as [first, last] indexes into `links`. */
export function andThenRuns(links: readonly PlacedLink[], min = 1): [number, number][] {
  const out: [number, number][] = []; let start = -1;
  links.forEach((l, i) => {
    if (l.link === 'AND_THEN') { if (start < 0) start = i; } else { if (start >= 0 && i - start >= min) out.push([start, i - 1]); start = -1; }
  });
  if (start >= 0 && links.length - start >= min) out.push([start, links.length - 1]);
  return out;
}

export function loopFeatures(g: LoopGraph): LoopFeatures {
  const L = g.loops.length;
  const closed = g.loops.filter((l) => l.close !== null);
  const spans = closed.map((l) => (l.close ?? 0) - l.open);
  const h = horizonOf(g);
  const covered = unionWithin(openIntervals(g), h).reduce((s, [a, b]) => s + (b - a), 0);
  const dead = deadAirStretch(g);
  const opens = g.loops.map((l) => l.open).sort((a, b) => a - b);
  const gaps = opens.slice(1).map((o, i) => o - opens[i]);
  const gapMean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const links = [...g.links].sort((a, b) => a.at - b.at);
  const causal = links.filter((l) => l.link !== 'AND_THEN').length;
  return {
    words: g.words,
    stakesPosition: g.stakes.length ? Math.min(...g.stakes.map((s) => s.at)) : null,
    loopCount: L,
    loopDensity: g.words ? (L / g.words) * 1000 : null,
    closureRate: L ? closed.length / L : null,
    spanMedian: median(spans),
    spanMax: spans.length ? Math.max(...spans) : null,
    tensionCoverage: g.words ? covered / h : null,
    deadAir: g.words ? (dead ? dead.to - dead.from : 0) : null,
    deadAirSpan: g.words ? dead : null,
    rehookMean: gapMean,
    rehookCV: gaps.length >= 2 && gapMean ? sd(gaps) / gapMean : null,
    causalShare: links.length ? causal / links.length : null,
    longestAndThenRun: Math.max(0, ...andThenRuns(links).map(([a, b]) => b - a + 1)),
  };
}
