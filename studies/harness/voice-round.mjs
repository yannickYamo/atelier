#!/usr/bin/env node
// A VOICE ROUND: ONE BRIEF, FOUR WAYS OF ASKING, JUDGED THREE WAYS. RE-RUNNABLE, EXPLORATORY.
//
// This is not the pre-registered proof study (../PROOF_STUDY_PREREGISTRATION.md), which waits on an
// owner's own corpus and house standard. It is the smaller comparison that can be rerun on any skill
// built from someone's pieces, and it decides nothing itself: every count comes from the built product.
//
//   arms     RAW        "write in the voice of <author>", nothing else
//            CONTEXT    the corpus pasted into the prompt (reserved pieces left out)
//            GUIDE      the model reads the corpus, writes its own style guide, then writes from it
//                       (a reflective, GEPA-like prompt, without the search)
//            ATELIER    `atelier invoke` on the skill, the product as shipped
//   judged   1. by you, blind: the outputs are written as letters, the key in a separate file
//            2. by a model, pairwise, both orders, against the author's RESERVED pieces (never shown to
//               any arm); a pair counts only when both orders agree
//            3. deterministically: every measured rule of the skill's standard, plus the model tells,
//               on every output
//
// Usage (the skill must already be built; ATELIER_DATA and ATELIER_PROJECT_DIR point at its store):
//   node studies/harness/voice-round.mjs --skill <name> --corpus <folder> --author "<name>" \
//        --task "<brief>" --out <folder> [--model claude-opus-5] [--judge-model claude-opus-5] [--seed 3]
//
// Spend: four generations (CONTEXT carries the whole corpus as input), one guide, and twelve judge
// calls. It prints what it spent.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import * as store from '../../dist/core/state/store.js';
import { checkDraft } from '../../dist/core/loop/run-repair.js';
import { patternRate, PATTERN_IDS } from '../../dist/core/observers/style.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const need = (n) => arg(n) ?? (console.error(`missing ${n}`), process.exit(2));
const SKILL = need('--skill'); const CORPUS = need('--corpus'); const AUTHOR = need('--author');
const TASK = need('--task'); const OUT = resolve(need('--out'));
const MODEL = arg('--model', 'claude-opus-5'); const JUDGE = arg('--judge-model', MODEL);
const SEED = Number(arg('--seed', '3'));
const DATA = process.env.ATELIER_DATA ?? (console.error('ATELIER_DATA must point at the skill\'s store'), process.exit(2));
mkdirSync(OUT, { recursive: true });

// ── The corpus, and the pieces reserved from every arm ────────────────────────────────────────────
const sessionDir = join(DATA, 'sessions');
const reservedTexts = readdirSync(sessionDir).flatMap((f) => {
  const s = JSON.parse(readFileSync(join(sessionDir, f), 'utf8'));
  return (s.reservation?.reserved ?? []).map((u) => u.artifact.trim());
});
const pieces = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort().map((f) => ({ f, text: readFileSync(join(CORPUS, f), 'utf8').trim() }));
const reserved = pieces.filter((p) => reservedTexts.includes(p.text));
const readable = pieces.filter((p) => !reservedTexts.includes(p.text));
if (reserved.length < 2) { console.error(`the judge needs at least two reserved pieces; found ${reserved.length}.`); process.exit(2); }
console.log(`corpus: ${readable.length} readable piece(s), ${reserved.length} reserved (the judge's reference only)`);

const client = new AnthropicInferenceClient(MODEL);
const judge = new AnthropicInferenceClient(JUDGE);
let spent = 0;
const PIECE = { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'] };
const write = async (c, system, user, maxTokens = 8000) => {
  const r = await c.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: 'emit_piece',
    toolDescription: 'The finished piece, in markdown.', schema: PIECE, maxTokens });
  spent += r.cost?.billingUsd ?? 0;
  return String(r.json?.piece ?? '').trim();
};
const WRITER = 'You are a writer. Return only the finished piece, in markdown.';
const corpusBlock = readable.map((p) => `<piece>\n${p.text}\n</piece>`).join('\n\n');

// ── The four arms ─────────────────────────────────────────────────────────────────────────────────
const arms = {};
arms.RAW = await write(client, WRITER, `${TASK}\n\nWrite it in the voice and style of ${AUTHOR}.`);
arms.CONTEXT = await write(client, WRITER, `Here are pieces by ${AUTHOR}:\n\n${corpusBlock}\n\n${TASK}\n\nWrite it in their voice and style.`);
const GUIDE_SCHEMA = { type: 'object', properties: { guide: { type: 'string' } }, required: ['guide'] };
const g = await client.complete({ stableBlock: 'You are an editor who writes precise, usable style guides.', variableBlock: '',
  userMessage: `Here are pieces by ${AUTHOR}:\n\n${corpusBlock}\n\nWrite a style guide another writer could follow to write exactly like this author: voice, argument, structure, vocabulary, figures, pace, formatting, openings and closings, and what they never do. Be specific.`,
  toolName: 'emit_guide', toolDescription: 'The style guide.', schema: GUIDE_SCHEMA, maxTokens: 6000 });
spent += g.cost?.billingUsd ?? 0;
writeFileSync(join(OUT, 'guide.md'), String(g.json?.guide ?? ''));
arms.GUIDE = await write(client, `${WRITER}\n\nFollow this style guide:\n\n${String(g.json?.guide ?? '')}`, TASK);
const inv = execFileSync('node', [resolve('dist/cli/atelier.mjs'), 'invoke', '--skill', SKILL, '--task', TASK, '--target-model', MODEL],
  { encoding: 'utf8', env: process.env, maxBuffer: 1 << 24 });
writeFileSync(join(OUT, 'atelier-invoke.log'), inv);
const L = { root: DATA, skillName: SKILL };
const last = store.listInvocations(L).sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1);
arms.ATELIER = last.output.trim();
const cost = /\$([0-9.]+)\s*$/m.exec(inv.split('\n').find((l) => l.startsWith('invocation ')) ?? '');
spent += cost ? Number(cost[1]) : 0;

// ── Blind files for the owner ─────────────────────────────────────────────────────────────────────
const names = Object.keys(arms);
let s = SEED; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const letters = ['K', 'L', 'M', 'N'];
const order = [...names].sort(() => rnd() - 0.5);
const key = Object.fromEntries(order.map((a, i) => [letters[i], a]));
for (const [l, a] of Object.entries(key)) writeFileSync(join(OUT, `${l}.md`), arms[a]);
writeFileSync(join(OUT, 'KEY-open-after-judging.json'), JSON.stringify(key, null, 1));
writeFileSync(join(OUT, 'README.md'), `# Voice round\n\nBrief: ${TASK}\n\n${letters.join(', ')}: rank them for sounding like ${AUTHOR}, and mark every sentence that reads machine-written to you. Then open KEY-open-after-judging.json and REPORT.md.\n`);

// ── The model judge: pairwise, both orders, against the reserved pieces ──────────────────────────
const VERDICT = { type: 'object', properties: { closer: { type: 'string', enum: ['A', 'B', 'TIE'] }, why: { type: 'string' } }, required: ['closer', 'why'] };
const reference = reserved.map((p) => `<reference>\n${p.text}\n</reference>`).join('\n\n');
const pairs = [];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs.push([names[i], names[j]]);
const judged = [];
for (const [x, y] of pairs) {
  const ask = async (a, b) => {
    const r = await judge.complete({ stableBlock: `You compare two texts with an author's own writing. Which reads more like the author wrote it: voice, argument, word choice, pace, structure? Ignore topic and quality otherwise. Answer TIE only if you truly cannot tell.`,
      variableBlock: '', userMessage: `THE AUTHOR'S OWN PIECES\n${reference}\n\nTEXT A\n"""\n${arms[a]}\n"""\n\nTEXT B\n"""\n${arms[b]}\n"""`,
      toolName: 'emit_verdict', toolDescription: 'Which text reads more like the author.', schema: VERDICT, maxTokens: 800 });
    spent += r.cost?.billingUsd ?? 0;
    const c = r.json?.closer; return c === 'A' ? a : c === 'B' ? b : 'TIE';
  };
  const first = await ask(x, y); const second = await ask(y, x);
  judged.push({ pair: `${x} vs ${y}`, first, second, winner: first === second ? first : 'SPLIT' });
}
const wins = Object.fromEntries(names.map((a) => [a, judged.filter((j) => j.winner === a).length]));

// ── Deterministic: every measured rule of the standard, and the model tells ───────────────────────
const sv = store.getSkillVersion(L, store.getActive(L));
const v = store.getStandard(L, sv.standardVersionHash);
const author = PATTERN_IDS.map((p) => [p, readable.reduce((n, x) => n + patternRate(x.text, p), 0) / readable.length]);
const table = names.map((a) => {
  const r = checkDraft(SKILL, v, arms[a], { guardClaims: false });
  const req = r.checked.filter((c) => c.materiality === 'REQUIRED');
  return { arm: a, words: arms[a].split(/\s+/).length, requiredHeld: `${req.filter((c) => c.result.verdict !== 'VIOLATED').length} of ${req.length}`,
    broken: r.checked.filter((c) => c.result.verdict === 'VIOLATED').map((c) => c.requirementId),
    tells: Object.fromEntries(PATTERN_IDS.map((p) => [p, Math.round(patternRate(arms[a], p) * 10) / 10])) };
});
const results = { task: TASK, model: MODEL, judgeModel: JUDGE, reserved: reserved.map((p) => p.f), key, judged, wins, table,
  authorTells: Object.fromEntries(author.map(([p, x]) => [p, Math.round(x * 10) / 10])), spentUsd: Math.round(spent * 1000) / 1000 };
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));

const lines = ['# Voice round: results (open after judging)', '', `Brief: ${TASK}`, `Model: ${MODEL}; judge: ${JUDGE}; spent about $${results.spentUsd}.`, '',
  '## The model judge (pairwise, both orders; a pair counts only when both agree)', '', '| pair | first order | second order | counts as |', '|---|---|---|---|',
  ...judged.map((j) => `| ${j.pair} | ${j.first} | ${j.second} | ${j.winner} |`), '', `Pairs won: ${names.map((a) => `${a} ${wins[a]}`).join(', ')}.`, '',
  '## Deterministic (the skill\'s measured rules; model tells per 1,000 words)', '',
  `| arm | words | REQUIRED held | broken | ${PATTERN_IDS.join(' | ')} |`, `|---|---|---|---|${PATTERN_IDS.map(() => '---').join('|')}|`,
  `| ${AUTHOR} (mean of readable pieces) | | | | ${author.map(([, x]) => Math.round(x * 10) / 10).join(' | ')} |`,
  ...table.map((t) => `| ${t.arm} | ${t.words} | ${t.requiredHeld} | ${t.broken.join(', ') || 'none'} | ${PATTERN_IDS.map((p) => t.tells[p]).join(' | ')} |`), '',
  'A model judge is one reader, and a model like the one that wrote these. Your blind ranking is the result that matters.'];
writeFileSync(join(OUT, 'REPORT.md'), lines.join('\n'));
console.log(`wrote ${Object.keys(key).map((l) => `${l}.md`).join(', ')}, README.md, REPORT.md, results.json to ${OUT}; spent about $${results.spentUsd}`);
