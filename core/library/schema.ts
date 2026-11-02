// atelier/core/library/schema.ts — WHAT A WRITING LIBRARY HOLDS, AND THE ONE SHAPE EVERY PART READS.
//
// A library is judgment that is not the user's own: what a strong piece of a given kind decides, what a competent
// near miss looks like, the directions a piece of that kind can take, the tells that mark machine prose. It is read
// in two places only, and the split matters:
//
//   - the WRITER is dealt a direction (an angle: structure and opening, never the position the piece takes);
//   - the REVIEWER is given the cards (strong, near miss, weak) as its rubric. Cards are never served to the writer:
//     with five to ten of the user's pieces a card would outweigh the user's own taste, and a card pasted into a
//     prompt is something any user can do for free.
//
// A library lives in a directory of JSON files (`cards.json`, `angles.json`, `tells.json`, `rubrics.json`,
// `beats.json`, `questions.json`). The public core ships with Atelier; a private pack, if the user keeps one, is
// pointed to by ATELIER_LIBRARY and is merged over the core by id.

/** The kind of piece a library entry serves, e.g. "blog", "newsletter", "launch-narrative". */
export type PieceKind = string;

/** How much a card's content has been shown to hold. Outranks in this order. */
export type CardEvidence = 'locked-golden' | 'measured' | 'principle';

export interface Card {
  readonly id: string;
  readonly kind: PieceKind;
  /** the context signals that select this card, in words a reading can match against a request */
  readonly appliesWhen: string;
  /** what a strong piece of this kind decides, in one line */
  readonly theCall: string;
  /** two or three properties of the strong version */
  readonly strong: readonly string[];
  /** the competent version missing ONE named element: the realistic "3 of 5" */
  readonly nearMiss: string;
  /** the confident, vague version: the "1 of 5" */
  readonly weak: string;
  /** content-level failures only, never style */
  readonly antiPatterns: readonly string[];
  readonly evidence: CardEvidence;
}

export interface Angle {
  readonly id: string;
  readonly kind: PieceKind;
  /** the idea of the direction, one line */
  readonly idea: string;
  /** how the piece is built, in order */
  readonly structure: string;
  /** what the first two lines do */
  readonly openingMove: string;
  /** the kind of evidence the direction runs on (a number, a case, a scene, a teardown…) */
  readonly evidenceType: string;
  /** when it fits: material, reader or purpose that make it a good choice */
  readonly fitsWhen: string;
  readonly pitfalls: readonly string[];
  /** the transferable move, never sentences */
  readonly steal: string;
}

export type TellStatus = 'banned' | 'warned';

export interface Tell {
  readonly id: string;
  /** when the tell was first recorded, YYYY-MM: tells come in waves */
  readonly since: string;
  /** what the pattern is, described for a reader (never a regular expression: a model-written check reads it) */
  readonly description: string;
  /** what to do instead: a procedure, never a replacement phrase */
  readonly instead: string;
  /** the default status; a user's own pieces can allow it at their own rate */
  readonly status: TellStatus;
}

export interface Rubric {
  readonly kind: PieceKind;
  readonly criteria: readonly { readonly id: string; readonly weight: number; readonly question: string }[];
  /** caps override the weighted average: when the condition holds, the overall score is at most `max` (0-10) */
  readonly caps: readonly { readonly when: string; readonly max: number }[];
}

export interface BeatPrior {
  readonly kind: PieceKind;
  readonly beat: string;
  /** prior mean position in [0,1] */
  readonly position: number;
  /** prior concentration (weak by default) */
  readonly concentration: number;
  readonly job: string;
}

export interface QuestionWording {
  readonly id: string;
  /** the gap the question closes, e.g. "angle", "proof", "reader", "stakes" */
  readonly gap: string;
  readonly ask: string;
  /** what an answer unlocks, said once */
  readonly unlocks: string;
}

export interface Library {
  readonly cards: readonly Card[];
  readonly angles: readonly Angle[];
  readonly tells: readonly Tell[];
  readonly rubrics: readonly Rubric[];
  readonly beats: readonly BeatPrior[];
  readonly questions: readonly QuestionWording[];
  /** where each layer came from, for the record: "core" and, if loaded, the private pack's path */
  readonly sources: readonly string[];
}

export const LIBRARY_FILES = ['cards.json', 'angles.json', 'tells.json', 'rubrics.json', 'beats.json', 'questions.json'] as const;
