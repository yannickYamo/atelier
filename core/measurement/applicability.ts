// atelier/core/measurement/applicability.ts — WHERE A REQUIREMENT GOVERNS, DECIDED OUTSIDE THE MODEL.
//
// ─── THE DEFECT, STATED NARROWLY ───────────────────────────────────────────────────────────────
//
// It was reported that Atelier "declares Q(y | x, S_u) and serves Q(y | S_u)". That is too strong
// and A0 disproved it: the rendered package carries `Applies when: <text>` for every non-GENERAL
// requirement (`render.ts:115`), and the invocation supplies the task x as the variable block
// alongside it. The model receives both and can condition on them.
//
// What is actually missing is narrower and worse for MEASUREMENT:
//
//   MODEL_CAN_CONDITION_ON_RENDERED_APPLIESWHEN   TRUE
//   SYSTEM_HAS_EXPLICIT_APPLICABILITY_MECHANISM   FALSE
//
// Nothing outside the model decides whether a requirement governs a context. Every requirement in
// the standard therefore entered every context's evaluation, which is how the v3 run put 33 of 33
// through an applicability gate as APPLIES and then judged rules against tasks where they barely
// arise. That produces forced verdicts on marginal cases, and forced verdicts on marginal cases look
// exactly like an instrument that cannot judge.
//
// ─── WHAT THIS MODULE MAY AND MAY NOT DO ───────────────────────────────────────────────────────
//
// It reads the FROZEN `appliesWhen` and decides, deterministically, what can be decided from it. It
// never edits one: changing when a requirement governs changes what the standard MEANS, and that is
// a StandardVersion change requiring the author.
//
// So the resolution is deliberately partial. `GENERAL` is unconditional by its own text and resolves
// to APPLIES. Anything else states a condition this module cannot evaluate — it is a claim about the
// situation, not about the text — and resolves to UNRESOLVED. An UNRESOLVED requirement is NOT
// evaluated, and that is the point: a case nobody could establish is applicable cannot become clean
// evidence about whether the rule was followed.

import type { Requirement } from '../state/canonical-state.js';

export type ApplicabilityState =
  /** the requirement's own text says it is unconditional */
  | 'APPLIES'
  /** a condition is stated and something outside this module must decide it */
  | 'UNRESOLVED'
  /** decided, by an instrument or a person, that it does not govern here */
  | 'DOES_NOT_APPLY';

export interface ApplicabilityDecision {
  readonly requirementId: string;
  readonly contextId: string;
  readonly state: ApplicabilityState;
  readonly why: string;
  /** what decided it — deterministic text, or something with a name */
  readonly decidedBy: 'FROZEN_TEXT' | 'INSTRUMENT' | 'HUMAN';
}

const UNCONDITIONAL = /^\s*GENERAL\s*$/i;

/**
 * Can the FROZEN TEXT ALONE prove this requirement governs, with nothing else consulted?
 *
 * DELIBERATELY STRICTER THAN `isGeneralScope`, and the divergence is the design rather than a bug.
 * That owner answers "does this rule apply everywhere", for planning and for what a reader is shown.
 * This one answers "may a case be counted as CLEAN EVIDENCE about whether the rule was followed",
 * and the two mistakes are not symmetric. Reading `GENERAL, except on migrations` as unconditional
 * costs a slightly wrong display; counting it as clean evidence puts a marginal case into a
 * measurement as though it were decisive, which is how forced verdicts on cases that barely arise
 * end up looking like an instrument that cannot judge.
 *
 * So exact text only. Anything with more in it than the word GENERAL is refused and left to an
 * instrument or a person. The cases where the two owners disagree are enumerated in
 * `tests/atelier-general-scope.test.ts`.
 */
export const canProveApplicableFromText = (r: Requirement): boolean =>
  UNCONDITIONAL.test(r.appliesWhen ?? '');

/**
 * Decide what the frozen text alone can decide.
 *
 * Deterministic and conservative. It resolves the unconditional case and refuses the rest — a module
 * that guessed at "does this task involve section transitions" would be a semantic instrument
 * wearing a deterministic name, and its guesses would enter the denominator as if they were facts.
 */
export function resolveFromFrozenText(r: Requirement, contextId: string): ApplicabilityDecision {
  return canProveApplicableFromText(r)
    ? { requirementId: r.requirementId, contextId, state: 'APPLIES', decidedBy: 'FROZEN_TEXT',
        why: 'the requirement states it applies generally' }
    : { requirementId: r.requirementId, contextId, state: 'UNRESOLVED', decidedBy: 'FROZEN_TEXT',
        why: `the requirement applies "${r.appliesWhen}" — a condition about the situation, which the text alone cannot settle` };
}

/**
 * May this requirement/context pair contribute behavioural evidence?
 *
 * ONLY APPLIES. An UNRESOLVED pair is not a weak APPLIES and not a DOES_NOT_APPLY: it is a case
 * where nobody has established that the rule governs, and evidence drawn from it says nothing about
 * whether the rule is being followed.
 */
export function admitsEvidence(d: ApplicabilityDecision): boolean {
  return d.state === 'APPLIES';
}

export interface ApplicabilityCensus {
  readonly total: number;
  readonly unconditional: number;
  readonly conditional: number;
  /**
   * The share the frozen text alone PROVES unconditional.
   *
   * Not applicability density. `a_j = Pr_x[alpha_j(x)]` is a probability over deployment contexts;
   * this is a count of declarations, computed by the stricter of the two owners. Nothing routes on it.
   */
  readonly provenGeneralShare: number;
}

/** What the standard says about its own conditionality — the number A2 is trying to move. */
export function census(requirements: readonly Requirement[]): ApplicabilityCensus {
  const total = requirements.length;
  const unconditional = requirements.filter(canProveApplicableFromText).length;
  return { total, unconditional, conditional: total - unconditional,
    provenGeneralShare: total ? unconditional / total : 0 };
}
