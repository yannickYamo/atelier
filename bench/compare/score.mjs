#!/usr/bin/env node
// bench/compare/score.mjs — THE STANDARD'S METRIC ON A RESPONSES FILE: `atelier score` FOR EVERY ROW.
//
//   node bench/compare/score.mjs --responses out/test.jsonl --tasks splits/test.jsonl \
//        --data <ATELIER_DATA> --skill <name> --out out/test.atelier-scores.jsonl
//
// One line per response: {case_id, trial, condition, arm, score, components}, then a summary per arm on
// stdout (mean, and the spread between trials of a case when there is more than one). Deterministic and
// offline: `atelier score` calls no model. Run `npm run build` first.
//
// A REFUSAL IS NOT SCORED HERE. A strict refusal is a row with `response: null` (as run.mjs writes it): there is no
// text to score, and a zero for it would read as a very bad answer. Such rows are skipped and counted on stderr, so
// an arm's mean is over the answers it delivered; how often it delivered nothing is read from the responses file.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readJsonl, writeJsonl, opt, die } from './lib.mjs';

const args = process.argv.slice(2);
const respPath = opt(args, 'responses'); const tasksPath = opt(args, 'tasks');
const data = opt(args, 'data'); const skill = opt(args, 'skill'); const out = opt(args, 'out');
if (!respPath || !tasksPath || !data || !skill || !out) die('usage: score.mjs --responses <file> --tasks <file> --data <ATELIER_DATA> --skill <name> --out <file>');
const cli = resolve(opt(args, 'cli', new URL('../../dist/cli/atelier.mjs', import.meta.url).pathname));
const tasks = new Map(readJsonl(tasksPath).map((t) => [t.id, t]));
const tmp = mkdtempSync(join(tmpdir(), 'compare-score-'));
const rows = []; const refused = [];
try {
  for (const r of readJsonl(respPath)) {
    if (r.response === null || r.response === undefined) { refused.push(r); continue; }
    if (typeof r.response !== 'string') die(`${r.case_id} trial ${r.trial} (${r.condition}): \`response\` is neither text nor null`);
    const t = tasks.get(r.case_id) ?? die(`${r.case_id} is not in ${tasksPath}`);
    writeFileSync(join(tmp, 'task.md'), t.prompt);
    writeFileSync(join(tmp, 'response.md'), r.response);
    const material = t.material ? (writeFileSync(join(tmp, 'material.md'), t.material), ['--material', join(tmp, 'material.md')]) : [];
    const done = spawnSync(process.execPath, [cli, 'score', '--skill', skill, '--task', join(tmp, 'task.md'), ...material, join(tmp, 'response.md'), '--json'],
      { cwd: tmp, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: tmp }, encoding: 'utf8' });
    if (done.status !== 0) die(`atelier score failed on ${r.case_id}: ${done.stderr.trim()}`);
    const s = JSON.parse(done.stdout);
    rows.push({ case_id: r.case_id, trial: r.trial, condition: r.condition, arm: r.arm ?? r.condition, score: s.score, components: s.components });
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
writeJsonl(out, rows);
if (refused.length) console.error(`${refused.length} row(s) with no answer (a strict refusal, \`response: null\`) were not scored: ${refused.slice(0, 5).map((r) => `${r.case_id} trial ${r.trial} (${r.condition})`).join(', ')}${refused.length > 5 ? ', …' : ''}. The means below are over delivered answers only.`);
const byArm = new Map();
for (const r of rows) { const k = `${r.condition} ${r.arm}`; byArm.set(k, [...(byArm.get(k) ?? []), r]); }
for (const [k, rs] of byArm) {
  const mean = rs.reduce((n, r) => n + r.score, 0) / rs.length;
  const byCase = new Map();
  for (const r of rs) byCase.set(r.case_id, [...(byCase.get(r.case_id) ?? []), r.score]);
  const spreads = [...byCase.values()].filter((v) => v.length > 1).map((v) => Math.max(...v) - Math.min(...v));
  console.log(`${k}: mean ${mean.toFixed(4)} over ${rs.length}${spreads.length ? `, mean spread between trials ${(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(4)}` : ''}`);
}
