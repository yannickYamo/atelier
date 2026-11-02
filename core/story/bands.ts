// atelier/core/story/bands.ts — THE USER'S OWN RANGE FOR EACH STORY FEATURE, OR A WEAK PRIOR SAID AS ASSUMED.
//
// A writer who never closes a loop, or who writes "and then" on purpose, keeps that as their range: the band is read
// from their golden pieces. It is the user's once three pieces or more give the feature a value: the span of those
// values, widened the way a length band is (core/intake/length.ts `ownLengthBand`: by the spread, or by a quarter of
// the largest value when the pieces barely differ), because a few pieces describe a range and never pin it.
// Below three, the band is the format's weak prior and is marked `assumed`: a position from the library's beat
// prior (a Beta centred on the beat's position with the prior's concentration, its central 90%), anything else from
// the generic defaults below. An assumed band steers as a preference and is never shown as the user's.

import type { BeatPrior, PieceKind } from '../library/schema.js';
import { betaQuantile } from '../stats/habit.js';
import type { LoopFeatures } from './features.js';

export type BandSource = 'user' | 'assumed';
export interface Band {
  readonly lo: number;
  readonly hi: number;
  /** pieces the band was read from (0 for a prior) */
  readonly n: number;
  readonly source: BandSource;
  readonly why: string;
}

/** Pieces a band needs before it is the user's own. */
export const MIN_PIECES = 3;
/** The central mass of a Beta prior taken as its band. */
export const PRIOR_MASS = 0.9;

/** The user's band from per-piece values, or null below MIN_PIECES defined values. `unit` clamps fractions to [0,1]. */
export function userBand(values: readonly (number | null)[], unit: boolean): Band | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length < MIN_PIECES) return null;
  const lo = Math.min(...xs); const hi = Math.max(...xs);
  const width = Math.max(hi - lo, Math.abs(hi) * 0.25);
  const top = unit ? 1 : Infinity;
  return { lo: Math.max(0, lo - width), hi: Math.min(top, hi + width), n: xs.length, source: 'user', why: `from ${xs.length} of your pieces (${round(lo)} to ${round(hi)}, widened)` };
}

/** A beat prior's central band: Beta(μκ, (1−μ)κ). */
export function betaPriorBand(prior: BeatPrior, mass = PRIOR_MASS): Band {
  const mu = Math.min(0.999, Math.max(0.001, prior.position)); const k = Math.max(prior.concentration, 1e-6);
  const a = mu * k; const b = (1 - mu) * k; const tail = (1 - mass) / 2;
  return { lo: betaQuantile(tail, a, b), hi: betaQuantile(1 - tail, a, b), n: 0, source: 'assumed', why: `the ${prior.kind} prior for the ${prior.beat} beat (position ${prior.position}, concentration ${prior.concentration})` };
}

const round = (x: number): number => Math.round(x * 1000) / 1000;
const assumed = (lo: number, hi: number, why: string): Band => ({ lo, hi, n: 0, source: 'assumed', why });

export type BandedFeature = 'stakesPosition' | 'loopDensity' | 'closureRate' | 'spanMedian' | 'tensionCoverage' | 'deadAir' | 'rehookMean' | 'rehookCV' | 'causalShare' | 'longestAndThenRun';
const UNIT: Readonly<Record<BandedFeature, boolean>> = {
  stakesPosition: true, loopDensity: false, closureRate: true, spanMedian: true, tensionCoverage: true, deadAir: true, rehookMean: true, rehookCV: false, causalShare: true, longestAndThenRun: false,
};
/** Which beat prior stands in for a position feature. */
export const FEATURE_BEAT: Partial<Readonly<Record<BandedFeature, string>>> = { stakesPosition: 'stakes' };
/** Generic defaults where no beat prior applies: weak, and always assumed. */
export const GENERIC_PRIORS: Partial<Readonly<Record<BandedFeature, Band>>> = {
  deadAir: assumed(0, 0.2, 'generic default: no stretch longer than a fifth of the piece with nothing in question'),
  closureRate: assumed(1, 1, 'generic default: every loop the piece opens, it closes'),
  longestAndThenRun: assumed(0, 2, 'generic default: no three beats in a row linked only by succession'),
};

export type StoryBands = Partial<Readonly<Record<BandedFeature, Band>>>;

/** A band for each feature: the user's where their golden pieces carry it, a prior marked assumed where not, absent where neither. */
export function storyBands(golden: readonly LoopFeatures[], kind: PieceKind, beats: readonly BeatPrior[]): StoryBands {
  const out: Partial<Record<BandedFeature, Band>> = {};
  for (const f of Object.keys(UNIT) as BandedFeature[]) {
    const own = userBand(golden.map((g) => g[f]), UNIT[f]);
    if (own) { out[f] = own; continue; }
    const beatName = FEATURE_BEAT[f];
    const prior = beatName ? beats.find((b) => b.kind === kind && b.beat.toLowerCase() === beatName) : undefined;
    const band = prior ? betaPriorBand(prior) : GENERIC_PRIORS[f];
    if (band) out[f] = band;
  }
  return out;
}
