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

/**
 * Whether every figure in `sentence` is the person's or computed from theirs. A sentence with no figure is
 * not a derived figure (false): what it claims is for the rest of the check to judge.
 */
export function derivedFromKnown(sentence: string, material: string): boolean {
  const figures = numbersIn(sentence).filter((f) => !/^(?:19|20)\d\d$/.test(f));
  if (!figures.length) return false;
  const known = [...new Set(numbersIn(material).map(Number).filter(Number.isFinite))];
  return figures.every((f) => derivable(f, known));
}
