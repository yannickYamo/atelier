#!/usr/bin/env node
// bench/b6/run.mjs — THE SEALED FIDELITY STUDY (B6), RUN ON THE REVIEWER'S CORPORA AND KEY.
//
// Pre-registration: studies/B6_PREREGISTRATION.md. This script is the procedure it names, step by step.
// It makes model calls only in `build` and `generate`, prints an estimate first, and stops at --cap.
//
//   node bench/b6/run.mjs prepare  --corpora <dir> --work <dir> [--seed 1] [--test 15] [--validation 6]
//   node bench/b6/run.mjs build    --work <dir> [--cap 5]
//   node bench/b6/run.mjs generate --work <dir> --split validation|test [--arms plain,pasted,open,loop] [--repeats 1] [--cap 20]
//   node bench/b6/run.mjs evaluate --work <dir>
//   node bench/b6/run.mjs blind    --work <dir> [--against pasted] [--seed 1]
//   node bench/b6/run.mjs score    --work <dir> --labels <labels.csv>
//
// <corpora>/<register>/*.md is one author's (or one team's) pieces per register: blog, linkedin, contract,
// finance, support, or any name. An optional <corpora>/<register>/briefs/<piece>.md is a human-written
// outline for that piece, used instead of the generated brief (better: it does not leak the piece's form).
//
// Needs ANTHROPIC_API_KEY for build and generate; B6_MODEL (default claude-opus-5-5) is the writer for every
// arm. Run `npm run build` first: this reads ../../dist.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { factLedger, factCoverage } from '../../dist/core/loop/fact-ledger.js';
import { buildProfile, readFidelity } from '../../dist/core/fidelity/profile.js';
import { trainDetector, scoreDetector } from '../../dist/core/fidelity/stylometry.js';
import { aucWithCi, mulberry32 } from '../../dist/core/fidelity/qualify.js';
import { drawWithReplacement } from '../../dist/core/contract/analysis.js';
import { wordsOf, proseRegions } from '../../dist/core/observers/text.js';

const CLI = resolve(new URL('../../dist/cli/atelier.mjs', import.meta.url).pathname);
const MODEL = process.env.B6_MODEL ?? 'claude-opus-5-5';
const ARMS = ['plain', 'pasted', 'open', 'loop'];
/** At least this many training pieces for a confirmatory register (15 test + 6 validation + 15 = 36). */
const MIN_TRAIN = 15;
/** The evaluator's detector is trained on imitations by ANOTHER model, so it is not trained on the comparator arm's own distribution. */
const EVAL_MODEL = process.env.B6_EVAL_MODEL ?? 'claude-sonnet-5-5';
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i === -1 ? d : args[i + 1]; };
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const words = (t) => wordsOf(proseRegions(t).map((r) => r.text).join('\n\n')).length;
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJ = (p, x) => { mkdirSync(resolve(p, '..'), { recursive: true }); writeFileSync(p, `${JSON.stringify(x, null, 1)}\n`); };
const die = (m) => { console.error(m); process.exit(2); };
const work = resolve(opt('work') ?? die('--work <dir> is required'));
const plan = () => readJ(join(work, 'plan.json'));

// ── prepare: a seeded split per register, and a brief for every validation and test piece ─────────────
function prepare() {
  const corpora = resolve(opt('corpora') ?? die('--corpora <dir> is required'));
  const seed = Number(opt('seed', 1)); const nTest = Number(opt('test', 15)); const nVal = Number(opt('validation', 6));
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
    const trainDir = join(work, reg, 'train'); mkdirSync(trainDir, { recursive: true });
    for (const f of train) cpSync(join(dir, f), join(trainDir, f));
    out.registers[reg] = { corpus: dir, train, validation, test, exploratory: files.length < nTest + nVal + MIN_TRAIN,
      briefs: Object.fromEntries([...validation, ...test].map((f) => [f, brief(f)])) };
  }
  out.hash = sha(JSON.stringify(out.registers));
  writeJ(join(work, 'plan.json'), out);
  console.log(`plan ${out.hash}: ${registers.length} register(s); commit plan.json before generating (it seals the split and the briefs).`);
}

// ── build: one Atelier skill per register, from its training pieces only ───────────────────────────────
function build() {
  const p = plan();
  for (const [reg, r] of Object.entries(p.registers)) {
    const proj = join(work, reg, 'proj'); mkdirSync(proj, { recursive: true });
    const env = { ...process.env, ATELIER_DATA: join(work, reg, 'data'), ATELIER_PROJECT_DIR: proj };
    console.log(`${reg}: building from ${r.train.length} training piece(s)…`);
    // Accepted as shown: in this study nobody owns the corpus, so the suggested rulings stand. Said in the
    // pre-registration as a limit: an owner's ratification is the product's real path.
    const out = execFileSync('node', [CLI, 'new', join(work, reg, 'train'), `write a ${reg} piece like these`, '--name', `b6-${reg}`, '--accept', '--no-ai-assist',
      '--cap', opt('cap', '5'), '--model', MODEL], { cwd: proj, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    writeFileSync(join(work, reg, 'build.log'), out);
  }
}

// ── generate: every arm on every brief of one split ────────────────────────────────────────────────────
async function generate() {
  const p = plan(); const split = opt('split') ?? die('--split validation|test');
  const arms = [...(opt('arms', ARMS.join(','))).split(','), ...(split === 'validation' ? ['evalgen'] : [])]; const repeats = Number(opt('repeats', 1));
  const cap = Number(opt('cap', 20));
  const client = new AnthropicInferenceClient(MODEL);
  const evalClient = new AnthropicInferenceClient(EVAL_MODEL);
  const budget = { spentUsd: 0, capUsd: cap, maxCalls: 100000 };
  const n = Object.values(p.registers).reduce((k, r) => k + r[split].length, 0) * arms.length * repeats;
  console.log(`${n} output(s) to write (${arms.join(', ')} × ${repeats}); stops at $${cap}.`);
  for (const [reg, r] of Object.entries(p.registers)) {
    const pasted = r.train.slice(0, 4).map((f) => readFileSync(join(r.corpus, f), 'utf8'));
    for (const f of r[split]) for (const arm of arms) for (let k = 0; k < repeats; k++) {
      const file = join(work, reg, 'out', split, arm, `${basename(f, '.md')}.${k}.md`);
      if (existsSync(file)) continue;
      if (budget.spentUsd >= cap) die(`stopped at the cap ($${budget.spentUsd.toFixed(2)}); run again with a higher --cap to continue where it stopped.`);
      const brief = r.briefs[f].text;
      let text; let cost = 0; let meta = {};
      if (arm === 'plain' || arm === 'pasted' || arm === 'evalgen') {
        // evalgen: the evaluator's negatives, by another model, half of them with the author's pieces pasted.
        const withExamples = arm === 'pasted' || (arm === 'evalgen' && r[split].indexOf(f) % 2 === 1);
        const examples = withExamples ? `\n\nPieces by the author, to write in their style:\n\n${pasted.map((t) => `<example>\n${t}\n</example>`).join('\n\n')}` : '';
        const x = await (arm === 'evalgen' ? evalClient : client).complete({ stableBlock: 'You are a writer. Write the piece you are asked for.', variableBlock: '',
          userMessage: `${brief}${examples}\n\nOutput only the piece.`, toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
          schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens: 12000 });
        text = x.json.piece; cost = x.costUsd ?? 0;
      } else {
        const proj = join(work, reg, 'proj');
        const env = { ...process.env, ATELIER_DATA: join(work, reg, 'data'), ATELIER_PROJECT_DIR: proj };
        // `open` is Atelier as 0.7 ran it: no fidelity loop, and 0.7's two drafts.
        const extra = arm === 'open' ? ['--no-fidelity', '--drafts', '2'] : [];
        const raw = execFileSync('node', [CLI, 'invoke', '--skill', `b6-${reg}`, '--json', '--no-taste', '--model', MODEL, ...extra, brief], { cwd: proj, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const j = JSON.parse(raw); text = j.output; cost = j.costUsd ?? 0;
        meta = { invocationId: j.invocationId, rulesBroken: j.rulesBroken, cut: j.cut, toCheck: j.toCheck, fidelity: j.fidelity ?? null };
      }
      budget.spentUsd += cost;
      mkdirSync(resolve(file, '..'), { recursive: true });
      writeFileSync(file, `${text.trim()}\n`); writeJ(`${file}.json`, { reg, piece: f, arm, repeat: k, costUsd: cost, model: arm === 'evalgen' ? EVAL_MODEL : MODEL, ...meta });
      process.stderr.write(`.${budget.spentUsd.toFixed(2)}`);
    }
  }
  console.log(`\ndone: $${budget.spentUsd.toFixed(2)}`);
}

// ── evaluate: offline, with an evaluator the steering never saw ────────────────────────────────────────
// The evaluator's bands come from the VALIDATION pieces (never the training pieces the skill was built
// from), over every feature (not only the ones the skill steers by). Its detector is trained on the
// validation pieces against the plain and pasted outputs of the validation briefs, never on test outputs.
function evaluate() {
  const p = plan(); const results = { plan: p.hash, registers: {} };
  for (const [reg, r] of Object.entries(p.registers)) {
    const read = (split, arm, f, k = 0) => { const x = join(work, reg, 'out', split, arm, `${basename(f, '.md')}.${k}.md`); return existsSync(x) ? readFileSync(x, 'utf8') : null; };
    const realOf = (f) => readFileSync(join(r.corpus, f), 'utf8');
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
    const real = r.test.map(realOf);
    const realP = detector ? real.map((t) => scoreDetector(detector, t)?.p).filter((x) => x !== undefined) : [];
    const arms = {};
    for (const arm of ARMS) {
      const outs = r.test.map((f) => ({ f, text: read('test', arm, f) })).filter((x) => x.text);
      if (!outs.length) continue;
      const share = outs.map((x) => { const rd = readFidelity(x.text, allBands); return rd.measured ? rd.inBand / rd.measured : null; }).filter((x) => x !== null);
      const outside = outs.map((x) => factCoverage(x.text, factLedger(r.briefs[x.f].text)).outside.length);
      const p_ = detector ? outs.map((x) => scoreDetector(detector, x.text)?.p).filter((x) => x !== undefined) : [];
      const metas = outs.map((x) => { const m = join(work, reg, 'out', 'test', arm, `${basename(x.f, '.md')}.0.md.json`); return existsSync(m) ? readJ(m) : {}; });
      arms[arm] = {
        n: outs.length,
        inBandShare: mean(share),
        // real vs this arm: 0.5 means the evaluator cannot tell them apart; the bar is on the upper bound
        detectorAuc: detector && p_.length && realP.length ? aucWithCi(p_, realP, { seed: p.seed }) : null,
        specificsOutsideBrief: mean(outside),
        costUsd: mean(metas.map((m) => m.costUsd ?? 0)),
        // a rule that should have applied and is missing from the manifest is a confound (G6)
        manifestGaps: metas.filter((m) => m.fidelity && (m.fidelity.applicability ?? []).some((a) => a.status === 'WAIVED' && !a.why)).length,
      };
    }
    const realShare = mean(real.map((t) => { const rd = readFidelity(t, allBands); return rd.measured ? rd.inBand / rd.measured : null; }).filter((x) => x !== null));
    const spread = spreadOf(reg, r, read);
    results.registers[reg] = { exploratory: r.exploratory, realInBandShare: realShare,
      evaluatorDetector: detector ? { version: detector.version, cvAuc: detector.cvAuc, trainedAgainst: evalgen.length >= 4 ? EVAL_MODEL : 'plain+pasted', bias: detectorBias } : null,
      arms, spread, bars: countedBars(arms, realShare, spread) };
  }
  writeJ(join(work, 'results.json'), results);
  console.log(JSON.stringify(results, null, 1));
}

/**
 * THE COUNTED BARS OF THE PRE-REGISTRATION (section 5), for the loop arm. Each is true, false, or null when
 * its data is missing (null never passes). The human read is decided by `score`, which requires these too.
 */
function countedBars(arms, realShare, spread) {
  const L = arms.loop; const O = arms.open; const P = arms.pasted;
  const known = (x) => x !== null && x !== undefined;
  const bars = {
    inBand: L && O && known(L.inBandShare) && known(realShare) && known(O.inBandShare) ? Math.abs(L.inBandShare - realShare) <= 0.05 && L.inBandShare - O.inBandShare >= 0.05 : null,
    detector: L?.detectorAuc && P?.detectorAuc ? L.detectorAuc.ci95[1] < P.detectorAuc.auc : null,
    specifics: L && P && known(L.specificsOutsideBrief) && known(P.specificsOutsideBrief) ? L.specificsOutsideBrief <= P.specificsOutsideBrief : null,
    manifest: L ? L.manifestGaps === 0 : null,
    spread: spread.loop && spread.pasted ? spread.loop.lengthCv <= spread.pasted.lengthCv : null,
  };
  return { ...bars, all: Object.values(bars).every((x) => x === true) };
}

/** Run-to-run spread on the counted metrics, from repeats of the same brief (needs --repeats ≥ 2). */
function spreadOf(reg, r, read) {
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

// ── blind: the human read packet ───────────────────────────────────────────────────────────────────────
// Pairs of Atelier (the loop arm) against the strongest baseline, both sides masked the same way (every
// figure, name, date and link replaced), the side order seeded, the key written apart and hashed.
function blind() {
  const p = plan(); const against = opt('against', 'pasted'); const rnd = mulberry32(Number(opt('seed', p.seed)));
  const pairs = []; const key = [];
  for (const [reg, r] of Object.entries(p.registers)) for (const f of r.test) {
    // ONE DRAW PER BRIEF, AND ITS OPPOSITE: each brief is read in both orders, so position bias cancels.
    const base = rnd() < 0.5;
    for (const order of [0, 1]) {
    const a = join(work, reg, 'out', 'test', 'loop', `${basename(f, '.md')}.0.md`); const b = join(work, reg, 'out', 'test', against, `${basename(f, '.md')}.0.md`);
    if (!existsSync(a) || !existsSync(b)) continue;
    const flip = order === 0 ? base : !base;
    const [left, right] = flip ? [b, a] : [a, b];
    const id = `${reg}-${basename(f, '.md')}-${order}`;
    pairs.push({ id, register: reg, brief: mask(p.registers[reg].briefs[f].text), A: mask(readFileSync(left, 'utf8')), B: mask(readFileSync(right, 'utf8')) });
    key.push({ id, register: reg, brief: f, A: flip ? against : 'loop', B: flip ? 'loop' : against });
    }
  }
  const shuffled = pairs.map((x) => ({ x, k: rnd() })).sort((m, n) => m.k - n.k).map((m) => m.x);
  writeJ(join(work, 'blind', 'pairs.json'), shuffled);
  writeFileSync(join(work, 'blind', 'packet.md'), shuffled.map((x) => `## ${x.id}\n\n**Brief.** ${x.brief}\n\n### A\n\n${x.A}\n\n### B\n\n${x.B}\n\nWhich reads more like the author? (A / B)\n`).join('\n---\n\n'));
  const keyText = JSON.stringify(key, null, 1);
  writeFileSync(join(work, 'blind', 'KEY.json'), keyText);
  writeFileSync(join(work, 'blind', 'labels.csv'), `id,reader,choice\n${shuffled.map((x) => `${x.id},,`).join('\n')}\n`);
  console.log(`${shuffled.length} pair(s). Give readers packet.md and labels.csv only. KEY.json sha256 ${createHash('sha256').update(keyText).digest('hex')}: send this hash to the readers before the first label, and keep KEY.json closed until every label is in.`);
}

function mask(t) {
  let out = t;
  for (const f of factLedger(t).sort((a, b) => b.text.length - a.text.length)) out = out.split(f.text).join(`[${f.kind}]`);
  return out;
}

// ── score: the pre-registered decision on the human labels ─────────────────────────────────────────────
// Preference share for the loop arm per register, with a bootstrap that resamples briefs with their reads.
function score() {
  const key = new Map(readJ(join(work, 'blind', 'KEY.json')).map((k) => [k.id, k]));
  const rows = readFileSync(resolve(opt('labels') ?? die('--labels <csv>')), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')).filter((r) => r[2]);
  const by = {};
  for (const [id, reader, choice] of rows) {
    const k = key.get(id); if (!k) continue;
    const reg = k.register; const brief = k.brief;
    const side = choice.trim().toUpperCase();
    if (side !== 'A' && side !== 'B') continue;   // an unreadable label is left out, never counted as a loss
    const won = k[side] === 'loop' ? 1 : 0;
    ((by[reg] ??= {})[brief] ??= []).push({ reader, won });
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
    out[reg] = { reads: all.length, briefs: groups.length, share: round(share), ci95: [round(lo), round(boots[Math.floor(0.975 * boots.length)])], passes: share >= 0.6 && lo > 0.5 };
  }
  // SECTION 6: the read passes AND every counted bar holds, per register; in four or more, none below 0.50.
  const counted = existsSync(join(work, 'results.json')) ? readJ(join(work, 'results.json')).registers : {};
  for (const [reg, x] of Object.entries(out)) {
    x.countedBars = counted[reg]?.bars ?? null;
    x.exploratory = counted[reg]?.exploratory ?? null;
    x.holds = x.passes && x.countedBars?.all === true && x.exploratory === false;
  }
  const passing = Object.values(out).filter((x) => x.holds).length;
  const worst = Math.min(...Object.values(out).map((x) => x.share));
  const verdict = { registers: out, passing, holds: passing >= 4 && worst >= 0.5,
    ...(Object.keys(counted).length ? {} : { note: 'results.json is missing: run evaluate first; no register can hold without its counted bars' }) };
  writeJ(join(work, 'blind', 'score.json'), verdict);
  console.log(JSON.stringify(verdict, null, 1));
}

const mean = (xs) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const round = (x) => Math.round(x * 1000) / 1000;

const steps = { prepare, build, generate, evaluate, blind, score };
if (!steps[cmd]) die(`usage: node bench/b6/run.mjs <${Object.keys(steps).join('|')}> --work <dir> …`);
await steps[cmd]();
