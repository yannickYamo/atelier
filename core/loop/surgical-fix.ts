// atelier/core/loop/surgical-fix.ts — CHANGE WHAT WAS NAMED, KEEP THE REST WORD FOR WORD.
//
// "Keep this piece as it is, except the second paragraph" came back with 27 of 44 sentences changed, and with wording an
// earlier round had taken out written back in. A fix that writes the whole piece again is a new piece. So a fix is
// surgical by default:
//
//   1. THE READING (house pattern, ../inference/reading.ts). A small model is shown the piece's sentences, numbered, and
//      the person's words, and answers in a closed shape: the numbers of the sentences the instruction is about, or NONE
//      (`whole: true`), which means the instruction is about the whole piece. Code grounds it: a number outside the piece
//      is dropped, an answer naming both or neither is no answer. With no model, or nothing grounded, the floor reads no
//      meaning: the piece is written again whole, as it always was.
//   2. THE SPANS. The sentences named are grown into spans (consecutive ones join); only these are given to the writer,
//      one at a time, with the whole piece around them for context. The writer puts the new text inside the `<work>`
//      field (./work-field.ts), so what it says about the task is never delivered.
//   3. THE SPLICE (./repair.ts, `applyRepair`). The replacements are put back by code, from the end: nothing outside a
//      span can change, because the writer never holds the pen for it. A span the person named is licensed to change
//      what it claims (`asked`); a stutter at a seam is still refused.
//   4. WHAT WAS REMOVED STAYS OUT (./corrections.ts): a replacement that brings back wording an earlier fix of this piece
//      took out is written once more without it, and kept as it was if it brings it back again.
//
// The diff (sentences changed of total, and every span's before and after) is what the terminal shows and the record
// keeps. Outside the spans named, nothing changes: that count is measured, not promised.

import type { Reading } from '../inference/reading.js';
import { spend, type Budget, type InferenceClient } from '../inference/client.js';
import { sentencesOf } from '../observers/text.js';
import { applyRepair, type RepairTarget, type Applied, type Reverted } from './repair.js';
import { workField, WORK_FIELD_ASK, type WorkField } from './work-field.js';
import { reintroducedRuns } from './corrections.js';

/** What the reading is shown: the person's words and the piece's sentences, in order (numbered from 1). */
export interface FixScopeInput { readonly instruction: string; readonly sentences: readonly string[] }
/** What the instruction is about: the sentences named, or the whole piece. */
export type FixScope = { readonly kind: 'SPANS'; readonly ids: readonly number[] } | { readonly kind: 'WHOLE' };

export const FIX_SCOPE_SYSTEM = `You are shown a finished piece of writing, sentence by sentence, each with its number, and what the person who asked for it wants changed, in their words.

Say which sentences the change is about: the numbers of every sentence that has to change for the instruction to be carried out, and no other. A sentence that only sits near one that changes is not about it.

If the instruction is about the whole piece (its tone throughout, its length overall, its structure, "write it again"), and no list of sentences would carry it, set whole to true and give no numbers.`;

export const FIX_SCOPE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { sentences: { type: 'array', items: { type: 'integer' } }, whole: { type: 'boolean' } },
  required: ['sentences', 'whole'], additionalProperties: false,
};

export const FIX_SCOPE: Reading<FixScopeInput, FixScope> = {
  id: 'fix-scope', version: '1',
  system: FIX_SCOPE_SYSTEM, schema: FIX_SCOPE_SCHEMA,
  toolName: 'emit_fix_scope', toolDescription: 'The numbers of the sentences the instruction is about, or whole: true when it is about the whole piece.',
  maxTokens: 400, estimateUsd: 0.005,
  prompt(input) {
    return `What the person wants changed:\n"${input.instruction.slice(0, 2000)}"\n\nThe piece, sentence by sentence:\n${input.sentences.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`;
  },
  // A piece with no sentence, or no instruction, has nothing to be located in: written again whole.
  decide(input) { return input.sentences.length && input.instruction.trim() ? null : { kind: 'WHOLE' }; },
  ground(raw, input) {
    const r = raw as { sentences?: unknown; whole?: unknown } | null;
    if (!r || typeof r.whole !== 'boolean' || !Array.isArray(r.sentences)) return null;
    const ids = [...new Set(r.sentences.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= input.sentences.length))].sort((a, b) => a - b);
    if (r.whole) return r.sentences.length ? null : { kind: 'WHOLE' };
    return ids.length ? { kind: 'SPANS', ids } : null;
  },
  // No model, or nothing grounded: no meaning is read, and the piece is written again whole.
  floor() { return { kind: 'WHOLE' }; },
};

/**
 * The spans the named sentences make: consecutive sentences on one line join into one span, so a paragraph is rewritten as
 * one. Never across a line break: two list items, or the end of a paragraph and the start of the next, stay two spans, so
 * the breaks between them are never written again. `traced` is what a new figure or name may come from (./repair.ts).
 */
export type FixTarget = RepairTarget & { readonly sentenceIds: readonly number[] };
export function fixTargets(text: string, ids: readonly number[], instruction: string, traced = ''): FixTarget[] {
  const ss = sentencesOf(text);
  const wanted = [...new Set(ids)].filter((i) => i >= 1 && i <= ss.length).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const i of wanted) {
    const g = groups.at(-1);
    if (g?.at(-1) === i - 1 && !text.slice(ss[i - 2].end, ss[i - 1].start).includes('\n')) g.push(i); else groups.push([i]);
  }
  return groups.map((g, n) => {
    const start = ss[g[0] - 1].start; const end = ss[g[g.length - 1] - 1].end;
    return { id: n + 1, start, end, text: text.slice(start, end), reasons: [instruction], requirementIds: ['FIX'], drops: [], specifics: false, asked: true,
      traced: [instruction, traced, text].filter(Boolean).join('\n'), sentenceIds: g };
  });
}

export const FIX_WRITER_SYSTEM = `You change one passage of a finished piece, as the person who wrote it asked, and nothing else.

You are given the whole piece for context, the passage to change, and what the person wants. Write the passage again so that their instruction is carried out for it, in the voice of the piece around it. The text immediately before and after the passage will not change: your passage must read naturally between them. Do not repeat what comes just before or just after it.

${WORK_FIELD_ASK}`;

export const FIX_WRITER_SCHEMA: Record<string, unknown> = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false };

export function fixWriterPrompt(text: string, t: Pick<RepairTarget, 'text'>, instruction: string, keepOut: readonly string[]): string {
  return [`THE PIECE\n"""\n${text}\n"""`, `THE PASSAGE TO CHANGE\n"""\n${t.text}\n"""`, `WHAT THE PERSON WANTS\n"${instruction}"`,
    keepOut.length ? `The person already had this wording taken out of the piece. Do not bring any of it back:\n${keepOut.map((k) => `- "${k}"`).join('\n')}` : '',
    'Return the passage as it should now read, inside the work field.'].filter(Boolean).join('\n\n');
}

/**
 * One span written again by the writer: its work field, read by form. A reply that is not a non-empty string (none, or
 * empty) is no answer: `missing`, and its span is kept as it was. An empty work field in a reply is the writer's cut.
 */
export async function writeSpan(client: InferenceClient, budget: Budget, text: string, t: RepairTarget, instruction: string, keepOut: readonly string[]): Promise<WorkField & { readonly missing?: true }> {
  const reply = await spend(budget, 0.05, async () => {
    const x = await client.complete({ stableBlock: FIX_WRITER_SYSTEM, variableBlock: '', userMessage: fixWriterPrompt(text, t, instruction, keepOut),
      toolName: 'emit_fix', toolDescription: 'The passage as it should now read, inside <work></work>.', schema: FIX_WRITER_SCHEMA, maxTokens: 1500 });
    const j = x.json as { reply?: unknown } | null;
    return { value: typeof j?.reply === 'string' ? j.reply : '', cost: x.cost };
  }, 'repair');
  return reply.trim() ? workField(reply) : { ...workField(''), missing: true };
}

/** What a sentence diff counts: the sentences of the piece before, how many of them are gone, and how many of those were outside the spans named. */
export interface SentenceDiff { readonly total: number; readonly changed: number; readonly outside: number }

/**
 * THE DIFF, BY SENTENCE: a sentence of the piece before is changed when it no longer stands in the piece after, word for
 * word (each one matched once). `outside` counts the changed ones that are not among the sentences named.
 */
export function sentenceDiff(before: string, after: string, named: readonly number[]): SentenceDiff {
  const b = sentencesOf(before).map((s) => s.text.trim()); const left = new Map<string, number>();
  for (const s of sentencesOf(after)) left.set(s.text.trim(), (left.get(s.text.trim()) ?? 0) + 1);
  const keep = new Set(named); let changed = 0; let outside = 0;
  // The sentences not named are matched first: a named sentence the piece also carries elsewhere, word for word, is the
  // one that changed, never the unnamed copy.
  const order = [...b.keys()].sort((i, j) => Number(keep.has(i + 1)) - Number(keep.has(j + 1)));
  for (const i of order) {
    const n = left.get(b[i]) ?? 0;
    if (n > 0) { left.set(b[i], n - 1); continue; }
    changed += 1; if (!keep.has(i + 1)) outside += 1;
  }
  return { total: b.length, changed, outside };
}

export interface SurgicalResult {
  readonly text: string;
  readonly applied: readonly Applied[];
  readonly reverted: readonly Reverted[];
  readonly targets: readonly FixTarget[];
  /** what the writer said outside its work field, per span; false where a reply came with no field */
  readonly work: readonly { readonly delimited: boolean; readonly outside?: string }[];
  /** removed wording a replacement brought back: found, written again for, and still there (kept as it was) */
  readonly reintroduced: { readonly found: readonly string[]; readonly rewritten: number; readonly keptAsItWas: number };
  /** why the spans could not be written (the provider or the budget refused a call): the piece is then written again whole */
  readonly error?: string;
}

/**
 * THE SURGICAL FIX. Every span written again (`writeSpan`), the replacements spliced by code (`applyRepair`), and a
 * replacement that brings back removed wording written once more without it; one that brings it back again is not
 * spliced (its span stays as it was, said).
 */
export async function fixSpans(client: InferenceClient, budget: Budget, text: string, ids: readonly number[], instruction: string, removed: readonly string[],
  /** the person's material and own words: a new figure or name may come from it (./repair.ts); wording found in `own` is never "removed" */
  given: { readonly material?: string; readonly own?: string } = {}): Promise<SurgicalResult> {
  const targets = fixTargets(text, ids, instruction, given.material ?? '');
  const replies: { id: number; text: string }[] = []; const work: { delimited: boolean; outside?: string }[] = [];
  const found: string[] = []; let rewritten = 0; let keptAsItWas = 0;
  const applied: Applied[] = []; const reverted: Reverted[] = [];
  try {
    for (const t of targets) {
      let f = await writeSpan(client, budget, text, t, instruction, removed);
      work.push({ delimited: f.delimited, ...(f.outside ? { outside: f.outside } : {}) });
      // NO ANSWER IS NO CUT: the span stays as it was, and the record says so.
      if (f.missing) { reverted.push({ id: t.id, kind: 'CUT', lost: ['nothing: the writer returned no text for it'] }); continue; }
      let back = reintroducedRuns(f.text, removed, text, given.own);
      if (back.length) {
        found.push(...back.map((r) => r.text)); rewritten += 1;
        f = await writeSpan(client, budget, text, t, `${instruction} (and do not bring back: ${back.map((r) => `"${r.text}"`).join(', ')})`, removed);
        if (f.missing) { reverted.push({ id: t.id, kind: 'CUT', lost: ['nothing: the writer returned no text for it'] }); continue; }
        back = reintroducedRuns(f.text, removed, text, given.own);
        if (back.length) { keptAsItWas += 1; continue; }
      }
      replies.push({ id: t.id, text: f.text });
    }
  } catch (e) {
    // A PROVIDER OR BUDGET ERROR stops nothing: nothing is spliced, and the caller writes the piece again whole.
    return { text, applied: [], reverted: [], targets, work, reintroduced: { found: [], rewritten: 0, keptAsItWas: 0 }, error: (e as Error).message.split('\n')[0] };
  }
  const out = applyRepair(text, targets, replies, reverted, applied);
  return { text: out, applied, reverted, targets, work, reintroduced: { found: [...new Set(found)], rewritten, keptAsItWas } };
}
