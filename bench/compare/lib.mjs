// bench/compare/lib.mjs — what every compare script shares: the task file, hashes, and the overlap check.
//
// A task is one line of tasks.jsonl: {id, prompt, material?, category?} plus whatever the source benchmark
// needs to judge it (i-have-adhd keeps `risk` and `criteria`, which its judge reads). Extra fields are kept.
//
// The same normalisation lives in compare_common.py (normalise_text), so the Python optimizers and these
// scripts agree on what counts as the same task.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

/** Read a JSONL file: one object per non-empty line, with the line number in any error. */
export function readJsonl(path) {
  return readFileSync(path, 'utf8').split('\n').flatMap((line, i) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch (e) { throw new Error(`${path}: line ${i + 1}: ${e.message}`); }
  });
}

/** Write rows as JSONL, creating the directory. The bytes are fixed by the rows, so a hash is reproducible. */
export function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sha256File = (path) => sha256(readFileSync(path));

/** Lower case, punctuation dropped, whitespace collapsed: two prompts that differ only in those are one task. */
export const normalise = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Every task's text as one key: the prompt, and the material when there is one. */
export const taskKey = (t) => normalise(`${t.prompt ?? ''} ${t.material ?? ''}`);

/** Validate a task list: ids unique and non-empty, a non-empty prompt on each. Returns the error lines. */
export function validateTasks(tasks) {
  const errors = []; const seen = new Set();
  tasks.forEach((t, i) => {
    if (typeof t.id !== 'string' || !t.id) errors.push(`task ${i + 1}: id must be a non-empty string`);
    else if (seen.has(t.id)) errors.push(`task ${i + 1}: duplicate id ${t.id}`);
    else seen.add(t.id);
    if (typeof t.prompt !== 'string' || !t.prompt.trim()) errors.push(`task ${t.id ?? i + 1}: prompt must be a non-empty string`);
    if (t.material !== undefined && typeof t.material !== 'string') errors.push(`task ${t.id}: material must be a string when present`);
  });
  return errors;
}

/** Tasks in `a` whose text matches a task in `b` (normalised), as [aId, bId] pairs. */
export function overlaps(a, b) {
  const keys = new Map(b.map((t) => [taskKey(t), t.id]));
  const promptKeys = new Map(b.map((t) => [normalise(t.prompt), t.id]));
  return a.flatMap((t) => {
    const hit = keys.get(taskKey(t)) ?? promptKeys.get(normalise(t.prompt));
    return hit === undefined ? [] : [[t.id, hit]];
  });
}

/** Seeded PRNG (mulberry32), so a split is the same on every machine for the same seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded Fisher-Yates shuffle (a copy). */
export function shuffled(xs, seed) {
  const out = [...xs]; const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** --name value from argv, or the default; a flag given without a value is an error. */
export function opt(args, name, dflt) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
}

export function die(msg) { console.error(`compare: ${msg}`); process.exit(2); }

/** Leading YAML front matter dropped, exactly as run_evals.py _strip_frontmatter does it. */
export const stripFrontmatter = (text) => {
  const lines = text.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return text;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
  return text;
};
