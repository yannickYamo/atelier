// atelier/core/stats/habit.ts — HOW OFTEN AN AUTHOR DOES A THING, AND WHETHER A SITUATION EXPLAINS IT, FROM COUNTS.
//
// A habit is observed as a count: in k of n pieces the author made the move. Where the habit has a situation, the
// count splits: a pieces in the situation with the move, b in the situation without it, c outside the situation with
// the move, d outside without. Nothing here is a word the model chose ("always", "sometimes") and nothing is a
// threshold someone picked: every quantity is a posterior under an objective prior, and every decision is the Bayes
// decision between two hypotheses under equal prior odds and symmetric loss, which is to say: the more probable one.
//
//   rate        θ ~ Beta(k + ½, n − k + ½): the Jeffreys prior, the reference prior for a binomial rate. Its mean,
//               a central 95% credible interval, and P(θ > ½ | data), the probability the habit holds in most pieces.
//   situation   two models of the same counts. M0: one rate for every piece. M1: one rate in the situation, another
//               outside it. Their marginal likelihoods are closed-form Beta integrals; the Bayes factor BF10 says which
//               the counts favour. P(θ_in > θ_out | data) says which way. The situation explains the habit when M1
//               is the more probable model and the move is more likely in the situation than outside it.
//   kind        the decision the composer needs, derived and never defined: `situational` when the situation
//               explains the habit; else `standing` when the habit more probably holds in most pieces than not;
//               else `occasional`. There is no unknown: a count of 1 in 1 has a posterior too, and a wide interval
//               says what it knows. The only constants are the prior (½, ½), the pivot ½ ("most pieces" means a
//               majority), and equal prior odds between models.
//
// A corpus of three pieces and one of forty get the same arithmetic; the intervals carry the difference.

export interface Posterior {
  readonly k: number; readonly n: number;
  /** posterior mean (k + ½) / (n + 1) */
  readonly mean: number;
  /** central 95% credible interval */
  readonly lo: number; readonly hi: number;
  /** P(θ > ½ | k, n): the habit holds in most pieces */
  readonly pMajority: number;
}
export interface SituationEffect {
  readonly in: Posterior; readonly out: Posterior;
  /** marginal likelihood of two rates over one, as a factor: above 1 the counts favour two */
  readonly bayesFactor: number;
  /** P(θ_in > θ_out | counts) */
  readonly pRaises: number;
  /** the Bayes decision: two rates more probable than one, and the move more likely in the situation */
  readonly explains: boolean;
}
export type HabitKind = 'standing' | 'situational' | 'occasional';
export interface HabitInference {
  readonly rate: Posterior;
  readonly situation: SituationEffect | null;
  readonly kind: HabitKind;
}

const A0 = 0.5, B0 = 0.5;

/** log Γ(x), Lanczos (g = 7, n = 9): accurate to about 1e-15 for x > 0. */
export function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; let a = c[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
export const logBeta = (a: number, b: number): number => lgamma(a) + lgamma(b) - lgamma(a + b);

/** The regularized incomplete beta I_x(a, b), by Lentz's continued fraction (Numerical Recipes, betacf). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (xx: number, aa: number, bb: number): number => {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    const qab = aa + bb, qap = aa + 1, qam = aa - 1;
    let c = 1, d = 1 - qab * xx / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa2 = m * (bb - m) * xx / ((qam + m2) * (aa + m2));
      d = 1 + aa2 * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa2 / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa2 = -(aa + m) * (qab + m) * xx / ((aa + m2) * (qap + m2));
      d = 1 + aa2 * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa2 / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? bt * cf(x, a, b) / a : 1 - bt * cf(1 - x, b, a) / b;
}
/** The Beta(a, b) quantile, by bisection on the regularized incomplete beta. */
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (regularizedBeta(mid, a, b) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The posterior of a rate from k of n, under the Jeffreys prior. */
export function posterior(k: number, n: number): Posterior {
  const a = k + A0, b = n - k + B0;
  return { k, n, mean: a / (a + b), lo: betaQuantile(0.025, a, b), hi: betaQuantile(0.975, a, b), pMajority: 1 - regularizedBeta(0.5, a, b) };
}

/** log marginal likelihood of k of n under Beta-Binomial with the Jeffreys prior. */
const logML = (k: number, n: number): number => logBeta(k + A0, n - k + B0) - logBeta(A0, B0);

/** P(X > Y) for X ~ Beta(a1, b1), Y ~ Beta(a2, b2), by quadrature on the density of X against the cdf of Y. */
export function pGreater(a1: number, b1: number, a2: number, b2: number): number {
  const N = 2000; let s = 0;
  const logNorm = -logBeta(a1, b1);
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N;
    const f = Math.exp(logNorm + (a1 - 1) * Math.log(x) + (b1 - 1) * Math.log(1 - x));
    s += f * regularizedBeta(x, a2, b2);
  }
  return Math.min(1, Math.max(0, s / N));
}

/** Whether a situation explains a habit, from the 2×2 counts: a, b in the situation (made, not); c, d outside. */
export function situationEffect(a: number, b: number, c: number, d: number): SituationEffect {
  const inside = posterior(a, a + b), outside = posterior(c, c + d);
  const bf = Math.exp(logML(a, a + b) + logML(c, c + d) - logML(a + c, a + b + c + d));
  const raises = pGreater(a + A0, b + B0, c + A0, d + B0);
  return { in: inside, out: outside, bayesFactor: bf, pRaises: raises, explains: bf > 1 && raises > 0.5 };
}

/**
 * The inference for one habit: its rate from k of n, its situation effect from the 2×2 when the habit has a
 * situation and both sides of it were observed, and the kind the composer needs, as a decision and never a word.
 */
export function inferHabit(k: number, n: number, table: { a: number; b: number; c: number; d: number } | null): HabitInference {
  const rate = posterior(k, n);
  const situation = table && (table.a + table.b) > 0 && (table.c + table.d) > 0 ? situationEffect(table.a, table.b, table.c, table.d) : null;
  const kind: HabitKind = situation?.explains ? 'situational' : rate.pMajority > 0.5 ? 'standing' : 'occasional';
  return { rate, situation, kind };
}

/** "in 12 of 12 pieces", "in 3 of 12 pieces [0.09, 0.53]": the rate as the skill and the record word it. */
export function describeRate(p: Posterior): string {
  const narrow = p.k === p.n || p.k === 0;
  return `in ${p.k} of ${p.n} piece${p.n === 1 ? '' : 's'}${narrow && p.n >= 3 ? '' : ` [${p.lo.toFixed(2)}, ${p.hi.toFixed(2)}]`}`;
}
