#!/usr/bin/env node
// THE CONTEXT-BANDS STUDY (studies/CONTEXT_BANDS_PREREGISTRATION.md). Offline: no model call.
//
// For the held-out author pieces and the plain and pasted outputs of the indistinguishability study, the in-band
// share under the skill's base bands and under the bands moved toward the request's nearest pieces
// (core/fidelity/context.ts). Every statistic comes from core; this file reads, pairs and prints.
//
// Usage (repository root, after npm run build):
//   node studies/harness/context-bands.mjs --plan <plan.json> --cache <cache.json> --out <result.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as fstore from '../../dist/core/state/fidelity-store.js';
import { readFidelity, inBandShare } from '../../dist/core/fidelity/profile.js';
import { localContext } from '../../dist/core/fidelity/context.js';
import { aucDifferenceWithCi } from '../../dist/core/fidelity/qualify.js';
import { quantile } from '../../dist/core/observers/text.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error(m); process.exit(2); };
const PLAN = JSON.parse(readFileSync(arg('--plan') ?? fail('missing --plan'), 'utf8'));
const CACHE = JSON.parse(readFileSync(arg('--cache') ?? fail('missing --cache'), 'utf8'));
const OUT = arg('--out') ?? fail('missing --out');
const NEGATIVE = ['plain', 'pasted']; const SECONDARY = ['atelier', 'plan', 'steered'];

// The same title and request the study used (studies/harness/indistinguishability.mjs).
const titleOf = (text, file) => { const first = text.replace(/^﻿/, '').split('\n').find((l) => l.trim()) ?? ''; return (/^#\s+(.+)$/.exec(first.trim())?.[1] ?? basename(file).replace(/\.md$/, '').replace(/-/g, ' ')).trim(); };
const request = (title, words) => `Write a blog post titled "${title}". About ${words} words.`;
const stem = (s) => basename(String(s)).replace(/\.md$/, '');

const strata = []; const report = [];
for (const c of PLAN.corpora) {
  const L = { root: c.data, skillName: c.skill };
  const active = fstore.getActiveRelease(L) ?? fail(`${c.name}: no active release`);
  const profile = fstore.getProfile(L, active.release.profileHash) ?? fail(`${c.name}: no profile`);
  const cal = fstore.getTypicality(L, profile.hash) ?? fail(`${c.name}: no typicality calibration`);
  const index = (active.release.retrievalHash ? fstore.getRetrievalIndex(L, active.release.retrievalHash) : null) ?? fail(`${c.name}: no retrieval index`);
  const held = new Set(c.heldOut.map(stem));
  const leaked = (cal.ids ?? []).filter((id) => held.has(stem(id)));
  if (leaked.length) fail(`${c.name}: held-out pieces in the calibration: ${leaked.join(', ')}`);
  if (!cal.ids) fail(`${c.name}: the calibration does not know its pieces`);

  const score = (text, title) => {
    const ctx = localContext(request(title, c.briefWords), cal, index);
    const base = inBandShare(readFidelity(text, profile));
    const local = inBandShare(readFidelity(text, ctx ? { ...profile, context: ctx } : profile));
    return { base, local, nEff: ctx?.nEff ?? null, lambda: ctx?.lambda ?? null };
  };
  const authors = c.heldOut.map((f) => { const t = readFileSync(f, 'utf8'); return { title: titleOf(t, f), ...score(t, titleOf(t, f)) }; });
  const outputs = Object.values(CACHE).filter((o) => o.corpus === c.name && typeof o.output === 'string' && o.output.trim());
  const arm = (a) => outputs.filter((o) => o.arm === a).map((o) => ({ title: o.title, ...score(o.output, o.title) }));
  const neg = NEGATIVE.flatMap(arm);
  const ok = (x) => x.base !== null && x.local !== null;
  const pos = authors.filter(ok).map((x) => [x.base, x.local]); const negs = neg.filter(ok).map((x) => [x.base, x.local]);
  strata.push({ pos, neg: negs });
  const med = (xs) => (xs.length ? quantile(xs, 0.5) : null);
  const ctxs = [...authors, ...neg];
  report.push({
    corpus: c.name, profile: profile.hash, calibration: cal.hash, index: index.hash,
    author: { n: pos.length, medianBase: med(pos.map((x) => x[0])), medianLocal: med(pos.map((x) => x[1])) },
    negatives: { n: negs.length, medianBase: med(negs.map((x) => x[0])), medianLocal: med(negs.map((x) => x[1])) },
    difference: aucDifferenceWithCi([{ pos, neg: negs }]),
    secondary: Object.fromEntries(SECONDARY.map((a) => { const r = arm(a).filter(ok); return [a, { n: r.length, medianBase: med(r.map((x) => x.base)), medianLocal: med(r.map((x) => x.local)) }]; })),
    local: { given: ctxs.filter((x) => x.nEff !== null).length, of: ctxs.length, medianNEff: med(ctxs.filter((x) => x.nEff !== null).map((x) => x.nEff)), medianLambda: med(ctxs.filter((x) => x.lambda !== null).map((x) => x.lambda)) },
  });
}

const pooled = aucDifferenceWithCi(strata);
const authorBase = quantile(strata.flatMap((s) => s.pos.map((x) => x[0])), 0.5);
const authorLocal = quantile(strata.flatMap((s) => s.pos.map((x) => x[1])), 0.5);
const guard = authorLocal >= authorBase - 0.05;
const perCorpusOk = report.every((r) => r.difference.diff >= -0.05);
const pass = pooled.diff >= 0.05 && pooled.ci95[0] > 0 && perCorpusOk && guard;
const result = { pooled, guard: { authorMedianBase: authorBase, authorMedianLocal: authorLocal, holds: guard }, perCorpusOk, verdict: pass ? 'PASS' : 'FAIL', corpora: report };
writeFileSync(OUT, JSON.stringify(result, null, 1));

for (const r of report) {
  console.log(`\n${r.corpus}: author n=${r.author.n} (in band ${r.author.medianBase} -> ${r.author.medianLocal}), model n=${r.negatives.n} (${r.negatives.medianBase} -> ${r.negatives.medianLocal})`);
  console.log(`  AUC base ${r.difference.a}  local ${r.difference.b}  difference ${r.difference.diff} [${r.difference.ci95}]`);
  console.log(`  local target on ${r.local.given} of ${r.local.of} texts; median n_eff ${r.local.medianNEff}, lambda ${r.local.medianLambda}`);
  for (const [a, s] of Object.entries(r.secondary)) console.log(`  ${a.padEnd(8)} n=${s.n} in band ${s.medianBase} -> ${s.medianLocal}`);
}
console.log(`\npooled: AUC base ${pooled.a}  local ${pooled.b}  difference ${pooled.diff} [${pooled.ci95}]; author median ${authorBase} -> ${authorLocal} (guard ${guard ? 'holds' : 'FAILS'})`);
console.log(`verdict: ${result.verdict}`);
