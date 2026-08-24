// atelier/core/diagnosis/diagnose.ts — WHAT KIND OF FAILURE IS THIS? NOT: IS THIS OUTPUT GOOD?
//
// The distinction in that title is the whole module. A quality judge asks whether an output is good
// and has no way to be wrong that anyone notices. A causal router asks which layer broke, and every
// answer it gives is checkable against something. The programme has already been burned by an
// evaluator whose apparent precision collapsed when it was finally measured prospectively, so this
// module never scores.
//
// ─── THE LLM PROPOSES A MAPPING. DETERMINISTIC RULES DECIDE THE ROUTE. ─────────────────────────
//
// A model is good at "which of these twelve sentences is the person complaining about?" and bad at
// being trusted with the consequence. So the call returns a TYPED MAPPING and nothing else, and the
// route is then computed from that mapping by rules anyone can read. There is no confidence
// threshold: a number from a model that has never been calibrated is not evidence, and turning one
// into an autonomous truth threshold is how an unqualified instrument acquires authority.
//
// Every ambiguity fails CLOSED to UNCERTAIN, which authorises nothing.

import type { StandardVersion, InvocationRecord, FeedbackRecord } from '../state/canonical-state.js';
import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';

export type DiagnosisRoute =
  /** the artefact that ran was not the artefact on record. Deterministic; no model is consulted. */
  | 'DELIVERY_FAILURE'
  /** an authoritative requirement already covers the complaint — the IMPLEMENTATION failed it */
  | 'IMPLEMENTATION_MISS'
  /** the standard does not contain this behaviour. Proposes; never edits. */
  | 'STANDARD_GAP'
  /** anything else. Fails closed: no transaction, no standard change, one targeted question. */
  | 'UNCERTAIN';

export interface Diagnosis {
  readonly route: DiagnosisRoute;
  /** set only on IMPLEMENTATION_MISS, and only to an id the standard actually contains */
  readonly requirementId: string | null;
  /** set only on STANDARD_GAP — a PROPOSAL for a human, never an edit */
  readonly proposedRequirement: string | null;
  /** set only on UNCERTAIN — the one thing worth asking for */
  readonly question: string | null;
  /** why this route, in one line, always */
  readonly reason: string;
}

/** What the model is allowed to say. Note there is no score and no confidence number. */
export interface CoverageMapping {
  readonly coverage: 'COVERED' | 'ABSENT' | 'AMBIGUOUS';
  readonly requirementIds: readonly string[];
  readonly proposedRequirement: string | null;
  readonly question: string | null;
  readonly reasoning: string;
}

/**
 * DELIVERY IS CHECKED FIRST, DETERMINISTICALLY, AND WITHOUT A MODEL.
 *
 * If the wrong bytes ran, every semantic reading of the output is a reading of the wrong artefact.
 * Asking a model "does the standard cover this complaint?" about output produced by a tampered
 * package would produce a confident, coherent, entirely misdirected answer — and would route a
 * serving bug into a taste repair.
 */
export function checkDelivery(inv: InvocationRecord): Diagnosis | null {
  // AN UNENFORCED CONTRACT IS A SERVING FAILURE, NOT A TASTE PROBLEM.
  //
  // Checked before the package hash because it is the subtler of the two and would otherwise never be
  // reached on a package whose bytes are fine — which is every instance of it. If the schema the
  // provider received is not the contract that was compiled, the output was generated under a
  // constraint nobody ratified, and reading it as evidence about the standard reads the wrong artefact.
  const c = inv.delivery.outputContract;
  if (c && !c.enforced) {
    return {
      route: 'DELIVERY_FAILURE',
      requirementId: null, proposedRequirement: null, question: null,
      reason: `the package carries an output contract at ${c.artifact} (${c.contractHash}) and the schema the provider received hashed to ${c.schemaHash}. The generation was not constrained by the ratified shape, so the output does not describe what the standard asks for.`,
    };
  }
  if (inv.delivery.matched) return null;
  return {
    route: 'DELIVERY_FAILURE',
    requirementId: null, proposedRequirement: null, question: null,
    reason: `the served package hashed to ${inv.delivery.servedPackageHash} but SkillVersion ${inv.skillVersionHash} claims ${inv.delivery.expectedPackageHash}. The implementation that ran is not the implementation on record, so nothing about the output describes the standard.`,
  };
}

/**
 * Convert a proposed mapping into a route. PURE. Every branch is a readable predicate.
 *
 * The invented-id branch is the important one: a model that names a requirement the standard does
 * not contain has not found coverage, it has hallucinated authority. That must fail closed rather
 * than degrade to "well, it meant something like this".
 */
export function routeFrom(m: CoverageMapping, v: StandardVersion): Diagnosis {
  const known = new Set(v.requirements.map((r) => r.requirementId));
  const named = m.requirementIds.filter((id) => known.has(id));
  const invented = m.requirementIds.filter((id) => !known.has(id));

  if (invented.length) {
    return {
      route: 'UNCERTAIN', requirementId: null, proposedRequirement: null,
      question: 'Which part of the output was wrong, and what should it have done instead?',
      reason: `the mapping named ${invented.join(', ')}, which ${v.standardVersionHash} does not contain. A requirement that is not in the standard cannot have been missed by an implementation of it.`,
    };
  }
  if (m.coverage === 'COVERED' && named.length === 1) {
    return {
      route: 'IMPLEMENTATION_MISS', requirementId: named[0], proposedRequirement: null, question: null,
      reason: `the standard already contains ${named[0]}, so this is the implementation failing an authorised requirement rather than the standard lacking one.`,
    };
  }
  if (m.coverage === 'COVERED' && named.length > 1) {
    // Not a scoring problem — a scope problem. Repairing several requirements off one complaint
    // spends specialization the evidence has not paid for, and the blast radius is unattributable.
    return {
      route: 'UNCERTAIN', requirementId: null, proposedRequirement: null,
      question: `Several rules could cover this (${named.join(', ')}). Which one did the output actually get wrong?`,
      reason: `${named.length} requirements were named for one complaint; a single observation cannot attribute a miss among them.`,
    };
  }
  if (m.coverage === 'ABSENT' && named.length === 0 && m.proposedRequirement) {
    return {
      route: 'STANDARD_GAP', requirementId: null, proposedRequirement: m.proposedRequirement, question: null,
      reason: 'no authorised requirement covers this. It is a proposed ADDITION to the standard, which only its owner may authorise — the implementation is not at fault and must not be repaired as though it were.',
    };
  }
  return {
    route: 'UNCERTAIN', requirementId: null, proposedRequirement: null,
    question: m.question ?? 'Which part of the output was wrong, and what should it have done instead?',
    reason: m.coverage === 'AMBIGUOUS'
      ? 'the complaint did not resolve to a requirement or to a clearly missing one.'
      : `mapping was ${m.coverage} with ${named.length} named requirement(s) — not a shape any route accepts.`,
  };
}

export const DIAGNOSER_SYSTEM = `You are shown an author's STANDARD (a numbered list of rules they own), one OUTPUT produced by a skill compiled from that standard, and the author's COMPLAINT about that output.

Decide ONE thing: does the standard ALREADY contain a rule that the output failed to follow?

- COVERED: exactly one listed rule covers the complaint. Give its id.
- ABSENT: no listed rule covers it. Propose the rule the author seems to want, in one sentence, in their voice.
- AMBIGUOUS: you cannot tell, or several rules could equally apply, or the complaint is too vague to attach to any rule.

Rules:
- You may ONLY name ids that appear in the standard. Never invent one.
- Judging whether the output is GOOD is not your task. Only whether a listed rule was missed.
- If the complaint could mean two different things, that is AMBIGUOUS. Say so rather than choosing.
- When AMBIGUOUS, give the ONE question whose answer would resolve it.`;

export const DIAGNOSER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    coverage: { type: 'string', enum: ['COVERED', 'ABSENT', 'AMBIGUOUS'] },
    requirementIds: { type: 'array', items: { type: 'string' } },
    proposedRequirement: { type: ['string', 'null'] },
    question: { type: ['string', 'null'] },
    reasoning: { type: 'string' },
  },
  required: ['coverage', 'requirementIds', 'proposedRequirement', 'question', 'reasoning'],
  additionalProperties: false,
};

/** The standard as the diagnoser sees it: ids and statements. No evidence spans, no provenance. */
export const standardForDiagnosis = (v: StandardVersion): string =>
  v.requirements.map((r) => `${r.requirementId}. ${r.statement}${/^GENERAL\b/i.test(r.appliesWhen.trim()) ? '' : ` (applies when: ${r.appliesWhen})`}`).join('\n');

export async function diagnose(
  client: InferenceClient, budget: Budget,
  v: StandardVersion, inv: InvocationRecord, fb: FeedbackRecord, estimateUsd = 0.05,
): Promise<Diagnosis> {
  const delivery = checkDelivery(inv);
  if (delivery) return delivery;   // deterministic, and before a model is asked anything

  const result = await spend(budget, estimateUsd, async () => {
    const r = await client.complete({
      stableBlock: DIAGNOSER_SYSTEM,
      variableBlock: `## THE STANDARD\n\n${standardForDiagnosis(v)}\n\n## THE TASK GIVEN\n\n${inv.input}\n\n## THE OUTPUT\n\n${inv.output}\n\n## THE COMPLAINT\n\n${fb.complaint}`,
      userMessage: 'Decide now.',
      toolName: 'emit_coverage', toolDescription: 'Emit whether the standard already covers the complaint.',
      schema: DIAGNOSER_SCHEMA, maxTokens: 1000,
    });
    return { value: r, cost: r.cost };
  });

  const m = result.json as CoverageMapping | null;
  if (!m) {
    return {
      route: 'UNCERTAIN', requirementId: null, proposedRequirement: null,
      question: 'Which part of the output was wrong, and what should it have done instead?',
      reason: 'the mapping call returned nothing parseable. An unreadable instrument authorises nothing.',
    };
  }
  return routeFrom({ ...m, requirementIds: m.requirementIds ?? [] }, v);
}
