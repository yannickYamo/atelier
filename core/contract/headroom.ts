// atelier/core/contract/headroom.ts — WHETHER AN ENDPOINT COULD HAVE ANSWERED THE QUESTION AT ALL.
//
// A remeasurement declared its co-primary MET. Coverage had not gone down, which was the condition
// written before the run. It was also 1.000 in every arm — bare, one-sided and two-sided alike, 0 of
// 70 valid generations wrong — so nothing could have gone down and nothing could have gone up. The
// bootstrap interval was [+0.000, +0.000]. A ZERO-WIDTH INTERVAL IS THE SIGNATURE OF A CONSTANT, not
// of a precise estimate, and the endpoint was reported as a pass.
//
// ─── MEASURABILITY HAS A DIRECTION, WHICH A GENERIC CEILING DETECTOR GETS WRONG ────────────────
//
// "Control is at ceiling, refuse" would be wrong half the time. For ACTIVATION a control at 1.000
// destroys the question: the behaviour is already universal and no implementation can raise it. For
// RESTRAINT a control at 1.000 is the IDEAL baseline — the model never over-applies, so any damage
// the skill does is visible as a fall, and that is exactly how a −0.208 regression was caught.
//
// The same number is a blocker in one direction and the best case in the other. So measurability is
// asked per DIRECTION, never per endpoint.

/** What a comparison is trying to detect. */
export type EndpointDirection =
  /** can the treatment RAISE the rate — needs room above the control */
  | 'LIFT'
  /** can the treatment LOWER the rate — needs room below the control */
  | 'HARM';

export interface EndpointHeadroom {
  readonly controlRate: number;
  /** independent units — CONTEXTS, never generations */
  readonly contexts: number;
  readonly liftMeasurable: boolean;
  readonly harmMeasurable: boolean;
}

export const headroomOf = (controlRate: number, contexts: number): EndpointHeadroom => ({
  controlRate, contexts,
  liftMeasurable: controlRate < 1,
  harmMeasurable: controlRate > 0,
});

export const measurable = (h: EndpointHeadroom, d: EndpointDirection): boolean =>
  d === 'LIFT' ? h.liftMeasurable : h.harmMeasurable;

/**
 * What a report must print instead of a number when the question could not be asked.
 *
 * Never "no significant difference", which reads as a measurement that came back null and invites
 * the reader to conclude the treatment does nothing. Nothing was measured.
 */
export const unmeasurableReason = (h: EndpointHeadroom, d: EndpointDirection): string | null => {
  if (measurable(h, d)) return null;
  return d === 'LIFT'
    ? `UNMEASURABLE_FOR_LIFT — the control is at ${h.controlRate.toFixed(3)} over ${h.contexts} contexts, `
      + 'so the behaviour is already universal and no implementation could raise it. This is not a null result.'
    : `UNMEASURABLE_FOR_HARM — the control is at ${h.controlRate.toFixed(3)} over ${h.contexts} contexts, `
      + 'so there is nothing below it to lose. This is not a null result.';
};

/**
 * A CANDIDATE BEHAVIOUR QUALIFIES FOR A STUDY ONLY IF BOTH SIDES CAN MOVE.
 *
 * Screening on activation alone selects behaviours where the model already over-applies, and then
 * there is no clean test of whether compilation introduces false firing — the failure that has now
 * been measured twice at −0.208. The regime worth studying is the one where the compiler faces a
 * real problem: RAISE the desired behaviour WITHOUT disturbing restraint that already works.
 */
export interface CandidateScreen {
  readonly behaviourId: string;
  readonly activation: EndpointHeadroom;
  readonly restraint: EndpointHeadroom;
}

export interface ScreenVerdict {
  readonly qualifies: boolean;
  readonly why: string;
}

/** How close to perfect a control's restraint must be for damage to be detectable. */
export const RESTRAINT_FLOOR = 0.9;

export function screenCandidate(c: CandidateScreen): ScreenVerdict {
  if (!c.activation.liftMeasurable) {
    return { qualifies: false,
      why: `activation is at ceiling (${c.activation.controlRate.toFixed(3)}) — no implementation could raise it` };
  }
  if (c.activation.controlRate === 0) {
    return { qualifies: false,
      why: 'activation is at the floor (0.000) — the model never does this, so the study measures whether it '
        + 'CAN rather than whether the compiler helps, and any positive result is unattributable' };
  }
  if (c.restraint.controlRate < RESTRAINT_FLOOR) {
    return { qualifies: false,
      why: `restraint is only ${c.restraint.controlRate.toFixed(3)} — the control already over-applies, so `
        + 'compiler-induced false firing cannot be told apart from behaviour that was there first' };
  }
  return { qualifies: true,
    why: `activation ${c.activation.controlRate.toFixed(3)} leaves room to rise and restraint `
      + `${c.restraint.controlRate.toFixed(3)} leaves room to fall — both sides can move` };
}

/**
 * A bootstrap interval of exactly zero width did not estimate anything.
 *
 * Guarded separately from headroom because it catches the case where the arms happen to agree on
 * every context for a reason nobody predicted, which no control rate would reveal.
 */
export const isDegenerateInterval = (lo: number, hi: number): boolean => lo === hi;
