// atelier/core/contract/suite.ts — CONSTRUCTED CHALLENGES, AND WHAT THEY MAY NEVER BE MISTAKEN FOR.
//
// ─── THE ONE RULE THIS FILE EXISTS TO MAKE UNBREAKABLE ─────────────────────────────────────────
//
// A contract suite tests whether an IMPLEMENTATION carries the standard it was compiled from. Its
// cases are constructed, from one generation procedure, against the same StandardVersion they test.
// They are NOT independent draws from any deployment distribution.
//
// So "24 of 26 constructed cases passed" is a real and useful sentence, and
//
//     "deployment failure rate below 13.9% with 95% confidence"
//
// is not a sentence this evidence can support. The arithmetic in `reference/holdout-integrity.ts`
// (`upperBound95`, `nForBar`) assumes independent samples from the distribution the claim is about.
// Applied here it would manufacture a confidence interval out of a procedure's own output — the
// exact shape of the error this programme already published and withdrew, where 46 nested
// observations were pooled as though they were 46 independent ones.
//
// The distinction is enforced rather than remembered: `ContractResult` carries no rate, no bound and
// no interval, and a census test fails if this module ever imports the holdout arithmetic.
//
//   CONTRACT TESTS        constructed      "did we implement the standard we were given?"
//   REFERENCE EVIDENCE    real, held-out   "does this reproduce the expert in deployment?"
//
// The first can ship a useful skill. It never becomes the second.
//
// ─── SEALED BEFORE OPTIMIZATION, SPLIT BEFORE ANYTHING IS RUN ──────────────────────────────────
//
// The whole suite is generated and hashed BEFORE an optimizer sees any of it, and split into a part
// the optimizer may iterate against and a part it may not. Generating fresh cases after seeing a
// failure is legitimate work, and it produces the NEXT suite — it never repairs this one's holdout,
// because a holdout chosen after the failures are known is not a holdout.

import { createHash } from 'node:crypto';
import type { StandardVersion } from '../state/canonical-state.js';
import { type Obligation, type ObligationKind, type ObservationMode, obligationsForStandard }
  from './obligation.js';

/** Who invented the task text. The obligation is never invented; only the situation is. */
export type GenerationProvenance =
  /** written by a person */
  | 'HUMAN_AUTHORED'
  /** a model was asked to build a task satisfying an obligation it was shown */
  | 'MODEL_GENERATED'
  /** derived with no model, from the requirement's own fields */
  | 'DETERMINISTIC';

export interface ContractTestCase {
  readonly caseId: string;
  readonly obligationId: string;
  /**
   * The obligation's kind, carried so nothing downstream has to re-derive it.
   *
   * A runner needs to know whether the expectation is a presence or an absence, and the first
   * version read that off the expectation TEXT by searching for "must not". That is a word list
   * standing in for a typed property: it depended on the exact casing two different obligations
   * happened to use, and would silently invert on any rewording of the prose. The kind is the
   * property; the sentence is a rendering of it.
   */
  readonly obligationKind: ObligationKind;
  readonly requirementIds: readonly string[];
  /** the task a model is actually given */
  readonly task: string;
  /** what the standard requires here, carried from the obligation and never rewritten */
  readonly expectation: string;
  readonly observation: ObservationMode;
  readonly provenance: GenerationProvenance;
}

/**
 * Which half of the suite a case belongs to.
 *
 * SEARCH is spendable: an optimizer may look at it as often as it likes. HOLDOUT is read once, at
 * the end, and reading it during optimization turns it into training data without anything saying so.
 */
export type SuiteRole = 'SEARCH' | 'HOLDOUT';

export interface ContractTestSuite {
  readonly suiteHash: string;
  /** the standard these obligations came from. A suite belongs to one version and does not travel. */
  readonly standardVersionHash: string;
  readonly obligations: readonly Obligation[];
  readonly cases: readonly ContractTestCase[];
  readonly searchCaseIds: readonly string[];
  readonly holdoutCaseIds: readonly string[];
  /** obligations no case covers. Named, because a silent gap reads as a pass. */
  readonly uncoveredObligationIds: readonly string[];
}

export class SuiteRefused extends Error {}

/**
 * Seal a suite: fix the cases, fix the split, hash the result.
 *
 * The split is DETERMINISTIC from the case ids and the standard hash, not random, so the same inputs
 * always produce the same holdout. A random split re-rolled per run lets an optimizer that fails on
 * one holdout be re-run until it draws an easier one, which is the same defect as regenerating the
 * holdout after seeing failures, arrived at by accident.
 *
 * Cases are grouped by OBLIGATION before splitting. Two cases built for the same obligation are near
 * duplicates, and letting one land in each half means the optimizer has effectively seen its own
 * holdout.
 */
export function sealSuite(
  v: StandardVersion,
  cases: readonly ContractTestCase[],
  holdoutFraction = 0.34,
): ContractTestSuite | SuiteRefused {
  const obligations = obligationsForStandard(v);
  const known = new Set(obligations.map((o) => o.obligationId));

  const orphans = cases.filter((c) => !known.has(c.obligationId));
  if (orphans.length) {
    return new SuiteRefused(
      `${orphans.length} case(s) claim an obligation this standard does not place: `
      + `${orphans.map((c) => c.obligationId).join(', ')}. A case whose obligation nothing derived is a `
      + 'test of something nobody ratified.');
  }
  if (holdoutFraction <= 0 || holdoutFraction >= 1) {
    return new SuiteRefused(`holdout fraction ${holdoutFraction} leaves one side empty; a suite with no `
      + 'holdout cannot be read once, and a suite with no search half cannot be optimized against.');
  }

  // Group by obligation, order deterministically, then assign whole groups.
  const byObligation = new Map<string, ContractTestCase[]>();
  for (const c of [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId))) {
    const g = byObligation.get(c.obligationId) ?? [];
    g.push(c);
    byObligation.set(c.obligationId, g);
  }

  const groups = [...byObligation.keys()].sort();
  const search: string[] = [];
  const holdout: string[] = [];
  for (const [i, obligationId] of groups.entries()) {
    // Every Nth obligation-group to holdout, by position in a sorted list. Reproducible from the
    // inputs alone, so a run cannot re-roll its way to a kinder split.
    const toHoldout = (i + 1) % Math.max(2, Math.round(1 / holdoutFraction)) === 0;
    for (const c of byObligation.get(obligationId) ?? []) {
      (toHoldout ? holdout : search).push(c.caseId);
    }
  }

  if (!holdout.length || !search.length) {
    return new SuiteRefused(`${cases.length} case(s) across ${groups.length} obligation(s) cannot be split `
      + 'into a search half and a holdout half. Generate cases for more obligations before sealing.');
  }

  const covered = new Set(cases.map((c) => c.obligationId));
  const uncovered = obligations.filter((o) => !covered.has(o.obligationId)).map((o) => o.obligationId);

  const suiteHash = createHash('sha256').update(JSON.stringify({
    standardVersionHash: v.standardVersionHash,
    cases: [...cases].map((c) => [c.caseId, c.obligationId, c.task, c.expectation]).sort(),
    search: [...search].sort(), holdout: [...holdout].sort(),
  })).digest('hex').slice(0, 16);

  return { suiteHash, standardVersionHash: v.standardVersionHash, obligations, cases,
    searchCaseIds: search, holdoutCaseIds: holdout, uncoveredObligationIds: uncovered };
}

export const roleOf = (s: ContractTestSuite, caseId: string): SuiteRole | null =>
  s.holdoutCaseIds.includes(caseId) ? 'HOLDOUT'
    : s.searchCaseIds.includes(caseId) ? 'SEARCH' : null;

/** Cases an optimizer is allowed to look at. The holdout is deliberately not reachable this way. */
export const searchCases = (s: ContractTestSuite): readonly ContractTestCase[] =>
  s.cases.filter((c) => s.searchCaseIds.includes(c.caseId));

/**
 * WHAT A CONTRACT RUN MAY REPORT.
 *
 * Counts and coverage. No rate, no bound, no interval, and no field anyone could mistake for one —
 * because the moment a percentage appears next to 26 constructed cases, somebody quotes it as
 * reliability. The absent fields are the design.
 */
export interface ContractResult {
  readonly suiteHash: string;
  readonly skillVersionHash: string;
  readonly role: SuiteRole;
  /**
   * Decided by a QUALIFIED observer — today, only a machine-checkable shape.
   *
   * These are the only outcomes that may be spoken of as passing or failing without hedging.
   */
  readonly passed: readonly string[];
  readonly failed: readonly string[];
  /**
   * An UNQUALIFIED reader looked and formed a view.
   *
   * Separate from `passed`/`failed` because the difference is the whole authority model, and one
   * list holding both is how an unqualified reading gets quoted later as a result. This is real
   * information: it is what a diagnosis works from, and what tells an optimizer which way to move.
   * It certifies nothing, it cannot promote anything, and no count of it is a measurement.
   *
   * A previous version of this type had one `unobservable` bucket, which conflated "nothing could
   * look at this" with "something looked and has no standing". Those are different states and only
   * one of them is useful.
   */
  readonly apparentPass: readonly string[];
  readonly apparentFail: readonly string[];
  /** nothing looked at all — no shape to check and no reader run */
  readonly unobservable: readonly string[];
  readonly obligationsCovered: number;
  readonly obligationsTotal: number;
}

/**
 * The sentence a person may quote from a contract run.
 *
 * Written as a function so there is one wording, and so the caveat cannot be dropped by a caller who
 * only wanted the numbers. It says "constructed" every time on purpose.
 */
export function describeContractResult(r: ContractResult): string {
  const ran = r.passed.length + r.failed.length
    + r.apparentPass.length + r.apparentFail.length + r.unobservable.length;
  const qualified = r.passed.length + r.failed.length;
  return `${ran} constructed case(s) on the ${r.role.toLowerCase()} half`
    + `, covering ${r.obligationsCovered} of ${r.obligationsTotal} obligation(s).`
    + `\n  decided: ${r.passed.length} passed, ${r.failed.length} failed  (of ${qualified} a qualified `
    + 'observer could judge — today that means a machine-checkable shape)'
    + `\n  read by an unqualified reader: ${r.apparentPass.length} appear to pass, `
    + `${r.apparentFail.length} appear to fail  (guides diagnosis; certifies nothing)`
    + `\n  nothing looked: ${r.unobservable.length}`
    + '\n  These are constructed challenges derived from the standard, not independent samples of real'
    + ' work. They say whether the implementation carries the standard. They do not estimate how often'
    + ' it will succeed in deployment, and no confidence interval over them would mean anything.';
}
