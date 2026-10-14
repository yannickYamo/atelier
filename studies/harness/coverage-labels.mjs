// studies/harness/coverage-labels.mjs — HOW OFTEN DOES ATELIER SAY A CHECK READS A WHOLE RULE WHEN IT READS PART?
//
// A rule shown with a tick is a claim that a check read all of it. The dangerous mistake is a false FULL: the
// product says FULL where a careful reader says the check covers only part of the rule (or none of it).
//
//   node studies/harness/coverage-labels.mjs compile <dir>   every step of every <name>.note.md in <dir>, compiled
//        against <name>.example.md with the product's own reader. Writes items.json (what a labeller sees: the step,
//        and what its check reads, never the product's answer) and predictions.json (the product's answer).
//   node studies/harness/coverage-labels.mjs score <dir>     reads labels.json ([{ id, label, unread }]) beside
//        them and prints the table: agreement, and false FULL with an exact one-sided 95% upper bound.
//
// The labels are made without sight of predictions.json. No model is called by this script.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { methodProposals } from '../../dist/core/method/standard.js';
import { observesOf, propositionOf } from '../../dist/core/eval/observes.js';

const [mode, dir] = process.argv.slice(2);
if (!mode || !dir) { console.error('usage: coverage-labels.mjs compile|score <dir>'); process.exit(2); }

/** The body of an example: its front matter is the task, never the work. */
const split = (text) => { const m = /^---\n([\s\S]*?)\n---\n/.exec(text); return { task: m ? (/^request:\s*(.+)$/m.exec(m[1])?.[1] ?? '') : '', reference: m ? text.slice(m[0].length) : text }; };

if (mode === 'compile') {
  const items = []; const predictions = []; const unread = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.note.md')).sort()) {
    const domain = f.replace('.note.md', '');
    const { task, reference } = split(readFileSync(join(dir, `${domain}.example.md`), 'utf8'));
    const stated = methodProposals(readFileSync(join(dir, f), 'utf8'), { task, material: [], reference }).filter((p) => p.origin === 'STATED');
    stated.forEach((p, i) => {
      const id = `${domain}-${String(i + 1).padStart(2, '0')}`;
      if (!p.measurement) { unread.push({ id, domain, statement: p.statement }); return; }
      const o = observesOf(p.statement, p.measurement, false);
      items.push({ id, domain, rule: p.statement, checkReads: propositionOf(p.measurement), observer: p.measurement.observer, params: p.measurement.params });
      predictions.push({ id, coverage: o?.coverage ?? 'NONE', unchecked: o?.unchecked ?? null });
    });
  }
  writeFileSync(join(dir, 'items.json'), `${JSON.stringify(items, null, 1)}\n`);
  writeFileSync(join(dir, 'predictions.json'), `${JSON.stringify(predictions, null, 1)}\n`);
  writeFileSync(join(dir, 'no-check.json'), `${JSON.stringify(unread, null, 1)}\n`);
  console.log(`${items.length} steps compiled to a check; ${unread.length} left as the owner's to judge (no check).`);
}

/** Exact (Clopper-Pearson) one-sided 95% upper bound on a proportion, by bisection on the binomial tail. */
function upper95(x, n) {
  if (n === 0) return 1; if (x === n) return 1;
  const tail = (p) => { let s = 0; let c = 1; for (let k = 0; k <= x; k += 1) { if (k) c = c * (n - k + 1) / k; s += c * p ** k * (1 - p) ** (n - k); } return s; };
  let lo = x / n; let hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (tail(mid) > 0.05) lo = mid; else hi = mid; }
  return hi;
}

if (mode === 'score') {
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const items = read('items.json'); const pred = new Map(read('predictions.json').map((p) => [p.id, p])); const labels = new Map(read('labels.json').map((l) => [l.id, l]));
  const KINDS = ['FULL', 'PARTIAL', 'NONE'];
  const table = Object.fromEntries(KINDS.map((p) => [p, Object.fromEntries(KINDS.map((l) => [l, 0]))]));
  const parted = [];
  for (const it of items) {
    const p = pred.get(it.id); const l = labels.get(it.id);
    if (!l) { console.error(`no label for ${it.id}`); process.exit(1); }
    table[p.coverage][l.label] += 1;
    if (p.coverage !== l.label) parted.push({ id: it.id, product: p.coverage, label: l.label, rule: it.rule, checkReads: it.checkReads, unread: l.unread ?? null });
  }
  const n = items.length; const agree = KINDS.reduce((s, k) => s + table[k][k], 0);
  const saidFull = KINDS.reduce((s, k) => s + table.FULL[k], 0); const falseFull = saidFull - table.FULL.FULL;
  const labelFull = KINDS.reduce((s, k) => s + table[k].FULL, 0);
  console.log(`${n} rule-and-check pairs. Rows: what the product said. Columns: the label.`);
  console.log(`            ${KINDS.map((k) => k.padStart(8)).join('')}`);
  for (const p of KINDS) console.log(`  ${p.padEnd(10)}${KINDS.map((l) => String(table[p][l]).padStart(8)).join('')}`);
  console.log(`agreement        ${agree} of ${n}`);
  console.log(`false FULL       ${falseFull} of ${saidFull} the product called FULL (one-sided 95% upper bound ${(upper95(falseFull, saidFull) * 100).toFixed(1)}%)`);
  console.log(`missed FULL      ${labelFull - table.FULL.FULL} of ${labelFull} the label called FULL (a tick withheld: safe, and a cost to the owner's reading)`);
  writeFileSync(join(dir, 'parted.json'), `${JSON.stringify(parted, null, 1)}\n`);
  console.log(`${parted.length} disagreements written to parted.json`);
}
