// Test C: the latitude reading (core/observers/latitude.ts) on 30 labelled cases, 10 per level, five draws each,
// through the built dist module and the context reader (the house reading pattern, its default small model).
// Usage: node latitude/bench.mjs [draws]   Writes latitude/draws.jsonl and latitude/summary.json.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { setTag, spend, meterAnswers, PROXY, ROOT } from '../lib.mjs';

process.env.ANTHROPIC_BASE_URL = PROXY;
const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
if (!(await meterAnswers())) throw new Error('meter does not answer');
const { readContext } = await import(join(DIST, 'core/inference/reading.js'));
const { LATITUDE } = await import(join(DIST, 'core/observers/latitude.js'));
const { contextReaderClient, contextReaderModel } = await import(join(DIST, 'cli/runtime.js'));
const draws = Number(process.argv[2] ?? 5);
const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
const out = join(HERE, 'draws.jsonl');
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.id}:${j.draw}`; }) : []);
const model = contextReaderModel(); const client = contextReaderClient();
if (!client) throw new Error('no context reader');
setTag('testC:latitude');
const s0 = spend().total;
for (const c of cases) for (let d = 1; d <= draws; d++) {
  if (done.has(`${c.id}:${d}`)) continue;
  const r = await readContext(LATITUDE, { purpose: c.purpose, method: null, examples: c.examples }, client, model, { spentUsd: 0, capUsd: 0.05, maxCalls: 1 });
  appendFileSync(out, JSON.stringify({ id: c.id, label: c.label, draw: d, level: r.value.level, by: r.by, evidence: r.value.evidence, why: r.why ?? null }) + '\n');
}
const rows = readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const per = cases.map((c) => { const rs = rows.filter((r) => r.id === c.id); const right = rs.filter((r) => r.level === c.label).length;
  return { id: c.id, label: c.label, draws: rs.length, right, levels: rs.map((r) => r.level), floors: rs.filter((r) => r.by !== 'model').length }; });
const summary = { model, draws, cases: per.length, rightIn4of5: per.filter((p) => p.right >= 4).length, strictReadCreative: rows.filter((r) => r.label === 'STRICT' && r.level === 'CREATIVE').length,
  floors: rows.filter((r) => r.by !== 'model').length, byLabel: Object.fromEntries(['STRICT', 'GROUNDED', 'CREATIVE'].map((l) => [l, per.filter((p) => p.label === l && p.right >= 4).length])),
  wrong: per.filter((p) => p.right < 4), meterUsd: spend().total - s0, pass: null };
summary.pass = summary.rightIn4of5 >= 27 && summary.strictReadCreative === 0;
writeFileSync(join(HERE, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, wrong: summary.wrong.map((w) => `${w.id} ${w.label}: ${w.levels.join(',')}`) }, null, 1));
