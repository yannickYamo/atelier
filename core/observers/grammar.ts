// atelier/core/observers/grammar.ts — MECHANICAL ERRORS, FOUND AND NAMED; THE VOICE LEFT ALONE.
//
// LISTED, NEVER CHANGED, BY DEFAULT. Every finding below, confirmed kind and uncertain alike, is listed for the person
// with its text and the checker's note; no text is changed and no finding blocks. A checker's precision on an author's
// own writing is not something this file can vouch for: "plan a", "Both he and she are", "git add ." and a word quoted
// rather than used each read as a slip and are not one. So a rule with findings is UNVERIFIED ("listed for you to
// check: N possible slips") and reads MET only where the checker finds nothing. The in-place set below is applied only
// when the person asks for it (`--fix-grammar` on run, invoke and verify: `setGrammarFixing`), and then exactly as
// described here, each change recorded.
//
// THE ONE RULE, UNDER --fix-grammar. A text is changed in place only where the error has NO legitimate reading in any major English
// variety or register. Anything with a plausible legitimate reading (a name, a dialect's word, a loanword, a register's
// spelling, a word said twice, an older usage) is LISTED for the person to read, never changed. Correctness goes up;
// the voice is untouched. Concretely, the only changes made in place are:
//
//   - a pronoun–verb agreement from the fixed table below, which holds only pairings no variety uses ("he are",
//     "she are", "I are"): "they was", "we was", "you was", "I has", "he go", "he have" are dialect grammar, listed;
//   - "a" or "an" before a lower-case common English word that does not start with "h", is not read as letters in any
//     case, and that the checker knows ("a essay", "an new bike"); before any other word ("an nda", "a usb stick",
//     "an mri"), listed;
//   - two commas after a word ("it,, and"), and a space before a comma or a full stop ("paw ,", "done ."); every
//     other mark typed twice ("::" in "std::vector", ".." trailing off, ";;", "!!", "??") and a space before "!",
//     "?", ":" or ";" (French spacing: "Bonjour !", "Q : Where") are listed;
//   - a lower-case word on the curated list of well-known misspellings (./grammar-words.ts), each with its one
//     correction ("definately", "recieve").
//
// Everything else is listed, and in particular: a capitalised word, wherever it stands, even at a sentence's start
// ("Wellcome", "Pharoah", "Untill Then", "Teh Hong Piow", and so "Thsi" too); a word repeated ("had had", "that that",
// "Bora Bora", "mahi mahi", "tsk tsk", and so an accidental "the the" too); "a" or "an" before a word in h ("an
// historian", "an hotel"); a contraction with or without its apostrophe ("dont", "its"); and every word the checker
// does not know. The recall this costs is accepted: a slip that is listed is still in front of the person.
//
// The checker that finds them is a grammar engine wired in by the process that runs Atelier (`setGrammarProvider`):
// core names what a lint is and decides what to do with it, and never imports the engine, so a build without one
// still runs and says so.
//
// WHAT COUNTS. The engine proposes far more than it is allowed to act on. A lint is CONFIRMED only when it is of
// a kind this file lists (`MECHANICAL_RULES`), survives every guard below and the one rule above; everything else the
// engine proposes is UNCERTAIN: listed for the person to read, never repaired, never a rule broken. The guards:
//
//   protected regions   code (fenced and inline), quotations and block quotes, URLs, email addresses, paths,
//                       file names and `path:line` citations, figures and currency, front matter, link targets,
//                       @mentions, #hashtags, $cashtags, emoji and ALL-CAPS tokens: never flagged.
//   the author's words  a capitalised word (a name, a product), a word with a digit, a word the standard's own
//                       terms or the request and material carry, a word the author's own pieces use (the rule's
//                       `vocabulary`, read at build), a word the text itself uses three times or more.
//   the author's variant  spelling is checked in the dialect the standard records; where none is recorded, only a
//                       word misspelt in BOTH British and American English counts.
//   intentional choices a fragment, an "And" or "But" opener, a one-word sentence, a lower-case styling, a word
//                       repeated, two spaces after a full stop, "!!", "..", "::", French spacing: none of these is
//                       changed.
//   known misspellings  a spelling is changed only where the word is on the curated list of well-known misspellings,
//                       found by this file's own pass over the text: whole words, outside the protected regions,
//                       written in lower case. No guess at the word meant is ever made. Every other word the checker
//                       does not know (a slip, a coinage, slang, a word of one dialect, a closed compound it would
//                       split, a plural it would make a possessive) is listed, never changed, and no spelling is ever
//                       converted between British and American English.
//   the author's grammar  a pronoun agreement the author's own pieces use ("it don't") is their voice: not changed,
//                       not listed. Without that evidence only the table's cases are corrected ("he are", "I are");
//                       a dialect's agreement ("they was", "we was", "I has", "he go", "it don't"), "there is" with a
//                       plural, and an error with no single correction ("I is") are listed.
//   claims              a correction that would change a figure or a capitalised name is refused: it is listed
//                       as uncertain with the reason, and nothing is changed.
//
// The engine's coverage is what it is, and this file claims no more: the agreement lints are the pronoun-based
// ones ("they was", "he go"), not every subject the English language offers. docs/MEASURED-RULES.md says so.

import type { Measurement } from '../state/canonical-state.js';
import type { Observer, Span, CheckContext } from './registry.js';
import { findPattern } from './style.js';
import { numbersIn } from '../loop/integrity.js';
import { MISSPELLINGS, COMMON_WORDS } from './grammar-words.js';

export type GrammarDialect = 'american' | 'british';

/** One finding of the engine, in the offsets of the text it was given (UTF-16 code units, as JavaScript counts). */
export interface GrammarLint {
  /** the engine's rule name ("SpellCheck", "RepeatedWords"): what the allowed list keys on */
  readonly rule: string;
  /** the engine's category ("Spelling", "Agreement", "Typo") */
  readonly kind: string;
  readonly message: string;
  readonly start: number;
  readonly end: number;
  /** the engine's first suggested replacement; "" to remove the span; null when it offers none */
  readonly replacement: string | null;
}

export interface GrammarEngine { lint(text: string, dialect: GrammarDialect): readonly GrammarLint[] }
/** What the process wires in: a loader for the engine, called once, lazily, when a standard carries the rule. */
export interface GrammarProvider { load(): Promise<GrammarEngine> }

/** The rule as every build states it. */
export const GRAMMAR_STATEMENT = 'No mechanical errors: spelling, agreement, punctuation.';
/** How a check that could not run opens its detail: the record reads it as unverified, never as not applicable. */
export const GRAMMAR_NOT_RUN = 'the grammar check could not run';
/** The suffix of the report line that lists what the engine was unsure of, beside the rule's own line. */
export const GRAMMAR_NOTE_SUFFIX = '·check';
/** Is this check line the grammar rule's list of uncertain constructions: listed, never repaired, never a regression. */
export const isGrammarNote = (c: { readonly requirementId: string; readonly observer?: string }): boolean =>
  c.observer === 'GRAMMAR' && c.requirementId.endsWith(GRAMMAR_NOTE_SUFFIX);

// ── THE ALLOWED KINDS, AS A LIST ────────────────────────────────────────────────────────────────
//
// Rule names of the engine (harper.js 2.10) this file reads, each with the label the report uses. Nothing outside this
// list is ever corrected, and of these exactly these are corrected in place: a spelling on the known list, an agreement
// in the table ("he are", "she are", "I are"), a/an before a lower-case common word the checker knows (not in "h", not
// read as letters), two commas after a word, and a space before a comma or a full stop. Everything else read here is
// listed (`LISTED_RULES`, and the guards in `readGrammar`), under the one rule at the head of this file. Added to only
// with a reason, here.
export const MECHANICAL_RULES: Readonly<Record<string, string>> = {
  SpellCheck: 'spelling',
  PronounVerbAgreement: 'subject–verb agreement',
  PronounInflectionBe: 'subject–verb agreement',
  ThereIsAgreement: 'subject–verb agreement',
  IAmAgreement: 'subject–verb agreement',
  RepeatedWords: 'a word repeated by accident',
  AnA: 'the article a/an',
  ItsContraction: 'a missing apostrophe',
  CommaFixes: 'a space before a comma',
  // The two below are read here, not by the engine (`punctuationLints`): it has no rule for either.
  DoublePunctuation: 'double punctuation',
  SpaceBeforePunctuation: 'a space before punctuation',
  RepeatedMark: 'a mark typed more than once',
  SpaceBeforeMark: 'a space before a mark',
};
/**
 * Kinds read and always listed, each with why: every one has a legitimate reading somewhere. A word said twice is
 * "had had", "that that", "Bora Bora" or "tsk tsk" as often as a slip; "its" is a possessive as often as a missing
 * apostrophe; "there's" with a plural is ordinary speech.
 */
const LISTED_RULES: Readonly<Record<string, string>> = {
  RepeatedWords: 'a word repeated: "had had", "that that" and "Bora Bora" are English, so it is listed, never collapsed',
  ItsContraction: '"its" may be the possessive the author meant',
  ThereIsAgreement: '"there is" before a plural is ordinary in speech and in several varieties',
  RepeatedMark: '"::" is code ("std::vector"), ".." trails off, "!!" and "??" are emphasis: listed, never collapsed',
  SpaceBeforeMark: 'a space before "!", "?", ":" or ";" is French and typographic spacing ("Bonjour !"): listed, never closed',
};
/** Engine categories allowed whole: a Typo is a fixed table of common slips ("teh"), held to the spelling guards. */
const MECHANICAL_KINDS: ReadonlySet<string> = new Set(['Typo']);
/** Spelling-like lints: the word guards below apply to them, and only to them. */
const SPELLING = (l: GrammarLint): boolean => l.rule === 'SpellCheck' || l.kind === 'Typo';
/** Capitalised words that are not names wherever they sit (the meaning guard's own list, kept in step). */
const NOT_NAMES: ReadonlySet<string> = new Set(['most', 'every', 'each', 'all', 'some', 'many', 'few', 'the', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'you', 'they', 'he', 'she', 'our', 'your', 'their', 'my', 'and', 'but', 'or', 'if', 'when', 'why', 'what', 'how', 'not', 'no', 'a', 'an', 'i']);

// ── THE ENGINE, WIRED IN ONCE ────────────────────────────────────────────────────────────────────

let provider: GrammarProvider | null = null;
let engine: GrammarEngine | null = null;
let failure: string | null = null;
let loading: Promise<void> | null = null;
/** `ATELIER_GRAMMAR=off`: the owner's switch. The check is then not run, and reads as not checked with that reason. */
const turnedOff = (): boolean => process.env.ATELIER_GRAMMAR === 'off';
/** Why a switched-off check did not run: like a load failure, it reads as unverified, never as passed or not applicable. */
export const GRAMMAR_OFF = 'switched off for this process (ATELIER_GRAMMAR=off)';

/**
 * Whether the in-place set is applied (`--fix-grammar`): off by default, when every finding is only listed. Set once by
 * the process for run, invoke and verify (cli/atelier.mts); a test sets it and puts it back.
 */
let fixing = false;
export function setGrammarFixing(on: boolean): void { fixing = on; }
export const grammarFixing = (): boolean => fixing;
/** How a rule with findings opens its detail by default: the findings are the person's to read, and the rule is unverified. */
export const GRAMMAR_LISTED = 'listed for you to check';
/** A grammar line that ran and listed its findings: the spans are the list, none carries a correction. */
export const grammarListed = (c: { readonly result: { readonly verdict: string; readonly detail: string } }): boolean =>
  c.result.verdict === 'NOT_APPLICABLE' && c.result.detail.startsWith(GRAMMAR_LISTED);

/** Wire the engine's loader in. Called once by the process (cli/atelier.mts); a test may wire a scripted one. */
export function setGrammarProvider(p: GrammarProvider | null): void { provider = p; engine = null; failure = null; loading = null; }
/** Forget the loaded engine and any failure: the next `ensureGrammar` loads again. For tests. */
export function resetGrammar(): void { engine = null; failure = null; loading = null; }

/**
 * Load the engine if a standard needs it and it is not loaded. Never throws: a loader that fails leaves its reason,
 * and every check from then on says the check could not run, with that reason. Given a standard, loads only when one
 * of its live rules is measured by GRAMMAR; given none, loads (a build is about to state the rule).
 */
export async function ensureGrammar(v?: { readonly requirements: readonly { readonly measurement?: Measurement; readonly authority: string }[] }): Promise<void> {
  if (v && !v.requirements.some((r) => r.authority !== 'EXPERT_REJECTED' && r.measurement?.observer === 'GRAMMAR')) return;
  if (engine || failure || turnedOff()) return;
  if (!provider) { failure = 'could not load: no grammar checker is wired into this process'; return; }
  loading ??= provider.load().then((e) => { engine = e; }, (e: unknown) => { failure = `could not load: ${(e instanceof Error ? e.message : String(e)).split('\n')[0] || 'the grammar checker failed'}`; });
  await loading;
}

/** Whether a check can run now, and if not, why. */
export const grammarStatus = (): { readonly ready: true } | { readonly ready: false; readonly reason: string } =>
  (turnedOff() ? { ready: false, reason: GRAMMAR_OFF } : engine ? { ready: true } : { ready: false, reason: failure ?? 'the grammar checker could not load before the check ran' });

// ── WHAT IS NEVER FLAGGED ───────────────────────────────────────────────────────────────────────

interface Range { readonly start: number; readonly end: number }

/** The stretches of a text no lint may touch: code, quotation, address, citation, figure, front matter. */
export function protectedRanges(text: string): Range[] {
  const out: Range[] = [];
  const add = (re: RegExp): void => { for (const m of text.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length }); };
  add(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/g);            // front matter
  add(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:\n[ \t]*\1[ \t]*(?:\n|$)|$)/gm);    // fenced code
  add(/`[^`\n]+`/g);                                                        // inline code
  add(/^[ \t]*>.*$/gm);                                                     // block quotes
  add(/"[^"\n]{1,600}"|“[^”\n]{1,600}”|‘[^’\n]{1,600}’|«[^»\n]{1,600}»|»[^«\n]{1,600}«|‹[^›\n]{1,600}›|„[^“”\n]{1,600}[“”]|‚[^‘’\n]{1,600}[‘’]/g); // quotations
  add(/\bhttps?:\/\/\S+|\bwww\.\S+/gi);                                    // URLs
  add(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g);                                    // email addresses
  add(/(?<![\w@])@\w+(?:[.-]\w+)*/g);                                      // @mentions
  add(/(?<![\w&#])#[\p{L}\p{N}_]+/gu);                                       // #hashtags
  add(/(?<!\w)\$[A-Za-z][A-Za-z.]{0,9}\b/g);                                 // $cashtags
  add(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\u{FE0F}|\u{200D}|\p{Emoji_Modifier}|\p{Extended_Pictographic})*/gu); // emoji
  add(/(?<![\w.-])[\w-]+\.(?:md|mdx|txt|ts|tsx|js|jsx|mjs|cjs|mts|json|ya?ml|toml|py|rb|go|rs|java|kt|c|h|cpp|cs|sh|css|scss|html?|xml|csv|tsv|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|webp|mp[34]|mov|zip|tar|gz|log|ini|env|lock|sql)\b/gi); // file names
  add(/(?<![\p{L}\p{N}'’])\p{Lu}[\p{Lu}\p{N}_&'’-]*\p{Lu}(?![\p{L}\p{N}])/gu);  // ALL-CAPS tokens
  add(/\]\([^)\n]*\)/g);                                                   // link targets
  add(/(?<![\w/])[\w.-]+(?:\/[\w.-]+)+(?::\d+(?:-\d+)?)?/g);               // paths, and path:line citations
  add(/\b[\w-]+\.[a-z]{1,6}:\d+(?:-\d+)?\b/gi);                           // file:line
  add(/\[\^?\d+\]|\([A-Z][\w'.-]+(?: (?:et al\.|and) [A-Z][\w'.-]+)?,? \d{4}[a-z]?\)/g); // [12], (Smith 2020)
  add(/[$£€¥]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion))?|\d[\d,.]*\s?(?:%|percent|per cent)|\b\d[\d,.:]*\b/gi); // figures, currency
  return out.sort((a, b) => a.start - b.start);
}
const inside = (ranges: readonly Range[], l: Range): boolean => ranges.some((r) => l.start < r.end && l.end > r.start);

const lowerWords = (s: string): string[] => (s.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []).map((w) => w.replace(/[’]/g, '\''));

/** Edit distance, for "is this suggestion the same word spelt right": a slip is one or two keystrokes away. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** The capitalised words of a span that read as names: not opening a sentence is not known here, so the article and pronoun list is the only exemption. */
const namesOf = (s: string): string[] => (s.match(/\b[A-Z][\w'’-]*/g) ?? []).map((w) => w.replace(/['’]s$/, '')).filter((w) => w.length > 1 && !NOT_NAMES.has(w.toLowerCase()));
const bare = (w: string): string => w.toLowerCase().replace(/['’]/g, '');

// ── THE ONE SOURCE OF A SPELLING FIX: THE LIST OF KNOWN MISSPELLINGS ─────────────────────────────

/** The one correction of a well-known misspelling (./grammar-words.ts), in lower case; null for any other word. */
export function knownMisspelling(word: string): string | null {
  const w = word.toLowerCase().replace(/’/g, '\'');
  return Object.hasOwn(MISSPELLINGS, w) ? MISSPELLINGS[w] : null;
}

/**
 * The known misspellings of a text, found by this file's own pass: whole words outside the protected regions. Each is
 * corrected where it is written in lower case, unless it is the author's word (their vocabulary, the request or
 * material, or used three times or more); a capitalised one, wherever it stands, may be a name: those are listed.
 * What the engine says about the word does not matter.
 */
function misspellingsIn(text: string, protectedIn: readonly Range[], known: ReadonlySet<string>, counts: ReadonlyMap<string, number>): { confirmed: Span[]; uncertain: Span[] } {
  const confirmed: Span[] = []; const uncertain: Span[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_'’-])[\p{L}]+(?![\p{L}\p{N}_'’-])/gu)) {
    const word = m[0]; const right = knownMisspelling(word);
    const at = { start: m.index, end: m.index + word.length };
    if (right === null || inside(protectedIn, at)) continue;
    const lower = word.toLowerCase();
    const span = (why: string, replacement?: string): Span => ({ ...at, text: word, why, ...(replacement !== undefined ? { replacement } : {}) });
    if (known.has(lower)) { uncertain.push(span('a word of the author\'s own, or one the request or material carries (a known misspelling)')); continue; }
    if ((counts.get(lower) ?? 0) >= 3) { uncertain.push(span('used three times or more: a spelling the author chooses (a known misspelling)')); continue; }
    // A capital anywhere, a sentence's start included, may be a name ("Wellcome", "Untill Then", "Teh Hong Piow").
    if (word !== lower) { uncertain.push(span(`a capitalised word may be a name (a known misspelling of "${right}")`)); continue; }
    confirmed.push(span(`spelling: "${word}" → "${right}"`, right));
  }
  return { confirmed, uncertain };
}

// ── PRONOUN AGREEMENT: THE CLEAR CASES, AND THE AUTHOR'S OWN ────────────────────────────────────

const PRONOUNS = ['i', 'you', 'we', 'they', 'he', 'she', 'it'] as const;
/** For each verb form, the pronouns standard English pairs it with. A pairing outside these is non-standard. */
const AGREES: Readonly<Record<string, readonly string[]>> = {
  am: ['i'], is: ['he', 'she', 'it'], are: ['you', 'we', 'they'], was: ['i', 'he', 'she', 'it'], were: ['you', 'we', 'they'],
  has: ['he', 'she', 'it'], have: ['i', 'you', 'we', 'they'], does: ['he', 'she', 'it'], "doesn't": ['he', 'she', 'it'],
  do: ['i', 'you', 'we', 'they'], "don't": ['i', 'you', 'we', 'they'], goes: ['he', 'she', 'it'], go: ['i', 'you', 'we', 'they'],
  "isn't": ['he', 'she', 'it'], "aren't": ['you', 'we', 'they'], "wasn't": ['i', 'he', 'she', 'it'], "weren't": ['you', 'we', 'they'],
  "hasn't": ['he', 'she', 'it'], "haven't": ['i', 'you', 'we', 'they'],
};
/**
 * The agreements corrected without asking: a pairing no variety or register of English uses. Each row of the table it
 * once held was read against the varieties, and only three are kept; when in doubt a row is listed. Listed, never
 * changed, and why:
 *   "they was", "we was", "you was"   the levelled past of "be": most British dialects, Appalachian, African American
 *                                     and Caribbean English, and the eighteenth century's standard "you was".
 *   "they is", "we is", "you is"      the levelled present of "be": Appalachian, Newfoundland, African American English.
 *   "I has"                           the Northern Subject Rule and the narrative "I says, I has" of Northern English.
 *   "he go", "she go", "he have",     a third person without "-s": East Anglian and African American English, and a
 *   "she have"                        subjunctive or bare infinitive ("I suggest that he go", "we watched she go").
 *   "it are", "it go", "it have"      "it" is as often an object before the next clause's verb ("the people who run it
 *                                     are tired", "make it go", "the crew who built it have left") as a subject.
 * Kept: "he are", "she are", "I are": no variety pairs these, and neither pronoun is an object form.
 * "it don't", "he don't", "I is", "it were" are not here either: vernacular, a subjunctive, or an error with no one
 * correction, they are listed.
 */
const CLEAR_AGREEMENT: Readonly<Record<string, string>> = { 'he are': 'is', 'she are': 'is', 'i are': 'am' };
const AGREEMENT_RULES: ReadonlySet<string> = new Set(['PronounVerbAgreement', 'PronounInflectionBe', 'IAmAgreement', 'ThereIsAgreement']);
const norm = (s: string): string => s.toLowerCase().replace(/’/g, '\'').replace(/\s+/g, ' ').trim();

/** Every non-standard pronoun–verb pairing the author's pieces use ("it don't"), lower-case: their grammar, never corrected. */
export function authorConstructions(texts: readonly string[]): string[] {
  const out = new Set<string>();
  const re = new RegExp(`\\b(${PRONOUNS.join('|')})\\s+(${Object.keys(AGREES).map((v) => v.replace(/'/g, "['’]")).join('|')})(?![\\p{L}'’])`, 'giu');
  for (const t of texts) {
    const prose = t.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:\n[ \t]*\1[ \t]*(?:\n|$)|$)/gm, '').replace(/`[^`\n]+`/g, '');
    for (const m of prose.matchAll(re)) {
      const p = m[1].toLowerCase(); const v = norm(m[2]);
      // ("if it were" is a subjunctive, not a habit of grammar: never recorded, and never corrected either.)
      if (!(AGREES[v] ?? []).includes(p) && v !== 'were') out.add(`${p} ${v}`);
    }
  }
  return [...out].sort();
}

// ── THE READING ─────────────────────────────────────────────────────────────────────────────────

export interface GrammarReading {
  /** errors no author intends, each with the engine's correction where it offers one */
  readonly confirmed: readonly Span[];
  /** what the engine proposed and this file does not act on, each with why it is only listed */
  readonly uncertain: readonly Span[];
}

const list = (p: Measurement['params'], k: string): readonly string[] => { const v = p[k]; return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : []; };
const dialectOf = (p: Measurement['params']): GrammarDialect | null => { const d = list(p, 'dialect')[0]; return d === 'american' || d === 'british' ? d : null; };

/**
 * The punctuation slips the engine has no rule for, read here. Changed in place, because no register or variety writes
 * them: two or more commas after a word and before a space ("it,, and"), and a space before a full stop that ends a
 * word's sentence ("done ."; not a spaced ellipsis ". . ."). Listed, never changed, because each has a reading: a
 * colon typed twice ("std::vector", "Vec::new", "Foo::Bar"), a full stop typed twice where no ellipsis is meant
 * ("hmm.. not sure": a casual trailing-off), a semicolon twice, "!!" and "??" (emphasis), commas run into the next
 * word ("a,,b": an empty field), and a space before "!", "?", ":" or ";" (French and typographic spacing: "Bonjour !",
 * "Elle a dit : non"). A mark after a space that opens a smiley, a path or a figure is not read at all. The comma's
 * own space is the engine's case (CommaFixes).
 */
export function punctuationLints(text: string): GrammarLint[] {
  const out: GrammarLint[] = [];
  const push = (rule: string, message: string, start: number, end: number, replacement: string): void => { out.push({ rule, kind: 'Punctuation', message, start, end, replacement }); };
  for (const m of text.matchAll(/(?<=\p{L})([,;:!?])\1+/gu)) {
    const inPlace = m[1] === ',' && /^(?:\s|$)/.test(text.slice(m.index + m[0].length));
    push(inPlace ? 'DoublePunctuation' : 'RepeatedMark', `"${m[1]}" typed more than once`, m.index, m.index + m[0].length, m[1]);
  }
  for (const m of text.matchAll(/(?<=\p{L})\.\.(?!\.)/gu)) push('RepeatedMark', 'a full stop typed twice', m.index, m.index + 2, '.');
  for (const m of text.matchAll(/(?<=\p{L})[ \t]+\.(?=\s|$)(?![ \t]*\.)/gu)) push('SpaceBeforePunctuation', 'a space before "."', m.index, m.index + m[0].length, '.');
  for (const m of text.matchAll(/(?<=\p{L})[ \t]+([;:?!])(?=\s|$)/gu)) push('SpaceBeforeMark', `a space before "${m[1]}"`, m.index, m.index + m[0].length, m[1]);
  return out;
}

/** Lints in the recorded dialect; with none recorded, spelling counts only where both dialects flag the same span. */
function lintsFor(e: GrammarEngine, text: string, dialect: GrammarDialect | null): GrammarLint[] {
  return lintsAndUnknown(e, text, dialect).lints;
}
/** The lints, and every stretch the checker calls an unknown word in any dialect it read (for a/an: never certain). */
function lintsAndUnknown(e: GrammarEngine, text: string, dialect: GrammarDialect | null): { lints: GrammarLint[]; unknown: Range[] } {
  if (dialect) { const all = e.lint(text, dialect); return { lints: [...all, ...punctuationLints(text)], unknown: all.filter(SPELLING) }; }
  const us = e.lint(text, 'american'); const uk = e.lint(text, 'british');
  const key = (l: GrammarLint): string => `${l.rule}@${l.start}-${l.end}`;
  const ukKeys = new Set(uk.map(key));
  return { lints: [...us.filter((l) => !SPELLING(l) || ukKeys.has(key(l))), ...punctuationLints(text)], unknown: [...us, ...uk].filter(SPELLING) };
}

/**
 * Common words also written as initials, where the letters read aloud take the other article: "an LED", "an SAT",
 * "an SEC filing", "an SOS", "a US firm", "a SAFE note", "an FAT disk". Written in lower case, the article may be the author's
 * reading of the letters: listed, never changed.
 */
const READ_AS_LETTERS: ReadonlySet<string> = new Set(['us', 'un', 'eu', 'led', 'sat', 'sec', 'fat', 'rest', 'safe', 'nice', 'mar', 'ram', 'sos']);
/** A short word with the shape of a spoken word: an English onset, then vowels with at most two consonants between ("bike", "egg", "ox"; not "mph", "std", "mla"). */
const SPOKEN_SHAPE = /^(?:[bcdfgjklmnpqrstvwxz]|bl|br|ch|cl|cr|dr|dw|fl|fr|gl|gr|kn|ph|pl|pr|qu|sc|sh|sk|sl|sm|sn|sp|st|sw|th|tr|tw|wh|wr)?(?:[aeiouy]+[bcdfghjklmnpqrstvwxz]{0,2})+$/;
/**
 * Whether "a" or "an" before this word is changed in place: a lower-case word, not in "h", not one read as letters in
 * any case, and one the checker knows; and either one of the most common English words or, outside "u" (whose sound
 * the checker guesses: "a urn" is its guess), a word of five letters or more, or a shorter one with a spoken word's
 * shape. Anything else ("an nda", "a usb stick", "an mri", "an sms", "an mph", "a Euler") is listed: the article may
 * follow how the author reads it aloud.
 */
const articleIsCertainBefore = (next: string, unknownWord: boolean): boolean =>
  /^\p{Ll}+$/u.test(next) && !/^(?:h|an?$)/.test(next) && !READ_AS_LETTERS.has(next) && !unknownWord
  && (COMMON_WORDS.has(next) || (!next.startsWith('u') && (next.length >= 5 || SPOKEN_SHAPE.test(next))));

/** 1 for a lint of an allowed kind: on the same stretch, it is read before the engine's other notes, so it is the one kept. */
const allowed = (l: GrammarLint): number => (l.rule in MECHANICAL_RULES || MECHANICAL_KINDS.has(l.kind) ? 1 : 0);

// The same text is read by the rule's line and by the list of what to check: read once.
const READINGS = new Map<string, GrammarReading>();
const READING_CACHE = 16;

/** Every lint of the text sorted into confirmed and uncertain, under the guards at the head of this file. */
export function readGrammar(text: string, params: Measurement['params'], context?: CheckContext): GrammarReading {
  if (!engine) return { confirmed: [], uncertain: [] };
  const vocabulary = list(params, 'vocabulary');
  const constructions = new Set(list(params, 'constructions').map(norm));
  const cacheKey = `${dialectOf(params) ?? '?'}|${vocabulary.join(',')}|${[...constructions].join(',')}|${context?.request ?? ''}|${(context?.material ?? []).map((m) => m.name).join(',')}|${text}`;
  const had = READINGS.get(cacheKey);
  if (had) return had;
  const protectedIn = protectedRanges(text);
  const known = new Set<string>([...vocabulary.flatMap(lowerWords), ...lowerWords(context?.request ?? ''), ...(context?.material ?? []).flatMap((m) => lowerWords(m.text))]);
  const counts = new Map<string, number>();
  for (const w of lowerWords(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  // The known misspellings first, by this file's own pass: the engine's lints on the same words are not read.
  const own = misspellingsIn(text, protectedIn, known, counts);
  const confirmed: Span[] = [...own.confirmed]; const uncertain: Span[] = [...own.uncertain];
  const listWords: readonly Range[] = [...own.confirmed, ...own.uncertain];
  const seen = new Set<string>();
  const { lints, unknown } = lintsAndUnknown(engine, text, dialectOf(params));
  for (const l of lints.sort((a, b) => a.start - b.start || a.end - b.end || allowed(b) - allowed(a))) {
    if (l.end <= l.start || l.end > text.length) continue;
    const at = `${l.start}-${l.end}`;
    if (seen.has(at)) continue;
    seen.add(at);
    if (inside(protectedIn, l)) continue;                                   // (a) never flagged
    if (inside(listWords, l)) continue;                                     // a known misspelling: read by the pass above
    const problem = text.slice(l.start, l.end);
    const label = MECHANICAL_RULES[l.rule] ?? (MECHANICAL_KINDS.has(l.kind) ? 'a common typo' : null);
    const span = (why: string, replacement?: string): Span => ({ start: l.start, end: l.end, text: problem, why, ...(replacement !== undefined ? { replacement } : {}) });
    const note = (why: string): void => { uncertain.push(span(`${why} (${l.rule}: ${l.message.replace(/\s+/g, ' ').trim()})`)); };
    if (label === null) { note('the checker proposes a change this rule does not make'); continue; }   // (c) not in the list
    if (Object.hasOwn(LISTED_RULES, l.rule)) { note(LISTED_RULES[l.rule]); continue; }   // a legitimate reading exists
    let fix = l.replacement;
    if (SPELLING(l)) {
      const word = problem.trim();
      if (/^[A-Z]/.test(word) || /[A-Z]/.test(word.slice(1)) || /\d/.test(word)) { note('a name, an acronym or a coined word is the author\'s'); continue; }
      if (known.has(bare(word).replace(/[’]/g, '\''))) { note('a word of the author\'s own, or one the request or material carries'); continue; }
      if ((counts.get(word.toLowerCase()) ?? 0) >= 3) { note('used three times or more: a spelling the author chooses'); continue; }
      // Not a known misspelling (those are read above): a slip, a coinage, slang, a word of one dialect, a split or
      // an apostrophe the checker proposes. A guess at the word meant is never certain: listed, never changed.
      note(`a word the checker does not know${fix && !/\s/.test(fix) && distance(bare(word), bare(fix)) <= 2 ? ` (it suggests "${fix}")` : ''}`); continue;
    }
    if (AGREEMENT_RULES.has(l.rule)) {
      // The word before the verb is the subject the rule read: "they" in "they was".
      const before = /([\p{L}'’]+)\s+$/u.exec(text.slice(Math.max(0, l.start - 40), l.start))?.[1] ?? '';
      // The engine's span is the verb ("are") or the pair ("I are"), the pair's fix the pair ("I am").
      const pair = /^\s*[\p{L}'’]+\s+[\p{L}'’]+\s*$/u.test(problem);
      const phrase = pair ? norm(problem) : norm(`${before} ${problem}`);
      if (constructions.has(phrase)) continue;                              // the author's own grammar: not even listed
      if (l.rule !== 'ThereIsAgreement') {
        const clear = CLEAR_AGREEMENT[phrase];
        if (clear === undefined || fix === null || norm(fix) !== (pair ? `${phrase.split(' ')[0]} ${clear}` : clear)) { note('an agreement a variety of English uses (dialect is voice), or one with no single correction'); continue; }
      }
    }
    if (fix === null) { note('no correction the checker is sure of'); continue; }
    if (l.rule === 'AnA') {
      // "an historian", "an hotel": an older and still current usage. "a FAQ", "an MRI": read as letters or as a word.
      const m = /^([\s*_"'“‘(]*)([\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*)/u.exec(text.slice(l.end));
      const next = m?.[2] ?? '';
      const nextAt = { start: l.end + (m?.[1].length ?? 0), end: l.end + (m?.[1].length ?? 0) + next.length };
      if (!/^(?:a|an)$/i.test(problem) || !/^(?:a|an)$/i.test(fix)) { note('not one article for the other'); continue; }
      if (/^h/i.test(next)) { note('"a" or "an" before a word in h: "an historian" is a usage of its own'); continue; }
      if (!articleIsCertainBefore(next, inside(unknown, nextAt))) { note('"a" or "an" before an acronym, a name, a figure or a word the checker does not know: it depends on how it is read aloud'); continue; }
      // The case of the article as written: "A essay" becomes "An essay", never "AN essay".
      fix = /^\p{Lu}/u.test(problem) ? fix[0].toUpperCase() + fix.slice(1).toLowerCase() : fix.toLowerCase();
    }
    // A comma's fix is only the space before it: a full-width comma or a missing space after one is the author's.
    if (l.rule === 'CommaFixes' && !(/^[ \t]+$/.test(problem) && fix === '')) { note('a comma written as the author chose'); continue; }
    // A correction may not change a figure or a name: that is a claim, not a mechanical slip.
    if (fix !== null && fix !== '') {
      if (numbersIn(problem).join('|') !== numbersIn(fix).join('|')) { note('the correction would change a figure'); continue; }
      const kept = new Set(namesOf(fix).map(bare));
      if (namesOf(problem).some((n) => !kept.has(bare(n)))) { note('the correction would change a name'); continue; }
      if (fix.includes('\n')) { note('the correction spans a line break'); continue; }
    }
    confirmed.push(span(fix === null ? `${label}: ${l.message.replace(/\s+/g, ' ').trim()}` : `${label}: "${problem.trim()}" → "${fix.trim() || '(removed)'}"`, fix ?? undefined));
  }
  // A finding the rule acts on is not also listed to check: the engine's own note on the same stretch goes.
  const byPlace = (a: Span, b: Span): number => a.start - b.start || a.end - b.end;
  const reading: GrammarReading = { confirmed: confirmed.sort(byPlace), uncertain: uncertain.filter((u) => !inside(confirmed, u)).sort(byPlace) };
  if (READINGS.size >= READING_CACHE) { const oldest = READINGS.keys().next(); if (!oldest.done) READINGS.delete(oldest.value); }
  READINGS.set(cacheKey, reading);
  return reading;
}

/** Kinds of error found, for a detail line: "spelling ×2, a/an". */
const kindsOf = (spans: readonly Span[]): string => {
  const n = new Map<string, number>();
  for (const s of spans) { const k = s.why.split(':')[0]; n.set(k, (n.get(k) ?? 0) + 1); }
  return [...n].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)).join(', ');
};

/**
 * What the checker was unsure of, in one line: each stretch with why it is only listed. Said wherever the count is
 * said (a run's panel, its report, the --json record), so a count is never shown without what it counts.
 */
export const toCheckList = (spans: readonly Span[], most = 8): string =>
  spans.slice(0, most).map((u) => `"${u.text.trim()}" (${u.why.replace(/ \([A-Za-z]+: [\s\S]*\)$/, '')})`).join('; ') + (spans.length > most ? `; and ${spans.length - most} more` : '');

export const GRAMMAR: Observer = {
  id: 'GRAMMAR',
  describe: (p) => {
    const d = dialectOf(p);
    return `no mechanical error with no legitimate reading: a known misspelling in lower case, an agreement no variety uses ("he are"), a/an before a lower-case common word, two commas, a space before a comma or a full stop; `
      + `a capitalised word, a word repeated, a dialect's agreement ("they was"), "an" before "h" or a word read as letters, "::", "..", a space before "!", "?", ":" or ";", any other word the checker does not know${d ? ` in ${d === 'british' ? 'British' : 'American'} English` : ''}, and anything else it proposes, is only listed; code, quotations, addresses, figures and names are never touched`;
  },
  validate: (p) => {
    const d = list(p, 'dialect');
    if (d.length > 1 || (d.length === 1 && d[0] !== 'american' && d[0] !== 'british')) return 'dialect, when given, is american or british';
    return null;
  },
  observe(text, p, context) {
    const status = grammarStatus();
    if (!status.ready) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `${GRAMMAR_NOT_RUN}: ${status.reason}` };
    const r = readGrammar(text, p, context);
    if (!fixing) {
      // LISTED, NEVER CHANGED: every finding, with its note and without a correction, so nothing can apply one.
      const all = [...r.confirmed, ...r.uncertain].sort((a, b) => a.start - b.start || a.end - b.end).map(({ replacement: _, ...sp }) => sp);
      if (!all.length) return { verdict: 'MET', spans: [], value: 0, error: 0, detail: 'no possible slip found' };
      return { verdict: 'NOT_APPLICABLE', spans: all, value: all.length,
        detail: `${GRAMMAR_LISTED}: ${all.length} possible slip${all.length === 1 ? '' : 's'}: ${toCheckList(all)}` };
    }
    const toCheck = r.uncertain.length ? `; ${r.uncertain.length} listed to check: ${toCheckList(r.uncertain)}` : '';
    // "No mechanical error" is said only when nothing is listed either: with items to check, the rule held on what it
    // acts on, and the person still has to read the rest.
    if (!r.confirmed.length) return { verdict: 'MET', spans: [], value: 0, error: 0, detail: r.uncertain.length ? `held${toCheck}` : 'no mechanical error' };
    return { verdict: 'VIOLATED', spans: r.confirmed, value: r.confirmed.length, error: r.confirmed.length,
      detail: `${r.confirmed.length} mechanical error(s): ${kindsOf(r.confirmed)}${toCheck}` };
  },
};

// ── WHAT A BUILD READS FROM THE PIECES ──────────────────────────────────────────────────────────

/**
 * The dialect an author spells in, by the same rule the contrast pass uses to propose one: at least ten marked
 * spellings, and the other dialect's at most 15% of them. Null when the pieces do not settle it.
 */
export function dialectOfPieces(texts: readonly string[]): GrammarDialect | null {
  const count = (p: 'BRITISH_SPELLING' | 'AMERICAN_SPELLING'): number => texts.reduce((n, t) => n + findPattern(t, p).length, 0);
  const us = count('AMERICAN_SPELLING'); const uk = count('BRITISH_SPELLING');
  if (us >= 10 && uk <= 0.15 * (us + uk)) return 'american';
  if (uk >= 10 && us <= 0.15 * (us + uk)) return 'british';
  return null;
}

/**
 * THE AUTHOR'S OWN WORDS: every word the engine would call misspelt in the author's finished pieces, lower-cased, in
 * one sorted list. A coinage, a term of their trade, a name written lower-case: theirs, and never flagged in new work.
 * `terms` adds words the standard's other rules name (a substitution's right side, a term rate's list). With the
 * engine off or failed, every word of the pieces that is not one of the most common English words is kept instead
 * (a wider list, never a narrower one), so a later run with the engine never "corrects" the author's own terms.
 */
export function authorVocabulary(texts: readonly string[], dialect: GrammarDialect | null, terms: readonly string[] = []): string[] {
  const out = new Set<string>(terms.flatMap(lowerWords));
  if (engine) {
    for (const t of texts) {
      const protectedIn = protectedRanges(t);
      for (const l of lintsFor(engine, t, dialect)) {
        if (!SPELLING(l) || inside(protectedIn, l)) continue;
        const word = t.slice(l.start, l.end).trim();
        if (/^[\p{L}][\p{L}'’-]*$/u.test(word)) out.add(word.toLowerCase().replace(/[’]/g, '\''));
      }
    }
  } else {
    for (const t of texts) {
      for (const w of lowerWords(t)) {
        for (const part of [w, ...w.split('-')]) { const x = part.replace(/^['-]+|['-]+$/g, ''); if (x && !COMMON_WORDS.has(x)) out.add(x); }
      }
    }
  }
  return [...out].sort();
}

/** The measurement a build states, from the pieces it has: dialect where the pieces settle it, their vocabulary. */
export function grammarMeasurement(texts: readonly string[], terms: readonly string[] = []): Measurement {
  const dialect = dialectOfPieces(texts);
  const vocabulary = authorVocabulary(texts, dialect, terms);
  const constructions = authorConstructions(texts);
  return { observer: 'GRAMMAR', params: { ...(dialect ? { dialect: [dialect] } : {}), ...(vocabulary.length ? { vocabulary } : {}), ...(constructions.length ? { constructions } : {}) } };
}

/** The words a standard's other measured rules name: never a misspelling in new work. */
export function termsOf(rules: readonly { readonly measurement?: Measurement | null }[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    const m = r.measurement;
    if (!m || m.observer === 'GRAMMAR') continue;
    for (const k of ['terms', 'prefer', 'numerator', 'denominator', 'mentions', 'avoid']) {
      for (const t of list(m.params, k)) out.push(...t.split('=>').map((x) => x.trim()).filter(Boolean));
    }
  }
  return out;
}

/** How the author's pieces fare on the rule, for a build screen: errors beyond their own words, piece by piece. */
export function piecesWithErrors(texts: readonly string[], m: Measurement): number {
  // Read as the in-place set reads them, whichever way this process applies it: a build screen says the same either way.
  return grammarStatus().ready ? texts.filter((t) => readGrammar(t, m.params).confirmed.length > 0).length : 0;
}
