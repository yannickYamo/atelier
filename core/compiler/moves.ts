// atelier/core/compiler/moves.ts — THE AUTHOR'S MOVES, COMPILED FOR EXECUTION FROM THE PERSONA, READ ONCE AT BUILD.
//
// The persona (./persona.ts) says how the author sounds, with how often and a quote: enough to recognise them, not
// enough to compose as them. A writer composing one piece needs, for each habit, WHEN the author does it, WHAT the
// move accomplishes, how it may show, and what it is not; and the run needs to know whether the habit is general,
// conditional on a situation, or of unknown applicability, so that a habit seen in one piece of three is never
// served as a rule for every piece. That is what a unit holds, and the reading here adds it to each persona point.
//
// Every field is grounded in the author's own pieces or falls:
//   evidence      each quote verbatim in the piece it names; the point's own quote is always among them;
//   trigger       SUPPORTED only when, for some evidence quote, a second quote from the SAME piece shows the
//                 situation present (a quote proves the move, not why it was made); otherwise PROPOSED, or NONE;
//   applicability by code: GENERAL for an ALWAYS habit evidenced in three distinct pieces (or in every piece of a
//                 corpus under three, then provisional), CONDITIONAL for a supported trigger, UNKNOWN otherwise and
//                 always for the floor. UNKNOWN is never placed (core/loop/execution-brief.ts): the no-model floor
//                 cannot turn an unknown trigger into universal applicability;
//   link          a method step the move realises is a candidate until the owner confirms it; never an authority;
//   forbidden     guidance for the writer, kept only as a negation; never a requirement;
//   check         a counted feature's id where one measures the move, so the reader need not;
//   id            a content hash of the point's aspect and quote: stable across reorderings and rebuilds.
//
// A profile is immutable and named by its hash; the build receipt names it. Nothing here is a requirement, nothing
// changes the standard, and permission is monitor until an owner event. Evaluated in bench/readings/cases/persona-moves.json.

import { createHash } from 'node:crypto';
import type { Reading } from '../inference/reading.js';
import { quoteIsReal } from '../taste/reader.js';
import { FEATURES } from '../observers/features.js';
import type { Frequency, PersonaPoint } from './persona.js';

export type Applicability = 'GENERAL' | 'CONDITIONAL' | 'UNKNOWN';
export type TriggerStatus = 'supported' | 'proposed' | 'none';
export type MoveScope = 'sentence' | 'paragraph' | 'section' | 'decision' | 'UNKNOWN';
const SCOPES: readonly MoveScope[] = ['sentence', 'paragraph', 'section', 'decision'];

export interface MoveEvidence {
  /** the piece's name as the input gave it */
  readonly piece: string;
  /** verbatim in that piece: the move, made */
  readonly quote: string;
  /** verbatim in the same piece: the situation the trigger names, present; null when none was shown */
  readonly situationQuote: string | null;
}
export interface MoveUnit {
  readonly id: string;
  readonly aspect: string;
  /** the behaviour, as the persona point describes it */
  readonly observed: string;
  readonly frequency: Frequency;
  readonly trigger: { readonly text: string | null; readonly status: TriggerStatus };
  readonly applicability: Applicability;
  /** GENERAL read off fewer than three pieces: said as such, steers nothing on its own */
  readonly provisional: boolean;
  /** how the move may show in a piece, a few words */
  readonly realisation: string;
  /** what the move is not, one negation; guidance, never a requirement */
  readonly forbidden: string | null;
  readonly evidence: readonly MoveEvidence[];
  /** distinct pieces the evidence comes from, and the corpus it was read against */
  readonly pieces: number;
  readonly corpus: number;
  readonly scope: MoveScope;
  /** the method step the move realises, as read: a candidate until an owner confirms it */
  readonly link: { readonly step: string; readonly status: 'candidate' | 'confirmed' } | null;
  /** a counted feature that measures the move, when one does (core/observers/features.ts) */
  readonly check: string | null;
  readonly by: 'model' | 'floor';
}
export interface MoveProfile {
  readonly schema: 1;
  /** sha256 over the units and the reading's version: an immutable profile, named by its content */
  readonly hash: string;
  /** the persona the units were read from, by its hash: a rebuild with the same persona reuses the profile */
  readonly personaHash: string;
  readonly reading: string;
  readonly reader: string | null;
  /** the pieces the evidence names, in order, each by the hash of its text: `piece-3` traces to a file of the corpus */
  readonly pieces: readonly { readonly name: string; readonly sha: string }[];
  readonly units: readonly MoveUnit[];
  readonly builtAt: string;
}

export interface MovePiece { readonly name: string; readonly text: string }
export interface MovesInput {
  readonly points: readonly PersonaPoint[];
  readonly pieces: readonly MovePiece[];
  /** the method's steps, numbered, when there is a method */
  readonly steps: readonly { readonly n: number; readonly text: string }[];
}
export type MovesOutput = readonly MoveUnit[];

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12);
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Stable across reorderings and rebuilds: the point's aspect and its own quote name the move. */
export const moveId = (p: Pick<PersonaPoint, 'aspect' | 'quote'>): string => sha(`${norm(p.aspect)}\n${norm(p.quote)}`);
export const personaHashOf = (points: readonly PersonaPoint[]): string => sha(JSON.stringify(points.map((p) => [norm(p.aspect), norm(p.description), p.frequency, norm(p.quote)])));

export const PERSONA_MOVES_SYSTEM = `You read a description of how one author writes (numbered points, each with how often it holds and a quote from their pieces), beside the pieces themselves and, when there is one, the steps of their working method. For each point say what a writer composing a new piece as this author would need:

- point: the point's number.
- trigger: the situation in which the author makes this move, in a few words, as a situation a new piece could be in ("where input is untrusted", "when a claim rests on an assumption the reader shares"); null when the point describes how the author always writes (a register, a point of view) rather than a move made in some situations. Never a topic, a name, a product or a fact of the pieces: a trigger is a kind of situation, not a subject.
- evidence: places in the pieces where the move is made. For each: the piece's name, a quote copied character for character from that piece showing the move AS THE POINT DESCRIBES IT, and situationQuote: a second quote copied from the SAME piece showing the trigger's situation present there, or null when the piece shows the move but not why. Include the point's own quote. A piece in which the author did not make the move is not evidence: a verdict line with no reason is no evidence of "the verdict carries its reason", and a plain sentence is no evidence of a concession. A quote that is not verbatim is dropped, so copy exactly.
- realisation: how the move may show in a new piece, in a few words ("one flat adjective, then the clearer name").
- forbidden: what this move is not, as one negation ("never invent a contradiction the text does not contain"), or null.
- scope: what a writer would change to make the move: sentence (one sentence or clause, wherever it sits in the piece: a verdict line, a hedge, a concession clause, a closing line), paragraph (the shape of one paragraph: what it opens on, the order of claim, cause and fix inside it), section (the order of paragraphs, or of the argument as a whole across them), decision (WHAT is concluded or recommended, not how a conclusion is worded or where it sits).
- link: the number of the method step this move realises, when a step is given and the move is how the author does that step; null otherwise.
- check: null, unless the move is one of these counted features exactly: ${FEATURES.map((f) => f.id).join(', ')}.

Answer for every point.`;

export const PERSONA_MOVES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { moves: { type: 'array', items: { type: 'object', properties: {
    point: { type: 'integer' }, trigger: { type: ['string', 'null'] },
    evidence: { type: 'array', items: { type: 'object', properties: { piece: { type: 'string' }, quote: { type: 'string' }, situationQuote: { type: ['string', 'null'] } }, required: ['piece', 'quote', 'situationQuote'], additionalProperties: false } },
    realisation: { type: 'string' }, forbidden: { type: ['string', 'null'] },
    scope: { type: 'string', enum: [...SCOPES] }, link: { type: ['integer', 'null'] }, check: { type: ['string', 'null'] },
  }, required: ['point', 'trigger', 'evidence', 'realisation', 'forbidden', 'scope', 'link', 'check'], additionalProperties: false } } },
  required: ['moves'], additionalProperties: false,
};

const short = (s: unknown, max: number): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);
/** A forbidden line is guidance only when it is a negation: anything else would read as an instruction. */
const NEGATION = /^(?:never|not|no\b|do not|don't|without|nor\b)/i;
/** the fewest words a quote can have and still show how a move is made, rather than only that a line exists */
export const MIN_EVIDENCE_WORDS = 3;
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));

/** Applicability, by code and never by a reading: the one place a habit's reach is decided. */
export function applicabilityOf(frequency: Frequency, trigger: TriggerStatus, pieces: number, corpus: number): { applicability: Applicability; provisional: boolean } {
  if (frequency === 'ALWAYS' && pieces >= 3) return { applicability: 'GENERAL', provisional: false };
  if (frequency === 'ALWAYS' && corpus > 0 && corpus < 3 && pieces === corpus) return { applicability: 'GENERAL', provisional: true };
  if (trigger === 'supported') return { applicability: 'CONDITIONAL', provisional: false };
  return { applicability: 'UNKNOWN', provisional: false };
}

/** The piece a quote is in, when one is. */
const pieceOf = (quote: string, pieces: readonly MovePiece[]): MovePiece | undefined => pieces.find((p) => quoteIsReal(quote, p.text));

/** The floor for one point: the move as observed, of UNKNOWN applicability, its own quote as the one evidence. */
export function moveFloor(p: PersonaPoint, pieces: readonly MovePiece[]): MoveUnit {
  const piece = pieceOf(p.quote, pieces);
  const evidence: MoveEvidence[] = piece ? [{ piece: piece.name, quote: p.quote, situationQuote: null }] : [];
  return { id: moveId(p), aspect: p.aspect, observed: p.description, frequency: p.frequency, trigger: { text: null, status: 'none' }, applicability: 'UNKNOWN', provisional: false,
    realisation: p.description, forbidden: null, evidence, pieces: evidence.length, corpus: pieces.length, scope: 'UNKNOWN', link: null, check: null, by: 'floor' };
}

export const PERSONA_MOVES: Reading<MovesInput, MovesOutput> = {
  id: 'persona-moves', version: '3',
  system: PERSONA_MOVES_SYSTEM, schema: PERSONA_MOVES_SCHEMA,
  toolName: 'emit_persona_moves', toolDescription: 'For every point of the persona: its trigger, evidence with situation quotes, realisation, forbidden use, scope, method link and counted check.',
  maxTokens: 8000, estimateUsd: 0.05,
  prompt(input) {
    const points = input.points.map((p, i) => `${i + 1}. (${p.frequency.toLowerCase()}) ${p.aspect ? `${p.aspect}: ` : ''}${p.description} e.g. "${p.quote}"`).join('\n');
    const steps = input.steps.length ? `\n\nTHE METHOD'S STEPS:\n${input.steps.map((s) => `${s.n}. ${s.text}`).join('\n')}` : '';
    const pieces = input.pieces.map((p) => `=== ${p.name} ===\n${p.text}`).join('\n\n');
    return `THE POINTS:\n${points}${steps}\n\nTHE PIECES:\n${pieces}`;
  },
  decide(input) { return input.points.length ? null : []; },
  // GROUNDED POINT BY POINT. Every quote must be in the piece it names; a situation quote must be in the same piece as
  // its evidence quote; a trigger with no situation quote is proposed, not supported; a step link must name a step; a
  // feature must exist; a forbidden line must be a negation. A point the reading did not answer falls to the floor.
  ground(raw, input) {
    const r = raw as { moves?: unknown } | null;
    if (!r || !Array.isArray(r.moves)) return null;
    const byName = new Map(input.pieces.map((p) => [p.name, p]));
    const stepNs = new Set(input.steps.map((s) => String(s.n)));
    const out = new Map<number, MoveUnit>();
    for (const m of r.moves as { point?: unknown; trigger?: unknown; evidence?: unknown; realisation?: unknown; forbidden?: unknown; scope?: unknown; link?: unknown; check?: unknown }[]) {
      const i = typeof m.point === 'number' ? m.point - 1 : -1;
      const p = input.points[i];
      if (!p || out.has(i)) continue;
      const evidence: MoveEvidence[] = [];
      const seen = new Set<string>();
      const minWords = words(p.quote) < MIN_EVIDENCE_WORDS ? 1 : MIN_EVIDENCE_WORDS;
      for (const e of (Array.isArray(m.evidence) ? m.evidence : []) as { piece?: unknown; quote?: unknown; situationQuote?: unknown }[]) {
        const piece = typeof e.piece === 'string' ? byName.get(e.piece) : undefined;
        const quote = short(e.quote, 300);
        // A FLOOR ON WHAT CAN SHOW A MOVE, AT THE MOVE'S OWN GRAIN: a quote of one or two words ("Approve") shows that a
        // verdict exists, not how it is made; the live eval read bare verdict lines as evidence of "the verdict carries
        // its reason" and made a habit of two pieces general on them. So an evidence quote has three words at least,
        // unless the point's own quote is that short, because then the move IS a short line ("ends on a terse verdict
        // line", quote "Request changes"). Whether a quote shows the move is the prompt's to judge, and the eval's to measure.
        if (!piece || !quote || words(quote) < minWords || !quoteIsReal(quote, piece.text) || seen.has(`${piece.name}\n${norm(quote)}`)) continue;
        // A SECOND quote: the sentence that makes the move cannot also be the one that shows its situation.
        const situation = short(e.situationQuote, 300);
        evidence.push({ piece: piece.name, quote, situationQuote: situation && norm(situation) !== norm(quote) && quoteIsReal(situation, piece.text) ? situation : null });
        seen.add(`${piece.name}\n${norm(quote)}`);
        if (evidence.length >= 6) break;
      }
      // THE POINT'S OWN QUOTE IS ALWAYS EVIDENCE: it is what made the point real.
      if (!evidence.some((e) => norm(e.quote) === norm(p.quote))) { const own = pieceOf(p.quote, input.pieces); if (own) evidence.unshift({ piece: own.name, quote: p.quote, situationQuote: null }); }
      const triggerText = short(m.trigger, 200);
      const status: TriggerStatus = triggerText === null ? 'none' : evidence.some((e) => e.situationQuote) ? 'supported' : 'proposed';
      const pieces = new Set(evidence.map((e) => e.piece)).size;
      const { applicability, provisional } = applicabilityOf(p.frequency, status, pieces, input.pieces.length);
      const forbidden = short(m.forbidden, 200);
      const scope = SCOPES.find((s) => s === m.scope) ?? 'UNKNOWN';
      const link = typeof m.link === 'number' && stepNs.has(String(m.link)) ? { step: String(m.link), status: 'candidate' as const } : null;
      const check = typeof m.check === 'string' && FEATURE_IDS.has(m.check) ? m.check : null;
      out.set(i, { id: moveId(p), aspect: p.aspect, observed: p.description, frequency: p.frequency,
        trigger: { text: triggerText, status: status === 'none' ? 'none' : status }, applicability, provisional,
        realisation: short(m.realisation, 160) ?? p.description, forbidden: forbidden && NEGATION.test(forbidden) ? forbidden : null,
        evidence: status === 'none' ? evidence.map((e) => ({ ...e, situationQuote: null })) : evidence, pieces, corpus: input.pieces.length, scope, link, check, by: 'model' });
    }
    if (!out.size) return null;
    return input.points.map((p, i) => out.get(i) ?? moveFloor(p, input.pieces));
  },
  floor(input) { return input.points.map((p) => moveFloor(p, input.pieces)); },
};

/** An immutable profile named by its content; the build receipt names it. */
export function profileOf(units: readonly MoveUnit[], personaHash: string, reader: string | null, pieces: readonly MovePiece[], builtAt = new Date().toISOString()): MoveProfile {
  const named = pieces.map((p) => ({ name: p.name, sha: createHash('sha256').update(p.text).digest('hex').slice(0, 16) }));
  const hash = sha(JSON.stringify({ reading: `${PERSONA_MOVES.id}-${PERSONA_MOVES.version}`, pieces: named, units }));
  return { schema: 1, hash, personaHash, reading: `${PERSONA_MOVES.id}-${PERSONA_MOVES.version}`, reader, pieces: named, units, builtAt };
}

/** One line per unit for the build's whole account and `report`. */
export function describeMove(u: MoveUnit): string {
  const head = `${u.applicability}${u.provisional ? ' (provisional)' : ''}${u.by === 'floor' ? ' (by the words alone)' : ''}`;
  const when = u.trigger.text ? ` · when: "${u.trigger.text}" (${u.trigger.status === 'supported' ? `shown in ${u.evidence.filter((e) => e.situationQuote).length} piece(s)` : 'proposed, no piece shows the situation'})` : '';
  const parts = [u.scope !== 'UNKNOWN' ? `scope: ${u.scope}` : null, u.link ? `at step ${u.link.step} (${u.link.status})` : null, u.check ? `counted: ${u.check}` : null, u.forbidden ? `not: ${u.forbidden}` : null].filter((x): x is string => x !== null);
  return `${head} · ${u.aspect || u.observed}${when} · seen in ${u.pieces} of ${u.corpus} piece(s)${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}
/** "20 moves: 9 general, 4 conditional, 7 unknown". */
export function describeMoves(units: readonly MoveUnit[]): string {
  const n = (a: Applicability): number => units.filter((u) => u.applicability === a).length;
  return `${units.length} move${units.length === 1 ? '' : 's'}: ${n('GENERAL')} general, ${n('CONDITIONAL')} conditional, ${n('UNKNOWN')} unknown`;
}
