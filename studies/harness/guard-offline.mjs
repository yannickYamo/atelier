#!/usr/bin/env node
// THE GUARD, OFFLINE: EXISTING DRAFTS THROUGH THE CURRENT CHECK-AND-REPAIR, MEASURED BEFORE AND AFTER.
//
// A voice round costs twenty dollars and a day of reading; most of what it can tell us about the guard
// can be learned from the drafts it already produced. This runs every draft of a finished round through
// the product's own `refineToStandard` (dist/), with the learned machine-tell lexicon derived WITHOUT
// the draft's own brief (leave one brief out), and measures what changed. It decides nothing itself.
//
// Usage (ATELIER_DATA pointing at the store of the skill whose standard guards):
//   node studies/harness/guard-offline.mjs --round <dir with KEY + brief-N/> --corpus <posts dir> \
//        --skill <name> --out <file.json> [--arms ATELIER,CONTEXT,GUIDE,...] [--model claude-opus-5]

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import * as store from '../../dist/core/state/store.js';
import { refineToStandard, checkDraft } from '../../dist/core/loop/run-repair.js';
import { deriveTellLexicon } from '../../dist/core/observers/tell-lexicon.js';
import { findPattern, patternRate, proseWords, displacedFamilies, deltaReference, styleDistanceDocs } from '../../dist/core/observers/style.js';
import { findTerms } from '../../dist/core/observers/text.js';
import { overlapIndex } from '../../dist/core/observers/overlap.js';
import { unsourcedClaims } from '../../dist/core/loop/claims.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const need = (n) => arg(n) ?? (console.error(`missing ${n} (see the usage at the top of this file)`), process.exit(2));
const ROUND = need('--round'); const CORPUS = need('--corpus'); const SKILL = need('--skill'); const OUT = need('--out');
const ARMS = (arg('--arms', 'ATELIER,ATELIER_NO_PERSONA,CONTEXT,GUIDE,RAW')).split(',');
const MODEL = arg('--model', 'claude-opus-5');
const DATA = process.env.ATELIER_DATA ?? (console.error('ATELIER_DATA must point at the store of the skill whose standard guards'), process.exit(2));

const L = { root: DATA, skillName: SKILL };
const v = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)).standardVersionHash);
const key = JSON.parse(readFileSync(join(ROUND, 'KEY-open-after-judging.json'), 'utf8'));
const briefs = readFileSync(join(ROUND, 'briefs.txt'), 'utf8').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const corpusFiles = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort();
const corpus = corpusFiles.map((f) => readFileSync(join(CORPUS, f), 'utf8'));
const reservedSet = new Set(readdirSync(join(DATA, 'sessions')).flatMap((f) =>
  (JSON.parse(readFileSync(join(DATA, 'sessions', f), 'utf8')).reservation?.reserved ?? []).map((u) => u.artifact.trim())));
const reserved = corpus.filter((t) => reservedSet.has(t.trim()));

const drafts = []; // { brief, arm, task, text }
for (const [b, m] of Object.entries(key)) {
  const bi = Number(b.split('-')[1]) - 1;
  for (const [letter, arm] of Object.entries(m)) if (ARMS.includes(arm)) drafts.push({ bi, arm, task: briefs[bi], text: readFileSync(join(ROUND, b, `${letter}.md`), 'utf8') });
}
// The skill's own drafts are the lexicon's source: the Atelier arms, on the OTHER briefs.
const skillDrafts = drafts.filter((d) => d.arm.startsWith('ATELIER'));

const client = new AnthropicInferenceClient(MODEL);
const lift = overlapIndex(corpus);
const refAll = deltaReference(corpus, drafts.filter((d) => d.arm === 'RAW').map((d) => d.text));
const refReserved = deltaReference(reserved, drafts.filter((d) => d.arm === 'RAW').map((d) => d.text));
const FEATURES = ['FIRST_PERSON', 'CONTRACTION', 'FULL_FORM', 'ONE_LINE_PARAGRAPH', 'BOLD_SPAN', 'DASH_ASIDE', 'RHETORICAL_QUESTION'];
// The author's range on each positive feature: the band a gate can hold an output to.
const bands = Object.fromEntries(FEATURES.map((p) => { const xs = corpus.map((t) => patternRate(t, p)).sort((a, b) => a - b);
  return [p, [xs[Math.floor(xs.length * 0.1)], xs[Math.ceil(xs.length * 0.9) - 1]]]; }));
const measure = (t, learned) => {
  const c = findPattern(t, 'CONTRACTION').length; const f = findPattern(t, 'FULL_FORM').length;
  const report = checkDraft(SKILL, v, t, { guardClaims: false, learnedTells: learned });
  const req = report.checked.filter((x) => x.materiality === 'REQUIRED');
  return {
    words: proseWords(t), machineTell: patternRate(t, 'MACHINE_TELL'), learnedHits: +(findTerms(t, learned).length / Math.max(1, proseWords(t)) * 1000).toFixed(2),
    contrast: patternRate(t, 'CONTRAST_VERDICT'), contractionShare: c + f ? +(c / (c + f)).toFixed(2) : null,
    features: Object.fromEntries(FEATURES.map((p) => [p, patternRate(t, p)])),
    inBand: FEATURES.filter((p) => { const r = patternRate(t, p); return r >= bands[p][0] && r <= bands[p][1]; }).length,
    placeholders: (t.match(/\[(?:your|figure|source|evidence)[^\]]*\]/gi) ?? []).length,
    invented: unsourcedClaims(t, '').filter((x) => x.kind === 'EXPERIENCE').length,
    ...lift(t), requiredHeld: `${req.filter((x) => x.result.verdict !== 'VIOLATED').length}/${req.length}`,
    stylometryAll: +((({ author, model }) => model - author)(styleDistanceDocs(t, refAll))).toFixed(3),
    stylometryReserved: +((({ author, model }) => model - author)(styleDistanceDocs(t, refReserved))).toFixed(3),
  };
};

const rows = [];
let spent = 0;
for (const d of drafts) {
  const learned = deriveTellLexicon(skillDrafts.filter((x) => x.bi !== d.bi), corpus).terms;
  const before = measure(d.text, learned);
  const budget = { spentUsd: 0, capUsd: 1.5, maxCalls: 5 };
  let r;
  try { r = await refineToStandard(client, budget, SKILL, v, d.text, 2, { guardClaims: true, learnedTells: learned }); }
  catch (e) { r = { output: d.text, repair: { why: `could not run: ${e.message}` } }; }
  spent += budget.spentUsd;
  const after = measure(r.output, learned);
  rows.push({ brief: d.bi + 1, arm: d.arm, before, after, why: r.repair?.why ?? 'nothing to repair', displaced: displacedFamilies(d.text, r.output),
    reverted: r.repair?.integrityReverted?.length ?? 0, storiesCut: r.repair?.storiesCut?.length ?? 0, changed: r.output !== d.text, output: r.output });
  console.log(`brief ${d.bi + 1} ${d.arm}: tells ${before.machineTell}→${after.machineTell}, learned ${before.learnedHits}→${after.learnedHits}, held ${before.requiredHeld}→${after.requiredHeld}`);
}
writeFileSync(OUT, JSON.stringify({ bands, spentUsd: +spent.toFixed(2), rows }, null, 1));
console.log(`done: ${OUT}; spent about $${spent.toFixed(2)}`);
