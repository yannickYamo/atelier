// Test A1 (reproducibility): five builds per enterprise fixture with unchanged inputs, EACH IN ITS OWN FRESH
// ATELIER_DATA (so the hash the ledger records is the standard in that folder, and nothing frozen by an earlier build
// is reused). Build "reword" runs in a copy of build 1's folder with one step of method.md reworded: the rebuild a
// person makes after editing their method. i-have-adhd is built once (atelier skill from SKILL.md minus front matter).
// SERIES (the A1 pass line, as corrected): "s2".."s5" and "sreword" run IN ONE DATA FOLDER, a copy of build 1's taken
// before any rebuild (so build 1's own folder stays the skill the later tests use): builds 2 to 5 with unchanged
// inputs, where the checks build 1 froze are kept, then the reworded step in that same folder.
// Usage: node build.mjs <claims|labels|adhd> <n|reword|s2..s5|sreword>
import { join } from 'node:path';
import { readFileSync, writeFileSync, copyFileSync, existsSync, cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { cli, freshData, ledger, log, spend, totalLine, overBudget, buildOf, entries, meterAnswers, CONNECTION, DOMAINS, ADHD, HERE, SCRATCH, WRITER } from './lib.mjs';

const [fixture, nArg] = process.argv.slice(2); const n = /^(reword|s[2-5]|sreword)$/.test(nArg ?? '') ? nArg : Number(nArg);
if (!['claims', 'labels', 'adhd'].includes(fixture) || !(typeof n === 'string' || Number.isInteger(n))) throw new Error('usage: node build.mjs <claims|labels|adhd> <n|reword|s2..s5|sreword>');
const series = typeof n === 'string' && n.startsWith('s');
if (overBudget()) { log('budget reached; no build'); process.exit(3); }
if (!(await meterAnswers())) { log('meter does not answer; no build'); process.exit(4); }
const out = join(HERE, 'arms', 'builds', fixture); mkdirSync(out, { recursive: true });
const copyOf = (src) => { const d = mkdtempSync(join(SCRATCH, 'data', `build-${fixture}-reword-`)); cpSync(src, d, { recursive: true }); return d; };
const seriesData = () => { const first = entries().find((e) => e.step === 'testA1-series' && e.fixture === fixture && e.exit === 0); if (first) return first.data;
  const d = mkdtempSync(join(SCRATCH, 'data', `series-${fixture}-`)); cpSync(buildOf(fixture, 1).data, d, { recursive: true }); return d; };
const data = series ? seriesData() : n === 'reword' ? copyOf(buildOf(fixture, 1).data) : freshData(`build-${fixture}-${n}`);
const skill = fixture === 'adhd' ? 'i-have-adhd' : fixture;
const before = spend().total;
// THE REWORDED STEP: one step's words changed, the rest of the note byte for byte.
const REWORD = { claims: ['7. Never use the words "fraud", "scam", "liar" or "suspicious".', '7. Do not write the words "fraud", "scam", "liar" or "suspicious" anywhere in the memo.'],
  labels: ['7. Every flagged category carries evidence: the words of the transcript, copied, that support it.', '7. Each flagged category comes with evidence: the transcript\'s own words, copied, that support it.'] };
let method = join(DOMAINS, fixture, 'method.md');
if (n === 'reword' || n === 'sreword') {
  const src = readFileSync(method, 'utf8'); const r = REWORD[fixture];
  if (!src.includes(r[0])) throw new Error('reword target not found');
  method = join(SCRATCH, `method-${fixture}-reworded.md`); writeFileSync(method, src.replace(r[0], r[1]));
  writeFileSync(join(out, 'reworded-step.json'), JSON.stringify({ step: 7, from: r[0], to: r[1] }, null, 1));
}
let args; let how;
if (fixture === 'adhd') {
  const rules = readFileSync(join(ADHD, 'skills/i-have-adhd/SKILL.md'), 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  args = ['skill', rules, '--name', 'i-have-adhd', '--yes', '--model', WRITER]; how = 'atelier skill from SKILL.md (no finished examples in the repo)';
} else {
  args = ['new', join(DOMAINS, fixture, 'examples'), '--method', method, '--name', fixture, '--yes', '--report', '--model', WRITER, ...(n === 'reword' || n === 'sreword' ? ['--reason', 'one step of the method reworded (study A1)'] : [])];
  how = n === 'reword' ? 'copy of build 1 data, one step reworded' : n === 'sreword' ? 'series folder after builds 2-5, one step reworded' : series ? 'series folder (copy of build 1 data), unchanged inputs' : 'atelier new examples --method method.md (fresh data)';
}
const t0 = Date.now();
const r = cli(args, { data, tag: `build:${fixture}:${n}` });
const secs = (Date.now() - t0) / 1000;
if (r.status !== 0 && CONNECTION.test(r.stderr)) { log(`build ${fixture} #${n}: connection error, stopped (not a result)`); writeFileSync(join(out, `build-${n}.connection-error.txt`), r.stderr); process.exit(4); }
writeFileSync(join(out, `build-${n}.txt`), `$ atelier ${args.map((a) => (a.startsWith('/') ? a.replace(/^.*\/(bench\/|method-)/, '$1') : a.length > 80 ? '<SKILL.md text>' : a)).join(' ')}\n\n${r.stdout}\n--- stderr ---\n${r.stderr}`);
const d = join(data, 'skills', skill);
const a = existsSync(join(d, 'active.json')) ? JSON.parse(readFileSync(join(d, 'active.json'), 'utf8')) : null;
const v = a ? JSON.parse(readFileSync(join(d, 'versions', `${a.skillVersionHash}.json`), 'utf8')) : null;
const stdHash = v?.standardVersionHash ?? v?.standard ?? null;
if (stdHash && existsSync(join(d, 'standards', `${stdHash}.json`))) copyFileSync(join(d, 'standards', `${stdHash}.json`), join(out, `build-${n}.standard.json`));
if (existsSync(join(d, 'frozen-checks.json'))) copyFileSync(join(d, 'frozen-checks.json'), join(out, `build-${n}.frozen-checks.json`));
const usd = spend().total - before;
ledger({ step: series ? 'testA1-series' : 'testA1', fixture, build: n, how, exit: r.status, seconds: secs, meterUsd: usd, standardHash: stdHash, skillVersion: a?.skillVersionHash ?? null, data });
log(`build ${fixture} #${n}: exit ${r.status}, ${secs.toFixed(0)}s, $${usd.toFixed(4)}, standard ${stdHash}; ${totalLine()}`);
