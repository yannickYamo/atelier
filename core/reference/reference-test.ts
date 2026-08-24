// atelier/core/reference/reference-test.ts — THE HELD-OUT EXPERT REFERENCE TEST.
//
// The system-level endpoint. Not a rule observer, not a comparator, not a lexical diagnostic:
//
//   expert goldens -> contextual standard discovery -> HUMAN-RATIFIED StandardVersion
//   -> model-specific compilation -> generation on UNSEEN expert tasks -> the expert's own real work
//
// One question, asked of a person, blinded:
//
//   "Which output better represents how this task should be done according to your standard?"
//
// ─── THE QUESTION IS NOT "WHICH ONE DID YOU WRITE" ─────────────────────────────────────────────
//
// That was the obvious framing and it is wrong. It confounds behavioural fidelity with AUTHORSHIP
// RECOGNITION: an expert recognises their own historical prose from cadence and memory, and would
// score highly against a skill that reproduced their standard perfectly. The test would then measure
// how memorable the author's own writing is to them.
//
// Recognition is still recorded — AFTER the primary judgement, never before — because a result
// obtained while the expert knew which was theirs is a different result, and claiming cognitive
// blinding that did not occur would be the overclaim this whole programme is built to refuse.
//
// ─── UNCERTAIN IS DECLARED CONSERVATIVE, HERE, BEFORE ANY DATA ─────────────────────────────────
//
// UNCERTAIN counts as a FAILURE — as though the golden had been materially better. It is the only
// handling that cannot be chosen after the fact to improve the rate, and the cost of getting it wrong
// falls on the claim rather than on the reader.
//
// ─── WHAT A PASS DOES AND DOES NOT BUY ─────────────────────────────────────────────────────────
//
// Establishes: HELD_OUT_REFERENCE_NONINFERIORITY for this author and this corpus.
// Does NOT establish: absolute fidelity, "guaranteed same style", or that human 2AFC is now an
// autonomous sensor. It does not make PROMOTE reachable without the expert and it does not qualify
// the frozen comparator. It is an external validation anchor against which future autonomous sensors
// may be calibrated — PRODUCT VALIDATION is not MEASUREMENT AUTHORITY.

import { upperBound95 } from './holdout-integrity.js';

/** What the expert may answer. No explanation is requested; the holistic judgement is the authority. */
export type ReferenceJudgement = 'A_BETTER' | 'B_BETTER' | 'NO_MATERIAL_DIFFERENCE' | 'UNCERTAIN';

/** Asked only AFTER the primary judgement is recorded. A diagnostic, never the endpoint. */
export type Recognition = 'YES' | 'NO' | 'UNSURE';

/** One held-out task. The side assignment is sealed before any labelling. */
export interface ReferencePair {
  readonly contextId: string;
  readonly task: string;
  /** which physical side carries the expert's real work */
  readonly goldenSide: 'A' | 'B';
  readonly aText: string;
  readonly bText: string;
}

export interface ReferenceLabel {
  readonly contextId: string;
  readonly judgement: ReferenceJudgement;
  readonly recognizedOriginal: Recognition;
}

/** Per-context outcome after unblinding. */
export type Outcome = 'GOLDEN_MATERIALLY_BETTER' | 'SKILL_MATERIALLY_BETTER' | 'NO_MATERIAL_DIFFERENCE' | 'UNCERTAIN';

export function outcomeOf(pair: ReferencePair, label: ReferenceLabel): Outcome {
  if (label.judgement === 'UNCERTAIN') return 'UNCERTAIN';
  if (label.judgement === 'NO_MATERIAL_DIFFERENCE') return 'NO_MATERIAL_DIFFERENCE';
  const preferred = label.judgement === 'A_BETTER' ? 'A' : 'B';
  return preferred === pair.goldenSide ? 'GOLDEN_MATERIALLY_BETTER' : 'SKILL_MATERIALLY_BETTER';
}

/** A failure is the golden winning. UNCERTAIN is counted as one, declared before any data exists. */
export const UNCERTAIN_HANDLING = {
  rule: 'UNCERTAIN counts as GOLDEN_MATERIALLY_BETTER for the primary estimand',
  why: 'it is the conservative direction for a non-inferiority claim, and it is the only handling that '
    + 'cannot be selected after the fact to improve the rate. Discarding UNCERTAIN once the results are '
    + 'in would raise the pass rate by removing exactly the cases that did not support it.',
} as const;

export const isFailure = (o: Outcome): boolean => o === 'GOLDEN_MATERIALLY_BETTER' || o === 'UNCERTAIN';

export interface ReferenceResult {
  readonly n: number;
  readonly outcomes: readonly { readonly contextId: string; readonly outcome: Outcome; readonly recognized: Recognition }[];
  readonly failures: number;
  readonly upperBound95: number;
  readonly bar: number;
  readonly decision:
    | 'HELD_OUT_REFERENCE_NONINFERIORITY_ESTABLISHED'
    | 'HELD_OUT_REFERENCE_NONINFERIORITY_NOT_ESTABLISHED'
    | 'UNDERPOWERED';
  /** the same computation over the pairs the expert did NOT recognise, when there are enough */
  readonly nonRecognized: { readonly n: number; readonly failures: number; readonly upperBound95: number } | null;
  readonly why: string;
}

/**
 * Score, after unblinding.
 *
 * UNDERPOWERED is a distinct verdict from NOT_ESTABLISHED and the difference is the whole point: an
 * experiment that could not have detected the effect has produced no result, and reporting that as a
 * negative retires a claim the evidence never tested.
 */
export function scoreReference(
  pairs: readonly ReferencePair[], labels: readonly ReferenceLabel[], bar: number, requiredN: number,
): ReferenceResult {
  const outcomes = pairs.map((p) => {
    const l = labels.find((x) => x.contextId === p.contextId);
    if (!l) throw new Error(`REFERENCE TEST: no label for ${p.contextId}. Scoring a partial tranche would silently drop the contexts the expert found hardest.`);
    return { contextId: p.contextId, outcome: outcomeOf(p, l), recognized: l.recognizedOriginal };
  });
  const failures = outcomes.filter((o) => isFailure(o.outcome)).length;
  const n = outcomes.length;
  const bound = upperBound95(failures, n);

  const nr = outcomes.filter((o) => o.recognized === 'NO');
  const nonRecognized = nr.length >= 3
    ? { n: nr.length, failures: nr.filter((o) => isFailure(o.outcome)).length,
        upperBound95: upperBound95(nr.filter((o) => isFailure(o.outcome)).length, nr.length) }
    : null;

  const decision = n < requiredN
    ? 'UNDERPOWERED' as const
    : bound <= bar
      ? 'HELD_OUT_REFERENCE_NONINFERIORITY_ESTABLISHED' as const
      : 'HELD_OUT_REFERENCE_NONINFERIORITY_NOT_ESTABLISHED' as const;

  const why = decision === 'UNDERPOWERED'
    ? `${n} independent held-out context(s) against ${requiredN} required. The bound is ${(bound * 100).toFixed(0)}%, which excludes nothing. This is not a negative result — it is an unmeasured one.`
    : decision === 'HELD_OUT_REFERENCE_NONINFERIORITY_ESTABLISHED'
      ? `the expert preferred their own held-out work in ${failures} of ${n} contexts; the 95% upper bound on that rate is ${(bound * 100).toFixed(0)}%, within the ${(bar * 100).toFixed(0)}% declared before any generation. For THIS author and THIS corpus, and it is not absolute fidelity.`
      : `the expert preferred their own held-out work in ${failures} of ${n} contexts; the 95% upper bound is ${(bound * 100).toFixed(0)}%, above the ${(bar * 100).toFixed(0)}% declared before any generation.`;

  return { n, outcomes, failures, upperBound95: bound, bar, decision, nonRecognized, why };
}

/** The instruction block a person reads. Deliberately says nothing about origin, version or sensors. */
export const PRIMARY_QUESTION =
  'Which output better represents how this task should be done according to your standard?';

export const LABELLING_INSTRUCTIONS = `${PRIMARY_QUESTION}

  A_BETTER · B_BETTER · NO_MATERIAL_DIFFERENCE · UNCERTAIN

No explanation is needed. Your holistic judgement is the authority here — there is no rubric behind
this and no rule you are being asked to apply.

Then, and only after you have written your answer: did you RECOGNISE one of them as something you
wrote? YES / NO / UNSURE. It changes nothing about your first answer; it is recorded so the result can
be reported honestly rather than described as blind when it was not.`;
