// studies/harness/strict-delivery.mjs — UNDER STRICT DELIVERY, DOES ANYTHING THAT BREAKS A REQUIRED RULE GET DELIVERED?
//
// Sealed by studies/CLOSING_B_PREREGISTRATION.md. Runs each sealed request through `atelier invoke --strict --json`,
// once or `--repeats` times, records whether each run was delivered or refused, and writes every delivered output to
// one file for a person to audit against the skill's REQUIRED measured rules. The harness decides nothing about the
// audit: a person does.
//
//   node studies/harness/strict-delivery.mjs --requests <requests.jsonl> --data <ATELIER_DATA> --project <dir> --out <dir> [--repeats 1] [--bar 0.15] [--repeat-bar 0.10] [--cap-per-run 4] [--redraws 2] [--pilot] [--base-url <url>]
//   requests.jsonl: one {"id", "skill", "request"} a line, written and held by someone who is not the builder.
//   Without --pilot the file must name at least two skills with at least 60 requests each (20 each with --repeats
//   above 1, which is R3's design): the claim is per skill.
//
// WHAT IS READ, per skill, and written to <dir>/strict-delivery.json:
//   R1  nothing nonconformant is delivered. A person audits delivered-for-audit.md; the harness can only add the
//       delivered outputs the run's own verdict called not conformant (`deliveredNotConformantByItsOwnVerdict`),
//       and any of those fails R1 without a person.
//   R2  it still delivers: runs not delivered (a refusal, or an error that survived its retries) over all runs.
//       R2 holds when the upper end of the 95% interval on that share is under `--bar <share>` (default 0.15, never
//       above it). The bar is sealed before the pilot, with the requests: a bar chosen after refusals have been
//       seen is chosen to pass.
//   R3  repeatability of delivery, read only with `--repeats <n>` above 1 (a whole number from 1 to 20, default 1).
//       Each request is run n times. `split` is the number of requests whose n runs are neither all delivered nor
//       all refused: the same request got an answer one time and none another (a run that errored after its retries
//       is neither, so it splits its request). It is counted over the requests with all n runs done, and
//       `splitShare` is split over those requests. R3 holds when split <= floor(bar * requests + 1e-9) with
//       `--repeat-bar <share>` (default 0.10), in whole requests. A request with a run still to try again (a
//       transient error) is not done: R3 is then not read for that skill, and the same command finishes it.
//       R1 and R2 are read over every run of every request.
//   The verdict line names every reading that failed. With every one holding it is still PENDING THE AUDIT, since R1
//   is a person's to finish. With `--repeats 1` there is no R3 anywhere in the result or the verdict.
//
// THE CACHE. <dir>/cache.json holds one row a run, so a stopped study resumes. The first run of a request is keyed by
// its id, as it always was, and repetition k above 1 by "<id>#<k>": a cache written before repetitions existed is
// read as repetition 1 of each request, and `--repeats n` then adds the n - 1 runs that are missing.
//
// Run it from any directory: the CLI it drives is found beside this file (dist/cli/atelier.mjs, so `npm run build`
// first), never from where the command was typed.
//
// THE BACKEND. The real run uses the Anthropic API (ANTHROPIC_API_KEY); without a key the run stops before the first
// request (exit 2). `--base-url <url>` points every run at an OpenAI-compatible backend instead, exactly as
// studies/harness/voice-pass.mjs does: the offline smoke test against tests/fixtures/scripted-backend.mjs, and never
// how the sealed study is run. Anything from `--provider` to the end of the command is still handed to
// `atelier invoke` as written, so give it last.
//
// A RUN THAT COULD NOT START IS NOT "NOT DELIVERED". A run that printed no result because the CLI could not be
// loaded, the backend could not be reached, or it stopped at once on something other than a busy provider, stops the
// study with exit 2 and nothing is cached: cached, it was a final row counted against availability that every later
// run skipped. Only a run that got as far as a model and then failed is recorded as errored.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';
import { arg, has, fail } from './study-client.mjs';

const REQS = readFileSync(arg('--requests') ?? fail('missing --requests'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const DATA = arg('--data') ?? fail('missing --data'); const PROJECT = arg('--project') ?? fail('missing --project');
const OUT = arg('--out') ?? fail('missing --out');
const PILOT = process.argv.includes('--pilot'); const RETRIES = 2;
const REPEATS = Number(arg('--repeats', '1'));
// R1 and R2 are read on 60 requests a skill; R3, the same request asked several times, on 20 (CLOSING_B_PREREGISTRATION.md).
const MIN_PER_SKILL = REPEATS > 1 ? 20 : 60;
if (!Number.isInteger(REPEATS) || REPEATS < 1 || REPEATS > 20) fail(`--repeats is ${JSON.stringify(arg('--repeats'))}: it must be a whole number from 1 to 20, the times each request is run. Nothing was spent.`);
const share = (flag, dflt, most) => {
  const x = Number(arg(flag, dflt));
  if (!Number.isFinite(x) || x <= 0 || x > most) fail(`${flag} is ${JSON.stringify(arg(flag))}: it must be a share above 0 and at most ${most}${flag === '--bar' ? ', the most the pre-registration allows' : ''}. Nothing was spent.`);
  return x;
};
/** R2: the share of runs not delivered must be under this, by the upper end of its interval. Sealed before the pilot. */
const BAR = share('--bar', '0.15', 0.15);
/** R3: the share of requests that may be delivered on some runs and refused on others. Sealed with it. */
const REPEAT_BAR = share('--repeat-bar', '0.10', 1);
const REFUSAL_MS = 15000;
const PASS_THROUGH = has('--provider') ? process.argv.slice(process.argv.indexOf('--provider'))
  : has('--base-url') ? ['--provider', 'openai-compatible', '--base-url', arg('--base-url') ?? fail('--base-url needs a url'), '--model', 'scripted', '--accept-new-binding'] : [];
const CLI = fileURLToPath(new URL('../../dist/cli/atelier.mjs', import.meta.url));
if (!existsSync(CLI)) fail(`${CLI} is missing: run \`npm run build\` in the repository first. Nothing was spent.`);
if (!PASS_THROUGH.length && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) fail('ANTHROPIC_API_KEY is not set (or pass --base-url <url> for the offline smoke test). Nothing was spent, and nothing was cached.');
const SKILLS = [...new Set(REQS.map((q) => q.skill))];
const count = (skill) => REQS.filter((q) => q.skill === skill).length;
if (!PILOT && (SKILLS.length < 2 || SKILLS.some((k) => count(k) < MIN_PER_SKILL))) fail(`the claim is per skill: at least two skills with ${MIN_PER_SKILL} requests each (found ${SKILLS.map((k) => `${k}: ${count(k)}`).join(', ')}). For the pilot, pass --pilot. Nothing was spent.`);
// ONE RUN IS ONE REQUEST AT ONE REPETITION. The first keeps the request's id as its key, so a cache written before
// repetitions existed is repetition 1; the others are "<id>#<k>". Two runs under one key would be one row.
const runKey = (q, k) => (k === 1 ? q.id : `${q.id}#${k}`);
const RUNS = REQS.flatMap((q) => Array.from({ length: REPEATS }, (_, i) => ({ q, k: i + 1, key: runKey(q, i + 1) })));
{
  const twice = RUNS.map((r) => r.key).find((key, i, all) => all.indexOf(key) !== i);
  if (twice !== undefined) fail(`two runs would be cached under "${twice}": a request id is given twice, or one id is another's followed by "#" and a number. Give every request an id of its own, without "#". Nothing was spent.`);
}
mkdirSync(OUT, { recursive: true });
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
/** The run says itself that no model was reached: the CLI did not load, there is no key, or nothing answers at the backend's address. */
const unreachable = (text) => /Cannot find module|ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|API_KEY is not set/i.test(text);
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
for (const { q, k, key } of RUNS) {
  const name = REPEATS > 1 ? `${q.id} repetition ${k}` : q.id;
  // A cached transient error is tried again on resume; every other cached row is final.
  if (cache[key] && !(cache[key].errored && cache[key].transient)) continue;
  const t0 = Date.now(); let r = once(q); let tries = 1;
  while (!r.j && transient(r.err) && tries <= RETRIES) { await wait(2000 * 2 ** (tries - 1) * (process.env.STRICT_RETRY_MS ? 0 : 1) + Number(process.env.STRICT_RETRY_MS ?? 0)); r = once(q); tries += 1; }
  const { j, code, err } = r;
  // NOTHING IS CACHED FOR A RUN THAT NEVER REACHED A MODEL: it stops the study, and the same command runs it again.
  // Such a run ends at once and prints no result: a missing module, no key, an unknown skill, a backend that is not
  // there. A run that worked for longer than that and then failed has been paid for, and is recorded below.
  if (!j && !transient(err) && (Date.now() - t0 < REFUSAL_MS || unreachable(err))) {
    fail(`${name}: the run could not start, before any model call (exit ${code}): ${err.split('\n').filter(Boolean).slice(-2).join(' ') || 'no output'}. Nothing was cached for it: fix it and run the same command again; the ${Object.keys(cache).length} request(s) already done are kept.`);
  }
  // THREE OUTCOMES: delivered conformant (exit 0), refused (exit 3, no text), and errored after its retries. An
  // errored run delivered nothing to the person waiting: it counts as NOT DELIVERED in availability, and apart as an error.
  const row = !j ? { skill: q.skill, request: q.request, errored: err.split('\n').filter(Boolean).slice(-2).join(' ') || 'no output', transient: transient(err), tries, code }
    : { skill: q.skill, request: q.request, code, tries, delivered: j.delivered === true, output: j.output ?? null, invocationId: j.invocationId, costUsd: j.costUsd ?? 0,
      conformant: j.eval?.result?.conformant ?? null, reasons: j.eval?.result?.reasons ?? [], redrawn: j.eval?.fidelity?.shape?.written ?? null, coverage: j.eval?.monitors?.coverage ?? null };
  cache[key] = k === 1 ? row : { ...row, repetition: k };
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  console.log(`${name}  ${cache[key].errored ? 'ERRORED' : cache[key].delivered ? 'delivered' : 'refused'}  exit ${code}${tries > 1 ? `  (${tries} tries)` : ''}`);
}
// Every run, each under its key. The skill is the request's own: a row cached under another skill's name is not believed.
const rows = RUNS.map(({ q, k, key }) => ({ id: key, ...cache[key], skill: q.skill, of: q.id, k }));
const ci = (k, n) => { const c = clopperPearson(k, n); return [Math.round(c.lo * 1000) / 1000, Math.round(c.hi * 1000) / 1000]; };
/** Why a run was refused, by the verdict's own reasons. One refusal may have several. */
const REASONS = [['broken rule', /required rule/i], ['invented claim', /invented claim/i], ['unconfirmed specifics', /unconfirmed/i], ['copied run', /copied/i], ['could not check', /not checked|no standard|could not be evaluated/i]];
const summarise = (rs) => {
  const delivered = rs.filter((r) => r.delivered); const errored = rs.filter((r) => r.errored); const refused = rs.filter((r) => !r.errored && !r.delivered);
  const byReason = Object.fromEntries(REASONS.map(([name, re]) => [name, refused.filter((r) => (r.reasons ?? []).some((x) => re.test(x))).length]));
  byReason.other = refused.filter((r) => !(r.reasons ?? []).some((x) => REASONS.some(([, re]) => re.test(x)))).length;
  return { requests: REPEATS > 1 ? new Set(rs.map((r) => r.of)).size : rs.length, ...(REPEATS > 1 ? { runs: rs.length, repeats: REPEATS } : {}), delivered: delivered.length, refused: refused.length, errored: errored.length,
    // AVAILABILITY IS OVER EVERY REQUEST: a refusal and an error after its retries are both "the person got nothing".
    notDelivered: rs.length ? { share: Math.round(((rs.length - delivered.length) / rs.length) * 1000) / 1000, ci95: ci(rs.length - delivered.length, rs.length) } : null,
    refusalsByReason: byReason,
    // A DELIVERED OUTPUT THAT THE RUN ITSELF CALLED NOT CONFORMANT is a defect of strict delivery, found without a person.
    deliveredNotConformantByItsOwnVerdict: delivered.filter((r) => r.conformant !== true || r.code !== 0).map((r) => r.id) };
};
/** R2 for one skill: the share of runs not delivered, held against the sealed bar by the upper end of its interval. */
const r2Of = (s) => { const upper = s.notDelivered ? s.notDelivered.ci95[1] : null; return { bar: BAR, upper95: upper, holds: upper !== null && upper < BAR }; };
/**
 * R3 for one skill: the requests delivered on some runs and not on others. Counts and one share, nothing more. A
 * request is done when each of its runs has a final row; one with a transient error still to try again is not.
 */
const r3Of = (rs) => {
  const byRequest = new Map();
  for (const r of rs) byRequest.set(r.of, [...(byRequest.get(r.of) ?? []), r]);
  const done = [...byRequest].filter(([, runs]) => runs.length === REPEATS && runs.every((r) => !(r.errored && r.transient)));
  const state = (r) => (r.errored ? 'errored' : r.delivered ? 'delivered' : 'refused');
  const split = done.filter(([, runs]) => !(runs.every((r) => state(r) === 'delivered') || runs.every((r) => state(r) === 'refused'))).map(([id]) => id);
  const incomplete = byRequest.size - done.length; const allowed = Math.floor(REPEAT_BAR * done.length + 1e-9);
  return { repeats: REPEATS, requests: done.length, split: split.length, splitShare: done.length ? Math.round((split.length / done.length) * 1000) / 1000 : null, bar: REPEAT_BAR, allowed, incomplete,
    holds: incomplete || !done.length ? null : split.length <= allowed, splitRequests: split };
};
const perSkill = Object.fromEntries(SKILLS.map((k) => {
  const mine = rows.filter((r) => r.skill === k); const s = summarise(mine);
  return [k, { ...s, r2: r2Of(s), ...(REPEATS > 1 ? { r3: r3Of(mine) } : {}) }];
}));
// THE VERDICT NAMES EVERY READING THAT FAILED. R1 is a person's audit, so the best this script can say is PENDING.
const failed = SKILLS.flatMap((k) => { const s = perSkill[k]; return [
  s.deliveredNotConformantByItsOwnVerdict.length ? `R1 (${k}): ${s.deliveredNotConformantByItsOwnVerdict.length} delivered output(s) the run's own verdict called not conformant` : null,
  s.r2.holds ? null : `R2 (${k}): not delivered on ${s.notDelivered.share} of its runs, upper bound ${s.r2.upper95}, where under ${BAR} is needed`,
  s.r3 && s.r3.holds === false ? `R3 (${k}): ${s.r3.split} of ${s.r3.requests} requests were delivered on some repetitions and not on others, where ${s.r3.allowed} are allowed` : null,
].filter(Boolean); });
const unread = SKILLS.filter((k) => perSkill[k].r3 && perSkill[k].r3.holds === null);
const verdict = failed.length ? `FAIL: ${failed.join('; ')}`
  : unread.length ? `UNRESOLVED: R3 was not read for ${unread.join(', ')}: ${unread.map((k) => perSkill[k].r3.incomplete).reduce((a, b) => a + b, 0)} request(s) have a repetition still to run. Run the same command again`
    : `PENDING THE AUDIT: R2${REPEATS > 1 ? ' and R3 hold' : ' holds'} for every skill. R1 is read by a person: audit ${join(OUT, 'delivered-for-audit.md')} against the REQUIRED measured rules`;
const result = { pilot: PILOT, all: summarise(rows), perSkill,
  refusals: rows.filter((r) => !r.errored && !r.delivered).map((r) => ({ id: r.id, skill: r.skill, reasons: r.reasons })), errors: rows.filter((r) => r.errored).map((r) => ({ id: r.id, skill: r.skill, error: r.errored, tries: r.tries })),
  audit: 'PENDING: a person reads delivered-for-audit.md against the REQUIRED measured rules and records each failure',
  bar: BAR, ...(REPEATS > 1 ? { repeats: REPEATS, repeatBar: REPEAT_BAR } : {}), verdict };
writeFileSync(join(OUT, 'strict-delivery.json'), JSON.stringify(result, null, 1));
writeFileSync(join(OUT, 'delivered-for-audit.md'), `# Delivered outputs to audit\n\nFor each, check every REQUIRED measured rule of its skill. Record the id and the rule of any output that breaks one.\n\n${rows.filter((r) => r.delivered).map((r) => `## ${r.id} (skill ${r.skill})\n\nRequest: ${r.request}\n\n${r.output}\n`).join('\n---\n\n')}`);
console.log(JSON.stringify({ pilot: result.pilot, all: result.all, perSkill: result.perSkill }, null, 1));
// The readings a person acts on, last and on stderr, so the summary above stays one JSON object on stdout.
for (const k of SKILLS) {
  const s = perSkill[k];
  console.error(`R2 ${k}: not delivered on ${s.requests && s.notDelivered ? s.notDelivered.share : 'none'} of ${s.runs ?? s.requests} run(s), upper bound ${s.r2.upper95}, bar ${BAR}: ${s.r2.holds ? 'holds' : 'does not hold'}`);
  if (s.r3) console.error(`R3 ${k}: ${s.r3.split} of ${s.r3.requests} requests split between delivered and not over ${REPEATS} repetitions (share ${s.r3.splitShare}), ${s.r3.allowed} allowed at ${REPEAT_BAR}: ${s.r3.holds === null ? `not read, ${s.r3.incomplete} request(s) not done` : s.r3.holds ? 'holds' : 'does not hold'}`);
}
console.error(`${PILOT ? 'PILOT, not the sealed run. ' : ''}${verdict}`);
