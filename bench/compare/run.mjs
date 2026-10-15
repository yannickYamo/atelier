#!/usr/bin/env node
// bench/compare/run.mjs — ONE RUNNER FOR EVERY ANSWER ARM, WRITING THE OUTSIDE BENCHMARK'S responses.jsonl.
//
//   node bench/compare/run.mjs --tasks splits/test.jsonl --arm none --out out/none.jsonl
//   node bench/compare/run.mjs --tasks splits/test.jsonl --arm skill:path/to/SKILL.md --out out/hand.jsonl
//   node bench/compare/run.mjs --tasks splits/test.jsonl --arm atelier-runtime:<build> --runtimes runtimes.json --out out/rt.jsonl
//
// Options: --model <id> (default claude-opus-5, or BENCH_MODEL; it must have a price, or the cap cannot hold) · --max-tokens <n> (default 4096) ·
// --trials <n> (1) · --condition <label> (none → baseline, other arms → candidate) ·
// --placement system|harness · --sealed splits/SEALED.json · --cap <usd> (25) · --per-call <usd> (0.25).
//
// --condition IS THE ARM'S LABEL ON EVERY ROW, and what the judge, the axes and the closing analysis tell arms apart
// by. Any label of lower-case letters, digits and hyphens, starting with a letter or digit (/^[a-z0-9][a-z0-9-]*$/):
// the benchmark's own three (baseline, candidate, comparator) or a claim's own names when it has more arms than
// three (bare, handwritten, gepa, plug-in, runtime). Give each arm its own label and its own --out file.
//
// THE BACKEND. The Anthropic API by default: ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) must be set, or the run
// stops before the first call (exit 2). For any other backend, a local or scripted one included:
//   --provider openai-compatible --base-url <url> --model <id> --price-in <usd per M> --price-out <usd per M>
// (the two prices in dollars per million tokens, so the cap can hold; the key, when the backend wants one, is
// OPENAI_API_KEY). A runtime arm does not read those flags: it takes its backend from the runtimes file's "args",
// which are handed to `atelier invoke` as written (["--provider", "openai-compatible", "--base-url", …, "--model", …]).
//
// THE CAP. --cap <usd> (25) is checked before every call with room for one more: the dearest call seen so far, and
// never less than --per-call <usd> (0.25). So a --cap under --per-call stops before the first call (exit 3):
// for a small cap, pass a smaller --per-call that one call of this arm will not pass.
//
// ARMS. Every model arm is the same writer model at the same max tokens, recorded on every line:
//   none                     the bare model: the task as the only message
//   skill:<file>             the model with that file as its system prompt (front matter stripped, as the
//                            benchmark's own harness strips it). A hand-written skill, an `atelier export`
//                            plug-in, and a GEPA- or SkillOpt-optimized skill are all this arm.
//                            --placement harness puts it in the user message inside <response_style>, the
//                            exact wrapper of the benchmark's scripts/run_evals.py, instead.
//   atelier-runtime:<build>  `atelier invoke --answer-only` of that build on the task, with the build's
//                            ATELIER_DATA and project directory read from a runtimes JSON file
//                            ({build: {cli, data, proj, skill, args?}}, as bench/runners/arms.py reads),
//                            given --target-model and --max-tokens so the writer and the limit are the same.
//
// The model arms call through dist/providers (the Anthropic SDK by default) with one forced tool,
// `emit_answer`: the same transport `atelier invoke` uses for its drafts, so no arm differs in how the
// answer leaves the model. A task's `material`, when present, follows the task in the user message for the
// model arms and is bound with --with for the runtime arm.
//
// OUTPUT. One line per (task, trial), in the format scripts/run_evals.py writes and scripts/judge.py and
// `run_evals.py measure` read: {case_id, trial, condition, runner, response, usage, cost_usd, model}, plus
// arm, max_tokens, placement, skill_sha256, tasks_sha256 and split; seconds (the answer's wall time) and, for a model
// arm, thinking (the setting its calls were sent with). A runtime arm's response is the review as delivered, without
// the footer of specifics not found in the material that `--answer-only` prints (it names the arm to a judge); the
// row adds atelier_state (VERIFIED, NEEDS_REVIEW or BLOCKED), to_check (that footer's sentences), unverified and
// unverified_reasons, failed, claims_instrument, and its calls and tokens. A call a provider filtered or the model
// declined is a row with response null, delivered false and filtered (CONTENT_FILTER or REFUSAL; filtered_call 1 or 2
// on the self-review arm), charged as an estimate (cost_estimated), and never retried. Completed lines are skipped on a rerun,
// so a stopped run continues where it stopped. Run `npm run build` first: this imports ../../dist.

import { readFileSync, existsSync, appendFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readJsonl, sha256, sha256File, validateTasks, opt, die, stripFrontmatter } from './lib.mjs';

const RUNNER = 'atelier-compare';
const args = process.argv.slice(2);
const tasksPath = opt(args, 'tasks'); const arm = opt(args, 'arm'); const out = opt(args, 'out');
const USAGE = 'usage: run.mjs --tasks <file> --arm none|skill:<file>|self-review:<file>|atelier-runtime:<build> --out <responses.jsonl> [--condition <label>] [--trials <n>] [--model <id>] [--max-tokens <n>] [--cap <usd>] [--per-call <usd>] [--placement system|harness] [--sealed <SEALED.json>] [--runtimes <file>] [--preflight] [--provider openai-compatible --base-url <url> --model <id> --price-in <usd per M> --price-out <usd per M>]';
if (!tasksPath || !arm || !out) die(USAGE);
const model = opt(args, 'model', process.env.BENCH_MODEL ?? 'claude-opus-5');
const maxTokens = Number(opt(args, 'max-tokens', '4096'));
const trials = Number(opt(args, 'trials', '1'));
const cap = Number(opt(args, 'cap', '25'));
const placement = opt(args, 'placement', 'system');
const provider = opt(args, 'provider', 'anthropic');
if (!(Number.isInteger(maxTokens) && maxTokens > 0) || !(Number.isInteger(trials) && trials > 0)) die('--max-tokens and --trials must be positive integers');
if (!['system', 'harness'].includes(placement)) die('--placement is system or harness');
if (!['anthropic', 'openai-compatible'].includes(provider)) die('--provider is anthropic or openai-compatible');

const [kind, ...rest] = arm.split(':');
const armArg = rest.join(':');
if (!['none', 'skill', 'self-review', 'atelier-runtime'].includes(kind) || (kind !== 'none' && !armArg)) die(`unknown arm ${arm}: none, skill:<file>, self-review:<file> or atelier-runtime:<build>`);
const condition = opt(args, 'condition', kind === 'none' ? 'baseline' : 'candidate');
if (!/^[a-z0-9][a-z0-9-]*$/.test(condition)) die(`--condition "${condition}" is not a label: lower-case letters, digits and hyphens, starting with a letter or digit (baseline, candidate, comparator, or a claim's own arm names such as handwritten or plug-in).`);

const tasks = readJsonl(tasksPath);
const errors = validateTasks(tasks);
if (errors.length) die(errors.join('\n'));
const tasksSha = sha256File(tasksPath);

/** Which sealed split this tasks file is, by hash; 'unsealed' when no SEALED.json names it. */
let split = 'unsealed';
const sealedPath = opt(args, 'sealed');
if (sealedPath) {
  const sealed = JSON.parse(readFileSync(sealedPath, 'utf8'));
  split = ['train', 'validation', 'test'].find((k) => sealed[k]?.sha256 === tasksSha) ?? 'not-in-SEALED';
}

let skillText = null;
if (kind === 'skill' || kind === 'self-review') {
  if (!existsSync(armArg)) die(`no skill file at ${armArg}`);
  skillText = stripFrontmatter(readFileSync(armArg, 'utf8'));
}
const skillSha = skillText === null ? null : sha256(skillText);

const withMaterial = (t) => (t.material ? `${t.prompt}\n\n<material>\n${t.material}\n</material>` : t.prompt);
/** run_evals.py _condition_prompt, byte for byte. */
const harnessPrompt = (task, instructions) => 'Follow the response-style skill below while completing the task. '
  + 'Do not discuss or quote the skill.\n\n'
  + `<response_style>\n${instructions}\n</response_style>\n\n`
  + `<task>\n${task}\n</task>`;

const ANSWER_SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };

// A CAP THAT CANNOT SEE COST IS NOT A CAP. A model with no known price returned a null cost, the loop added 0, and
// `--cap` never bound. So a price is required before the first call: the pricing table's for an Anthropic model,
// `--price-in` and `--price-out` (dollars per million tokens) for any other backend. Refused here, nothing spent.
async function client() {
  if (provider === 'anthropic') {
    const { AnthropicInferenceClient } = await import('../../dist/providers/anthropic.js');
    const { ANTHROPIC_PRICING, priceFor } = await import('../../dist/providers/pricing.js');
    const price = priceFor(ANTHROPIC_PRICING, model);
    if (!price) die(`no price is known for "${model}", so the cap could not hold. Use a model in providers/pricing.ts. Nothing was spent.`);
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) die('ANTHROPIC_API_KEY is not set. Set it, or name another backend: --provider openai-compatible --base-url <url> --model <id> --price-in <usd per M> --price-out <usd per M>. Nothing was spent.');
    return new AnthropicInferenceClient(model, undefined, price);
  }
  const baseUrl = opt(args, 'base-url') ?? die('--provider openai-compatible needs --base-url');
  const priceIn = Number(opt(args, 'price-in', 'NaN')); const priceOut = Number(opt(args, 'price-out', 'NaN'));
  if (!(priceIn >= 0) || !(priceOut >= 0)) die('--provider openai-compatible needs --price-in and --price-out (dollars per million tokens), so the cap can hold. Nothing was spent.');
  const { OpenAICompatibleInferenceClient } = await import('../../dist/providers/openai-compatible.js');
  return new OpenAICompatibleInferenceClient({ modelId: model, baseUrl, apiKey: process.env.OPENAI_API_KEY, strictSchema: false, pricing: { inputPerM: priceIn, outputPerM: priceOut } });
}
// A runtime arm passes its own model to `atelier invoke`; an Anthropic one without a price is refused the same way.
async function checkRuntimePrice(spec) {
  const a = spec.args ?? []; const at = a.indexOf('--model'); const prov = a.indexOf('--provider');
  const runtimeModel = at >= 0 ? a[at + 1] : model;
  if (prov >= 0 && a[prov + 1] !== 'anthropic') return;
  const { ANTHROPIC_PRICING, priceFor } = await import('../../dist/providers/pricing.js');
  if (!priceFor(ANTHROPIC_PRICING, runtimeModel)) die(`no price is known for the runtime arm's model "${runtimeModel}", so the cap could not hold. Nothing was spent.`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) die(`ANTHROPIC_API_KEY is not set, and the runtime arm "${armArg}" names no other backend. Set it, or give the build its backend in the runtimes file: "args": ["--provider", "openai-compatible", "--base-url", "<url>", "--model", "<id>"]. Nothing was spent.`);
}

async function modelArm(c, t) {
  const skilled = kind === 'skill' || kind === 'self-review';
  const system = skilled && placement === 'system' ? skillText : '';
  const user = skilled && placement === 'harness' ? harnessPrompt(withMaterial(t), skillText) : withMaterial(t);
  const r = await c.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: 'emit_answer',
    toolDescription: 'Deliver your complete answer to the user.', schema: ANSWER_SCHEMA, maxTokens });
  const answer = r.json && typeof r.json === 'object' ? r.json.answer : undefined;
  if (typeof answer !== 'string') throw new Error(`the model returned no answer string for ${t.id}`);
  return { response: answer.trim(), usage: { input_tokens: r.inputTokens, cache_read_input_tokens: r.cacheReadTokens, cache_creation_input_tokens: r.cacheWriteTokens, output_tokens: r.outputTokens },
    cost: typeof r.costUsd === 'number' ? r.costUsd : null, thinking: r.thinkingSent ?? null };
}

// THE SELF-REVIEW ARM: the skill as a prompt, then one call that checks the draft against the method and the material
// and writes it again. The strongest baseline the pilot met; the second answer is the arm's answer, both calls its cost.
const REVIEW_SCHEMA = { type: 'object', properties: { review: { type: 'string' }, answer: { type: 'string' } }, required: ['review', 'answer'], additionalProperties: false };
const REVIEW_ASK = 'Check your draft before it goes out. Go through the method step by step: for each step, say in a few words whether the draft does it. '
  + 'Then check every specific in the draft against the material and name any that is not there. '
  + 'Then write the answer again in full with everything you found put right, keeping to the length asked. Put the check in review and the answer again in answer.';
async function selfReviewArm(c, t) {
  let first; try { first = await modelArm(c, t); } catch (e) { if (filteredOf(e)) e.filteredCall = 1; throw e; }
  const ask = `${withMaterial(t)}\n\nYour draft:\n<draft>\n${first.response}\n</draft>\n\n${REVIEW_ASK}`;
  let r;
  try {
    r = await c.complete({ stableBlock: placement === 'system' ? skillText : '', variableBlock: '', userMessage: placement === 'harness' ? harnessPrompt(ask, skillText) : ask,
      toolName: 'emit_review', toolDescription: 'Deliver the check and the answer written again.', schema: REVIEW_SCHEMA, maxTokens });
  } catch (e) { if (filteredOf(e)) { e.filteredCall = 2; e.firstCost = first.cost; e.firstUsage = first.usage; e.thinking = first.thinking; } throw e; }
  const answer = r.json && typeof r.json === 'object' ? r.json.answer : undefined;
  if (typeof answer !== 'string') throw new Error(`the model returned no reviewed answer for ${t.id}`);
  const cost = typeof first.cost === 'number' && typeof r.costUsd === 'number' ? first.cost + r.costUsd : null;
  const sum = (a, b) => (a ?? 0) + (b ?? 0);
  return { response: answer.trim(), review: typeof r.json.review === 'string' ? r.json.review : null, calls: 2, cost, thinking: r.thinkingSent ?? first.thinking ?? null,
    // the longest single call, which is what the token limit binds
    longestCall: Math.max(first.usage.output_tokens ?? 0, r.outputTokens ?? 0),
    usage: { input_tokens: sum(first.usage.input_tokens, r.inputTokens), cache_read_input_tokens: sum(first.usage.cache_read_input_tokens, r.cacheReadTokens),
      cache_creation_input_tokens: sum(first.usage.cache_creation_input_tokens, r.cacheWriteTokens), output_tokens: sum(first.usage.output_tokens, r.outputTokens) } };
}

let runtimeSpec = null;
if (kind === 'atelier-runtime') {
  const file = opt(args, 'runtimes', process.env.RUNTIMES_FILE);
  if (!file) die('atelier-runtime needs --runtimes <file> (or RUNTIMES_FILE): {"<build>": {"cli": …, "data": …, "proj": …, "skill": …}}');
  runtimeSpec = JSON.parse(readFileSync(file, 'utf8'))[armArg] ?? die(`no build called ${armArg} in ${file}`);
  for (const k of ['cli', 'data', 'proj', 'skill']) if (!runtimeSpec[k]) die(`runtime ${armArg} has no "${k}"`);
  await checkRuntimePrice(runtimeSpec);
}

// Calls and tokens of a runtime answer, from the run's own spend ledger (every call it made, by purpose). Its longest
// call is not recorded, and need not be: a call cut off at the limit fails the run, so it is never an answer.
function ledgerOf(rec) {
  const spend = rec?.eval?.spend; if (!Array.isArray(spend)) return { usage: {}, calls: null };
  const sum = (k) => spend.reduce((n, l) => n + (l[k] ?? 0), 0);
  return { calls: sum('calls'), usage: { input_tokens: sum('inputTokens'), output_tokens: sum('outputTokens') }, longestCall: null };
}

// What the run's own checks said, for a study to set against a judge: the sentences it listed as not found in the
// material, how many required rules were left unverified and why, how many failed, and which claim instrument read it.
function signalsOf(rec) {
  const entries = rec?.eval?.record?.entries ?? []; const unverified = entries.filter((e) => e.required && e.result === 'UNVERIFIED');
  return { signals: { to_check: Array.isArray(rec?.toCheck) ? rec.toCheck : [], unverified: unverified.length,
    unverified_reasons: [...new Set(unverified.map((e) => e.reason))].sort(), failed: entries.filter((e) => e.required && e.result === 'FAIL').length,
    claims_instrument: rec?.eval?.gates?.claims?.instrument ?? null } };
}

// A provider that filtered the call, or a model that declined it, is not a transport failure: the same request is
// blocked again, and every retry is paid for. So it is a row (FILTERED), and the arm goes on to the next task.
// An unmapped stop reason counts only when it reads like a filter; anything else still retries.
const FILTER_WORDS = /filter|blocked|safety/i;
// A filter reported as an error rather than a stop reason: the Anthropic API's own ("Output blocked by content
// filtering policy", HTTP 400), and a gateway's worded the same way.
const FILTER_TEXT = /content filtering|content[_ ]filter|blocked by (?:the )?(?:content |safety )?(?:filter|policy)/i;
function filteredOf(e) {
  const k = e?.termination?.kind;
  if (k === 'CONTENT_FILTER' || k === 'REFUSAL') return k;
  if (k === 'OTHER' && FILTER_WORDS.test(e.termination.providerValue ?? '')) return 'CONTENT_FILTER';
  if (e?.status === 400 && FILTER_TEXT.test(`${e.message ?? ''} ${JSON.stringify(e.error ?? null)}`)) return 'CONTENT_FILTER';
  return null;
}
// The same, from `atelier invoke`'s stderr: the provider's own wording of a filtered or declined call.
function filteredIn(stderr) {
  if (/filtered the response \(finish_reason: content_filter\)/.test(stderr) || FILTER_TEXT.test(stderr)) return 'CONTENT_FILTER';
  if (/ refused the request: /.test(stderr)) return 'REFUSAL';
  const m = /stopped for "([^"]+)" before completing the object/.exec(stderr);
  if (!m) return null;
  return m[1] === 'REFUSAL' ? 'REFUSAL' : m[1] === 'CONTENT_FILTER' || FILTER_WORDS.test(m[1]) ? 'CONTENT_FILTER' : null;
}

// THE THINKING SETTING OF A RUNTIME ROW, LIKE EVERY OTHER ROW'S. Taken from the run's own record where it says (a build
// that records it); otherwise null, with the reason, so a study never reads a missing field as "no thinking".
function thinkingOf(rec) {
  const said = rec && Object.hasOwn(rec, 'thinking') ? rec.thinking : rec?.eval?.thinking;
  return said === 'disabled' || said === 'enabled' ? { thinking: said }
    : rec && said === null ? { thinking: null, thinkingReason: 'the provider did not report sending a thinking setting on every call of the run' }
      : { thinking: null, thinkingReason: rec ? 'the run record does not say what thinking setting its calls were sent with' : 'the run left no record' };
}

// THE MODEL A RUNTIME ROW WAS WRITTEN BY: the one its own record says answered, never the harness's --model, which a
// runtime's own arguments may override. Null, with the reason, when the record does not say.
function runtimeModelOf(rec) {
  return typeof rec?.model === 'string' && rec.model ? { model: rec.model }
    : { model: null, modelReason: rec ? 'the run record does not say which model answered' : 'the run left no record' };
}

function runtimeArm(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'compare-material-'));
  try {
    const withArgs = t.material ? (writeFileSync(join(tmp, 'material.md'), t.material), ['--with', `material=${join(tmp, 'material.md')}`]) : [];
    // A benchmark's runs are tests: marked so a later rebuild never learns its "write this, not that" pairs from them.
    // --json, so the row keeps Atelier's own verdict on its work (VERIFIED, NEEDS_REVIEW, BLOCKED) beside the answer:
    // a study compares that verdict with the judge's.
    const cmd = [resolve(runtimeSpec.cli), 'invoke', '--skill', runtimeSpec.skill, '--json', '--test-run', '--target-model', model,
      '--max-tokens', String(maxTokens), ...withArgs, ...(runtimeSpec.args ?? []), t.prompt];
    const done = spawnSync(process.execPath, cmd, { cwd: runtimeSpec.proj, env: { ...process.env, ATELIER_DATA: runtimeSpec.data, ATELIER_PROJECT_DIR: runtimeSpec.proj },
      encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
    let rec = null; try { rec = JSON.parse(done.stdout); } catch { /* no record: the run failed before its end */ }
    // A STRICT REFUSAL IS AN ANSWER TO THE QUESTION "what did the person get", NOT AN ERROR. Exit 3 with "not
    // delivered (strict delivery)" used to be thrown, retried twice and then end the whole run, so a refusal cost
    // three runs and a refused task was never recorded. It is written as a row with no response and its reasons.
    if (done.status === 3 && /not delivered \(strict delivery\)/.test(done.stderr ?? '')) {
      const why = /not delivered \(strict delivery\): (.*?)\. The text is kept/s.exec(done.stderr ?? '')?.[1] ?? 'not conformant';
      return { response: null, refused: why.split('; '), ...ledgerOf(rec), ...signalsOf(rec), ...thinkingOf(rec), ...runtimeModelOf(rec), cost: rec?.costUsd ?? null, state: rec?.eval?.record?.state ?? null };
    }
    // A model call inside the run that a provider filtered or the model declined: a FILTERED row, never retried.
    const blocked = done.status !== 0 ? filteredIn(done.stderr ?? '') : null;
    if (blocked) return { response: null, filtered: blocked, ...ledgerOf(rec), ...thinkingOf(rec), ...runtimeModelOf(rec), cost: rec?.costUsd ?? null };
    // A BLOCKED RUN IS A DELIVERED ANSWER WITH ITS VERDICT, NOT A FAILED CALL. `invoke --json` exits 1 when the work it
    // delivered is BLOCKED, as `run` does; the record is complete and is the row. Retrying it would pay for the same run
    // three times and then end the arm.
    const blockedButDelivered = done.status === 1 && rec?.eval?.record?.state === 'BLOCKED' && typeof rec.output === 'string';
    if ((done.status !== 0 && !blockedButDelivered) || !rec) throw new Error((done.stderr || done.stdout || `exit ${done.status}`).trim().split('\n').slice(-5).join('\n'));
    // a setup error, not a failed call: retrying would pay for the same run again, so it stops here
    if (rec.output === undefined || rec.toCheck === undefined) die(`${runtimeSpec.cli} gives no "output" and "toCheck" in invoke --json: build it from a commit that has them`);
    // THE REVIEW AS DELIVERED (`output`, after repair), NOT `answer`: `answer` adds a footer of specifics not found in the
    // material ("check before you use this"), which only this arm writes. Judged, it names the arm, and no one posts a
    // review that ends that way. The list is kept beside the response as to_check, for the study and never the judge.
    return { response: String(rec.output ?? '').trim(), ...ledgerOf(rec), ...signalsOf(rec), ...thinkingOf(rec), ...runtimeModelOf(rec), cost: rec.costUsd ?? null, state: rec.eval?.record?.state ?? null };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// The fields only some rows carry: the self-review's check, Atelier's verdict and its own check signals, the thinking
// setting the call was sent with (model arms; the runtime arm's calls go through the same provider), and wall time.
const extraOf = (r) => ({ ...(r.review ? { review: r.review } : {}), ...(r.state ? { atelier_state: r.state } : {}), ...(r.signals ? r.signals : {}),
  ...(r.thinking !== undefined ? { thinking: r.thinking } : {}), ...(r.thinkingReason ? { thinking_reason: r.thinkingReason } : {}),
  ...(r.modelReason ? { model_reason: r.modelReason } : {}), seconds: r.seconds });
// The model on a row: a runtime row's from its own record; every other arm's is the harness's, which it was sent to.
const modelOfRow = (r) => (kind === 'atelier-runtime' ? r.model ?? null : model);
let filtered = 0;

const done = new Set(existsSync(out) ? readJsonl(out).map((r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}\u0000${r.runner}`) : []);
const prior = existsSync(out) ? readJsonl(out).filter((r) => r.condition === condition) : [];
let spent = prior.reduce((n, r) => n + (r.cost_usd ?? 0), 0);
// a two-call arm's cell costs two calls
let perCall = Math.max(Number(opt(args, 'per-call', '0.25')) * (kind === 'self-review' ? 2 : 1), ...prior.filter((r) => !r.cost_estimated).map((r) => r.cost_usd ?? 0));
mkdirSync(dirname(resolve(out)), { recursive: true });
const c = kind === 'atelier-runtime' ? null : await client();
const answerOf = (t) => (kind === 'atelier-runtime' ? runtimeArm(t) : kind === 'self-review' ? selfReviewArm(c, t) : modelArm(c, t));

// --preflight: ONE CALL ON THE FIRST TASK, BEFORE A PAID RUN, recording nothing. It says what one answer costs and how
// many of the token limit it used: a study once lost 162 of 468 cells to answers cut off at the limit, found afterwards.
// It exits 2 when it finds a reason not to run (answers near the limit, a cost not known), so `--preflight && run` holds.
if (args.includes('--preflight')) {
  const per = Number(opt(args, 'per-call', '0.25')) * (kind === 'self-review' ? 2 : 1);
  if (per > cap) die(`--preflight: one call (about $${per.toFixed(4)}) would pass the --cap of $${cap}. Nothing was spent.`);
  const t = tasks[0]; let r;
  try { r = await answerOf(t); } catch (e) {
    const f = filteredOf(e);
    console.error(f ? `preflight: the call was ${f === 'REFUSAL' ? 'declined by the model' : 'filtered by the provider'}. Nothing was recorded; choose another first task or report it.` : `preflight: the call failed (${e.message.split('\n')[0]}). Nothing was recorded.`);
    process.exit(f ? 2 : 1);
  }
  if (r.filtered) { console.log(`preflight: the run was ${r.filtered === 'REFUSAL' ? 'declined by the model' : 'filtered by the provider'}. Nothing was recorded; choose another first task or report it.`); process.exit(2); }
  const used = kind === 'atelier-runtime' ? null : r.longestCall ?? r.usage?.output_tokens ?? null; let stop = false;
  if (kind === 'atelier-runtime') console.log('preflight: an Atelier call cut off at the token limit fails its run rather than giving a shorter answer, so the limit is checked by the run itself');
  console.log(`preflight: task ${t.id}, ${used ?? 'an unknown number of'} output token(s) of a limit of ${maxTokens}${r.calls > 1 ? ' in its longest call' : ''}; ${typeof r.cost === 'number' ? `$${r.cost.toFixed(4)}` : 'an unknown cost'} for the call${r.calls > 1 ? ` (${r.calls} calls)` : ''}`);
  if (used !== null && used >= maxTokens * 0.8) { stop = true; console.log(`preflight: the answer used ${Math.round((used / maxTokens) * 100)}% of the limit, so answers may be cut off: raise --max-tokens before the run.`); }
  if (typeof r.cost !== 'number') { stop = true; console.log('preflight: the call reported no cost, so --cap could not hold: fix the price before the run.'); }
  process.exit(stop ? 2 : 0);
}

for (let trial = 1; trial <= trials; trial++) {
  for (const t of tasks) {
    if (done.has(`${t.id}\u0000${trial}\u0000${condition}\u0000${RUNNER}`)) { console.error(`skip ${t.id} trial ${trial} (done)`); continue; }
    // BEFORE THE CALL, with room for it: the dearest call seen so far (or --per-call), so the cap is never passed by a whole call.
    if (spent + perCall > cap) { console.error(`stopped: $${spent.toFixed(4)} spent, and one more call (about $${perCall.toFixed(4)}) would pass the --cap of $${cap}. Rerun with a higher --cap to continue (a --cap under --per-call, ${opt(args, 'per-call', '0.25')}, never starts: pass a smaller --per-call with it).`); process.exit(3); }
    let r; let last;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      const t0 = Date.now();
      try { r = await answerOf(t); r.seconds = Math.round((Date.now() - t0) / 100) / 10; } catch (e) {
        const f = filteredOf(e);
        if (f) {
          // charged as a call that answered: the dearest seen so far (plus a first call that did answer), marked an estimate
          // the blocked call is charged as one call of this arm (the allowance is a whole cell: two calls on self-review),
          // plus a first call that did answer at what it cost
          const oneCall = perCall / (kind === 'self-review' ? 2 : 1);
          r = { response: null, filtered: f, ...(e.filteredCall ? { filteredCall: e.filteredCall } : {}), usage: e.firstUsage ?? (e.outputTokens == null ? {} : { output_tokens: e.outputTokens }),
            calls: e.filteredCall ?? 1, cost: oneCall + (e.firstCost ?? 0), costEstimated: true, ...(e.thinking !== undefined ? { thinking: e.thinking } : {}), seconds: Math.round((Date.now() - t0) / 100) / 10 };
          console.error(`${t.id}: ${f === 'REFUSAL' ? 'declined by the model' : 'filtered by the provider'}${e.filteredCall ? ` (call ${e.filteredCall})` : ''}: recorded, not retried`);
          break;
        }
        last = e; console.error(`${t.id}: attempt ${attempt + 1} failed: ${e.message.split('\n')[0]}`);
      }
    }
    if (!r) die(`${t.id} failed three times: ${last?.message}`);
    if (!r.response && !r.refused && !r.filtered) die(`${t.id}: the arm returned an empty answer, and an empty answer judged would read as a result`);
    // A refusal that printed no cost is charged the dearest call seen so far: never zero, and never a reason to stop.
    if ((r.refused || r.filtered) && typeof r.cost !== 'number') { r.cost = perCall; r.costEstimated = true; }
    if (r.filtered) filtered += 1;
    // A CALL WHOSE COST IS NOT KNOWN STOPS THE RUN: adding 0 for it is how a cap stopped binding. The answer is kept.
    if (typeof r.cost !== 'number') {
      appendFileSync(out, `${JSON.stringify({ case_id: t.id, trial, condition, runner: RUNNER, response: r.response, usage: r.usage, cost_usd: null, model: modelOfRow(r), arm: kind === 'skill' ? `skill:${armArg}` : arm, max_tokens: maxTokens, placement: kind === 'skill' ? placement : null, skill_sha256: skillSha, tasks_sha256: tasksSha, split, calls: r.calls === undefined ? 1 : r.calls, ...extraOf(r) })}\n`);
      console.error(`stopped: ${t.id} came back with no cost, so the cap could not hold. Its answer is recorded; fix the price and rerun.`); process.exit(4);
    }
    // an estimate is never evidence of what a call costs: it does not raise the allowance kept for the next one
    spent += r.cost; if (!r.costEstimated) perCall = Math.max(perCall, r.cost);
    const row = { case_id: t.id, trial, condition, runner: RUNNER, response: r.response, ...(r.refused ? { delivered: false, reasons: r.refused } : {}),
      ...(r.filtered ? { delivered: false, filtered: r.filtered, ...(r.filteredCall ? { filtered_call: r.filteredCall } : {}) } : {}),
      usage: r.usage, cost_usd: r.cost, ...(r.costEstimated ? { cost_estimated: true } : {}), model: modelOfRow(r),
      arm: kind === 'skill' ? `skill:${armArg}` : arm, max_tokens: maxTokens, placement: kind === 'skill' ? placement : null,
      skill_sha256: skillSha, tasks_sha256: tasksSha, split, calls: r.calls === undefined ? 1 : r.calls, ...extraOf(r) };
    appendFileSync(out, `${JSON.stringify(row)}\n`);
    console.error(`${condition} trial ${trial}: ${t.id}${r.cost === null ? '' : `  $${r.cost.toFixed(4)}`}`);
  }
}
console.error(`done: ${out} ($${spent.toFixed(4)} reported for ${condition})`);
console.error(`filtered: ${filtered} of ${tasks.length * trials} rows (${condition})`);
