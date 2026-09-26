#!/usr/bin/env node
// scripts/recall-sheet.mts — DID DISCOVERY FIND WHAT THE OWNER WROTE DOWN? SCORED BY THE OWNER, AFTER.
//
//   npx tsx scripts/recall-sheet.mts --standard <house-standard.md> --out recall.md
//   npx tsx scripts/recall-sheet.mts --score recall-marks.json
//
// The house standard is the answer key, and nothing in the pipeline may read it before discovery has
// finished: this script refuses to open it unless the run in this project has reached PROPOSED (or
// later). It then writes one sheet — every proposal discovery made, unlabelled by vantage, beside the
// owner's numbered rules — for the owner to mark RECOVERED / PARTIAL / MISSED per numbered rule.
// `--score` computes the preregistered recall. See studies/PROOF_STUDY_PREREGISTRATION.md §2.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { flag, die, loadSession } from '../cli/runtime.js';

const scorePath = flag('--score');
if (scorePath) {
  const raw = JSON.parse(readFileSync(scorePath, 'utf8')) as unknown;
  if (!Array.isArray(raw)) die('the marks file must be the JSON array the sheet printed.');
  const marks = raw as { rule: string; mark: 'RECOVERED' | 'PARTIAL' | 'MISSED'; excluded?: boolean }[];
  const bad = marks.filter((m) => !['RECOVERED', 'PARTIAL', 'MISSED'].includes(m.mark));
  if (bad.length) die(`marks must be RECOVERED, PARTIAL or MISSED; check rule(s) ${bad.map((m) => m.rule).join(', ')}`);
  const scored = marks.filter((m) => !m.excluded);
  const r = scored.filter((m) => m.mark === 'RECOVERED').length;
  const p = scored.filter((m) => m.mark === 'PARTIAL').length;
  const recall = scored.length ? (r + 0.5 * p) / scored.length : 0;
  console.log(`${r} recovered, ${p} partial, ${scored.length - r - p} missed, of ${scored.length} numbered rules (${marks.length - scored.length} excluded)`);
  console.log(`recall = (${r} + ½·${p}) / ${scored.length} = ${recall.toFixed(3)}   preregistered bar 0.50 → ${recall >= 0.5 ? 'MET' : 'NOT MET'}`);
  process.exit(0);
}

const s = loadSession();
if (!['PROPOSED', 'RATIFIED', 'BUILT'].includes(s.run.state)) {
  die(`the run here is in state ${s.run.state}. The house standard is opened only after discovery has finished (PROPOSED), so it cannot have influenced it.`);
}
const standardPath = flag('--standard') ?? die('--standard <house-standard.md> required');
if (!existsSync(standardPath)) die(`there is no file at ${standardPath}`);
const house = readFileSync(standardPath, 'utf8');
// Numbered rules as the owner wrote them: "12." or "12)" at the start of a line.
const numbered = [...house.matchAll(/^\s*(\d{1,3})[.)]\s+(.+)$/gm)].map((m) => ({ n: m[1], text: m[2].trim() }));
if (!numbered.length) die('found no numbered rules ("1. …") in the house standard.');

// Shuffled by a hash of the statement, so the order carries no hint of vantage or evidence strength.
const hash = (t: string): number => Array.from(t).reduce((h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0, 7);
const proposals = [...s.proposals].sort((a, b) => hash(a.statement) - hash(b.statement));

const out = flag('--out') ?? 'recall.md';
writeFileSync(out, [
  '# Recall sheet',
  '',
  'For each numbered rule of YOUR standard, mark whether any proposal below states it:',
  'RECOVERED (a proposal says it), PARTIAL (part of it, or with the wrong condition), MISSED.',
  'Mark rules that are about process or tooling rather than the writing as excluded.',
  '',
  '## What discovery proposed',
  '',
  ...proposals.map((p, i) => `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) || ''}. ${p.statement}${p.appliesWhen && p.appliesWhen !== 'GENERAL' ? `  (when: ${p.appliesWhen})` : ''}`),
  '',
  '## Your numbered rules — fill in the marks file',
  '',
  ...numbered.map((r) => `${r.n}. ${r.text}`),
  '',
  'Marks file (JSON), one row per numbered rule:',
  '```json',
  JSON.stringify(numbered.map((r) => ({ rule: r.n, mark: 'MISSED', excluded: false })), null, 1),
  '```',
  '',
].join('\n'));
console.log(`${proposals.length} proposal(s) and ${numbered.length} numbered rule(s) written to ${out}.`);
console.log('Mark each rule, save the JSON as recall-marks.json, then:  npx tsx scripts/recall-sheet.mts --score recall-marks.json');
