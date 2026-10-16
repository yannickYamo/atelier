// atelier/core/observers/pooled.ts — A RATE READ OVER MANY SHORT PIECES, AND CHECKED BY EXPECTED COUNT.
//
// Every rate in ./features.ts and ./style.ts is per piece and per 1,000 words, and returns nothing under 150 words:
// twenty tweets of 25 words each measured nothing, and a skill built from them learned no rate at all. The pieces
// together are 500 words, which is plenty to read a rate from; what a single tweet cannot carry is a RATE, not a
// COUNT. So where the pieces are short the rate is pooled (events over all the words of all the pieces) and an
// output of n words is checked by the count expected of it, λn, with a Poisson tail: three questions in 25 words
// against an expected 0.42 is out (P(X ≥ 3) ≈ 0.009); one is not (P(X ≥ 1) ≈ 0.34). Two-sided at α = 0.05, each
// tail at 0.025. Nothing per 1,000 words is ever computed on a short text.
//
// A Poisson count assumes the events fall independently at the pooled rate, which real prose only roughly does. On
// a short output that is the honest approximation; on a long one the per-piece band (where there is one) is used
// instead, because a long text's own rate can be read.

import { quantile, proseWordsOf } from './text.js';
import { contextClassOf } from '../fidelity/types.js';
import { oneLength } from '../intake/length.js';

/** Both tails together: an output is out when either tail is under half of this. */
export const POOLED_ALPHA = 0.05;
/** Fewer pooled occurrences than this and the rate is not evidence of a habit: nothing is proposed from it. */
export const POOLED_MIN_EVENTS = 10;

/** P(X ≤ k) for X ~ Poisson(λ), summed in log space so a large λ does not underflow. */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return 1;
  let logTerm = -lambda; let sum = Math.exp(logTerm);
  for (let i = 1; i <= k; i++) { logTerm += Math.log(lambda / i); sum += Math.exp(logTerm); }
  return Math.min(1, sum);
}

/** Which way a count of `k` is out against an expected `lambda`, or null when it sits within the two tails. */
export function pooledOut(k: number, lambda: number, side: 'both' | 'high' | 'low' = 'both'): 'high' | 'low' | null {
  const half = POOLED_ALPHA / 2;
  // P(X ≥ k) = 1 − P(X ≤ k − 1); with λ = 0 any count at all is out: the author never does it.
  if (side !== 'low' && k > 0 && (lambda === 0 || 1 - poissonCdf(k - 1, lambda) < half)) return 'high';
  if (side !== 'high' && lambda > 0 && poissonCdf(k, lambda) < half) return 'low';
  return null;
}

/** The counts an output of this expected count may carry without being out: the smallest and the largest. */
export function expectedBand(lambda: number): readonly [number, number] {
  let lo = 0; while (pooledOut(lo, lambda, 'low') === 'low') lo += 1;
  let hi = Math.max(lo, Math.floor(lambda)); while (pooledOut(hi + 1, lambda, 'high') === null) hi += 1;
  return [lo, hi];
}

export interface PooledRate { readonly events: number; readonly words: number; readonly perWord: number; readonly pieces: number }

/** Events over all the words of all the pieces: the one rate the pieces carry together. */
export function pooledRateOf(texts: readonly string[], count: (text: string) => number): PooledRate {
  const words = texts.reduce((n, t) => n + proseWordsOf(t), 0);
  const events = texts.reduce((n, t) => n + count(t), 0);
  return { events, words, perWord: words ? events / words : 0, pieces: texts.length };
}

/** Are these pieces short form: their median piece is under the 'short' class line (150 prose words). */
export function isShortForm(texts: readonly string[]): boolean {
  const lengths = texts.map(proseWordsOf).filter((n) => n > 0);
  // SHORT IN THE MIDDLE IS NOT SHORT FORM when the pieces do not hold one length (`oneLength`): a folder with a median
  // of 108 words and a piece of 1,706 is a mix of lengths, and gets no shape band a tweet would.
  return lengths.length > 0 && contextClassOf(quantile(lengths, 0.5)) === 'short' && oneLength(Math.min(...lengths), Math.max(...lengths));
}

const r4 = (x: number): number => Math.round(x * 10000) / 10000;
/** A pooled rate as a measurement carries it: flat numbers, since a measurement's params hold numbers and lists only. */
export const pooledParams = (p: PooledRate): { pooledPerWord: number; pooledWords: number } => ({ pooledPerWord: r4(p.perWord), pooledWords: p.words });

/** A pooled rate in words a person reads: per 100 words, which is how often it happens in a short piece. */
export const sayPooled = (perWord: number): string => `${Math.round(perWord * 1000) / 10} per 100 words`;
