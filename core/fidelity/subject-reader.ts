// atelier/core/fidelity/subject-reader.ts — WHAT A PIECE IS ABOUT, AND WHICH PIECES A REQUEST IS ABOUT, READ BY A SMALL MODEL.
//
// Lexical nearness cannot tell that a request about an "outage" belongs with the author's pieces about "incidents",
// and a request that is only a title shares almost no word with anything. Whether two texts are on the same subject
// is a judgement that needs reading, so a small model reads it and code decides what the reading may do
// (the same split as ../loop/context-judge.ts):
//
//   AT BUILD   each piece gets a SUBJECT CARD, once: one sentence on what it is about and a few subject phrases.
//              Written from the piece's passages, never from its title or file name. Stored and hashed with the
//              skill, so a run names the cards it was graded against.
//   AT RUN     one call: the request beside the numbered cards, each piece graded `same`, `related`, or left out.
//              Temperature 0. Validated in code: a number that names no card is dropped, a label outside the two is
//              dropped. The grades are recorded with the run, so a replay reads the record and not the model.
//
// THE FLOOR IS THE LEXICAL READING. No model, no key, an error or an unreadable answer returns null, and the run
// uses TF-IDF as it always did and says so.
//
// Qualified by studies/SUBJECT_READER_PREREGISTRATION.md. Until that passes it is opt-in and labelled so; it chooses
// which of the author's own passages are shown and which pieces a reading weighs, and never gates or cuts.

import { createHash } from 'node:crypto';
import { spend, type Budget, type InferenceClient } from '../inference/client.js';
import { wordsOf } from '../observers/text.js';
import { piecesOf, type SubjectGrade } from './nearness.js';
import type { RetrievalIndex } from './retrieval.js';

/** Moves when either prompt or the validation does: cards and grades name the version that made them. */
export const SUBJECT_READER_VERSION = 'subject-1';
/** A piece is read up to this many words: enough to say what it is about, and a bound on the cost of a long one. */
export const CARD_WORDS = 900;
export const MAX_SUBJECTS = 6;

export interface SubjectCard {
  readonly piece: string;
  /** one sentence: what the piece is about */
  readonly about: string;
  /** the subjects it covers, as short phrases */
  readonly subjects: readonly string[];
}

export interface SubjectCards {
  readonly version: 1;
  /** `<reader version>:<model>` */
  readonly reader: string;
  /** the retrieval index the pieces came from */
  readonly index: string;
  readonly cards: readonly SubjectCard[];
  readonly builtAt: string;
  readonly hash: string;
}

export const CARD_SYSTEM = `You read one piece of someone's writing and say what it is ABOUT, so that a later request can be matched to the pieces on its subject.

- about: one plain sentence, at most 30 words, naming the subject of the piece. The subject, not the style, not a judgement of the writing.
- subjects: 3 to 6 short phrases (1 to 5 words each) naming what the piece covers, general enough that a request on the same subject in other words would match. Include the kind of situation where there is one (for example "a production failure", "choosing a tool", "a career decision").

Use only what the text says.`;
const CARD_SCHEMA = { type: 'object', properties: { about: { type: 'string' }, subjects: { type: 'array', items: { type: 'string' } } },
  required: ['about', 'subjects'], additionalProperties: false };

export const GRADE_SYSTEM = `Someone is about to write a new piece. You get their request and numbered cards, each saying what one of the author's earlier pieces is about. Say which earlier pieces are on the request's subject.

- "same": the piece is about the subject the request asks for, even if it uses other words for it (an "outage" and an "incident" are one subject).
- "related": a neighbouring subject: a reader who wanted the author's writing on the request's subject would find this one useful, though it is not about it.
- Leave every other piece out. Most pieces are usually neither.

Judge the subject only: not the style, the length or the quality. If the request does not say what it is about, return no piece.`;
const GRADE_SCHEMA = { type: 'object', properties: { pieces: { type: 'array', items: { type: 'object',
  properties: { card: { type: 'number' }, grade: { type: 'string', enum: ['same', 'related'] } }, required: ['card', 'grade'], additionalProperties: false } } },
  required: ['pieces'], additionalProperties: false };

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A card from the model's answer, or null when it does not hold one: a sentence, and at least one short phrase. */
export function cardOf(piece: string, raw: unknown): SubjectCard | null {
  const x = raw as { about?: unknown; subjects?: unknown } | null;
  const about = typeof x?.about === 'string' ? clean(x.about) : '';
  const subjects = Array.isArray(x?.subjects)
    ? [...new Set(x.subjects.filter((s): s is string => typeof s === 'string').map(clean).filter((s) => s.length > 0 && wordsOf(s).length <= 8))].slice(0, MAX_SUBJECTS) : [];
  if (!about || wordsOf(about).length > 60 || !subjects.length) return null;
  return { piece, about, subjects };
}

export const cardsHash = (reader: string, cards: readonly SubjectCard[]): string =>
  createHash('sha256').update(JSON.stringify([reader, cards.map((c) => [c.piece, c.about, c.subjects])])).digest('hex').slice(0, 16);

/** The text a card is read from: the piece's passages in order, up to CARD_WORDS words. Never its title or file name. */
export function cardText(index: RetrievalIndex, piece: string): string {
  const out: string[] = []; let n = 0;
  for (const p of index.passages) {
    if (p.piece !== piece) continue;
    out.push(p.text); n += wordsOf(p.text).length;
    if (n >= CARD_WORDS) break;
  }
  return out.join('\n\n');
}

/**
 * A subject card per piece of the index, one call each. A piece whose card could not be read is left out and never
 * graded near; a budget that runs out keeps the cards read so far.
 */
export async function readSubjectCards(client: InferenceClient, budget: Budget, index: RetrievalIndex, model: string,
  onProgress: (done: number, of: number) => void = () => undefined): Promise<SubjectCards> {
  const ids = piecesOf(index);
  const cards: SubjectCard[] = [];
  for (const [i, piece] of ids.entries()) {
    try {
      const raw = await spend(budget, 0.01, async () => {
        const x = await client.complete({ stableBlock: CARD_SYSTEM, variableBlock: '', userMessage: `<piece>\n${cardText(index, piece)}\n</piece>`,
          toolName: 'emit_card', toolDescription: 'Return what the piece is about.', schema: CARD_SCHEMA, maxTokens: 400, temperature: 0 });
        return { value: x.json, cost: x.cost, usage: x };
      }, 'nearness');
      const card = cardOf(piece, raw);
      if (card) cards.push(card);
    } catch { break; }
    onProgress(i + 1, ids.length);
  }
  const reader = `${SUBJECT_READER_VERSION}:${model}`;
  return { version: 1, reader, index: index.hash, cards, builtAt: new Date().toISOString(), hash: cardsHash(reader, cards) };
}

/** The cards as the grader sees them: numbered from 1, no piece id (an id is often the title, and would be matched on). */
export const renderCards = (cards: readonly SubjectCard[]): string =>
  cards.map((c, i) => `[${i + 1}] ${c.about} Subjects: ${c.subjects.join('; ')}.`).join('\n');

/** The grades in a model's answer, by piece id. An unknown card number or label is dropped; a piece named twice keeps its first grade. */
export function gradesOf(cards: readonly SubjectCard[], raw: unknown): Map<string, SubjectGrade> | null {
  const list = (raw as { pieces?: unknown } | null)?.pieces;
  if (!Array.isArray(list)) return null;
  const out = new Map<string, SubjectGrade>();
  for (const g of list as { card?: unknown; grade?: unknown }[]) {
    if (typeof g.card !== 'number' || !Number.isInteger(g.card) || g.card < 1 || g.card > cards.length) continue;
    if (g.grade !== 'same' && g.grade !== 'related') continue;
    const id = cards[g.card - 1].piece;
    if (!out.has(id)) out.set(id, g.grade);
  }
  return out;
}

/** Which pieces the request is on the subject of, or null when the reader could not answer (the caller falls back to words). */
export async function gradeSubjects(client: InferenceClient, budget: Budget, request: string, cards: SubjectCards): Promise<Map<string, SubjectGrade> | null> {
  if (!cards.cards.length || !request.trim()) return null;
  try {
    const raw = await spend(budget, 0.01, async () => {
      const x = await client.complete({ stableBlock: GRADE_SYSTEM, variableBlock: `<cards>\n${renderCards(cards.cards)}\n</cards>`,
        userMessage: `<request>\n${request}\n</request>`, toolName: 'emit_pieces', toolDescription: 'Return the pieces on the request\'s subject.',
        schema: GRADE_SCHEMA, maxTokens: 600, temperature: 0 });
      return { value: x.json, cost: x.cost, usage: x };
    }, 'nearness');
    return gradesOf(cards.cards, raw);
  } catch { return null; }
}
