// atelier/core/fidelity/promotion.ts — WHEN A CANDIDATE RELEASE MAY BECOME THE ONE THAT RUNS.
//
// What the settings search and distilled notes optimise (in-range share, inventions found, cost) is a diagnostic, not
// evidence the answers are better: on fresh requests the release that followed the method most closely was not the one
// people would send. So a candidate becomes active only on the owner's own ratings, paired by request against the
// release that runs now, and only when the evidence clears the uncertainty, never on an equal count:
//   - PAIRED: the same requests answered under both, each rated yes or no (`atelier rate`);
//   - NONINFERIOR BEYOND A MARGIN THE OWNER STATES: the lower bound of a 95% interval on the paired difference in the
//     share they would send is above minus the margin. An interval that straddles it is INCONCLUSIVE, and the candidate
//     stays inactive: one confirmation attempt is a budget, not proof;
//   - ENOUGH PAIRS: fewer than MIN_PAIRS is inconclusive whatever they show;
//   - PROTECTED: on those same requests, no more required rules broken and no more invented claims per output.
// Pure: the command (cli/commands/fidelity.ts, --promote-release) gathers the pairs and the owner's authorisation.

export const MIN_PAIRS = 10;

/** One request answered under both releases, with the owner's verdict on each and what the checks found. */
export interface PairedOutcome {
  readonly request: string;
  readonly candidate: { readonly ship: boolean; readonly broken: number; readonly invented: number };
  readonly active: { readonly ship: boolean; readonly broken: number; readonly invented: number };
}

export interface PromotionVerdict {
  readonly verdict: 'promote' | 'inconclusive' | 'worse' | 'protected-worse';
  readonly n: number;
  /** requests only the candidate's answer would be sent for, and only the active one's */
  readonly candidateOnly: number; readonly activeOnly: number;
  /** the paired difference in share sent (candidate minus active), and its 95% interval */
  readonly diff: number; readonly lower: number; readonly upper: number;
  readonly margin: number;
  readonly why: string;
}

/** The verdict on a candidate from paired owner ratings. `margin` is the owner's: how much worse they would accept. */
export function promotionVerdict(pairs: readonly PairedOutcome[], margin: number): PromotionVerdict {
  const n = pairs.length;
  const b = pairs.filter((p) => p.candidate.ship && !p.active.ship).length;
  const c = pairs.filter((p) => !p.candidate.ship && p.active.ship).length;
  const diff = n ? (b - c) / n : 0;
  // paired difference of proportions, Wald interval on the discordant pairs (with a continuity-free floor of one
  // discordant pair, so a run of agreements is never read as certainty)
  const se = n ? Math.sqrt(Math.max(1, b + c - (b - c) ** 2 / n)) / n : Infinity;
  const lower = diff - 1.96 * se; const upper = diff + 1.96 * se;
  const base = { n, candidateOnly: b, activeOnly: c, diff, lower, upper, margin };
  if (n < MIN_PAIRS) return { ...base, verdict: 'inconclusive', why: `${n} request(s) rated under both; at least ${MIN_PAIRS} are needed before any verdict` };
  const mean = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;
  const brokenUp = mean(pairs.map((p) => p.candidate.broken)) > mean(pairs.map((p) => p.active.broken));
  const inventedUp = mean(pairs.map((p) => p.candidate.invented)) > mean(pairs.map((p) => p.active.invented));
  if (brokenUp || inventedUp) return { ...base, verdict: 'protected-worse', why: `more ${[brokenUp ? 'required rules broken' : '', inventedUp ? 'invented claims' : ''].filter(Boolean).join(' and ')} per output on the same requests` };
  if (upper < -margin) return { ...base, verdict: 'worse', why: `sent less often by more than the margin (${pct(diff)}, interval ${pct(lower)} to ${pct(upper)})` };
  if (lower >= -margin) return { ...base, verdict: 'promote', why: `no worse than the active release beyond your margin of ${pct(margin)} (${pct(diff)}, interval ${pct(lower)} to ${pct(upper)})` };
  return { ...base, verdict: 'inconclusive', why: `the interval (${pct(lower)} to ${pct(upper)}) reaches below your margin of ${pct(-margin)}: rate more requests under both, or keep the active release` };
}

const pct = (x: number): string => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} pts`;
