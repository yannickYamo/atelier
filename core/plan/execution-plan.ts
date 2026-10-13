// atelier/core/plan/execution-plan.ts — WHAT A SKILL DOES WITH EACH OF ITS RULES, DECIDED ONCE.
//
// A standard says what good is. A run has to do something about each rule of it: show it to the writer, check it,
// write the piece again when it is missed, block the work when it fails. Those decisions were made where they were
// needed (one filter where a draft is written again, another where the result is judged, a third before a run
// starts), each reading the rule's fields its own way. Two of them disagreeing is how a rule comes to be enforced in
// one place and waved through in another.
//
// This is the one reading. For each rule: what it is (the owner's rule, their judgement, a habit of their examples),
// what its check reads and how much of the rule that is, whether a failed check may block (QUALIFIED ENFORCEMENT:
// the owner decides a rule is required; whether its check has earned the right to block is a separate fact), and
// what a run does on a miss. The runtime and the evaluation read this; neither decides again.
//
// It is derived from the standard and never stored: a plan kept beside the standard could differ from it.

import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { targetOf } from '../observers/obligations.js';
import { observes, type Observes } from '../eval/observes.js';

/** RULE: the owner requires it. JUDGEMENT: they require it and no check reads it. HABIT: seen in their examples, not required. */
export type Role = 'RULE' | 'JUDGEMENT' | 'HABIT';
/**
 * What a run does when a draft misses the rule. REDRAFT: the piece is written again, told what it lacks (a section,
 * a table, a length: nothing a sentence rewrite fixes). REWRITE: the sentences that break it are rewritten. SHOW:
 * it is reported and nothing is done. NONE: nothing reads it.
 */
export type OnMiss = 'REDRAFT' | 'REWRITE' | 'SHOW' | 'NONE';
/** Why a rule with a check does not block when the check fails; null where it does. */
export type NotEnforced = 'NOT_REQUIRED' | 'DISPUTED_BY_EXAMPLES' | null;

export interface PlannedRule {
  readonly id: string;
  readonly statement: string;
  readonly role: Role;
  /** what the check reads and how much of the rule that is; null where the rule has no check */
  readonly check: (Observes & { readonly observer: string; readonly reads: 'OUTPUT' | 'BOUND_MATERIAL' }) | null;
  /** may a failed check block the work */
  readonly enforced: boolean;
  readonly notEnforced: NotEnforced;
  readonly onMiss: OnMiss;
}

export interface ExecutionPlan {
  readonly rules: readonly PlannedRule[];
  /** some enforced rule is read against material the person gives */
  readonly readsMaterial: boolean;
  /** the owner requires a length of the whole work, in words: the span of their examples adds no second one */
  readonly rulesLength: boolean;
}

const wholeLengthInWords = (r: Requirement): boolean => r.measurement?.observer === 'LENGTH' && !r.measurement.params.in
  && ((r.measurement.params.unit as readonly string[] | undefined)?.[0] ?? 'words').toLowerCase() === 'words';

function planned(r: Requirement): PlannedRule {
  const m = r.measurement; const o = observes(r);
  const required = r.materiality === 'REQUIRED' || r.obligation === 'JUDGEMENT' || Boolean(r.contested);
  const role: Role = !required ? 'HABIT' : m ? 'RULE' : 'JUDGEMENT';
  const check = m && o ? { ...o, observer: m.observer, reads: targetOf(m.observer) } : null;
  const notEnforced: NotEnforced = !check ? null : r.contested ? 'DISPUTED_BY_EXAMPLES' : r.materiality !== 'REQUIRED' ? 'NOT_REQUIRED' : null;
  const enforced = Boolean(check) && notEnforced === null;
  // What no sentence rewrite fixes is written again: a part the work must contain, a citation that is no line of
  // the material. Everything else that is enforced is a sentence's to fix.
  const onMiss: OnMiss = !check ? 'NONE' : !enforced ? 'SHOW' : r.obligation === 'DELIVERABLE' || m?.observer === 'LINES' ? 'REDRAFT' : 'REWRITE';
  return { id: r.requirementId, statement: r.statement, role, check, enforced, notEnforced, onMiss };
}

/** The plan of a standard: every rule the owner did not reject, in their order. */
export function planFor(std: Pick<StandardVersion, 'requirements'>): ExecutionPlan {
  const live = std.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED');
  const rules = live.map(planned); const enforcedIds = new Set(rules.filter((p) => p.enforced).map((p) => p.id));
  return { rules, readsMaterial: rules.some((p) => p.enforced && p.check?.reads === 'BOUND_MATERIAL'),
    rulesLength: live.some((r) => enforcedIds.has(r.requirementId) && wholeLengthInWords(r)) };
}

const WORDS: Record<OnMiss, string> = { REDRAFT: 'written again', REWRITE: 'the sentence rewritten', SHOW: 'shown, nothing done', NONE: 'yours to judge' };
/** The plan as a person reads it: one line a rule, for `--report` at a build. */
export function describePlan(plan: ExecutionPlan): string[] {
  return plan.rules.map((p) => {
    const reads = p.check ? `${p.check.coverage === 'FULL' ? 'checked' : 'checked in part'}${p.check.reads === 'BOUND_MATERIAL' ? ' against your material' : ''}` : 'no check';
    const blocks = p.enforced ? 'blocks when it fails' : p.notEnforced === 'DISPUTED_BY_EXAMPLES' ? 'does not block: your examples dispute it' : p.role === 'HABIT' ? 'does not block: a habit' : 'does not block';
    return `  ${p.id.padEnd(5)} ${p.role.toLowerCase().padEnd(10)} ${reads} · ${blocks} · on a miss: ${WORDS[p.onMiss]}\n        ${p.statement.replace(/\s+/g, ' ').slice(0, 110)}`;
  });
}
