// bench/compare/closing-quality.mjs — THE ANALYSIS OF A CLOSING QUALITY CLAIM, FIXED BEFORE THE RUN.
//
// Sealed with studies/CLOSING_A_PREREGISTRATION.md (coding answers, against i-have-adhd) and
// studies/CLOSING_AW_PREREGISTRATION.md (writing, against stop-slop): the tester seals this file's sha256 with the
// pre-registration, so the rule that reads the result is written before the result exists. No model call.
//
//   node bench/compare/closing-quality.mjs --config <config.json> [--out <result.json>] [--disagreements <file>]
//
// A file the config names that cannot be read, or holds a line that is not JSON, stops the run with one line saying
// which (exit 2), and nothing is written. `--disagreements <file>` needs the config's `reads`: without them there is
// nothing to write, and the run says so (exit 2) instead of ending as if it had.
//
// config.json (every path relative to the config):
//   claim        "A" or "A-w"; n and k for the sentence
//   arm          "plug-in" (the default) or "runtime": which Atelier arm is the candidate. Every sentence names it
//                ("the Atelier plug-in built from …", "the Atelier runtime built from …"), so a result for the
//                runtime arm is never worded as the plug-in's
//   weights      {dimension: weight}: the judge's own weighting; the weighted score is Σ weight × dimension
//   scores       [files]: the judge's rows {case_id, trial, condition, <dimensions>, blocker?}. One file a judging
//                session; a case's arms are compared only inside a session, then averaged over sessions
//   conditions   {bare, handwritten, strongest, candidate}: which `condition` label is which arm
//   verify       file: {case_id, trial, condition, applicable, held}: REQUIRED measured rules, by `atelier verify`
//   human        file: {case_id, trial, condition, held (bool), parts_asked?, parts_given?}: a person, blind to arm
//   preference   file (writing): {case_id, reader, chose}: "candidate" or "comparator", read blind
//   depthCases   [case ids] that ask for named parts
//   harms        [{name, file}] (writing): {case_id, trial, condition, count}: a counted harm, such as invented specifics delivered
//   margins      {handwritten, overall, dimension, preference} and minUnits, exactly as sealed. `handwritten: 0` makes
//                the claim "scores higher than the hand-written skill"; `overall` is the bar against the strongest
//                other baseline
//   cost         file: {condition, cost_usd, conformant (bool)}
//   axes         [{name, file, tasks?}]: THE SIGNED BAR, and when it is given THE VERDICT COMES FROM THE AXES ALONE (see
//                below). bench/compare/axes.mjs writes the quality, rule anchor and repeatability files; voice is
//                read by people. For each axis the script reports both arms' failure rates and
//                R = 1 − candidate / hand-written, and the axis is REACHED when R is at least `bar.reduction` (0.20)
//                AND the candidate clearly fails less (the lower 95% bound of the case-level difference is above
//                zero). What a row is depends on the axis's name:
//                  quality, rule anchor (and any other name)   {case_id, trial, condition, failed (bool)}: one row
//                                  for every sealed task, every trial 1 to `trials`, and both arms
//                  repeatability   {case_id, trial: 1, condition, failed (bool)}: one row a task and arm; failed
//                                  when the task's outputs differed
//                  voice           {case_id, reader, chose}: `chose` is "candidate" or "comparator" (the hand-written
//                                  skill), one row for each reader of a task, exactly `readers` rows a task, no
//                                  reader twice. A task is a failure of the arm most of its readers did not choose,
//                                  so `readers` is odd
//                An axis read on part of the sealed tasks (voice, on 100 of them) names them itself: `tasks`, a
//                list or a file like the config's, every id one of the sealed tasks.
//   requiredAxes [axis names] the claim requires, as sealed: ["quality", "rule anchor", "repeatability", "voice"]
//   tasks        the sealed task ids: a file of {id} a line, or a list
//   trials       outputs per task per arm, numbered 1 to n
//   readers      people who read each task on the voice axis (an odd number)
//   reads        [fileA, fileB]: two judge reads of the same answers; answers whose reads disagree on the blocker
//                are written to --disagreements for a person, and the disagreement rate is the judge's noise
//
// THE UNIT IS THE CASE. Trials are averaged inside a case and sessions over a case before any difference is taken;
// a bound is one-sided, from the case-level paired differences (Student t). Two kinds of endpoint:
//   SHOW   the bound must clear the bar (better than the bare model; not worse than a baseline by the margin; holds
//          the shared rules more often). Failing to show it is a FAIL.
//   GUARD  fails only on a clear loss: the 97.5% bound excludes zero on the losing side (blockers, requested depth),
//          or a dimension's 95% bound is below the dimension margin. A guard asks "is there a clear loss", never
//          "was no loss shown": as a SHOW, an arm exactly equal on blockers passed about one time in three.
//
// WITH `axes`, THE AXES DECIDE AND NOTHING ELSE DOES. P1 to P6, PREF and HARM are still computed and reported in
// `endpoints`; they are the bar as it stood before it was signed, and they never change the verdict. Without
// `axes` the verdict is read from those endpoints, as before.
//   UNRESOLVED  the config names no `requiredAxes`; a required axis has no entry in `axes`; an axis is named twice;
//               `tasks` and `trials` are not given, so coverage could not be checked; a required axis does not cover
//               exactly its sealed tasks (and trials, or readers) for both arms: a row short, a task that is not
//               sealed, a row twice, a `failed` that is not true or false. The sentence names the axis and the first
//               row at fault. Also when fewer cases than `minUnits` have every arm judged. Never a pass, and rows are
//               never thinned to what happens to be there.
//   FAIL        every required axis is covered, and at least one is not reached.
//   PASS        every required axis is covered, and each is reached or not applicable.
// AN AXIS IS NOT APPLICABLE (`pass` null, `state` "not applicable") only when it is fully covered and the hand-written
// skill never failed on it: there is nothing to reduce, and it does not block a pass. If the candidate failed there
// and the hand-written skill did not, the axis is not reached. `pass` is also null on an axis that is not covered;
// `state` says which ("reached", "not reached", "not applicable", "not covered", or "not checked" when the config
// gave no tasks to check against). Rows of arms other than the two compared are not read.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tCrit } from '../../dist/core/stats/t.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error(`closing-quality: ${m}`); process.exit(2); };
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** How the candidate is named in a sentence: the arm the config says it is. Unset, claim A-w keeps "an Atelier skill". */
const subjectOf = (cfg) => { const arm = cfg.arm === 'runtime' ? 'runtime' : 'plug-in'; return cfg.claim === 'A-w' ? `an Atelier ${cfg.arm === undefined ? 'skill' : arm} built from ${cfg.k ?? '[k]'} pieces` : `the Atelier ${arm} built from ${cfg.k ?? '[k]'} examples`; };

/** One-sided bounds of the mean of paired differences: `lo95` is the lower 95% bound, `hi95` the upper, and the 97.5% pair. */
export function bounds(diffs) {
  const n = diffs.length;
  if (n < 2) return { n, mean: n ? diffs[0] : null, lo95: null, hi95: null, lo975: null, hi975: null };
  const m = mean(diffs); const se = Math.sqrt(diffs.reduce((a, d) => a + (d - m) ** 2, 0) / (n - 1) / n);
  const t95 = tCrit(n - 1, 0.95); const t975 = tCrit(n - 1, 0.975);
  return { n, mean: r3(m), lo95: r3(m - t95 * se), hi95: r3(m + t95 * se), lo975: r3(m - t975 * se), hi975: r3(m + t975 * se) };
}

/** Per case, the mean of `value(row)` for one condition: trials averaged, then files (sessions) averaged. */
function perCase(files, condition, value) {
  const bySession = files.map((rows) => {
    const m = new Map();
    for (const r of rows) { if (r.condition !== condition) continue; const v = value(r); if (typeof v !== 'number' || !Number.isFinite(v)) continue; m.set(r.case_id, [...(m.get(r.case_id) ?? []), v]); }
    return new Map([...m].map(([k, vs]) => [k, mean(vs)]));
  });
  const out = new Map();
  for (const id of new Set(bySession.flatMap((m) => [...m.keys()]))) out.set(id, mean(bySession.flatMap((m) => (m.has(id) ? [m.get(id)] : []))));
  return out;
}
/** Paired case-level differences a − b, over the cases both arms have. */
const paired = (a, b) => [...a.keys()].filter((k) => b.has(k)).map((k) => a.get(k) - b.get(k));

/** What one row of an axis file is, by the axis's name. */
const unitOf = (name) => (name === 'repeatability' ? 'task' : name === 'voice' ? 'reader' : 'answer');

/** Task ids from the config: a list as written, or a file of {id} a line. Null when they cannot be read as distinct ids. */
function idsOf(spec, load) {
  let rows;
  try { rows = Array.isArray(spec) ? spec : typeof spec === 'string' ? load(spec) : null; } catch { return null; }
  if (!rows?.length) return null;
  const ids = rows.map((t) => (typeof t === 'string' ? t : t !== null && typeof t === 'object' && typeof t.id === 'string' ? t.id : ''));
  return ids.includes('') || new Set(ids).size !== ids.length ? null : ids;
}

/**
 * One axis file against its sealed tasks: `{ rows }` as {case_id, trial, condition, failed}, exactly one for every
 * task, trial and arm compared, or `{ problem }` naming the first row at fault. Nothing is dropped to make it fit.
 */
function coveredRows(name, rows, C, tasks, trials, readers) {
  const unit = unitOf(name); const known = new Set(tasks); const seen = new Set(); const show = (r) => JSON.stringify(r);
  if (unit === 'reader') {
    if (!Number.isInteger(readers) || readers < 1 || readers % 2 === 0) return { problem: 'the config\'s `readers` must be an odd whole number, so that every task has a majority' };
    const by = new Map();
    for (const r of rows) {
      if (r === null || typeof r !== 'object' || !known.has(r.case_id)) return { problem: `a row is for a task that is not sealed for this axis: ${show(r)}` };
      if (typeof r.reader !== 'string' && typeof r.reader !== 'number') return { problem: `a row names no reader: ${show(r)}` };
      if (r.chose !== 'candidate' && r.chose !== 'comparator') return { problem: `a row's \`chose\` is neither "candidate" nor "comparator": ${show(r)}` };
      const k = `${r.case_id}\u0000${r.reader}`;
      if (seen.has(k)) return { problem: `a reader's choice appears twice: ${show(r)}` };
      seen.add(k); by.set(r.case_id, [...(by.get(r.case_id) ?? []), r.chose]);
    }
    const short = tasks.filter((id) => (by.get(id)?.length ?? 0) !== readers);
    if (short.length) return { problem: `${short.length} of ${tasks.length} tasks do not have ${readers} readers' choices (first: ${short[0]} has ${by.get(short[0])?.length ?? 0})` };
    return { rows: tasks.flatMap((id) => { const lost = by.get(id).filter((c) => c === 'comparator').length * 2 > readers;
      return [{ case_id: id, trial: 1, condition: C.candidate, failed: lost }, { case_id: id, trial: 1, condition: C.handwritten, failed: !lost }]; }) };
  }
  const n = unit === 'task' ? 1 : trials; const kept = [];
  for (const r of rows) {
    if (r === null || typeof r !== 'object') return { problem: `a line is not a row: ${show(r)}` };
    if (r.condition !== C.candidate && r.condition !== C.handwritten) continue;
    if (!known.has(r.case_id)) return { problem: `a row is for a task that is not sealed for this axis: ${show(r)}` };
    const trial = unit === 'task' ? r.trial ?? 1 : r.trial;
    if (!Number.isInteger(trial) || trial < 1 || trial > n) return { problem: `a row's trial is not one of 1 to ${n}: ${show(r)}` };
    if (typeof r.failed !== 'boolean') return { problem: `a row's \`failed\` is not true or false: ${show(r)}` };
    const k = `${r.case_id}\u0000${trial}\u0000${r.condition}`;
    if (seen.has(k)) return { problem: `a row appears twice: ${show(r)}` };
    seen.add(k); kept.push({ case_id: r.case_id, trial, condition: r.condition, failed: r.failed });
  }
  const missing = [];
  for (const arm of [C.candidate, C.handwritten]) for (const id of tasks) for (let t = 1; t <= n; t++) if (!seen.has(`${id}\u0000${t}\u0000${arm}`)) missing.push(`${id} trial ${t} for "${arm}"`);
  if (missing.length) return { problem: `${missing.length} of ${2 * tasks.length * n} rows are missing (first: ${missing[0]})` };
  return { rows: kept };
}

export function analyse(cfg, load) {
  // `handwritten` is the bar against the hand-written skill itself: 0 means the claim is "scores higher", and the
  // lower bound must be above it. `overall` is the bar against the strongest other baseline ("not worse than").
  const C = cfg.conditions; const M = { overall: -0.2, dimension: -0.25, preference: 0.4, ...(cfg.margins ?? {}) };
  if (M.handwritten === undefined) M.handwritten = M.overall;
  const sessions = cfg.scores.map(load);
  const dims = Object.keys(cfg.weights);
  const weighted = (r) => dims.reduce((s, d) => s + cfg.weights[d] * r[d], 0);
  const score = (cond, f = weighted) => perCase(sessions, cond, f);
  const cand = score(C.candidate);
  const valid = [...cand.keys()].filter((k) => [C.bare, C.handwritten, C.strongest].filter(Boolean).every((c) => score(c).has(k))).length;
  const E = {};
  // SHOW: better than the bare model; not worse than the hand-written skill, nor than the strongest baseline.
  if (C.bare) { const b = bounds(paired(cand, score(C.bare))); E.P1 = { what: 'better than the bare model', ...b, bar: '> 0', pass: b.lo95 !== null && b.lo95 > 0 }; }
  const against = [['the hand-written skill', C.handwritten], ...(C.strongest && C.strongest !== C.handwritten ? [['the strongest baseline', C.strongest]] : [])];
  E.P2 = against.map(([name, c], i) => { const bar = i === 0 ? M.handwritten : M.overall; const b = bounds(paired(cand, score(c)));
    return { what: `${bar >= 0 ? 'scores higher than' : 'not worse than'} ${name}`, ...b, bar: `> ${bar}`, pass: b.lo95 !== null && b.lo95 > bar }; });
  // GUARD: no dimension clearly worse than the hand-written skill.
  E.P3 = dims.map((d) => { const b = bounds(paired(score(C.candidate, (r) => r[d]), score(C.handwritten, (r) => r[d]))); return { what: d, ...b, bar: `upper bound not below ${M.dimension}`, pass: !(b.hi95 !== null && b.hi95 < M.dimension) }; });
  // GUARD: blockers. Fails only when the candidate clearly has more.
  if (sessions.some((rows) => rows.some((r) => typeof r.blocker === 'boolean'))) {
    const rate = (c) => score(c, (r) => (r.blocker ? 1 : 0));
    E.P4 = [C.handwritten, C.strongest].filter((c, i, a) => c && a.indexOf(c) === i).map((c) => { const b = bounds(paired(rate(C.candidate), rate(c))); return { what: `blockers against ${c}`, ...b, bar: 'not clearly more', pass: !(b.lo975 !== null && b.lo975 > 0) }; });
  }
  // SHOW: the shared REQUIRED rules are held more often. Counted by `atelier verify`; a person confirms the counts.
  if (cfg.verify) {
    const v = [load(cfg.verify)]; const held = (c) => perCase(v, c, (r) => (r.applicable > 0 ? r.held / r.applicable : null));
    const b = bounds(paired(held(C.candidate), held(C.handwritten)));
    E.P5 = { what: 'the shared required rules held more often', ...b, bar: '> 0', pass: b.lo95 !== null && b.lo95 > 0 };
    if (cfg.human) {
      const key = (r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}`;
      const machine = new Map(v[0].map((r) => [key(r), r.applicable > 0 && r.held === r.applicable]));
      const coded = load(cfg.human).filter((r) => typeof r.held === 'boolean' && machine.has(key(r)));
      const agree = coded.filter((r) => machine.get(key(r)) === r.held).length;
      E.P5.agreement = { coded: coded.length, share: coded.length ? r3(agree / coded.length) : null, bar: '>= 0.90' };
      if (!(coded.length > 0 && agree / coded.length >= 0.9)) E.P5.unresolved = 'a person and atelier verify agree on fewer than 0.90 of the answers coded';
    }
  }
  // GUARD: requested depth, on the cases that ask for named parts, coded by a person blind to arm.
  if (cfg.human && cfg.depthCases?.length) {
    const want = new Set(cfg.depthCases); const h = [load(cfg.human).filter((r) => want.has(r.case_id))];
    const given = (c) => perCase(h, c, (r) => (r.parts_asked > 0 ? r.parts_given / r.parts_asked : null));
    const b = bounds(paired(given(C.candidate), given(C.handwritten)));
    E.P6 = { what: 'requested parts given', ...b, bar: 'not clearly fewer', pass: !(b.hi975 !== null && b.hi975 < 0) };
  }
  // GUARD: a counted harm (invented specifics delivered, in writing). Fails only when the candidate clearly has more.
  for (const hm of cfg.harms ?? []) {
    const rows = [load(hm.file)]; const count = (c) => perCase(rows, c, (r) => r.count);
    const b = bounds(paired(count(C.candidate), count(C.handwritten)));
    (E.HARM ??= []).push({ what: hm.name, ...b, bar: 'not clearly more', pass: !(b.lo975 !== null && b.lo975 > 0) });
  }
  // SHOW (writing): readers do not prefer the comparator by a clear margin.
  if (cfg.preference) {
    const by = new Map();
    for (const r of load(cfg.preference)) by.set(r.case_id, [...(by.get(r.case_id) ?? []), r.chose === 'candidate' ? 1 : 0]);
    const shares = [...by.values()].map(mean); const b = bounds(shares.map((s) => s - M.preference));
    E.PREF = { what: 'readers choosing the Atelier piece', n: shares.length, mean: shares.length ? r3(mean(shares)) : null, lo95: b.lo95 === null ? null : r3(b.lo95 + M.preference), bar: `> ${M.preference}`, pass: b.lo95 !== null && b.lo95 > 0 };
  }
  if (cfg.cost) {
    const rows = load(cfg.cost);
    E.cost = Object.fromEntries([...new Set(rows.map((r) => r.condition))].map((c) => { const rs = rows.filter((r) => r.condition === c); const ok = rs.filter((r) => r.conformant !== false).length;
      return [c, { dollars: r3(rs.reduce((a, r) => a + (r.cost_usd ?? 0), 0)), answers: rs.length, perUsableAnswer: ok ? r3(rs.reduce((a, r) => a + (r.cost_usd ?? 0), 0) / ok) : null }]; }));
  }
  // THE SIGNED BAR, AXIS BY AXIS: 20% fewer failures than the hand-written skill, and clearly fewer. Each axis is
  // first held against the sealed tasks; one that does not cover them is not read at all.
  const reduction = cfg.bar?.reduction ?? 0.2;
  const sealedTasks = cfg.tasks === undefined ? null : idsOf(cfg.tasks, load);
  const checkable = sealedTasks !== null && Number.isInteger(cfg.trials) && cfg.trials >= 1;
  for (const ax of cfg.axes ?? []) {
    const what = `${ax.name}: at least ${Math.round(reduction * 100)}% fewer failures than the hand-written skill`; const bar = `reduction >= ${reduction} and lower bound of the difference > 0`;
    let file; let problem = null; let covered = false;
    try { file = load(ax.file); } catch (e) { problem = `its file cannot be read (${e.code ?? String(e.message).split('\n')[0]})`; }
    if (!problem && checkable) {
      const own = ax.tasks === undefined ? sealedTasks : idsOf(ax.tasks, load);
      if (own === null || own.some((id) => !sealedTasks.includes(id))) problem = 'its own `tasks` are not readable as a list of sealed task ids';
      else { const c = coveredRows(ax.name, file, C, own, cfg.trials, cfg.readers); if (c.problem) problem = c.problem; else { file = c.rows; covered = true; } }
    }
    if (problem) { (E.AXES ??= []).push({ what, axis: ax.name, n: 0, candidate: null, handwritten: null, reduction: null, mean: null, lo95: null, hi95: null, bar, pass: null, state: 'not covered', problem }); continue; }
    const rows = [file]; const rate = (c) => perCase(rows, c, (r) => (r.failed === true ? 1 : r.failed === false ? 0 : null));
    const cand = rate(C.candidate); const hand = rate(C.handwritten);
    const ids = [...cand.keys()].filter((k) => hand.has(k));
    const fc = ids.length ? mean(ids.map((k) => cand.get(k))) : null; const fh = ids.length ? mean(ids.map((k) => hand.get(k))) : null;
    const b = bounds(ids.map((k) => hand.get(k) - cand.get(k)));   // positive: the candidate fails less
    const Rel = fh ? 1 - fc / fh : null;
    // THE ZERO-DENOMINATOR RULE. When the hand-written skill never failed on an axis there is nothing to reduce:
    // the axis is not applicable (pass null), unless the candidate did fail, which is a plain miss.
    const pass = fh === 0 ? (fc === 0 ? null : false) : (Rel !== null && Rel >= reduction && b.lo95 !== null && b.lo95 > 0);
    (E.AXES ??= []).push({ what, axis: ax.name, n: ids.length,
      candidate: fc === null ? null : r3(fc), handwritten: fh === null ? null : r3(fh), reduction: Rel === null ? null : r3(Rel), mean: b.mean, lo95: b.lo95, hi95: b.hi95,
      bar, pass, state: !covered ? 'not checked' : pass === null ? 'not applicable' : pass ? 'reached' : 'not reached' });
  }
  if (cfg.reads?.length === 2) {
    const [a, b2] = cfg.reads.map(load); const key = (r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}`;
    const second = new Map(b2.map((r) => [key(r), r])); const both = a.filter((r) => second.has(key(r)));
    const differ = both.filter((r) => Boolean(r.blocker) !== Boolean(second.get(key(r)).blocker));
    E.judgeNoise = { answers: both.length, blockerDisagreements: differ.length, rate: both.length ? r3(differ.length / both.length) : null, toReview: differ.map((r) => ({ case_id: r.case_id, trial: r.trial, condition: r.condition })) };
  }
  // One sentence per axis of the signed bar, said whether it was reached or not: a miss is a result.
  const axisSentence = (x) => `${x.axis}: ${x.state === 'not covered' ? `not read: ${x.problem}` : x.candidate === null ? 'not measured' : x.state === 'not applicable' ? `the hand-written skill never failed on the ${x.n} tasks, all covered: nothing to reduce, so the axis is not applicable and does not block a pass` : x.pass === null ? 'neither skill failed: nothing to reduce' : `${Math.round(x.candidate * 100)}% failed against ${Math.round(x.handwritten * 100)}% for the hand-written skill, ${x.reduction === null ? 'no reduction computable' : `${Math.round(x.reduction * 100)}% fewer`} (${x.pass ? 'reached' : 'not reached'}: the bar is ${Math.round(reduction * 100)}% fewer and clearly fewer)`}.`;
  const tooFew = valid < (cfg.minUnits ?? 0) ? `only ${valid} cases have every arm judged, under the minimum of ${cfg.minUnits}` : null;
  const base = { claim: cfg.claim ?? 'A', validCases: valid, margins: M, endpoints: E };
  const closed = (cause) => `The quality comparison did not complete: ${cause}. It is closed without a result.`;
  if (cfg.axes) {
    // THE AXES DECIDE, AND NOTHING ELSE DOES. The endpoints above are reported beside them.
    const given = E.AXES ?? []; const named = given.map((x) => x.axis);
    const required = Array.isArray(cfg.requiredAxes) && cfg.requiredAxes.length && cfg.requiredAxes.every((n) => typeof n === 'string') ? cfg.requiredAxes : null;
    const twice = named.find((n, i) => named.indexOf(n) !== i);
    const absent = (required ?? []).filter((n) => !named.includes(n));
    const mine = given.filter((x) => (required ?? []).includes(x.axis));
    const uncovered = mine.find((x) => x.state === 'not covered');
    const unresolved = !required ? 'the config names no `requiredAxes`, so no set of axes could decide the claim'
      : twice !== undefined ? `the axis "${twice}" is given twice in \`axes\``
        : absent.length ? `the required ${absent.length > 1 ? 'axes' : 'axis'} ${absent.map((n) => `"${n}"`).join(', ')} ${absent.length > 1 ? 'are' : 'is'} missing from \`axes\``
          : !checkable ? 'the config gives no readable `tasks` and whole-number `trials`, so no axis could be checked against the sealed tasks'
            : uncovered ? `the ${uncovered.axis} axis does not cover its sealed tasks: ${uncovered.problem}`
              : tooFew;
    const missed = mine.filter((x) => x.pass === false);
    const verdict = unresolved ? 'UNRESOLVED' : missed.length ? 'FAIL' : 'PASS';
    const subject = `On ${sealedTasks?.length ?? 0} ${cfg.claim === 'A-w' ? 'writing briefs' : 'coding tasks'} it never saw, ${subjectOf(cfg)}`;
    const each = mine.map((x) => { const t = axisSentence(x); return t[0].toUpperCase() + t.slice(1); }).join(' ');
    const sentence = verdict === 'UNRESOLVED' ? closed(unresolved)
      : verdict === 'PASS' ? `${subject} met the signed bar against the hand-written skill on ${mine.length === 1 ? 'the one required axis' : `all ${mine.length} required axes`}. ${each}`
        : `${subject} did not meet the signed bar against the hand-written skill: ${missed.map((x) => x.axis).join(', ')} not reached. ${each}`;
    return { ...base, requiredAxes: cfg.requiredAxes ?? null, verdict, sentence, axes: [...given.map(axisSentence), ...absent.map((n) => `${n}: required, and not given.`)] };
  }
  const all = [E.P1, ...(E.P2 ?? []), ...(E.P3 ?? []), ...(E.P4 ?? []), E.P5, E.P6, ...(E.HARM ?? []), E.PREF].filter(Boolean);
  const failed = all.filter((e) => e.pass === false);
  const unresolved = tooFew ?? E.P5?.unresolved ?? null;
  const verdict = unresolved ? 'UNRESOLVED' : failed.length ? 'FAIL' : 'PASS';
  const subject = `On ${valid} ${cfg.claim === 'A-w' ? 'writing briefs' : 'coding tasks'} it never saw, ${subjectOf(cfg)}`;
  const sentence = verdict === 'UNRESOLVED' ? closed(unresolved)
    // "Scored higher" is said only when it was shown: the lower bound of the difference against every baseline is above zero.
    : verdict === 'PASS' ? `${subject} ${E.P2[0].lo95 > 0 ? `scored higher overall than the hand-written skill (+${E.P2[0].mean}, lower bound +${E.P2[0].lo95})` : 'was not worse overall than the hand-written skill'}${E.P2[1] ? (E.P2[1].lo95 > 0 ? ` and higher than the strongest baseline (+${E.P2[1].mean})` : ' and was not worse than the strongest baseline') : ''}, no quality dimension${E.P4 ? ', blocker rate' : ''}${E.P6 ? ' or requested depth' : ''} showed a clear loss${E.PREF ? `, readers chose its piece ${Math.round((E.PREF.mean ?? 0) * 100)}% of the time` : ''}, and it held the shared required rules more often. This is not a result for each dimension separately.`
      : failed.map((e) => `${subject} failed "${e.what}": ${e.mean} (bounds ${e.lo95 ?? e.lo975} to ${e.hi95 ?? e.hi975}), where the bar was ${e.bar}.`).join(' ');
  return { ...base, verdict, sentence };
}

// RUN AS A SCRIPT only when this file is the one node was started on. The two paths are compared as real paths: node
// resolves a symlink for the module and not for the argument, and on a path through one (macOS /tmp) a textual
// comparison never matched, so the script exited 0 having written nothing.
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const file = arg('--config') ?? fail('missing --config');
  let cfg;
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`the config ${file} cannot be read (${e.code ?? String(e.message).split('\n')[0]}). Nothing was written.`); }
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) fail(`the config ${file} is not a JSON object. Nothing was written.`);
  if (cfg.arm !== undefined && cfg.arm !== 'plug-in' && cfg.arm !== 'runtime') fail(`the config's "arm" is ${JSON.stringify(cfg.arm)}: it is "plug-in" or "runtime", the Atelier arm that is the candidate. Nothing was written.`);
  if (process.argv.includes('--disagreements') && !arg('--disagreements')) fail('--disagreements needs a file to write. Nothing was written.');
  if (arg('--disagreements') && cfg.reads?.length !== 2) fail(`--disagreements writes the answers on which two judge reads disagree, and the config has no "reads": [fileA, fileB] to compare. Add the two reads to ${file}, or leave --disagreements out. Nothing was written.`);
  // EVERY FILE THE CONFIG NAMES IS READ THROUGH HERE, and a file that is not there is said in one line, by name. An
  // axis file is the one exception: the analysis catches that itself and reports the axis as not covered.
  class LoadError extends Error { constructor(f, e) { super(`the config names ${f}, and it cannot be read (${e.code ?? String(e.message).split('\n')[0]})`); this.code = e.code ?? 'not JSON'; } }
  const load = (f) => { try { return jsonl(resolve(dirname(file), f)); } catch (e) { throw new LoadError(f, e); } };
  let result;
  try { result = analyse(cfg, load); } catch (e) {
    if (e instanceof LoadError) fail(`${e.message}. Paths are relative to the config (${dirname(resolve(file))}); check it and run again. Nothing was written.`);
    fail(`the config ${file} could not be analysed: ${String(e?.message ?? e).split('\n')[0]}. Check it against the fields in this script's header. Nothing was written.`);
  }
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(result, null, 1));
  if (arg('--disagreements') && result.endpoints.judgeNoise) writeFileSync(arg('--disagreements'), `${result.endpoints.judgeNoise.toReview.map((r) => JSON.stringify(r)).join('\n')}\n`);
  console.log(JSON.stringify(result, null, 1));
}
