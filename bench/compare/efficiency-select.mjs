// bench/compare/efficiency-select.mjs — WHICH SIZE OF SKILL BECOMES THE DEFAULT, BY A RULE FIXED BEFORE THE RUN.
//
// Sealed with studies/EFFICIENCY_ABLATION_PREREGISTRATION.md (decision 0014): the tester seals this file's sha256
// with the pre-registration, so the rule that chooses the arm is written before any arm has an output. No model call.
//
//   node bench/compare/efficiency-select.mjs --config <config.json> [--out <result.json>]
//
// config.json (every path relative to the config):
//   reference   the arm built as today ("full"); every other arm is read against it
//   arms        [labels], smallest first by intent; the label is the rows' `condition`
//   domains     [{ name,
//                  sizes:   file {arm: words}: what `atelier export` wrote for each arm in this domain
//                  rules:   file of {case_id, trial, condition, broken (bool)}: the output breaks a measured REQUIRED
//                           rule of the author's (`atelier verify`, exit 1)
//                  quality: [files] of {case_id, trial, condition, score}: the comparator's own score, one file a
//                           judging session; a task's arms are compared inside a session, then sessions averaged
//                  voice:   file of {case_id, condition, chose: "arm" | "reference"}, or null: a blind choice
//                           between the arm's output and the reference's. Given ONLY where the reader was qualified
//                           on that domain; null leaves voice unread there, and it then rejects nothing }]
//   margins     { rules, quality }: how much worse than the reference an arm may MEASURE before it is rejected:
//               `rules` in share of outputs (0.05 is five points), `quality` in points of the score
//   minTasks    fewer paired tasks than this in a domain and the arm is unread there, and cannot be selected
//
// THE UNIT IS THE TASK. Outputs of one task are averaged before any difference is taken.
//
// AN ARM IS REJECTED IN A DOMAIN when, against the reference, any of these holds:
//   rules     its share of rule-breaking outputs is higher by more than `margins.rules` as measured, OR it is clearly
//             worse: over the tasks where the two differ, an exact one-sided sign test at 0.05 (core/stats)
//   quality   its mean score is lower by more than `margins.quality` as measured, OR clearly lower: the upper 95%
//             bound of the paired difference is below zero
//   voice     where read: the reference's output is chosen clearly more often (exact one-sided sign test at 0.05)
//
// THE ARM SELECTED is the one with the fewest exported words summed over the domains, among arms read in every
// domain and rejected in none. Domains are never pooled: an arm that loses in one is not saved by another. When no
// arm qualifies the reference stays, and that is a result.
//
// WHAT THIS IS NOT. It is a screen that picks a configuration, not a proof that two sizes are equivalent: thirty
// tasks cannot show a five-point margin (thirty clean outputs in thirty still leave about a tenth possible). So the
// measured difference does most of the rejecting, the exact tests catch the clear losses a margin would let through,
// and the arm selected is confirmed once more, with the reference beside it, before anything is sealed. A binary
// endpoint is read with an exact test, never with an interval built from the spread of the differences, which is
// zero whenever two arms happen to agree on every task.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signTestOneSidedP } from '../../dist/core/stats/sign-test.js';
import { tCrit } from '../../dist/core/stats/t.js';

const ALPHA = 0.05;
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error(`efficiency-select: ${m}`); process.exit(2); };
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Per task, the mean of `value(row)` for one arm in one file of rows. */
function perTask(rows, arm, value) {
  const m = new Map();
  for (const r of rows) { if (r.condition !== arm) continue; const v = value(r); if (typeof v !== 'number' || !Number.isFinite(v)) continue; m.set(r.case_id, [...(m.get(r.case_id) ?? []), v]); }
  return new Map([...m].map(([k, vs]) => [k, mean(vs)]));
}
/** The tasks both arms have, with each arm's value. */
const pairs = (a, b) => [...a.keys()].filter((k) => b.has(k)).map((k) => ({ arm: a.get(k), ref: b.get(k) }));

/** RULES: the share of outputs breaking a measured REQUIRED rule, the arm against the reference. */
export function readRules(rows, arm, reference, margin, minTasks) {
  const broken = (r) => (typeof r.broken === 'boolean' ? Number(r.broken) : null);
  const p = pairs(perTask(rows, arm, broken), perTask(rows, reference, broken));
  if (p.length < minTasks) return { read: false, tasks: p.length };
  const armRate = mean(p.map((x) => x.arm)); const refRate = mean(p.map((x) => x.ref));
  const worse = p.filter((x) => x.arm > x.ref).length; const better = p.filter((x) => x.arm < x.ref).length;
  const pWorse = signTestOneSidedP(worse, worse + better);
  const overMargin = armRate - refRate > margin; const clearly = pWorse < ALPHA;
  return { read: true, tasks: p.length, arm: r3(armRate), reference: r3(refRate), difference: r3(armRate - refRate),
    tasksWorse: worse, tasksBetter: better, pWorse: r3(pWorse), rejected: overMargin || clearly,
    why: overMargin ? `breaks a required rule in ${r3((armRate - refRate) * 100)} more outputs in a hundred than the reference, over the margin of ${r3(margin * 100)}`
      : clearly ? `clearly worse: worse on ${worse} of the ${worse + better} tasks where the two differ (p = ${r3(pWorse)})` : null };
}

/** QUALITY: the comparator's own score, compared inside each judging session, then averaged over sessions per task. */
export function readQuality(sessions, arm, reference, margin, minTasks) {
  const score = (r) => (typeof r.score === 'number' ? r.score : null);
  const byTask = new Map();
  for (const rows of sessions) {
    const a = perTask(rows, arm, score); const b = perTask(rows, reference, score);
    for (const k of a.keys()) if (b.has(k)) byTask.set(k, [...(byTask.get(k) ?? []), a.get(k) - b.get(k)]);
  }
  const diffs = [...byTask.values()].map(mean);
  if (diffs.length < Math.max(2, minTasks)) return { read: false, tasks: diffs.length };
  const m = mean(diffs); const se = Math.sqrt(diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (diffs.length - 1) / diffs.length);
  const hi95 = m + tCrit(diffs.length - 1, 0.95) * se;
  const overMargin = m < -margin; const clearly = hi95 < 0;
  return { read: true, tasks: diffs.length, difference: r3(m), hi95: r3(hi95), rejected: overMargin || clearly,
    why: overMargin ? `scores ${r3(-m)} points lower than the reference, over the margin of ${margin}`
      : clearly ? `clearly lower: the upper 95% bound of the difference is ${r3(hi95)}` : null };
}

/** VOICE, where a qualified reader read it: per task, which output was chosen more; the reference clearly ahead rejects. */
export function readVoice(rows, arm, minTasks) {
  const byTask = new Map();
  for (const r of rows) { if (r.condition !== arm || (r.chose !== 'arm' && r.chose !== 'reference')) continue; byTask.set(r.case_id, [...(byTask.get(r.case_id) ?? []), r.chose === 'reference' ? 1 : 0]); }
  const share = [...byTask.values()].map(mean);
  if (share.length < minTasks) return { read: false, tasks: share.length };
  const forReference = share.filter((s) => s > 0.5).length; const forArm = share.filter((s) => s < 0.5).length;
  const p = signTestOneSidedP(forReference, forReference + forArm);
  return { read: true, tasks: share.length, tasksForReference: forReference, tasksForArm: forArm, pReference: r3(p), rejected: p < ALPHA,
    why: p < ALPHA ? `the reference was chosen on ${forReference} of the ${forReference + forArm} tasks with a majority (p = ${r3(p)})` : null };
}

export function select(cfg, load) {
  for (const k of ['reference', 'arms', 'domains', 'margins', 'minTasks']) if (cfg[k] === undefined) fail(`config needs "${k}"`);
  if (typeof cfg.margins.rules !== 'number' || typeof cfg.margins.quality !== 'number') fail('config.margins needs numbers for "rules" and "quality"');
  if (cfg.arms.includes(cfg.reference)) fail('the reference is not one of the arms read against it: list it once, as "reference"');
  const domains = cfg.domains.map((d) => {
    const sizes = load(d.sizes, 'json'); const rules = load(d.rules, 'jsonl'); const quality = d.quality.map((f) => load(f, 'jsonl')); const voice = d.voice ? load(d.voice, 'jsonl') : null;
    if (typeof sizes[cfg.reference] !== 'number') fail(`${d.name}: sizes has no number for the reference "${cfg.reference}"`);
    return { name: d.name, sizes, arms: Object.fromEntries(cfg.arms.map((arm) => {
      if (typeof sizes[arm] !== 'number') fail(`${d.name}: sizes has no number for arm "${arm}"`);
      const r = readRules(rules, arm, cfg.reference, cfg.margins.rules, cfg.minTasks);
      const q = readQuality(quality, arm, cfg.reference, cfg.margins.quality, cfg.minTasks);
      const v = voice ? readVoice(voice, arm, cfg.minTasks) : { read: false, tasks: 0, unread: 'no qualified reader on this domain' };
      // Rules and quality must both be read for the arm to count here; voice is read only where an instrument qualified.
      const read = r.read && q.read;
      const rejectedBy = [r.read && r.rejected ? `rules: ${r.why}` : null, q.read && q.rejected ? `quality: ${q.why}` : null, v.read && v.rejected ? `voice: ${v.why}` : null].filter(Boolean);
      return [arm, { words: sizes[arm], read, rejected: rejectedBy.length > 0, rejectedBy, rules: r, quality: q, voice: v }];
    })) };
  });
  const standing = cfg.arms.map((arm) => {
    const per = domains.map((d) => ({ domain: d.name, ...d.arms[arm] }));
    const unread = per.filter((x) => !x.read).map((x) => x.domain); const lost = per.filter((x) => x.rejected).map((x) => x.domain);
    return { arm, words: per.reduce((n, x) => n + x.words, 0), eligible: unread.length === 0 && lost.length === 0, unreadIn: unread, rejectedIn: lost };
  });
  const referenceWords = domains.reduce((n, d) => n + d.sizes[cfg.reference], 0);
  // The fewest words; on a tie, the arm listed first.
  const chosen = standing.filter((s) => s.eligible).sort((a, b) => a.words - b.words || cfg.arms.indexOf(a.arm) - cfg.arms.indexOf(b.arm))[0] ?? null;
  const sentence = chosen
    ? `SELECTED: "${chosen.arm}", ${chosen.words.toLocaleString('en-US')} exported words over ${domains.length} domain(s) against ${referenceWords.toLocaleString('en-US')} for "${cfg.reference}" `
      + `(${r3((1 - chosen.words / referenceWords) * 100)}% fewer). It was rejected in no domain. This selects a configuration; it does not show the two are equivalent.`
    : `NONE SELECTED: every smaller arm was rejected or unread in at least one domain, so "${cfg.reference}" stays the default and its size is published with what it buys.`;
  return { reference: cfg.reference, referenceWords, margins: cfg.margins, minTasks: cfg.minTasks, alpha: ALPHA, domains, standing, selected: chosen?.arm ?? null, sentence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const configPath = arg('--config') ?? fail('--config <config.json> is required');
  const base = dirname(resolve(configPath));
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const result = select(cfg, (f, kind) => (kind === 'json' ? JSON.parse(readFileSync(resolve(base, f), 'utf8')) : jsonl(resolve(base, f))));
  const out = arg('--out');
  if (out) writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  for (const s of result.standing) console.log(`${s.eligible ? 'holds   ' : 'rejected'}  ${s.arm}  ${s.words.toLocaleString('en-US')} words${s.rejectedIn.length ? `  rejected in: ${s.rejectedIn.join(', ')}` : ''}${s.unreadIn.length ? `  unread in: ${s.unreadIn.join(', ')}` : ''}`);
  for (const d of result.domains) for (const [arm, x] of Object.entries(d.arms)) for (const why of x.rejectedBy) console.log(`  ${d.name} · ${arm} · ${why}`);
  console.log(`\n${result.sentence}`);
}
