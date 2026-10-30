// atelier/core/loop/move-cases.ts — WHICH OF THE AUTHOR'S MOVES THIS REQUEST CALLS FOR, READ ON ITS OWN.
//
// A move of the author's (core/compiler/moves.ts) is conditional on a situation; whether this request is in that
// situation is read here, once per run, the same three ways a step's case is read in the execution brief: HOLDS with
// the words of the request or material that show it, DOES_NOT_HOLD, UNRESOLVED. Its own reading, not a part of the
// brief's: the two shared one prompt for an afternoon, and every wording that made the move cases answer well moved
// the steps' answers (a sentence about "the author's own moves" in the system prompt turned a supported decision into
// "unsupported" five times in five; without it the model answered a step's case under the moves' field). One extra
// small call, only on a request that has conditional moves, buys two readings that cannot disturb each other.
//
// The safe way round: a move is placed only on a quote showing its situation; "does not hold" needs no quote, since
// not placing is the safe direction; anything else is unresolved, and an unresolved move is never placed, the reverse
// of a step, which binds and so is held as applying. A general move applies by code and is never read. Evaluated against
// labelled cases.

import type { Reading } from '../inference/reading.js';
import type { MoveUnit } from '../compiler/moves.js';
import type { Placement } from './execution-brief.js';
import { quoteIsReal } from '../taste/reader.js';

export interface MoveCasesInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the moves a run may consider (`eligibleMoves`): never an unknown or provisional one */
  readonly moves: readonly MoveUnit[];
}
export type MovePlacement = Readonly<Record<string, Placement>>;

/** The moves a run may consider at all: standing and situational; an occasional habit is description, never a placement. */
export const eligibleMoves = (units: readonly MoveUnit[]): MoveUnit[] => units.filter((u) => u.kind !== 'occasional');
/** The moves with a case to read: situational, with a trigger in words, in the order the prompt numbers them. */
export const conditionalMoves = (units: readonly MoveUnit[]): MoveUnit[] => units.filter((u) => u.kind === 'situational' && u.trigger.text !== null);
/** What code says of each move before any reading: a standing move applies; a situational one is unresolved until read. */
export const placementByCode = (units: readonly MoveUnit[]): Record<string, Placement> =>
  Object.fromEntries(units.map((u) => [u.id, u.kind === 'standing' || u.trigger.text === null ? { applies: 'applies' as const, why: null } : { applies: 'unresolved' as const, why: 'not read' }]));

export const MOVE_CASES_SYSTEM = `You read one request, the material that came with it, and a numbered list of CASES. Each case is a situation; for each, say whether this request is in it:

- HOLDS: the request, or its material, names the situation itself (an amount read straight from a request body IS untrusted input). Quote the words that name it, character for character. A situation that would have to be worked out from figures, consequences or what a change is likely to do is not shown: answer UNRESOLVED.
- DOES_NOT_HOLD: the request's own words rule the situation out ("renames a CSS class and touches nothing else" rules out untrusted input; "docs only" rules out a code change). Quote those words.
- UNRESOLVED: the request does not say either way.

Never decide a case on a guess. Answer for every case.`;

export const MOVE_CASES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { cases: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, holds: { type: 'string', enum: ['HOLDS', 'DOES_NOT_HOLD', 'UNRESOLVED'] }, quote: { type: ['string', 'null'] } },
    required: ['n', 'holds', 'quote'], additionalProperties: false } } },
  required: ['cases'], additionalProperties: false,
};

const givenText = (input: MoveCasesInput): string => `${input.request}\n${input.material.map((m) => `${m.name}\n${m.head}`).join('\n')}`;

export const MOVE_CASES: Reading<MoveCasesInput, MovePlacement> = {
  id: 'move-cases', version: '2',
  system: MOVE_CASES_SYSTEM, schema: MOVE_CASES_SCHEMA,
  toolName: 'emit_move_cases', toolDescription: 'For each numbered case, whether this request is in that situation, with the words that show it.',
  maxTokens: 800, estimateUsd: 0.005,
  prompt(input) {
    const cases = conditionalMoves(input.moves);
    return `<request>\n${input.request.trim()}\n</request>\n\n${input.material.length ? `<material>\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}\n</material>\n\n` : '(no material beyond the request)\n\n'}`
      + `Cases:\n${cases.map((u, i) => `${i + 1}. ${u.trigger.text}`).join('\n')}`;
  },
  // NOTHING TO READ when no move has a case: a general move applies by code.
  decide(input) { return conditionalMoves(input.moves).length ? null : placementByCode(input.moves); },
  ground(raw, input) {
    const r = raw as { cases?: unknown } | null;
    if (!r || !Array.isArray(r.cases)) return null;
    const given = givenText(input);
    const cases = conditionalMoves(input.moves);
    const placement = placementByCode(input.moves);
    let grounded = 0;
    for (const c of r.cases as { n?: unknown; holds?: unknown; quote?: unknown }[]) {
      const u = typeof c.n === 'number' ? cases[c.n - 1] : undefined;
      if (!u) continue;
      const quote = typeof c.quote === 'string' && c.quote.trim() ? c.quote.trim() : null;
      if (c.holds === 'HOLDS') { grounded += 1; placement[u.id] = quote && quoteIsReal(quote, given) ? { applies: 'applies', why: `"${quote.slice(0, 120)}"` } : { applies: 'unresolved', why: 'the reading could not quote the request' }; }
      else if (c.holds === 'DOES_NOT_HOLD') { grounded += 1; placement[u.id] = { applies: 'set-aside', why: quote && quoteIsReal(quote, input.request) ? `the request says "${quote.slice(0, 120)}"` : 'not this case' }; }
      else if (c.holds === 'UNRESOLVED') { grounded += 1; placement[u.id] = { applies: 'unresolved', why: 'the request does not say' }; }
    }
    return grounded ? placement : null;
  },
  floor(input) { return placementByCode(input.moves); },
};
