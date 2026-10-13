#!/usr/bin/env node
// bench/standing/gen-examples.mjs — builds a domain's golden examples once: each written by the model from the
// domain's method and one case's material, kept only when the domain's own checker passes it. Spends about a
// dollar a domain. What it writes is committed; it is not run again.
//
//   node bench/standing/gen-examples.mjs --domain contract
//
// The domain supplies `cases.mjs` ({ sheets, sheetText, requestFor? }: ids e01.. are examples, t0.. are tasks),
// `method.md`, `check.mjs`, and in `domain.mjs` the request and the material's name.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, pool } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const name = process.argv[process.argv.indexOf('--domain') + 1]; const dir = join(HERE, 'domains', name);
const cases = await import(join(dir, 'cases.mjs')); const { sheets, sheetText } = cases; const { check } = await import(join(dir, 'check.mjs')); const { tasks } = await import(join(dir, 'domain.mjs'));
const method = readFileSync(join(dir, 'method.md'), 'utf8'); const material = tasks[0].material[0].name;
// A domain whose request differs by case (the size of the team) says how; otherwise one request serves all.
const requestOf = cases.requestFor ?? (() => tasks[0].request);
for (const s of sheets.filter((x) => x.id.startsWith('t'))) writeFileSync(join(dir, 'tasks', `${s.id}.${material}.txt`), sheetText(s));
const done = await pool(sheets.filter((x) => x.id.startsWith('e')), 4, async (s) => {
  mkdirSync(join(dir, 'examples', `${s.id}.material`), { recursive: true });
  writeFileSync(join(dir, 'examples', `${s.id}.material`, `${material}.txt`), sheetText(s));
  if (existsSync(join(dir, 'examples', `${s.id}.md`))) return `${s.id} kept`;
  let why = '';
  for (let k = 0; k < 6; k += 1) {
    const text = (await ask({ model: 'claude-opus-5', max: 2500, tag: 'example', user: `${method}\n${requestOf(s)} Follow the method exactly, with a markdown "## " heading for each section it names and no other heading. Return only the work.${why}\n\n${sheetText(s)}` })).text;
    const r = check(text, { id: s.id });
    if (!r.fails.length) { writeFileSync(join(dir, 'examples', `${s.id}.md`), `---\nrequest: ${requestOf(s)}\nmaterial: ${s.id}.material/${material}.txt\n---\n${text}\n`); return `${s.id} ok (try ${k + 1})`; }
    why = `\n\nAn earlier attempt failed these checks, so hold them this time: ${r.fails.join('; ')}.`;
  }
  return `${s.id} FAILED`;
});
console.log(done.join('\n'));
