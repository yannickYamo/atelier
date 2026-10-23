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
import { PERSONA_MOVES, PERSONA_TABLE } from '../../dist/core/compiler/moves.js';
import { posterior, situationEffect } from '../../dist/core/stats/habit.js';
import { MOVE_CASES } from '../../dist/core/loop/move-cases.js';
import { METHOD_INFER } from '../../dist/core/method/infer.js';
import { STEP_CHECK, stepCheckInput, heldByPolarity } from '../../dist/core/method/step-check.js';
import { outlineOf } from '../../dist/core/method/standard.js';
import { countWords } from '../../dist/core/eval/size.js';
import { MOVE_READER } from '../../dist/core/taste/move-reader.js';
import { QUESTIONS } from '../../dist/core/loop/questions.js';
import { PIECE_PLAN } from '../../dist/core/loop/piece-plan.js';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { OpenAICompatibleInferenceClient } from '../../dist/providers/openai-compatible.js';


const strip = (t) => t.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const requestOf = (t) => (/^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(t)?.[1].match(/^request:\s*(.*)$/m) ?? [null, null])[1];
const pieces = (c) => {
  const files = c.folder ? readdirSync(resolve(c.folder)).filter((f) => /\.(md|txt)$/.test(f) && !/\.material/.test(f)).sort().map((f) => join(c.folder, f)) : (c.files ?? []);
  return files.filter((f) => existsSync(resolve(f)) && statSync(resolve(f)).isFile()).map((f) => { const t = readFileSync(resolve(f), 'utf8'); return { text: strip(t), request: requestOf(t) }; });
};
// A move unit for a reading's input, with its rate and kind from counts the case gives or the defaults of a situational move
// seen in 2 of 6 pieces, both in its situation: never a word for how often.
// pieces from files on disk (front matter stripped), named piece-1.. in sorted order: the public corpus a case reads against
const byNumber = (names) => [...names].sort((x, y) => Number(x.replace(/\D/g, '')) - Number(y.replace(/\D/g, '')));
const piecesFrom = (c) => (c.files ? c.files.map((f, i) => ({ name: `piece-${i + 1}`, text: strip(readFileSync(resolve(f), 'utf8')).trim() })) : c.pieces);
const unitOf = ({ aspect, realisation, trigger, forbidden = null, quote = null, k = 2, n = 6, inSit = 2, sitN = 2 }) => {
  const rate = posterior(k, n); const situation = trigger ? situationEffect(inSit, sitN - inSit, k - inSit, n - sitN - (k - inSit)) : null;
  return { id: 'm1', aspect, observed: realisation, readAs: trigger ? 'SOMETIMES' : 'ALWAYS', trigger: { text: trigger ?? null, status: trigger ? 'supported' : 'none' }, realisation, forbidden,
    evidence: quote ? [{ piece: 'piece-1', quote, situationQuote: null }] : [], situationOnly: [], judged: [], rate, situation, kind: situation?.explains ? 'situational' : rate.pMajority > 0.5 ? 'standing' : 'occasional',
    pieces: k, corpus: n, scope: 'sentence', link: null, check: null, checkMeans: null, modality: 'passage', measured: [], measureAgrees: null, by: 'model', tabled: true };
};
// Each reading: its definition, how a case becomes its input, and how its value is compared with the case's label.
const READINGS = {
  'work-form': { reading: WORK_FORM, input: (c) => ({ workType: c.workType, examples: pieces(c), method: c.method ? readFileSync(resolve(c.method), 'utf8') : null }), answer: (v) => v },
  'rule-polarity': { reading: RULE_POLARITY, input: (c) => ({ statements: [{ id: 'r1', text: c.statement }] }), answer: (v) => v.r1 ?? null },
  'intent-mode': { reading: INTENT_MODE, input: (c) => ({ intent: c.intent }), answer: (v) => v.mode },
  // one step per case: the label is `kind|conditional` or `kind|always`, the two fields the brief selects by
  // one conditional step per case against one request: the label is applies | set-aside | unresolved
  'execution-brief': { reading: EXECUTION_BRIEF, input: (c) => ({ request: c.request, material: c.material ? [{ name: 'notes', head: c.material }] : [], steps: [{ id: 's1', n: 1, statement: c.step, required: true, unit: { kind: 'instruction', decision: c.decision ?? null, inputs: [], condition: c.condition ?? null, output: null, exception: null, dependsOn: [], quote: c.step, by: 'model' } }] }), answer: (v) => (v.unsupported.some((u) => u.id === 's1') ? 'unsupported' : v.placed.s1?.applies ?? null) },
  // one persona point per case against the pieces it quotes: the label is `trigger status|pieces evidenced`, both decided by code from what the reading grounds; the scope is recorded beside each run as `aside`, not judged
  'persona-moves': { reading: PERSONA_MOVES, input: (c) => ({ points: [c.point], pieces: piecesFrom(c), steps: [] }), answer: (v) => `${v[0].trigger.status}|${new Set(v[0].evidence.map((e) => e.piece)).size}`, aside: (v) => `${v[0].scope}|${v[0].modality}|${v[0].check ?? '-'}:${v[0].checkMeans ?? '-'}`,
    // what a counted feature means, judged where the case says (`label2`): present | absent | quotes (no feature, or one only near the habit)
    answer2: (v) => v[0].checkMeans ?? 'quotes' },
  // one of the author's conditional moves against one request: the label is placed | set-aside | unresolved
  'move-cases': { reading: MOVE_CASES, input: (c) => ({ request: c.request, material: c.material ? [{ name: 'notes', head: c.material }] : [], moves: [unitOf({ aspect: c.move.aspect, realisation: c.move.realisation, trigger: c.move.trigger })] }),
    answer: (v) => (v.m1 ? (v.m1.applies === 'applies' ? 'placed' : v.m1.applies) : null) },
  // one move against one delivered piece: the label is the outcome
  'move-realisation': { reading: MOVE_READER, input: (c) => ({ text: c.text, request: c.request, moves: [unitOf({ aspect: c.move.aspect, realisation: c.move.realisation, trigger: c.move.trigger ?? null, forbidden: c.move.forbidden ?? null, quote: c.move.quote ?? null })] }), answer: (v) => v.m1?.outcome ?? null },
  // one habit against the pieces the first reading left: the label is `moves|situations`, each the pieces that should yield a quote, sorted and joined by +, or none
  'persona-table': { reading: PERSONA_TABLE, input: (c) => ({ habits: [{ n: 1, aspect: c.habit.aspect, description: c.habit.description, quote: c.habit.quote, situation: c.habit.situation ?? null, modality: c.habit.modality ?? 'passage' }], pieces: piecesFrom(c), cells: (c.ask ?? piecesFrom(c).map((p) => p.name)).map((piece) => ({ habit: 1, piece })) }),
    answer: (v) => `${byNumber(v.filter((x) => x.move || x.shows === true).map((x) => x.piece)).join('+') || 'none'}|${byNumber(v.filter((x) => x.situation).map((x) => x.piece)).join('+') || 'none'}` },
  // the method the pieces follow, read off them: the label is the headings the steps' quotes fall under, in order, lowercased and joined by >, or none
  'method-infer': { reading: METHOD_INFER, input: (c) => ({ purpose: c.purpose ?? null, pieces: piecesFrom(c) }),
    answer: (v) => { const ps = new Map(); const out = []; for (const st of v) { const text = (ps.get(st.piece) ?? (() => { const t = piecesFrom(spec.cases.find((x) => x.id === current.id)).find((p) => p.name === st.piece)?.text ?? ''; ps.set(st.piece, t); return t; })()); const at = text.indexOf(st.quote); const before = at >= 0 ? text.slice(0, at) : ''; const h = [...before.matchAll(/^#{1,6}\s+(.+)$/gm)].at(-1)?.[1] ?? (/^#{1,6}\s+(.+)$/m.exec(st.quote)?.[1] ?? null); const hh = (h ?? '(no heading)').replace(/\*/g, '').trim().toLowerCase(); if (!out.includes(hh)) out.push(hh); } return out.join('>') || 'none'; } },
  // one step per case against the file's one example: the label is measure:<OBSERVER> | written | judgement
  'step-check': { reading: STEP_CHECK, input: (c) => stepCheckInput([{ id: '1', text: c.step, under: c.under ?? null }], [{ id: 'e1', task: spec.example.task ?? null, material: spec.example.material ? [{ name: 'notes', text: spec.example.material }] : [], reference: spec.example.reference }], outlineOf, countWords),
    // held against the rule-polarity reading as the build holds it: a prohibition keeps no check that requires what it forbids
    after: async (v, c, input) => { const k = await readContext(RULE_POLARITY, { statements: [{ id: 'r1', text: c.step }] }, client, model, budget); return { '1': heldByPolarity(v['1'], input.steps[0], k.value.r1) }; },
    answer: (v) => (v['1'] ? (v['1'].how === 'measure' ? `measure:${v['1'].measurement.observer}` : v['1'].how) : null) },
  // the questions asked before a draft: the label is the asked ids in their fixed order joined by +, or none
  'questions': { reading: QUESTIONS, input: (c) => ({ request: c.request, material: c.material ? [{ name: 'notes', head: c.material }] : [], method: c.method ?? [], examples: c.examples ?? [], told: c.told ?? [] }),
    answer: (v) => v.questions.map((q) => q.id).join('+') || 'none' },
  // the plan before a draft: none (the floor), missed (a note the case says it must use is not a point's source), excluded (a note the request rules out is), or plan
  'piece-plan': { reading: PIECE_PLAN, input: (c) => ({ request: c.request, answers: c.answers ?? [], method: c.method ?? [], examples: c.examples ?? [], material: c.material ? [{ name: 'notes', text: c.material }] : [], ...(c.change ? { change: c.change } : {}) }),
    answer: (v) => { const c = current; if (!v) return 'none'; const from = v.points.map((p) => p.from).join('\n'); return c.must && !from.includes(c.must) ? 'missed' : c.mustNot && from.includes(c.mustNot) ? 'excluded' : 'plan'; } },
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
let current = null;
for (const c of spec.cases) {
  current = c;
  const input = entry.input(c);
  const got = [];
  for (let r = 0; r < runs; r++) {
    const read = await readContext(reading, input, client, model, budget);
    const d = entry.after && read.by !== 'floor' ? { ...read, value: await entry.after(read.value, c, input) } : read;
    got.push({ value: entry.answer(d.value), value2: entry.answer2 && c.label2 !== undefined ? entry.answer2(d.value) : undefined, by: d.by, why: d.why ?? null, aside: entry.aside ? entry.aside(d.value) : undefined });
    if (d.by === 'code') break; // deterministic: one run is every run
  }
  // a run agrees when its answer matches the label, and its second answer the second label where the case has one
  const agree = got.filter((g) => (c.label === null || g.value === c.label) && (c.label2 === undefined || g.value2 === c.label2)).length;
  const by = got[0].by;
  const ok = by === 'code' ? (spec.pass.codeDecidedExact ? agree === got.length : true) : agree >= Math.min(spec.pass.perCaseAtLeast, got.length);
  rows.push({ id: c.id, label: c.label, label2: c.label2, got2: c.label2 !== undefined ? got.map((g) => g.value2) : undefined, examples: input.examples?.length ?? null, by, runs: got.length, agree, got: got.map((g) => g.value), floorWhy: got.find((g) => g.why)?.why ?? null, aside: entry.aside ? got.map((g) => g.aside) : undefined, asideExpected: entry.aside ? c.aside ?? null : undefined, ok, soft: Boolean(c.soft) });
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
