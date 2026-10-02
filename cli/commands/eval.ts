// cli/commands/eval.ts — EVALUATION OVER RUNS: RATES WITH THEIR N, FAILURES BY KIND, AND WHAT TO READ NEXT.
//
//   atelier eval --skill <name> [--json] [--label]
//
// Per implementation release (the comparable cohort: same skill, release and profile):
//   conformant     the share of runs whose RESULT was conformant, with its N and a 95% Wilson interval
//   would ship     the share of rated runs the person said they would ship as is (`atelier rate`): user satisfaction
//   cost, time     median and 90th percentile
// Then the failures by kind (which required rules break most, why runs were not conformant, and the complaints
// `atelier fix` recorded), drift on the author's range (`atelier fidelity` computes it), and, with --label, the
// runs worth a person's reading now, chosen by count: not conformant first, then furthest outside the range.
// No figure is pooled across releases, and no trend is drawn over fewer than MIN_TREND runs.

import * as store from '../../core/state/store.js';
import { listEvals, latestRatings } from '../../core/state/eval-store.js';
import { wilson } from '../../core/stats/wilson.js';
import { quantile } from '../../core/observers/text.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import { DATA, argv, skillArg } from '../runtime.js';

/** Below this many runs in a cohort, rates are shown with their N and no interval is drawn as a trend. */
export const MIN_TREND = 5;

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const rate = (x: number, n: number): string => (n ? `${pct(x / n)} (${x}/${n}, 95% ${pct(wilson(x, n).lo)}–${pct(wilson(x, n).hi)})` : 'no runs');

export function evaluate(): void {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const evals = listEvals(L);
  const ratings = latestRatings(L);
  const byRun = new Map(ratings.map((r) => [r.invocationId, r]));
  const cohorts = new Map<string, EvalSummary[]>();
  for (const e of evals) cohorts.set(e.release ?? '(no release)', [...(cohorts.get(e.release ?? '(no release)') ?? []), e]);
  const summary = [...cohorts.entries()].map(([release, es]) => {
    const rated = es.filter((e) => byRun.has(e.invocationId));
    const yes = rated.filter((e) => byRun.get(e.invocationId)?.ship).length;
    const conformant = es.filter((e) => e.result.conformant).length;
    const costs = es.map((e) => e.costUsd); const times = es.map((e) => e.durationMs);
    return { release, runs: es.length, conformant, rated: rated.length, wouldShip: yes,
      cost: { p50: quantile(costs, 0.5), p90: quantile(costs, 0.9) }, durationMs: { p50: quantile(times, 0.5), p90: quantile(times, 0.9) } };
  });
  const brokenCount = new Map<string, number>();
  for (const e of evals) for (const b of e.gates.required.broken) brokenCount.set(b.id, (brokenCount.get(b.id) ?? 0) + 1);
  const reasonCount = new Map<string, number>();
  for (const e of evals) for (const r of e.result.reasons) { const k = r.replace(/\(.*\)/, '').replace(/\d+/g, 'N').trim(); reasonCount.set(k, (reasonCount.get(k) ?? 0) + 1); }
  const complaints = new Map<string, number>();
  // The complaints `atelier fix` recorded, grouped by the rule the diagnosis attributed them to.
  for (const f of store.listFeedback(L)) { const k = f.requirementId ? `about rule ${f.requirementId}` : 'not yet diagnosed'; complaints.set(k, (complaints.get(k) ?? 0) + 1); }
  const noRating = ratings.filter((r) => !r.ship).map((r) => r.why).filter((w): w is string => Boolean(w));
  const queue = evals.filter((e) => !byRun.has(e.invocationId))
    .sort((a, b) => Number(a.result.conformant) - Number(b.result.conformant)
      || ((b.fidelity ? b.fidelity.measured - b.fidelity.inBand : 0) - (a.fidelity ? a.fidelity.measured - a.fidelity.inBand : 0)))
    .slice(0, 5);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ skill: name, cohorts: summary.map((c) => ({ ...c, conformantCi: wilson(c.conformant, c.runs), wouldShipCi: wilson(c.wouldShip, c.rated) })),
      brokenRules: Object.fromEntries(brokenCount), reasons: Object.fromEntries(reasonCount), complaints: Object.fromEntries(complaints),
      notShippedBecause: noRating, toRead: queue.map((e) => e.invocationId) }, null, 1));
    return;
  }
  if (!evals.length) { console.log(`No evaluated runs of "${name}" yet: every run from Atelier 1.0 records one (atelier invoke --skill ${name} "<task>").`); return; }
  console.log(`${evals.length} evaluated run(s) of "${name}", ${ratings.length} rated by you.`);
  for (const c of summary) {
    console.log(`\n  ${c.release.startsWith("(") ? "runs with no release (they overrode it)" : `release ${c.release.slice(0, 8)}`} · ${c.runs} run(s)${c.runs < MIN_TREND ? ` (fewer than ${MIN_TREND}: read the rates as anecdotes)` : ''}`);
    console.log(`    conformant     ${rate(c.conformant, c.runs)}`);
    console.log(`    would ship     ${c.rated ? rate(c.wouldShip, c.rated) : `not rated yet: atelier rate <run> yes|no`}`);
    console.log(`    cost           median $${c.cost.p50.toFixed(2)} · 90th $${c.cost.p90.toFixed(2)}`);
    console.log(`    time           median ${(c.durationMs.p50 / 1000).toFixed(1)} s · 90th ${(c.durationMs.p90 / 1000).toFixed(1)} s`);
  }
  if (brokenCount.size || reasonCount.size || complaints.size || noRating.length) {
    console.log('\n  FAILURES BY KIND');
    for (const [id, n] of [...brokenCount].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    rule ${id} broken in ${n} run(s)`);
    for (const [k, n] of [...reasonCount].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    ${n} run(s): ${k}`);
    for (const [k, n] of [...complaints].sort((a, b) => b[1] - a[1])) console.log(`    ${n} complaint(s) via atelier fix: ${k}`);
    for (const w of noRating.slice(0, 5)) console.log(`    not shipped because: "${w.slice(0, 100)}"`);
  }
  if (argv.includes('--label') || queue.length) {
    console.log('\n  WORTH YOUR READING (unrated, chosen by count: not conformant first, then furthest from your range)');
    for (const e of queue) console.log(`    atelier report ${e.invocationId}  then  atelier rate ${e.invocationId} yes|no "why"`);
    console.log(`    the taste reader earns a vote only from your labels: atelier taste --skill ${name} --calibrate`);
  }
  console.log(`\n  drift on your range: atelier fidelity --skill ${name}`);
}
