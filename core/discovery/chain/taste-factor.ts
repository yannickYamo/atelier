// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
// Ported rather than rewritten, and the original kept running while this one earned its callers:
// copy-then-delete in one movement is how a reference implementation is lost before the port has
// survived use. Its behaviour is pinned by this repository's own tests; the tree it came from is
// not public, and no claim in this repository rests on it.
//
// Nothing here does I/O or calls a model. The whole chain is pure, which is why it ports at all: the
// inference boundary is a PARAMETER, so Atelier supplies its own client and the logic never knew.

/**
 * Stage 0 — TasteFactor + RepairOperatorSpec. The unit of an expert-owned standard and
 * the unit of a construct-aware repair. Pure types + deterministic authority guards.
 *
 * CONSUMER: Stage 1 registers a grounded-commitment TasteFactor; the acceptance router
 * calls `canVeto()` / `canAuthorizeRepair()` before letting a factor gate anything.
 * RepairOperatorSpec is a STUB shape here (no operator is qualified at stage 0) — its
 * consumer is the later repair-qualification stage; fields are the minimum stages 1 and 2 need.
 *
 * LAW (4): a DERIVED_UNRATIFIED TasteFactor cannot veto or authorize repair.
 * Taste is CONDITIONAL: the target is Q(y | x, S_u), not Q(y | S_u) — `appliesWhen`
 * is not optional (without it the system learns caricatures).
 */
import type { ConstructScope, ClaimClass } from './construct-scope.js';

export type FactorClass = 'HARD_VERIFIABLE' | 'EVIDENCE_JUDGMENT' | 'METHODOLOGY' | 'TASTE';
export type FactorAuthority = 'EXPERT_AUTHORED' | 'EXPERT_RATIFIED' | 'DERIVED_UNRATIFIED';
export type ToleranceStatus = 'UNIDENTIFIED' | 'CALIBRATING' | 'CALIBRATED';

/** A typed predicate over the situation `x` (deterministic; no NLP in Stage 0 — a named condition + evaluator). */
export interface Predicate {
  readonly id: string;
  readonly describe: string;
}

export interface ConditionalPriority {
  readonly whenPredicateId: string;
  readonly dominates: readonly string[]; // TasteFactor ids this one outranks under the condition
}

export interface TasteFactor {
  readonly id: string;
  readonly standardVersion: string;
  readonly factorClass: FactorClass;
  readonly authority: FactorAuthority;
  readonly constructScope: ConstructScope;
  readonly claimClasses?: readonly ClaimClass[];
  // CONDITIONAL applicability — REQUIRED (Q(y|x,S_u), not Q(y|S_u)):
  readonly appliesWhen: readonly Predicate[];
  readonly conflictsWith: readonly string[];
  readonly priorityUnder: readonly ConditionalPriority[];
  readonly toleranceStatus: ToleranceStatus;
}

/** LAW 4: only a ratified/authored, CALIBRATED factor may veto or authorize repair. */
export function canVeto(f: TasteFactor): boolean {
  return f.authority !== 'DERIVED_UNRATIFIED' && f.toleranceStatus === 'CALIBRATED';
}
export function canAuthorizeRepair(f: TasteFactor): boolean {
  return f.authority !== 'DERIVED_UNRATIFIED';
}

// ── RepairOperatorSpec — STUB shape (no operator qualified at stage 0). ──
export type RepairQualificationStatus = 'UNQUALIFIED' | 'CALIBRATING' | 'QUALIFIED';

export interface RepairOperatorSpec {
  readonly id: string;
  readonly failureClasses: readonly string[];
  readonly constructScope: ConstructScope;
  readonly requiredSurfaces: readonly string[];  // ComponentKind ids
  readonly appliesWhen: readonly Predicate[];
  readonly forbidsWhen: readonly Predicate[];
  readonly intendedEffects: readonly string[];    // TasteFactor ids
  readonly protectedRisks: readonly string[];     // TasteFactor ids
  readonly qualificationStatus: RepairQualificationStatus;
}

/** A repair working once does not make it globally qualified. */
export function isRepairApplicable(op: RepairOperatorSpec): boolean {
  return op.qualificationStatus === 'QUALIFIED';
}
