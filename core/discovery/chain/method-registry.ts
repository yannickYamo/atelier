// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
// Missed on the first pass: the outward-dependency scan filtered `./`-prefixed imports as siblings,
// and this is a sibling that was not on the port list. The typechecker caught it immediately, which
// is the argument for porting against a compiler rather than against a file list.

/**
 * Stage 2 — MethodRegistry. Authority of a methodology = "is this a LEGITIMATE methodology
 * source?" — NOT "should it be used here?". MethodApplicability is evaluated SEPARATELY against
 * the situation (method-registry answers legitimacy; methodology-evidence answers fit).
 * Conflating the two recreates the wiring problem where authored implies use-everywhere.
 *
 * Pure types + deterministic authority guards. No LLM. Agent does NOT author methods —
 * seeds are DERIVED_UNRATIFIED (model/extraction-proposed, provenance-linked), never
 * claimed EXPERT_AUTHORED here.
 *
 * CONSUMER (historical): methodology-evidence.ts, deleted 2026-09-26 with the taste ladder, assessed presence/applicability/execution against a
 * registered MethodSpec; the aggregation stage folds MethodologyEvidence into the Blueprint.
 */
import type { ConstructScope } from './construct-scope.js';
import type { FactorAuthority } from './taste-factor.js';

/** One essential behavior of a method. `signature` (if present) makes satisfaction deterministically detectable. */
export interface MethodObligation {
  readonly id: string;
  readonly describe: string;
  /** a text signature for deterministic detection; ABSENT ⇒ obligation is NOT_ASSESSABLE deterministically. */
  readonly signature?: string;
}

/** Whether the method is load-bearing for its scope (a DECLARED role — enforced only if authority permits). */
export type MethodNecessity = 'REQUIRED' | 'OPTIONAL';

export interface MethodSpec {
  readonly id: string;
  readonly version: string;
  readonly authority: FactorAuthority;      // EXPERT_AUTHORED | EXPERT_RATIFIED | DERIVED_UNRATIFIED
  readonly constructScope: ConstructScope;
  readonly necessity: MethodNecessity;
  readonly requiredInputs: readonly string[];    // situation inputs the method needs (contract)
  readonly forbiddenContextTags: readonly string[]; // situation tags that make it INAPPLICABLE (contract)
  readonly obligations: readonly MethodObligation[];
  readonly conflictsWith: readonly string[];     // method ids it structurally conflicts with
  readonly provenance: { readonly authoredBy: string; readonly sourceRef?: string };
}

// The registry class and its authority guards (`canBeRequired`, `canAuthorizeRepair`) served only the
// taste ladder's methodology fold, deleted with it on 2026-09-26. The types above are still read by
// the methodology channel (`run-methods.ts`, `method-extraction.ts`).
