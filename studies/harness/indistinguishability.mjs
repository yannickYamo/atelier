#!/usr/bin/env node
// THE INDISTINGUISHABILITY STUDY (studies/INDISTINGUISHABILITY_PREREGISTRATION.md).
//
// Can a run of outputs be told apart from the author's own unseen pieces, by an instrument no arm steers on? Per
// corpus, one brief per held-out author piece (its title), written by five arms:
//
//   plain     the writing model alone, with discovery's plain-draft framing
//   pasted    the same model with four of the author's read pieces in the prompt
//   atelier   atelier invoke, the skill's default release
//   plan      atelier invoke --structure plan
//   steered   atelier invoke --structure plan --select sample --until-author 0.5 --shape-rounds 1
//
// Primary: the classifier two-sample test (core/fidelity/twosample.ts) of each arm's outputs against the held-out
// author pieces, on the evaluation-only family (core/fidelity/evaluation.ts: character 4-grams and word bigrams,
// vocabulary fixed from the read pieces). Integrity: invented claims delivered, read by the claim reader, counted the
// same way for every arm. Every output and every failure is cached with what it cost, so a stopped run resumes without
// paying twice. Decides nothing beyond the sealed rule; every statistic comes from core.
//
// Usage (repository root, after npm run build; ANTHROPIC_API_KEY set):
//   node studies/harness/indistinguishability.mjs --plan <plan.json> --out <dir> [--cap <usd>] [--dry-run]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';
import { spend } from '../../dist/core/inference/client.js';
import { evaluationVocabulary, evaluationVector, standardisedVectors } from '../../dist/core/fidelity/evaluation.js';
import { c2st, vendiAtEqualSize } from '../../dist/core/fidelity/twosample.js';
import { FUNCTION_WORDS } from '../../dist/core/observers/style.js';
import { wordsOf } from '../../dist/core/observers/text.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const fail = (m) => { console.error(m); process.exit(2); };
const PLAN = JSON.parse(readFileSync(arg('--plan') ?? fail('missing --plan'), 'utf8'));
const OUT = arg('--out') ?? fail('missing --out');
const CAP = Number(arg('--cap', '60'));
const DRY = process.argv.includes('--dry-run');
const CLI = join(process.cwd(), 'dist/cli/atelier.mjs');
const WRITER = 'claude-opus-5';
const ARMS = ['plain', 'pasted', 'atelier', 'plan', 'steered'];
const BASELINES = ['plain', 'pasted', 'atelier']; const CANDIDATES = ['plan', 'steered'];
const FLAGS = { atelier: [], plan: ['--structure', 'plan'], steered: ['--structure', 'plan', '--select', 'sample', '--until-author', '0.5', '--shape-rounds', '1'] };
/** The most one Atelier run may spend (its --cap), and the most a direct call may: what the cap check reserves. */
const RUN_CAP = 4; const DIRECT_CAP = 0.6; const VERIFY_COST = 0.02;
mkdirSync(OUT, { recursive: true });

// ── inputs, checked before anything is spent ────────────────────────────────────────────────────────
/** The title: the file's first line when it is a level-one heading, else the file name. Never a heading inside a fence. */
const titleOf = (text, file) => { const first = text.replace(/^﻿/, '').split('\n').find((l) => l.trim()) ?? ''; return (/^#\s+(.+)$/.exec(first.trim())?.[1] ?? basename(file).replace(/\.md$/, '').replace(/-/g, ' ')).trim(); };
for (const c of PLAN.corpora) {
  const overlap = c.read.filter((f) => c.heldOut.includes(f));
  if (overlap.length) fail(`${c.name}: read and held-out pieces overlap: ${overlap.join(', ')}`);
  const titles = c.heldOut.map((f) => titleOf(readFileSync(f, 'utf8'), f));
  if (new Set(titles).size !== titles.length) fail(`${c.name}: two held-out pieces share a title; each brief must be its own.`);
  // NO HELD-OUT PIECE IN WHAT THE PLAN ARMS SAMPLE FROM: the structure the skill reads must come from read pieces only.
  const structureDir = join(c.data, 'skills', c.skill, 'fidelity', 'structure');
  if (existsSync(structureDir)) {
    const held = new Set(c.heldOut.map((f) => basename(f)));
    for (const f of (await import('node:fs')).readdirSync(structureDir)) {
      const s = JSON.parse(readFileSync(join(structureDir, f), 'utf8'));
      const leaked = s.pieces.map((p) => basename(String(p.id))).filter((id) => held.has(id) || held.has(`${id}.md`));
      if (leaked.length) fail(`${c.name}: the stored structure was read from held-out pieces: ${leaked.join(', ')}`);
    }
  }
  if (DRY) { console.log(`${c.name}: ${c.read.length} read, ${c.heldOut.length} held out`); titles.forEach((t) => console.log(`  ${t}`)); }
}
if (DRY) process.exit(0);

const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 1));
const spent = () => Object.values(cache).reduce((a, o) => a + (o.costUsd ?? 0), 0);
const budget = { spentUsd: 0, capUsd: CAP };
const writer = new AnthropicInferenceClient(WRITER, undefined, priceFor(ANTHROPIC_PRICING, WRITER));
const request = (title, words) => `Write a blog post titled "${title}". About ${words} words.`;

async function direct(prompt, examples) {
  return spend(budget, DIRECT_CAP, async () => {
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

/** Invented claims in a text, read as the Atelier arms' own check reads them: the gating line only, with the request as material. */
function inventedIn(c, text, prompt) {
  const v = cli(c, ['verify', '--skill', c.skill, '--json', '--task', prompt], text);
  try {
    const j = JSON.parse(v.out);
    const line = (j.checked ?? []).find((x) => x.requirementId === 'UNSOURCED');
    // A reader that could not run is not a clean text.
    if ((j.checked ?? []).some((x) => x.requirementId === 'UNSOURCED·unread')) return null;
    return line ? (line.result?.verdict === 'VIOLATED' ? (line.result?.spans?.length ?? 0) : 0) : null;
  } catch { return null; }
}

async function generate(c, arm, title, examples) {
  const key = createHash('sha256').update(`${c.name}|${arm}|${title}`).digest('hex').slice(0, 16);
  if (cache[key]) return cache[key];
  const reserve = arm === 'plain' || arm === 'pasted' ? DIRECT_CAP + VERIFY_COST : RUN_CAP;
  if (spent() + reserve > CAP) { console.error(`the cap of $${CAP} would be passed ($${spent().toFixed(2)} spent, $${reserve} reserved for ${c.name}/${arm}); stopping.`); process.exit(3); }
  const prompt = request(title, c.briefWords);
  let o;
  if (arm === 'plain' || arm === 'pasted') {
    const d = await direct(prompt, arm === 'pasted' ? examples : []);
    o = { ...d, costUsd: d.costUsd + VERIFY_COST, invented: inventedIn(c, d.output, prompt) };
  } else {
    const r = cli(c, ['invoke', '--skill', c.skill, prompt, '--json', '--cap', String(RUN_CAP), ...FLAGS[arm]]);
    let j = null; try { j = JSON.parse(r.out); } catch { /* a failed run */ }
    if (!j) {
      // A FAILED RUN IS RECORDED AT ITS CAP and never retried: what it spent is not known, and a resume must not pay twice.
      cache[key] = { corpus: c.name, arm, title, failed: (r.err ?? '').split('\n').filter(Boolean).slice(-2).join(' '), costUsd: RUN_CAP }; save();
      console.error(`${c.name}/${arm}/${title}: run failed, recorded at $${RUN_CAP}`);
      return cache[key];
    }
    const claims = j.eval?.gates?.claims;
    const planned = arm === 'atelier' ? true : Boolean(j.eval?.fidelity?.structure);
    o = { output: j.output, costUsd: j.costUsd ?? 0, invented: claims?.state === 'checked' ? claims.delivered : null,
      conformant: j.eval?.result?.conformant ?? null, typicality: j.eval?.fidelity?.typicality?.p ?? null, invocationId: j.invocationId,
      // A PLAN ARM WITHOUT A PLAN is the atelier arm under another name: recorded as failed, never counted for the plan.
      ...(planned ? {} : { failed: 'no skeleton was written: the plan arm ran without a plan' }) };
  }
  cache[key] = { corpus: c.name, arm, title, ...o }; save();
  console.log(`${c.name} ${arm.padEnd(8)} $${(o.costUsd ?? 0).toFixed(3)}  total $${spent().toFixed(2)}  ${title.slice(0, 50)}${o.failed ? '  FAILED' : ''}`);
  return cache[key];
}

// ── generation, then the evaluation ───────────────────────────────────────────────────────────────
const FUNCTION = new Set(FUNCTION_WORDS.map((w) => w.toLowerCase()));
const contentOnly = (v) => ({ ...v, bigrams: v.bigrams.filter((b) => b.split(' ').some((w) => !FUNCTION.has(w))),
  chars: v.chars.filter((g) => !wordsOf(g).some((w) => FUNCTION.has(w))) });
const result = { writer: WRITER, cap: CAP, corpora: [] };
for (const c of PLAN.corpora) {
  const read = c.read.map((f) => readFileSync(f, 'utf8'));
  const held = c.heldOut.map((f) => ({ f, text: readFileSync(f, 'utf8'), title: titleOf(readFileSync(f, 'utf8'), f) }));
  const examples = read.slice(0, 4);
  const outputs = Object.fromEntries(ARMS.map((a) => [a, []]));
  for (const h of held) for (const arm of ARMS) { const o = await generate(c, arm, h.title, examples); if (o?.output && !o.failed) outputs[arm].push(o); }
  const vocab = evaluationVocabulary(read);
  const readV = read.map((t) => evaluationVector(t, vocab));
  const reading = (v, rv, arm) => {
    const { others } = standardisedVectors(rv, [...held.map((h) => evaluationVector(h.text, v)), ...outputs[arm].map((o) => evaluationVector(o.output, v))]);
    const author = others.slice(0, held.length); const arms = others.slice(held.length);
    return { c2st: c2st(author, arms, { seed: 1 }), vendi: vendiAtEqualSize(author, arms) };
  };
  const vContent = contentOnly(vocab); const readVContent = read.map((t) => evaluationVector(t, vContent));
  const rows = {};
  for (const arm of ARMS) {
    const inv = outputs[arm].map((o) => o.invented).filter((x) => x !== null && x !== undefined);
    const ps = outputs[arm].map((o) => o.typicality).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    rows[arm] = { n: outputs[arm].length, failed: held.length - outputs[arm].length, ...reading(vocab, readV, arm),
      withoutFunctionWords: reading(vContent, readVContent, arm).c2st,
      inventedDelivered: inv.reduce((a, b) => a + b, 0), inventedKnownFor: inv.length,
      typicalityMedian: ps.length ? ps[Math.floor(ps.length / 2)] : null, conformant: outputs[arm].filter((o) => o.conformant === true).length };
  }
  // THE RULE, AS SEALED. An AUC below 0.5 is clamped to 0.5 before the difference: landing below chance by chance is not
  // a better result. A missing reading for any arm invalidates the corpus.
  const auc = (a) => (rows[a].c2st ? Math.max(0.5, rows[a].c2st.auc) : null);
  const valid = ARMS.every((a) => auc(a) !== null);
  const base = valid ? Math.min(...BASELINES.map(auc)) : null;
  const winner = valid ? CANDIDATES.reduce((x, y) => (auc(y) < auc(x) ? y : x)) : null;
  const w = winner ? rows[winner] : null;
  const clean = Boolean(w && w.inventedDelivered === 0 && w.inventedKnownFor === w.n && w.n === held.length);
  result.corpora.push({ name: c.name, heldOut: held.length, vocabulary: { chars: vocab.chars.length, bigrams: vocab.bigrams.length },
    arms: rows, valid, winner, winnerBeatsBaselinesBy: valid ? Math.round((base - auc(winner)) * 1000) / 1000 : null, winnerClean: clean });
}
const machinePass = result.corpora.every((c) => c.valid && c.winnerBeatsBaselinesBy >= 0.10 && c.winnerClean);
result.verdict = { machine: machinePass ? 'PASS' : 'FAIL', invalidCorpora: result.corpora.filter((c) => !c.valid).map((c) => c.name),
  human: 'PENDING: the blind pairwise read (packets in human/)' };
result.spentUsd = Math.round(spent() * 100) / 100;
result.note = 'AUC intervals are approximate: at 8 to 12 texts a side they cover 0.5 about 82–85% of the time under no difference.';
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 1));

// ── the human packets: one per arm-rotation, each author piece once per reader ──────────────────────
// A LATIN SQUARE. Reader r sees, for brief i, arm (i + r) mod 5: every author piece once, every arm about equally.
// Both sides are cleaned the same way (front matter and the title line removed) and cut to the same length at a
// paragraph boundary, so neither length nor markup gives the author away. Pair order and sides are seeded.
const clean = (t) => t.replace(/^﻿/, '').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\s*#\s+.+\n/, '').trim();
const cut = (t, words) => { const ps = t.split(/\n\s*\n/); const out = []; let n = 0; for (const p of ps) { if (n >= words) break; out.push(p); n += p.split(/\s+/).length; } return out.join('\n\n'); };
mkdirSync(join(OUT, 'human'), { recursive: true });
const keys = {};
for (let r = 0; r < ARMS.length; r++) {
  const pairs = [];
  for (const c of PLAN.corpora) {
    c.heldOut.forEach((f, i) => {
      const text = readFileSync(f, 'utf8'); const title = titleOf(text, f); const arm = ARMS[(i + r) % ARMS.length];
      const o = cache[createHash('sha256').update(`${c.name}|${arm}|${title}`).digest('hex').slice(0, 16)];
      if (!o?.output || o.failed) return;
      const out = clean(o.output); const words = out.split(/\s+/).length;
      pairs.push({ corpus: c.name, arm, title, author: cut(clean(text), words), output: out });
    });
  }
  pairs.sort((a, b) => createHash('sha256').update(`order|${r}|${a.title}`).digest('hex').localeCompare(createHash('sha256').update(`order|${r}|${b.title}`).digest('hex')));
  let page = `# Which one did the author write? (reader ${r + 1})\n\nFor each pair, mark A or B. Read both in full. Do not open the key before you finish.\n`;
  keys[r + 1] = {};
  pairs.forEach((p, k) => {
    const authorFirst = parseInt(createHash('sha256').update(`side|${r}|${p.title}`).digest('hex').slice(0, 2), 16) % 2 === 0;
    keys[r + 1][k + 1] = { corpus: p.corpus, arm: p.arm, title: p.title, author: authorFirst ? 'A' : 'B' };
    page += `\n---\n\n## Pair ${k + 1}: "${p.title}"\n\n### A\n\n${authorFirst ? p.author : p.output}\n\n### B\n\n${authorFirst ? p.output : p.author}\n`;
  });
  writeFileSync(join(OUT, 'human', `reader-${r + 1}.md`), page);
}
writeFileSync(join(OUT, 'human', 'KEY-open-after-reading.json'), JSON.stringify(keys, null, 1));

for (const c of result.corpora) {
  console.log(`\n${c.name}: ${c.heldOut} held-out author pieces${c.valid ? '' : ' (INVALID: an arm has too few outputs to test)'}`);
  for (const a of ARMS) { const r = c.arms[a]; console.log(`  ${a.padEnd(8)} n=${r.n}${r.failed ? ` (${r.failed} failed)` : ''}  told apart AUC ${r.c2st?.auc ?? '-'} [${r.c2st?.ci95 ?? '-'}]  without function words ${r.withoutFunctionWords?.auc ?? '-'}  invented ${r.inventedDelivered} (known for ${r.inventedKnownFor})  typical ${r.typicalityMedian ?? '-'}  conformant ${r.conformant}`); }
  console.log(`  winner ${c.winner}: beats the baselines by ${c.winnerBeatsBaselinesBy} AUC (pass needs 0.10); clean: ${c.winnerClean}`);
}
console.log(`\nmachine verdict: ${result.verdict.machine}; human read: pending. $${result.spentUsd}`);
