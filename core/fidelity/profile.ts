// atelier/core/fidelity/profile.ts — WHERE THE AUTHOR'S OWN PIECES SIT, FEATURE BY FEATURE, AND WHERE A TEXT SITS.
//
// Built once, at discovery, from what discovery already holds: the pieces it read, the pieces it held
// back, and the model's own drafts on the author's topics (half of them written with the author's pieces
// pasted in). Nothing here calls a model.
//
// Every counted feature (../observers/features.ts) gets a role:
//
//   RULE     the owner ratified a FEATURE rule on it: the standard checks it on every output already
//   SIGNAL   it separates the author from the model and holds on the held-back pieces
//            (../observers/selection.ts): it chooses between drafts and steers the inner loop, and never
//            fails an output on its own
//   MONITOR  the author's pieces measure it, but it does not (yet) separate them from the model: it is
//            recorded with every output and estimated across outputs, and steers nothing
//
// Bands are the author's range (10th to 90th percentile, widened as selection widens them), never their
// mean: imitations already sit nearer an author's average than the author does (./types.ts). They are
// estimated per context class where the author has CLASS_MIN_PIECES pieces of that length, and pooled
// otherwise, because a one-line reply and a long essay do not share a paragraph length.
//
// A feature that counts specifics (links, figures, names) is held only from above: below the author's
// range is never "out of band", because asking a draft for more specifics than it was given asks it to
// invent them (the claim floor would cut them; ../loop/fact-ledger.ts measures what was supplied instead).

import { createHash } from 'node:crypto';
import { FEATURES, featureOf } from '../observers/features.js';
import { judgeFeature, bandOf, distanceFromBand } from '../observers/selection.js';
import { quantile, wordsOf, proseRegions } from '../observers/text.js';
import { trainDetector, scoreDetector } from './stylometry.js';
import { authorFactDensity } from '../loop/fact-ledger.js';
import { CLASS_MIN_PIECES, CONTEXT_CLASSES, contextClassOf, type ContextClass, type DetectorModel, type FeatureBand, type FidelityProfile, type FidelityReading } from './types.js';

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const proseWords = (t: string): number => wordsOf(proseRegions(t).map((r) => r.text).join('\n\n')).length;
const vals = (xs: readonly (number | null)[]): number[] => xs.filter((x): x is number => x !== null && Number.isFinite(x));
const sd = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((n, x) => n + (x - m) ** 2, 0) / (xs.length - 1));
};

export interface ProfileInput {
  readonly read: readonly { readonly id: string; readonly text: string }[];
  readonly held: readonly { readonly id: string; readonly text: string }[];
  /** the model's drafts on the author's topics */
  readonly model: readonly string[];
  /** ids of features the ratified standard holds as FEATURE rules */
  readonly ruled?: ReadonlySet<string>;
  readonly corpusHash: string;
}

/** The author's fidelity profile. Deterministic: the same pieces and drafts give the same profile and hash. */
export function buildProfile(input: ProfileInput): FidelityProfile {
  const readTexts = input.read.map((p) => p.text);
  const heldTexts = input.held.map((p) => p.text);
  const classOf = new Map(readTexts.map((t) => [t, contextClassOf(proseWords(t))]));
  const bands: FeatureBand[] = [];
  for (const f of FEATURES) {
    const read = readTexts.map((t) => f.measure(t));
    const verdict = judgeFeature(f.id, { read, held: heldTexts.map((t) => f.measure(t)), model: input.model.map((t) => f.measure(t)) });
    const role: FeatureBand['role'] = input.ruled?.has(f.id) ? 'RULE' : verdict.kept ? 'SIGNAL' : 'MONITOR';
    const pooled = vals(read);
    const band = bandOf(pooled);
    if (!band) continue;
    bands.push({ id: f.id, cls: 'all', band, median: r3(quantile(pooled, 0.5)), spread: r3(sd(pooled)), n: pooled.length, role, auc: verdict.auc });
    for (const cls of CONTEXT_CLASSES) {
      const inClass = vals(readTexts.filter((t) => classOf.get(t) === cls).map((t) => f.measure(t)));
      const b = inClass.length >= CLASS_MIN_PIECES ? bandOf(inClass) : null;
      if (b) bands.push({ id: f.id, cls, band: b, median: r3(quantile(inClass, 0.5)), spread: r3(sd(inClass)), n: inClass.length, role, auc: verdict.auc });
    }
  }
  const detector = detectorFor([...input.read, ...input.held], input.model);
  const body = { version: 1 as const, corpusHash: input.corpusHash, bands, detector, factDensity: authorFactDensity(readTexts) };
  return { ...body, hash: sha(JSON.stringify(body)) };
}

/**
 * The detector, trained on the author's pieces (one group per piece, so cross-validation never scores a
 * piece it trained on) against the model's drafts. Null when there are too few long-enough texts, or when
 * training fails: the detector is a monitor, and a skill without one still works.
 */
function detectorFor(author: readonly { id: string; text: string }[], model: readonly string[]): DetectorModel | null {
  const longA = author.filter((p) => proseWords(p.text) >= 100);
  const longM = model.filter((t) => proseWords(t) >= 100);
  if (longA.length < 4 || longM.length < 4) return null;
  try {
    return trainDetector(longA.map((p) => ({ text: p.text, group: `a:${p.id}` })), longM.map((t, i) => ({ text: t, group: `m:${i}` })));
  } catch { return null; }
}

/** The bands a text of class `cls` is read against: the class's own where it has them, pooled otherwise. */
export function bandsFor(profile: FidelityProfile, cls: ContextClass): { from: ContextClass | 'all'; bands: FeatureBand[] } {
  const own = profile.bands.filter((b) => b.cls === cls);
  return own.length ? { from: cls, bands: own } : { from: 'all', bands: profile.bands.filter((b) => b.cls === 'all') };
}

/** Steering bands only: a MONITOR band is recorded, never counted for or against a draft. */
const steers = (b: FeatureBand): boolean => b.role !== 'MONITOR';

/**
 * WHERE ONE TEXT SITS. Every feature's value; how many of the steering bands (RULE and SIGNAL) it is
 * inside, of those that measured; the ones outside, worst first; and the detector's reading when there is
 * a detector. A specifics feature below its band counts as inside (see the header).
 */
export function readFidelity(text: string, profile: FidelityProfile): FidelityReading {
  const cls = contextClassOf(proseWords(text));
  const { from, bands } = bandsFor(profile, cls);
  const values: Record<string, number | null> = {};
  const outside: { id: string; distance: number; direction: 'low' | 'high' }[] = [];
  let inBand = 0; let measured = 0;
  for (const b of bands) {
    const f = featureOf(b.id);
    if (!f) continue;
    const v = f.measure(text);
    values[b.id] = v;
    if (v === null || !steers(b)) continue;
    measured += 1;
    const low = v < b.band[0]; const high = v > b.band[1];
    if ((low && !f.specifics) || high) outside.push({ id: b.id, distance: distanceFromBand(v, b.band), direction: high ? 'high' : 'low' });
    else inBand += 1;
  }
  outside.sort((a, b) => b.distance - a.distance || a.id.localeCompare(b.id));
  const scored = profile.detector ? scoreDetector(profile.detector, text) : null;
  return { cls, bandsFrom: from, values, inBand, measured, outside,
    detector: scored && profile.detector ? { p: r3(scored.p), version: profile.detector.version } : null };
}

/** The share of steering bands a reading is inside, or null when none measured. */
export const inBandShare = (r: FidelityReading): number | null => (r.measured ? r3(r.inBand / r.measured) : null);
