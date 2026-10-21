// Shared helpers for the 2026-10-21 study scripts: one way to call the CLI, one ledger, one running total.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..', '..');
export const CLI = join(ROOT, 'dist/cli/atelier.mjs');
export const DOMAINS = join(ROOT, 'bench/standing/domains');
export const SCRATCH = process.env.STUDY_SCRATCH ?? join(tmpdir(), 'atelier-study-2026-10-21');
/** A checkout of the public i-have-adhd repository, read as data and never executed. */
export const ADHD = process.env.STUDY_ADHD ?? join(SCRATCH, 'fixtures', 'i-have-adhd');
export const TAG_FILE = join(SCRATCH, 'tag.txt');
export const CALLS = join(HERE, 'calls.jsonl');
export const LEDGER = join(HERE, 'ledger.json');
export const BUDGET_USD = 30;
export const WRITER = 'claude-sonnet-5-5';
export const PROXY = 'http://127.0.0.1:8765';

/** A fresh ATELIER_DATA so nothing touches ~/.atelier; the project dir is a scratch folder so the installed skill lands there. */
export const freshData = (label) => { const d = mkdtempSync(join(SCRATCH, 'data', `${label}-`)); mkdirSync(join(d, 'project'), { recursive: true }); return d; };
export const setTag = (t) => writeFileSync(TAG_FILE, t);

/** Every call of the study goes through the meter; the key comes from the env the caller loaded (never printed). */
export function cli(args, { data, tag, cwd, input, timeoutMs = 20 * 60_000 } = {}) {
  if (tag) setTag(tag);
  const env = { ...process.env, ATELIER_DATA: data, ANTHROPIC_BASE_URL: PROXY, NO_COLOR: '1' };
  const r = spawnSync('node', [CLI, ...args], { cwd: cwd ?? join(data, 'project'), env, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', signal: r.signal };
}

/** The one JSON object a --json command prints (stdout may carry nothing else). */
export const parseJson = (s) => { const i = s.indexOf('{'); if (i < 0) return null; try { return JSON.parse(s.slice(i)); } catch { try { return JSON.parse(s.slice(i, s.lastIndexOf('}') + 1)); } catch { return null; } } };

// Atelier's own rate card (providers/pricing.ts, checked 2026-10-19), matched on the model id's prefix so a dated id
// (claude-haiku-4-5-20251001) is priced. A call is priced here from the usage the provider reported.
const RATES = [['claude-sonnet-5-5', 2, 10], ['claude-haiku-5-5', 0.1, 0.5], ['claude-haiku-4-5', 1, 5], ['claude-opus-5-5', 4, 20], ['claude-opus-5', 5, 25], ['claude-fable-5', 10, 50]];
export const priceOf = (model, u) => { const r = RATES.find(([m]) => String(model ?? '').startsWith(m)); if (!r || !u) return 0;
  return ((u.input_tokens ?? 0) * r[1] + (u.cache_creation_input_tokens ?? 0) * r[1] * 1.25 + (u.cache_read_input_tokens ?? 0) * r[1] * 0.1 + (u.output_tokens ?? 0) * r[2]) / 1e6; };
/** The meter's calls, summed by tag; the running total is what the budget is held against. */
export function spend() {
  if (!existsSync(CALLS)) return { total: 0, byTag: {} };
  const byTag = {}; let total = 0;
  for (const line of readFileSync(CALLS, 'utf8').split('\n').filter(Boolean)) {
    const c = JSON.parse(line); const usd = priceOf(c.model, c.usage); total += usd;
    byTag[c.tag] = byTag[c.tag] ?? { usd: 0, calls: 0 }; byTag[c.tag].usd += usd; byTag[c.tag].calls += 1;
  }
  return { total, byTag };
}
export const totalLine = () => `[spend] running total $${spend().total.toFixed(4)}`;
export function overBudget() { return spend().total >= BUDGET_USD; }

/** One line per run in the ledger: the command's own costUsd beside what the meter booked under its tag. */
export function ledger(entry) {
  const cur = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: [] };
  cur.entries.push({ at: new Date().toISOString(), ...entry });
  cur.meterTotalUsd = spend().total;
  writeFileSync(LEDGER, JSON.stringify(cur, null, 1));
}
export const log = (...a) => { const s = a.join(' '); console.log(s); appendFileSync(join(HERE, 'study.log'), `${new Date().toISOString()} ${s}\n`); };
export const writeOut = (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
export const read = (p) => readFileSync(p, 'utf8');
