// core/observers/obligations.ts — WHAT A PIECE OF WORK MUST CONTAIN, AND WHAT IT MUST HAVE BEEN MADE FROM.
//
// A method says what is done: which table is always there, that every figure comes from a source. Two of those can be
// read by code, and are here. Neither reads how the text sounds.
//
//   TABLE   a table with these columns is in the output                      read on the OUTPUT alone
//   CITED   every figure in the output is in the request or the material     read against the BOUND MATERIAL
//
// What a check reads decides what it can honestly say. A check on the output says the deliverable has the thing.
// A check against the material says the work was made from what was given. Neither says a step was carried out in
// the writer's head ("weigh switching cost before recommending"): that is judgement, and no observer here claims it.

import type { Measurement } from '../state/canonical-state.js';
import type { Observer, ObserverResult, Span, CheckContext } from './registry.js';

const list = (p: Measurement['params'], k: string): readonly string[] => { const v = p[k]; return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : []; };
const num = (p: Measurement['params'], k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const norm = (s: string): string => s.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

export interface MarkdownTable { readonly header: readonly string[]; readonly rows: number; readonly start: number; readonly end: number }

/** Every pipe table in a text, outside code fences: its header cells, how many body rows, and where it is. */
export function tablesOf(text: string): MarkdownTable[] {
  const out: MarkdownTable[] = []; const lines = text.split('\n');
  let offset = 0; const starts = lines.map((l) => { const s = offset; offset += l.length + 1; return s; });
  let fence = false;
  const cells = (l: string): string[] => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => norm(c));
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence || !lines[i].includes('|') || i + 1 >= lines.length) continue;
    // A header row is a row of cells directly above a row of dashes.
    if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1]) || !lines[i + 1].includes('|')) continue;
    let j = i + 2; while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') j++;
    // A row says something when a cell holds a letter or a digit: a row of dashes is a template nobody filled in.
    const rows = lines.slice(i + 2, j).filter((l) => cells(l).some((c) => /[\p{L}\p{N}]/u.test(c))).length;
    out.push({ header: cells(lines[i]), rows, start: starts[i], end: starts[j - 1] + lines[j - 1].length });
    i = j - 1;
  }
  return out;
}

/** A table whose header holds every one of these columns (a header cell that contains the name counts), with at least `minRows` rows. */
export const TABLE: Observer = {
  id: 'TABLE',
  describe: (p) => `a table with the column${list(p, 'columns').length === 1 ? '' : 's'} ${list(p, 'columns').map((c) => `"${c}"`).join(', ')}${num(p, 'minRows') ? `, at least ${num(p, 'minRows')} row(s)` : ''}`,
  validate: (p) => (list(p, 'columns').length ? null : 'needs columns=<name>|<name>'),
  observe(text, p): ObserverResult {
    const want = list(p, 'columns').map(norm); const minRows = num(p, 'minRows') ?? 1;
    const tables = tablesOf(text);
    // A column is there when a header cell holds every word of its name: "price" is met by "price per seat", and
    // "id" is not met by "provider".
    const words = (x: string): string[] => x.split(/[^a-z0-9%]+/).filter(Boolean);
    const has = (t: MarkdownTable): string[] => want.filter((w) => !t.header.some((h) => { const cell = new Set(words(h)); return words(w).length > 0 && words(w).every((x) => cell.has(x)); }));
    const hit = tables.find((t) => has(t).length === 0 && t.rows >= minRows);
    if (hit) return { verdict: 'MET', spans: [], value: hit.rows, detail: `a table with ${want.length} of ${want.length} column(s), ${hit.rows} row(s)` };
    // The nearest table says what is missing; with none, the last line of the text is where one would go.
    const nearest = [...tables].sort((a, b) => has(a).length - has(b).length)[0];
    const why = !nearest ? `no table; one with the column(s) ${want.map((w) => `"${w}"`).join(', ')} is required`
      : has(nearest).length ? `the table lacks the column(s) ${has(nearest).map((w) => `"${w}"`).join(', ')}` : `the table has ${nearest.rows} row(s), and ${minRows} are required`;
    const span: Span = nearest ? { start: nearest.start, end: nearest.end, text: text.slice(nearest.start, Math.min(nearest.end, nearest.start + 120)), why }
      : { start: Math.max(0, text.length - 1), end: text.length, text: '', why };
    return { verdict: 'VIOLATED', spans: [span], value: 0, detail: why };
  },
};

// ── WHAT COUNTS AS A FIGURE, AND WHEN TWO ARE THE SAME ─────────────────────────────────────────────
//
// A figure is a quantity the work states: a number with a unit or a scale, or of two digits or more. A year, a
// date, a time, a page or version or standard number, a footnote mark and a numbered heading are numbers and are
// not figures: read as figures, each made an honest piece fail. Two figures are the same when they are the same
// quantity, however written: "$12,400", "12.4k" and "12400"; "12%" and "12.0 percent"; "twelve" and "12". A percentage
// is never the same as a bare count ("15%" is not "15 employees").

const WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const SCALE: Readonly<Record<string, number>> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
const FIGURE = /(?<![\w.,:/-])(?:[$€£]\s?)?\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s?(?:%|percent\b|bps\b|(?:k|m|mn|b|bn)\b|thousand\b|million\b|billion\b|x\b|times\b))?(?![\d:/]|(?:st|nd|rd|th)\b)/gi;
const WORD_FIGURE = new RegExp(String.raw`\b(${Object.keys(WORDS).join('|')})\b(?=\s+(?:percent|dollars?|euros?|seats?|customers?|users?|employees?|people|months?|years?|days?|weeks?|deals?|accounts?|points?|times)\b)`, 'gi');
/** Two numbers with a slash between them are one reading: a blood pressure, a score out of a total. */
const PAIR = /(?<![\w.,:/-])\d{1,4}\/\d{1,4}(?![\w/])/g;
/** What comes before a number that makes it a label, not a quantity. */
const LABEL_BEFORE = /(?:\b(?:page|pages|p\.|pp\.|section|chapter|step|figure|fig\.|table|version|v|iso|rfc|q[1-4]|fy|part|appendix|item|no\.|number|line|lines|clause|article|schedule|exhibit|bed|room|ward|row|column|issue|ticket|commit|stage|phase|grade|#)\s*|\[)$/i;
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
/** A number beside the name of a month is a day of it: a date, not a quantity. */
const DATE_BEFORE = new RegExp(String.raw`\b${MONTH}\.?\s+$`, 'i'); const DATE_AFTER = new RegExp(String.raw`^\s+(?:of\s+)?${MONTH}\b`, 'i');
/**
 * Units of measure. A number that carries one is that much of that thing: "40 mg" is not met by a bare 40 somewhere
 * else in the material, nor by "four times daily". And a single digit that carries one is a figure ("4 g").
 */
const MEASURE = /^\s?(mcg|µg|mg|kg|g|ml|dl|l|mmol|mol|iu|mmhg|bpm|cm|mm|km|kb|mb|gb|ms)\b/i;
/** A small word after a number that is not what the number counts. */
const NOT_A_UNIT = new Set(['of', 'and', 'or', 'to', 'in', 'on', 'at', 'the', 'a', 'an', 'for', 'from', 'by', 'with', 'is', 'are', 'was', 'were', 'per', 'out', 'more', 'less', 'than', 'that', 'which', 'who', 'as', 'but', 'so', 'if', 'it', 'this']);

interface Figure { readonly key: string; readonly raw: string; readonly start: number; readonly end: number; readonly value: number; readonly percent: boolean;
  /** what the number counts, as written after it ("seat", "mg", "$"), or null: two figures are added or subtracted only when this is the same */
  readonly unit: string | null }

function figureAt(raw: string, start: number, end: number, after: string): Figure | null {
  const t = raw.toLowerCase().replace(/[$€£,\s]/g, '');
  const m = /^(\d+(?:\.\d+)?)(%|percent|bps|k|mn|m|bn|b|thousand|million|billion|x|times)?$/.exec(t);
  if (!m) return null;
  const value = Number(m[1]) * (SCALE[m[2] ?? ''] ?? 1); const percent = m[2] === '%' || m[2] === 'percent'; const multiple = m[2] === 'x' || m[2] === 'times';
  const measure = MEASURE.exec(after)?.[1].toLowerCase() ?? null;
  const word = /^\s?(\p{L}+)/u.exec(after)?.[1].toLowerCase() ?? null;
  const unit = /[$€£]/.exec(raw)?.[0] ?? measure ?? (word && !NOT_A_UNIT.has(word) ? word.replace(/s$/, '') : null);
  const tail = percent ? '%' : multiple ? 'x' : m[2] === 'bps' ? 'bps' : measure ? `|${measure}` : '';
  const shown = measure ? `${raw}${/^\s/.test(after) ? ' ' : ''}${MEASURE.exec(after)?.[1] ?? ''}` : raw;
  return { key: `${Math.round(value * 1e6) / 1e6}${tail}`, raw: shown, start, end: start + shown.length > end ? start + shown.length : end, value, percent, unit };
}

/**
 * The figures a text states, each as the quantity it is. `given` reads what the writer was handed, where a single
 * digit counts too: "8 seats" in the material is a quantity a draft may add to another.
 */
export function figuresOf(text: string, given = false): Figure[] {
  const out: Figure[] = [];
  // Not inside code; not a list marker, a numbered heading or a heading at all.
  const prose = text.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length)).replace(/^\s*#{1,6}\s.*$/gm, (m) => ' '.repeat(m.length)).replace(/^\s*\d+[.)]\s/gm, (m) => ' '.repeat(m.length));
  for (const m of prose.matchAll(PAIR)) out.push({ key: `pair:${m[0]}`, raw: m[0], start: m.index, end: m.index + m[0].length, value: NaN, percent: false, unit: null });
  for (const m of prose.matchAll(FIGURE)) {
    const raw = m[0].trim(); const start = m.index + (m[0].length - m[0].trimStart().length); const end = m.index + m[0].length;
    const after = prose.slice(end, end + 16);
    const f = figureAt(raw, start, end, after);
    if (!f) continue;
    const unit = /[%$€£]|percent|bps|[kmbx]$|thousand|million|billion|times/i.test(raw) || MEASURE.test(after);
    const digits = raw.replace(/\D/g, '').length;
    if (!unit && digits < 2 && !(given && f.unit !== null)) continue;
    const before = prose.slice(Math.max(0, start - 14), start);
    if (LABEL_BEFORE.test(before) || DATE_BEFORE.test(before) || DATE_AFTER.test(after)) continue;
    // A year stands alone and is not a quantity.
    if (!unit && /^(?:19|20)\d\d$/.test(raw)) continue;
    out.push(f);
  }
  for (const m of prose.matchAll(WORD_FIGURE)) {
    const value = WORDS[m[1].toLowerCase()]; const rest = prose.slice(m.index + m[0].length); const percent = /^\s+percent/i.test(rest);
    const word = /^\s+(\p{L}+)/u.exec(rest)?.[1].toLowerCase() ?? null;
    out.push({ key: `${value}${percent ? '%' : ''}`, raw: m[0], start: m.index, end: m.index + m[0].length, value, percent, unit: word ? word.replace(/s$/, '') : null });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The other ways a given figure may honestly be written: a multiple as a percentage, and the reverse. */
function alsoGiven(f: Figure): string[] {
  if (f.key.endsWith('x')) return [`${Math.round(f.value * 100 * 1e6) / 1e6}%`];
  if (f.percent) return [`${Math.round((f.value / 100) * 1e6) / 1e6}x`];
  return [];
}

/**
 * Whether a stated figure follows from what was given, by one step of arithmetic on two given figures. A share of
 * one count in another, to the nearest point ("half the deals" from "10 of 20"). Or the sum or the difference of two
 * amounts OF THE SAME THING, exactly: 12 seats and 8 seats are 20 seats, and 12 seats and 8 dollars are nothing. Read without the unit, any two numbers in
 * the material made a third "sourced": a dose of 80 mg passed because a chart held an age of 64 and a rate of 16.
 */
function derived(f: Figure, given: readonly Figure[]): boolean {
  const counts = given.filter((g) => !g.percent && Number.isFinite(g.value)).slice(0, 80);
  if (!Number.isFinite(f.value)) return false;
  for (const a of counts) for (const b of counts) {
    if (a === b || a.value === b.value) continue;
    if (f.percent) { if (b.value !== 0 && Math.abs(f.value - (a.value / b.value) * 100) <= 0.5) return true; continue; }
    // Of the same thing: no two of the three name different things, and an amount in a unit of measure (mg, ml) is
    // only ever made from two amounts in that unit.
    const things = [a.unit, b.unit, f.unit].filter((u): u is string => u !== null);
    if (new Set(things).size > 1 || (f.key.includes('|') && (a.unit !== f.unit || b.unit !== f.unit))) continue;
    const same = (x: number): boolean => Math.abs(f.value - x) <= Math.abs(x) * 1e-9;
    if (same(a.value + b.value) || same(Math.abs(a.value - b.value))) return true;
  }
  return false;
}

/**
 * EVERY FIGURE IS ONE THE WRITER WAS GIVEN. A figure in the output must be in the request or in the bound material,
 * as the same quantity, or follow from two given figures by one step of arithmetic. `allow` figures may be the
 * writer's own (a count of the points it makes). With no material bound the rule still runs, against the request
 * alone: a figure nobody gave was not given, and read as "not applicable" the rule passed every invented number in
 * exactly the runs that had nothing to check them against.
 */
export const CITED: Observer = {
  id: 'CITED',
  describe: (p) => `every figure is in the request or the material${num(p, 'allow') ? ` (up to ${num(p, 'allow')} of the writer's own)` : ''}`,
  validate: (p) => (num(p, 'allow') === null || (num(p, 'allow') ?? 0) >= 0 ? null : 'allow is a count, zero or more'),
  observe(text, p, context?: CheckContext): ObserverResult {
    const material = context?.material ?? [];
    const givenFigures = [context?.request ?? '', ...material.map((m) => m.text)].flatMap((t) => figuresOf(t, true));
    const given = new Set(givenFigures.flatMap((f) => [f.key, ...alsoGiven(f)]));
    const stated = figuresOf(text);
    // The same quantity, or one that follows from two that were given. A percentage is never met by a bare count.
    const missing = stated.filter((f) => !given.has(f.key) && !derived(f, givenFigures));
    const allow = num(p, 'allow') ?? 0;
    const where = material.length ? `the request or the material (${material.map((m) => m.name).join(', ')})` : 'the request (no material was bound)';
    const detail = `${stated.length - missing.length} of ${stated.length} figure(s) are in ${where}`;
    if (missing.length <= allow) return { verdict: 'MET', spans: [], value: missing.length, detail };
    return { verdict: 'VIOLATED', value: missing.length, detail,
      spans: missing.map((f) => ({ start: f.start, end: f.end, text: f.raw, why: `the figure ${f.raw} is in neither the request nor the material` })) };
  },
};

/** What each check reads: the output alone, or the output against what it was made from. */
export type ObligationTarget = 'OUTPUT' | 'BOUND_MATERIAL';
export const targetOf = (observer: string): ObligationTarget => (observer === 'CITED' ? 'BOUND_MATERIAL' : 'OUTPUT');
