// atelier/core/contract/repair.ts — THE ONLY DOOR AN OPTIMIZER MAY COME THROUGH.
//
// The optimizer is about to become the most dangerous writer in this system. Everything else here
// either proposes to a person or records what happened; this changes what a model is served, and it
// does so without anyone reading the result first.
//
// Two things therefore hold, and both are checked rather than intended.
//
// ─── ONE: ONLY AN IMPLEMENTATION MISS MAY REPAIR AN IMPLEMENTATION ─────────────────────────────
//
// `diagnose.ts` routes a failure to one of four places, and only one of them is about the
// arrangement. A STANDARD_GAP means the standard does not contain the behaviour — repairing the
// implementation there teaches the skill to do something nobody authorised. A DELIVERY_FAILURE means
// the wrong bytes ran, so every reading of the output is a reading of the wrong artefact. UNCERTAIN
// means nothing resolved. Escalating on any of those attributes a change to evidence that does not
// support it, and the first is the one that quietly writes a standard.
//
// ─── TWO: A REPAIR MAY MOVE BYTES AND MAY NOT MOVE THE TARGET ──────────────────────────────────
//
// A candidate must carry the identical StandardVersion. Not an equal one, not a rebuilt one — the
// same hash, over the same requirements, with the same authority, materiality, applicability text
// and realization tolerance on every one. The hash makes this cheap to check and the check is still
// written out, because `standardVersionHash` is a claim the caller passes in and a claim is not a
// verification.
//
// ─── AND BARE IS NOT HERE ──────────────────────────────────────────────────────────────────────
//
// Nothing in this module can see the control arm. What to repair is a function of the standard and
// of what the implementation did, never of the gap to a bare model. A rule the runtime already
// satisfies is still a rule the implementation must carry, because the next binding may not satisfy
// it and the standard did not stop being the target.

import { createHash } from 'node:crypto';
import type { StandardVersion } from '../state/canonical-state.js';
import type { SkillArchitecture } from '../architecture/compile.js';
import type { DiagnosisRoute } from '../diagnosis/diagnose.js';
import type { ObligationKind } from './obligation.js';
import { proposeEscalation, type ServedMissEvidence, type EscalateCarrier, type EscalationRefusal }
  from '../architecture/escalate.js';

/** Routes that may cause an implementation to change. Exactly one. */
export const REPAIRABLE_ROUTES: readonly DiagnosisRoute[] = ['IMPLEMENTATION_MISS'];

/**
 * FAILURES ESCALATION CAN ACTUALLY FIX, AND THE ONES IT WOULD MAKE WORSE.
 *
 * The only repair this system knows is to carry a requirement HARDER — prose to self-check, and so
 * on up the ladder. That helps two kinds of failure: a behaviour that was supposed to appear and did
 * not, and a prohibition that was violated, where a check against the finished draft is exactly what
 * catches it.
 *
 * It is the wrong direction for over-application. A SHOULD_NOT_APPLY case fails when a conditional
 * rule was invoked where its condition did not hold, and escalating a rule that is already
 * over-applying makes it more prominent and more likely to fire again. This is not a
 * speculative worry: the pricing study measured compilation preserving WHAT to say and losing WHEN
 * NOT to say it, and the dilution study measured added rule load degrading a model's ability to tell
 * applicable from inapplicable. Escalating here would be spending both findings in the wrong
 * direction while reporting a repair.
 *
 * A BOUNDARY case has no correct answer by construction, so nothing about it can be a miss. An
 * INTERACTION names two requirements and cannot attribute the failure to either.
 *
 * Those failures are real and worth reporting. They are an APPLICABILITY problem, and this system
 * has no repair for one — which is a gap to state rather than a gap to paper over with the repair it
 * happens to own.
 */
export const ESCALATION_FIXES: readonly ObligationKind[] =
  ['SHOULD_FIRE', 'SHOULD_NOT_FIRE', 'OUTPUT_SHAPE'];

export interface RepairRefused { readonly refused: true; readonly reason: string }

/**
 * May this diagnosis touch the implementation at all?
 *
 * Separated from the escalation itself so the authority question is answered before the mechanics
 * are considered, and so it can be tested without an architecture.
 */
export function admitsRepair(route: DiagnosisRoute): RepairRefused | { readonly refused: false } {
  if (REPAIRABLE_ROUTES.includes(route)) return { refused: false };
  const why: Record<string, string> = {
    STANDARD_GAP: 'the standard does not contain this behaviour. Repairing the implementation here '
      + 'would teach the skill to do something nobody authorised — it is a proposal for its owner, '
      + 'not a change to make.',
    DELIVERY_FAILURE: 'the artefact that ran was not the artefact on record, so this output says '
      + 'nothing about the arrangement. Fix delivery first; any repair now targets a version nobody '
      + 'served.',
    UNCERTAIN: 'nothing resolved. A repair attributed to an unresolved diagnosis is a change with no '
      + 'evidence behind it.',
  };
  return { refused: true, reason: why[route] ?? `route ${route} does not authorise an implementation change.` };
}

/** The requirement fields a candidate may not move. Hashed so the check is one comparison. */
export const normativeHash = (v: StandardVersion): string =>
  createHash('sha256').update(JSON.stringify(
    [...v.requirements]
      .map((r) => [r.requirementId, r.statement, r.appliesWhen, r.kind, r.authority,
        r.materiality, r.realizationTolerance, r.provenance])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  )).digest('hex').slice(0, 16);

/**
 * The candidate is built from the same target as the incumbent.
 *
 * Both checks are kept. The hash comparison is what a content-addressed store already guarantees;
 * the field-level one is what survives somebody constructing a StandardVersion by hand and copying
 * a hash across, which is exactly how an immutability guarantee gets bypassed without anyone lying.
 */
export function assertSameTarget(incumbent: StandardVersion, candidate: StandardVersion): void {
  if (incumbent.standardVersionHash !== candidate.standardVersionHash) {
    throw new Error(
      `REPAIR CHANGED THE TARGET: candidate is built from ${candidate.standardVersionHash} and the `
      + `incumbent from ${incumbent.standardVersionHash}. An optimizer may change how a standard is `
      + 'carried and may never change what it is.');
  }
  const a = normativeHash(incumbent); const b = normativeHash(candidate);
  if (a !== b) {
    throw new Error(
      'REPAIR CHANGED THE TARGET: the two standards share a hash but not their requirements. Some '
      + 'field that decides what the standard MEANS — a statement, a condition, a kind, an authority, '
      + 'a materiality or a tolerance — differs between them.');
  }
}

export interface RepairProposal {
  readonly operation: EscalateCarrier;
  readonly route: DiagnosisRoute;
  readonly why: string;
}

/**
 * Propose the one repair this system knows how to make, or refuse with a reason.
 *
 * The route is checked BEFORE the architecture is consulted. Asking "can this arrangement be
 * escalated" first and "is this failure the kind that authorises a change" second would produce a
 * well-formed operation for a diagnosis with no standing, and a well-formed operation is exactly the
 * kind of thing a caller applies.
 */
export function proposeRepair(
  route: DiagnosisRoute,
  obligation: ObligationKind,
  evidence: ServedMissEvidence,
  arch: SkillArchitecture,
): RepairProposal | RepairRefused {
  const admitted = admitsRepair(route);
  if (admitted.refused) return admitted;

  if (!ESCALATION_FIXES.includes(obligation)) {
    const why: Partial<Record<ObligationKind, string>> = {
      SHOULD_NOT_APPLY: 'a conditional rule was applied where its condition did not hold. The only '
        + 'repair here is to carry it HARDER, which makes an over-applying rule more prominent and '
        + 'more likely to fire again. This is an applicability problem and this system has no repair '
        + 'for one; reporting that is more useful than spending the repair it happens to own.',
      BOUNDARY: 'a boundary case has no correct answer by construction, so nothing about it is a miss '
        + 'and there is nothing to repair. What it records is which way the implementation went.',
      INTERACTION: 'the case names two requirements and cannot attribute the failure to either. '
        + 'Escalating one of them would spend a change on a guess.',
    };
    return { refused: true, reason: why[obligation]
      ?? `a ${obligation} failure is not the kind escalation fixes.` };
  }

  const op: EscalateCarrier | EscalationRefusal = proposeEscalation(evidence, arch);
  if ('refused' in op) return { refused: true, reason: op.reason };

  return {
    operation: op,
    route,
    why: `${route} on ${evidence.requirementId}: ${op.rationale}`,
  };
}
