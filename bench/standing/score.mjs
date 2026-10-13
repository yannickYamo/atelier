#!/usr/bin/env node
// bench/standing/score.mjs — every arm's outputs against the domain's own checklist. No model, no Atelier code:
// the checker is the domain's check.mjs, written before any output existed.
//
//   node bench/standing/score.mjs --domain explainer --out <dir> [--json]
//
// Beside the failures it reports what the gates read: what Atelier's runtime cut, and whether the runtime did
// worse than its own exported skill used as a plain prompt.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const flag = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const { check } = await import(join(HERE, 'domains', flag('--domain'), 'check.mjs'));
const out = resolve(flag('--out')); const arms = {};
for (const f of readdirSync(out).filter((x) => /-\d+\.json$/.test(x))) { const j = JSON.parse(readFileSync(join(out, f), 'utf8')); (arms[j.arm] ??= []).push(j); }
const rows = Object.entries(arms).map(([arm, rs]) => {
  const got = rs.filter((r) => r.output); const checked = got.map((r) => check(r.output, r));
  const byRule = {};
  for (const c of checked) for (const f of c.fails) { const k = f.split(' ')[0]; byRule[k] = (byRule[k] ?? 0) + 1; }
  // An arm that returned nothing (a refusal by the model, an error) wrote no work to hold to the standard: said
  // apart and left out of the failing share, never scored as a failure of the standard.
  return { arm, outputs: got.length, empty: rs.length - got.length, failing: checked.filter((c) => c.fails.length).length, byRule,
    // what a domain's checker reports beside its failures (code review: the defect cited within two lines)
    near: checked.some((c) => 'near' in c) ? checked.filter((c) => c.near).length : null,
    cuts: got.reduce((a, r) => a + (r.cut ?? []).length, 0), usdPerOutput: got.some((r) => r.costUsd) ? got.reduce((a, r) => a + (r.costUsd ?? 0), 0) / got.length : null,
    // What a piece of work that passes costs: an arm that writes failures cheaply is not cheap.
    usdPerConforming: got.some((r) => r.costUsd) && checked.some((c) => !c.fails.length) ? got.reduce((a, r) => a + (r.costUsd ?? 0), 0) / checked.filter((c) => !c.fails.length).length : null,
    secondsPerOutput: got.reduce((a, r) => a + r.seconds, 0) / (got.length || 1) };
});
const rate = (a) => { const r = rows.find((x) => x.arm === a); return r && r.outputs ? r.failing / r.outputs : null; };
// An arm labelled invoke-<x> is the runtime of the skill whose export is export-<x>.
const gates = {};
for (const r of rows.filter((x) => x.arm.startsWith('invoke'))) {
  const twin = r.arm.replace(/^invoke/, 'export');
  gates[`${r.arm} cut nothing`] = r.cuts === 0;
  gates[`${r.arm} fails no more often than ${twin}`] = rate(twin) === null ? null : rate(r.arm) <= rate(twin);
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ rows, gates }, null, 1));
else {
  for (const r of rows) console.log(`${r.arm.padEnd(15)} ${String(r.failing).padStart(3)} of ${String(r.outputs).padEnd(3)} failing  ${Object.entries(r.byRule).map(([k, n]) => `${k}:${n}`).join(' ').padEnd(28)} cuts ${r.cuts}  ${r.near === null ? '' : `near ${r.near}  `}${r.usdPerOutput === null ? '' : `$${r.usdPerOutput.toFixed(3)}/output  `}${r.usdPerConforming === null ? '' : `$${r.usdPerConforming.toFixed(3)}/passing  `}${r.secondsPerOutput.toFixed(0)} s/output${r.empty ? `  (${r.empty} returned nothing: not scored)` : ''}`);
  for (const [name, ok] of Object.entries(gates)) console.log(`${ok === null ? 'not run' : ok ? 'PASS   ' : 'FAIL   '} ${name}`);
}
