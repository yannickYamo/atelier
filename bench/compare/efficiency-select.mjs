// bench/compare/efficiency-select.mjs — WHICH SIZE OF SKILL BECOMES THE DEFAULT, BY A RULE FIXED BEFORE THE RUN.
//
// Sealed with studies/EFFICIENCY_ABLATION_PREREGISTRATION.md (decision 0014): the tester seals this file's sha256,
// the sha256 of bench/compare/efficiency-rows.mjs (which writes the rows read here) and the config below with the
// pre-registration, so the rule that chooses the arm is written before any arm has an output. No model call.
//
//   node bench/compare/efficiency-select.mjs --config <ablation.json> [--out <result.json>]
//
// ablation.json (every path relative to the config; efficiency-rows.mjs writes one beside its rows):
//   reference    the arm built as today ("full"); every other arm is read against it
//   arms         [labels] in the sealed order: on equal size, the arm listed first is taken
//   defaultable  [labels], a subset of `arms`: the arms that may become the default of a 1.x build. An arm outside
//                it is measured and reported, and never selected
//   domains      [{ name,
//                   sizes:   file {arm: words}: what `atelier export` wrote for each arm in this domain
//                   rules:   file of {case_id, trial, condition, broken (true|false)}: the output breaks a measured
//                            REQUIRED rule of the author's
//                   quality: [files] of {case_id, trial, condition, score (number)}: the comparator's own score, one
//                            file a judging session; a task's arms are compared inside a session, then sessions
//                            averaged per task
//                   voice:   file of {case_id, condition, chose: "arm" | "reference"}, or null: a blind choice
//                            between the arm's output and the reference's. A file ONLY where the reader was
//                            qualified on that domain; null leaves voice unread there, and it then rejects nothing
//                   excluded: [case ids] dropped for every arm in this domain, each with a reason in the report }]
//   margins      { rules, quality }: how much worse than the reference an arm may MEASURE before it is rejected:
//                `rules` in share of outputs (0.05 is five in a hundred), `quality` in points of the score
//   minTasks     fewer tasks than this in a domain and no arm is read there
//   ceiling      a share of outputs: where the reference itself breaks a required rule in more than this share of
//                its outputs, a yes-or-no reading has no room left to show an arm is worse, so rules are unread
//                in that domain and no arm can be selected on it. Sealed with the margins
//
// THE INPUT IS CHECKED BEFORE IT IS READ, and anything unexpected stops the run (exit 2) instead of thinning it. Every
// row names the reference or a listed arm; `broken` is a boolean, `score` a number, `chose` one of two words; no
// (task, trial, arm) appears twice; and in each file every arm has exactly the reference's tasks and trials. A task an
// arm has no output for is not dropped in silence: it is listed in `excluded`, for every arm at once, or the run
// stops. A reading that quietly lost its failing tasks would select the arm that failed.
//
// THE UNIT IS THE TASK for quality and voice, and THE OUTPUT for the rule count, which is compared as whole numbers.
//
// AN ARM IS REJECTED IN A DOMAIN when, against the reference, any of these holds:
//   rules     it breaks a required rule in more outputs than the reference by more than `margins.rules` of the
//             outputs compared. Counted in outputs: at 60 outputs and 0.05, four or more extra broken outputs
//   quality   its mean score, over tasks, is lower by more than `margins.quality`
//   voice     where read: the reference's output is chosen clearly more often, by an exact one-sided sign test at
//             0.05 over the tasks with a majority (core/stats). A domain where voice is read and an arm has fewer
//             than `minTasks` tasks of choices leaves that arm unread there
//
// THE ARM SELECTED is the defaultable arm with the fewest exported words summed over the domains, among arms read in
// every domain and rejected in none. Domains are never pooled: an arm that loses in one is not saved by another. When
// no defaultable arm stands, the reference stays. The smallest standing arm of all is reported beside it.
//
// WHAT THIS IS NOT. A screen that picks a configuration, not a proof that two sizes are equivalent, and its error
// rates are large both ways at thirty tasks: the pre-registration states them. It rejects on the measured difference
// alone. An earlier draft added tests for a "clear" loss inside the margin; at this size they could not fire on the
// rule count (five discordant tasks, all worse, is already over the margin) and on the score they rejected any
// loss that was merely consistent, however small, so the margins are the whole rule and are meant as tolerances.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signTestOneSidedP } from '../../dist/core/stats/sign-test.js';

const ALPHA = 0.05;
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
/** A config or a row that cannot be read as written. The command prints it and exits 2. */
export class Unreadable extends Error {}
const refuse = (m) => { throw new Unreadable(m); };
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const key = (r) => `${r.case_id}\u0000${r.trial}`;

/**
 * One file's rows by arm, checked: known labels only, a valid value on every row, no (task, trial, arm) twice, and
 * every arm on exactly the reference's tasks and trials once the excluded tasks are set aside.
 */
function byArm(rows, where, labels, reference, excluded, valid) {
  const out = new Map(labels.map((l) => [l, new Map()]));
  for (const r of rows) {
    if (typeof r.case_id !== 'string' || r.trial === undefined) refuse(`${where}: a row has no case_id or trial`);
    if (!out.has(r.condition)) refuse(`${where}: a row's condition is "${r.condition}", which is neither the reference nor a listed arm (${labels.join(', ')})`);
    const v = valid(r);
    if (v === null) refuse(`${where}: ${r.case_id} trial ${r.trial} (${r.condition}) has no usable value`);
    if (excluded.has(r.case_id)) continue;
    if (out.get(r.condition).has(key(r))) refuse(`${where}: ${r.case_id} trial ${r.trial} appears twice for "${r.condition}"`);
    out.get(r.condition).set(key(r), { case_id: r.case_id, value: v });
  }
  const want = [...out.get(reference).keys()].sort();
  for (const [label, m] of out) {
    const have = [...m.keys()].sort();
    const missing = want.filter((k) => !m.has(k)); const extra = have.filter((k) => !out.get(reference).has(k));
    if (missing.length || extra.length) {
      refuse(`${where}: "${label}" is not on the reference's tasks and trials (${missing.length} missing, ${extra.length} extra; first: ${(missing[0] ?? extra[0]).replace('\u0000', ' trial ')}). `
        + 'Put a task that could not be run for an arm in "excluded", which drops it for every arm, and say why in the report.');
    }
  }
  return out;
}
/** Per task, the mean of one arm's values. */
const perTask = (m) => { const t = new Map(); for (const x of m.values()) t.set(x.case_id, [...(t.get(x.case_id) ?? []), x.value]); return new Map([...t].map(([k, vs]) => [k, mean(vs)])); };

/** RULES: outputs breaking a measured REQUIRED rule, the arm against the reference, counted in whole outputs. */
export function readRules(arm, ref, margin, minTasks, ceiling) {
  const tasks = perTask(ref).size;
  if (tasks < minTasks) return { read: false, tasks };
  const outputs = ref.size; const count = (m) => [...m.values()].filter((x) => x.value).length;
  const armBroken = count(arm); const refBroken = count(ref); const extra = armBroken - refBroken;
  if (refBroken > ceiling * outputs) return { read: false, tasks, outputs, arm: armBroken, reference: refBroken, unread: `the reference breaks a required rule in ${refBroken} of ${outputs} outputs, over the ceiling of ${ceiling}: a yes-or-no reading cannot show an arm is worse` };
  // Whole numbers on both sides: the most extra broken outputs the margin allows. (The small term keeps 0.05 × 60 at 3.)
  const allowed = Math.floor(margin * outputs + 1e-9);
  return { read: true, tasks, outputs, arm: armBroken, reference: refBroken, extra, allowed, rejected: extra > allowed,
    why: extra > allowed ? `breaks a required rule in ${armBroken} of ${outputs} outputs against ${refBroken} for the reference: ${extra} more, where ${allowed} are allowed` : null };
}

/** QUALITY: the comparator's own score, differenced inside each judging session, then averaged per task over sessions. */
export function readQuality(sessions, margin, minTasks) {
  const byTask = new Map();
  for (const { arm, ref } of sessions) { const a = perTask(arm); const b = perTask(ref); for (const k of b.keys()) byTask.set(k, [...(byTask.get(k) ?? []), a.get(k) - b.get(k)]); }
  const diffs = [...byTask.values()].map(mean);
  if (diffs.length < minTasks) return { read: false, tasks: diffs.length };
  const m = mean(diffs);
  return { read: true, tasks: diffs.length, difference: r3(m), rejected: m < -margin, why: m < -margin ? `scores ${r3(-m)} points lower than the reference, where ${margin} is allowed` : null };
}

/** VOICE, where a qualified reader read it: per task, which output was chosen more; the reference clearly ahead rejects. */
export function readVoice(rows, arm, where, minTasks, excluded) {
  const byTask = new Map();
  for (const r of rows) {
    if (r.chose !== 'arm' && r.chose !== 'reference') refuse(`${where}: ${r.case_id} (${r.condition}) has chose "${r.chose}"; it must be "arm" or "reference"`);
    if (r.condition !== arm || excluded.has(r.case_id)) continue;
    byTask.set(r.case_id, [...(byTask.get(r.case_id) ?? []), r.chose === 'reference' ? 1 : 0]);
  }
  const share = [...byTask.values()].map(mean);
  if (share.length < minTasks) return { read: false, tasks: share.length };
  const forReference = share.filter((s) => s > 0.5).length; const forArm = share.filter((s) => s < 0.5).length;
  const p = signTestOneSidedP(forReference, forReference + forArm);
  return { read: true, tasks: share.length, tasksForReference: forReference, tasksForArm: forArm, pReference: r3(p), rejected: p < ALPHA,
    why: p < ALPHA ? `the reference was chosen on ${forReference} of the ${forReference + forArm} tasks with a majority (p = ${r3(p)})` : null };
}

export function select(cfg, load) {
  for (const k of ['reference', 'arms', 'defaultable', 'domains', 'margins', 'minTasks', 'ceiling']) if (cfg[k] === undefined || cfg[k] === null) refuse(`config needs "${k}"`);
  if (typeof cfg.margins.rules !== 'number' || typeof cfg.margins.quality !== 'number') refuse('config.margins needs numbers for "rules" and "quality"');
  if (typeof cfg.ceiling !== 'number' || !(cfg.ceiling > 0 && cfg.ceiling <= 1)) refuse('config.ceiling must be a share of outputs, above 0 and at most 1');
  if (!Number.isInteger(cfg.minTasks) || cfg.minTasks < 2) refuse('config.minTasks must be a whole number of at least 2');
  if (!Array.isArray(cfg.arms) || !cfg.arms.length || new Set(cfg.arms).size !== cfg.arms.length) refuse('config.arms must list each arm once');
  if (cfg.arms.includes(cfg.reference)) refuse('the reference is not one of the arms read against it: list it once, as "reference"');
  if (!Array.isArray(cfg.defaultable) || cfg.defaultable.some((a) => !cfg.arms.includes(a))) refuse('config.defaultable must be a list of arms from "arms"');
  const labels = [cfg.reference, ...cfg.arms];
  const domains = cfg.domains.map((d) => {
    if (!Array.isArray(d.quality) || !d.quality.length) refuse(`${d.name}: "quality" must be a list of at least one file`);
    const excluded = new Set(d.excluded ?? []);
    const sizes = load(d.sizes, 'json');
    for (const l of labels) if (typeof sizes[l] !== 'number') refuse(`${d.name}: sizes has no number for "${l}"`);
    const rules = byArm(load(d.rules, 'jsonl'), `${d.name} rules`, labels, cfg.reference, excluded, (r) => (typeof r.broken === 'boolean' ? r.broken : null));
    const quality = d.quality.map((f, i) => byArm(load(f, 'jsonl'), `${d.name} quality (session ${i + 1})`, labels, cfg.reference, excluded, (r) => (typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : null)));
    const voice = d.voice ? load(d.voice, 'jsonl') : null;
    for (const r of voice ?? []) if (!cfg.arms.includes(r.condition)) refuse(`${d.name} voice: a row's condition is "${r.condition}", which is not a listed arm`);
    return { name: d.name, sizes, excluded: [...excluded], arms: Object.fromEntries(cfg.arms.map((arm) => {
      const r = readRules(rules.get(arm), rules.get(cfg.reference), cfg.margins.rules, cfg.minTasks, cfg.ceiling);
      const q = readQuality(quality.map((s) => ({ arm: s.get(arm), ref: s.get(cfg.reference) })), cfg.margins.quality, cfg.minTasks);
      const v = voice ? readVoice(voice, arm, `${d.name} voice`, cfg.minTasks, excluded) : { read: false, tasks: 0, unread: 'no qualified reader on this domain' };
      // Rules and quality must both be read. Voice must be read too wherever this domain reads voice at all.
      const read = r.read && q.read && (voice === null || v.read);
      const rejectedBy = [r.read && r.rejected ? `rules: ${r.why}` : null, q.read && q.rejected ? `quality: ${q.why}` : null, v.read && v.rejected ? `voice: ${v.why}` : null].filter(Boolean);
      return [arm, { words: sizes[arm], read, rejected: rejectedBy.length > 0, rejectedBy, rules: r, quality: q, voice: v }];
    })) };
  });
  const standing = cfg.arms.map((arm) => {
    const per = domains.map((d) => ({ domain: d.name, ...d.arms[arm] }));
    const unread = per.filter((x) => !x.read).map((x) => x.domain); const lost = per.filter((x) => x.rejected).map((x) => x.domain);
    return { arm, words: per.reduce((n, x) => n + x.words, 0), defaultable: cfg.defaultable.includes(arm),
      state: lost.length ? 'rejected' : unread.length ? 'unread' : 'stands', unreadIn: unread, rejectedIn: lost };
  });
  const referenceWords = domains.reduce((n, d) => n + d.sizes[cfg.reference], 0);
  // The fewest words; on a tie, the arm listed first.
  const smallest = (xs) => [...xs].sort((a, b) => a.words - b.words || cfg.arms.indexOf(a.arm) - cfg.arms.indexOf(b.arm))[0] ?? null;
  const stands = standing.filter((s) => s.state === 'stands');
  const chosen = smallest(stands.filter((s) => s.defaultable)); const leanest = smallest(stands);
  const fewer = (s) => `${s.words.toLocaleString('en-US')} exported words over ${domains.length} domain(s) against ${referenceWords.toLocaleString('en-US')} for "${cfg.reference}" (${r3((1 - s.words / referenceWords) * 100)}% fewer)`;
  const sentence = (chosen
    ? `SELECTED: "${chosen.arm}", ${fewer(chosen)}. It was rejected in no domain. This selects a configuration; it does not show the two are equivalent.`
    : `NONE SELECTED: no arm that may become the default stood in every domain, so "${cfg.reference}" stays the default. The study did not show that a smaller skill holds; at this size it could not have shown that it does not.`)
    + (leanest && leanest.arm !== chosen?.arm ? ` The smallest arm that stood is "${leanest.arm}" (${fewer(leanest)}); it is reported and may not become the default in this version.` : '');
  return { reference: cfg.reference, referenceWords, margins: cfg.margins, minTasks: cfg.minTasks, ceiling: cfg.ceiling, alpha: ALPHA, domains, standing, selected: chosen?.arm ?? null, smallestStanding: leanest?.arm ?? null, sentence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const configPath = arg('--config') ?? refuse('--config <ablation.json> is required');
    const base = dirname(resolve(configPath));
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    const result = select(cfg, (f, kind) => (kind === 'json' ? JSON.parse(readFileSync(resolve(base, f), 'utf8')) : jsonl(resolve(base, f))));
    const out = arg('--out');
    if (out) writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
    for (const s of result.standing) console.log(`${s.state.padEnd(8)}  ${s.arm}  ${s.words.toLocaleString('en-US')} words${s.defaultable ? '' : '  (measured only)'}${s.rejectedIn.length ? `  rejected in: ${s.rejectedIn.join(', ')}` : ''}${s.unreadIn.length ? `  unread in: ${s.unreadIn.join(', ')}` : ''}`);
    for (const d of result.domains) for (const [arm, x] of Object.entries(d.arms)) for (const why of x.rejectedBy) console.log(`  ${d.name} · ${arm} · ${why}`);
    for (const d of result.domains) { const u = Object.values(d.arms).find((x) => x.rules.unread)?.rules.unread; if (u) console.log(`  ${d.name} · rules unread: ${u}`); }
    for (const d of result.domains) if (d.excluded.length) console.log(`  ${d.name} · ${d.excluded.length} task(s) excluded for every arm: ${d.excluded.join(', ')}`);
    console.log(`\n${result.sentence}`);
  } catch (e) {
    if (!(e instanceof Unreadable) && !(e instanceof SyntaxError)) throw e;
    console.error(`efficiency-select: ${e.message}`); process.exit(2);
  }
}
