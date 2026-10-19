// bench/readings/run.mjs — A CONTEXT READING, EVALUATED AGAINST LABELLED CASES, SEVERAL TIMES EACH.
//
// A reading (core/inference/reading.ts) is a small model's answer, grounded by code. It is not deterministic, so
// one agreement proves little: every case is read `runs` times and the pass line is stated in the case file before
// anything runs. Reported per case: how many runs agreed with the label, who decided (code / model / floor), and
// the exact binomial interval on the agreement rate over all model-decided runs.
//
// Usage: node bench/readings/run.mjs <reading-id> [--runs N] [--model <id>] [--offline <base-url>] [--out <file>]
//   live:    needs ANTHROPIC_API_KEY; the context reader (claude-haiku-5-5) unless --model names another
//   offline: --offline http://127.0.0.1:<port> points at tests/fixtures/scripted-backend.mjs; proves the harness,
//            the code decisions and the floor, never the reader
// Cost: a 9-case × 5-run work-form eval is under $0.05 at Haiku 5.5 prices.
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readContext } from '../../dist/core/inference/reading.js';
import { WORK_FORM } from '../../dist/core/observers/work-form.js';
import { RULE_POLARITY } from '../../dist/core/observers/rule-polarity.js';
import { INTENT_MODE } from '../../dist/core/observers/intent-mode.js';
import { METHOD_UNITS } from '../../dist/core/method/decision-units.js';
import { EXECUTION_BRIEF } from '../../dist/core/loop/execution-brief.js';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { OpenAICompatibleInferenceClient } from '../../dist/providers/openai-compatible.js';


const strip = (t) => t.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const requestOf = (t) => (/^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(t)?.[1].match(/^request:\s*(.*)$/m) ?? [null, null])[1];
const pieces = (c) => {
  const files = c.folder ? readdirSync(resolve(c.folder)).filter((f) => /\.(md|txt)$/.test(f) && !/\.material/.test(f)).sort().map((f) => join(c.folder, f)) : (c.files ?? []);
  return files.filter((f) => existsSync(resolve(f)) && statSync(resolve(f)).isFile()).map((f) => { const t = readFileSync(resolve(f), 'utf8'); return { text: strip(t), request: requestOf(t) }; });
};
// Each reading: its definition, how a case becomes its input, and how its value is compared with the case's label.
const READINGS = {
  'work-form': { reading: WORK_FORM, input: (c) => ({ workType: c.workType, examples: pieces(c), method: c.method ? readFileSync(resolve(c.method), 'utf8') : null }), answer: (v) => v },
  'rule-polarity': { reading: RULE_POLARITY, input: (c) => ({ statements: [{ id: 'r1', text: c.statement }] }), answer: (v) => v.r1 ?? null },
  'intent-mode': { reading: INTENT_MODE, input: (c) => ({ intent: c.intent }), answer: (v) => v.mode },
  // one step per case: the label is `kind|conditional` or `kind|always`, the two fields the brief selects by
  // one conditional step per case against one request: the label is applies | set-aside | unresolved
  'execution-brief': { reading: EXECUTION_BRIEF, input: (c) => ({ request: c.request, material: c.material ? [{ name: 'notes', head: c.material }] : [], steps: [{ id: 's1', n: 1, statement: c.step, required: true, unit: { kind: 'instruction', decision: c.decision ?? null, inputs: [], condition: c.condition ?? null, output: null, exception: null, dependsOn: [], quote: c.step, by: 'model' } }] }), answer: (v) => (v.unsupported.some((u) => u.id === 's1') ? 'unsupported' : v.placed.s1?.applies ?? null) },
  'method-units': { reading: METHOD_UNITS, input: (c) => ({ steps: [{ id: '1', text: c.step, under: c.under ?? null }] }), answer: (v) => (v['1'] ? `${v['1'].kind}|${v['1'].condition ? 'conditional' : 'always'}` : null) },
};
const args = process.argv.slice(2);
const id = args[0]; const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const entry = READINGS[id]; const reading = entry?.reading; if (!reading) { console.error(`unknown reading ${id}; known: ${Object.keys(READINGS).join(', ')}`); process.exit(2); }
const spec = JSON.parse(readFileSync(resolve(`bench/readings/cases/${id}.json`), 'utf8'));
const runs = Number(opt('--runs', spec.pass.runs)); const offline = opt('--offline', null);
const model = opt('--model', offline ? 'scripted' : 'claude-haiku-5-5');
const client = offline ? new OpenAICompatibleInferenceClient({ modelId: model, baseUrl: offline, structuredOutput: 'FORCED_TOOL_CALL', pricing: { inputPerM: 0, outputPerM: 0 } }) : new AnthropicInferenceClient(model);
const budget = { spentUsd: 0, capUsd: 2, maxCalls: 10000 };

// exact Clopper-Pearson interval
const lg = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
const pmf = (k, n, p) => (p <= 0 ? (k === 0 ? 1 : 0) : p >= 1 ? (k === n ? 1 : 0) : Math.exp(lg(n) - lg(k) - lg(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p)));
const upper = (k, n, p) => { let s = 0; for (let i = k; i <= n; i++) s += pmf(i, n, p); return s; };
const bisect = (f, target) => { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
const ci = (x, n) => (n === 0 ? [0, 1] : [x === 0 ? 0 : bisect((p) => upper(x, n, p), 0.025), x === n ? 1 : bisect((p) => upper(x + 1, n, p), 0.975)]);

const rows = [];
for (const c of spec.cases) {
  const input = entry.input(c);
  const got = [];
  for (let r = 0; r < runs; r++) {
    const d = await readContext(reading, input, client, model, budget);
    got.push({ value: entry.answer(d.value), by: d.by, why: d.why ?? null });
    if (d.by === 'code') break; // deterministic: one run is every run
  }
  const agree = got.filter((g) => g.value === c.label).length;
  const by = got[0].by;
  const ok = by === 'code' ? (spec.pass.codeDecidedExact ? agree === got.length : true) : agree >= Math.min(spec.pass.perCaseAtLeast, got.length);
  rows.push({ id: c.id, label: c.label, examples: input.examples?.length ?? null, by, runs: got.length, agree, got: got.map((g) => g.value), floorWhy: got.find((g) => g.why)?.why ?? null, ok, soft: Boolean(c.soft) });
  process.stderr.write(`${c.id}: ${by} ${agree}/${got.length}${ok ? '' : ' FAIL'}${c.soft ? ' (soft)' : ''}\n`);
}
const modelRuns = rows.filter((r) => r.by === 'model');
const x = modelRuns.reduce((n, r) => n + r.agree, 0); const n = modelRuns.reduce((n, r) => n + r.runs, 0);
const hardFails = rows.filter((r) => !r.ok && !r.soft);
const summary = { reading: `${reading.id}-${reading.version}`, model, runs, spentUsd: +budget.spentUsd.toFixed(4),
  decidedBy: { code: rows.filter((r) => r.by === 'code').length, model: modelRuns.length, floor: rows.filter((r) => r.by === 'floor').length },
  modelAgreement: { x, n, rate: n ? +(x / n).toFixed(3) : null, ci95: ci(x, n).map((v) => +v.toFixed(3)) },
  pass: hardFails.length === 0, hardFails: hardFails.map((r) => r.id), softFails: rows.filter((r) => !r.ok && r.soft).map((r) => r.id), rows };
const out = opt('--out', null); if (out) writeFileSync(out, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.pass ? 0 : 1);
