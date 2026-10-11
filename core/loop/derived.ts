// atelier/core/loop/derived.ts — A FIGURE COMPUTED FROM THE PERSON'S OWN FIGURES IS THEIRS.
//
// The claim check asks whether each figure traces to what the person supplied. A total, a ratio or a
// growth rate never appears in the material verbatim: it is computed from figures that do. Read as
// untraced, "17 times 6 is 102" was cut from a correct answer, and every total and growth rate in a
// finance report was exposed to the same cut. So a sentence whose figures all either appear in the
// material or follow from two that do (sum, difference, product, ratio, percent change or share),
// compared at the figure's own precision, is not an invention; it is listed with its arithmetic to check.
//
// Bounded on purpose. Past MAX_KNOWN figures in the material, almost any number is some pair's sum or
// ratio, and the check would pass inventions; there it declines and the figure is judged as before.

import { numbersIn } from './claim-extract.js';

/** The most figures in the material for which derivation is still a meaningful test. */
export const MAX_KNOWN = 60;

/** `x` rounded to the precision `shown` is written with. */
const atPrecisionOf = (x: number, shown: string): number => {
  const decimals = shown.includes('.') ? shown.split('.')[1].length : 0;
  return Number(x.toFixed(decimals));
};

/** Every value two known figures produce by one operation. */
function candidates(a: number, b: number): number[] {
  const out = [a + b, a - b, b - a, a * b];
  if (b !== 0) out.push(a / b, (a / b) * 100, ((a - b) / b) * 100);
  if (a !== 0) out.push(b / a, (b / a) * 100, ((b - a) / a) * 100);
  return out;
}

/** Whether `figure` (as written) is known, or one operation away from two known figures. */
export function derivable(figure: string, known: readonly number[]): boolean {
  const n = Number(figure);
  if (!Number.isFinite(n)) return false;
  if (known.includes(n)) return true;
  if (known.length > MAX_KNOWN) return false;
  for (let i = 0; i < known.length; i++) {
    for (let j = i; j < known.length; j++) {
      if (candidates(known[i], known[j]).some((c) => Number.isFinite(c) && Math.abs(atPrecisionOf(Math.abs(c), figure) - Math.abs(n)) < 1e-9)) return true;
    }
  }
  return false;
}

/** Past this many figures in the material the worked shapes below reach almost any number, and are not tried. */
export const MAX_WORKED = 20;

interface Read { readonly raw: string; readonly value: number; readonly percent: boolean; readonly money: boolean }

/**
 * The numbers of a text as written. A year is left out, and only a year: four digits from 1900 to 2099 with no
 * currency sign, no thousands comma and no percent. Dropping every such number let "$2,050 a month" through as a
 * date, and hid "2,000 boxes" from the arithmetic that produces it.
 */
function read(text: string): Read[] {
  const out: Read[] = [];
  for (const m of text.matchAll(/([$€£]\s?)?(?<![\d.])(\d[\d,]*(?:\.\d+)?)(\s?%|\s?percent\b)?/g)) {
    const raw = m[2].replace(/[.,]$/, ''); const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (!m[1] && !m[3] && /^(?:19|20)\d\d$/.test(raw)) continue;
    out.push({ raw: raw.replace(/,/g, ''), value, percent: Boolean(m[3]), money: Boolean(m[1]) });
  }
  return out;
}

const SPELLED: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, fifty: 50, hundred: 100 };

/** One priced offer as one line of the material states it: a fixed amount and a rate per unit, either of which may be absent. */
interface Offer { readonly line: number; readonly fixed: number; readonly rate: number; readonly percent: boolean;
  /** every amount in it is written as money, or as a percentage: a price, not a count of customers */
  readonly priced: boolean }

function offersOf(material: string): Offer[] {
  const out: Offer[] = [];
  material.split('\n').forEach((text, line) => {
    const figures = read(text);
    if (!figures.length || figures.length > 4) return;
    for (const r of figures) {
      const rate = r.percent ? r.value / 100 : r.value;
      const priced = r.money || r.percent;
      out.push({ line, fixed: 0, rate, percent: r.percent, priced });
      for (const f of figures) if (f !== r && !f.percent) out.push({ line, fixed: f.value, rate, percent: r.percent, priced: priced && f.money });
    }
    for (const f of figures) if (!f.percent) out.push({ line, fixed: f.value, rate: 0, percent: false, priced: f.money });
  });
  return out;
}

/**
 * WORKED FROM THE MATERIAL: A FEW FIXED CALCULATIONS, NEVER A SEARCH. An analysis prices a scenario: "a cafe on
 * $25,000 a month pays us $674" is 49 + 2.5% of 25,000, three steps from the price list, and one operation on two
 * figures recognised none of six such sentences in real runs. A free two-step search recognises them and seven of
 * twelve invented figures with them. So the shapes are fixed, and an offer's amounts come from ONE line of the
 * material, never mixed across lines (each of the three invented figures a looser version passed mixed them):
 *
 *   a total      fixed + rate x n, for one offer, at the scenario's n          49 + 2.5% x 25,000
 *   a gap        the difference of two offers' totals at the same n            (250 - 35) x 10
 *   a year of it any of the above, or a figure of the material, x 12, where the sentence says a year
 *   a break-even (fixed1 - fixed2) / (rate2 - rate1), two offers, rates of one kind   600 / (0.40 - 0.10)
 *                A count of units, so never an amount of money, unless the rates are percentages of one.
 *
 * The scenario's n is ONE number the sentence itself states (in digits or spelled: "a shop of three"), and at
 * least one other figure of the sentence must follow from it. True when every figure of the sentence is in the
 * material, one operation from it, or worked this way.
 */
function shapes(sentence: string, material: string, known: readonly number[]): { alone: (f: Read) => boolean; from: (f: Read, n: number) => boolean; scenarios: number[]; figures: Read[] } {
  const figures = read(sentence);
  const close = (v: number, f: Read): boolean => Number.isFinite(v) && Math.abs(atPrecisionOf(Math.abs(v), f.raw) - f.value) < 1e-9;
  const offers = offersOf(material);
  const periods = /\b(?:(?:a|per|each|every)\s+year|annual(?:ly)?|yearly)\b/i.test(sentence) ? [1, 12] : [1];
  const across = offers.flatMap((a) => offers.filter((b) => b.line !== a.line).map((b) => [a, b] as const));
  // Between two PRICES. On a fact sheet, a head count against a customer count "breaks even" at any number.
  const breakEvens = across.filter(([a, b]) => a.priced && b.priced && a.percent === b.percent && a.rate !== b.rate && (a.rate !== 0 || b.rate !== 0))
    .map(([a, b]) => ({ at: (a.fixed - b.fixed) / (b.rate - a.rate), money: a.percent })).filter((v) => v.at > 0);
  const spelled = [...sentence.toLowerCase().matchAll(/\b[a-z]+\b/g)].map((m) => SPELLED[m[0]]).filter((v): v is number => v !== undefined);
  return { figures, scenarios: [...new Set([...figures.map((f) => f.value), ...spelled])],
    // a year of a given figure, or a break-even: no scenario needed
    alone: (f) => (periods.length > 1 && known.some((m) => close(m * 12, f))) || (!f.percent && breakEvens.some((v) => (v.money || !f.money) && close(v.at, f))),
    // a total or a gap at the scenario's n
    from: (f, n) => {
      const totals = offers.filter((o) => o.rate !== 0).map((o) => ({ line: o.line, at: o.fixed + o.rate * n }));
      const flat = offers.filter((o) => o.rate === 0).map((o) => ({ line: o.line, at: o.fixed }));
      const values = [...totals.map((t) => t.at), ...totals.flatMap((a) => [...totals, ...flat].filter((b) => b.line !== a.line).flatMap((b) => [a.at - b.at, b.at - a.at]))];
      return periods.some((p) => values.some((v) => close(v * p, f)));
    } };
}

function worked(sentence: string, material: string, known: readonly number[]): boolean {
  const sh = shapes(sentence, material, known);
  const open = sh.figures.filter((f) => !derivable(f.raw, known) && !sh.alone(f));
  if (!open.length) return sh.figures.length > 0;
  return sh.scenarios.some((n) => {
    const rest = open.filter((f) => f.value !== n);
    return rest.length > 0 && rest.length >= open.length - 1 && rest.every((f) => sh.from(f, n));
  });
}

/**
 * Whether every figure in `sentence` is the person's or computed from theirs. A sentence with no figure is
 * not a derived figure (false): what it claims is for the rest of the check to judge.
 */
export function derivedFromKnown(sentence: string, material: string): boolean {
  const figures = read(sentence);
  if (!figures.length) return false;
  const known = [...new Set(numbersIn(material).map(Number).filter(Number.isFinite))];
  if (figures.every((f) => derivable(f.raw, known))) return true;
  return known.length <= MAX_WORKED && worked(sentence, material, known);
}

/**
 * ONE FIGURE, WORKED FROM THE MATERIAL, for a check that reads units and one step of arithmetic more strictly than
 * the claim check does (the method's "every figure from the sources", ../observers/obligations.ts) and asks only
 * about a figure it could not find. True when `value` is a year of a given figure or a break-even; a total or a gap
 * at a scenario the sentence states; or that scenario itself, when another figure of the sentence follows from it.
 */
export function workedFromMaterial(sentence: string, value: number, material: string): boolean {
  const known = [...new Set(numbersIn(material).map(Number).filter(Number.isFinite))];
  if (known.length > MAX_WORKED) return false;
  const sh = shapes(sentence, material, known);
  const f = sh.figures.find((x) => x.value === value);
  if (!f) return false;
  if (sh.alone(f) || sh.scenarios.some((n) => n !== value && sh.from(f, n))) return true;
  return sh.figures.some((g) => g.value !== value && !known.includes(g.value) && sh.from(g, value));
}
