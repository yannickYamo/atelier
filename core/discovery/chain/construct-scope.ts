// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
//   from     the private predecessor this was extracted from
//
// Ported rather than rewritten, and the original kept running while this one earned its callers —
// copy-then-delete in one movement is how a reference implementation is lost before the port has
// survived use. Parity between the two is pinned by test.
//
// Nothing here does I/O or calls a model. The whole chain is pure, which is why it ports at all: the
// inference boundary is a PARAMETER, so Atelier supplies its own client and the logic never knew.

/**
 * Stage 0 — ConstructScope (the representational answer to: a sensor
 * that cannot tell it is outside its valid domain). Pure types + DETERMINISTIC
 * resolution. No LLM, no behavioral claim, no threshold tuning.
 *
 * CONSUMER (named at design time, per the no-typed-field-without-consumer rule):
 *   - the stage-1 grounded-commitment sensor declares its `ConstructScope`; the acceptance
 *     router calls `resolveScope()` and maps OUT_OF_SCOPE / UNKNOWN_SCOPE for a
 *     REQUIRED sensor to BLOCKED_ON_INSTRUMENT (never NEEDS_EVIDENCE — a wrong-construct
 *     sensor is dead, not under-sampled).
 *
 * LAW: no declaration ⇒ UNKNOWN_SCOPE, never universal applicability.
 */

export type ClaimClass =
  | 'ESTABLISHED_FACT'
  | 'DERIVED_ARITHMETIC'
  | 'EXPERT_POLICY'
  | 'METHODOLOGY_SCREEN'
  | 'PROVISIONAL_THRESHOLD'
  | 'SCENARIO'
  | 'EXTERNAL_PRIOR'
  | 'UNSUPPORTED_ASSERTION';

export interface ScopeExclusion {
  readonly skillIds?: readonly string[];
  readonly templateIds?: readonly string[];
  readonly reason: string;
}

/** A sensor's declared valid construct domain. At least one positive dimension is REQUIRED. */
export interface ConstructScope {
  readonly skillIds?: readonly string[];
  readonly artifactKinds?: readonly string[];
  readonly templateIds?: readonly string[];
  readonly claimClasses?: readonly ClaimClass[];
  /** which S_u standard dimensions this scope covers — REQUIRED (a scope must name what it measures against). */
  readonly standardDimensions: readonly string[];
  readonly exclusions?: readonly ScopeExclusion[];
}

/** The situation a sensor is being asked to measure. */
export interface ScopeQuery {
  readonly skillId?: string;
  readonly artifactKind?: string;
  readonly templateId?: string;
  readonly claimClass?: ClaimClass;
  readonly standardDimension?: string;
}

export type ScopeResolution = 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'UNKNOWN_SCOPE';

/**
 * Deterministic scope resolution. UNKNOWN_SCOPE when the scope under-specifies the
 * query dimension (we cannot prove in-scope); OUT_OF_SCOPE on an explicit mismatch
 * or exclusion; IN_SCOPE only when every specified query dimension is positively covered.
 */
export function resolveScope(scope: ConstructScope | undefined, q: ScopeQuery): ScopeResolution {
  if (!scope) return 'UNKNOWN_SCOPE'; // LAW: no declaration ⇒ UNKNOWN, never universal

  // explicit exclusion → OUT_OF_SCOPE
  for (const ex of scope.exclusions ?? []) {
    if ((q.skillId && ex.skillIds?.includes(q.skillId)) || (q.templateId && ex.templateIds?.includes(q.templateId))) {
      return 'OUT_OF_SCOPE';
    }
  }

  // standard dimension is the load-bearing axis: a scope must cover the queried dimension
  if (q.standardDimension !== undefined && !scope.standardDimensions.includes(q.standardDimension)) {
    return 'OUT_OF_SCOPE';
  }

  // for each dimension the query specifies AND the scope constrains, require membership;
  // if the scope leaves a queried dimension unconstrained, we cannot prove in-scope → UNKNOWN.
  const checks: { q: string | undefined; allowed: readonly string[] | undefined }[] = [
    { q: q.skillId, allowed: scope.skillIds },
    { q: q.artifactKind, allowed: scope.artifactKinds },
    { q: q.templateId, allowed: scope.templateIds },
    { q: q.claimClass, allowed: scope.claimClasses },
  ];
  let anyUnknown = false;
  for (const c of checks) {
    if (c.q === undefined) continue;          // query does not constrain this axis
    if (c.allowed === undefined) { anyUnknown = true; continue; } // scope silent on a specified axis → cannot prove
    if (!c.allowed.includes(c.q)) return 'OUT_OF_SCOPE';
  }
  return anyUnknown ? 'UNKNOWN_SCOPE' : 'IN_SCOPE';
}
