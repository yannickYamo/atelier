// atelier/core/ratification/boundary-answer.ts — A TARGETED SCOPE DECISION, APPLIED AND RECORDED.
//
// The narrow act at the end of an active query: Atelier found competing interpretations of WHERE one
// rule holds, put them to the person whose rule it is, and now has an answer.
//
// ─── WHAT THE ANSWER IS AUTHORITY OVER, AND WHAT IT IS NOT ─────────────────────────────────────
//
// It settles the SCOPE OF ONE REQUIREMENT. It is not evidence that the requirement itself is
// correct, and it is emphatically not evidence that the other rules discovered alongside it are.
// Reading one boundary answer as ratification of the draft it arrived in would let a single
// convenient question launder a dozen unexamined proposals.
//
// ─── NEITHER IS A REAL ANSWER, NOT A FAILURE TO ANSWER ─────────────────────────────────────────
//
// Two machine-authored options are two guesses, and forcing a person to pick the closer one records
// a decision they did not make. NEITHER carries their own condition and produces an EDIT — which is
// also the only path here that can introduce a scope nobody proposed.

import type { Requirement } from '../state/canonical-state.js';
import { appendDecision, type RatificationLedger } from './decision-record.js';

export type BoundaryAnswer =
  | { readonly choice: 'A' | 'B' }
  | { readonly choice: 'NEITHER'; readonly condition: string };

export interface BoundaryQuery {
  readonly queryId: string;
  readonly requirementId: string;
  /** the two scopes actually observed in discovery. Machine-proposed, hence arguable. */
  readonly optionAScope: string;
  readonly optionBScope: string;
}

export interface BoundaryResolution {
  readonly revised: Requirement;
  readonly ledger: RatificationLedger;
  /** did the human's scope differ from what was shown? An EDIT is the interesting outcome. */
  readonly changedFromProposal: boolean;
}

/**
 * Apply one answer.
 *
 * The revised requirement becomes EXPERT_AUTHORED on its scope: a person has now said where it holds,
 * and that is exactly the authority act the whole active-query mechanism exists to obtain cheaply.
 * The statement's own provenance is untouched — the machine proposed the rule and the human scoped
 * it, and collapsing those two would overstate what the answer settled.
 */
export function applyBoundaryAnswer(
  ledger: RatificationLedger, shown: Requirement, query: BoundaryQuery,
  answer: BoundaryAnswer, decidedAt: string,
): BoundaryResolution {
  if (shown.requirementId !== query.requirementId) {
    throw new Error(`BOUNDARY ANSWER: query ${query.queryId} is about ${query.requirementId} and the requirement shown is ${shown.requirementId}.`);
  }
  const scope = answer.choice === 'NEITHER' ? answer.condition.trim()
    : answer.choice === 'A' ? query.optionAScope
      : query.optionBScope;
  if (!scope) throw new Error('BOUNDARY ANSWER: NEITHER with no condition records that the options were wrong without recording what is right.');

  const revised: Requirement = { ...shown, appliesWhen: scope, authority: 'EXPERT_RATIFIED' };
  const changedFromProposal = scope !== shown.appliesWhen;

  return {
    revised,
    // EDIT when the human moved the scope; APPROVE when they confirmed what was already there.
    ledger: appendDecision(ledger, shown, changedFromProposal ? 'EDIT' : 'APPROVE', {
      ...(changedFromProposal ? { humanRevision: revised } : {}),
      note: answer.choice === 'NEITHER' ? `neither option; author's own condition: ${scope}` : `chose ${answer.choice}`,
      decidedAt,
    }),
    changedFromProposal,
  };
}

/**
 * What one answer licenses, stated as a value so no caller has to remember it.
 *
 * The temptation this blocks: a draft where one requirement's boundary is settled looks more ratified
 * than it is, and the coverage view will honestly report that one requirement improved. Nothing about
 * its neighbours changed.
 */
export const BOUNDARY_ANSWER_AUTHORITY = {
  settles: 'the scope of the ONE requirement asked about',
  doesNotSettle: [
    'that the requirement itself is correct',
    'any other requirement in the same draft',
    'the draft as a whole',
  ],
  why: 'a person answered one question about one rule. Every other proposal in front of them is exactly '
    + 'as unratified as it was before.',
} as const;
