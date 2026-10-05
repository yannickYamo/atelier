// studies/harness/coverage-qualification.mjs — DOES THE COVERAGE READING SEE A PART OF THE REQUEST THE REPLY LEFT OUT?
//
// Sealed by studies/COVERAGE_READER_PREREGISTRATION.md. The reading under test is the product's own
// (dist/core/loop/context-judge.js, `covers`). Material: requests that ask for several named parts.
//
//   full      a reply a writer model wrote to give every part. A part read as missing is a false alarm.
//   omitted   the same reply written again with ONE named part left out. Reading that part as given is a miss.
//
//   node studies/harness/coverage-qualification.mjs --tasks <tasks.jsonl> --out <dir> [--cap 4] [--writer claude-sonnet-5] [--reader claude-haiku-4-5]
//   tasks.jsonl: one {"id", "request", "parts": ["the request's own words for each part", ...]} a line (2 to 5 parts).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spend } from '../../dist/core/inference/client.js';
import { modelJudge } from '../../dist/core/loop/context-judge.js';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { arg, fail, clientFor, budgetOf } from './study-client.mjs';

const TASKS = readFileSync(arg('--tasks') ?? fail('missing --tasks'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const OUT = arg('--out') ?? fail('missing --out');
mkdirSync(OUT, { recursive: true });
const budget = budgetOf(Number(arg('--cap', '4')), 4000);
const writer = clientFor(arg('--writer', 'claude-sonnet-5')); const judge = modelJudge(clientFor(arg('--reader', 'claude-haiku-4-5')), budget);
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const flat = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
// OMISSIONS A PERSON REJECTED (`--rejected <file>`, one task id a line): a rewrite that kept the part it was told to
// remove is not an omission, and scoring it would count the writer's failure as the reader's miss. The run writes
// omissions-for-review.md; sensitivity is read only once a person has been through it (`--rejected` or `--reviewed`).
const REJECTED = new Set(arg('--rejected') && existsSync(arg('--rejected')) ? readFileSync(arg('--rejected'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
const REVIEWED = REJECTED.size > 0 || process.argv.includes('--reviewed');
for (const t of TASKS) for (const p of t.parts) if (!flat(t.request).includes(flat(p))) fail(`${t.id}: the part "${p}" is not the request's own words.`);
const SCHEMA = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false };
async function write(key, system, user) {
  if (cache[key]) return cache[key];
  try {
    const x = await spend(budget, 0.05, async () => { const r = await writer.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: 'emit_reply', toolDescription: 'Return the reply.', schema: SCHEMA, maxTokens: 2500, temperature: 0.7 }); return { value: r.json, cost: r.cost }; });
    cache[key] = { reply: typeof x?.reply === 'string' ? x.reply.trim() : '' };
  } catch (e) { cache[key] = { failed: String(e.message).split('\n')[0] }; }
  save(); return cache[key];
}
// Which sealed part a reader's quoted part is: the one whose words overlap it. A part the reader did not list is unread.
const verdictFor = (coverage, part) => { const hit = (coverage?.parts ?? []).find((x) => flat(x.words).includes(flat(part)) || flat(part).includes(flat(x.words))); return hit ? hit.covered : undefined; };
const rows = [];
for (const t of TASKS) {
  const full = await write(`full|${t.id}`, 'Write a complete reply to the request. Give every part it asks for, each in its own paragraph.', t.request);
  if (!full.reply) { rows.push({ id: t.id, failed: full.failed ?? 'no reply' }); continue; }
  const cFull = await judge.covers(t.request, full.reply);
  for (const p of t.parts) rows.push({ id: t.id, kind: 'full', part: p, read: cFull ? verdictFor(cFull, p) : 'unread' });
  // One omission per task: the part chosen by the task's position, so the choice is fixed before any reply exists.
  const part = t.parts[TASKS.indexOf(t) % t.parts.length];
  const om = await write(`omit|${t.id}`, `Here is a reply to a request. Write it again with everything about ONE part of the request removed: "${part}". Keep every other part as it is, and do not mention that anything was left out.`, `<request>\n${t.request}\n</request>\n\n<reply>\n${full.reply}\n</reply>`);
  if (!om.reply) { rows.push({ id: t.id, kind: 'omitted', part, failed: om.failed ?? 'no reply' }); continue; }
  const cOm = await judge.covers(t.request, om.reply);
  rows.push({ id: t.id, kind: 'omitted', part, read: cOm ? verdictFor(cOm, part) : 'unread', text: om.reply, full: full.reply, request: t.request, ...(REJECTED.has(t.id) ? { rejected: true } : {}) });
}
const rate = (k, n) => { const c = clopperPearson(k, n); return { k, n, share: n ? Math.round((k / n) * 1000) / 1000 : null, ci95: [Math.round(c.lo * 1000) / 1000, Math.round(c.hi * 1000) / 1000] }; };
const allOm = rows.filter((r) => r.kind === 'omitted' && !r.failed); const om = allOm.filter((r) => !r.rejected); const fu = rows.filter((r) => r.kind === 'full');
// MISSING means read as not given (false). Unlisted, unclear and unread are not "missing": they count against sensitivity.
const m = { omitted: om.length, rejectedOmissions: allOm.length - om.length, reviewed: REVIEWED, fullParts: fu.length, unread: rows.filter((r) => r.read === 'unread').length,
  sensitivity: rate(om.filter((r) => r.read === false).length, om.length), falseAlarm: rate(fu.filter((r) => r.read === false).length, fu.length) };
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const bars = { sensitivity: num(m.sensitivity.share) && m.sensitivity.share >= 0.85 && m.sensitivity.ci95[0] >= 0.75, falseAlarm: num(m.falseAlarm.share) && m.falseAlarm.share <= 0.1, enough: om.length >= 40,
  complete: rows.length > 0 && (m.unread + rows.filter((r) => r.failed).length) / rows.length <= 0.05 };
writeFileSync(join(OUT, 'omissions-for-review.md'), `# Omissions to confirm\n\nFor each, check that the omitted reply really no longer gives the named part. List the task ids where it still does in a file, one a line, and run again with --rejected <file> (or --reviewed when none is rejected).\n\n${allOm.map((r) => `## ${r.id}\n\nRequest: ${r.request}\n\nPart removed: ${r.part}\n\n### Full reply\n\n${r.full}\n\n### Omitted reply\n\n${r.text}\n`).join('\n---\n\n')}`);
// Until a person has confirmed the omissions the verdict is UNRESOLVED, whatever the numbers say.
const result = { measures: m, bars, verdict: !REVIEWED || !bars.complete || !bars.enough ? 'UNRESOLVED' : bars.sensitivity && bars.falseAlarm ? 'PASS' : 'FAIL', spentUsd: Math.round(budget.spentUsd * 1000) / 1000, rows };
writeFileSync(join(OUT, 'coverage-reader.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ measures: m, bars, verdict: result.verdict, spentUsd: result.spentUsd }, null, 1));
