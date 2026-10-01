#!/usr/bin/env node
// bench/compare/tasks/gen-train.mjs — THE PROMPT FOR GENERATED TRAINING TASKS, AND THE CHECK ON WHAT COMES BACK.
//
//   node bench/compare/tasks/gen-train.mjs prompt --test test.jsonl --per-category 6 --out gen-prompt.md
//   node bench/compare/tasks/gen-train.mjs check  --tasks generated.jsonl --test test.jsonl [--out pool.jsonl]
//
// `prompt` writes a prompt file and nothing else: generating is a paid model call, made by whoever runs the
// study, with the model they name in the results. The prompt names the test split's categories, risk levels
// and the shape of a case, and never shows a test prompt: a generator that saw them would paraphrase them,
// and a paraphrase of a test case in the training split is a leak the exact-match check below cannot see.
//
// `check` validates a returned file: every line a task with id, prompt, category, risk and criteria; ids
// unique and none shared with the test split; and no task whose normalised text matches a test task
// (lib.mjs normalise). Near-duplicates (word overlap of 0.6 or more with a test prompt) are listed as a
// warning for a person to read, because they are a judgement, not a rule. Exit 1 on any failure.
// --out writes the tasks that passed, ready for split.mjs --pool.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readJsonl, writeJsonl, validateTasks, overlaps, normalise, opt, die } from '../lib.mjs';

const [mode, ...args] = process.argv.slice(2);
const testPath = opt(args, 'test');
if (!testPath || !['prompt', 'check'].includes(mode)) die('usage: gen-train.mjs prompt --test <file> --per-category <n> --out <file>   |   gen-train.mjs check --tasks <file> --test <file> [--out <file>]');
const test = readJsonl(testPath);

const categories = [...new Set(test.map((t) => t.category ?? 'general'))].sort();
const risksOf = (c) => [...new Set(test.filter((t) => (t.category ?? 'general') === c).map((t) => t.risk ?? 'medium'))].sort();

if (mode === 'prompt') {
  const n = Number(opt(args, 'per-category', '6'));
  const out = opt(args, 'out');
  if (!out || !(Number.isInteger(n) && n >= 1)) die('prompt needs --per-category <n ≥ 1> and --out <file>');
  const prompt = `Write ${n * categories.length} new evaluation tasks for an AI coding assistant, ${n} per category below, as JSONL: one JSON object per line and nothing else.

Each task is a message a developer might send an assistant that can read and edit their repository, and a short list of what a correct response must do.

Categories, with the risk levels to cover:
${categories.map((c) => `- ${c} (risk: ${risksOf(c).join(', ')})`).join('\n')}

Each line has exactly these fields:
{"id": "train-<category>-<n>", "category": "<one of the categories above>", "risk": "low|medium|high", "prompt": "<the developer's message>", "criteria": ["<what a correct response must do>", "<one or two more>"]}

Example of the shape (not a task to reuse):
{"id": "train-example-1", "category": "example", "risk": "low", "prompt": "The CI job fails with 'npm ERR! missing script: lint'. What do I change?", "criteria": ["Says the package.json has no lint script.", "Gives the one script entry to add and how to rerun the job."]}

Rules:
- Every prompt is new: a different situation, codebase, error or question from any well-known benchmark case.
- Vary length, tone and how much context the developer gives.
- Criteria are checkable from the response alone, and never reward length for its own sake.
- No real people, companies or private data.
`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, prompt);
  console.log(`prompt for ${n} task(s) in each of ${categories.length} categories → ${out} (no model was called)`);
} else {
  const tasksPath = opt(args, 'tasks');
  if (!tasksPath) die('check needs --tasks <file>');
  const tasks = readJsonl(tasksPath);
  const problems = validateTasks(tasks);
  for (const t of tasks) {
    if (!categories.includes(t.category)) problems.push(`${t.id}: category ${JSON.stringify(t.category)} is not a test-split category`);
    if (!['low', 'medium', 'high'].includes(t.risk)) problems.push(`${t.id}: risk must be low, medium or high`);
    if (!Array.isArray(t.criteria) || !t.criteria.length || !t.criteria.every((c) => typeof c === 'string' && c.trim())) problems.push(`${t.id}: criteria must be a non-empty list of strings`);
  }
  const testIds = new Set(test.map((t) => t.id));
  for (const t of tasks) if (testIds.has(t.id)) problems.push(`${t.id}: id is a test-split id`);
  const clash = overlaps(tasks, test);
  for (const [a, b] of clash) problems.push(`${a}: same text as test task ${b}`);
  const words = (s) => new Set(normalise(s).split(' ').filter((w) => w.length > 2));
  const near = tasks.flatMap((t) => test.flatMap((x) => {
    const a = words(t.prompt); const b = words(x.prompt);
    const inter = [...a].filter((w) => b.has(w)).length; const j = inter / (a.size + b.size - inter || 1);
    return j >= 0.6 && !clash.some(([p]) => p === t.id) ? [`${t.id} ~ ${x.id} (word overlap ${j.toFixed(2)})`] : [];
  }));
  if (near.length) console.error(`near-duplicates of test tasks, for a person to read:\n  ${near.join('\n  ')}`);
  const bad = new Set(problems.map((p) => p.split(':')[0]));
  if (opt(args, 'out')) writeJsonl(opt(args, 'out'), tasks.filter((t) => !bad.has(t.id)));
  if (problems.length) { console.error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`); process.exit(1); }
  console.log(`${tasks.length} task(s) valid, none matching the test split${opt(args, 'out') ? ` → ${opt(args, 'out')}` : ''}`);
}
