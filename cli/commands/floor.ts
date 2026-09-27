// cli/commands/floor.ts — THE REGRESSION FLOOR: WHAT A NEW VERSION MAY NOT MAKE WORSE, AND BY HOW MUCH.
//
//   atelier floor --skill <name>                          where the floor stands, and what is next
//   atelier floor --skill <name> --corpus <folder>        propose margins from your own pieces
//   atelier floor --skill <name> --tasks <file>           the tasks it is measured on
//   atelier floor --skill <name> --margin <rule>=<n> --enforce <rule> --observe <rule>
//   atelier floor --skill <name> --baseline [--fires 3]   freeze the active version's scores
//   atelier floor --skill <name> --qualify  [--fires 3]   measure the false-alarm rate (an A/A run)
//   atelier floor --skill <name> --check <version> [--target <rule>] [--promote]
//
// A new implementation that fixes the rule you complained about can quietly make three others worse.
// The floor is what notices. Every measured rule is a dimension (core/distinctiveness/measured.ts); the
// active version is fired several times on each of your tasks and its scores frozen; a candidate is
// fired the same way and compared, task by task, with a three-state verdict that can say "I cannot
// tell" (core/distinctiveness/floor.ts).
//
// What it lets the system do without you is decided by the promotion gate (core/convergence/
// promotion.ts), not here. The gate lets a candidate install itself only when the floor is EARNED —
// its false-alarm rate measured on this skill, these tasks and these margins — the enforced dimensions
// held, and the rule being repaired improved across tasks. Until then everything here is advice, and a
// person decides.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import * as store from '../../core/state/store.js';
import { resolveRule } from '../../core/state/rule-key.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { floorDimensions, perFire, proposeMargins, buildContract, evaluateTask, compositeAcross, targetComparison,
  qualifyFromAA, countAA, type FloorDimension } from '../../core/distinctiveness/measured.js';
import { gateState, type FrozenBaselineEntry, type QualityFloorContract, type QualityFloorResult, type FloorVerdict,
  type DistinctivenessState } from '../../core/distinctiveness/floor.js';
import { resolvePromotion, type PromotionDecision } from '../../core/convergence/promotion.js';
import type { ComparisonVerdict } from '../../core/comparison/compare.js';
import type { Budget, InferenceClient } from '../../core/inference/client.js';
import { mapLimit, DEFAULT_CONCURRENCY } from '../../core/inference/concurrency.js';
import { extract, READABLE, META_NAME } from '../../core/intake/extract.js';
import { walk } from './intake.js';
import { resolveServedVersion } from './invoke.js';
import { spendOneWithResult } from './improve.js';
import { describeBackup } from '../../adapters/install-tree.js';
import { sha, DATA, die, argv, flag, flagAll, numericFlag, skillArg, clientAndBinding, modelFor, pickHost, projectDir } from '../runtime.js';

/** The fewest tasks a floor verdict or a qualification can rest on. */
export const MIN_TASKS = 3;
const DEFAULT_FIRES = 3;

const floorHash = (contract: QualityFloorContract | null, tasks: readonly string[], model: string): string =>
  sha(JSON.stringify({ contract, tasks, model }));

interface Ctx { readonly L: store.StoreLayout; readonly name: string; readonly v: StandardVersion; readonly active: string; readonly dims: FloorDimension[] }

function context(): Ctx {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  return { L, name, v, active, dims: floorDimensions(v) };
}

/** The floor's honest state for the ACTIVE version: what the gate may be told. */
export function floorStateFor(L: store.StoreLayout, active: string, model: string): { state: DistinctivenessState; why: string } {
  const f = store.getFloor(L);
  const q = f.qualification?.contractHash === floorHash(f.contract, f.tasks, model) ? f.qualification : null;
  return gateState(f.contract, store.getBaseline(L, active) !== null, q);
}

/** Read every piece of writing in a folder, as intake would, skipping files about the work. */
export function readCorpus(path: string): string[] {
  if (!existsSync(path)) die(`--corpus: there is nothing at ${path}.`);
  const files = statSync(path).isDirectory() ? walk(path).map((r) => join(path, r)) : [path];
  return files
    .filter((f) => (READABLE as readonly string[]).includes(extname(f).toLowerCase()) && !META_NAME.test(basename(f)))
    .flatMap((f) => { const r = extract(f); return r.ok ? [(r as { text: string }).text] : []; });
}

/** Tasks from a file: separated by blank lines, so a task can run over several lines. */
const readTasks = (file: string): string[] => {
  if (!existsSync(file)) die(`--tasks: there is no file at ${file}.`);
  return readFileSync(file, 'utf8').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
};

/** Fire one SkillVersion `fires` times on each task. Raw drafts: the floor measures the implementation, not the repair loop. */
async function fire(L: store.StoreLayout, version: string, tasks: readonly string[], fires: number,
  client: InferenceClient, budget: Budget): Promise<{ runs: { task: string; outputs: string[] }[]; delivered: boolean }> {
  // Refuses (dies) when the stored package does not hash to what the version recorded.
  const served = resolveServedVersion(L, version, '');
  const contract = served.contractFile ? { schema: JSON.parse(served.contractFile) as Record<string, unknown>, artifact: 'contracts/output.schema.json' } : null;
  const jobs = tasks.flatMap((task) => Array.from({ length: fires }, () => task));
  const pieces = await mapLimit(jobs, DEFAULT_CONCURRENCY, async (task) => (await spendOneWithResult(client, budget, served.servedText, task, contract)).piece);
  return { runs: tasks.map((task, i) => ({ task, outputs: pieces.slice(i * fires, (i + 1) * fires) })), delivered: served.delivery.matched };
}

const freeze = (version: string, model: string, dims: readonly FloorDimension[], runs: readonly { task: string; outputs: string[] }[]): FrozenBaselineEntry[] =>
  runs.map((r) => {
    const scores = perFire(dims, r.outputs);
    const mean = Object.fromEntries(Object.entries(scores).map(([k, xs]) => [k, xs.reduce((a, b) => a + b, 0) / xs.length]));
    return { clusterId: version, fixtureContextId: sha(r.task), nGen: r.outputs.length, capturedUnderModel: model, meanScores: mean, perFireScores: scores };
  });

export interface CandidateCheck {
  readonly composite: FloorVerdict;
  readonly perTask: readonly QualityFloorResult[];
  readonly comparison: ComparisonVerdict;
  readonly state: DistinctivenessState;
  readonly decision: PromotionDecision;
  /** the candidate's frozen scores, which become the baseline if it is promoted */
  readonly frozen: readonly FrozenBaselineEntry[];
}

/**
 * Fire a candidate on the floor's tasks and ask the promotion gate what that evidence authorises. The
 * target rule, when given, is the one a repair was about: its improvement across tasks is the
 * comparison the gate reads. The measured target is a count, so its authority is CERTIFY; everything
 * else the gate needs has to have been earned.
 */
export async function checkCandidate(L: store.StoreLayout, v: StandardVersion, active: string, candidate: string,
  targetKey: string | null, fires: number, budget: Budget, client: InferenceClient, model: string): Promise<CandidateCheck> {
  const f = store.getFloor(L);
  const dims = floorDimensions(v);
  const contract = f.contract ?? die('no floor contract: propose one with atelier floor --corpus <folder>.');
  const baseline = store.getBaseline(L, active) ?? die('the active version has no frozen baseline: atelier floor --baseline.');
  if (f.tasks.length < MIN_TASKS) die(`the floor needs at least ${MIN_TASKS} tasks: atelier floor --tasks <file>.`);
  const { runs, delivered } = await fire(L, candidate, f.tasks, fires, client, budget);
  const frozen = freeze(candidate, model, dims, runs);
  const perTask = frozen.map((c) => {
    const base = baseline.find((b) => b.fixtureContextId === c.fixtureContextId);
    return base ? evaluateTask(c.perFireScores ?? {}, base, contract) : { perDim: [], composite: 'INCONCLUSIVE', drivenBy: [] } satisfies QualityFloorResult;
  });
  const composite = compositeAcross(perTask);
  const comparison = targetKey
    ? targetComparison(frozen.map((c) => ({ candidate: c.perFireScores?.[targetKey] ?? [],
      champion: baseline.find((b) => b.fixtureContextId === c.fixtureContextId)?.perFireScores?.[targetKey] ?? [] })))
    : 'INCONCLUSIVE';
  const { state } = floorStateFor(L, active, model);
  const activeSv = store.getSkillVersion(L, active); const candSv = store.getSkillVersion(L, candidate);
  const decision = resolvePromotion({
    incumbentStandardHash: activeSv?.standardVersionHash ?? '', candidateStandardHash: candSv?.standardVersionHash ?? '?',
    evaluatedPackageHash: candSv?.materializedHash ?? '', candidatePackageHash: candSv?.materializedHash ?? '',
    // Every measured rule is a floor dimension, so a regression on one is the floor's verdict to give;
    // nothing else deterministic is checked here.
    deliveryValid: delivered, deterministicRegression: false,
    fidelityAuthority: targetKey ? 'CERTIFY' : 'OBSERVE', comparison, distinctiveness: state, floor: composite,
  });
  return { composite, perTask, comparison, state, decision, frozen };
}

/** Install a promoted candidate and carry its scores forward as the next baseline. */
export function promoteChecked(L: store.StoreLayout, name: string, candidate: string, check: CandidateCheck, note: string): void {
  const sv = store.getSkillVersion(L, candidate) ?? die(`no SkillVersion ${candidate}.`);
  const pkg = store.getPackage(L, sv.materializedHash) ?? die(`package ${sv.materializedHash} missing.`);
  const inst = pickHost().install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) die(`install failed: ${inst.reason}\n  Nothing was promoted.`);
  const prev = store.getActive(L);
  store.setActive(L, candidate);
  // The candidate's own fires are the new champion's baseline: same tasks, same model, just measured.
  store.setBaseline(L, candidate, check.frozen);
  const at = new Date().toISOString();
  store.appendEvent(L, { kind: 'PROMOTED', at, skillName: name, skillVersionHash: candidate, supersededActive: prev, packageHash: pkg.packageHash,
    authority: 'AUTO_PROMOTE', floor: check.composite, comparison: check.comparison, note });
}

export async function floor(): Promise<void> {
  const { L, name, v, active, dims } = context();
  let f = store.getFloor(L);
  // The model name, not a client: showing or editing the floor must not need an API key.
  const model = modelFor('target');

  // ── Margins from the author's own pieces ────────────────────────────────────────────────────
  const corpus = flag('--corpus');
  if (corpus) {
    const texts = readCorpus(corpus);
    const proposals = proposeMargins(dims, texts);
    f = { ...f, contract: buildContract(proposals, dims, f.contract) };
    console.log(`Margins proposed from ${texts.length} piece(s) in ${corpus}: ${proposals.length} of ${dims.length} measured rule(s) applied to enough of them.`);
  }

  // ── The owner's edits: margins and roles ────────────────────────────────────────────────────
  /** The floor dimension a rule reference names, or a refusal saying why it cannot be one. */
  const dimOf = (ref: string): FloorDimension => {
    const r = resolveRule(v.requirements, ref);
    if ('error' in r) return die(r.error);
    return dims.find((x) => x.rule === r.rule) ?? die(`${ref} is not a measured rule that applies everywhere, so the floor cannot watch it.`);
  };
  const keyOf = (ref: string): string => {
    const d = dimOf(ref);
    if (!f.contract?.dimensions[d.key]) die(`${ref} has no margin yet (it did not apply to enough of your pieces). Set one: --margin ${ref}=<number>`);
    return d.key;
  };
  for (const kv of flagAll('--margin')) {
    const eq = kv.lastIndexOf('=');
    const ref = kv.slice(0, eq); const n = Number(kv.slice(eq + 1));
    if (eq <= 0 || !Number.isFinite(n) || n <= 0) die(`--margin takes <rule>=<positive number>; got "${kv}".`);
    const d = dimOf(ref);
    const was = f.contract?.dimensions[d.key];
    f = { ...f, contract: { instrument: 'scoreDimensionByPolicy', dimensions: { ...(f.contract?.dimensions ?? {}),
      [d.key]: { nonInferiorityMargin: n, gateRole: was?.gateRole ?? 'OBSERVE', rationale: 'set by the owner' } } } };
  }
  for (const [flagName, role] of [['--enforce', 'ENFORCE'], ['--observe', 'OBSERVE']] as const) {
    for (const ref of flagAll(flagName)) {
      const k = keyOf(ref);
      const d = f.contract!.dimensions[k];
      f = { ...f, contract: { ...f.contract!, dimensions: { ...f.contract!.dimensions, [k]: { ...d, gateRole: role } } } };
    }
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────────────────────
  const tasksFile = flag('--tasks');
  if (tasksFile) {
    f = { ...f, tasks: readTasks(tasksFile) };
    console.log(`${f.tasks.length} task(s) set.`);
  }
  store.setFloor(L, f);

  const fires = Math.max(2, Math.floor(numericFlag('--fires', DEFAULT_FIRES)));
  const needBudget = (arms: number): Budget => ({ spentUsd: 0, capUsd: numericFlag('--cap', 3), maxCalls: f.tasks.length * fires * arms });
  const ready = (): void => {
    if (!f.contract || !Object.keys(f.contract.dimensions).length) die('no floor contract yet: atelier floor --skill ' + name + ' --corpus <folder of your pieces>');
    if (f.tasks.length < MIN_TASKS) die(`the floor needs at least ${MIN_TASKS} tasks: atelier floor --skill ${name} --tasks <file> (tasks separated by blank lines).`);
  };

  // ── Freeze the active version ───────────────────────────────────────────────────────────────
  if (argv.includes('--baseline')) {
    ready();
    const { client } = clientAndBinding('target');
    console.log(`Firing the active version ${fires} time(s) on each of ${f.tasks.length} task(s)…`);
    const { runs } = await fire(L, active, f.tasks, fires, client, needBudget(1));
    store.setBaseline(L, active, freeze(active, model, dims, runs));
    console.log(`Baseline frozen for ${active} under ${model}.`);
  }

  // ── A/A: the false-alarm rate ───────────────────────────────────────────────────────────────
  if (argv.includes('--qualify')) {
    ready();
    const baseline = store.getBaseline(L, active) ?? die(`freeze a baseline first: atelier floor --skill ${name} --baseline`);
    if (!Object.values(f.contract!.dimensions).some((d) => d.gateRole === 'ENFORCE')) {
      die('no dimension is ENFORCE, so there is nothing that could raise a false alarm. Choose which rules may block: --enforce <rule>');
    }
    const { client } = clientAndBinding('target');
    console.log(`A/A: firing the same version again, ${fires} time(s) on each task, and comparing it with its own baseline…`);
    const { runs } = await fire(L, active, f.tasks, fires, client, needBudget(1));
    const again = freeze(active, model, dims, runs);
    const results = again.map((c) => evaluateTask(c.perFireScores ?? {}, baseline.find((b) => b.fixtureContextId === c.fixtureContextId)!, f.contract!));
    // A/A runs on the same contract, tasks and model accumulate; change any of them and the count restarts.
    const hash = floorHash(f.contract, f.tasks, model);
    const now = countAA(results);
    const prior = f.aa?.contractHash === hash ? f.aa : { falseAlarms: 0, trials: 0 };
    const tally = { falseAlarms: prior.falseAlarms + now.falseAlarms, trials: prior.trials + now.trials };
    const q = qualifyFromAA(tally, f.tasks.length, `${name}: ${Object.keys(f.contract!.dimensions).length} measured dimension(s) over ${f.tasks.length} task(s) under ${model}`);
    console.log(`This run: ${now.falseAlarms} false alarm(s) in ${now.trials} enforced comparison(s). So far: ${tally.falseAlarms} in ${tally.trials}; upper 95% bound ${(q.upper95 * 100).toFixed(1)}%.`);
    f = { ...f, aa: { contractHash: hash, ...tally }, qualification: q.qualification ? { ...q.qualification, contractHash: hash } : null };
    store.setFloor(L, f);
    console.log(q.qualification ? 'The floor is EARNED for these tasks, margins and model.'
      : `Not qualified yet: the bound must be at most 5% over at least ${MIN_TASKS} tasks. Run --qualify again to add evidence, add tasks, or enforce more rules.`);
  }

  // ── Check a candidate ───────────────────────────────────────────────────────────────────────
  const cand = flag('--check');
  if (cand) {
    ready();
    const target = flag('--target');
    const targetKey = target ? keyOf(target) : null;
    const { client } = clientAndBinding('target');
    const check = await checkCandidate(L, v, active, cand, targetKey, fires, needBudget(1), client, model);
    for (const [i, r] of check.perTask.entries()) {
      console.log(`task ${i + 1}: ${r.composite}${r.drivenBy.length ? ` (${r.drivenBy.join(', ')})` : ''}`);
    }
    console.log(`floor: ${check.composite} · target: ${check.comparison} · floor state: ${check.state}`);
    console.log(`gate: ${check.decision.authority} — ${check.decision.why}`);
    store.appendEvent(L, { kind: 'FLOOR_CHECK', candidateSkillVersionHash: cand, floor: check.composite, comparison: check.comparison,
      authority: check.decision.authority, at: new Date().toISOString() });
    if (argv.includes('--promote')) {
      if (check.decision.authority !== 'AUTO_PROMOTE') die(`not promoted: the gate said ${check.decision.authority}. A person can still promote: atelier promote --skill ${name} --candidate ${cand} --why "<reason>"`);
      promoteChecked(L, name, cand, check, 'atelier floor --check --promote');
      console.log(`Promoted ${cand}; its scores are the new baseline.`);
    }
    return;
  }

  describeFloor(L, name, active, dims, model);
}

function describeFloor(L: store.StoreLayout, name: string, active: string, dims: readonly FloorDimension[], model: string): void {
  const f = store.getFloor(L);
  const st = floorStateFor(L, active, model);
  console.log(`Regression floor for ${name}  ·  active ${active}`);
  console.log(`  state: ${st.state} — ${st.why}`);
  console.log(`  tasks: ${f.tasks.length}${f.tasks.length < MIN_TASKS ? ` (needs ${MIN_TASKS})` : ''}`);
  console.log(`  baseline: ${store.getBaseline(L, active) ? `frozen for ${active}` : 'none for the active version'}`);
  const statement = new Map(dims.map((d) => [d.key, d.rule.statement]));
  const rows = Object.entries(f.contract?.dimensions ?? {});
  console.log(`  dimensions: ${rows.length} of ${dims.length} measured rule(s)`);
  for (const [k, d] of rows) console.log(`    ${k}  ${d.gateRole.padEnd(7)}  margin ${String(d.nonInferiorityMargin).padEnd(6)}  ${(statement.get(k) ?? '(no longer in the standard)').slice(0, 60)}`);
  const next = !rows.length ? `atelier floor --skill ${name} --corpus <folder of your pieces>`
    : f.tasks.length < MIN_TASKS ? `atelier floor --skill ${name} --tasks <file>`
      : !store.getBaseline(L, active) ? `atelier floor --skill ${name} --baseline`
        : !rows.some(([, d]) => d.gateRole === 'ENFORCE') ? `atelier floor --skill ${name} --enforce <rule>   (which rules may block a new version)`
          : st.state !== 'EARNED' ? `atelier floor --skill ${name} --qualify` : null;
  console.log(next ? `\nNext: ${next}` : '\nThe floor is earned: a repair whose rule improves and whose enforced rules hold can install itself.');
}
