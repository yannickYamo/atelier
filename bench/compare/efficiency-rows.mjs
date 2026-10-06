#!/usr/bin/env node
// bench/compare/efficiency-rows.mjs — FROM EACH ARM'S ANSWERS TO THE ROWS THE SELECTION RULE READS.
//
// Sealed with studies/EFFICIENCY_ABLATION_PREREGISTRATION.md, beside bench/compare/efficiency-select.mjs. The rule is
// only as fixed as the rows it is handed: which label an answer carries, which skill wrote it, what counts as a
// broken rule, how five rubric dimensions become one score. Left to the tester, each of those is a choice made after
// the outputs exist, so they are made here, and anything that does not fit stops the run (exit 2) instead of
// thinning it. No model call: `atelier verify` is run offline.
//
//   node bench/compare/efficiency-rows.mjs --plan <plan.json> --stage merge --out <dir>
//       one file per domain, <dir>/<domain>-responses.jsonl, every arm's answers under its own label, for the judge
//   node bench/compare/efficiency-rows.mjs --plan <plan.json> --stage rows  --out <dir>
//       <dir>/<domain>-sizes.json, -exports.json, -rules.jsonl, -quality-<n>.jsonl, and <dir>/ablation.json for
//       efficiency-select.mjs
//
// <dir> is the scripts' own: it must not hold the plan or any file the plan names, and each stage first removes what
// an earlier run wrote there (the merge stage removes the rows stage's files too), so a run that stops, or answers
// merged again, never leave an older, complete result for the next command to read. The places are compared as real
// paths, symlinks resolved: a <dir> that is a link to the plan's folder is that folder, and is refused as it.
//
// plan.json (every path relative to the plan):
//   reference, arms, defaultable, margins, minTasks, ceiling   copied into ablation.json as sealed
//   margins.rulesPerOutput   required here, a number of rules per output, 0 or more: every rules row this script
//                            writes lists the rules broken, and efficiency-select.mjs then needs this tolerance. It is
//                            asked for at the merge stage, before the judge is paid, and copied through with `margins`
//   plannedTasks  (optional) the whole number of tasks per domain the study was planned at, copied into ablation.json.
//                 `minTasks` under 90% of it (rounded down) is refused: a study planned at N is not read on far fewer
//   trials       outputs per task per arm, numbered 1 to n
//   domains      [{ name,                                letters, digits and hyphens: it names the files written
//                   skill, data,                         the built skill and its ATELIER_DATA, for `atelier verify`
//                   tasks:     file of {id, prompt}
//                   exports:   {label: file}             what `atelier export --out` wrote for each arm
//                   responses: {label: file}             one `bench/compare/run.mjs --out` file per arm. An arm whose
//                                                        export serves the same text as an earlier arm's has no file:
//                   sameAs:    {label: earlier label}    it is read once, on the earlier arm's answers and scores
//                   judged:    [files]                   (rows stage) `rubric-judge.mjs --out`, one file a pass
//                   rubric:    file                      the rubric the judge used: its dimensions are summed
//                   voice:     file | null               choices by a reader qualified on this domain, or null
//                   excluded:  [task ids] }]             dropped for every arm; say why in the report
//
// WHY ONE RESPONSES FILE PER ARM. `run.mjs` labels every skill arm "candidate" and resumes by case, trial and that
// label, so two arms written to one file are one arm: the second is skipped as done. Each arm is run to its own file
// and given its label here. The judge shuffles its labels by a hash of the condition, so the arms must carry their
// own before judging, or every arm keeps one position.
//
// AN ANSWER BELONGS TO THE SKILL THAT WROTE IT. `run.mjs` records on every row the sha256 of the skill text it sent
// (front matter stripped), the tasks file, the model, the token limit and where the skill was placed. Each row is
// checked against the export filed under its label, and the settings must be one and the same across every arm of a
// domain: two response files swapped in the plan would otherwise hand each arm the other's verdict.
//
// EVERY ARM OF A DOMAIN IS BUILT FROM ONE STANDARD (decision 0014: no standard may move between arms). An export
// names the standard it was compiled from, on the line the renderer writes: "This is a compiled output; the authority
// record is StandardVersion <hash>." The hash is read from each arm's export. An export without the line is refused,
// and so is a domain whose arms name different hashes: arms of two standards differ in what they are held to, not
// only in size, and the comparison would credit the size with it. The hash is written per domain into
// <domain>-exports.json, {<label>: sha256 of the text served, ..., "standard": <hash>}, and printed on stdout, one
// line a domain. An arm cannot be labelled "standard", which is that file's own key.
//
// TWO ARMS THAT SERVE THE SAME TEXT ARE ONE SKILL, compared with front matter stripped, as the model receives it.
// Answers written twice for one skill would differ by chance and give its two labels different verdicts, so such
// arms must be declared (`sameAs`) and are then read once: one set of answers, judged once, its verdicts and scores
// copied to the other label.
//
// WHAT COUNTS AS A BROKEN RULE. `atelier verify --skill <skill> --json --claims pattern --allow-unsourced`, offline: an
// answer is broken when a line verify reports as REQUIRED reads VIOLATED. Those are the author's measured rules, and
// with them what the product itself holds a skill to: the format's hard limits when the skill has a document class,
// and phrases the skill has learned to refuse. The same lines for every arm. The check for invented specifics is
// left out on purpose (`--allow-unsourced`): a plug-in answer is written with no material bound, so that check flags
// most answers of every arm alike and would drown the reading. An answer verify cannot check stops the run, naming it.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl, writeJsonl, sha256, opt, die, stripFrontmatter, realPath, outputClash } from './lib.mjs';

const USAGE = 'usage: efficiency-rows.mjs --plan <plan.json> --stage merge|rows --out <dir>';
const args = process.argv.slice(2);
const planPath = opt(args, 'plan') ?? die(USAGE);
const stage = opt(args, 'stage'); const outArg = opt(args, 'out');
if (!['merge', 'rows'].includes(stage) || !outArg) die(USAGE);
const CLI = fileURLToPath(new URL('../../dist/cli/atelier.mjs', import.meta.url));
if (!existsSync(CLI)) die(`${CLI} is missing: run \`npm run build\` first`);
const base = dirname(resolve(planPath)); const outDir = resolve(outArg);
// Real paths on both sides: an --out that is a link to the plan's folder is that folder (see the header).
const realOut = realPath(outDir);
const through = realOut === outDir ? '' : ` (through a link, --out is ${realOut})`;
if (outputClash({ dir: outDir, inputs: [base, resolve(planPath)] })?.how === 'holds') die(`--out must be a directory of its own${through}: this script clears and rewrites what it finds there, and the plan's inputs are beside the plan. Name a new directory, for instance one inside the plan's.`);
const at = (f) => resolve(base, f);
const read = (what, f) => { try { return readFileSync(at(f), 'utf8'); } catch (e) { return die(`${what}: cannot read ${f} (${e.code ?? e.message})`); } };
const rowsOf = (what, f) => { try { return readJsonl(at(f)); } catch (e) { return die(`${what}: ${f} is not readable as one JSON object a line (${e.message.split('\n')[0]})`); } };
const key = (r) => `${r.case_id}\u0000${r.trial}`;
const words = (text) => { const t = text.trim(); return t ? t.split(/\s+/).length : 0; };

// ── THE PLAN, CHECKED WHOLE BEFORE ANYTHING IS READ OR WRITTEN ─────────────────────────────────────
let plan;
try { plan = JSON.parse(readFileSync(planPath, 'utf8')); } catch (e) { die(`the plan is not readable: ${e.message.split('\n')[0]}`); }
for (const k of ['reference', 'arms', 'defaultable', 'margins', 'minTasks', 'ceiling', 'trials', 'domains']) if (plan[k] === undefined || plan[k] === null) die(`plan needs "${k}"`);
if (!Number.isInteger(plan.trials) || plan.trials < 1) die('plan.trials must be a whole number of at least 1');
if (!Array.isArray(plan.arms) || !plan.arms.length || plan.arms.some((a) => typeof a !== 'string') || new Set(plan.arms).size !== plan.arms.length || plan.arms.includes(plan.reference)) die('plan.arms must list each arm once, and not the reference');
if (!Array.isArray(plan.domains) || !plan.domains.length) die('plan.domains must list at least one domain');
const labels = [plan.reference, ...plan.arms];
if (labels.includes('standard')) die('an arm cannot be labelled "standard": <domain>-exports.json keeps the standard\'s hash under that key. Give the arm another label.');
// THE TOLERANCES THE RULE NEEDS ARE ASKED FOR NOW, at the merge stage, before a judge is paid for rows it could not read.
const perOutput = plan.margins?.rulesPerOutput;
if (perOutput === undefined) die('plan.margins needs "rulesPerOutput": how many more required rules per output than the reference an arm may break (for instance 0.25). The rows written here list the rules each answer breaks, and efficiency-select.mjs refuses them without this tolerance. Seal it with the other margins.');
if (typeof perOutput !== 'number' || !Number.isFinite(perOutput) || perOutput < 0) die(`plan.margins.rulesPerOutput is ${JSON.stringify(perOutput)}: it must be a number of rules per output, 0 or more`);
if (plan.plannedTasks !== undefined) {
  if (!Number.isInteger(plan.plannedTasks) || plan.plannedTasks < 1) die(`plan.plannedTasks is ${JSON.stringify(plan.plannedTasks)}: it must be a whole number of tasks, at least 1`);
  if (Number.isInteger(plan.minTasks) && plan.minTasks < Math.floor((plan.plannedTasks * 9) / 10)) die(`plan.minTasks is ${plan.minTasks} and the study was planned at ${plan.plannedTasks} tasks a domain: a study planned at ${plan.plannedTasks} must not be read on far fewer. Set minTasks to at least ${Math.floor((plan.plannedTasks * 9) / 10)} (90% of the plan, rounded down), or correct plannedTasks.`);
}
const names = new Set();
for (const d of plan.domains) {
  if (typeof d?.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(d.name)) die('each domain needs a name of lower-case letters, digits and hyphens: it names the files written');
  if (names.has(d.name)) die(`two domains are called "${d.name}": the second would overwrite the first's rows`);
  names.add(d.name);
  for (const k of ['skill', 'data', 'tasks']) if (typeof d[k] !== 'string' || !d[k]) die(`${d.name}: needs "${k}"`);
  if (!d.exports || !d.responses) die(`${d.name}: needs "exports" and "responses"`);
  if (d.excluded !== undefined && (!Array.isArray(d.excluded) || d.excluded.some((x) => typeof x !== 'string'))) die(`${d.name}: "excluded" must be a list of task ids`);
  if (stage === 'rows') {
    if (!Array.isArray(d.judged) || !d.judged.length) die(`${d.name}: needs "judged", the files rubric-judge.mjs wrote`);
    if (typeof d.rubric !== 'string') die(`${d.name}: needs "rubric"`);
  }
}

// NO INPUT OF THE PLAN MAY SIT IN --out. This script removes what an earlier run wrote there before it writes again,
// and it writes files named after the domain: a judge's file a tester had put there under such a name would be
// deleted before it was read, with the judging already paid for.
const outputsOf = (name) => [`${name}-responses.jsonl`, `${name}-sizes.json`, `${name}-exports.json`, `${name}-rules.jsonl`, `${name}-voice.jsonl`, ...Array.from({ length: 9 }, (_, i) => `${name}-quality-${i + 1}.jsonl`)];
const written = [...plan.domains.flatMap((d) => outputsOf(d.name)), 'ablation.json', 'result.json'].map((f) => join(outDir, f));
for (const d of plan.domains) {
  const inputs = [d.tasks, ...Object.values(d.exports), ...Object.values(d.responses), ...(d.judged ?? []), d.rubric, d.voice].filter((f) => typeof f === 'string');
  for (const f of inputs) {
    const clash = outputClash({ dir: outDir, files: written, inputs: [at(f)] });
    if (clash?.how === 'file') die(`${d.name}: ${f} is ${clash.real}, which is also one of the files this script writes in --out${through}. Nothing was written. Name another --out.`);
    if (clash) die(`${d.name}: ${f} is inside --out${through}, which this script clears and rewrites. Keep the plan's files outside it, or name another --out. Nothing was written.`);
  }
  // The skill's ATELIER_DATA is an input too: --out is not put inside it, nor it inside --out.
  if (outputClash({ dir: outDir, inputs: [at(d.data)] })) die(`${d.name}: --out${through} and the skill's data directory ${d.data} are one inside the other. This script clears and rewrites --out: name a directory outside the data.`);
}

/** Each label's root: itself, or the earlier arm it is declared the same as. Chains are followed; a cycle is refused. */
function rootsOf(d) {
  const sameAs = d.sameAs ?? {};
  for (const [l, other] of Object.entries(sameAs)) if (!labels.includes(l) || !labels.includes(other)) die(`${d.name}: "sameAs" names "${l}" and "${other}", and both must be arms of the plan`);
  return new Map(labels.map((l) => {
    let at0 = l; const seen = new Set([l]);
    while (sameAs[at0] !== undefined) { at0 = sameAs[at0]; if (seen.has(at0)) die(`${d.name}: "sameAs" goes round in a circle at "${at0}"`); seen.add(at0); }
    return [l, at0];
  }));
}

/** One domain's answers, one set per skill actually served, each checked against its export and the plan's tasks and trials. */
function answersOf(d) {
  const excluded = new Set(d.excluded ?? []);
  const all = rowsOf(`${d.name} tasks`, d.tasks).map((t) => (t !== null && typeof t === 'object' && typeof t.id === 'string' ? t.id : die(`${d.name} ${d.tasks}: a line is not a task with an id`)));
  for (const id of excluded) if (!all.includes(id)) die(`${d.name}: "${id}" is excluded and is not a task of this domain`);
  const tasks = all.filter((id) => !excluded.has(id));
  const root = rootsOf(d);
  // The text each arm serves a model: the export with its front matter stripped, as `run.mjs` strips it.
  const served = new Map(labels.map((l) => [l, sha256(stripFrontmatter(read(`${d.name} export of "${l}"`, d.exports[l] ?? die(`${d.name}: no export for "${l}"`))))]));
  // ONE STANDARD FOR EVERY ARM: the hash each export names as its authority record.
  const STANDARD = /^This is a compiled output; the authority record is StandardVersion (\S+)\.[ \t]*\r?$/gm;
  const standardOf = new Map(labels.map((l) => {
    const found = [...new Set([...read(`${d.name} export of "${l}"`, d.exports[l]).matchAll(STANDARD)].map((m) => m[1]))];
    if (!found.length) die(`${d.name}: the export of "${l}" (${d.exports[l]}) has no line "This is a compiled output; the authority record is StandardVersion <hash>.", so the standard it was built from cannot be read. File the export as \`atelier export --out\` wrote it, unedited.`);
    if (found.length > 1) die(`${d.name}: the export of "${l}" (${d.exports[l]}) names ${found.length} standards (${found.join(', ')}). File the export as \`atelier export --out\` wrote it, unedited.`);
    return [l, found[0]];
  }));
  const standard = standardOf.get(plan.reference);
  if (labels.some((l) => standardOf.get(l) !== standard)) die(`${d.name}: the arms were not built from one standard (${labels.map((l) => `"${l}": ${standardOf.get(l)}`).join(', ')}). No standard may move between arms: decision 0014. Build every arm from the same approved standard and export it again.`);
  for (const l of labels) if (served.get(l) !== served.get(root.get(l))) die(`${d.name}: "${l}" is declared the same as "${root.get(l)}", and their exports serve different text`);
  for (let i = 0; i < labels.length; i++) for (let j = 0; j < i; j++) {
    const [a, b] = [labels[j], labels[i]];
    if (served.get(a) === served.get(b) && root.get(a) !== root.get(b)) die(`${d.name}: the exports of "${a}" and "${b}" serve the same text. Declare it ("sameAs": {"${b}": "${a}"}) so that skill is read once, on one set of answers.`);
  }
  const roots = labels.filter((l) => root.get(l) === l);
  const rows = []; const settings = new Map();
  for (const label of roots) {
    const file = d.responses[label] ?? die(`${d.name}: no responses file for "${label}"`);
    const seen = new Set();
    for (const r of rowsOf(`${d.name} responses of "${label}"`, file)) {
      if (r === null || typeof r !== 'object' || typeof r.case_id !== 'string') die(`${d.name} ${file}: a row is not an answer of a task`);
      if (!all.includes(r.case_id)) die(`${d.name} ${file}: ${r.case_id} is not a task of this domain`);
      if (r.skill_sha256 !== served.get(label)) die(`${d.name} ${file}: ${r.case_id} trial ${r.trial} was written with another skill than the export filed under "${label}". Check the plan's "responses" against its "exports".`);
      for (const k of ['model', 'max_tokens', 'placement', 'tasks_sha256']) {
        if (!settings.has(k)) settings.set(k, r[k]);
        if (settings.get(k) !== r[k]) die(`${d.name} ${file}: ${r.case_id} trial ${r.trial} has ${k} ${JSON.stringify(r[k])} where another answer of this domain has ${JSON.stringify(settings.get(k))}. Every arm is written with the same settings on the same tasks.`);
      }
      if (excluded.has(r.case_id)) continue;
      if (!Number.isInteger(r.trial) || r.trial < 1 || r.trial > plan.trials) die(`${d.name} ${file}: ${r.case_id} has trial ${JSON.stringify(r.trial)}; trials are numbered 1 to ${plan.trials}`);
      if (typeof r.response !== 'string' || !r.response.trim()) die(`${d.name} ${file}: ${r.case_id} trial ${r.trial} has no answer. Exclude the task for every arm ("excluded"), and say why.`);
      if (seen.has(key(r))) die(`${d.name} ${file}: ${r.case_id} trial ${r.trial} appears twice`);
      seen.add(key(r));
      rows.push({ case_id: r.case_id, trial: r.trial, condition: label, response: r.response });
    }
    for (const id of tasks) for (let t = 1; t <= plan.trials; t++) if (!seen.has(`${id}\u0000${t}`)) die(`${d.name} ${file}: ${id} trial ${t} is missing for "${label}". Run it, or exclude the task for every arm ("excluded").`);
  }
  return { rows, served, root, roots, tasks, standard };
}

/** The lines of `atelier verify` one answer breaks, offline, the claim check left out. */
function brokenRules(d, r) {
  const which = `${d.name}: ${r.case_id} trial ${r.trial} (${r.condition})`;
  const run = spawnSync(process.execPath, [CLI, 'verify', '--skill', d.skill, '--json', '--claims', 'pattern', '--allow-unsourced', '-'],
    { input: r.response, encoding: 'utf8', env: { ...process.env, ATELIER_DATA: at(d.data), ATELIER_CLAIMS: 'pattern' }, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0 && run.status !== 1) die(`${which}: atelier verify could not check this answer (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
  let report;
  try { report = JSON.parse(run.stdout); } catch { die(`${which}: atelier verify did not return its report as JSON (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().split('\n').slice(-2).join(' ')}`); }
  if (!Array.isArray(report?.checked)) die(`${which}: atelier verify returned no list of checks`);
  return report.checked.filter((c) => c.materiality === 'REQUIRED' && c.result?.verdict === 'VIOLATED' && !String(c.requirementId).startsWith('UNSOURCED')).map((c) => String(c.requirementId));
}

mkdirSync(outDir, { recursive: true });
// WHAT AN EARLIER RUN WROTE IS REMOVED FIRST, by either stage: a run that stops, or answers merged again, must not
// leave a complete older result for the next command to read. The merge stage removes the rows stage's files too,
// since rows built from the answers it replaces describe nothing any more.
for (const d of plan.domains) {
  for (const f of outputsOf(d.name).filter((x) => stage === 'merge' || x !== `${d.name}-responses.jsonl`)) rmSync(join(outDir, f), { force: true });
}
for (const f of ['ablation.json', 'result.json']) rmSync(join(outDir, f), { force: true });

const config = { reference: plan.reference, arms: plan.arms, defaultable: plan.defaultable, margins: plan.margins, minTasks: plan.minTasks, ...(plan.plannedTasks === undefined ? {} : { plannedTasks: plan.plannedTasks }), ceiling: plan.ceiling, trials: plan.trials, domains: [] };
for (const d of plan.domains) {
  const { rows, served, root, roots, tasks, standard } = answersOf(d);
  // On stdout, alone there: the one line of this script a report quotes. Everything else it says is progress, on stderr.
  console.log(`${d.name}: every arm was built from one standard, StandardVersion ${standard}`);
  if (stage === 'merge') {
    writeJsonl(join(outDir, `${d.name}-responses.jsonl`), rows);
    console.error(`${d.name}: ${rows.length} answers of ${roots.length} skill(s) served (${labels.length} arms), ${tasks.length} tasks, written for the judge`);
    continue;
  }
  // Every label reads its root's rows: a skill served under two labels is read once.
  const under = (label, xs) => xs.filter((r) => r.condition === root.get(label)).map((r) => ({ ...r, condition: label }));
  const expected = new Set(rows.map((r) => `${key(r)}\u0000${r.condition}`));
  const sizes = Object.fromEntries(labels.map((l) => [l, words(read(`${d.name} export of "${l}"`, d.exports[l]))]));
  const checked = rows.map((r) => { const ids = brokenRules(d, r); return { case_id: r.case_id, trial: r.trial, condition: r.condition, broken: ids.length > 0, rules: ids }; });
  const rules = labels.flatMap((l) => under(l, checked));
  const dims = (() => { try { return JSON.parse(read(`${d.name} rubric`, d.rubric)).dimensions.map((x) => x.name); } catch (e) { return die(`${d.name}: the rubric ${d.rubric} is not readable (${e.message.split('\n')[0]})`); } })();
  const quality = d.judged.map((f, i) => {
    const judged = rowsOf(`${d.name} judged`, f).filter((r) => r !== null && typeof r === 'object' && !(d.excluded ?? []).includes(r.case_id));
    // THE JUDGE'S FILE MUST COVER EXACTLY THE ANSWERS MERGED FOR IT. The judge skips a session it could not score and
    // resumes by task alone, so a file can be short, or hold scores of answers since replaced; read as it stands, a
    // reading that had lost an arm's worst tasks would select that arm.
    const got = new Set();
    for (const r of judged) {
      const k = `${key(r)}\u0000${r.condition}`;
      if (!expected.has(k)) die(`${d.name} ${f}: ${r.case_id} trial ${r.trial} (${r.condition}) is not one of the answers merged for the judge`);
      if (got.has(k)) die(`${d.name} ${f}: ${r.case_id} trial ${r.trial} (${r.condition}) is scored twice`);
      got.add(k);
    }
    const missing = [...expected].filter((k) => !got.has(k));
    if (missing.length) die(`${d.name} ${f}: ${missing.length} of ${expected.size} answers have no score (first: ${missing[0].split('\u0000').join(' ')}). Run the judge again until every task and trial is scored.`);
    const scored = judged.map((r) => {
      // THE SCORE IS THE SUM OF THE RUBRIC'S DIMENSIONS, each as the judge gave it: the comparator's own total.
      const parts = dims.map((x) => (typeof r[x] === 'number' && Number.isFinite(r[x]) ? r[x] : die(`${d.name} ${f}: ${r.case_id} trial ${r.trial} (${r.condition}) has no number for "${x}"`)));
      return { case_id: r.case_id, trial: r.trial, condition: r.condition, score: parts.reduce((a, b) => a + b, 0) };
    });
    writeJsonl(join(outDir, `${d.name}-quality-${i + 1}.jsonl`), labels.flatMap((l) => under(l, scored)));
    return `${d.name}-quality-${i + 1}.jsonl`;
  });
  writeFileSync(join(outDir, `${d.name}-sizes.json`), `${JSON.stringify(sizes, null, 1)}\n`);
  writeFileSync(join(outDir, `${d.name}-exports.json`), `${JSON.stringify({ ...Object.fromEntries(served), standard }, null, 1)}\n`);
  writeJsonl(join(outDir, `${d.name}-rules.jsonl`), rules);
  // A skill read under two labels has one set of choices too: an alias reads its root's.
  if (d.voice) { const choices = rowsOf(`${d.name} voice`, d.voice).filter((r) => r !== null && typeof r === 'object'); writeJsonl(join(outDir, `${d.name}-voice.jsonl`), plan.arms.flatMap((l) => under(l, choices))); }
  config.domains.push({ name: d.name, sizes: `${d.name}-sizes.json`, rules: `${d.name}-rules.jsonl`, quality, voice: d.voice ? `${d.name}-voice.jsonl` : null, excluded: d.excluded ?? [] });
  // The rule reads both: `broken`, in whole outputs, and the rules each answer breaks, as a total held against
  // `margins.rulesPerOutput`. Where nearly every answer breaks one, the total is what is left to tell two arms apart.
  for (const l of labels) { const mine = rules.filter((r) => r.condition === l); console.error(`${d.name} · ${l}: ${mine.filter((r) => r.broken).length} of ${mine.length} answers break a required rule, ${(mine.reduce((n, r) => n + r.rules.length, 0) / mine.length).toFixed(2)} rules an answer · ${sizes[l]} words exported${root.get(l) === l ? '' : ` · the same skill as "${root.get(l)}", read once`}`); }
}
if (stage === 'rows') {
  writeFileSync(join(outDir, 'ablation.json'), `${JSON.stringify(config, null, 1)}\n`);
  console.error(`wrote ${join(outDir, 'ablation.json')}: node bench/compare/efficiency-select.mjs --config ${join(outDir, 'ablation.json')}`);
}
