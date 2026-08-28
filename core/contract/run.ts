// atelier/core/contract/run.ts — RUN THE CASES, AND KEEP THE TWO KINDS OF LOOKING APART.
//
// Every case gets the same treatment up to the point where somebody has to say whether it passed.
// There the paths diverge, and keeping them apart is the whole authority model:
//
//   DETERMINISTIC   a machine-checkable shape. Validated here, no model consulted, and the verdict
//                   is a verdict. These are the only outcomes `passed` and `failed` may hold.
//
//   anything else   an unqualified reader is asked what it sees. Its answer is real information —
//                   it is what a diagnosis works from and what tells an optimizer which way to move
//                   — and it lands in `apparentPass` / `apparentFail`, where no amount of it adds up
//                   to a result.
//
// The temptation is to put both in one bucket and report a single number, because a single number is
// what a person wants. That number would be a measurement of an instrument nobody qualified, which
// is the failure this programme has paid for more than once.
//
// ─── THE READER IS ASKED WHAT IT SEES, NOT WHETHER IT APPROVES ─────────────────────────────────
//
// "Did this output follow the rule?" invites a judgment. "Does this output do X?" asks for an
// observation. The distinction matters because the second is answerable by something unqualified and
// the first is not, and because three model-based instruments in this programme produced zero
// abstentions across 150 observations when asked the first kind of question.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { ContractTestCase, ContractResult, ContractTestSuite, SuiteRole } from './suite.js';

export const READER_SYSTEM = `You report what an output DOES. You do not decide whether it is good.

You are given a TASK, an OUTPUT produced for that task, and one PROPERTY the output was supposed to
have or avoid. Answer only whether the output has that property.

- Answer about the OUTPUT, not about whether the property is a sensible thing to want.
- If the property does not clearly apply to this output, say UNCLEAR. UNCLEAR is a real answer and is
  often the correct one; a forced verdict on a case that barely arises is worse than no verdict.
- Quote the shortest span of the output that decided your answer. If you cannot quote one, the answer
  is UNCLEAR.`;

export const READER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    holds: { type: 'string', enum: ['YES', 'NO', 'UNCLEAR'] },
    evidence: { type: ['string', 'null'] },
  },
  required: ['holds', 'evidence'],
  additionalProperties: false,
};

/**
 * COMPLETENESS GATES BEHAVIOUR. A CUT-OFF ANSWER IS NOT AN ANSWER.
 *
 * A behavioural checker cannot tell "the model chose not to do X" from "the model was stopped before
 * it could". Reading a truncated output returns a confident, well-formed, meaningless label, and it
 * looks exactly like a real observation.
 *
 * This is not hypothetical. Two studies in this repository scored a coverage endpoint on generations
 * that had been cut off at the token limit — 27 of 48 in one, 54 of 72 in the other — and both
 * figures are withdrawn. The instrument failures this programme had catalogued until then were about
 * JUDGMENT: an unqualified observer, a word list standing in for a grammatical property. This one is
 * about EXECUTION COMPLETENESS, and it sits upstream of every semantic instrument, so no amount of
 * care in the observer would have caught it.
 *
 * So an incomplete generation is its own verdict and never a behavioural one.
 */
export type GenerationValidity =
  /** the model finished. Behaviour may be read from this. */
  | 'COMPLETE'
  /** stopped at the token limit. Nothing about behaviour can be read from it. */
  | 'TRUNCATED'
  /** no answer text at all */
  | 'EMPTY';

/** What running one case produced, before anything is aggregated. */
export interface CaseOutcome {
  readonly caseId: string;
  readonly output: string;
  readonly validity: GenerationValidity;
  readonly verdict: 'PASS' | 'FAIL' | 'APPARENT_PASS' | 'APPARENT_FAIL' | 'UNOBSERVED' | 'EXECUTION_INVALID';
  /** the span an unqualified reader quoted, or the validation error from a shape check */
  readonly evidence: string | null;
  readonly why: string;
}

/**
 * Produces the output under test. Injected so a run can be driven without a provider.
 *
 * Returns the completeness alongside the text, because only the caller that made the request knows
 * whether the provider stopped it. A runner that inferred completeness from the text would be
 * guessing at exactly the thing that must not be guessed.
 */
export type RunSkill = (task: string) => Promise<{ output: string; validity: GenerationValidity }>;

/** Deterministic: does the output parse, and does it carry every declared key? */
const checkShape = (output: string, expectation: string): { ok: boolean; why: string } => {
  const m = /\{[\s\S]*\}/.exec(expectation);
  if (!m) return { ok: false, why: 'the expectation names a shape but carries no schema to check' };
  let declared: Record<string, unknown>;
  try { declared = JSON.parse(m[0]) as Record<string, unknown>; } catch {
    return { ok: false, why: 'the declared shape is not valid JSON' };
  }
  let got: unknown;
  try { got = JSON.parse(output); } catch {
    return { ok: false, why: 'the output is not JSON, and the requirement declares a machine-checkable shape' };
  }
  if (got === null || typeof got !== 'object' || Array.isArray(got)) {
    return { ok: false, why: 'the output parsed but is not an object' };
  }
  const missing = Object.keys(declared).filter((k) => !(k in (got as Record<string, unknown>)));
  return missing.length
    ? { ok: false, why: `the output is missing declared field(s): ${missing.join(', ')}` }
    : { ok: true, why: 'every declared field is present' };
};

async function readUnqualified(
  client: InferenceClient, budget: Budget, c: ContractTestCase, output: string,
): Promise<{ holds: 'YES' | 'NO' | 'UNCLEAR'; evidence: string | null }> {
  const r = await spend(budget, 0.01, async () => {
    const x = await client.complete({
      stableBlock: READER_SYSTEM,
      variableBlock: `PROPERTY: ${c.expectation}`,
      userMessage: `TASK:\n${c.task}\n\nOUTPUT:\n${output}\n\nDoes the output have the property?`,
      toolName: 'emit_observation',
      toolDescription: 'Report whether the output has the property.',
      schema: READER_SCHEMA, maxTokens: 400,
    });
    return { value: x, cost: x.cost };
  });
  const j = r.json as { holds?: unknown; evidence?: unknown } | null;
  const holds = j?.holds === 'YES' || j?.holds === 'NO' ? j.holds : 'UNCLEAR';
  const evidence = typeof j?.evidence === 'string' ? j.evidence : null;
  // A verdict with nothing quoted is a verdict with nothing behind it.
  return holds !== 'UNCLEAR' && evidence === null ? { holds: 'UNCLEAR', evidence: null } : { holds, evidence };
}

/**
 * Run one case.
 *
 * The expectation's own wording decides the direction: an obligation whose expectation says the
 * output must NOT do something passes when the reader answers NO. That polarity is carried from the
 * obligation rather than re-derived, because re-deriving it from the statement is the inversion that
 * has already happened once in this codebase.
 */
export async function runCase(
  client: InferenceClient, budget: Budget, c: ContractTestCase, run: RunSkill,
): Promise<CaseOutcome> {
  const { output, validity } = await run(c.task);
  if (validity !== 'COMPLETE') {
    return { caseId: c.caseId, output, validity, verdict: 'EXECUTION_INVALID', evidence: null,
      why: validity === 'TRUNCATED'
        ? 'the generation was stopped at the token limit, so what the model would have done is '
          + 'unknown. Scoring it would record the limit rather than the behaviour.'
        : 'the generation produced no answer text.' };
  }
  // FROM THE TYPED KIND, never from the prose. Reading "must not" out of the expectation made the
  // polarity depend on which casing an obligation happened to use, and would invert silently the
  // first time somebody reworded a sentence.
  const negative = c.obligationKind === 'SHOULD_NOT_FIRE' || c.obligationKind === 'SHOULD_NOT_APPLY';

  if (c.observation === 'DETERMINISTIC') {
    const { ok, why } = checkShape(output, c.expectation);
    return { caseId: c.caseId, output, validity, verdict: ok ? 'PASS' : 'FAIL', evidence: null, why };
  }

  if (c.observation === 'HUMAN') {
    return { caseId: c.caseId, output, validity, verdict: 'UNOBSERVED', evidence: null,
      why: 'this requirement is marked as needing a person, and no person has looked' };
  }

  const { holds, evidence } = await readUnqualified(client, budget, c, output);
  if (holds === 'UNCLEAR') {
    return { caseId: c.caseId, output, validity, verdict: 'UNOBSERVED', evidence,
      why: 'an unqualified reader could not tell, which is a real answer and not a failure' };
  }
  const satisfied = negative ? holds === 'NO' : holds === 'YES';
  return {
    caseId: c.caseId, output, validity,
    verdict: satisfied ? 'APPARENT_PASS' : 'APPARENT_FAIL',
    evidence,
    why: `an unqualified reader answered ${holds} to a ${negative ? 'prohibition' : 'requirement'}. `
      + 'This guides diagnosis and certifies nothing.',
  };
}

/** Fold outcomes into the shape a person may quote. Counts only; the type carries no rate. */
export function foldOutcomes(
  suite: ContractTestSuite, skillVersionHash: string, role: SuiteRole,
  outcomes: readonly CaseOutcome[],
): ContractResult {
  const of = (v: CaseOutcome['verdict']): string[] =>
    outcomes.filter((o) => o.verdict === v).map((o) => o.caseId);
  const ran = new Set(outcomes.map((o) => o.caseId));
  const covered = new Set(suite.cases.filter((c) => ran.has(c.caseId)).map((c) => c.obligationId));
  return {
    suiteHash: suite.suiteHash, skillVersionHash, role,
    passed: of('PASS'), failed: of('FAIL'),
    apparentPass: of('APPARENT_PASS'), apparentFail: of('APPARENT_FAIL'),
    unobservable: of('UNOBSERVED'),
    obligationsCovered: covered.size,
    obligationsTotal: suite.obligations.length,
  };
}
