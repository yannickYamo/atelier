// The record of one held-out golden per fixture, with its material bound and the pattern claims check (no model call):
// which entries hold a run for review, and what each one's check reads. Read before the owner's acceptances are applied.
// Usage: node probe.mjs <claims|labels> <tag>
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cli, parseJson, buildOf, DOMAINS, HERE, SCRATCH } from './lib.mjs';
import { stripFront, withArgs, goldens } from './verify.mjs';
const [fx, tag] = process.argv.slice(2); const b = buildOf(fx, 1);
const dir = join(DOMAINS, fx, goldens(fx)); const f = readdirSync(dir).filter((x) => x.endsWith('.md')).sort()[0];
const tmp = join(SCRATCH, 'verify-in', `probe-${fx}.txt`); mkdirSync(join(SCRATCH, 'verify-in'), { recursive: true }); writeFileSync(tmp, stripFront(readFileSync(join(dir, f), 'utf8')));
const r = cli(['verify', '--skill', fx, tmp, ...withArgs(join(dir, f.replace('.md', '.material'))), '--json', '--claims', 'pattern'], { data: b.data, tag: `probe:${fx}:${tag}` });
const j = parseJson(r.stdout);
const rows = (j?.record?.entries ?? []).map((e) => ({ id: e.id, required: e.required, result: e.result, reason: e.reason, reads: e.reads ?? e.coverage ?? e.observation?.coverage ?? null, statement: String(e.statement ?? '').slice(0, 70) }));
mkdirSync(join(HERE, 'arms', 'probe'), { recursive: true });
writeFileSync(join(HERE, 'arms', 'probe', `${fx}-${tag}.json`), JSON.stringify({ golden: f, state: j?.state, accepted: j?.certificate?.acceptedUnmeasured ?? null, entries: rows }, null, 1));
console.log(fx, f, j?.state); for (const x of rows) console.log(JSON.stringify(x));
