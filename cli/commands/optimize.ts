// cli/commands/optimize.ts — SEARCH THE IMPLEMENTATION, NEVER THE STANDARD.
//
//   atelier optimize --skill <name> [--candidates 6] [--finalists 2] [--screen-model <cheap model>]
//                    [--no-reflect] [--promote] [--cap <usd>]
//   atelier optimize --skill <name> --report
//
// One round of a search in the family of GEPA and SkillOpt, and narrower than either (no rewritten text, no pool of
// candidates kept between rounds, a screen on rule means and not on task instances), hosted where it cannot move the target:
//
//   1. PROPOSE   single-gene changes to what the compiler derives (core/optimizer/genome.ts): first by
//                reflection, a model reading real failures and choosing among legal changes
//                (core/optimizer/reflect.ts); the rest from the fixed ordering. Repair memory removes
//                moves already tried on evidence at least as strong as this round's first test.
//   2. BUILD     each candidate is rebuilt from the ratified standard, never edited; the standard hash is
//                asserted unchanged at the mint.
//   3. SCREEN    one draft per task on a cheap model; each candidate scored on every measured rule, a
//                change counting only when it exceeds that rule's margin; the champion-dominated dropped;
//                the Pareto front ranked; a few finalists kept.
//   4. CONFIRM   finalists whose change is to a MEASURED rule are fired on the real model against the
//                regression floor, and the promotion gate reads the result. The taste reader, where your
//                labels have earned it VETO (docs/TASTE.md), may block a finalist that misses those rules
//                more often than the current version; it never clears one.
//                A change to an unmeasured rule, or to whether the exemplar or examples ship, cannot be
//                shown better by a count, so it is left for you: it never installs itself.
//   5. ADOPT     only with --promote, only on AUTO_PROMOTE, and only one change per round.
//
// Every candidate leaves the round settled or explicitly waiting for you (`atelier promote` or
// `atelier reject`), and every round is recorded, including one that stopped for lack of budget.
// `--report` reads the record back as the experiment it is: are reflective proposals kept more often
// than the fixed ordering's?

import * as store from '../../core/state/store.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { keysOf } from '../../core/state/rule-key.js';
import { compileArchitecture, type SkillArchitecture } from '../../core/architecture/compile.js';
import { applyEscalation } from '../../core/architecture/escalate.js';
import { assertStandardUnchanged } from '../../core/architecture/replace-carrier.js';
import { foldRepairs, foldProhibitions, mayPropose, repairKey, type EvaluationBasis } from '../../core/architecture/repair-memory.js';
import { renderAgentSkill, assertPortable } from '../../renderers/agent-skill/render.js';
import { genomeOf, mutationsOf, describeMutation, mutationKey, type Mutation } from '../../core/optimizer/genome.js';
import { REFLECT_SYSTEM, REFLECT_SCHEMA, reflectPrompt, parseReflection, type Failure, type Attempt } from '../../core/optimizer/reflect.js';
import { finalists, type Scores } from '../../core/optimizer/pareto.js';
import { tasteRules } from '../../core/taste/reader.js';
import { tastePermissions } from '../../core/taste/calibration.js';
import { readerModel } from './taste.js';
import { floorDimensions, perFire } from '../../core/distinctiveness/measured.js';
import { contrastFor, type ContrastPair } from '../../core/compiler/contrast-examples.js';
import { checkDraft } from '../../core/loop/run-repair.js';
import { spend, type Budget } from '../../core/inference/client.js';
import { shipsAutonomously } from '../../core/convergence/promotion.js';
import { fire, checkCandidate, promoteChecked, floorStateFor, runtimeIdentity, baselineProblem, MIN_TASKS, TASTE_GATE_CALLS } from './floor.js';
import { sha, DATA, die, argv, flag, numericFlag, skillArg, clientAndBinding, clientFor, diagnoserModel, modelFor, carriedFrom } from '../runtime.js';

type Proposer = 'REFLECTIVE' | 'FIXED_ORDER';
interface Candidate {
  readonly mutation: Mutation; readonly proposer: Proposer; readonly why: string;
  readonly skillVersionHash: string; readonly repairId: string | null;
  /** the measured rule the change is about, when there is one: the only kind a count can show improved */
  readonly target: string | null;
  screen?: Scores; settled?: boolean;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** The first test every candidate faces: one draft per task, read by counts on a cheap model. */
const SCREEN: EvaluationBasis = { generations: 1, instrument: 'UNQUALIFIED_COMPARATOR', orderInvariant: null };
/** A candidate a round built but never got to evaluate: weaker than any test, so it is not held against a retry. */
const UNTESTED: EvaluationBasis = { generations: 0, instrument: 'UNQUALIFIED_COMPARATOR', orderInvariant: null };

/** `promote`: install a winner the promotion gate allows (`--promote`, or `tend --auto`). */
export async function optimize(opts: { readonly promote?: boolean } = {}): Promise<void> {
  const promoteAllowed = opts.promote ?? argv.includes('--promote');
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  if (argv.includes('--report')) { report(L); return; }

  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const arch = store.getArchitecture(L, sv.architectureHash, sv.standardVersionHash) ?? compileArchitecture(v);
  const pkg = store.getPackage(L, sv.materializedHash) ?? die(`package ${sv.materializedHash} is missing.`);
  const model = modelFor('target'); const runtime = runtimeIdentity();

  // ── THE FLOOR IS THE PRECONDITION ────────────────────────────────────────────────────────────
  // A search with nothing guarding what it does not target will make the writing worse and report an
  // improvement. It runs on any floor with a baseline; only an EARNED one lets it install anything.
  const floor = store.getFloor(L);
  if (!floor.contract || !Object.keys(floor.contract.dimensions).length || floor.tasks.length < MIN_TASKS || !store.getBaseline(L, active)) {
    die(`optimize needs a regression floor with margins, at least ${MIN_TASKS} tasks and a baseline for the active version, so a search `
      + `cannot make what it does not target worse unnoticed. See where it stands: atelier floor --skill ${name}`);
  }
  // A baseline that cannot be compared against (tasks changed, frozen under another model) is refused
  // here, before the screen spends anything, not halfway through the round.
  const stale = baselineProblem(L, name, active, floor.tasks, model);
  if (stale) die(`optimize cannot compare against the baseline: ${stale}`);
  const st = floorStateFor(L, active, runtime);
  if (st.state !== 'EARNED') console.log(`The floor is ${st.state}, so nothing this round finds can install itself; finalists are left for you.`);
  const dims = floorDimensions(v);
  const keys = keysOf(v.requirements);
  const keyOfRule = new Map(v.requirements.map((r, i) => [r.requirementId, keys[i]]));
  const rules = new Map(v.requirements.map((r) => [r.requirementId, r]));
  const events = store.readEvents(L);
  const scope = { standardVersionHash: v.standardVersionHash, providerAdapter: clientAndBinding('target').binding.providerAdapter, requestedModel: model };
  const evidence = { missContexts: floor.tasks.length, invocationIds: [] };
  // ONE BUDGET FOR THE ROUND. --cap is the total: reflection, screen and confirmation draw on it. The call
  // ceiling is what the round can need at most, and it is what binds a runtime with no known prices.
  const want = Math.max(1, Math.floor(numericFlag('--candidates', 6)));
  const keep = Math.max(1, Math.floor(numericFlag('--finalists', 2)));
  const T = floor.tasks.length;
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 5),
    // per finalist: the floor's drafts, then the taste check (floor.ts TASTE_GATE_CALLS)
    maxCalls: 1 + (want + 1) * T + keep * (T * st.fires + TASTE_GATE_CALLS) };

  // ── 1. PROPOSE ─────────────────────────────────────────────────────────────────────────────────
  const carried = carriedFrom(L, active, v);
  const genome = genomeOf(arch, pkg.files);
  const repairs = foldRepairs(events); const prohibitions = foldProhibitions(events);
  // A toggle has no rule and so no repair record; its memory is the rounds: tried on this version and
  // not adopted means not proposed again until the version changes.
  const triedToggles = new Set(events.filter((e) => e.kind === 'OPTIMIZE_ROUND' && e.champion === active)
    .flatMap((e) => (e.candidates as { change: string; skillVersionHash: string }[] | undefined ?? []).filter((c) => c.skillVersionHash !== e.promoted).map((c) => c.change)));
  const legal = mutationsOf(genome, v, { exemplar: Boolean(store.getExemplar(L)), contrast: genome.contrast || contrastAvailable(L, v).length > 0 })
    .filter((m) => (m.kind === 'CARRIER'
      ? mayPropose(repairs, prohibitions, m.requirementId, m.from, m.to, { evidence, evaluation: SCREEN }, scope).allowed
      : !triedToggles.has(mutationKey(m))));
  if (!legal.length) { console.log('No legal change is left to try: every alternative has been tried on evidence at least this strong, or you ruled it out.'); return; }

  const proposals: { mutation: Mutation; proposer: Proposer; why: string }[] = [];
  if (!argv.includes('--no-reflect')) {
    // Chronological, and only about the rules in play, so the budgeted "most recent" really are.
    const inPlay = new Set(legal.flatMap((m) => (m.kind === 'CARRIER' ? [m.requirementId] : [])));
    const attempts = [...repairs].reverse().filter((r) => inPlay.has(r.requirementId))
      .map((r) => ({ requirementId: r.requirementId, from: r.from, to: r.to, outcome: r.outcome }));
    const reflection = await reflect(L, v, legal, attempts, budget);
    for (const p of reflection.proposals) proposals.push({ mutation: p.mutation, proposer: 'REFLECTIVE', why: p.why });
    if (reflection.invalid) console.log(`(${reflection.invalid} reflective proposal(s) named no legal change and were discarded)`);
  }
  for (const m of legal) {
    if (proposals.length >= want) break;
    if (!proposals.some((p) => mutationKey(p.mutation) === mutationKey(m))) proposals.push({ mutation: m, proposer: 'FIXED_ORDER', why: 'next legal change under the fixed ordering' });
  }
  console.log(`Round on ${name} (${active}): ${proposals.length} candidate(s), ${proposals.filter((p) => p.proposer === 'REFLECTIVE').length} by reflection.`);

  // ── 2. BUILD ───────────────────────────────────────────────────────────────────────────────────
  const candidates: Candidate[] = proposals.map((p) => build(L, name, v, sv, arch, carried, p, scope, evidence, keyOfRule, dims));
  const finish = (best: readonly Candidate[], promoted: Candidate | null, aborted: string | null): void => {
    // Anything the round built and did not finish judging is settled as untested, so it is not held
    // against a retry. On a stop that includes candidates the screen had already reached: their round
    // never ranked them. Finalists left for a person are the only ones that stay waiting.
    for (const c of candidates.filter((x) => !x.settled && (aborted ? !best.includes(x) : x.screen === undefined))) {
      settle(L, c, 'REJECTED', UNTESTED, aborted ? `round stopped: ${aborted}` : 'not tested');
    }
    record(L, active, candidates, best, promoted, aborted);
    console.log(`(this round: ${budget.calls ?? 0} model call(s), $${budget.spentUsd.toFixed(3)} of $${budget.capUsd})`);
  };

  // ── 3. SCREEN ──────────────────────────────────────────────────────────────────────────────────
  const screenModel = flag('--screen-model') ?? process.env.ATELIER_SCREEN_MODEL ?? model;
  if (screenModel === model) console.log(`Screening on ${model} itself. A cheaper model (--screen-model) makes this round cheaper; the confirmation always uses ${model}.`);
  const { client: screenClient } = clientAndBinding('target', screenModel);
  const screenScores = async (version: string): Promise<Scores> => {
    const { runs } = await fire(L, version, floor.tasks, 1, screenClient, budget);
    const per = perFire(dims, runs.flatMap((r) => r.outputs));
    return Object.fromEntries(Object.entries(per).map(([k, xs]) => [k, mean(xs)]));
  };
  let champion: Scores;
  try {
    champion = await screenScores(active);
    for (const c of candidates) c.screen = await screenScores(c.skillVersionHash);
  } catch (e) {
    const why = (e as Error).message.split('\n')[0];
    console.log(`The screen could not finish (${why}). Nothing changed; the candidates it did not reach are recorded as untested.`);
    finish([], null, why); return;
  }
  // A change counts only beyond the rule's own margin: rules score on different scales, and one cheap
  // draft per task is noisy.
  const contract = floor.contract ?? die(`no floor contract: atelier floor --skill ${name} --corpus <folder>`);
  const epsilon = Object.fromEntries(Object.entries(contract.dimensions).map(([k, d]) => [k, d.nonInferiorityMargin]));
  const countable = candidates.filter((c) => c.target !== null);
  const best = finalists(countable, (c) => c.screen ?? {}, champion, keep, epsilon);
  for (const c of candidates) {
    const wins = Object.keys(c.screen ?? {}).filter((k) => (c.screen?.[k] ?? 0) > (champion[k] ?? 0) + (epsilon[k] ?? 0)).length;
    console.log(`  ${best.includes(c) ? '→' : ' '} ${describeMutation(c.mutation, rules)}  [${c.proposer}]  ${c.target === null ? 'not measurable by a count: yours to judge' : `better beyond margin on ${wins} rule(s) in the screen`}`);
  }
  for (const c of candidates.filter((x) => !best.includes(x))) {
    if (c.target === null) console.log(`    to try it yourself: atelier promote --skill ${name} --candidate ${c.skillVersionHash} --why "<reason>"   (or atelier reject)`);
    else settle(L, c, 'REJECTED', SCREEN, 'screened out');
  }
  if (!best.length) { console.log('Nothing beat the current version beyond its margins in the screen. Nothing changes automatically.'); finish(best, null, null); return; }

  // ── 4. CONFIRM ─────────────────────────────────────────────────────────────────────────────────
  const { client, binding } = clientAndBinding('target');
  // The taste reader (docs/TASTE.md), on the rules where your labels have earned it VETO: it may block a
  // finalist that misses those rules more often than the current version. It can never clear one.
  const taste = tastePermissions(tasteRules(v), events, readerModel());
  console.log(`Taste reader: ${taste.veto.size ? `holds VETO on ${taste.veto.size} rule(s)` : 'holds no authority yet (atelier taste --calibrate)'}.`);
  let promoted: Candidate | null = null;
  const basis: EvaluationBasis = { generations: st.fires, instrument: 'QUALIFIED_OBSERVER', orderInvariant: null };
  for (const c of best) {
    let authority: string; let why: string; let check: Awaited<ReturnType<typeof checkCandidate>>;
    try {
      // The taste reader's VETO is applied inside checkCandidate, as on every path that can install.
      check = await checkCandidate(L, name, v, active, c.skillVersionHash, c.target, budget, client, binding.requestedModel, runtime);
      authority = check.decision.authority; why = check.decision.why;
    } catch (e) {
      const stop = (e as Error).message.split('\n')[0];
      console.log(`  ${describeMutation(c.mutation, rules)}: the confirmation could not finish (${stop}); left for you.`);
      console.log(`    atelier promote --skill ${name} --candidate ${c.skillVersionHash} --why "<reason>"   (or atelier reject)`);
      finish(best, promoted, stop); return;
    }
    console.log(`  ${describeMutation(c.mutation, rules)}: floor ${check.composite}, target ${check.comparison}, gate ${authority}. ${why}`);
    store.appendEvent(L, { kind: 'FLOOR_CHECK', candidateSkillVersionHash: c.skillVersionHash, floor: check.composite, comparison: check.comparison, authority, at: new Date().toISOString() });
    if (authority === 'AUTO_REJECT') { settle(L, c, 'REJECTED', basis, why); continue; }
    if (shipsAutonomously(check.decision) && promoteAllowed && !promoted) {
      promoteChecked(L, name, c.skillVersionHash, check, `optimize: ${describeMutation(c.mutation)}`);
      settle(L, c, 'PROMOTED', basis, 'installed by the gate');
      promoted = c;
      console.log(`Installed ${c.skillVersionHash}. The previous version remains: atelier rollback --skill ${name} --to ${active}`);
      continue;
    }
    // Waiting for a person: the gate could not act, or --promote was not given.
    console.log(`    to adopt it yourself: atelier promote --skill ${name} --candidate ${c.skillVersionHash} --why "<reason>"   (or atelier reject)`);
  }
  // SUPERSEDED. Every other candidate this round was built on the version just replaced: promoting one
  // now would silently revert the change installed. They are settled as never judged (no generations),
  // so repair memory holds nothing against the same move on the new version.
  if (promoted) {
    const unjudged: EvaluationBasis = { generations: 0, instrument: 'QUALIFIED_OBSERVER', orderInvariant: null };
    const stale = candidates.filter((c) => c !== promoted && !c.settled);
    for (const c of stale) settle(L, c, 'REJECTED', unjudged, `superseded: ${promoted.skillVersionHash} was installed this round`);
    if (stale.length) console.log(`${stale.length} other candidate(s) were built on the version just replaced and are set aside; the next round proposes against ${promoted.skillVersionHash}.`);
  }
  finish(best, promoted, null);
}

/** GEPA's reflective step: a model reads recent failures and prior attempts, and chooses among legal changes. */
async function reflect(L: store.StoreLayout, v: StandardVersion, legal: readonly Mutation[], attempts: readonly Attempt[], budget: Budget) {
  const rules = new Map(v.requirements.map((r) => [r.requirementId, r]));
  const failures: Failure[] = [];
  for (const inv of store.listLearningInvocations(L).filter((i) => i.standardVersionHash === v.standardVersionHash).slice(-8)) {
    const report = checkDraft(L.skillName, v, inv.repair?.draft ?? inv.output, { guardClaims: false });
    for (const c of report.checked) {
      if (c.result.verdict !== 'VIOLATED') continue;
      const span = c.result.spans[0];
      failures.push({ requirementId: c.requirementId, text: span?.text ?? inv.output.slice(0, 200), why: span?.why ?? c.result.detail });
    }
  }
  try {
    const res = await spend(budget, 0.05, async () => {
      const x = await clientFor(diagnoserModel()).complete({ stableBlock: REFLECT_SYSTEM, variableBlock: '',
        userMessage: reflectPrompt(rules, legal, failures, attempts), toolName: 'emit_proposals',
        toolDescription: 'Choose legal changes by number.', schema: REFLECT_SCHEMA, maxTokens: 1500 });
      return { value: x, cost: x.cost };
    });
    return parseReflection(res.json, legal);
  } catch (e) {
    console.log(`(reflection could not run: ${(e as Error).message.split('\n')[0]}; the fixed ordering proposes instead)`);
    return { proposals: [], invalid: 0 };
  }
}

/** Mint one candidate: rebuilt from the standard with one gene changed. */
function build(L: store.StoreLayout, name: string, v: StandardVersion, sv: { skillVersionHash: string; standardVersionHash: string; description?: string | null },
  arch: SkillArchitecture, carried: ReturnType<typeof carriedFrom>, p: { mutation: Mutation; proposer: Proposer; why: string },
  scope: { standardVersionHash: string; providerAdapter: string; requestedModel: string }, evidence: { missContexts: number; invocationIds: string[] },
  keyOfRule: ReadonlyMap<string, string>, dims: ReturnType<typeof floorDimensions>): Candidate {
  const m = p.mutation;
  const nextArch = m.kind === 'CARRIER'
    ? applyEscalation(arch, { kind: 'ESCALATE_CARRIER', requirementId: m.requirementId, from: m.from, to: m.to, becauseInvocation: 'optimize', rationale: p.why },
      sha(`${arch.architectureHash}|${mutationKey(m)}`))
    : arch;
  const exemplar = m.kind === 'EXEMPLAR' ? (m.on ? store.getExemplar(L) : null) : carried.exemplar;
  const contrast = m.kind === 'CONTRAST' ? (m.on ? contrastAvailable(L, v) : []) : carried.contrast;
  const desc = sv.description ?? `Applies a compiled standard (${v.workType})`;
  const pkg = renderAgentSkill(v, nextArch, name, desc, exemplar, contrast, carried.voice);
  assertPortable(pkg);
  const candidate = { skillVersionHash: sha(`${nextArch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: v.standardVersionHash, architectureHash: nextArch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: desc };
  // CONSTRAINT B, AT THE MINT: the candidate is bound to the very standard it was built from.
  // Against the CHAMPION's recorded standard, with the rendered content re-hashed (see replace-carrier.ts).
  assertStandardUnchanged(sv, candidate, v);
  store.putArchitecture(L, nextArch); store.putPackage(L, pkg); store.putSkillVersion(L, candidate);
  let repairId: string | null = null;
  if (m.kind === 'CARRIER') {
    repairId = sha(repairKey(m.requirementId, m.from, m.to) + candidate.skillVersionHash);
    store.appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId, skillName: name, requirementId: m.requirementId, from: m.from, to: m.to,
      ...scope, proposer: p.proposer, why: p.why, sourceSkillVersionHash: sv.skillVersionHash, origin: 'OPTIMIZE',
      candidateSkillVersionHash: candidate.skillVersionHash, evidenceBasis: evidence, at: candidate.builtAt });
  }
  // Only a change to a rule the floor measures can be shown better by a count.
  const key = m.kind === 'CARRIER' ? keyOfRule.get(m.requirementId) : undefined;
  const target = key && dims.some((d) => d.key === key) ? key : null;
  return { mutation: m, proposer: p.proposer, why: p.why, skillVersionHash: candidate.skillVersionHash, repairId, target };
}

/** The pairs the last build chose, where they still teach this standard: what "ship the contrast examples" would ship. */
const contrastAvailable = (L: store.StoreLayout, v: StandardVersion): ContrastPair[] => contrastFor(store.getContrast(L).pairs, v);

function settle(L: store.StoreLayout, c: Candidate, outcome: 'PROMOTED' | 'REJECTED', evaluationBasis: EvaluationBasis, note: string): void {
  c.settled = true;
  if (c.repairId) store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: c.repairId, outcome, evaluationBasis, at: new Date().toISOString(), note });
}

function record(L: store.StoreLayout, active: string, candidates: readonly Candidate[], best: readonly Candidate[], promoted: Candidate | null, aborted: string | null): void {
  store.appendEvent(L, { kind: 'OPTIMIZE_ROUND', at: new Date().toISOString(), champion: active, aborted,
    candidates: candidates.map((c) => ({ change: mutationKey(c.mutation), proposer: c.proposer, skillVersionHash: c.skillVersionHash, finalist: best.includes(c) })),
    promoted: promoted?.skillVersionHash ?? null });
}

/** The experiment: are reflective proposals kept more often than the fixed ordering's? */
function report(L: store.StoreLayout): void {
  const repairs = foldRepairs(store.readEvents(L)) as readonly (ReturnType<typeof foldRepairs>[number] & { proposer?: string })[];
  const rows = ['REFLECTIVE', 'FIXED_ORDER'].map((p) => {
    const mine = repairs.filter((r) => (r.proposer ?? 'FIXED_ORDER') === p);
    return { p, n: mine.length, kept: mine.filter((r) => r.outcome === 'PROMOTED').length,
      rejected: mine.filter((r) => r.outcome === 'REJECTED').length, pending: mine.filter((r) => r.outcome === 'PENDING').length };
  });
  console.log(`Proposals for ${L.skillName}, by who proposed them:`);
  for (const r of rows) console.log(`  ${r.p.padEnd(12)} ${String(r.n).padStart(3)} proposed · ${r.kept} kept · ${r.rejected} rejected · ${r.pending} waiting for you`);
  const rounds = store.readEvents(L).filter((e) => e.kind === 'OPTIMIZE_ROUND');
  console.log(`\n${rounds.length} round(s), ${rounds.filter((e) => e.promoted).length} installing something, ${rounds.filter((e) => e.aborted).length} stopped early.`);
  console.log('A difference between the two rows means something only once each has at least ten settled proposals.');
}
