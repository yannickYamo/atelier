#!/usr/bin/env node
// THE CLAIM READER'S QUALIFICATION BATTERY (studies/CLAIM_READER_QUALIFICATION_PREREGISTRATION.md for v1,
// studies/CLAIM_READER_V2_QUALIFICATION_PREREGISTRATION.md for v2: the sealed version and seed below are v2's).
//
// A discovered rule becomes a qualified sensor before it becomes a hard gate. UNSOURCED is a hard gate,
// and its reader had never been measured. This builds the battery and scores it, nothing else:
//
//   clean drafts    an excerpt of a real piece, rewritten by a writer model that must keep every fact.
//                   The whole piece is the person's material, so every specific in the draft traces to
//                   it. A flag on a clean draft is a false positive: a true story cut.
//   planted drafts  the same clean draft with ONE invented sentence inserted, of a known kind, whose
//                   specifics are in neither the draft nor the material. Catching it is a true positive.
//
// The reader (the product's own modelSensor, from dist/) and the pattern check read both. The decision
// rules are the pre-registration's, computed here on the TEST pieces only; DEV pieces smoke-test the
// harness and are reported apart. Nothing here tunes the reader: its prompt version is checked against
// the one sealed in the pre-registration, and a mismatch stops the run.
//
// Usage (from the repository root, after npm run build; ANTHROPIC_API_KEY set):
//   node studies/harness/claim-qualification.mjs --corpus <dir> [--corpus <dir>]... --out <dir>
//        [--cap 12] [--writer claude-opus-5] [--reader claude-haiku-4-5] [--only dev|test]

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';
import { spend } from '../../dist/core/inference/client.js';
import { modelSensor, patternSensor, READER_VERSION } from '../../dist/core/loop/claim-extract.js';
import { wordsOf } from '../../dist/core/observers/text.js';
import { clopperPearson } from '../../dist/core/stats/sign-test.js';

const SEALED_READER_VERSION = '0279163b';
const SEED = 'claim-reader-v2-2026-09-29';
const DEV_PIECES = 5;
const EXCERPTS_PER_PIECE = 2;
const EXCERPT_WORDS = 350;
const KINDS = ['FIGURE', 'DATED_EVENT', 'NAMED_QUOTE', 'ANONYMOUS_QUOTE', 'ATTRIBUTED_STAT', 'LINKED_FIGURE', 'FIRST_PERSON_EVENT', 'SECOND_HAND_EVENT'];
const KIND_ASK = {
  FIGURE: 'a sentence stating a specific measured quantity (a count, a duration, a percentage or a change from one number to another) about the subject',
  DATED_EVENT: 'a sentence describing something that happened on a particular date or in a particular month and year',
  NAMED_QUOTE: 'a sentence quoting a named, real-sounding person (first and last name) in quotation marks',
  ANONYMOUS_QUOTE: 'a sentence quoting an unnamed person described only by role ("a staff engineer told me, ...")',
  ATTRIBUTED_STAT: 'a sentence attributing a statistic to a named organisation, survey or report ("According to ...")',
  LINKED_FIGURE: 'a sentence stating a figure followed by a markdown link to a source URL',
  FIRST_PERSON_EVENT: 'a sentence in which the author (I or we) recounts something they did or saw, as lived experience',
  SECOND_HAND_EVENT: 'a sentence recounting what happened at a team or company the author says they know or worked with',
};

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const args = (n) => process.argv.flatMap((a, i) => (a === n ? [process.argv[i + 1]] : []));
const CORPORA = args('--corpus');
const OUT = arg('--out') ?? (console.error('missing --out'), process.exit(2));
const CAP = Number(arg('--cap', '12'));
const WRITER = arg('--writer', 'claude-opus-5');
const READER = arg('--reader', 'claude-haiku-4-5');
const ONLY = arg('--only');
if (!CORPORA.length) { console.error('missing --corpus'); process.exit(2); }
if (READER_VERSION !== SEALED_READER_VERSION) {
  console.error(`the reader's prompt version is ${READER_VERSION}; the pre-registration sealed ${SEALED_READER_VERSION}. A changed reader is a different instrument: re-register.`);
  process.exit(2);
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const rank = (s) => parseInt(sha(`${SEED}|${s}`).slice(0, 12), 16);
const numbersIn = (s) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[.,]$/, '').replace(/,/g, ''));

// ── the pieces, split before anything is generated ───────────────────────────────────────────────
const pieces = CORPORA.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  .map((f) => ({ id: `${basename(dir.replace(/\/$/, ''))}/${f}`, text: readFileSync(join(dir, f), 'utf8') })));
const ordered = [...pieces].sort((a, b) => rank(a.id) - rank(b.id));
const dev = new Set(ordered.slice(0, DEV_PIECES).map((p) => p.id));

/** Excerpts: whole paragraphs from a seeded start, until EXCERPT_WORDS; two per piece that fits, apart. */
function excerptsOf(p) {
  const paras = p.text.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !/^#/.test(x) && wordsOf(x).length >= 8);
  const out = [];
  const starts = [...paras.keys()].sort((a, b) => rank(`${p.id}|${a}`) - rank(`${p.id}|${b}`));
  const used = new Set();
  for (const s of starts) {
    if (out.length >= EXCERPTS_PER_PIECE) break;
    const take = []; let n = 0;
    for (let i = s; i < paras.length && n < EXCERPT_WORDS; i++) { if (used.has(i)) break; take.push(i); n += wordsOf(paras[i]).length; }
    if (n < EXCERPT_WORDS * 0.6) continue;
    take.forEach((i) => used.add(i));
    out.push(take.map((i) => paras[i]).join('\n\n'));
  }
  return out;
}

// ── generation ──────────────────────────────────────────────────────────────────────────────────
const budget = { spentUsd: 0, capUsd: CAP };
const writer = new AnthropicInferenceClient(WRITER, undefined, priceFor(ANTHROPIC_PRICING, WRITER));
const reader = new AnthropicInferenceClient(READER, undefined, priceFor(ANTHROPIC_PRICING, READER));
const call = (sys, user, schema, name) => spend(budget, 0.05, async () => {
  const x = await writer.complete({ stableBlock: sys, variableBlock: '', userMessage: user, toolName: name, toolDescription: 'Return the result.', schema, maxTokens: 6000 });
  return { value: x.json, cost: x.cost };
});

const PARAPHRASE_SYS = 'You rewrite a passage as a fresh draft in your own words, as if drafting a post from notes. Keep EVERY fact exactly: every figure, date, name, quotation, link and story stays, with the same meaning. Do not add any fact, figure, date, name, quotation, link or story that is not in the passage. Change the wording and sentence order freely.';
const PLANT_SYS = 'You are building a test for a fact-checking tool. You insert exactly ONE new sentence into a draft, at a natural position, and change nothing else. The new sentence must state something specific that appears neither in the draft nor in the notes: it is an invention, and it must read naturally in the draft\'s voice.';

async function paraphrase(excerpt) {
  for (let t = 0; t < 3; t++) {
    const r = await call(PARAPHRASE_SYS, `PASSAGE:\n${excerpt}`, { type: 'object', additionalProperties: false, required: ['draft'], properties: { draft: { type: 'string' } } }, 'emit_draft');
    const d = r?.draft ?? '';
    const known = new Set(numbersIn(excerpt));
    if (d && numbersIn(d).every((n) => known.has(n))) return d;
  }
  return null;
}

async function plant(draft, material, kind) {
  for (let t = 0; t < 3; t++) {
    const r = await call(PLANT_SYS, `NOTES (the author's material):\n${material}\n\nDRAFT:\n${draft}\n\nInsert ${KIND_ASK[kind]}. Return the whole new draft, and the inserted sentence exactly as it appears in it.`,
      { type: 'object', additionalProperties: false, required: ['draft', 'inserted'], properties: { draft: { type: 'string' }, inserted: { type: 'string' } } }, 'emit_planted');
    const d = r?.draft ?? ''; const s = (r?.inserted ?? '').trim();
    if (!d || !s || !d.includes(s) || draft.includes(s)) continue;
    const newNums = numbersIn(s).filter((n) => !numbersIn(material).includes(n));
    if (['FIGURE', 'ATTRIBUTED_STAT', 'LINKED_FIGURE', 'DATED_EVENT'].includes(kind) && !newNums.length) continue;
    if (kind === 'LINKED_FIGURE' && !/\]\(https?:\/\//.test(s)) continue;
    if (kind.endsWith('QUOTE') && !/["“”]/.test(s)) continue;
    return { draft: d, inserted: s };
  }
  return null;
}

// ── scoring ─────────────────────────────────────────────────────────────────────────────────────
const TASK = 'Write a post based on my notes.';
async function read(text, material) {
  const m = modelSensor(reader, budget, READER, { material, task: TASK, placeholders: false });
  await m.read(text);
  const r = m.reading(text);
  const p = patternSensor(material, false).reading(text);
  return { reader: { claims: r.claims.map((c) => c.text), publicFacts: r.publicFacts.map((f) => f.text), instrument: r.instrument, notes: m.notes, specifics: r.specifics ?? [] }, pattern: { claims: p.claims.map((c) => c.text) } };
}
const hits = (claims, sentence) => claims.some((c) => c.includes(sentence.slice(0, Math.min(40, sentence.length))) || sentence.includes(c.slice(0, 40)));

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const rows = [];
let k = 0;
for (const p of ordered) {
  const set = dev.has(p.id) ? 'dev' : 'test';
  if (ONLY && ONLY !== set) continue;
  for (const [i, ex] of excerptsOf(p).entries()) {
    const kind = KINDS[k++ % KINDS.length];
    const row = { piece: p.id, set, excerpt: i, kind };
    try {
      const clean = await paraphrase(ex);
      if (!clean) { rows.push({ ...row, skipped: 'no faithful paraphrase in 3 tries' }); continue; }
      const planted = await plant(clean, p.text, kind);
      const onClean = await read(clean, p.text);
      const onEmpty = await read(clean, '');
      const onPlanted = planted ? await read(planted.draft, p.text) : null;
      rows.push({ ...row, clean, planted, onClean, onEmpty, onPlanted,
        readerFlaggedClean: onClean.reader.claims.length > 0, patternFlaggedClean: onClean.pattern.claims.length > 0,
        readerCaught: planted ? hits(onPlanted.reader.claims, planted.inserted) : null,
        patternCaught: planted ? hits(onPlanted.pattern.claims, planted.inserted) : null,
        readerFailed: onClean.reader.notes.length > 0 || (onPlanted?.reader.notes.length ?? 0) > 0 });
      console.log(`${set} ${p.id}#${i} ${kind}: clean ${rows.at(-1).readerFlaggedClean ? 'FLAGGED' : 'ok'} | planted ${planted ? (rows.at(-1).readerCaught ? 'caught' : 'MISSED') : 'n/a'}  ($${budget.spentUsd.toFixed(2)})`);
    } catch (e) {
      rows.push({ ...row, error: e.message.split('\n')[0] });
      console.log(`${set} ${p.id}#${i}: ${e.message.split('\n')[0]}`);
      if (/budget/i.test(e.message)) break;
    }
  }
}

// Exact 95% intervals from the product's own owner of the rule (core/stats/sign-test.ts).
const ci = (s, n) => { if (n === 0) return [null, null]; const { lo, hi } = clopperPearson(s, n); return [lo, hi].map((v) => Math.round(v * 1000) / 1000); };
const rate = (s, n) => ({ s, n, rate: n ? Math.round((s / n) * 1000) / 1000 : null, ci95: ci(s, n) });

function summary(set) {
  const r = rows.filter((x) => x.set === set && x.clean);
  const pl = r.filter((x) => x.planted);
  const perKind = Object.fromEntries(KINDS.map((kd) => { const xs = pl.filter((x) => x.kind === kd); return [kd, { reader: rate(xs.filter((x) => x.readerCaught).length, xs.length), pattern: rate(xs.filter((x) => x.patternCaught).length, xs.length) }]; }));
  return {
    cleanDrafts: r.length, plantedDrafts: pl.length, readerFailures: r.filter((x) => x.readerFailed).length,
    specificity: { reader: rate(r.filter((x) => !x.readerFlaggedClean).length, r.length), pattern: rate(r.filter((x) => !x.patternFlaggedClean).length, r.length) },
    sensitivity: { reader: rate(pl.filter((x) => x.readerCaught).length, pl.length), pattern: rate(pl.filter((x) => x.patternCaught).length, pl.length) },
    perKind,
    // Descriptive only: with no material, how many clean drafts the reader finds any specific in.
    extractorFindsSpecificsWithNoMaterial: rate(r.filter((x) => x.onEmpty.reader.claims.length > 0).length, r.length),
  };
}
const test = summary('test');
const verdict = test.specificity.reader.rate !== null && test.sensitivity.reader.rate !== null
  ? (test.specificity.reader.rate >= 0.8 && test.sensitivity.reader.rate >= 0.5 ? 'PASS' : 'FAIL') : 'INCOMPLETE';
const result = { readerVersion: READER_VERSION, writer: WRITER, reader: READER, seed: SEED, spentUsd: Math.round(budget.spentUsd * 100) / 100,
  test, dev: summary('dev'), verdict, rows };
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ verdict, spentUsd: result.spentUsd, test: { ...test, perKind: undefined }, perKind: test.perKind }, null, 1));
if (!existsSync(join(OUT, 'result.json'))) process.exit(1);
