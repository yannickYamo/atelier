// atelier/core/fidelity/sampling.ts — CHOOSING AMONG DRAFTS WITHOUT PULLING TOWARD THE TYPICAL.
//
// Choosing the draft that scores best on how much it resembles the author is an argmax, and an argmax over a
// model's drafts lands on the model's most typical way of resembling them. Run after run, the outputs gather in
// one corner of the author's range: each looks typical alone, and the set is easy to tell from the author
// (decision 0010; on one author, an old Atelier's drafts were told apart at AUC 0.975).
//
// Sampling-importance-resampling keeps the spread. Among drafts the rules cannot separate, each is chosen with
// probability proportional to how much likelier it is under the author than under the model: the density ratio
// r = P(author | x) / P(model | x), read off a classifier trained to tell the two apart (the profile's style
// detector, a CONTROL instrument). Drawn this way, the delivered outputs approximate the author's own
// distribution within what the model can write, instead of its mode. The draw is seeded and recorded, so a run
// replays.
//
// The rules still come first: only drafts tied on every REQUIRED rule, taste miss and machine tell are sampled.

import { createHash } from 'node:crypto';
import { mulberry32 } from './qualify.js';

/** A ratio this far from 1 either way is clipped: one confident reading must not make a draw certain. */
const RATIO_CLIP: readonly [number, number] = [1e-2, 1e2];

/** P(author) / P(model) from a classifier's P(model-written), clipped. */
export function densityRatio(pModel: number): number {
  const p = Math.min(1 - 1e-6, Math.max(1e-6, pModel));
  return Math.min(RATIO_CLIP[1], Math.max(RATIO_CLIP[0], (1 - p) / p));
}

/** A seed from the texts drawn among, so the same drafts always give the same draw. */
export function seedOf(texts: readonly string[]): number {
  return createHash('sha256').update(texts.join('\u0000')).digest().readUInt32BE(0);
}

/** An index drawn with probability proportional to its weight. Every weight must be positive. */
export function drawIndex(weights: readonly number[], seed: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let u = mulberry32(seed)() * total;
  for (let i = 0; i < weights.length; i++) { u -= weights[i]; if (u < 0) return i; }
  return weights.length - 1;
}
