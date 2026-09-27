#!/usr/bin/env node
// A VOICE ROUND: SEVERAL BRIEFS, SEVERAL WAYS OF ASKING, JUDGED MOSTLY BY THINGS A MODEL CANNOT SWAY.
//
// Not the pre-registered proof study (../PROOF_STUDY_PREREGISTRATION.md), which waits on an owner's
// own corpus and house standard: the smaller comparison that can be rerun on any skill built from
// someone's pieces. It decides nothing itself; every count comes from the built product in dist/.
//
// Arms (each brief, same model, same length target written into the brief):
//   RAW             "write in the voice of <author>", nothing else
//   CONTEXT         the author's readable pieces pasted into the prompt
//   GUIDE           the model reads those pieces, writes its own style guide, then writes from it
//   <NAME>          `atelier invoke` on a skill in ATELIER_DATA, one arm per --atelier NAME=<skill>
//   CONTEXT_GUARD   with --guard-skill: CONTEXT's draft, repaired by `atelier verify --repair` (paired)
//   GUIDE_GUARD     the same, on GUIDE's draft
//   ATELIER_BEFORE  optional: an earlier build in another store (--before-data, --before-skill)
//
// Judged, per output, in this order of weight:
//   1. STYLOMETRY   Burrows' Delta to the author's RESERVED pieces (never shown to any arm) against the
//                   model's own plain voice (the RAW outputs of the other briefs). Topic-robust, and it
//                   does not reward lifting phrases. Positive = closer to the author than to the model.
//   2. COPYING      the longest run of words shared with the corpus, and the number of shared 6-grams:
//                   imitation that lifts the author's lines is recall, not voice
//   3. INVENTION    first-person stories and figures with no source (core/loop/claims.ts)
//   4. VOICE        the author's own habits per 1,000 words (first person, dialect, one-line paragraphs,
//                   dash asides, bold, questions) and the model's tells, beside the reserved pieces' rates
//   5. RULES        the skill's REQUIRED measured rules, applied to every arm
//   6. A MODEL      a ranking by a model other than the writer (--judge-model), both orders, as a
//                   second opinion only: a model judge rewards what models write
// And blind files per brief for the owner, whose ranking is the result that matters.
//
// Usage:
//   node studies/harness/voice-round.mjs --skill <name> --corpus <folder> --author "<name>" \
//        --briefs <file: one brief per paragraph> --out <folder> \
//        [--atelier ATELIER=<skill>]... [--guard-skill <skill>] \
//        [--before-data <dir> --before-skill <name> --before-project <dir>] \
//        [--model claude-opus-5] [--judge-model claude-fable-5] [--seed 3]

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import * as store from '../../dist/core/state/store.js';
import { checkDraft } from '../../dist/core/loop/run-repair.js';
import { patternRate, proseWords, deltaReference, styleDistanceDocs } from '../../dist/core/observers/style.js';
import { unsourcedClaims } from '../../dist/core/loop/claims.js';
import { quantile } from '../../dist/core/observers/text.js';
import { overlapIndex } from '../../dist/core/observers/overlap.js';
import { displacedFamilies, findPattern } from '../../dist/core/observers/style.js';
import { seededShuffle } from '../../dist/core/contract/analysis.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const need = (n) => arg(n) ?? (console.error(`missing ${n}`), process.exit(2));
const SKILL = need('--skill'); const CORPUS = need('--corpus'); const AUTHOR = need('--author');
const BRIEFS = readFileSync(need('--briefs'), 'utf8').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
const OUT = resolve(need('--out'));
const MODEL = arg('--model', 'claude-opus-5'); const JUDGE = arg('--judge-model', 'claude-fable-5');
const SEED = Number(arg('--seed', '3'));
const DATA = process.env.ATELIER_DATA ?? (console.error('ATELIER_DATA must point at the skill\'s store'), process.exit(2));
const argAll = (n) => process.argv.flatMap((x, i) => (x === n ? [process.argv[i + 1]] : []));
const ATELIER_ARMS = argAll('--atelier').length ? argAll('--atelier').map((x) => { const [arm, skill] = x.split('='); return { arm, skill }; }) : [{ arm: 'ATELIER', skill: SKILL }];
const GUARD = arg('--guard-skill');
const BEFORE = arg('--before-data') ? { data: arg('--before-data'), skill: need('--before-skill'), project: need('--before-project') } : null;
mkdirSync(OUT, { recursive: true });

// ── The corpus, and the pieces reserved from every arm ────────────────────────────────────────────
const reservedIn = (data) => readdirSync(join(data, 'sessions')).flatMap((f) =>
  (JSON.parse(readFileSync(join(data, 'sessions', f), 'utf8')).reservation?.reserved ?? []).map((u) => u.artifact.trim()));
const reservedTexts = new Set(reservedIn(DATA));
const pieces = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort().map((f) => ({ f, text: readFileSync(join(CORPUS, f), 'utf8').trim() }));
const reserved = pieces.filter((p) => reservedTexts.has(p.text));
const readable = pieces.filter((p) => !reservedTexts.has(p.text));
if (reserved.length < 2) { console.error(`stylometry needs at least two reserved pieces; found ${reserved.length}.`); process.exit(2); }
if (BEFORE && [...reservedIn(BEFORE.data)].some((t) => !reservedTexts.has(t))) { console.error('the earlier build reserved different pieces; the comparison would not be fair.'); process.exit(2); }
const lengths = readable.map((p) => proseWords(p.text));
const band = [Math.round(quantile(lengths, 0.25) / 100) * 100, Math.round(quantile(lengths, 0.75) / 100) * 100];
console.log(`corpus: ${readable.length} readable, ${reserved.length} reserved; length target ${band[0]}-${band[1]} words; ${BRIEFS.length} brief(s)`);

const writer = new AnthropicInferenceClient(MODEL);
const judge = new AnthropicInferenceClient(JUDGE);
let spent = 0;
const PIECE = { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'] };
const call = async (c, system, user, tool, schema, maxTokens) => {
  const r = await c.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: tool, toolDescription: tool, schema, maxTokens });
  spent += r.cost?.billingUsd ?? 0;
  return r.json ?? {};
};
const write = async (system, user) => String((await call(writer, system, user, 'emit_piece', PIECE, 12000)).piece ?? '').trim();
const WRITER = 'You are a writer. Return only the finished piece, in markdown.';
const corpusBlock = readable.map((p) => `<piece>\n${p.text}\n</piece>`).join('\n\n');
const guide = String((await call(writer, 'You are an editor who writes precise, usable style guides.',
  `Here are pieces by ${AUTHOR}:\n\n${corpusBlock}\n\nWrite a style guide another writer could follow to write exactly like this author: voice, argument, structure, vocabulary, figures, pace, formatting, openings and closings, and what they never do. Be specific.`,
  'emit_guide', { type: 'object', properties: { guide: { type: 'string' } }, required: ['guide'] }, 12000)).guide ?? '');
writeFileSync(join(OUT, 'guide.md'), guide);

const invoke = (env, skill, task) => {
  const out = execFileSync('node', [resolve('dist/cli/atelier.mjs'), 'invoke', '--skill', skill, '--task', task, '--target-model', MODEL],
    { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 24 });
  const cost = /\$([0-9.]+)\s*$/m.exec(out.split('\n').find((l) => l.startsWith('invocation ')) ?? '');
  spent += cost ? Number(cost[1]) : 0;
  const L = { root: env.ATELIER_DATA, skillName: skill };
  return { text: store.listInvocations(L).sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1).output.trim(), log: out };
};

// The guard on a draft written elsewhere: `atelier verify --repair`, the product's own command.
const guardLog = [];
const guard = (skill, text, bi, base) => {
  const work = join(OUT, '.work'); mkdirSync(work, { recursive: true });
  const f = join(work, `draft-${bi + 1}-${base}.md`); writeFileSync(f, text);
  let out;
  try {
    out = execFileSync('node', [resolve('dist/cli/atelier.mjs'), 'verify', '--skill', skill, f, '--repair', '--json', '--target-model', MODEL],
      { encoding: 'utf8', env: process.env, maxBuffer: 1 << 24 });
  } catch (e) { out = e.stdout; }   // exit 1 means some REQUIRED rule is still broken; the JSON is still there
  const j = JSON.parse(out);
  spent += j.spentUsd ?? 0;
  guardLog.push({ brief: bi + 1, base, why: j.repair?.why ?? 'nothing to repair', displaced: displacedFamilies(text, j.output) });
  return j.output.trim();
};

// ── Generate ──────────────────────────────────────────────────────────────────────────────────────
const rounds = [];
for (const [bi, brief] of BRIEFS.entries()) {
  const task = `${brief}\n\nAim for about ${band[0]} to ${band[1]} words.`;
  const arms = {};
  arms.RAW = await write(WRITER, `${task}\n\nWrite it in the voice and style of ${AUTHOR}.`);
  arms.CONTEXT = await write(WRITER, `Here are pieces by ${AUTHOR}:\n\n${corpusBlock}\n\n${task}\n\nWrite it in their voice and style.`);
  arms.GUIDE = await write(`${WRITER}\n\nFollow this style guide:\n\n${guide}`, task);
  const logs = [];
  for (const { arm, skill } of ATELIER_ARMS) {
    const r = invoke({ ATELIER_DATA: DATA, ATELIER_PROJECT_DIR: process.env.ATELIER_PROJECT_DIR }, skill, task);
    arms[arm] = r.text; logs.push(`── ${arm} (${skill}) ──\n${r.log}`);
  }
  if (GUARD) for (const base of ['CONTEXT', 'GUIDE']) arms[`${base}_GUARD`] = guard(GUARD, arms[base], bi, base);
  if (BEFORE) arms.ATELIER_BEFORE = invoke({ ATELIER_DATA: BEFORE.data, ATELIER_PROJECT_DIR: BEFORE.project }, BEFORE.skill, task).text;
  const dir = join(OUT, `brief-${bi + 1}`); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'atelier-invoke.log'), logs.join('\n\n'));
  rounds.push({ brief, task, arms, dir });
  console.log(`brief ${bi + 1}/${BRIEFS.length} written`);
}

// ── Measure ───────────────────────────────────────────────────────────────────────────────────────
const overlap = overlapIndex(readable.map((p) => p.text));
const FEATURES = ['CONTRACTION', 'FULL_FORM', 'RATHER_THAN', 'REFRAME', 'ORDINAL_CATALOGUE', 'FIRST_PERSON', 'BRITISH_SPELLING', 'AMERICAN_SPELLING', 'ONE_LINE_PARAGRAPH', 'DASH_ASIDE', 'BOLD_SPAN', 'RHETORICAL_QUESTION', 'EM_DASH', 'NOT_X_ITS_Y', 'INTENSIFIER', 'SIGNPOST', 'THAT_OPENER'];
const round1 = (x) => Math.round(x * 10) / 10;
const authorFeatures = Object.fromEntries(FEATURES.map((p) => [p, round1(reserved.reduce((s, x) => s + patternRate(x.text, p), 0) / reserved.length)]));
const L = { root: DATA, skillName: SKILL };
const v = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)).standardVersionHash);
const names = Object.keys(rounds[0].arms);
const rows = [];
for (const [bi, r] of rounds.entries()) {
  // The model's own voice: its RAW drafts on the OTHER briefs (never this one, which would be judged against itself).
  const modelRef = rounds.filter((_, j) => j !== bi).map((x) => x.arms.RAW);
  const ref = deltaReference(reserved.map((p) => p.text), modelRef.length >= 2 ? modelRef : rounds.map((x) => x.arms.RAW));
  for (const a of names) {
    const t = r.arms[a];
    const d = styleDistanceDocs(t, ref);
    const report = checkDraft(SKILL, v, t, { guardClaims: false });
    const req = report.checked.filter((c) => c.materiality === 'REQUIRED');
    const claims = unsourcedClaims(t, '');
    const c = findPattern(t, 'CONTRACTION').length; const w = findPattern(t, 'FULL_FORM').length;
    rows.push({ brief: bi + 1, arm: a, words: proseWords(t), contractionShare: c + w ? Math.round((c / (c + w)) * 100) / 100 : null,
      placeholders: (t.match(/\[(?:your|figure|source|evidence)[^\]]*\]/gi) ?? []).length, stylometry: Math.round((d.model - d.author) * 1000) / 1000,
      ...overlap(t),
      inventedStories: claims.filter((c) => c.kind === 'EXPERIENCE').length, unsourcedFigures: claims.filter((c) => c.kind === 'FIGURE').length,
      requiredHeld: `${req.filter((c) => c.result.verdict !== 'VIOLATED').length}/${req.length}`,
      features: Object.fromEntries(FEATURES.map((p) => [p, round1(patternRate(t, p))])) });
  }
}

// ── A second opinion: a different model ranks the arms, twice in shuffled orders ─────────────────────
let draw = SEED;
const shuffle = (xs) => seededShuffle(xs, draw++);
const RANK = { type: 'object', properties: { ranking: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } }, required: ['ranking', 'why'] };
const reference = reserved.map((p) => `<reference>\n${p.text}\n</reference>`).join('\n\n');
const modelRanks = [];
for (const [bi, r] of rounds.entries()) {
  for (let pass = 0; pass < 2; pass++) {
    const order = shuffle(names); const labels = order.map((_, i) => String.fromCharCode(65 + i));
    const j = await call(judge, 'You compare texts with an author\'s own writing and rank them by how much they read like the author wrote them: voice, stance, word choice, pace, structure. Ignore topic, and do not reward a text for reusing the author\'s own phrases.',
      `THE AUTHOR'S OWN PIECES\n${reference}\n\n${order.map((a, i) => `TEXT ${labels[i]}\n"""\n${r.arms[a]}\n"""`).join('\n\n')}\n\nRank every text, most like the author first, by letter.`,
      'emit_ranking', RANK, 1500);
    const ranking = (j.ranking ?? []).map((l) => order[labels.indexOf(String(l).trim().charAt(0).toUpperCase())]).filter(Boolean);
    ranking.forEach((a, i) => modelRanks.push({ brief: bi + 1, pass, arm: a, rank: i + 1 }));
  }
}

// ── Blind files for the owner ─────────────────────────────────────────────────────────────────────
const LETTERS = 'KLMNPQRS';
const key = {};
for (const [bi, r] of rounds.entries()) {
  const order = shuffle(names);
  key[`brief-${bi + 1}`] = Object.fromEntries(order.map((a, i) => [LETTERS[i], a]));
  order.forEach((a, i) => writeFileSync(join(r.dir, `${LETTERS[i]}.md`), r.arms[a]));
  writeFileSync(join(r.dir, 'BRIEF.md'), `${r.task}\n`);
}
writeFileSync(join(OUT, 'KEY-open-after-judging.json'), JSON.stringify(key, null, 1));
writeFileSync(join(OUT, 'README.md'), `# Voice round\n\n${rounds.length} brief(s), ${names.length} versions each, as letters in brief-N/. For each brief, rank the letters for sounding like ${AUTHOR}, and mark the sentences that read machine-written. Then open KEY-open-after-judging.json and REPORT.md.\n`);

// ── Report ────────────────────────────────────────────────────────────────────────────────────────
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const by = (a) => rows.filter((x) => x.arm === a);
const fmt = (x) => (Math.round(x * 100) / 100).toString();
const results = { guardLog, briefs: BRIEFS, model: MODEL, judgeModel: JUDGE, lengthTarget: band, reserved: reserved.map((p) => p.f), key, rows, modelRanks, authorFeatures, spentUsd: Math.round(spent * 100) / 100 };
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
const lines = ['# Voice round: results (open after judging)', '',
  `${rounds.length} brief(s); writer ${MODEL}; second-opinion judge ${JUDGE}; length target ${band[0]}-${band[1]} words; spent about $${results.spentUsd}.`, '',
  '## Across briefs (means)', '',
  '| arm | stylometry (+ = closer to the author\'s reserved pieces) | model judge mean rank | contraction share | longest run shared with corpus | shared 6-grams | invented stories | unsourced figures | placeholders | REQUIRED held | words |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...names.map((a) => { const r = by(a); return `| ${a} | ${fmt(mean(r.map((x) => x.stylometry)))} | ${fmt(mean(modelRanks.filter((m) => m.arm === a).map((m) => m.rank)))} | ${fmt(mean(r.map((x) => x.contractionShare ?? 0)))} | ${Math.max(...r.map((x) => x.longestShared))} | ${fmt(mean(r.map((x) => x.shared6)))} | ${r.reduce((n, x) => n + x.inventedStories, 0)} | ${r.reduce((n, x) => n + x.unsourcedFigures, 0)} | ${r.reduce((n, x) => n + x.placeholders, 0)} | ${r.map((x) => x.requiredHeld).join(' ')} | ${Math.round(mean(r.map((x) => x.words)))} |`; }),
  '', '## The guard on drafts written elsewhere', '', '| brief | draft | outcome | displaced families |', '|---|---|---|---|',
  ...guardLog.map((g) => `| ${g.brief} | ${g.base} | ${g.why} | ${g.displaced.join('; ') || 'none'} |`),
  '', '## Voice features per 1,000 words (means across briefs)', '',
  `| arm | ${FEATURES.join(' | ')} |`, `|---|${FEATURES.map(() => '---').join('|')}|`,
  `| ${AUTHOR}, reserved pieces | ${FEATURES.map((p) => authorFeatures[p]).join(' | ')} |`,
  ...names.map((a) => `| ${a} | ${FEATURES.map((p) => fmt(mean(by(a).map((x) => x.features[p])))).join(' | ')} |`),
  '', '## Per brief: stylometry', '', `| brief | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`,
  ...rounds.map((_, bi) => `| ${bi + 1} | ${names.map((a) => fmt(rows.find((x) => x.brief === bi + 1 && x.arm === a).stylometry)).join(' | ')} |`),
  '', 'Stylometry is computed against pieces no arm saw, and does not reward lifted phrases. A model judge is one reader, and a model like the one that wrote these. Your blind ranking is the result that matters.'];
writeFileSync(join(OUT, 'REPORT.md'), lines.join('\n'));
console.log(`done: ${OUT}; spent about $${results.spentUsd}`);
