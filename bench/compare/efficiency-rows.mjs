#!/usr/bin/env node
// bench/compare/efficiency-rows.mjs — FROM EACH ARM'S ANSWERS TO THE ROWS THE SELECTION RULE READS.
//
// Sealed with studies/EFFICIENCY_ABLATION_PREREGISTRATION.md, beside bench/compare/efficiency-select.mjs. The rule is
// only as fixed as the rows it is handed: which label an answer carries, what counts as a broken rule, how five
// rubric dimensions become one score. Left to the tester, each of those is a choice made after the outputs exist, so
// they are made here. No model call: `atelier verify` is run offline.
//
//   node bench/compare/efficiency-rows.mjs --plan <plan.json> --stage merge --out <dir>
//       one file per domain, <dir>/<domain>-responses.jsonl, every arm's answers under its own label, for the judge
//   node bench/compare/efficiency-rows.mjs --plan <plan.json> --stage rows  --out <dir>
//       <dir>/<domain>-sizes.json, -rules.jsonl, -quality-<n>.jsonl, and <dir>/ablation.json for efficiency-select.mjs
//
// plan.json (every path relative to the plan):
//   reference, arms, defaultable, margins, minTasks, ceiling   copied into ablation.json as sealed
//   trials       outputs per task per arm
//   domains      [{ name, skill, data,                   the built skill and its ATELIER_DATA, for `atelier verify`
//                   tasks:     file of {id, prompt}
//                   exports:   {label: file}             what `atelier export --out` wrote for each arm
//                   responses: {label: file}             one `bench/compare/run.mjs --out` file per arm. An arm whose
//                                                        export is byte-identical to an earlier arm's has no file:
//                   sameAs:    {label: earlier label}    it is read once, on the earlier arm's answers
//                   judged:    [files]                   (rows stage) `rubric-judge.mjs --out`, one file a session
//                   rubric:    file                      the rubric the judge used: its dimensions are summed
//                   voice:     file | null               choices by a reader qualified on this domain, or null
//                   excluded:  [task ids] }]             dropped for every arm; say why in the report
//
// WHY ONE RESPONSES FILE PER ARM. `run.mjs` labels every skill arm "candidate" and resumes by case, trial and that
// label, so two arms written to one file are one arm: the second is skipped as done. Each arm is run to its own file
// and given its label here. The judge shuffles its labels by a hash of the condition, so the arms must carry their
// own before judging, or every arm keeps one position.
//
// WHAT COUNTS AS A BROKEN RULE. `atelier verify --skill <skill> --json --claims pattern --allow-unsourced`, offline: an
// output is broken when a REQUIRED rule that verify measured reads VIOLATED. The check for invented specifics is left
// out on purpose (`--allow-unsourced`): a plug-in answer is written with no material bound, so that check flags most
// outputs of every arm alike and would drown the reading. An output verify cannot check (exit 2) stops the run.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readJsonl, writeJsonl, sha256File, opt, die } from './lib.mjs';

const args = process.argv.slice(2);
const planPath = opt(args, 'plan') ?? die('usage: efficiency-rows.mjs --plan <plan.json> --stage merge|rows --out <dir>');
const stage = opt(args, 'stage'); const outDir = opt(args, 'out');
if (!['merge', 'rows'].includes(stage) || !outDir) die('usage: efficiency-rows.mjs --plan <plan.json> --stage merge|rows --out <dir>');
const cli = resolve(opt(args, 'cli', new URL('../../dist/cli/atelier.mjs', import.meta.url).pathname));
const base = dirname(resolve(planPath));
const at = (f) => resolve(base, f);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
for (const k of ['reference', 'arms', 'defaultable', 'margins', 'minTasks', 'ceiling', 'trials', 'domains']) if (plan[k] === undefined) die(`plan needs "${k}"`);
if (!Number.isInteger(plan.trials) || plan.trials < 1) die('plan.trials must be a whole number of at least 1');
const labels = [plan.reference, ...plan.arms];
const words = (text) => { const t = text.trim(); return t ? t.split(/\s+/).length : 0; };
mkdirSync(resolve(outDir), { recursive: true });

/** Every arm's answers for one domain, labelled, on exactly the tasks and trials the plan expects. */
function answersOf(d) {
  const excluded = new Set(d.excluded ?? []);
  const tasks = readJsonl(at(d.tasks)).map((t) => t.id).filter((id) => !excluded.has(id));
  const sameAs = d.sameAs ?? {};
  // AN EXPORT IS READ ONCE. Two arms with one export are one skill: answers written twice for it would differ by chance
  // and hand the two labels different verdicts. So identical exports must be declared, and are read on one set of answers.
  const shas = new Map(labels.map((l) => [l, sha256File(at(d.exports?.[l] ?? die(`${d.name}: no export for "${l}"`)))]));
  for (const [l, other] of Object.entries(sameAs)) if (shas.get(l) !== shas.get(other)) die(`${d.name}: "${l}" is declared the same as "${other}", and their exports differ`);
  for (let i = 0; i < labels.length; i++) for (let j = 0; j < i; j++) {
    const [a, b] = [labels[j], labels[i]];
    if (shas.get(a) === shas.get(b) && sameAs[b] !== a && sameAs[a] !== b) die(`${d.name}: the exports of "${a}" and "${b}" are byte-identical. Declare it ("sameAs": {"${b}": "${a}"}) so the export is read once, on one set of answers.`);
  }
  const rows = [];
  for (const label of labels) {
    const source = sameAs[label] ?? label;
    const file = d.responses?.[source] ?? die(`${d.name}: no responses file for "${source}"`);
    const seen = new Set();
    for (const r of readJsonl(at(file))) {
      if (excluded.has(r.case_id)) continue;
      if (!tasks.includes(r.case_id)) die(`${d.name} ${file}: ${r.case_id} is not a task of this domain`);
      if (typeof r.response !== 'string' || !r.response.trim()) die(`${d.name} ${file}: ${r.case_id} trial ${r.trial} has no answer. Exclude the task for every arm ("excluded"), and say why.`);
      if (seen.has(`${r.case_id}\u0000${r.trial}`)) die(`${d.name} ${file}: ${r.case_id} trial ${r.trial} appears twice`);
      seen.add(`${r.case_id}\u0000${r.trial}`);
      rows.push({ case_id: r.case_id, trial: r.trial, condition: label, response: r.response });
    }
    for (const id of tasks) for (let t = 1; t <= plan.trials; t++) if (!seen.has(`${id}\u0000${t}`)) die(`${d.name} ${file}: ${id} trial ${t} is missing for "${label}". Run it, or exclude the task for every arm ("excluded").`);
    if (seen.size !== tasks.length * plan.trials) die(`${d.name} ${file}: ${seen.size} answers where ${tasks.length * plan.trials} are expected (${plan.trials} per task)`);
  }
  return { rows, shas };
}

/** The measured REQUIRED rules one answer breaks, by `atelier verify`, offline, the claim check left out. */
function brokenRules(d, text) {
  const run = spawnSync('node', [cli, 'verify', '--skill', d.skill, '--json', '--claims', 'pattern', '--allow-unsourced', '-'],
    { input: text, encoding: 'utf8', env: { ...process.env, ATELIER_DATA: resolve(base, d.data), ATELIER_CLAIMS: 'pattern' }, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0 && run.status !== 1) die(`${d.name}: atelier verify could not check an answer (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
  const report = JSON.parse(run.stdout);
  if (!Array.isArray(report.checked)) die(`${d.name}: atelier verify returned no list of checks`);
  return report.checked.filter((c) => c.materiality === 'REQUIRED' && c.result?.verdict === 'VIOLATED' && !String(c.requirementId).startsWith('UNSOURCED')).map((c) => String(c.requirementId));
}

const config = { reference: plan.reference, arms: plan.arms, defaultable: plan.defaultable, margins: plan.margins, minTasks: plan.minTasks, ceiling: plan.ceiling, domains: [] };
for (const d of plan.domains) {
  const { rows, shas } = answersOf(d);
  if (stage === 'merge') {
    writeJsonl(join(outDir, `${d.name}-responses.jsonl`), rows);
    console.error(`${d.name}: ${rows.length} answers, ${labels.length} arms, written for the judge`);
    continue;
  }
  const sizes = Object.fromEntries(labels.map((l) => [l, words(readFileSync(at(d.exports[l]), 'utf8'))]));
  writeFileSync(join(outDir, `${d.name}-sizes.json`), `${JSON.stringify(sizes, null, 1)}\n`);
  writeFileSync(join(outDir, `${d.name}-exports.json`), `${JSON.stringify(Object.fromEntries(shas), null, 1)}\n`);
  // An answer read under two labels (one export) is checked once.
  const verdict = new Map();
  // `broken` is what the rule reads. `rules` names the ones broken, for the report: where nearly every output breaks
  // one, the count per output is the only thing left that can tell two arms apart, and a person should see it.
  const rules = rows.map((r) => { if (!verdict.has(r.response)) verdict.set(r.response, brokenRules(d, r.response)); const ids = verdict.get(r.response); return { case_id: r.case_id, trial: r.trial, condition: r.condition, broken: ids.length > 0, rules: ids }; });
  writeJsonl(join(outDir, `${d.name}-rules.jsonl`), rules);
  const dims = JSON.parse(readFileSync(at(d.rubric ?? die(`${d.name}: no rubric`)), 'utf8')).dimensions.map((x) => x.name);
  const quality = (d.judged ?? die(`${d.name}: no judged files`)).map((f, i) => {
    const out = `${d.name}-quality-${i + 1}.jsonl`;
    writeJsonl(join(outDir, out), readJsonl(at(f)).map((r) => {
      // THE SCORE IS THE SUM OF THE RUBRIC'S DIMENSIONS, each as the judge gave it: the comparator's own total.
      const parts = dims.map((x) => (typeof r[x] === 'number' && Number.isFinite(r[x]) ? r[x] : die(`${d.name} ${f}: ${r.case_id} trial ${r.trial} (${r.condition}) has no number for "${x}"`)));
      return { case_id: r.case_id, trial: r.trial, condition: r.condition, score: parts.reduce((a, b) => a + b, 0) };
    }));
    return out;
  });
  if (d.voice && !existsSync(at(d.voice))) die(`${d.name}: the voice file ${d.voice} does not exist`);
  if (d.voice) writeJsonl(join(outDir, `${d.name}-voice.jsonl`), readJsonl(at(d.voice)));
  config.domains.push({ name: d.name, sizes: `${d.name}-sizes.json`, rules: `${d.name}-rules.jsonl`, quality, voice: d.voice ? `${d.name}-voice.jsonl` : null, excluded: d.excluded ?? [] });
  for (const l of labels) { const mine = rules.filter((r) => r.condition === l); console.error(`${d.name} · ${l}: ${mine.filter((r) => r.broken).length} of ${mine.length} answers break a required rule, ${(mine.reduce((n, r) => n + r.rules.length, 0) / mine.length).toFixed(2)} rules an answer`); }
  console.error(`${d.name}: ${rules.length} answers checked, ${rules.filter((r) => r.broken).length} break a required rule; sizes ${labels.map((l) => `${l} ${sizes[l]}`).join(', ')}`);
}
if (stage === 'rows') {
  writeFileSync(join(outDir, 'ablation.json'), `${JSON.stringify(config, null, 1)}\n`);
  console.error(`wrote ${join(outDir, 'ablation.json')}: node bench/compare/efficiency-select.mjs --config ${join(outDir, 'ablation.json')}`);
}
