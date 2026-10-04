// atelier/core/fidelity/evaluation.ts — A FEATURE FAMILY NOTHING IN ATELIER STEERS ON, FOR EVALUATION ONLY.
//
// Whatever selects or steers drafts must not be what judges them (decision 0010). Atelier steers on counted
// features (bands, selection), on the style detector's function-word and character-trigram rates (`--select sample`,
// `--until-author`), on typicality over the steering features (`--until-typical`) and, with plan-first, on the
// structure reader's moves. An evaluation over any of those measures the steering. This family is read by nothing
// else in the product:
//
//   character 4-grams   the TOP_CHAR most frequent in the author's reference pieces, per 1,000 characters of prose
//   word bigrams        the TOP_BIGRAM most frequent pairs of consecutive words there, per 1,000 words
//
// The vocabulary is fixed from the reference pieces alone, before any output is read, and stored with the study, so
// no n-gram can enter because an output used it. Rates are then compared by the classifier two-sample test
// (./twosample.ts). The family overlaps with the detector's trigrams in what it can see; it does not share a feature,
// a weight, or a training set with any control.

import { proseLine } from './stylometry.js';
import { wordsOf } from '../observers/text.js';

export const TOP_CHAR = 300;
export const TOP_BIGRAM = 200;

export interface EvaluationVocabulary {
  readonly version: 1;
  readonly chars: readonly string[];
  readonly bigrams: readonly string[];
}

const counts = (items: readonly string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const charGrams = (line: string): string[] => Array.from({ length: Math.max(0, line.length - 3) }, (_, i) => line.slice(i, i + 4));
const bigrams = (line: string): string[] => { const w = wordsOf(line); return w.slice(1).map((x, i) => `${w[i]} ${x}`); };
const top = (m: Map<string, number>, k: number): string[] => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map(([g]) => g);

/** The vocabulary, from the reference pieces only. */
export function evaluationVocabulary(reference: readonly string[]): EvaluationVocabulary {
  const lines = reference.map(proseLine);
  return { version: 1, chars: top(counts(lines.flatMap(charGrams)), TOP_CHAR), bigrams: top(counts(lines.flatMap(bigrams)), TOP_BIGRAM) };
}

/** A text's rates on the vocabulary: character 4-grams per 1,000 characters, then bigrams per 1,000 words. */
export function evaluationVector(text: string, v: EvaluationVocabulary): number[] {
  const line = proseLine(text);
  const c = counts(charGrams(line)); const b = counts(bigrams(line));
  const nc = Math.max(1, line.length); const nw = Math.max(1, wordsOf(line).length);
  return [...v.chars.map((g) => ((c.get(g) ?? 0) / nc) * 1000), ...v.bigrams.map((g) => ((b.get(g) ?? 0) / nw) * 1000)];
}

/** Vectors standardised by the reference sample's own mean and spread, so every feature weighs alike. */
export function standardisedVectors(reference: readonly (readonly number[])[], others: readonly (readonly number[])[]): { reference: number[][]; others: number[][] } {
  const d = reference[0]?.length ?? 0;
  const mean = Array.from({ length: d }, (_, j) => reference.reduce((a, r) => a + r[j], 0) / Math.max(1, reference.length));
  const sd = Array.from({ length: d }, (_, j) => Math.sqrt(reference.reduce((a, r) => a + (r[j] - mean[j]) ** 2, 0) / Math.max(1, reference.length - 1)) || 1);
  const z = (r: readonly number[]): number[] => r.map((x, j) => (x - mean[j]) / sd[j]);
  return { reference: reference.map(z), others: others.map(z) };
}
