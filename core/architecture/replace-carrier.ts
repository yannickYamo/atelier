// atelier/core/architecture/replace-carrier.ts — LATERAL REPLACEMENT, NOT A LADDER.
//
// The escalation ladder in escalate.ts encodes PROSE < SELF_CHECK, and the carrier study falsified
// the assumption underneath any such ordering: a supposedly richer carrier (EXAMPLE) measurably
// underperformed plain prose for some requirements. Carriers are heterogeneous MECHANISMS —
// different ways a runtime can realize one requirement — not strengths. So the repair primitive is
// replacement: current implementation → failure evidence → one candidate alternative → the expert's
// blinded comparison → adopt or record the rejection.
//
// ─── DETERMINISTIC, NOT LEARNED, AND THE ORDERING IS RECORDED ─────────────────────────────────
//
// "Any unseen carrier" would make the compiler a roulette wheel; a learned policy is a research
// project this slice explicitly defers. The middle is a fixed, published ordering over the carriers
// a requirement's own TYPED PROPERTIES make legal, with repair memory (runtime-scoped — see
// repair-memory.ts) removing moves already rejected on evidence this strong. The chosen ordering is
// written into the REPAIR_PROPOSED event, so every candidate can answer "why this one".
//
// Eligibility from typed properties, never from materiality (materiality is semantic metadata and
// selects no carrier — the constraint this slice was amended to keep):
//   OUTPUT_CONTRACT  only when the rule carries an outputShape — a contract with no shape is empty
//   EXAMPLE          only when the rule carries a verbatim evidence span to cut the example from
//   PROSE, SELF_CHECK  always legal
//   NONE             never proposed — silence is not an implementation of a rule that missed

import type { Carrier, SkillArchitecture } from './compile.js';
import { roleFor } from './compile.js';
import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { assertFeedbackDidNotMutate, standardHashOf } from '../state/canonical-state.js';
import type { ServedMissEvidence, EscalateCarrier, EscalationRefusal } from './escalate.js';

/** The fixed ordering candidates are tried in. Position is precedence, nothing else. */
export const REPLACEMENT_ORDER: readonly Carrier[] = ['SELF_CHECK', 'PROSE', 'EXAMPLE', 'OUTPUT_CONTRACT'];

/**
 * Which carriers this requirement's own typed properties make legal.
 *
 * AN OUTPUT CONTRACT IS ENFORCEMENT, SO ONLY AN ENFORCED RULE MAY BE MOVED TO ONE. A contract is a
 * schema the provider must satisfy: the one carrier that cannot be read as guidance. Legality read
 * `outputShape` alone, so a PREFERRED rule with a shape — one the owner said an excellent output may
 * break — was a legal OUTPUT_CONTRACT move for `fix` and `optimize`, and a search could promote guidance
 * into a hard constraint while `gateRole` still said OBSERVE. `roleFor` is the one derivation of that
 * (REQUIRED, or authored, and confirmed); materiality still picks no carrier, it only bounds this one.
 */
export const eligibleCarriers = (r: Requirement): readonly Carrier[] =>
  REPLACEMENT_ORDER.filter((c) =>
    c === 'OUTPUT_CONTRACT' ? r.outputShape !== null && roleFor(r) === 'ENFORCE'
      : c === 'EXAMPLE' ? Boolean(r.evidence)
        : true);

/**
 * Propose ONE lateral replacement, or nothing. Same evidence contract as the ladder — one observed
 * miss, expert-confirmed — and the same refusals where the architecture cannot answer for it.
 * `alreadyRejected` is the runtime-scoped exclusion set from repair memory; the first eligible
 * carrier not in it is the candidate.
 */
export function proposeReplacement(
  ev: ServedMissEvidence, arch: SkillArchitecture, requirement: Requirement,
  alreadyRejected: ReadonlySet<Carrier>,
): EscalateCarrier | EscalationRefusal {
  const carrying = arch.components.filter((c) => c.carries.includes(ev.requirementId));
  if (carrying.length === 0) {
    return { refused: true, reason: `no component in architecture ${arch.architectureHash} carries ${ev.requirementId}; there is nothing to replace.` };
  }
  if (carrying.length > 1) {
    return { refused: true, reason: `${ev.requirementId} is carried by ${carrying.length} components; replacing one and not the others would leave the requirement in two places realized two ways.` };
  }
  const c = carrying[0];
  if (c.carrier !== ev.carrierAtServe) {
    return { refused: true, reason: `${ev.requirementId} was served at ${ev.carrierAtServe} but is now at ${c.carrier}. The implementation already changed; this evidence is about the one that ran.` };
  }
  const candidates = eligibleCarriers(requirement).filter((x) => x !== c.carrier && !alreadyRejected.has(x));
  if (!candidates.length) {
    return { refused: true, reason:
      `every legal alternative for ${ev.requirementId} (${eligibleCarriers(requirement).filter((x) => x !== c.carrier).join(', ') || 'none exist for its typed properties'}) `
      + `has been tried and rejected on evidence this strong. This miss is not an arrangement problem the compiler can answer — `
      + `if the rule itself reads wrong, that is a standard question: atelier amend.` };
  }
  const to = candidates[0];
  return {
    kind: 'ESCALATE_CARRIER', requirementId: ev.requirementId, from: c.carrier, to,
    becauseInvocation: ev.invocationId,
    rationale: `served at ${c.carrier} on invocation ${ev.invocationId} and the author confirmed the output missed it. `
      + `${to} is the first untried legal alternative under the fixed ordering [${REPLACEMENT_ORDER.join(' → ')}] — a different mechanism, not a "stronger" one`,
  };
}

/**
 * THE HARD INVARIANT OF IMPLEMENTATION REPAIR — Constraint B, as an assertion that throws.
 *
 * A repair may change how a standard is realized and nothing about what it says. Asserted where the
 * candidate is minted, so a code path that edited a statement, condition, materiality or authority
 * under a repair's name dies instead of shipping.
 *
 * THREE HASHES, NOT ONE COMPARED WITH ITSELF. Both call sites used to pass the standard they rendered
 * and `getStandard(candidate.standardVersionHash) ?? <that same standard>`: the candidate's hash was
 * copied from the rendered standard one line earlier, so the two were the same object and the check
 * could not fire. Now: the INCUMBENT's recorded standard (the version being repaired) must equal the
 * CANDIDATE's recorded standard, and the content the candidate was actually RENDERED from is
 * re-hashed, so an in-memory edit to a requirement between load and render is caught as well.
 */
export function assertStandardUnchanged(incumbent: { readonly standardVersionHash: string },
  candidate: { readonly standardVersionHash: string }, renderedFrom: StandardVersion): void {
  assertFeedbackDidNotMutate(incumbent as StandardVersion, candidate as StandardVersion);
  const recomputed = standardHashOf(renderedFrom);
  if (recomputed !== incumbent.standardVersionHash) {
    throw new Error(`STANDARD MUTATED BY REPAIR: the candidate was rendered from content hashing to ${recomputed}, `
      + `not the incumbent's standard ${incumbent.standardVersionHash}. A repair changes how a standard is carried, `
      + 'never what it says; a changed standard is minted by amend or confirm with a recorded reason.');
  }
}
