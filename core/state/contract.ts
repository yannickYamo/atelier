// atelier/core/state/contract.ts — ONE OWNER OF WHAT IS REQUIRED; EVERYTHING ELSE IS EVIDENCE.
//
// The owner's statements, ratifications and amendments are the standard. Their pieces show how they work; a counted
// feature says where their pieces sit; a model's reading says what it saw. None of those is permission. This module
// states the five things said about any requirement or behavioural hypothesis, each on its own axis, and the rules that
// hold between them, so no command can confuse an observation with a ruling:
//
//   origin               who said it: the owner (STATED), their examples (SHOWN_BY_EXAMPLE), a count (DERIVED), a model (READ)
//   evidence             how well it is supported: observed, provisional, qualified, disputed, unsupported
//   owner decision       not presented, pending, adopted, rejected
//   runtime permission   what it may do to a run: monitor, soft (scoped steering), binding
//   observer permission  what a reader of it may do: observe, veto. Nothing certifies (core/taste/calibration.ts)
//   applicability        per task: applies, set aside, unresolved (held as applies, and said)
//
// The rules below are pure and tested adversarially (tests/atelier-authority.test.ts). Every later gate reads them.

export type Origin = 'STATED' | 'SHOWN_BY_EXAMPLE' | 'DERIVED' | 'READ';
export type Evidence = 'observed' | 'provisional' | 'qualified' | 'disputed' | 'unsupported';
export type OwnerDecision = 'not-presented' | 'pending' | 'adopted' | 'rejected';
export type RuntimePermission = 'monitor' | 'soft' | 'binding';
export type ObserverPermission = 'observe' | 'veto';
export type Applicability = 'applies' | 'set-aside' | 'unresolved';

export interface Standing {
  readonly origin: Origin;
  readonly evidence: Evidence;
  readonly owner: OwnerDecision;
}

/** Who may change the owner's decision: only an owner event. A model, a count or a reading never does. */
export type Actor = 'owner' | 'model' | 'count' | 'reading' | 'feedback';

/**
 * WHAT A STANDING PERMITS AT RUN TIME. Binding needs the owner's adoption (a STATED step is adopted by being stated);
 * a rejected item is monitored and nothing more; what the owner has not ruled on steers softly only when its evidence
 * is qualified, and is monitored otherwise.
 */
export function runtimePermission(s: Standing): RuntimePermission {
  if (s.owner === 'rejected') return 'monitor';
  if (s.owner === 'adopted' || s.origin === 'STATED') return 'binding';
  if (s.evidence === 'disputed' || s.evidence === 'unsupported') return 'monitor';
  return s.evidence === 'qualified' ? 'soft' : 'monitor';
}

/** Can this actor move the owner's decision to `to`? Only the owner, and only forward from where it stands. */
export function mayDecide(actor: Actor, from: OwnerDecision, to: OwnerDecision): boolean {
  if (actor !== 'owner') return false;
  if (from === to) return true;
  // A rejection is reconsidered only by presenting again: rejected → pending, never rejected → adopted in one move.
  if (from === 'rejected') return to === 'pending';
  return true;
}

/** Can this actor raise the evidence of an item? A reading raises nothing on its own; a study qualifies; the owner may dispute. */
export function mayRaiseEvidence(actor: Actor, from: Evidence, to: Evidence): boolean {
  const rank: Record<Evidence, number> = { unsupported: 0, disputed: 0, observed: 1, provisional: 2, qualified: 3 };
  if (rank[to] <= rank[from]) return true;
  if (actor === 'reading' || actor === 'model' || actor === 'feedback') return false;
  // A count may take an item to provisional (a band from the pieces); qualified needs the study that qualifies (an owner-run act).
  if (actor === 'count') return to !== 'qualified';
  return true;
}

/**
 * WHAT A READING MAY DO TO A REQUIREMENT'S RESULT. A reader that observes reports; a reader with veto may fail the
 * requirement it is qualified on; no reader passes one. The deterministic checks and the qualified claim reader are
 * not readings in this sense: they are measurements with their own qualification (core/eval/record.ts).
 */
export function readingMay(permission: ObserverPermission, verdict: 'FOLLOWED' | 'MISSED' | 'UNCLEAR'): 'report' | 'fail' {
  return permission === 'veto' && verdict === 'MISSED' ? 'fail' : 'report';
}

/** What a runtime permission may do when the item is missed on an output. */
export function interventionFor(p: RuntimePermission): 'record' | 'note' | 'redraft-or-block' {
  return p === 'monitor' ? 'record' : p === 'soft' ? 'note' : 'redraft-or-block';
}

/** An unresolved applicability is held as applying: a step is never dropped by a reading that could not decide. */
export const applies = (a: Applicability): boolean => a !== 'set-aside';
