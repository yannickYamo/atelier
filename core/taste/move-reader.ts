// atelier/core/taste/move-reader.ts — WHETHER THE MOVES PLACED FOR A REQUEST SHOWED IN THE WORK, READ AFTER THE DRAFT.
//
// The brief placed the author's moves for one request (core/loop/move-cases.ts, execution-brief.ts `selectMoves`);
// this reading says, for each placed or standing move, what the delivered text did with it. Presence is not
// realisation: "This assumption is wrong" shows a challenge and may still fail the author's move, which establishes
// why. So five outcomes, not two:
//
//   REALISED        the situation is in the piece and the move is made there as the author makes it (quote)
//   MISAPPLIED      the move is made where it does not fit, or in the way its own "not" line forbids (quote)
//   MISSING         the situation is in the piece and the move is absent
//   NOT_APPLICABLE  the piece never reaches the situation (the brief placed it on the request; the piece may not)
//   NOT_READ        no reading, or one the text does not bear out (a quote not in the text)
//
// A quote is required for the two "present" outcomes and grounds a passage, not a purpose: the outcome is the reader's
// judgement and is reported as such. OBSERVE only: nothing here redrafts, counts, or raises evidence; the outcomes are
// recorded with the run and aggregated by `atelier eval`, and the reader's agreement with a blind judge is a study's to
// measure (core/state/contract.ts, `readingMay`). Its own reading and its own call, apart from the taste reader's:
// the taste reader's coverage of the method's steps is never spent on a move. Evaluated in
// bench/readings/cases/move-realisation.json.

import type { Reading } from '../inference/reading.js';
import type { MoveUnit } from '../compiler/moves.js';
import { quoteIsReal } from './reader.js';

export type MoveOutcome = 'REALISED' | 'MISAPPLIED' | 'MISSING' | 'NOT_APPLICABLE' | 'NOT_READ';
export interface MoveReading { readonly outcome: MoveOutcome; readonly quote: string | null; readonly why: string }
export interface MoveReadInput {
  /** the delivered text */
  readonly text: string;
  readonly request: string;
  /** the moves placed and standing for this request, in the order served (at most READ_MOVES) */
  readonly moves: readonly MoveUnit[];
}
export type MoveReadOutput = Readonly<Record<string, MoveReading>>;

/** The most moves one call reads: past this the answer runs out of room for its quotes. */
export const READ_MOVES = 12;

export const MOVE_READER_SYSTEM = `You read one piece of writing against a numbered list of the writer's own MOVES: habits of theirs, each with the situation it answers, how it shows, and what it is not. For each move say what this piece did with it:

- REALISED: the piece is in the move's situation and makes the move there as described, and the move serves the piece. Quote the passage that makes it, character for character.
- MISAPPLIED: the piece makes the move where the situation is absent, or in the way the move's "not" line forbids, or so that it does not serve the piece. Quote the passage.
- MISSING: the piece is in the move's situation and the move is not made.
- NOT_APPLICABLE: the piece never reaches the move's situation.
- UNCLEAR: you cannot tell from the piece.

A move described as how the writer always writes (no situation) is REALISED where the piece writes that way and MISSING where it does not, including where the piece does the opposite (says "I" where the writer never does): MISAPPLIED is for a move made in the wrong place or the wrong way, never for one not made. Judge the situation from the piece and its request, never from the fact that the move was listed: a move listed for a piece that is not in its situation, and made there all the same (an attacker named for code nothing can reach, a concession where nothing is defensible), is MISAPPLIED. A situation the piece only supposes ("if any caller passes this in", "should this ever read request data") is not a situation the piece is in: a move made on a supposition is made where the situation is absent. Where the move's "not" line names what the move must never be, and the passage is that (an attacker the material does not expose, however carefully hedged), the outcome is MISAPPLIED whatever else the passage does well. Judge the move's purpose, not the presence of a gesture: a sentence that challenges an assumption without saying why it is misleading does not realise a move whose point is the why. Quote only words that are in the piece. Answer for every move.`;

export const MOVE_READER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { readings: { type: 'array', items: { type: 'object', properties: {
    n: { type: 'number' }, outcome: { type: 'string', enum: ['REALISED', 'MISAPPLIED', 'MISSING', 'NOT_APPLICABLE', 'UNCLEAR'] },
    quote: { type: ['string', 'null'] }, why: { type: 'string' },
  }, required: ['n', 'outcome', 'quote', 'why'], additionalProperties: false } } },
  required: ['readings'], additionalProperties: false,
};

const notRead = (why: string): MoveReading => ({ outcome: 'NOT_READ', quote: null, why });
const describe = (u: MoveUnit, i: number): string =>
  `${i + 1}. ${u.aspect || u.observed}\n   situation: ${u.trigger.text ?? 'none: how the writer always writes'}\n   the move: ${u.realisation}${u.forbidden ? `\n   not: ${u.forbidden}` : ''}${u.evidence[0] ? `\n   as the writer once made it: "${u.evidence[0].quote}"` : ''}`;

export const MOVE_READER: Reading<MoveReadInput, MoveReadOutput> = {
  id: 'move-realisation', version: '4',
  system: MOVE_READER_SYSTEM, schema: MOVE_READER_SCHEMA,
  toolName: 'emit_move_readings', toolDescription: 'One reading per numbered move: what the piece did with it, with the passage where there is one.',
  maxTokens: 2400, estimateUsd: 0.01,
  prompt(input) {
    const moves = input.moves.slice(0, READ_MOVES);
    return `<request>\n${input.request.trim()}\n</request>\n\n<piece>\n${input.text.trim()}\n</piece>\n\nMoves:\n${moves.map(describe).join('\n')}`;
  },
  decide(input) { return input.moves.length ? null : {}; },
  // GROUNDED MOVE BY MOVE. REALISED and MISAPPLIED stand only on a quote in the text; MISSING and NOT_APPLICABLE need
  // none; UNCLEAR, an unanswered move, and a present outcome with no real quote are NOT_READ, said as such.
  ground(raw, input) {
    const r = raw as { readings?: unknown } | null;
    if (!r || !Array.isArray(r.readings)) return null;
    const moves = input.moves.slice(0, READ_MOVES);
    const out: Record<string, MoveReading> = Object.fromEntries(moves.map((u) => [u.id, notRead('not answered')]));
    let grounded = 0;
    for (const x of r.readings as { n?: unknown; outcome?: unknown; quote?: unknown; why?: unknown }[]) {
      const u = typeof x.n === 'number' ? moves[x.n - 1] : undefined;
      if (!u) continue;
      const why = typeof x.why === 'string' ? x.why.trim().slice(0, 200) : '';
      const quote = typeof x.quote === 'string' && x.quote.trim() ? x.quote.trim().slice(0, 300) : null;
      if (x.outcome === 'REALISED' || x.outcome === 'MISAPPLIED') { grounded += 1; out[u.id] = quote && quoteIsReal(quote, input.text) ? { outcome: x.outcome, quote, why } : notRead(`${x.outcome} without a quote the text bears out`); }
      else if (x.outcome === 'MISSING' || x.outcome === 'NOT_APPLICABLE') { grounded += 1; out[u.id] = { outcome: x.outcome, quote: null, why }; }
      else if (x.outcome === 'UNCLEAR') { grounded += 1; out[u.id] = notRead(why || 'unclear'); }
    }
    for (const u of input.moves.slice(READ_MOVES)) out[u.id] = notRead('past the moves one call reads');
    return grounded ? out : null;
  },
  floor(input) { return Object.fromEntries(input.moves.map((u) => [u.id, notRead('no model read the piece')])); },
};

/** Counts for the run's panel and `atelier eval`. */
export function countOutcomes(readings: MoveReadOutput): Record<MoveOutcome, number> {
  const n: Record<MoveOutcome, number> = { REALISED: 0, MISAPPLIED: 0, MISSING: 0, NOT_APPLICABLE: 0, NOT_READ: 0 };
  for (const r of Object.values(readings)) n[r.outcome] += 1;
  return n;
}
