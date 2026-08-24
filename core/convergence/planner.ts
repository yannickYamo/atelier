// atelier/core/convergence/planner.ts — WHAT TO DO NEXT, AND WHAT UNCERTAINTY IT WOULD REDUCE.
//
// The controller says where the cycle stopped. This says what would move it, which is a different
// question and the one a user actually has. It is DETERMINISTIC: given the evidence, the hypotheses,
// the repair history, the qualification state and the budget, the next legal action follows.
//
// ─── IT MAY CHOOSE HOW TO INVESTIGATE. IT MAY NEVER CHOOSE WHAT GOOD MEANS. ────────────────────
//
// There is no action here that writes a StandardVersion, and `REQUEST_AUTHORITY` is the only route
// to one — it stops and asks. A planner that could mint a requirement to close a gap it diagnosed
// would be the optimizer editing its own objective, arriving through the one door this system leaves
// open on purpose: the door marked "the machine may choose the implementation".
//
// ─── AND IT DOES NOT ASK A MODEL WHETHER IT IS UNCERTAIN ───────────────────────────────────────
//
// Where the evidence cannot resolve which action is warranted, the answer is COLLECT_MORE_CONTEXTS
// or WAIT_FOR_ORGANIC_EVIDENCE — computed from what is missing, not elicited. Three instruments have
// now failed to self-report uncertainty; a fourth asking a model "are you sure about the whole
// controller" would repeat that at a larger scale.
//
// ─── DEV PROBES ARE NOT CERTIFICATION EVIDENCE, AND THE TYPE SAYS SO ───────────────────────────
//
// A probe this planner proposes exists to tell two failure hypotheses apart. It is DEV_PROBE by
// construction and `licenses`/`neverLicenses` travel with the action, because "an optimizer must not
// certify itself on the contexts it generated to improve itself" is a rule that fails silently if it
// lives only in a document.

import type { RequirementEvidence, Eligibility } from '../measurement/longitudinal.js';
import { eligibilityOf } from '../measurement/longitudinal.js';
import type { Symptom, FailureHypothesis, EvidenceNeed } from './symptom.js';
import { NEED_SEMANTICS } from './symptom.js';
import type { Gates } from './state-machine.js';
import type { DiagnosisRoute } from '../diagnosis/diagnose.js';

export type ActionKind =
  | 'WAIT_FOR_ORGANIC_EVIDENCE'
  | 'RUN_DEV_PROBE'
  | 'FORM_REPAIR_CANDIDATE'
  | 'COLLECT_MORE_CONTEXTS'
  | 'COLLECT_QUALIFICATION_EVIDENCE'
  | 'BUILD_DISTINCTIVENESS_BASELINE'
  | 'REQUEST_AUTHORITY'
  | 'REPAIR_DELIVERY'
  | 'STOP';

/**
 * What a probe would have to separate, and how its outcomes map back to the hypotheses.
 *
 * The design machinery for actually building one already exists and is recovered rather than
 * rebuilt: `discovery/chain/discrimination-probe.ts` supplies `designPair` (two outputs on the same
 * case differing only in the property), `planProbeSides`/`sideImbalance` (counterbalancing),
 * `blindPair`, and — the load-bearing one — `manipulationVerified`, which checks the two arms
 * ACTUALLY differ in the intended property. A probe whose arms do not differ discriminates nothing
 * and would return a confident answer about the wrong thing.
 */
export interface ExpectedDiscrimination {
  readonly betweenHypotheses: readonly string[];
  /** what each possible outcome would rule out */
  readonly outcomeMeaning: Readonly<Record<string, string>>;
  /** carried so a caller cannot forget the class of evidence this produces */
  readonly evidenceClass: 'DEV_PROBE';
  readonly neverLicenses: string;
}

export interface NextAction {
  readonly kind: ActionKind;
  /** the uncertainty this action exists to reduce — REQUIRED, never decorative */
  readonly reduces: EvidenceNeed | 'NONE';
  readonly why: string;
  readonly eligibility: Eligibility;
  readonly discrimination: ExpectedDiscrimination | null;
  /** what satisfying this action would license, and what it never would */
  readonly licenses: string;
  readonly neverLicenses: string;
}

export interface PlanInput {
  readonly evidence: RequirementEvidence;
  readonly symptom: Symptom;
  readonly route: DiagnosisRoute;
  readonly hypotheses: readonly FailureHypothesis[];
  readonly gates: Gates;
  readonly budgetExhausted?: boolean;
  /** a candidate already exists and is waiting on a decision */
  readonly candidatePending?: boolean;
}

const need = (n: EvidenceNeed) => NEED_SEMANTICS[n];

/**
 * Choose the next legal action.
 *
 * ORDER IS THE POLICY, and it is the same ordering discipline the controller uses: the physical
 * problem before the semantic one, the missing evidence before the missing instrument, and the
 * authority question before anything that would need authority to act on.
 */
export function planNext(input: PlanInput): NextAction {
  const { evidence: e, symptom: s, route, gates: g } = input;
  const { level, why: elWhy } = eligibilityOf(e, g.minIndependentContexts);

  if (input.budgetExhausted) {
    return { kind: 'STOP', reduces: 'NONE', eligibility: level, discrimination: null,
      why: 'the budget for this cycle is spent. Nothing was concluded and nothing was changed.',
      licenses: 'nothing', neverLicenses: 'a conclusion drawn from a cycle that did not finish' };
  }

  // ── DELIVERY FIRST. A semantic action on an artefact that was never served repairs the wrong thing.
  if (route === 'DELIVERY_FAILURE' || e.delivery === 'FAILING') {
    return { kind: 'REPAIR_DELIVERY', reduces: 'NONE', eligibility: level, discrimination: null,
      why: 'what was served did not match what was compiled. Until that is true, every behavioural reading is a reading of something else.',
      licenses: 'behavioural observation to mean anything at all', neverLicenses: 'a conclusion about the standard' };
  }

  // ── AUTHORITY BEFORE ANYTHING THAT WOULD NEED IT ────────────────────────────────────────────
  if (route === 'STANDARD_GAP') {
    return { kind: 'REQUEST_AUTHORITY', reduces: 'NONE', eligibility: level, discrimination: null,
      why: 'nothing you have authorised covers this, so there is no implementation to repair and no probe that could establish one. What is missing is a decision about what good means, and that is yours alone.',
      licenses: 'a new StandardVersion, if you mint one',
      neverLicenses: 'this planner writing one — no action here mutates a standard' };
  }

  // ── NOTHING TO WORK FROM ────────────────────────────────────────────────────────────────────
  if (e.behavior === 'UNOBSERVED') {
    return { kind: 'WAIT_FOR_ORGANIC_EVIDENCE', reduces: 'NEED_MORE_INDEPENDENT_CONTEXTS',
      eligibility: level, discrimination: null,
      why: e.delivery === 'PROVEN'
        ? 'the rule reaches the model every time. Whether it is FOLLOWED has never been observed, and delivery evidence cannot answer that.'
        : 'nothing has observed this requirement yet',
      licenses: need('NEED_MORE_INDEPENDENT_CONTEXTS').licenses,
      neverLicenses: need('NEED_MORE_INDEPENDENT_CONTEXTS').neverLicenses };
  }

  // ── COMPETING HYPOTHESES: SEPARATE THEM BEFORE ACTING ON EITHER ─────────────────────────────
  if (input.hypotheses.length > 1) {
    return {
      kind: 'RUN_DEV_PROBE', reduces: 'NEED_DISCRIMINATING_PROBE', eligibility: level,
      why: `${input.hypotheses.length} hypotheses explain this symptom equally well. Changing the implementation now would test whichever happened to be written first.`,
      discrimination: {
        betweenHypotheses: input.hypotheses.map((h) => h.failingMechanism),
        outcomeMeaning: Object.fromEntries(input.hypotheses.map((h) => [h.failingMechanism, h.disconfirmedBy])),
        evidenceClass: 'DEV_PROBE',
        neverLicenses: need('NEED_DISCRIMINATING_PROBE').neverLicenses,
      },
      licenses: need('NEED_DISCRIMINATING_PROBE').licenses,
      neverLicenses: need('NEED_DISCRIMINATING_PROBE').neverLicenses };
  }

  // ── AN UNSTABLE READING IS NOT A MISS ───────────────────────────────────────────────────────
  if (s.kind === 'UNSTABLE_WITHIN_CONTEXT') {
    return { kind: 'RUN_DEV_PROBE', reduces: 'NEED_DISCRIMINATING_PROBE', eligibility: level,
      why: 'the same task was judged both ways. Whether the skill or the instrument is wobbling is not settled by running the same thing again.',
      discrimination: { betweenHypotheses: ['the skill is inconsistent', 'the instrument is inconsistent'],
        outcomeMeaning: { 'the skill is inconsistent': 'a stable instrument disagreeing across generations',
          'the instrument is inconsistent': 'the same generation judged differently on re-observation' },
        evidenceClass: 'DEV_PROBE', neverLicenses: need('NEED_DISCRIMINATING_PROBE').neverLicenses },
      licenses: need('NEED_DISCRIMINATING_PROBE').licenses,
      neverLicenses: need('NEED_DISCRIMINATING_PROBE').neverLicenses };
  }

  // ── ONE HYPOTHESIS, AND EVIDENCE ENOUGH TO TRY IT ───────────────────────────────────────────
  //
  // This is the correction that separates candidate eligibility from promotion eligibility. A single
  // authoritative miss earns a reversible experiment. It does not earn a promotion, and the
  // difference is stated on the action rather than left to the reader.
  if (input.hypotheses.length === 1 && !input.candidatePending
      && (level === 'CANDIDATE_ELIGIBLE' || level === 'PROMOTION_ELIGIBLE')) {
    return { kind: 'FORM_REPAIR_CANDIDATE', reduces: 'NONE', eligibility: level, discrimination: null,
      why: `${elWhy} A candidate changes nothing until it is promoted and is undone by moving a pointer, so the cost of being wrong is a build.`,
      licenses: 'a reversible SkillVersion, and an evaluation of it',
      neverLicenses: level === 'PROMOTION_ELIGIBLE' ? 'promotion without the remaining gates'
        : 'promotion — one authoritative miss cannot distinguish an implementation problem from an occasion' };
  }

  if (level === 'HYPOTHESIS_ELIGIBLE') {
    return { kind: 'COLLECT_QUALIFICATION_EVIDENCE', reduces: 'NEED_OBSERVER_QUALIFICATION',
      eligibility: level, discrimination: null,
      why: `${elWhy} The miss may be real; nothing here can yet tell that from an instrument that is wrong.`,
      licenses: need('NEED_OBSERVER_QUALIFICATION').licenses,
      neverLicenses: need('NEED_OBSERVER_QUALIFICATION').neverLicenses };
  }

  // ── A CANDIDATE IS WAITING: THE GATES DECIDE, IN ORDER ──────────────────────────────────────
  if (input.candidatePending) {
    if (g.observerPermission !== 'CERTIFY') {
      return { kind: 'COLLECT_QUALIFICATION_EVIDENCE', reduces: 'NEED_OBSERVER_QUALIFICATION',
        eligibility: level, discrimination: null,
        why: `a candidate is waiting and nothing can say whether it is better. The observer holds ${g.observerPermission}.`,
        licenses: need('NEED_OBSERVER_QUALIFICATION').licenses,
        neverLicenses: need('NEED_OBSERVER_QUALIFICATION').neverLicenses };
    }
    if (g.distinctiveness !== 'EARNED') {
      return { kind: 'BUILD_DISTINCTIVENESS_BASELINE', reduces: 'NEED_DISTINCTIVENESS_BASELINE',
        eligibility: level, discrimination: null,
        why: `the candidate could be better on the rule and worse at being yours, and nothing is watching for that (${g.distinctiveness}).`,
        licenses: need('NEED_DISTINCTIVENESS_BASELINE').licenses,
        neverLicenses: need('NEED_DISTINCTIVENESS_BASELINE').neverLicenses };
    }
    if (!g.comparisonPowered) {
      return { kind: 'COLLECT_MORE_CONTEXTS', reduces: 'NEED_MORE_INDEPENDENT_CONTEXTS',
        eligibility: level, discrimination: null,
        why: 'the comparison cannot resolve a difference this size on the contexts it has',
        licenses: need('NEED_MORE_INDEPENDENT_CONTEXTS').licenses,
        neverLicenses: need('NEED_MORE_INDEPENDENT_CONTEXTS').neverLicenses };
    }
  }

  // ── NOTHING RESOLVED IT. That is an answer, computed rather than elicited. ───────────────────
  return { kind: 'COLLECT_MORE_CONTEXTS', reduces: 'NEED_MORE_INDEPENDENT_CONTEXTS',
    eligibility: level, discrimination: null,
    why: `the evidence does not resolve which action is warranted: ${elWhy}`,
    licenses: need('NEED_MORE_INDEPENDENT_CONTEXTS').licenses,
    neverLicenses: need('NEED_MORE_INDEPENDENT_CONTEXTS').neverLicenses };
}

/** One paragraph a person reads. */
export function describeAction(a: NextAction): string {
  let out = `  next:      ${a.kind}${a.reduces === 'NONE' ? '' : `  (reduces ${a.reduces})`}\n`
    + `             ${a.why}\n`
    + `             eligibility: ${a.eligibility}\n`;
  if (a.discrimination) {
    out += `             it would separate:\n`;
    for (const h of a.discrimination.betweenHypotheses) out += `               - ${h}\n`;
    out += `             evidence class ${a.discrimination.evidenceClass} — ${a.discrimination.neverLicenses}\n`;
  }
  return out;
}
