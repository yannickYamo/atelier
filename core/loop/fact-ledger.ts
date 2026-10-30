// atelier/core/loop/fact-ledger.ts — SPECIFICITY THAT IS GROUNDED IN WHAT THE PERSON SUPPLIED.
//
// Studies found that a skill matched an author's punctuation and tells but not the density of their
// specifics: the author names the figure, the date, the product; the imitation stays general. The
// tempting fix is to reward specific-looking text, and it is exactly wrong. A model asked for more
// figures supplies them, and a figure nobody gave it is an invention, the one thing this repository
// treats as worse than a flat draft (./claims.ts). So specific-looking density is NEVER a target here,
// and the feature that counts it (specificsDensity, ../observers/features.ts) is only ever a cap.
//
// What can be rewarded is COVERAGE OF SUPPLIED FACTS. The ledger is every atomic fact in the person's
// material, found deterministically: numbers with their unit and a few words of context, dates and
// years, names, quotations, links. A draft is then read with the same extractor, and each of its
// specifics either matches a ledger fact (it used what the person gave) or it does not. Coverage per
// 100 words is how densely the draft carries the person's own facts; the author's own density
// (`authorFactDensity`) says how dense that should be. Specifics outside the ledger are listed and
// nothing more: deciding whether one is an invention is the claim gate's job (./claims.ts,
// ./claim-extract.ts), which knows the difference between a figure presented as a finding and a "3"
// in passing. This module never cuts.
//
// Deterministic, no model call, and deliberately literal: "1,200" matches "1200" and "12%" matches
// "12 percent", but "twelve percent" and a paraphrased quotation do not. A literal ledger misses some
// real uses; it never credits an invented one.

import { wordsOf } from '../observers/text.js';
import { pageOf } from '../observers/features.js';

export type FactKind = 'NUMBER' | 'DATE' | 'NAME' | 'QUOTE' | 'URL';

/** One atomic fact: what it is, how it was written, and the form two writings of it are compared in. */
export interface Fact {
  readonly kind: FactKind;
  readonly text: string;
  readonly norm: string;
  /** for a number, a few words either side: what it counts lives there ("1,200 paying customers") */
  readonly context?: string;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** A matched span replaced with spaces, so later patterns cannot read it twice and offsets still hold. */
const blank = (s: string, start: number, end: number): string => s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);

const URL = /https?:\/\/[^\s<>"'()[\]]+/g;
/** Quotations of two words or more. One quoted word is a scare quote ("taste"), not something someone said. */
const QUOTE = /["“]([^"”\n]{2,300}?)["”]/g;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const YEAR = '(?:1[89]|20)\\d\\d';
/**
 * Dates, most specific first so "March 3, 2024" is one date and not a date and a year: ISO dates, month
 * day year, day month year, month year, month day, and a bare year. Case-sensitive on the month, so "may"
 * the verb is not a date.
 */
const DATE = new RegExp([
  `\\b(${YEAR})-(\\d\\d)(?:-(\\d\\d))?\\b`,
  `\\b(${MONTH})\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (${YEAR})\\b`,
  `\\b(\\d{1,2})(?:st|nd|rd|th)? (${MONTH})\\.?,? (${YEAR})\\b`,
  `\\b(${MONTH})\\.?,? (${YEAR})\\b`,
  `\\b(${MONTH})\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`,
  `(?<![\\d.,])\\b(${YEAR})\\b(?![\\d%]|\\.\\d| ?percent)`,
].join('|'), 'g');

/**
 * A number with what makes it a measurement: a currency, a percentage, a scale (thousand, million), a
 * unit of time or size. A counted noun ("customers") is not part of the number's identity, because it is
 * freely rephrased ("1,200 customers", "1,200 of them"); it is kept in the context instead.
 */
const NUMBER = /(?<![\w.,$€£])([$€£])?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(%|percent\b|per cent\b|pct\b))?(?:\s?(k|thousand|m|mn|million|bn|billion)\b)?(?:\s?(ms|milliseconds?|secs?|seconds?|mins?|minutes?|hrs?|hours?|days?|weeks?|months?|years?|kb|mb|gb|tb|x|times)\b)?(?![\w])/g;
const SCALE: Readonly<Record<string, string>> = { k: 'thousand', thousand: 'thousand', m: 'million', mn: 'million', million: 'million', bn: 'billion', billion: 'billion' };
const UNIT: Readonly<Record<string, string>> = {
  ms: 'millisecond', millisecond: 'millisecond', sec: 'second', second: 'second', min: 'minute', minute: 'minute',
  hr: 'hour', hour: 'hour', day: 'day', week: 'week', month: 'month', year: 'year', kb: 'kb', mb: 'mb', gb: 'gb', tb: 'tb', x: 'times', time: 'times',
};

/**
 * Words that open a sentence capitalised without naming anything. A capitalised run that starts with one
 * at a sentence start ("When Stripe", "The Financial Times") loses it; what is left is the name.
 */
const OPENERS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'when', 'but', 'and', 'so', 'this', 'that', 'if', 'our', 'my', 'we', 'i', 'it',
  'as', 'for', 'after', 'before', 'then', 'why', 'how', 'what', 'while', 'since', 'because', 'by', 'with', 'from', 'to', 'of',
  'yet', 'or', 'once', 'every', 'each', 'some', 'most', 'all', 'no', 'not', 'his', 'her', 'their', 'its', 'your', 'these', 'those']);
/**
 * The words of a name are joined by ONE space. A blanked span is a run of spaces, so two capitalised
 * words on either side of a removed link or figure ("Visit https://… . He") are never read as one name.
 */
const NAME_RUN = /\b[A-Z][\w'’&-]*(?: (?:of|the|de|du|van|von|for|and|&) [A-Z][\w'’&-]*| [A-Z][\w'’&-]*)+/g;
const NAME_ONE = /(?<=[a-z0-9,;:)] )[A-Z][\w'’&-]+/g;
/**
 * Capitalised mid-sentence but never a name: the first person, and a month or weekday on its own ("in
 * March", "on Monday"), which is a time too vague to be a fact anyone could check or supply.
 */
const NOT_NAMES = new Set(['i', "i'm", "i've", "i'd", "i'll", 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

const midSentence = (before: string): boolean => /[a-z0-9,;:)] $/.test(before);
const fold = (s: string): string => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const nameNorm = (s: string): string => fold(s).replace(/'s$/, '').replace(/^the /, '').replace(/[.,]+$/, '');
const canonNumber = (raw: string): string => String(Number(raw.replace(/,/g, '')));
const pad = (n: string): string => n.padStart(2, '0');
const monthOf = (m: string): string => pad(String(MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1));

/** A date's norm: year, month and day as far as they are written ("2024-03-03", "2024-03", "2024", "03-03"). */
function dateNorm(g: readonly (string | undefined)[]): string {
  const [isoY, isoM, isoD, mdyM, mdyD, mdyY, dmyD, dmyM, dmyY, myM, myY, mdM, mdD, y] = g;
  if (isoY) return [isoY, isoM, isoD].filter(Boolean).join('-');
  if (mdyM) return `${mdyY}-${monthOf(mdyM)}-${pad(mdyD ?? '')}`;
  if (dmyM) return `${dmyY}-${monthOf(dmyM)}-${pad(dmyD ?? '')}`;
  if (myM) return `${myY}-${monthOf(myM)}`;
  if (mdM) return `${monthOf(mdM)}-${pad(mdD ?? '')}`;
  return y ?? '';
}

/** A few words either side of a span, from the original text. */
const contextOf = (s: string, start: number, end: number): string =>
  `${s.slice(0, start).split(/\s+/).slice(-4).join(' ')}${s.slice(start, end)}${s.slice(end).split(/\s+/).slice(0, 4).join(' ')}`.replace(/\s+/g, ' ').trim();

/**
 * Every atomic fact in `material`, deduplicated by kind and norm, kind by kind (links, quotations, dates,
 * numbers, names: each pass blanks what it took, so nothing is read twice). Front matter and code fences are not read (they are metadata and code, not claims), and a numbered list's
 * markers are not figures. Bare whole numbers under 10 with nothing that makes them a measurement ("2
 * options") are left out: they are how prose counts, not facts anyone supplied.
 *
 * A known limit: a single capitalised word counts as a name only mid-sentence (at a sentence start every
 * word is capitalised), so a name the material mentions only at the start of its sentences is not in the
 * ledger, and a draft that uses it mid-sentence lists it as outside. Outside is a list to look at, never
 * a cut, so the miss costs a false entry in a report and nothing more.
 */
export function factLedger(material: string): Fact[] {
  const out: Fact[] = [];
  const seen = new Set<string>();
  const add = (f: Fact): void => {
    const k = `${f.kind}:${f.norm}`;
    if (f.norm && !seen.has(k)) { seen.add(k); out.push(f); }
  };
  const original = pageOf(material).body.replace(/^(\s*)\d+[.)](?=\s)/gm, (m) => ' '.repeat(m.length));
  let s = original;

  for (const m of original.matchAll(URL)) {
    const u = m[0].replace(/[.,;:!?]+$/, '');
    add({ kind: 'URL', text: u, norm: u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '') });
    s = blank(s, m.index, m.index + m[0].length);
  }
  for (const m of [...s.matchAll(QUOTE)]) {
    if (wordsOf(m[1]).length >= 2) add({ kind: 'QUOTE', text: m[0], norm: fold(m[1]).replace(/^[\s.,;:!?'-]+|[\s.,;:!?'-]+$/g, '') });
    s = blank(s, m.index, m.index + m[0].length);
  }
  for (const m of [...s.matchAll(DATE)]) {
    add({ kind: 'DATE', text: m[0], norm: dateNorm(m.slice(1)) });
    s = blank(s, m.index, m.index + m[0].length);
  }
  for (const m of [...s.matchAll(NUMBER)]) {
    const [whole, cur, num, pct, scale, unit] = m;
    const value = canonNumber(num);
    const measured = Boolean(cur || pct || scale || unit) || /[.,]/.test(num);
    if (!measured && Number(value) < 10) continue;
    const unitWord = unit ? unit.toLowerCase().replace(/s$/, '') : '';
    const norm = [`${cur ?? ''}${value}`, pct ? 'percent' : '', scale ? SCALE[scale.toLowerCase()] : '', unitWord ? (UNIT[unitWord] ?? unitWord) : '']
      .filter(Boolean).join(' ');
    const end = m.index + whole.length;
    add({ kind: 'NUMBER', text: whole.trim(), norm, context: contextOf(original, m.index, end) });
    s = blank(s, m.index, end);
  }
  // Names last, on what is left, with heading lines left out: a title-cased heading capitalises every word.
  s = s.replace(/^[ \t]*#{1,6}[ \t].*$/gm, (m) => ' '.repeat(m.length));
  for (const m of [...s.matchAll(NAME_RUN)]) {
    let words = m[0].split(/[ \t]+/);
    if (!midSentence(s.slice(0, m.index)) && OPENERS.has(words[0].toLowerCase())) words = words.slice(1);
    const name = words.join(' ').replace(/[.,]+$/, '');
    const lone = words.length === 1 && (NOT_NAMES.has(name.toLowerCase()) || OPENERS.has(name.toLowerCase()));
    if (words.length && !lone) add({ kind: 'NAME', text: name, norm: nameNorm(name) });
    s = blank(s, m.index, m.index + m[0].length);
  }
  for (const m of s.matchAll(NAME_ONE)) {
    if (!NOT_NAMES.has(m[0].toLowerCase())) add({ kind: 'NAME', text: m[0], norm: nameNorm(m[0]) });
  }
  return out;
}

/**
 * Whether a specific in a draft is a ledger fact: the same kind and the same norm, or, for a date, a
 * coarser writing of a ledger date ("March 2024" for "March 3, 2024"). Never the other way: a draft that
 * adds a day the material did not give has added something.
 */
const sameFact = (t: Fact, l: Fact): boolean =>
  t.kind === l.kind && (t.norm === l.norm || (t.kind === 'DATE' && l.norm.startsWith(`${t.norm}-`)));

export interface FactCoverage {
  /** the ledger facts the text uses */
  readonly used: Fact[];
  /** distinct ledger facts used, per 100 words of the text */
  readonly per100: number;
  /** specifics in the text that match no ledger fact, as written: for the claim gate to judge, never a cut here */
  readonly outside: string[];
}

/**
 * Which of the person's facts `text` carries, how densely, and which of its specifics came from
 * somewhere else. `per100` is the number to steer toward the author's density (`authorFactDensity`);
 * `outside` is never rewarded and never cut here.
 */
export function factCoverage(text: string, ledger: readonly Fact[]): FactCoverage {
  const found = factLedger(text);
  const words = wordsOf(pageOf(text).body).length;
  const used = ledger.filter((l) => found.some((t) => sameFact(t, l)));
  const outside = found.filter((t) => !ledger.some((l) => sameFact(t, l))).map((t) => t.text);
  return { used, per100: words ? r3((used.length / words) * 100) : 0, outside };
}

/** Pieces shorter than this say too little about how densely the author writes in facts. */
const MIN_PIECE_WORDS = 150;

/**
 * The author's own density of specifics, per 100 words: the median over their pieces of at least
 * MIN_PIECE_WORDS words, or null when none is that long. It is the target for `per100` above, on the
 * assumption that the author's specifics were their own: every fact in their own piece is supplied by
 * definition, so their density of specifics is their density of supplied facts.
 */
export function authorFactDensity(pieces: readonly string[]): number | null {
  const ds = pieces.flatMap((p) => {
    const n = wordsOf(pageOf(p).body).length;
    return n < MIN_PIECE_WORDS ? [] : [(factLedger(p).length / n) * 100];
  }).sort((a, b) => a - b);
  if (!ds.length) return null;
  const mid = Math.floor(ds.length / 2);
  return r3(ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2);
}
