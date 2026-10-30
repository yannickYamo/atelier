// atelier/core/loop/echo.ts — THE NOTES ARE FOR THE WRITER, NEVER PART OF THE WORK.
//
// After the cached skill, a run serves this request's notes (core/fidelity/request-notes.ts): the brief ("For this
// request, my method's steps that apply: 1, 3"), the rules set aside, the slot shape. They tell the writer how to work;
// a writer that prints one into the piece has delivered an instruction as prose, and no rule of the standard reads it.
// Code removes them before anything checks the draft: a line of the output that is a line of the notes, read without
// its list marker, its case and its spacing, or that opens as one of eight words or more opens, outside any code fence.
// Only lines the notes hold are removed, so nothing the person asked for is ever touched by this.

import { maskCode } from '../observers/text.js';
import { wordsOf } from '../observers/text.js';

/** How many opening words of a served line mark an echo of it, when the line has at least that many. */
export const OPENING_WORDS = 8;
/** A served line shorter than this is not matched: "Given: the request." alone could be the writer's own words. */
export const MIN_WORDS = 4;

/** A line as compared: lower case, no list marker, heading mark or quote mark, one space between words, no trailing stop. */
export const normalLine = (l: string): string => l.trim().replace(/^(?:[-*+•]|\d+[.)]|#{1,6}|>)\s+/, '').toLowerCase().replace(/\s+/g, ' ').replace(/[.:;,]+$/, '').trim();

/** The lines of the served notes a draft may echo, as compared. */
export function servedLines(notes: string): string[] {
  return [...new Set(notes.split('\n').map(normalLine).filter((l) => wordsOf(l).length >= MIN_WORDS))];
}

const opening = (l: string): string | null => { const w = wordsOf(l); return w.length >= OPENING_WORDS ? w.slice(0, OPENING_WORDS).join(' ') : null; };

/** `text` with every line that echoes a line of `notes` removed, and the lines removed, as written. */
export function withoutServedNotes(text: string, notes: string): { readonly text: string; readonly removed: string[] } {
  const served = servedLines(notes);
  if (!served.length) return { text, removed: [] };
  const whole = new Set(served); const opens = new Set(served.map(opening).filter((o): o is string => o !== null));
  const lines = text.split('\n'); const masked = maskCode(text).split('\n');
  const removed: string[] = []; const kept: string[] = [];
  lines.forEach((line, i) => {
    // inside a fence the masked line is blank: code is never read as an echo
    const n = masked[i].trim() ? normalLine(line) : '';
    const o = n ? opening(n) : null;
    if (n && (whole.has(n) || (o !== null && opens.has(o)))) { removed.push(line); return; }
    kept.push(line);
  });
  if (!removed.length) return { text, removed };
  // two blank lines left where a line stood are one
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, ''), removed };
}
