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
import { buildRetrievalIndex, retrieve } from './retrieval.js';
import { effectMatrix } from './operators.js';
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
  /** the model ids that wrote `model`; recorded on the detector as the families it is valid for */
  readonly modelFamilies?: readonly string[];
  /** the author's reserved pieces (held back before anything read them): only their feature values are kept */
  readonly unseen?: readonly string[];
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
    const proposable = verdict.kept && verdict.role === 'RULE' ? { proposable: true as const } : {};
    bands.push({ id: f.id, cls: 'all', band, median: r3(quantile(pooled, 0.5)), spread: r3(sd(pooled)), n: pooled.length, role, auc: verdict.auc, ...proposable });
    for (const cls of CONTEXT_CLASSES) {
      const readIn = readTexts.filter((t) => classOf.get(t) === cls).map((t) => f.measure(t));
      const inClass = vals(readIn);
      const b = inClass.length >= CLASS_MIN_PIECES ? bandOf(inClass) : null;
      if (!b) continue;
      // QUALIFIED IN ITS OWN CLASS. A class band inherited the pooled verdict, so a feature that separates the
      // author from the model on long pieces steered short ones on no evidence. It steers only if selection
      // passes on that class's own pieces, held-back pieces and model drafts; otherwise it is monitored.
      const inCls = (texts: readonly string[]): (number | null)[] => texts.filter((t) => contextClassOf(proseWords(t)) === cls).map((t) => f.measure(t));
      const own = judgeFeature(f.id, { read: readIn, held: inCls(heldTexts), model: inCls(input.model) });
      const clsRole: FeatureBand['role'] = role === 'RULE' ? 'RULE' : own.kept ? 'SIGNAL' : 'MONITOR';
      bands.push({ id: f.id, cls, band: b, median: r3(quantile(inClass, 0.5)), spread: r3(sd(inClass)), n: inClass.length, role: clsRole, auc: own.auc, ...proposable });
    }
  }
  const trained = detectorFor(input.read, input.model);
  const families = [...new Set(input.modelFamilies ?? [])].filter(Boolean).sort();
  const detector = trained && families.length ? { ...trained, families } : trained;
  // THE EFFECT MATRIX: what each operator does to each banded feature, on text like this model's (no model call).
  const effects = input.model.length ? effectMatrix(input.model, [...new Set(bands.map((b) => b.id))]) : undefined;
  // THE BASELINE'S PIECES: the reserved ones, as feature values only (never their text). The held-back pieces
  // cannot serve: selection kept a feature only where they fell inside its band, so they would sit near the
  // ceiling by construction.
  const unseen = (input.unseen ?? []).map((t) => ({ cls: contextClassOf(proseWords(t)), values: valuesOf(t) }));
  const probe: FidelityProfile = { version: 1, corpusHash: input.corpusHash, bands, detector: null, hash: '', unseen };
  const baseline = baselineOf(probe);
  const body = { version: 1 as const, corpusHash: input.corpusHash, bands, detector, factDensity: authorFactDensity(readTexts),
    ...(effects ? { effects } : {}), ...(unseen.length ? { unseen } : {}), ...(baseline ? { baseline } : {}) };
  return { ...body, hash: sha(JSON.stringify(body)) };
}

/**
 * The detector, trained on the pieces READ (the held-back ones stay unseen by every instrument) against the
 * model's drafts. Grouped so cross-validation never scores a text whose twin it trained on: each draft joins
 * the group of the author piece it is closest to (its topic came from one, and the pasted ones copied some),
 * so a piece and the drafts made from it fall in one fold. Null when there are too few long-enough texts, or
 * when training fails: the detector is a monitor, and a skill without one still works.
 */
function detectorFor(author: readonly { id: string; text: string }[], model: readonly string[]): DetectorModel | null {
  const longA = author.filter((p) => proseWords(p.text) >= 100);
  const longM = model.filter((t) => proseWords(t) >= 100);
  if (longA.length < 4 || longM.length < 4) return null;
  const index = buildRetrievalIndex(longA);
  const groupOf = (t: string): string => { const hit = retrieve(index, t, 1)[0]; return hit === undefined ? 'm:none' : `t:${index.passages[hit].piece}`; };
  try {
    return trainDetector(longA.map((p) => ({ text: p.text, group: `t:${p.id}` })), longM.map((t) => ({ text: t, group: groupOf(t) })));
  } catch { return null; }
}

/**
 * The bands a text of class `cls` is read against, feature by feature: the class's own band where it has one
 * that qualified in its class (or where neither it nor the pooled one steers), and the pooled band otherwise.
 * A class band that did not qualify must not hide a pooled band that did: with a few drafts per class, every
 * class band was monitored and a text in that class was read against no steering band at all.
 */
export function bandsFor(profile: FidelityProfile, cls: ContextClass): { from: ContextClass | 'all'; bands: FeatureBand[] } {
  const pooled = profile.bands.filter((b) => b.cls === 'all');
  const own = new Map(profile.bands.filter((b) => b.cls === cls).map((b) => [b.id, b]));
  let usedOwn = false;
  const bands = pooled.map((p) => {
    const o = own.get(p.id);
    if (o && (o.role !== 'MONITOR' || p.role === 'MONITOR')) { usedOwn = true; return o; }
    return p;
  });
  for (const [id, o] of own) if (!pooled.some((p) => p.id === id)) { usedOwn = true; bands.push(o); }
  return { from: usedOwn ? cls : 'all', bands };
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
  const values = valuesOf(text);
  const r = readValues(values, cls, profile);
  const scored = profile.detector ? scoreDetector(profile.detector, text) : null;
  return { ...r, detector: scored && profile.detector
    ? { p: r3(scored.p), version: profile.detector.version, ...(profile.detector.families ? { families: profile.detector.families } : {}) } : null };
}

/** Every registered feature's value on a text. */
export function valuesOf(text: string): Record<string, number | null> {
  return Object.fromEntries(FEATURES.map((f) => [f.id, f.measure(text)]));
}

/**
 * A reading from feature values alone (no text, no detector): the same counting `readFidelity` does. What lets a
 * baseline be recounted with the roles of the profile a run is read with, from numbers stored at discovery.
 */
export function readValues(all: Readonly<Record<string, number | null>>, cls: ContextClass, profile: FidelityProfile): Omit<FidelityReading, 'detector'> {
  const { from, bands } = bandsFor(profile, cls);
  const values: Record<string, number | null> = {};
  const outside: { id: string; distance: number; direction: 'low' | 'high' }[] = [];
  let inBand = 0; let measured = 0;
  for (const b of bands) {
    const f = featureOf(b.id);
    if (!f) continue;
    const v = all[b.id] ?? null;
    values[b.id] = v;
    if (v === null || !steers(b)) continue;
    measured += 1;
    const low = v < b.band[0]; const high = v > b.band[1];
    if ((low && !f.specifics) || high) outside.push({ id: b.id, distance: distanceFromBand(v, b.band), direction: high ? 'high' : 'low' });
    else inBand += 1;
  }
  outside.sort((a, b) => b.distance - a.distance || a.id.localeCompare(b.id));
  return { cls, bandsFrom: from, values, inBand, measured, outside };
}

/**
 * THE BASELINE, OUT OF SAMPLE: the author's reserved pieces (held back before anything read them, so no band,
 * role or selection was decided on them) read against `profile` with its own roles. Null without such pieces.
 */
export function baselineOf(profile: FidelityProfile): FidelityProfile['baseline'] {
  const rs = (profile.unseen ?? []).map((u) => readValues(u.values, u.cls, profile)).filter((r) => r.measured > 0);
  return rs.length ? { medianInBand: quantile(rs.map((r) => r.inBand), 0.5), medianMeasured: quantile(rs.map((r) => r.measured), 0.5), n: rs.length } : undefined;
}

/** The share of steering bands a reading is inside, or null when none measured. */
export const inBandShare = (r: FidelityReading): number | null => (r.measured ? r3(r.inBand / r.measured) : null);
