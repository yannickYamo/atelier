// atelier/core/loop/locators.ts — WORK THAT CITES A LINE IS SHOWN THE LINE NUMBERS.
//
// A method that says "cite each item as path:line" asks the writer to count lines in what it was given, and
// models count badly: on ten diffs with one planted defect each, a reviewer shown the raw diff cited the
// defect's exact line in 1 of 20 reviews, and in 13 of 20 when each line carried its number. Every arm of a
// comparison failed the same way, the hand-written rule list included, so no instruction fixes it. What fixes it
// is not asking for the count: the material is served with its line numbers, and a citation is then something
// code can look up.
//
// Decided from the skill, never from a kind of work: a skill whose own rules or examples cite positions
// (`citesLines`) gets its material numbered; any other skill is served exactly as before.

/** A citation of a place: a file path, a colon, a line number. `src/a.js:41`, `terms.md:12`. Never part of a URL, an address or a longer number. */
const CITATION = /(?<![\w/.:@-])([\w./-]+\.[A-Za-z]\w{0,5}):(\d{1,6})(?!\d|\.\d)/g;
const NAMES_THE_FORM = /\b(?:path|file|filename):line\b/i;
const CITES = /\b(?:cit(?:e|es|ed|ing)|referenc(?:e|es|ed|ing)|point(?:s|ing)? (?:to|at)|quot(?:e|es|ed|ing))\b/i;
const NOT = /\b(?:never|no|not|without|don't|do not|avoid)\b/i;

/**
 * Does the skill, as served, cite places by line? It does when a rule names the form ("path:line"), when a
 * sentence that asks for citing speaks of line numbers and does not forbid them, or when its own examples carry
 * three or more such citations: one `notes.md:3` in passing is not a habit. Read wrongly, the cost is small and one
 * way: material shown with numbers nobody uses.
 */
export function citesLines(servedText: string): boolean {
  if (NAMES_THE_FORM.test(servedText)) return true;
  if (servedText.split(/(?<=[.!?])\s+|\n+/).some((x) => /\bline numbers?\b/i.test(x) && CITES.test(x) && !NOT.test(x))) return true;
  return [...servedText.matchAll(CITATION)].length >= 3;
}

export interface NumberedLine { readonly path: string; readonly line: number; readonly text: string; readonly added: boolean }

const HUNK = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** One row of a material: itself, and the citable line it is, if it is one. */
interface Row { readonly raw: string; readonly at: NumberedLine | null; readonly inHunk: boolean }

/**
 * EVERY ROW OF A MATERIAL, AND WHICH OF THEM A CITATION CAN POINT AT. One reading, used for what is served and
 * for what is looked up, so the two cannot disagree.
 *
 * A unified diff is read by its hunks. A hunk counts only under a `+++` file header, and lasts exactly as many
 * lines as its own header says: what follows it (a second file, a closing fence, prose, a patch trailer) is not
 * code. Each added or context line has its number in the new file; a removed line has none. A material with no
 * such hunk is numbered from 1 under its own name, without the empty row a final newline leaves.
 */
function rowsOf(name: string, text: string): Row[] {
  const raws = text.replace(/\r\n/g, '\n').split('\n');
  const out: Row[] = []; let path: string | null = null; let n = 0; let newLeft = 0; let oldLeft = 0; let hunks = 0;
  for (const raw of raws) {
    if (newLeft > 0 || oldLeft > 0) {
      if (raw.startsWith('\\')) { out.push({ raw, at: null, inHunk: true }); continue; }
      if (raw.startsWith('-')) { oldLeft -= 1; out.push({ raw, at: null, inHunk: true }); continue; }
      const added = raw.startsWith('+');
      out.push({ raw, at: { path: path ?? name, line: n, text: raw.slice(1), added }, inHunk: true });
      n += 1; newLeft -= 1; if (!added) oldLeft -= 1;
      continue;
    }
    const file = /^\+\+\+ (?:b\/)?([^\t\n]+)/.exec(raw);
    if (file) { path = file[1].trim(); out.push({ raw, at: null, inHunk: false }); continue; }
    const h = path !== null ? HUNK.exec(raw) : null;
    if (h) { n = Number(h[2]); oldLeft = h[1] === undefined ? 1 : Number(h[1]); newLeft = h[3] === undefined ? 1 : Number(h[3]); hunks += 1; }
    out.push({ raw, at: null, inHunk: false });
  }
  if (hunks) return out;
  const plain = raws.length > 1 && raws[raws.length - 1] === '' ? raws.slice(0, -1) : raws;
  return plain.map((raw, i) => ({ raw, at: { path: name, line: i + 1, text: raw, added: true }, inHunk: false }));
}

/** The lines of one material that a citation can point at. */
export const linesOf = (name: string, text: string): NumberedLine[] => rowsOf(name, text).flatMap((r) => (r.at ? [r.at] : []));

/** The material as it is served to a skill that cites lines: every citable line behind its number. */
export function numbered(name: string, text: string): string {
  return rowsOf(name, text).map((r) => (r.at ? `${String(r.at.line).padStart(5)}  ${r.raw}` : r.inHunk ? `       ${r.raw}` : r.raw)).join('\n');
}

export interface LineCitation { readonly path: string; readonly line: number; readonly why: string | null; /** where it stands in the work */ readonly start: number; readonly end: number }

const EMPTY = /^[\s{}()[\];,]*$/;
const sameFile = (cited: string, path: string): boolean => path === cited || path.endsWith(`/${cited}`) || cited.endsWith(`/${path}`);

/**
 * EVERY PLACE THE WORK CITES, LOOKED UP. `why` is null for a citation that lands on a line of the material with
 * something on it (for a diff: a line the change adds), and otherwise says what is wrong: no such file, no such
 * line, a line the change does not add, a blank line or a lone bracket. A path matches by its ending, so
 * `search.js:61` finds `src/users/search.js`; where two files end the same way, the citation stands if it stands
 * in either. A material bound under a plain name (`--with notes=...`) is cited by that name. Nothing is judged
 * about whether it is the right line: only whether it is a line.
 */
export function citedLines(output: string, material: readonly { readonly name: string; readonly text: string }[]): LineCitation[] {
  const all = material.flatMap((m) => linesOf(m.name, m.text));
  const plainNames = [...new Set(all.map((l) => l.path))].filter((p) => !/\.[A-Za-z]\w{0,5}$/.test(p)).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const byName = plainNames.length ? new RegExp(`(?<![\\w/.:@-])(${plainNames.join('|')}):(\\d{1,6})(?!\\d|\\.\\d)`, 'g') : null;
  const found = [...output.matchAll(CITATION), ...(byName ? output.matchAll(byName) : [])].sort((a, b) => a.index - b.index);
  const seen = new Set<string>(); const out: LineCitation[] = [];
  for (const m of found) {
    const path = m[1]; const line = Number(m[2]); const key = `${path}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const exact = all.filter((l) => l.path === path); const file = exact.length ? exact : all.filter((l) => sameFile(path, l.path));
    const at = file.filter((l) => l.line === line);
    const whyOf = (l: NumberedLine): string | null => (!l.added ? 'a line the change does not add' : EMPTY.test(l.text) ? 'a blank line or a lone bracket' : null);
    out.push({ path, line, start: m.index, end: m.index + m[0].length, why: !file.length ? 'no such file in the material' : !at.length ? 'no such line in the material' : at.some((l) => whyOf(l) === null) ? null : whyOf(at[0]) });
  }
  return out;
}
