// atelier/core/fidelity/estimator.ts — WHERE A SKILL'S OUTPUTS SIT AGAINST THE AUTHOR'S RANGE, OVER TIME.
//
// One output outside a band says almost nothing: the author's own pieces leave their band one time in
// five by construction (the band is the 10th to 90th percentile). Reacting to single outputs is the
// whack-a-mole pattern: a fix for each bad draft, each fix pushing some other feature out, and no fix
// ever tested against the run of outputs it was meant to move. So this module never judges an output.
// It estimates, per feature, per context class and per runtime binding, whether the RUN of outputs has
// drifted, and how widely it spreads compared with the author.
//
// Three readings per series, all on the standardised residual r = (x - median) / spread, so every
// feature is measured in the author's own spreads:
//
//   bias          EWMA of r (λ = 0.2). Near 0: centred on the author. Persistently away from 0: drift.
//   spread ratio  sqrt(EWMA of (r - bias)²). About 1: the outputs vary as much as the author does. Well
//                 under 1: every output is the typical value, which is the mean-regression signature of
//                 a model imitating a writer (imitations sit nearer the mean than the author's pieces
//                 do). Well over 1: erratic.
//   CUSUM         two-sided, k = 0.5, h = 4, on a clipped residual. An alarm needs a SUSTAINED shift;
//                 the clip is what makes one wild output unable to raise one alone.
//
// A runtime binding is part of the key. A model update is a step change, not drift: mixing the old
// model's outputs into the new one's series would read the step as a slow trend and blame whatever
// release happened to be active when it showed. A new binding therefore starts a new series.
//
// Pure: no I/O, no clock. The caller supplies the observations in any order; they are sorted by `at`.

import type { ContextClass, FeatureBand } from './types.js';

/** EWMA weight on the newest residual. 0.2 is the textbook choice for detecting shifts of about one spread. */
export const EWMA_LAMBDA = 0.2;
/** CUSUM allowance, in author spreads: half a spread of shift is tolerated without accumulating. */
export const CUSUM_K = 0.5;
/** CUSUM decision threshold, in author spreads. With k = 0.5 this gives a long in-control run length. */
export const CUSUM_H = 4;
/**
 * Residuals are clipped to this many spreads before they enter any statistic. Without it a single
 * output ten spreads out raises S+ to 9.5 and alarms on its own, which is exactly the one-bad-output
 * reaction this module exists to refuse. With it, one output can add at most CLIP - k = 2.5, under h.
 */
export const RESIDUAL_CLIP = 3;
/** Below this spread ratio, after COLLAPSE_MIN_N outputs, the series has collapsed onto the median. */
export const COLLAPSE_RATIO = 0.5;
export const COLLAPSE_MIN_N = 10;
/** Above this spread ratio the series is erratic: it varies far more than the author does. */
export const ERRATIC_RATIO = 2;
/**
 * The smallest spread a residual is divided by, relative to the median's size, so a feature the author
 * never varies (spread 0) does not turn every tiny difference into an infinite residual.
 */
export const SPREAD_FLOOR = 1e-3;

/** One output's measured features, with when it was written and what served it. */
export interface FidelityObservation {
  /** ISO time; the series is ordered by it */
  readonly at: string;
  /** the runtime binding's hash (core/runtime/binding.ts) */
  readonly binding: string;
  readonly cls: ContextClass;
  readonly values: Readonly<Record<string, number | null>>;
}

export type DriftAlarm = 'HIGH' | 'LOW' | null;

/** The estimate for one (binding, class, feature) series. */
export interface EstimateRow {
  readonly binding: string;
  readonly cls: ContextClass;
  readonly feature: string;
  /** the band set it was read against: the class's own, or the pooled one */
  readonly bandsFrom: ContextClass | 'all';
  readonly role: FeatureBand['role'];
  /** outputs that measured this feature */
  readonly n: number;
  /** EWMA of the standardised residual, in author spreads */
  readonly bias: number;
  /** sqrt(EWMA of the squared deviation from bias): 1 is the author's own variability */
  readonly spreadRatio: number;
  readonly cusumHigh: number;
  readonly cusumLow: number;
  readonly alarm: DriftAlarm;
  /** spread ratio under COLLAPSE_RATIO after COLLAPSE_MIN_N outputs: regressing to the mean */
  readonly collapsed: boolean;
  /** share of these outputs inside the author's band */
  readonly inBandShare: number;
}

/** The band an output of class `cls` is read against: the class's own when it has one, else the pooled. */
export function bandFor(bands: readonly FeatureBand[], feature: string, cls: ContextClass): FeatureBand | null {
  return bands.find((b) => b.id === feature && b.cls === cls) ?? bands.find((b) => b.id === feature && b.cls === 'all') ?? null;
}

const clip = (r: number): number => Math.max(-RESIDUAL_CLIP, Math.min(RESIDUAL_CLIP, r));

/** The standardised residual of one value against one band, unclipped. */
export function residual(x: number, band: FeatureBand): number {
  const floor = Math.max(SPREAD_FLOOR * Math.max(1, Math.abs(band.median)), 1e-9);
  return (x - band.median) / Math.max(band.spread, floor);
}

interface Acc {
  binding: string; cls: ContextClass; feature: string; band: FeatureBand;
  n: number; bias: number; varEw: number; hi: number; lo: number; inBand: number;
}

/**
 * Estimate every (binding, class, feature) series. Rows are sorted by binding, class and feature so
 * the same observations always print the same table.
 *
 * The squared-deviation EWMA starts at 1, the author's own variability, so a short series reads as
 * "no evidence yet of a different spread" rather than as collapsed or erratic. It takes COLLAPSE_MIN_N
 * outputs at the median to pull it under COLLAPSE_RATIO (0.8^10 is about 0.11, a ratio of about 0.33).
 */
export function estimate(series: readonly FidelityObservation[], bands: readonly FeatureBand[]): EstimateRow[] {
  const ordered = series.map((o, i) => ({ o, i })).sort((a, b) => a.o.at.localeCompare(b.o.at) || a.i - b.i).map((x) => x.o);
  const accs = new Map<string, Acc>();
  for (const o of ordered) {
    for (const [feature, x] of Object.entries(o.values)) {
      if (x === null || !Number.isFinite(x)) continue;
      const band = bandFor(bands, feature, o.cls);
      if (!band) continue;
      const key = JSON.stringify([o.binding, o.cls, feature]);
      let a = accs.get(key);
      if (!a) { a = { binding: o.binding, cls: o.cls, feature, band, n: 0, bias: 0, varEw: 1, hi: 0, lo: 0, inBand: 0 }; accs.set(key, a); }
      const r = clip(residual(x, band));
      a.n += 1;
      a.bias = (1 - EWMA_LAMBDA) * a.bias + EWMA_LAMBDA * r;
      a.varEw = (1 - EWMA_LAMBDA) * a.varEw + EWMA_LAMBDA * (r - a.bias) ** 2;
      a.hi = Math.max(0, a.hi + r - CUSUM_K);
      a.lo = Math.max(0, a.lo - r - CUSUM_K);
      if (x >= band.band[0] && x <= band.band[1]) a.inBand += 1;
    }
  }
  return [...accs.values()]
    .sort((a, b) => a.binding.localeCompare(b.binding) || a.cls.localeCompare(b.cls) || a.feature.localeCompare(b.feature))
    .map((a) => {
      const spreadRatio = Math.sqrt(a.varEw);
      const alarm: DriftAlarm = a.hi > CUSUM_H ? 'HIGH' : a.lo > CUSUM_H ? 'LOW' : null;
      return { binding: a.binding, cls: a.cls, feature: a.feature, bandsFrom: a.band.cls, role: a.band.role, n: a.n,
        bias: a.bias, spreadRatio, cusumHigh: a.hi, cusumLow: a.lo, alarm,
        collapsed: a.n >= COLLAPSE_MIN_N && spreadRatio < COLLAPSE_RATIO, inBandShare: a.n ? a.inBand / a.n : 0 };
    });
}

const fmt = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(1);

/**
 * Short plain lines for a status page: what is drifting, what has collapsed onto the author's median,
 * what is erratic, and one summary line. Only what needs a person's attention is named; a table of
 * every feature is what `estimate` returns.
 */
export function describeEstimate(rows: readonly EstimateRow[]): string[] {
  if (!rows.length) return ['No outputs measured against the author\'s bands yet.'];
  const where = (r: EstimateRow): string => `${r.feature} (${r.cls}, binding ${r.binding.slice(0, 8)})`;
  const lines: string[] = [];
  for (const r of rows) {
    if (r.alarm) {
      lines.push(`${where(r)}: running ${r.alarm === 'HIGH' ? 'above' : 'below'} the author over ${r.n} outputs; bias ${fmt(r.bias)} author spreads.`);
    }
    if (r.collapsed) {
      lines.push(`${where(r)}: every output near the author's typical value (spread ${r.spreadRatio.toFixed(2)} of the author's over ${r.n} outputs). The author varies more than this.`);
    } else if (r.n >= COLLAPSE_MIN_N && r.spreadRatio > ERRATIC_RATIO) {
      lines.push(`${where(r)}: outputs vary ${r.spreadRatio.toFixed(1)} times as much as the author over ${r.n} outputs.`);
    }
  }
  const bindings = new Set(rows.map((r) => r.binding)).size;
  const features = new Set(rows.map((r) => r.feature)).size;
  lines.push(lines.length
    ? `${features} feature(s) tracked across ${bindings} binding(s); the lines above are sustained, not single outputs.`
    : `${features} feature(s) tracked across ${bindings} binding(s); none drifting, none collapsed.`);
  return lines;
}
