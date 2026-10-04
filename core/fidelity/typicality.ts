// atelier/core/fidelity/typicality.ts — HOW TYPICAL OF THE AUTHOR ONE TEXT IS, AS ONE CALIBRATED NUMBER.
//
// The profile holds a band per feature: the 10th to 90th percentile of the author's pieces. Read one feature
// at a time, the bands compound. Each lets one of the author's own pieces in five fall outside, so with
// nineteen of them an author piece is fully "in range" only a small part of the time, and two features that
// always move together count twice. "17 of 19 in range" is hard to read, and it is not a probability.
//
// So the text is read as one point in feature space. Its distance from the author is a Mahalanobis distance:
// standardised by the author's own spread, and through the author's covariance, so features that move
// together count once. With twenty pieces and fifty features the sample covariance cannot be inverted, so it
// is shrunk toward a scaled identity by the Ledoit–Wolf intensity (../stats/multivariate.ts).
//
// THE NUMBER IS A CONFORMAL P-VALUE. Each of the author's pieces is scored against the others (leave one out),
// and a new text's p-value is the share of those scores at least as large as its own:
//
//   p = (1 + #{ i : d_i ≥ d(x) }) / (n + 1)
//
// "As typical as p of your own pieces." It needs no assumption about the shape of the distribution and is
// valid for the n pieces it was calibrated on. It describes; it never steers or gates
// (docs/decisions/0010-closeness-is-a-two-sample-test.md).

import { createHash } from 'node:crypto';
import { colMeans, invert, mahalanobis, shrunkCovariance } from '../stats/multivariate.js';
import { valuesOf } from './profile.js';

/** Fewer pieces than this and no calibration is made: the p-value moves in steps of 1/(n+1), and below six those steps are too coarse to read. */
export const MIN_CALIBRATION_PIECES = 6;
/** A feature measured on fewer of the author's pieces than this share is left out. */
const MIN_COVERAGE = 0.8;

export interface TypicalityCalibration {
  readonly version: 1;
  /** feature ids, in the order the vectors use */
  readonly features: readonly string[];
  /** the author's mean and standard deviation per feature, for standardising */
  readonly center: readonly number[];
  readonly scale: readonly number[];
  /** the precision matrix of the shrunk covariance of the standardised pieces */
  readonly precision: readonly (readonly number[])[];
  readonly shrinkage: number;
  /** each piece's leave-one-out distance from the others, ascending: the conformal reference */
  readonly scores: readonly number[];
  /** the standardised vectors of the author's pieces: the reference sample for a two-sample test (./twosample.ts) */
  readonly vectors: readonly (readonly number[])[];
  readonly hash: string;
}

export interface Typicality {
  /** the conformal p-value: the share of the author's own pieces at least this far from the rest */
  readonly p: number;
  readonly distance: number;
  /** the calibration it was read against */
  readonly calibration: string;
}

const r4 = (x: number): number => Math.round(x * 10000) / 10000;

/** A text's values on the calibration's features, standardised; a feature the text does not measure sits at the author's centre. */
export function standardise(values: Readonly<Record<string, number | null | undefined>>, features: readonly string[], center: readonly number[], scale: readonly number[]): number[] {
  return features.map((f, j) => {
    const v = values[f];
    return typeof v === 'number' && Number.isFinite(v) ? (v - center[j]) / scale[j] : 0;
  });
}

/**
 * Calibrate on the author's pieces, or null when there are too few or nothing varies.
 *
 * ON THE FEATURES THAT SEPARATE THIS AUTHOR FROM THE MODEL (`only`: the profile's steering features), not on all
 * of them. With twelve pieces and fifty features every piece is far from the rest in some direction, and a
 * model's wall of text read as typical as some of the author's own pieces. A distance over the features that
 * separate the two has the power to tell them apart; one over everything spends it on noise.
 */
export function calibrateTypicality(pieces: readonly string[], only?: readonly string[]): TypicalityCalibration | null {
  if (pieces.length < MIN_CALIBRATION_PIECES) return null;
  const all = pieces.map(valuesOf);
  const ids = Object.keys(all[0] ?? {}).filter((id) => !only || only.includes(id)).sort();
  const features: string[] = []; const center: number[] = []; const scale: number[] = [];
  for (const id of ids) {
    const xs = all.map((v) => v[id]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (xs.length < MIN_COVERAGE * pieces.length) continue;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
    if (!(s > 1e-9)) continue;
    features.push(id); center.push(m); scale.push(s);
  }
  if (features.length < 2) return null;
  const vectors = all.map((v) => standardise(v, features, center, scale));
  const scores = vectors.map((x, i) => {
    const rest = vectors.filter((_, j) => j !== i);
    const { cov } = shrunkCovariance(rest);
    return mahalanobis(x, colMeans(rest), invert(cov));
  }).sort((a, b) => a - b);
  const { cov, shrinkage } = shrunkCovariance(vectors);
  const precision = invert(cov);
  const body = { version: 1 as const, features, center: center.map(r4), scale: scale.map(r4), precision: precision.map((r) => r.map(r4)),
    shrinkage: r4(shrinkage), scores: scores.map(r4), vectors: vectors.map((r) => r.map(r4)) };
  return { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16) };
}

/** How typical a set of feature values is of the author. */
export function typicalityOfValues(values: Readonly<Record<string, number | null | undefined>>, cal: TypicalityCalibration): Typicality {
  const x = standardise(values, cal.features, cal.center, cal.scale);
  const d = mahalanobis(x, cal.features.map(() => 0), cal.precision);
  const atLeast = cal.scores.filter((s) => s >= d).length;
  return { p: r4((1 + atLeast) / (cal.scores.length + 1)), distance: r4(d), calibration: cal.hash };
}

/** How typical a text is of the author. */
export const typicalityOf = (text: string, cal: TypicalityCalibration): Typicality => typicalityOfValues(valuesOf(text), cal);
