#!/usr/bin/env node
// THE STRUCTURE READER'S QUALIFICATION (studies/STRUCTURE_READER_PREREGISTRATION.md).
//
// The same protocol, corpus split and model drafts as the sensor study whose move reader failed
// (studies/SENSOR_QUALIFICATION_PREREGISTRATION.md, C2), so the two readers are compared on one footing. The author's
// pieces split before anything is read into INNER (selection reads), INNER HELD (selection's own held-back check)
// and OUTER (validation only); the model's plain drafts, one per title, into A (beside INNER) and B (beside OUTER).
// The drafts are the sensor study's own, from its cache: nothing new is written. Every text is read by the structure
// reader (core/structure/moves.ts), which reads twice and keeps the moves both reads agree on; 20 texts are read a
// second time, independently, for each feature's re-read reliability.
//
// A second, smaller population is read too and reported without a verdict: a technical author's posts (12 read,
// 5 held back, 3 reserved), the discovery drafts written beside them, and plain and pasted-examples drafts of the
// same author's briefs. Decides nothing itself beyond the sealed rule; every statistic comes from core.
//
// Usage (repository root, after npm run build; ANTHROPIC_API_KEY set):
//   node studies/harness/structure-qualification.mjs --corpus <dir> --titles <titles.json> --drafts <sensor cache.json>
//     --author2 <dir of 20 posts> --author2-split <split.json> --author2-drafts <contrast-drafts.json> --author2-rounds <dir> --out <dir> [--cap 6]

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';
import { selectFeatures, aucOf } from '../../dist/core/observers/selection.js';
import { readStructure, STRUCTURE_READER_VERSION } from '../../dist/core/structure/moves.js';
import { structureFeatures, structureSamples, STRUCTURE_FEATURES } from '../../dist/core/structure/features.js';
import { rankAgreement } from '../../dist/core/taste/moves.js';

const SEALED_READER = process.env.SEALED_READER ?? '';
const SEED = 'sensor-qualification-2026-09-29';
const REPLICATE_DISTANCE = 0.15;
const RELIABLE = 0.7;
const PASS_FEATURES = 3;

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const need = (n) => arg(n) ?? (console.error(`missing ${n}`), process.exit(2));
const CORPUS = need('--corpus'); const TITLES = JSON.parse(readFileSync(need('--titles'), 'utf8'));
const DRAFTS = JSON.parse(readFileSync(need('--drafts'), 'utf8')).drafts;
const OUT = need('--out'); const CAP = Number(arg('--cap', '6'));
if (STRUCTURE_READER_VERSION !== SEALED_READER) { console.error(`structure reader ${STRUCTURE_READER_VERSION}; sealed ${SEALED_READER || '(none given)'}. Re-register.`); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const rank = (s) => parseInt(createHash('sha256').update(`${SEED}|${s}`).digest('hex').slice(0, 12), 16);
const files = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort((a, b) => rank(a) - rank(b));
const pieces = files.map((f) => ({ f, title: TITLES[f] ?? f.replace(/\.md$/, ''), text: readFileSync(join(CORPUS, f), 'utf8') }));
const INNER = pieces.slice(0, 16); const INNER_HELD = pieces.slice(16, 24); const OUTER = pieces.slice(24, 40);
const drafts = pieces.map((p) => DRAFTS[p.title] ?? '');
const A = drafts.slice(0, 24).filter(Boolean); const B = drafts.slice(24, 40).filter(Boolean);

const budget = { spentUsd: 0, capUsd: CAP };
const reader = new AnthropicInferenceClient('claude-haiku-4-5', undefined, priceFor(ANTHROPIC_PRICING, 'claude-haiku-4-5'));
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const save = () => writeFileSync(CACHE, JSON.stringify(cache));
async function read(text, tag = '') {
  const k = createHash('sha256').update(`${STRUCTURE_READER_VERSION}|${tag}|${text}`).digest('hex');
  if (!(k in cache)) { cache[k] = await readStructure(reader, budget, text).catch((e) => { console.error(e.message.split('\n')[0]); return null; }); save(); }
  return cache[k];
}
const readAll = async (texts, tag = '') => { const out = []; for (const t of texts) out.push(await read(t, tag)); return out; };
const t = (xs) => xs.map((p) => p.text);
const ok = (xs) => xs.filter(Boolean);
const moves = (rs) => ok(rs).map((r) => r.moves);
const r3 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

// ── primary: the sensor study's newsletters ─────────────────────────────────────────────────────────
const rInner = await readAll(t(INNER)); const rHeld = await readAll(t(INNER_HELD)); const rOuter = await readAll(t(OUTER));
const rA = await readAll(A); const rB = await readAll(B);
const retest = [...t(INNER).slice(0, 10), ...A.slice(0, 10)];
const first = await readAll(retest); const second = await readAll(retest, 'retest');
const pairs = first.map((r, i) => [r, second[i]]).filter(([a, b]) => a && b);
const reliability = Object.fromEntries(STRUCTURE_FEATURES.map((f) => {
  const xs = pairs.map(([a, b]) => [structureFeatures(a.moves)[f.id], structureFeatures(b.moves)[f.id]]).filter(([a, b]) => a !== null && b !== null);
  return [f.id, rankAgreement(xs.map(([a]) => a), xs.map(([, b]) => b))];
}));
const sel = selectFeatures(structureSamples(moves(rInner), moves(rHeld), moves(rA)), 99);
const rows = sel.map((v) => {
  const outerVals = moves(rOuter).map((m) => structureFeatures(m)[v.id]).filter((x) => x !== null);
  const bVals = moves(rB).map((m) => structureFeatures(m)[v.id]).filter((x) => x !== null);
  const outerAuc = v.kept ? aucOf(outerVals, bVals) : null;
  const replicates = v.kept ? outerAuc !== null && v.auc !== null && Math.sign(outerAuc - 0.5) === Math.sign(v.auc - 0.5) && Math.abs(outerAuc - 0.5) >= REPLICATE_DISTANCE : null;
  return { id: v.id, kept: v.kept, role: v.role, auc: v.auc, outerAuc: r3(outerAuc), replicates, reliability: r3(reliability[v.id]), reliable: (reliability[v.id] ?? -1) >= RELIABLE };
});
const qualified = rows.filter((r) => r.kept && r.reliable && r.replicates);
const verdict = qualified.length >= PASS_FEATURES ? 'PASS' : 'FAIL';
const kappas = ok([...rInner, ...rHeld, ...rOuter, ...rA, ...rB]).map((r) => r.kappa).filter((k) => k !== null).sort((a, b) => a - b);

// ── secondary, no verdict: a technical author's posts ───────────────────────────────────────────────
let secondary = null;
if (arg('--author2')) {
  const dir = arg('--author2'); const split = JSON.parse(readFileSync(need('--author2-split'), 'utf8'));
  const txt = (names) => names.map((n) => readFileSync(join(dir, n), 'utf8'));
  const contrast = JSON.parse(readFileSync(need('--author2-drafts'), 'utf8')).drafts;
  const roundsDir = need('--author2-rounds'); const others = [];
  for (const r of ['round-6', 'round-7']) {
    const key = JSON.parse(readFileSync(join(roundsDir, r, 'KEY-open-after-judging.json'), 'utf8'));
    for (const [b, m] of Object.entries(key)) for (const [letter, arm] of Object.entries(m)) {
      if (arm === 'RAW' || arm === 'CONTEXT') { const f = join(roundsDir, r, b, `${letter}.md`); if (existsSync(f)) others.push(readFileSync(f, 'utf8')); }
    }
  }
  const s2Read = await readAll(txt(split.read)); const s2Held = await readAll(txt(split.held)); const s2Res = await readAll(txt(split.reserved));
  const s2A = await readAll(contrast); const s2B = await readAll(others);
  const sel2 = selectFeatures(structureSamples(moves(s2Read), moves(s2Held), moves(s2A)), 99);
  secondary = { sizes: { read: ok(s2Read).length, held: ok(s2Held).length, reserved: ok(s2Res).length, A: ok(s2A).length, B: ok(s2B).length },
    features: sel2.map((v) => {
      const unseen = moves([...s2Held, ...s2Res]).map((m) => structureFeatures(m)[v.id]).filter((x) => x !== null);
      const bVals = moves(s2B).map((m) => structureFeatures(m)[v.id]).filter((x) => x !== null);
      return { id: v.id, kept: v.kept, auc: v.auc, unseenVsOtherDraftsAuc: r3(aucOf(unseen, bVals)) };
    }) };
}

const result = { seed: SEED, reader: STRUCTURE_READER_VERSION, spentUsd: Math.round(budget.spentUsd * 100) / 100,
  sizes: { inner: ok(rInner).length, held: ok(rHeld).length, outer: ok(rOuter).length, A: ok(rA).length, B: ok(rB).length, retestPairs: pairs.length },
  kappa: { median: kappas[Math.floor(kappas.length / 2)] ?? null, p10: kappas[Math.floor(kappas.length * 0.1)] ?? null, n: kappas.length },
  verdict, qualified: qualified.map((r) => r.id), features: rows, secondary };
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 1));
console.log(`structure reader ${STRUCTURE_READER_VERSION}: ${verdict} (${qualified.length} feature(s) reliable, kept and replicating; ${PASS_FEATURES} needed)`);
console.log(`two-read kappa per text: median ${result.kappa.median}, 10th percentile ${result.kappa.p10} (n=${result.kappa.n})`);
for (const r of rows) console.log(`  ${r.kept ? (r.role ?? '').padEnd(6) : '      '} ${r.id.padEnd(18)} retest ${r.reliability}  inner AUC ${r.auc}  outer AUC ${r.outerAuc ?? '-'}${r.kept ? (r.replicates ? '  replicates' : '  DOES NOT') : ''}`);
if (secondary) { console.log('\nsecondary (no verdict):', JSON.stringify(secondary.sizes)); for (const f of secondary.features) console.log(`  ${f.kept ? 'kept' : '    '} ${f.id.padEnd(18)} AUC ${f.auc}  unseen vs other drafts ${f.unseenVsOtherDraftsAuc}`); }
console.log(`\n$${result.spentUsd}`);
