// cli/commands/floor.ts — THE REGRESSION FLOOR: WHAT A NEW VERSION MAY NOT MAKE WORSE, AND BY HOW MUCH.
//
//   atelier floor --skill <name>                          where the floor stands, and what is next
//   atelier floor --skill <name> --corpus <folder>        propose margins from your own pieces
//   atelier floor --skill <name> --tasks <file>           the tasks it is measured on
//   atelier floor --skill <name> --margin <rule>=<n> --enforce <rule> --observe <rule>
//   atelier floor --skill <name> --baseline [--fires 3]   freeze the active version's scores
//   atelier floor --skill <name> --qualify  [--fires 3]   measure the false-alarm rate (A/A runs)
//   atelier floor --skill <name> --check <version> [--target <rule>] [--promote]
//
// A new implementation that fixes the rule you complained about can quietly make three others worse.
// The floor is what notices. Every measured rule is a dimension (core/distinctiveness/measured.ts); the
// active version is fired several times on each of your tasks and its scores frozen; a candidate is
// fired the same way and compared, task by task, with a three-state verdict that can say "I cannot
// tell" (core/distinctiveness/floor.ts).
//
// What it lets the system do without you is decided by the promotion gate (core/convergence/
// promotion.ts), not here. The gate lets a candidate install itself only when the floor is EARNED for
// exactly this situation (this version, standard, contract, task set, runtime and number of drafts),
// every enforced rule other than the one being repaired held on every task, and the repaired rule
// improved across tasks. Change any of those and the qualification no longer applies; an automatic
// promotion changes the version, so the floor must be re-frozen and re-earned before the next one.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import * as store from '../../core/state/store.js';
import { resolveRule } from '../../core/state/rule-key.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { floorDimensions, perFire, proposeMargins, buildContract, evaluateTask, compositeAcross, targetComparison,
  qualifyFromAA, countAA, plantedDetections, PLANTED_MARGINS, MIN_SENSITIVITY, MIN_PLANTED, type FloorDimension } from '../../core/distinctiveness/measured.js';
import { gateState, type FrozenBaselineEntry, type QualityFloorResult, type FloorVerdict,
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
import { sha, DATA, die, argv, flag, flagAll, numericFlag, skillArg, clientAndBinding, modelFor, providerFor, pickHost, projectDir,
  loadSession } from '../runtime.js';

/** The fewest tasks a floor verdict or a qualification can rest on. */
export const MIN_TASKS = 3;
const DEFAULT_FIRES = 3;

/**
 * What a runtime is, for the floor: provider, model and sampling settings. Read from configuration,
 * never from a client, so showing the floor needs no API key. A qualification earned under one runtime
 * says nothing about another.
 */
export const runtimeIdentity = (): string =>
  JSON.stringify({ provider: providerFor('target'), model: modelFor('target'), temperature: flag('--temperature') ?? null });

/**
 * Everything a false-alarm rate is a rate OF. The qualification carries this hash; the floor is EARNED
 * only while it still matches, so a new version, standard, contract, task set, runtime or draft count
 * voids it.
 */
const qualificationKey = (L: store.StoreLayout, f: store.FloorState, active: string, standardVersionHash: string, runtime: string, fires: number): string =>
  sha(JSON.stringify({ contract: f.contract, tasks: f.tasks, active, standardVersionHash, runtime, fires,
    // The frozen baseline a check compares against is part of what a verdict means: re-freeze, re-earn.
    baseline: sha(JSON.stringify(store.getBaseline(L, active) ?? null)) }));

interface Ctx { readonly L: store.StoreLayout; readonly name: string; readonly v: StandardVersion; readonly active: string; readonly dims: FloorDimension[] }

function context(): Ctx {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  return { L, name, v, active, dims: floorDimensions(v) };
}

/** The floor's honest state for the ACTIVE version under this runtime: what the gate may be told. */
export function floorStateFor(L: store.StoreLayout, active: string, runtime: string): { state: DistinctivenessState; why: string; fires: number } {
  const f = store.getFloor(L);
  const sv = store.getSkillVersion(L, active);
  const fires = f.qualification?.fires ?? DEFAULT_FIRES;
  const valid = Boolean(f.qualification && sv && f.qualification.contractHash === qualificationKey(L, f, active, sv.standardVersionHash, runtime, fires));
  const g = gateState(f.contract, store.getBaseline(L, active) !== null, valid ? f.qualification : null);
  const why = f.qualification && !valid
    ? `${g.why}; the last qualification was earned on a different version, standard, contract, task set, runtime or draft count`
    : g.why;
  return { state: g.state, why, fires };
}

/** Read every piece of writing in a folder, as intake would, skipping files about the work and pieces held back. */
export function readCorpus(path: string): string[] {
  if (!existsSync(path)) die(`--corpus: there is nothing at ${path}.`);
  const files = statSync(path).isDirectory() ? walk(path).map((r) => join(path, r)) : [path];
  // Pieces reserved for the blind comparison stay unread here too, matched by content.
  const reserved = new Set((loadSession().reservation?.reserved ?? []).map((u) => u.artifact.trim()));
  return files
    .filter((f) => (READABLE as readonly string[]).includes(extname(f).toLowerCase()) && !META_NAME.test(basename(f)))
    .flatMap((f) => { const r = extract(f); return r.ok ? [(r as { text: string }).text] : []; })
    .filter((t) => !reserved.has(t.trim()));
}

/** Tasks from a file: separated by blank lines, so a task can run over several lines. */
const readTasks = (file: string): string[] => {
  if (!existsSync(file)) die(`--tasks: there is no file at ${file}.`);
  return readFileSync(file, 'utf8').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
};

/**
 * Fire one SkillVersion `fires` times on each task, served exactly as `invoke` serves it. Raw drafts:
 * the floor measures the implementation, not the repair loop, and nothing here is recorded as a use.
 */
export async function fire(L: store.StoreLayout, version: string, tasks: readonly string[], fires: number,
  client: InferenceClient, budget: Budget): Promise<{ runs: { task: string; outputs: string[] }[]; servedHash: string }> {
  // Refuses (dies) when the stored package does not hash to what the version recorded.
  const served = resolveServedVersion(L, version, '');
  const contract = served.contractFile ? { schema: JSON.parse(served.contractFile) as Record<string, unknown>, artifact: 'contracts/output.schema.json' } : null;
  const jobs = tasks.flatMap((task) => Array.from({ length: fires }, () => task));
  const pieces = await mapLimit(jobs, DEFAULT_CONCURRENCY, async (task) => (await spendOneWithResult(client, budget, served.servedText, task, contract)).piece);
  return { runs: tasks.map((task, i) => ({ task, outputs: pieces.slice(i * fires, (i + 1) * fires) })), servedHash: served.servedHash };
}

const freeze = (version: string, model: string, dims: readonly FloorDimension[], runs: readonly { task: string; outputs: readonly string[] }[]): FrozenBaselineEntry[] =>
  runs.map((r) => {
    const scores = perFire(dims, r.outputs);
    const mean = Object.fromEntries(Object.entries(scores).map(([k, xs]) => [k, xs.reduce((a, b) => a + b, 0) / xs.length]));
    return { clusterId: version, fixtureContextId: sha(r.task), nGen: r.outputs.length, capturedUnderModel: model, meanScores: mean, perFireScores: scores };
  });

/** The active version's baseline, refused unless it covers every task under this model. */
function baselineFor(L: store.StoreLayout, name: string, active: string, tasks: readonly string[], model: string): readonly FrozenBaselineEntry[] {
  const b = store.getBaseline(L, active) ?? die(`the active version has no frozen baseline: atelier floor --skill ${name} --baseline`);
  if (!tasks.every((t) => b.some((e) => e.fixtureContextId === sha(t)))) die(`the baseline does not cover the current tasks (they changed after it was frozen): atelier floor --skill ${name} --baseline`);
  if (b.some((e) => e.capturedUnderModel !== model)) die(`the baseline was frozen under ${b[0]?.capturedUnderModel ?? 'another model'}, not ${model}: comparing across models measures the model change as well. Re-freeze: atelier floor --skill ${name} --baseline`);
  return b;
}

export interface CandidateCheck {
  readonly composite: FloorVerdict;
  readonly perTask: readonly QualityFloorResult[];
  readonly comparison: ComparisonVerdict;
  readonly state: DistinctivenessState;
  readonly decision: PromotionDecision;
}

/**
 * Fire a candidate on the floor's tasks and ask the promotion gate what that evidence authorises.
 *
 * The target rule, when given, is the one the change is about: its improvement across tasks is the
 * comparison the gate reads, and it is left OUT of the floor's composite (a target guarded by the floor
 * is double-counted). At least one OTHER enforced rule must be watching, or nothing guards what the
 * change did not aim at and the composite stays INCONCLUSIVE. The target is a deterministic count, so
 * its authority is CERTIFY; everything else the gate needs has to have been earned.
 */
export async function checkCandidate(L: store.StoreLayout, name: string, v: StandardVersion, active: string, candidate: string,
  targetKey: string | null, budget: Budget, client: InferenceClient, model: string, runtime: string): Promise<CandidateCheck> {
  const f = store.getFloor(L);
  const dims = floorDimensions(v);
  const contract = f.contract ?? die(`no floor contract: atelier floor --skill ${name} --corpus <folder>`);
  if (f.tasks.length < MIN_TASKS) die(`the floor needs at least ${MIN_TASKS} tasks: atelier floor --skill ${name} --tasks <file>`);
  const baseline = baselineFor(L, name, active, f.tasks, model);
  const st = floorStateFor(L, active, runtime);
  const { runs, servedHash } = await fire(L, candidate, f.tasks, st.fires, client, budget);
  const frozen = freeze(candidate, model, dims, runs);
  const exclude = new Set(targetKey ? [targetKey] : []);
  const guarded = Object.entries(contract.dimensions).some(([k, d]) => d.gateRole === 'ENFORCE' && !exclude.has(k));
  const perTask = frozen.map((c) => evaluateTask(c.perFireScores ?? {}, baseline.find((b) => b.fixtureContextId === c.fixtureContextId)!, contract, exclude));
  const composite: FloorVerdict = guarded ? compositeAcross(perTask) : 'INCONCLUSIVE';
  const comparison = targetKey
    ? targetComparison(frozen.map((c) => ({ candidate: c.perFireScores?.[targetKey] ?? [],
      champion: baseline.find((b) => b.fixtureContextId === c.fixtureContextId)?.perFireScores?.[targetKey] ?? [] })))
    : 'INCONCLUSIVE';
  const activeSv = store.getSkillVersion(L, active); const candSv = store.getSkillVersion(L, candidate);
  const decision = resolvePromotion({
    incumbentStandardHash: activeSv?.standardVersionHash ?? '', candidateStandardHash: candSv?.standardVersionHash ?? '?',
    // What was fired (the stored package's bytes) against what would be installed (the version's record).
    evaluatedPackageHash: servedHash, candidatePackageHash: candSv?.materializedHash ?? '',
    // `fire` refuses a package that does not hash to its record, so delivery is valid by construction here.
    deliveryValid: true, deterministicRegression: false,
    fidelityAuthority: targetKey ? 'CERTIFY' : 'OBSERVE', comparison, distinctiveness: st.state, floor: composite,
  });
  const unguarded = guarded ? '' : '; no enforced rule other than the target is watching, so nothing guards what the change did not aim at (--enforce another rule)';
  return { composite, perTask, comparison, state: st.state, decision: { ...decision, why: `${decision.why}${unguarded}` } };
}

/**
 * Install a promoted candidate. Its check's scores are NOT carried forward as a baseline: they were the
 * draw that made it look good, so a baseline taken from them starts the next comparison optimistic.
 * The floor is re-frozen and re-earned for the new version before it can act again.
 */
export function promoteChecked(L: store.StoreLayout, name: string, candidate: string, check: CandidateCheck, note: string): void {
  const sv = store.getSkillVersion(L, candidate) ?? die(`no SkillVersion ${candidate}.`);
  const pkg = store.getPackage(L, sv.materializedHash) ?? die(`package ${sv.materializedHash} missing.`);
  const inst = pickHost().install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) die(`install failed: ${inst.reason}\n  Nothing was promoted.`);
  const prev = store.getActive(L);
  store.setActive(L, candidate);
  const at = new Date().toISOString();
  store.appendEvent(L, { kind: 'PROMOTED', at, skillName: name, skillVersionHash: candidate, supersededActive: prev, packageHash: pkg.packageHash,
    authority: 'AUTO_PROMOTE', floor: check.composite, comparison: check.comparison, note });
  console.log(`The floor must be re-frozen and re-earned for the new version before it acts again: atelier floor --skill ${name} --baseline --qualify`);
}

export async function floor(): Promise<void> {
  const { L, name, v, active, dims } = context();
  const before = JSON.stringify(store.getFloor(L));
  let f = store.getFloor(L);
  // Configuration, not a client: showing or editing the floor must not need an API key.
  const model = modelFor('target');
  const runtime = runtimeIdentity();

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
  if (JSON.stringify(f) !== before) store.setFloor(L, f);

  const fires = Math.max(2, Math.floor(numericFlag('--fires', DEFAULT_FIRES)));
  const budgetFor = (calls: number): Budget => ({ spentUsd: 0, capUsd: numericFlag('--cap', 3), maxCalls: calls });
  const ready = (): void => {
    if (!f.contract || !Object.keys(f.contract.dimensions).length) die(`no floor contract yet: atelier floor --skill ${name} --corpus <folder of your pieces>`);
    if (f.tasks.length < MIN_TASKS) die(`the floor needs at least ${MIN_TASKS} tasks: atelier floor --skill ${name} --tasks <file> (tasks separated by blank lines).`);
  };

  // ── Freeze the active version ───────────────────────────────────────────────────────────────
  if (argv.includes('--baseline')) {
    ready();
    const { client } = clientAndBinding('target');
    console.log(`Firing the active version ${fires} time(s) on each of ${f.tasks.length} task(s)…`);
    const { runs } = await fire(L, active, f.tasks, fires, client, budgetFor(f.tasks.length * fires));
    store.setBaseline(L, active, freeze(active, model, dims, runs));
    console.log(`Baseline frozen for ${active} under ${model}.`);
  }

  // ── A/A: the false-alarm rate, from runs that are independent of each other ──────────────────
  if (argv.includes('--qualify')) {
    ready();
    baselineFor(L, name, active, f.tasks, model);
    if (!Object.values(f.contract!.dimensions).some((d) => d.gateRole === 'ENFORCE')) {
      die('no dimension is ENFORCE, so there is nothing that could raise a false alarm. Choose which rules may block: --enforce <rule>');
    }
    const { client } = clientAndBinding('target');
    console.log(`A/A: firing the same version ${2 * fires} time(s) on each task and comparing one half with the other…`);
    const { runs } = await fire(L, active, f.tasks, 2 * fires, client, budgetFor(f.tasks.length * 2 * fires));
    // Both halves are fresh in every run, so runs are independent of each other; the unit is the task.
    const halves = runs.map((r) => ({
      a: freeze(active, model, dims, [{ task: r.task, outputs: r.outputs.slice(0, fires) }])[0],
      b: freeze(active, model, dims, [{ task: r.task, outputs: r.outputs.slice(fires) }])[0] }));
    const results = halves.map(({ a, b }) => evaluateTask(b.perFireScores ?? {}, a, f.contract!));
    const planted = halves.reduce((t, { a, b }) => { const x = plantedDetections(b.perFireScores ?? {}, a, f.contract!); return { hits: t.hits + x.hits, trials: t.trials + x.trials }; }, { hits: 0, trials: 0 });
    // Runs on the same situation accumulate; change anything the rate is a rate of and the count restarts.
    const key = qualificationKey(L, f, active, v.standardVersionHash, runtime, fires);
    const now = countAA(results);
    const prior = f.aa?.contractHash === key ? f.aa : { falseAlarms: 0, trials: 0, plantedHits: 0, planted: 0 };
    const tally = { falseAlarms: prior.falseAlarms + now.falseAlarms, trials: prior.trials + now.trials,
      plantedHits: (prior.plantedHits ?? 0) + planted.hits, planted: (prior.planted ?? 0) + planted.trials };
    const q = qualifyFromAA(tally, f.tasks.length, `${name}: ${Object.keys(f.contract!.dimensions).length} measured dimension(s), ${f.tasks.length} task(s), ${fires} draft(s) per side, under ${runtime}`);
    console.log(`This run: ${now.falseAlarms} false alarm(s) in ${now.trials} resolved task comparison(s) (${results.length - now.trials} unresolved); `
      + `caught ${planted.hits} of ${planted.trials} planted regression(s) of ${PLANTED_MARGINS} margins.`);
    console.log(`So far: ${tally.falseAlarms} false alarm(s) in ${tally.trials} (upper 95% bound ${(q.upper95 * 100).toFixed(1)}%); `
      + `sensitivity ${q.sensitivity === null ? 'unmeasured' : `${Math.round(q.sensitivity * 100)}% of ${tally.planted}`}.`);
    f = { ...f, aa: { contractHash: key, ...tally }, qualification: q.qualification ? { ...q.qualification, contractHash: key, fires } : null };
    store.setFloor(L, f);
    console.log(q.qualification ? 'The floor is EARNED for this version, standard, contract, baseline, task set, runtime and draft count.'
      : `Not qualified yet: false alarms at most 5% (upper bound) over at least ${MIN_TASKS} tasks, and at least ${Math.round(MIN_SENSITIVITY * 100)}% of ${MIN_PLANTED}+ planted regressions caught. `
        + 'Run --qualify again to add evidence, add tasks or drafts (--fires), or widen margins that are tighter than your writing varies.');
  }

  // ── Check a candidate ───────────────────────────────────────────────────────────────────────
  const cand = flag('--check');
  if (cand) {
    ready();
    const target = flag('--target');
    const targetKey = target ? keyOf(target) : null;
    const { client } = clientAndBinding('target');
    const st = floorStateFor(L, active, runtime);
    const check = await checkCandidate(L, name, v, active, cand, targetKey, budgetFor(f.tasks.length * st.fires), client, model, runtime);
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
      console.log(`Promoted ${cand}.`);
    }
    return;
  }

  describeFloor(L, name, active, dims, runtime);
}

function describeFloor(L: store.StoreLayout, name: string, active: string, dims: readonly FloorDimension[], runtime: string): void {
  const f = store.getFloor(L);
  const st = floorStateFor(L, active, runtime);
  console.log(`Regression floor for ${name}  ·  active ${active}`);
  console.log(`  state: ${st.state} — ${st.why}`);
  console.log(`  tasks: ${f.tasks.length}${f.tasks.length < MIN_TASKS ? ` (needs ${MIN_TASKS})` : ''}`);
  console.log(`  baseline: ${store.getBaseline(L, active) ? `frozen for ${active}` : 'none for the active version'}`);
  if (f.aa) console.log(`  A/A so far: ${f.aa.falseAlarms} false alarm(s) in ${f.aa.trials} resolved task comparison(s); caught ${f.aa.plantedHits ?? 0} of ${f.aa.planted ?? 0} planted regressions`);
  const statement = new Map(dims.map((d) => [d.key, d.rule.statement]));
  const rows = Object.entries(f.contract?.dimensions ?? {});
  console.log(`  dimensions: ${rows.length} of ${dims.length} measured rule(s)`);
  for (const [k, d] of rows) console.log(`    ${k}  ${d.gateRole.padEnd(7)}  margin ${String(d.nonInferiorityMargin).padEnd(6)}  ${(statement.get(k) ?? '(no longer in the standard)').slice(0, 60)}`);
  const enforced = rows.filter(([, d]) => d.gateRole === 'ENFORCE').length;
  const next = !rows.length ? `atelier floor --skill ${name} --corpus <folder of your pieces>`
    : f.tasks.length < MIN_TASKS ? `atelier floor --skill ${name} --tasks <file>`
      : !store.getBaseline(L, active) ? `atelier floor --skill ${name} --baseline`
        : enforced < 2 ? `atelier floor --skill ${name} --enforce <rule>   (which rules may block a new version; a repair's own rule never guards itself, so at least two)`
          : st.state !== 'EARNED' ? `atelier floor --skill ${name} --qualify` : null;
  console.log(next ? `\nNext: ${next}` : '\nThe floor is earned: a repair whose rule improves across your tasks, while every other enforced rule holds, can install itself.');
}
