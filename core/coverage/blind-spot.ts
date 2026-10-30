// atelier/core/coverage/blind-spot.ts — WHAT THE STANDARD DOES NOT EXPLAIN AT ALL.
//
// ─── THE FAILURE THIS WOULD HAVE CAUGHT ────────────────────────────────────────────────────────
//
// StandardVersion 2040bfcde7478a0b holds 8 requirements, every one about argument structure and
// evidence handling. It says nothing about form, rhythm, register, punctuation or lexis — because it
// came from a single discovery vantage whose prompt said "not a description of their style", and that
// vantage cannot see the layer it excludes by construction.
//
// Per-requirement coverage was blind to this and always would be. Each of the 8 could be perfectly
// supported, richly evidenced, boundary-probed and saturated, and the standard would still be silent
// on a layer that decides whole classes of task. Twenty rules could all concern endings and nothing
// in `standard-coverage.ts` would remark on it.
//
// So this asks the complementary question, at the level of the standard rather than the requirement:
//
//     WHAT RECURRENT, EVIDENCE-BACKED BEHAVIOUR DOES THE CURRENT DRAFT NOT EXPLAIN AT ALL?
//
// ─── OPEN-WORLD, AND THAT IS THE WHOLE DESIGN ──────────────────────────────────────────────────
//
// The tempting implementation is a checklist of craft dimensions — lexis, punctuation, rhythm,
// emotion — with the standard scored against it. That re-imports the expert-system failure with our
// own ontology, and it is empirically wrong here: when the unexplained behaviours of one author were
// clustered bottom-up they did NOT organise by craft category. They organised by DECISION SITE —
// how to open a section, how to transition, how to structure a list, whether to explain rationale,
// how to close. The author's real axes were not on anybody's list.
//
// So the input is clusters observed in the evidence, and no taxonomy appears anywhere in this file.
//
// ─── AND IT IS NOT A SCORE ─────────────────────────────────────────────────────────────────────
//
// No completeness percentage. "82% covered" invites a threshold, and a standard silent on one
// decisive dimension is not 82% of a standard — it is a standard that will be confidently wrong in a
// whole class of situations. The output is a list of unexplained concerns with their support.

import type { EvidenceSupport } from './candidate-support.js';

/** A behaviour cluster observed in the evidence that no current requirement accounts for. */
export interface UnrepresentedRecurrentBehavior {
  /** named from its own members, never from a supplied category list */
  readonly concern: string;
  readonly support: EvidenceSupport;
  /** verbatim spans, so a person can check it rather than take it on trust */
  readonly evidenceSpans: readonly string[];
  /** do the observing cells agree about what the behaviour IS? */
  readonly internallyConsistent: boolean;
}

export interface StandardBlindSpots {
  readonly standardDraftHash: string;
  /**
   * Were any observed behaviours supplied to check against?
   *
   * FALSE IS NOT "NO BLIND SPOTS". It is "not measured", and the two must never print the same
   * sentence. An earlier caller passed an empty list and the report said every behaviour was
   * accounted for — a signal that announces all-clear without having looked is worse than no signal,
   * because a missing report invites the question and a green one closes it.
   */
  readonly computed: boolean;
  /** clusters no requirement explains, strongest support first */
  readonly unrepresented: readonly UnrepresentedRecurrentBehavior[];
  /** clusters observed but too weakly recurring to be worth a person's attention */
  readonly belowAttention: number;
  readonly why: string;
}

/**
 * Which observed clusters the draft fails to explain.
 *
 * `explainedBy` is supplied rather than computed: deciding whether a requirement accounts for a
 * behaviour is a semantic judgment, and it belongs to the same matching step that produced the
 * clusters — not to a second, quietly different opinion living here.
 *
 * `attentionFloor` is a floor on ROBUSTNESS, not on evidence. A concern that appeared under one
 * discovery condition is one condition's idea; one that survives several has survived a change of
 * question or of examples. It still is not independent expert evidence, and `EvidenceSupport` keeps
 * that visible wherever this is reported.
 */
export function blindSpotsOf(
  standardDraftHash: string,
  clusters: readonly UnrepresentedRecurrentBehavior[],
  attentionFloor = 4,
): StandardBlindSpots {
  const above = clusters.filter((c) => c.support.discoveryCellRecurrence >= attentionFloor);
  const unrepresented = [...above].sort((a, b) =>
    b.support.uniqueArtifacts - a.support.uniqueArtifacts
    || b.support.discoveryCellRecurrence - a.support.discoveryCellRecurrence
    || a.concern.localeCompare(b.concern));

  if (!clusters.length) {
    return { standardDraftHash, computed: false, unrepresented: [], belowAttention: 0,
      why: 'NOT COMPUTED — no observed behaviours were supplied to check the draft against. This is not '
        + 'a finding that the standard is complete; nothing was looked at. A standard can be perfectly '
        + 'supported per requirement and silent on a whole layer, and only this check would say so.' };
  }
  return {
    standardDraftHash, computed: true, unrepresented, belowAttention: clusters.length - above.length,
    why: unrepresented.length
      ? `${unrepresented.length} recurrent behaviour(s) in your own work that none of the current requirements `
        + `explain. This is not a gap in how well the standard is supported — each requirement may be `
        + `perfectly evidenced. It is a gap in what the standard is ABOUT, and a single discovery vantage `
        + `cannot see the layer it excludes by construction.`
      : 'every recurrent behaviour observed in the evidence is accounted for by some current requirement.',
  };
}

/**
 * The ratification question this signal exists to make askable.
 *
 * Legitimate only AFTER discovery: asked before, it is a taxonomy the person fills in; asked after,
 * with concrete unexplained behaviours in hand, it is a question about their own work.
 */
export const BLIND_SPOT_QUESTION =
  'What could someone do badly in your kind of work that none of these rules would catch?';

/** What this signal may and may not support. It reports silence; it never fills it. */
export const BLIND_SPOT_AUTHORITY = {
  maySupport: [
    'showing the author behaviour their draft does not explain',
    'ordering which unexplained concern to look at first',
    'refusing to call a standard complete because its requirements are well supported',
  ],
  mayNeverSupport: [
    'adding a requirement without the author',
    'scoring a standard for completeness',
    'asserting that an unexplained behaviour SHOULD be a requirement',
  ],
  why: 'an unexplained recurrence is a question for the person whose work it is. Recurrence establishes '
    + 'that they did it, never that an output failing to do it would be worse.',
} as const;
