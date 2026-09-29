// atelier/core/observers/selection.ts — WHICH OF MANY FEATURES ARE THIS AUTHOR'S TASTE.
//
// Nobody should hand-pick the features that carry a voice: an author's taste is exactly the set that
// separates their pieces from what the model writes on its own, holds across their pieces, and would
// survive a piece they never showed us. So every feature (./features.ts, and the move reader's in
// ../taste/moves.ts) goes through one test, and only what passes is proposed:
//
//   BAND         the author's range: the 10th to 90th percentile of the pieces discovery read, widened
//                by a quarter of that span on each side. Both sides: a floor alone is overshot.
//   SEPARATES    the chance that one of the author's pieces and one of the model's plain drafts, drawn
//                at random, are ordered the same way (the area under the curve, AUC). 0.5 is noise;
//                at least 0.75 either way is taste. AND most of the model's drafts (60%) fall outside
//                the band, so holding a draft to it would change something.
//   HOLDS        at least 80% of the author's held-back pieces, which nothing read, fall inside it.
//
// A feature that separates and holds earns one of two roles, and the difference is the positions paper's
// "detection is not enforcement":
//
//   RULE     most of the model's drafts (60%) fall outside the band, so the band tells a single draft
//            from the author's work. It can be proposed as a rule and checked on every draft.
//   SIGNAL   the author's distribution and the model's differ (the AUC says so), but the author's own
//            range is wide enough that most single drafts sit inside it. Held to a band, it would pass
//            nearly everything; proposed as a rule, it would be a rule that checks nothing. It goes into
//            the profile, the choice between drafts and the optimizer's objectives: pulled toward the
//            author's typical value, never a gate.
//
// Deterministic, no model call. The pieces and drafts are whatever discovery already has.

import { quantile } from './text.js';
import { FEATURES, featureOf, LAYER_LABEL } from './features.js';

export interface FeatureSample { readonly read: readonly (number | null)[]; readonly held: readonly (number | null)[]; readonly model: readonly (number | null)[] }

export interface FeatureVerdict {
  readonly id: string;
  /** P(author piece > model draft), ties counted half. Above 0.5: the author has more of it. */
  readonly auc: number | null;
  readonly band: readonly [number, number] | null;
  /** share of the author's held-back pieces inside the band */
  readonly heldIn: number | null;
  /** share of the model's drafts outside the band */
  readonly modelOut: number | null;
  readonly authorMedian: number | null;
  readonly modelMedian: number | null;
  readonly kept: boolean;
  /** what a kept feature is for: a per-draft rule, or a signal read over many drafts. Null when not kept. */
  readonly role: 'RULE' | 'SIGNAL' | null;
  readonly why: string;
}

export const SELECTION = { minAucDistance: 0.25, minHeldIn: 0.8, minModelOut: 0.6, minRead: 4, minHeld: 2, minModel: 3, widen: 0.25 } as const;

const vals = (xs: readonly (number | null)[]): number[] => xs.filter((x): x is number => x !== null && Number.isFinite(x));
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** The area under the curve: how often a random author value exceeds a random model value (ties half). */
export function aucOf(author: readonly number[], model: readonly number[]): number | null {
  if (!author.length || !model.length) return null;
  let wins = 0;
  for (const a of author) for (const m of model) wins += a > m ? 1 : a === m ? 0.5 : 0;
  return r3(wins / (author.length * model.length));
}

export function bandOf(read: readonly number[]): readonly [number, number] | null {
  if (read.length < SELECTION.minRead) return null;
  const lo = quantile(read, 0.1); const hi = quantile(read, 0.9);
  const pad = (hi - lo) * SELECTION.widen || Math.max(Math.abs(lo) * 0.1, 0.001);
  return [r3(lo - pad), r3(hi + pad)];
}

export function judgeFeature(id: string, s: FeatureSample): FeatureVerdict {
  const read = vals(s.read); const held = vals(s.held); const model = vals(s.model);
  const band = bandOf(read);
  const auc = aucOf([...read, ...held], model);
  const inBand = (x: number): boolean => band !== null && x >= band[0] && x <= band[1];
  const heldIn = held.length ? r3(held.filter(inBand).length / held.length) : null;
  const modelOut = model.length && band ? r3(model.filter((x) => !inBand(x)).length / model.length) : null;
  const med = (xs: number[]): number | null => (xs.length ? r3(quantile(xs, 0.5)) : null);
  const base = { id, auc, band, heldIn, modelOut, authorMedian: med([...read, ...held]), modelMedian: med(model) };
  const no = (why: string): FeatureVerdict => ({ ...base, kept: false, role: null, why });
  if (read.length < SELECTION.minRead || held.length < SELECTION.minHeld || model.length < SELECTION.minModel) {
    return no(`too few measurable texts (read ${read.length}, held back ${held.length}, model ${model.length})`);
  }
  if (auc === null || Math.abs(auc - 0.5) < SELECTION.minAucDistance) return no(`does not separate you from the model (AUC ${auc})`);
  if ((heldIn ?? 0) < SELECTION.minHeldIn) return no(`your own held-back pieces fall outside it (${Math.round((heldIn ?? 0) * 100)}% inside)`);
  const held_ = `${Math.round((heldIn ?? 0) * 100)}% of your held-back pieces inside`;
  if ((modelOut ?? 0) < SELECTION.minModelOut) {
    return { ...base, kept: true, role: 'SIGNAL', why: `separates you from the model over many drafts (AUC ${auc}), not draft by draft (${Math.round((modelOut ?? 0) * 100)}% of its drafts outside your range); ${held_}` };
  }
  return { ...base, kept: true, role: 'RULE', why: `separates you from the model draft by draft (AUC ${auc}, ${Math.round((modelOut ?? 0) * 100)}% of its drafts outside your range); ${held_}` };
}

/** Every feature judged; the kept ones first, strongest separation first, at most `limit` kept. */
export function selectFeatures(samples: ReadonlyMap<string, FeatureSample>, limit = 8): FeatureVerdict[] {
  const strength = (v: FeatureVerdict): number => (v.kept ? Math.abs((v.auc ?? 0.5) - 0.5) : -1);
  const all = [...samples.entries()].map(([id, s]) => judgeFeature(id, s)).sort((a, b) => strength(b) - strength(a));
  // Beyond the strongest few, a kept feature is shown but not proposed: depth without flooding the review.
  return all.map((v, i) => (v.kept && i >= limit ? { ...v, kept: false, role: null, why: `${v.why}; beyond the ${limit} strongest` } : v));
}

/** Every registered counted feature, judged on the author's read and held-back pieces against the model's drafts. */
export function judgeCountedFeatures(read: readonly string[], held: readonly string[], model: readonly string[], limit = 8): FeatureVerdict[] {
  return selectFeatures(new Map(FEATURES.map((f) => [f.id, { read: read.map((t) => f.measure(t)), held: held.map((t) => f.measure(t)), model: model.map((t) => f.measure(t)) }])), limit);
}

/** The signals a skill keeps: kept features whose role is SIGNAL, with what it takes to score a draft on them. */
export interface StoredSignal { readonly id: string; readonly band: readonly [number, number]; readonly authorMedian: number; readonly modelMedian: number | null; readonly auc: number }

export const signalsOf = (verdicts: readonly FeatureVerdict[]): StoredSignal[] => verdicts.flatMap((v) =>
  (v.kept && v.role === 'SIGNAL' && v.band && v.authorMedian !== null && v.auc !== null
    ? [{ id: v.id, band: v.band, authorMedian: v.authorMedian, modelMedian: v.modelMedian, auc: v.auc }] : []));

/**
 * How far a draft sits from the author on their signals: the mean distance from their typical value in
 * band-widths, over the signals that measured. Lower is closer. Null when none measured. Used to choose
 * between drafts, never to fail one.
 */
export function signalDistance(text: string, signals: readonly StoredSignal[]): number | null {
  const ds = signals.flatMap((s) => {
    const v = featureOf(s.id)?.measure(text) ?? null;
    return v === null ? [] : [Math.abs(v - s.authorMedian) / Math.max(s.band[1] - s.band[0], 0.001)];
  });
  return ds.length ? r3(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}

/**
 * A PROFILE, NOT A SCORE. For one text, how far it sits outside the author's band on each kept feature,
 * in band-widths, averaged per layer. A single number hides which layer is off, and layers fail
 * independently: a draft can match the punctuation and miss the argument entirely.
 */
export interface ProfileEntry { readonly id: string; readonly layer: string; readonly value: number | null; readonly band: readonly [number, number]; readonly distance: number | null }

export function distanceFromBand(v: number, band: readonly [number, number]): number {
  const width = Math.max(band[1] - band[0], 0.001);
  return r3(Math.max(0, band[0] - v, v - band[1]) / width);
}

/**
 * The profile of one text: every counted feature the skill holds (its FEATURE rules and its signals),
 * the value, the author's band, and how far outside it the text sits; then the mean per layer.
 */
export function profileOf(text: string, bands: readonly { readonly id: string; readonly band: readonly [number, number] }[]): { entries: ProfileEntry[]; layers: { layer: string; distance: number; features: number }[] } {
  const entries: ProfileEntry[] = bands.flatMap((b) => {
    const f = featureOf(b.id);
    if (!f) return [];
    const value = f.measure(text);
    return [{ id: b.id, layer: LAYER_LABEL[f.layer], value, band: b.band, distance: value === null ? null : distanceFromBand(value, b.band) }];
  });
  return { entries, layers: layerProfile(entries) };
}

export function layerProfile(entries: readonly ProfileEntry[]): { layer: string; distance: number; features: number }[] {
  const by = new Map<string, number[]>();
  for (const e of entries) if (e.distance !== null) by.set(e.layer, [...(by.get(e.layer) ?? []), e.distance]);
  return [...by.entries()].map(([layer, ds]) => ({ layer, distance: r3(ds.reduce((a, b) => a + b, 0) / ds.length), features: ds.length }));
}
