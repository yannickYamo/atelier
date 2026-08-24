// atelier/core/convergence/probe.ts — A DEV PROBE, AND THE PROVENANCE IT CAN NEVER SHED.
//
// The planner can decide a discriminating experiment is needed. This is what it emits: a SPEC, not a
// fired probe. The machinery that builds one already exists and is not duplicated here —
// `discovery/chain/discrimination-probe.ts` supplies `designPair` (two outputs on one case differing
// only in the property), `planProbeSides`/`sideImbalance` (counterbalancing), `blindPair`, and
// `manipulationVerified`, which checks the two arms ACTUALLY differ in the intended property. A probe
// whose arms do not differ discriminates nothing and returns a confident answer about the wrong thing.
//
// ─── THE SPLIT THIS FILE ENFORCES ──────────────────────────────────────────────────────────────
//
// A probe Atelier authors to improve Atelier is not evidence that Atelier generalises. The rule is
// easy to state and fails silently if it lives only in a document, so it is a type here: every probe
// result carries `evidenceClass: 'DEV_PROBE'` and `assertNotCertification` refuses to let one enter
// a certification set. An optimizer must not certify itself on the contexts it generated to improve
// itself.

import type { Provenance } from '../fidelity/provenance.js';
import type { FailureHypothesis } from './symptom.js';

/** What a probe is FOR — the hypotheses it exists to separate. */
export interface ProbeSpec {
  readonly probeId: string;
  readonly requirementId: string;
  /** at least two: a probe that cannot separate anything is a generation, not an experiment */
  readonly separates: readonly string[];
  /** per hypothesis, the outcome that would count against it */
  readonly disconfirmingOutcome: Readonly<Record<string, string>>;
  /** the property the two arms must differ in, and nothing else */
  readonly manipulatedProperty: string;
  readonly provenance: Extract<Provenance, 'OPTIMIZATION_CONTEXT'>;
  readonly evidenceClass: 'DEV_PROBE';
}

export interface SpecProblem { readonly field: string; readonly problem: string }

export function specFor(hypotheses: readonly FailureHypothesis[], probeId: string): ProbeSpec | null {
  if (hypotheses.length < 2) return null;
  return {
    probeId, requirementId: hypotheses[0].requirementId,
    separates: hypotheses.map((h) => h.failingMechanism),
    disconfirmingOutcome: Object.fromEntries(hypotheses.map((h) => [h.failingMechanism, h.disconfirmedBy])),
    manipulatedProperty: hypotheses[0].discriminatingContexts,
    // Declared at origin, never inferred from how it ran. A probe exists to drive optimisation.
    provenance: 'OPTIMIZATION_CONTEXT',
    evidenceClass: 'DEV_PROBE',
  };
}

export function checkSpec(s: ProbeSpec): readonly SpecProblem[] {
  const bad: SpecProblem[] = [];
  if (s.separates.length < 2) {
    bad.push({ field: 'separates', problem: 'a probe that separates fewer than two hypotheses is a generation, not an experiment' });
  }
  for (const h of s.separates) {
    if (!s.disconfirmingOutcome[h]?.trim()) {
      bad.push({ field: 'disconfirmingOutcome', problem: `no outcome would count against "${h.slice(0, 40)}...", so running this could not change what we believe` });
    }
  }
  if (!s.manipulatedProperty.trim()) {
    bad.push({ field: 'manipulatedProperty', problem: 'without a named manipulated property the two arms may differ in anything, and the answer would be about whatever that was' });
  }
  return bad;
}

/** A result, carrying where it came from for as long as it exists. */
export interface ProbeResult {
  readonly probeId: string;
  readonly evidenceClass: 'DEV_PROBE';
  readonly provenance: 'OPTIMIZATION_CONTEXT';
  /** which hypothesis survived, if the probe resolved */
  readonly survived: string | null;
  readonly eliminated: readonly string[];
  /** the arms genuinely differed in the manipulated property — else the result is about nothing */
  readonly manipulationVerified: boolean;
  readonly at: string;
}

/**
 * THE REFUSAL. Called wherever evidence enters a certification set.
 *
 * There is no flag and no override: a probe result is not weak certification evidence, it is not
 * certification evidence at all, and the distinction survives every downstream aggregation because
 * the class travels on the record rather than in the caller's memory.
 */
export function assertNotCertification(r: { readonly evidenceClass: string; readonly provenance: string }): void {
  if (r.evidenceClass === 'DEV_PROBE' || r.provenance === 'OPTIMIZATION_CONTEXT') {
    throw new Error(
      'CERTIFICATION: this evidence was produced by the optimizer to improve the thing it would be '
      + 'certifying. It may falsify an implementation hypothesis, distinguish failure mechanisms and '
      + 'guide architecture search. It may never establish that the result generalises to real use.');
  }
}

/** What a probe result MAY do — stated beside what it may not, so neither is remembered alone. */
export function applyToHypotheses(
  hypotheses: readonly FailureHypothesis[], r: ProbeResult,
): { readonly remaining: readonly FailureHypothesis[]; readonly why: string } {
  if (!r.manipulationVerified) {
    return { remaining: hypotheses,
      why: 'the two arms did not differ in the property they were supposed to differ in, so the answer is about something else. Nothing was eliminated.' };
  }
  const remaining = hypotheses.filter((h) => !r.eliminated.includes(h.failingMechanism));
  return { remaining,
    why: remaining.length === hypotheses.length
      ? 'the probe resolved nothing — every hypothesis still explains the evidence'
      : `${hypotheses.length - remaining.length} hypothesis/es eliminated. This narrows the SEARCH; it says nothing about whether the surviving one generalises.` };
}
