// studies/harness/strict-delivery.mjs — UNDER STRICT DELIVERY, DOES ANYTHING THAT BREAKS A REQUIRED RULE GET DELIVERED?
//
// Sealed by studies/CLOSING_B_PREREGISTRATION.md. Runs each sealed request once through `atelier invoke --strict
// --json`, records whether it was delivered or refused, and writes every delivered output to one file for a person
// to audit against the skill's REQUIRED measured rules. The harness decides nothing about the audit: a person does.
//
//   node studies/harness/strict-delivery.mjs --requests <requests.jsonl> --data <ATELIER_DATA> --project <dir> --out <dir> [--cap-per-run 4] [--redraws 2] [--pilot]
//   requests.jsonl: one {"id", "skill", "request"} a line, written and held by someone who is not the builder.
//   Without --pilot the file must name at least two skills with at least 60 requests each: the claim is per skill.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { arg, fail } from './study-client.mjs';

const REQS = readFileSync(arg('--requests') ?? fail('missing --requests'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const DATA = arg('--data') ?? fail('missing --data'); const PROJECT = arg('--project') ?? fail('missing --project');
const OUT = arg('--out') ?? fail('missing --out');
const PILOT = process.argv.includes('--pilot'); const MIN_PER_SKILL = 60; const RETRIES = 2;
const PASS_THROUGH = process.argv.includes('--provider') ? process.argv.slice(process.argv.indexOf('--provider')) : [];
const CLI = join(process.cwd(), 'dist/cli/atelier.mjs');
const SKILLS = [...new Set(REQS.map((q) => q.skill))];
const count = (skill) => REQS.filter((q) => q.skill === skill).length;
if (!PILOT && (SKILLS.length < 2 || SKILLS.some((k) => count(k) < MIN_PER_SKILL))) fail(`the claim is per skill: at least two skills with ${MIN_PER_SKILL} requests each (found ${SKILLS.map((k) => `${k}: ${count(k)}`).join(', ')}). For the pilot, pass --pilot. Nothing was spent.`);
mkdirSync(OUT, { recursive: true });
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
/** An error worth trying again: the provider was busy or slow. Anything else is the run's own failure. */
const transient = (text) => /\b(429|5\d\d)\b|rate.?limit|overloaded|timed? ?out|ETIMEDOUT|ECONNRESET|socket hang up/i.test(text);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
function once(q) {
  let out = ''; let code = 0; let err = '';
  try { out = execFileSync('node', [CLI, 'invoke', '--skill', q.skill, q.request, '--strict', '--redraws', arg('--redraws', '2'), '--json', '--cap', arg('--cap-per-run', '4'), ...PASS_THROUGH],
    { encoding: 'utf8', cwd: PROJECT, env: { ...process.env, ATELIER_DATA: DATA, ATELIER_PROJECT_DIR: PROJECT }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { out = `${e.stdout ?? ''}`; err = `${e.stderr ?? ''}`; code = e.status ?? -1; }
  let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* a run that printed no JSON */ }
  return { j, code, err };
}
for (const q of REQS) {
  // A cached transient error is tried again on resume; every other cached row is final.
  if (cache[q.id] && !(cache[q.id].errored && cache[q.id].transient)) continue;
  let r = once(q); let tries = 1;
  while (!r.j && transient(r.err) && tries <= RETRIES) { await wait(2000 * 2 ** (tries - 1) * (process.env.STRICT_RETRY_MS ? 0 : 1) + Number(process.env.STRICT_RETRY_MS ?? 0)); r = once(q); tries += 1; }
  const { j, code, err } = r;
  // THREE OUTCOMES: delivered conformant (exit 0), refused (exit 3, no text), and errored after its retries. An
  // errored run delivered nothing to the person waiting: it counts as NOT DELIVERED in availability, and apart as an error.
  cache[q.id] = !j ? { skill: q.skill, request: q.request, errored: err.split('\n').filter(Boolean).slice(-2).join(' ') || 'no output', transient: transient(err), tries, code }
    : { skill: q.skill, request: q.request, code, tries, delivered: j.delivered === true, output: j.output ?? null, invocationId: j.invocationId, costUsd: j.costUsd ?? 0,
      conformant: j.eval?.result?.conformant ?? null, reasons: j.eval?.result?.reasons ?? [], redrawn: j.eval?.fidelity?.shape?.written ?? null, coverage: j.eval?.monitors?.coverage ?? null };
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  console.log(`${q.id}  ${cache[q.id].errored ? 'ERRORED' : cache[q.id].delivered ? 'delivered' : 'refused'}  exit ${code}${tries > 1 ? `  (${tries} tries)` : ''}`);
}
const rows = REQS.map((q) => ({ id: q.id, ...cache[q.id] }));
const ci = (k, n) => { const c = clopperPearson(k, n); return [Math.round(c.lo * 1000) / 1000, Math.round(c.hi * 1000) / 1000]; };
/** Why a run was refused, by the verdict's own reasons. One refusal may have several. */
const REASONS = [['broken rule', /required rule/i], ['invented claim', /invented claim/i], ['unconfirmed specifics', /unconfirmed/i], ['copied run', /copied/i], ['could not check', /not checked|no standard|could not be evaluated/i]];
const summarise = (rs) => {
  const delivered = rs.filter((r) => r.delivered); const errored = rs.filter((r) => r.errored); const refused = rs.filter((r) => !r.errored && !r.delivered);
  const byReason = Object.fromEntries(REASONS.map(([name, re]) => [name, refused.filter((r) => (r.reasons ?? []).some((x) => re.test(x))).length]));
  byReason.other = refused.filter((r) => !(r.reasons ?? []).some((x) => REASONS.some(([, re]) => re.test(x)))).length;
  return { requests: rs.length, delivered: delivered.length, refused: refused.length, errored: errored.length,
    // AVAILABILITY IS OVER EVERY REQUEST: a refusal and an error after its retries are both "the person got nothing".
    notDelivered: rs.length ? { share: Math.round(((rs.length - delivered.length) / rs.length) * 1000) / 1000, ci95: ci(rs.length - delivered.length, rs.length) } : null,
    refusalsByReason: byReason,
    // A DELIVERED OUTPUT THAT THE RUN ITSELF CALLED NOT CONFORMANT is a defect of strict delivery, found without a person.
    deliveredNotConformantByItsOwnVerdict: delivered.filter((r) => r.conformant !== true || r.code !== 0).map((r) => r.id) };
};
const result = { pilot: PILOT, all: summarise(rows), perSkill: Object.fromEntries(SKILLS.map((k) => [k, summarise(rows.filter((r) => r.skill === k))])),
  refusals: rows.filter((r) => !r.errored && !r.delivered).map((r) => ({ id: r.id, skill: r.skill, reasons: r.reasons })), errors: rows.filter((r) => r.errored).map((r) => ({ id: r.id, skill: r.skill, error: r.errored, tries: r.tries })),
  audit: 'PENDING: a person reads delivered-for-audit.md against the REQUIRED measured rules and records each failure' };
writeFileSync(join(OUT, 'strict-delivery.json'), JSON.stringify(result, null, 1));
writeFileSync(join(OUT, 'delivered-for-audit.md'), `# Delivered outputs to audit\n\nFor each, check every REQUIRED measured rule of its skill. Record the id and the rule of any output that breaks one.\n\n${rows.filter((r) => r.delivered).map((r) => `## ${r.id} (skill ${r.skill})\n\nRequest: ${r.request}\n\n${r.output}\n`).join('\n---\n\n')}`);
console.log(JSON.stringify({ pilot: result.pilot, all: result.all, perSkill: result.perSkill }, null, 1));
