// atelier/core/convergence/promotion.ts — THE ONLY PLACE A CANDIDATE MAY BECOME THE SKILL.
//
// PORTED IN LAW from the promotion authority in the private predecessor. Its central clause is kept
// exactly:
// the floor is used as a VETO and never as acceptance — a REGRESSION rejects, and a pass never
// promotes on its own. Its blast-radius clause is not ported, because Atelier renders whole skill
// packages and a model-invisible change is not a category this product has.
//
// ─── EVERY GATE IS SEPARATE, AND EVERY ONE IS EARNED SEPARATELY ────────────────────────────────
//
// This is where the acceptance rule of SSO (Self-Supervised Skill Optimization) is refused. SSO promotes when the judge's wins exceed its
// losses on unlabeled validation — one unqualified instrument supplying both the optimisation signal
// and the authority to act on it. What refusing that costs is the list below, and the cost is the
// point: nothing here can be satisfied by an instrument reporting on its own work.
//
// ─── THE EXACT PACKAGE EVALUATED IS THE EXACT PACKAGE PROMOTED ─────────────────────────────────
//
// Checked by hash, not by intent. A promotion that adopts a rebuild of the evaluated candidate has
// adopted something nobody looked at, however identical the inputs — and "identical inputs" is
// exactly the assumption a build step is entitled to break.

import type { ObserverPermission } from '../measurement/permission.js';
import type { DistinctivenessState, FloorVerdict } from '../distinctiveness/floor.js';
import type { ComparisonVerdict } from '../comparison/compare.js';

export type PromotionAuthority =
  /** ships without a person */
  | 'AUTO_PROMOTE'
  /** rejected without a person — an evidenced negative */
  | 'AUTO_REJECT'
  /** a person decides. The fallback while instruments are unqualified, not a permanent law. */
  | 'HUMAN_GATED';

export interface PromotionEvidence {
  /** the standard both arms were built from. Different standards are not comparable. */
  readonly incumbentStandardHash: string;
  readonly candidateStandardHash: string;
  /** what was actually evaluated, and what is being promoted. Must be identical. */
  readonly evaluatedPackageHash: string;
  readonly candidatePackageHash: string;
  /** did the evaluated invocations serve what they claimed to serve? */
  readonly deliveryValid: boolean;
  /** any previously-passing deterministic invariant now failing. Outranks everything. */
  readonly deterministicRegression: boolean;
  readonly fidelityAuthority: ObserverPermission;
  readonly comparison: ComparisonVerdict;
  readonly distinctiveness: DistinctivenessState;
  readonly floor: FloorVerdict | null;
}

export interface PromotionDecision {
  readonly authority: PromotionAuthority;
  readonly why: string;
  /** every gate that was not satisfied, so the report points somewhere */
  readonly unmet: readonly string[];
}

/**
 * Resolve who may promote.
 *
 * ORDER IS THE POLICY: identity before evidence, evidence before authority. A mismatch of standard
 * or package is not a weak result, it is a comparison of the wrong things, and letting a strong
 * fidelity signal outrank it would promote a package on another package's evidence.
 */
export function resolvePromotion(ev: PromotionEvidence): PromotionDecision {
  const unmet: string[] = [];

  // ── IDENTITY ────────────────────────────────────────────────────────────────────────────────
  if (ev.incumbentStandardHash !== ev.candidateStandardHash) {
    return { authority: 'AUTO_REJECT', unmet: ['same StandardVersion'],
      why: `the candidate is bound to StandardVersion ${ev.candidateStandardHash} and the incumbent to ${ev.incumbentStandardHash}. Promoting would move what good means under cover of an implementation change, which is the one thing this system exists to prevent.` };
  }
  if (ev.evaluatedPackageHash !== ev.candidatePackageHash) {
    return { authority: 'AUTO_REJECT', unmet: ['exact candidate identity'],
      why: `the package evaluated (${ev.evaluatedPackageHash}) is not the package being promoted (${ev.candidatePackageHash}). Whatever was looked at, it was not this.` };
  }
  if (!ev.deliveryValid) {
    return { authority: 'AUTO_REJECT', unmet: ['valid delivery'],
      why: 'the evaluated invocations did not serve what they claimed to serve, so the evidence describes some other artefact' };
  }

  // ── EVIDENCED NEGATIVES: these reject without a person ──────────────────────────────────────
  if (ev.deterministicRegression) {
    return { authority: 'AUTO_REJECT', unmet: ['no deterministic regression'],
      why: 'a previously-passing deterministic invariant now fails. Certain, and it outranks every semantic signal.' };
  }
  if (ev.floor === 'REGRESSION') {
    // The floor as a VETO, which is the placement its measured properties support.
    return { authority: 'AUTO_REJECT', unmet: ['no protected regression'],
      why: 'the distinctiveness floor found a protected behaviour regressed. The floor may block on its own; it may never promote on its own.' };
  }
  if (ev.comparison === 'REGRESSED') {
    return { authority: 'AUTO_REJECT', unmet: ['not worse than the incumbent'],
      why: 'the candidate is worse across independent contexts' };
  }

  // ── AUTHORITY TO PROMOTE. Each earned separately; none implies another. ─────────────────────
  if (ev.fidelityAuthority !== 'CERTIFY') {
    unmet.push(`fidelity observer qualified to CERTIFY (currently ${ev.fidelityAuthority})`);
  }
  if (ev.distinctiveness !== 'EARNED') {
    unmet.push(`distinctiveness floor qualified (currently ${ev.distinctiveness})`);
  }
  if (ev.comparison !== 'IMPROVED') {
    unmet.push(`a resolved improvement (comparison is ${ev.comparison})`);
  }
  // A floor that says NONINFERIOR from an unqualified instrument has said nothing that can authorise.
  if (ev.floor === 'INCONCLUSIVE') {
    unmet.push('a floor verdict the evidence could resolve (currently INCONCLUSIVE)');
  }

  if (unmet.length) {
    return { authority: 'HUMAN_GATED', unmet,
      why: `nothing here can authorise an automatic promotion: ${unmet[0]}. A person may still promote — human promotion is the fallback while instruments are unqualified, not a permanent requirement.` };
  }

  return { authority: 'AUTO_PROMOTE', unmet: [],
    why: 'same standard, exact package, valid delivery, no deterministic or protected regression, a resolved improvement, and every measurement instrument holding the authority its verdict rests on' };
}

export const shipsAutonomously = (d: PromotionDecision): boolean => d.authority === 'AUTO_PROMOTE';
