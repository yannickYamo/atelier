// cli/commands/improve.ts — Changing the implementation while the standard stays frozen.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { resolve, basename } from 'node:path';
import type { Budget } from '../../core/inference/client.js';
import type { Requirement } from '../../core/state/canonical-state.js';
import { bindingHash } from '../../core/runtime/binding.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import { proposeEscalation, applyEscalation, type ServedMissEvidence } from '../../core/architecture/escalate.js';
import { foldRepairs, foldProhibitions, mayPropose, describeHistory, WEAKEST_EVALUATION,
  type EvidenceBasis } from '../../core/architecture/repair-memory.js';
import { runSpine, explainSpine } from '../../core/convergence/controller.js';
import { proposeFloor } from '../../core/distinctiveness/contract.js';
import { NOTHING_EARNED } from '../../core/convergence/state-machine.js';
import { floorStateFor, runtimeIdentity } from './floor.js';
import { nextLevel } from '../../core/architecture/escalate.js';
import { diagnose } from '../../core/diagnosis/diagnose.js';
import { decide } from '../../core/ratification/authority.js';
import { draftHash, appendDecision, type RatificationLedger } from '../../core/ratification/decision-record.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import * as store from '../../core/state/store.js';

import { intake } from './intake.js';
import { discover } from './discover.js';
import { ratifyClose } from './ratify.js';
import { build } from './build.js';
import { sha, DATA, die, argv, flag, clientFor, numericFlag, assertReachable, skillArg, sourceProvenance, loadSession, saveSession, diagnoserModel, carriedFrom, carryReceipt, cmd } from '../runtime.js';

// ── improve ──────────────────────────────────────────────────────────────────────────────────
/**
 * Improve mints a NEW StandardVersion. It never edits the old one.
 *
 * A record of what someone approved that changes without their approval is not a record. So the old
 * version stays readable forever, the new one carries `supersedes` and a reason in their words, and
 * rollback remains possible because nothing was overwritten.
 */
export async function improve(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash) ?? die(`skill version ${activeHash} is missing.`);
  const prev = store.getStandard(L, sv.standardVersionHash) ?? die('previous standard missing.');
  const invId = flag('--invocation');

  // WHAT THIS COMMAND MEANS, AND WHAT IT DOES NOT.
  //
  // Improve is the IMPLEMENTATION loop: same StandardVersion, better arrangement, new SkillVersion.
  // It used to route straight to `ratify-close --supersedes`, which made "improve my skill" mean
  // "change what you consider good" — inverting the one law the product exists to hold, in the one
  // place a user would read it.
  if (!invId) {
    const arch = store.getArchitecture(L, sv.architectureHash, sv.standardVersionHash) ?? compileArchitecture(prev);
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
    // An observation made on a run marked as a test is a measurement of the skill, never evidence it is changed on.
    const tests = store.testRunIds(L);
    const observations = store.listObservations(L).filter((o) => !o.invocationId || !tests.has(o.invocationId));
    const invocations = store.listLearningInvocations(L);
    const repairs = foldRepairs(events);
    const prohibitions = foldProhibitions(events);

    const distinctiveness = floorStateFor(L, activeHash, runtimeIdentity());
    console.log(`\nWhat the evidence says:\n`);
    const spines = [];
    for (const r of prev.requirements) {
      const carrying = arch.components.find((c) => c.carries.includes(r.requirementId));
      const cur = carrying?.carrier;
      const spine = runSpine({ requirementId: r.requirementId, invocations, observations, repairs,
        prohibitions, currentCarrier: cur, nextCarrier: cur ? nextLevel(cur) : null,
        // The regression floor's real state (atelier floor), not the default of "nothing earned".
        gates: { ...NOTHING_EARNED, distinctiveness: distinctiveness.state } });
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
      console.log(`\nNone of them is protected yet (${distinctiveness.why}). How much of each you would accept losing is`);
      console.log(`yours to decide. For the measured ones, margins can be proposed from your own pieces and set by you:`);
      console.log(`  atelier floor --skill ${name}\n`);
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

  // The standard THAT RAN, not the current one. A complaint is about the version that produced it.
  const ranStandard = store.getStandard(L, inv.standardVersionHash) ?? die(`standard ${inv.standardVersionHash} missing.`);
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 0.5), maxCalls: numericFlag('--max-calls', 12) };
  const client = clientFor(diagnoserModel());
  const d = await diagnose(client, budget, ranStandard, inv, fb);

  console.log(`\ndiagnosis  ${d.route}   ($${budget.spentUsd.toFixed(4)})`);
  console.log(`  ${d.reason}`);
  // ONE write, after diagnosis, carrying the attributed rule when there is one — two writes under
  // one content-derived id is a store refusal, and evidence should name its rule anyway.
  const kept = store.putFeedbackOnce(L, d.route === 'IMPLEMENTATION_MISS' ? { ...fb, requirementId: d.requirementId ?? undefined } : fb);
  if (!kept.written) console.log(`  (this complaint about this output was already recorded at ${kept.record.at}; that record stands and is not counted twice)`);

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
  const ranArch = store.getArchitecture(L, inv.architectureHash, inv.standardVersionHash) ?? die(`architecture ${inv.architectureHash} missing — this SkillVersion predates architecture persistence.`);
  const requirementId = d.requirementId ?? die('the diagnosis found an implementation miss but named no rule.');
  const carrying = ranArch.components.find((c) => c.carries.includes(requirementId));
  const ev: ServedMissEvidence = { invocationId: inv.invocationId, requirementId,
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
    .filter((f) => f.requirementId === d.requirementId)   // complaints about OTHER rules are not evidence about this one
    .map((f) => store.getInvocation(L, f.invocationId))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const evidence: EvidenceBasis = {
    missContexts: new Set([inv.inputHash, ...missesForRule.map((r) => r.inputHash)]).size,
    invocationIds: [...new Set([inv.invocationId, ...missesForRule.map((r) => r.invocationId)])] };

  const scope = { standardVersionHash: inv.standardVersionHash,
    providerAdapter: inv.runtimeBinding.providerAdapter, requestedModel: inv.runtimeBinding.requestedModel };
  const may = mayPropose(repairs, prohibitions, op.requirementId, op.from, op.to,
    { evidence, evaluation: WEAKEST_EVALUATION }, scope);
  if (!may.allowed) {
    console.log(`\nNo repair proposed — ${may.reason}`);
    console.log(`\n${describeHistory(repairs, prohibitions, op.requirementId)}`);
    return;
  }
  if (may.note) console.log(`\n${may.note}`);

  const nextArch = applyEscalation(ranArch, op, sha(JSON.stringify(op) + ranArch.architectureHash));
  // INHERITED from the version being repaired. A repair changes the arrangement, never how the
  // skill describes itself, and reconstructing the default here reverted a description set on build.
  const desc = flag('--description') ?? store.getSkillVersion(L, inv.skillVersionHash)?.description ?? defaultDescription(ranStandard.workType);
  const carried = carriedFrom(L, inv.skillVersionHash, ranStandard);
  const pkg = renderAgentSkill(ranStandard, nextArch, name, desc, carried.exemplar, carried.contrast, carried.voice, carried.method);
  assertPortable(pkg);
  const candidate = { skillVersionHash: sha(`${nextArch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: ranStandard.standardVersionHash, architectureHash: nextArch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: desc };
  store.putArchitecture(L, nextArch); store.putPackage(L, pkg); store.putSkillVersion(L, candidate);
  carryReceipt(L, inv.skillVersionHash, candidate, cmd);
  store.appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: sha(`${op.requirementId}|${op.from}|${op.to}|${candidate.skillVersionHash}`),
    skillName: name, requirementId: op.requirementId, from: op.from, to: op.to,
    ...scope, bindingHash: bindingHash(inv.runtimeBinding),
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
  console.log(`  atelier promote --skill ${name} --candidate ${candidate.skillVersionHash} --why "<what made you pick it>"`);
}

export async function create(path: string): Promise<void> {
  // BEFORE INTAKE, WHICH SEALS. A missing key discovered after the seal leaves the user with a run
  // they did not know they had and a refusal on the retry.
  // The staged commands print next-step hints for a person running them by hand; under create the
  // next step runs itself, and a hint that is already stale when it prints teaches distrust.
  process.env.ATELIER_ORCHESTRATED = '1';
  assertReachable('discovery');
  intake(path, flag('--work-type') ?? 'writing');
  if (argv.includes('--dry-run')) return;   // intake already returned without sealing
  console.log('\nReading your work…');
  await discover();
  if (sourceProvenance() === 'PUBLIC_BEHAVIOUR_INFERRED') adoptAllFromPublicSource();
  ratifyClose();
  // Default the name from the folder, so the minimum a person types is a path.
  await build(flag('--name') ?? basename(resolve(path)));
}

/**
 * SOMEONE ELSE'S PUBLIC WORK HAS NO EXPERT TO ASK, SO THE QUESTIONNAIRE IS SKIPPED, NOT DEFERRED.
 *
 * The ratification page asks "is this yours, and how much does it matter?" That question has an
 * owner when the corpus is the user's own work. When the corpus is a third party's public writing
 * nobody in the room can answer it: the user cannot ratify a stranger's voice, and the machine may
 * not. A user who ran `create --public-source` and was then handed a form full of abstractions
 * asked, reasonably, why the test was not "build it and let me judge the output". It is.
 *
 * Every proposal is adopted through `decide`, which caps it at USER_ADOPTED / PREFERRED: the compiler
 * SHOWS these to the model and enforces none of them, which is the ceiling the source can carry (a
 * recurrence in a stranger's work is not a rule they hold; see `roleFor`). Judgement moves to where
 * it belongs, on generated output, through `fix`. A user who wants one of these to bind says so
 * there, and `fix --add required` is the recorded act that makes it so.
 */
export function adoptAllFromPublicSource(): void {
  const s = loadSession();
  if (!s.proposals.length || s.decided.length) return;
  const decidedAt = new Date().toISOString();
  let ledger: RatificationLedger = { standardDraftHash: draftHash(s.proposals), records: [] };
  const decided: Requirement[] = [];
  for (const p of s.proposals) {
    const outcome = decide(p, { verb: 'APPROVE', materiality: 'PREFERRED' });
    decided.push(outcome.requirement);
    ledger = appendDecision(ledger, p, outcome.ledgerDecision, { decidedAt });
  }
  saveSession({ ...s, decided, ledger });
  console.log(`\nAdopted all ${decided.length} as observed technique from ${flag('--source-author') ?? loadSession().publicSource ?? 'a public source'}: `
    + 'shown to the model, enforced by none of them. That is the ceiling a stranger\'s work can carry.'
    + '\nJudge the output, then say what is wrong:  atelier fix "<what was wrong>"');
}
