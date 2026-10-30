// atelier/core/reference/holdout-integrity.ts — PROVE THE HOLDOUT BEFORE SPENDING A CENT.
//
// A held-out reference test compares a compiled skill's work against the author's REAL work on the
// same task. Its entire value rests on one property: the reference artifact must not have been read
// by anything that shaped the skill. A single contaminated item does not weaken the result — it makes
// the result mean something else, and nothing downstream can tell the difference.
//
// ─── WHY THIS IS CODE AND NOT A CHECKLIST ──────────────────────────────────────────────────────
//
// The temptation at the end of a campaign is to notice that n is too small, look at what is left, and
// decide that some item is "clean enough". That reconstruction happens AFTER seeing which items would
// be convenient, which is the moment the holdout stops being a holdout. So the audit runs first, it
// runs from recorded consumption rather than from judgement, and its refusal is a return value the
// caller cannot ignore.
//
// ─── THE CONSUMPTION CATEGORIES ────────────────────────────────────────────────────────────────
//
// Any one of these disqualifies an item. They are separate because they contaminate by different
// routes and a single "was it used?" flag would hide which route.

/** Every way an artifact can have shaped the thing being tested. Any one disqualifies it. */
export type Consumption =
  /** read by the proposer */
  | 'DISCOVERY'
  /** read while assembling the draft standard */
  | 'STANDARD_DRAFT'
  /** shown to the author while they ratified */
  | 'RATIFICATION'
  /** used to derive or narrow an appliesWhen condition */
  | 'APPLIES_WHEN'
  /** used to choose a carrier or implementation */
  | 'IMPLEMENTATION_SELECTION'
  /** used while developing a repair */
  | 'REPAIR_DEVELOPMENT'
  /** used to build or tune a probe */
  | 'PROBE_DEVELOPMENT'
  /** used in the controlled-contrast construct test */
  | 'C0'
  /** used to tune or qualify any observer or comparator */
  | 'SENSOR_TUNING'
  /**
   * READ BY THE PERSON BUILDING THE SYSTEM, DECLARED BY THEM.
   *
   * The other nine are recorded by the machinery that did the reading. This one cannot be: nothing
   * here can observe a person opening a file. It is self-declared, which makes it weaker evidence
   * and does not make it worthless — a promise in a protocol document has no consequence, and a
   * declaration here refuses the item at audit without anyone having to remember why.
   *
   * It is also the only consumption that may be recorded against a RESERVED unit. Every other route
   * is refused there, because spending the reserve is the thing the reserve exists to prevent. This
   * one is not a request to spend it; it is a report that it was already spent, and refusing to
   * record that would leave the contamination invisible, which is the worse outcome.
   */
  | 'BUILDER_VIEWED';

export interface HoldoutCandidate {
  readonly itemId: string;
  /** absolute path, so a record can be re-audited later without guessing what it named */
  readonly path: string;
  /** what actually consumed it, from the record. Empty means clean. */
  readonly consumedBy: readonly Consumption[];
  /**
   * The task may be reused under the ORIGINAL frozen split semantics — a held-out item's task is what
   * the skill is asked to do. Its OUTPUT is the reference and must never have been read.
   */
  readonly taskReusableUnderFrozenSplit: boolean;
}

export interface IntegrityVerdict {
  readonly clean: readonly HoldoutCandidate[];
  readonly contaminated: readonly { readonly item: HoldoutCandidate; readonly why: string }[];
  readonly requiredN: number;
  readonly sufficient: boolean;
  readonly terminal: 'PROCEED' | 'BLOCKED_ON_HOLDOUT_INTEGRITY';
  readonly why: string;
}

/**
 * Exact one-sided 95% binomial upper bound on a rate, given k failures in n trials.
 *
 * The same arithmetic the sensor campaigns used, and it is reused rather than rewritten because a
 * second implementation of a bound is a second place for it to disagree with itself.
 */
export function upperBound95(k: number, n: number): number {
  if (n <= 0) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i += 1) {
    const m = (lo + hi) / 2;
    let tail = 0;
    for (let j = 0; j <= k; j += 1) {
      let c = 1;
      for (let t = 0; t < j; t += 1) c = (c * (n - t)) / (t + 1);
      tail += c * m ** j * (1 - m) ** (n - j);
    }
    if (tail >= 0.05) lo = m; else hi = m;
  }
  return lo;
}

/** Smallest n whose zero-failure bound clears `bar`. The sizing question, answered from the bar. */
export function nForBar(bar: number, allowedFailures = 0): number {
  for (let n = allowedFailures + 1; n <= 500; n += 1) if (upperBound95(allowedFailures, n) <= bar) return n;
  return Number.POSITIVE_INFINITY;
}

/**
 * Audit, and refuse rather than proceed thin.
 *
 * `bar` is the predeclared reference-superiority rate the experiment must be able to bound. It is an
 * INPUT because moving it is an authority act belonging to the person whose standard is under test —
 * and because a function that picked its own bar could always find one its data happened to clear.
 */
export function auditHoldout(
  candidates: readonly HoldoutCandidate[], bar: number, allowedFailures = 0,
): IntegrityVerdict {
  const contaminated = candidates
    .filter((c) => c.consumedBy.length > 0)
    .map((item) => ({ item, why: `read by ${item.consumedBy.join(', ')}. Its output shaped the skill under test, so a comparison against it measures the skill against its own training material.` }));
  const clean = candidates.filter((c) => c.consumedBy.length === 0);
  const requiredN = nForBar(bar, allowedFailures);
  const sufficient = clean.length >= requiredN;

  return {
    clean, contaminated, requiredN, sufficient,
    terminal: sufficient ? 'PROCEED' : 'BLOCKED_ON_HOLDOUT_INTEGRITY',
    why: sufficient
      ? `${clean.length} uncontaminated held-out artefact(s) against ${requiredN} required to bound the rate at ${(bar * 100).toFixed(0)}%.`
      : `${clean.length} uncontaminated held-out artefact(s); ${requiredN} are required to bound the reference-superiority rate at ${(bar * 100).toFixed(0)}% with ${allowedFailures} failure(s) allowed. `
        + `At n=${clean.length} the bound is ${(upperBound95(allowedFailures, clean.length) * 100).toFixed(0)}%. `
        + 'This is a STRUCTURAL block and not a budget one: no amount of inference creates a second held-out artefact. '
        + 'Enlarging the corpus, or lowering the bar BEFORE any generation, are the only two legal moves.',
  };
}
