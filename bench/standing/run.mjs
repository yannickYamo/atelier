#!/usr/bin/env node
// bench/standing/run.mjs — one arm of the standing comparison over one domain's tasks.
//
//   node bench/standing/run.mjs --domain explainer --arm pasted|rules|export|invoke --out <dir> [--runs 2]
//        [--model claude-opus-5] [--label <name>] [--numbered] [--skill <name> --proj <dir> --data <dir>]   (export and invoke need a built skill)
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
// --label names the outputs when one arm is run for more than one skill ("invoke-method"); the arm decides how it answers.
const label = flag('--label', arm);
const { tasks, rules } = await import(join(domainDir, 'domain.mjs'));
mkdirSync(out, { recursive: true });

// An example file carries its request, and the material it was made from, in front matter; a pasted example shows
// the request and that material above the work.
const shown = (f) => {
  const raw = readFileSync(join(domainDir, 'examples', f), 'utf8'); const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!fm) return raw;
  const request = /^request:\s*(.*)$/m.exec(fm[1])?.[1] ?? ''; const refs = (/^material:\s*(.*)$/m.exec(fm[1])?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const material = refs.map((r) => `\n\n${readFileSync(join(domainDir, 'examples', r), 'utf8').trim()}`).join('');
  return `Request: ${request}${material}\n\n${raw.slice(fm[0].length)}`;
};
const examples = readdirSync(join(domainDir, 'examples')).filter((f) => f.endsWith('.md')).sort().map((f, i) => `### Example ${i + 1}\n${shown(f)}`).join('\n');
const skill = flag('--skill'); const proj = flag('--proj'); const data = flag('--data');
const atelierEnv = { ...process.env, ...(data ? { ATELIER_DATA: resolve(data) } : {}) };
const exported = () => {
  const file = join(out, `${label}.export.md`);
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
// --numbered: a prompt arm whose task material carries line numbers, as a person who knew to number it would paste
// it. The control for what Atelier's runtime does on its own for a skill that cites lines. One-hunk diffs and
// plain files only, which is what the domains hold.
const numberedText = (text) => { let n = null; return text.split('\n').map((r) => { const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(r); if (h) { n = Number(h[1]); return r; } if (n === null || r.startsWith('-')) return r; const row = `${String(n).padStart(5)}  ${r}`; n += 1; return row; }).join('\n'); };
const asGiven = (text) => (process.argv.includes('--numbered') ? `${numberedText(text.trim())}\n\n(Each line is shown with its line number in front of it. When you cite a line, use that number; do not count.)` : text.trim());
const withMaterial = (t) => (t.material ?? []).map((m) => `\n\n${asGiven(readFileSync(join(domainDir, m.file), 'utf8'))}`).join('');

const jobs = tasks.flatMap((t) => Array.from({ length: runs }, (_, r) => ({ t, r })));
await pool(jobs, arm === 'invoke' ? 3 : 4, async ({ t, r }) => {
  const file = join(out, `${label}-${t.id}-${r}.json`);
  if (existsSync(file)) return;
  const t0 = Date.now();
  const rec = arm === 'invoke' ? await invoke(t)
    : await ask({ system, user: `${t.request}${withMaterial(t)}`, model, tag: arm, log: join(out, 'tokens.jsonl') }).then((a) => ({ output: a.text, cutOff: a.cut }));
  writeFileSync(file, JSON.stringify({ arm: label, task: t.id, run: r, seconds: (Date.now() - t0) / 1000, ...rec }, null, 1));
});
console.log(`${label}: ${jobs.length} output(s) in ${out}`);
