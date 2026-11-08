// atelier/core/direct/prompt.ts — WHAT THE DIRECT WRITER IS SENT: THE PIECES, THE MATERIAL, THE TASK. NOTHING ELSE.
//
// Each layer a compiled skill put between the model and what the person gave it was measured as neutral or as a cost:
// rules about the author (73% of what the writer read), a plan that served three points instead of the notes, method
// steps that asked every piece for numbers nobody gave, a quota of moves. The baseline that won in every blind test sent
// three things and asked for the piece, then sent them again with the draft and asked for a check and a revision. This
// is that, with what Atelier adds where it was shown to help: the pieces of the kind asked for (./route.ts), each with
// the request it answered, and the person's own earlier corrections, shown to the review as theirs (../direct/kept.ts).
// A rule the author stated and required (a ban they wrote, "No em dashes.") is their word, not a reading of them: it is
// shown beside the task, in their words. Nothing read off their pieces is.
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

/** The author's method, whole, as the writer and the review read it; empty where the skill has none. */
export function methodBlock(method: string | undefined): string {
  const m = (method ?? '').trim();
  return m ? `The author's method for their pieces, in their words. Follow it wherever it applies to this piece:\n\n<method>\n${m.slice(0, METHOD_SHOWN)}\n</method>\n\n` : '';
}

/**
 * The material, the author's method and their own rules where they have them, what they settled before the draft, and
 * the task. A rule whose words are already in the method is not said twice.
 */
export function taskBlock(x: Pick<DirectInput, 'material' | 'task' | 'rules' | 'method' | 'settled'>): string {
  const material = x.material.length
    ? `The material for this piece:\n\n${x.material.map((m) => `<material name="${m.name}">\n${m.text.trim()}\n</material>`).join('\n\n')}\n\n`
    : '';
  const flat = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const inMethod = flat(x.method ?? '');
  const rules = (x.rules ?? []).filter((r) => !inMethod.includes(flat(r)) || !inMethod);
  const settled = x.settled?.trim() ? `${x.settled.trim()}\n\n` : '';
  return `${material}${methodBlock(x.method)}${rulesBlock(rules)}${settled}The task:\n\n<task>\n${x.task.trim()}\n</task>`;
}

/** The user turn that asks for the first draft. */
export const DRAFT_ASK = 'Write the piece now. Return only the piece, in Markdown, starting with its title if it has one.';

/** The person's corrections, as the review reads them: at most this many, newest first. */
export const EDITS_SHOWN = 8;

/**
 * The user turn that asks for the review and the revision of `draft`. THE SMALLEST REVISION: the arm that beat this one
 * on the same briefs asked the model only to fix what the author would not write, and kept the plainer voice. A review
 * asked to "check against the pieces, then revise" rewrote a median 77% of the lines and added the polish, maxims and
 * extra sections the judges named. No list of banned moves: what is wrong is what the author would not write.
 */
export function reviewAsk(draft: string, x: Pick<DirectInput, 'material' | 'edits' | 'rules' | 'method'>): string {
  const sources = x.material.length ? 'the material and the task' : 'the task';
  const edits = (x.edits ?? []).slice(0, EDITS_SHOWN);
  const corrections = edits.length
    ? `\n\nThe person corrected earlier drafts written for them like this. Where the draft does the same kind of thing, make the same kind of change:\n\n${edits.map((e) => `- "${e.before.trim().slice(0, 300)}"${e.after.trim() ? ` became "${e.after.trim().slice(0, 300)}"` : ' was cut'}`).join('\n')}`
    : '';
  return `Here is your draft:

<draft>
${draft.trim()}
</draft>

Read it as the author of the pieces above would. Fix anything they would not write${x.method?.trim() ? ', anything that goes against their method' : ''}${rulesBlock(x.rules) ? ', anything that breaks one of the author\'s rules (each one must hold)' : ''}, and any figure, name or story that does not come from ${sources}. Change only what needs changing; leave the rest of the draft as it is.${corrections}

Return only the full revised piece, in Markdown, starting with its title if it has one.`;
}
