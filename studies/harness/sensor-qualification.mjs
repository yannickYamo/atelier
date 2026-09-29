#!/usr/bin/env node
// THE TASTE SENSORS' QUALIFICATION (studies/SENSOR_QUALIFICATION_PREREGISTRATION.md).
//
// Selection (core/observers/selection.ts) keeps the counted features that separate an author from the
// model on the pieces discovery reads. Does what it keeps hold on pieces and drafts it never saw? And is
// the move reader (core/taste/moves.ts) reliable enough, and separating enough, to wire in?
//
// One corpus, split before anything is generated: the author's pieces into INNER (selection reads), INNER
// HELD (selection's own held-back check) and OUTER (validation only); the model's plain drafts, one per
// piece title, into A (beside INNER) and B (beside OUTER). Selection runs exactly as discovery runs it,
// then every kept feature is re-measured on OUTER against B. Decides nothing itself beyond the sealed
// rule; every statistic comes from core.
//
// Usage (repository root, after npm run build; ANTHROPIC_API_KEY set):
//   node studies/harness/sensor-qualification.mjs --corpus <dir> --titles <titles.json> --out <dir> [--cap 10]

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';
import { spend } from '../../dist/core/inference/client.js';
import { FEATURES } from '../../dist/core/observers/features.js';
import { judgeCountedFeatures, selectFeatures, aucOf } from '../../dist/core/observers/selection.js';
import { readMoves, moveSamples, moveFeatures, referenceOf, rankAgreement, MOVE_FEATURES, MOVE_READER_VERSION } from '../../dist/core/taste/moves.js';

const SEALED_MOVE_READER = 'b1356e48';
const SEED = 'sensor-qualification-2026-09-29';
const REPLICATE_DISTANCE = 0.15;
const RELIABLE = 0.7;

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const CORPUS = arg('--corpus') ?? (console.error('missing --corpus'), process.exit(2));
const TITLES = JSON.parse(readFileSync(arg('--titles') ?? (console.error('missing --titles'), process.exit(2)), 'utf8'));
const OUT = arg('--out') ?? (console.error('missing --out'), process.exit(2));
const CAP = Number(arg('--cap', '10'));
if (MOVE_READER_VERSION !== SEALED_MOVE_READER) { console.error(`move reader ${MOVE_READER_VERSION}; sealed ${SEALED_MOVE_READER}. Re-register.`); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const rank = (s) => parseInt(createHash('sha256').update(`${SEED}|${s}`).digest('hex').slice(0, 12), 16);
const files = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort((a, b) => rank(a) - rank(b));
const pieces = files.map((f) => ({ f, title: TITLES[f] ?? f.replace(/\.md$/, ''), text: readFileSync(join(CORPUS, f), 'utf8') }));
const INNER = pieces.slice(0, 16); const INNER_HELD = pieces.slice(16, 24); const OUTER = pieces.slice(24, 40);

const budget = { spentUsd: 0, capUsd: CAP };
const writer = new AnthropicInferenceClient('claude-opus-5', undefined, priceFor(ANTHROPIC_PRICING, 'claude-opus-5'));
const reader = new AnthropicInferenceClient('claude-haiku-4-5', undefined, priceFor(ANTHROPIC_PRICING, 'claude-haiku-4-5'));
const CACHE = join(OUT, 'cache.json');
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : { drafts: {}, moves: {} };
const save = () => writeFileSync(CACHE, JSON.stringify(cache));

// The model's plain draft on a title: the prompt discovery's contrast pass uses (cli/commands/discover.ts).
async function draftOn(title) {
  if (cache.drafts[title]) return cache.drafts[title];
  const r = await spend(budget, 0.1, async () => {
    const x = await writer.complete({ stableBlock: 'You are a writer. Write the piece you are asked for.', variableBlock: '',
      userMessage: `Write a blog post titled "${title}". About 900 words. Output only the piece.`,
      toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
      schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens: 4000 });
    return { value: x, cost: x.cost };
  });
  const p = r.json?.piece; cache.drafts[title] = typeof p === 'string' ? p : ''; save();
  return cache.drafts[title];
}
async function movesOf(text, tag = '') {
  const k = createHash('sha256').update(`${tag}|${text}`).digest('hex');
  if (!(k in cache.moves)) { cache.moves[k] = await readMoves(reader, budget, text).catch((e) => { console.error(e.message.split('\n')[0]); return null; }); save(); }
  return cache.moves[k];
}

const drafts = [];
for (const p of pieces) drafts.push(await draftOn(p.title));
const A = drafts.slice(0, 24).filter(Boolean); const B = drafts.slice(24, 40).filter(Boolean);
const t = (xs) => xs.map((p) => p.text);
console.log(`pieces: inner ${INNER.length}, inner held ${INNER_HELD.length}, outer ${OUTER.length}; drafts A ${A.length}, B ${B.length}; $${budget.spentUsd.toFixed(2)}`);

// ── counted features: selection as discovery runs it, then validation on OUTER vs B ───────────────────
const counted = judgeCountedFeatures(t(INNER), t(INNER_HELD), A, 99);
const replicate = (v, outerVals, bVals) => {
  const auc = aucOf(outerVals.filter((x) => x !== null), bVals.filter((x) => x !== null));
  const ok = auc !== null && v.auc !== null && Math.sign(auc - 0.5) === Math.sign(v.auc - 0.5) && Math.abs(auc - 0.5) >= REPLICATE_DISTANCE;
  return { outerAuc: auc, replicates: ok };
};
const countedRows = counted.map((v) => {
  const f = FEATURES.find((x) => x.id === v.id);
  const outerVals = t(OUTER).map((x) => f.measure(x)); const bVals = B.map((x) => f.measure(x));
  const rep = v.kept ? replicate(v, outerVals, bVals) : { outerAuc: null, replicates: null };
  const inBand = (x) => v.band && x !== null && x >= v.band[0] && x <= v.band[1];
  const band = v.kept && v.role === 'RULE' ? { outerIn: outerVals.filter(inBand).length / outerVals.filter((x) => x !== null).length,
    bOut: bVals.filter((x) => x !== null && !inBand(x)).length / bVals.filter((x) => x !== null).length } : null;
  return { ...v, ...rep, band_check: band };
});
const kept = countedRows.filter((r) => r.kept);
const c1 = kept.length < 3 ? 'INCONCLUSIVE' : kept.filter((r) => r.replicates).length / kept.length >= 0.7 ? 'PASS' : 'FAIL';

// ── the move reader: reliability, then the same selection and validation ─────────────────────────────
const readAll = async (texts, tag = '') => { const out = []; for (const x of texts) out.push(await movesOf(x, tag)); return out; };
const mInner = await readAll(t(INNER)); const mHeld = await readAll(t(INNER_HELD)); const mOuter = await readAll(t(OUTER));
const mA = await readAll(A); const mB = await readAll(B);
const retestTexts = [...t(INNER).slice(0, 10), ...A.slice(0, 10)];
const first = await readAll(retestTexts); const second = await readAll(retestTexts, 'retest');
const ok = (xs) => xs.filter(Boolean);
const refInner = referenceOf(ok(mInner));
const pairs = first.map((r, i) => [r, second[i]]).filter(([a, b]) => a && b);
const reliability = Object.fromEntries(MOVE_FEATURES.map((f) => [f.id,
  rankAgreement(pairs.map(([a]) => moveFeatures(a, refInner)[f.id]), pairs.map(([, b]) => moveFeatures(b, refInner)[f.id]))]));
const moveSel = selectFeatures(moveSamples(ok(mInner), ok(mHeld), ok(mA)), 99);
const moveRows = moveSel.map((v) => {
  const outerVals = ok(mOuter).map((r) => moveFeatures(r, refInner)[v.id]); const bVals = ok(mB).map((r) => moveFeatures(r, refInner)[v.id]);
  const rep = v.kept ? replicate(v, outerVals, bVals) : { outerAuc: null, replicates: null };
  return { ...v, ...rep, reliability: reliability[v.id], reliable: (reliability[v.id] ?? -1) >= RELIABLE };
});
const moveQualified = moveRows.filter((r) => r.kept && r.reliable && r.replicates);
const c2 = moveQualified.length >= 2 ? 'PASS' : 'FAIL';

const result = { seed: SEED, moveReader: MOVE_READER_VERSION, spentUsd: Math.round(budget.spentUsd * 100) / 100,
  sizes: { inner: INNER.length, innerHeld: INNER_HELD.length, outer: OUTER.length, draftsA: A.length, draftsB: B.length,
    readings: { inner: ok(mInner).length, held: ok(mHeld).length, outer: ok(mOuter).length, A: ok(mA).length, B: ok(mB).length, retestPairs: pairs.length } },
  countedVerdict: c1, moveReaderVerdict: c2, counted: countedRows, moves: moveRows, reliability };
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 1));
console.log(`\ncounted features: ${c1} (${kept.filter((r) => r.replicates).length} of ${kept.length} kept replicate)`);
for (const r of kept) console.log(`  ${(r.role ?? '').padEnd(6)} ${r.id.padEnd(20)} inner AUC ${r.auc}  outer AUC ${r.outerAuc}  ${r.replicates ? 'replicates' : 'DOES NOT'}${r.band_check ? `  band: outer in ${r.band_check.outerIn.toFixed(2)}, B out ${r.band_check.bOut.toFixed(2)}` : ''}`);
console.log(`\nmove reader: ${c2} (${moveQualified.length} feature(s) reliable, kept and replicating)`);
for (const r of moveRows) console.log(`  ${r.kept ? (r.role ?? '').padEnd(6) : '      '} ${r.id.padEnd(22)} retest ${r.reliability}  inner AUC ${r.auc}  outer AUC ${r.outerAuc ?? '-'}`);
console.log(`\n$${result.spentUsd}`);
