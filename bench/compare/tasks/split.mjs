#!/usr/bin/env node
// bench/compare/tasks/split.mjs — TRAIN, VALIDATION AND A SEALED TEST SPLIT, FROM A POOL AND A SEED.
//
//   node bench/compare/tasks/split.mjs --pool pool.jsonl --out splits/ [--seed 1] [--val 0.25] \
//        (--test test.jsonl | --test-share 0.3) [--drop-overlap]
//
// Writes splits/train.jsonl, splits/validation.jsonl, splits/test.jsonl and splits/SEALED.json. SEALED.json
// holds the sha256 of every split file and the seed: an optimizer given SEALED.json refuses to run when the
// file it is handed as train or validation hashes to the test file, or shares a task with it (normalised
// text, lib.mjs); run.mjs records the hash of the tasks it answered, so a results file says which split it is.
//
// --test <file> fixes the test split (the outside benchmark's cases: from-ihaveadhd.mjs) and splits the pool
// into train and validation only. A pool task whose text matches a test task is refused, or dropped and
// listed with --drop-overlap. Without --test, --test-share of the pool is held out as the test split.
//
// The pool is sorted by id before the seeded shuffle, so the split depends on the seed and the tasks, never
// on the line order of the pool file. --val is a share (0 < v < 1) or a count (an integer of at least 1).

import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { readJsonl, writeJsonl, sha256File, validateTasks, overlaps, shuffled, opt, die } from '../lib.mjs';

const args = process.argv.slice(2);
const poolPath = opt(args, 'pool'); const out = opt(args, 'out');
if (!poolPath || !out) die('usage: split.mjs --pool <tasks.jsonl> --out <dir> [--seed 1] [--val 0.25] (--test <file> | --test-share 0.3) [--drop-overlap]');
const seed = Number(opt(args, 'seed', '1'));
if (!Number.isInteger(seed)) die('--seed must be an integer');
const testPath = opt(args, 'test');
const testShare = Number(opt(args, 'test-share', '0.3'));
const valArg = Number(opt(args, 'val', '0.25'));

let pool = readJsonl(poolPath);
const poolErrors = validateTasks(pool);
if (poolErrors.length) die(`the pool is not a valid task file:\n${poolErrors.join('\n')}`);

let test;
if (testPath) {
  test = readJsonl(testPath);
  const testErrors = validateTasks(test);
  if (testErrors.length) die(`the test file is not a valid task file:\n${testErrors.join('\n')}`);
  const clash = overlaps(pool, test);
  if (clash.length && !args.includes('--drop-overlap')) {
    die(`${clash.length} pool task(s) match a test task: ${clash.map(([a, b]) => `${a}≈${b}`).join(', ')}. Remove them, or pass --drop-overlap.`);
  }
  if (clash.length) {
    const drop = new Set(clash.map(([a]) => a));
    console.error(`dropped ${drop.size} pool task(s) that match a test task: ${[...drop].join(', ')}`);
    pool = pool.filter((t) => !drop.has(t.id));
  }
  const sameId = pool.filter((t) => test.some((x) => x.id === t.id)).map((t) => t.id);
  if (sameId.length) die(`pool and test share id(s) ${sameId.join(', ')}: give the training tasks their own ids.`);
}

const order = shuffled([...pool].sort((a, b) => a.id.localeCompare(b.id)), seed);
if (!test) {
  if (!(testShare > 0 && testShare < 1)) die('--test-share must be between 0 and 1');
  const n = Math.max(1, Math.round(order.length * testShare));
  test = order.splice(0, n);
}
const nVal = valArg >= 1 ? Math.floor(valArg) : Math.round(order.length * valArg);
if (!(nVal >= 1) || nVal >= order.length) die(`--val leaves ${order.length - nVal} training task(s) of ${order.length}: each split needs at least one`);
const validation = order.slice(0, nVal);
const train = order.slice(nVal);

const files = { train: join(out, 'train.jsonl'), validation: join(out, 'validation.jsonl'), test: join(out, 'test.jsonl') };
writeJsonl(files.train, train);
writeJsonl(files.validation, validation);
writeJsonl(files.test, test);
const entry = (k, rows) => ({ file: `${k}.jsonl`, sha256: sha256File(files[k]), n: rows.length });
const sealed = {
  what: 'compare splits: an optimizer refuses a train or validation file whose sha256 is test.sha256, or that shares a task with test.jsonl',
  seed, pool: { file: poolPath, sha256: sha256File(poolPath), n: readJsonl(poolPath).length },
  train: entry('train', train), validation: entry('validation', validation), test: { ...entry('test', test), from: testPath ?? 'pool' },
  normalisation: 'lower case, NFKC, every run of non-letters and non-digits to one space (lib.mjs normalise; compare_common.py normalise_text)',
};
writeFileSync(join(out, 'SEALED.json'), `${JSON.stringify(sealed, null, 1)}\n`);
console.log(`train ${train.length} · validation ${validation.length} · test ${test.length} (sealed ${sealed.test.sha256.slice(0, 16)}…) → ${out}`);
