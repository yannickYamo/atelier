// atelier/core/direct/prompt.ts — WHAT THE DIRECT WRITER IS SENT: THE PIECES, THE MATERIAL, THE TASK. NOTHING ELSE.
//
// The baseline that won every blind test (pieces, material, task; then a check and a revision), with what was shown to
// help: the pieces of the kind asked for (./route.ts), the person's earlier corrections (../direct/kept.ts), and the
// rules they stated, in their words. Nothing read off their pieces is told the writer.
//
// The pieces are the stable block (cached across the draft and the review); the material and the task are the
// variable block; the user turn asks for the piece.

import type { Piece } from './pieces.js';

export interface DirectInput {
  readonly pieces: readonly Piece[];
  readonly material: readonly { readonly name: string; readonly text: string }[];
  /** the task as the person typed it */
  readonly task: string;
  /** the author's own rules, in their words, that every piece holds: only what they stated and required, never a rule read off their pieces */
  readonly rules?: readonly string[];
  /** the author's method for their pieces, in their words, where the skill has one: shown whole, never a reading of it */
  readonly method?: string;
  /** what the person settled before the draft (./questions.ts, `editorNote`): only their answers, never a suggestion */
  readonly settled?: string;
  /** changes the person made to earlier drafts of this skill, before and after: their corrections */
  readonly edits?: readonly { readonly before: string; readonly after: string }[];
}

/** The pieces, whole, as the writer and the review read them. */
export function piecesBlock(pieces: readonly Piece[]): string {
  return `You are writing a new piece in the voice of the author of the pieces below. They are written the way the new piece should be written: how they open, how they argue and move, how they close, their words and their pace.

${pieces.map((p, i) => `<piece n="${i + 1}"${p.request ? ` request="${p.request.replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 400)}"` : ''}>\n${p.text}\n</piece>`).join('\n\n')}`;
}

/** The most of the author's own rules the writer is shown. */
export const RULES_SHOWN = 20;

/** The author's rules, as the writer and the review read them; empty where they stated none. */
export function rulesBlock(rules: readonly string[] | undefined): string {
  const shown = (rules ?? []).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, RULES_SHOWN);
  return shown.length ? `The author's own rules for their writing, in their words. Each one holds in this piece wherever it applies:\n\n<rules>\n${shown.map((r) => `- ${r}`).join('\n')}\n</rules>\n\n` : '';
}

/** The most of the author's method the writer is shown, in characters. */
export const METHOD_SHOWN = 12_000;

/** WHICH SOURCE DECIDES, SAID ONCE: the method over the pieces, in this prompt and the installed skill alike. */
export const methodDecides = (voice: 'author' | 'mine'): string => (voice === 'mine' ? 'Where my method and my pieces differ, my method decides.' : 'Where the method and the pieces differ, the method decides.');

/** The author's method, whole, as the writer and the review read it; empty where the skill has none. */
export function methodBlock(method: string | undefined): string {
  const m = (method ?? '').trim();
  return m ? `The author's method for their pieces, in their words. Follow it wherever it applies to this piece. ${methodDecides('author')}\n\n<method>\n${m.slice(0, METHOD_SHOWN)}\n</method>\n\n` : '';
}

/** What the author wants from the piece (their answers, first), the material, the method, the author's rules (one the
 *  method says is not repeated), what else was settled, the task. */
export function taskBlock(x: Pick<DirectInput, 'material' | 'task' | 'rules' | 'method' | 'settled'> & { readonly points?: boolean; readonly intent?: string }): string {
  const material = x.material.length
    ? `The material for this piece. A note marked for one use or one kind of piece is used only there.\n\n${x.material.map((m) => `<material name="${m.name}">\n${m.text.trim()}\n</material>`).join('\n\n')}\n\n${x.points ? `${DIRECT_POINTS_NOTE}\n\n` : ''}`
    : '';
  const flat = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const inMethod = flat(x.method ?? '');
  const rules = (x.rules ?? []).filter((r) => !inMethod.includes(flat(r)) || !inMethod);
  const settled = x.settled?.trim() ? `${x.settled.trim()}\n\n` : '';
  const intent = x.intent?.trim() ? `${x.intent.trim()}\n\n` : '';
  return `${intent}${material}${methodBlock(x.method)}${rulesBlock(rules)}${settled}The task:\n\n<task>\n${x.task.trim()}\n</task>`;
}

export const ANSWERS_HEAD = 'WHAT THE AUTHOR ANSWERED BEFORE THIS PIECE WAS WRITTEN, in their own words:';

/** Material in finished sentences (core/loop/material-points.ts) is facts to write from; the author's pieces are the voice. */
export const DIRECT_POINTS_NOTE = 'The material above is facts and points to write from, not a voice: say each one the way the author\'s pieces would, in new sentences. Do not reuse its sentences, its stretches of wording or its coined phrases.';

/** With --voice-select, where the request takes the author's voice only (core/direct/route.ts): told to the writer. */
export const VOICE_ONLY_NOTE = 'The person brings their own content and its shape. Write it in the author\'s voice, as their pieces sound: their register, their phrasing, their pace, how they open and close. Keep the order, the sections and the argument of the person\'s material; do not take the structure, the sections, the examples or the argument of the author\'s pieces, and do not let the piece read as a version of any of them.';

/** The user turn that asks for the first draft. */
export const DRAFT_ASK = 'Write the piece now. Return only the piece, in Markdown, starting with its title if it has one.';

/** The person's corrections, as the review reads them: at most this many, newest first. */
export const EDITS_SHOWN = 8;

/** The review of `draft`, THE SMALLEST REVISION: fix only what the author would not write (a review asked to check and
 *  revise rewrote 77% of lines and added polish, maxims and sections). No list of banned moves. */
export function reviewAsk(draft: string, x: Pick<DirectInput, 'material' | 'edits' | 'rules' | 'method'> & { readonly style?: string; readonly answered?: boolean }): string {
  const from = [x.material.length ? 'the material' : '', x.answered ? 'the author\'s answers' : '', 'the task'].filter(Boolean);
  const sources = from.length > 1 ? `${from.slice(0, -1).join(', ')} and ${from[from.length - 1]}` : from[0];
  const edits = (x.edits ?? []).slice(0, EDITS_SHOWN);
  const corrections = edits.length
    ? `\n\nThe person corrected earlier drafts written for them like this. Where the draft does the same kind of thing, make the same kind of change:\n\n${edits.map((e) => `- "${e.before.trim().slice(0, 300)}"${e.after.trim() ? ` became "${e.after.trim().slice(0, 300)}"` : ' was cut'}`).join('\n')}`
    : '';
  return `Here is your draft:

<draft>
${draft.trim()}
</draft>

Read it as the author of the pieces above would. Fix anything they would not write${x.method?.trim() ? ', anything that goes against their method' : ''}${rulesBlock(x.rules) ? ', anything that breaks one of the author\'s rules (each one must hold)' : ''}, any figure, name or story that does not come from ${sources}, and any claim made stronger than ${from.length > 1 ? 'these support' : 'it supports'}. Change only what needs changing; leave the rest of the draft as it is.${corrections}${x.style?.trim() ? `\n\n${x.style.trim()}` : ''}

Return only the full revised piece, in Markdown, starting with its title if it has one.`;
}
