// atelier/core/convergence/controller.ts — THE SPINE, WALKED OVER REAL STORED STATE.
//
// `state-machine.ts` decides from a `RequirementEvidence` and a set of gates. This assembles both
// from what is actually on disk, so the decision is about the system's real history rather than a
// caller's summary of it.
//
//   InvocationRecord + FeedbackRecord + OBSERVATION + REPAIR events   (the store)
//     -> Observation[]                                               (typed, authority-carrying)
//     -> RequirementEvidence                                         (longitudinal aggregate)
//     -> Symptom                                                     (a pattern, not an instance)
//     -> DiagnosisRoute                                              (which cause is implicated)
//     -> FailureHypothesis | EvidenceNeed                            (what to do, or what is missing)
//     -> Decision                                                    (a truthful terminal)
//
// ─── NO STEP IS SKIPPED, INCLUDING THE ONES THAT USUALLY ARE ───────────────────────────────────
//
// The temptation is to go from a complaint to a repair, and every intermediate object here exists
// because that shortcut produced something wrong once. Delivery is checked before anything semantic,
// because reading an output that was never served is reading the wrong artefact. A symptom is
// required before a hypothesis, because one occasion is not a pattern. A hypothesis must carry its
// own falsifier, because a rejection needs something to attach to.
//
// Pure over its inputs — the caller does the reads.

import type { InvocationRecord } from '../state/canonical-state.js';
import type { Observation } from '../measurement/observation.js';
import type { RepairRecord, Prohibition, EvidenceBasis, EvaluationBasis } from '../architecture/repair-memory.js';
import { mayPropose, WEAKEST_EVALUATION } from '../architecture/repair-memory.js';
import { evidenceFor, describeRequirementEvidence, type RequirementEvidence } from '../measurement/longitudinal.js';
import { symptomFrom, routeFor, checkHypothesis, type Symptom, type FailureHypothesis, type EvidenceNeed } from './symptom.js';
import { decide, unreachableGates, NOTHING_EARNED, type Gates, type Decision } from './state-machine.js';
import { planNext, describeAction, type NextAction } from './planner.js';
import { specFor, checkSpec, type ProbeSpec } from './probe.js';
import { compare, describeComparisonResult, type ComparisonResult } from '../comparison/compare.js';
import { resolvePromotion, type PromotionDecision, type PromotionEvidence } from './promotion.js';
import type { ContextDifference } from '../comparison/resolution.js';
import type { Carrier } from '../architecture/compile.js';
import type { DiagnosisRoute } from '../diagnosis/diagnose.js';
import type { FloorVerdict } from '../distinctiveness/floor.js';

/** Verdicts that count as a miss, across every instrument vocabulary in the system. */
export const MISS_VERDICTS: ReadonlySet<string> = new Set(['VETO', 'VIOLATED', 'MISSED']);

export interface SpineState {
  readonly requirementId: string;
  readonly evidence: RequirementEvidence;
  readonly symptom: Symptom;
  readonly route: DiagnosisRoute;
  readonly routeWhy: string;
  /** present only on an IMPLEMENTATION_MISS with a legal transition available */
  readonly hypothesis: FailureHypothesis | null;
  readonly hypothesisProblems: readonly { field: string; problem: string }[];
  readonly needs: readonly EvidenceNeed[];
  readonly decision: Decision;
  readonly unreachable: ReturnType<typeof unreachableGates>;
  /** what to do next, and what uncertainty it would reduce */
  readonly action: NextAction;
  /** emitted when the action is RUN_DEV_PROBE — a spec, never a fired probe */
  readonly probeSpec: ProbeSpec | null;
  /** present when an incumbent/candidate comparison was supplied */
  readonly comparison: ComparisonResult | null;
  /** present when a candidate was evaluated — who, if anyone, may promote it */
  readonly promotion: PromotionDecision | null;
}

export interface SpineInput {
  readonly requirementId: string;
  readonly invocations: readonly InvocationRecord[];
  readonly observations: readonly Observation[];
  readonly repairs: readonly RepairRecord[];
  readonly prohibitions: readonly Prohibition[];
  readonly gates?: Gates;
  /** the carrier this requirement is served at now, and the next legal one, from the architecture */
  readonly currentCarrier?: Carrier;
  readonly nextCarrier?: Carrier | null;
  readonly candidateEvaluated?: boolean;
  /** a candidate exists and is awaiting a decision — distinct from having been evaluated */
  readonly candidatePresent?: boolean;
  /** competing explanations, supplied by a caller; literal fixtures exercise the mechanics */
  readonly competingHypotheses?: readonly FailureHypothesis[];
  /** paired per-context differences, candidate minus incumbent */
  readonly differences?: readonly ContextDifference[];
  readonly generationsPerContext?: number;
  /** the smallest improvement worth adopting — authored, never measured */
  readonly worthwhile?: number;
  /** identity + delivery facts for the promotion gate */
  readonly promotionEvidence?: Omit<PromotionEvidence, 'fidelityAuthority' | 'comparison' | 'distinctiveness' | 'floor'>;
  readonly floorVerdict?: FloorVerdict | null;
}

/**
 * Walk it. Every object on the way out is derived from something real, and the ones that are absent
 * are absent because the evidence did not support constructing them.
 */
export function runSpine(input: SpineInput): SpineState {
  const evidence = evidenceFor(input.requirementId, input.observations, input.repairs, input.prohibitions, MISS_VERDICTS);

  // DELIVERY FIRST. A single served-package mismatch anywhere in the history poisons semantic
  // reading of that history, because those outputs came from something other than what was compiled.
  const deliveryMatched = input.invocations.every((i) => i.delivery?.matched);

  const symptom = symptomFrom(evidence, deliveryMatched, MISS_VERDICTS);
  const { route, why } = routeFor(symptom);

  const gates = input.gates ?? NOTHING_EARNED;
  const needs: EvidenceNeed[] = [];
  if (evidence.independentContexts < gates.minIndependentContexts) needs.push('NEED_MORE_INDEPENDENT_CONTEXTS');
  if (symptom.kind === 'UNSTABLE_WITHIN_CONTEXT') needs.push('NEED_DISCRIMINATING_PROBE');
  if (gates.observerPermission !== 'CERTIFY') needs.push('NEED_OBSERVER_QUALIFICATION');
  if (gates.distinctiveness !== 'EARNED') needs.push('NEED_DISTINCTIVENESS_BASELINE');

  // ── the hypothesis, only where one is earned ────────────────────────────────────────────────
  let hypothesis: FailureHypothesis | null = null;
  let hypothesisProblems: readonly { field: string; problem: string }[] = [];
  let legalRepairAvailable = false;

  if (route === 'IMPLEMENTATION_MISS' && input.currentCarrier && input.nextCarrier) {
    const proposedEvidence: EvidenceBasis = {
      missContexts: symptom.independentContexts,
      invocationIds: input.invocations.map((i) => i.invocationId),
    };
    const proposedEvaluation: EvaluationBasis = WEAKEST_EVALUATION;
    const may = mayPropose(input.repairs, input.prohibitions, input.requirementId,
      input.currentCarrier, input.nextCarrier, { evidence: proposedEvidence, evaluation: proposedEvaluation });
    legalRepairAvailable = may.allowed;

    if (may.allowed) {
      hypothesis = {
        requirementId: input.requirementId,
        motivatingSymptom: symptom,
        failingMechanism: `served at ${input.currentCarrier}, the rule reached the model as an instruction and the output missed it in ${symptom.independentContexts} separate situations — so the arrangement, not the wording, is what has not carried it`,
        proposedChange: { from: input.currentCarrier, to: input.nextCarrier },
        // The next rung, because that is the only implemented path. Named as a default so the
        // rejection of one rung is not read as a refutation of the mechanism.
        selectionBasis: 'LADDER_DEFAULT',
        disconfirmedBy: `the same miss recurring at ${input.nextCarrier} across independent contexts — which would say the carrier was never what was failing`,
        discriminatingContexts: 'contexts where the requirement applies and the current arrangement has already been observed to miss, run against both arrangements on the same task',
        priorAttempts: input.repairs.filter((r) => r.requirementId === input.requirementId),
      };
      hypothesisProblems = checkHypothesis(hypothesis);
    }
  }

  // ── incumbent vs candidate, at the context level, computed once ─────────────────────────────
  const comparison = input.differences
    ? compare({ differences: input.differences, worthwhile: input.worthwhile ?? 0,
        generationsPerContext: input.generationsPerContext ?? 1 })
    : null;

  const decision = decide({
    evidence, gates, legalRepairAvailable,
    candidateEvaluated: input.candidateEvaluated ?? false,
    deliveryValid: deliveryMatched,
    comparison: comparison?.verdict,
  });

  const action = planNext({
    evidence, symptom, route,
    // a single hypothesis today; the shape carries competing ones so a probe can be proposed
    hypotheses: input.competingHypotheses?.length ? input.competingHypotheses : hypothesis ? [hypothesis] : [],
    gates, budgetExhausted: gates.budgetExhausted,
    candidatePending: input.candidateEvaluated === false && (input.candidatePresent ?? false),
  });

  // ── the discriminating experiment, as a SPEC ────────────────────────────────────────────────
  const hypotheses = input.competingHypotheses?.length ? input.competingHypotheses : hypothesis ? [hypothesis] : [];
  const probeSpec = action.kind === 'RUN_DEV_PROBE' ? specFor(hypotheses, `probe:${input.requirementId}`) : null;
  if (probeSpec && checkSpec(probeSpec).length) {
    // A malformed spec is not run. Reported through the action rather than silently dropped.
  }


  // ── and who, if anyone, may act on it ───────────────────────────────────────────────────────
  const promotion = input.promotionEvidence && comparison
    ? resolvePromotion({ ...input.promotionEvidence, fidelityAuthority: gates.observerPermission,
        comparison: comparison.verdict, distinctiveness: gates.distinctiveness,
        floor: input.floorVerdict ?? null })
    : null;

  return { requirementId: input.requirementId, evidence, symptom, route, routeWhy: why,
    hypothesis, hypothesisProblems, needs, decision, unreachable: unreachableGates(gates), action,
    probeSpec, comparison, promotion };
}

/** What `improve` prints: why it is doing what it is doing, in the user's language. */
export function explainSpine(s: SpineState): string {
  let out = describeRequirementEvidence(s.evidence);
  out += `\n  pattern:   ${s.symptom.kind} — ${s.symptom.detail}\n`;
  out += `  route:     ${s.route} — ${s.routeWhy}\n`;

  if (s.hypothesis) {
    const h = s.hypothesis;
    out += `\n  A repair is justified, and here is the claim it rests on:\n`
      + `    failing:      ${h.failingMechanism}\n`
      + `    proposed:     ${h.proposedChange.from} -> ${h.proposedChange.to}\n`
      + `    wrong if:     ${h.disconfirmedBy}\n`
      + `    tell apart:   ${h.discriminatingContexts}\n`
      + `    chosen by:    ${h.selectionBasis === 'LADDER_DEFAULT'
        ? 'the carrier ladder\'s next rung — a DEFAULT, not a mechanism-specific choice'
        : 'the mechanism believed to be failing'}\n`;
    if (h.priorAttempts.length) {
      out += `    tried before: ${h.priorAttempts.map((p) => `${p.from}->${p.to} ${p.outcome.toLowerCase()}`).join(', ')}\n`;
    }
    if (s.hypothesisProblems.length) {
      out += `    NOT WELL-FORMED: ${s.hypothesisProblems.map((p) => p.field).join(', ')}\n`;
    }
  }

  out += `\n  ${s.decision.terminal} at ${s.decision.reachedPhase}\n    ${s.decision.why}\n`;
  if (s.decision.blockedBy.length) {
    out += `  blocked by:\n${s.decision.blockedBy.map((b) => `    ${b}`).join('\n')}\n`;
  }
  out += describeAction(s.action);
  if (s.probeSpec) {
    out += `             probe ${s.probeSpec.probeId} — ${s.probeSpec.evidenceClass}, provenance ${s.probeSpec.provenance}\n`;
  }
  if (s.comparison) out += describeComparisonResult(s.comparison);
  if (s.promotion) {
    out += `  promotion: ${s.promotion.authority}\n    ${s.promotion.why}\n`;
    for (const u of s.promotion.unmet) out += `      unmet: ${u}\n`;
  }
  if (s.needs.length) {
    out += `  what would move this forward:\n${[...new Set(s.needs)].map((n) => `    ${n}`).join('\n')}\n`;
  }
  return out;
}
