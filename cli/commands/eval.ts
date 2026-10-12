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
  // A run marked as a test (a benchmark answer, a held-back case) is a measurement of the skill, not use of it: it is
  // in none of the counts below, and the number left out is said.
  const testRuns = store.testRunIds(L);
  const evals = listEvals(L).filter((e) => !testRuns.has(e.invocationId));
  const evaluated = new Set(evals.map((e) => e.invocationId));
  // Ratings of runs with no evaluation (before 1.0) are left out of every count here, and those runs are named.
  const ratings = latestRatings(L).filter((r) => evaluated.has(r.invocationId));
  const unevaluated = store.listLearningInvocations(L).filter((r) => !evaluated.has(r.invocationId)).length;
  const byRun = new Map(ratings.map((r) => [r.invocationId, r]));
  // THE COHORT: a release where there is one; else the skill version (a skill built without a corpus has no
  // release). Never pooled across either.
  const cohortOf = (e: EvalSummary): string => e.release ?? `version:${e.skillVersion ?? 'unknown'}`;
  const cohorts = new Map<string, EvalSummary[]>();
  for (const e of evals) cohorts.set(cohortOf(e), [...(cohorts.get(cohortOf(e)) ?? []), e]);
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

  // WHERE THE CORPUS IS THIN. Runs whose request was near fewer than two of the author's pieces: the readings of
  // those runs rest on the whole range, and the list says what more of the author's writing would sharpen.
  const withSubject = evals.filter((e) => e.context?.subject);
  const thinIds = new Set(withSubject.filter((e) => e.context?.subject?.thin).map((e) => e.invocationId));
  const thinRequests = thinIds.size ? store.listInvocations(L).filter((r) => thinIds.has(r.invocationId)).map((r) => r.input.split('\n')[0].slice(0, 80)) : [];
  const coverage = { runs: withSubject.length, thin: thinIds.size, requests: thinRequests };

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ skill: name, cohorts: summary.map((c) => ({ ...c, conformantCi: wilson(c.conformant, c.runs), wouldShipCi: wilson(c.wouldShip, c.rated) })),
      brokenRules: Object.fromEntries(brokenCount), reasons: Object.fromEntries(reasonCount), complaints: Object.fromEntries(complaints),
      notShippedBecause: noRating, toRead: queue.map((e) => e.invocationId), coverage }, null, 1));
    return;
  }
  if (testRuns.size && !argv.includes('--json')) console.log(`(${testRuns.size} run(s) marked as tests are left out: a benchmark answer or a held-back case is a measurement, not use.)`);
  if (!evals.length) { console.log(`No evaluated runs of "${name}" yet: every run from Atelier 1.0 records one (atelier invoke --skill ${name} "<task>").`); return; }
  console.log(`${evals.length} evaluated run(s) of "${name}", ${ratings.length} rated by you.${unevaluated ? ` ${unevaluated} earlier run(s) ran before evaluations were kept and are not counted.` : ''}`);
  for (const c of summary) {
    console.log(`\n  ${c.release.startsWith('version:') ? `skill version ${c.release.slice(8, 16)} (no release: built without a corpus, or a run overrode it)` : `release ${c.release.slice(0, 8)}`} · ${c.runs} run(s)${c.runs < MIN_TREND ? ` (fewer than ${MIN_TREND}: read the rates as anecdotes)` : ''}`);
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
  if (coverage.runs) {
    console.log('\n  WHERE YOUR PIECES ARE THIN (requests near fewer than two of them)');
    console.log(coverage.thin ? `    ${coverage.thin} of ${coverage.runs} run(s): their readings rest on your whole range, not on how you write on that subject`
      : `    none of ${coverage.runs} run(s): every request was near at least two of your pieces`);
    for (const q of [...new Set(coverage.requests)].slice(0, 5)) console.log(`    "${q}"`);
  }
  console.log(`\n  drift on your range: atelier fidelity --skill ${name}`);
}
