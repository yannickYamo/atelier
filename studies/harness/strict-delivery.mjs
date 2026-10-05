// studies/harness/strict-delivery.mjs — UNDER STRICT DELIVERY, DOES ANYTHING THAT BREAKS A REQUIRED RULE GET DELIVERED?
//
// Sealed by studies/CLOSING_B_PREREGISTRATION.md. Runs each sealed request once through `atelier invoke --strict
// --json`, records whether it was delivered or refused, and writes every delivered output to one file for a person
// to audit against the skill's REQUIRED measured rules. The harness decides nothing about the audit: a person does.
//
//   node studies/harness/strict-delivery.mjs --requests <requests.jsonl> --data <ATELIER_DATA> --project <dir> --out <dir> [--cap-per-run 4] [--redraws 2]
//   requests.jsonl: one {"id", "skill", "request"} a line, written and held by someone who is not the builder.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { arg, fail } from './study-client.mjs';

const REQS = readFileSync(arg('--requests') ?? fail('missing --requests'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const DATA = arg('--data') ?? fail('missing --data'); const PROJECT = arg('--project') ?? fail('missing --project');
const OUT = arg('--out') ?? fail('missing --out');
const PASS_THROUGH = process.argv.includes('--provider') ? process.argv.slice(process.argv.indexOf('--provider')) : [];
const CLI = join(process.cwd(), 'dist/cli/atelier.mjs');
mkdirSync(OUT, { recursive: true });
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
for (const q of REQS) {
  if (cache[q.id]) continue;
  let out = ''; let code = 0; let err = '';
  try { out = execFileSync('node', [CLI, 'invoke', '--skill', q.skill, q.request, '--strict', '--redraws', arg('--redraws', '2'), '--json', '--cap', arg('--cap-per-run', '4'), ...PASS_THROUGH],
    { encoding: 'utf8', cwd: PROJECT, env: { ...process.env, ATELIER_DATA: DATA, ATELIER_PROJECT_DIR: PROJECT }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { out = `${e.stdout ?? ''}`; err = `${e.stderr ?? ''}`; code = e.status ?? -1; }
  let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* a run that printed no JSON */ }
  // THREE OUTCOMES, AND A FOURTH THAT IS NOT ONE: delivered conformant (exit 0), refused (exit 3, no text), and a run
  // that failed for another reason, which is counted apart and never as a refusal or a delivery.
  cache[q.id] = !j ? { skill: q.skill, request: q.request, errored: err.split('\n').filter(Boolean).slice(-2).join(' '), code }
    : { skill: q.skill, request: q.request, code, delivered: j.delivered === true, output: j.output ?? null, invocationId: j.invocationId, costUsd: j.costUsd ?? 0,
      conformant: j.eval?.result?.conformant ?? null, reasons: j.eval?.result?.reasons ?? [], redrawn: j.eval?.fidelity?.shape?.written ?? null, coverage: j.eval?.monitors?.coverage ?? null };
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  console.log(`${q.id}  ${cache[q.id].errored ? 'ERRORED' : cache[q.id].delivered ? 'delivered' : 'refused'}  exit ${code}`);
}
const rows = REQS.map((q) => ({ id: q.id, ...cache[q.id] }));
const ran = rows.filter((r) => !r.errored); const delivered = ran.filter((r) => r.delivered); const refused = ran.filter((r) => !r.delivered);
const ci = (k, n) => { const c = clopperPearson(k, n); return [Math.round(c.lo * 1000) / 1000, Math.round(c.hi * 1000) / 1000]; };
// A DELIVERED OUTPUT THAT THE RUN ITSELF CALLED NOT CONFORMANT is a defect of strict delivery, found without a person.
const leaked = delivered.filter((r) => r.conformant !== true || r.code !== 0);
const result = { requests: REQS.length, errored: rows.length - ran.length, delivered: delivered.length, refused: refused.length, refusalRate: ran.length ? { share: Math.round((refused.length / ran.length) * 1000) / 1000, ci95: ci(refused.length, ran.length) } : null,
  deliveredNotConformantByItsOwnVerdict: leaked.map((r) => r.id), refusalReasons: refused.map((r) => ({ id: r.id, reasons: r.reasons })),
  audit: 'PENDING: a person reads delivered-for-audit.md against the REQUIRED measured rules and records each failure' };
writeFileSync(join(OUT, 'strict-delivery.json'), JSON.stringify(result, null, 1));
writeFileSync(join(OUT, 'delivered-for-audit.md'), `# Delivered outputs to audit\n\nFor each, check every REQUIRED measured rule of its skill (atelier status --skill <name> lists them). Record the id and the rule of any output that breaks one.\n\n${delivered.map((r) => `## ${r.id} (skill ${r.skill})\n\nRequest: ${r.request}\n\n${r.output}\n`).join('\n---\n\n')}`);
console.log(JSON.stringify(result, null, 1));
