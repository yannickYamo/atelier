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
// runs worth a person's reading now, chosen by count: blocked first, then furthest outside the range.
// No figure is pooled across releases, and no trend is drawn over fewer than MIN_TREND runs.

import * as store from '../../core/state/store.js';
import { listEvals, latestRatings } from '../../core/state/eval-store.js';
import { wilson, newcombe } from '../../core/stats/wilson.js';
import { quantile } from '../../core/observers/text.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import { DATA, argv, skillArg } from '../runtime.js';

/** Below this many runs in a cohort, rates are shown with their N and no interval is drawn as a trend. */
export const MIN_TREND = 5;

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const rate = (x: number, n: number): string => (n ? `${pct(x / n)} (${x}/${n}, 95% ${pct(wilson(x, n).lo)}–${pct(wilson(x, n).hi)})` : 'no runs');

/**
 * WHERE THE EVALUATION AND THE OWNER PART, over the runs the owner rated. Said verified and they would not use it:
 * the evaluation gave an assurance it had not earned, or the standard is missing what they wanted. Blocked and they
 * would use it: the evaluation refused what was right. Counts with their N, never a rate over runs nobody rated.
 */
export function disagreement(evals: readonly Pick<EvalSummary, 'invocationId' | 'record'>[], shipOf: (id: string) => boolean | undefined): { verified: { rated: number; wouldNotUse: number }; blocked: { rated: number; wouldUse: number } } {
  const at = (state: string, ship: boolean): number => evals.filter((e) => e.record?.state === state && shipOf(e.invocationId) === ship).length;
  return { verified: { rated: at('VERIFIED', true) + at('VERIFIED', false), wouldNotUse: at('VERIFIED', false) }, blocked: { rated: at('BLOCKED', true) + at('BLOCKED', false), wouldUse: at('BLOCKED', true) } };
}

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
    // WHAT A USABLE OUTPUT COSTS: every dollar the cohort's rated runs spent, over the runs the person would ship. The
    // economics a release is judged by (a cheaper run that ships less often is not cheaper), null until a run is rated.
    const ratedCost = rated.reduce((n, e) => n + e.costUsd, 0);
    const perUsable = yes ? Math.round((ratedCost / yes) * 10000) / 10000 : null;
    // Where each run stood (core/eval/record.ts); a run recorded before the record existed is counted apart.
    const stood = (st: string): number => es.filter((e) => e.record?.state === st).length;
    const states = { verified: stood('VERIFIED'), needsReview: stood('NEEDS_REVIEW'), blocked: stood('BLOCKED'), unrecorded: es.filter((e) => !e.record).length };
    return { release, runs: es.length, states, conformant, rated: rated.length, wouldShip: yes, parted: disagreement(es, (id) => byRun.get(id)?.ship),
      cost: { p50: quantile(costs, 0.5), p90: quantile(costs, 0.9), perUsable }, durationMs: { p50: quantile(times, 0.5), p90: quantile(times, 0.9) } };
  });
  const brokenCount = new Map<string, number>();
  for (const e of evals) for (const b of e.gates.required.broken) brokenCount.set(b.id, (brokenCount.get(b.id) ?? 0) + 1);
  const reasonCount = new Map<string, number>();
  for (const e of evals) for (const r of e.result.reasons) { const k = r.replace(/\(.*\)/, '').replace(/\d+/g, 'N').trim(); reasonCount.set(k, (reasonCount.get(k) ?? 0) + 1); }
  const complaints = new Map<string, number>();
  // The complaints `atelier fix` recorded, grouped by the rule the diagnosis attributed them to.
  for (const f of store.listFeedback(L)) { const k = f.about === 'EVALUATION' ? 'that the evaluation was wrong about the work' : f.requirementId ? `about rule ${f.requirementId}` : 'not yet diagnosed'; complaints.set(k, (complaints.get(k) ?? 0) + 1); }
  const noRating = ratings.filter((r) => !r.ship).map((r) => r.why).filter((w): w is string => Boolean(w));
  const queue = evals.filter((e) => !byRun.has(e.invocationId))
    .sort((a, b) => Number(a.record ? a.record.state !== 'BLOCKED' : a.result.conformant) - Number(b.record ? b.record.state !== 'BLOCKED' : b.result.conformant)
      || ((b.fidelity ? b.fidelity.measured - b.fidelity.inBand : 0) - (a.fidelity ? a.fidelity.measured - a.fidelity.inBand : 0)))
    .slice(0, 5);

  // WHERE THE CORPUS IS THIN. Runs whose request was near fewer than two of the author's pieces: the readings of
  // those runs rest on the whole range, and the list says what more of the author's writing would sharpen.
  const withSubject = evals.filter((e) => e.context?.subject);
  const thinIds = new Set(withSubject.filter((e) => e.context?.subject?.thin).map((e) => e.invocationId));
  const thinRequests = thinIds.size ? store.listInvocations(L).filter((r) => thinIds.has(r.invocationId)).map((r) => r.input.split('\n')[0].slice(0, 80)) : [];
  const coverage = { runs: withSubject.length, thin: thinIds.size, requests: thinRequests };

  // THE AUTHOR'S MOVES, OVER RUNS (core/taste/move-reader.ts): for each move, in how many runs it was placed or standing
  // and what the piece did with it. A reading, never a gate; the rate is the reader's, until a study rates the reader.
  const moveRuns = evals.flatMap((e) => (e.monitors.moves ? [{ e, m: e.monitors.moves }] : []));
  const byMove = new Map<string, { aspect: string; runs: number; realised: number; misapplied: number; missing: number; notApplicable: number; notRead: number }>();
  for (const { m: mon } of moveRuns) for (const x of mon.each) {
    const m = byMove.get(x.id) ?? { aspect: x.aspect, runs: 0, realised: 0, misapplied: 0, missing: 0, notApplicable: 0, notRead: 0 };
    m.runs += 1;
    if (x.outcome === 'REALISED') m.realised += 1; else if (x.outcome === 'MISAPPLIED') m.misapplied += 1; else if (x.outcome === 'MISSING') m.missing += 1; else if (x.outcome === 'NOT_APPLICABLE') m.notApplicable += 1; else m.notRead += 1;
    byMove.set(x.id, m);
  }
  const moves = { runs: moveRuns.length, served: moveRuns.filter(({ m: mon }) => mon.mode === 'serve').length, each: [...byMove.entries()].map(([id, m]) => ({ id, ...m })).sort((a, b) => b.runs - a.runs) };

  if (argv.includes('--json')) {
    // Each cohort's conformant share against the next cohort in the list, with Newcombe's score interval on the difference.
    console.log(JSON.stringify({ skill: name, cohorts: summary.map((c, i) => ({ ...c, conformantCi: wilson(c.conformant, c.runs), wouldShipCi: wilson(c.wouldShip, c.rated),
      ...(summary[i + 1] ? { conformantVsNextCohort: newcombe(c.conformant, c.runs, summary[i + 1].conformant, summary[i + 1].runs) } : {}) })),
      brokenRules: Object.fromEntries(brokenCount), reasons: Object.fromEntries(reasonCount), complaints: Object.fromEntries(complaints),
      notShippedBecause: noRating, toRead: queue.map((e) => e.invocationId), coverage, moves }, null, 1));
    return;
  }
  if (testRuns.size && !argv.includes('--json')) console.log(`(${testRuns.size} run(s) marked as tests are left out: a benchmark answer or a held-back case is a measurement, not use.)`);
  if (!evals.length) { console.log(`No evaluated runs of "${name}" yet: every run from Atelier 1.0 records one (atelier invoke --skill ${name} "<task>").`); return; }
  console.log(`${evals.length} evaluated run(s) of "${name}", ${ratings.length} rated by you.${unevaluated ? ` ${unevaluated} earlier run(s) ran before evaluations were kept and are not counted.` : ''}`);
  for (const c of summary) {
    console.log(`\n  ${c.release.startsWith('version:') ? `skill version ${c.release.slice(8, 16)} (no release: built without a corpus, or a run overrode it)` : `release ${c.release.slice(0, 8)}`} · ${c.runs} run(s)${c.runs < MIN_TREND ? ` (fewer than ${MIN_TREND}: read the rates as anecdotes)` : ''}`);
    const recorded = c.runs - c.states.unrecorded;
    if (recorded) {
      console.log(`    verified       ${rate(c.states.verified, recorded)}   every requirement read in full, and held`);
      console.log(`    needs review   ${rate(c.states.needsReview, recorded)}   nothing seen to fail; part of it is yours to read`);
      console.log(`    blocked        ${rate(c.states.blocked, recorded)}   a requirement seen to fail`);
    }
    console.log(`    strict bar     ${rate(c.conformant, c.runs)}   would be delivered under --strict (nothing seen to fail; not the same as verified)`);
    console.log(`    would ship     ${c.rated ? rate(c.wouldShip, c.rated) : `not rated yet: atelier rate <run> yes|no`}`);
    if (c.parted.verified.rated) console.log(`    said verified, and you would not use it   ${c.parted.verified.wouldNotUse} of ${c.parted.verified.rated} rated`);
    if (c.parted.blocked.rated) console.log(`    blocked, and you would use it             ${c.parted.blocked.wouldUse} of ${c.parted.blocked.rated} rated`);
    console.log(`    cost           median $${c.cost.p50.toFixed(2)} · 90th $${c.cost.p90.toFixed(2)}${c.cost.perUsable !== null ? ` · $${c.cost.perUsable.toFixed(2)} per output you would ship` : ''}`);
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
    console.log('\n  WORTH YOUR READING (unrated, chosen by count: blocked first, then furthest from your range)');
    for (const e of queue) console.log(`    atelier report ${e.invocationId}  then  atelier rate ${e.invocationId} yes|no "why"`);
    console.log(`    the taste reader earns a vote only from your labels: atelier taste --skill ${name} --calibrate`);
  }
  if (coverage.runs) {
    console.log('\n  WHERE YOUR PIECES ARE THIN (requests near fewer than two of them)');
    console.log(coverage.thin ? `    ${coverage.thin} of ${coverage.runs} run(s): their readings rest on your whole range, not on how you write on that subject`
      : `    none of ${coverage.runs} run(s): every request was near at least two of your pieces`);
    for (const q of [...new Set(coverage.requests)].slice(0, 5)) console.log(`    "${q}"`);
  }
  if (moves.runs) {
    console.log(`\n  MY MOVES, READ ON THE WORK (${moves.runs} run(s), ${moves.served} with the moves served; a reading, never a gate)`);
    for (const m of moves.each.slice(0, 8)) console.log(`    ${m.aspect.slice(0, 44).padEnd(46)}realised ${m.realised}/${m.runs} · misapplied ${m.misapplied} · missing ${m.missing} · not applicable ${m.notApplicable}${m.notRead ? ` · not read ${m.notRead}` : ''}`);
  }
  console.log(`\n  drift on your range: atelier fidelity --skill ${name}`);
}
