// atelier/core/convergence/symptom.ts — THE STEPS BETWEEN SEEING SOMETHING AND CHANGING SOMETHING.
//
// The loop used to go from one complaint straight to a repair. That is the shortest path and the
// wrong one: it makes every single observation an argument for changing the skill, which is how an
// optimizer that always finds something to do gets built.
//
// So four things are kept apart, and each has a producer and a consumer:
//
//   Observation        local evidence — one requirement, one generation. Says nothing on its own.
//   Symptom            an aggregated BEHAVIOURAL PATTERN across independent contexts.
//   Diagnosis          which causal route is implicated. Reuses `diagnosis/diagnose.ts`'s routes —
//                      DELIVERY_FAILURE | IMPLEMENTATION_MISS | STANDARD_GAP | UNCERTAIN — because
//                      that vocabulary already exists and a second one would drift from it.
//   FailureHypothesis  the implementation mechanism believed capable of correcting an
//                      IMPLEMENTATION_MISS, stated so it can be argued with.
//
// ─── A HYPOTHESIS THAT CANNOT BE WRONG IS NOT A HYPOTHESIS ─────────────────────────────────────
//
// `disconfirmedBy` and `discriminatingContexts` are required fields, not documentation. A repair
// proposal that cannot say what would count against it is a preference wearing the costume of an
// inference, and the g9 case is what that costs: a repair was proposed, built, evaluated and
// rejected, and nothing recorded what the rejection ruled out — so the identical proposal could
// return forever. Requiring the falsifier up front means the rejection has something to attach to.

import type { DiagnosisRoute } from '../diagnosis/diagnose.js';
import type { RequirementEvidence } from '../measurement/longitudinal.js';
import type { RepairRecord } from '../architecture/repair-memory.js';
import type { Carrier } from '../architecture/compile.js';

/**
 * An aggregated behavioural pattern. NOT an observation, and never derived from one.
 *
 * `independentContexts` is the count that matters and it is a count of CONTEXTS. Normalised weight
 * is descriptive only and is deliberately absent from this type — a symptom's strength is how many
 * separate situations showed it, not how many times one situation was re-run.
 */
export interface Symptom {
  readonly requirementId: string;
  readonly kind:
    /** the same miss appeared in separate situations — the pattern that justifies looking */
    | 'RECURRENT_MISS'
    /** one situation, seen once. Real, and not yet a pattern. */
    | 'ISOLATED_MISS'
    /** the same task produced different verdicts on repeat — the skill or the instrument wobbles */
    | 'UNSTABLE_WITHIN_CONTEXT'
    /** what was served did not match what was compiled */
    | 'DELIVERY_MISMATCH'
    /** nothing has looked at this requirement */
    | 'UNOBSERVED';
  readonly independentContexts: number;
  readonly contexts: readonly string[];
  /** whether any of the evidence behind this symptom could support a positive claim */
  readonly claimBearing: boolean;
  readonly detail: string;
}

/**
 * Aggregate evidence into a pattern. Deterministic; no model, no judgement about cause.
 *
 * DELIVERY_MISMATCH outranks everything, because a semantic reading of an output that was never
 * served is a reading of the wrong artefact — and every downstream step would then be diagnosing a
 * skill the model never received.
 */
export function symptomFrom(e: RequirementEvidence, deliveryMatched: boolean, missVerdicts: ReadonlySet<string>): Symptom {
  const base = { requirementId: e.requirementId, claimBearing: e.claim.claimable };

  if (!deliveryMatched) {
    return { ...base, kind: 'DELIVERY_MISMATCH', independentContexts: e.independentContexts,
      contexts: [], detail: 'what was served did not match what was compiled — nothing about this output speaks to the standard' };
  }
  if (!e.observations) {
    return { ...base, kind: 'UNOBSERVED', independentContexts: 0, contexts: [],
      detail: 'no observation exists for this requirement' };
  }
  if (e.mixedWithinContext.length) {
    return { ...base, kind: 'UNSTABLE_WITHIN_CONTEXT', independentContexts: e.independentContexts,
      contexts: e.mixedWithinContext,
      detail: `${e.mixedWithinContext.length} context(s) produced different verdicts on repeated generations — the skill, the instrument, or both` };
  }
  const missCtx = e.byVerdict.filter((t) => missVerdicts.has(t.verdict)).reduce((n, t) => n + t.contexts, 0);
  if (missCtx > 1) {
    return { ...base, kind: 'RECURRENT_MISS', independentContexts: missCtx, contexts: [],
      detail: `a miss appeared in ${missCtx} separate situations` };
  }
  if (missCtx === 1) {
    return { ...base, kind: 'ISOLATED_MISS', independentContexts: 1, contexts: [],
      detail: 'a miss appeared once, in one situation — a reason to look, not a pattern' };
  }
  return { ...base, kind: 'UNOBSERVED', independentContexts: e.independentContexts, contexts: [],
    detail: 'observed, and no miss seen' };
}

/** Which causal route a symptom implicates. Reuses the existing route vocabulary. */
export function routeFor(s: Symptom): { readonly route: DiagnosisRoute; readonly why: string } {
  switch (s.kind) {
    case 'DELIVERY_MISMATCH':
      return { route: 'DELIVERY_FAILURE', why: 'the served package is not the compiled one; the standard is not implicated' };
    case 'RECURRENT_MISS':
      return { route: 'IMPLEMENTATION_MISS', why: 'the standard covers this and separate situations kept missing it' };
    case 'ISOLATED_MISS':
      // AUTHORITY, NOT COUNT, DECIDES THE ROUTE. If a person or a deterministic check saw the rule
      // missed, the standard covers it and the implementation did not carry it — that IS an
      // implementation miss, once. What one occasion cannot do is justify PROMOTING a change, and
      // that limit lives in the eligibility ladder where it belongs rather than being smuggled in by
      // withholding the diagnosis. Requiring recurrence here made a single authoritative miss unable
      // to produce even a reversible experiment.
      return s.claimBearing
        ? { route: 'IMPLEMENTATION_MISS', why: 'an authoritative observation saw the rule missed once — enough to explain and to experiment, not to promote' }
        : { route: 'UNCERTAIN', why: 'one situation, seen by an instrument that has not earned the right to be believed' };
    case 'UNSTABLE_WITHIN_CONTEXT':
      return { route: 'UNCERTAIN', why: 'the same task was judged both ways; which is right is not settled by counting' };
    case 'UNOBSERVED':
      return { route: 'UNCERTAIN', why: 'nothing has been observed' };
  }
}

/**
 * A proposed implementation change, stated so it can be argued with.
 *
 * Note what is NOT here: any claim that the change will work. A hypothesis says what it believes is
 * failing and what would show it wrong; whether it is right is what the evaluation is for.
 */
export interface FailureHypothesis {
  readonly requirementId: string;
  /** the symptom that motivated it — never an Observation */
  readonly motivatingSymptom: Symptom;
  /** the mechanism believed to be failing, in one sentence */
  readonly failingMechanism: string;
  readonly proposedChange: { readonly from: Carrier; readonly to: Carrier };
  /**
   * HOW the carrier was chosen — and today it is always the ladder's next rung.
   *
   * The g9 result falsified the universal ladder as a general POLICY: PROSE -> SELF_CHECK was tried,
   * evaluated and rejected, so "escalate one rung" is not a mechanism-specific answer, it is a
   * default. Recording that on the hypothesis makes it part of what the hypothesis CLAIMS, and
   * therefore part of what a rejection falsifies — rather than an assumption the search keeps making
   * silently because nothing ever wrote it down.
   */
  readonly selectionBasis: 'LADDER_DEFAULT' | 'MECHANISM_SPECIFIC';
  /** REQUIRED: what outcome would count AGAINST this hypothesis */
  readonly disconfirmedBy: string;
  /** REQUIRED: what would tell this apart from the alternatives */
  readonly discriminatingContexts: string;
  /** every prior attempt at this transition, whatever its outcome */
  readonly priorAttempts: readonly RepairRecord[];
}

export interface HypothesisProblem { readonly field: string; readonly problem: string }

/** A hypothesis that cannot be wrong is not one. Checked, not hoped for. */
export function checkHypothesis(h: FailureHypothesis): readonly HypothesisProblem[] {
  const bad: HypothesisProblem[] = [];
  if (!h.disconfirmedBy.trim()) {
    bad.push({ field: 'disconfirmedBy', problem: 'a repair proposal that cannot say what would count against it is a preference, not an inference — and a later rejection would have nothing to attach to' });
  }
  if (!h.discriminatingContexts.trim()) {
    bad.push({ field: 'discriminatingContexts', problem: 'without a discriminating context this cannot be told apart from every other explanation of the same symptom' });
  }
  if (!h.failingMechanism.trim()) {
    bad.push({ field: 'failingMechanism', problem: 'name the mechanism believed to be failing, or the change is being made because a change was wanted' });
  }
  // A hypothesis may rest on ONE authoritative miss. The bar that recurrence protects is PROMOTION,
  // and it is enforced by the eligibility ladder — putting it here too blocked reversible
  // experiments, which is where learning is cheapest.
  const ok = new Set(['RECURRENT_MISS', 'ISOLATED_MISS']);
  if (!ok.has(h.motivatingSymptom.kind)) {
    bad.push({ field: 'motivatingSymptom', problem: `motivated by ${h.motivatingSymptom.kind}, which is not an observed miss at all — there is nothing to explain.` });
  }
  if (h.motivatingSymptom.kind === 'ISOLATED_MISS' && !h.motivatingSymptom.claimBearing) {
    bad.push({ field: 'motivatingSymptom', problem: 'one miss, seen by an unqualified instrument. That is a reason to look, not a reason to build.' });
  }
  return bad;
}

/**
 * WHAT THE SYSTEM WOULD NEED IN ORDER TO GET FURTHER.
 *
 * The seam a future ProbePlanner consumes. Not built here, deliberately — a planner that can create
 * contexts is an active-experimentation mechanic, and the boundary it must respect is stated with
 * the type rather than left to whoever writes it: probes it generates are DEV_PROBE, they may
 * falsify an implementation hypothesis, and they may never become certification evidence. An
 * optimizer must not certify itself on the contexts it produced to improve itself.
 */
export type EvidenceNeed =
  | 'NEED_MORE_INDEPENDENT_CONTEXTS'
  | 'NEED_DISCRIMINATING_PROBE'
  | 'NEED_GROUNDING_EVIDENCE'
  | 'NEED_OBSERVER_QUALIFICATION'
  | 'NEED_DISTINCTIVENESS_BASELINE';

/** What a satisfied need would license — and, for every probe-generated need, what it would not. */
export const NEED_SEMANTICS: Readonly<Record<EvidenceNeed, { readonly licenses: string; readonly neverLicenses: string }>> = {
  NEED_MORE_INDEPENDENT_CONTEXTS: {
    licenses: 'a symptom to become a pattern, and an underpowered decision to become a decision',
    neverLicenses: 'certification, if the contexts were generated by the optimizer to serve itself' },
  NEED_DISCRIMINATING_PROBE: {
    licenses: 'telling one failure hypothesis apart from another',
    neverLicenses: 'reliability or transfer — a probe built to separate hypotheses is DEV_PROBE by construction' },
  NEED_GROUNDING_EVIDENCE: {
    licenses: 'deciding a requirement whose adjudication needs facts not present in the output',
    neverLicenses: 'a structural verdict standing in for a grounding one' },
  NEED_OBSERVER_QUALIFICATION: {
    licenses: 'an instrument to hold VETO or CERTIFY within a declared envelope',
    neverLicenses: 'itself — a qualification campaign cannot be run on the data the instrument was developed against' },
  NEED_DISTINCTIVENESS_BASELINE: {
    licenses: 'the anti-collapse gate to have something to compare against',
    neverLicenses: 'a baseline drawn from candidate outputs, which would move with the thing it is meant to hold still' },
};
