#!/usr/bin/env node
// bench/compare/axes.mjs — FROM THE RAW READINGS TO THE AXIS FILES THE SIGNED BAR IS READ ON.
//
// Sealed with studies/CLOSING_A_PREREGISTRATION.md and studies/CLOSING_AW_PREREGISTRATION.md, beside
// bench/compare/closing-quality.mjs. The bar (decision 0012) counts failures on four axes, and what counts as a
// failure is only as fixed as the file that says which answers failed. Built by hand after the outputs exist, each
// of those files is a choice: which read of the judge to believe, what to do with an answer one file lacks, when two
// outputs "differ". So the choices are made here, before the run, and input that does not fit stops the run (exit 2)
// naming the row, instead of being thinned. No model call, and no statistic: this script only says, answer by
// answer, failed or not. closing-quality.mjs reads the result.
//
//   node bench/compare/axes.mjs --config <axes.json> --out <dir>
//
// axes.json (every path relative to the config):
//   claim        "A" (coding answers) or "A-w" (writing)
//   tasks        file of {id, ...}, one sealed task a line
//   trials       outputs per task per arm, numbered 1 to n; at least 2, or nothing could be repeated
//   candidate    the Atelier arm's `condition` label
//   handwritten  the hand-written skill's `condition` label
//   others       [labels] of arms the input files also hold and this script does not read (optional). A row under
//                any other label is refused
//   reads        [fileA, fileB]: the two judge reads of the same answers
//                  claim A    {case_id, trial, condition, blocker (bool), ...}: the benchmark's score rows
//                  claim A-w  {case_id, trial, condition, <one number for each dimension of the rubric>, ...}: what
//                             bench/compare/rubric-judge.mjs writes
//   rubric       file (claim A-w): its `dimensions` are summed and the sum is held against its `threshold`
//                (bench/compare/rubrics/stop-slop.json: five dimensions, threshold 35)
//   modes        file (claim A): what bench/compare/failure-modes.mjs writes,
//                {case_id, trial, condition, F1, F2, F3, F4, failed, unread, by}
//   resolutions  file (claim A, optional): {case_id, trial, condition, blocker (bool)}: a person's decision on an
//                answer whose two judge reads disagree on the blocker (closing-quality.mjs --disagreements lists them)
//   verify       file: {case_id, trial, condition, broken (bool), rules?: [ids], delivered?: (bool)}: the answer
//                breaks a measured REQUIRED rule, as bench/compare/verify-rows.mjs writes it from `atelier verify`.
//                `delivered: false` is a strict refusal: the person got no answer. A row without `delivered` (a file
//                written before the field existed) is read as delivered
//
// WHAT IT WRITES, in <dir>, each row {case_id, trial, condition, failed (bool)}, for the two arms only:
//   quality.jsonl        one row an answer. An answer that was not delivered is failed, on either claim: there is
//                        no text for a judge to read, so the judge reads need no row for it (the benchmark's scorer
//                        skips a refusal) and a row they do hold for it decides nothing.
//                          claim A    failed when the answer has a blocker or a named failure mode. The blocker is
//                                     the one both judge reads agree on; where the two reads disagree, the person's
//                                     resolution is the blocker. A disagreement with no resolution is refused, and
//                                     so is a resolution for an answer the reads agree on. A named failure mode is
//                                     the `failed` of the modes row, alone enough.
//                          claim A-w  failed when the sum of the rubric's dimensions is under the threshold on BOTH
//                                     reads. Under it on one read only is not a failure.
//   rule-anchor.jsonl    one row an answer: failed when the verify row says `broken`. A refusal is `broken`.
//   repeatability.jsonl  one row a task and arm, `trial: 1`: failed when the task's outputs differ.
//                          both claims  on delivery: some outputs delivered and some refused. This alone fails the
//                                       task, whatever the quality and rule verdicts of its outputs
//                          claim A      on quality (failed or not, as written to quality.jsonl) or on the rule verdict
//                          claim A-w    on the rule verdict, which is all its pre-registration counts beside delivery
//                        The rule verdict is the set of rules broken where the verify rows list them (`rules`), so
//                        two outputs that break different rules differ; without the list it is `broken` alone.
//
// VOICE IS NOT BUILT HERE. It is read by people, blind, and their choices are the axis file as they stand:
// {case_id, reader, chose: "candidate" | "comparator"}, described in closing-quality.mjs.
//
// DELIVERED AGAINST REFUSED, UNDER STRICT DELIVERY. The pre-registration of claim A counts a task delivered once and
// refused once as not repeated. The delivery state is read from the verify rows (`delivered`), so such a task fails
// repeatability for its arm even when the delivered answer failed quality and broke a rule too, where both outputs
// would otherwise read alike. A task refused every time is in one state and is not failed here on delivery: each of
// its refusals is already a failed answer on quality and on the rule anchor.
//
// EVERY INPUT IS CHECKED WHOLE BEFORE ANYTHING IS WRITTEN. For both arms, each of the reads, the modes and the verify
// rows must hold every task of the tasks file at every trial, once (the reads alone may lack an answer that was not
// delivered): a task or trial missing for an arm, a row twice,
// a task that is not in the tasks file, a label that is neither arm nor listed in `others`, a value of the wrong
// type, or a failure-mode check that nobody read on an answer not already failed, stops the run. An answer that
// could not be read is a reading to finish, never a row to leave out.
//
// <dir> is this script's own: it must not be the config's directory or hold any input file, and what an earlier run
// wrote there is removed first, so a run that stops never leaves an older, complete set for the next command. The
// places are compared as real paths, symlinks resolved: a <dir> that is a link to the inputs' folder is that folder,
// and written there the axis files once replaced an input of the same name.
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readJsonl, writeJsonl, opt, die, realPath, outputClash } from './lib.mjs';

const USAGE = 'usage: axes.mjs --config <axes.json> --out <dir>';
const args = process.argv.slice(2);
let configPath; let outArg;
try { configPath = opt(args, 'config'); outArg = opt(args, 'out'); } catch (e) { die(`${e.message}\n${USAGE}`); }
if (!configPath || !outArg) die(USAGE);
const base = dirname(resolve(configPath)); const outDir = resolve(outArg);
const at = (f) => resolve(base, f);
const FILES = ['quality.jsonl', 'rule-anchor.jsonl', 'repeatability.jsonl'];

// ── THE CONFIG, CHECKED WHOLE BEFORE ANYTHING IS READ OR WRITTEN ───────────────────────────────────
let cfg;
try { cfg = JSON.parse(readFileSync(configPath, 'utf8')); } catch (e) { die(`the config is not readable: ${e.message.split('\n')[0]}`); }
if (cfg === null || typeof cfg !== 'object') die('the config is not an object');
if (cfg.claim !== 'A' && cfg.claim !== 'A-w') die('config.claim must be "A" or "A-w"');
const A = cfg.claim === 'A';
for (const k of ['tasks', 'candidate', 'handwritten', 'verify']) if (typeof cfg[k] !== 'string' || !cfg[k]) die(`config needs "${k}"`);
if (!Number.isInteger(cfg.trials) || cfg.trials < 2) die('config.trials must be a whole number of at least 2: repeatability compares a task\'s outputs');
if (cfg.candidate === cfg.handwritten) die('config.candidate and config.handwritten are the same label');
if (!Array.isArray(cfg.reads) || cfg.reads.length !== 2 || cfg.reads.some((f) => typeof f !== 'string' || !f)) die('config.reads must name the two judge reads');
if (cfg.others !== undefined && (!Array.isArray(cfg.others) || cfg.others.some((l) => typeof l !== 'string'))) die('config.others must be a list of labels');
const arms = [cfg.candidate, cfg.handwritten]; const others = new Set(cfg.others ?? []);
for (const l of arms) if (others.has(l)) die(`config.others lists "${l}", which is one of the two arms read`);
if (A && typeof cfg.modes !== 'string') die('claim A needs "modes", the file failure-modes.mjs wrote');
if (A && cfg.rubric !== undefined) die('"rubric" is for claim A-w: claim A reads the blocker and the failure modes');
if (!A && typeof cfg.rubric !== 'string') die('claim A-w needs "rubric", the rubric the judge used');
if (!A && (cfg.modes !== undefined || cfg.resolutions !== undefined)) die('"modes" and "resolutions" are for claim A: claim A-w reads the rubric\'s threshold');
if (cfg.resolutions !== undefined && typeof cfg.resolutions !== 'string') die('config.resolutions must be a file');

// NO INPUT MAY SIT IN --out, which this script clears and rewrites. Real paths on both sides: see the header.
const realOut = realPath(outDir);
const through = realOut === outDir ? '' : ` (through a link, --out is ${realOut})`;
if (outputClash({ dir: outDir, inputs: [base, resolve(configPath)] })?.how === 'holds') die(`--out must be a directory of its own${through}: this script clears and rewrites what it finds there, and the config's inputs are beside the config. Name a new directory, for instance one inside the config's.`);
for (const f of [cfg.tasks, ...cfg.reads, cfg.rubric, cfg.modes, cfg.resolutions, cfg.verify].filter((x) => typeof x === 'string')) {
  const clash = outputClash({ dir: outDir, files: FILES.map((name) => join(outDir, name)), inputs: [at(f)] });
  if (clash?.how === 'file') die(`${f} is ${clash.real}, which is also one of the files this script writes in --out${through}. Nothing was written. Name another --out.`);
  if (clash) die(`${f} is inside --out${through}, which this script clears and rewrites. Keep the config's files outside it, or name another --out. Nothing was written.`);
}
mkdirSync(outDir, { recursive: true });
for (const f of FILES) rmSync(join(outDir, f), { force: true });

const rowsOf = (what, f) => { try { return readJsonl(at(f)); } catch (e) { return die(`${what}: ${f} is not readable as one JSON object a line (${e.code ?? e.message.split('\n')[0]})`); } };
const tasks = rowsOf('tasks', cfg.tasks).map((t, i) => (t !== null && typeof t === 'object' && typeof t.id === 'string' && t.id ? t.id : die(`tasks ${cfg.tasks}: row ${i + 1} is not a task with an id`)));
if (!tasks.length) die(`tasks ${cfg.tasks}: no task`);
const known = new Set(tasks);
if (known.size !== tasks.length) die(`tasks ${cfg.tasks}: ${tasks.find((id, i) => tasks.indexOf(id) !== i)} appears twice`);
const key = (r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}`;

/**
 * One file's rows for the two arms, each checked and reduced by `value`, keyed by task, trial and arm. `whole`: every
 * task and trial must be there, or (a function of the key) every one it says is needed.
 */
function table(what, f, value, whole = true) {
  const out = new Map();
  rowsOf(what, f).forEach((r, i) => {
    const row = `${what} ${f}: row ${i + 1}`;
    if (r === null || typeof r !== 'object' || Array.isArray(r)) die(`${row} is not an object`);
    if (others.has(r.condition)) return;
    if (!arms.includes(r.condition)) die(`${row} has condition ${JSON.stringify(r.condition)}, which is neither arm ("${arms.join('", "')}") nor listed in "others"`);
    if (!known.has(r.case_id)) die(`${row} is for ${JSON.stringify(r.case_id)}, which is not a task of ${cfg.tasks}`);
    if (!Number.isInteger(r.trial) || r.trial < 1 || r.trial > cfg.trials) die(`${row} (${r.case_id}, ${r.condition}) has trial ${JSON.stringify(r.trial)}; trials are numbered 1 to ${cfg.trials}`);
    const which = `${r.case_id} trial ${r.trial} (${r.condition})`;
    if (out.has(key(r))) die(`${what} ${f}: ${which} appears twice (row ${i + 1})`);
    out.set(key(r), value(r, `${what} ${f}: ${which}`));
  });
  if (whole) for (const condition of arms) for (const case_id of tasks) for (let trial = 1; trial <= cfg.trials; trial++) {
    if (typeof whole === 'function' && !whole(key({ case_id, trial, condition }))) continue;
    if (!out.has(key({ case_id, trial, condition }))) die(`${what} ${f}: ${case_id} trial ${trial} is missing for "${condition}". Every task and trial of both arms is read, or the axis is not built.`);
  }
  return out;
}
const bool = (name) => (r, which) => (typeof r[name] === 'boolean' ? r[name] : die(`${which} has \`${name}\` ${JSON.stringify(r[name])}, which is not true or false`));
const answers = arms.flatMap((condition) => tasks.flatMap((case_id) => Array.from({ length: cfg.trials }, (_, i) => ({ case_id, trial: i + 1, condition }))));

// ── RULE ANCHOR, AND WHETHER EACH ANSWER WAS DELIVERED ─────────────────────────────────────────────
// Read first: quality and repeatability both need to know which answers a person never got.
const verify = table('verify', cfg.verify, (r, which) => {
  const broken = bool('broken')(r, which);
  // A file written before `delivered` existed has no such field on any row: every answer in it is read as delivered.
  const delivered = r.delivered === undefined ? true : bool('delivered')(r, which);
  if (!delivered && !broken) die(`${which} has \`delivered\` false and \`broken\` false: a refusal is a failed answer on the rule anchor. Write the row as bench/compare/verify-rows.mjs does, by running it again on the responses.`);
  if (r.rules === undefined) return { broken, delivered, verdict: String(broken) };
  if (!Array.isArray(r.rules) || r.rules.some((x) => typeof x !== 'string')) die(`${which} has \`rules\` that is not a list of rule ids`);
  if (broken !== r.rules.length > 0) die(`${which} has \`broken\` ${broken} and ${r.rules.length} rule(s) listed`);
  return { broken, delivered, verdict: JSON.stringify([...r.rules].sort()) };
});
const delivered = (k) => verify.get(k).delivered;

// ── QUALITY ────────────────────────────────────────────────────────────────────────────────────────
// An answer that was not delivered is failed and has nothing for a judge to read: the reads need no row for it.
let failedQuality; let note = '';
if (A) {
  const [one, two] = cfg.reads.map((f, i) => table(`judge read ${i + 1}`, f, bool('blocker'), delivered));
  const modes = table('failure modes', cfg.modes, (r, which) => {
    const checks = ['F1', 'F2', 'F3', 'F4'].map((k) => (r[k] === null || typeof r[k] === 'boolean' ? r[k] : die(`${which} has \`${k}\` ${JSON.stringify(r[k])}, which is not true, false or null`)));
    const failed = bool('failed')(r, which);
    if (failed !== checks.some((x) => x === true)) die(`${which} has \`failed\` ${failed}, which is not what its checks F1 to F4 say`);
    // A check nobody read is not a pass. On an answer that already failed another check it changes nothing.
    if (!failed && checks.some((x) => x === null)) die(`${which} has a check that nobody read (null) and no failure: remove the row from ${cfg.modes} and run failure-modes.mjs again with a reader`);
    return failed;
  });
  const resolved = cfg.resolutions === undefined ? new Map() : table('resolutions', cfg.resolutions, bool('blocker'), false);
  const differ = answers.filter((r) => delivered(key(r)) && one.get(key(r)) !== two.get(key(r)));
  const open = new Set(differ.map(key));
  for (const k of resolved.keys()) if (!open.has(k)) die(`resolutions ${cfg.resolutions}: ${k.split('\u0000').slice(0, 2).join(' trial ')} (${k.split('\u0000')[2]}) is resolved, and ${delivered(k) ? 'the two judge reads agree on its blocker' : 'the answer was not delivered, so it is failed without a judge'}. A person decides only where the reads disagree: remove the row.`);
  for (const r of differ) if (!resolved.has(key(r))) die(`${r.case_id} trial ${r.trial} (${r.condition}): the two judge reads disagree on the blocker and ${cfg.resolutions === undefined ? 'the config names no "resolutions" file' : `${cfg.resolutions} has no row for it`}. A person decides it: {case_id, trial, condition, blocker}.`);
  failedQuality = new Map(answers.map((r) => [key(r), !delivered(key(r)) || (open.has(key(r)) ? resolved.get(key(r)) : one.get(key(r))) || modes.get(key(r))]));
  note = ` · ${differ.length} of ${answers.length} blockers decided by a person`;
} else {
  let rubric;
  try { rubric = JSON.parse(readFileSync(at(cfg.rubric), 'utf8')); } catch (e) { die(`the rubric ${cfg.rubric} is not readable (${e.code ?? e.message.split('\n')[0]})`); }
  const dims = Array.isArray(rubric?.dimensions) ? rubric.dimensions.map((d) => d?.name) : [];
  if (!dims.length || dims.some((d) => typeof d !== 'string')) die(`the rubric ${cfg.rubric} names no dimensions`);
  if (typeof rubric.threshold !== 'number' || !Number.isFinite(rubric.threshold)) die(`the rubric ${cfg.rubric} has no \`threshold\``);
  // THE SCORE IS THE SUM OF THE RUBRIC'S DIMENSIONS, each as the judge gave it: the comparator's own total and line.
  const total = (r, which) => dims.reduce((s, d) => s + (typeof r[d] === 'number' && Number.isFinite(r[d]) ? r[d] : die(`${which} has no number for "${d}"`)), 0);
  const [one, two] = cfg.reads.map((f, i) => table(`judge read ${i + 1}`, f, total, delivered));
  failedQuality = new Map(answers.map((r) => [key(r), !delivered(key(r)) || (one.get(key(r)) < rubric.threshold && two.get(key(r)) < rubric.threshold)]));
  note = ` · under ${rubric.threshold} on both reads`;
}

// ── REPEATABILITY: a task's outputs, one arm at a time ─────────────────────────────────────────────
const same = (xs) => xs.every((x) => x === xs[0]);
const splits = new Map();
const repeatability = arms.flatMap((condition) => tasks.map((case_id) => {
  const outputs = Array.from({ length: cfg.trials }, (_, i) => key({ case_id, trial: i + 1, condition }));
  // DELIVERED AGAINST REFUSED IS A DIFFERENCE BY ITSELF, read before any verdict: see the header.
  const split = !same(outputs.map(delivered));
  const differs = split || !same(outputs.map((k) => verify.get(k).verdict)) || (A && !same(outputs.map((k) => failedQuality.get(k))));
  if (split) splits.set(condition, (splits.get(condition) ?? 0) + 1);
  return { case_id, trial: 1, condition, failed: differs };
}));

const quality = answers.map((r) => ({ ...r, failed: failedQuality.get(key(r)) }));
const ruleAnchor = answers.map((r) => ({ ...r, failed: verify.get(key(r)).broken }));
writeJsonl(join(outDir, 'quality.jsonl'), quality);
writeJsonl(join(outDir, 'rule-anchor.jsonl'), ruleAnchor);
writeJsonl(join(outDir, 'repeatability.jsonl'), repeatability);
const line = (rows, unit) => arms.map((l) => { const mine = rows.filter((r) => r.condition === l); return `"${l}" ${mine.filter((r) => r.failed).length} of ${mine.length} ${unit} failed`; }).join(', ');
console.error(`quality: ${line(quality, 'answers')}${note}`);
console.error(`rule anchor: ${line(ruleAnchor, 'answers')}`);
const refusedAnswers = answers.filter((r) => !delivered(key(r))).length;
console.error(`repeatability: ${line(repeatability, 'tasks')}${splits.size ? ` · delivered on some outputs and refused on others: ${arms.filter((l) => splits.has(l)).map((l) => `"${l}" ${splits.get(l)} task(s)`).join(', ')}` : ''}`);
if (refusedAnswers) console.error(`${refusedAnswers} of ${answers.length} answers were not delivered (\`delivered: false\` in ${cfg.verify}): each is a failed answer on quality and on the rule anchor.`);
console.error(`voice is not built here: people read it blind, and their choices {case_id, reader, chose} are the fourth axis file. Wrote ${FILES.join(', ')} in ${outDir}.`);
