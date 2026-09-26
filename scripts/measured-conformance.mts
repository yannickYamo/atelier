#!/usr/bin/env node
// scripts/measured-conformance.mts — THE NUMBER ANYONE CAN RECOMPUTE: MEASURED RULES, PER ARM, NO JUDGE.
//
//   npx tsx scripts/measured-conformance.mts --skill <name> [--pairs <reference-pairs.json>]
//
// Reads the outputs `atelier reference` prepared for every arm and counts each REQUIRED measured rule
// of the skill's active standard on each output — whole piece, first third and last third — so the
// drift over length the repair loop exists to prevent is visible per arm. Deterministic: the same
// pairs file gives the same table on any machine. See studies/PROOF_STUDY_PREREGISTRATION.md §4.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from '../core/state/read-json.js';
import * as store from '../core/state/store.js';
import { measure } from '../core/observers/registry.js';
import { isGeneralScope } from '../core/state/canonical-state.js';
import { DATA, flag, die, runFile } from '../cli/runtime.js';

interface Pair { contextId: string; goldenSide: 'A' | 'B'; aText: string; bText: string }

const skill = flag('--skill') ?? die('--skill <name> required');
const L: store.StoreLayout = { root: DATA, skillName: skill };
const sv = store.getSkillVersion(L, store.getActive(L) ?? die(`no built skill "${skill}"`)) ?? die('skill version missing');
const v = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing');
const rules = v.requirements.filter((r) => r.measurement && r.materiality === 'REQUIRED' && isGeneralScope(r.appliesWhen));
if (!rules.length) die('this standard has no REQUIRED measured rule that applies everywhere; there is nothing to count.');

const pairsPath = flag('--pairs') ?? runFile('reference-pairs.json');
if (!existsSync(pairsPath)) die(`no prepared pairs at ${pairsPath}. Run: atelier reference --skill ${skill}`);
const stored = readJson<{ arms?: string[]; pairs: Pair[] }>(pairsPath, { what: 'the prepared pairs', requireKeys: ['pairs'] });

// Each pair kind is `LEFT_vs_RIGHT::unit`; the left arm sits on `goldenSide`. Recover every arm's
// output per unit, once, whichever pair it appeared in.
const byArm = new Map<string, Map<string, string>>();
for (const p of stored.pairs) {
  const [kind, unit] = p.contextId.split('::');
  const m = /^T_vs_(.+)$/.exec(kind) ?? /^(.+)_vs_(.+)$/.exec(kind);
  if (!m) continue;
  const [left, right] = kind.startsWith('T_vs_') ? ['T_ATELIER', m[1]] : [m[1], m[2]];
  const leftText = p.goldenSide === 'A' ? p.aText : p.bText;
  const rightText = p.goldenSide === 'A' ? p.bText : p.aText;
  for (const [arm, text] of [[left, leftText], [right, rightText]] as const) {
    if (arm === 'GOLDEN') continue;
    if (!byArm.has(arm)) byArm.set(arm, new Map());
    byArm.get(arm)!.set(unit, text);
  }
}

const third = (t: string, which: 0 | 2): string => { const n = Math.floor(t.length / 3); return which === 0 ? t.slice(0, n) : t.slice(2 * n); };
console.log(`skill ${skill} · standard ${v.standardVersionHash} · ${rules.length} REQUIRED measured rule(s) · ${join(pairsPath)}\n`);
console.log(`${'arm'.padEnd(26)} ${'rule'.padEnd(6)} ${'whole'.padStart(9)} ${'first ⅓'.padStart(9)} ${'last ⅓'.padStart(9)}`);
for (const [arm, outs] of byArm) {
  for (const r of rules) {
    const rate = (texts: string[]): string => {
      const rs = texts.map((t) => measure(t, r.measurement!)).filter((x) => x.verdict !== 'NOT_APPLICABLE');
      return rs.length ? `${rs.filter((x) => x.verdict === 'MET').length}/${rs.length}` : 'n/a';
    };
    const texts = [...outs.values()];
    console.log(`${arm.padEnd(26)} ${r.requirementId.padEnd(6)} ${rate(texts).padStart(9)} ${rate(texts.map((t) => third(t, 0))).padStart(9)} ${rate(texts.map((t) => third(t, 2))).padStart(9)}`);
  }
}
console.log('\nMET/measurable outputs. A third too short to measure is left out of its column, never counted as met.');
