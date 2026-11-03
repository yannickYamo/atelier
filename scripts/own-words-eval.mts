#!/usr/bin/env node
// scripts/own-words-eval.mts — DOES THE OWN-WORDS READING FIND THE PIECES THAT TALK ABOUT THEIR OWN MAKING, AND ONLY THOSE?
//
//   npx tsx scripts/own-words-eval.mts --flagged <dir> --clean <dir> [--model claude-haiku-5-5] [--json]
//
// Reads every .md file in two folders with the reading every run ends on (core/loop/own-words.ts): `--flagged` holds
// pieces a person or a count has marked as talking about their brief, notes or gaps; `--clean` holds pieces that do not.
// Prints, per folder, how many pieces the reading found at least one sentence in, and every sentence it found, so a
// person can check each. The reader is the run's small reader (Anthropic, ANTHROPIC_API_KEY); about $0.003 a piece.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readOwnWords } from '../core/loop/own-words.js';
import { clientFor, CONTEXT_READER_DEFAULT } from '../cli/runtime.js';

const argv = process.argv.slice(2);
const flagOf = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const model = flagOf('--model') ?? CONTEXT_READER_DEFAULT;
const client = clientFor(model);
const sets = [['flagged', flagOf('--flagged')], ['clean', flagOf('--clean')]].filter((x): x is [string, string] => Boolean(x[1]));
if (!sets.length) { console.error('usage: --flagged <dir> --clean <dir> [--model m] [--json]'); process.exit(2); }

const out: Record<string, { pieces: number; found: number; notRead: number; rows: { file: string; sentences: string[]; why?: string }[] }> = {};
for (const [name, dir] of sets) {
  const rows: { file: string; sentences: string[]; why?: string }[] = [];
  let notRead = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const text = readFileSync(join(dir, f), 'utf8');
    const d = await readOwnWords({ text, given: '' }, client, model, { spentUsd: 0, capUsd: 0.05, maxCalls: 1 });
    if (d.by !== 'model') notRead++;
    rows.push({ file: f, sentences: d.value.fixes.map((x) => x.sentence), ...(d.by !== 'model' ? { why: d.why ?? 'not read' } : {}) });
  }
  out[name] = { pieces: rows.length, found: rows.filter((r) => r.sentences.length).length, notRead, rows };
}
if (argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else for (const [name, r] of Object.entries(out)) {
  console.log(`${name}: ${r.found} of ${r.pieces} piece(s) with a sentence about their own making${r.notRead ? ` (${r.notRead} not read)` : ''}`);
  for (const row of r.rows.filter((x) => x.sentences.length || x.why)) console.log(`  ${row.file}: ${row.why ? `NOT READ (${row.why})` : row.sentences.map((s) => `"${s.slice(0, 140)}"`).join(' · ')}`);
}
