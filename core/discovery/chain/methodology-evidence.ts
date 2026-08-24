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
 * Stage 2 — methodology assessment. THREE independently typed questions, never merged:
 *   Present(m)  ≠  Applicable(m, x)  ≠  ExecutedCorrectly(m, y)
 * A method may be absent, present-but-wrong-for-context, applicable-but-badly-executed,
 * or applicable-and-correct. Those cases stay distinguishable.
 *
 * ANTI-CIRCULARITY (the reviewer's red flag): the deterministic applicability layer is
 * explicitly CONTRACT-CONSISTENCY — did the output honor the method's OWN declared
 * requires/excludes contract — NOT a quality claim. The genuine "was this the right method
 * for this situation" is a SEPARATE `semanticAppropriateness` field held UNCALIBRATED
 * (never gates) until authority-boundary-calibrated. Same discipline composition required.
 *
 * Pure/deterministic. Raw obligation lists, no scalar. CONSUMER: the aggregation stage → Blueprint.
 */
import type { MethodSpec, MethodRegistry } from './method-registry.js';
import { canBeRequired } from './method-registry.js';
import type { FactorAuthority } from './taste-factor.js';

/** The situation `x` a method is assessed against. */
export interface MethodSituation {
  readonly standardDimension: string;
  readonly skillId?: string;
  readonly templateId?: string;
  readonly availableInputs: readonly string[];
  readonly contextTags: readonly string[];
}

export type Presence = 'PRESENT' | 'ABSENT' | 'UNCLEAR';
export type Applicability = 'REQUIRED' | 'SUPPORTED' | 'OPTIONAL' | 'INAPPLICABLE' | 'UNKNOWN';
export type Execution = 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'NOT_ASSESSABLE';
/** The presence × applicability cross — makes MISSING-method failures first-class. */
export type MethodStatus = 'REQUIRED_AND_PRESENT' | 'REQUIRED_BUT_MISSING' | 'OPTIONAL_AND_PRESENT' | 'INAPPLICABLE_BUT_PRESENT' | 'NOT_APPLICABLE_ABSENT' | 'UNRESOLVED';
export type CompositionRelation = 'COMPATIBLE' | 'CONFLICTING';

/** (1) PRESENCE — is the method's trace detectable in the output? (via obligation signatures) */
export function assessPresence(m: MethodSpec, outputText: string): Presence {
  const sigs = m.obligations.map((o) => o.signature).filter((s): s is string => !!s);
  if (sigs.length === 0) return 'UNCLEAR';                    // no detectable signature → cannot tell deterministically
  return sigs.some((s) => new RegExp(s, 'i').test(outputText)) ? 'PRESENT' : 'ABSENT';
}

/**
 * (2) APPLICABILITY — DETERMINISTIC CONTRACT-CONSISTENCY ONLY (not quality). A forbidden
 * context or a missing required input makes the method INAPPLICABLE by its own contract;
 * otherwise it carries its declared necessity (REQUIRED/OPTIONAL), with DERIVED methods
 * capped to OPTIONAL (canBeRequired). `UNKNOWN` when the situation under-specifies the contract.
 */
export function assessContractApplicability(m: MethodSpec, x: MethodSituation): Applicability {
  if (!m.constructScope.standardDimensions.includes(x.standardDimension)) return 'INAPPLICABLE'; // out of the method's scope
  if (m.forbiddenContextTags.some((t) => x.contextTags.includes(t))) return 'INAPPLICABLE';       // forbidden context triggered
  const missingInput = m.requiredInputs.some((r) => !x.availableInputs.includes(r));
  if (missingInput) return 'UNKNOWN';                          // contract can't be satisfied → cannot claim applicable
  if (m.necessity === 'REQUIRED') return canBeRequired(m) ? 'REQUIRED' : 'OPTIONAL'; // DERIVED can't be required
  return 'OPTIONAL';
}

/** (3) EXECUTION — coverage of detectable obligations only; non-signature obligations are NOT_ASSESSABLE. */
export interface ExecutionResult {
  readonly execution: Execution;
  readonly obligationsSatisfied: readonly string[];
  readonly obligationsMissing: readonly string[];
  readonly obligationsNotAssessable: readonly string[];
}
export function assessExecution(m: MethodSpec, outputText: string): ExecutionResult {
  const satisfied: string[] = [], missing: string[] = [], notAssessable: string[] = [];
  for (const o of m.obligations) {
    if (!o.signature) { notAssessable.push(o.id); continue; }
    (new RegExp(o.signature, 'i').test(outputText) ? satisfied : missing).push(o.id);
  }
  const detectable = satisfied.length + missing.length;
  const execution: Execution = detectable === 0 ? 'NOT_ASSESSABLE'
    : missing.length === 0 ? 'CORRECT'
    : satisfied.length === 0 ? 'INCORRECT'
    : 'PARTIAL';
  return { execution, obligationsSatisfied: satisfied, obligationsMissing: missing, obligationsNotAssessable: notAssessable };
}

/** The presence × applicability cross — surfaces REQUIRED_BUT_MISSING (omission) as first-class. */
export function deriveStatus(presence: Presence, applicability: Applicability): MethodStatus {
  if (applicability === 'UNKNOWN') return 'UNRESOLVED';
  if (applicability === 'INAPPLICABLE') return presence === 'PRESENT' ? 'INAPPLICABLE_BUT_PRESENT' : 'NOT_APPLICABLE_ABSENT';
  if (applicability === 'REQUIRED') return presence === 'PRESENT' ? 'REQUIRED_AND_PRESENT' : 'REQUIRED_BUT_MISSING';
  return presence === 'PRESENT' ? 'OPTIONAL_AND_PRESENT' : 'NOT_APPLICABLE_ABSENT';
}

/** Deterministic composition: CONFLICTING if any co-present method is in this one's conflict set. */
export function assessComposition(m: MethodSpec, coPresentIds: readonly string[]): CompositionRelation {
  return coPresentIds.some((id) => m.conflictsWith.includes(id)) ? 'CONFLICTING' : 'COMPATIBLE';
}

export interface MethodologyEvidence {
  readonly methodologyId: string;
  readonly authority: FactorAuthority;
  readonly presence: Presence;
  readonly applicability: Applicability;         // DETERMINISTIC CONTRACT-CONSISTENCY (labeled below)
  readonly applicabilityIs: 'CONTRACT_CONSISTENCY'; // honesty tag: NOT a quality claim
  readonly semanticAppropriateness: 'UNCALIBRATED'; // the genuine "right method for this situation" — deferred, never gates
  readonly status: MethodStatus;
  readonly execution: Execution;
  readonly obligationsSatisfied: readonly string[];
  readonly obligationsMissing: readonly string[];
  readonly obligationsNotAssessable: readonly string[];
  readonly composition: CompositionRelation;
}

/** Assemble the methodology evidence object (raw lists preserved; no scalar). */
export function buildMethodologyEvidence(m: MethodSpec, x: MethodSituation, outputText: string, coPresentIds: readonly string[] = []): MethodologyEvidence {
  const presence = assessPresence(m, outputText);
  const applicability = assessContractApplicability(m, x);
  const exec = assessExecution(m, outputText);
  return {
    methodologyId: m.id, authority: m.authority,
    presence, applicability, applicabilityIs: 'CONTRACT_CONSISTENCY', semanticAppropriateness: 'UNCALIBRATED',
    status: deriveStatus(presence, applicability),
    execution: exec.execution, obligationsSatisfied: exec.obligationsSatisfied, obligationsMissing: exec.obligationsMissing, obligationsNotAssessable: exec.obligationsNotAssessable,
    composition: assessComposition(m, coPresentIds),
  };
}

/** Registry-wide sweep for a situation — surfaces REQUIRED_BUT_MISSING across all in-scope methods. */
export function sweepMethodologies(reg: MethodRegistry, x: MethodSituation, outputText: string): MethodologyEvidence[] {
  const candidates = reg.forDimension(x.standardDimension);
  const present = candidates.filter((m) => assessPresence(m, outputText) === 'PRESENT').map((m) => m.id);
  return candidates.map((m) => buildMethodologyEvidence(m, x, outputText, present.filter((id) => id !== m.id)));
}
