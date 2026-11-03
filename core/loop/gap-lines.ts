// atelier/core/loop/gap-lines.ts — A CLAIM WITHOUT PROOF IS ARGUED AT THE STRENGTH WHAT IS GIVEN SUPPORTS, OR GOES.
//
// A writer short of a fact fills: a plausible figure, a story that could have happened, a vague "many teams". The
// claim gate cuts what it can trace to nothing (./run-repair.ts, `enforceClaims`), and a cut is right for a sentence
// the piece can lose. A sentence the piece stands on is different: cut, it leaves a hole the reader feels.
//
// An earlier version put a line in its place that said what was not known ("How long setup takes is not measured
// yet."), and told the writer to do the same. On a blind test the drafts then talked about their own gaps in 21 of 25
// posts, and lost to a plain self-review every time: a reader never asked what the writer was not given. Now the line
// makes the same point without the unsupported specific (the mechanism, the reasoning, the author's view, plainly
// held), and what was missing is listed beside the draft (./inferred.ts), never in it.
//
// Two parts:
//   - the writer's contract (`GAP_LINE_RULE`): every specific comes from what is given; a point with no specific given
//     is made by reasoning, or left out; the piece never mentions what it was not given;
//   - in repair, with the option on (`gapLines`), a flagged sentence that is load-bearing is written again without the
//     unsupported specific instead of cut. Which sentences are load-bearing, and the line, are a reading (a small model,
//     in a fixed shape); code grounds the line (one sentence, short, no figure, no name the request and material do not
//     hold, none of the removed sentence's figures). With no model, or a line that does not hold, the sentence is cut
//     as before: there is no stock line to put in its place.

import type { Budget, InferenceClient } from '../inference/client.js';
import { readContext, type Decision, type Reading } from '../inference/reading.js';
import { numbersIn, namesIn } from './integrity.js';
import { sentencesOf } from '../observers/text.js';

/** The writer's contract on proof. Served before the draft. */
export const GAP_LINE_RULE = `EVERY SPECIFIC FROM WHAT IS GIVEN. Every figure, name, date, quotation and story comes from the request, the material or the facts listed for you. Where a point wants one that none of them gives, make the point with what is given (the reasoning, the mechanism, your view stated as yours), or leave it out. The piece speaks to its reader: it never mentions its notes, its sources or what it was not given.`;

/** The contract as the writer is shown it. */
export function renderGapLineRule(_opts: { readonly samples?: number } = {}): string {
  return GAP_LINE_RULE;
}

export type GapKind = 'FIGURE' | 'SOURCE' | 'EXPERIENCE';

export interface GapSpan { readonly start: number; readonly end: number; readonly text: string; readonly kind?: string }
export interface GapInput {
  /** the whole text the sentences are in */
  readonly text: string;
  readonly spans: readonly GapSpan[];
  /** the request and its material: the only names a gap line may hold */
  readonly given: string;
}
/** Per span, in order: the line to put in its place, or null to cut it as before. */
export type GapPlan = readonly (string | null)[];

/** Where a sentence sits, by code: alone in its paragraph (headings aside), or the first sentence under a heading. */
export function standsAlone(text: string, start: number, end: number): boolean {
  const heading = (l: string): boolean => /^\s*#{1,6}\s/.test(l);
  const cut = text.lastIndexOf('\n\n', start);
  const pStart = cut === -1 ? 0 : cut + 2;
  const next = text.indexOf('\n\n', end);
  const pEnd = next === -1 ? text.length : next;
  const body = text.slice(pStart, pEnd).split('\n').filter((l) => !heading(l)).join(' ').trim();
  if (sentencesOf(body).length <= 1) return true;
  // first in its paragraph's body: nothing but heading lines before it in the paragraph
  const before = text.slice(pStart, start).split('\n');
  if (before.some((l) => l.trim() && !heading(l))) return false;
  if (before.some((l) => heading(l))) return true;
  // or the paragraph before is a heading on its own
  const prev = text.slice(0, Math.max(0, pStart - 2)).trimEnd().split('\n').pop() ?? '';
  return heading(prev);
}

/** Why a gap line may not stand in for `sentence`, or null. Code only. */
export function gapLineProblem(line: string, sentence: string, given: string): string | null {
  const l = line.trim();
  if (!l) return 'the line was empty';
  if (sentencesOf(l).length !== 1) return 'the line is not one sentence';
  if (l.split(/\s+/).length > 30) return 'the line runs over thirty words';
  if (numbersIn(l).length) return 'the line states a figure';
  const known = new Set(namesIn(given).map((n) => n.toLowerCase()));
  const extra = namesIn(l).filter((n) => !known.has(n.toLowerCase()));
  if (extra.length) return `the line names ${extra.join(', ')}, which nothing given holds`;
  if (l.replace(/\s+/g, ' ').toLowerCase() === sentence.replace(/\s+/g, ' ').trim().toLowerCase()) return 'the line is the sentence as it was';
  return null;
}

/** The floor: no line is written without a reading, so every flagged sentence is cut as before. */
export function gapFloor(input: GapInput): GapPlan {
  return input.spans.map(() => null);
}

const SYSTEM = `Each numbered sentence below was taken out of a draft because it states something (a figure, a source, a story) nobody supplied. For each, decide whether the piece stands on it: would the paragraph or the argument around it lose its point without it?

- If it does not, answer loadBearing false: it will simply be cut.
- If it does, answer loadBearing true and write "line": ONE short sentence, in the draft's voice, that makes the same point without the unsupported specific: the mechanism, the reasoning, or the author's view stated as theirs. No number, no name the draft did not already use, and never a word about what is missing, not known or not given: the reader never saw the notes.`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['id', 'loadBearing', 'line'],
  properties: { id: { type: 'integer' }, loadBearing: { type: 'boolean' }, line: { type: 'string' } } } } } };

export const GAP_LINES: Reading<GapInput, GapPlan> = {
  id: 'gap-lines', version: '2', system: SYSTEM, schema: SCHEMA,
  toolName: 'emit_gap_lines', toolDescription: 'Say for each sentence whether the piece stands on it, and the one line that makes its point without the unsupported specific.',
  maxTokens: 1200, estimateUsd: 0.01,
  prompt: (i) => `<draft>\n${i.text.trim()}\n</draft>\n\n${i.spans.map((s, n) => `[${n + 1}] ${s.text.trim()}`).join('\n')}`,
  decide: (i) => (i.spans.length ? null : []),
  ground: (raw, i) => {
    const items = (raw as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return null;
    const floor = gapFloor(i);
    return i.spans.map((s, n) => {
      const it = (items as { id?: unknown; loadBearing?: unknown; line?: unknown }[]).find((x) => x.id === n + 1);
      if (!it || typeof it.loadBearing !== 'boolean') return floor[n];
      if (!it.loadBearing) return null;
      const line = typeof it.line === 'string' ? it.line.trim() : '';
      // a line that does not hold is no line: the sentence is cut, as it would be without the option
      return gapLineProblem(line, s.text, i.given) === null ? line : null;
    });
  },
  floor: gapFloor,
};

export interface GapLineOptions {
  readonly client?: InferenceClient | null;
  readonly model?: string | null;
  readonly budget?: Budget;
}

/** The plan for the flagged spans of one text: a gap line for each load-bearing one, null for each to cut. */
export function planGapLines(input: GapInput, opts: GapLineOptions = {}): Promise<Decision<GapPlan>> {
  return readContext(GAP_LINES, input, opts.client ?? null, opts.model ?? null, opts.budget ?? { spentUsd: 0, capUsd: 0.05 }, 'repair');
}

/** The sentence's span replaced by its gap line; the space around it kept. */
export function withGapLine(text: string, start: number, end: number, line: string): string {
  const raw = text.slice(start, end);
  const lead = /^\s*/.exec(raw)?.[0] ?? ''; const tail = /\s*$/.exec(raw)?.[0] ?? '';
  return `${text.slice(0, start)}${lead}${line.trim()}${tail}${text.slice(end)}`;
}
