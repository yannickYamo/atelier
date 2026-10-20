// atelier/core/method/infer.ts — THE METHOD THE PIECES FOLLOW, READ WHEN THE OWNER WROTE NONE.
//
// Structured work always has a method: a contract, a report, a price comparison, a code review each take their steps in
// an order the finished pieces show. The owner's note, when there is one, is that method in their words, and every run
// is briefed from it (core/loop/execution-brief.ts): which steps this request needs, what each asks the writer to
// decide, which of the author's own moves it calls for. With no note the brief had nothing to select by and the moves
// had nothing to link to, on the very work where they matter most. So, with no note, the steps are read off the pieces:
// one instruction a step, in the order the pieces take them, each shown by a quote copied from one piece.
//
// What is read is a habit of the pieces, never a rule: an inferred step is served through the brief for one request,
// as "my usual steps, read from my pieces and not confirmed", is never a requirement of the standard, blocks nothing,
// and the owner makes it theirs by writing the note (`atelier method <file>`). Plain long-form writing with no common
// shape yields no method, and the build says so. Evaluated in bench/readings/cases/method-infer.json.

import type { Reading } from '../inference/reading.js';
import type { DecisionUnit } from '../state/canonical-state.js';
import { quoteIsReal } from '../taste/reader.js';

export interface InferPiece { readonly name: string; readonly text: string }
export interface InferInput { readonly purpose: string | null; readonly pieces: readonly InferPiece[] }
export interface InferredStep { readonly text: string; readonly piece: string; readonly quote: string }
export type InferOutput = readonly InferredStep[];

/** The record kept beside the skill: the steps, each with its unit read as the owner's steps are, and who read them. */
export interface InferredMethod {
  readonly schema: 1;
  readonly reader: string;
  readonly reading: string;
  readonly steps: readonly (InferredStep & { readonly id: string; readonly unit: DecisionUnit | null })[];
  readonly builtAt: string;
}

/** The most of each piece the reading sees: the shape is in the headings and the openings, not the whole text. */
export const OUTLINE_CHARS = 1800;
export const MAX_PIECES = 8;
export const MIN_STEPS = 2;
export const MAX_STEPS = 12;

/** A piece as an outline: every heading, and the first sentences under each, up to the budget. */
export function outlineOf(text: string, budget = OUTLINE_CHARS): string {
  const lines = text.split('\n'); const out: string[] = []; let afterHeading = 0; let size = 0;
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) continue;
    const heading = /^#{1,6}\s/.test(l) || /^\*\*[^*]{2,80}\*\*\s*$/.test(l.trim());
    if (heading) { afterHeading = 2; } else if (afterHeading > 0) { afterHeading -= 1; } else if (out.length) continue;
    if (size + l.length > budget) break;
    out.push(l); size += l.length + 1;
  }
  return out.join('\n');
}

export const METHOD_INFER_SYSTEM = `You read finished pieces of one kind of work by one person, each shown as its headings and the opening of each part. Read the method they follow: the steps, in the order the pieces take them, that a person doing this work would follow so a new piece comes out like these.

For each step give:
- text: one instruction in the person's own terms, as they might write it in a note on how they work ("Open with the verdict: which vendor costs least for this team, in one line", "List what must be fixed, each with its file and line"). What to do, what it holds, and when it applies if only some pieces do it. Never a description of style, never a rule about words.
- piece: the name of one piece that shows the step done.
- quote: a passage copied character for character from THAT piece showing the step: a heading, or the sentence where the step is done.

Only steps most of the pieces show, in the pieces' order. Between ${MIN_STEPS} and ${MAX_STEPS} steps. When the pieces share no method (essays or posts with no common shape, each built its own way), return no steps at all.`;

export const METHOD_INFER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, piece: { type: 'string' }, quote: { type: 'string' } }, required: ['text', 'piece', 'quote'], additionalProperties: false } } },
  required: ['steps'], additionalProperties: false,
};

export const METHOD_INFER: Reading<InferInput, InferOutput> = {
  id: 'method-infer', version: '1',
  system: METHOD_INFER_SYSTEM, schema: METHOD_INFER_SCHEMA,
  toolName: 'emit_method_infer', toolDescription: 'The steps the pieces follow, in order, each with a quote from one piece that shows it; none when the pieces share no method.',
  maxTokens: 2500, estimateUsd: 0.02,
  prompt(input) {
    const pieces = input.pieces.slice(0, MAX_PIECES).map((p) => `=== ${p.name} ===\n${outlineOf(p.text)}`).join('\n\n');
    return `${input.purpose ? `WHAT THE WORK IS FOR: ${input.purpose}\n\n` : ''}THE PIECES:\n${pieces}`;
  },
  // ONE PIECE IS NOT A METHOD: nothing to compare its order against.
  decide(input) { return input.pieces.length < 2 ? [] : null; },
  // GROUNDED STEP BY STEP: a quote must be verbatim in the piece it names; a step with none is dropped; fewer than two
  // left is no method read (null, the floor), so a reading that could not show its steps changes nothing.
  ground(raw, input) {
    const r = raw as { steps?: unknown } | null;
    if (!r || !Array.isArray(r.steps)) return null;
    const byName = new Map(input.pieces.map((p) => [p.name, p]));
    const out: InferredStep[] = []; const seen = new Set<string>();
    for (const s of r.steps as { text?: unknown; piece?: unknown; quote?: unknown }[]) {
      const text = typeof s.text === 'string' ? s.text.trim().replace(/\s+/g, ' ').slice(0, 240) : '';
      const piece = typeof s.piece === 'string' ? byName.get(s.piece) : undefined;
      const quote = typeof s.quote === 'string' ? s.quote.trim().slice(0, 300) : '';
      if (!text || !piece || !quote || !quoteIsReal(quote, piece.text) || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase()); out.push({ text, piece: piece.name, quote });
      if (out.length >= MAX_STEPS) break;
    }
    return out.length >= MIN_STEPS ? out : null;
  },
  floor() { return []; },
};

/** The inferred steps as a method note in the owner's shape: one numbered line a step. */
export const noteOf = (steps: readonly InferredStep[]): string => steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
