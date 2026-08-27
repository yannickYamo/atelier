// atelier/core/convergence/state-machine.ts — THE LOOP, AND THE NINE WAYS IT CAN HONESTLY END.
//
// The pieces exist: invocation, diagnosis, escalation, candidate, repair memory, evidence. What was
// missing is the thing that walks them and says WHY it stopped. Without it every halt looks the
// same, and "nothing happened" is indistinguishable from "the observer is unqualified" — which is
// the difference between a bug and a finding.
//
// ─── PROMOTE IS UNREACHABLE, AND THAT IS THE DESIGN ────────────────────────────────────────────
//
// Not disabled by a flag. `decide` cannot return PROMOTE unless every gate reports EARNED, and no
// gate reports EARNED today: no instrument holds VETO or CERTIFY, and the distinctiveness floor has
// been recovered and ported but has earned nothing on any standard. So the terminal state is
// reachable in code and unreachable in fact, and the reason is printed rather than implied.
//
// This is where SSO's acceptance rule is deliberately NOT copied. SSO accepts when the judge's wins
// exceed its losses on unlabeled validation — an unqualified CERTIFY permission held by the same
// instrument that produced the optimisation signal. Our own analysis marks that REFUSE. The gate
// list below is what refusing it costs: five separate authorisations, each earned separately.
//
// ─── AND NO PERMANENT HUMAN-IN-THE-LOOP LAW ────────────────────────────────────────────────────
//
// AUTHORITY_REQUIRED is a state reached when a gate has not been earned, not a standing requirement
// that a person approve each candidate. That was a temporary safety constraint and hardening it into
// architecture is a mistake already made once. When the gates are earned, the machine proceeds.

import type { RequirementEvidence } from '../measurement/longitudinal.js';
import type { ObserverPermission } from '../measurement/permission.js';
import type { DistinctivenessState } from '../distinctiveness/floor.js';

export type Phase =
  | 'MEASURE' | 'AGGREGATE' | 'DIAGNOSE' | 'SELECT_REPAIR_HYPOTHESIS'
  | 'MATERIALIZE_CANDIDATE' | 'EVALUATE';

export const PHASES: readonly Phase[] = [
  'MEASURE', 'AGGREGATE', 'DIAGNOSE', 'SELECT_REPAIR_HYPOTHESIS', 'MATERIALIZE_CANDIDATE', 'EVALUATE',
];

/** How a cycle ends. Every one of these is a truthful answer; only the first is a success. */
export type Terminal =
  | 'PROMOTE'
  | 'REJECT'
  | 'MORE_EVIDENCE'
  | 'OBSERVER_UNQUALIFIED'
  | 'DISTINCTIVENESS_UNQUALIFIED'
  | 'UNDERPOWERED'
  | 'BUDGET_LIMIT'
  | 'AUTHORITY_REQUIRED'
  | 'NO_LEGAL_REPAIR'
  /** the standard is being met on the evidence available — nothing to repair */
  | 'TARGET_REACHED'
  /**
   * A worthwhile improvement is EXCLUDED by the evidence. Legal only when the experiment had the
   * resolution to see one — otherwise the honest state is UNDERPOWERED. Conflating them is how a
   * search retires strategies it never tested.
   */
  | 'PLATEAU'
  /** what was served is not what was compiled; nothing semantic follows from it */
  | 'DELIVERY_FAILURE';

/** What the machine is allowed to assume. Every field defaults to the honest answer: not earned. */
export interface Gates {
  /** what the fidelity observer has earned for the requirements in play */
  readonly observerPermission: ObserverPermission;
  /**
   * The anti-collapse gate. Typed from the floor module rather than declared here, so the state the
   * gate can actually report and the state this machine expects cannot drift apart.
   */
  readonly distinctiveness: DistinctivenessState;
  /** whether the incumbent/candidate comparison is adequately powered for this decision */
  readonly comparisonPowered: boolean;
  /** independent contexts required before a repair may be justified at all */
  readonly minIndependentContexts: number;
  readonly budgetExhausted: boolean;
}

export const NOTHING_EARNED: Gates = {
  observerPermission: 'OBSERVE',
  // UNQUALIFIED, not MISSING: the mechanism was recovered and ported, and it has earned nothing.
  distinctiveness: 'UNQUALIFIED',
  comparisonPowered: false,
  minIndependentContexts: 2,
  budgetExhausted: false,
};

export interface CycleInput {
  readonly evidence: RequirementEvidence;
  readonly gates: Gates;
  /** the served package matched the compiled one on every evaluated invocation */
  readonly deliveryValid?: boolean;
  /** the comparison verdict, when a candidate was compared against the incumbent */
  readonly comparison?: 'IMPROVED' | 'PLATEAU' | 'REGRESSED' | 'INCONCLUSIVE' | 'UNDERPOWERED';
  /** a repair the machine could legally propose, from the dominance rule in repair-memory */
  readonly legalRepairAvailable: boolean;
  /** a candidate exists and has been run against the same task as the incumbent */
  readonly candidateEvaluated: boolean;
}

export interface Decision {
  readonly terminal: Terminal;
  readonly reachedPhase: Phase;
  readonly why: string;
  /** what would have to become true for the cycle to get further — the useful half */
  readonly blockedBy: readonly string[];
}

/**
 * Walk the cycle and stop at the first thing that is not true.
 *
 * ORDER IS THE POLICY. Evidence sufficiency is checked before repair legality, and repair legality
 * before any gate about promotion, because a system that reports OBSERVER_UNQUALIFIED when it in
 * fact has one observation from one context has told the user to go qualify an instrument when the
 * real problem is that nothing has happened yet.
 */
export function decide(input: CycleInput): Decision {
  const { evidence: e, gates: g } = input;
  const blocked: string[] = [];

  if (g.budgetExhausted) {
    return { terminal: 'BUDGET_LIMIT', reachedPhase: 'MEASURE',
      why: 'the budget for this cycle is spent; nothing was concluded and nothing was changed',
      blockedBy: ['a new budget'] };
  }

  // ── DELIVERY OUTRANKS EVERYTHING SEMANTIC ────────────────────────────────────────────────
  if (input.deliveryValid === false) {
    return { terminal: 'DELIVERY_FAILURE', reachedPhase: 'MEASURE',
      why: 'what was served is not what was compiled, so nothing observed about these outputs speaks to the standard',
      blockedBy: ['a rebuild so the installed artefact matches what was approved'] };
  }

  // ── MEASURE / AGGREGATE ──────────────────────────────────────────────────────────────────
  if (!e.observations) {
    return { terminal: 'MORE_EVIDENCE', reachedPhase: 'MEASURE',
      why: `${e.requirementId} has never been observed. There is nothing to diagnose.`,
      blockedBy: ['at least one invocation exercising this requirement'] };
  }
  if (e.independentContexts < g.minIndependentContexts) {
    return { terminal: 'UNDERPOWERED', reachedPhase: 'AGGREGATE',
      why: `${e.independentContexts} independent context(s) — repeated generations of the same task are not additional evidence, and ${e.observations} observation(s) here span only ${e.independentContexts}.`,
      blockedBy: [`observations from at least ${g.minIndependentContexts} independent contexts`] };
  }

  // ── DIAGNOSE ─────────────────────────────────────────────────────────────────────────────
  if (!e.recurringMissContexts) {
    // TARGET_REACHED only when the evidence could have SUPPORTED a claim. An unqualified instrument
    // finding no miss is not a finding that the standard is met — it is the absence of a finding.
    return e.claim.claimable
      ? { terminal: 'TARGET_REACHED', reachedPhase: 'DIAGNOSE',
          why: `no miss observed across ${e.independentContexts} independent context(s), by evidence that could have shown one`,
          blockedBy: [] }
      : { terminal: 'MORE_EVIDENCE', reachedPhase: 'DIAGNOSE',
          why: 'no miss has been observed — and by an instrument that has not earned the right to be believed, so this is the absence of a finding rather than a finding of absence',
          blockedBy: ['an observed miss, or an instrument whose silence means something'] };
  }

  // ── SELECT_REPAIR_HYPOTHESIS ─────────────────────────────────────────────────────────────
  if (e.prohibitions.length && !input.legalRepairAvailable) {
    return { terminal: 'NO_LEGAL_REPAIR', reachedPhase: 'SELECT_REPAIR_HYPOTHESIS',
      why: `every remaining transition for ${e.requirementId} is one you ruled out`,
      blockedBy: ['withdrawing a prohibition, or a different kind of change entirely'] };
  }
  if (!input.legalRepairAvailable) {
    return { terminal: 'NO_LEGAL_REPAIR', reachedPhase: 'SELECT_REPAIR_HYPOTHESIS',
      why: 'no repair is available that has not already been tried on evidence at least this strong',
      blockedBy: ['stronger evidence — more independent misses, more generations, or a qualified instrument'] };
  }

  // ── MATERIALIZE / EVALUATE ───────────────────────────────────────────────────────────────
  if (!input.candidateEvaluated) {
    return { terminal: 'MORE_EVIDENCE', reachedPhase: 'MATERIALIZE_CANDIDATE',
      why: 'a candidate exists but nothing has run it on the task that motivated it',
      blockedBy: ['an invocation of the candidate on the same task'] };
  }

  // ── PLATEAU: only when the experiment could have SEEN a worthwhile improvement ────────────
  if (input.comparison === 'PLATEAU') {
    return { terminal: 'PLATEAU', reachedPhase: 'EVALUATE',
      why: 'the comparison excludes a worthwhile improvement, and had the resolution to find one. This is a measured negative, not an unmeasured one.',
      blockedBy: [] };
  }
  if (input.comparison === 'UNDERPOWERED' || input.comparison === 'INCONCLUSIVE') {
    return { terminal: 'UNDERPOWERED', reachedPhase: 'EVALUATE',
      why: `the comparison is ${input.comparison} — it cannot distinguish a worthwhile improvement from none, which is not the same as there being none`,
      blockedBy: ['more independent contexts, or a larger effect'] };
  }

  // ── REGRESSED: MEASURED WORSE, AND THAT IS AN ANSWER RATHER THAN A MISSING ONE ────────────
  //
  // This branch was absent, and absent is not neutral here. Every other non-improving verdict has a
  // return above; without one, REGRESSED fell through to the promotion gates and was authorised on
  // exactly the same terms as IMPROVED. `REJECT` was declared in the terminal union and returned
  // from nowhere, which is what a missing branch looks like from the outside.
  //
  // It is the one verdict that must never reach the gates, because the gates ask whether the
  // evidence is good enough to adopt and this evidence is good enough to refuse.
  if (input.comparison === 'REGRESSED') {
    return { terminal: 'REJECT', reachedPhase: 'EVALUATE',
      why: 'the candidate was measured WORSE than the incumbent. That is a result, not a shortfall, '
        + 'so nothing here is blocked pending more evidence: this repair is refused.',
      blockedBy: [] };
  }

  // ── THE PROMOTION GATES. Each is separate, and each is earned separately. ─────────────────
  if (g.observerPermission !== 'CERTIFY') {
    blocked.push(`a fidelity observer qualified to CERTIFY (currently ${g.observerPermission})`);
  }
  if (g.distinctiveness !== 'EARNED') {
    blocked.push(`a distinctiveness / anti-collapse gate (currently ${g.distinctiveness})`);
  }
  if (!g.comparisonPowered) {
    blocked.push('an adequately powered incumbent/candidate comparison');
  }

  if (blocked.length) {
    // Which terminal is chosen names the FIRST unearned gate, so the report points somewhere.
    const terminal: Terminal = g.observerPermission !== 'CERTIFY' ? 'OBSERVER_UNQUALIFIED'
      : g.distinctiveness !== 'EARNED' ? 'DISTINCTIVENESS_UNQUALIFIED'
        : 'AUTHORITY_REQUIRED';
    return { terminal, reachedPhase: 'EVALUATE',
      why: `the candidate was evaluated, and the evaluation cannot authorise a promotion: ${blocked[0]}. `
        + `A negative result from an unqualified instrument is not a reason to reject either — it is a reason to say so.`,
      blockedBy: blocked };
  }

  return { terminal: 'PROMOTE', reachedPhase: 'EVALUATE',
    why: 'every gate reports earned authority for this decision', blockedBy: [] };
}

/**
 * The gates that are unreachable today, and why. Printed rather than discovered.
 *
 * Kept as a function over Gates rather than a constant so it cannot go stale against the real state
 * the moment something is earned.
 */
export function unreachableGates(g: Gates): readonly { gate: string; state: string; why: string }[] {
  const out: { gate: string; state: string; why: string }[] = [];
  if (g.observerPermission !== 'CERTIFY') {
    out.push({ gate: 'fidelity observer -> CERTIFY', state: g.observerPermission,
      why: 'v1 and v2 were never qualified; v3\'s construct was not established. Nothing holds VETO either.' });
  }
  if (g.distinctiveness !== 'EARNED') {
    out.push({ gate: 'distinctiveness / anti-collapse', state: g.distinctiveness,
      why: g.distinctiveness === 'MISSING'
        ? 'no instrument exists. Without it an optimizer can converge to bland while every other metric improves.'
        : 'the instrument exists and has earned nothing on this standard: no ratified dimensions, no frozen baseline, no false-alarm rate on this estimand. Recovering an instrument is not inheriting its qualification.' });
  }
  if (!g.comparisonPowered) {
    out.push({ gate: 'incumbent/candidate comparison', state: 'UNQUALIFIED',
      why: 'the comparative judge passes order-invariance per pair and has never been qualified against human preference.' });
  }
  return out;
}
