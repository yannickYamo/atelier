// atelier/core/discovery/calibration-provenance.ts — CASES THAT SHAPED A RULE CANNOT ALSO TEST IT.
//
// ─── THE MISTAKE THIS EXISTS TO MAKE UNSAYABLE ─────────────────────────────────────────────────
//
// An expert ruled on 24 passages. Those rulings were used to diagnose that a discovered rule's
// wording named a frequent realization as its invariant, and to write a sharper one. The refined
// rule now explains most of those 24 — of course it does, it was written from them.
//
// Scoring it on them would report HOW WELL IT WAS FITTED and would be indistinguishable, afterwards,
// from reporting how well it observes. The reserve machinery in this repo already refuses that for
// corpus evidence; nothing refused it for calibration cases, which are the same hazard one layer up.
//
// ─── WHY A CONVENTION IS NOT ENOUGH ────────────────────────────────────────────────────────────
//
// "We know not to reuse those" is exactly the kind of rule that holds until someone is in a hurry
// and the file is right there. The set is sealed with the version it produced, and a validation run
// that names any case from it is refused rather than warned about.

import { createHash } from 'node:crypto';

export type CaseRole =
  /** shaped the refinement. Spent. Never scores anything. */
  | 'DEVELOPMENT'
  /** never seen by the refinement process. The only role that may score. */
  | 'VALIDATION';

export interface SealedCalibrationSet {
  /** the wording these cases produced */
  readonly refinedStatement: string;
  readonly role: CaseRole;
  readonly caseIds: readonly string[];
  readonly sealedAt: string;
  readonly setHash: string;
}

export function sealCalibrationSet(
  refinedStatement: string, role: CaseRole, caseIds: readonly string[], sealedAt: string,
): SealedCalibrationSet {
  const ids = [...caseIds].sort();
  return {
    refinedStatement, role, caseIds: ids, sealedAt,
    setHash: createHash('sha256').update(JSON.stringify({ refinedStatement, role, ids })).digest('hex').slice(0, 16),
  };
}

export class DevelopmentCasesReused extends Error {
  constructor(readonly offending: readonly string[]) {
    super(
      `${offending.length} case(s) in this validation set shaped the rule being validated: `
      + `${offending.join(', ')}. A rule scored on the cases that produced it reports how well it was `
      + 'fitted, and afterwards nothing can separate that from how well it observes. Use fresh cases.');
    this.name = 'DevelopmentCasesReused';
  }
}

/**
 * Refuse a validation set that overlaps the development set. Refuses on ONE shared case.
 *
 * Not a ratio and not a warning: a threshold would invite arguing about how much contamination is
 * tolerable, and the answer is none.
 */
export function assertNoReuse(
  development: SealedCalibrationSet, validationCaseIds: readonly string[],
): void {
  const dev = new Set(development.caseIds);
  const offending = validationCaseIds.filter((id) => dev.has(id));
  if (offending.length) throw new DevelopmentCasesReused(offending);
}

/**
 * A validation set must also be big enough to say anything, and carry both classes.
 *
 * Separate from the reuse check because they fail for different reasons and a caller fixes them
 * differently.
 */
export const MIN_VALIDATION_CASES = 12;

export class ValidationSetTooThin extends Error {}

export function assertValidationUsable(labels: readonly { readonly label: string }[]): void {
  const decided = labels.filter((l) => l.label !== 'UNSURE');
  if (decided.length < MIN_VALIDATION_CASES) {
    throw new ValidationSetTooThin(
      `${decided.length} decided cases; ${MIN_VALIDATION_CASES} is the floor. Abstentions are a real `
      + 'answer and are excluded, so a set can be large and still too thin to score.');
  }
  const yes = decided.filter((l) => l.label === 'YES').length;
  if (yes === 0 || yes === decided.length) {
    throw new ValidationSetTooThin(
      'every decided case is the same class, so agreement cannot be told from a constant answer.');
  }
}
