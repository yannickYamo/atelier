// atelier/core/eval/false-flags.ts — A QUALIFICATION FIGURE CARRIES ITS BOUND, NOT ONLY ITS COUNT.
//
// "Left 39 of 48 clean texts alone" reads as 19% false flags. On 48 texts the one-sided 95% Clopper-Pearson upper
// bound on that rate is 0.304, said as at most 31 in 100 (a ceiling is rounded up, never down), and the bound is
// what a person should plan around. So wherever the claim reader's qualification is shown, the bound is shown beside
// the count, and the count is never cited alone.
import { clopperPearsonUpper } from '../distinctiveness/measured.js';

/** The one-sided 95% upper bound on the reader's false-flag rate, in texts per 100, rounded up: an "at most" is never rounded below the bound. */
export const falseFlagPct = (m: { readonly leftAlone: number; readonly clean: number }): number =>
  m.clean <= 0 ? 100 : Math.ceil(clopperPearsonUpper(m.clean - m.leftAlone, m.clean, 0.95) * 100 - 1e-9);
