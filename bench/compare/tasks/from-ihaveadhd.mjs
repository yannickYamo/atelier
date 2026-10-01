#!/usr/bin/env node
// bench/compare/tasks/from-ihaveadhd.mjs — THE OUTSIDE BENCHMARK'S 14 CASES AS THE PUBLIC TEST SPLIT.
//
//   node bench/compare/tasks/from-ihaveadhd.mjs <i-have-adhd-clone> --out <dir>/test.jsonl
//
// Reads evals/cases.jsonl from a clone of github.com/ayghri/i-have-adhd (MIT) at the pinned commit and writes
// it in the compare task format. Converted on the reader's machine, never copied into this repository. Each
// line keeps the case's `risk` and `criteria`, because the benchmark's judge reads them, and `source` names
// the commit the cases came from. A clone at another commit is refused unless --any-commit is given, since a
// test split that moves is not a test split.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJsonl, writeJsonl, sha256File, validateTasks, opt, die } from '../lib.mjs';

export const PINNED = '839872f9d1cd634fed642b4589ce7226199cc15f';

const args = process.argv.slice(2);
const clone = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
const out = opt(args, 'out');
if (!clone || !out) die('usage: from-ihaveadhd.mjs <i-have-adhd-clone> --out <file> [--any-commit]');
const cases = join(clone, 'evals', 'cases.jsonl');
if (!existsSync(cases)) die(`no evals/cases.jsonl under ${clone}`);

let commit = null;
try { commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }
if (commit !== PINNED && !args.includes('--any-commit')) {
  die(`the clone is at ${commit ?? 'an unknown commit'}, not the pinned ${PINNED}. git -C ${clone} checkout ${PINNED}, or pass --any-commit and say so in the results.`);
}

const tasks = readJsonl(cases).map((c) => ({
  id: c.id, prompt: c.prompt, category: c.category, risk: c.risk, criteria: c.criteria,
  source: `i-have-adhd@${commit ?? 'unknown'}`,
}));
const errors = validateTasks(tasks);
if (errors.length) die(errors.join('\n'));
writeJsonl(out, tasks);
console.log(`${tasks.length} cases → ${out}  sha256 ${sha256File(out)}`);
