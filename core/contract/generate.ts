// atelier/core/contract/generate.ts — A MODEL MAY INVENT THE SITUATION. IT MAY NOT INVENT THE VERDICT.
//
// The obligation is already decided by the time anything here runs: `obligationsFor` derived it from
// typed fields with no model consulted, and it carries its own `expectation` in the standard's own
// words. What is missing is a concrete task that puts a model in the situation the obligation
// describes, and inventing situations is a thing models are good at.
//
// So the generator is asked for ONE field. It returns a task and nothing else. The expectation, the
// obligation id, the requirement ids and the observation mode are all copied across from the
// obligation, and a returned case that disagrees with its obligation is refused rather than
// reconciled.
//
// ─── WHY THE PROMPT SHOWS THE EXPECTATION ANYWAY ───────────────────────────────────────────────
//
// A task built without seeing what is being tested is a random prompt. The generator needs to know
// that a SHOULD_NOT_FIRE case must be a situation where the rule genuinely does not apply — not a
// trick, and not a situation where it half-applies — or it produces cases whose failures say nothing.
// Showing the expectation and refusing to take a verdict back is a different thing from letting the
// generator decide what passing means.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { Obligation } from './obligation.js';
import type { ContractTestCase } from './suite.js';
import { judgeCandidate, MAX_OVERLAP, type DiversityDecision } from './diversity.js';

export const GENERATOR_SYSTEM = `You write ONE test task.

You are given a rule from an expert's standard, and an OBLIGATION that rule places on any skill built
from it. Your job is to write a realistic task for the work type described — the kind of request a
real user would send — that puts a skill in exactly the situation the obligation names.

Rules for the task you write:
- It must be a TASK, phrased as a user would phrase it. Not a question about the rule.
- It must not mention the rule, the standard, or that anything is being tested. A skill that can see
  it is being tested is not being tested.
- For SHOULD_FIRE: the rule's condition must genuinely hold.
- For SHOULD_NOT_FIRE: the condition must genuinely NOT hold. Not a trick, not a near-miss.
- For BOUNDARY: it must be genuinely arguable whether the condition holds.
- For INTERACTION: both rules must be live at once, in a way where satisfying one could damage the other.
- Keep it short. One realistic request.

You do not decide whether the skill passes. That is already decided and is not your business.`;

export const GENERATOR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { task: { type: 'string' } },
  required: ['task'],
  additionalProperties: false,
};

export class GenerationRefused extends Error {}

const promptFor = (o: Obligation, workType: string, taken: readonly string[] = []): string =>
  (taken.length
    ? 'ALREADY USED — write about a COMPLETELY different domain, industry and situation:\n'
      + taken.map((t, n) => `${n + 1}. ${t}`).join('\n') + '\n\n'
    : '')
  + `WORK TYPE: ${workType}\n`
  + `OBLIGATION KIND: ${o.kind}\n`
  + `SITUATION TO CONSTRUCT: ${o.situation}\n`
  + `WHAT THE STANDARD REQUIRES THERE: ${o.expectation}\n\n`
  + 'Write the task.';

/**
 * One case per obligation.
 *
 * Sequential rather than concurrent on purpose: each call is metered through the same budget, and a
 * parallel fan-out that overruns the cap has already spent the money by the time anything notices.
 *
 * A refusal stops the run. A partial suite is worse than none — the obligations that failed to
 * generate are exactly the ones nothing will test, and a suite quietly missing its negative cases
 * looks like a suite that passed them.
 */
/**
 * Refuse a candidate for a reason the caller can act on. Injected, because WHAT MAKES A CASE VALID
 * is a property of the obligation and not of this loop — a step-count check belongs to a rule about
 * steps. Returning a string rejects and retries; `null` accepts.
 */
export type CaseValidator = (task: string, o: Obligation) => Promise<string | null>;

export interface GeneratedSuite {
  readonly cases: readonly ContractTestCase[];
  /** every candidate the diversity gate saw and what it decided. Sealed with the suite. */
  readonly diversity: readonly DiversityDecision[];
  /** every validator rejection, so a suite can show what it refused rather than only what it kept */
  readonly rejected: readonly { readonly obligationId: string; readonly task: string; readonly why: string }[];
}

/** Attempts per obligation before the run is refused. */
export const MAX_ATTEMPTS = 8;

export async function generateCases(
  client: InferenceClient,
  budget: Budget,
  obligations: readonly Obligation[],
  workType: string,
  opts: { readonly validate?: CaseValidator; readonly maxOverlap?: number } = {},
): Promise<GeneratedSuite | GenerationRefused> {
  const cases: ContractTestCase[] = [];
  const diversity: DiversityDecision[] = [];
  const rejected: { obligationId: string; task: string; why: string }[] = [];
  const threshold = opts.maxOverlap ?? MAX_OVERLAP;

  for (const [i, o] of obligations.entries()) {
   let accepted: string | null = null;
   let lastWhy = 'no attempt produced a task';
   for (let attempt = 1; attempt <= MAX_ATTEMPTS && accepted === null; attempt++) {
    let json: unknown;
    try {
      const r = await spend(budget, 0.01, async () => {
        const x = await client.complete({
          stableBlock: GENERATOR_SYSTEM, variableBlock: '',
          // WHAT IS ALREADY TAKEN IS SHOWN. Asked the same question with no memory, a generator
          // converges: one frozen suite had 13 near-duplicate pairs, ALL in the arm that carried the
          // finding. The diversity gate below is the refusal; this is what stops it firing constantly.
          userMessage: promptFor(o, workType, cases.map((c) => c.task)),
          toolName: 'emit_task',
          toolDescription: 'Emit one realistic task for the situation described.',
          schema: GENERATOR_SCHEMA, maxTokens: 600,
        });
        return { value: x, cost: x.cost };
      });
      json = r.json;
    } catch (e) {
      return new GenerationRefused(
        `generating a case for ${o.obligationId} failed after ${cases.length} of ${obligations.length}: `
        + `${(e as Error).message}. Nothing was sealed — a suite missing its negative cases looks like `
        + 'a suite that passed them.');
    }

    const task = (json as { task?: unknown }).task;
    if (typeof task !== 'string' || !task.trim()) {
      return new GenerationRefused(`the generator returned no task for ${o.obligationId}.`);
    }
    const candidate = task.trim();

    // ── THE GATE, AND IT RUNS BEFORE THE FREEZE RATHER THAN AS A REPORT AFTER IT ──────────────
    const decision = judgeCandidate(candidate, cases.map((c) => ({ id: c.caseId, task: c.task })), threshold);
    diversity.push(decision);
    if (!decision.accepted) {
      lastWhy = `too similar to ${decision.collidedWith} at ${decision.overlap.toFixed(2)}`;
      continue;
    }

    // The validator sees the obligation, so "does this case correspond to what it claims to test"
    // is answered against the obligation rather than against this loop's idea of a good task.
    if (opts.validate) {
      const why = await opts.validate(candidate, o);
      if (why !== null) {
        rejected.push({ obligationId: o.obligationId, task: candidate, why });
        lastWhy = why;
        continue;
      }
    }
    accepted = candidate;

    cases.push({
      caseId: `c${String(i + 1).padStart(3, '0')}`,
      // COPIED, never taken from the model. The generator was shown the expectation so it could build
      // the right situation; it has no way to send a different one back.
      obligationId: o.obligationId,
      obligationKind: o.kind,
      requirementIds: o.requirementIds,
      task: candidate,
      expectation: o.expectation,
      observation: o.observation,
      provenance: 'MODEL_GENERATED',
    });
   }
   if (accepted === null) {
     // A PARTIAL SUITE IS WORSE THAN NONE. The obligations that failed to generate are exactly the
     // ones nothing will test, and a suite quietly missing its negative cases looks like a suite
     // that passed them.
     return new GenerationRefused(
       `no admissible case for ${o.obligationId} after ${MAX_ATTEMPTS} attempts; last refusal: ${lastWhy}. `
       + `${cases.length} of ${obligations.length} obligations had been filled. Nothing was sealed.`);
   }
  }
  return { cases, diversity, rejected };
}
