// atelier/core/direct/route.ts — WHICH OF THE AUTHOR'S PIECES THIS REQUEST SHOULD BE WRITTEN FROM: A READING.
//
// Context detection decides what the writer is shown, never what it is told. A comparison post written from the
// author's opinion essays took their staccato and their first person into a list of tools; the baseline that won was
// shown the pieces of the kind asked for and nothing else. So a small model reads the request and a catalogue of the
// pieces (each by its title, its opening and the request it answered) and names the ones written the way this one
// should be: the same kind of piece, for the same kind of reader, first. Code grounds the answer (every id must be in
// the catalogue); where nothing can be grounded or no model is set up, the pieces sharing the most rare words with the
// request are the floor (./pieces.ts, `lexicalOrder`), said as such.

import type { Reading } from '../inference/reading.js';
import type { StandardVersion } from '../state/canonical-state.js';
import { dimensionOf } from '../taste/dimensions.js';
import { inOwnerWords } from '../eval/observes.js';
import { lexicalOrder, titleOf, type Piece } from './pieces.js';

export interface RouteInput {
  readonly request: string;
  /** the opening of the material, for what the piece is about; never the whole of it */
  readonly material: string;
  /** the owner's method as written, read only for whether it says to keep the material's wording */
  readonly method?: string;
  readonly pieces: readonly Piece[];
  /** with --voice-select: the reading also says what the request takes of the pieces, and reads a single piece too */
  readonly select?: boolean;
}

export interface Route {
  /** the pieces to show, most like the request first */
  readonly order: readonly string[];
  /** what the request asks for, in the reader's words; null from the floor */
  readonly kind: string | null;
  /**
   * the request's own words that state a length to write to ("about 2,000 words"), copied from it and found there by
   * code; null where the reading found none; absent from the floor, where the length's word pattern reads the request
   */
  readonly length?: string | null;
  /**
   * with --voice-select: what the request takes of the pieces. "voice" (the person's own content and its shape, in the
   * author's voice) stands only on the request's words that say so, copied and found there; anything else is "whole"
   */
  readonly takes?: 'whole' | 'voice';
  readonly takesQuote?: string;
  /**
   * words of the request, the method or the material that say the material's wording is to be used as written
   * (approved lines, a statement to quote, requirement text), found there by code; absent where nothing says so
   */
  readonly keepWording?: string;
}

/** Asked only with --voice-select, in the user turn, so the reading a default run makes is the one it was. */
const TAKES_ASK = `Say too what the new piece takes of the author's pieces, under "takes". "whole": it is another piece of their kind, written as they write: their structure, their order, their way of arguing, and their voice. "voice": the person brings their own content and its shape (a draft to rewrite, notes, an argument of their own) and asks for it in the author's voice: how the author sounds, never how their pieces are built or what they argue. Under "takes_quote", copy the request's words that say it is "voice"; null for "whole". Where unsure, "whole".`;

/**
 * VOICE ONLY: the person's content keeps its own shape. The rules about structure and shape that were read off the
 * author's pieces (a section order, headings, a list) are set aside for the run, and said; a rule in the person's own
 * words, and every rule about how the author sounds, is held as it was.
 */
export function voiceOnly(std: StandardVersion): { std: StandardVersion; setAside: { id: string; statement: string }[] } {
  const off = std.requirements.filter((r) => !inOwnerWords(r) && dimensionOf(r) === 'STRUCTURE');
  return { std: { ...std, requirements: std.requirements.filter((r) => !off.includes(r)) }, setAside: off.map((r) => ({ id: r.requirementId, statement: r.statement })) };
}

/** The characters of each piece's opening the catalogue shows. */
const OPENING_CHARS = 400;
/** The characters of the material the reading is shown, for its subject. */
const MATERIAL_CHARS = 2_000;

export const PIECE_ROUTE: Reading<RouteInput, Route> = {
  id: 'piece-route',
  version: '4',
  system: `You choose which of an author's pieces a new piece should be written from.

You are given a request for a new piece and a catalogue of the author's own pieces: each by its id, its title, its
opening, its length, and the request it answered when it is known. Name the pieces written the way the new one should
be written: first the pieces of the same kind (a comparison of products, an opinion essay, an announcement, a guide, a
reply, a launch note) for the same kind of reader, and among those the nearest in subject. Leave out a piece of
another kind: its form, its pace and its voice would be copied into the new piece. Name a piece of another kind only
when no piece is of the kind asked for, and then the nearest in form.

Answer with the ids in order, most like the new piece first, and what the request asks for in a few words.

If the request states a length for the new piece ("about 2,000 words", "three paragraphs", "under 300 words"), copy
those words exactly as the length; a number that counts or names something else ("the 500 words I pasted", "chapter
12", "top 10 tools") is no length. Give null where the request states none.

If the request, the method or the material says the material's own wording is to be used as written (approved
messaging, a statement to quote, requirement text to keep word for word), copy those words exactly under
"keep_wording"; null where nothing says so. Material that is only notes or facts to write from is null.`,
  schema: {
    type: 'object',
    properties: {
      asks_for: { type: 'string', description: 'the kind of piece the request asks for, in a few words' },
      pieces: { type: 'array', items: { type: 'string' }, description: 'ids of the pieces to write from, most like the new piece first' },
      length: { type: ['string', 'null'], description: 'the request\'s own words stating the length of the new piece, copied exactly; null where it states none' },
      keep_wording: { type: ['string', 'null'], description: 'the words of the request, method or material saying the material\'s wording is used as written, copied exactly; null where nothing says so' },
      takes: { type: 'string', enum: ['whole', 'voice'], description: 'only when asked: what the new piece takes of the author\'s pieces' },
      takes_quote: { type: ['string', 'null'], description: 'only when asked: the request\'s words that say it takes the voice only' },
    },
    required: ['asks_for', 'pieces', 'length', 'keep_wording'],
    additionalProperties: false,
  },
  toolName: 'emit_piece_route',
  toolDescription: 'Name the pieces the new piece should be written from.',
  maxTokens: 800,
  estimateUsd: 0.02,
  prompt: (x) => {
    const entries = x.pieces.map((p) => {
      const body = p.text.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim().slice(0, OPENING_CHARS);
      const words = p.text.split(/\s+/).filter(Boolean).length;
      return `<piece id="${p.id}" words="${words}"${p.kept ? ' kept="yes"' : ''}>\nTitle: ${titleOf(p.text)}\n${p.request ? `Request it answered: ${p.request.slice(0, 300)}\n` : ''}Opening: ${body}\n</piece>`;
    });
    return `<request>\n${x.request}\n</request>\n\n${x.material.trim() ? `<material_opening>\n${x.material.slice(0, MATERIAL_CHARS)}\n</material_opening>\n\n` : ''}${x.method?.trim() ? `<method>\n${x.method.slice(0, MATERIAL_CHARS)}\n</method>\n\n` : ''}<catalogue>\n${entries.join('\n\n')}\n</catalogue>${x.select ? `\n\n${TAKES_ASK}` : ''}`;
  },
  // One piece, or none, leaves nothing to choose.
  // With --voice-select one piece is read too: what the request takes of it is still to say.
  decide: (x) => (x.pieces.length === 0 || (x.pieces.length === 1 && !x.select) ? { order: x.pieces.map((p) => p.id), kind: null } : null),
  ground: (raw, x) => {
    const r = raw as { asks_for?: unknown; pieces?: unknown; length?: unknown; takes?: unknown; takes_quote?: unknown; keep_wording?: unknown } | null;
    if (!r || !Array.isArray(r.pieces)) return null;
    const ids = new Set(x.pieces.map((p) => p.id));
    const order = [...new Set(r.pieces.filter((id): id is string => typeof id === 'string' && ids.has(id)))];
    if (!order.length) return null;
    // a length is kept only as words found in the request; a quote not there is no reading of it, and the floor reads it
    const said = typeof r.length === 'string' ? r.length.trim() : null;
    const flat = (t: string): string => t.toLowerCase().replace(/\s+/g, ' ');
    const length = r.length === null ? null : said && flat(x.request).includes(flat(said)) ? said : undefined;
    // voice only on the request's own words, found there; anything else is the whole
    const quote = typeof r.takes_quote === 'string' ? r.takes_quote.trim() : '';
    const voice = r.takes === 'voice' && quote.length >= 4 && flat(x.request).includes(flat(quote));
    const takes = x.select ? (voice ? { takes: 'voice' as const, takesQuote: quote.slice(0, 200) } : { takes: 'whole' as const }) : {};
    // the material's wording is kept only on words found where the reading says they are
    const keep = typeof r.keep_wording === 'string' ? r.keep_wording.trim() : '';
    // three words at least: a stray fragment ("note") is found anywhere and would turn the check of copying off
    const kept = keep.split(/\s+/).length >= 3 && [x.request, x.method ?? '', x.material].some((t) => flat(t).includes(flat(keep)));
    return { order, kind: typeof r.asks_for === 'string' && r.asks_for.trim() ? r.asks_for.trim().slice(0, 120) : null, ...(length === undefined ? {} : { length }), ...takes, ...(kept ? { keepWording: keep.slice(0, 200) } : {}) };
  },
  floor: (x) => ({ order: lexicalOrder(x.pieces, `${x.request}\n${x.material.slice(0, MATERIAL_CHARS)}`), kind: null }),
};
