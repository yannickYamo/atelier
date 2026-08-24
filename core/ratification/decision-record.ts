// atelier/core/ratification/decision-record.ts — THE ONE PLACE HUMAN AUTHORITY IS ACTUALLY EXERCISED,
// AND UNTIL NOW THE ONE PLACE THAT KEPT NO RECORD.
//
// ─── WHAT THE ABSENCE COST ─────────────────────────────────────────────────────────────────────
//
// StandardVersion 2040bfcde7478a0b holds 8 requirements. The discovery run behind it proposed 12.
// What happened to the other 4 cannot be read anywhere — it was recovered by noticing that ids g3,
// g6, g8 and g12 are missing. That is forensics, not a record, and it means the only genuine human
// adjudication the product has ever collected cannot be audited, replayed, or used to calibrate
// anything.
//
// It is also free to capture at the moment it happens and impossible to reconstruct afterwards.
//
// ─── APPEND-ONLY, AND IT STORES WHAT WAS SHOWN, NOT WHAT SURVIVED ──────────────────────────────
//
// The record captures the EXACT proposed state the human was looking at. A record that stored only
// the outcome would answer "what is in the standard" — which the standard already answers — and not
// "what was this person shown, and what did they do about it", which is the only question that can
// tell an approval apart from an edit, or a rejection from a proposal that was never surfaced.
//
// So `EDIT` carries both the proposal AND the human's replacement, and nothing here is ever updated
// in place.

import { createHash } from 'node:crypto';
import type { Requirement } from '../state/canonical-state.js';

export type RatificationDecision =
  /** becomes a requirement */
  | 'APPROVE'
  /** the human rewrote it; both versions are recorded */
  | 'EDIT'
  /** not the expert's rule at all */
  | 'REJECT'
  /**
   * DECIDED, and decided NOT to be an obligation — a preference, an exemplar, something to protect.
   *
   * Added because the four-value vocabulary predated materiality and mapped every non-requirement
   * onto DEFER. That read as "still pending" and depressed recorded survival to 45% on a pass where
   * the author had decided all eleven and left nothing open. A decision that is not an approval is
   * still a decision, and the ledger must be able to say so.
   */
  | 'DECIDED_NOT_A_REQUIREMENT'
  /** genuinely not decided yet — the only value that means "come back to this" */
  | 'DEFER';

/** One human act on one proposal. Immutable once written. */
export interface RatificationRecord {
  readonly recordId: string;
  /** the draft this proposal belonged to, so a decision is anchored to what else was on screen */
  readonly standardDraftHash: string;
  /** EXACTLY what was shown — statement, scope, counterfactual, evidence, provenance */
  readonly shown: Requirement;
  readonly decision: RatificationDecision;
  /** on EDIT, what the human replaced it with. Null for every other decision. */
  readonly humanRevision: Requirement | null;
  /** free text the human volunteered. Never required — an answer is authority without a reason. */
  readonly note: string | null;
  readonly decidedAt: string;
  /** the version this decision fed into, once one is minted. Null while the draft is still open. */
  readonly resultingStandardVersionHash: string | null;
}

export interface RatificationLedger {
  readonly standardDraftHash: string;
  readonly records: readonly RatificationRecord[];
}

/** Content hash of the exact proposal set a human is about to look at. */
export function draftHash(proposals: readonly Requirement[]): string {
  const body = JSON.stringify([...proposals]
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId))
    .map((r) => ({ id: r.requirementId, s: r.statement, w: r.appliesWhen, k: r.kind, c: r.wouldBeAbsentIf })));
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/**
 * Append one decision.
 *
 * Refuses a second decision on the same proposal within one draft. Re-deciding is not an amendment —
 * it is a different act, and it belongs to a new draft with its own hash, or the ledger stops being
 * able to say what the person was looking at when they decided.
 */
export function appendDecision(
  ledger: RatificationLedger, shown: Requirement, decision: RatificationDecision,
  opts: { readonly humanRevision?: Requirement; readonly note?: string; readonly decidedAt: string },
): RatificationLedger {
  if (ledger.records.some((r) => r.shown.requirementId === shown.requirementId)) {
    throw new Error(
      `RATIFICATION LEDGER: ${shown.requirementId} already has a decision in draft ${ledger.standardDraftHash}. `
      + 'The ledger is append-only. Changing your mind is a new draft, not an edit of the record — otherwise '
      + 'nothing can say what was on the screen when the decision was made.');
  }
  if (decision === 'EDIT' && !opts.humanRevision) {
    throw new Error('RATIFICATION LEDGER: an EDIT with no revision records that something changed without recording what.');
  }
  if (decision !== 'EDIT' && opts.humanRevision) {
    throw new Error(`RATIFICATION LEDGER: a ${decision} carries no revision. If the human rewrote it, the decision is EDIT.`);
  }
  return { ...ledger, records: [...ledger.records, {
    recordId: `${ledger.standardDraftHash}:${shown.requirementId}`,
    standardDraftHash: ledger.standardDraftHash,
    shown, decision,
    humanRevision: opts.humanRevision ?? null,
    note: opts.note ?? null,
    decidedAt: opts.decidedAt,
    resultingStandardVersionHash: null,
  }] };
}

/** Stamp the minted version onto every decision that fed it. One-time, and it never rewrites a decision. */
export function stampVersion(ledger: RatificationLedger, versionHash: string): RatificationLedger {
  return { ...ledger, records: ledger.records.map((r) =>
    (r.resultingStandardVersionHash === null ? { ...r, resultingStandardVersionHash: versionHash } : r)) };
}

export interface SurvivalSummary {
  readonly shown: number;
  readonly approved: number;
  readonly edited: number;
  readonly rejected: number;
  /** decided, and decided not to be an obligation */
  readonly decidedNotRequirement: number;
  /** genuinely still open */
  readonly deferred: number;
  /** kept as a requirement — approved plus edited */
  readonly survivalRate: number;
  /** decided at all, in any direction. The number that says whether a pass is finished. */
  readonly decidedRate: number;
  /** RECORDED, as opposed to inferred from id gaps after the fact */
  readonly provenance: 'RECORDED';
}

export function survival(ledger: RatificationLedger): SurvivalSummary {
  const c = (d: RatificationDecision): number => ledger.records.filter((r) => r.decision === d).length;
  const shown = ledger.records.length;
  const approved = c('APPROVE'), edited = c('EDIT'), deferred = c('DEFER');
  return { shown, approved, edited, rejected: c('REJECT'),
    decidedNotRequirement: c('DECIDED_NOT_A_REQUIREMENT'), deferred,
    survivalRate: shown ? (approved + edited) / shown : 0,
    decidedRate: shown ? (shown - deferred) / shown : 0, provenance: 'RECORDED' };
}

/**
 * The historical 12 -> 8, kept for what it is and nothing more.
 *
 * It is INFERRED from missing requirement ids, not read from any record. Holding it in a separate
 * type from `SurvivalSummary` is the point: the two can never be compared or averaged, and a reader
 * cannot mistake the reconstruction for a measurement.
 */
export const HISTORICAL_SURVIVAL_INFERRED = {
  standardVersionHash: '2040bfcde7478a0b',
  proposed: 12,
  survived: 8,
  survivalRate: 8 / 12,
  provenance: 'INFERRED_FROM_ID_GAPS' as const,
  why: 'recovered by observing that requirement ids g3, g6, g8 and g12 are absent from the standard. '
    + 'No ratification record exists for it. Indicative of survival; NOT a measurement of precision, '
    + 'and never to be pooled with recorded decisions.',
} as const;
