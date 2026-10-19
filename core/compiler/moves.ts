// atelier/core/compiler/moves.ts — THE AUTHOR'S MOVES, COMPILED FOR EXECUTION FROM THE PERSONA, MEASURED ON THE PIECES.
//
// The persona (./persona.ts) says how the author sounds, with a quote: enough to recognise them, not enough to
// compose as them. A writer composing one piece needs, for each habit, WHEN the author does it, what the move does,
// how it may show, and what it is not; and the run needs to know how often the author does it and whether a
// situation explains it. Nothing here is a word the model chose or a count someone fixed: a habit's reach is the
// posterior of a rate from counts (core/stats/habit.ts), and the composer's decision is the more probable of two
// hypotheses.
//
// A habit is observed in one of two ways, which the first reading says and the evals measure (never a list of kinds):
//   passage    a move made in a passage a reader could quote (a concession clause, an attacker's view): each piece's
//              cell is a verbatim quote or none;
//   document   a property of the whole piece (a register, a point of view): a passage shows it nowhere in particular.
//              Where the reading names a counted feature and says the habit IS that feature's presence in a piece, or
//              its absence, the feature's count over each whole piece fills the cell, by code, and the count is kept;
//              where it names a feature that measures something near the habit but not the habit, the cell stays a
//              quote's. No count becomes an event by a threshold: present means one or more, absent means none.
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
export type Modality = 'passage' | 'document';
/** what a counted feature says of the habit: the habit is the feature present in a piece, or absent from it; null when the feature is only near it */
export type CheckMeans = 'present' | 'absent';
export interface Measured { readonly piece: string; readonly count: number; readonly exhibits: boolean }
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
  /** for a whole-piece habit: each piece the table judged, and whether it shows the habit as a whole */
  readonly judged: readonly { readonly piece: string; readonly shows: boolean }[];
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
  /** whether the habit is that feature's presence in a piece or its absence; null when the feature is only near the habit, so the quote decides */
  readonly checkMeans: CheckMeans | null;
  /** how the habit is observed: in a passage, or over the whole piece */
  readonly modality: Modality;
  /** for a habit the feature measures: the count in every piece, and whether the piece exhibits the habit (present: one or more; absent: none) */
  readonly measured: readonly Measured[];
  /** null when nothing was measured; false when a quote shows the habit in a piece the count says lacks it, so the count does not measure the habit and the quotes decide */
  readonly measureAgrees: boolean | null;
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
  readonly evidence: readonly MoveEvidence[]; readonly scope: MoveScope; readonly link: MoveUnit['link']; readonly check: string | null; readonly checkMeans: CheckMeans | null; readonly modality: Modality; readonly by: 'model' | 'floor';
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
- modality: passage when the move is made in a passage a reader could quote (a clause, a sentence, a paragraph's shape); document when the point is a property of the whole piece that no one passage makes (a register, a point of view, a rhythm, a formality).
- check: null, unless one of these counted features measures the point: ${FEATURES.map((f) => f.id).join(', ')}.
- checkMeans: when check names a feature: present when the point IS that feature occurring in a piece (a point about hedging, and the feature counts hedges); absent when the point IS its not occurring (a point that says "no exclamation marks", and the feature counts exclamation marks); null when the feature measures something near the point but not the point itself (a point about hedging only where warranted, which a count of hedges does not settle; a point about naming the class of a harm, which the absence of exclamation marks is consistent with but does not measure). A feature's absence being consistent with the point is not the point: absent only where the point names that very thing as what the author does not do. Null when check is null.

Answer for every point.`;

export const PERSONA_MOVES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { moves: { type: 'array', items: { type: 'object', properties: {
    point: { type: 'integer' }, trigger: { type: ['string', 'null'] },
    evidence: { type: 'array', items: { type: 'object', properties: { piece: { type: 'string' }, quote: { type: 'string' }, situationQuote: { type: ['string', 'null'] } }, required: ['piece', 'quote', 'situationQuote'], additionalProperties: false } },
    realisation: { type: 'string' }, forbidden: { type: ['string', 'null'] },
    scope: { type: 'string', enum: [...SCOPES] }, link: { type: ['integer', 'null'] }, check: { type: ['string', 'null'] },
    modality: { type: 'string', enum: ['passage', 'document'] }, checkMeans: { type: ['string', 'null'], enum: ['present', 'absent', null] },
  }, required: ['point', 'trigger', 'evidence', 'realisation', 'forbidden', 'scope', 'link', 'check', 'modality', 'checkMeans'], additionalProperties: false } } },
  required: ['moves'], additionalProperties: false,
};

const short = (s: unknown, max: number): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);
const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));
const COUNTABLE = new Set(FEATURES.filter((f) => typeof f.count === 'function').map((f) => f.id));
/** The feature's events in one piece, at any length: what a document-level habit is measured by. */
export function measureHabit(check: string, means: CheckMeans, pieces: readonly MovePiece[]): Measured[] {
  const f = FEATURES.find((x) => x.id === check);
  if (!f?.count) return [];
  return pieces.map((p) => { const count = f.count ? f.count(p.text) : 0; return { piece: p.name, count, exhibits: means === 'present' ? count > 0 : count === 0 }; });
}

/** The pieces a quote is in, verbatim. */
const piecesWith = (quote: string, pieces: readonly MovePiece[]): MovePiece[] => pieces.filter((p) => quoteIsReal(quote, p.text));

/** The floor for one point: the move as observed; its evidence is every piece its own quote is in, verbatim. */
export function moveFloor(p: PersonaPoint, pieces: readonly MovePiece[]): MoveDraft {
  const evidence: MoveEvidence[] = piecesWith(p.quote, pieces).map((x) => ({ piece: x.name, quote: p.quote, situationQuote: null }));
  return { id: moveId(p), aspect: p.aspect, observed: p.description, readAs: p.frequency, trigger: { text: null, status: 'none' }, realisation: p.description, forbidden: null, evidence, scope: 'UNKNOWN', link: null, check: null, checkMeans: null, modality: 'passage', by: 'floor' };
}

export const PERSONA_MOVES: Reading<MovesInput, MovesOutput> = {
  id: 'persona-moves', version: '7',
  system: PERSONA_MOVES_SYSTEM, schema: PERSONA_MOVES_SCHEMA,
  toolName: 'emit_persona_moves', toolDescription: 'For every point of the persona: its trigger, evidence with situation quotes, realisation, forbidden use, scope, modality, method link, counted check and what the check means.',
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
    for (const m of r.moves as { point?: unknown; trigger?: unknown; evidence?: unknown; realisation?: unknown; forbidden?: unknown; scope?: unknown; link?: unknown; check?: unknown; modality?: unknown; checkMeans?: unknown }[]) {
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
      // A COUNT CAN STAND IN FOR THE QUOTE ONLY WHERE THE FEATURE COUNTS EVENTS (a rate's events or a share's sentences; a plain value has none)
      const check = typeof m.check === 'string' && FEATURE_IDS.has(m.check) ? m.check : null;
      const checkMeans: CheckMeans | null = check && COUNTABLE.has(check) && (m.checkMeans === 'present' || m.checkMeans === 'absent') ? m.checkMeans : null;
      const modality: Modality = m.modality === 'document' ? 'document' : 'passage';
      out.set(i, { id: moveId(p), aspect: p.aspect, observed: p.description, readAs: p.frequency, trigger: { text: triggerText, status },
        realisation: short(m.realisation, 160) ?? p.description, forbidden: short(m.forbidden, 200),
        evidence: status === 'none' ? evidence.map((e) => ({ ...e, situationQuote: null })) : evidence, scope, link, check, checkMeans, modality, by: 'model' });
    }
    if (!out.size) return null;
    return input.points.map((p, i) => out.get(i) ?? moveFloor(p, input.pieces));
  },
  floor(input) { return input.points.map((p) => moveFloor(p, input.pieces)); },
};

// ── THE TABLE: EVERY HABIT AGAINST EVERY PIECE ─────────────────────────────────────────────────────────────────

export interface TableHabit { readonly n: number; readonly aspect: string; readonly description: string; readonly quote: string; readonly situation: string | null; readonly modality: Modality }
export interface TableInput {
  readonly habits: readonly TableHabit[];
  readonly pieces: readonly MovePiece[];
  /** the cells still to read: habit number and piece name; a cell the first reading filled is not asked again */
  readonly cells: readonly { readonly habit: number; readonly piece: string }[];
}
export interface TableCell { readonly habit: number; readonly piece: string; readonly move: string | null; readonly situation: string | null; /** for a whole-piece habit: whether the piece as a whole shows it; null for a habit made in a passage */ readonly shows: boolean | null }
export type TableOutput = readonly TableCell[];

export const PERSONA_TABLE_SYSTEM = `You read one author's pieces for the habits named, numbered. Each habit is a point about HOW the author writes, with one quote that shows it, whether it is made in a passage or is a property of the whole piece, and, for some, the situation in which the author makes the move. For each pair of habit and piece you are asked about, answer two things, each as a quote copied character for character from that piece, or null:
- move: for a habit made in a passage, the passage where this piece makes the move AS THE POINT DESCRIBES IT, and null when no passage does; a sentence that merely states a finding is not an escalation of severity, not a concession, not an argument from the artifact's own contradiction, and not a judgement of taste, however related its subject. Every piece of this author's contains findings; the question is whether THIS move is made, not whether the piece is on topic. For a habit that is a property of the whole piece, move is null.
- shows: for a habit that is a property of the whole piece, true when this piece as a whole shows it and false when it does not; null for a habit made in a passage.
- situation: a passage where the piece is in the habit's situation; null when it is not, or when the habit names no situation.
Answer null freely: most habits are made in some pieces and not others, and a null where the move is absent is the right answer, not a failure to find. The situation present is not the move made: a piece can be in the situation (input taken unchecked) and never make the move (no sentence from the caller's view); then situation is quoted and move is null. The same passage is never both. A quote that is not verbatim is dropped. Answer for every pair asked.`;

export const PERSONA_TABLE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { cells: { type: 'array', items: { type: 'object', properties: { habit: { type: 'integer' }, piece: { type: 'string' }, move: { type: ['string', 'null'] }, situation: { type: ['string', 'null'] }, shows: { type: ['boolean', 'null'] } }, required: ['habit', 'piece', 'move', 'situation', 'shows'], additionalProperties: false } } },
  required: ['cells'], additionalProperties: false,
};

export const PERSONA_TABLE: Reading<TableInput, TableOutput> = {
  id: 'persona-table', version: '3',
  system: PERSONA_TABLE_SYSTEM, schema: PERSONA_TABLE_SCHEMA,
  toolName: 'emit_persona_table', toolDescription: 'For each habit and piece asked: a verbatim passage making the move (or, for a whole-piece habit, whether the piece shows it) and one in its situation, or null.',
  maxTokens: 8000, estimateUsd: 0.05,
  prompt(input) {
    const habits = input.habits.map((h) => `${h.n}. ${h.aspect ? `${h.aspect}: ` : ''}${h.description} e.g. "${h.quote}"\n   ${h.modality === 'document' ? 'a property of the whole piece' : 'made in a passage'}${h.situation ? `\n   situation: ${h.situation}` : ''}`).join('\n');
    const asked = input.cells.map((c) => `habit ${c.habit} × ${c.piece}`).join('; ');
    return `THE HABITS:\n${habits}\n\nTHE PIECES:\n${input.pieces.map((p) => `=== ${p.name} ===\n${p.text}`).join('\n\n')}\n\nPAIRS TO ANSWER: ${asked}`;
  },
  decide(input) { return input.cells.length ? null : []; },
  ground(raw, input) {
    const r = raw as { cells?: unknown } | null;
    if (!r || !Array.isArray(r.cells)) return null;
    const byName = new Map(input.pieces.map((p) => [p.name, p]));
    const asked = new Set(input.cells.map((c) => `${c.habit}\n${c.piece}`));
    const whole = new Set(input.habits.filter((h) => h.modality === 'document').map((h) => h.n));
    const seen = new Set<string>(); const out: TableCell[] = [];
    for (const c of r.cells as { habit?: unknown; piece?: unknown; move?: unknown; situation?: unknown; shows?: unknown }[]) {
      const piece = typeof c.piece === 'string' ? byName.get(c.piece) : undefined;
      const key = `${String(c.habit)}\n${piece?.name ?? ''}`;
      if (!piece || typeof c.habit !== 'number' || !asked.has(key) || seen.has(key)) continue;
      seen.add(key);
      const move = short(c.move, 300); const situation = short(c.situation, 300);
      // a whole-piece habit is judged over the piece: `shows` decides and a passage, if given, only illustrates
      out.push({ habit: c.habit, piece: piece.name, move: move && quoteIsReal(move, piece.text) ? move : null,
        situation: situation && quoteIsReal(situation, piece.text) && (!move || norm(situation) !== norm(move)) ? situation : null,
        shows: whole.has(c.habit) && typeof c.shows === 'boolean' ? c.shows : null });
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
      // every move cell is asked, a measured habit's too: the count decides only where it agrees with the quotes, and the quotes must be there to say
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
    const judged: { piece: string; shows: boolean }[] = [];
    for (const c of mine) {
      if (c.shows !== null) judged.push({ piece: c.piece, shows: c.shows });
      const have = evidence.findIndex((e) => e.piece === c.piece);
      if (have >= 0) { if (c.situation && !evidence[have].situationQuote) evidence[have] = { ...evidence[have], situationQuote: c.situation }; continue; }
      if (c.move) evidence.push({ piece: c.piece, quote: c.move, situationQuote: c.situation });
      else if (c.situation) situationOnly.push({ piece: c.piece, quote: c.situation });
    }
    const n = pieces.length;
    // THE EVENT PER PIECE: for a habit a feature measures, the piece exhibits it by the count over the whole piece; otherwise by a quote
    const measured = d.check && d.checkMeans ? measureHabit(d.check, d.checkMeans, pieces) : [];
    // A COUNT THAT DISAGREES WITH A QUOTE DOES NOT MEASURE THE HABIT: a verbatim passage making the move in a piece the
    // count says lacks it (hedges made with "probably" where the feature counts "might") means the feature's events are
    // not the habit's; then the quotes decide and the count is kept as what it is.
    const measureAgrees = measured.length ? !evidence.some((e) => measured.some((m) => m.piece === e.piece && !m.exhibits)) : null;
    // what makes a piece count: the feature's count where it measures the habit; else, for a whole-piece habit, the piece judged to show it or quoted; else a quote
    const made = new Set(measured.length && measureAgrees ? measured.filter((x) => x.exhibits).map((x) => x.piece) : [...evidence.map((e) => e.piece), ...judged.filter((j) => j.shows).map((j) => j.piece)]);
    const k = made.size;
    const table = d.trigger.text === null ? null : (() => {
      const inSituation = new Set([...evidence.filter((e) => e.situationQuote).map((e) => e.piece), ...situationOnly.map((x) => x.piece)]);
      const a = [...inSituation].filter((x) => made.has(x)).length, b = inSituation.size - a;
      const c = k - a, dd = n - a - b - c;
      return { a, b, c, d: Math.max(0, dd) };
    })();
    const inf = inferHabit(k, n, table);
    const status: TriggerStatus = d.trigger.text === null ? 'none' : inf.situation?.explains ? 'supported' : 'proposed';
    return { ...d, trigger: { text: d.trigger.text, status }, evidence, situationOnly, judged, measured, measureAgrees, rate: inf.rate, situation: inf.situation, kind: inf.kind, pieces: k, corpus: n, tabled };
  });
}

/** The readings a profile is read by, as one string: a profile read by any other is read again where a model is there. */
export const currentReading = (): string => `${PERSONA_MOVES.id}-${PERSONA_MOVES.version}+${PERSONA_TABLE.id}-${PERSONA_TABLE.version}`;

/** An immutable profile named by its content; the build receipt names it. */
export function profileOf(units: readonly MoveUnit[], personaHash: string, reader: string | null, pieces: readonly MovePiece[], builtAt = new Date().toISOString()): MoveProfile {
  const named = pieces.map((p) => ({ name: p.name, sha: createHash('sha256').update(p.text).digest('hex').slice(0, 16) }));
  const reading = currentReading();
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
  const parts = [u.scope !== 'UNKNOWN' ? `scope: ${u.scope}` : null, u.modality === 'document' ? 'over the whole piece' : null, u.link ? `at step ${u.link.step} (${u.link.status})` : null, u.check ? `counted: ${u.check}${u.checkMeans ? ` (${u.checkMeans} in a piece is the habit)` : ' (near the habit, not it)'}` : null, u.forbidden ? `not: ${u.forbidden}` : null].filter((x): x is string => x !== null);
  const by = u.judged.length && !u.measured.length ? ' judged over each whole piece' : u.measured.length ? (u.measureAgrees ? ` by the count of ${u.check}` : ` by the quotes (the count of ${u.check} disagrees with them in ${u.measured.filter((m) => !m.exhibits && u.evidence.some((e) => e.piece === m.piece)).length} piece(s): it does not measure this habit)`) : '';
  return `${head} · ${u.aspect || u.observed} · ${describeRate(u.rate)}${by}${when}${parts.length ? ` · ${parts.join(' · ')}` : ''}${u.tabled ? '' : ' (not tabled: counts from the first reading alone)'}`;
}
/** "20 moves: 9 standing, 4 situational, 7 occasional". */
export function describeMoves(units: readonly MoveUnit[]): string {
  const n = (k: HabitKind): number => units.filter((u) => u.kind === k).length;
  return `${units.length} move${units.length === 1 ? '' : 's'}: ${n('standing')} standing, ${n('situational')} situational, ${n('occasional')} occasional`;
}
