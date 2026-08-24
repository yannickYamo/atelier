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
 * Stage 3 — taste discovery + active boundary learning + the terminal assembly.
 * The softest layer (voice, clarity, insight, decisiveness, narrative, anti-genericness).
 * A model may DISCOVER candidate taste factors; discovery grants NO authority — every
 * hypothesis is DERIVED_UNRATIFIED and can never be load-bearing until expert boundary
 * labels + ratification (the stage-0 law 4 / assignPriority cap).
 *
 * Pure/deterministic aggregation. The DISCOVERY (proposing factors) and the LABELING
 * (expert judgment) are EXTERNAL INPUTS — the aggregation stage owns the representation + the deterministic
 * fold of {golden recurrence, discrimination, boundary, counter} into TasteFactorEvidence,
 * then ranks via assignPriority and assembles the SkillStandardBlueprint (folding stage 2
 * methodology evidence). No LLM, no scalar, no autonomous mutation (Phase 2).
 */
import type { ConstructScope } from './construct-scope.js';
import type { Predicate } from './taste-factor.js';
import {
  assignPriority, buildBlueprint, EMPTY_EVIDENCE,
  type TasteFactorEvidence, type FactorConfidence, type SkillStandardBlueprint, type BlueprintRequirement, type ImplementationSurface
} from './taste-factor-evidence.js';
import type { MethodologyEvidence } from './methodology-evidence.js';

/** A model-proposed taste factor — a HYPOTHESIS about the standard, never a requirement. */
export interface TasteFactorHypothesis {
  readonly proposedId: string;
  readonly description: string;            // "expert appears to prefer concise directional recommendations"
  readonly constructScope: ConstructScope;
  readonly appliesWhen: readonly Predicate[]; // conditional — taste is Q(y|x,S_u)
  readonly provenance: { readonly proposedBy: string; readonly fromGoldens: readonly string[] };
}

// ── External evidence inputs (per context — conditional) ──
export interface GoldenObservation { readonly contextId: string; readonly applicable: boolean; readonly present: boolean; }

/**
 * One discrimination probe's result.
 *
 * ─── WHY TWO IDENTIFIERS ────────────────────────────────────────────────────────
 *
 * `contextId` identifies the PROBE. `contextFamilyId` identifies the INDEPENDENT UNIT, and
 * promotion counts families — never probes.
 *
 * Without the split, a system that can mint probes can manufacture its own promotion evidence:
 *   "pricing case A" / "pricing case A, slightly reworded" / "pricing case A with a different
 *   company name" would count as three discriminating contexts and carry a factor to CORE on what
 *   is really one observation. That is pseudo-replication, and it is exactly the move an optimizer
 *   discovers when the counting rule is the thing it is scored on.
 *
 * `contextFamilyId` MUST be derived from PROVENANCE — the fixture or golden the probe was built
 * from — and must never be emitted by the model that writes the probe. A model-assigned family is
 * a model-assigned promotion budget. (Doctrine: rules for typed state, semantic judgment for prose.)
 */
export interface DiscriminationObservation {
  /** This probe. Unique per probe. */
  readonly contextId: string;
  /** The independent unit. Provenance-derived, never model-emitted. Promotion counts THESE. */
  readonly contextFamilyId: string;
  /** true = preference moved WITH the factor; false = against it; null = verified no-difference (scope). */
  readonly preferenceMovedWithFactor: boolean | null;
}
export type BoundaryLevel = 'TOO_LITTLE' | 'ACCEPTABLE' | 'TOO_MUCH' | 'INDIFFERENT';
export interface BoundaryLabel { readonly contextId: string; readonly preferredLevel: BoundaryLevel; } // expert verdict near the boundary

/** A boundary probe the system generates for the expert to label (active boundary learning). */
export interface BoundaryProbe {
  readonly factorId: string;
  readonly contextId: string;
  readonly variants: readonly { readonly level: Exclude<BoundaryLevel, 'INDIFFERENT'>; readonly ref: string }[];
}

/**
 * The DERIVATION RULE for confidence. Exported so it can be asserted against hand-declared values
 * (F5): `shipped-standards.ts` writes `confidence:` as literals encoding a reviewed reading of the
 * sealed labels, and a literal that silently disagrees with the rule is drift nobody would notice.
 * The test asserts they agree; authority stays with the reviewed literals.
 *
 * NOTE the asymmetry, and it is deliberate: only DISCRIMINATION can reach SUPPORTED. Boundary
 * labels contribute at the EMERGING rung and no further, at any count.
 */
export function confidenceFrom(discrimContexts: number, boundaryContexts: number): FactorConfidence {
  if (discrimContexts >= 2 && boundaryContexts >= 1) return 'SUPPORTED';
  if (discrimContexts >= 1 || boundaryContexts >= 1) return 'EMERGING';
  return 'UNDERIDENTIFIED';
}
const distinct = (xs: readonly { contextId: string }[]): number => new Set(xs.map((x) => x.contextId)).size;

/**
 * Distinct INDEPENDENT UNITS among discrimination observations (F4). Counts `contextFamilyId`, so N
 * rewordings of one case count once. This is the only counting rule the promotion ladder reads.
 */
const distinctFamilies = (xs: readonly DiscriminationObservation[]): number =>
  new Set(xs.map((x) => x.contextFamilyId)).size;
const families = (xs: readonly DiscriminationObservation[]): string[] => [...new Set(xs.map((x) => x.contextFamilyId))];

/**
 * Deterministic fold of external observations into the FOUR SEPARATE channels. `ratified`
 * (default false) reflects whether the expert has ratified the hypothesis — until then the
 * authority stays DERIVED_UNRATIFIED and the factor cannot be load-bearing.
 */
export function aggregateTasteFactorEvidence(
  h: TasteFactorHypothesis,
  obs: { readonly golden?: readonly GoldenObservation[]; readonly discrimination?: readonly DiscriminationObservation[]; readonly boundary?: readonly BoundaryLabel[] },
  ratified = false,
): TasteFactorEvidence {
  const golden = obs.golden ?? [], discrimination = obs.discrimination ?? [], boundary = obs.boundary ?? [];
  const applicable = golden.filter((g) => g.applicable);
  const recurrence = { supporting: applicable.filter((g) => g.present).length, contradicting: 0, distinctContexts: distinct(applicable), applicableContexts: applicable.length };

  const movedWith = discrimination.filter((d) => d.preferenceMovedWithFactor === true);
  const movedAgainst = discrimination.filter((d) => d.preferenceMovedWithFactor === false);
  // F4: the promoting channel counts FAMILIES, not probes. N rewordings of one case count once.
  const disc = { supporting: movedWith.length, contradicting: movedAgainst.length, distinctContexts: distinctFamilies(movedWith) };

  // boundary SUPPORT = expert cares (prefers ACCEPTABLE). INDIFFERENT is a SCOPE signal
  // (the factor doesn't matter IN THAT CONTEXT) — NOT global counter-evidence. Only a
  // preference that moved AGAINST the factor is genuine disagreement (Q(y|x,S_u), not Q(y|S_u)).
  const cares = boundary.filter((b) => b.preferredLevel === 'ACCEPTABLE');
  const indifferentBoundary = boundary.filter((b) => b.preferredLevel === 'INDIFFERENT');
  // F6: a VERIFIED no-difference pick is scope information and now reaches the scope channel. It
  // previously reached nothing at all — the module documented it as scope and then discarded it, so
  // a factor preferred here and explicitly not-cared-about there could never read as scope-limited.
  // Void probes never arrive here: `foldPairAnswer` withholds an observation for INVALID_PROBE.
  const indifferentDiscrimination = discrimination.filter((d) => d.preferenceMovedWithFactor === null);
  const boundarySupport = { supporting: cares.length, contradicting: 0, distinctContexts: distinct(cares) };
  const counter = { supporting: movedAgainst.length, contradicting: 0, distinctContexts: distinctFamilies(movedAgainst) }; // moved-against ONLY
  const preferredCtx = new Set<string>([...movedWith.map((d) => d.contextFamilyId), ...cares.map((b) => b.contextId)]);
  const indifferentCtx = new Set<string>([
    ...indifferentBoundary.map((b) => b.contextId),
    ...indifferentDiscrimination.map((d) => d.contextFamilyId),
  ]);

  return {
    tasteFactorId: h.proposedId, scope: h.constructScope,
    authorityStatus: ratified ? 'EXPERT_RATIFIED' : 'DERIVED_UNRATIFIED',
    goldenRecurrence: recurrence.applicableContexts > 0 ? recurrence : EMPTY_EVIDENCE,
    expertPreferenceDiscrimination: disc,
    boundarySupport,
    counterEvidence: counter,
    contextsObserved: distinct(golden),
    contextsDiscriminative: disc.distinctContexts,
    contextsPreferred: preferredCtx.size,
    contextsIndifferent: indifferentCtx.size,
    confidence: confidenceFrom(disc.distinctContexts, boundarySupport.distinctContexts),
    provenance: {
      goldenContexts: [...new Set(applicable.map((g) => g.contextId))],
      discriminationContexts: families(movedWith),
      boundaryContexts: [...new Set(cares.map((b) => b.contextId))],
      counterContexts: families(movedAgainst)
    }
  };
}

/**
 * ANTI-CIRCULARITY (audit item 4): a boundary probe must DISTINGUISH the hypothesis, not
 * DEMONSTRATE it. A falsifiable probe presents variants across the factor's range (≥2
 * distinct levels) so the expert can reveal INDIFFERENCE / dispreference — i.e. the probe
 * can falsify "this factor is load-bearing." A single-level probe only confirms.
 */
export function isFalsifiableProbe(p: BoundaryProbe): boolean {
  return new Set(p.variants.map((v) => v.level)).size >= 2;
}

/** Which boundary probes still need expert labels for a hypothesis to become ratifiable. */
export function probesNeeded(_h: TasteFactorHypothesis, ev: TasteFactorEvidence): boolean {
  // more boundary sampling when under-identified OR discrimination unresolved (proxy/authority contested)
  return ev.confidence !== 'SUPPORTED' || ev.counterEvidence.supporting > 0;
}

// ── terminal assembly: fold taste + methodology into one blueprint ──
const METHOD_SURFACE: ImplementationSurface = 'STRUCTURAL_METHODOLOGY';

/** Methodology evidence → blueprint requirements. REQUIRED_BUT_MISSING is a load-bearing gap. */
function methodologyRequirements(scope: ConstructScope, mes: readonly MethodologyEvidence[]): BlueprintRequirement[] {
  return mes
    .filter((m) => m.status === 'REQUIRED_AND_PRESENT' || m.status === 'REQUIRED_BUT_MISSING')
    .map((m): BlueprintRequirement => ({
      tasteFactorId: `method:${m.methodologyId}`,
      // a REQUIRED method (authored/ratified authority) is CORE; a DERIVED one can't be (capped ADVISORY)
      priority: m.authority === 'DERIVED_UNRATIFIED' ? 'ADVISORY' : 'CORE',
      scope, recommendedSurface: METHOD_SURFACE,
      rationale: [`methodology ${m.status}${m.status === 'REQUIRED_BUT_MISSING' ? ' (omission — load-bearing gap)' : ''}; execution=${m.execution}`],
      evidence: { goldenRecurrence: EMPTY_EVIDENCE, expertPreferenceDiscrimination: EMPTY_EVIDENCE, boundarySupport: EMPTY_EVIDENCE, counterEvidence: EMPTY_EVIDENCE }
    }));
}

const RANK: Record<BlueprintRequirement['priority'], number> = { CORE: 0, IMPORTANT: 1, CONTEXTUAL: 2, ADVISORY: 3 };

/**
 * The terminal deliverable — ranked taste + methodology requirements + ratification candidates.
 *
 * `methodologyScope` is REQUIRED whenever there is methodology evidence. It used to be
 * borrowed from `tasteFactors[0]` — whichever taste factor happened to sort first — falling back to
 * an EMPTY scope when there were none. Methodology requirements have nothing to do with taste factor
 * zero, and the empty-scope fallback fired on a real IMPROVE case: no taste factors discovered, three
 * authored methods found absent. An unstated scope now throws instead of silently inventing one.
 */
export function assembleSkillStandardBlueprint(
  standardVersion: string, skillId: string,
  tasteFactors: readonly { evidence: TasteFactorEvidence; recommendedSurface: ImplementationSurface }[],
  methodologyEvidence: readonly MethodologyEvidence[] = [],
  methodologyScope?: ConstructScope,
): SkillStandardBlueprint {
  if (methodologyEvidence.length > 0 && !methodologyScope) {
    throw new Error(
      `assembleSkillStandardBlueprint(${skillId}): ${methodologyEvidence.length} methodology evidence item(s) supplied with no `
      + 'methodologyScope. The scope of a methodology requirement is the caller\'s to state — inheriting it from an unrelated '
      + 'taste factor (or defaulting to empty) produces a requirement scoped by accident.',
    );
  }
  const tasteBp = buildBlueprint(standardVersion, skillId, tasteFactors);
  const merged = [...tasteBp.requirements, ...methodologyRequirements(methodologyScope ?? { standardDimensions: [] }, methodologyEvidence)]
    .slice().sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  return { standardVersion, skillId, requirements: merged, ratificationCandidates: tasteBp.ratificationCandidates };
}

export { assignPriority };
