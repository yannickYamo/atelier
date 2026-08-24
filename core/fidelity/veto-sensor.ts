// DELIBERATELY DARK — FROZEN NEGATIVE EVIDENCE. See veto-contract.ts.
//
// atelier/core/fidelity/veto-sensor.ts — v3. TWO INFERENCE ACTS, AND THE SECOND CANNOT RUN ALONE.
//
// `veto-contract.ts` states what a verdict may mean. This is the instrument that produces one.
//
// ─── THE GATE IS A TYPE, NOT A CONVENTION ──────────────────────────────────────────────────────
//
// v2 separated applicability from behaviour and then the Stage-0 harness called `observeBehavior`
// directly, so the behaviour prompt asserted that relevance "has ALREADY been established" when
// nothing had established it. That was a real defect and fixing the one script would have left the
// door open for every future caller.
//
// So `observeVeto` cannot be called with a requirement. It can only be called with an `Admitted`,
// and the only way to obtain one is `observeApplicability` returning APPLIES. The brand is a module-
// private symbol, so no caller outside this file can construct the token — the Stage-0 bug is now
// unrepresentable rather than corrected.
//
// ─── AND THE QUESTION IS DIFFERENT, WHICH IS THE POINT ─────────────────────────────────────────
//
// v1 and v2 produced ZERO abstentions across 126 observations. Both asked "did this output follow
// this rule?" and offered UNCERTAIN as an escape. To take that escape the instrument had to form a
// confident second-order judgement — that the rule itself does not decide the case — which it was
// never asked for. Asked a first-order question, it answered the first-order question.
//
// This asks a different first-order question: **can you exhibit concrete support that this output
// breaks this rule?** VETO is now the claim that costs something; NO_VETO claims nothing; and
// ESCALATE is a direct answer to a question genuinely posed — is a plausible violation visible
// without evidence sufficient to act on it?
//
// That is a hypothesis about why the abstention control never engaged, and it is being tested on
// spent DEV data, not asserted. The leading cause was TASK_FORMULATION; PARSER/DEFAULT is ruled out
// at source; PROMPT_SEMANTICS may contribute. If v3 also fails to reach ESCALATE, the hypothesis is
// wrong and that is the finding.
//
// NO TARGET ESCALATE RATE. An instrument tuned to abstain more would prove only that it can be made
// to abstain. What matters is whether abstention lands on cases that are actually undecidable.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { Requirement } from '../state/canonical-state.js';
import type { Applicability, VetoObservation, VetoEvidence } from './veto-contract.js';
import { checkContract } from './veto-contract.js';

export const V3_VERSION = 'atelier-veto-sensor-v3';

/** Module-private. A caller outside this file cannot produce one, so the gate cannot be bypassed. */
const ADMITTED = Symbol('admitted');

export interface Admitted {
  readonly [ADMITTED]: true;
  readonly requirement: Requirement;
  readonly applicability: 'APPLIES';
  readonly reason: string;
}

export type ApplicabilityOutcome =
  | { readonly admitted: Admitted; readonly applicability: 'APPLIES'; readonly reason: string }
  | { readonly admitted: null; readonly applicability: 'DOES_NOT_APPLY' | 'AMBIGUOUS'; readonly reason: string };

export const APPLICABILITY_SYSTEM = `You are given a TASK someone was asked to do, and ONE rule an author holds.

You are NOT shown the output. That is deliberate: whether a rule APPLIES to a task cannot depend on
what the answer happened to contain, or an instrument could look at a violation and decide the rule
was not relevant after all.

Decide only whether this rule could bear on this task:

- APPLIES: the task calls for work of the kind this rule governs.
- DOES_NOT_APPLY: the task cannot produce the situation the rule is about.
- AMBIGUOUS: you cannot tell from the task alone.

AMBIGUOUS is a real answer. It is not a weaker APPLIES.`;

export const APPLICABILITY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    applicability: { type: 'string', enum: ['APPLIES', 'DOES_NOT_APPLY', 'AMBIGUOUS'] },
    reason: { type: 'string' },
  },
  required: ['applicability', 'reason'], additionalProperties: false,
};

export async function observeApplicability(
  client: InferenceClient, budget: Budget, task: string, requirement: Requirement, estimateUsd = 0.004,
): Promise<ApplicabilityOutcome> {
  const res = await spend(budget, estimateUsd, async () => {
    const x = await client.complete({
      stableBlock: APPLICABILITY_SYSTEM,
      variableBlock: `## RULE\n\n${requirement.statement}\n\nApplies when: ${requirement.appliesWhen}\n\n## TASK\n\n${task}`,
      userMessage: 'Answer now.', toolName: 'emit_applicability',
      toolDescription: 'Could this rule bear on this task?', schema: APPLICABILITY_SCHEMA, maxTokens: 300,
    });
    return { value: x, cost: x.cost };
  });
  const j = res.json as { applicability?: Applicability; reason?: string } | null;
  // An unreadable instrument authorises nothing, and AMBIGUOUS is the outcome that authorises nothing.
  const a: Applicability = j?.applicability ?? 'AMBIGUOUS';
  const reason = j?.reason ?? 'no parseable verdict';
  if (a !== 'APPLIES') return { admitted: null, applicability: a, reason };
  return { admitted: { [ADMITTED]: true, requirement, applicability: 'APPLIES', reason },
    applicability: 'APPLIES', reason };
}

/**
 * The burden is on the block.
 *
 * Note what is NOT asked: whether the output is good, whether the rule was followed, or which of two
 * outputs is better. The instrument is asked whether it can PRODUCE SOMETHING — and if it cannot,
 * the answer is that no block was established, which is a different and much weaker statement than
 * "the rule holds".
 */
export const VETO_SYSTEM = `You decide ONE thing: is there concrete support in this output for BLOCKING it as a violation of this rule?

You are not judging quality. You are not judging whether the rule was followed. You are deciding
whether enough concrete support exists to justify stopping this output from being used.

Answer with one of:

- VETO: you can point at specific support for a violation, and you are stating it below.
- NO_VETO: you cannot establish a block. This does NOT mean the output follows the rule — it means
  you did not find sufficient support to stop it. Saying NO_VETO commits you to nothing about
  compliance.
- ESCALATE: a violation is materially plausible here, but the available evidence is insufficient or
  points both ways, so neither blocking nor waving it through is safe. Say what you could not settle.

A VETO must carry evidence of exactly one kind:

  PRESENCE       something in the output breaks the rule. Quote it verbatim in outputSpan.
  OMISSION       the rule requires something this output does not contain. Do NOT quote anything —
                 there is no sentence that proves an absence. Instead name in "locus" the place it
                 would have had to appear ("the closing paragraph of the second section").
  CONTRADICTION  two parts of the output cannot both satisfy the rule. Quote the decisive one.

Every VETO must also name, in "authorisingClause", the exact words FROM THE RULE ABOVE that authorise
the block — copied verbatim from the rule, not paraphrased.

THE TASK IS CONTEXT, NEVER A CRITERION. It tells you what the output was trying to do, so you can
read the rule against it. It is not itself enforceable here: a length, a format or an instruction
that appears in the task and not in the rule cannot support a block, however plainly the output
falls short of it. Something else enforces the brief. You enforce this rule.

If you cannot produce that evidence, you do not have a VETO. Say NO_VETO or ESCALATE.

Judge only against the rule as written. If enforcing it here would need a criterion the author did
not write down, that is not a violation you can support — it is ESCALATE at most.`;

export const VETO_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['VETO', 'NO_VETO', 'ESCALATE'] },
    authorisingClause: { type: ['string', 'null'] },
    evidenceType: { type: ['string', 'null'], enum: ['PRESENCE', 'OMISSION', 'CONTRADICTION', null] },
    outputSpan: { type: ['string', 'null'] },
    locus: { type: ['string', 'null'] },
    rationale: { type: ['string', 'null'] },
    escalationReason: { type: ['string', 'null'] },
  },
  required: ['verdict', 'authorisingClause', 'evidenceType', 'outputSpan', 'locus', 'rationale', 'escalationReason'],
  additionalProperties: false,
};

export interface VetoResult {
  readonly observation: VetoObservation;
  /** contract failures, reported rather than repaired — a sensor that cannot obey its contract is data */
  readonly contractViolations: readonly { field: string; problem: string }[];
  readonly raw: unknown;
}

/**
 * Ask for a block. REQUIRES an `Admitted` — there is no overload taking a bare Requirement.
 *
 * Contract violations are REPORTED, never silently repaired. An instrument that returns a VETO with
 * no evidence has told us something important about itself, and coercing it to NO_VETO would erase
 * exactly that.
 */
export async function observeVeto(
  client: InferenceClient, budget: Budget, task: string, admitted: Admitted, output: string, estimateUsd = 0.008,
): Promise<VetoResult> {
  const r = admitted.requirement;
  const res = await spend(budget, estimateUsd, async () => {
    const x = await client.complete({
      stableBlock: VETO_SYSTEM,
      variableBlock: `## RULE\n\n${r.statement}\n\n## TASK\n\n${task}\n\n## OUTPUT\n\n${output}`,
      userMessage: 'Answer now.', toolName: 'emit_veto',
      toolDescription: 'Is there concrete support for blocking this output?',
      schema: VETO_SCHEMA, maxTokens: 700,
    });
    return { value: x, cost: x.cost };
  });

  const j = (res.json ?? {}) as Record<string, unknown>;
  const verdict = (['VETO', 'NO_VETO', 'ESCALATE'] as const).find((v) => v === j.verdict) ?? 'ESCALATE';
  const et = (['PRESENCE', 'OMISSION', 'CONTRADICTION'] as const).find((t) => t === j.evidenceType) ?? null;

  const evidence: VetoEvidence | null = verdict === 'VETO' && et
    ? { requirementId: r.requirementId,
        authorisingClause: typeof j.authorisingClause === 'string' ? j.authorisingClause : '',
        evidenceType: et,
        outputSpan: typeof j.outputSpan === 'string' && j.outputSpan.trim() ? j.outputSpan : null,
        locus: typeof j.locus === 'string' && j.locus.trim() ? j.locus : null,
        rationale: typeof j.rationale === 'string' ? j.rationale : '' }
    : null;

  const observation: VetoObservation = {
    verdict, evidence,
    escalationReason: verdict === 'ESCALATE'
      ? (typeof j.escalationReason === 'string' && j.escalationReason.trim() ? j.escalationReason
        : typeof j.rationale === 'string' ? j.rationale : '')
      : null,
  };
  // checked AGAINST the requirement and the output, so the authorising clause and any quoted span
  // are verified rather than taken on the sensor's word
  return { observation, contractViolations: checkContract(observation, { requirementStatement: r.statement, output }), raw: j };
}

/**
 * The whole path, and the only way to reach the sensor.
 *
 * Returns the applicability outcome when the requirement was not admitted, so a caller can count
 * DOES_NOT_APPLY and AMBIGUOUS as the distinct states they are rather than losing them into a
 * NO_VETO tally.
 */
export type ObservationRun =
  | { readonly stage: 'APPLICABILITY'; readonly applicability: 'DOES_NOT_APPLY' | 'AMBIGUOUS'; readonly reason: string }
  | { readonly stage: 'VETO'; readonly applicabilityReason: string; readonly result: VetoResult };

export async function observe(
  client: InferenceClient, budget: Budget, task: string, requirement: Requirement, output: string,
): Promise<ObservationRun> {
  const a = await observeApplicability(client, budget, task, requirement);
  if (!a.admitted) return { stage: 'APPLICABILITY', applicability: a.applicability, reason: a.reason };
  const result = await observeVeto(client, budget, task, a.admitted, output);
  return { stage: 'VETO', applicabilityReason: a.reason, result };
}
