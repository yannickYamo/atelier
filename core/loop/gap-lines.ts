// atelier/core/loop/gap-lines.ts — A CLAIM WITHOUT PROOF BECOMES ONE HONEST LINE, OR GOES. NEVER FILLER.
//
// A writer short of a fact fills: a plausible figure, a story that could have happened, a vague "many teams". The
// claim gate cuts what it can trace to nothing (./run-repair.ts, `enforceClaims`), and a cut is right for a sentence
// the piece can lose. A sentence the piece stands on is different: cut, it leaves a hole the reader feels and nobody
// names. Here such a sentence is replaced by one line that says what is not known, so the gap is in plain view.
//
// Two parts:
//   - the writer's contract (`GAP_LINE_RULE`): state the gap in one line, or drop the claim; never fill;
//   - in repair, with the option on (`gapLines`), a flagged sentence that is load-bearing is replaced by a gap line
//     instead of cut. Which sentences are load-bearing, and the line's words, are a reading (a small model, in a fixed
//     shape); code grounds the line (one sentence, short, no figure, no name the request and material do not hold, none
//     of the removed sentence's figures). With no model, or a line that does not hold, the floor decides: a sentence is
//     load-bearing when it stands alone in its paragraph or opens a section, and its line is a plain one by kind.

import type { Budget, InferenceClient } from '../inference/client.js';
import { readContext, type Decision, type Reading } from '../inference/reading.js';
import { numbersIn, namesIn } from './integrity.js';
import { sentencesOf } from '../observers/text.js';

/** The writer's contract on proof. Served before the draft. */
export const GAP_LINE_RULE = `WHEN A CLAIM NEEDS PROOF YOU DO NOT HAVE. Every figure, name, date, quotation and story must come from the request, the material or the facts listed for you. Where the piece needs one that none of them gives, do not fill it: no plausible number, no story that could have happened, no "many" or "most" standing in for a count. Either say in one plain line what is not known yet ("How long setup takes for a team this size is not measured yet."), or leave the claim out. One line per gap, never a paragraph about it.`;

/** The contract as the writer is shown it; with a count of sample facts, the gap line is tied to them. */
export function renderGapLineRule(opts: { readonly samples?: number } = {}): string {
  const n = opts.samples ?? 0;
  return n > 0 ? `${GAP_LINE_RULE} ${n} of the facts listed for you ${n === 1 ? 'is a SAMPLE' : 'are SAMPLES'}: each is such a gap.` : GAP_LINE_RULE;
}

export type GapKind = 'FIGURE' | 'SOURCE' | 'EXPERIENCE';

/** The floor's line, by kind: plain, short, no figure and no name. */
export const GAP_FLOOR: Readonly<Record<GapKind, string>> = {
  FIGURE: 'The exact figure for this is not known yet.',
  SOURCE: 'The source for this has not been confirmed yet.',
  EXPERIENCE: 'There is no first-hand account of this to draw on yet.',
};

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

const kindOf = (k: string | undefined): GapKind => (k === 'SOURCE' || k === 'EXPERIENCE' ? k : 'FIGURE');

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

/** The floor: load-bearing by position, the plain line by kind. */
export function gapFloor(input: GapInput): GapPlan {
  return input.spans.map((s) => (standsAlone(input.text, s.start, s.end) ? GAP_FLOOR[kindOf(s.kind)] : null));
}

const SYSTEM = `Each numbered sentence below was taken out of a draft because it states something (a figure, a source, a story) nobody supplied. For each, decide whether the piece stands on it: would the paragraph or the argument around it lose its point without it?

- If it does not, answer loadBearing false: it will simply be cut.
- If it does, answer loadBearing true and write "line": ONE short sentence, in the draft's voice, that says plainly what is not known yet, in place of the claim ("How many teams switched is not measured yet."). No number, no name the draft did not already use, no hedge stacked on a hedge, and never a new claim.`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['id', 'loadBearing', 'line'],
  properties: { id: { type: 'integer' }, loadBearing: { type: 'boolean' }, line: { type: 'string' } } } } } };

export const GAP_LINES: Reading<GapInput, GapPlan> = {
  id: 'gap-lines', version: '1', system: SYSTEM, schema: SCHEMA,
  toolName: 'emit_gap_lines', toolDescription: 'Say for each sentence whether the piece stands on it, and the one line that names the gap.',
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
      // a line that does not hold falls back to the floor's plain line, for a sentence the model called load-bearing
      return gapLineProblem(line, s.text, i.given) === null ? line : GAP_FLOOR[kindOf(s.kind)];
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
