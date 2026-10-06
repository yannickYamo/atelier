#!/usr/bin/env node
// bench/compare/verify-rows.mjs — THE VERIFY ROWS OF A CLOSING CLAIM: ONE ROW AN ANSWER, FROM `atelier verify`, FOR BOTH READERS.
//
// A closing claim reads the REQUIRED measured rules twice, under one file name: bench/compare/axes.mjs reads
// `broken` and `rules` to build the rule anchor and repeatability axes, and bench/compare/closing-quality.mjs reads
// `applicable` and `held` for the endpoint reported beside them (P5). Nothing wrote that file, so a tester had to
// make it by hand, in whichever of the two shapes they had read about last. It is written here, once, with every
// field both scripts read, by a rule fixed before the answers exist. No model call: `atelier verify` is run offline.
//
//   node bench/compare/verify-rows.mjs --responses <file> [--responses <file> ...] --skill <name> --data <ATELIER_DATA> --out <verify.jsonl> [--force]
//
//   --responses   a file bench/compare/run.mjs wrote: {case_id, trial, condition, response}. Give it once per arm
//                 (each arm is run to its own file under its own --condition), or once for a merged file.
//   --skill       the built skill whose rules every arm is held to, and --data its ATELIER_DATA
//   --out         the file to write. An existing file is refused unless --force, and it may not be one of the inputs.
//
// ONE ROW AN ANSWER: {case_id, trial, condition, broken, rules, applicable, held}
//   broken       true when the answer breaks at least one REQUIRED line
//   rules        the ids of the REQUIRED lines it breaks ([] when none)
//   applicable   how many REQUIRED lines `atelier verify` could read on this answer: those it reports as met or as
//                violated. A line that does not apply to the answer (NOT_APPLICABLE) is not counted, and neither is
//                the check for invented specifics (UNSOURCED)
//   held         applicable minus the lines broken
//
// WHAT COUNTS AS A BROKEN RULE is what bench/compare/efficiency-rows.mjs counts, by the same command:
// `atelier verify --skill <name> --json --claims pattern --allow-unsourced`, the answer on stdin. A line verify reports
// as REQUIRED that reads VIOLATED is broken. The check for invented specifics is left out on purpose: an answer written
// with no material bound is flagged by it in every arm alike. The same lines for every arm.
//
// A STRICT REFUSAL IS A ROW, NOT A GAP. An answer that was not delivered (`response: null`, as run.mjs writes it)
// has no text to check: it is written as {broken: true, rules: ["NOT_DELIVERED"], applicable: 0, held: 0,
// delivered: false}. axes.mjs then reads it as a failure on the rule anchor, since the person got nothing; P5 leaves
// it out of the rate of rules held, since no rule could be read on it (`applicable` is 0).
//
// ANYTHING THAT DOES NOT FIT STOPS THE RUN (exit 2), naming the row, and nothing is written: a row that is not an
// answer, the same case, trial and condition twice (two arms written under one label are one arm to every script
// that reads this file), an answer verify cannot check. The file is written whole at the end or not at all.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl, writeJsonl, opt, die } from './lib.mjs';

const USAGE = 'usage: verify-rows.mjs --responses <file> [--responses <file> ...] --skill <name> --data <ATELIER_DATA> --out <verify.jsonl> [--force]';
const args = process.argv.slice(2);
const inputs = args.flatMap((a, i) => (a === '--responses' ? [args[i + 1]] : []));
let skill; let data; let outArg;
try { skill = opt(args, 'skill'); data = opt(args, 'data'); outArg = opt(args, 'out'); } catch (e) { die(`${e.message}\n${USAGE}`); }
if (!inputs.length || inputs.some((f) => f === undefined || f.startsWith('--')) || !skill || !data || !outArg) die(USAGE);
const CLI = fileURLToPath(new URL('../../dist/cli/atelier.mjs', import.meta.url));
if (!existsSync(CLI)) die(`${CLI} is missing: run \`npm run build\` first`);
const out = resolve(outArg);
for (const f of inputs) if (resolve(f) === out) die(`--out is ${f}, one of the responses files: it would be written over. Name another file.`);
if (!existsSync(resolve(data))) die(`--data ${data}: no such directory. It is the ATELIER_DATA the skill "${skill}" was built in.`);
if (existsSync(out) && !args.includes('--force')) die(`${outArg} is already there. Rows of an earlier run are not written over: name another file, or pass --force to replace it.`);

// ── EVERY INPUT, CHECKED WHOLE BEFORE ANYTHING IS VERIFIED ─────────────────────────────────────────
const answers = []; const seen = new Map();
for (const f of inputs) {
  let rows;
  try { rows = readJsonl(resolve(f)); } catch (e) { die(`${f} is not readable as one JSON object a line (${e.code ?? e.message.split('\n')[0]})`); }
  rows.forEach((r, i) => {
    const row = `${f}: row ${i + 1}`;
    if (r === null || typeof r !== 'object' || Array.isArray(r)) die(`${row} is not an object`);
    if (typeof r.case_id !== 'string' || !r.case_id) die(`${row} has no \`case_id\``);
    if (!Number.isInteger(r.trial) || r.trial < 1) die(`${row} (${r.case_id}) has trial ${JSON.stringify(r.trial)}; trials are whole numbers from 1`);
    if (typeof r.condition !== 'string' || !r.condition) die(`${row} (${r.case_id}) has no \`condition\`, the arm's label`);
    if (r.response !== null && (typeof r.response !== 'string' || !r.response.trim())) die(`${row} (${r.case_id} trial ${r.trial}, ${r.condition}) has no answer: \`response\` is text, or null for a strict refusal`);
    const k = `${r.case_id}\u0000${r.trial}\u0000${r.condition}`;
    if (seen.has(k)) die(`${row}: ${r.case_id} trial ${r.trial} (${r.condition}) is already in ${seen.get(k)}. Each arm is run under its own --condition; two files with one label are one arm here.`);
    seen.set(k, `${f}, row ${i + 1}`);
    answers.push({ case_id: r.case_id, trial: r.trial, condition: r.condition, response: r.response });
  });
}
if (!answers.length) die(`no answer in ${inputs.join(', ')}`);

/** What `atelier verify` says of one answer, offline, the claim check left out: the lines broken, and how many could be read. */
function verified(r) {
  const which = `${r.case_id} trial ${r.trial} (${r.condition})`;
  const run = spawnSync(process.execPath, [CLI, 'verify', '--skill', skill, '--json', '--claims', 'pattern', '--allow-unsourced', '-'],
    { input: r.response, encoding: 'utf8', env: { ...process.env, ATELIER_DATA: resolve(data), ATELIER_CLAIMS: 'pattern' }, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0 && run.status !== 1) die(`${which}: atelier verify could not check this answer (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
  let report;
  try { report = JSON.parse(run.stdout); } catch { die(`${which}: atelier verify did not return its report as JSON (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().split('\n').slice(-2).join(' ')}`); }
  if (!Array.isArray(report?.checked)) die(`${which}: atelier verify returned no list of checks`);
  const required = report.checked.filter((c) => c.materiality === 'REQUIRED' && !String(c.requirementId).startsWith('UNSOURCED'));
  const rules = required.filter((c) => c.result?.verdict === 'VIOLATED').map((c) => String(c.requirementId));
  const applicable = required.filter((c) => c.result?.verdict !== 'NOT_APPLICABLE').length;
  return { broken: rules.length > 0, rules, applicable, held: applicable - rules.length };
}

const rows = answers.map((r) => (r.response === null
  ? { case_id: r.case_id, trial: r.trial, condition: r.condition, broken: true, rules: ['NOT_DELIVERED'], applicable: 0, held: 0, delivered: false }
  : { case_id: r.case_id, trial: r.trial, condition: r.condition, ...verified(r) }));
writeJsonl(out, rows);
for (const label of [...new Set(rows.map((r) => r.condition))]) {
  const mine = rows.filter((r) => r.condition === label); const refused = mine.filter((r) => r.delivered === false).length;
  console.error(`${label}: ${mine.filter((r) => r.broken).length} of ${mine.length} answers break a required rule${refused ? ` (${refused} of them not delivered)` : ''}`);
}
console.error(`wrote ${outArg}: ${rows.length} rows. It is the \`verify\` file of bench/compare/axes.mjs and of bench/compare/closing-quality.mjs.`);
