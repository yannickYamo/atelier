#!/usr/bin/env node
// PHASE C, STEP 1: WRITE EVERY ARM, PRIVATELY (studies/PHASE_C_PREREGISTRATION.md).
//
// Three arms per brief, the same facts bound to each:
//   ATELIER         `atelier invoke` on the expert's skill, as shipped (two drafts, check, repair), facts via --with
//   CONTEXT_GUARD   the expert's readable pieces pasted into the prompt with the facts, then `atelier verify --repair`
//                   on the same skill with the same facts (the guard), so the comparison is the standard, not the guard
//   GUIDE           the model writes its own style guide from the same pieces once per expert, then writes from it
//
// Everything goes to a PRIVATE folder (--gen). Nothing a reader sees is written here: round 7 kept an arm's log
// beside its letter file, and only a manual copy stopped a reader from matching them. Readers get only what
// phase-c-package.mjs copies, and it refuses anything but the brief and the letters.
//
// For every arm it records: words, redraws, cost, the invocation record's instruments (claim reader and version,
// taste VETO set, learned-tells hash, format, flags), and the text's profile on EVERY counted feature, so the
// study can later ask which features track the human ranks. No statistic is computed here.
//
// Usage (repository root, after npm run build; ANTHROPIC_API_KEY set):
//   node studies/harness/phase-c-generate.mjs --plan <dir with pairs.json, briefs.jsonl, facts/> --gen <private dir>
//        [--writer claude-opus-5] [--cap 150] [--only <briefId>]

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { ANTHROPIC_PRICING, priceFor } from '../../dist/providers/pricing.js';
import { spend } from '../../dist/core/inference/client.js';
import * as store from '../../dist/core/state/store.js';
import { FEATURES } from '../../dist/core/observers/features.js';
import { wordsOf } from '../../dist/core/observers/text.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const PLAN = resolve(arg('--plan') ?? (console.error('missing --plan'), process.exit(2)));
const GEN = resolve(arg('--gen') ?? (console.error('missing --gen'), process.exit(2)));
const WRITER = arg('--writer', 'claude-opus-5');
const CAP = Number(arg('--cap', '150'));
const ONLY = arg('--only');
const CLI = resolve('dist/cli/atelier.mjs');
const LENGTH_TOLERANCE = 0.3;

const pairs = JSON.parse(readFileSync(join(PLAN, 'pairs.json'), 'utf8'));
const briefs = readFileSync(join(PLAN, 'briefs.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const pairOf = (expert) => pairs.find((p) => p.expert === expert) ?? (console.error(`no pair for expert ${expert}`), process.exit(2));
mkdirSync(GEN, { recursive: true });

const budget = { spentUsd: 0, capUsd: CAP };
const writer = new AnthropicInferenceClient(WRITER, undefined, priceFor(ANTHROPIC_PRICING, WRITER));
const write = (system, user) => spend(budget, 0.3, async () => {
  const x = await writer.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
    schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false }, maxTokens: 16000 });
  return { value: typeof x.json?.piece === 'string' ? x.json.piece : '', cost: x.cost };
});
const words = (t) => wordsOf(t).length;
const inBand = (t, target) => Math.abs(words(t) - target) <= target * LENGTH_TOLERANCE;

/** The expert's pieces a pasted-examples arm may see: the corpus minus what the skill's discovery reserved. */
function readablePieces(pair) {
  const reserved = new Set(readdirSync(join(pair.data, 'sessions')).flatMap((f) => {
    try { return (JSON.parse(readFileSync(join(pair.data, 'sessions', f), 'utf8')).reservation?.reserved ?? []).map((u) => u.artifact.trim()); } catch { return []; }
  }));
  return readdirSync(pair.corpus).filter((f) => f.endsWith('.md')).sort().map((f) => readFileSync(join(pair.corpus, f), 'utf8')).filter((t) => !reserved.has(t.trim()));
}

function cli(pair, args, input = null) {
  const proj = mkdtempSync(join(tmpdir(), 'phase-c-proj-'));
  try {
    return { out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, input: input ?? undefined,
      env: { ...process.env, ATELIER_DATA: pair.data, ATELIER_PROJECT_DIR: proj, ATELIER_PROVENANCE: 'STUDY' }, maxBuffer: 64 * 1024 * 1024 }), code: 0 };
  } catch (e) { return { out: `${e.stdout ?? ''}${e.stderr ?? ''}`, code: e.status ?? 1 }; }
}

function profileOf(pair, text) {
  const f = join(mkdtempSync(join(tmpdir(), 'phase-c-prof-')), 'd.md'); writeFileSync(f, text);
  const r = cli(pair, ['verify', '--skill', pair.skill, f, '--profile', '--json', '--claims', 'pattern']);
  let skill = null; try { skill = JSON.parse(r.out.slice(r.out.indexOf('{'))).profile ?? null; } catch { skill = null; }
  return { skill, features: Object.fromEntries(FEATURES.map((x) => [x.id, x.measure(text)])) };
}

async function atelierArm(pair, b, factsFile) {
  const L = { root: pair.data, skillName: pair.skill };
  let rec = null; let redraws = 0;
  for (let t = 0; t < 2; t++) {
    const before = new Set(store.listInvocations(L).map((i) => i.invocationId));
    const r = cli(pair, ['invoke', '--skill', pair.skill, `${b.brief}\n\nAbout ${b.words} words.`, '--with', `facts=${factsFile}`]);
    rec = store.listInvocations(L).find((i) => !before.has(i.invocationId)) ?? null;
    if (!rec) throw new Error(`invoke produced no record for ${b.id}: ${r.out.split('\n').slice(-3).join(' ')}`);
    if (inBand(rec.output, b.words)) break;
    redraws += 1;
  }
  return { text: rec.output, redraws, record: { invocationId: rec.invocationId, skillVersionHash: rec.skillVersionHash,
    study: rec.study ?? null, instruments: rec.instruments ?? null, selection: rec.selection ?? null, repair: rec.repair ? { violatedBefore: rec.repair.violatedBefore, violatedAfter: rec.repair.violatedAfter } : null } };
}

async function contextGuardArm(pair, b, facts, factsFile) {
  const pieces = readablePieces(pair);
  const system = `You write in the voice of the author of the pieces below. Match how they write; do not copy their sentences.\n\n${pieces.map((p, i) => `<piece ${i + 1}>\n${p}\n</piece>`).join('\n\n')}`;
  let draft = ''; let redraws = 0;
  for (let t = 0; t < 2; t++) {
    draft = await write(system, `${b.brief}\n\nAbout ${b.words} words.\n\nFacts you may use (use no other specifics):\n${facts}\n\nOutput only the piece.`);
    if (inBand(draft, b.words)) break; redraws += 1;
  }
  const f = join(mkdtempSync(join(tmpdir(), 'phase-c-guard-')), 'd.md'); writeFileSync(f, draft);
  const r = cli(pair, ['verify', '--skill', pair.skill, f, '--repair', '--with', `facts=${factsFile}`, '--task', b.brief, '--json']);
  let guarded = draft; try { guarded = JSON.parse(r.out.slice(r.out.indexOf('{'))).output ?? draft; } catch { /* the guard could not run: the draft stands, and it is recorded */ }
  return { text: guarded, redraws, record: { guardExit: r.code, preGuardWords: words(draft) } };
}

const guides = new Map();
async function guideArm(pair, b, facts) {
  if (!guides.has(pair.expert)) {
    const pieces = readablePieces(pair);
    guides.set(pair.expert, await write('You are an editor.', `Read these pieces by one author and write a style guide another writer could follow to sound like them.\n\n${pieces.map((p, i) => `<piece ${i + 1}>\n${p}\n</piece>`).join('\n\n')}`));
    writeFileSync(join(GEN, `guide-${pair.expert}.md`), guides.get(pair.expert));
  }
  let draft = ''; let redraws = 0;
  for (let t = 0; t < 2; t++) {
    draft = await write(`Write following this style guide.\n\n${guides.get(pair.expert)}`, `${b.brief}\n\nAbout ${b.words} words.\n\nFacts you may use (use no other specifics):\n${facts}\n\nOutput only the piece.`);
    if (inBand(draft, b.words)) break; redraws += 1;
  }
  return { text: draft, redraws, record: {} };
}

for (const b of briefs) {
  if (ONLY && b.id !== ONLY) continue;
  const dir = join(GEN, b.id);
  if (existsSync(join(dir, 'meta.json'))) { console.log(`${b.id}: done already`); continue; }
  mkdirSync(dir, { recursive: true });
  const pair = pairOf(b.expert);
  const factsFile = resolve(PLAN, b.facts); const facts = readFileSync(factsFile, 'utf8');
  const meta = { brief: b, arms: {} };
  for (const [arm, run] of [['ATELIER', () => atelierArm(pair, b, factsFile)], ['CONTEXT_GUARD', () => contextGuardArm(pair, b, facts, factsFile)], ['GUIDE', () => guideArm(pair, b, facts)]]) {
    const spentBefore = budget.spentUsd;
    const r = await run();
    writeFileSync(join(dir, `${arm}.md`), r.text);
    meta.arms[arm] = { words: words(r.text), redraws: r.redraws, harnessUsd: Math.round((budget.spentUsd - spentBefore) * 1000) / 1000, record: r.record, profile: profileOf(pair, r.text) };
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(`${b.id} (${b.expert}, ${b.format}, ${b.kind}): ${Object.entries(meta.arms).map(([a, m]) => `${a} ${m.words}w`).join(', ')}  ($${budget.spentUsd.toFixed(2)} harness)`);
}
