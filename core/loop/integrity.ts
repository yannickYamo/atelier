// atelier/core/loop/integrity.ts — A REWRITE MAY CHANGE HOW SOMETHING IS SAID, NEVER WHAT IS CLAIMED.
//
// The repair loop takes a sentence that breaks a style rule and rewrites it to satisfy the rule.
// Tightening a sentence to get under a length cap is exactly the operation that drops a qualifier, and
// dropping "may", "roughly" or "most" is how a claim becomes stronger than its source. The loop only
// optimises what it can see; nothing it could see said what the sentence claimed.
//
// So every rewritten span is compared with the span it replaces, deterministically, on what carries a
// claim's meaning and strength:
//
//   numbers      every figure in the original is still there
//   negation     the count of not / no / never / none / nor / without / -n't is unchanged
//   qualifiers   every modal and hedge the original used ("may", "likely", "roughly", "most", "often")
//   names        every proper name, acronym and quoted phrase
//   placeholders every [bracketed placeholder] an earlier pass left for the person to fill
//
// A rewrite that loses one is refused and the original span kept. The exceptions are exact and come
// from the rule being repaired: a banned term may go (that is the repair), a hedge a hedge cap flagged
// may go, and a span flagged as an invented story or figure is expected to lose its specifics.
// Paraphrase that keeps all four is not checked further: this guards the strength of a claim, not its
// wording, and it certifies nothing beyond the four.

import { wordsOf } from '../observers/text.js';

const NEGATION = /\b(?:not|no|never|none|nor|without|nothing|nobody|neither)\b|n['’]t\b/gi;
const QUALIFIERS: readonly string[] = [
  'may', 'might', 'could', 'likely', 'unlikely', 'probably', 'possibly', 'perhaps', 'roughly',
  'approximately', 'nearly', 'almost', 'most', 'many', 'some', 'often', 'usually', 'typically',
  'generally', 'sometimes', 'rarely', 'seldom', 'few', 'estimated', 'suggests', 'appears', 'seems',
  'arguably', 'partly', 'partially', 'largely', 'mostly', 'somewhat', 'up to', 'at least', 'at most',
];
// Not "about", "around" or "can": each is far more often a preposition or a plain ability than a hedge,
// and a check that refuses ordinary rewrites teaches nobody anything.

const numbersIn = (s: string): string[] => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[.,]$/, '').replace(/,/g, ''));
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const hasTerm = (s: string, t: string): boolean => new RegExp(`(?<![A-Za-z])${t.replace(/\s+/g, '\\s+')}(?![A-Za-z])`, 'i').test(s);

/** Proper names, acronyms and quoted phrases: capitalised words not opening a sentence, and "…" spans. */
function namesIn(s: string): string[] {
  const out = new Set<string>();
  const tokens = s.split(/\s+/);
  tokens.forEach((raw, i) => {
    const w = raw.replace(/^[("'“‘*_]+|[)"'”’.,;:!?*_]+$/g, '');
    if (!w) return;
    const opensSentence = i === 0 || /[.!?:]["'”’)]*$/.test(tokens[i - 1]);
    if (/^[A-Z]{2,}[A-Za-z0-9]*$/.test(w)) out.add(w);                          // acronyms: NASA, LEO, ESA
    else if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(w) && !opensSentence) out.add(w); // names mid-sentence
  });
  for (const m of s.matchAll(/["“]([^"”]{3,60})["”]/g)) out.add(m[1]);
  return [...out];
}

export interface Integrity { readonly ok: boolean; readonly lost: readonly string[] }

/**
 * Compare a replacement with the span it replaces. `allowedDrops` are terms the rule being repaired
 * asked to remove; `specificsExpected` is true for an invented story or figure, whose specifics are
 * meant to go.
 */
export function spanIntegrity(original: string, replacement: string, allowedDrops: ReadonlySet<string>, specificsExpected: boolean): Integrity {
  if (specificsExpected) return { ok: true, lost: [] };
  const lost: string[] = [];
  // A term the rule asked to remove licenses whatever it contains: removing "not X, it's Y" removes a
  // negation, and removing a flagged "perhaps" removes a qualifier. That is the repair, not a loss.
  const drops = [...allowedDrops];
  const licensed = (term: string): boolean => drops.some((d) => d === term.toLowerCase() || hasTerm(d, term));
  const after = new Set(numbersIn(replacement));
  for (const n of numbersIn(original)) if (!after.has(n)) lost.push(`the figure ${n}`);
  const negBefore = count(original, NEGATION); const negAfter = count(replacement, NEGATION);
  if (negBefore !== negAfter && !drops.some((d) => count(d, NEGATION) > 0)) lost.push(`negation (${negBefore} → ${negAfter})`);
  for (const q of QUALIFIERS) {
    if (licensed(q)) continue;
    if (hasTerm(original, q) && !hasTerm(replacement, q)) lost.push(`the qualifier "${q}"`);
  }
  for (const m of original.matchAll(/\[[^\]\n]{3,200}\]/g)) {
    if (!replacement.includes(m[0])) lost.push(`the placeholder ${m[0].slice(0, 40)}`);
  }
  const replacementWords = new Set(wordsOf(replacement));
  for (const name of namesIn(original)) {
    if (licensed(name)) continue;
    if (!replacement.includes(name) && !replacementWords.has(name)) lost.push(`the name "${name}"`);
  }
  return { ok: lost.length === 0, lost };
}
