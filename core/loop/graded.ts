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
import { distanceFromBand } from '../observers/selection.js';
import { bandsFor } from '../fidelity/profile.js';
import { contextClassOf, type FeatureBand, type FidelityProfile } from '../fidelity/types.js';
import type { RuleCheck } from '../observers/verify.js';

/** A SIGNAL feature's check is named after the feature, under this prefix: no rule of the standard has such an id. */
export const SIGNAL_PREFIX = 'signal·';
/** How far outside its band, in widths, a SIGNAL feature must lie before a run steers it. */
export const SIGNAL_FAR = 1;

/** A SIGNAL feature read as a check, with the band it was read against as FEATURE params (what a note's move is computed from). */
export interface SignalCheck extends RuleCheck { readonly feature: string; readonly params: { readonly feature: readonly [string]; readonly minValue: number; readonly maxValue: number } }

/** The profile's steering bands for a text's length class: RULE and SIGNAL on known features, never MONITOR. */
export function steeringBands(text: string, profile: FidelityProfile): FeatureBand[] {
  return bandsFor(profile, contextClassOf(featureWordCount(text))).bands.filter((b) => b.role !== 'MONITOR' && featureOf(b.id) !== null);
}

/** Every SIGNAL feature the profile holds in any class, as a graded rule id → feature id (`gradedRules`). */
export function signalRules(profile: FidelityProfile | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of profile?.bands ?? []) if (b.role === 'SIGNAL' && featureOf(b.id)) out.set(`${SIGNAL_PREFIX}${b.id}`, b.id);
  return out;
}

const fmt = (unit: string, x: number): string => (unit === 'share' ? `${Math.round(x * 100)}%` : `${x}`);

/**
 * The text's SIGNAL features for its class, as checks: VIOLATED, with carriers and a signed error, only when more than
 * SIGNAL_FAR widths outside the band; MET otherwise (the value and distance kept, so a comparison still reads them).
 * A specifics feature below its band is never a miss: asking for more specifics asks for invention.
 */
export function signalChecks(text: string, profile: FidelityProfile | null | undefined): SignalCheck[] {
  if (!profile) return [];
  return steeringBands(text, profile).filter((b) => b.role === 'SIGNAL').flatMap((b) => {
    const f = featureOf(b.id);
    if (!f) return [];
    const params = { feature: [b.id] as const, minValue: b.band[0], maxValue: b.band[1] };
    const r = FEATURE.observe(text, params);
    const far = r.verdict === 'VIOLATED' && Math.abs(r.error ?? 0) > SIGNAL_FAR && !(f.specifics && (r.error ?? 0) < 0);
    const result = far || r.verdict !== 'VIOLATED' ? r : { ...r, verdict: 'MET' as const, spans: [] };
    const unit = f.unit === 'per1000' ? ' per 1,000 words' : '';
    return [{ requirementId: `${SIGNAL_PREFIX}${b.id}`, statement: `Keep ${f.label} where your pieces hold it (${fmt(f.unit, b.band[0])} to ${fmt(f.unit, b.band[1])}${unit}).`,
      materiality: null, enforced: false, observer: 'FEATURE', result, feature: b.id, params }];
  });
}

/** Is this check a SIGNAL feature's (never a line of the recorded report)? */
export const isSignal = (id: string): boolean => id.startsWith(SIGNAL_PREFIX);

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
    const f = featureOf(b.id);
    if (!f) continue;
    const vb0 = f.measure(before); const va = f.measure(after);
    if (vb0 === null || va === null) continue;
    const vb = f.unit === 'per1000' ? vb0 * ratio : vb0;
    const out = (v: number): boolean => (v < b.band[0] && !f.specifics) || v > b.band[1];
    const ob = out(vb); const oa = out(va);
    if (ob) nb += 1;
    if (oa) na += 1;
    if (!ob && oa) {
      newlyOut.push(f.label);
      const d = distanceFromBand(va, b.band);
      if (!targeted.has(b.id) && d > SIGNAL_FAR) pushed.push(`${f.label} moved from inside your range to ${d} widths outside it`);
    }
  }
  const refusedFor = [...(na > nb ? [`${na - nb} more of your features outside their range (${newlyOut.join(', ')})`] : []), ...pushed];
  return { before: nb, after: na, refusedFor };
}
