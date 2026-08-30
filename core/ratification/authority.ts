// atelier/core/ratification/authority.ts — THE ONE PLACE AUTHORITY IS ASSIGNED.
//
// Five surfaces let a person rule on a requirement — the batch, `ratify-one`, `add`, the front
// door, and the post-close verbs `amend`/`confirm` — and before this module they were five
// implementations of one act. They drifted exactly the way five copies drift: `ratify-one` skipped
// the public-source branch and every obligation validation the batch performed, `add` and the batch
// minted colliding ids, and `assertAuthorityCeiling` — the guard the docs describe as enforcing the
// ceiling — was called by tests and nothing else.
//
// Now every route builds a `DecisionInput` and calls `decide`. What comes back is the requirement
// with its authority and provenance assigned, the ledger verb that records the act, and nothing
// else — persistence stays with the caller, because where a decision lands (session, store) is not
// part of what the decision means.
//
// ─── THE CEILING IS ENFORCED HERE, ON EVERY PATH ───────────────────────────────────────────────
//
// A rule inferred from someone else's public work may be ADOPTED by the user for their own skill;
// it can never become that author's ratified standard, whichever command carries the approval.
// `assertAuthorityCeiling` runs on every outcome before it is returned, so a sixth surface added
// later inherits the invariant by construction rather than by review.

import type { Requirement } from '../state/canonical-state.js';
import { assertAuthorityCeiling } from '../state/canonical-state.js';
import type { RatificationDecision as LedgerDecision } from './decision-record.js';

/** Every act a person can perform on one rule, across every surface. */
export type DecisionVerb =
  /** true as written */
  | 'APPROVE'
  /** true, in the person's own words — `statement` required */
  | 'REWRITE'
  /** true only under a condition — `appliesWhen` required */
  | 'CONTEXTUAL'
  /** not the person's rule */
  | 'REJECT'
  /** a rule the person wrote themselves, never proposed by anything */
  | 'ADD'
  /** a rule mechanically grounded in the person's own supplied text (the front door) */
  | 'STATED'
  /** an inferred, unratified rule the person confirmed after seeing the skill work */
  | 'CONFIRM'
  /** a ratified rule reworded by its owner — mints a superseding StandardVersion at the caller */
  | 'AMEND';

export interface DecisionInput {
  readonly verb: DecisionVerb;
  readonly statement?: string;
  readonly appliesWhen?: string;
  /** REQUIRED / PREFERRED / EXEMPLAR_ONLY / TOLERATED / INCIDENTAL — validated here */
  readonly materiality?: string | null;
  /** STRICT / FUNCTIONALLY_EQUIVALENT / FLEXIBLE — validated here */
  readonly form?: string | null;
  /** field-name → JSON-Schema fragment; only enforceable on REQUIRED */
  readonly shape?: unknown;
  /** the id of the decision this rule realizes; excludes a materiality of its own */
  readonly realizes?: string | null;
  /** resolver for `realizes` targets, over whatever draft the caller holds */
  readonly findRule?: (id: string) => Requirement | undefined;
}

export interface DecisionOutcome {
  readonly requirement: Requirement;
  /** the verb as the append-only ledger records it */
  readonly ledgerDecision: LedgerDecision;
  /** true when the person's words replaced what was shown — the ledger stores both */
  readonly rewritten: boolean;
}

const MAT = ['REQUIRED', 'PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL'] as const;
const FORM = ['STRICT', 'FUNCTIONALLY_EQUIVALENT', 'FLEXIBLE'] as const;

/** The ledger verb for a kept rule. Non-obligations are DECIDED, not deferred — see decision-record.ts. */
const ledgerVerbFor = (materiality: string | null, rewritten: boolean): LedgerDecision =>
  rewritten ? 'EDIT'
    : materiality && ['EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL'].includes(materiality)
      ? 'DECIDED_NOT_A_REQUIREMENT' : 'APPROVE';

/**
 * Validate what a decision declares the rule to OBLIGE. Identical rules on every surface — this is
 * the block that lived only in the batch path while `ratify-one` accepted anything.
 */
function validateObligation(id: string, d: DecisionInput): {
  materiality: Requirement['materiality']; form: Requirement['realizationTolerance'];
  shape: Record<string, unknown> | null; realizes: string | null;
} {
  const mat = (d.materiality ?? '').toUpperCase() || null;
  const form = (d.form ?? '').toUpperCase() || null;
  if (mat && !(MAT as readonly string[]).includes(mat)) throw new Error(`${id}: materiality must be one of ${MAT.join(' / ')}`);
  if (form && !(FORM as readonly string[]).includes(form)) throw new Error(`${id}: form must be one of ${FORM.join(' / ')}`);

  const realizes = typeof d.realizes === 'string' && d.realizes.trim() ? d.realizes.trim() : null;
  if (realizes) {
    if (realizes === id) throw new Error(`${id}: a rule cannot realize itself.`);
    if (!d.findRule?.(realizes)) throw new Error(`${id}: realizes "${realizes}", which is not a rule in this draft.`);
    if (mat) {
      throw new Error(`${id}: a realization does not take a materiality — ${realizes} carries the obligation, and a `
        + `second one here would issue two commands for one choice.\n`
        + `  What is open is how tightly the FORM binds:  "form":"STRICT" | "FUNCTIONALLY_EQUIVALENT" | "FLEXIBLE"`);
    }
  }

  let shape: Record<string, unknown> | null = null;
  if (d.shape !== undefined && d.shape !== null && d.shape !== '') {
    try {
      shape = typeof d.shape === 'string' ? JSON.parse(d.shape) as Record<string, unknown> : d.shape as Record<string, unknown>;
    } catch { throw new Error(`${id}: shape is not valid JSON.`); }
    if (typeof shape !== 'object' || Array.isArray(shape) || !Object.keys(shape).length) {
      throw new Error(`${id}: shape must be an object of field name to JSON Schema fragment, `
        + `for example {"verdict":{"type":"string"},"confidence":{"type":"number"}}.`);
    }
    if (mat !== 'REQUIRED') {
      throw new Error(`${id}: a shape is only enforceable on a REQUIRED rule; this one is `
        + `${mat ?? 'undeclared'}. A shape the runtime will not hold is a request, and the rule already `
        + `says it in words.`);
    }
  }

  return { materiality: mat as Requirement['materiality'], form: form as Requirement['realizationTolerance'], shape, realizes };
}

/**
 * One decision, one outcome. Pure: reads `shown` and the input, returns the ruled requirement.
 *
 * `shown` is the requirement as the person saw it. For ADD and STATED the caller constructs the
 * base (there was no proposal), and this function is still what assigns its authority — a person's
 * own words are the one source that grants EXPERT_AUTHORED, and nothing model-supplied is.
 */
export function decide(shown: Requirement, d: DecisionInput): DecisionOutcome {
  const id = shown.requirementId;

  if (d.verb === 'REJECT') {
    const requirement: Requirement = { ...shown, authority: 'EXPERT_REJECTED' };
    return { requirement, ledgerDecision: 'REJECT', rewritten: false };
  }

  // ─── SOURCE PROVENANCE SURVIVES EVERY VERB ───────────────────────────────────────────────────
  //
  // A verb that rewrote provenance before the ceiling looked at it would launder the one fact the
  // ceiling exists to judge — the first draft of AMEND did exactly that, and the ceiling test caught
  // it. Public-source stays public for the life of the rule; the ceiling then refuses any authority
  // the source cannot carry.
  const fromPublicSource = shown.provenance === 'PUBLIC_BEHAVIOUR_INFERRED';

  if (d.verb === 'ADD' || d.verb === 'STATED') {
    const ob = validateObligation(id, d);
    const requirement: Requirement = { ...shown,
      ...(d.statement ? { statement: d.statement } : {}),
      ...(d.appliesWhen ? { appliesWhen: d.appliesWhen } : {}),
      authority: 'EXPERT_AUTHORED',
      provenance: fromPublicSource ? shown.provenance : d.verb === 'ADD' ? 'EXPERT_ADDED' : 'EXPERT_STATED',
      materiality: ob.materiality, realizationTolerance: ob.form, outputShape: ob.shape,
      ...(ob.realizes !== null ? { realizes: ob.realizes } : {}) };
    assertAuthorityCeiling(requirement);
    return { requirement, ledgerDecision: 'APPROVE', rewritten: false };
  }

  if (d.verb === 'CONFIRM') {
    const requirement: Requirement = { ...shown, authority: 'EXPERT_RATIFIED' };
    assertAuthorityCeiling(requirement);
    return { requirement, ledgerDecision: 'APPROVE', rewritten: false };
  }

  if (d.verb === 'AMEND') {
    if (!d.statement) throw new Error(`${id}: AMEND records the owner's words; --statement is required.`);
    const requirement: Requirement = { ...shown, statement: d.statement,
      ...(d.appliesWhen ? { appliesWhen: d.appliesWhen } : {}),
      authority: 'EXPERT_AUTHORED',
      provenance: fromPublicSource ? shown.provenance : 'SUBSTANTIVELY_REWRITTEN' };
    assertAuthorityCeiling(requirement);
    return { requirement, ledgerDecision: 'EDIT', rewritten: true };
  }

  // APPROVE / REWRITE / CONTEXTUAL — a ruling on something proposed.
  if (d.verb === 'REWRITE' && !d.statement) {
    throw new Error(`${id}: REWRITE needs the user's own wording. The standard records what they said, not a tidied version.`);
  }
  if (d.verb === 'CONTEXTUAL' && !d.appliesWhen) {
    throw new Error(`${id}: CONTEXTUAL needs the condition, in their words.`);
  }
  const ob = validateObligation(id, d);
  const rewritten = d.verb === 'REWRITE' || (d.verb === 'CONTEXTUAL' && Boolean(d.appliesWhen));

  // Who stands behind it depends on whose work it came from: adopting a behaviour read off someone
  // else's public work is the user's decision; ratifying it as that author's standard is not theirs
  // to make, and the ceiling below refuses any path that tries.
  const requirement: Requirement = { ...shown,
    authority: fromPublicSource ? 'USER_ADOPTED' : 'EXPERT_RATIFIED',
    provenance: fromPublicSource ? 'PUBLIC_BEHAVIOUR_INFERRED'
      : rewritten ? 'SUBSTANTIVELY_REWRITTEN' : 'MACHINE_DISCOVERED',
    materiality: ob.materiality, realizationTolerance: ob.form, outputShape: ob.shape,
    ...(ob.realizes !== null ? { realizes: ob.realizes } : {}),
    ...(d.statement ? { statement: d.statement } : {}),
    ...(d.appliesWhen ? { appliesWhen: d.appliesWhen } : {}) };
  assertAuthorityCeiling(requirement);
  return { requirement, ledgerDecision: ledgerVerbFor(ob.materiality, rewritten), rewritten };
}
