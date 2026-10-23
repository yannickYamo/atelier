// atelier/core/observers/copied-runs.ts — THE STRETCHES OF A TEXT COPIED FROM ITS MATERIAL, AS MAXIMAL RUNS.
//
// Notes given as finished sentences come back as the piece's sentences: the writer copies what was meant as points. A
// count of overlapping 5-word windows says a 9-word copied sentence five times; a person reads it once, as one stretch.
// So the shared windows are joined into maximal runs: each run is a stretch of the text, in words and in characters,
// every 5 consecutive words of which appear in the material. Form only: words, lower-cased, compared as strings.

/** One copied stretch: where it stands in the text, its words as the text has them, and how many words it is. */
export interface SharedRun { readonly start: number; readonly end: number; readonly text: string; readonly words: number }

/** The shortest stretch counted as copied. */
export const RUN_WORDS = 5;
/** A copied stretch this long or longer is repaired like any listed finding (the material is points to write from). */
export const REPAIR_RUN_WORDS = 8;

interface Word { readonly w: string; readonly start: number; readonly end: number }
const words = (t: string): Word[] => [...t.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu)].map((m) => ({ w: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + m[0].length }));

/**
 * THE MAXIMAL RUNS `text` SHARES WITH `material` (`n` words at least, 5 by default): every window of `n` words of the text
 * that also stands in the material, joined with the windows that overlap it into one stretch. In text order.
 */
export function sharedRuns(text: string, material: string, n: number = RUN_WORDS): SharedRun[] {
  const m = words(material).map((x) => x.w);
  if (m.length < n) return [];
  const grams = new Set<string>();
  for (let i = 0; i + n <= m.length; i++) grams.add(m.slice(i, i + n).join(' '));
  const t = words(text);
  const out: SharedRun[] = [];
  let from = -1; let to = -1;
  const close = (): void => { if (from !== -1) out.push({ start: t[from].start, end: t[to].end, text: text.slice(t[from].start, t[to].end), words: to - from + 1 }); from = -1; };
  for (let i = 0; i + n <= t.length; i++) {
    if (!grams.has(t.slice(i, i + n).map((x) => x.w).join(' '))) continue;
    if (from !== -1 && i <= to) { to = Math.max(to, i + n - 1); continue; }
    close(); from = i; to = i + n - 1;
  }
  close();
  return out;
}
