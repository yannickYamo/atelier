#!/usr/bin/env node
// THE INDISTINGUISHABILITY STUDY (studies/INDISTINGUISHABILITY_PREREGISTRATION.md).
//
// Can a run of outputs be told apart from the author's own unseen pieces, by an instrument no arm steers on? Per
// corpus, one brief per held-out author piece (its title), written by five arms:
//
//   plain     the writing model alone, with discovery's plain-draft prompt
//   pasted    the same model with four of the author's pieces in the prompt
//   atelier   atelier invoke, the skill's default release
//   plan      atelier invoke --structure plan
//   steered   atelier invoke --structure plan --select sample --until-author 0.5 --shape-rounds 1
//
// Primary: the classifier two-sample test (core/fidelity/twosample.ts) of each arm's outputs against the held-out
// author pieces, on the evaluation-only family (core/fidelity/evaluation.ts: character 4-grams and word bigrams,
// vocabulary fixed from the skill's read pieces). Integrity: invented claims delivered, by the claim reader. Every
// output is cached, so a stopped run resumes without paying twice. Decides nothing beyond the sealed rule; every
// statistic comes from core.
//
// Usage (repository root, after npm run build; ANTHROPIC_API_KEY set):
//   node studies/harness/indistinguishability.mjs --plan <plan.json> --out <dir> [--cap 60]
//   plan.json: { corpora: [{ name, data, project, skill, read: [files], heldOut: [files], briefWords }] }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';
import { spend } from '../../dist/core/inference/client.js';
import { evaluationVocabulary, evaluationVector, standardisedVectors } from '../../dist/core/fidelity/evaluation.js';
import { c2st, vendiAtEqualSize } from '../../dist/core/fidelity/twosample.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const PLAN = JSON.parse(readFileSync(arg('--plan') ?? (console.error('missing --plan'), process.exit(2)), 'utf8'));
const OUT = arg('--out') ?? (console.error('missing --out'), process.exit(2));
const CAP = Number(arg('--cap', '60'));
const CLI = join(process.cwd(), 'dist/cli/atelier.mjs');
const WRITER = 'claude-opus-5';
const ARMS = ['plain', 'pasted', 'atelier', 'plan', 'steered'];
const FLAGS = { atelier: [], plan: ['--structure', 'plan'], steered: ['--structure', 'plan', '--select', 'sample', '--until-author', '0.5', '--shape-rounds', '1'] };
mkdirSync(OUT, { recursive: true });

const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const spent = () => Object.values(cache).reduce((a, o) => a + (o.costUsd ?? 0), 0);
const budget = { spentUsd: 0, capUsd: CAP };
const writer = new AnthropicInferenceClient(WRITER, undefined, priceFor(ANTHROPIC_PRICING, WRITER));
const titleOf = (text, file) => (/^#\s+(.+)$/m.exec(text)?.[1] ?? basename(file).replace(/\.md$/, '').replace(/-/g, ' ')).trim();
const request = (title, words) => `Write a blog post titled "${title}". About ${words} words.`;

async function direct(prompt, examples) {
  return spend(budget, 0.4, async () => {
    const x = await writer.complete({
      stableBlock: examples.length ? `You are a writer. Here are pieces by the author whose style to write in:\n\n${examples.map((e, i) => `--- piece ${i + 1} ---\n${e}`).join('\n\n')}` : 'You are a writer. Write the piece you are asked for.',
      variableBlock: '', userMessage: `${prompt}${examples.length ? ' Write it in the style of the pieces above.' : ''} Output only the piece.`,
      toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
      schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens: 6000 });
    return { value: { output: String(x.json?.piece ?? ''), costUsd: x.costUsd ?? 0 }, cost: x.cost };
  });
}

function cli(c, args, input = null) {
  const env = { ...process.env, ATELIER_DATA: c.data, ATELIER_PROJECT_DIR: c.project };
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: c.project, env, input: input ?? undefined, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }) };
  } catch (e) { return { code: e.status ?? -1, out: `${e.stdout ?? ''}`, err: `${e.stderr ?? ''}` }; }
}

async function generate(c, arm, title, examples) {
  const key = createHash('sha256').update(`${c.name}|${arm}|${title}`).digest('hex').slice(0, 16);
  if (cache[key]) return cache[key];
  if (spent() > CAP) { console.error(`cap $${CAP} reached at $${spent().toFixed(2)}; stopping before ${c.name}/${arm}/${title}`); process.exit(3); }
  const prompt = request(title, c.briefWords);
  let o;
  if (arm === 'plain' || arm === 'pasted') {
    o = await direct(prompt, arm === 'pasted' ? examples : []);
    // INTEGRITY, by the same claim reader the Atelier arms run, on the text as written.
    const v = cli(c, ['verify', '--skill', c.skill, '--json'], o.output);
    let flagged = null;
    try { const j = JSON.parse(v.out); flagged = (j.checked ?? []).filter((x) => String(x.requirementId).startsWith('UNSOURCED') && x.result?.verdict === 'VIOLATED').reduce((n, x) => n + (x.result?.spans?.length ?? 0), 0); } catch { /* recorded as unknown */ }
    o = { ...o, invented: flagged };
  } else {
    const r = cli(c, ['invoke', '--skill', c.skill, prompt, '--json', '--cap', '4', ...FLAGS[arm]]);
    let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* failed run */ }
    if (!j) { console.error(`${c.name}/${arm}/${title}: run failed: ${(r.err ?? '').split('\n').slice(-3).join(' ')}`); return null; }
    o = { output: j.output, costUsd: j.costUsd ?? 0, invented: j.eval?.gates?.claims?.delivered ?? null, unconfirmed: j.eval?.gates?.claims?.unconfirmed ?? null,
      conformant: j.eval?.result?.conformant ?? null, typicality: j.eval?.fidelity?.typicality?.p ?? null, invocationId: j.invocationId };
  }
  cache[key] = { corpus: c.name, arm, title, ...o }; save();
  console.log(`${c.name} ${arm.padEnd(8)} $${(o.costUsd ?? 0).toFixed(3)}  total $${spent().toFixed(2)}  ${title.slice(0, 50)}`);
  return cache[key];
}

const result = { writer: WRITER, cap: CAP, corpora: [] };
for (const c of PLAN.corpora) {
  const read = c.read.map((f) => readFileSync(f, 'utf8'));
  const held = c.heldOut.map((f) => ({ f, text: readFileSync(f, 'utf8') }));
  const examples = read.slice(0, 4);
  const outputs = Object.fromEntries(ARMS.map((a) => [a, []]));
  for (const h of held) for (const arm of ARMS) { const o = await generate(c, arm, titleOf(h.text, h.f), examples); if (o?.output) outputs[arm].push(o); }
  // THE EVALUATION FAMILY: vocabulary from the read pieces only; standardised by them; held-out pieces against each arm.
  const vocab = evaluationVocabulary(read);
  const readV = read.map((t) => evaluationVector(t, vocab));
  const rows = {};
  for (const arm of ARMS) {
    const { others } = standardisedVectors(readV, [...held.map((h) => evaluationVector(h.text, vocab)), ...outputs[arm].map((o) => evaluationVector(o.output, vocab))]);
    const author = others.slice(0, held.length); const arms = others.slice(held.length);
    const auc = c2st(author, arms, { seed: 1 });
    const inv = outputs[arm].map((o) => o.invented).filter((x) => x !== null && x !== undefined);
    rows[arm] = { n: outputs[arm].length, c2st: auc, vendi: vendiAtEqualSize(author, arms),
      inventedDelivered: inv.reduce((a, b) => a + b, 0), inventedKnownFor: inv.length,
      typicalityMedian: (() => { const ps = outputs[arm].map((o) => o.typicality).filter((x) => typeof x === 'number').sort((a, b) => a - b); return ps.length ? ps[Math.floor(ps.length / 2)] : null; })(),
      conformant: outputs[arm].filter((o) => o.conformant === true).length };
  }
  const base = Math.min(...['plain', 'pasted', 'atelier'].map((a) => rows[a].c2st?.auc ?? 1));
  const best = Math.min(...['plan', 'steered'].map((a) => rows[a].c2st?.auc ?? 1));
  result.corpora.push({ name: c.name, heldOut: held.length, vocabulary: { chars: vocab.chars.length, bigrams: vocab.bigrams.length }, arms: rows,
    planBeatsBaselinesBy: Math.round((base - best) * 1000) / 1000 });
}
const integrityHeld = result.corpora.every((c) => ['plan', 'steered'].some((a) => c.arms[a].inventedDelivered === 0 && c.arms[a].inventedKnownFor === c.arms[a].n));
const machinePass = result.corpora.every((c) => c.planBeatsBaselinesBy >= 0.10) && integrityHeld;
result.verdict = { machine: machinePass ? 'PASS' : 'FAIL', integrityHeld, human: 'PENDING: the blind pairwise read (packet in human/)' };
result.spentUsd = Math.round(spent() * 100) / 100;
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 1));

// THE HUMAN PACKET: for each brief and arm, the author's piece and the output, order by a seeded coin, key sealed apart.
mkdirSync(join(OUT, 'human'), { recursive: true });
const key = {}; let page = '# Which one did the author write?\n\nFor each pair, mark A or B. Read both in full. The key is in a separate file: do not open it before you finish.\n';
let n = 0;
for (const c of PLAN.corpora) {
  for (const h of c.heldOut) {
    const text = readFileSync(h, 'utf8'); const title = titleOf(text, h);
    for (const arm of ARMS) {
      const k = createHash('sha256').update(`${c.name}|${arm}|${title}`).digest('hex').slice(0, 16);
      const o = cache[k]; if (!o?.output) continue;
      n += 1; const authorFirst = parseInt(createHash('sha256').update(`coin|${n}`).digest('hex').slice(0, 2), 16) % 2 === 0;
      key[n] = { corpus: c.name, arm, title, author: authorFirst ? 'A' : 'B' };
      page += `\n---\n\n## Pair ${n}: "${title}"\n\n### A\n\n${authorFirst ? text : o.output}\n\n### B\n\n${authorFirst ? o.output : text}\n`;
    }
  }
}
writeFileSync(join(OUT, 'human', 'pairs.md'), page);
writeFileSync(join(OUT, 'human', 'KEY-open-after-reading.json'), JSON.stringify(key, null, 1));

for (const c of result.corpora) {
  console.log(`\n${c.name}: ${c.heldOut} held-out author pieces`);
  for (const a of ARMS) { const r = c.arms[a]; console.log(`  ${a.padEnd(8)} n=${r.n}  told apart AUC ${r.c2st?.auc ?? '-'} [${r.c2st?.ci95 ?? '-'}]  invented delivered ${r.inventedDelivered} (known for ${r.inventedKnownFor})  typical median ${r.typicalityMedian ?? '-'}  conformant ${r.conformant}`); }
  console.log(`  plan arms beat the baselines by ${c.planBeatsBaselinesBy} AUC (pass needs 0.10)`);
}
console.log(`\nmachine verdict: ${result.verdict.machine}; human read: pending. $${result.spentUsd}`);
