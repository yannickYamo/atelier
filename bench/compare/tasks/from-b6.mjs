#!/usr/bin/env node
// bench/compare/tasks/from-b6.mjs — THE WRITING-TASK FAMILY: A B6 PLAN'S BRIEFS AS COMPARISON TASKS.
//
//   node bench/compare/tasks/from-b6.mjs <work>/plan.json --split validation|test [--register <name>] --out tasks.jsonl
//
// The answer arms, the optimizer adapters and `atelier score` all read tasks.jsonl ({id, prompt, category}). A B6
// plan (bench/b6/run.mjs prepare) already holds a sealed brief for every validation and test piece of every
// register; this writes them in that format, so the same six arms run on writing, scored by `atelier score` on the
// register's skill and by the B6 evaluator (evaluation only, never optimized against). The test split stays sealed:
// its file's hash goes into SEALED.json by tasks/split.mjs, and the adapters refuse it.
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i === -1 ? undefined : args[i + 1]; };
const die = (m) => { console.error(m); process.exit(2); };
const planPath = args[0] ?? die('usage: from-b6.mjs <work>/plan.json --split validation|test [--register <name>] --out tasks.jsonl');
const split = opt('split') ?? die('--split validation|test is required');
const out = opt('out') ?? die('--out <tasks.jsonl> is required');
if (!['validation', 'test'].includes(split)) die('--split is validation or test');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const only = opt('register');
const rows = [];
for (const [reg, r] of Object.entries(plan.registers ?? {})) {
  if (only && reg !== only) continue;
  for (const f of r[split] ?? []) {
    const b = r.briefs?.[f];
    if (!b) die(`${reg}/${f}: no brief in the plan`);
    rows.push({ id: `${reg}-${f.replace(/\.md$/, '')}`, prompt: b.text, category: reg, brief: b.source });
  }
}
if (!rows.length) die(`no ${split} briefs${only ? ` for register "${only}"` : ''} in ${planPath}`);
writeFileSync(out, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
console.log(`${rows.length} ${split} brief(s) written to ${out}`);
