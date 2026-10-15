// atelier/core/observers/grammar.ts — MECHANICAL ERRORS, FOUND AND NAMED; THE VOICE LEFT ALONE.
//
// One editorial rule every author holds without stating it: a word spelt wrong, a verb that does not agree with
// its subject, "the the", "an bug", a missing apostrophe in "dont", a space before a comma. Nothing else here is
// voice, and nothing of the voice is here. The checker that finds them is a grammar engine wired in by the
// process that runs Atelier (`setGrammarProvider`): core names what a lint is and decides what to do with it, and
// never imports the engine, so a build without one still runs and says so.
//
// WHAT COUNTS. The engine proposes far more than it is allowed to act on. A lint is CONFIRMED only when it is of
// a kind this file lists as unambiguously mechanical (`MECHANICAL_RULES`) and survives every guard below;
// everything else the engine proposes is UNCERTAIN: listed for the person to read, never repaired, never a rule
// broken. The guards, in the order they run:
//
//   protected regions   code (fenced and inline), quotations and block quotes, URLs, paths and `path:line`
//                       citations, figures and currency, front matter, link targets: never flagged.
//   the author's words  a capitalised word (a name, a product), a word with a digit, a word the standard's own
//                       terms or the request and material carry, a word the author's own pieces use (the rule's
//                       `vocabulary`, read at build), a word the text itself uses three times or more.
//   the author's variant  spelling is checked in the dialect the standard records; where none is recorded, only a
//                       word misspelt in BOTH British and American English counts.
//   intentional choices a fragment, an "And" or "But" opener, a one-word sentence, a lower-case styling, a word
//                       repeated for emphasis, two spaces after a full stop, "!!": none of these is in the list, and the
//                       repetition guard keeps "very very" and "no no".
//   claims              a correction that would change a figure or a capitalised name is refused: it is listed
//                       as uncertain with the reason, and nothing is changed.
//
// The engine's coverage is what it is, and this file claims no more: the agreement lints are the pronoun-based
// ones ("they was", "he go"), not every subject the English language offers. docs/MEASURED-RULES.md says so.

import type { Measurement } from '../state/canonical-state.js';
import type { Observer, Span, CheckContext } from './registry.js';
import { findPattern } from './style.js';
import { numbersIn } from '../loop/integrity.js';

export type GrammarDialect = 'american' | 'british';
export const GRAMMAR_DIALECTS: readonly GrammarDialect[] = ['american', 'british'];

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
// Rule names of the engine (harper.js 2.10) that find an error no author intends, each with the label the report
// uses. Nothing outside this list is ever corrected. Added to only with a reason, here.
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
};
/** Engine categories allowed whole: a Typo is a fixed table of common slips ("teh"), held to the spelling guards. */
const MECHANICAL_KINDS: ReadonlySet<string> = new Set(['Typo']);
/** Spelling-like lints: the word guards below apply to them, and only to them. */
const SPELLING = (l: GrammarLint): boolean => l.rule === 'SpellCheck' || l.kind === 'Typo';
/** A word doubled on purpose is emphasis, not a slip. */
const EMPHASIS: ReadonlySet<string> = new Set(['very', 'really', 'so', 'no', 'yes', 'never', 'again', 'many', 'more', 'much', 'far', 'long', 'ha', 'bye', 'hush', 'well', 'now', 'please', 'quite', 'ever', 'on', 'out']);
/** Capitalised words that are not names wherever they sit (the meaning guard's own list, kept in step). */
const NOT_NAMES: ReadonlySet<string> = new Set(['most', 'every', 'each', 'all', 'some', 'many', 'few', 'the', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'you', 'they', 'he', 'she', 'our', 'your', 'their', 'my', 'and', 'but', 'or', 'if', 'when', 'why', 'what', 'how', 'not', 'no', 'a', 'an', 'i']);

// ── THE ENGINE, WIRED IN ONCE ────────────────────────────────────────────────────────────────────

let provider: GrammarProvider | null = null;
let engine: GrammarEngine | null = null;
let failure: string | null = null;
let loading: Promise<void> | null = null;
/** `ATELIER_GRAMMAR=off`: the owner's switch. The check is set aside with that reason, never reported as run. */
const turnedOff = (): boolean => process.env.ATELIER_GRAMMAR === 'off';
/** How a check the owner turned off opens its detail: the record reads it as set aside, not as a check that failed to run. */
export const GRAMMAR_OFF = 'set aside: the grammar check is turned off for this process (ATELIER_GRAMMAR=off)';

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
  if (!provider) { failure = 'no grammar checker is wired into this process'; return; }
  loading ??= provider.load().then((e) => { engine = e; }, (e: unknown) => { failure = (e instanceof Error ? e.message : String(e)).split('\n')[0] || 'the grammar checker failed to load'; });
  await loading;
}

/** Whether a check can run now, and if not, why. */
export const grammarStatus = (): { readonly ready: true } | { readonly ready: false; readonly reason: string; readonly off?: true } =>
  (turnedOff() ? { ready: false, reason: GRAMMAR_OFF, off: true } : engine ? { ready: true } : { ready: false, reason: failure ?? 'the grammar checker was not loaded before the check ran' });

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
  add(/"[^"\n]{1,600}"|“[^”\n]{1,600}”|‘[^’\n]{1,600}’/g);                  // quotations
  add(/\bhttps?:\/\/\S+|\bwww\.\S+/gi);                                    // URLs
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
 * Two slips the engine has no rule for, read here: a comma, semicolon or colon typed twice (",,"), a full stop typed
 * twice where no ellipsis is meant ("end.." but not "..." or "...."), and a space before a semicolon, colon, full
 * stop, question or exclamation mark ("done ?"). "!!" and "?!" are emphasis and never counted; a colon or full stop
 * after a space that opens a smiley, a path or a figure is not one either. The comma's case is the engine's own.
 */
export function punctuationLints(text: string): GrammarLint[] {
  const out: GrammarLint[] = [];
  for (const m of text.matchAll(/(?<=\p{L})([,;:])\1+(?![,;:])/gu)) {
    out.push({ rule: 'DoublePunctuation', kind: 'Punctuation', message: `"${m[1]}" typed more than once`, start: m.index, end: m.index + m[0].length, replacement: m[1] });
  }
  for (const m of text.matchAll(/(?<=\p{L})\.\.(?!\.)(?=\s|$)/gu)) {
    out.push({ rule: 'DoublePunctuation', kind: 'Punctuation', message: 'a full stop typed twice', start: m.index, end: m.index + 2, replacement: '.' });
  }
  for (const m of text.matchAll(/(?<=\p{L})[ \t]+([;:.?!])(?=\s|$)/gu)) {
    out.push({ rule: 'SpaceBeforePunctuation', kind: 'Punctuation', message: `a space before "${m[1]}"`, start: m.index, end: m.index + m[0].length, replacement: m[1] });
  }
  return out;
}

/** Lints in the recorded dialect; with none recorded, spelling counts only where both dialects flag the same span. */
function lintsFor(e: GrammarEngine, text: string, dialect: GrammarDialect | null): GrammarLint[] {
  if (dialect) return [...e.lint(text, dialect), ...punctuationLints(text)];
  const us = e.lint(text, 'american'); const uk = e.lint(text, 'british');
  const key = (l: GrammarLint): string => `${l.rule}@${l.start}-${l.end}`;
  const ukKeys = new Set(uk.map(key));
  return [...us.filter((l) => !SPELLING(l) || ukKeys.has(key(l))), ...punctuationLints(text)];
}

/** 1 for a lint of an allowed kind: on the same stretch, it is read before the engine's other notes, so it is the one kept. */
const allowed = (l: GrammarLint): number => (l.rule in MECHANICAL_RULES || MECHANICAL_KINDS.has(l.kind) ? 1 : 0);

// The same text is read by the rule's line and by the list of what to check: read once.
const READINGS = new Map<string, GrammarReading>();
const READING_CACHE = 16;

/** Every lint of the text sorted into confirmed and uncertain, under the guards at the head of this file. */
export function readGrammar(text: string, params: Measurement['params'], context?: CheckContext): GrammarReading {
  if (!engine) return { confirmed: [], uncertain: [] };
  const vocabulary = list(params, 'vocabulary');
  const cacheKey = `${dialectOf(params) ?? '?'}|${vocabulary.join(',')}|${context?.request ?? ''}|${(context?.material ?? []).map((m) => m.name).join(',')}|${text}`;
  const had = READINGS.get(cacheKey);
  if (had) return had;
  const protectedIn = protectedRanges(text);
  const known = new Set<string>([...vocabulary.flatMap(lowerWords), ...lowerWords(context?.request ?? ''), ...(context?.material ?? []).flatMap((m) => lowerWords(m.text))]);
  const counts = new Map<string, number>();
  for (const w of lowerWords(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const confirmed: Span[] = []; const uncertain: Span[] = [];
  const seen = new Set<string>();
  for (const l of lintsFor(engine, text, dialectOf(params)).sort((a, b) => a.start - b.start || a.end - b.end || allowed(b) - allowed(a))) {
    if (l.end <= l.start || l.end > text.length) continue;
    const at = `${l.start}-${l.end}`;
    if (seen.has(at)) continue;
    seen.add(at);
    if (inside(protectedIn, l)) continue;                                   // (a) never flagged
    const problem = text.slice(l.start, l.end);
    const label = MECHANICAL_RULES[l.rule] ?? (MECHANICAL_KINDS.has(l.kind) ? 'a common typo' : null);
    const span = (why: string, replacement?: string): Span => ({ start: l.start, end: l.end, text: problem, why, ...(replacement !== undefined ? { replacement } : {}) });
    const note = (why: string): void => { uncertain.push(span(`${why} (${l.rule}: ${l.message.replace(/\s+/g, ' ').trim()})`)); };
    if (label === null) { note('the checker proposes a change this rule does not make'); continue; }   // (c) not in the list
    const fix = l.replacement;
    if (SPELLING(l)) {
      const word = problem.trim();
      if (/^[A-Z]/.test(word) || /[A-Z]/.test(word.slice(1)) || /\d/.test(word)) { note('a name, an acronym or a coined word is the author\'s'); continue; }
      if (known.has(bare(word).replace(/[’]/g, '\''))) { note('a word of the author\'s own, or one the request or material carries'); continue; }
      if ((counts.get(word.toLowerCase()) ?? 0) >= 3) { note('used three times or more: a spelling the author chooses'); continue; }
      if (fix === null || fix === '' || /[A-Z]/.test(fix)) { note('no correction the checker is sure of'); continue; }
      const same = bare(word) === bare(fix);                                 // "dont" → "don't": an apostrophe put back
      if (!same && distance(bare(word), bare(fix)) > 2) { note('the correction is another word, not this one spelt right'); continue; }
    }
    if (l.rule === 'RepeatedWords') {
      const words = lowerWords(problem);
      if (words.length !== 2 || words[0] !== words[1]) { note('not one word twice'); continue; }
      if (EMPHASIS.has(words[0])) { note('a word repeated for emphasis'); continue; }
    }
    // A correction may not change a figure or a name: that is a claim, not a mechanical slip.
    if (fix !== null && fix !== '') {
      if (numbersIn(problem).join('|') !== numbersIn(fix).join('|')) { note('the correction would change a figure'); continue; }
      const kept = new Set(namesOf(fix).map(bare));
      if (namesOf(problem).some((n) => !kept.has(bare(n)) && !(l.rule === 'RepeatedWords'))) { note('the correction would change a name'); continue; }
      if (fix.includes('\n')) { note('the correction spans a line break'); continue; }
    }
    confirmed.push(span(fix === null ? `${label}: ${l.message.replace(/\s+/g, ' ').trim()}` : `${label}: "${problem.trim()}" → "${fix.trim() || '(removed)'}"`, fix ?? undefined));
  }
  // A finding the rule acts on is not also listed to check: the engine's own note on the same stretch goes.
  const reading: GrammarReading = { confirmed, uncertain: uncertain.filter((u) => !inside(confirmed, u)) };
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

export const GRAMMAR: Observer = {
  id: 'GRAMMAR',
  describe: (p) => {
    const d = dialectOf(p);
    return `no mechanical error: spelling${d ? ` (${d === 'british' ? 'British' : 'American'} English)` : ''}, subject–verb agreement, a word repeated by accident, a/an, a missing apostrophe, a space before a comma; `
      + 'code, quotations, addresses, figures and names are never touched, and anything else the checker proposes is only listed';
  },
  validate: (p) => {
    const d = list(p, 'dialect');
    if (d.length > 1 || (d.length === 1 && d[0] !== 'american' && d[0] !== 'british')) return 'dialect, when given, is american or british';
    return null;
  },
  observe(text, p, context) {
    const status = grammarStatus();
    if (!status.ready) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: status.off ? status.reason : `${GRAMMAR_NOT_RUN}: ${status.reason}` };
    const r = readGrammar(text, p, context);
    const toCheck = r.uncertain.length ? `; ${r.uncertain.length} construction(s) the checker is unsure of, listed to check` : '';
    if (!r.confirmed.length) return { verdict: 'MET', spans: [], value: 0, error: 0, detail: `no mechanical error${toCheck}` };
    const fixable = r.confirmed.filter((s) => s.replacement !== undefined).length;
    return { verdict: 'VIOLATED', spans: r.confirmed, value: r.confirmed.length, error: r.confirmed.length,
      detail: `${r.confirmed.length} mechanical error(s): ${kindsOf(r.confirmed)}${fixable < r.confirmed.length ? ` (${r.confirmed.length - fixable} with no correction the checker is sure of: the sentence is rewritten for it)` : ''}${toCheck}` };
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
 * `terms` adds words the standard's other rules name (a substitution's right side, a term rate's list). Empty when
 * the engine is not loaded: then nothing is claimed about their vocabulary either.
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
  }
  return [...out].sort();
}

/** The measurement a build states, from the pieces it has: dialect where the pieces settle it, their vocabulary. */
export function grammarMeasurement(texts: readonly string[], terms: readonly string[] = []): Measurement {
  const dialect = dialectOfPieces(texts);
  const vocabulary = authorVocabulary(texts, dialect, terms);
  return { observer: 'GRAMMAR', params: { ...(dialect ? { dialect: [dialect] } : {}), ...(vocabulary.length ? { vocabulary } : {}) } };
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
  return texts.filter((t) => GRAMMAR.observe(t, m.params).verdict === 'VIOLATED').length;
}
