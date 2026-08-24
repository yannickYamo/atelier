// atelier/core/golden/reservation.ts — RESERVE BEFORE ANYTHING READS, OR THERE IS NOTHING TO RESERVE.
//
// ─── THE FAILURE THIS EXISTS TO PREVENT, WHICH ALREADY HAPPENED ────────────────────────────────
//
// A four-artefact corpus produced a ratified eight-requirement standard and left exactly ONE
// uncontaminated held-out artefact. Nothing went wrong at any single step: discovery read what it
// needed, every campaign used what was available, and each decision was locally correct. The
// validation set was never taken — it was simply never set aside, and by the time anyone looked for
// one, there was no un-spent evidence left to make it out of.
//
// That is the shape of the failure: it is not a mistake anybody makes, it is a mistake that happens
// while nobody makes one. Which is why reservation is a GATE at the front and not a policy.
//
// ─── RESERVATION IS ONLY REAL IF IT PRECEDES CONSUMPTION ───────────────────────────────────────
//
// A split chosen after discovery has run is not a holdout, whatever it is called. `reserve` refuses
// any unit that already carries consumption, and it refuses per-unit rather than in aggregate so the
// caller learns WHICH ones — an aggregate refusal invites the caller to drop the whole set and start
// again, which is how a clean corpus quietly becomes a contaminated one.
//
// ─── AND THE RESERVE IS SIZED BY THE CLAIM, NOT BY A FRACTION ──────────────────────────────────
//
// "Hold out 20%" is the wrong instruction. 20% of ten decisions in one repository is two decisions
// from that same repository, which supports no cross-project claim at any n. The reserve is sized
// from the bar the claim will eventually have to clear, in the unit that claim makes a denominator.
//
// ─── RESERVING BY CLUSTER WAS TOO STRONG, AND IT COST REAL EVIDENCE ────────────────────────────
//
// The first version of this file reserved whole clusters, reasoning that same-cluster evidence is
// dependent. It is — and that is a fact about the UNCERTAINTY, not a reason to refuse the data.
//
// Discovery reads PRs 1-8 of repository R; PRs 9-12 are reserved at intake and their expert patches
// are never read. For a claim scoped INSIDE repository R those four are valid held-out decision
// contexts. For a claim scoped ACROSS projects they are one cluster. Cluster-wide reservation made
// them unusable for either, to avoid a dependence the interval already knows how to handle.
//
// So reservation is BY UNIT. Contamination is the unit's OWN reference having been consumed, and the
// anti-leakage rule is not one inch weaker for being stated precisely. What changes is that
// `CLEAN_BUT_CORRELATED` is now a reportable, usable state instead of a silently discarded one.

import { nForBar, upperBound95, type Consumption } from '../reference/holdout-integrity.js';
import {
  claimUnitCount, clusteringUnaccounted, evidenceStateOf, isContaminated, independentUnitFor,
  type GoldenUnit, type ClaimScope, type EvidenceState,
} from './golden-unit.js';

export interface Reservation {
  /** free for discovery, ratification, repair, probes — everything */
  readonly discovery: readonly GoldenUnit[];
  /** frozen. Never read by the optimizer, never shown during ratification. */
  readonly reserved: readonly GoldenUnit[];
  readonly claimScope: ClaimScope;
  readonly bar: number;
  /** DENOMINATOR the reserve supplies for THIS claim. Not an independent-trial count — see below. */
  readonly reservedClaimUnits: number;
  /**
   * True when the reserve's claim units sit inside fewer clusters than there are units.
   *
   * CONSUMER: `why` states it, and any caller computing an interval must branch on it — a binomial
   * over `reservedClaimUnits` is only defensible when this is false. When it is true the interval
   * belongs to `contextClusteredInterval`, which computes on between-cluster variation.
   */
  readonly clusteringUnaccounted: boolean;
  /** per-unit classification, so "clean but correlated" is visible rather than inferred */
  readonly reservedStates: readonly { readonly unitId: string; readonly state: EvidenceState }[];
  readonly requiredN: number;
  /** what the reserve can bound today at zero failures. Honest before any result exists. */
  readonly attainableBound: number;
  readonly sufficientForClaim: boolean;
  readonly why: string;
}

export interface ReservationRefusal {
  readonly refused: true;
  readonly reason: 'ALREADY_CONSUMED' | 'NOTHING_TO_RESERVE';
  /** named, so the caller can see exactly which units are already spent */
  readonly offendingUnitIds: readonly string[];
  readonly why: string;
}

/**
 * Split a corpus BY UNIT, before anything reads it.
 *
 * `reserveUnitIds` names the individual decisions frozen. Reserving four PRs out of a repository
 * discovery will read the rest of is LEGAL and useful — see the header. What is refused is a unit
 * whose OWN reference has already been consumed, which is the actual leak.
 *
 * A caller whose reserve cannot reach the bar gets `sufficientForClaim: false`, never a refusal.
 * That state is Level 1: enough to build a standard, not enough to certify one. Refusing there would
 * block onboarding to protect a claim nobody is making yet.
 */
export function reserve(
  units: readonly GoldenUnit[], reserveUnitIds: readonly string[],
  claimScope: ClaimScope, bar: number, allowedFailures = 0,
): Reservation | ReservationRefusal {
  if (!units.length) {
    return { refused: true, reason: 'NOTHING_TO_RESERVE', offendingUnitIds: [],
      why: 'an empty corpus. There is nothing to split and nothing to discover from.' };
  }

  const wanted = new Set(reserveUnitIds);
  // THE ANTI-LEAKAGE RULE, and the whole of it: a unit whose own reference was consumed cannot be
  // reserved. Correlation with consumed evidence does NOT disqualify — it is reported instead.
  const leaked = units.filter((u) => wanted.has(u.unitId) && isContaminated(u));
  if (leaked.length) {
    return { refused: true, reason: 'ALREADY_CONSUMED',
      offendingUnitIds: leaked.map((u) => u.unitId),
      why: `${leaked.length} unit(s) named for the reserve have already had their reference read: `
        + `${leaked.map((u) => `${u.unitId} (${u.provenance.consumedBy.join(', ')})`).join('; ')}. `
        + 'A reference something has already read cannot test whether the standard generalises, whatever it is called.' };
  }

  const reserved = units.filter((u) => wanted.has(u.unitId));
  const discovery = units.filter((u) => !wanted.has(u.unitId));

  const reservedClaimUnits = claimUnitCount(reserved, claimScope);
  const requiredN = nForBar(bar, allowedFailures);
  const attainableBound = upperBound95(allowedFailures, reservedClaimUnits);
  const sufficientForClaim = reservedClaimUnits >= requiredN;
  // Classified against the WHOLE corpus, so a reserved unit sharing a repository with a consumed one
  // is correctly reported CLEAN_BUT_CORRELATED rather than silently counted as CLEAN.
  const reservedStates = reserved.map((u) => ({ unitId: u.unitId, state: evidenceStateOf(u, units) }));
  const clustered = clusteringUnaccounted(reserved, claimScope);
  const correlated = reservedStates.filter((r) => r.state === 'CLEAN_BUT_CORRELATED').length;

  const clusterNote = clustered
    ? ` These are the right denominator for the claim and NOT independent trials — compute any interval cluster-aware, never as a binomial over ${reservedClaimUnits}.`
    : '';
  const corrNote = correlated
    ? ` ${correlated} of them are CLEAN_BUT_CORRELATED: their own references are untouched, and they share an artifact with evidence discovery read. That is usable, and it belongs in the uncertainty rather than in a refusal.`
    : '';

  return {
    discovery, reserved, claimScope, bar, reservedClaimUnits, clusteringUnaccounted: clustered,
    reservedStates, requiredN, attainableBound, sufficientForClaim,
    why: (sufficientForClaim
      ? `${reserved.length} unit(s) reserved, ${reservedClaimUnits} claim unit(s) by ${independentUnitFor(claimScope)}. Enough to bound the failure rate at ${(bar * 100).toFixed(0)}%.`
      : `${reserved.length} unit(s) reserved, ${reservedClaimUnits} claim unit(s) by ${independentUnitFor(claimScope)} — ${requiredN} would be needed to bound at ${(bar * 100).toFixed(0)}%. `
        + `Today this reserve can bound the rate at ${(attainableBound * 100).toFixed(0)}% and no lower. `
        + 'That is not a blocker: the standard can be built, ratified and used. It is the certified claim that is not yet available, and the reserve grows from real work.'
    ) + clusterNote + corrNote,
  };
}

/**
 * Mark units consumed. The ONLY legal way evidence moves from unreserved to spent.
 *
 * Refuses to touch a reserved unit — which is the entire guarantee. The optimizer runs continuously
 * and the reserve has to survive every future pass without anyone remembering it exists.
 */
export function markConsumed(
  units: readonly GoldenUnit[], reservation: Reservation, unitIds: readonly string[], by: Consumption,
): readonly GoldenUnit[] {
  const frozen = new Set(reservation.reserved.map((u) => u.unitId));
  const violating = unitIds.filter((id) => frozen.has(id));
  if (violating.length) {
    throw new Error(
      `RESERVED EVIDENCE: ${violating.join(', ')} ${violating.length === 1 ? 'is' : 'are'} reserved and cannot be read by ${by}. `
      + 'The reserve is the only evidence that can ever test whether the standard generalises. Spending it on '
      + 'discovery buys a slightly better standard and permanently forfeits the ability to show it works.');
  }
  const touch = new Set(unitIds);
  return units.map((u) => (touch.has(u.unitId) && !u.provenance.consumedBy.includes(by)
    ? { ...u, provenance: { ...u.provenance, consumedBy: [...u.provenance.consumedBy, by] } }
    : u));
}

/**
 * Units arriving from real use — the Level 2 mechanism.
 *
 * HONEST SCOPE, carried in the type rather than in a footnote: evidence reserved from use is not
 * exchangeable with an onboarding corpus. It is later in time, on tasks the user chose WHILE USING
 * the tool, plausibly shaped by it. It supports "reproduces the expert on the work they bring to
 * Atelier" and not "on their work in general", and the difference has to survive into whatever claim
 * eventually cites it.
 */
export const PROSPECTIVE_SCOPE_CAVEAT =
  'reserved from real use: supports "reproduces the expert on the work they bring to Atelier", '
  + 'NOT "on their work in general". The tasks were chosen while using the tool and may be shaped by it.';

export type ProspectiveUnit = GoldenUnit & { readonly reservedFromUse: true; readonly scopeCaveat: string };

/** Freeze a unit produced by real work. Reserved at creation — there is no window in which it is readable. */
export function reserveFromUse(unit: GoldenUnit): ProspectiveUnit {
  if (unit.provenance.consumedBy.length) {
    throw new Error(`RESERVED EVIDENCE: ${unit.unitId} has already been read by ${unit.provenance.consumedBy.join(', ')}; it cannot become validation evidence now.`);
  }
  return { ...unit, reservedFromUse: true, scopeCaveat: PROSPECTIVE_SCOPE_CAVEAT };
}
