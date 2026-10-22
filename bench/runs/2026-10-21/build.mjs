// Tests 1 and 11: build each fixture three times with the model; keep every screen; read off the per-step column
// and the standard hash. Usage: node build.mjs <fixture: claims|labels|adhd> <n>   (one build; resumable)
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { cli, freshData, ledger, log, spend, totalLine, overBudget, DOMAINS, ADHD, HERE, WRITER } from './lib.mjs';

const [fixture, nArg] = process.argv.slice(2); const n = Number(nArg);
if (!['claims', 'labels', 'adhd'].includes(fixture) || !Number.isInteger(n)) throw new Error('usage: node build.mjs <claims|labels|adhd> <n>');
if (overBudget()) { log('budget reached; no build'); process.exit(3); }
const out = join(HERE, 'arms', 'builds', fixture); mkdirSync(out, { recursive: true });
const data = freshData(`build-${fixture}-${n}`);
const before = spend().total;
let args; let how;
if (fixture === 'adhd') {
  // No finished example answers exist in the repo (the evals carry criteria, not reference answers), so the skill is
  // built from the SKILL.md text as stated rules: atelier skill "<rules>" --name i-have-adhd --yes.
  // The YAML front matter is dropped: an argument that opens with "---" is read as a flag and the command sees nothing.
  const rules = readFileSync(join(ADHD, 'skills/i-have-adhd/SKILL.md'), 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  args = ['skill', rules, '--name', 'i-have-adhd', '--yes', '--model', WRITER]; how = 'atelier skill from SKILL.md (no finished examples in the repo)';
} else {
  args = ['new', join(DOMAINS, fixture, 'examples'), '--method', join(DOMAINS, fixture, 'method.md'), '--name', fixture, '--yes', '--report', '--model', WRITER]; how = 'atelier new examples --method method.md';
}
const t0 = Date.now();
const r = cli(args, { data, tag: `build:${fixture}:${n}` });
const secs = (Date.now() - t0) / 1000;
const screen = `$ atelier ${args.map((a) => (a.length > 80 ? '<SKILL.md text>' : a)).join(' ')}\n\n${r.stdout}\n--- stderr ---\n${r.stderr}`;
writeFileSync(join(out, `build-${n}.txt`), screen);
// the standard as minted, kept beside the screen
const std = join(data, 'skills', fixture === 'adhd' ? 'i-have-adhd' : fixture, 'standards');
const hashes = existsSync(std) ? readFileSync(join(data, 'skills', fixture === 'adhd' ? 'i-have-adhd' : fixture, 'ledgers', '..', 'active.json'), 'utf8') : null;
const stdHash = /Standard ([0-9a-f]{16})/.exec(r.stdout)?.[1] ?? /standard ([0-9a-f]{8})/.exec(r.stdout)?.[1] ?? null;
if (stdHash && existsSync(join(std, `${stdHash}.json`))) copyFileSync(join(std, `${stdHash}.json`), join(out, `build-${n}.standard.json`));
const usd = spend().total - before;
ledger({ step: 'test1', fixture, build: n, how, exit: r.status, seconds: secs, meterUsd: usd, standardHash: stdHash, data });
log(`build ${fixture} #${n}: exit ${r.status}, ${secs.toFixed(0)}s, $${usd.toFixed(4)}, standard ${stdHash}; ${totalLine()}`);
