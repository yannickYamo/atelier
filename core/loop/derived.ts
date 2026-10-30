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

/** Every value two known figures produce by one operation, each with the arithmetic as a person would write it to check. */
function candidates(a: number, b: number): { readonly value: number; readonly how: string }[] {
  const out = [{ value: a + b, how: `${a} + ${b}` }, { value: a - b, how: `${a} − ${b}` }, { value: b - a, how: `${b} − ${a}` }, { value: a * b, how: `${a} × ${b}` }];
  if (b !== 0) out.push({ value: a / b, how: `${a} / ${b}` }, { value: (a / b) * 100, how: `${a} / ${b} × 100` }, { value: ((a - b) / b) * 100, how: `(${a} − ${b}) / ${b} × 100` });
  if (a !== 0) out.push({ value: b / a, how: `${b} / ${a}` }, { value: (b / a) * 100, how: `${b} / ${a} × 100` }, { value: ((b - a) / a) * 100, how: `(${b} − ${a}) / ${a} × 100` });
  return out;
}

/**
 * THE ONE OPERATION THAT TAKES TWO KNOWN FIGURES TO `figure` (as written), as arithmetic to check: "24 / 40 × 100". Null
 * where none does, where the figure is itself known (nothing was computed), and past MAX_KNOWN known figures.
 */
export function derivation(figure: string, known: readonly number[], form?: 'percent' | 'plain'): string | null {
  const n = Number(figure);
  if (!Number.isFinite(n) || known.includes(n) || known.length > MAX_KNOWN) return null;
  // A SHAPE MATCHES THE FORM THE FIGURE IS WRITTEN IN: a share or a change (× 100) reaches a percentage and nothing else;
  // "$20.00" is never "(12 − 15) / 15 × 100". Unknown form (a caller with no sentence): every shape, as before.
  const fits = (how: string): boolean => form === undefined || (how.endsWith('× 100') === (form === 'percent'));
  for (let i = 0; i < known.length; i++) {
    for (let j = i; j < known.length; j++) {
      const hit = candidates(known[i], known[j]).find((c) => fits(c.how) && Number.isFinite(c.value) && Math.abs(atPrecisionOf(Math.abs(c.value), figure) - Math.abs(n)) < 1e-9);
      if (hit) return hit.how;
    }
  }
  return null;
}

/** Whether `figure` (as written) is known, or one operation away from two known figures. */
export function derivable(figure: string, known: readonly number[], form?: 'percent' | 'plain'): boolean {
  const n = Number(figure);
  if (!Number.isFinite(n)) return false;
  return known.includes(n) || derivation(figure, known, form) !== null;
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
  for (const m of text.matchAll(/([$€£]\s?)?(?<!\d)(?<!\d[.,])(\d[\d,]*(?:\.\d+)?)(\s?%|\s?percent\b)?/g)) {
    const raw = m[2].replace(/[.,]$/, ''); const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (!m[1] && !m[3] && /^(?:19|20)\d\d$/.test(raw)) continue;
    out.push({ raw: raw.replace(/,/g, ''), value, percent: Boolean(m[3]), money: Boolean(m[1]) });
  }
  return out;
}

const SPELLED: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, fifty: 50, hundred: 100 };

/** One priced offer as one line of the material states it: a fixed amount and a rate per unit, either of which may be absent. */
interface Offer { readonly line: number; readonly fixed: number; readonly rate: number; readonly percent: boolean;
  /** every amount in it is written as money, or as a percentage: a price, not a count of customers */
  readonly priced: boolean }

/**
 * EACH AMOUNT OF A LINE IN ONE ROLE. Read in every role, "$49 per month plus $8 per user" gave a team of 12 a price
 * of $596 (49 x 12 + 8) and of $108, and one line's fee was set against another's rate. A percentage is a rate, and
 * beside one every amount of money is fixed. Of two amounts with no percentage the larger is fixed and the smaller
 * the rate. One amount alone may be either: "$1,200 per month" and "$0.40 per box" are written the same way.
 */
function offersOf(material: string): Offer[] {
  const out: Offer[] = [];
  material.split('\n').forEach((text, line) => {
    const figures = read(text);
    const percents = figures.filter((f) => f.percent); const amounts = figures.filter((f) => !f.percent);
    const priced = amounts.every((f) => f.money);
    if (!figures.length || percents.length > 1 || amounts.length > 2) return;
    if (percents.length === 1 && amounts.length <= 1) {
      out.push({ line, fixed: amounts[0]?.value ?? 0, rate: percents[0].value / 100, percent: true, priced });
    } else if (!percents.length && amounts.length === 2) {
      const [big, small] = [...amounts].sort((a, b) => b.value - a.value);
      out.push({ line, fixed: big.value, rate: small.value, percent: false, priced });
    } else if (!percents.length && amounts.length === 1) {
      out.push({ line, fixed: 0, rate: amounts[0].value, percent: false, priced });
      out.push({ line, fixed: amounts[0].value, rate: 0, percent: false, priced });
    }
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
function shapes(sentence: string, material: string): { alone: (f: Read) => boolean; from: (f: Read, n: Scenario) => boolean; scenarios: Scenario[]; figures: Read[] } {
  const figures = read(sentence);
  const close = (v: number, f: Read): boolean => Number.isFinite(v) && Math.abs(atPrecisionOf(Math.abs(v), f.raw) - f.value) < 1e-9;
  // PRICES ONLY. Every amount of an offer is written as money or as a percentage. Read from any figure, a head count
  // was a "rate": 640 employees x 12 sourced "7,680 people a year", and two invented numbers vouched for each other.
  const offers = offersOf(material).filter((o) => o.priced);
  const yearly = /\b(?:(?:a|per|each|every)\s+year|annual(?:ly)?|yearly)\b/i.test(sentence);
  const periods = yearly ? [1, 12] : [1];
  const across = offers.flatMap((a) => offers.filter((b) => b.line !== a.line).map((b) => [a, b] as const));
  const breakEvens = across.filter(([a, b]) => a.percent === b.percent && a.rate !== b.rate && (a.rate !== 0 || b.rate !== 0))
    .map(([a, b]) => ({ at: (a.fixed - b.fixed) / (b.rate - a.rate), money: a.percent })).filter((v) => v.at > 0);
  const spelled = [...sentence.toLowerCase().matchAll(/\b[a-z]+\b/g)].map((m) => SPELLED[m[0]]).filter((v): v is number => v !== undefined);
  const scenarios: Scenario[] = [...figures.filter((f) => !f.percent).map((f) => ({ n: f.value, money: f.money })), ...spelled.map((n) => ({ n, money: false }))]
    .filter((x, i, all) => all.findIndex((y) => y.n === x.n) === i);
  return { figures, scenarios,
    // A year of a price, or a break-even: no scenario needed. A break-even is a count of units, or an amount where
    // the rates are percentages of one; never a percentage.
    alone: (f) => !f.percent && ((yearly && f.money && offers.some((o) => o.rate === 0 && close(o.fixed * 12, f))) || breakEvens.some((v) => (v.money || !f.money) && close(v.at, f))),
    // A total or a gap at the scenario's n: an amount of money, written as one. A percentage rate is of an amount.
    from: (f, sc) => {
      if (!f.money || f.percent) return false;
      const totals = offers.filter((o) => o.rate !== 0 && (!o.percent || sc.money)).map((o) => ({ line: o.line, at: o.fixed + o.rate * sc.n }));
      const flat = offers.filter((o) => o.rate === 0).map((o) => ({ line: o.line, at: o.fixed }));
      const values = [...totals.map((t) => t.at), ...totals.flatMap((a) => [...totals, ...flat].filter((b) => b.line !== a.line).flatMap((b) => [a.at - b.at, b.at - a.at]))];
      return periods.some((p) => values.some((v) => close(v * p, f)));
    } };
}
interface Scenario { readonly n: number; readonly money: boolean }

/** Whether each of `open` (figures of the sentence that nothing else explains, by value) is worked from the material. */
function worked(sentence: string, material: string, open: readonly number[]): boolean {
  const sh = shapes(sentence, material);
  // A figure this reading does not see as written (spelled out, or with a scale word) is explained only as the
  // scenario itself: "a shop of three". Two of them, or one that is no scenario, and nothing here explains it.
  const unseen = [...new Set(open.filter((v) => !sh.figures.some((f) => f.value === v)))];
  if (unseen.length > 1 || (unseen.length === 1 && !sh.scenarios.some((sc) => sc.n === unseen[0]))) return false;
  const rest = sh.figures.filter((f) => open.includes(f.value) && !sh.alone(f));
  if (!rest.length) return unseen.length === 0;
  return sh.scenarios.filter((sc) => !unseen.length || sc.n === unseen[0]).some((sc) => {
    const left = rest.filter((f) => f.value !== sc.n);
    return left.length > 0 && left.length >= rest.length - 1 && left.every((f) => sh.from(f, sc));
  });
}

/** A year, and only a year: four digits from 1900 to 2099 with no currency sign, no thousands comma, no percent. */
const YEAR = /(?<![$€£\d,.])(?<![$€£]\s)\b(?:19|20)\d\d\b(?![,.]\d|\s?%|\s?percent\b)/g;

/**
 * Whether every figure in `sentence` is the person's or computed from theirs. A sentence with no figure is
 * not a derived figure (false): what it claims is for the rest of the check to judge.
 */
export function derivedFromKnown(sentence: string, material: string): boolean {
  const text = sentence.replace(YEAR, ' ');
  const figures = numbersIn(text);
  if (!figures.length) return false;
  const prose = proseOf(material);
  const { anywhere, known, open } = settle(text, material);
  if (!open.length) return true;
  return known.length <= MAX_WORKED && worked(text, prose, open.map(Number).filter((n) => !anywhere.has(n)));
}

/**
 * The figures a sentence may be worked from, and the figures of it that are not: the material's prose, the number it
 * spells itself ("twelve months" is an operand as "12" would be), and each figure of the sentence once it is settled
 * ("$60 cheaper, or $720 across twelve months": 720 is 60 × 12 once 60 is 360 − 300). A FIGURE IN CODE IS THERE AS
 * WRITTEN, NEVER AS AN OPERAND. A diff is full of incidental numbers (hunk ranges, line numbers, constants); arithmetic
 * over them reached "2.3M rows" and "3 of 12 tests fail", and an invented finding went out as derived from the change
 * under review. A figure the code holds counts when it is the figure; only the prose of the material is worked from.
 */
function settle(text: string, material: string): { anywhere: Set<number>; known: number[]; open: string[] } {
  const figures = numbersIn(text);
  const anywhere = new Set(numbersIn(material).map(Number).filter(Number.isFinite));
  let known = [...new Set(numbersIn(proseOf(material)).map(Number).filter(Number.isFinite))];
  const form = (f: string): 'percent' | 'plain' => (asWritten(text, f).endsWith('%') ? 'percent' : 'plain');
  // A YEAR OF A MONTHLY AMOUNT: a money figure, in a sentence that says so ("across twelve months", "a year"), is reached
  // from a known amount × 12. Money only: a head count times twelve sourced a number of people in the first version.
  const yearly = /\b(?:twelve|12)\s+months\b|\b(?:a|per)\s+year\b|\bannual(?:ly)?\b|\byearly\b/i.test(text);
  const money = (f: string): boolean => new RegExp(`[$€£]\\s?${f.replace(/\./g, '\\.')}(?![\\d.])`).test(text.replace(/,/g, ''));
  const settles = (f: string, pool: readonly number[]): boolean => derivable(f, pool, form(f))
    || (yearly && money(f) && pool.some((k) => Math.abs(atPrecisionOf(k * 12, f) - Number(f)) < 1e-9));
  let open = figures.filter((f) => !anywhere.has(Number(f)) && !settles(f, known));
  // A FIGURE OF THE SENTENCE REACHED FROM THE PERSON'S JOINS THE KNOWN for the rest of it ("$60 cheaper, or $720 across
  // twelve months"); one still open vouches for nothing, so two invented figures never carry each other.
  for (;;) {
    const settled = figures.map(Number).filter((n) => Number.isFinite(n) && !known.includes(n) && !open.some((o) => Number(o) === n));
    if (!settled.length) break;
    known = [...known, ...settled];
    const next = open.filter((f) => !settles(f, known));
    if (next.length === open.length) break;
    open = next;
  }
  return { anywhere, known, open };
}

/** How the figure is written in the sentence: with its percent sign where it has one (a form check). */
const asWritten = (text: string, figure: string): string => (new RegExp(`(?<![\\d.])${figure.replace(/\./g, '\\.')}\\s?(?:%|percent\\b)`).test(text) ? `${figure}%` : figure);

/**
 * EVERY FIGURE OF THE SENTENCE THAT WAS COMPUTED FROM THE MATERIAL, WITH ITS ARITHMETIC, as one line to check:
 * "60%: 24 / 40 × 100 from the material; 64: 40 + 24 from the material". A figure the material holds as written is not
 * listed (nothing was computed); one worked from the material's prices (`worked`) is said so. Null where the sentence is
 * not derived (`derivedFromKnown` is false), or where nothing in it was computed. The header's promise, kept: a derived
 * figure is listed with its arithmetic, never passed in silence, and a wrong figure that happens to equal some ratio of
 * the material's figures is on the same list for the person to check.
 */
export function derivedArithmetic(sentence: string, material: string): string | null {
  if (!derivedFromKnown(sentence, material)) return null;
  const text = sentence.replace(YEAR, ' ');
  const { anywhere, known } = settle(text, material);
  const lines: string[] = [];
  for (const f of [...new Set(numbersIn(text))]) {
    if (anywhere.has(Number(f))) continue;
    const pool = known.filter((k) => k !== Number(f));
    const how = derivation(f, pool, asWritten(text, f).endsWith('%') ? 'percent' : 'plain')
      ?? (pool.some((k) => Math.abs(atPrecisionOf(k * 12, f) - Number(f)) < 1e-9) ? `${pool.find((k) => Math.abs(atPrecisionOf(k * 12, f) - Number(f)) < 1e-9)} × 12` : null);
    lines.push(`${asWritten(text, f)}: ${how ? `${how} from the material` : 'worked from the material\'s prices (a total, a gap, a year of it or a break-even)'}`);
  }
  return lines.length ? lines.join('; ') : null;
}

/**
 * The material less its code: fenced blocks, and diffs (headers, and each hunk's lines as its header counts them).
 * Counted, so prose written after a diff is prose again, a "- " list item included.
 */
export function proseOf(material: string): string {
  const out: string[] = []; let fenced = false; let header = false; let oldLeft = 0; let newLeft = 0;
  for (const line of material.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (hunk) { oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]); newLeft = hunk[2] === undefined ? 1 : Number(hunk[2]); header = false; continue; }
    if (/^(diff --git |index [0-9a-f]|--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(line)) { header = true; continue; }
    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith('+')) { newLeft -= 1; continue; }
      if (line.startsWith('-')) { oldLeft -= 1; continue; }
      if (line.startsWith(' ') || line === '') { oldLeft -= 1; newLeft -= 1; continue; }
      if (line.startsWith('\\')) continue;
      oldLeft = 0; newLeft = 0;
    }
    if (header && /^(old|new) mode /.test(line)) continue;
    header = false; out.push(line);
  }
  return out.join('\n');
}

/**
 * ONE FIGURE, WORKED FROM THE MATERIAL, for a check that reads units and one step of arithmetic more strictly than
 * the claim check does (the method's "every figure from the sources", ../observers/obligations.ts) and asks only
 * about a figure it could not find. True when `value` is a year of a price or a break-even; a total or a gap at a
 * scenario the sentence states; or that scenario itself, when an amount in the sentence follows from it.
 */
export function workedFromMaterial(sentence: string, value: number, material: string): boolean {
  const known = [...new Set(numbersIn(material).map(Number).filter(Number.isFinite))];
  if (known.length > MAX_WORKED) return false;
  const sh = shapes(sentence, material);
  const f = sh.figures.find((x) => x.value === value);
  if (!f) return false;
  if (sh.alone(f) || sh.scenarios.some((sc) => sc.n !== value && sh.from(f, sc))) return true;
  const me = sh.scenarios.find((sc) => sc.n === value);
  return me !== undefined && sh.figures.some((g) => g.value !== value && !known.includes(g.value) && sh.from(g, me));
}
