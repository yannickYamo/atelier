// Shared helpers for the 2026-10-22b study scripts (copied from 2026-10-22 and fixed): one way to call the CLI, one
// meter, one ledger, one running total held against the cap.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { request } from 'node:http';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..', '..');
export const CLI = join(ROOT, 'dist/cli/atelier.mjs');
export const DOMAINS = join(ROOT, 'bench/standing/domains');
export const SCRATCH = process.env.STUDY_SCRATCH ?? join(tmpdir(), 'atelier-study-2026-10-22b');
/** A checkout of the public i-have-adhd repository, read as data and never executed. */
export const ADHD = process.env.STUDY_ADHD ?? join(SCRATCH, 'fixtures', 'i-have-adhd');
export const PORT = Number(process.env.STUDY_PORT ?? 8791);
export const TAG_FILE = join(SCRATCH, 'tag.txt');
export const CALLS = join(HERE, 'calls.jsonl');
export const LEDGER = join(HERE, 'ledger.json');
/** The hard cap is $14 measured; the scripts stop short of it so one more call cannot cross it. */
export const CAP_USD = 14;
export const BUDGET_USD = Number(process.env.STUDY_STOP_AT ?? 13.5);
export const WRITER = 'claude-sonnet-5-5';
export const PROXY = `http://127.0.0.1:${PORT}`;

mkdirSync(join(SCRATCH, 'data'), { recursive: true });
/** A fresh ATELIER_DATA for every build and every copy, so nothing touches ~/.atelier and a ledger hash is the standard in that folder. */
export const freshData = (label) => { const d = mkdtempSync(join(SCRATCH, 'data', `${label}-`)); mkdirSync(join(d, 'project'), { recursive: true }); return d; };
export const setTag = (t) => writeFileSync(TAG_FILE, t);

/** Does the meter answer: a GET to /ping, which the meter answers itself; three tries, so one slow answer is not a stop. */
const pingOnce = (timeoutMs) => new Promise((ok) => {
  const r = request({ host: '127.0.0.1', port: PORT, path: '/ping', method: 'GET', timeout: timeoutMs, agent: false }, (res) => { res.resume(); ok(true); });
  r.on('error', () => ok(false)); r.on('timeout', () => { r.destroy(); ok(false); }); r.end();
});
export async function meterAnswers(timeoutMs = 10_000) {
  for (let i = 0; i < 3; i++) { if (await pingOnce(timeoutMs)) return true; await new Promise((r) => setTimeout(r, 2000)); }
  return false;
}
/** A connection failure, read off a command's stderr: the run is stopped, never logged as a result. */
export const CONNECTION = /ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|socket hang up|fetch failed|Connection error|connect ECONN|network error|other side closed|UND_ERR/i;

/** Every call of the study goes through the meter; the key comes from the env the caller loaded (never printed). */
export function cli(args, { data, tag, cwd, input, timeoutMs = 20 * 60_000 } = {}) {
  if (tag) setTag(tag);
  const env = { ...process.env, ATELIER_DATA: data, ANTHROPIC_BASE_URL: PROXY, NO_COLOR: '1' };
  const r = spawnSync('node', [CLI, ...args], { cwd: cwd ?? join(data, 'project'), env, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', signal: r.signal };
}

/** The one JSON object a --json command prints (stdout may carry nothing else). */
export const parseJson = (s) => { const i = s.indexOf('{'); if (i < 0) return null; try { return JSON.parse(s.slice(i)); } catch { try { return JSON.parse(s.slice(i, s.lastIndexOf('}') + 1)); } catch { return null; } } };

// Atelier's own rate card (providers/pricing.ts), matched on the model id's prefix so a dated id is priced.
const RATES = [['claude-sonnet-5-5', 2, 10], ['claude-haiku-5-5', 0.1, 0.5], ['claude-haiku-4-5', 1, 5], ['claude-opus-5-5', 4, 20], ['claude-opus-5', 5, 25], ['claude-fable-5', 10, 50]];
export const priceOf = (model, u) => { const r = RATES.find(([m]) => String(model ?? '').startsWith(m)); if (!r || !u) return 0;
  return ((u.input_tokens ?? 0) * r[1] + (u.cache_creation_input_tokens ?? 0) * r[1] * 1.25 + (u.cache_read_input_tokens ?? 0) * r[1] * 0.1 + (u.output_tokens ?? 0) * r[2]) / 1e6; };
/** The meter's calls, summed by tag; the running total is what the cap is held against. */
export function spend() {
  const byTag = {}; let total = 0;
  if (!existsSync(CALLS)) return { total, byTag };
  for (const line of readFileSync(CALLS, 'utf8').split('\n').filter(Boolean)) {
    const c = JSON.parse(line); const usd = priceOf(c.model, c.usage); total += usd;
    byTag[c.tag] = byTag[c.tag] ?? { usd: 0, calls: 0 }; byTag[c.tag].usd += usd; byTag[c.tag].calls += 1;
  }
  return { total, byTag };
}
export const totalLine = () => `[spend] running total $${spend().total.toFixed(4)}`;
export function overBudget(next = 0) { return spend().total + next >= BUDGET_USD; }

/** One line per run in the ledger: the command's own costUsd beside what the meter booked under its tag. */
export function ledger(entry) {
  const cur = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: [] };
  cur.entries.push({ at: new Date().toISOString(), ...entry });
  cur.meterTotalUsd = spend().total;
  writeFileSync(LEDGER, JSON.stringify(cur, null, 1));
}
export const entries = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')).entries : []);
/** The build a later test runs on: build 1 of the fixture, in its own data folder. */
export const buildOf = (fixture, build = 1) => entries().find((e) => e.step === 'testA1' && e.fixture === fixture && e.build === build && e.exit === 0 && e.standardHash);
export const log = (...a) => { const s = a.join(' '); console.log(s); appendFileSync(join(HERE, 'study.log'), `${new Date().toISOString()} ${s}\n`); };
export const writeOut = (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
export const read = (p) => readFileSync(p, 'utf8');
/** Method step n of a domain, in the owner's words, without its number. */
export const methodStep = (fixture, n) => {
  const line = read(join(DOMAINS, fixture, 'method.md')).split('\n').find((l) => new RegExp(`^\\s*${n}\\.\\s`).test(l));
  return line ? line.replace(/^\s*\d+\.\s*/, '').trim() : null;
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Is a requirement's statement the step's (the whole step, or one of its sentences, or the step inside it). */
export const isStep = (statement, step) => { const a = norm(statement); const b = norm(step); return Boolean(a && b) && (a === b || b.includes(a) || a.includes(b)); };
