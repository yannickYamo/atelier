// atelier/core/loop/graded.ts — WHAT A RUN STEERS WITHOUT A RULE, AND THE GUARD AGAINST DISPLACING IT.
//
// Selection keeps more counted features than enter the standard: the profile's SIGNAL bands (../fidelity/types.ts),
// which choose between drafts and never fail an output. On every run, for the output's length class, a SIGNAL
// feature that lies more than one band width outside its band is a GRADED TARGET for that run, exactly as a FEATURE
// rule of the standard is (./run-repair.ts, `CheckOptions.graded`): carrier spans, a signed distance, direction and
// distance in the notes, never a failure, never a line of the recorded report. A MONITOR band never acts. And no
// steering may displace the rest: a rewrite that puts more of the author's features outside their bands, or pushes
// one it was not pointed at from inside to far outside, is refused (`displacement`).

import { FEATURE, featureOf, featureWordCount, LENGTH_DRIFT } from '../observers/features.js';
import { distanceFromBand, openEdge } from '../observers/selection.js';
import { bandsFor } from '../fidelity/profile.js';
import { contextClassOf, type FeatureBand, type FidelityProfile } from '../fidelity/types.js';
import type { RuleCheck } from '../observers/verify.js';
import type { StandardVersion } from '../state/canonical-state.js';
import { expectedBand } from '../observers/pooled.js';

/** A SIGNAL feature's check is named after the feature, under this prefix: no rule of the standard has such an id. */
export const SIGNAL_PREFIX = 'signal·';
/** How far outside its band, in widths, a SIGNAL feature must lie before a run steers it. */
export const SIGNAL_FAR = 1;

/** A SIGNAL feature read as a check, with the band it was read against as FEATURE params (what a note's move is computed from). */
export interface SignalCheck extends RuleCheck { readonly feature: string; readonly params: { readonly feature: readonly [string]; readonly minValue: number; readonly maxValue: number };
  /** one of the author's rates: a target on any miss (../loop/controller.ts, `GradedMiss.rate`) */
  readonly rate?: true }

/** The profile's steering bands for a text's length class: RULE and SIGNAL on known features, never MONITOR. */
export function steeringBands(text: string, profile: FidelityProfile): FeatureBand[] {
  return bandsFor(profile, contextClassOf(featureWordCount(text))).bands.filter((b) => b.role !== 'MONITOR' && featureOf(b.id) !== null);
}

/**
 * THE FEATURES THE OWNER'S STANDARD RULES: every FEATURE measurement of a requirement they have not rejected, by feature id
 * (as ../../cli/fidelity.ts, `ratifiedProfile`, reads them). An enforced rule beats a learned rate: a SIGNAL band on one of
 * these is neither told to the writer nor steered, even where the profile was made before the rule.
 */
export function ruledFeatures(v: Pick<StandardVersion, 'requirements'> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const q of v?.requirements ?? []) {
    if (q.authority === 'EXPERT_REJECTED' || q.measurement?.observer !== 'FEATURE') continue;
    const id = (q.measurement.params.feature as readonly string[] | undefined)?.[0];
    if (id) out.add(id);
  }
  return out;
}

/** Every SIGNAL feature the profile holds in any class, as a graded rule id → feature id (`gradedRules`); none the standard rules. */
export function signalRules(profile: FidelityProfile | null | undefined, ruled: ReadonlySet<string> = new Set()): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of profile?.bands ?? []) if (b.role === 'SIGNAL' && featureOf(b.id) && !ruled.has(b.id)) out.set(`${SIGNAL_PREFIX}${b.id}`, b.id);
  return out;
}

/** Below this many prose words a rate per 1,000 is not read (the features' own minimum): an author's rate is not steered there. */
export const RATE_MIN_WORDS = 150;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * THE BAND A TEXT IS READ AGAINST, AT ITS LENGTH. One of the author's rates that is a count per 1,000 words (the first
 * person) carries the counts a 1,000-word text at their rate may hold; a text of n words is held to the counts one of n
 * words at that rate may hold (../observers/pooled.ts, `expectedBand`), said per 1,000 words, so a 300-word text at the
 * author's own rate is inside. Null under RATE_MIN_WORDS, where the rate is not read. Every other band is as it is.
 */
export function bandAt(b: FeatureBand, text: string): readonly [number, number] | null {
  const f = featureOf(b.id);
  if (!b.rate || !f?.count || f.unit !== 'per1000') return b.band;
  const n = featureWordCount(text);
  if (n < RATE_MIN_WORDS) return null;
  const [lo, hi] = expectedBand((b.median * n) / 1000);
  return [r3((lo * 1000) / n), r3((hi * 1000) / n)];
}

const fmt = (unit: string, x: number): string => (unit === 'share' ? `${Math.round(x * 100)}%` : `${x}`);

/**
 * The text's SIGNAL features for its class, as checks: VIOLATED, with carriers and a signed error, only when more than
 * SIGNAL_FAR widths outside the band (one of the author's rates: outside it at all); MET otherwise (the value and distance kept, so a comparison still reads them).
 * A specifics feature below its band is never a miss: asking for more specifics asks for invention.
 */
export function signalChecks(text: string, profile: FidelityProfile | null | undefined, ruled: ReadonlySet<string> = new Set()): SignalCheck[] {
  if (!profile) return [];
  return steeringBands(text, profile).filter((b) => b.role === 'SIGNAL' && !ruled.has(b.id)).flatMap((b) => {
    const f = featureOf(b.id);
    const band = bandAt(b, text);
    if (!f || !band) return [];
    const params = { feature: [b.id] as const, minValue: band[0], maxValue: band[1] };
    const r = FEATURE.observe(text, params);
    // One of the author's rates (../fidelity/profile.ts, `AUTHOR_RATES`) is steered on any miss; any other signal only far out.
    const far = r.verdict === 'VIOLATED' && (b.rate === true || Math.abs(r.error ?? 0) > SIGNAL_FAR) && !(f.specifics && (r.error ?? 0) < 0);
    const result = far || r.verdict !== 'VIOLATED' ? r : { ...r, verdict: 'MET' as const, spans: [] };
    const unit = f.unit === 'per1000' ? ' per 1,000 words' : '';
    const scaled = band !== b.band ? `, at this length; not read under ${RATE_MIN_WORDS} words` : '';
    return [{ requirementId: `${SIGNAL_PREFIX}${b.id}`, statement: `Keep ${f.label} where your pieces hold it (${openEdge(band[0]) ? `at most ${fmt(f.unit, band[1])}` : openEdge(band[1]) ? `at least ${fmt(f.unit, band[0])}` : `${fmt(f.unit, band[0])} to ${fmt(f.unit, band[1])}`}${unit}${scaled}).`,
      materiality: null, enforced: false, observer: 'FEATURE', result, feature: b.id, params, ...(b.rate ? { rate: true as const } : {}) }];
  });
}

/** Is this check a SIGNAL feature's (never a line of the recorded report)? */
export const isSignal = (id: string): boolean => id.startsWith(SIGNAL_PREFIX);

/**
 * A SIGNAL FEATURE IS NEVER NAMED BY ITS ID TO THE OWNER. Every line a run records or prints is passed through this:
 * `signal·parenthesis` becomes "parenthetical asides (as your pieces hold them)", what it is, said as no rule of theirs.
 */
export const ownerWords = (s: string): string => s.replace(new RegExp(`${SIGNAL_PREFIX}([^\\s,;()]+)`, 'g'), (_m, f: string) => `${featureOf(f)?.label ?? f} (as your pieces hold them)`);

export interface Displacement {
  /** steering features outside their band on the earlier text, read at the later text's length */
  readonly before: number;
  readonly after: number;
  /** why the later text was refused, if it was: empty when nothing was displaced */
  readonly refusedFor: readonly string[];
}

/**
 * THE DISPLACEMENT GUARD. Over the RULE and SIGNAL bands for the later text's class: refused when more features are
 * outside their band than before, or when a feature nobody was pointed at (`targeted`, feature ids) moved from inside
 * its band to more than SIGNAL_FAR widths outside. The earlier text's rates per 1,000 words are read at the later
 * text's length when the length moved by more than LENGTH_DRIFT (../observers/features.ts): a shorter text raises
 * every rate, and that is not a displacement. Null without a profile.
 */
export function displacement(before: string, after: string, profile: FidelityProfile | null | undefined, targeted: ReadonlySet<string>): Displacement | null {
  if (!profile) return null;
  const wb = featureWordCount(before); const wa = featureWordCount(after);
  const ratio = wb > 0 && wa > 0 && Math.abs(wb / wa - 1) > LENGTH_DRIFT ? wb / wa : 1;
  let nb = 0; let na = 0; const newlyOut: string[] = []; const pushed: string[] = [];
  for (const b of steeringBands(after, profile)) {
    const f = featureOf(b.id); const band = bandAt(b, after);
    if (!f || !band) continue;
    const vb0 = f.measure(before); const va = f.measure(after);
    if (vb0 === null || va === null) continue;
    const vb = f.unit === 'per1000' ? vb0 * ratio : vb0;
    const out = (v: number): boolean => (v < band[0] && !f.specifics) || v > band[1];
    const ob = out(vb); const oa = out(va);
    if (ob) nb += 1;
    if (oa) na += 1;
    if (!ob && oa) {
      newlyOut.push(f.label);
      const d = distanceFromBand(va, band);
      if (!targeted.has(b.id) && d > SIGNAL_FAR) pushed.push(`${f.label} moved from inside your range to ${d} widths outside it`);
    }
  }
  const refusedFor = [...(na > nb ? [`${na - nb} more of your features outside their range (${newlyOut.join(', ')})`] : []), ...pushed];
  return { before: nb, after: na, refusedFor };
}

/**
 * THE AUTHOR'S RATES, SAID TO THE WRITER as their rates (../fidelity/profile.ts, `AUTHOR_RATES`): about how many "I" per
 * 1,000 words, how long a sentence runs, and how many run under six words. Told before the draft; the same bands are
 * graded targets after it. Only a rate that steers as a SIGNAL is said: where the owner's standard rules the feature (a
 * RULE band, or `ruled`), their rule is what holds, and the corpus's rate is neither said nor steered. Empty where the
 * profile holds none of them.
 */
export function authorRatesNote(profile: FidelityProfile | null | undefined, ruled: ReadonlySet<string> = new Set()): string {
  const m = (id: string): number | null => (ruled.has(id) ? null : profile?.bands.find((b) => b.id === id && b.cls === 'all' && b.rate && b.role === 'SIGNAL')?.median ?? null);
  const fp = m('firstSingular'); const p50 = m('sentenceP50'); const short = m('shortSentence');
  const parts = [
    fp !== null ? (Math.floor(fp) === Math.ceil(fp) ? `about ${fp} "I" per 1,000 words` : `about ${Math.floor(fp)} to ${Math.ceil(fp)} "I" per 1,000 words`) : '',
    p50 !== null ? `sentences around ${Math.round(p50)} words` : '',
    short !== null ? (short > 0 ? `about 1 in ${Math.round(1 / short)} under 6 words` : 'almost none under 6 words') : '',
  ].filter(Boolean);
  return parts.length ? `How I write, counted over my own pieces: ${parts.join('; ')}. Write at these rates.` : '';
}
