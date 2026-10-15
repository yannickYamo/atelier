// atelier/core/loop/mechanical-repair.ts — THE FIXES THAT NEED NO MODEL.
//
// Two broken rules have a fix that is a matter of punctuation and layout, not wording: an em dash where
// the author never uses one, and a paragraph longer than the author ever writes. A model asked to repair
// either rewrote the sentences around them and was refused for making another rule worse, so the draft
// shipped still broken (a paragraph of eight sentences against a limit of six). These fixes change no
// word. The caller keeps one only if the draft breaks nothing it did not already break.

import type { StandardVersion } from '../state/canonical-state.js';
import { isMarkup } from '../observers/visible.js';
import { acts, type VerifyReport } from '../observers/verify.js';
import { paragraphSentences, wordsOf } from '../observers/text.js';
import { protectedRanges, grammarFixing } from '../observers/grammar.js';
import { numbersIn, namesIn } from './integrity.js';
import type { Span } from '../observers/registry.js';

/**
 * MECHANICAL ERRORS, CORRECTED IN PLACE. Each span the grammar rule flagged with a correction (core/observers/grammar.ts)
 * is replaced by exactly that correction, last first so earlier offsets stay true; a span with none is left for the
 * sentence rewrite. Nothing outside a span changes, no span inside a protected region is touched (the observer never
 * flags one; this checks again on the text it has), the whole text's word count moves by no more than the
 * corrections themselves, and its figures and names are the same after as before (./integrity.ts). Returns the text,
 * how many spans were corrected, and each change as it was made ("recieve" → "receive"), so every one is recorded.
 */
export function correctMechanicalErrors(text: string, spans: readonly Span[]): { text: string; corrected: number; changes: string[] } {
  const guarded = protectedRanges(text);
  const fixable = spans.filter((s) => s.replacement !== undefined && s.end > s.start && s.end <= text.length && text.slice(s.start, s.end) === s.text
    && !guarded.some((g) => s.start < g.end && s.end > g.start)).sort((a, b) => b.start - a.start);
  let out = text; let corrected = 0; let lastStart = Infinity; let allowed = 0; const changes: string[] = [];
  // A change is said as the stretch it was and what it became, with a few words around a mark ("done ." → "done.").
  const said = (s: Span, rep: string): string => {
    const mark = !/\p{L}/u.test(s.text);
    const word = mark ? (/[\p{L}\p{N}'’]+$/u.exec(text.slice(Math.max(0, s.start - 30), s.start))?.[0] ?? '') : '';
    const next = mark && /^[,.]/.test(text.slice(s.end)) ? text[s.end] : '';
    return `"${(word + s.text + next).replace(/;/g, ',').trim()}" → "${(word + rep + next).replace(/;/g, ',').trim() || '(removed)'}"`;
  };
  for (const s of fixable) {
    if (s.end > lastStart) continue;                                                     // overlapping: the later one only
    const rep = s.replacement ?? '';
    allowed += Math.abs(wordsOf(rep).length - wordsOf(s.text).length);
    out = `${out.slice(0, s.start)}${rep}${out.slice(s.end)}`;
    corrected += 1; lastStart = s.start; changes.unshift(said(s, rep));
  }
  // The bound, read on the result: a correction may move the count by its own words and no more.
  if (Math.abs(wordsOf(out).length - wordsOf(text).length) > allowed) return { text, corrected: 0, changes: [] };
  // And the claims, read on the whole text: every figure as it was, and no name lost. The observer refuses such a
  // correction lint by lint; this holds the sum of them to the same line, so nothing they claimed can move.
  const figures = (t: string): string => [...numbersIn(t)].sort().join('|');
  const kept = new Set(namesIn(out));
  if (figures(out) !== figures(text) || namesIn(text).some((n) => !kept.has(n))) return { text, corrected: 0, changes: [] };
  return { text: out, corrected, changes };
}

/**
 * Em dashes, replaced by the punctuation a writer who never uses them would reach for. A pair inside one
 * sentence encloses an aside, so it becomes a pair of commas; a single dash before a short tail (four
 * words or fewer) becomes a comma, and before a longer one a colon. Where the text on either side of the
 * dash begins or ends with a quotation mark or a colon, or there is no text on the left, the dash becomes
 * a spaced hyphen instead: a comma or colon there read as ': "…" :'. In a table row a cell that is only a
 * dash ("none") becomes a hyphen and a dash inside a cell a spaced hyphen, never a comma, so the row keeps
 * its cells. Code is left alone.
 */
export function replaceEmDashes(text: string): string {
  return mapProse(text, (line) => line.split(/(?<=[.!?]["”’)]?)\s+/).map((sentence) => {
    const parts = sentence.split(/\s*—\s*/);
    if (parts.length === 1) return sentence;
    if (parts.length === 3 && !edged(parts[0], parts[1]) && !edged(parts[1], parts[2])) {
      return `${parts[0]}, ${parts[1]}, ${parts[2]}`.replace(/,\s*([.!?])/g, '$1');
    }
    return parts.reduce((acc, part, i) => {
      if (!acc.trim()) return `- ${part}`;
      if (edged(parts[i - 1], part)) return `${acc} - ${part}`;
      const tail = part.trim().split(/\s+/).length;
      return `${acc}${tail <= 4 ? ', ' : ': '}${part}`;
    });
  }).join(' '), replaceInTableRow);
}

/** Whether the text left of a dash is empty or ends, or the text right of it begins, with a quotation mark or a colon. */
function edged(left: string, right: string): boolean {
  return !left.trim() || /["“”'‘’:]$/.test(left.trim()) || /^["“”'‘’:]/.test(right.trim());
}

/** A table row: a cell that is only a dash becomes `-`, a dash inside a cell ` - `; no `|` is touched. */
function replaceInTableRow(line: string): string {
  return line.split('|').map((cell) => {
    if (/^[—–]$/.test(cell.trim())) return cell.replace(/[—–]/, '-');
    return cell.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/\s*—\s*/g, ' - '))).join('');
  }).join('|');
}

/**
 * Paragraphs longer than `max` sentences, split at sentence boundaries into near-equal parts.
 *
 * READ THROUGH THE RULE'S OWN EYES. This used to find paragraphs by blank lines and sentences by its own pattern,
 * while the rule that flags a long paragraph counts them another way (`paragraphsOf`: a paragraph ends where a list
 * begins, inline code is not prose, a hard-wrapped paragraph is one paragraph). Where the two disagreed the repair
 * saw nothing to split, the rule stayed broken, and under strict delivery an answer was refused for a paragraph of
 * five sentences. The split now uses the rule's paragraphs and the rule's sentences, so what the rule flags is what
 * gets split, and after the split the rule holds.
 *
 * No word changes: a paragraph break is put before a sentence, in place of the space that was there. Inside a
 * block quote each part stays quoted. Lists, headings, tables and code are not paragraphs and are left alone.
 */
export function splitLongParagraphs(text: string, max: number): string {
  // A blank line does not end a paragraph in a page of markup: the page would read as fixed and show as it was.
  if (isMarkup(text)) return text;
  if (!(max >= 1)) return text;
  let out = text;
  // Each pass re-reads the text, since a split moves every later offset; a pass that changes nothing ends it.
  for (let pass = 0; pass < 50; pass++) {
    const long = paragraphSentences(out).find((p) => p.sentences.length > max);
    if (!long) return out;
    const n = long.sentences.length;
    const size = Math.ceil(n / Math.ceil(n / max));
    const quoted = /^[ \t]*>/.test(out.slice(out.lastIndexOf('\n', long.start - 1) + 1, long.start + 1));
    let next = out;
    // From the last break to the first, so earlier offsets stay true.
    for (let k = Math.floor((n - 1) / size) * size; k >= size; k -= size) {
      const at = long.sentences[k].start;
      let from = at;
      while (from > long.start && /\s/.test(next[from - 1])) from -= 1;
      // A quoted paragraph is split into two quotes: the rule ends a paragraph at a blank line, and a ">" alone is not one.
      next = `${next.slice(0, from)}${quoted ? '\n\n> ' : '\n\n'}${next.slice(at)}`;
    }
    if (next === out) return out;
    out = next;
  }
  return out;
}

/**
 * Which mechanical fixes this report calls for, applied. An em dash is replaced only where the standard
 * bans the family outright (the author's typical piece has none); a dash the author uses in most pieces
 * is theirs, and a cap on its rate is left to the rewrite. A paragraph is split only when a REQUIRED
 * paragraph-length rule is broken.
 */
/**
 * The mechanical errors of the GRAMMAR rules named (all of them when `only` is absent), corrected in place on the spans
 * the report holds for this text. The controller's grammar step (./run-repair.ts) and the last fixes both use it. Only
 * under `--fix-grammar` (core/observers/grammar.ts, `grammarFixing`): by default nothing is changed. Each change is
 * recorded by name: "<rule>: N mechanical error(s) corrected: "recieve" → "receive", …".
 */
export function grammarFixes(v: StandardVersion, report: VerifyReport, text: string, only?: ReadonlySet<string>): { text: string; fixed: string[] } {
  if (!grammarFixing()) return { text, fixed: [] };
  const broken = new Set(report.checked.filter((c) => acts(c) && c.result.verdict === 'VIOLATED').map((c) => c.requirementId));
  let out = text; const fixed: string[] = [];
  for (const c of report.checked) {
    if (!broken.has(c.requirementId) || c.observer !== 'GRAMMAR' || (only && !only.has(c.requirementId)) || !v.requirements.some((r) => r.requirementId === c.requirementId)) continue;
    const g = correctMechanicalErrors(out, c.result.spans);
    if (g.corrected) { out = g.text; fixed.push(`${c.requirementId}: ${g.corrected} mechanical error(s) corrected: ${g.changes.join(', ')}`); }
    // One rule's spans index the text as it was: after a correction moves offsets, the next rule waits for a re-check.
    if (g.corrected) break;
  }
  return { text: out, fixed };
}

export function mechanicalFixes(v: StandardVersion, report: VerifyReport, text: string, opts: { readonly grammar?: boolean } = {}): { text: string; fixed: string[] } {
  const broken = new Set(report.checked.filter((c) => acts(c) && c.result.verdict === 'VIOLATED').map((c) => c.requirementId));
  // Mechanical errors first, while the spans the check reported still index this text: the fixes below move offsets.
  // Left out where the controller corrects them as a step of its own (`grammar: false`).
  const g = opts.grammar === false ? { text, fixed: [] } : grammarFixes(v, report, text);
  let out = g.text; const fixed: string[] = [...g.fixed];
  for (const r of v.requirements) {
    if (!broken.has(r.requirementId) || !r.measurement) continue;
    const p = r.measurement.params as { pattern?: readonly string[]; never?: readonly string[]; maxSentences?: number };
    if (r.measurement.observer === 'PATTERN_RATE' && p.pattern?.includes('MACHINE_TELL') && p.never?.includes('EM_DASH') && out.includes('—')) {
      out = replaceEmDashes(out); fixed.push(`${r.requirementId}: em dashes replaced`);
    }
    if (r.measurement.observer === 'PARAGRAPH_LENGTH' && typeof p.maxSentences === 'number') {
      const next = splitLongParagraphs(out, p.maxSentences);
      if (next !== out) { out = next; fixed.push(`${r.requirementId}: long paragraphs split`); }
    }
  }
  return { text: out, fixed };
}

/**
 * THE LINES OF A TABLE, HOWEVER IT IS WRITTEN. A row that starts with `|`, inside a blockquote (`> |`) too; and a GFM
 * table with no leading pipe, known by its delimiter row (`--- | ---`): its header, and every line with a `|` after
 * the delimiter until the block ends. Each keeps its cells as cells.
 */
function tableRows(lines: readonly string[]): Set<number> {
  const out = new Set<number>();
  const body = (l: string): string => l.replace(/^\s*(?:>\s*)*/, '');
  const delimiter = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
  lines.forEach((l, i) => {
    if (body(l).startsWith('|')) out.add(i);
    if (delimiter.test(body(l)) && i > 0 && body(lines[i - 1]).includes('|')) {
      out.add(i - 1); out.add(i);
      for (let j = i + 1; j < lines.length && body(lines[j]).trim() && body(lines[j]).includes('|'); j++) out.add(j);
    }
  });
  return out;
}

/**
 * Apply `f` to each prose line outside code fences, leaving inline code as it is; a table row (a line that
 * starts with `|`) goes to `row` instead, whole, so its cells can be kept.
 */
function mapProse(text: string, f: (line: string) => string, row: (line: string) => string): string {
  let fence = false;
  const lines = text.split('\n');
  const rows = tableRows(lines);
  return lines.map((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    if (rows.has(i)) return /[—–]/.test(line) ? row(line) : line;
    if (!line.includes('—')) return line;
    // Inline code keeps its dashes: split around backticks and treat only the parts outside them.
    return line.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : f(part))).join('');
  }).join('\n');
}
