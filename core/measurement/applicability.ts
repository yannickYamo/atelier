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

/** Is this requirement unconditional by its own frozen words? */
export const isUnconditional = (r: Requirement): boolean => UNCONDITIONAL.test(r.appliesWhen ?? '');

/**
 * Decide what the frozen text alone can decide.
 *
 * Deterministic and conservative. It resolves the unconditional case and refuses the rest — a module
 * that guessed at "does this task involve section transitions" would be a semantic instrument
 * wearing a deterministic name, and its guesses would enter the denominator as if they were facts.
 */
export function resolveFromFrozenText(r: Requirement, contextId: string): ApplicabilityDecision {
  return isUnconditional(r)
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
  /** the share the frozen text alone declares unconditional */
  readonly generalShare: number;
}

/** What the standard says about its own conditionality — the number A2 is trying to move. */
export function census(requirements: readonly Requirement[]): ApplicabilityCensus {
  const total = requirements.length;
  const unconditional = requirements.filter(isUnconditional).length;
  return { total, unconditional, conditional: total - unconditional,
    generalShare: total ? unconditional / total : 0 };
}
