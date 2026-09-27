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
// may go, a competing word a ratio flagged may be swapped (but "is not" → "is" is still a lost
// negation: only "is not" → "isn't" is a swap), and a span flagged as an invented story or figure is
// expected to lose its specifics.
// Paraphrase that keeps all four is not checked further: this guards the strength of a claim, not its
// wording, and it certifies nothing beyond the four.

import { wordsOf } from '../observers/text.js';

// "cannot", "can not" and "can't" each count once: "cannot" is its own word; the other two are caught by not / n't.
const NEGATION = /\b(?:not|no|never|none|nor|without|nothing|nobody|neither|cannot)\b|n['’]t\b/gi;
const QUALIFIERS: readonly string[] = [
  'may', 'might', 'could', 'likely', 'unlikely', 'probably', 'possibly', 'perhaps', 'roughly',
  'approximately', 'nearly', 'almost', 'most', 'many', 'some', 'often', 'usually', 'typically',
  'generally', 'sometimes', 'rarely', 'seldom', 'few', 'estimated', 'suggests', 'appears', 'seems',
  'arguably', 'partly', 'partially', 'largely', 'mostly', 'somewhat', 'up to', 'at least', 'at most',
];
// Not "about", "around" or "can": each is far more often a preposition or a plain ability than a hedge,
// and a check that refuses ordinary rewrites teaches nobody anything.

const NUMBER_WORDS: Readonly<Record<string, string>> = { zero: '0', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', twenty: '20', hundred: '100' };
/** Every figure, digits or a spelled-out small number, so "3" → "three" is the same figure. Not "one":
 *  far more often a pronoun ("one of them") than a count. */
const numbersIn = (s: string): string[] => [
  ...(s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[.,]$/, '').replace(/,/g, '')),
  ...(s.match(/\b[a-z]+\b/gi) ?? []).map((w) => NUMBER_WORDS[w.toLowerCase()]).filter((n): n is string => Boolean(n)),
];
/** How many times each item occurs: "most cases and most teams" carries "most" twice. */
const tally = (xs: readonly string[]): Map<string, number> => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
const termCount = (s: string, t: string): number => (s.match(new RegExp(`(?<![A-Za-z])${t.replace(/\s+/g, '\\s+')}(?![A-Za-z])`, 'gi')) ?? []).length;
/** Capitalised words that are not names wherever they sit. */
const NOT_NAMES = new Set(['Most', 'Every', 'Each', 'All', 'Some', 'Many', 'Few', 'The', 'This', 'That', 'These', 'Those', 'It', 'We', 'You', 'They', 'He', 'She', 'Our', 'Your', 'Their', 'My', 'And', 'But', 'Or', 'If', 'When', 'Why', 'What', 'How', 'Not', 'No']);
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const hasTerm = (s: string, t: string): boolean => new RegExp(`(?<![A-Za-z])${t.replace(/\s+/g, '\\s+')}(?![A-Za-z])`, 'i').test(s);

/** Proper names, acronyms and quoted phrases: capitalised words not opening a sentence, and "…" spans. */
function namesIn(s: string): string[] {
  const out = new Set<string>();
  // Headings are title-cased by convention, so their capitals say nothing about names.
  const tokens = s.split('\n').filter((l) => !/^\s*#{1,6}\s/.test(l)).join('\n').split(/\s+/);
  tokens.forEach((raw, i) => {
    // A possessive is the name: "NASA's" and "Alice's" are NASA and Alice.
    const w = raw.replace(/^[("'“‘*_[]+|[)"'”’.,;:!?*_\]]+$/g, '').replace(/['’]s$/, '');
    if (!w || NOT_NAMES.has(w)) return;
    // After a full stop, or a markdown marker (a heading, a bullet, a quote), a capital opens a sentence.
    const opensSentence = i === 0 || /[.!?:]["'”’)]*$/.test(tokens[i - 1]) || /^(?:#+|[-*+>]|\d+[.)])$/.test(tokens[i - 1]);
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
export function spanIntegrity(original: string, replacement: string, allowedDrops: ReadonlySet<string>, specificsExpected: boolean,
  /** words to be swapped for a competing form: they may go, but a negation they carry must survive */
  swaps: ReadonlySet<string> = new Set()): Integrity {
  if (specificsExpected) return { ok: true, lost: [] };
  const lost: string[] = [];
  // A term the rule asked to remove licenses whatever it contains: removing "not X, it's Y" removes a
  // negation, and removing a flagged "perhaps" removes a qualifier. That is the repair, not a loss.
  const drops = [...allowedDrops];
  const words = [...drops, ...swaps];
  const licensed = (term: string): boolean => words.some((d) => d === term.toLowerCase() || hasTerm(d, term));
  const after = tally(numbersIn(replacement));
  for (const [n, k] of tally(numbersIn(original))) if ((after.get(n) ?? 0) < k) lost.push(`the figure ${n}`);
  // Negation may fall by exactly what the licensed drops carried ("not X, it's Y" recast), never more,
  // and may never rise: an added "not" flips a claim as surely as a dropped one.
  const negBefore = count(original, NEGATION); const negAfter = count(replacement, NEGATION);
  const negLicensed = drops.reduce((n, d) => n + count(d, NEGATION), 0);
  if (negAfter > negBefore || negBefore - negAfter > negLicensed) lost.push(`negation (${negBefore} → ${negAfter})`);
  for (const q of QUALIFIERS) {
    if (licensed(q)) continue;
    if (termCount(replacement, q) < termCount(original, q)) lost.push(`the qualifier "${q}"`);
  }
  for (const m of original.matchAll(/\[[^\]\n]{3,200}\](?!\()/g)) {   // a [link](url) is not a placeholder
    if (!replacement.includes(m[0])) lost.push(`the placeholder ${m[0].slice(0, 40)}`);
  }
  const replacementWords = new Set(wordsOf(replacement));
  for (const name of namesIn(original)) {
    if (licensed(name)) continue;
    if (!replacement.includes(name) && !replacementWords.has(name)) lost.push(`the name "${name}"`);
  }
  return { ok: lost.length === 0, lost };
}
