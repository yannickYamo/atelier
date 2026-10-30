// atelier/core/loop/corrections.ts — WHAT A FIX TOOK OUT OF A PIECE STAYS OUT OF IT.
//
// A person said "change this sentence"; the next round of the same piece wrote the old wording back in. Each accepted
// fix of a piece (`atelier fix`, ./surgical-fix.ts) records the before and the after of every span it changed; the
// stretches of 5 words or more the before had and the fixed piece no longer has are what was REMOVED. A later fix, or a
// run that writes the piece again, may not bring one back: a removed stretch reappearing is a finding the repair
// rewrites, and the record says it. Kept to the piece and its later fixes: no rule is added to the standard.
//
// FORM ONLY. Words, lower-cased, compared as strings in windows of 5. A window counts as brought back only where the new
// text has it and the text it was made from did not: wording the piece still carries is never a reintroduction.

import { RUN_WORDS, type SharedRun } from '../observers/copied-runs.js';

interface Word { readonly w: string; readonly start: number; readonly end: number }
const words = (t: string): Word[] => [...t.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu)].map((m) => ({ w: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + m[0].length }));
const windows = (ws: readonly Word[], n = RUN_WORDS): string[] => { const out: string[] = []; for (let i = 0; i + n <= ws.length; i++) out.push(ws.slice(i, i + n).map((x) => x.w).join(' ')); return out; };

/** One span a fix changed: what stood there, and what stands there now. */
export interface Changed { readonly before: string; readonly after: string }

/**
 * THE STRETCHES A FIX REMOVED: in each span's before, every maximal stretch whose 5-word windows are none of them in the
 * fixed piece, as the before has it. A span that was only reworded around the same words removed nothing of them.
 */
export function removedStretches(changed: readonly Changed[], fixed: string): string[] {
  const kept = new Set(windows(words(fixed)));
  const out: string[] = [];
  for (const c of changed) {
    const ws = words(c.before);
    let from = -1; let to = -1;
    const close = (): void => { if (from !== -1) out.push(c.before.slice(ws[from].start, ws[to].end)); from = -1; };
    for (let i = 0; i + RUN_WORDS <= ws.length; i++) {
      if (kept.has(ws.slice(i, i + RUN_WORDS).map((x) => x.w).join(' '))) { close(); continue; }
      if (from !== -1 && i <= to) { to = i + RUN_WORDS - 1; continue; }
      close(); from = i; to = i + RUN_WORDS - 1;
    }
    close();
  }
  return [...new Set(out)];
}

/**
 * WHAT A NEW TEXT BRINGS BACK of what was removed: every maximal stretch of `text` whose 5-word windows are windows of a
 * removed stretch and are not in `previous` (the text it was made from), in text order. A window the owner's own words
 * carry (`own`: their method, their standard's statements, their examples) is theirs to use, never banned for having
 * once been taken out of one piece.
 */
export function reintroducedRuns(text: string, removed: readonly string[], previous: string, own = ''): SharedRun[] {
  if (!removed.length) return [];
  const had = new Set([...windows(words(previous)), ...windows(words(own))]);
  const gone = new Set(removed.flatMap((r) => windows(words(r))).filter((w) => !had.has(w)));
  if (!gone.size) return [];
  const t = words(text); const out: SharedRun[] = [];
  let from = -1; let to = -1;
  const close = (): void => { if (from !== -1) out.push({ start: t[from].start, end: t[to].end, text: text.slice(t[from].start, t[to].end), words: to - from + 1 }); from = -1; };
  for (let i = 0; i + RUN_WORDS <= t.length; i++) {
    if (!gone.has(t.slice(i, i + RUN_WORDS).map((x) => x.w).join(' '))) continue;
    if (from !== -1 && i <= to) { to = Math.max(to, i + RUN_WORDS - 1); continue; }
    close(); from = i; to = i + RUN_WORDS - 1;
  }
  close();
  return out;
}

/** The record's line for what a fix or a run kept out of a piece: how many stretches were removed before, and which came back. */
export interface CorrectionsRecord { readonly removed: number; readonly reintroduced: readonly string[] }
