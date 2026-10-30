// atelier/core/optimizer/pareto.ts — KEEP EVERY CANDIDATE NOTHING ELSE BEATS ON EVERY RULE.
//
// GEPA keeps a Pareto front rather than a single best, because the candidate that is best on average is
// often best at nothing in particular. Its front is over task instances: a candidate stays while it is best on
// some instance. This is a narrower thing, a screen and not GEPA's search: each objective is one measured rule's score (oriented so higher is
// better, see ../distinctiveness/measured.ts), averaged over the floor's tasks.
//
// Dominance is strict and tolerant of noise from a cheap screen: A dominates B when it is at least as
// good on every rule both were scored on and better by more than `epsilon` on at least one. A candidate
// the champion dominates is dropped; the rest are ranked by how many rules they beat the champion on,
// then by total improvement, and the top few go on to be confirmed on the real model.

export type Scores = Readonly<Record<string, number>>;
/** How much a score must move to count, per rule or for all: the rule's margin is the natural unit, since
 *  rules score on different scales (a count, a rate per 1,000 words, a distance). */
export type Epsilon = number | Readonly<Record<string, number>>;
const eps = (e: Epsilon, k: string): number => (typeof e === 'number' ? e : e[k] ?? 0);

export function dominates(a: Scores, b: Scores, epsilon: Epsilon = 0): boolean {
  // A rule either side could not be scored on decides nothing: read as a number, a missing score never lost.
  const shared = Object.keys(a).filter((k) => k in b && Number.isFinite(a[k]) && Number.isFinite(b[k]));
  if (!shared.length) return false;
  let better = false;
  for (const k of shared) {
    if (a[k] < b[k] - eps(epsilon, k)) return false;
    if (a[k] > b[k] + eps(epsilon, k)) better = true;
  }
  return better;
}

/** The non-dominated members of a population. */
export function paretoFront<T>(pop: readonly T[], scoresOf: (t: T) => Scores, epsilon: Epsilon = 0): T[] {
  return pop.filter((x) => !pop.some((y) => y !== x && dominates(scoresOf(y), scoresOf(x), epsilon)));
}

/**
 * Successive halving's first cut: drop anything the champion dominates, keep the front, and rank it by
 * how much it improves on the champion. Only `keep` go on to the expensive confirmation.
 */
export function finalists<T>(pop: readonly T[], scoresOf: (t: T) => Scores, champion: Scores, keep: number, epsilon: Epsilon = 0): T[] {
  const alive = pop.filter((x) => !dominates(champion, scoresOf(x), epsilon));
  const gain = (s: Scores): { wins: number; total: number } => {
    const shared = Object.keys(s).filter((k) => k in champion && Number.isFinite(s[k]) && Number.isFinite(champion[k]));
    return { wins: shared.filter((k) => s[k] > champion[k] + eps(epsilon, k)).length, total: shared.reduce((n, k) => n + (s[k] - champion[k]), 0) };
  };
  // THE FRONT AMONG THE CANDIDATES IS EXACT. With a margin, three candidates that each beat the next on one rule
  // each "dominate" another, the front is empty, and a round reports that nothing beat the champion when all did.
  // The margin is for the comparison with the champion, where it says a difference is more than the screen's noise.
  return paretoFront(alive, scoresOf, 0)
    .map((x) => ({ x, g: gain(scoresOf(x)) }))
    .filter(({ g }) => g.wins > 0)
    .sort((a, b) => b.g.wins - a.g.wins || b.g.total - a.g.total)
    .slice(0, keep)
    .map(({ x }) => x);
}
