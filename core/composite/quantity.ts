// atelier/core/composite/quantity.ts — ONE GRAMMAR FOR A QUANTITY SAID IN WORDS.
//
// "About 300 words", "under 2,000 characters", "at least eight hundred words", "a five-minute read", "never a
// sentence over 15 words", "paragraphs of between two and four sentences": each is a range on one measure, and two
// rules on the same measure can both be followed only when their ranges meet. Every place that reads a worded rule's
// number (the trait table, the final guard, a worded rule against a count: ./traits.ts) reads it here, so one wording
// is never read two ways by two readers.
//
// A QUANTITY is { measure, unit, min, max }:
//   measure   what is counted: the whole piece, each sentence, or each paragraph
//   unit      what it is counted in: words, sentences or paragraphs
//   min, max  the range, null where it is open ("at least 800 words" has no max)
//
// HOW IT IS READ
//   numbers     digits with separators ("1,200"), and number words of any size ("eight hundred", "twenty-five",
//               "eighteen", "a dozen"), through core/loop/numbers.ts
//   at most     at most, no more than, not more than, never more than, no longer than, a maximum of, up to, within,
//               and "keep (limit, hold, cap) it to N": the max is N. Under, below, fewer than, less than, shorter
//               than: the max is just under N (N - 1 in a unit that counts whole things)
//   at least    at least, no fewer than, no less than, a minimum of, minimum: the min is N. Over, more than, above,
//               longer than, beyond, past: just over N (N + 1). "N or more", "N+" and "N or fewer" after the unit too
//   negated     a negation before a comparator in its clause turns it round: "never write a sentence over 15
//               words" is a max of 15, "no sentence longer than twenty words" a max of 20. ("No more than N" and
//               the like are comparators of their own, read as written: a max, never a min.)
//   ranges      "N to M", "N-M", "N or M", "between N and M", "from N to M"
//   about       about, around, roughly, approximately, some, circa, close to, "~": N less a fifth to N and a fifth
//               ([0.8N, 1.2N], its two ends excluded: "around thirty words" is not met by 24, "under 25" is). A size said plainly, with no comparator ("aim for a five-minute read", "sentences
//               of twenty words"), is a target and read the same way: a writer aiming at N lands near it
//   exactly     "a single sentence", "exactly N": N. "A sentence or two": one to two
//   allowance   "let a paragraph run to eight sentences", "may go up to N": a permission to reach N, not a range a
//               piece must sit in; it opposes only a ceiling well below it
//
// CONVERSIONS, so a length said in characters or reading time meets one said in words
//   characters        ÷ 6   (an English word averages about five letters and a space)
//   minutes of reading × 230 (a common silent reading speed for prose, in words a minute)
//
// WHAT IS MEASURED: a count in sentences is of each paragraph when the rule speaks of paragraphs, else of the piece; a
// count in paragraphs is of the piece; a count in words is of what the clause names (a sentence, a paragraph, the
// piece), else of what the rule named before it, else of the piece. A number said of a heading, a title, a section, a
// line, a caption, a quote, a summary, an opening or a closing is of none of these, and is not read.

import { numberPhrases } from '../loop/numbers.js';

export type QuantityMeasure = 'piece' | 'sentence' | 'paragraph';
export type QuantityUnit = 'words' | 'sentences' | 'paragraphs';
export interface Quantity {
  readonly measure: QuantityMeasure;
  readonly unit: QuantityUnit;
  /** null: no floor */
  readonly min: number | null;
  /** null: no ceiling */
  readonly max: number | null;
  /** a permission to reach `max` ("let it run to eight"), not a range the piece must sit in */
  readonly allows?: true;
  /** a size said "about" (or plainly): its two ends are where it stops, not part of it */
  readonly about?: true;
}

/** Characters to words: a word and its space average six characters. */
export const CHARACTERS_PER_WORD = 6;
/** Minutes of reading to words: a common silent reading speed for prose. */
export const WORDS_PER_MINUTE = 230;
/** "About N" is N less a fifth to N and a fifth. */
export const APPROXIMATELY = 0.2;

type Comparator = 'MAX' | 'MAX_STRICT' | 'MIN' | 'MIN_STRICT' | 'ABOUT' | 'EXACT';
const COMPARATORS: readonly (readonly [string, Comparator])[] = [
  ['at most', 'MAX'], ['no more than', 'MAX'], ['not more than', 'MAX'], ['never more than', 'MAX'], ['no longer than', 'MAX'],
  ['not longer than', 'MAX'], ['never longer than', 'MAX'], ['a maximum of', 'MAX'], ['maximum of', 'MAX'], ['a max of', 'MAX'], ['up to', 'MAX'],
  ['within', 'MAX'], ['not exceeding', 'MAX'], ['never exceeding', 'MAX'], ['not to exceed', 'MAX'], ['no greater than', 'MAX'], ['capped at', 'MAX'],
  ['under', 'MAX_STRICT'], ['below', 'MAX_STRICT'], ['fewer than', 'MAX_STRICT'], ['less than', 'MAX_STRICT'], ['shorter than', 'MAX_STRICT'],
  ['at least', 'MIN'], ['no fewer than', 'MIN'], ['no less than', 'MIN'], ['not fewer than', 'MIN'], ['not less than', 'MIN'], ['never fewer than', 'MIN'],
  ['never less than', 'MIN'], ['a minimum of', 'MIN'], ['minimum of', 'MIN'], ['minimum', 'MIN'], ['no shorter than', 'MIN'], ['not shorter than', 'MIN'],
  ['over', 'MIN_STRICT'], ['more than', 'MIN_STRICT'], ['above', 'MIN_STRICT'], ['longer than', 'MIN_STRICT'], ['beyond', 'MIN_STRICT'], ['past', 'MIN_STRICT'],
  ['exceeding', 'MIN_STRICT'], ['in excess of', 'MIN_STRICT'], ['greater than', 'MIN_STRICT'], ['upwards of', 'MIN_STRICT'],
  ['about', 'ABOUT'], ['around', 'ABOUT'], ['roughly', 'ABOUT'], ['approximately', 'ABOUT'], ['some', 'ABOUT'], ['circa', 'ABOUT'], ['close to', 'ABOUT'],
  ['somewhere around', 'ABOUT'], ['in the region of', 'ABOUT'],
  ['exactly', 'EXACT'], ['precisely', 'EXACT'],
];
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KIND = new Map(COMPARATORS);
const BOUNDS = [...COMPARATORS].filter(([, k]) => k !== 'ABOUT' && k !== 'EXACT').map(([w]) => w).sort((a, b) => b.length - a.length);
const APPROX = [...COMPARATORS].filter(([, k]) => k === 'ABOUT' || k === 'EXACT').map(([w]) => w).sort((a, b) => b.length - a.length);
/** What stands right before a number: a bound, then an approximation, then an article, any of them absent. */
const BEFORE = new RegExp(String.raw`(?:(?:^|\b)(${BOUNDS.map(esc).join('|')})\s+)?(?:(?:(?:^|\b)(${APPROX.map(esc).join('|')})\s+)|(~)\s*)?(?:\b(?:a|an)\s+)?$`);
const NEGATION = /\b(?:never|no|not|don't|do not|doesn't|nothing|none|avoid)\b/;
const CLAUSE_END = /[.;:!?,(]|\bbut\b|\band\b/g;

const UNIT_AFTER = /^\+?[\s-]*(?:(?:short|long|full|brief|complete|simple|plain|tight|crisp)\s+)?(words?|characters?|chars?|minutes?(?=(?:[\s-]+(?:of\s+)?read(?:ing)?\b|[\s-]+to\s+read\b|\s+reading\s+time\b))|sentences?|paragraphs?)\b/i;
const AFTER_MAX = /^\s*(?:long\s+)?,?\s*(?:at most|or fewer|or less|or under|or shorter|max(?:imum)?|tops)\b/i;
const AFTER_MIN = /^\s*(?:long\s+)?,?\s*(?:or more|or longer|or over|at least|minimum|plus)\b/i;

const PARAGRAPH = /\bparagraphs?\b/i;
const CONTAINER = /\b(sentences?|paragraphs?|pieces?|essays?|posts?|articles?|drafts?|texts?|reports?|stor(?:y|ies)|newsletters?|headings?|headlines?|titles?|sub-?heads?|sections?|lines?|captions?|quotes?|quotations?|summar(?:y|ies)|intros?|introductions?|openings?|openers?|conclusions?|closings?|endings?|bullets?|items?|subject lines?|tweets?|ledes?|abstracts?|excerpts?)\b/gi;
const containerMeasure = (w: string): QuantityMeasure | null | 'OTHER' => {
  const x = w.toLowerCase();
  if (x.startsWith('sentence')) return 'sentence';
  if (x.startsWith('paragraph')) return 'paragraph';
  if (/^(?:piece|essay|post|article|draft|text|report|stor|newsletter)/.test(x)) return 'piece';
  return 'OTHER';
};

interface Num { readonly at: number; readonly end: number; readonly value: number }
/** Every number in `s`, as its value, with where it sits: digits with separators, and number phrases of any size. */
function numbersAt(s: string): Num[] {
  const phrases = numberPhrases(s).map((p) => ({ at: p.index, end: p.index + p.length, value: Number(p.value) }));
  const digits = [...s.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)]
    .filter((m) => !phrases.some((p) => m.index >= p.at && m.index < p.end))
    .map((m) => ({ at: m.index, end: m.index + m[0].length, value: Number(m[0].replace(/,/g, '')) }));
  return [...phrases, ...digits].sort((a, b) => a.at - b.at);
}

/** Wordings a number reader cannot see as numbers: "a single sentence", "a sentence or two", "one or two". */
function normalize(statement: string): string {
  return statement
    .replace(/\b(?:a single|one single|just one|only one|a lone)\s+(sentence|paragraph)(s?)\b/gi, 'exactly 1 $1$2')
    .replace(/\ba (sentence|paragraph) or two\b/gi, '1 to 2 $1s')
    .replace(/\b(?:a|one) or two (sentence|paragraph)s?\b/gi, '1 to 2 $1s')
    .replace(/\bone(?=\s*(?:-|–|to|or)\s*(?:\d|two|three|four|five|six|seven|eight|nine|ten)\b)/gi, '1');
}

const clauseStart = (s: string, at: number): number => {
  let start = 0;
  for (const m of s.slice(0, at).matchAll(CLAUSE_END)) start = m.index + m[0].length;
  return start;
};
const sentenceStart = (s: string, at: number): number => {
  let start = 0;
  for (const m of s.slice(0, at).matchAll(/[.;!?]/g)) start = m.index + 1;
  return start;
};

/** Whether the words right before `at` hold a comparator from this grammar and a number follows (a cap or a floor, not a ban). */
export function boundedNumber(text: string): boolean {
  return numbersAt(text).some((n) => {
    const m = BEFORE.exec(text.slice(clauseStart(text, n.at), n.at).toLowerCase());
    return Boolean(m?.[1]) || /\bto\s+(?:(?:a|an)\s+)?$/i.test(text.slice(0, n.at)) && /\b(?:keep|limit|hold|cap|cut|trim|restrict|stick)\b/i.test(text);
  });
}

/** The measure a count in `unit` is of, read from where it sits; null when it is of something none of the three measures. */
function measureOf(s: string, at: number, end: number, unit: QuantityUnit, reading: boolean): QuantityMeasure | null {
  if (reading || unit === 'paragraphs') {
    if (unit === 'paragraphs') {
      const clause = s.slice(clauseStart(s, at), end);
      return [...clause.matchAll(CONTAINER)].some((m) => containerMeasure(m[1]) === 'OTHER') ? null : 'piece';
    }
    return 'piece';
  }
  if (unit === 'sentences') {
    if (PARAGRAPH.test(s)) return 'paragraph';
    const clause = s.slice(clauseStart(s, at), end);
    return [...clause.matchAll(CONTAINER)].some((m) => containerMeasure(m[1]) === 'OTHER') ? null : 'piece';
  }
  // A count in words: the container its clause names (the nearest), else the last one named before it, else one named
  // right after it ("twenty words a sentence"), else the piece.
  const from = clauseStart(s, at);
  let to = s.length;
  CLAUSE_END.lastIndex = 0;
  for (const m of s.slice(end).matchAll(CLAUSE_END)) { to = end + m.index; break; }
  const inClause = [...s.slice(from, to).matchAll(CONTAINER)].map((m) => ({ d: Math.abs(from + m.index - at), w: m[1] })).sort((x, y) => x.d - y.d);
  const pick = (w: string): QuantityMeasure | null => { const k = containerMeasure(w); return k === 'OTHER' ? null : k; };
  if (inClause.length) return pick(inClause[0].w);
  const before = [...s.slice(0, from).matchAll(CONTAINER)].pop();
  if (before) return pick(before[1]);
  const after = /^\s*(?:a|per|each|every|in a|in each|in every|for each|for every)\s+(sentence|paragraph)\b/i.exec(s.slice(end));
  if (after) return pick(after[1]);
  return 'piece';
}

/**
 * EVERY QUANTITY A RULE STATES, one per measure and unit (two said of one measure are both held: their overlap), with
 * the permissions ("let it run to eight") kept apart. Empty when it states none.
 */
export function quantitiesOf(statement: string): Quantity[] {
  const s = normalize(statement);
  const nums = numbersAt(s);
  const found: Quantity[] = [];
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    // A range: "N to M", "N-M", "N or M", "between N and M".
    const next = nums[i + 1];
    const link = next ? s.slice(n.end, next.at) : '';
    const between = /\bbetween\s+$/i.test(s.slice(0, n.at));
    const range = next && (/^\s*(?:-|–|to|or)\s*$/i.test(link) || (between && /^\s*and\s*$/i.test(link))) ? next : null;
    const last = range ?? n;
    const unitM = UNIT_AFTER.exec(s.slice(last.end));
    if (!unitM) continue;
    if (range) i += 1;
    const raw = unitM[1].toLowerCase();
    const reading = raw.startsWith('minute');
    const chars = raw.startsWith('char');
    const unit: QuantityUnit = raw.startsWith('sentence') ? 'sentences' : raw.startsWith('paragraph') ? 'paragraphs' : 'words';
    const unitEnd = last.end + unitM[0].length;
    const measure = measureOf(s, n.at, unitEnd, unit, reading);
    if (!measure) continue;
    const whole = !reading;
    const per = reading ? WORDS_PER_MINUTE : chars ? 1 / CHARACTERS_PER_WORD : 1;
    const conv = (x: number | null): number | null => (x === null ? null : Math.round(x * per * 100) / 100);
    const push = (min: number | null, max: number | null, flag?: 'allows' | 'about'): void => { found.push({ measure, unit, min: conv(min), max: conv(max), ...(flag ? { [flag]: true as const } : {}) }); };
    if (range) { push(Math.min(n.value, range.value), Math.max(n.value, range.value)); continue; }
    const v = n.value;
    const step = whole ? 1 : 0;
    const head = s.slice(clauseStart(s, n.at), n.at).toLowerCase();
    const m = BEFORE.exec(head);
    const bound = m?.[1] ? KIND.get(m[1]) : undefined;
    const approx = m?.[2] ? KIND.get(m[2]) : m?.[3] ? 'ABOUT' : undefined;
    // A permission: "let a paragraph run to eight sentences", "sentences may go up to forty words" (or "to thirty or more").
    const sentence = s.slice(sentenceStart(s, n.at), n.at);
    if (/\b(?:run|runs|running|go|goes|stretch|stretches|extend|extends|grow|grows|reach|reaches)\s+(?:to|up to)\s+(?:(?:about|around|roughly)\s+)?$/i.test(head)
      || (bound === 'MAX' && m?.[1] === 'up to' && /\b(?:let|lets|may|can|allow|allowed|allows)\b/i.test(sentence))) { push(null, v, 'allows'); continue; }
    const after = s.slice(unitEnd);
    if (s[n.end] === '+' || AFTER_MIN.test(after)) { push(v, null); continue; }
    if (AFTER_MAX.test(after)) { push(null, v); continue; }
    if (bound) {
      const negated = NEGATION.test(head.slice(0, m?.index ?? head.length));
      const k: Comparator = negated ? ({ MAX: 'MIN_STRICT', MAX_STRICT: 'MIN', MIN: 'MAX_STRICT', MIN_STRICT: 'MAX' } as const)[bound as 'MAX' | 'MAX_STRICT' | 'MIN' | 'MIN_STRICT'] : bound;
      if (k === 'MAX') push(null, v);
      else if (k === 'MAX_STRICT') push(null, v - step);
      else if (k === 'MIN') push(v, null);
      else push(v + step, null);
      continue;
    }
    if (approx === 'EXACT') { push(v, v); continue; }
    if (!approx && /\bto\s+$/i.test(head) && /\b(?:keep|keeps|limit|limits|hold|holds|cap|caps|cut|trim|restrict|stick)\b/i.test(head)) { push(null, v); continue; }
    // A size said "about", or plainly: a target, a fifth either side.
    if (NEGATION.test(head)) continue;
    push(Math.round(v * (1 - APPROXIMATELY) * 100) / 100, Math.round(v * (1 + APPROXIMATELY) * 100) / 100, 'about');
  }
  // One measure said twice in one rule ("between 250 and 400 words, and never more than 500"): what both allow.
  const out: Quantity[] = [];
  for (const q of found) {
    if (q.allows) { out.push(q); continue; }
    const k = out.findIndex((x) => !x.allows && x.measure === q.measure && x.unit === q.unit);
    if (k < 0) { out.push(q); continue; }
    const x = out[k];
    const min = x.min === null ? q.min : q.min === null ? x.min : Math.max(x.min, q.min);
    const max = x.max === null ? q.max : q.max === null ? x.max : Math.min(x.max, q.max);
    // A rule at odds with itself is read as its first quantity: nothing here repairs the author's own words.
    if (min !== null && max !== null && min > max) continue;
    out[k] = { measure: x.measure, unit: x.unit, min, max, ...(x.about && q.about ? { about: true as const } : {}) };
  }
  return out;
}

/** The rule's quantity, or null when it states none (the first, when it states several). */
export const quantityOf = (statement: string): Quantity | null => quantitiesOf(statement)[0] ?? null;

/** How far two limits may sit apart and still be one trait: within 30% of the larger, and never less than 2 apart counts. */
export const withinTolerance = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(2, 0.3 * Math.max(Math.abs(a), Math.abs(b)));

/**
 * TWO QUANTITIES ON ONE MEASURE. CONFLICT when no piece can meet both: ranges that do not meet, or a permission well past
 * a ceiling (ranges that touch only at an end of a size said "about" do not meet). Two ceilings, or two floors, never conflict ("at most six sentences" and "at most three" are both met by
 * three): close together they are one trait (SAME), else UNRELATED. Two quantities on different measures are UNRELATED.
 */
export function quantityRelation(a: Quantity, b: Quantity): 'SAME' | 'CONFLICT' | 'UNRELATED' {
  if (a.measure !== b.measure || a.unit !== b.unit) return 'UNRELATED';
  if (a.allows || b.allows) {
    const [al, o] = a.allows ? [a, b] : [b, a];
    if (o.allows || o.max === null || al.max === null) return 'UNRELATED';
    return al.max > o.max && !withinTolerance(o.max, al.max) ? 'CONFLICT' : 'UNRELATED';
  }
  const lo = Math.max(a.min ?? 0, b.min ?? 0); const hi = Math.min(a.max ?? Infinity, b.max ?? Infinity);
  if (lo > hi) return 'CONFLICT';
  // Ranges that touch at one point, an end of a size said "about": that end is not part of it.
  const edge = (q: Quantity): boolean => Boolean(q.about) && (q.min === lo || q.max === lo);
  if (lo === hi && (edge(a) || edge(b))) return 'CONFLICT';
  if (a.min === null && b.min === null && a.max !== null && b.max !== null) return withinTolerance(a.max, b.max) ? 'SAME' : 'UNRELATED';
  if (a.max === null && b.max === null && a.min !== null && b.min !== null) return withinTolerance(a.min, b.min) ? 'SAME' : 'UNRELATED';
  return 'UNRELATED';
}

/** Whether two readings of one rule say the same: the same measures, each bound within a tenth (or both open). */
export function sameReading(a: readonly Quantity[], b: readonly Quantity[]): boolean {
  const close = (x: number | null, y: number | null): boolean => (x === null || y === null ? (x ?? 0) === (y ?? 0) : Math.abs(x - y) <= Math.max(1, 0.1 * Math.max(x, y)));
  const fixed = (qs: readonly Quantity[]): Quantity[] => qs.filter((q) => !q.allows);
  const xa = fixed(a); const xb = fixed(b);
  return xa.length === xb.length && xa.every((x) => xb.some((y) => y.measure === x.measure && y.unit === x.unit && close(x.min, y.min) && close(x.max, y.max)));
}

/** A quantity as a person would say it: "at least 800 words a piece", "8 to 12 words a sentence". */
export function describeQuantity(q: Quantity): string {
  const r = (x: number): string => String(Math.round(x * 10) / 10);
  const per = q.measure === 'piece' ? 'the piece' : `a ${q.measure}`;
  const n = q.min !== null && q.max !== null ? (q.min === q.max ? r(q.min) : `${r(q.min)} to ${r(q.max)}`)
    : q.max !== null ? `${q.allows ? 'may run to' : 'at most'} ${r(q.max)}` : q.min !== null ? `at least ${r(q.min)}` : 'any number of';
  return `${n} ${q.unit} in ${per}`;
}
