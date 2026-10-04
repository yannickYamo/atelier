// atelier/core/structure/features.ts — WHAT A PIECE'S SEQUENCE OF MOVES SAYS ABOUT HOW IT IS BUILT.
//
// From the agreed moves (./moves.ts), numbers a selection can test (../observers/selection.ts). Each answers one
// question the study of AI fiction raised, translated to non-fiction:
//
//   explainShare     how much of the piece explains in general terms: model text over-explains
//   showShare        how much of it shows: examples, evidence and stories
//   storyShare, concessionShare, summaryShare, instructionShare, questionShare, turnShare
//   entropyRate      how unpredictable the next move is given this one (a first-order Markov chain over moves,
//                    lightly Dirichlet-smoothed (α = 0.05: an essay has few transitions per move, and a heavier prior pulls every text to the maximum), normalised by its maximum): a tidy single track is predictable
//   switchRate       how often the move changes from one paragraph to the next
//   claimSupport     of the claims, the share followed within two paragraphs by an example, evidence or story
//   endsOnSummary    whether the last labelled paragraph sums up (1) or not (0)
//
// UNCLEAR paragraphs (the two reads disagreed) count in no share; a text with fewer than four agreed moves has no
// features.

import { STRUCTURE_MOVES, type StructureMove } from './moves.js';

export const STRUCTURE_FEATURES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'sExplainShare', label: 'paragraphs that explain in general terms (share)' },
  { id: 'sShowShare', label: 'paragraphs that show: examples, evidence, stories (share)' },
  { id: 'sStoryShare', label: 'paragraphs that tell what happened (share)' },
  { id: 'sConcessionShare', label: 'paragraphs that concede (share)' },
  { id: 'sSummaryShare', label: 'paragraphs that sum up (share)' },
  { id: 'sInstructionShare', label: 'paragraphs that instruct (share)' },
  { id: 'sQuestionShare', label: 'paragraphs that raise a question (share)' },
  { id: 'sTurnShare', label: 'paragraphs that turn or reframe (share)' },
  { id: 'sEntropyRate', label: 'how unpredictable the next move is (entropy rate, 0 to 1)' },
  { id: 'sSwitchRate', label: 'how often the move changes from one paragraph to the next' },
  { id: 'sClaimSupport', label: 'claims followed within two paragraphs by something shown' },
  { id: 'sEndsOnSummary', label: 'ends by summing up' },
];

const K = STRUCTURE_MOVES.length;
const DIRICHLET = 0.05;
const SHOW: ReadonlySet<StructureMove> = new Set(['EXAMPLE', 'EVIDENCE', 'STORY']);
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Transition counts between consecutive agreed moves (pairs across an UNCLEAR paragraph are skipped). */
export function transitions(moves: readonly (StructureMove | null)[]): number[][] {
  const t = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1]; const b = moves[i];
    if (a && b) t[STRUCTURE_MOVES.indexOf(a)][STRUCTURE_MOVES.indexOf(b)] += 1;
  }
  return t;
}

/**
 * The entropy rate of the smoothed first-order chain, H(X_{t+1} | X_t) weighted by how often each move occurs,
 * divided by log K so it lies in [0, 1]. Each row gets α = 0.05 pseudo-counts per move, enough that a move seen
 * once does not read as certain, small enough that a short essay's few transitions are not drowned by the prior.
 */
export function entropyRate(moves: readonly (StructureMove | null)[]): number | null {
  const t = transitions(moves);
  const rows = t.map((row) => row.reduce((a, b) => a + b, 0));
  const total = rows.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let h = 0;
  for (let i = 0; i < K; i++) {
    if (!rows[i]) continue;
    const denom = rows[i] + DIRICHLET * K;
    const hi = -t[i].reduce((s, c) => { const p = (c + DIRICHLET) / denom; return s + p * Math.log(p); }, 0);
    h += (rows[i] / total) * hi;
  }
  return r3(h / Math.log(K));
}

/** Every structure feature of one reading's agreed moves, or nulls when fewer than four moves were agreed. */
export function structureFeatures(moves: readonly (StructureMove | null)[]): Record<string, number | null> {
  const agreed = moves.filter((m): m is StructureMove => m !== null);
  if (agreed.length < 4) return Object.fromEntries(STRUCTURE_FEATURES.map((f) => [f.id, null]));
  const share = (pred: (m: StructureMove) => boolean): number => r3(agreed.filter(pred).length / agreed.length);
  const pairs = moves.slice(1).map((b, i) => [moves[i], b] as const).filter(([a, b]) => a && b);
  const claims = moves.map((m, i) => (m === 'CLAIM' ? i : -1)).filter((i) => i >= 0);
  const supported = claims.filter((i) => [moves[i + 1], moves[i + 2]].some((m) => m !== null && m !== undefined && SHOW.has(m)));
  return {
    sExplainShare: share((m) => m === 'EXPLAIN'),
    sShowShare: share((m) => SHOW.has(m)),
    sStoryShare: share((m) => m === 'STORY'),
    sConcessionShare: share((m) => m === 'CONCESSION'),
    sSummaryShare: share((m) => m === 'SUMMARY'),
    sInstructionShare: share((m) => m === 'INSTRUCTION'),
    sQuestionShare: share((m) => m === 'QUESTION'),
    sTurnShare: share((m) => m === 'TURN'),
    sEntropyRate: entropyRate(moves),
    sSwitchRate: pairs.length ? r3(pairs.filter(([a, b]) => a !== b).length / pairs.length) : null,
    sClaimSupport: claims.length ? r3(supported.length / claims.length) : null,
    sEndsOnSummary: agreed[agreed.length - 1] === 'SUMMARY' ? 1 : 0,
  };
}

/** Feature samples for selection: the author's read pieces, held-back pieces and the model's drafts. */
export function structureSamples(read: readonly (readonly (StructureMove | null)[])[], held: readonly (readonly (StructureMove | null)[])[], model: readonly (readonly (StructureMove | null)[])[]): Map<string, { read: (number | null)[]; held: (number | null)[]; model: (number | null)[] }> {
  const f = (xs: readonly (readonly (StructureMove | null)[])[]): Record<string, number | null>[] => xs.map(structureFeatures);
  const r = f(read); const h = f(held); const m = f(model);
  return new Map(STRUCTURE_FEATURES.map((x) => [x.id, { read: r.map((v) => v[x.id]), held: h.map((v) => v[x.id]), model: m.map((v) => v[x.id]) }]));
}
