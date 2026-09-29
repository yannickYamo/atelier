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
//   strength     no universal ("any", "every"), certainty verb ("eliminates", "ensures") or intensifier
//                ("dramatically", "significantly") the original did not carry, and no intention ("we
//                expect to") turned into a fact
//   modality     no "can", "would" or "should" dropped ("can reduce" → "reduces"), no "will" or "must"
//                added ("could" → "will")
//   stance       no "I think", "we believe", "in my experience" dropped: the frame is part of the claim
//   additions    no figure and no proper name the original did not carry
//   causation    no causal link ("caused", "drove", "led to") the original did not assert: "correlated
//                with" → "drove" keeps every word that names a thing and changes what is claimed of it
//   uniqueness   no "one of the" turned into "the" plus a superlative
//
// A rewrite that loses one is refused and the original span kept. The exceptions are exact and come
// from the rule being repaired: a banned term may go (that is the repair), a hedge a hedge cap flagged
// may go, a competing word a ratio flagged may be swapped (but "is not" → "is" is still a lost
// negation: only "is not" → "isn't" is a swap), and a span flagged as an invented story or figure is
// expected to lose its specifics.
// Paraphrase that passes all of these is not checked further: this guards the strength of a claim, not
// its wording, and it certifies nothing beyond the list above.

import { wordsOf } from '../observers/text.js';

// "cannot", "can not" and "can't" each count once: "cannot" is its own word; the other two are caught by not / n't.
const NEGATION = /\b(?:not|no|never|none|nor|without|nothing|nobody|neither|cannot)\b|n['’]t\b/gi;
const QUALIFIERS: readonly string[] = [
  'may', 'might', 'could', 'likely', 'unlikely', 'probably', 'possibly', 'perhaps', 'roughly',
  'approximately', 'nearly', 'almost', 'most', 'many', 'some', 'often', 'usually', 'typically',
  'generally', 'sometimes', 'rarely', 'seldom', 'few', 'estimated', 'suggests', 'appears', 'seems',
  'arguably', 'partly', 'partially', 'largely', 'mostly', 'somewhat', 'up to', 'at least', 'at most',
  // An intention is weaker than a fact: "we expect to ship in March" is not "we ship in March".
  'expect', 'expects', 'plan to', 'plans to', 'aim to', 'aims to', 'intend to', 'intends to', 'hope to', 'hopes to',
];
/**
 * WORDS THAT MAKE A CLAIM STRONGER BY APPEARING. A qualifier lost weakens nothing on the page and
 * strengthens the claim; so does a universal or a certainty verb gained. "Reduces the risk" tightened to
 * "eliminates the risk", "lower than on the old link" to "lower than on any link": every figure, name and
 * negation survives, and the claim is not the one the author made. A rewrite may not ADD one of these.
 * Kept short on purpose, for the reason below. Causality is checked separately (CAUSAL, below); a dropped
 * scope clause is a real inflation nothing here catches, and the file claims only what it checks.
 */
const INFLATORS: readonly string[] = [
  'any', 'all', 'every', 'always', 'everyone', 'everything', 'entirely', 'completely', 'fully',
  'eliminate', 'eliminates', 'eliminated', 'guarantee', 'guarantees', 'guaranteed', 'ensure', 'ensures',
  'prove', 'proves', 'proved', 'certainly', 'definitely',
  // Intensifiers: "fell" → "fell dramatically" states a size nobody measured.
  'dramatically', 'massively', 'significantly', 'substantially', 'drastically', 'hugely', 'vastly',
];
/**
 * MODALS, BOTH WAYS. "Can reduce" tightened to "reduces" turns a possibility into a fact, and "could" →
 * "will" does the same by adding. "may", "might" and "could" are qualifiers above; these are the modals
 * too common to be hedges on sight, so only their count is held: a rewrite may not have fewer weak ones
 * or more strong ones. "can't" and "cannot" are negations, counted there, not here.
 */
const WEAK_MODALS: readonly string[] = ['can', 'would', 'should'];
const STRONG_MODALS: readonly string[] = ['will', 'must', 'shall'];
/** A stance frame says whose claim it is and how firmly held; dropping it states the claim as fact. */
const STANCE: readonly string[] = [
  'i think', 'we think', 'i believe', 'we believe', 'i suspect', 'we suspect', 'i feel', 'we feel', 'i guess',
  'in my experience', 'in our experience', 'in my view', 'in our view', 'in my opinion', 'in our opinion',
  'as far as i know', 'as far as we know', 'my sense is', 'our sense is', 'it seems to me', "i'd argue", 'i would argue',
];
/** Words that assert a cause. A rewrite may say "because" as "caused", never add a cause that was not there. */
const CAUSAL = /\b(?:caus(?:e|es|ed|ing)|dr(?:ove|ives|ive|iven|iving)|l(?:ed|eads?) to|result(?:ed|s)? in|because|due to|thanks to)\b/gi;
/** "the most X", "the best", "the largest": a superlative after "the". */
const THE_SUPERLATIVE = /\bthe (?:most|least|best|worst|[a-z]{3,}est)\b/gi;
// Not "about", "around" or "can" as QUALIFIERS: each is far more often a preposition or a plain ability than a hedge
// ("can" after a thing is held as a modal, below),
// and a check that refuses ordinary rewrites teaches nobody anything.

const NUMBER_WORDS: Readonly<Record<string, string>> = { zero: '0', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', twenty: '20', hundred: '100' };
/** Every figure, digits or a spelled-out small number, so "3" → "three" is the same figure. Not "one":
 *  far more often a pronoun ("one of them") than a count. */
export const numbersIn = (s: string): string[] => [
  ...(s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[.,]$/, '').replace(/,/g, '')),
  ...(s.match(/\b[a-z]+\b/gi) ?? []).map((w) => NUMBER_WORDS[w.toLowerCase()]).filter((n): n is string => Boolean(n)),
];
/** How many times each item occurs: "most cases and most teams" carries "most" twice. */
const tally = (xs: readonly string[]): Map<string, number> => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
const termCount = (s: string, t: string): number => (s.match(new RegExp(`(?<![A-Za-z])${t.replace(/\s+/g, '\\s+')}(?![A-Za-z])`, 'gi')) ?? []).length;
/**
 * A modal as a word of its own: "can" in "can reduce", not in "can't" (a negation) or "cannot". After a
 * person ("you can see it", "we should ask") it is ability or advice, not the likelihood of a claim, and
 * a rewrite to "you see it" changes nothing anyone asserted; after a thing ("the cache can reduce load")
 * it is the claim's strength, which is what this holds.
 */
const modalCount = (s: string, m: string): number =>
  (s.match(new RegExp(`(?<!\\b(?:I|you|we|they|he|she|one)\\s+)(?<![A-Za-z])${m}(?![A-Za-z]|['’]t)`, 'gi')) ?? []).length;
/** Capitalised words that are not names wherever they sit. */
const NOT_NAMES = new Set(['Most', 'Every', 'Each', 'All', 'Some', 'Many', 'Few', 'The', 'This', 'That', 'These', 'Those', 'It', 'We', 'You', 'They', 'He', 'She', 'Our', 'Your', 'Their', 'My', 'And', 'But', 'Or', 'If', 'When', 'Why', 'What', 'How', 'Not', 'No']);
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const hasTerm = (s: string, t: string): boolean => new RegExp(`(?<![A-Za-z])${t.replace(/\s+/g, '\\s+')}(?![A-Za-z])`, 'i').test(s);

/** Proper names, acronyms and quoted phrases: capitalised words not opening a sentence, and "…" spans. */
export function namesIn(s: string): string[] {
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

/** Whether a rewrite kept what its span claimed; `lost` names each figure, negation, qualifier, name or slot it dropped. */
export interface Integrity { readonly ok: boolean; readonly lost: readonly string[] }

/**
 * Compare a replacement with the span it replaces. `allowedDrops` are terms the rule being repaired
 * asked to remove; `specificsExpected` is true for an invented story or figure, whose specifics are
 * meant to go.
 */
export function spanIntegrity(fullOriginal: string, replacement: string, allowedDrops: ReadonlySet<string>, specificsExpected: boolean,
  /** words to be swapped for a competing form: they may go, but a negation they carry must survive */
  swaps: ReadonlySet<string> = new Set(),
  /** a heading whose case the rule asks to change: its capitals say nothing about names */
  recase = false,
  /**
   * THE UNSOURCED CLAIMS INSIDE A MERGED SPAN. A span that is only an invented story or figure skips
   * these checks (its specifics are meant to go). A style span merged with one used to skip them too,
   * so a sentence rewritten for length lost its hedge unchecked because a claim sat beside it. Here the
   * claim's text is taken out of what must be KEPT, and everything else is held as usual; what the
   * rewrite ADDS is still compared with the whole original.
   */
  claimParts: readonly string[] = []): Integrity {
  if (specificsExpected) return { ok: true, lost: [] };
  const original = claimParts.reduce((o, c) => (c && o.includes(c) ? o.replace(c, ' ') : o), fullOriginal);
  const lost: string[] = [];
  // A term the rule asked to remove licenses whatever it contains: removing "not X, it's Y" removes a
  // negation, and removing a flagged "perhaps" removes a qualifier. That is the repair, not a loss.
  const drops = [...allowedDrops];
  const after = tally(numbersIn(replacement));
  for (const [n, k] of tally(numbersIn(original))) if ((after.get(n) ?? 0) < k) lost.push(`the figure ${n}`);
  // Negation may fall by exactly what the licensed drops carried ("not X, it's Y" recast), never more,
  // and may never rise: an added "not" flips a claim as surely as a dropped one.
  const negBefore = count(original, NEGATION); const negAfter = count(replacement, NEGATION);
  const negLicensed = drops.reduce((n, d) => n + count(d, NEGATION), 0);
  if (negAfter > count(fullOriginal, NEGATION) || negBefore - negAfter > negLicensed) lost.push(`negation (${negBefore} → ${negAfter})`);
  // A qualifier the rule named for removal may go. One named only to be SWAPPED may change into another
  // qualifier ("may" → "might") but not vanish, so across swapped qualifiers the total must hold.
  const dropped = (t: string): boolean => drops.some((d) => d === t.toLowerCase() || hasTerm(d, t));
  const swapped = (t: string): boolean => [...swaps].some((d) => d === t.toLowerCase() || hasTerm(d, t));
  let swapBefore = 0; let swapAfter = 0;
  for (const q of QUALIFIERS) {
    if (dropped(q)) continue;
    if (swapped(q)) { swapBefore += termCount(original, q); swapAfter += termCount(replacement, q); continue; }
    if (termCount(replacement, q) < termCount(original, q)) lost.push(`the qualifier "${q}"`);
  }
  if (swapAfter < swapBefore) {
    const allAfter = QUALIFIERS.filter((q) => !dropped(q)).reduce((n, q) => n + termCount(replacement, q), 0);
    const allBefore = QUALIFIERS.filter((q) => !dropped(q)).reduce((n, q) => n + termCount(original, q), 0);
    if (allAfter < allBefore) lost.push('a qualifier the rule asked to swap, not remove');
  }
  for (const w of INFLATORS) {
    if (swapped(w)) continue;
    if (termCount(replacement, w) > termCount(fullOriginal, w)) lost.push(`strength: "${w}" claims more than the original did`);
  }
  for (const m of WEAK_MODALS) {
    if (dropped(m) || swapped(m)) continue;
    if (modalCount(replacement, m) < modalCount(original, m)) lost.push(`the modal "${m}": what might happen now reads as what does`);
  }
  // STRENGTHENED, not merely added: a "will" is refused where the original held a softer modal ("could" →
  // "will"), not where it described the present ("it helps" → "it will help" asserts nothing new).
  const softModals = [...WEAK_MODALS, 'may', 'might', 'could'].reduce((n, m) => n + modalCount(fullOriginal, m), 0);
  for (const m of STRONG_MODALS) {
    if (swapped(m) || !softModals) continue;
    if (modalCount(replacement, m) > modalCount(fullOriginal, m)) lost.push(`strength: "${m}" asserts what the original only allowed`);
  }
  for (const f of STANCE) {
    if (dropped(f)) continue;
    if (termCount(replacement, f) < termCount(original, f)) lost.push(`the stance "${f}": a view now reads as a fact`);
  }
  if (count(replacement, CAUSAL) > count(fullOriginal, CAUSAL)) lost.push('causation: the rewrite asserts a cause the original did not');
  if (termCount(replacement, 'one of the') < termCount(original, 'one of the') && count(replacement, THE_SUPERLATIVE) > count(fullOriginal, THE_SUPERLATIVE)) {
    lost.push('uniqueness: "one of the" became "the" and a superlative');
  }
  // ADDED, NOT ONLY LOST. A figure or a name the original never carried is a new claim of fact.
  const before = tally(numbersIn(fullOriginal));
  for (const [n, k] of tally(numbersIn(replacement))) if (k > (before.get(n) ?? 0)) lost.push(`an added figure ${n}`);
  if (!recase) {
    const lowerOriginal = fullOriginal.toLowerCase();
    for (const name of namesIn(replacement)) {
      if (!new RegExp(`(?<![A-Za-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(lowerOriginal)) lost.push(`an added name "${name}"`);
    }
  }
  for (const m of original.matchAll(/\[[^\]\n]{3,200}\](?!\()/g)) {   // a [link](url) is not a placeholder
    if (!replacement.includes(m[0])) lost.push(`the placeholder ${m[0].slice(0, 40)}`);
  }
  const replacementWords = new Set(wordsOf(replacement));
  for (const name of namesIn(original)) {
    if (dropped(name)) continue;
    // For a heading being recased ("Real Cost" → "real cost"), capitals are not names: compared without case.
    const kept = recase ? replacement.toLowerCase().includes(name.toLowerCase()) : replacement.includes(name) || replacementWords.has(name);
    if (!kept) lost.push(`the name "${name}"`);
  }
  return { ok: lost.length === 0, lost };
}
