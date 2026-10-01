#!/usr/bin/env node
// bench/compare/smoke/smoke.mjs — EVERY COMPARE SCRIPT END TO END, OFFLINE, WITH NO PAID CALL.
//
//   IHAVEADHD_DIR=./i-have-adhd GEPA_PYTHON=./gepa-venv/bin/python \
//   SKILLOPT_DIR=./SkillOpt SKILLOPT_PYTHON=./skillopt-venv/bin/python \
//     node bench/compare/smoke/smoke.mjs [--work <dir>]
//
// Needs `npm run build`, a clone of ayghri/i-have-adhd at the pinned commit, a Python with gepa installed
// (bench/compare/requirements.txt), and a SkillOpt checkout with a Python where it is installed
// (`pip install -e <SkillOpt>`). The SkillOpt checkout gets the atelier_compare environment installed
// into it (install.py; idempotent).
//
// Every model is local: bench/compare/smoke/fake-openai.mjs plays the writer, the judge, GEPA's reflection
// model and SkillOpt's optimizer; tests/fixtures/scripted-backend.mjs plays the model behind
// `atelier invoke` for the runtime arm. What it proves, and what it cannot, is in bench/compare/README.md.
// Exit 0 only when every check below holds; the summary is written to <work>/smoke-summary.json.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readJsonl, opt } from '../lib.mjs';

const HERE = resolve(new URL('.', import.meta.url).pathname);
const COMPARE = resolve(HERE, '..');
const REPO = resolve(COMPARE, '..', '..');
const CLI = join(REPO, 'dist', 'cli', 'atelier.mjs');
const args = process.argv.slice(2);
const work = resolve(opt(args, 'work', mkdtempSync(join(tmpdir(), 'compare-smoke-'))));
mkdirSync(work, { recursive: true });

const need = (k) => process.env[k] || fail(`set ${k} (see the header of this file)`);
function fail(msg) { console.error(`smoke: ${msg}`); process.exit(1); }
if (!existsSync(CLI)) fail('dist/cli/atelier.mjs is missing: npm run build');
const IH = resolve(need('IHAVEADHD_DIR'));
const GEPA_PY = need('GEPA_PYTHON');
const SO_DIR = resolve(need('SKILLOPT_DIR'));
const SO_PY = need('SKILLOPT_PYTHON');

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

function run(cmd, argv, { env = {}, cwd = work, expect = 0 } = {}) {
  const r = spawnSync(cmd, argv, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 600_000 });
  if (expect !== null && r.status !== expect) {
    console.error(r.stdout.slice(-4000)); console.error(r.stderr.slice(-4000));
    fail(`${[cmd, ...argv].join(' ').slice(0, 200)} exited ${r.status}, expected ${expect}`);
  }
  return r;
}

function server(file) {
  return new Promise((ok, bad) => {
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (d) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok({ child, url: `http://127.0.0.1:${m[1]}` }); });
    child.on('exit', () => bad(new Error(`${file} exited`)));
  });
}

const fake = await server(join(HERE, 'fake-openai.mjs'));
const scripted = await server(join(REPO, 'tests', 'fixtures', 'scripted-backend.mjs'));
const stopAll = () => { fake.child.kill(); scripted.child.kill(); };
process.on('exit', stopAll);

try {
  // ── a built skill whose REQUIRED rule the fake writer's filler sentence breaks ─────────────────
  const data = join(work, 'atelier-data'); const proj = join(work, 'atelier-proj');
  mkdirSync(data, { recursive: true }); mkdirSync(proj, { recursive: true });
  const atelier = (...a) => run(process.execPath, [CLI, ...a], { cwd: proj, env: { ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj } });
  atelier('add', '--statement', 'Never pad an answer with "in summary".', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL',
    '--materiality', 'REQUIRED', '--measure', 'LEXICON:in summary');
  atelier('ratify-close', '--work-type', 'writing');
  atelier('build', '--name', 'smoke');

  // ── tasks: the public test split converted, a 3-task pool split around it, sealed ─────────────
  const test = join(work, 'ihaveadhd-test.jsonl');
  run(process.execPath, [join(COMPARE, 'tasks', 'from-ihaveadhd.mjs'), IH, '--out', test]);
  const splits = join(work, 'splits');
  run(process.execPath, [join(COMPARE, 'tasks', 'split.mjs'), '--pool', join(HERE, 'tasks.jsonl'), '--test', test, '--val', '1', '--seed', '1', '--out', splits]);
  const sealed = JSON.parse(readFileSync(join(splits, 'SEALED.json'), 'utf8'));
  check('split: 14 sealed test cases, 2 train, 1 validation', sealed.test.n === 14 && sealed.train.n === 2 && sealed.validation.n === 1);
  const clash = join(work, 'clash.jsonl');
  writeFileSync(clash, `${JSON.stringify({ id: 'leak', prompt: 'What is 17 multiplied by 6?', category: 'direct-answer', risk: 'low', criteria: ['x'] })}\n`);
  check('split refuses a pool task that matches a test task', run(process.execPath, [join(COMPARE, 'tasks', 'split.mjs'), '--pool', clash, '--test', test, '--val', '1', '--out', join(work, 'x')], { expect: null }).status === 2);
  run(process.execPath, [join(COMPARE, 'tasks', 'gen-train.mjs'), 'prompt', '--test', test, '--per-category', '2', '--out', join(work, 'gen-prompt.md')]);
  check('gen-train check accepts the smoke pool', run(process.execPath, [join(COMPARE, 'tasks', 'gen-train.mjs'), 'check', '--tasks', join(HERE, 'tasks.jsonl'), '--test', test], { expect: null }).status === 0);
  check('gen-train check refuses a task matching the test split', run(process.execPath, [join(COMPARE, 'tasks', 'gen-train.mjs'), 'check', '--tasks', clash, '--test', test], { expect: null }).status === 1);

  // ── run.mjs: three arms on the sealed test split, in the benchmark's responses format ─────────
  const testSplit = join(splits, 'test.jsonl');
  const resp = join(work, 'responses.jsonl');
  const common = ['--tasks', testSplit, '--out', resp, '--model', 'fake-writer', '--max-tokens', '1024', '--sealed', join(splits, 'SEALED.json')];
  run(process.execPath, [join(COMPARE, 'run.mjs'), ...common, '--arm', 'none', '--provider', 'openai-compatible', '--base-url', fake.url]);
  run(process.execPath, [join(COMPARE, 'run.mjs'), ...common, '--arm', `skill:${join(HERE, 'seed-skill.md')}`, '--provider', 'openai-compatible', '--base-url', fake.url]);
  const runtimes = join(work, 'runtimes.json');
  writeFileSync(runtimes, JSON.stringify({ smoke: { cli: CLI, data, proj, skill: 'smoke',
    args: ['--provider', 'openai-compatible', '--base-url', scripted.url, '--model', 'scripted', '--no-taste'] } }));
  await fetch(`${scripted.url}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: 'Run the failing test first, then fix the header it names.' } } }) });
  run(process.execPath, [join(COMPARE, 'run.mjs'), ...common, '--arm', 'atelier-runtime:smoke', '--runtimes', runtimes, '--condition', 'comparator']);
  const rows = readJsonl(resp);
  check('run.mjs: 14 rows per arm, one runner, one model, one max_tokens', rows.length === 42
    && new Set(rows.map((r) => r.runner)).size === 1 && new Set(rows.map((r) => r.model)).size === 1 && new Set(rows.map((r) => r.max_tokens)).size === 1);
  check('run.mjs: every row records the sealed split it answered', rows.every((r) => r.split === 'test' && r.tasks_sha256 === sealed.test.sha256));
  check('run.mjs: the skill arm differs from the bare arm only by the skill', rows.filter((r) => r.condition === 'candidate').every((r) => r.skill_sha256)
    && rows.filter((r) => r.condition === 'baseline').every((r) => r.skill_sha256 === null));
  check('run.mjs: the runtime arm answered through atelier invoke', rows.filter((r) => r.condition === 'comparator').every((r) => r.response.includes('Run the failing test first')));
  const rerun = run(process.execPath, [join(COMPARE, 'run.mjs'), ...common, '--arm', 'none', '--provider', 'openai-compatible', '--base-url', fake.url]);
  check('run.mjs: a rerun skips completed rows', readJsonl(resp).length === 42 && /skip/.test(rerun.stderr));
  const measured = run('python3', [join(IH, 'scripts', 'run_evals.py'), 'measure', resp], { expect: null });
  check('the benchmark\'s own run_evals.py measure accepts the responses file', measured.status === 0, measured.status === 0 ? '' : measured.stderr.trim().split('\n').pop());
  const scored = join(work, 'responses.atelier-scores.jsonl');
  run(process.execPath, [join(COMPARE, 'score.mjs'), '--responses', resp, '--tasks', testSplit, '--data', data, '--skill', 'smoke', '--out', scored]);
  const scores = readJsonl(scored);
  check('score.mjs: the standard\'s metric on every response, the filler arms below the runtime arm', scores.length === 42
    && scores.filter((s) => s.condition === 'baseline').every((s) => s.components.required === 0)
    && scores.filter((s) => s.condition === 'comparator').every((s) => s.components.required === 1));

  // ── GEPA, both evaluators ──────────────────────────────────────────────────────────────────
  const models = { OPENAI_COMPATIBLE_BASE_URL: fake.url, TASK_MODEL: 'fake-writer', REFLECTION_MODEL: 'fake-reflector', JUDGE_MODEL: 'fake-judge' };
  const seedText = readFileSync(join(HERE, 'seed-skill.md'), 'utf8');
  const gepa = (evaluator, out, extra = [], expect = 0) => run(GEPA_PY, [join(COMPARE, 'gepa_adapter.py'), '--seed-skill', join(HERE, 'seed-skill.md'),
    '--train', join(splits, 'train.jsonl'), '--val', join(splits, 'validation.jsonl'), '--sealed', join(splits, 'SEALED.json'),
    '--evaluator', evaluator, '--max-metric-calls', '12', '--workers', '1', '--out', out,
    '--ihaveadhd-dir', IH, '--atelier-cli', CLI, '--atelier-data', data, '--atelier-skill', 'smoke', ...extra], { env: models, expect });
  for (const ev of ['ihaveadhd', 'atelier']) {
    const out = join(work, `gepa-${ev}.md`);
    gepa(ev, out);
    const rec = JSON.parse(readFileSync(`${out}.run.json`, 'utf8'));
    const best = readFileSync(out, 'utf8');
    check(`GEPA (${ev}): wrote an optimized skill that differs from the seed`, best.trim() !== seedText.trim() && best.includes('No filler'));
    check(`GEPA (${ev}): the best candidate beat the seed on validation`, rec.val_aggregate_scores[rec.best_idx] > rec.val_aggregate_scores[0],
      `${rec.val_aggregate_scores[0]} → ${rec.val_aggregate_scores[rec.best_idx]}`);
    check(`GEPA (${ev}): the run record names the budget, the hashes and the seal`, rec.budget.max_metric_calls === 12 && rec.budget.total_metric_calls > 0
      && rec.seal.test_sha256 === sealed.test.sha256 && rec.train.sha256 === sealed.train.sha256, `metric calls ${rec.budget.total_metric_calls}`);
  }
  check('GEPA refuses the sealed test file as --train', run(GEPA_PY, [join(COMPARE, 'gepa_adapter.py'), '--seed-skill', join(HERE, 'seed-skill.md'),
    '--train', testSplit, '--val', join(splits, 'validation.jsonl'), '--sealed', join(splits, 'SEALED.json'), '--evaluator', 'atelier',
    '--max-metric-calls', '4', '--out', join(work, 'never.md')], { env: models, expect: null }).status === 2 && !existsSync(join(work, 'never.md')));

  // ── SkillOpt, both evaluators ──────────────────────────────────────────────────────────────
  run(SO_PY, [join(COMPARE, 'skillopt_env', 'install.py'), '--skillopt', SO_DIR]);
  const soSplit = join(work, 'skillopt-split');
  run(SO_PY, [join(COMPARE, 'skillopt_env', 'prepare_split.py'), '--train', join(splits, 'train.jsonl'), '--val', join(splits, 'validation.jsonl'),
    '--sealed', join(splits, 'SEALED.json'), '--out', soSplit]);
  check('SkillOpt prepare_split refuses the sealed test file', run(SO_PY, [join(COMPARE, 'skillopt_env', 'prepare_split.py'), '--train', testSplit,
    '--val', join(splits, 'validation.jsonl'), '--sealed', join(splits, 'SEALED.json'), '--out', join(work, 'never-split')], { expect: null }).status === 2);
  const soEnv = { OPTIMIZER_OPENAI_COMPATIBLE_BASE_URL: fake.url, TARGET_OPENAI_COMPATIBLE_BASE_URL: fake.url, JUDGE_BASE_URL: fake.url, JUDGE_MODEL: 'fake-judge' };
  for (const ev of ['ihaveadhd', 'atelier']) {
    const outRoot = join(work, `skillopt-${ev}`);
    run(SO_PY, ['scripts/train.py', '--config', 'configs/atelier_compare/smoke.yaml', '--cfg-options',
      `env.split_dir=${soSplit}`, `env.sealed_file=${join(splits, 'SEALED.json')}`, `env.skill_init=${join(HERE, 'seed-skill.md')}`,
      `env.evaluator=${ev}`, `env.ihaveadhd_dir=${IH}`, `env.atelier_cli=${CLI}`, `env.atelier_data=${data}`, 'env.atelier_skill=smoke',
      `env.out_root=${outRoot}`], { cwd: SO_DIR, env: soEnv });
    const best = existsSync(join(outRoot, 'best_skill.md')) ? readFileSync(join(outRoot, 'best_skill.md'), 'utf8') : '';
    const summary = existsSync(join(outRoot, 'summary.json')) ? JSON.parse(readFileSync(join(outRoot, 'summary.json'), 'utf8')) : {};
    check(`SkillOpt (${ev}): wrote best_skill.md with the reflected edit`, best.includes('No filler'));
    check(`SkillOpt (${ev}): the edit was accepted by the validation gate`, summary.total_accepts >= 1 && summary.best_selection_hard > summary.baseline_selection_hard,
      `validation hard ${summary.baseline_selection_hard} → ${summary.best_selection_hard}`);
    check(`SkillOpt (${ev}): no test split was evaluated inside SkillOpt`, summary.test_hard === null && summary.baseline_test_hard === null);
  }
  const counts = await (await fetch(`${fake.url}/__count`)).json();
  check('the fake server saw every kind of call it scripts', ['task', 'judge', 'gepa-reflection', 'skillopt-analyst-error', 'skillopt-merge', 'skillopt-rank', 'tool:emit_answer'].every((k) => counts[k] > 0), JSON.stringify(counts));
} finally {
  stopAll();
}

const ok = checks.every((c) => c.ok);
writeFileSync(join(work, 'smoke-summary.json'), `${JSON.stringify({ ok, work, checks }, null, 1)}\n`);
console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks hold · ${work}/smoke-summary.json`);
process.exit(ok ? 0 : 1);
