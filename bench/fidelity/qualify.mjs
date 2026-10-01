// bench/fidelity/qualify.mjs — QUALIFY THE STYLOMETRIC DETECTOR ON A REVIEWER'S OWN TEXTS.
//
// The detector may only steer once it holds on texts it never saw (core/fidelity/qualify.ts). This runs
// that test on a folder the reviewer assembled: the author's pieces and model imitations they generated
// wherever they like. It makes no model call and needs no key; it reads files and does arithmetic.
//
// Layout:  <dir>/author/*.md            the author's own pieces
//          <dir>/<generator-name>/*.md  imitations, one folder per model that wrote them
// A file may open with `topic: <x>` and `source: <x>` lines, bare or inside a `---` front matter block.
// The source defaults to the file name, so an imitation named like the piece it imitates shares its source.
//
// Usage: node bench/fidelity/qualify.mjs <dir> [--out result.json] [--seed n] [--resamples n]
// Exit 0 when every supported hold-out passes, 1 when one fails, 2 on a usage or data error.
// Run `npm run build` first: it imports from dist/.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { qualifyAll, detectorSensor, itemsHash, QUALIFY_BARS } from '../../dist/core/fidelity/qualify.js';
import { trainDetector, topWeights } from '../../dist/core/fidelity/stylometry.js';

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node bench/fidelity/qualify.mjs <dir> [--out result.json] [--seed n] [--resamples n]');
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = flag('--out');
const seed = Number(flag('--seed') ?? 1);
const resamples = Number(flag('--resamples') ?? 2000);
const dir = args[0];
if (!dir || args.length > 1) usage();

/** Split leading `key: value` lines (bare or in a --- block) from the text. Only topic and source are read. */
function parse(raw) {
  const lines = raw.replace(/^﻿/, '').split('\n');
  const meta = {};
  let i = 0;
  const fenced = lines[0]?.trim() === '---';
  if (fenced) i = 1;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (fenced && (t === '---' || t === '...')) { i++; break; }
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(t);
    if (!m) { if (fenced) continue; break; }
    meta[m[1].toLowerCase()] = m[2].trim();
  }
  return { meta, text: lines.slice(i).join('\n').trim() };
}

let entries;
try { entries = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort(); } catch (e) { usage(`cannot read ${dir}: ${e.message}`); }
if (!entries.includes('author')) usage(`${dir} has no author/ folder`);
const generators = entries.filter((d) => d !== 'author');
if (!generators.length) usage(`${dir} has no generator folder beside author/`);

const items = [];
for (const d of entries) {
  for (const f of readdirSync(join(dir, d)).filter((x) => x.endsWith('.md')).sort()) {
    const { meta, text } = parse(readFileSync(join(dir, d, f), 'utf8'));
    items.push({
      text,
      label: d === 'author' ? 'author' : 'model',
      source: meta.source || basename(f, '.md'),
      ...(meta.topic ? { topic: meta.topic } : {}),
      ...(d === 'author' ? {} : { generator: d }),
    });
  }
}
const nAuthor = items.filter((x) => x.label === 'author').length;
console.log(`${nAuthor} author pieces, ${items.length - nAuthor} imitations from ${generators.length} generator(s): ${generators.join(', ')}`);
if (nAuthor < 4 || items.length - nAuthor < 4) usage('need at least 4 author pieces and 4 imitations');

const result = qualifyAll(items, detectorSensor(), { seed, resamples });
const full = trainDetector(
  items.filter((x) => x.label === 'author').map((x) => ({ text: x.text, group: x.source })),
  items.filter((x) => x.label === 'model').map((x) => ({ text: x.text, group: x.source })),
);
const top = topWeights(full, 12);
const name = (f) => (f.startsWith('w:') ? f.slice(2) : `"${f.slice(2)}"`);

console.log(`\nBars: separation >= ${QUALIFY_BARS.minSeparation}, lower 95% bound >= ${QUALIFY_BARS.minCiLow}\n`);
for (const r of result.results) {
  const p = r.pooled;
  const line = p ? `AUC ${p.auc.toFixed(3)}  95% CI ${p.ci95[0].toFixed(3)} to ${p.ci95[1].toFixed(3)}  (${p.n.author} author, ${p.n.model} model)` : 'no scores';
  console.log(`${r.passes ? 'PASS' : 'FAIL'}  ${r.holdOut.padEnd(9)}  ${line}${r.unscored ? `  ${r.unscored} unscored` : ''}`);
  for (const f of r.folds) console.log(`        held out ${f.held}: ${f.auc === null ? 'one label only' : `AUC ${f.auc.toFixed(3)}`} (${f.n.author} author, ${f.n.model} model)`);
}
for (const s of result.skipped) console.log(`SKIP  ${s.holdOut.padEnd(9)}  ${s.why}`);
console.log(`\nDetector on all texts: cross-validated AUC ${full.cvAuc ?? 'n/a'}, version ${full.version}`);
console.log(`Imitations use more: ${top.model.map((x) => name(x.feature)).join(', ')}`);
console.log(`The author uses more: ${top.author.map((x) => name(x.feature)).join(', ')}`);
console.log(`\n${result.passes ? 'QUALIFIED: every supported hold-out passes.' : 'NOT QUALIFIED: the detector stays a monitor.'}`);

if (out) {
  const record = {
    measured: new Date().toISOString(),
    data: { dir: basename(dir), itemsHash: itemsHash(items), author: nAuthor, model: items.length - nAuthor, generators },
    seed, resamples, ...result,
    detector: { version: full.version, cvAuc: full.cvAuc, trainedOn: full.trainedOn, top },
  };
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`wrote ${out}`);
}
process.exit(result.passes ? 0 : 1);
