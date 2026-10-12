#!/usr/bin/env node
// bench/standing/run.mjs — one arm of the standing comparison over one domain's tasks.
//
//   node bench/standing/run.mjs --domain explainer --arm pasted|rules|export|invoke --out <dir> [--runs 2]
//        [--model claude-opus-5] [--skill <name> --proj <dir> --data <dir>]   (export and invoke need a built skill)
//
// The arms are the ways a person could ask for the same work: the examples pasted, a page of rules with the
// examples, Atelier's exported skill as a plain prompt, and Atelier's own runtime. Same model, same tasks. Each
// output is one JSON file, so a run that stops is continued by running it again. Spends money: nothing here is
// called by the test suite.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, pool } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, '../../dist/cli/atelier.mjs');
const flag = (name, dflt = null) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const need = (name) => flag(name) ?? (console.error(`${name} is required`), process.exit(2));
const domainDir = join(HERE, 'domains', need('--domain')); const arm = need('--arm'); const out = resolve(need('--out'));
const runs = Number(flag('--runs', '1')); const model = flag('--model', 'claude-opus-5');
const { tasks, rules } = await import(join(domainDir, 'domain.mjs'));
mkdirSync(out, { recursive: true });

// An example file carries its request in front matter; a pasted example shows the request above the work.
const shown = (f) => readFileSync(join(domainDir, 'examples', f), 'utf8').replace(/^---\n([\s\S]*?)\n---\n/, (_, fm) => `Request: ${fm.replace(/^request:\s*/, '')}\n\n`);
const examples = readdirSync(join(domainDir, 'examples')).sort().map((f, i) => `### Example ${i + 1}\n${shown(f)}`).join('\n');
const skill = flag('--skill'); const proj = flag('--proj'); const data = flag('--data');
const atelierEnv = { ...process.env, ...(data ? { ATELIER_DATA: resolve(data) } : {}) };
const exported = () => {
  const file = join(out, 'export.md');
  execFileSync('node', [CLI, 'export', '--skill', skill, '--out', file], { cwd: resolve(proj), env: atelierEnv, stdio: 'ignore' });
  return readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
};
if ((arm === 'export' || arm === 'invoke') && !(skill && proj)) { console.error('--skill and --proj are required for this arm'); process.exit(2); }
const system = arm === 'pasted' ? `Write the way these examples are written.\n\n${examples}\n\nReturn only the work.`
  : arm === 'rules' ? `${rules}\n\nExamples of the standard:\n\n${examples}\n\nReturn only the work.`
    : arm === 'export' ? exported() : null;
const invoke = (t) => new Promise((done) => execFile('node', [CLI, 'invoke', '--skill', skill, t.request, '--json', ...(t.material ?? []).flatMap((m) => ['--with', `${m.name}=${join(domainDir, m.file)}`])],
  { cwd: resolve(proj), env: atelierEnv, maxBuffer: 1 << 26, timeout: 900000 }, (err, stdout, stderr) => {
    try { done(JSON.parse(stdout)); } catch { done({ output: '', error: String(err ?? stderr).slice(0, 400) }); }
  }));
const withMaterial = (t) => (t.material ?? []).map((m) => `\n\n## ${m.name}\n${readFileSync(join(domainDir, m.file), 'utf8')}`).join('');

const jobs = tasks.flatMap((t) => Array.from({ length: runs }, (_, r) => ({ t, r })));
await pool(jobs, arm === 'invoke' ? 3 : 4, async ({ t, r }) => {
  const file = join(out, `${arm}-${t.id}-${r}.json`);
  if (existsSync(file)) return;
  const t0 = Date.now();
  const rec = arm === 'invoke' ? await invoke(t)
    : await ask({ system, user: `${t.request}${withMaterial(t)}`, model, tag: arm, log: join(out, 'tokens.jsonl') }).then((a) => ({ output: a.text, cutOff: a.cut }));
  writeFileSync(file, JSON.stringify({ arm, task: t.id, run: r, seconds: (Date.now() - t0) / 1000, ...rec }, null, 1));
});
console.log(`${arm}: ${jobs.length} output(s) in ${out}`);
