// atelier/core/discovery/framing.ts — THE ONE OWNER OF THE DISCOVERY FRAMING CLAUSE.
//
// ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
//
// One clause in the proposer prompt determines which HALF of an author discovery recovers. It was
// duplicated across `propose.ts` and `run-chain.ts`, which is one property with two owners: adding a
// framing to either alone leaves the other serving a single framing, and the feature would be dark on
// whichever path the user actually takes.
//
// The two prompts legitimately differ below this point — the chain asks for richer per-rule fields
// than the fallback does — so they are NOT collapsed. Only the duplicated property is.
//
// ─── THE MEASUREMENT THAT MOTIVATES MULTIPLE FRAMINGS ──────────────────────────────────────────
//
// A recorded study ran A and B, byte-identical but for this clause, over one author's corpus:
//
//   A recovered epistemic stance and commitments, and MISSED the author's controlling metaphor.
//   B recovered form, figure and rhythm, and LOST the typos-as-style rule A had found.
//   Strict recall against the author's own sealed list: A 3/9, B 4/9, UNION ~7/9.
//
// That comparison had no same-framing control, so "the two are disjoint" could not be told apart from
// run-to-run variance. Supplying it (2026-08-22, over the recorded runs, no new generation):
//
//   model    same-framing floor    A vs B    A vs C    A vs unguided
//   opus            83%              54%        —           54%
//   sonnet          67%              50%       33%          12%
//
// Every cross-framing pair falls below its own model's noise floor, on both models, 6 of 6. Framing is
// a real axis and not sampling noise. Union size runs ~18 distinct rules against 12 from one framing.
//
// ─── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
//
// It is NOT a taxonomy of craft dimensions with discovery filling in the boxes. That re-imports the
// expert-system failure with our own ontology, and the author's real axes are exactly what we do not
// know. Framings are deliberately different VANTAGES; the cluster structure of their union is the
// axis map, observed rather than imposed.

/** A vantage the proposer is asked to take. Adding one is a measurement question, not a preference. */
export type FramingId = 'A' | 'B' | 'C';

export interface Framing {
  readonly id: FramingId;
  /** what vantage this takes, for the report */
  readonly vantage: string;
  /** the clause itself — the ONLY text that varies between framings */
  readonly clause: string;
  /** what recorded evidence stands behind shipping it, or null when it is a live hypothesis */
  readonly evidence: string | null;
}

export const FRAMINGS: Readonly<Record<FramingId, Framing>> = {
  A: {
    id: 'A',
    vantage: 'author-centric, decisions held apart from style',
    clause: 'Not a description of their style, and not praise.',
    evidence: '3/9 strict recall on the recorded study. Recovers epistemic stance and commitments; misses figure.',
  },
  B: {
    id: 'B',
    vantage: 'author-centric, form and figure ARE decisions',
    clause: `Formal and figurative choices COUNT as decisions: which concepts get an image, when a figure is
carried across a whole piece versus dropped, sentence shape, where emphasis lands. Treat these as
decisions the author makes, not as decoration.`,
    evidence: '4/9 strict recall on the recorded study. Recovers form, figure and rhythm; loses what A finds.',
  },
  C: {
    id: 'C',
    vantage: 'reader-centric — what the writing DOES to someone',
    clause: `Work backwards from EFFECT. For each move, ask what it does to a reader — what it makes them
believe, doubt, expect, or feel obliged to do — and name the rule as the author's way of producing
that effect. A rule about effect is still a decision rule; state it as something the author does.`,
    evidence: null,
  },
};

/**
 * What ships by default, and why it is exactly these two.
 *
 * A and B are the pair with RECORDED RECALL against an author's own list. C is disjoint from A on the
 * disjointness measurement — more disjoint than B is — and that is NOT sufficient reason to ship it:
 * disjointness says a framing finds DIFFERENT rules, never that it finds TRUE ones. An unguided arm is
 * the most disjoint of all and is the one with no guidance behind it at all. Promoting C on its
 * disjointness alone would be letting the outcome we can measure decide a question it cannot answer.
 *
 * C ships when it has a recall number. Until then it is available and off by default.
 */
export const DEFAULT_FRAMINGS: readonly FramingId[] = ['A', 'B'];

/**
 * The shared opening. Everything above the per-prompt field list, framing clause included.
 *
 * NOTE ON THE CLAUSE TEXT: both call sites previously carried a CONDENSED paraphrase of B —
 * "Formal and figurative choices COUNT as decisions." — which is not the text any recorded run used.
 * No measurement stood behind the paraphrase, so the measured clause replaces it and the divergence
 * between what was measured and what was served is closed rather than preserved.
 */
export function framedPreamble(framing: FramingId): string {
  return `You are given several pieces written by one author.

Infer the author's IMPLICIT DECISION RULES — the choices they make repeatedly that a different competent
writer would make differently. ${FRAMINGS[framing].clause}`;
}
