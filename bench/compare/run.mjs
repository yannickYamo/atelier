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
//
// ONE FILE, ONE ARM, ONE SET OF SETTINGS. The first row written also writes `<out>.manifest.json`: the tasks' hash,
// the split, the arm and its label, the skill's hash (a runtime arm's: its build entry), the model, the max tokens,
// the placement, the provider settings, the steering setting and the grammar setting. A rerun into the same file
// compares the manifest and every row already there with what it would write, and exits 2, writing nothing, on any
// difference: a result is never built on another arm's rows, another skill's, or another limit's. A file with rows
// and no manifest is refused the same way. A runtime arm's file is also one version of its skill: the first record's
// `skillVersion` is written into the manifest and on every row as `skill_version`, and a later record (or a resume)
// that names another version, or none, stops the arm (exit 2) before its row is written.
//
// ONE WRITER PER FILE. A runner claims its --out by creating `<out>.lock` before it reads the file, and removes it on
// every way out (done, refused, an error, SIGINT, SIGTERM). A second runner on the same file exits 2 with nothing
// written. A lock left by a killed runner is never taken over: delete the file the message names, then run again.
//
// A RUNTIME ARM IS HELD TO THE HARNESS. Its "args" may not name --model, --target-model, --max-tokens, --cap or
// --graded (exit 2): the harness gives those. After each run, the record's model and token limit must be the
// harness's and its steering the declared one, or the run stops (exit 2) and no row is written. Every runtime backend
// needs a price: the pricing table's for Anthropic, otherwise --price-in and --price-out (in the build's "args", given
// to this runner, or ATELIER_PRICE_IN and ATELIER_PRICE_OUT). Each run is handed the cap still left as
// `atelier invoke --cap`, after one cell's worst case (the dearest seen, or --per-call) is reserved; a cap that
// cannot hold one cell stops before anything is spawned (exit 3).
//
// STEERING AND GRAMMAR ARE PINNED ON EVERY ROW. `graded` is the steering a runtime run had ('all', the default, or
// 'none' when the arm is declared with --graded none, which is passed on to `atelier invoke`), read from its record;
// null on a model arm, which has none. `grammar` is how the grammar check ran: ATELIER_GRAMMAR as set, or 'default'.
//
// --preflight also stops (exit 2) when the answer held a thinking block, or when the call's output tokens are far
// above what the answer's length accounts for (thinking that was billed and not shown). On a runtime arm the blocks are
// the ones the run's calls were returned (`thinkingBlocks` in `invoke --json`, summed over the run), not the setting sent.

import { readFileSync, existsSync, appendFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readJsonl, sha256, sha256File, validateTasks, opt, die, stripFrontmatter } from './lib.mjs';

const RUNNER = 'atelier-compare';
const args = process.argv.slice(2);
const tasksPath = opt(args, 'tasks'); const arm = opt(args, 'arm'); const out = opt(args, 'out');
const USAGE = 'usage: run.mjs --tasks <file> --arm none|skill:<file>|self-review:<file>|atelier-runtime:<build> --out <responses.jsonl> [--condition <label>] [--trials <n>] [--model <id>] [--max-tokens <n>] [--cap <usd>] [--per-call <usd>] [--placement system|harness] [--sealed <SEALED.json>] [--runtimes <file>] [--graded none] [--preflight] [--provider openai-compatible --base-url <url> --model <id> --price-in <usd per M> --price-out <usd per M>]';
if (!tasksPath || !arm || !out) die(USAGE);
const model = opt(args, 'model', process.env.BENCH_MODEL ?? 'claude-opus-5');
const maxTokens = Number(opt(args, 'max-tokens', '4096'));
const trials = Number(opt(args, 'trials', '1'));
const cap = Number(opt(args, 'cap', '25'));
const placement = opt(args, 'placement', 'system');
const provider = opt(args, 'provider', 'anthropic');
const gradedFlag = opt(args, 'graded');
if (gradedFlag !== undefined && gradedFlag !== 'none') die(`--graded takes only none: steering is on by default, and --graded none declares an arm without it (got "${gradedFlag}").`);
/** How the grammar check ran on this machine: the owner's switch, as set, or the default engine. */
const grammar = process.env.ATELIER_GRAMMAR || 'default';
if (!(Number.isInteger(maxTokens) && maxTokens > 0) || !(Number.isInteger(trials) && trials > 0)) die('--max-tokens and --trials must be positive integers');
if (!['system', 'harness'].includes(placement)) die('--placement is system or harness');
if (!['anthropic', 'openai-compatible'].includes(provider)) die('--provider is anthropic or openai-compatible');

const [kind, ...rest] = arm.split(':');
const armArg = rest.join(':');
if (!['none', 'skill', 'self-review', 'atelier-runtime'].includes(kind) || (kind !== 'none' && !armArg)) die(`unknown arm ${arm}: none, skill:<file>, self-review:<file> or atelier-runtime:<build>`);
if (gradedFlag !== undefined && kind !== 'atelier-runtime') die('--graded none is a setting of an atelier-runtime arm: a model arm has no steering.');
/** The steering this arm is declared with: a runtime arm's ('all' unless --graded none), none for a model arm. */
const graded = kind === 'atelier-runtime' ? (gradedFlag === 'none' ? 'none' : 'all') : null;
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
// THE HARNESS GIVES A RUNTIME ARM ITS MODEL, ITS LIMIT, ITS CAP AND ITS STEERING. Named again in the build's "args",
// they would be passed after the harness's and could answer with another writer or spend past the cap.
const HARNESS_FLAGS = ['--model', '--target-model', '--max-tokens', '--cap', '--graded'];
const argNamed = (a, f) => a.some((x) => x === f || String(x).startsWith(`${f}=`));
const argValue = (a, f) => { const i = a.indexOf(f); if (i >= 0) return a[i + 1]; const eq = a.find((x) => String(x).startsWith(`${f}=`)); return eq === undefined ? undefined : String(eq).slice(f.length + 1); };
/** The backend a runtime arm's `atelier invoke` will call, and the prices it will be told, from its args and the environment. */
function runtimeBackend(spec) {
  const a = spec.args ?? [];
  const named = argValue(a, '--target-provider') ?? argValue(a, '--provider') ?? process.env.ATELIER_TARGET_PROVIDER ?? process.env.ATELIER_PROVIDER ?? 'anthropic';
  const pIn = argValue(a, '--price-in') ?? opt(args, 'price-in') ?? process.env.ATELIER_PRICE_IN;
  const pOut = argValue(a, '--price-out') ?? opt(args, 'price-out') ?? process.env.ATELIER_PRICE_OUT;
  return { provider: named, priceIn: pIn === undefined ? null : Number(pIn), priceOut: pOut === undefined ? null : Number(pOut),
    // the runner's own prices are handed on when the build's args do not carry any
    passPrices: !argNamed(a, '--price-in') && opt(args, 'price-in') !== undefined && opt(args, 'price-out') !== undefined };
}
// A runtime arm's backend needs a price, as every other arm's does: a run whose cost is unknown cannot be held by a cap.
async function checkRuntimePrice(spec) {
  const a = spec.args ?? [];
  const named = HARNESS_FLAGS.filter((f) => argNamed(a, f));
  if (named.length) die(`the runtime arm "${armArg}" names ${named.join(', ')} in its "args". The harness gives every arm its model (--model), its token limit (--max-tokens), the cap left (--cap) and its steering (--graded none on this runner), so no arm answers with another writer or spends past the cap. Take ${named.length === 1 ? 'it' : 'them'} out of the runtimes file. Nothing was spent.`);
  const b = runtimeBackend(spec);
  if (b.provider !== 'anthropic') {
    const priced = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
    if (!priced(b.priceIn) || !priced(b.priceOut)) die(`the runtime arm "${armArg}" calls ${b.provider} with no price, so the cap could not hold. Give its prices in dollars per million tokens: "--price-in", "<usd>", "--price-out", "<usd>" in its "args", --price-in and --price-out on this runner, or ATELIER_PRICE_IN and ATELIER_PRICE_OUT. Nothing was spent.`);
    return;
  }
  const { ANTHROPIC_PRICING, priceFor } = await import('../../dist/providers/pricing.js');
  if (!priceFor(ANTHROPIC_PRICING, model)) die(`no price is known for the runtime arm's model "${model}", so the cap could not hold. Nothing was spent.`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) die(`ANTHROPIC_API_KEY is not set, and the runtime arm "${armArg}" names no other backend. Set it, or give the build its backend in the runtimes file: "args": ["--provider", "openai-compatible", "--base-url", "<url>", "--price-in", "<usd>", "--price-out", "<usd>"]. Nothing was spent.`);
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
    cost: typeof r.costUsd === 'number' ? r.costUsd : null, thinking: r.thinkingSent ?? null,
    // what the preflight reads: thinking blocks in the response, and how much text the call wrote for its tokens
    thinkingBlocks: r.thinkingBlocks ?? 0, written: JSON.stringify(r.json).length };
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
    thinkingBlocks: first.thinkingBlocks + (r.thinkingBlocks ?? 0), written: first.written + JSON.stringify(r.json).length,
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

// THE RUN MUST HAVE BEEN THE ONE THE HARNESS ASKED FOR. A model the provider resolved to a dated snapshot of the
// harness's ("claude-opus-5-20261001") is the same model; anything else, an unrecorded model or limit, or another
// steering, stops the arm before its row is written: a row from another writer would be compared as this arm's.
const sameModel = (said) => said === model || (typeof said === 'string' && said.startsWith(`${model}-`) && /^\d{8}$/.test(said.slice(model.length + 1)));
function heldToHarness(t, rec) {
  const wrong = [];
  if (!sameModel(rec?.model)) wrong.push(`its model was ${rec?.model ? `"${rec.model}"` : 'not recorded'}, not "${model}"`);
  if (rec?.maxTokens !== maxTokens) wrong.push(`its token limit was ${rec?.maxTokens ?? 'not recorded'}, not ${maxTokens}`);
  if (rec?.steering !== graded) wrong.push(`its steering was ${rec?.steering ? `"${rec.steering}"` : 'not recorded'}, not "${graded}"`);
  if (wrong.length) die(`${t.id}: the runtime run did not run as the harness asked: ${wrong.join('; ')}. No row was written. Build the CLI from a commit whose invoke --json records model, maxTokens and steering, and keep the model, limit and steering out of the runtimes file.`);
  sealVersion(t, rec);
}

// ONE FILE, ONE VERSION OF THE SKILL. The manifest of a runtime arm hashes where its build lives (CLI, data, project),
// and a skill rebuilt in place keeps every one of those paths: a resumed run appended rows another version of the skill
// wrote, under the same arm. So the version `atelier invoke --json` reports (`skillVersion`) is read from the first
// record, written into the manifest and on every row as `skill_version`, and a record that names another version, or
// none, stops the arm before its row is written. Set at startup from the manifest (or the rows) already there.
let sealedVersion = null;
// READ BEFORE THE CALL, NOT ONLY FROM ITS RECORD: a cell a filter stopped before Atelier wrote its record names no
// version, and a row with none could be resumed under a rebuilt skill. `atelier inspect` names the active version with
// no model call, so every cell, delivered or filtered, is held to the version that was active when it ran.
function activeVersion(t) {
  const r = spawnSync(process.execPath, [resolve(runtimeSpec.cli), 'inspect', '--skill', runtimeSpec.skill], { cwd: runtimeSpec.proj,
    env: { ...process.env, ATELIER_DATA: runtimeSpec.data, ATELIER_PROJECT_DIR: runtimeSpec.proj }, encoding: 'utf8', timeout: 60_000 });
  const v = /active SkillVersion (\S+)/.exec(r.stdout ?? '')?.[1] ?? null;
  if (!v) die(`${t.id}: could not read the active version of the skill "${runtimeSpec.skill}" (atelier inspect: ${(r.stderr || r.stdout || '').trim().split('\n')[0] || 'no output'}). No row was written.`);
  return v;
}
function sealVersion(t, rec) {
  const said = typeof rec?.skillVersion === 'string' && rec.skillVersion ? rec.skillVersion : null;
  if (!said) die(`${t.id}: the runtime run's record does not say which version of the skill answered (skillVersion), so this file could not be held to one version. No row was written. Build the CLI from a commit whose invoke --json records skillVersion.`);
  checkVersion(t, said);
}
function checkVersion(t, said) {
  if (sealedVersion === null) { sealedVersion = said; return; }
  if (said !== sealedVersion) die(`${t.id}: the skill answered as version ${said}, and ${out} holds rows of version ${sealedVersion}: the skill "${runtimeSpec.skill}" was rebuilt since this file was begun. No row was written. Write the new version to its own --out file, or put the build back to ${sealedVersion} to resume.`);
}

function runtimeArm(t, remaining) {
  const before = activeVersion(t); checkVersion(t, before);
  const r = runtimeCell(t, remaining);
  if (r.skillVersion && r.skillVersion !== before) die(`${t.id}: the skill was version ${before} when the cell began and answered as ${r.skillVersion}: it was rebuilt during the run. No row was written.`);
  return { ...r, skillVersion: before };
}
function runtimeCell(t, remaining) {
  const tmp = mkdtempSync(join(tmpdir(), 'compare-material-'));
  try {
    const withArgs = t.material ? (writeFileSync(join(tmp, 'material.md'), t.material), ['--with', `material=${join(tmp, 'material.md')}`]) : [];
    // A benchmark's runs are tests: marked so a later rebuild never learns its "write this, not that" pairs from them.
    // --json, so the row keeps Atelier's own verdict on its work (VERIFIED, NEEDS_REVIEW, BLOCKED) beside the answer:
    // a study compares that verdict with the judge's.
    // The cap still left is the run's own budget (`invoke --cap`), so no run can spend past the harness's cap.
    const backend = runtimeBackend(runtimeSpec);
    const cmd = [resolve(runtimeSpec.cli), 'invoke', '--skill', runtimeSpec.skill, '--json', '--test-run', '--target-model', model,
      '--max-tokens', String(maxTokens), '--cap', String(Math.floor(remaining * 10_000) / 10_000), ...(graded === 'none' ? ['--graded', 'none'] : []),
      ...(backend.passPrices ? ['--price-in', opt(args, 'price-in'), '--price-out', opt(args, 'price-out')] : []), ...withArgs, ...(runtimeSpec.args ?? []), t.prompt];
    const done = spawnSync(process.execPath, cmd, { cwd: runtimeSpec.proj, env: { ...process.env, ATELIER_DATA: runtimeSpec.data, ATELIER_PROJECT_DIR: runtimeSpec.proj },
      encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
    // A run that stopped before its record prints {state: "ERROR"}: no record, as before.
    let rec = null; try { rec = JSON.parse(done.stdout); } catch { /* no record: the run failed before its end */ }
    if (rec?.state === 'ERROR') rec = null;
    // A STRICT REFUSAL IS AN ANSWER TO THE QUESTION "what did the person get", NOT AN ERROR. Exit 3 with "not
    // delivered (strict delivery)" used to be thrown, retried twice and then end the whole run, so a refusal cost
    // three runs and a refused task was never recorded. It is written as a row with no response and its reasons.
    if (done.status === 3 && /not delivered \(strict delivery\)/.test(done.stderr ?? '')) {
      const why = /not delivered \(strict delivery\): (.*?)\. The text is kept/s.exec(done.stderr ?? '')?.[1] ?? 'not conformant';
      heldToHarness(t, rec);
      return { response: null, refused: why.split('; '), skillVersion: rec?.skillVersion ?? null, ...ledgerOf(rec), ...signalsOf(rec), ...thinkingOf(rec), ...runtimeModelOf(rec), cost: rec?.costUsd ?? null, state: rec?.eval?.record?.state ?? null };
    }
    // A model call inside the run that a provider filtered or the model declined: a FILTERED row, never retried.
    const blocked = done.status !== 0 ? filteredIn(done.stderr ?? '') : null;
    if (blocked && rec) heldToHarness(t, rec);
    if (blocked) return { response: null, filtered: blocked, skillVersion: rec?.skillVersion ?? null, ...ledgerOf(rec), ...thinkingOf(rec), ...runtimeModelOf(rec), cost: rec?.costUsd ?? null };
    // A BLOCKED RUN IS A DELIVERED ANSWER WITH ITS VERDICT, NOT A FAILED CALL. `invoke --json` exits 1 when the work it
    // delivered is BLOCKED, as `run` does; the record is complete and is the row. Retrying it would pay for the same run
    // three times and then end the arm.
    const blockedButDelivered = done.status === 1 && rec?.eval?.record?.state === 'BLOCKED' && typeof rec.output === 'string';
    if ((done.status !== 0 && !blockedButDelivered) || !rec) throw new Error((done.stderr || done.stdout || `exit ${done.status}`).trim().split('\n').slice(-5).join('\n'));
    // a setup error, not a failed call: retrying would pay for the same run again, so it stops here
    if (rec.output === undefined || rec.toCheck === undefined) die(`${runtimeSpec.cli} gives no "output" and "toCheck" in invoke --json: build it from a commit that has them`);
    heldToHarness(t, rec);
    // THE REVIEW AS DELIVERED (`output`, after repair), NOT `answer`: `answer` adds a footer of specifics not found in the
    // material ("check before you use this"), which only this arm writes. Judged, it names the arm, and no one posts a
    // review that ends that way. The list is kept beside the response as to_check, for the study and never the judge.
    // thinkingBlocks: what the run's calls were returned (`invoke --json`), for the preflight; undefined from a build before it
    return { response: String(rec.output ?? '').trim(), steering: rec.steering, skillVersion: rec.skillVersion, thinkingBlocks: rec.thinkingBlocks, ...ledgerOf(rec), ...signalsOf(rec), ...thinkingOf(rec), ...runtimeModelOf(rec), cost: rec.costUsd ?? null, state: rec.eval?.record?.state ?? null };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// The fields only some rows carry: the self-review's check, Atelier's verdict and its own check signals, the thinking
// setting the call was sent with (model arms; the runtime arm's calls go through the same provider), and wall time.
const extraOf = (r) => ({ ...(r.review ? { review: r.review } : {}), ...(r.state ? { atelier_state: r.state } : {}), ...(r.signals ? r.signals : {}),
  ...(r.thinking !== undefined ? { thinking: r.thinking } : {}), ...(r.thinkingReason ? { thinking_reason: r.thinkingReason } : {}),
  ...(r.modelReason ? { model_reason: r.modelReason } : {}),
  // the version of the skill that answered (null only on a row whose run left no record), held to the manifest's
  ...(kind === 'atelier-runtime' ? { skill_version: r.skillVersion ?? null } : {}),
  // a runtime row's steering is its record's (held equal to the declared one); a row with no record says so
  ...(kind === 'atelier-runtime' && r.modelReason === 'the run left no record' ? { graded_reason: 'the run left no record; the arm\'s declared setting' } : {}), seconds: r.seconds });
// The model on a row: a runtime row's from its own record; every other arm's is the harness's, which it was sent to.
const modelOfRow = (r) => (kind === 'atelier-runtime' ? r.model ?? null : model);
let filtered = 0;

// THE MANIFEST: everything that makes this file one arm's, written beside it with the first row. What a row carries of
// it (rowFixed) is compared row by row on a rerun; the rest (the provider settings) is in the manifest alone.
const armLabel = kind === 'skill' ? `skill:${armArg}` : arm;
const rowFixed = { runner: RUNNER, condition, arm: armLabel, max_tokens: maxTokens, placement: kind === 'skill' ? placement : null,
  skill_sha256: skillSha, tasks_sha256: tasksSha, split, graded, grammar };
const runtimeSha = runtimeSpec === null ? null
  : sha256(JSON.stringify({ cli: resolve(runtimeSpec.cli), data: resolve(runtimeSpec.data), proj: resolve(runtimeSpec.proj), skill: runtimeSpec.skill, args: runtimeSpec.args ?? [] }));
const providerSettings = () => {
  if (kind === 'atelier-runtime') { const b = runtimeBackend(runtimeSpec); return { provider: b.provider, args: runtimeSpec.args ?? [], price_in: b.priceIn, price_out: b.priceOut }; }
  if (provider === 'anthropic') return { provider, base_url: process.env.ANTHROPIC_BASE_URL ?? null };
  return { provider, base_url: opt(args, 'base-url') ?? null, price_in: Number(opt(args, 'price-in', 'NaN')), price_out: Number(opt(args, 'price-out', 'NaN')) };
};
const manifest = { ...rowFixed, skill_sha256: kind === 'atelier-runtime' ? runtimeSha : skillSha, model, provider: providerSettings() };
const manifestPath = `${out}.manifest.json`;
/** Every field where `a` and `b` differ, as "field: was → now". */
const differences = (was, now, keys) => keys.filter((k) => JSON.stringify(was?.[k] ?? null) !== JSON.stringify(now[k] ?? null))
  .map((k) => `${k}: ${JSON.stringify(was?.[k] ?? null)} -> ${JSON.stringify(now[k] ?? null)}`);
// ONE WRITER PER FILE. The manifest check below reads the file once: two runners started together on one new path both
// found it empty, both passed, and both appended, two arms' rows in one file. So a runner claims the file before it reads
// it, by creating `<out>.lock` exclusively, and holds it until it exits by any route (done, refused, an error, SIGINT,
// SIGTERM). A lock already there is another runner's, or one a killed runner left: it is never taken over, because
// "stale" cannot be told from "slow" from here; the message names the file to delete. The preflight writes nothing and
// takes no lock.
const lockPath = `${out}.lock`;
const lockMark = `pid ${process.pid}, started ${new Date().toISOString()}\n`;
if (!args.includes('--preflight')) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  // a signal ends the process through 'exit', so the lock goes with it (128 + the signal's number, as a shell reports it).
  // Caught before the lock exists: a signal that came between the lock and its handler took the default and left the lock.
  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.on(sig, () => { process.exit(128 + n); });
  let fd;
  try { fd = openSync(lockPath, 'wx'); } catch (e) {
    if (e?.code !== 'EEXIST') throw e;
    let held = ''; try { held = readFileSync(lockPath, 'utf8').trim(); } catch { /* removed meanwhile: still not ours */ }
    die(`another runner holds this file: ${lockPath} exists${held ? ` (${held})` : ''}. Wait for it to finish, or write this arm to its own --out file. If no runner is writing ${out} (one was killed), delete ${lockPath} and run again. Nothing was written.`);
  }
  writeSync(fd, lockMark); closeSync(fd);
  process.on('exit', () => { try { if (readFileSync(lockPath, 'utf8') === lockMark) rmSync(lockPath, { force: true }); } catch { /* already gone */ } });
}
const existing = existsSync(out) ? readJsonl(out) : [];
{
  const found = [];
  let was = null;
  if (existsSync(manifestPath)) {
    try { was = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { found.push(`${manifestPath} is not readable JSON`); }
    if (was) found.push(...differences(was, manifest, Object.keys(manifest)).map((d) => `the manifest's ${d}`));
  } else if (existing.length) found.push(`${out} holds ${existing.length} row(s) and no ${manifestPath}, so what they were written with cannot be checked`);
  // the version this file is sealed to: the manifest's, else the first row's that names one (a row with no record names none)
  if (kind === 'atelier-runtime') sealedVersion = was?.skill_version ?? existing.find((r) => r.skill_version)?.skill_version ?? null;
  existing.forEach((r, i) => {
    const d = differences(r, rowFixed, Object.keys(rowFixed));
    // a cell a filter stopped before its record names no model; the version read before it ran still holds it to this arm
    if (kind === 'atelier-runtime' ? !(sameModel(r.model) || (r.filtered && r.model === null)) : r.model !== model) d.push(`model: ${JSON.stringify(r.model ?? null)} -> ${JSON.stringify(model)}`);
    if (kind === 'atelier-runtime' && !Object.hasOwn(r, 'skill_version')) d.push('skill_version: not recorded (written before the skill\'s version was sealed)');
    else if (kind === 'atelier-runtime' && r.skill_version === null) d.push('skill_version: none (a cell filtered before its record, from a runner that did not read the version first)');
    else if (kind === 'atelier-runtime' && r.skill_version !== sealedVersion) d.push(`skill_version: ${JSON.stringify(r.skill_version)}, not the file's ${JSON.stringify(sealedVersion)}`);
    if (d.length) found.push(`row ${i + 1} (${r.case_id ?? '?'}): ${d.join('; ')}`);
  });
  if (found.length) die(`${out} was written by another arm or with other settings, so nothing is added to it:\n  ${found.slice(0, 12).join('\n  ')}${found.length > 12 ? `\n  … and ${found.length - 12} more` : ''}\nWrite this arm to its own --out file. Nothing was written.`);
}
// The manifest is written with the first row, and once more when a runtime arm's version first becomes known after a
// first row that had no record to read it from.
const sealedManifest = () => (kind === 'atelier-runtime' ? { ...manifest, skill_version: sealedVersion } : manifest);
const writeRow = (row) => {
  // RECHECKED INSIDE THE LOCK BEFORE EVERY APPEND: the lock is still this runner's (not deleted and taken by another),
  // and the manifest beside the file is still this arm's.
  let mine = false; try { mine = readFileSync(lockPath, 'utf8') === lockMark; } catch { /* gone */ }
  if (!mine) die(`${lockPath} is no longer this runner's (it was deleted, or another runner took it), so ${out} may have another writer. The row for ${row.case_id} was not written.`);
  let was = null;
  if (existsSync(manifestPath)) {
    try { was = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { die(`${manifestPath} is no longer readable JSON. The row for ${row.case_id} was not written.`); }
    const changed = differences(was, manifest, Object.keys(manifest));
    if (kind === 'atelier-runtime' && was.skill_version && was.skill_version !== sealedVersion) changed.push(`skill_version: ${JSON.stringify(was.skill_version)} -> ${JSON.stringify(sealedVersion)}`);
    if (changed.length) die(`${manifestPath} changed while this runner held ${out} (${changed.join('; ')}). The row for ${row.case_id} was not written.`);
  }
  if (!was || (kind === 'atelier-runtime' && !was.skill_version && sealedVersion)) writeFileSync(manifestPath, `${JSON.stringify(sealedManifest(), null, 1)}\n`);
  appendFileSync(out, `${JSON.stringify(row)}\n`);
};

const done = new Set(existing.map((r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}\u0000${r.runner}`));
const prior = existing.filter((r) => r.condition === condition);
let spent = prior.reduce((n, r) => n + (r.cost_usd ?? 0), 0);
// a two-call arm's cell costs two calls
let perCall = Math.max(Number(opt(args, 'per-call', '0.25')) * (kind === 'self-review' ? 2 : 1), ...prior.filter((r) => !r.cost_estimated).map((r) => r.cost_usd ?? 0));
const c = kind === 'atelier-runtime' ? null : await client();
const answerOf = (t) => (kind === 'atelier-runtime' ? runtimeArm(t, cap - spent) : kind === 'self-review' ? selfReviewArm(c, t) : modelArm(c, t));

// The answer's text at about four characters a token; more than three times that, plus a margin for the call's own
// framing, is far above what the answer accounts for.
const CHARS_PER_TOKEN = 4; const FAR_ABOVE = 3; const SLACK_TOKENS = 64;
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
  // EVERY ARM IS SENT WITH THINKING OFF. A thinking block in the answer, or output tokens far beyond what the answer's
  // text accounts for (thinking billed and not shown), means the setting did not hold: the arm would be paid and
  // judged as another configuration than the one recorded.
  if (kind === 'atelier-runtime' && r.thinking === 'enabled') { stop = true; console.log('preflight: the run record says its calls were sent with thinking on: every arm runs with thinking off.'); }
  // A RUNTIME ARM IS HELD TO WHAT ITS CALLS RETURNED, LIKE A MODEL ARM: the setting sent is not the thinking received.
  // A record that does not count them could not show it, and is no pass.
  if (kind === 'atelier-runtime' && typeof r.thinkingBlocks !== 'number') { stop = true; console.log('preflight: the run record does not say how many thinking blocks its calls returned (thinkingBlocks), so thinking the backend did anyway could not be seen: build the CLI from a commit whose invoke --json records it.'); }
  if (r.thinkingBlocks > 0) { stop = true; console.log(`preflight: the response held ${r.thinkingBlocks} thinking block(s), although every arm is sent with thinking off: check the model and the provider before the run.`); }
  const accounted = r.written === undefined ? null : Math.ceil(r.written / CHARS_PER_TOKEN);
  const billed = r.usage?.output_tokens ?? null;
  if (accounted !== null && billed !== null && billed > FAR_ABOVE * accounted + SLACK_TOKENS) {
    stop = true; console.log(`preflight: the call billed ${billed} output token(s) for an answer of about ${accounted}: tokens were spent on something not in the answer (thinking, most likely). Check the model and the provider before the run.`);
  }
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
      writeRow({ case_id: t.id, trial, condition, runner: RUNNER, response: r.response, usage: r.usage, cost_usd: null, model: modelOfRow(r), arm: armLabel, max_tokens: maxTokens, placement: rowFixed.placement, skill_sha256: skillSha, tasks_sha256: tasksSha, split, graded, grammar, calls: r.calls === undefined ? 1 : r.calls, ...extraOf(r) });
      console.error(`stopped: ${t.id} came back with no cost, so the cap could not hold. Its answer is recorded; fix the price and rerun.`); process.exit(4);
    }
    // an estimate is never evidence of what a call costs: it does not raise the allowance kept for the next one
    spent += r.cost; if (!r.costEstimated) perCall = Math.max(perCall, r.cost);
    const row = { case_id: t.id, trial, condition, runner: RUNNER, response: r.response, ...(r.refused ? { delivered: false, reasons: r.refused } : {}),
      ...(r.filtered ? { delivered: false, filtered: r.filtered, ...(r.filteredCall ? { filtered_call: r.filteredCall } : {}) } : {}),
      usage: r.usage, cost_usd: r.cost, ...(r.costEstimated ? { cost_estimated: true } : {}), model: modelOfRow(r),
      arm: armLabel, max_tokens: maxTokens, placement: rowFixed.placement,
      skill_sha256: skillSha, tasks_sha256: tasksSha, split, graded, grammar, calls: r.calls === undefined ? 1 : r.calls, ...extraOf(r) };
    writeRow(row);
    console.error(`${condition} trial ${trial}: ${t.id}${r.cost === null ? '' : `  $${r.cost.toFixed(4)}`}`);
  }
}
console.error(`done: ${out} ($${spent.toFixed(4)} reported for ${condition})`);
console.error(`filtered: ${filtered} of ${tasks.length * trials} rows (${condition})`);
