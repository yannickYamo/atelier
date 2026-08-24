// cli/commands/improve.ts — Changing the implementation while the standard stays frozen.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { resolve, basename } from 'node:path';
import type { Budget, InferenceClient } from '../../core/inference/client.js';
import { spend } from '../../core/inference/client.js';
import { observeRuntime, type RuntimeBinding } from '../../core/runtime/binding.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import { proposeEscalation, applyEscalation, type ServedMissEvidence } from '../../core/architecture/escalate.js';
import { foldRepairs, foldProhibitions, mayPropose, describeHistory, WEAKEST_EVALUATION,
  type EvidenceBasis } from '../../core/architecture/repair-memory.js';
import { runSpine, explainSpine } from '../../core/convergence/controller.js';
import { proposeFloor } from '../../core/distinctiveness/contract.js';
import { resolveFromFrozenText, admitsEvidence } from '../../core/measurement/applicability.js';
import { nextLevel } from '../../core/architecture/escalate.js';
import { diagnose } from '../../core/diagnosis/diagnose.js';
import { renderAgentSkill, assertPortable } from '../../renderers/agent-skill/render.js';
import * as store from '../../core/state/store.js';
import { type Provenance } from '../../core/fidelity/provenance.js';

import { intake } from './intake.js';
import { discover, ratifyClose } from './discover.js';
import { build } from './build.js';
import { sha, DATA, die, argv, flag, MODEL, clientFor , numericFlag, assertReachable} from '../runtime.js';
import type { InvocationRecord, TaskSource } from '../../core/state/canonical-state.js';
import { assertRequestBound } from '../../core/state/canonical-state.js';
import { asText } from '../../core/discovery/text.js';

// ── improve ──────────────────────────────────────────────────────────────────────────────────
/**
 * Improve mints a NEW StandardVersion. It never edits the old one.
 *
 * A record of what someone approved that changes without their approval is not a record. So the old
 * version stays readable forever, the new one carries `supersedes` and a reason in their words, and
 * rollback remains possible because nothing was overwritten.
 */
export async function improve(): Promise<void> {
  const name = flag('--skill') ?? die('--skill required');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash)!;
  const prev = store.getStandard(L, sv.standardVersionHash) ?? die('previous standard missing.');
  const invId = flag('--invocation');

  // WHAT THIS COMMAND MEANS, AND WHAT IT DOES NOT.
  //
  // Improve is the IMPLEMENTATION loop: same StandardVersion, better arrangement, new SkillVersion.
  // It used to route straight to `ratify-close --supersedes`, which made "improve my skill" mean
  // "change what you consider good" — inverting the one law the product exists to hold, in the one
  // place a user would read it.
  if (!invId) {
    const arch = store.getArchitecture(L, sv.architectureHash) ?? compileArchitecture(prev);
    console.log(`skill ${name}`);
    console.log(`  standard     ${prev.standardVersionHash} [${prev.authorityState}] — ${prev.requirements.length} requirement(s), THIS DOES NOT CHANGE HERE`);
    console.log(`  architecture ${sv.architectureHash} — ${arch.components.length} component(s), this is what improve moves`);
    for (const c of arch.components) console.log(`    ${c.carries.join(',').padEnd(6)} ${c.carrier}/${c.sensor} ${c.gateRole}`);
    // ── WHAT THE EVIDENCE ACTUALLY SAYS, PER REQUIREMENT ─────────────────────────────────────
    //
    // `listInvocations` used to be the only way execution history was consumed, and it was consumed
    // by printing the last three. This reads the same history as evidence: independent contexts,
    // nesting, recurrence, claimability, repair history — and says what each requirement is
    // blocked on, which is the question a person actually has.
    const events = store.readEvents(L);
    const observations = store.listObservations(L);
    const invocations = store.listInvocations(L);
    const repairs = foldRepairs(events);
    const prohibitions = foldProhibitions(events);

    console.log(`\nWhat the evidence says:\n`);
    const spines = [];
    for (const r of prev.requirements) {
      const carrying = arch.components.find((c) => c.carries.includes(r.requirementId));
      const cur = carrying?.carrier;
      const spine = runSpine({ requirementId: r.requirementId, invocations, observations, repairs,
        prohibitions, currentCarrier: cur, nextCarrier: cur ? nextLevel(cur) : null });
      spines.push(spine);
      console.log(explainSpine(spine).split('\n').map((l) => `  ${l}`).join('\n'));
    }

    // ── WHAT PROTECTING YOUR STANDARD WOULD MEAN ─────────────────────────────────────────────
    //
    // Shown when something is blocked on the distinctiveness gate, so the abstract phrase
    // "build a distinctiveness baseline" arrives as a concrete list of YOUR behaviours. Derived, not
    // approved: choosing which of these optimization may not trade away is an authority act.
    if (spines.some((s) => s.action.kind === 'BUILD_DISTINCTIVENESS_BASELINE')) {
      const floor = proposeFloor(prev, new Set(), []);
      console.log(`\nProtecting your standard would mean holding these still while the skill improves:\n`);
      for (const d of floor.dimensions) console.log(`  ${d.sourceRequirementIds.join(',')}  ${d.protectedBehavior.slice(0, 88)}...`);
      console.log(`\nNone of them is protected yet: how much of each you would accept losing is yours to decide,`);
      console.log(`and it cannot be computed from anything measured.\n`);
    }

    const recent = invocations.slice(0, 3);
    console.log(`\nA repair needs a real output to repair. Run the skill, then point at what went wrong:`);
    console.log(`  atelier invoke --skill ${name} "<your task>"`);
    console.log(`  atelier improve --skill ${name} --invocation <id> --complaint "<what was wrong>"`);
    if (recent.length) { console.log(`\nRecent invocations:`); for (const r of recent) console.log(`  ${r.invocationId}  ${r.at}  "${r.input.slice(0, 58)}"`); }
    console.log(`\nTo change what good MEANS — a different thing: atelier confirm --skill ${name} --rule <id> [--drop]`);
    return;
  }

  // ── THE REPAIR LOOP ────────────────────────────────────────────────────────────────────────
  const inv = store.getInvocation(L, invId) ?? die(`no invocation ${invId} for ${name}.`);
  const complaint = flag('--complaint') ?? die('--complaint "<what was wrong with that output>" — the repair is driven by what YOU say went wrong, not by a score.');
  const fb = { feedbackId: `f${sha(`${invId}|${complaint}`).slice(0, 10)}`, invocationId: invId, complaint, at: new Date().toISOString() };
  store.putFeedback(L, fb);

  // The standard THAT RAN, not the current one. A complaint is about the version that produced it.
  const ranStandard = store.getStandard(L, inv.standardVersionHash) ?? die(`standard ${inv.standardVersionHash} missing.`);
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 0.5), maxCalls: numericFlag('--max-calls', 12) };
  const client = clientFor(flag('--model') ?? MODEL);
  const d = await diagnose(client, budget, ranStandard, inv, fb);

  console.log(`\ndiagnosis  ${d.route}   ($${budget.spentUsd.toFixed(4)})`);
  console.log(`  ${d.reason}`);

  if (d.route === 'DELIVERY_FAILURE') {
    console.log(`\nThis is a SERVING problem, not a taste problem. Your standard is not involved and nothing about`);
    console.log(`the output tells us anything about it. Rebuild so the installed artefact matches what was approved:`);
    console.log(`  atelier build --name ${name}`);
    return;
  }
  if (d.route === 'STANDARD_GAP') {
    console.log(`\nNothing you have authorised covers this, so there is no implementation to repair. What you`);
    console.log(`described would be a NEW RULE, and a new rule changes what good means — which is yours alone:`);
    console.log(`\n  proposed:  ${d.proposedRequirement}`);
    console.log(`\nAtelier will not add it. If it is right, add it as your own and it will mint a new StandardVersion.`);
    return;
  }
  if (d.route === 'UNCERTAIN') {
    console.log(`\nI am not confident enough to change anything, and guessing would repair the wrong thing.`);
    console.log(`\n  ${d.question}`);
    console.log(`\nNothing was changed. Re-run improve with a sharper complaint when you can.`);
    return;
  }

  // IMPLEMENTATION_MISS — the only route that authorises a change, and only to the arrangement.
  const ranArch = store.getArchitecture(L, inv.architectureHash) ?? die(`architecture ${inv.architectureHash} missing — this SkillVersion predates architecture persistence.`);
  const carrying = ranArch.components.find((c) => c.carries.includes(d.requirementId!));
  const ev: ServedMissEvidence = { invocationId: inv.invocationId, requirementId: d.requirementId!,
    carrierAtServe: carrying?.carrier ?? 'PROSE', expertConfirmed: true, at: new Date().toISOString() };
  const op = proposeEscalation(ev, ranArch);
  if ('refused' in op) { console.log(`\nNo repair proposed: ${op.reason}`); return; }

  // ── HAS A PERSON ALREADY SAID NO TO EXACTLY THIS? ──────────────────────────────────────────
  //
  // Until now the loop could propose a repair, have it rejected, and propose the identical repair on
  // the next complaint about the same rule — forever, reading each re-derivation as a fresh idea.
  // A promotion leaves a trace by construction; a rejection changes nothing, which is why it has to
  // be written down deliberately.
  const events = store.readEvents(L);
  const repairs = foldRepairs(events);
  const prohibitions = foldProhibitions(events);

  // THE BASIS TRAVELS WITH THE PROPOSAL. A rejection is only laundered when the retry rests on
  // evidence no stronger than what already failed, so the strength has to be a recorded fact rather
  // than something reconstructed later. Independent misses are counted over DISTINCT tasks: the same
  // complaint about the same input twice is one observation said twice.
  const missesForRule = store.listFeedback(L)
    .map((f) => store.getInvocation(L, f.invocationId))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const evidence: EvidenceBasis = {
    missContexts: new Set([inv.inputHash, ...missesForRule.map((r) => r.inputHash)]).size,
    invocationIds: [...new Set([inv.invocationId, ...missesForRule.map((r) => r.invocationId)])] };

  const may = mayPropose(repairs, prohibitions, op.requirementId, op.from, op.to,
    { evidence, evaluation: WEAKEST_EVALUATION });
  if (!may.allowed) {
    console.log(`\nNo repair proposed — ${may.reason}`);
    console.log(`\n${describeHistory(repairs, prohibitions, op.requirementId)}`);
    return;
  }
  if (may.note) console.log(`\n${may.note}`);

  const nextArch = applyEscalation(ranArch, op, sha(JSON.stringify(op) + ranArch.architectureHash));
  const desc = flag('--description') ?? `Writes in the author's own standard (${ranStandard.workType})`;
  const pkg = renderAgentSkill(ranStandard, nextArch, name, desc);
  assertPortable(pkg);
  const candidate = { skillVersionHash: sha(`${nextArch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: ranStandard.standardVersionHash, architectureHash: nextArch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString() };
  store.putArchitecture(L, nextArch); store.putPackage(L, pkg); store.putSkillVersion(L, candidate);
  store.appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: sha(`${op.requirementId}|${op.from}|${op.to}|${candidate.skillVersionHash}`),
    skillName: name, requirementId: op.requirementId, from: op.from, to: op.to,
    sourceSkillVersionHash: inv.skillVersionHash, candidateSkillVersionHash: candidate.skillVersionHash,
    evidenceBasis: evidence, at: candidate.builtAt });

  console.log(`\nproposed   ${op.kind} ${op.requirementId}: ${op.from} -> ${op.to}`);
  console.log(`  ${op.rationale}`);
  console.log(`\ncandidate  SkillVersion ${candidate.skillVersionHash}  (NOT active)`);
  console.log(`  StandardVersion ${candidate.standardVersionHash}  — UNCHANGED, this is the whole point`);
  console.log(`  architecture    ${ranArch.architectureHash} -> ${nextArch.architectureHash}`);
  console.log(`  package         ${inv.servedPackageHash} -> ${pkg.packageHash}`);
  console.log(`\nRun it on the same task and compare, then promote or reject the exact one you saw:`);
  console.log(`  atelier invoke --skill ${name} --candidate ${candidate.skillVersionHash} --task ${JSON.stringify(inv.input)}`);
  console.log(`  atelier promote --skill ${name} --candidate ${candidate.skillVersionHash}`);
}

// ── behaviour study ──────────────────────────────────────────────────────────────────────────
/**
 * The blind comparison. Enforcement lives here, not in the assistant's judgement.
 *
 * Two arms from the SAME source material: the exemplars themselves, and the standard distilled from
 * them. Order is randomised per run and the key is written to disk but never printed until a preference
 * is on record — a choice made with the key visible measures the key.
 */
/** One generation. Kept separate so the study path has no bespoke inference of its own. */
export async function spendOne(client: InferenceClient, budget: Budget, stable: string, brief: string): Promise<string> {
  return (await spendOneWithResult(client, budget, stable, brief)).piece;
}

/** The default shape, used when the package carries no output contract. */
const FREE_TEXT_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false
};

/**
 * ONE generation, and the place the OUTPUT_CONTRACT carrier stopped being dark.
 *
 * This used to call the provider with a hardcoded `{piece: string}` no matter what the package
 * contained. A ratified OUTPUT_CONTRACT compiled to `contracts/output.schema.json`, was installed,
 * hashed, listed in delivery metadata and marked served — and never once constrained a generation. The
 * carrier existed everywhere except where it mattered.
 *
 * The schema now comes from the stored contract when there is one, and the schema OBJECT THAT WAS SENT
 * is returned so the caller can hash it against the contract. That comparison is the delivery evidence:
 * anything weaker is a claim that a file exists, which was the whole problem.
 *
 * A contract also changes what an output IS. Under free text the result is a string; under a contract
 * it is a typed object, and it is serialized for the record rather than reduced to one field — reading
 * `.piece` off a contract-shaped object would return undefined and record an empty output as a success.
 */
export async function spendOneWithResult(
  client: InferenceClient, budget: Budget, stable: string, brief: string,
  contract: { readonly schema: Record<string, unknown>; readonly artifact: string } | null = null,
): Promise<{ piece: string; reportedModel: string | null; schemaSent: Record<string, unknown>; servedTask: string }> {
  const schema = contract?.schema ?? FREE_TEXT_SCHEMA;
  // CAPTURED FROM THE REQUEST OBJECT, not copied from the argument. A proof built from the same
  // variable the caller passed in would agree with itself no matter what was actually transmitted.
  let servedTask = '';
  const r = await spend(budget, 0.2, async () => {
    const req = {
      stableBlock: stable, variableBlock: brief,
      userMessage: contract ? 'Produce it now, in the required shape.' : 'Write it now. Output only the piece itself.',
      toolName: contract ? 'emit_output' : 'emit_piece',
      toolDescription: contract ? 'Emit the output in the shape the standard requires.' : 'Emit the finished piece.',
      schema, maxTokens: 4000 };
    servedTask = req.variableBlock;
    const res = await client.complete(req);
    return { value: res, cost: res.cost };
  });
  const piece = contract
    ? JSON.stringify(r.json ?? null, null, 2)
    : asText((r.json as { piece?: unknown } | null)?.piece);
  return { piece, reportedModel: r.modelId || null, schemaSent: schema, servedTask };
}



/**
 * ONE instrumented generation. The single place a real execution becomes a record.
 *
 * `fidelity` runs this N times per context rather than re-deriving a serving path of its own. A
 * second execution path is how a measurement ends up describing an artefact the product never
 * installs — the trap `study test` already fell into by re-rendering rules out of the standard.
 */
export async function runOnce(
  L: store.StoreLayout, sv: { skillVersionHash: string; standardVersionHash: string; architectureHash: string },
  servedText: string, servedHash: string, delivery: { expectedPackageHash: string; servedPackageHash: string; matched: boolean; servedFiles: string[] },
  task: string, client: InferenceClient, budget: Budget, binding: RuntimeBinding,
  provenance: Provenance = 'ORGANIC_USE',
  /** the package's output contract, verbatim, when it carries one */
  contractText: string | null = null,
  /** where the task came from, so a wrong task is traceable to the surface that produced it */
  taskSource: TaskSource = 'POSITIONAL',
): Promise<InvocationRecord> {
  // PARSED HERE, AND A BROKEN CONTRACT STOPS THE RUN. Falling back to free text on a malformed schema
  // would produce an output nobody constrained, recorded as a normal invocation.
  let contract: { schema: Record<string, unknown>; artifact: string } | null = null;
  if (contractText !== null) {
    try {
      contract = { schema: JSON.parse(contractText) as Record<string, unknown>, artifact: 'contracts/output.schema.json' };
    } catch (e) {
      die(`the stored package's output contract is not valid JSON (${(e as Error).message}). Nothing was invoked: `
        + 'generating without it would produce an output the ratified shape never constrained.');
    }
  }
  const { piece: output, reportedModel, schemaSent, servedTask } = await spendOneWithResult(client, budget, servedText, task, contract);
  const at = new Date().toISOString();
  // THE PROOF. Not "the file is in the package" — the schema the provider received, hashed, against the
  // contract that was compiled. Equal means the carrier reached the model; anything else is a serving
  // failure and `checkDelivery` routes it as one.
  const contractEvidence = contractText === null ? null : {
    artifact: 'contracts/output.schema.json',
    contractHash: sha(JSON.stringify(JSON.parse(contractText) as unknown)),
    schemaHash: sha(JSON.stringify(schemaSent)),
    enforced: sha(JSON.stringify(JSON.parse(contractText) as unknown)) === sha(JSON.stringify(schemaSent))
  };
  const rec = {
    invocationId: `i${sha(`${sv.skillVersionHash}|${task}|${at}|${Math.round(budget.spentUsd * 1e6)}`).slice(0, 10)}`,
    skillName: L.skillName, standardVersionHash: sv.standardVersionHash, skillVersionHash: sv.skillVersionHash,
    architectureHash: sv.architectureHash, servedPackageHash: servedHash,
    // The binding is recorded from what was CONFIGURED and the observation from what ANSWERED. Two
    // fields because they can disagree, and the disagreement is the signal.
    runtimeBinding: binding, observedRuntime: observeRuntime(binding, reportedModel, at),
    invocationSurface: 'ATELIER_CLI' as const, provenance, inputHash: sha(task),
    // THE FOURTH BINDING. Built from the resolved task and from what the request actually carried,
    // then asserted equal before anything is written down.
    request: { resolvedTaskHash: sha(task), servedTaskHash: sha(servedTask), source: taskSource },
    outputHash: sha(output),
    at, delivery: { ...delivery, outputContract: contractEvidence }, input: task, output };
  assertRequestBound(rec.request, task);
  store.putInvocation(L, rec);
  // FIRST RUN ESTABLISHES THE BINDING. Every later run of this SkillVersion is compared against it,
  // which is what stops evidence earned on one runtime from being read as evidence about another.
  store.recordBinding(L, sv.skillVersionHash, binding);

  // ── EVERY REAL INVOCATION FEEDS THE EVIDENCE STATE ─────────────────────────────────────────
  //
  // Not a research command: the ordinary path. What is recorded here is DETERMINISTIC — whether the
  // package that produced this output is the one that was compiled — and it is recorded per
  // requirement because that is the grain everything downstream reasons at.
  //
  // Deliberately NOT a semantic verdict. No instrument in this system has earned the right to say
  // whether a requirement was met, so an invocation contributes the fact it can establish without
  // one, and the absence of a fidelity verdict is visible rather than papered over.
  {
    const std = store.getStandard(L, sv.standardVersionHash);
    const at = rec.at;
    for (const r of std?.requirements ?? []) {
      // APPLICABILITY GATES EVIDENCE. Before this, every requirement entered every context — which
      // is how the v3 campaign judged 33 of 33 as applicable and then produced verdicts on cases
      // where the rule barely arises. An UNRESOLVED pair is recorded as such and contributes
      // nothing, because a case nobody established as applicable cannot say whether the rule held.
      const app = resolveFromFrozenText(r, rec.inputHash);
      if (!admitsEvidence(app)) {
        store.appendEvent(L, { kind: 'APPLICABILITY_UNRESOLVED', requirementId: r.requirementId,
          contextId: rec.inputHash, invocationId: rec.invocationId, why: app.why, at });
        continue;
      }
      store.putObservation(L, {
        requirementId: r.requirementId, domain: 'DELIVERY', contextId: rec.inputHash, invocationId: rec.invocationId,
        generationIndex: store.listInvocations(L).filter((x) => x.inputHash === rec.inputHash).length - 1,
        verdict: delivery.matched ? 'DELIVERED' : 'NOT_DELIVERED',
        producer: 'delivery-check', producerVersion: '1', authority: 'DETERMINISTIC',
        evidence: { expected: delivery.expectedPackageHash, served: delivery.servedPackageHash }, at });
    }
  }
  return rec;
}

export async function create(path: string): Promise<void> {
  // BEFORE INTAKE, WHICH SEALS. A missing key discovered after the seal leaves the user with a run
  // they did not know they had and a refusal on the retry.
  assertReachable('discovery');
  intake(path, flag('--work-type') ?? 'writing');
  if (argv.includes('--dry-run')) return;   // intake already returned without sealing
  console.log('\nReading your work…');
  await discover();
  ratifyClose();
  // Default the name from the folder, so the minimum a person types is a path.
  build(flag('--name') ?? basename(resolve(path)));
}
