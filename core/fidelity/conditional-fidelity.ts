// core/fidelity/conditional-fidelity.ts — WHAT REPLACES "DID IT VIOLATE ANYTHING".
//
// The previous adherence endpoint was: an output is COMPLETE if no requirement was VIOLATED. Over a
// standard whose rules are conditional, a scorer marks a rule N/A when its condition does not hold,
// and a rule marked N/A cannot be violated. So an output that engages with nothing scores perfectly.
//
// That is not a hypothetical. Measured across 138 scored outputs in one study: 3 violations total,
// COMPLETE at 100% for every arm including a base model that won 3 of 46 contexts on blind preference.
// The endpoint measured whether an output avoided situations in which it could be penalised.
//
// ─── THE FIX IS NOT A BETTER RUBRIC. IT IS MOVING WHO DECIDES APPLICABILITY ────────────────────
//
// Applicability is sealed BY THE EXPERT, PER CONTEXT, BEFORE ANY OUTPUT EXISTS. The scorer is then
// never asked whether a rule applied — only whether the behaviour was expressed. Silence can no
// longer buy an N/A, because the N/A was decided before there was anything to be silent about.
//
// This is the same structural correction as an earlier one in this programme: measuring only false
// application is won by a model that never applies the behaviour, and measuring only absent violation
// is won by a model that never demonstrates it. Both are one-sided. Four cells are not.

/** Sealed by the expert before generation. Never inferred from an output, at any stage. */
export type Applicability = 'APPLIES' | 'DOES_NOT_APPLY';

/**
 * Whether the behaviour appeared. The ONLY axis a scorer rules on.
 *
 * UNCERTAIN exists here and deliberately nowhere else: a scorer may be unsure whether a produced
 * passage satisfies a rule, and forcing that into a binary invents precision. They may never be
 * unsure whether the rule applied, because they were not asked.
 */
export type Expression = 'PRESENT' | 'ABSENT' | 'UNCERTAIN';

export type Cell =
  /** the rule applied and the output did it */
  | 'SATISFIED'
  /** the rule applied and the output did not */
  | 'MISSED'
  /** the rule did not apply and the output did it anyway — the caricature failure */
  | 'FALSE_APPLICATION'
  /** the rule did not apply and the output withheld it — restraint, and it is a success */
  | 'CORRECT_RESTRAINT'
  /** applicability is known; whether the behaviour landed is not */
  | 'UNRESOLVED';

export function classify(a: Applicability, e: Expression): Cell {
  if (e === 'UNCERTAIN') return 'UNRESOLVED';
  if (a === 'APPLIES') return e === 'PRESENT' ? 'SATISFIED' : 'MISSED';
  return e === 'PRESENT' ? 'FALSE_APPLICATION' : 'CORRECT_RESTRAINT';
}

/** A situation with the expert's answer, sealed before discovery ever ran. */
export interface HeldOutCase {
  readonly caseId: string;
  readonly context: string;
  readonly expectedDecision: string;
  readonly expectedRationale: string;
  readonly forbiddenDecisions: readonly string[];
  /**
   * Populated ONLY where the source evidence genuinely records an engagement choice.
   *
   * Absent work is not a decision not to act. It can equally mean unseen, deprioritised, handled by
   * someone else, or out of time, and a corpus cannot tell those apart. Leaving this undefined is the
   * honest default and it is not a gap to be filled by inference.
   */
  readonly engagementExpected?: 'DEEP' | 'LIGHT' | 'NONE';
  readonly provenance: string;
  /** cases from one situation family cluster together; repetitions are NOT independent of it */
  readonly clusterId: string;
  /** which prospective set this belongs to. Pooling them is refused downstream. */
  readonly set: 'B_NATURAL' | 'C_TARGETED';
}

/** One expert ruling: does this requirement apply in this case. Sealed separately from the cases. */
export interface ApplicabilityEntry {
  readonly caseId: string;
  readonly requirementId: string;
  readonly applies: Applicability;
}

/** One scorer ruling on one output. Carries no applicability — that was decided already. */
export interface ExpressionEntry {
  readonly caseId: string;
  readonly requirementId: string;
  readonly arm: string;
  readonly generation: number;
  readonly expressed: Expression;
}

export interface DecisionRuling {
  readonly caseId: string;
  readonly arm: string;
  readonly generation: number;
  /** did the output reach the expert's sealed decision */
  readonly decisionCorrect: boolean;
  /** did it do something the expert sealed as forbidden */
  readonly forbiddenTaken: boolean;
  /** only scored where `engagementExpected` was legitimately available */
  readonly engagementCorrect?: boolean;
}

export interface RequirementMeta {
  readonly requirementId: string;
  readonly materiality: string | null;
}

export const isRequired = (r: RequirementMeta): boolean => r.materiality === 'REQUIRED';

export interface ContextOutcome {
  readonly caseId: string;
  readonly arm: string;
  readonly generation: number;
  readonly success: boolean;
  readonly why: readonly string[];
  readonly cells: Readonly<Record<string, Cell>>;
}

/**
 * THE PRIMARY ENDPOINT. A context succeeds only if all of it holds.
 *
 * PREFERRED requirements cannot decide it. They are characteristic rather than obligatory, and letting
 * them gate the primary would make the expressive layer decide a decision study — which is how the
 * previous endpoint came to be measuring the wrong construct.
 *
 * UNRESOLVED on a REQUIRED rule fails the context. A scorer who cannot tell whether a binding
 * behaviour landed has not established that it did, and counting it as success would let uncertainty
 * accrue to whichever arm produces the most ambiguous prose.
 */
export function contextSuccess(
  caseId: string, arm: string, generation: number,
  ruling: DecisionRuling,
  reqs: readonly RequirementMeta[],
  applicability: readonly ApplicabilityEntry[],
  expressions: readonly ExpressionEntry[],
): ContextOutcome {
  const why: string[] = [];
  const cells: Record<string, Cell> = {};
  const appl = new Map(applicability.filter((a) => a.caseId === caseId).map((a) => [a.requirementId, a.applies]));
  const expr = new Map(expressions
    .filter((e) => e.caseId === caseId && e.arm === arm && e.generation === generation)
    .map((e) => [e.requirementId, e.expressed]));

  for (const r of reqs) {
    const a = appl.get(r.requirementId);
    if (a === undefined) {
      // A requirement with no sealed applicability cannot be scored. Refusing is the only honest
      // move: inferring it here would reintroduce exactly the loophole this module exists to close.
      why.push(`${r.requirementId}: NO SEALED APPLICABILITY — unscorable`);
      continue;
    }
    const cell = classify(a, expr.get(r.requirementId) ?? 'UNCERTAIN');
    cells[r.requirementId] = cell;
    if (!isRequired(r)) continue;
    if (cell === 'MISSED') why.push(`${r.requirementId}: required and applicable, not expressed`);
    if (cell === 'FALSE_APPLICATION') why.push(`${r.requirementId}: required, does not apply here, applied anyway`);
    if (cell === 'UNRESOLVED') why.push(`${r.requirementId}: required, expression undetermined`);
  }
  if (!ruling.decisionCorrect) why.unshift('the sealed expert decision was not reached');
  if (ruling.forbiddenTaken) why.unshift('an explicitly forbidden decision was taken');
  if (ruling.engagementCorrect === false) why.push('engagement level wrong');

  return { caseId, arm, generation, success: why.length === 0, why, cells };
}

export interface Coverage {
  readonly requirementId: string;
  readonly applies: number;
  readonly doesNotApply: number;
  readonly required: boolean;
}

/**
 * Whether the held-out set actually exercises the standard, computed AFTER applicability sealing and
 * BEFORE any generation.
 *
 * One study shipped a significant result while two of six requirements — including one of two binding
 * rules — were never exercised in 138 outputs, and nothing in the result revealed it. This is the
 * check that would have.
 */
export const coverage = (
  reqs: readonly RequirementMeta[], applicability: readonly ApplicabilityEntry[],
): readonly Coverage[] => reqs.map((r) => {
  const rows = applicability.filter((a) => a.requirementId === r.requirementId);
  return { requirementId: r.requirementId, required: isRequired(r),
    applies: rows.filter((a) => a.applies === 'APPLIES').length,
    doesNotApply: rows.filter((a) => a.applies === 'DOES_NOT_APPLY').length };
});

/** A load-bearing rule needs cases on BOTH sides. One-sided coverage cannot test a boundary. */
export const MIN_PER_SIDE = 3;

export const underCovered = (c: readonly Coverage[]): readonly Coverage[] =>
  c.filter((x) => x.required && (x.applies < MIN_PER_SIDE || x.doesNotApply < MIN_PER_SIDE));

/**
 * REFUSES TO POOL THE TWO SETS.
 *
 * B is sealed before discovery and answers natural generalization. C is built after the standard is
 * frozen and answers whether a named rule behaves when deliberately exercised. Averaging them produces
 * a number that answers neither, and the temptation to do it arrives exactly when B's coverage is
 * thin — which is when the distinction matters most.
 */
export function assertNotPooled(cases: readonly HeldOutCase[]): void {
  const sets = new Set(cases.map((c) => c.set));
  if (sets.size > 1) {
    throw new Error(
      'POOLING REFUSED: B_NATURAL and C_TARGETED may not be analysed together. B answers whether the '
      + 'standard generalises to situations sealed before discovery; C answers whether a rule fires '
      + 'when a case is built to exercise it. Report them separately.');
  }
}

/** Context is the unit. Generations are nested and may never inflate n. */
export interface ArmResult {
  readonly arm: string;
  readonly contexts: number;
  readonly majoritySuccess: number;
  readonly byRate: Readonly<Record<string, number>>;
}

export function summarise(outcomes: readonly ContextOutcome[], arm: string, totalGenerations: number): ArmResult {
  const mine = outcomes.filter((o) => o.arm === arm);
  const byCase = new Map<string, number>();
  for (const o of mine) byCase.set(o.caseId, (byCase.get(o.caseId) ?? 0) + (o.success ? 1 : 0));
  const rate: Record<string, number> = {};
  for (const n of byCase.values()) rate[`${n}/${totalGenerations}`] = (rate[`${n}/${totalGenerations}`] ?? 0) + 1;
  return { arm, contexts: byCase.size,
    majoritySuccess: [...byCase.values()].filter((n) => n * 2 > totalGenerations).length, byRate: rate };
}
