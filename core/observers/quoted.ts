// atelier/core/observers/quoted.ts — WHAT A TEXT QUOTES OF THE TEXT IT WORKS ON IS NOT ITS OWN STYLE.
//
// A review quotes the proposal it reviews, and the proposal's em dashes, bold and contrasts were counted against the
// review: on the stage baseline (27 Oct) four of eight design reviews were blocked for the style of the text they quoted.
// Every stretch of six words or more that the subject text holds is masked (blanked, offsets kept) before a style count
// reads the work; the reviewer's own prose is read as written. Nothing here reads meaning: it is a run of words.

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
/** Marks that wrap a quoted run and belong to it: bold and quotation marks on its edges. */
const EDGE = new Set(['*', '_', '"', '“', '”', '‘', '’', "'"]);

/** `text` with every run of `run` words or more that `source` also holds blanked to spaces, character for character. */
export function maskQuoted(text: string, source: string, run = 6): string {
  const src = [...source.matchAll(WORD)].map((m) => m[0].toLowerCase());
  if (src.length < run) return text;
  const grams = new Set<string>();
  for (let i = 0; i + run <= src.length; i++) grams.add(src.slice(i, i + run).join(' '));
  const toks = [...text.matchAll(WORD)].map((m) => ({ w: m[0].toLowerCase(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const covered: boolean[] = toks.map(() => false);
  for (let i = 0; i + run <= toks.length; i++) {
    if (!grams.has(toks.slice(i, i + run).map((t) => t.w).join(' '))) continue;
    for (let j = i; j < i + run; j++) covered[j] = true;
  }
  if (!covered.some(Boolean)) return text;
  // UTF-16 units, as the match offsets are: a surrogate pair is two units and is never masked by half, since a run's edges are word boundaries.
  const chars: string[] = []; for (let k = 0; k < text.length; k++) chars.push(text.charAt(k));
  let i = 0;
  while (i < toks.length) {
    if (!covered[i]) { i++; continue; }
    let j = i; while (j + 1 < toks.length && covered[j + 1]) j++;
    let start = toks[i].start; let end = toks[j].end;
    while (start > 0 && EDGE.has(chars[start - 1])) start--;
    while (end < chars.length && EDGE.has(chars[end])) end++;
    for (let k = start; k < end; k++) if (chars[k] !== '\n') chars[k] = ' ';
    i = j + 1;
  }
  return chars.join('');
}
