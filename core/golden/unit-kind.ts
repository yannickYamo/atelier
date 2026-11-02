// atelier/core/golden/unit-kind.ts — WHAT KIND OF DECISION AN EXAMPLE IS, READ AT INTAKE.
//
// Every example was minted PROSE_SECTION, so a memo whose whole job is to settle a choice (go or no go, which of
// three plans, what to cut) was recorded as a section of prose like any essay. Whether a piece's main job is to make
// a decision turns on what it says, so it is a reading (core/inference/reading.ts):
//
//   - the reader says, for each example, whether its main job is to make a decision for a reader who must act, and
//     quotes the words where the decision is stated; a quote not in what it was shown drops the answer;
//   - a held-back example is read by its request alone: its finished text is the reference a later check compares
//     against, and nothing may read it first (core/golden/reservation.ts);
//   - the floor reads no words: an unread example stays PROSE_SECTION, and the record says the kind was not read.

import type { Reading } from '../inference/reading.js';
import type { GoldenUnit, UnitKind } from './golden-unit.js';

export type ReadKind = 'DECISION_MEMO' | 'PROSE_SECTION';
/** The kind a unit has when nothing read it. */
export const UNREAD_UNIT_KIND: ReadKind = 'PROSE_SECTION';
/** How much of a piece the reader is shown: enough to see what it is for, not the whole of a long piece. */
export const SHOWN_CHARS = 2000;

export interface UnitKindInput {
  /** `text` null: the piece is held back, and only its request may be read */
  readonly pieces: readonly { readonly id: string; readonly request: string | null; readonly text: string | null }[];
}
export type UnitKindRead = Readonly<Record<string, ReadKind>>;

export const UNIT_KIND_SYSTEM = `You read examples of finished work, each with an id, its request when it has one, and the opening of its text when it is shown. For each, say what its MAIN JOB is:

- DECISION: the piece exists to make a decision for a reader who must act. It weighs options or evidence and commits to one course: a recommendation, a go or no go, a choice between plans, what to fund, cut or ship. "We recommend option B: it halves the cost and ships in May." "Decision: we stop the pilot."
- OTHER: anything else. An essay, a story, an explainer, a report, a post, a review that informs without settling a choice. An essay that argues a view is OTHER: arguing is not deciding for someone who must act.

For DECISION, quote the words that state the decision, copied character for character from the request or the text shown. Answer for every id, and copy each id exactly.`;

export const UNIT_KIND_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { pieces: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, job: { type: 'string', enum: ['DECISION', 'OTHER'] }, quote: { type: 'string' },
  }, required: ['id', 'job'], additionalProperties: false } } },
  required: ['pieces'], additionalProperties: false,
};

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const shown = (text: string | null): string | null => (text === null ? null : text.slice(0, SHOWN_CHARS));
const readable = (p: UnitKindInput['pieces'][number]): boolean => (p.request?.trim() ?? '') !== '' || (p.text?.trim() ?? '') !== '';

export const UNIT_KIND: Reading<UnitKindInput, UnitKindRead> = {
  id: 'unit-kind', version: '1',
  system: UNIT_KIND_SYSTEM, schema: UNIT_KIND_SCHEMA,
  toolName: 'emit_unit_kinds', toolDescription: 'For each example id, whether its main job is to make a decision, with the words that state it.',
  maxTokens: 2000, estimateUsd: 0.02,
  prompt(input) {
    return input.pieces.filter(readable).map((p) => [`[${p.id}]`, p.request?.trim() ? `REQUEST: ${p.request.trim()}` : null,
      p.text === null ? 'TEXT: (held back: read by its request alone)' : p.text.trim() ? `TEXT:\n${shown(p.text)}` : null].filter(Boolean).join('\n')).join('\n\n');
  },
  // Nothing anyone may read: every piece keeps the kind it has unread, decided with no call.
  decide(input) { return input.pieces.some(readable) ? null : Object.fromEntries(input.pieces.map((p) => [p.id, UNREAD_UNIT_KIND])); },
  ground(raw, input) {
    const r = raw as { pieces?: unknown } | null;
    if (!r || !Array.isArray(r.pieces)) return null;
    const known = new Map(input.pieces.filter(readable).map((p) => [p.id, p]));
    const out: Record<string, ReadKind> = {};
    for (const x of r.pieces as { id?: unknown; job?: unknown; quote?: unknown }[]) {
      const p = typeof x?.id === 'string' ? known.get(x.id) : undefined;
      if (!p) continue;
      if (x.job === 'OTHER') { out[p.id] = 'PROSE_SECTION'; continue; }
      if (x.job !== 'DECISION' || typeof x.quote !== 'string' || !norm(x.quote)) continue;
      // The decision must be stated in what the reader was shown: the request, or the shown part of the text.
      const q = norm(x.quote);
      const where = [p.request ?? '', shown(p.text) ?? ''].map(norm);
      if (where.some((w) => w.includes(q))) out[p.id] = 'DECISION_MEMO';
    }
    return Object.keys(out).length ? out : null;
  },
  floor(input) { return Object.fromEntries(input.pieces.map((p) => [p.id, UNREAD_UNIT_KIND])); },
};

/** The reading's input for a set of units: a held-back unit is shown by its request alone. */
export function unitKindInput(units: readonly Pick<GoldenUnit, 'unitId' | 'task' | 'artifact'>[], heldBack: ReadonlySet<string>, requestOf: (id: string) => string | null): UnitKindInput {
  return { pieces: units.map((u) => ({ id: u.unitId, request: requestOf(u.unitId), text: heldBack.has(u.unitId) ? null : u.artifact })) };
}

/** Each unit with the kind read for it; a unit the reading did not answer for keeps the unread kind. */
export function mintKinds<U extends { readonly unitId: string; readonly kind: UnitKind }>(units: readonly U[], read: UnitKindRead): U[] {
  return units.map((u) => ({ ...u, kind: read[u.unitId] ?? UNREAD_UNIT_KIND }));
}
