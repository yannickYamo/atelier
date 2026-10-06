#!/usr/bin/env node
// bench/compare/run.mjs — ONE RUNNER FOR EVERY ANSWER ARM, WRITING THE OUTSIDE BENCHMARK'S responses.jsonl.
//
//   node bench/compare/run.mjs --tasks splits/test.jsonl --arm none --out out/none.jsonl
//   node bench/compare/run.mjs --tasks splits/test.jsonl --arm skill:path/to/SKILL.md --out out/hand.jsonl
//   node bench/compare/run.mjs --tasks splits/test.jsonl --arm atelier-runtime:<build> --runtimes runtimes.json --out out/rt.jsonl
//
// Options: --model <id> (default claude-opus-5, or BENCH_MODEL; it must have a price, or the cap cannot hold) · --max-tokens <n> (default 4096) ·
// --trials <n> (1) · --condition baseline|candidate|comparator (none → baseline, other arms → candidate) ·
// --placement system|harness · --sealed splits/SEALED.json · --cap <usd> (25) ·
// --provider anthropic|openai-compatible --base-url <url> (the second for a local or scripted backend).
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
// arm, max_tokens, placement, skill_sha256, tasks_sha256 and split. Completed lines are skipped on a rerun,
// so a stopped run continues where it stopped. Run `npm run build` first: this imports ../../dist.

import { readFileSync, existsSync, appendFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readJsonl, sha256, sha256File, validateTasks, opt, die, stripFrontmatter } from './lib.mjs';

const RUNNER = 'atelier-compare';
const args = process.argv.slice(2);
const tasksPath = opt(args, 'tasks'); const arm = opt(args, 'arm'); const out = opt(args, 'out');
if (!tasksPath || !arm || !out) die('usage: run.mjs --tasks <file> --arm none|skill:<file>|atelier-runtime:<build> --out <responses.jsonl> [--model <id>] [--max-tokens <n>]');
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
if (!['none', 'skill', 'atelier-runtime'].includes(kind) || (kind !== 'none' && !armArg)) die(`unknown arm ${arm}: none, skill:<file> or atelier-runtime:<build>`);
const condition = opt(args, 'condition', kind === 'none' ? 'baseline' : 'candidate');
if (!['baseline', 'candidate', 'comparator'].includes(condition)) die('--condition is baseline, candidate or comparator (the benchmark\'s three)');

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
if (kind === 'skill') {
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
}

async function modelArm(c, t) {
  const system = kind === 'skill' && placement === 'system' ? skillText : '';
  const user = kind === 'skill' && placement === 'harness' ? harnessPrompt(withMaterial(t), skillText) : withMaterial(t);
  const r = await c.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: 'emit_answer',
    toolDescription: 'Deliver your complete answer to the user.', schema: ANSWER_SCHEMA, maxTokens });
  const answer = r.json && typeof r.json === 'object' ? r.json.answer : undefined;
  if (typeof answer !== 'string') throw new Error(`the model returned no answer string for ${t.id}`);
  return { response: answer.trim(), usage: { input_tokens: r.inputTokens, cache_read_input_tokens: r.cacheReadTokens, cache_creation_input_tokens: r.cacheWriteTokens, output_tokens: r.outputTokens },
    cost: typeof r.costUsd === 'number' ? r.costUsd : null };
}

let runtimeSpec = null;
if (kind === 'atelier-runtime') {
  const file = opt(args, 'runtimes', process.env.RUNTIMES_FILE);
  if (!file) die('atelier-runtime needs --runtimes <file> (or RUNTIMES_FILE): {"<build>": {"cli": …, "data": …, "proj": …, "skill": …}}');
  runtimeSpec = JSON.parse(readFileSync(file, 'utf8'))[armArg] ?? die(`no build called ${armArg} in ${file}`);
  for (const k of ['cli', 'data', 'proj', 'skill']) if (!runtimeSpec[k]) die(`runtime ${armArg} has no "${k}"`);
  await checkRuntimePrice(runtimeSpec);
}

function runtimeArm(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'compare-material-'));
  try {
    const withArgs = t.material ? (writeFileSync(join(tmp, 'material.md'), t.material), ['--with', `material=${join(tmp, 'material.md')}`]) : [];
    // A benchmark's runs are tests: marked so a later rebuild never learns its "write this, not that" pairs from them.
    const cmd = [resolve(runtimeSpec.cli), 'invoke', '--skill', runtimeSpec.skill, '--answer-only', '--test-run', '--target-model', model,
      '--max-tokens', String(maxTokens), ...withArgs, ...(runtimeSpec.args ?? []), t.prompt];
    const done = spawnSync(process.execPath, cmd, { cwd: runtimeSpec.proj, env: { ...process.env, ATELIER_DATA: runtimeSpec.data, ATELIER_PROJECT_DIR: runtimeSpec.proj },
      encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
    // A STRICT REFUSAL IS AN ANSWER TO THE QUESTION "what did the person get", NOT AN ERROR. Exit 3 with "not
    // delivered (strict delivery)" used to be thrown, retried twice and then end the whole run, so a refusal cost
    // three runs and a refused task was never recorded. It is written as a row with no response and its reasons.
    if (done.status === 3 && /not delivered \(strict delivery\)/.test(done.stderr ?? '')) {
      const why = /not delivered \(strict delivery\): (.*?)\. The text is kept/s.exec(done.stderr ?? '')?.[1] ?? 'not conformant';
      const spentOn = [...(done.stderr ?? '').matchAll(/\$(\d+\.\d+) · everything this run checked/g)].map((m) => Number(m[1])).pop();
      return { response: null, refused: why.split('; '), usage: {}, cost: spentOn ?? null };
    }
    if (done.status !== 0) throw new Error((done.stderr || done.stdout || `exit ${done.status}`).trim().split('\n').slice(-5).join('\n'));
    const cost = [...(done.stderr ?? '').matchAll(/\$(\d+\.\d+) · everything this run checked/g)].map((m) => Number(m[1])).pop();
    return { response: done.stdout.trim(), usage: {}, cost: cost ?? null };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const done = new Set(existsSync(out) ? readJsonl(out).map((r) => `${r.case_id}\u0000${r.trial}\u0000${r.condition}\u0000${r.runner}`) : []);
const prior = existsSync(out) ? readJsonl(out).filter((r) => r.condition === condition) : [];
let spent = prior.reduce((n, r) => n + (r.cost_usd ?? 0), 0);
let perCall = Math.max(Number(opt(args, 'per-call', '0.25')), ...prior.map((r) => r.cost_usd ?? 0));
mkdirSync(dirname(resolve(out)), { recursive: true });
const c = kind === 'atelier-runtime' ? null : await client();

for (let trial = 1; trial <= trials; trial++) {
  for (const t of tasks) {
    if (done.has(`${t.id}\u0000${trial}\u0000${condition}\u0000${RUNNER}`)) { console.error(`skip ${t.id} trial ${trial} (done)`); continue; }
    // BEFORE THE CALL, with room for it: the dearest call seen so far (or --per-call), so the cap is never passed by a whole call.
    if (spent + perCall > cap) { console.error(`stopped: $${spent.toFixed(4)} spent, and one more call (about $${perCall.toFixed(4)}) would pass the --cap of $${cap}. Rerun with a higher cap to continue.`); process.exit(3); }
    let r; let last;
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      try { r = c ? await modelArm(c, t) : runtimeArm(t); } catch (e) { last = e; console.error(`${t.id}: attempt ${attempt + 1} failed: ${e.message.split('\n')[0]}`); }
    }
    if (!r) die(`${t.id} failed three times: ${last?.message}`);
    if (!r.response && !r.refused) die(`${t.id}: the arm returned an empty answer, and an empty answer judged would read as a result`);
    // A refusal that printed no cost is charged the dearest call seen so far: never zero, and never a reason to stop.
    if (r.refused && typeof r.cost !== 'number') r.cost = perCall;
    // A CALL WHOSE COST IS NOT KNOWN STOPS THE RUN: adding 0 for it is how a cap stopped binding. The answer is kept.
    if (typeof r.cost !== 'number') {
      appendFileSync(out, `${JSON.stringify({ case_id: t.id, trial, condition, runner: RUNNER, response: r.response, usage: r.usage, cost_usd: null, model, arm: kind === 'skill' ? `skill:${armArg}` : arm, max_tokens: maxTokens, placement: kind === 'skill' ? placement : null, skill_sha256: skillSha, tasks_sha256: tasksSha, split })}\n`);
      console.error(`stopped: ${t.id} came back with no cost, so the cap could not hold. Its answer is recorded; fix the price and rerun.`); process.exit(4);
    }
    spent += r.cost; perCall = Math.max(perCall, r.cost);
    const row = { case_id: t.id, trial, condition, runner: RUNNER, response: r.response, ...(r.refused ? { delivered: false, reasons: r.refused } : {}), usage: r.usage, cost_usd: r.cost, model,
      arm: kind === 'skill' ? `skill:${armArg}` : arm, max_tokens: maxTokens, placement: kind === 'skill' ? placement : null,
      skill_sha256: skillSha, tasks_sha256: tasksSha, split };
    appendFileSync(out, `${JSON.stringify(row)}\n`);
    console.error(`${condition} trial ${trial}: ${t.id}${r.cost === null ? '' : `  $${r.cost.toFixed(4)}`}`);
  }
}
console.error(`done: ${out} ($${spent.toFixed(4)} reported for ${condition})`);
