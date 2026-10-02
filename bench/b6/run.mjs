#!/usr/bin/env node
// bench/b6/run.mjs — THE SEALED FIDELITY STUDY (B6), RUN ON THE REVIEWER'S CORPORA AND KEY.
//
// Pre-registration: studies/B6_PREREGISTRATION.md. This script is the procedure it names, step by step.
// It makes model calls only in `build` and `generate`, prints an estimate first, and stops at --cap.
//
//   node bench/b6/run.mjs prepare  --corpora <dir> --work <dir> [--seed 1] [--test 15] [--validation 6]
//   node bench/b6/run.mjs build    --work <dir> [--cap 5]
//   node bench/b6/run.mjs generate --work <dir> --split validation|test [--arms plain,pasted,open,loop] [--repeats 1] [--cap 20]
//                                  [--briefs <piece>,<piece>] [--shard k/n] [--dry-run]
//   node bench/b6/run.mjs evaluate --work <dir>
//   node bench/b6/run.mjs blind    --work <dir> --readers r1,r2,r3 [--against pasted] [--seed 1]
//   node bench/b6/run.mjs score    --work <dir> --labels <labels-r1.csv>,<labels-r2.csv>,… [--readers-required 3]
//
// <corpora>/<register>/*.md is one author's (or one team's) pieces per register: blog, linkedin, contract,
// finance, support, or any name. An optional <corpora>/<register>/briefs/<piece>.md is a human-written
// outline for that piece, used instead of the generated brief (better: it does not leak the piece's form).
//
// Needs ANTHROPIC_API_KEY for build and generate; B6_MODEL (default claude-opus-5-5) is the writer for every
// arm, B6_EVAL_MODEL (default claude-sonnet-5-5) writes the evaluator's negatives and must be another model.
// A model with no price in providers/pricing.ts needs its rate given: B6_PRICE_IN and B6_PRICE_OUT for the
// writer, B6_EVAL_PRICE_IN and B6_EVAL_PRICE_OUT for the evaluator's model, in USD per million tokens. Without
// a price the cap cannot be held, so build and generate refuse to start. Run `npm run build` first: this
// reads ../../dist.
//
// INTEGRITY. `prepare` copies every validation and test text (and the training pieces) into the work
// directory and records each file's sha256 in plan.json; every later step checks them and refuses on any
// mismatch, naming the file. The evaluator's model is refused when it is the writer. A detector that does not
// separate its own validation material (cross-validated AUC under 0.65) decides no bar. `score` refuses a
// design that is not the pre-registered one: every reader judges every pair once, orders balanced across
// readers. `node bench/b6/selftest.mjs` checks each of these refusals offline.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { factLedger, factCoverage, authorFactDensity } from '../../dist/core/loop/fact-ledger.js';
import { buildProfile, readFidelity } from '../../dist/core/fidelity/profile.js';
import { trainDetector, scoreDetector } from '../../dist/core/fidelity/stylometry.js';
import { aucWithCi, mulberry32 } from '../../dist/core/fidelity/qualify.js';
import { drawWithReplacement } from '../../dist/core/contract/analysis.js';
import { wordsOf, proseRegions } from '../../dist/core/observers/text.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';

const CLI = resolve(new URL('../../dist/cli/atelier.mjs', import.meta.url).pathname);
const MODEL = process.env.B6_MODEL ?? 'claude-opus-5-5';
const ARMS = ['plain', 'pasted', 'open', 'loop'];
/** At least this many training pieces for a confirmatory register (15 test + 6 validation + 15 = 36). */
const MIN_TRAIN = 15;
/** The evaluator's detector is trained on imitations by ANOTHER model, so it is not trained on the comparator arm's own distribution. */
const EVAL_MODEL = process.env.B6_EVAL_MODEL ?? 'claude-sonnet-5-5';
/** Below this cross-validated AUC on its own validation material, the evaluator's detector decides no bar. */
const MIN_EVAL_CV_AUC = 0.65;
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i === -1 ? d : args[i + 1]; };
const has = (k) => args.includes(`--${k}`);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const words = (t) => wordsOf(proseRegions(t).map((r) => r.text).join('\n\n')).length;
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
/** Written under a temporary name and renamed, so a reader never sees half a file and two writers never share one. */
const writeAtomic = (p, text) => { mkdirSync(dirname(p), { recursive: true }); const tmp = `${p}.tmp-${process.pid}`; writeFileSync(tmp, text); renameSync(tmp, p); };
const writeJ = (p, x) => writeAtomic(p, `${JSON.stringify(x, null, 1)}\n`);
const die = (m) => { console.error(m); process.exit(2); };
const work = resolve(opt('work') ?? die('--work <dir> is required'));
const plan = () => readJ(join(work, 'plan.json'));

// ── integrity ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every text the plan names, checked against the sha256 prepare recorded. A text that changed after the
 * split was sealed would make every number below about some other text; the step refuses and names it.
 */
function verifyTexts(p) {
  if (sha(JSON.stringify(p.registers)) !== p.hash) die(`plan.json was edited after prepare (its registers hash to ${sha(JSON.stringify(p.registers))}, not ${p.hash}). Refusing.`);
  for (const [reg, r] of Object.entries(p.registers)) {
    if (!r.sha256) die(`plan.json has no text hashes for ${reg}: it was prepared by an older harness. Run prepare again into a new work directory.`);
    for (const [rel, want] of Object.entries(r.sha256)) {
      const file = join(work, reg, rel);
      if (!existsSync(file)) die(`${reg}/${rel} is missing from the work directory; plan.json recorded it at prepare. Refusing.`);
      const got = sha256(readFileSync(file));
      if (got !== want) die(`${reg}/${rel} changed after prepare: sha256 ${got}, plan.json recorded ${want}. Refusing.`);
    }
  }
}

/** Lower-cased, any provider prefix dropped. */
const modelKey = (m) => String(m ?? '').trim().toLowerCase().replace(/^.*\//, '');
/** The same model, or one id a prefix alias of the other (claude-x-5 and claude-x-5-20260101). */
const sameModel = (a, b) => { const x = modelKey(a); const y = modelKey(b); return Boolean(x && y) && (x === y || x.startsWith(y) || y.startsWith(x)); };

function refuseSameModel() {
  if (sameModel(MODEL, EVAL_MODEL)) {
    die(`B6_EVAL_MODEL (${EVAL_MODEL}) and B6_MODEL (${MODEL}) name the same model, or one is a prefix alias of the other. `
      + 'The evaluator\'s negatives must come from another model (pre-registration, section 4). Refusing.');
  }
}

/** A price for `model`: the env pair when given (both halves or neither), else the table, else null. */
function priceOf(model, inVar, outVar) {
  const i = process.env[inVar]; const o = process.env[outVar];
  if ((i === undefined) !== (o === undefined)) die(`${inVar} and ${outVar} go together: a rate with one half is a wrong number.`);
  if (i !== undefined) {
    const a = Number(i); const b = Number(o);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) die(`${inVar} / ${outVar} must be non-negative USD per million tokens; got "${i}" and "${o}".`);
    return { source: 'env', pricing: { inputPerM: a, outputPerM: b } };
  }
  const t = priceFor(ANTHROPIC_PRICING, model);
  return t ? { source: 'table', pricing: t } : null;
}
const writerPrice = () => priceOf(MODEL, 'B6_PRICE_IN', 'B6_PRICE_OUT')
  ?? die(`${MODEL} has no price in providers/pricing.ts, so no cost can be counted and the cap cannot hold. `
    + 'Set B6_PRICE_IN and B6_PRICE_OUT (USD per million tokens, from your rate card), or choose a priced B6_MODEL. Refusing to start.');
const evalPrice = () => priceOf(EVAL_MODEL, 'B6_EVAL_PRICE_IN', 'B6_EVAL_PRICE_OUT')
  ?? die(`${EVAL_MODEL} (B6_EVAL_MODEL) has no price in providers/pricing.ts. Set B6_EVAL_PRICE_IN and B6_EVAL_PRICE_OUT, or choose a priced B6_EVAL_MODEL. Refusing to start.`);
/** The CLI's own price flags, when the rate came from the environment. */
const priceFlags = (w) => (w.source === 'env' ? ['--price-in', String(w.pricing.inputPerM), '--price-out', String(w.pricing.outputPerM)] : []);

// ── prepare: a seeded split per register, and a brief for every validation and test piece ─────────────
function prepare() {
  const corpora = resolve(opt('corpora') ?? die('--corpora <dir> is required'));
  const seed = Number(opt('seed', 1)); const nTest = Number(opt('test', 15)); const nVal = Number(opt('validation', 6));
  if (existsSync(join(work, 'plan.json'))) die(`${join(work, 'plan.json')} exists: a sealed split is never redrawn. Use a new work directory.`);
  const registers = readdirSync(corpora, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const out = { seed, model: MODEL, createdAt: new Date().toISOString(), registers: {} };
  for (const reg of registers) {
    const dir = join(corpora, reg);
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    if (files.length < nTest + nVal + MIN_TRAIN) console.warn(`${reg}: ${files.length} pieces; fewer than ${nTest + nVal + MIN_TRAIN}, so it is EXPLORATORY under the pre-registration`);
    // A seeded shuffle, recorded: the split cannot be redrawn after a look at the results.
    const rnd = mulberry32(seed + sha(reg).charCodeAt(0));
    const order = files.map((f) => ({ f, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.f);
    const test = order.slice(0, nTest); const validation = order.slice(nTest, nTest + nVal); const train = order.slice(nTest + nVal);
    const piece = (f) => readFileSync(join(dir, f), 'utf8');
    const brief = (f) => {
      const own = join(dir, 'briefs', f);
      if (existsSync(own)) return { source: 'human', text: readFileSync(own, 'utf8').trim() };
      const t = piece(f);
      const title = /^#\s+(.+)$/m.exec(t)?.[1]?.trim() ?? basename(f, '.md').replace(/[-_]+/g, ' ');
      const facts = factLedger(t).map((x) => x.text);
      return { source: 'generated', text: `Write a piece titled "${title}", about ${Math.round(words(t) / 50) * 50} words.${facts.length ? `\n\nFacts you may use (use only these; invent none):\n${facts.map((x) => `- ${x}`).join('\n')}` : ''}` };
    };
    // THE TEXTS ARE COPIED AND HASHED. Every later step reads these copies and checks them first, so an edit
    // to a corpus after the seal is refused, not silently measured.
    const hashes = {};
    for (const [sub, list] of [['train', train], ['texts', [...validation, ...test]]]) {
      mkdirSync(join(work, reg, sub), { recursive: true });
      for (const f of list) { cpSync(join(dir, f), join(work, reg, sub, f)); hashes[`${sub}/${f}`] = sha256(readFileSync(join(work, reg, sub, f))); }
    }
    out.registers[reg] = { corpus: dir, train, validation, test, exploratory: files.length < nTest + nVal + MIN_TRAIN,
      briefs: Object.fromEntries([...validation, ...test].map((f) => [f, brief(f)])), sha256: hashes };
  }
  out.hash = sha(JSON.stringify(out.registers));
  writeJ(join(work, 'plan.json'), out);
  console.log(`plan ${out.hash}: ${registers.length} register(s); commit plan.json before generating (it seals the split, the briefs and the sha256 of every text).`);
}

// ── build: one Atelier skill per register, from its training pieces only ───────────────────────────────
function build() {
  const p = plan(); verifyTexts(p);
  const w = writerPrice();
  for (const [reg, r] of Object.entries(p.registers)) {
    const proj = join(work, reg, 'proj'); mkdirSync(proj, { recursive: true });
    const env = { ...process.env, ATELIER_DATA: join(work, reg, 'data'), ATELIER_PROJECT_DIR: proj };
    console.log(`${reg}: building from ${r.train.length} training piece(s)…`);
    // Accepted as shown: in this study nobody owns the corpus, so the suggested rulings stand. Said in the
    // pre-registration as a limit: an owner's ratification is the product's real path.
    const out = execFileSync('node', [CLI, 'new', join(work, reg, 'train'), `write a ${reg} piece like these`, '--name', `b6-${reg}`, '--accept', '--no-ai-assist',
      '--cap', opt('cap', '5'), '--model', MODEL, ...priceFlags(w)], { cwd: proj, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    writeFileSync(join(work, reg, 'build.log'), out);
  }
}

// ── generate: every arm on every brief of one split ────────────────────────────────────────────────────

/** `k/n`, 1 <= k <= n: this process takes every n-th item of the work list, starting at the k-th. */
function parseShard(s) {
  if (s === undefined) return null;
  const m = /^(\d+)\/(\d+)$/.exec(s);
  const k = m ? Number(m[1]) : NaN; const n = m ? Number(m[2]) : NaN;
  if (!m || n < 1 || k < 1 || k > n) die(`--shard must be k/n with 1 <= k <= n (e.g. 2/4); got "${s}".`);
  return { k, n };
}

/**
 * THE WORK LIST, IN ONE FIXED ORDER: registers by name, then the split's pieces in plan order, arms, repeats.
 * A shard is a deterministic slice of it, so n processes with shards 1/n … n/n cover it exactly once.
 */
function workList(p, split, arms, repeats, wanted) {
  const list = [];
  for (const reg of Object.keys(p.registers).sort()) {
    const r = p.registers[reg];
    for (const f of r[split]) {
      if (wanted && !wanted.has(f)) continue;
      for (const arm of arms) for (let k = 0; k < repeats; k++) list.push({ reg, f, arm, k });
    }
  }
  return list;
}

/** An exclusive claim on one output, so two writers never write it. A claim left by a dead process is taken over. */
function claim(file) {
  const l = `${file}.lock`; mkdirSync(dirname(l), { recursive: true });
  try { const fd = openSync(l, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd); return l; } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(readFileSync(l, 'utf8'));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (k) { alive = k.code === 'EPERM'; }
    if (pid && !alive) { unlinkSync(l); return claim(file); }
    return null;
  }
}

async function generate() {
  const p = plan(); verifyTexts(p); refuseSameModel();
  const split = opt('split') ?? die('--split validation|test');
  if (split !== 'validation' && split !== 'test') die(`--split must be validation or test; got "${split}".`);
  const arms = [...(opt('arms', ARMS.join(','))).split(','), ...(split === 'validation' ? ['evalgen'] : [])]; const repeats = Number(opt('repeats', 1));
  for (const a of arms) if (![...ARMS, 'evalgen'].includes(a)) die(`unknown arm "${a}": ${ARMS.join(', ')}.`);
  const cap = Number(opt('cap', 20));
  const briefsOpt = opt('briefs');
  const wanted = briefsOpt ? new Set(briefsOpt.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith('.md') ? s : `${s}.md`))) : null;
  if (wanted) {
    const inSplit = new Set(Object.values(p.registers).flatMap((r) => r[split]));
    const unknown = [...wanted].filter((f) => !inSplit.has(f));
    if (unknown.length) die(`--briefs names piece(s) not in the ${split} split: ${unknown.join(', ')}.`);
  }
  const shard = parseShard(opt('shard'));
  const list = workList(p, split, arms, repeats, wanted);
  const mine = shard ? list.filter((_, i) => i % shard.n === shard.k - 1) : list;
  const outFile = (x) => join(work, x.reg, 'out', split, x.arm, `${basename(x.f, '.md')}.${x.k}.md`);
  if (has('dry-run')) {
    for (const x of mine) console.log(`${x.reg}/${split}/${x.arm}/${basename(x.f, '.md')}.${x.k}${existsSync(outFile(x)) ? ' (done)' : ''}`);
    console.log(`${mine.length} of ${list.length} item(s)${shard ? ` in shard ${shard.k}/${shard.n}` : ''}.`);
    return;
  }
  const w = writerPrice(); const e = arms.includes('evalgen') ? evalPrice() : null;
  const { AnthropicInferenceClient } = await import('../../dist/providers/anthropic.js');
  const client = new AnthropicInferenceClient(MODEL, undefined, w.pricing);
  const evalClient = e ? new AnthropicInferenceClient(EVAL_MODEL, undefined, e.pricing) : null;
  const budget = { spentUsd: 0, capUsd: cap };
  console.log(`${mine.length} output(s) to write (${arms.join(', ')} × ${repeats}${shard ? `, shard ${shard.k}/${shard.n}` : ''}${wanted ? `, briefs ${[...wanted].join(', ')}` : ''}); this process stops at $${cap}.`);
  let skipped = 0;
  for (const x of mine) {
    const file = outFile(x);
    if (existsSync(file)) continue;
    if (budget.spentUsd >= cap) die(`stopped at the cap ($${budget.spentUsd.toFixed(2)}); run again with a higher --cap to continue where it stopped.`);
    const held = claim(file);
    if (!held) { skipped += 1; continue; }            // another writer has it
    try {
      if (existsSync(file)) continue;                  // finished while this one waited for the claim
      const r = p.registers[x.reg];
      const brief = r.briefs[x.f].text;
      let text; let cost = 0; let meta = {};
      if (x.arm === 'plain' || x.arm === 'pasted' || x.arm === 'evalgen') {
        // evalgen: the evaluator's negatives, by another model, half of them with the author's pieces pasted.
        const withExamples = x.arm === 'pasted' || (x.arm === 'evalgen' && r[split].indexOf(x.f) % 2 === 1);
        const pasted = r.train.slice(0, 4).map((f) => readFileSync(join(work, x.reg, 'train', f), 'utf8'));
        const examples = withExamples ? `\n\nPieces by the author, to write in their style:\n\n${pasted.map((t) => `<example>\n${t}\n</example>`).join('\n\n')}` : '';
        const res = await (x.arm === 'evalgen' ? evalClient : client).complete({ stableBlock: 'You are a writer. Write the piece you are asked for.', variableBlock: '',
          userMessage: `${brief}${examples}\n\nOutput only the piece.`, toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
          schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens: 12000 });
        text = res.json.piece; cost = res.costUsd ?? 0; meta = { servedModel: res.modelId };
      } else {
        const proj = join(work, x.reg, 'proj');
        const env = { ...process.env, ATELIER_DATA: join(work, x.reg, 'data'), ATELIER_PROJECT_DIR: proj };
        // `open` is Atelier as 0.7 ran it: no fidelity loop, and 0.7's two drafts. `loop` asks for the loop by
        // name: since 1.0 the default release is 0.7's cost, so an arm that passes nothing is the open arm again.
        const extra = x.arm === 'open' ? ['--no-fidelity', '--drafts', '2'] : ['--fidelity'];
        const raw = execFileSync('node', [CLI, 'invoke', '--skill', `b6-${x.reg}`, '--json', '--no-taste', '--model', MODEL, ...priceFlags(w), ...extra, brief], { cwd: proj, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const j = JSON.parse(raw); text = j.output; cost = j.costUsd ?? 0;
        meta = { invocationId: j.invocationId, rulesBroken: j.rulesBroken, cut: j.cut, toCheck: j.toCheck, fidelity: j.fidelity ?? null };
      }
      budget.spentUsd += cost;
      // The record first, the text last: the text's existence is what marks the item done.
      writeJ(`${file}.json`, { reg: x.reg, piece: x.f, arm: x.arm, repeat: x.k, costUsd: cost, model: x.arm === 'evalgen' ? EVAL_MODEL : MODEL, ...meta });
      writeAtomic(file, `${text.trim()}\n`);
      process.stderr.write(`.${budget.spentUsd.toFixed(2)}`);
    } finally { try { unlinkSync(held); } catch { /* already gone */ } }
  }
  console.log(`\ndone: $${budget.spentUsd.toFixed(2)}${skipped ? `; ${skipped} item(s) left to another writer that holds them` : ''}`);
}

// ── evaluate: offline, with an evaluator the steering never saw ────────────────────────────────────────
// The evaluator's bands come from the VALIDATION pieces (never the training pieces the skill was built
// from), over every feature (not only the ones the skill steers by). Its detector is trained on the
// validation pieces against another model's imitations of the validation briefs, never on test outputs.
function evaluate() {
  const p = plan(); verifyTexts(p); refuseSameModel();
  const results = { plan: p.hash, minEvaluatorCvAuc: MIN_EVAL_CV_AUC, registers: {} };
  for (const [reg, r] of Object.entries(p.registers)) {
    const read = (split, arm, f, k = 0) => { const x = join(work, reg, 'out', split, arm, `${basename(f, '.md')}.${k}.md`); return existsSync(x) ? readFileSync(x, 'utf8') : null; };
    const metaOf = (split, arm, f, k = 0) => { const m = join(work, reg, 'out', split, arm, `${basename(f, '.md')}.${k}.md.json`); return existsSync(m) ? readJ(m) : {}; };
    const realOf = (f) => readFileSync(join(work, reg, 'texts', f), 'utf8');
    // WHAT RAN, NOT ONLY WHAT IS SET NOW: an evaluator output recorded as written by the writer is refused too.
    const evalModels = new Set(r.validation.flatMap((f) => [metaOf('validation', 'evalgen', f).model, metaOf('validation', 'evalgen', f).servedModel]).filter(Boolean));
    const writerModels = new Set(ARMS.flatMap((a) => [...r.validation, ...r.test].flatMap((f) => [metaOf('validation', a, f).model, metaOf('test', a, f).model, metaOf('validation', a, f).servedModel, metaOf('test', a, f).servedModel])).filter(Boolean));
    for (const em of evalModels) for (const wm of writerModels) if (sameModel(em, wm)) die(`${reg}: the evaluator's negatives were written by ${em}, and the arms by ${wm}: the same model. Refusing.`);
    const val = r.validation.map((f) => ({ id: f, text: realOf(f) }));
    // Negatives from another model (evalgen); only if they are missing, the plain and pasted outputs, and the
    // result says so, because then the detector was trained on the comparator arm's own distribution.
    const evalgen = r.validation.map((f) => read('validation', 'evalgen', f)).filter(Boolean);
    const valModel = evalgen.length >= 4 ? evalgen : r.validation.flatMap((f) => ['plain', 'pasted'].map((a) => read('validation', a, f))).filter(Boolean);
    const detectorBias = evalgen.length >= 4 ? null : 'trained on the plain and pasted arms: biased toward the loop on the detector bar';
    // Bands over all features, from the validation pieces: every feature MONITOR-free and steering-free.
    const evalProfile = buildProfile({ read: val, held: [], model: [], corpusHash: `eval:${reg}` });
    const allBands = { ...evalProfile, bands: evalProfile.bands.map((b) => ({ ...b, role: 'SIGNAL' })) };
    let detector = null;
    try { detector = valModel.length >= 4 && val.length >= 4 ? trainDetector(val.map((x) => ({ text: x.text, group: x.id })), valModel.map((t, i) => ({ text: t, group: `m${i}` }))) : null; } catch { detector = null; }
    // A DETECTOR THAT CANNOT TELL ITS OWN MATERIAL APART DECIDES NOTHING. Its AUCs are still reported.
    const detectorWhy = !detector ? 'no evaluator detector: it needs 4 validation pieces and 4 imitations of at least 100 prose words'
      : detector.cvAuc === null ? 'the evaluator detector has no cross-validated AUC (too few groups to fold), so it is not shown to separate anything'
        : detector.cvAuc < MIN_EVAL_CV_AUC ? `the evaluator detector's cross-validated AUC is ${detector.cvAuc}, below ${MIN_EVAL_CV_AUC}: it does not separate the author from imitations on its own material`
          // Trained on the comparator arms' own outputs, it would favour whatever is not them: it decides nothing.
          : detectorBias ? `the evaluator detector was ${detectorBias.split(':')[0]} (no imitations by another model), so its bar would favour the loop`
            : null;
    const real = r.test.map(realOf);
    const realP = detector ? real.map((t) => scoreDetector(detector, t)?.p).filter((x) => x !== undefined) : [];
    const authorDensity = authorFactDensity(val.map((x) => x.text));
    const arms = {};
    for (const arm of ARMS) {
      const outs = r.test.map((f) => ({ f, text: read('test', arm, f) })).filter((x) => x.text);
      if (!outs.length) continue;
      const share = outs.map((x) => { const rd = readFidelity(x.text, allBands); return rd.measured ? rd.inBand / rd.measured : null; }).filter((x) => x !== null);
      const coverage = outs.map((x) => factCoverage(x.text, factLedger(r.briefs[x.f].text)));
      const p_ = detector ? outs.map((x) => scoreDetector(detector, x.text)?.p).filter((x) => x !== undefined) : [];
      const metas = outs.map((x) => metaOf('test', arm, x.f));
      arms[arm] = {
        n: outs.length,
        inBandShare: mean(share),
        // real vs this arm: 0.5 means the evaluator cannot tell them apart; the bar is on the upper bound
        detectorAuc: detector && p_.length && realP.length ? aucWithCi(p_, realP, { seed: p.seed }) : null,
        specificsOutsideBrief: mean(coverage.map((c) => c.outside.length)),
        // GROUNDED FACT COVERAGE: the brief's facts used per 100 words, beside the author's own density on the
        // validation pieces. Reported, not a counted bar: the pre-registration counts only what is outside.
        factCoverage: { per100: mean(coverage.map((c) => c.per100)), authorPer100: authorDensity },
        costUsd: mean(metas.map((m) => m.costUsd ?? 0)),
        // a rule that should have applied and is missing from the manifest is a confound (G6)
        manifestGaps: metas.filter((m) => m.fidelity && (m.fidelity.applicability ?? []).some((a) => a.status === 'WAIVED' && !a.why)).length,
      };
    }
    const realShare = mean(real.map((t) => { const rd = readFidelity(t, allBands); return rd.measured ? rd.inBand / rd.measured : null; }).filter((x) => x !== null));
    const spread = spreadOf(r, read);
    const { bars, notes } = countedBars(arms, realShare, spread, detectorWhy);
    results.registers[reg] = { exploratory: r.exploratory, realInBandShare: realShare, authorFactDensity: authorDensity,
      evaluatorDetector: detector ? { version: detector.version, cvAuc: detector.cvAuc, usable: detectorWhy === null, trainedAgainst: evalgen.length >= 4 ? EVAL_MODEL : 'plain+pasted', bias: detectorBias } : null,
      arms, spread, bars, barNotes: notes };
  }
  writeJ(join(work, 'results.json'), results);
  console.log(JSON.stringify(results, null, 1));
}

/**
 * THE COUNTED BARS OF THE PRE-REGISTRATION (section 5), for the loop arm. Each is true, false, or null when
 * its data is missing or its instrument is not fit to decide it (null never passes); `notes` says why a bar
 * is null. The human read is decided by `score`, which requires these too.
 */
function countedBars(arms, realShare, spread, detectorWhy) {
  const L = arms.loop; const O = arms.open; const P = arms.pasted;
  const known = (x) => x !== null && x !== undefined;
  const notes = {};
  const bars = {
    inBand: L && O && known(L.inBandShare) && known(realShare) && known(O.inBandShare) ? Math.abs(L.inBandShare - realShare) <= 0.05 && L.inBandShare - O.inBandShare >= 0.05 : null,
    detector: detectorWhy ? null : L?.detectorAuc && P?.detectorAuc ? L.detectorAuc.ci95[1] < P.detectorAuc.auc : null,
    specifics: L && P && known(L.specificsOutsideBrief) && known(P.specificsOutsideBrief) ? L.specificsOutsideBrief <= P.specificsOutsideBrief : null,
    manifest: L ? L.manifestGaps === 0 : null,
    spread: spread.loop && spread.pasted ? spread.loop.lengthCv <= spread.pasted.lengthCv : null,
  };
  if (detectorWhy) notes.detector = `null, never a pass: ${detectorWhy}`;
  for (const [k, v] of Object.entries(bars)) if (v === null && !notes[k]) notes[k] = 'null, never a pass: its data is missing';
  return { bars: { ...bars, all: Object.values(bars).every((x) => x === true) }, notes };
}

/** Run-to-run spread on the counted metrics, from repeats of the same brief (needs --repeats ≥ 2). */
function spreadOf(r, read) {
  const out = {};
  for (const arm of ARMS) {
    const sds = [];
    for (const f of r.test) {
      const reps = [0, 1, 2, 3, 4].map((k) => read('test', arm, f, k)).filter(Boolean);
      if (reps.length < 2) continue;
      const lens = reps.map(words);
      const m = mean(lens);
      sds.push(Math.sqrt(lens.reduce((n, x) => n + (x - m) ** 2, 0) / (lens.length - 1)) / Math.max(1, m));
    }
    if (sds.length) out[arm] = { briefs: sds.length, lengthCv: mean(sds) };
  }
  return out;
}

// ── blind: one packet per reader ───────────────────────────────────────────────────────────────────────
// Pairs of Atelier (the loop arm) against the strongest baseline, both sides masked the same way (every
// figure, name, date and link replaced). Every reader reads every pair once. The side order is balanced
// ACROSS readers: on each pair half the readers see the loop as A (with an odd number of readers the extra
// one alternates from pair to pair), so position bias cancels within a brief. Each reader gets their own
// seeded order of pairs. The key is written apart and hashed.
function blind() {
  const p = plan(); verifyTexts(p);
  const readers = (opt('readers') ?? die('--readers r1,r2,r3 is required: one packet per reader, every reader reads every pair.')).split(',').map((s) => s.trim()).filter(Boolean);
  if (readers.length < 2) die(`--readers needs at least two reader ids to balance the order across readers; got ${readers.length}.`);
  if (new Set(readers).size !== readers.length) die(`--readers repeats an id: ${readers.join(',')}.`);
  for (const r of readers) if (!/^[A-Za-z0-9_-]+$/.test(r)) die(`reader id "${r}": letters, digits, - and _ only (it names a file).`);
  const against = opt('against', 'pasted'); const seed = Number(opt('seed', p.seed)); const rnd = mulberry32(seed);
  const pairs = []; const missing = [];
  for (const reg of Object.keys(p.registers).sort()) for (const f of p.registers[reg].test) {
    const a = join(work, reg, 'out', 'test', 'loop', `${basename(f, '.md')}.0.md`); const b = join(work, reg, 'out', 'test', against, `${basename(f, '.md')}.0.md`);
    if (!existsSync(a) || !existsSync(b)) { missing.push(`${reg}/${f}`); continue; }
    pairs.push({ id: `p${sha(`${reg}|${f}|${seed}`).slice(0, 8)}`, register: reg, brief: f, briefText: mask(p.registers[reg].briefs[f].text), loop: mask(readFileSync(a, 'utf8')), other: mask(readFileSync(b, 'utf8')) });
  }
  if (!pairs.length) die(`no pair has both a loop and a ${against} output on the test split.`);
  if (missing.length) console.warn(`${missing.length} brief(s) without both outputs are left out: ${missing.join(', ')}`);
  const shuffle = (xs, g) => xs.map((x) => ({ x, k: g() })).sort((m, n) => m.k - n.k).map((m) => m.x);
  for (const [j, x] of pairs.entries()) {
    const nA = Math.floor(readers.length / 2) + (readers.length % 2 ? j % 2 : 0);
    x.orders = Object.fromEntries(shuffle(readers, rnd).map((r, i) => [r, i < nA ? { A: 'loop', B: against } : { A: against, B: 'loop' }]));
  }
  mkdirSync(join(work, 'blind'), { recursive: true });
  for (const reader of readers) {
    const mine = shuffle(pairs, mulberry32(seed + parseInt(sha(reader).slice(0, 8), 16)));
    const side = (x, s) => (x.orders[reader][s] === 'loop' ? x.loop : x.other);
    writeAtomic(join(work, 'blind', `packet-${reader}.md`), `# Packet for reader ${reader}\n\n${mine.map((x) => `## ${x.id}\n\n**Brief.** ${x.briefText}\n\n### A\n\n${side(x, 'A')}\n\n### B\n\n${side(x, 'B')}\n\nWhich reads more like the author? (A / B)\n`).join('\n---\n\n')}`);
    writeAtomic(join(work, 'blind', `labels-${reader}.csv`), `id,reader,choice\n${mine.map((x) => `${x.id},${reader},`).join('\n')}\n`);
  }
  const key = { plan: p.hash, against, seed, readers, pairs: pairs.map((x) => ({ id: x.id, register: x.register, brief: x.brief, orders: x.orders })) };
  const keyText = JSON.stringify(key, null, 1);
  writeAtomic(join(work, 'blind', 'KEY.json'), keyText);
  console.log(`${pairs.length} pair(s), ${readers.length} reader(s). Give each reader packet-<id>.md and labels-<id>.csv only. KEY.json sha256 ${sha256(keyText)}: send this hash to the readers before the first label, and keep KEY.json closed until every label is in.`);
}

function mask(t) {
  let out = t;
  for (const f of factLedger(t).sort((a, b) => b.text.length - a.text.length)) out = out.split(f.text).join(`[${f.kind}]`);
  return out;
}

// ── score: the pre-registered decision on the human labels ─────────────────────────────────────────────

/**
 * THE DESIGN IS CHECKED BEFORE ANYTHING IS COUNTED. The readers the key names (at least --readers-required),
 * exactly one judgment per reader per pair, every pair judged by every reader, the orders balanced across
 * readers. Returns the list of what is wrong; empty means the design is the pre-registered one.
 */
function designErrors(key, rows, required) {
  const errs = [];
  if (!Array.isArray(key.readers) || !Array.isArray(key.pairs)) return ['KEY.json is not a per-reader key (it has no readers); run blind --readers again'];
  const readers = new Set(key.readers);
  if (readers.size < required) errs.push(`the design needs ${required} distinct readers; KEY.json names ${readers.size} (${key.readers.join(', ')})`);
  const pairIds = new Set(key.pairs.map((x) => x.id));
  for (const x of key.pairs) {
    const orders = key.readers.map((r) => x.orders?.[r]);
    if (orders.some((o) => !o || !['A', 'B'].every((s) => o[s] === 'loop' || o[s] === key.against) || o.A === o.B)) { errs.push(`pair ${x.id} (${x.register}/${x.brief}): KEY.json lacks a valid order for some reader`); continue; }
    const loopA = orders.filter((o) => o.A === 'loop').length; const loopB = orders.length - loopA;
    if (Math.abs(loopA - loopB) > key.readers.length % 2) errs.push(`pair ${x.id} (${x.register}/${x.brief}): ${loopA} reader(s) see the loop as A and ${loopB} as B; the orders must be balanced across readers`);
  }
  const seen = new Map();
  for (const { id, reader, choice, where } of rows) {
    if (!readers.has(reader)) { errs.push(`${where}: reader "${reader}" is not in KEY.json (readers: ${key.readers.join(', ')})`); continue; }
    if (!pairIds.has(id)) { errs.push(`${where}: pair "${id}" is not in KEY.json`); continue; }
    const k = `${reader}|${id}`;
    if (seen.has(k)) { errs.push(`reader ${reader} judged pair ${id} more than once (${seen.get(k)} and ${where})`); continue; }
    seen.set(k, where);
    if (choice !== 'A' && choice !== 'B') errs.push(`${where}: reader ${reader}, pair ${id}: choice "${choice}" is not A or B (an incomplete design is not scored)`);
  }
  for (const r of key.readers) {
    const left = key.pairs.filter((x) => !seen.has(`${r}|${x.id}`)).map((x) => x.id);
    if (left.length === key.pairs.length) errs.push(`reader ${r} has no judgments: every pair must be judged by every reader`);
    else if (left.length) errs.push(`reader ${r} has not judged ${left.length} pair(s): ${left.join(', ')}`);
  }
  return errs;
}

function readLabels(files) {
  const rows = [];
  for (const f of files) {
    const lines = readFileSync(resolve(f), 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => {
      if (i === 0 || !l.trim()) return;                      // the header, and blank lines
      const [id = '', reader = '', choice = ''] = l.split(',').map((s) => s.trim());
      rows.push({ id, reader, choice: choice.toUpperCase(), where: `${basename(f)} line ${i + 1}` });
    });
  }
  return rows;
}

// Preference share for the loop arm per register, with a bootstrap that resamples briefs with their reads.
function score() {
  const p = plan(); verifyTexts(p);
  const keyText = readFileSync(join(work, 'blind', 'KEY.json'), 'utf8');
  const key = JSON.parse(keyText);
  console.error(`KEY.json sha256 ${sha256(keyText)}: check it against the hash sent to the readers.`);
  if (key.plan !== undefined && key.plan !== p.hash) die(`KEY.json was made for plan ${key.plan}, not ${p.hash}. Refusing.`);
  const required = Number(opt('readers-required', 3));
  if (!Number.isInteger(required) || required < 1) die(`--readers-required must be a whole number of 1 or more; got "${opt('readers-required')}".`);
  const files = (opt('labels') ?? die('--labels <labels-r1.csv>,<labels-r2.csv>,… is required')).split(',').map((s) => s.trim()).filter(Boolean);
  const rows = readLabels(files);
  const errs = designErrors(key, rows, required);
  if (errs.length) die(`the labels are not the pre-registered design, so nothing is scored:\n${errs.map((e) => `  - ${e}`).join('\n')}`);
  const pairOf = new Map(key.pairs.map((x) => [x.id, x]));
  const by = {};
  for (const { id, reader, choice } of rows) {
    const k = pairOf.get(id);
    const won = k.orders[reader][choice] === 'loop' ? 1 : 0;
    ((by[k.register] ??= {})[k.brief] ??= []).push({ reader, won });
  }
  const rnd = mulberry32(1); const out = {};
  for (const [reg, briefs] of Object.entries(by)) {
    const groups = Object.values(briefs); const all = groups.flat();
    const share = all.reduce((n, x) => n + x.won, 0) / all.length;
    const boots = [];
    for (let i = 0; i < 10000; i++) {
      const pick = drawWithReplacement(groups, rnd).flat();
      boots.push(pick.reduce((n, x) => n + x.won, 0) / pick.length);
    }
    boots.sort((a, b) => a - b);
    const lo = boots[Math.floor(0.025 * boots.length)];
    out[reg] = { reads: all.length, readers: key.readers.length, briefs: groups.length, share: round(share), ci95: [round(lo), round(boots[Math.floor(0.975 * boots.length)])], passes: share >= 0.6 && lo > 0.5 };
  }
  // SECTION 6: the read passes AND every counted bar holds, per register; in four or more, none below 0.50.
  const resultsFile = join(work, 'results.json');
  const results = existsSync(resultsFile) ? readJ(resultsFile) : null;
  if (results && results.plan !== p.hash) die(`results.json was computed for plan ${results.plan}, not ${p.hash}. Run evaluate again.`);
  const counted = results?.registers ?? {};
  for (const [reg, x] of Object.entries(out)) {
    x.countedBars = counted[reg]?.bars ?? null;
    x.barNotes = counted[reg]?.barNotes ?? null;
    x.exploratory = counted[reg]?.exploratory ?? null;
    x.holds = x.passes && x.countedBars?.all === true && x.exploratory === false;
  }
  const passing = Object.values(out).filter((x) => x.holds).length;
  const worst = Math.min(...Object.values(out).map((x) => x.share));
  const verdict = { keySha256: sha256(keyText), readers: key.readers, registers: out, passing, holds: passing >= 4 && worst >= 0.5,
    ...(results ? {} : { note: 'results.json is missing: run evaluate first; no register can hold without its counted bars' }) };
  writeJ(join(work, 'blind', 'score.json'), verdict);
  console.log(JSON.stringify(verdict, null, 1));
}

const mean = (xs) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const round = (x) => Math.round(x * 1000) / 1000;

const steps = { prepare, build, generate, evaluate, blind, score };
if (!steps[cmd]) die(`usage: node bench/b6/run.mjs <${Object.keys(steps).join('|')}> --work <dir> …`);
await steps[cmd]();
