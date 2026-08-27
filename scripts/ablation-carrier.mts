#!/usr/bin/env -S npx tsx
// scripts/ablation-carrier.mts — DOES THE SCHEMA ACTUALLY BUY ANYTHING OVER SAYING IT IN WORDS?
//
// The compiler asserts, in three places, that "prose describing a schema is a weaker version of the
// schema". That sentence is why OUTPUT_CONTRACT outranks PROSE, why a shape-bearing rule compiles to a
// contract, and why the prose restatement was removed from such rules entirely. It has never been
// measured. It is design intuition wearing a rationale's clothing.
//
// It is measurable, cheaply, WITH NO JUDGE — which almost nothing else in this system is. Schema
// conformance is a parse and five comparisons. No model scores another model, no expert labels
// anything, and the whole failed history of qualifying a semantic instrument does not apply.
//
// ─── WHAT THIS CAN AND CANNOT SETTLE ───────────────────────────────────────────────────────────
//
// It measures STRUCTURAL CONFORMANCE and nothing else. Whether the verdict is any good, whether the
// confidence is calibrated, whether the analysis is worth reading: none of that is visible here, and a
// carrier that produced perfectly-shaped worthless output would score 100%.
//
// It is also asymmetric by construction, and that is the honest part rather than a flaw. Arms B and C
// hand the schema to the provider, which enforces it, so they cannot fail. The experiment therefore
// measures ONE thing: how close a prose instruction gets to a guarantee. The answer decides whether
// OUTPUT_CONTRACT buys accuracy or merely buys certainty, and those are different products.
//
// Run:  npm run ablation:carrier -- --n 10 --cap 1.00

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { componentFor, type SkillArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import type { Budget } from '../core/inference/client.js';
import * as store from '../core/state/store.js';
import { runOnce } from '../cli/commands/improve.js';
import { clientAndBinding, describeBinding } from '../cli/runtime.js';

const arg = (f: string): string | undefined => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

// ─── THE SHAPE UNDER TEST ──────────────────────────────────────────────────────────────────────
const SHAPE: Record<string, unknown> = {
  verdict: { type: 'string' },
  confidence: { type: 'number' },
  primaryRisk: { type: 'string' },
};

/**
 * The prose arm's instruction, written in GOOD FAITH.
 *
 * A weak instruction here would rig the result, and the finding would be about my writing rather than
 * about carriers. This is the most precise thing a careful person would put in a rule: it names every
 * field, its type, the exclusivity, and forbids the wrapper that models reach for. If a better
 * instruction exists, the experiment should be re-run with it and the record replaced.
 */
const SHAPE_IN_WORDS =
  'Return your answer as a single JSON object with exactly three fields and no others: '
  + '"verdict" (a string), "confidence" (a number between 0 and 1), and "primaryRisk" (a string). '
  + 'Output the raw JSON object only. Do not wrap it in a code fence, and do not add any prose '
  + 'before or after it.';

const req = (o: Partial<Requirement> & { requirementId: string }): Requirement => ({
  statement: 'x', appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
  provenance: 'MACHINE_DISCOVERED', evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: 'REQUIRED', realizationTolerance: null, outputShape: null, ...o,
});

// A house-style rule present in every arm, so the three SKILL.md bodies are not trivially different
// documents. Without it arm B's instructions would be empty and the comparison would confound
// "no schema restatement" with "no instructions at all".
const HOUSE = req({ requirementId: 'h1',
  statement: 'Lead with the decision itself, not with background on how you reached it.' });

const ARMS = {
  // The shape asked for in words. The compiler gives this PROSE, and the provider is handed the
  // ordinary free-text schema — exactly what Atelier does for any rule without an outputShape.
  PROSE_ONLY: [HOUSE, req({ requirementId: 's1', statement: SHAPE_IN_WORDS })],
  // The shape held by the runtime, and never restated. This is Atelier as it ships today.
  SCHEMA_ONLY: [HOUSE, req({ requirementId: 's1', statement: SHAPE_IN_WORDS, outputShape: SHAPE })],
  // Both. This is what Atelier did BEFORE the prose restatement was removed from contract-carried
  // rules, so this arm is a test of that change and not only of the carrier.
  BOTH: [HOUSE, req({ requirementId: 's1', statement: SHAPE_IN_WORDS }),
    req({ requirementId: 's2', statement: SHAPE_IN_WORDS, outputShape: SHAPE })],
} as const;

type ArmId = keyof typeof ARMS;

/** Fixed, listed here, so the run is reproducible and nobody has to trust a description of it. */
const TASKS: readonly string[] = [
  'Compare usage-based and seat-based pricing for a seed-stage API company.',
  'Should a 12-person team adopt a monorepo?',
  'Assess whether to deprecate a public API endpoint used by four customers.',
  'Evaluate hiring a second designer versus a first design engineer.',
  'Decide whether to build SSO in-house or buy it.',
  'Assess moving a nightly batch job to streaming.',
  'Should support ownership sit with engineering or a dedicated team?',
  'Evaluate open-sourcing an internal deployment tool.',
  'Decide whether to run a paid pilot or a free one with a first enterprise prospect.',
  'Assess replacing a hand-rolled feature flag system with a vendor.',
  'Should the team freeze features for a month to pay down migration debt?',
  'Evaluate consolidating three staging environments into one.',
];

// ─── THE MEASUREMENT. Deterministic, and every facet reported separately. ──────────────────────
interface Conformance {
  readonly raw: string;
  /** parsed without any help */
  readonly parsesClean: boolean;
  /** parsed only after a code fence was stripped. Reported, never silently folded into a pass. */
  readonly neededFenceStrip: boolean;
  readonly parses: boolean;
  readonly hasAllFields: boolean;
  readonly typesOk: boolean;
  readonly noExtraFields: boolean;
  /** all four, and no fence. The strict reading. */
  readonly conformant: boolean;
  readonly detail: string;
}

const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

function measure(raw: string): Conformance {
  const want = Object.keys(SHAPE);
  const types = Object.fromEntries(Object.entries(SHAPE).map(([k, v]) => [k, (v as { type: string }).type]));

  const text = raw.trim();
  let clean = true;
  let obj: Record<string, unknown> | null = null;
  try { obj = JSON.parse(text) as Record<string, unknown>; } catch { clean = false; }

  let fenced = false;
  if (!obj) {
    const m = FENCE.exec(text);
    if (m) { fenced = true; try { obj = JSON.parse(m[1]) as Record<string, unknown>; } catch { /* still no */ } }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { raw, parsesClean: false, neededFenceStrip: fenced, parses: false, hasAllFields: false,
      typesOk: false, noExtraFields: false, conformant: false,
      detail: `not a JSON object${fenced ? ' even after stripping a code fence' : ''}` };
  }

  const keys = Object.keys(obj);
  const missing = want.filter((k) => !(k in obj));
  const extra = keys.filter((k) => !want.includes(k));
  const wrongType = want.filter((k) => k in obj && typeof obj[k] !== (types[k] === 'number' ? 'number' : 'string'));

  const hasAllFields = missing.length === 0;
  const typesOk = wrongType.length === 0;
  const noExtraFields = extra.length === 0;
  const detail = [
    missing.length ? `missing ${missing.join(',')}` : '',
    extra.length ? `extra ${extra.join(',')}` : '',
    wrongType.length ? `wrong type ${wrongType.map((k) => `${k}=${typeof obj[k]}`).join(',')}` : '',
    fenced ? 'wrapped in a code fence' : '',
  ].filter(Boolean).join('; ') || 'conformant';

  return { raw, parsesClean: clean, neededFenceStrip: fenced, parses: true,
    hasAllFields, typesOk, noExtraFields,
    conformant: clean && hasAllFields && typesOk && noExtraFields, detail };
}

// ─── THE RUN. Through the real compiler and the real invocation path. ──────────────────────────
async function arm(id: ArmId, tasks: readonly string[], budget: Budget): Promise<Conformance[]> {
  const reqs = [...ARMS[id]];
  const v: StandardVersion = {
    standardVersionHash: `ablation-${id}`, evidenceId: 'ablation', workType: 'analysis',
    requirements: reqs, authorityState: 'RATIFIED', mintedAt: '2026-08-23T00:00:00Z',
    supersedes: null, reason: null,
  };
  const arch: SkillArchitecture = {
    architectureHash: `ablation-arch-${id}`, standardVersionHash: v.standardVersionHash,
    components: reqs.map(componentFor),
  };
  const pkg = renderAgentSkill(v, arch, `ablation-${id.toLowerCase()}`, 'carrier ablation');
  const carriers = arch.components.map((c) => `${c.carries.join(',')}:${c.carrier}`).join(' ');
  console.log(`\n${id}  ${carriers}`);
  console.log(`  SKILL.md ${pkg.runtime['SKILL.md'].length} chars · contract ${pkg.runtime['contracts/output.schema.json'] ? 'present' : 'none'}`);

  const L: store.StoreLayout = { root: mkdtempSync(join(tmpdir(), `ablation-${id}-`)), skillName: 'a' };
  store.initStore(L);
  store.putStandard(L, v);
  const { client, binding } = clientAndBinding('target');

  const out: Conformance[] = [];
  for (const [i, task] of tasks.entries()) {
    const rec = await runOnce(
      L, { skillVersionHash: `k-${id}`, standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash },
      pkg.runtime['SKILL.md'], 'p', { expectedPackageHash: 'p', servedPackageHash: 'p', matched: true, servedFiles: [] },
      task, client, budget, binding, 'HARNESS_GENERATED',
      pkg.runtime['contracts/output.schema.json'] ?? null,
    );
    const m = measure(rec.output);
    out.push(m);
    console.log(`  ${String(i + 1).padStart(2)}. ${m.conformant ? 'PASS' : 'FAIL'}  ${m.detail}`);
  }
  return out;
}

const pct = (n: number, d: number): string => d ? `${((n / d) * 100).toFixed(0)}%` : 'n/a';

const main = async (): Promise<void> => {
  // Number(undefined ?? 10) is fine; Number('abc') is NaN, and Math.min(NaN, k) is NaN, which would
// run zero arms and report a clean sheet. Refuse the input instead of computing on it.
const numeric = (name: string, fallback: number): number => {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) { console.error(`${name} must be a number, got "${raw}"`); process.exit(2); }
  return v;
};
const n = Math.min(numeric('--n', 10), TASKS.length);
  const tasks = TASKS.slice(0, n);
  const budget: Budget = { spentUsd: 0, capUsd: numeric('--cap', 1.0), maxCalls: n * 3 + 2 };
  const { binding } = clientAndBinding('target');

  console.log(`Carrier ablation: does a schema buy anything over saying it in words?`);
  console.log(`runtime  ${describeBinding(binding)}`);
  console.log(`${n} task(s) x 3 arms = ${n * 3} calls, capped at $${budget.capUsd.toFixed(2)}`);

  const results: Record<string, Conformance[]> = {};
  for (const id of Object.keys(ARMS) as ArmId[]) results[id] = await arm(id, tasks, budget);

  console.log(`\n${'arm'.padEnd(14)}${'conformant'.padStart(11)}${'parses'.padStart(9)}${'fields'.padStart(8)}${'types'.padStart(8)}${'no extra'.padStart(10)}${'fenced'.padStart(8)}`);
  const rows: Record<string, unknown>[] = [];
  for (const [id, rs] of Object.entries(results)) {
    const c = (f: (x: Conformance) => boolean): string => pct(rs.filter(f).length, rs.length);
    console.log(`${id.padEnd(14)}${c((x) => x.conformant).padStart(11)}${c((x) => x.parses).padStart(9)}`
      + `${c((x) => x.hasAllFields).padStart(8)}${c((x) => x.typesOk).padStart(8)}`
      + `${c((x) => x.noExtraFields).padStart(10)}${c((x) => x.neededFenceStrip).padStart(8)}`);
    rows.push({ arm: id, n: rs.length,
      conformant: rs.filter((x) => x.conformant).length, parses: rs.filter((x) => x.parses).length,
      hasAllFields: rs.filter((x) => x.hasAllFields).length, typesOk: rs.filter((x) => x.typesOk).length,
      noExtraFields: rs.filter((x) => x.noExtraFields).length, fenced: rs.filter((x) => x.neededFenceStrip).length,
      failures: rs.filter((x) => !x.conformant).map((x) => x.detail) });
  }

  console.log(`\nspent $${budget.spentUsd.toFixed(4)}`);
  console.log(`\nSCHEMA_ONLY and BOTH are conformant BY CONSTRUCTION: the provider enforces the schema, so`);
  console.log(`those arms cannot fail this measurement. The number that carries information is PROSE_ONLY.`);
  console.log(`A high figure there means the contract carrier buys CERTAINTY rather than accuracy, which is`);
  console.log(`still worth having and is a different claim from the one the compiler currently makes.`);
  console.log(`\nStructural conformance only. Nothing here says whether any of these answers is any good.`);

  const out = arg('--out') ?? join(process.cwd(), 'ablation-carrier-result.json');
  writeFileSync(out, `${JSON.stringify({ shape: SHAPE, instruction: SHAPE_IN_WORDS,
    runtime: describeBinding(binding), tasks, rows, spentUsd: budget.spentUsd }, null, 2)}\n`);
  console.log(`\nwritten to ${out}`);
};

await main();
