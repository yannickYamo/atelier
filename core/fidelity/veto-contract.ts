// DELIBERATELY DARK — FROZEN NEGATIVE EVIDENCE.
//
// v3's construct was not established (V3_CONSTRUCT_NOT_ESTABLISHED). This module and veto-sensor.ts
// are kept, unwired and untuned, as the record of what was tried and what it cost. They are NOT
// part of AUTONOMOUS_LOOP_READY and are not reported as delivered.
//
// atelier/core/fidelity/veto-contract.ts — THE v3 CONTRACT. A CONTRACT, NOT AN INSTRUMENT.
//
// This module contains NO prompt, makes NO inference call and is wired to nothing. It states the
// semantics v3 must satisfy, in a form that can be checked, so that "what does NO_VETO mean" has one
// answer that a test can hold us to rather than a paragraph everyone remembers differently.
//
// ─── WHY THE QUESTION CHANGES, AND NOT JUST THE WORDING ────────────────────────────────────────
//
// Two observer versions produced ZERO abstentions across 126 observations — v1 0/33, v2 0/33 on the
// same set, v2 0/60 on a fresh universe. v2 existed solely to make UNCERTAIN reachable: it added
// four explicit triggers and the line "UNCERTAIN IS A REAL ANSWER AND IS OFTEN THE CORRECT ONE". It
// moved one verdict in thirty-three.
//
// Source inspection rules out the mechanical explanations. The schema permits UNCERTAIN and its
// `evidence` field is nullable, so abstaining costs nothing structurally. The parser DEFAULTS to
// UNCERTAIN on unparseable output, so a mechanical failure would inflate abstention rather than
// suppress it. Nothing downstream coerces it.
//
// What remains is the shape of the question. The instrument is asked "Did this output follow this
// rule?" and told "Decide now." — a binary with an escape hatch. To take the hatch the model must
// first form a confident second-order judgement, that THE RULE ITSELF does not decide the case, and
// it is never asked for that judgement. Asked a first-order question, it answers the first-order
// question. Abstention was offered as a refusal to answer rather than as an answer.
//
// So v3 inverts the burden. The question becomes: **can you exhibit concrete support that this
// output breaks this rule?** VETO is now the claim that must be paid for in evidence, NO_VETO is the
// default that claims nothing, and ESCALATE is a first-class answer to a question actually posed —
// "is the evidence sufficient to decide safely?" — rather than an escape from one.
//
// ─── THE ASYMMETRY IS THE SAFETY PROPERTY ──────────────────────────────────────────────────────
//
// `NO_VETO` MUST NOT MEAN SATISFIED. It means no block was established. An instrument whose negative
// answer carried a positive claim would be a certifier wearing a blocker's contract, and would earn
// CERTIFY-shaped trust from a VETO-shaped campaign. That is why this contract has no SATISFIED
// member at all: not as a discipline the sensor is asked to observe, but as a value it cannot reach.

/** What the sensor may say. Note what is absent. */
export type VetoVerdict =
  /** concrete support for a violation exists; the deterministic gate is asked to block */
  | 'VETO'
  /** no block was established. This is NOT a finding that the rule holds. */
  | 'NO_VETO'
  /** the evidence needed to decide safely is ambiguous, contradictory, or absent */
  | 'ESCALATE';

/**
 * How a violation is supported. The distinction is load-bearing because absence cannot be quoted.
 *
 * A rule like "do not end sections on aspirational language" is violated by something PRESENT and
 * can point at it. A rule like "ground abstract concepts in a concrete scenario first" is violated
 * by something MISSING, and demanding a span for that invites a fabricated quotation "proving"
 * absence — which is how a wording proxy gets rebuilt inside a semantic sensor.
 */
export type VetoEvidenceType =
  /** something in the output breaks the rule, and can be pointed at */
  | 'PRESENCE'
  /** the rule requires something the output does not contain, at a place it would have had to appear */
  | 'OMISSION'
  /** two parts of the output cannot both satisfy the rule */
  | 'CONTRADICTION';

export interface VetoEvidence {
  readonly requirementId: string;
  /**
   * THE CLAUSE OF THE FROZEN REQUIREMENT THAT AUTHORISES THIS BLOCK — verbatim from its statement.
   *
   * This closes a defect that a prompt instruction could not. In DEV the sensor vetoed an output
   * under g7 — a rule about analogies — because the piece was "only approximately 80 words, falling
   * far short of the required 400-word analysis section". The criterion came from the TASK BRIEF.
   * It was not a hallucination: it observed a real property of the output and enforced it under a
   * requirement that says nothing about length.
   *
   * A task may supply the context needed to interpret a requirement or locate evidence. It is never
   * independently enforceable unless the requirement delegates to it. Demanding the authorising
   * clause makes that checkable rather than hoped for: "400-word" is not a substring of g7, so a
   * veto grounded in the brief cannot produce one, and a veto that quotes g7's analogy clause while
   * reasoning about length leaves the mismatch on the record for a reviewer to see.
   */
  readonly authorisingClause: string;
  readonly evidenceType: VetoEvidenceType;
  /** REQUIRED for PRESENCE and CONTRADICTION: verbatim from the output. Null for OMISSION. */
  readonly outputSpan: string | null;
  /**
   * REQUIRED for OMISSION: where in the output the required thing would have had to appear, named
   * structurally ("the closing paragraph of the second section"), never quoted. An omission is a
   * claim about a location, not about text.
   */
  readonly locus: string | null;
  readonly rationale: string;
}

export interface VetoObservation {
  readonly verdict: VetoVerdict;
  /** present iff verdict is VETO — a block nobody can audit is not a block */
  readonly evidence: VetoEvidence | null;
  /** present iff verdict is ESCALATE — what could not be decided, and why */
  readonly escalationReason: string | null;
}

export interface ContractViolation { readonly field: string; readonly problem: string }

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * THE GOVERNING INVARIANT, as a function.
 *
 * A VETO must be authorised by the frozen requirement being evaluated. Checked by containment
 * rather than by judgement: the clause the sensor names must actually be in the requirement.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. Containment establishes PROVENANCE — the clause came from
 * the requirement and not from the task brief, which is the exact defect it was written to catch. It
 * establishes NOTHING about entailment: a sensor may quote g7's analogy clause verbatim and then
 * reason about word count underneath it, and this check will pass. Whether the rationale is actually
 * authorised by the clause is a question about SENSOR VALIDITY and belongs to qualification, not to a
 * deterministic guard. Building a semantic checker to close that gap would create a second unqualified
 * instrument judging the first.
 */
export function assertRequirementAuthorised(
  authorisingClause: string, requirementStatement: string,
): ContractViolation | null {
  const c = norm(authorisingClause);
  if (!c) return { field: 'authorisingClause', problem: 'a block that cannot name the clause authorising it is not authorised by the requirement — it is authorised by whatever the sensor happened to be thinking about' };
  if (c.length < 8) return { field: 'authorisingClause', problem: `"${authorisingClause}" is too short to identify a clause; a fragment matches many requirements and licenses none` };
  if (!norm(requirementStatement).includes(c)) {
    return { field: 'authorisingClause', problem: `"${authorisingClause}" does not appear in the requirement. A criterion the requirement does not state cannot authorise a block, however real the property it describes — this is the task-brief leak, caught.` };
  }
  return null;
}

/**
 * A quoted span must actually be in the output.
 *
 * Separate hole, found while closing the first: nothing checked that `outputSpan` was real, so a
 * fabricated quotation satisfied every other rule in this file.
 */
export function assertSpanIsReal(span: string, output: string): ContractViolation | null {
  return norm(output).includes(norm(span)) ? null
    : { field: 'outputSpan', problem: 'the quoted span does not appear in the output — a block resting on text nobody wrote is unauditable' };
}

/**
 * Structural check that an observation satisfies the contract. Deterministic; no judgement about
 * whether the sensor was RIGHT, only whether what it returned is a legal thing to have returned.
 *
 * Every rule here exists because its absence would let the sensor claim something it did not pay
 * for.
 */
export function checkContract(
  o: VetoObservation,
  /** supplied when available; the authorisation and span checks are skipped without them, and their
   *  absence is itself reported so a caller cannot quietly run the weaker check */
  against?: { readonly requirementStatement: string; readonly output: string },
): readonly ContractViolation[] {
  const bad: ContractViolation[] = [];

  if (o.verdict === 'VETO') {
    if (!o.evidence) {
      bad.push({ field: 'evidence', problem: 'a VETO with no evidence is an assertion, not an observation — the gate would block on something nobody can audit' });
    } else {
      const e = o.evidence;
      if (e.evidenceType === 'OMISSION') {
        if (e.outputSpan !== null) {
          bad.push({ field: 'outputSpan', problem: 'an OMISSION cannot be quoted: a span offered as proof that something is absent is either irrelevant or invented' });
        }
        if (!e.locus?.trim()) {
          bad.push({ field: 'locus', problem: 'an OMISSION must name where the required thing would have had to appear, or it is unfalsifiable' });
        }
      } else {
        if (!e.outputSpan?.trim()) {
          bad.push({ field: 'outputSpan', problem: `a ${e.evidenceType} violation must point at the text that breaks the rule` });
        }
      }
      if (!e.rationale?.trim()) bad.push({ field: 'rationale', problem: 'a block must say why this evidence breaks THIS rule' });

      if (against) {
        const unauthorised = assertRequirementAuthorised(e.authorisingClause, against.requirementStatement);
        if (unauthorised) bad.push(unauthorised);
        if (e.outputSpan) {
          const unreal = assertSpanIsReal(e.outputSpan, against.output);
          if (unreal) bad.push(unreal);
        }
      } else {
        bad.push({ field: 'against', problem: 'checked without the requirement and output, so neither the authorising clause nor the quoted span could be verified — this is the weaker check and says so' });
      }
    }
  }

  if (o.verdict === 'ESCALATE') {
    if (!o.escalationReason?.trim()) {
      bad.push({ field: 'escalationReason', problem: 'ESCALATE must say what could not be decided; without it, it is indistinguishable from silence and cannot be reviewed' });
    }
    if (o.evidence) {
      bad.push({ field: 'evidence', problem: 'ESCALATE carries no evidence of violation — attaching some would let an undecided case accumulate as if it were a block' });
    }
  }

  if (o.verdict === 'NO_VETO' && (o.evidence || o.escalationReason)) {
    bad.push({ field: 'evidence', problem: 'NO_VETO claims nothing and therefore carries nothing. Evidence attached to it would read as a positive finding that the rule holds, which this contract cannot express.' });
  }

  return bad;
}

/**
 * THE ONE THING THIS CONTRACT REFUSES TO SAY.
 *
 * Exposed as a function rather than left as a comment so that any future code tempted to read a
 * negative as a positive has to call something that returns false and says why.
 */
export function meansSatisfied(_v: VetoVerdict): false {
  return false;
}

export const NO_VETO_MEANING =
  'no block was established — NOT that the rule holds. The instrument that could say the rule holds '
  + 'is a different instrument, with a different contract and a different qualification campaign.';

/** Only APPLIES cases may enter the sensor; the sensor may never revise this. */
/**
 * Whether a requirement bears on an output, as judged by a SENSOR.
 *
 * Three types in this tree answer a question of this shape and they are deliberately not one type.
 * `SealedApplicability` in `conditional-fidelity.ts` is the expert's own ruling, sealed per context
 * before any output exists, so it is binary and AMBIGUOUS would be a contradiction. This one is a
 * machine's reading, so AMBIGUOUS is a real answer and `admitsToVetoSensor` is what refuses to
 * spend a veto on it. `MethodApplicability` in `methodology-evidence.ts` is a different question
 * entirely: whether a METHOD is required for a situation.
 *
 * They shared the name `Applicability` until it was clear that collapsing them would have thrown
 * away the distinction between what a person decided and what a model guessed.
 */
export type SensedApplicability = 'APPLIES' | 'DOES_NOT_APPLY' | 'AMBIGUOUS';

/**
 * The gate between the two inference acts.
 *
 * Applicability here is decided by a SENSOR, without the output in view, so it cannot look at a violation and
 * reclassify the requirement as not-applicable — removing its own failure from its own denominator.
 * AMBIGUOUS is terminal here and is never coerced: an applicability question nobody could answer is
 * not evidence that the rule applied, and it is not evidence that it did not.
 */
export function admitsToVetoSensor(a: SensedApplicability): { readonly admit: boolean; readonly why: string } {
  switch (a) {
    case 'APPLIES': return { admit: true, why: 'the requirement applies to this context' };
    case 'DOES_NOT_APPLY': return { admit: false, why: 'the requirement does not apply here, so there is nothing to block on' };
    case 'AMBIGUOUS': return { admit: false, why: 'applicability itself could not be decided — this routes to review, and must never be read as either applying or not applying' };
  }
}
