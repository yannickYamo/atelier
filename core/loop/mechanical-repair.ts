// atelier/core/loop/mechanical-repair.ts — THE FIXES THAT NEED NO MODEL.
//
// Two broken rules have a fix that is a matter of punctuation and layout, not wording: an em dash where
// the author never uses one, and a paragraph longer than the author ever writes. A model asked to repair
// either rewrote the sentences around them and was refused for making another rule worse, so the draft
// shipped still broken (a paragraph of eight sentences against a limit of six). These fixes change no
// word. The caller keeps one only if the draft breaks nothing it did not already break.

import type { StandardVersion } from '../state/canonical-state.js';
import type { VerifyReport } from '../observers/verify.js';
import { paragraphSentences } from '../observers/text.js';

/**
 * Em dashes, replaced by the punctuation a writer who never uses them would reach for. A pair inside one
 * sentence encloses an aside, so it becomes a pair of commas; a single dash before a short tail (four
 * words or fewer) becomes a comma, and before a longer one a colon. Code is left alone.
 */
export function replaceEmDashes(text: string): string {
  return mapProse(text, (line) => line.split(/(?<=[.!?]["”’)]?)\s+/).map((sentence) => {
    const parts = sentence.split(/\s*—\s*/);
    if (parts.length === 1) return sentence;
    if (parts.length === 3) return `${parts[0]}, ${parts[1]}, ${parts[2]}`.replace(/,\s*([.!?])/g, '$1');
    return parts.reduce((acc, part) => {
      const tail = part.trim().split(/\s+/).length;
      return `${acc}${tail <= 4 ? ', ' : ': '}${part}`;
    });
  }).join(' '));
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
export function mechanicalFixes(v: StandardVersion, report: VerifyReport, text: string): { text: string; fixed: string[] } {
  const broken = new Set(report.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').map((c) => c.requirementId));
  let out = text; const fixed: string[] = [];
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

/** Apply `f` to each prose line outside code fences, leaving inline code as it is. */
function mapProse(text: string, f: (line: string) => string): string {
  let fence = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence || !line.includes('—')) return line;
    // Inline code keeps its dashes: split around backticks and treat only the parts outside them.
    return line.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : f(part))).join('');
  }).join('\n');
}
