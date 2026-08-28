// atelier/core/contract/diversity.ts — INDEPENDENT SAMPLING DOES NOT GIVE INDEPENDENT CONTEXTS.
//
// Asked the same question eight times with no memory, a generator converges. One frozen suite had 13
// near-duplicate pairs, one at 0.82 token overlap, and ALL OF THEM were in the restraint arm — the
// endpoint that carried the study's finding. Eight "independent" contexts were about three
// scenarios, so the interval would have been computed over an effective n far below the n reported.
//
// ─── THE REJECTIONS ARE THE EVIDENCE, AND THEY USED TO BE THROWN AWAY ──────────────────────────
//
// The first version of this gate wrote its decisions to stderr and sealed only the surviving cases.
// The threshold was applied, but nothing in the artifact could show WHAT it excluded, or even that
// it ran before the freeze rather than after. A filter whose decisions are unrecorded is a claim
// about the suite, not a property of it. So the ledger is part of the sealed object: candidates,
// the decision on each, and the case it collided with.

/**
 * Token overlap: |A ∩ B| / |A ∪ B| over words of four or more letters.
 *
 * Deliberately crude. It is a REFUSAL CRITERION, not a similarity model — its job is to catch the
 * generator rewriting the same scenario, which shows up as heavy shared vocabulary. A semantic
 * measure would be better at ranking and worse here, because it would need a model, and a gate that
 * needs inference cannot run inside suite generation without becoming another thing to validate.
 */
export const tokenOverlap = (a: string, b: string): number => {
  const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const A = words(a); const B = words(b);
  if (A.size === 0 && B.size === 0) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

/** The ceiling a candidate must stay under. Worst pair in the suite this produced fell to 0.15. */
export const MAX_OVERLAP = 0.35;

export interface DiversityDecision {
  readonly candidate: string;
  readonly accepted: boolean;
  /** the accepted case it collided with, when rejected */
  readonly collidedWith: string | null;
  readonly overlap: number;
}

/** Everything the gate did, in order. Sealed with the suite so exclusions stay auditable. */
export interface DiversityLedger {
  readonly threshold: number;
  readonly decisions: readonly DiversityDecision[];
}

/**
 * Would this candidate be admitted, given what is already accepted?
 *
 * Compared against EVERY accepted case rather than the previous one: the failure mode is a
 * generator returning to a scenario it used four candidates ago, which a pairwise-with-last check
 * cannot see.
 */
export function judgeCandidate(
  candidate: string, accepted: readonly { readonly id: string; readonly task: string }[],
  threshold: number = MAX_OVERLAP,
): DiversityDecision {
  let worst: { id: string; overlap: number } | null = null;
  for (const a of accepted) {
    const o = tokenOverlap(a.task, candidate);
    if (worst === null || o > worst.overlap) worst = { id: a.id, overlap: o };
  }
  if (worst !== null && worst.overlap > threshold) {
    return { candidate, accepted: false, collidedWith: worst.id, overlap: worst.overlap };
  }
  return { candidate, accepted: true, collidedWith: null, overlap: worst?.overlap ?? 0 };
}

/** The worst pair actually present in a sealed set — what a reader checks the threshold against. */
export function worstPair(
  cases: readonly { readonly id: string; readonly task: string }[],
): { readonly a: string; readonly b: string; readonly overlap: number } | null {
  let worst: { a: string; b: string; overlap: number } | null = null;
  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const o = tokenOverlap(cases[i]!.task, cases[j]!.task);
      if (worst === null || o > worst.overlap) worst = { a: cases[i]!.id, b: cases[j]!.id, overlap: o };
    }
  }
  return worst;
}

/**
 * A sealed suite must not contain a pair above the threshold it claims to have applied.
 *
 * Checked at seal time rather than trusted, because the gate runs per candidate against what was
 * accepted SO FAR, and a bug in that loop would leave a violating pair in the final set while every
 * individual decision looked right.
 */
export const violatesThreshold = (
  cases: readonly { readonly id: string; readonly task: string }[], threshold: number = MAX_OVERLAP,
): boolean => (worstPair(cases)?.overlap ?? 0) > threshold;
