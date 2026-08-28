// atelier/core/contract/mechanism-exposure.ts — MAY A STUDY CLAIM TO TEST A CARRIER AT ALL?
//
// ─── THE NEAR MISS THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────
//
// A three-arm study was one ruling away from being fired on a direct-authored standard. On that
// path `materiality`, `realizationTolerance` and `outputShape` are all null and every requirement
// compiles to PROSE, so the carrier machinery could not have fired once. The result would have been
// the conditional renderer measured a second time and reported as the compiler.
//
// ─── CARRIER COUNT IS NOT EXPOSURE ─────────────────────────────────────────────────────────────
//
// "The standard contains a non-PROSE carrier" is not enough. A standard can carry an OUTPUT_CONTRACT
// on a requirement that none of the evaluation contexts invoke: carrier diversity on paper,
// experimental diversity of zero. Exposure asks whether the named mechanism can actually MOVE the
// number being reported, which is a different question and the one that matters.
//
// ─── FAILING THIS IS A RESULT, NOT AN OBSTACLE ─────────────────────────────────────────────────
//
// If no candidate passes, the reportable finding is "the available standards do not permit a valid
// test of carrier selection". That sentence is worth more than a study measuring something else.
// Nothing here has a lenient mode.

import type { Carrier } from '../architecture/compile.js';

export type ExposureConditionId =
  /** a named non-PROSE mechanism is actually selected for some requirement */
  | 'NAMED_MECHANISM_PRESENT'
  /** the requirement carrying it has authority — a machine's guess is not a standard */
  | 'TARGET_AUTHORITATIVE'
  /** the evaluation contexts invoke the requirement the mechanism carries */
  | 'CONTEXTS_EXERCISE_TARGET'
  /**
   * Whether the requirement applies is known WITHOUT reading the treatment's output.
   *
   * The trap: let a model decide "does R7 apply here", then use that label to score whether R7's
   * carrier helped. The applicability judgment and the outcome are then produced by the same kind
   * of instrument, and a null cannot be told apart from a judge disagreeing with itself. GENERAL
   * scope satisfies this trivially, which is why a GENERAL target is preferred.
   */
  | 'APPLICABILITY_INDEPENDENT'
  /** an endpoint exists that could observe the behaviour the mechanism is meant to change */
  | 'OUTCOME_OBSERVABLE'
  /** the control does NOT contain the target carrier, or there is no contrast */
  | 'CONTROL_LACKS_CARRIER'
  /**
   * The carrier reached the model. Materialised into the package is not delivered.
   *
   * Atelier ships EXAMPLE as `examples/<id>.md` and only concatenates it into the served bytes when
   * the context map admits it, so a conditional example can be WITHHELD at invocation. A null with
   * no delivery evidence cannot separate "examples do not help" from "the model never saw one".
   */
  | 'CARRIER_DELIVERED'
  /**
   * Target and ablation encode the SAME normative target.
   *
   * Otherwise the contrast is more-standard against less-standard rather than one realisation
   * against another, and a win says only that saying more helps.
   */
  | 'SEMANTIC_CLOSURE';

export const EXPOSURE_CONDITIONS: readonly ExposureConditionId[] = [
  'NAMED_MECHANISM_PRESENT', 'TARGET_AUTHORITATIVE', 'CONTEXTS_EXERCISE_TARGET',
  'APPLICABILITY_INDEPENDENT', 'OUTCOME_OBSERVABLE', 'CONTROL_LACKS_CARRIER',
  'CARRIER_DELIVERED', 'SEMANTIC_CLOSURE',
];

/** What a caller must establish. Every field is a fact about the run, never a hope about it. */
export interface ExposureFacts {
  readonly targetRequirementId: string;
  readonly targetCarrier: Carrier;
  /** the authority on the target requirement, as stored */
  readonly targetAuthority: string;
  /** GENERAL scope, a deterministic predicate, or human-sealed labels — not a model's opinion */
  readonly applicabilityBasis: 'GENERAL' | 'DETERMINISTIC' | 'HUMAN_SEALED' | 'MODEL_JUDGED';
  /** contexts whose obligations name the target requirement */
  readonly contextsExercisingTarget: number;
  readonly observationMode: string;
  /** carriers the control arm serves for the target requirement */
  readonly controlCarrier: Carrier;
  /** from the invocation record: did the target's artifact reach the served bytes? */
  readonly deliveredAtRuntime: boolean;
  /** target and ablation carry the same requirement ids with the same statements */
  readonly normativeSetsMatch: boolean;
}

export interface ExposureCheck {
  readonly id: ExposureConditionId;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExposureVerdict {
  readonly pass: boolean;
  readonly checks: readonly ExposureCheck[];
  readonly failed: readonly ExposureConditionId[];
}

const AUTHORITATIVE = new Set(['EXPERT_RATIFIED', 'EXPERT_AUTHORED', 'USER_ADOPTED']);

export function checkMechanismExposure(f: ExposureFacts): ExposureVerdict {
  const checks: ExposureCheck[] = [
    { id: 'NAMED_MECHANISM_PRESENT', pass: f.targetCarrier !== 'PROSE' && f.targetCarrier !== 'NONE',
      detail: `target carrier is ${f.targetCarrier}` },
    { id: 'TARGET_AUTHORITATIVE', pass: AUTHORITATIVE.has(f.targetAuthority),
      detail: `authority ${f.targetAuthority}` },
    { id: 'CONTEXTS_EXERCISE_TARGET', pass: f.contextsExercisingTarget > 0,
      detail: `${f.contextsExercisingTarget} contexts name ${f.targetRequirementId}` },
    { id: 'APPLICABILITY_INDEPENDENT', pass: f.applicabilityBasis !== 'MODEL_JUDGED',
      detail: `applicability basis ${f.applicabilityBasis}`
        + (f.applicabilityBasis === 'MODEL_JUDGED'
          ? ' — a model deciding whether the rule applies, then the same class of instrument scoring '
            + 'whether its carrier helped, cannot separate a null from a judge disagreeing with itself'
          : '') },
    { id: 'OUTCOME_OBSERVABLE', pass: f.observationMode !== 'HUMAN' && f.observationMode !== '',
      detail: `observation ${f.observationMode || 'none'}` },
    { id: 'CONTROL_LACKS_CARRIER', pass: f.controlCarrier !== f.targetCarrier,
      detail: `control serves ${f.controlCarrier}, target serves ${f.targetCarrier}` },
    { id: 'CARRIER_DELIVERED', pass: f.deliveredAtRuntime,
      detail: f.deliveredAtRuntime
        ? 'the target artifact is in the served bytes'
        : 'NOT in the served bytes — materialised is not delivered, and a null here would be unreadable' },
    { id: 'SEMANTIC_CLOSURE', pass: f.normativeSetsMatch,
      detail: f.normativeSetsMatch
        ? 'both arms carry the same requirement set'
        : 'the arms differ in WHAT is required, so this compares more-standard against less-standard' },
  ];
  const failed = checks.filter((c) => !c.pass).map((c) => c.id);
  return { pass: failed.length === 0, checks, failed };
}

export const describeExposure = (v: ExposureVerdict): string =>
  v.checks.map((c) => `  ${c.pass ? 'pass' : 'FAIL'}  ${c.id.padEnd(26)} ${c.detail}`).join('\n')
  + (v.pass
    ? '\n\nMECHANISM_EXPOSURE = PASS. This standard permits a valid test of the named carrier.'
    : '\n\nMECHANISM_EXPOSURE = FAIL. The reportable finding is that the available standards do not '
      + 'permit a valid test of carrier selection. Do not weaken the gate to obtain a study.');
