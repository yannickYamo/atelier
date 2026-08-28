#!/usr/bin/env node
// A STUDY RUNNER CHOOSES PARAMETERS. IT DECIDES NOTHING.
//
// Every semantic and statistical rule — what counts as a duplicate, as fired, as valid, how an
// interval is computed, what a suite hashes to — lives in core/contract/ and is imported from the
// BUILT product below. That is the whole point of this file being thin: for two studies this
// programme ran the deciding code in a throwaway script, so the paper measured an instrument the
// product did not contain. `tests/atelier-study-semantics-census.test.ts` fails if a rule reappears
// here.
//
// Usage:
//   node studies/harness/run-study.mjs --suite <sealed.json> --arms <arms.json> [--max-tokens N]
//
// The suite must already be sealed. Sealing is not done here.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  runStudyGeneration, toContextRates, analyseStratum, armIdentity, requestShape, runIdentity,
} from '../../dist/core/contract/study.js';
import { decompose, describeEstimate } from '../../dist/core/contract/analysis.js';
import { headroomOf, unmeasurableReason } from '../../dist/core/contract/headroom.js';
import { budgetFromProbe, budgetFromOverride, describeBudget } from '../../dist/core/contract/budget-probe.js';
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? d : process.argv[i + 1];
};

const MODEL = arg('--model', 'claude-opus-5');
const REPS = Number(arg('--reps', '3'));
const SEED = Number(arg('--seed', '20260828'));
const PROBE_CAP = Number(arg('--probe-cap', '16000'));
const SCHEMA = { type: 'object', properties: { output: { type: 'string' } }, required: ['output'] };
const TOOL = 'emit_output';

const suite = JSON.parse(readFileSync(arg('--suite'), 'utf8'));
const arms = JSON.parse(readFileSync(arg('--arms'), 'utf8'));  // [{ arm, servedTextPath|null }]
const materialised = arms.map((a) => ({
  arm: a.arm,
  servedText: a.servedTextPath ? readFileSync(a.servedTextPath, 'utf8') : null,
}));

const client = new AnthropicInferenceClient(MODEL, process.env.ANTHROPIC_API_KEY);

// ── BUDGET, EARNED RATHER THAN ASSUMED ────────────────────────────────────────────────────────
// A censored probe cannot say how long the work is, so `budgetFromProbe` raises and the PREFLIGHT
// is rerun. Nothing here decides that; it only reports it.
const override = arg('--max-tokens');
let budget;
if (override) {
  budget = budgetFromOverride(Number(override));
} else {
  const probe = [];
  for (const c of suite.contexts.slice(0, 3)) {
    const g = await runStudyGeneration(client, { arm: 'PROBE', servedText: null }, c, 0,
      { maxTokens: PROBE_CAP, toolName: TOOL, schema: SCHEMA });
    probe.push({ outputTokens: g.outputTokens, censored: g.validity === 'TRUNCATED' });
  }
  budget = budgetFromProbe(probe, PROBE_CAP, { suiteHash: suite.suiteHash });
}
console.error(`budget: ${describeBudget(budget)}`);

// ── EXECUTION ─────────────────────────────────────────────────────────────────────────────────
const jobs = [];
for (const c of suite.contexts) for (const a of materialised) for (let r = 1; r <= REPS; r++) jobs.push({ c, a, r });
console.error(`${jobs.length} generations queued.`);

const gens = [];
let done = 0;
const workers = Array.from({ length: 6 }, async () => {
  for (;;) {
    const j = jobs.shift();
    if (!j) return;
    gens.push(await runStudyGeneration(client, j.a, j.c, j.r,
      { maxTokens: budget.maxTokens, toolName: TOOL, schema: SCHEMA }));
    if (++done % 24 === 0) console.error(`  ${done} done`);
  }
});
await Promise.all(workers);

// ── ANALYSIS, ALL OF IT IMPORTED ──────────────────────────────────────────────────────────────
const identity = runIdentity(suite.suiteHash, materialised.map((a) => armIdentity(a.arm, a.servedText)),
  requestShape(MODEL, budget.maxTokens, TOOL, SCHEMA), [MODEL]);

const invalid = gens.filter((g) => g.validity !== 'COMPLETE');
console.log(`\nrun ${identity.runHash}  invalid ${invalid.length}/${gens.length}`);

const [bare, prose, compiled] = materialised.map((a) => a.arm);
for (const kind of ['SHOULD_FIRE', 'SHOULD_NOT_APPLY']) {
  const ids = new Set(suite.contexts.filter((c) => c.kind === kind).map((c) => c.contextId));
  const rows = toContextRates(gens.filter((g) => ids.has(g.contextId)));
  console.log(`\n${kind}`);
  if (prose && compiled) {
    const d = decompose(rows, { bare, prose, compiled }, { seed: SEED });
    for (const e of [d.standardEffect, d.compilerEffect, d.totalEffect]) console.log(`  ${describeEstimate(e)}`);
  }
  const control = analyseStratum(suite, gens, kind, compiled ?? prose ?? bare, bare, { seed: SEED });
  const why = unmeasurableReason(headroomOf(control.controlRate, control.estimate.contexts),
    kind === 'SHOULD_FIRE' ? 'LIFT' : 'HARM');
  if (why) console.log(`  ${why}`);
}

writeFileSync(arg('--out', 'study-results.json'),
  JSON.stringify({ identity, budget, suiteHash: suite.suiteHash, generations: gens }, null, 1));
