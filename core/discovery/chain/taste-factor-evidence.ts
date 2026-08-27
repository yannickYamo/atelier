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
 * Stage 0 (extension) — TasteFactorEvidence + SkillStandardBlueprint. The the discovery chain answer
 * to "which detected taste factors are LOAD-BEARING vs incidental?" (the gap the SSO
 * read surfaced). Pure types + a TRANSPARENT LEXICOGRAPHIC priority rule — NEVER a
 * collapsed weighted score (anti-AP_v1). Phase 1 only; no autonomous mutation.
 *
 * CONSUMER: the aggregation stage builds `TasteFactorEvidence` from the sensors' output and the
 * expert's boundary labels; `assignPriority()` ranks the factors; the terminal deliverable of the
 * discovery chain is a `SkillStandardBlueprint`.
 *
 * THE FOUR EVIDENCE CHANNELS ARE KEPT SEPARATE (the lesson being: proxy is not authority; an LLM
 * "this improves output" and an expert "this is exactly the generic thing I hate" must
 * NOT average — they are a disagreement requiring calibration). SSO's normalized
 * evidence-mass is borrowable ONLY for `goldenRecurrence` (blind to preference); the
 * load-bearing `expertPreferenceDiscrimination` channel needs scarce expert labels.
 */
import type { ConstructScope } from './construct-scope.js';
import type { FactorAuthority } from './taste-factor.js';

/** Raw counts only — never a rate or scalar at this layer. */
export interface EvidenceSummary {
  readonly supporting: number;
  readonly contradicting: number;
  readonly distinctContexts: number;
  /**
   * For goldenRecurrence: the DENOMINATOR is contexts where the factor was APPLICABLE,
   * NOT raw occurrences (reviewer audit). A factor appearing in 8/8 pricing goldens only
   * because all eight required pricing thresholds is not thereby CORE. Optional elsewhere.
   */
  readonly applicableContexts?: number;
}
const EMPTY: EvidenceSummary = { supporting: 0, contradicting: 0, distinctContexts: 0 };

/** Recurrence rate = appearances / APPLICABLE contexts; null when no applicable context (never a fabricated 0). */
export function recurrenceRate(e: EvidenceSummary): number | null {
  const denom = e.applicableContexts ?? 0;
  return denom === 0 ? null : e.supporting / denom;
}

export type FactorConfidence = 'UNDERIDENTIFIED' | 'EMERGING' | 'SUPPORTED';
export type FactorPriority = 'CORE' | 'IMPORTANT' | 'CONTEXTUAL' | 'ADVISORY';

export interface TasteFactorEvidence {
  readonly tasteFactorId: string;
  readonly scope: ConstructScope;
  readonly authorityStatus: FactorAuthority;
  // FOUR SEPARATE channels — never summed:
  readonly goldenRecurrence: EvidenceSummary;              // occurs in expert-authored high-quality examples (SSO-normalizable)
  readonly expertPreferenceDiscrimination: EvidenceSummary; // expert preference MOVES with the factor (load-bearing; scarce)
  readonly boundarySupport: EvidenceSummary;               // violating it produces expert-REJECTED output (defines the standard)
  readonly counterEvidence: EvidenceSummary;               // GENUINE disagreement ONLY (expert preference moved AGAINST) — NOT indifference
  readonly contextsObserved: number;
  readonly contextsDiscriminative: number;
  // Q(y|x,S_u), not Q(y|S_u): a factor preferred in some contexts and INDIFFERENT in others
  // is CONTEXTUAL (scope-limited), NOT globally contested. INDIFFERENT ≠ counter-evidence.
  readonly contextsPreferred?: number;
  readonly contextsIndifferent?: number;
  readonly confidence: FactorConfidence;
  /** PROVENANCE (audit item 5): the source context/case ids behind each channel, so a
   * Blueprint requirement traces back to specific expert labels / goldens / failures —
   * answering "why is this factor CORE?" without "the compiler classified it that way." */
  readonly provenance?: {
    readonly goldenContexts: readonly string[];
    readonly discriminationContexts: readonly string[];
    readonly boundaryContexts: readonly string[];
    readonly counterContexts: readonly string[];
  };
}

export interface PriorityDecision {
  readonly priority: FactorPriority;
  readonly rationale: readonly string[];
  /** the raw channels, always preserved alongside the categorical verdict. */
  readonly channels: Pick<TasteFactorEvidence, 'goldenRecurrence' | 'expertPreferenceDiscrimination' | 'boundarySupport' | 'counterEvidence'>;
}

/**
 * TRANSPARENT LEXICOGRAPHIC priority. Order: (1) HARD INVARIANT — a DERIVED_UNRATIFIED
 * factor can NEVER be load-bearing (CORE/IMPORTANT) → capped at ADVISORY; (2) authority
 * + SUPPORTED confidence + broad discriminative replication + boundary evidence, no
 * unresolved counter-evidence → CORE; (3) same but narrower → IMPORTANT; (4) discriminative
 * only under specific conditions → CONTEXTUAL; (5) recurrence-only / contested / underidentified
 * → ADVISORY. NO numeric weighting — every step is an auditable predicate.
 */
export function assignPriority(e: TasteFactorEvidence): PriorityDecision {
  const rationale: string[] = [];
  const channels = { goldenRecurrence: e.goldenRecurrence, expertPreferenceDiscrimination: e.expertPreferenceDiscrimination, boundarySupport: e.boundarySupport, counterEvidence: e.counterEvidence };
  const derived = e.authorityStatus === 'DERIVED_UNRATIFIED';
  const contested = e.counterEvidence.supporting > 0;   // GENUINE disagreement (moved-against) only
  const preferredSomewhere = (e.contextsPreferred ?? 0) >= 1 || e.expertPreferenceDiscrimination.supporting >= 1;
  const scopeLimited = (e.contextsIndifferent ?? 0) >= 1 && preferredSomewhere; // Q(y|x): preferred here, not there
  const supported = e.confidence === 'SUPPORTED';
  const discriminativeBroad = e.contextsDiscriminative >= 2 && e.expertPreferenceDiscrimination.supporting >= 2;
  const discriminativeAny = e.contextsDiscriminative >= 1 && e.expertPreferenceDiscrimination.supporting >= 1;
  const hasBoundary = e.boundarySupport.supporting >= 1;

  let priority: FactorPriority;
  if (!derived && supported && discriminativeBroad && hasBoundary && !contested && !scopeLimited) {
    priority = 'CORE'; rationale.push('authority ratified; SUPPORTED; discriminative across ≥2 contexts; boundary-defined; uncontested; not scope-limited');
  } else if (scopeLimited && !contested) {
    priority = 'CONTEXTUAL'; rationale.push('preferred in some contexts, indifferent in others → scope-limited (Q(y|x), not global)');
  } else if (!derived && supported && (discriminativeBroad || hasBoundary) && !contested) {
    priority = 'IMPORTANT'; rationale.push('authority ratified; SUPPORTED; discriminative-or-boundary; uncontested');
  } else if (discriminativeAny && !contested) {
    priority = 'CONTEXTUAL'; rationale.push('discriminative under specific conditions only');
  } else {
    priority = 'ADVISORY'; rationale.push(contested ? 'contested (proxy/authority disagreement) — needs calibration' : 'recurrence-only or underidentified');
  }

  // HARD INVARIANT: a DERIVED_UNRATIFIED hypothesis is never a REQUIREMENT (CORE/IMPORTANT/
  // CONTEXTUAL are all scoped requirements). It is surfaced for ratification, never load-bearing.
  if (derived && priority !== 'ADVISORY') {
    rationale.push('DERIVED_UNRATIFIED cannot be load-bearing without authority evidence → capped at ADVISORY (ratification candidate)');
    priority = 'ADVISORY';
  }
  return { priority, rationale, channels };
}

// ── Skill Standard Blueprint — the discovery chain's TERMINAL deliverable ──
export type ImplementationSurface = 'STRUCTURAL_METHODOLOGY' | 'BEHAVIORAL_REQUIREMENT' | 'CONTEXT_SCOPED_CAPABILITY' | 'DELIVERY_TASTE';

export interface BlueprintRequirement {
  readonly tasteFactorId: string;
  readonly priority: FactorPriority;
  readonly scope: ConstructScope;
  readonly recommendedSurface: ImplementationSurface;
  readonly rationale: readonly string[];
  readonly evidence: PriorityDecision['channels'];   // raw channels preserved (never a scalar)
}

export interface SkillStandardBlueprint {
  readonly standardVersion: string;
  readonly skillId: string;
  /** ranked CORE → IMPORTANT → CONTEXTUAL → ADVISORY; ties keep input order (stable). */
  readonly requirements: readonly BlueprintRequirement[];
  /** DERIVED_UNRATIFIED factors surfaced for the expert to ratify — NEVER auto-promoted. */
  readonly ratificationCandidates: readonly string[];
}

const RANK: Record<FactorPriority, number> = { CORE: 0, IMPORTANT: 1, CONTEXTUAL: 2, ADVISORY: 3 };

export function buildBlueprint(
  standardVersion: string, skillId: string,
  factors: readonly { evidence: TasteFactorEvidence; recommendedSurface: ImplementationSurface }[],
): SkillStandardBlueprint {
  const decided = factors.map((f) => ({ f, d: assignPriority(f.evidence) }));
  const requirements = decided
    .map(({ f, d }): BlueprintRequirement => ({ tasteFactorId: f.evidence.tasteFactorId, priority: d.priority, scope: f.evidence.scope, recommendedSurface: f.recommendedSurface, rationale: d.rationale, evidence: d.channels }))
    .slice()
    .sort((a, b) => RANK[a.priority] - RANK[b.priority]); // stable: equal priority keeps input order
  const ratificationCandidates = decided
    .filter(({ f }) => f.evidence.authorityStatus === 'DERIVED_UNRATIFIED' && (f.evidence.contextsDiscriminative >= 1 || f.evidence.boundarySupport.supporting >= 1))
    .map(({ f }) => f.evidence.tasteFactorId);
  return { standardVersion, skillId, requirements, ratificationCandidates };
}

export { EMPTY as EMPTY_EVIDENCE };
