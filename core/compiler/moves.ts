// atelier/core/compiler/moves.ts — THE AUTHOR'S MOVES, COMPILED FOR EXECUTION FROM THE PERSONA, MEASURED ON THE PIECES.
//
// The persona (./persona.ts) says how the author sounds, with a quote: enough to recognise them, not enough to
// compose as them. A writer composing one piece needs, for each habit, WHEN the author does it, what the move does,
// how it may show, and what it is not; and the run needs to know how often the author does it and whether a
// situation explains it. Nothing here is a word the model chose or a count someone fixed: a habit's reach is the
// posterior of a rate from counts (core/stats/habit.ts), and the composer's decision is the more probable of two
// hypotheses.
//
// Two readings, both grounded in the pieces (a quote is kept only verbatim in the piece it names):
//   persona-moves   per point: the situation in which the author makes the move (a trigger, in words), how it shows,
//                   what it is not, the method step it realises, the counted feature that measures it, and first
//                   evidence: pieces where the move is made, with the situation shown by a second quote where it is;
//   persona-table   per habit and piece: one quote where the piece makes the move, one where the piece is in the
//                   situation, or none. Every cell the first reading left empty is asked once, in batches sized by
//                   the token budget and the corpus.
// From the cells, counts: k of n pieces make the move; a, b in the situation (made, not), c, d outside. From the
// counts: the rate's posterior, the situation's effect (two rates against one, by marginal likelihood), and the kind:
//   standing      the habit more probably holds in most pieces than not: how the author always writes, served as
//                 description, read on the work;
//   situational   the situation explains the habit: placed by the brief when the situation holds;
//   occasional    neither: served as description with its rate, never placed.
// A profile is immutable and named by its hash; the build receipt names it. Nothing here is a requirement, nothing
// changes the standard, and permission is monitor until an owner event. Evaluated in bench/readings/cases/.

import { createHash } from 'node:crypto';
import type { Reading } from '../inference/reading.js';
import { quoteIsReal } from '../taste/reader.js';
import { FEATURES } from '../observers/features.js';
import { inferHabit, describeRate, type Posterior, type SituationEffect, type HabitKind } from '../stats/habit.js';
import type { PersonaPoint } from './persona.js';

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
  /** the persona reading's own word for how often, kept as what was read; no decision rests on it */
  readonly readAs: PersonaPoint['frequency'];
  readonly trigger: { readonly text: string | null; readonly status: TriggerStatus };
  /** how the move may show in a piece, a few words */
  readonly realisation: string;
  /** what the move is not, one line of guidance; never a requirement */
  readonly forbidden: string | null;
  /** the pieces where the move is made, each with its quote (and the situation's, where shown) */
  readonly evidence: readonly MoveEvidence[];
  /** the pieces in the situation without the move, each with the situation's quote */
  readonly situationOnly: readonly { readonly piece: string; readonly quote: string }[];
  /** the rate of the move over the corpus: k of n, as a posterior */
  readonly rate: Posterior;
  /** whether the situation explains the habit, from the 2×2 counts; null when the habit has no situation or one side was never seen */
  readonly situation: SituationEffect | null;
  readonly kind: HabitKind;
  /** distinct pieces the evidence comes from, and the corpus it was read against (k and n of `rate`) */
  readonly pieces: number;
  readonly corpus: number;
  readonly scope: MoveScope;
  /** the method step the move realises, as read: a candidate until an owner confirms it */
  readonly link: { readonly step: string; readonly status: 'candidate' | 'confirmed' } | null;
  /** a counted feature that measures the move, when one does (core/observers/features.ts) */
  readonly check: string | null;
  readonly by: 'model' | 'floor';
  /** the table reading asked every piece the first reading left: the counts are of the whole corpus */
  readonly tabled: boolean;
}
export interface MoveProfile {
  readonly schema: 2;
  /** sha256 over the units and the readings' versions: an immutable profile, named by its content */
  readonly hash: string;
  readonly personaHash: string;
  readonly reading: string;
  readonly reader: string | null;
  /** the pieces the evidence names, in order, each by the hash of its text */
  readonly pieces: readonly { readonly name: string; readonly sha: string }[];
  readonly units: readonly MoveUnit[];
  readonly builtAt: string;
}

export interface MovePiece { readonly name: string; readonly text: string }
export interface MovesInput {
  readonly points: readonly PersonaPoint[];
  readonly pieces: readonly MovePiece[];
  readonly steps: readonly { readonly n: number; readonly text: string }[];
}
/** The first reading's output: a unit per point, before the table and the inference. */
export interface MoveDraft {
  readonly id: string; readonly aspect: string; readonly observed: string; readonly readAs: PersonaPoint['frequency'];
  readonly trigger: MoveUnit['trigger']; readonly realisation: string; readonly forbidden: string | null;
  readonly evidence: readonly MoveEvidence[]; readonly scope: MoveScope; readonly link: MoveUnit['link']; readonly check: string | null; readonly by: 'model' | 'floor';
}
export type MovesOutput = readonly MoveDraft[];

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12);
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Stable across reorderings and rebuilds: the point's aspect and its own quote name the move. */
export const moveId = (p: Pick<PersonaPoint, 'aspect' | 'quote'>): string => sha(`${norm(p.aspect)}\n${norm(p.quote)}`);
export const personaHashOf = (points: readonly PersonaPoint[]): string => sha(JSON.stringify(points.map((p) => [norm(p.aspect), norm(p.description), p.frequency, norm(p.quote)])));

export const PERSONA_MOVES_SYSTEM = `You read a description of how one author writes (numbered points, each with a quote from their pieces), beside the pieces themselves and, when there is one, the steps of their working method. For each point say what a writer composing a new piece as this author would need:

- point: the point's number.
- trigger: the situation in which the author makes this move, in a few words, as a situation a new piece could be in ("where input is untrusted", "when a claim rests on an assumption the reader shares"); null when the point describes how the author always writes (a register, a point of view) rather than a move made in some situations. Never a topic, a name, a product or a fact of the pieces: a trigger is a kind of situation, not a subject. And a situation a reader could see in a request or its material, never a judgement the author makes about it: "when a change adds work to a hot write path" can be seen; "when the fix costs more than it saves" is the author's conclusion, and names no situation.
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
const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));

/** The pieces a quote is in, verbatim. */
const piecesWith = (quote: string, pieces: readonly MovePiece[]): MovePiece[] => pieces.filter((p) => quoteIsReal(quote, p.text));

/** The floor for one point: the move as observed; its evidence is every piece its own quote is in, verbatim. */
export function moveFloor(p: PersonaPoint, pieces: readonly MovePiece[]): MoveDraft {
  const evidence: MoveEvidence[] = piecesWith(p.quote, pieces).map((x) => ({ piece: x.name, quote: p.quote, situationQuote: null }));
  return { id: moveId(p), aspect: p.aspect, observed: p.description, readAs: p.frequency, trigger: { text: null, status: 'none' }, realisation: p.description, forbidden: null, evidence, scope: 'UNKNOWN', link: null, check: null, by: 'floor' };
}

export const PERSONA_MOVES: Reading<MovesInput, MovesOutput> = {
  id: 'persona-moves', version: '5',
  system: PERSONA_MOVES_SYSTEM, schema: PERSONA_MOVES_SCHEMA,
  toolName: 'emit_persona_moves', toolDescription: 'For every point of the persona: its trigger, evidence with situation quotes, realisation, forbidden use, scope, method link and counted check.',
  maxTokens: 8000, estimateUsd: 0.05,
  prompt(input) {
    const points = input.points.map((p, i) => `${i + 1}. ${p.aspect ? `${p.aspect}: ` : ''}${p.description} e.g. "${p.quote}"`).join('\n');
    const steps = input.steps.length ? `\n\nTHE METHOD'S STEPS:\n${input.steps.map((s) => `${s.n}. ${s.text}`).join('\n')}` : '';
    const pieces = input.pieces.map((p) => `=== ${p.name} ===\n${p.text}`).join('\n\n');
    return `THE POINTS:\n${points}${steps}\n\nTHE PIECES:\n${pieces}`;
  },
  decide(input) { return input.points.length ? null : []; },
  // GROUNDED POINT BY POINT. Every quote must be in the piece it names; a situation quote must be a second quote in the
  // same piece; a trigger with no situation quote is proposed, not supported; a step link must name a step; a feature
  // must exist. Whether a quote shows the move as described is the reading's judgement and the eval's to measure.
  ground(raw, input) {
    const r = raw as { moves?: unknown } | null;
    if (!r || !Array.isArray(r.moves)) return null;
    const byName = new Map(input.pieces.map((p) => [p.name, p]));
    const stepNs = new Set(input.steps.map((s) => String(s.n)));
    const out = new Map<number, MoveDraft>();
    for (const m of r.moves as { point?: unknown; trigger?: unknown; evidence?: unknown; realisation?: unknown; forbidden?: unknown; scope?: unknown; link?: unknown; check?: unknown }[]) {
      const i = typeof m.point === 'number' ? m.point - 1 : -1;
      const p = input.points[i];
      if (!p || out.has(i)) continue;
      const evidence: MoveEvidence[] = [];
      const seen = new Set<string>();
      for (const e of (Array.isArray(m.evidence) ? m.evidence : []) as { piece?: unknown; quote?: unknown; situationQuote?: unknown }[]) {
        const piece = typeof e.piece === 'string' ? byName.get(e.piece) : undefined;
        const quote = short(e.quote, 300);
        if (!piece || !quote || !quoteIsReal(quote, piece.text) || seen.has(piece.name)) continue;
        const situation = short(e.situationQuote, 300);
        evidence.push({ piece: piece.name, quote, situationQuote: situation && norm(situation) !== norm(quote) && quoteIsReal(situation, piece.text) ? situation : null });
        seen.add(piece.name);
      }
      // THE POINT'S OWN QUOTE IS ALWAYS EVIDENCE: it is what made the point real.
      for (const own of piecesWith(p.quote, input.pieces)) if (!seen.has(own.name)) { evidence.push({ piece: own.name, quote: p.quote, situationQuote: null }); seen.add(own.name); }
      const order = new Map(input.pieces.map((x, k) => [x.name, k]));
      evidence.sort((x, y) => (order.get(x.piece) ?? 0) - (order.get(y.piece) ?? 0));
      const triggerText = short(m.trigger, 200);
      const status: TriggerStatus = triggerText === null ? 'none' : evidence.some((e) => e.situationQuote) ? 'supported' : 'proposed';
      const scope = SCOPES.find((s) => s === m.scope) ?? 'UNKNOWN';
      const link = typeof m.link === 'number' && stepNs.has(String(m.link)) ? { step: String(m.link), status: 'candidate' as const } : null;
      const check = typeof m.check === 'string' && FEATURE_IDS.has(m.check) ? m.check : null;
      out.set(i, { id: moveId(p), aspect: p.aspect, observed: p.description, readAs: p.frequency, trigger: { text: triggerText, status },
        realisation: short(m.realisation, 160) ?? p.description, forbidden: short(m.forbidden, 200),
        evidence: status === 'none' ? evidence.map((e) => ({ ...e, situationQuote: null })) : evidence, scope, link, check, by: 'model' });
    }
    if (!out.size) return null;
    return input.points.map((p, i) => out.get(i) ?? moveFloor(p, input.pieces));
  },
  floor(input) { return input.points.map((p) => moveFloor(p, input.pieces)); },
};

// ── THE TABLE: EVERY HABIT AGAINST EVERY PIECE ─────────────────────────────────────────────────────────────────

export interface TableHabit { readonly n: number; readonly aspect: string; readonly description: string; readonly quote: string; readonly situation: string | null }
export interface TableInput {
  readonly habits: readonly TableHabit[];
  readonly pieces: readonly MovePiece[];
  /** the cells still to read: habit number and piece name; a cell the first reading filled is not asked again */
  readonly cells: readonly { readonly habit: number; readonly piece: string }[];
}
export interface TableCell { readonly habit: number; readonly piece: string; readonly move: string | null; readonly situation: string | null }
export type TableOutput = readonly TableCell[];

export const PERSONA_TABLE_SYSTEM = `You read one author's pieces for the habits named, numbered. Each habit is a point about HOW the author writes, with one quote that shows it and, for some, the situation in which the author makes the move. For each pair of habit and piece you are asked about, answer two things, each as a quote copied character for character from that piece, or null:
- move: a passage where the piece makes the move as the point describes it; null when the piece does not.
- situation: a passage where the piece is in the habit's situation; null when it is not, or when the habit names no situation.
A passage on a similar subject is not the habit. A quote that is not verbatim is dropped. Answer for every pair asked.`;

export const PERSONA_TABLE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { cells: { type: 'array', items: { type: 'object', properties: { habit: { type: 'integer' }, piece: { type: 'string' }, move: { type: ['string', 'null'] }, situation: { type: ['string', 'null'] } }, required: ['habit', 'piece', 'move', 'situation'], additionalProperties: false } } },
  required: ['cells'], additionalProperties: false,
};

export const PERSONA_TABLE: Reading<TableInput, TableOutput> = {
  id: 'persona-table', version: '1',
  system: PERSONA_TABLE_SYSTEM, schema: PERSONA_TABLE_SCHEMA,
  toolName: 'emit_persona_table', toolDescription: 'For each habit and piece asked, a verbatim passage making the move and one in its situation, or null.',
  maxTokens: 8000, estimateUsd: 0.05,
  prompt(input) {
    const habits = input.habits.map((h) => `${h.n}. ${h.aspect ? `${h.aspect}: ` : ''}${h.description} e.g. "${h.quote}"${h.situation ? `\n   situation: ${h.situation}` : ''}`).join('\n');
    const asked = input.cells.map((c) => `habit ${c.habit} × ${c.piece}`).join('; ');
    return `THE HABITS:\n${habits}\n\nTHE PIECES:\n${input.pieces.map((p) => `=== ${p.name} ===\n${p.text}`).join('\n\n')}\n\nPAIRS TO ANSWER: ${asked}`;
  },
  decide(input) { return input.cells.length ? null : []; },
  ground(raw, input) {
    const r = raw as { cells?: unknown } | null;
    if (!r || !Array.isArray(r.cells)) return null;
    const byName = new Map(input.pieces.map((p) => [p.name, p]));
    const asked = new Set(input.cells.map((c) => `${c.habit}\n${c.piece}`));
    const seen = new Set<string>(); const out: TableCell[] = [];
    for (const c of r.cells as { habit?: unknown; piece?: unknown; move?: unknown; situation?: unknown }[]) {
      const piece = typeof c.piece === 'string' ? byName.get(c.piece) : undefined;
      const key = `${String(c.habit)}\n${piece?.name ?? ''}`;
      if (!piece || typeof c.habit !== 'number' || !asked.has(key) || seen.has(key)) continue;
      seen.add(key);
      const move = short(c.move, 300); const situation = short(c.situation, 300);
      out.push({ habit: c.habit, piece: piece.name, move: move && quoteIsReal(move, piece.text) ? move : null,
        situation: situation && quoteIsReal(situation, piece.text) && (!move || norm(situation) !== norm(move)) ? situation : null });
    }
    return out.length ? out : null;
  },
  floor() { return []; },
};

/**
 * HOW MANY HABITS ONE CALL CAN TABLE, from the token budget and the corpus, never a fixed number: each cell answers two
 * quotes, about `tokensPerCell` tokens; the pieces are in every call's prompt, so what the budget bounds is the answer.
 */
export function habitsPerCall(maxTokens: number, pieces: number, tokensPerCell = 90, overhead = 300): number {
  return Math.max(1, Math.floor((maxTokens - overhead) / (tokensPerCell * Math.max(1, pieces))));
}

/** The cells the first reading left: for each draft and piece, whether the move or the situation is still unknown. */
export function cellsToAsk(drafts: readonly MoveDraft[], pieces: readonly MovePiece[]): { habit: number; piece: string }[] {
  const out: { habit: number; piece: string }[] = [];
  drafts.forEach((d, i) => {
    for (const p of pieces) {
      const e = d.evidence.find((x) => x.piece === p.name);
      const needMove = !e; const needSituation = d.trigger.text !== null && !(e?.situationQuote);
      if (needMove || needSituation) out.push({ habit: i + 1, piece: p.name });
    }
  });
  return out;
}

/** The units: the drafts with the table's cells merged, counted, and inferred. */
export function inferMoves(drafts: readonly MoveDraft[], cells: readonly TableCell[], pieces: readonly MovePiece[], tabled: boolean): MoveUnit[] {
  return drafts.map((d, i) => {
    const mine = cells.filter((c) => c.habit === i + 1);
    const evidence: MoveEvidence[] = [...d.evidence];
    const situationOnly: { piece: string; quote: string }[] = [];
    for (const c of mine) {
      const have = evidence.findIndex((e) => e.piece === c.piece);
      if (have >= 0) { if (c.situation && !evidence[have].situationQuote) evidence[have] = { ...evidence[have], situationQuote: c.situation }; continue; }
      if (c.move) evidence.push({ piece: c.piece, quote: c.move, situationQuote: c.situation });
      else if (c.situation) situationOnly.push({ piece: c.piece, quote: c.situation });
    }
    const n = pieces.length; const k = new Set(evidence.map((e) => e.piece)).size;
    const table = d.trigger.text === null ? null : (() => {
      const a = evidence.filter((e) => e.situationQuote).length, c = k - a;
      const b = situationOnly.length, dd = n - a - b - c;
      return { a, b, c, d: Math.max(0, dd) };
    })();
    const inf = inferHabit(k, n, table);
    const status: TriggerStatus = d.trigger.text === null ? 'none' : inf.situation?.explains ? 'supported' : 'proposed';
    return { ...d, trigger: { text: d.trigger.text, status }, evidence, situationOnly, rate: inf.rate, situation: inf.situation, kind: inf.kind, pieces: k, corpus: n, tabled };
  });
}

/** An immutable profile named by its content; the build receipt names it. */
export function profileOf(units: readonly MoveUnit[], personaHash: string, reader: string | null, pieces: readonly MovePiece[], builtAt = new Date().toISOString()): MoveProfile {
  const named = pieces.map((p) => ({ name: p.name, sha: createHash('sha256').update(p.text).digest('hex').slice(0, 16) }));
  const reading = `${PERSONA_MOVES.id}-${PERSONA_MOVES.version}+${PERSONA_TABLE.id}-${PERSONA_TABLE.version}`;
  const hash = sha(JSON.stringify({ reading, pieces: named, units }));
  return { schema: 2, hash, personaHash, reading, reader, pieces: named, units, builtAt };
}

/** The persona's points with their measured rates attached, for the skill to word each by its count. */
export function pointsWithRates(points: readonly PersonaPoint[], profile: Pick<MoveProfile, 'units'> | null): PersonaPoint[] {
  if (!profile) return [...points];
  const byId = new Map(profile.units.map((u) => [u.id, u]));
  return points.map((p) => { const u = byId.get(moveId(p)); return u ? { ...p, rate: u.rate, kind: u.kind } : p; });
}

/** One line per unit for the build's whole account and `report`. */
export function describeMove(u: MoveUnit): string {
  const head = `${u.kind}${u.by === 'floor' ? ' (by the words alone)' : ''}`;
  const when = u.trigger.text ? ` · when: "${u.trigger.text}" (${u.situation ? `${u.situation.explains ? 'explains it' : 'does not explain it'}: ${describeRate(u.situation.in)} in the situation, ${describeRate(u.situation.out)} outside` : u.trigger.status === 'supported' ? 'shown' : 'proposed, the situation not seen on both sides'})` : '';
  const parts = [u.scope !== 'UNKNOWN' ? `scope: ${u.scope}` : null, u.link ? `at step ${u.link.step} (${u.link.status})` : null, u.check ? `counted: ${u.check}` : null, u.forbidden ? `not: ${u.forbidden}` : null].filter((x): x is string => x !== null);
  return `${head} · ${u.aspect || u.observed} · ${describeRate(u.rate)}${when}${parts.length ? ` · ${parts.join(' · ')}` : ''}${u.tabled ? '' : ' (not tabled: counts from the first reading alone)'}`;
}
/** "20 moves: 9 standing, 4 situational, 7 occasional". */
export function describeMoves(units: readonly MoveUnit[]): string {
  const n = (k: HabitKind): number => units.filter((u) => u.kind === k).length;
  return `${units.length} move${units.length === 1 ? '' : 's'}: ${n('standing')} standing, ${n('situational')} situational, ${n('occasional')} occasional`;
}
