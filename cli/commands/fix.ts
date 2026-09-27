// cli/commands/fix.ts — ONE CORRECTION PATH. "That was wrong" goes in; what comes out is either a
// better implementation of the same standard, or one question only its owner may answer.
//
// The pieces all existed and none of them met: `feedback` wrote an event nothing read, `improve`
// demanded an invocation id nobody had, a STANDARD_GAP printed a sentence and stopped, `compare`
// was suggested only inside a refusal, and a promoted candidate was not installed. `fix` is those
// pieces in one motion:
//
//   /atelier:fix "the answer buried the recommendation"
//     → resolves this project's latest recorded invocation, and SAYS which — misbinding must be
//       visible, not silent
//     → diagnose (existing): DELIVERY | IMPLEMENTATION_MISS | STANDARD_GAP | UNCERTAIN
//     → miss: one lateral candidate (replace-carrier.ts, runtime-scoped memory), the same task
//       re-run on it automatically under the ordinary cap, a blinded A/B, one keystroke; the
//       winner is active AND installed
//     → gap: the proposed rule and one authority question — Required / Preferred / Don't add —
//       and an approval mints, compiles and installs the superseding StandardVersion in the same
//       motion. That approval is the one intentional friction: semantic authority is the moat.
//
// The hard invariant of the implementation branch is Constraint B: the StandardVersion hash before
// equals the hash after, asserted where the candidate is minted and again before promotion —
// `assertStandardUnchanged` throws; it does not log.

import { verifyText } from '../../core/observers/verify.js';
import { regressions } from '../../core/loop/repair.js';
import { resolvePromotion, type PromotionDecision } from '../../core/convergence/promotion.js';
import { describeBackup } from '../../adapters/install-tree.js';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import * as store from '../../core/state/store.js';
import { readJson } from '../../core/state/read-json.js';
import { applyEscalation, type ServedMissEvidence } from '../../core/architecture/escalate.js';
import { proposeReplacement, assertStandardUnchanged, eligibleCarriers } from '../../core/architecture/replace-carrier.js';
import { foldRepairs, foldProhibitions, mayPropose, repairKey, WEAKEST_EVALUATION,
  type EvidenceBasis, type RepairScope } from '../../core/architecture/repair-memory.js';
import type { Carrier } from '../../core/architecture/compile.js';
import { diagnose } from '../../core/diagnosis/diagnose.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import type { StandardVersion, InvocationRecord } from '../../core/state/canonical-state.js';
import type { InstallablePackage } from '../../adapters/host-adapter.js';
import { bindingHash } from '../../core/runtime/binding.js';
import { spend, type Budget } from '../../core/inference/client.js';
import { runOnce } from './improve.js';
import { addRuleToActive } from './addition.js';
import { resolveServedVersion } from './invoke.js';
import { checkCandidate, floorStateFor, promoteChecked, runtimeIdentity, type CandidateCheck } from './floor.js';
import { keysOf } from '../../core/state/rule-key.js';
import { REFLECT_SYSTEM, REFLECT_SCHEMA, reflectPrompt, parseReflection, type Failure } from '../../core/optimizer/reflect.js';
import type { Mutation } from '../../core/optimizer/genome.js';
import { sha, DATA, die, argv, flag, positional, numericFlag, clientFor, clientAndBinding,
  projectDir, pickHost, runFile, assertSkillName, loadSession, diagnoserModel, carriedFrom } from '../runtime.js';

const ask = async (question: string, allowed: readonly string[]): Promise<string | null> => {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question(question)).trim().toLowerCase();
      if (allowed.includes(answer)) return answer;
      console.log(`  (${allowed.join(' / ')})`);
    }
  } finally { rl.close(); }
};

export async function fix(): Promise<void> {
  // ── WHICH RUN IS THIS ABOUT? RESOLVED, AND SAID OUT LOUD ─────────────────────────────────────
  //
  // Nobody copies an id: the host hook and `invoke` both leave last-invocation.json behind. The
  // resolution is printed FIRST so a wrong guess is visible before anything is diagnosed against it.
  // `--skill`/`--invocation` remain as the advanced spelling.
  loadSession();                                   // adopts legacy run files; keys runFile() to this project
  const explicitInv = flag('--invocation');
  let name: string; let invId: string;
  if (explicitInv) {
    name = assertSkillName(flag('--skill') ?? die('--invocation needs --skill <name> beside it.'));
    invId = explicitInv;
  } else {
    const lastPath = runFile('last-invocation.json');
    if (!existsSync(lastPath)) {
      die('nothing to fix yet — no recorded use of a skill in this project.\n'
        + '  Use the skill first (in your host as /<name>, or: atelier invoke --skill <name> "<task>"),\n'
        + '  then say what was wrong:  atelier fix "<what was wrong>"');
    }
    const last = readJson<{ invocationId: string; skillName: string }>(lastPath, { what: 'the last invocation', requireKeys: ['invocationId', 'skillName'] });
    name = assertSkillName(last.skillName); invId = last.invocationId;
  }
  const complaint = flag('--complaint') ?? positional([]) ?? die('say what was wrong:  atelier fix "<what was wrong>"');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  let inv = store.getInvocation(L, invId) ?? die(`no invocation ${invId} for ${name}.`);
  console.log(`About your last run of /${name}: "${inv.input.slice(0, 70)}${inv.input.length > 70 ? '…' : ''}"`);
  console.log(`You said: "${complaint}"\n`);

  const fb = { feedbackId: `f${sha(`${invId}|${complaint}`).slice(0, 10)}`, invocationId: invId, complaint, at: new Date().toISOString() };

  let ranStandard = store.getStandard(L, inv.standardVersionHash) ?? die(`standard ${inv.standardVersionHash} missing.`);
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.0), maxCalls: numericFlag('--max-calls', 12) };
  const d = await diagnose(clientFor(diagnoserModel()), budget, ranStandard, inv, fb);
  console.log(`diagnosis  ${d.route}   ($${budget.spentUsd.toFixed(4)})`);
  console.log(`  ${d.reason}\n`);
  // Written ONCE, after diagnosis, so the record can name the rule the miss was attributed to.
  // The id is content-derived: re-entering the same complaint keeps the first record, and says so.
  const kept = store.putFeedbackOnce(L, d.route === 'IMPLEMENTATION_MISS' ? { ...fb, requirementId: d.requirementId ?? undefined } : fb);
  if (!kept.written) console.log(`  (this complaint about this output was already recorded at ${kept.record.at}; that record stands and is not counted twice)`);

  // ── DELIVERY: the standard is not involved; put the approved bytes back ─────────────────────
  if (d.route === 'DELIVERY_FAILURE') {
    const active = store.getActive(L) ?? die(`no active version for ${name}.`);
    const sv = store.getSkillVersion(L, active) ?? die(`SkillVersion ${active} missing.`);
    const pkg = store.getPackage(L, sv.materializedHash) ?? die(`package ${sv.materializedHash} missing — rebuild: atelier build --name ${name}`);
    const inst = pickHost().install(pkg, projectDir());
    { const moved = describeBackup(inst); if (moved) console.log(moved); }
    if (!inst.ok) return void die(`reinstall failed: ${inst.reason}`);
    console.log('This was a SERVING problem — the installed file was not what you approved. The approved');
    console.log(`bytes are back in place (${inst.installedAt}). Your standard was never involved.`);
    return;
  }

  if (d.route === 'UNCERTAIN') {
    console.log('I am not confident enough to change anything, and guessing would repair the wrong thing.');
    console.log(`\n  ${d.question}\n`);
    console.log(`Nothing was changed. Say it again with that answered:  atelier fix "<sharper complaint>"`);
    return;
  }

  // ── STANDARD GAP: propose, ask ONCE, and an approval does the rest itself ───────────────────
  if (d.route === 'STANDARD_GAP') {
    const proposal = d.proposedRequirement ?? die('diagnosis reported a gap and proposed nothing — nothing to rule on.');
    const declined = store.readEvents(L).some((e) => e.kind === 'PROPOSED_CHANGE' && e.proposal === proposal && e.accepted === false);
    const answer = flag('--add')?.toLowerCase()
      ?? (argv.includes('--skip') ? 'skip'
        : declined ? null
          : await ask(`Your standard does not say this. Proposed:\n\n  "${proposal}"\n\nAdd as required / preferred, or don't add?  (required / preferred / skip)  `,
            ['required', 'preferred', 'skip']));
    if (declined && !answer) {
      console.log(`You declined exactly this addition before, so it is not re-asked on the same complaint.`);
      console.log(`  To add it after all:  atelier fix "${complaint}" --add required|preferred`);
      return;
    }
    if (answer === null) {
      console.log(`Your standard does not say this. Proposed:\n\n  "${proposal}"\n`);
      console.log(`Rule on it (one flag, everything else is automatic):`);
      console.log(`  atelier fix ${JSON.stringify(complaint)} --add required     it binds`);
      console.log(`  atelier fix ${JSON.stringify(complaint)} --add preferred    shown; other valid forms stay acceptable`);
      console.log(`  atelier fix ${JSON.stringify(complaint)} --skip             not my rule`);
      store.appendEvent(L, { kind: 'PROPOSED_CHANGE', at: fb.at, skillVersionHash: inv.skillVersionHash, proposal, accepted: null });
      return;
    }
    if (answer === 'skip') {
      store.appendEvent(L, { kind: 'PROPOSED_CHANGE', at: fb.at, skillVersionHash: inv.skillVersionHash, proposal, accepted: false });
      console.log(`Not added. Recorded, so the same complaint does not re-ask; your standard is untouched.`);
      return;
    }
    if (answer !== 'required' && answer !== 'preferred') die(`--add takes required|preferred; got "${answer}".`);

    // AN ADDITION LANDS ON THE ACTIVE STANDARD, NOT ON THE ONE THE COMPLAINT RAN AGAINST (see addition.ts).
    const activeNow = store.getActive(L) ? store.getSkillVersion(L, store.getActive(L)!) : null;
    if (activeNow && activeNow.standardVersionHash !== ranStandard.standardVersionHash) {
      console.log(`Your standard has moved since that run (${ranStandard.standardVersionHash} -> ${activeNow.standardVersionHash}); the addition goes on the current one.`);
    }
    const added = addRuleToActive(L, name, proposal, answer === 'required' ? 'REQUIRED' : 'PREFERRED', complaint, ranStandard, [fb.feedbackId]);
    console.log(`Added as ${answer.toUpperCase()} — ${added.requirement.requirementId} ${answer === 'required' ? 'instructs' : 'is shown'}.`);
    console.log(`StandardVersion ${added.standard.standardVersionHash} supersedes ${added.supersedes}  (reason: your complaint, on file)`);
    console.log(`Rebuilt and installed: ${pickHost().invocationHint(name).trim()} now serves it.`);
    return;
  }

  // ── IMPLEMENTATION MISS: one lateral candidate, the same task re-run, one keystroke ─────────
  //
  // ── A REPAIR FOLLOWS A MOVED STANDARD; IT DOES NOT DIE ON IT ────────────────────────────────
  //
  // The complaint is about a run on standard S1. If the owner has since added rules (S2 is active),
  // a candidate built on S1 is correctly refused at promotion: installing it would drop S2's rules.
  // That refusal used to be the end of the road, and the only recovery was an invoke by hand. Found
  // live: two additions, then a repair, then "REPAIR INVARIANT ... Nothing was promoted." Now the
  // same task is re-run on the ACTIVE version first, and the repair is made against that run. The
  // invariant is untouched; the dead end is gone. If S2 no longer carries the rule the diagnosis
  // named, there is nothing to repair and it says so.
  {
    const activeHash = store.getActive(L);
    const activeSv = activeHash ? store.getSkillVersion(L, activeHash) : null;
    if (activeSv && activeSv.standardVersionHash !== inv.standardVersionHash) {
      const current = store.getStandard(L, activeSv.standardVersionHash) ?? die(`standard ${activeSv.standardVersionHash} missing.`);
      if (!current.requirements.some((r) => r.requirementId === d.requirementId)) {
        die(`Your standard has moved since that run (${inv.standardVersionHash} -> ${current.standardVersionHash}) and no longer carries ${d.requirementId}, the rule this complaint was attributed to. Nothing to repair.`);
      }
      console.log(`Your standard has moved since that run (${inv.standardVersionHash} -> ${current.standardVersionHash}). Re-running the same task on the current version first, so the repair is about what you actually have.\n`);
      const { client: c0, binding: b0 } = clientAndBinding('target');
      const budget0: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.0), maxCalls: numericFlag('--max-calls', 12) };
      const cur = resolveServedVersion(L, activeSv.skillVersionHash, '');
      inv = await runOnce(L, activeSv, cur.servedText, cur.servedHash, cur.delivery,
        inv.input, c0, budget0, b0, 'ORGANIC_USE', cur.contractFile, 'HOST_PROMPT');
      ranStandard = current;
    }
  }
  const ranArch = store.getArchitecture(L, inv.architectureHash, inv.standardVersionHash)
    ?? die(`architecture ${inv.architectureHash} missing — this SkillVersion predates architecture persistence.`);
  const requirement = ranStandard.requirements.find((r) => r.requirementId === d.requirementId)
    ?? die(`diagnosis named ${d.requirementId}, which is not in the standard that ran.`);
  const carrying = ranArch.components.find((c) => c.carries.includes(d.requirementId!));
  const ev: ServedMissEvidence = { invocationId: inv.invocationId, requirementId: d.requirementId!,
    carrierAtServe: carrying?.carrier ?? 'PROSE', expertConfirmed: true, at: new Date().toISOString() };

  const events = store.readEvents(L);
  const repairs = foldRepairs(events);
  const prohibitions = foldProhibitions(events);
  const scope: RepairScope = { standardVersionHash: inv.standardVersionHash,
    providerAdapter: inv.runtimeBinding.providerAdapter, requestedModel: inv.runtimeBinding.requestedModel };
  // The runtime-scoped exclusion set: carriers already REJECTED as a destination for this rule,
  // from this carrier, under this (standard, model) pairing — a loss elsewhere excludes nothing.
  const rejectedHere = new Set<Carrier>(repairs
    .filter((r) => r.outcome === 'REJECTED' && r.requirementId === ev.requirementId && r.from === ev.carrierAtServe
      // Not a judgement of this complaint: an untested candidate, or an optimizer's cheap screen.
      && (r.evaluationBasis?.generations ?? 1) > 0
      && !((r as { origin?: string }).origin === 'OPTIMIZE' && r.evaluationBasis?.instrument === 'UNQUALIFIED_COMPARATOR')
      && (r.standardVersionHash ?? scope.standardVersionHash) === scope.standardVersionHash
      && (r.providerAdapter ?? scope.providerAdapter) === scope.providerAdapter
      && (r.requestedModel ?? scope.requestedModel) === scope.requestedModel)
    .map((r) => r.to));
  // ── A PENDING CANDIDATE IS RESUMED, NOT RE-PROPOSED ────────────────────────────────────────
  //
  // The non-TTY flow is two-phase: the first run builds the candidate and prints the blinded pair;
  // the second arrives with --pick. Re-entering the proposal path would refuse on its own pending
  // candidate — so a pending repair for this rule, in this scope, short-circuits to the decision.
  const pendingRepair = repairs.find((r) => r.outcome === 'PENDING' && r.requirementId === ev.requirementId
    && (r.standardVersionHash ?? scope.standardVersionHash) === scope.standardVersionHash
    && (r.providerAdapter ?? scope.providerAdapter) === scope.providerAdapter
    && (r.requestedModel ?? scope.requestedModel) === scope.requestedModel);
  if (pendingRepair) {
    const cand = store.getSkillVersion(L, pendingRepair.candidateSkillVersionHash)
      ?? die(`pending candidate ${pendingRepair.candidateSkillVersionHash} missing from the store.`);
    const candInv = store.listInvocations(L).find((r) => r.skillVersionHash === cand.skillVersionHash);
    // A candidate `atelier optimize` built and left for a person has no run of this task to show beside
    // yours: it was measured on the floor's tasks. It is decided where it was made.
    if (!candInv) {
      console.log(`A candidate for ${pendingRepair.requirementId} (${pendingRepair.from} → ${pendingRepair.to}) is already waiting for your decision, `
        + `built by ${(pendingRepair as { origin?: string }).origin === 'OPTIMIZE' ? 'atelier optimize' : 'an earlier run'}. Decide it first:`);
      console.log(`  atelier promote --skill ${name} --candidate ${cand.skillVersionHash} --why "<reason>"`);
      console.log(`  atelier reject  --skill ${name} --candidate ${cand.skillVersionHash} --why "<reason>"`);
      return;
    }
    const candPkg = store.getPackage(L, cand.materializedHash) ?? die(`package ${cand.materializedHash} missing.`);
    await settleBlindPick(L, name, inv, cand, candInv, candPkg,
      { requirementId: pendingRepair.requirementId, from: pendingRepair.from, to: pendingRepair.to },
      pendingRepair.repairId, complaint);
    return;
  }
  const fixed = proposeReplacement(ev, ranArch, requirement, rejectedHere);
  if ('refused' in fixed) { console.log(`No repair proposed: ${fixed.reason}`); return; }
  // ── REFLECTION, AS AN EXPERIMENT (--reflect) ─────────────────────────────────────────────────
  // The fixed ordering picked `fixed.to`. With --reflect, a model reads your complaint and the output
  // it was about, and chooses among the same legal alternatives (core/optimizer/reflect.ts). The event
  // records which proposer chose, so `atelier optimize --report` can say which is kept more often.
  let op = fixed; let proposer: 'REFLECTIVE' | 'FIXED_ORDER' = 'FIXED_ORDER';
  if (argv.includes('--reflect')) {
    const legal: Mutation[] = eligibleCarriers(requirement).filter((c) => c !== fixed.from && !rejectedHere.has(c))
      .map((to) => ({ kind: 'CARRIER', requirementId: fixed.requirementId, from: fixed.from, to }));
    const reflection = await reflectOnce(ranStandard, legal, [{ requirementId: fixed.requirementId, text: inv.output, why: complaint }], repairs);
    const choice = reflection.proposals[0]?.mutation;
    if (choice?.kind === 'CARRIER') {
      op = { ...fixed, to: choice.to, rationale: `chosen by reflection: ${reflection.proposals[0].why}` };
      proposer = 'REFLECTIVE';
      console.log(`Reflection chose ${choice.from} → ${choice.to}: ${reflection.proposals[0].why}`);
    } else console.log('Reflection proposed nothing legal; the fixed ordering chooses.');
  }

  const misses = store.listFeedback(L)
    .filter((f) => f.requirementId === d.requirementId)
    .map((f) => store.getInvocation(L, f.invocationId))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const evidence: EvidenceBasis = {
    missContexts: new Set([inv.inputHash, ...misses.map((r) => r.inputHash)]).size,
    invocationIds: [...new Set([inv.invocationId, ...misses.map((r) => r.invocationId)])] };
  // A cheap screen in `atelier optimize` measured the floor's tasks, not this complaint: it does not
  // stand in for your judgement of this output, so it is not held against the move here.
  const memory = repairs.filter((r) => !((r as { origin?: string }).origin === 'OPTIMIZE' && r.evaluationBasis?.instrument === 'UNQUALIFIED_COMPARATOR'));
  let may = mayPropose(memory, prohibitions, op.requirementId, op.from, op.to, { evidence, evaluation: WEAKEST_EVALUATION }, scope);
  // Reflection chose a move repair memory refuses: the fixed ordering's choice, which was checked for
  // legality the same way, stands instead.
  if (!may.allowed && proposer === 'REFLECTIVE') {
    console.log(`Reflection's choice is not available (${may.reason.split('.')[0]}); the fixed ordering chooses.`);
    op = fixed; proposer = 'FIXED_ORDER';
    may = mayPropose(memory, prohibitions, op.requirementId, op.from, op.to, { evidence, evaluation: WEAKEST_EVALUATION }, scope);
  }
  if (!may.allowed) { console.log(`No repair proposed — ${may.reason}`); return; }

  const nextArch = applyEscalation(ranArch, op, sha(JSON.stringify(op) + ranArch.architectureHash));
  const desc = flag('--description') ?? store.getSkillVersion(L, inv.skillVersionHash)?.description ?? defaultDescription(ranStandard.workType);
  const carried = carriedFrom(L, inv.skillVersionHash, ranStandard);
  const pkg = renderAgentSkill(ranStandard, nextArch, name, desc, carried.exemplar, carried.contrast);
  assertPortable(pkg);
  const candidate = { skillVersionHash: sha(`${nextArch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: ranStandard.standardVersionHash, architectureHash: nextArch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: desc };
  // ── CONSTRAINT B, AT THE MINT ── a repair that moved the standard dies here, before anything ships.
  assertStandardUnchanged(ranStandard, store.getStandard(L, candidate.standardVersionHash) ?? ranStandard);
  if (candidate.standardVersionHash !== inv.standardVersionHash) {
    die(`REPAIR INVARIANT: candidate is bound to ${candidate.standardVersionHash} but the complaint is about ${inv.standardVersionHash}. Nothing was changed.`);
  }
  store.putArchitecture(L, nextArch); store.putPackage(L, pkg); store.putSkillVersion(L, candidate);
  store.appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: sha(repairKey(op.requirementId, op.from, op.to) + candidate.skillVersionHash),
    skillName: name, requirementId: op.requirementId, from: op.from, to: op.to, proposer,
    ...scope, bindingHash: bindingHash(inv.runtimeBinding),
    ordering: eligibleCarriers(requirement).join('>'),
    sourceSkillVersionHash: inv.skillVersionHash, candidateSkillVersionHash: candidate.skillVersionHash,
    evidenceBasis: evidence, at: candidate.builtAt });

  console.log(`Trying a different implementation of ${op.requirementId}: ${op.from} → ${op.to} (a different mechanism, not a "stronger" one).`);
  console.log('Re-running your task on it…\n');
  const { client, binding } = clientAndBinding('target');
  // Served exactly as `invoke` serves it, examples included: the champion's run saw them, so the
  // candidate's must, or the pair compares two ways of serving rather than two implementations.
  const served = resolveServedVersion(L, candidate.skillVersionHash, '');
  const candRec = await runOnce(L, candidate, served.servedText, served.servedHash, served.delivery,
    inv.input, client, budget, binding, 'ORGANIC_USE', served.contractFile, 'HOST_PROMPT');

  await settleBlindPick(L, name, inv, candidate, candRec, pkg,
    { requirementId: op.requirementId, from: op.from, to: op.to },
    sha(repairKey(op.requirementId, op.from, op.to) + candidate.skillVersionHash), complaint);
}

/** The decision stage: blinded pair, one keystroke, and the winner is active AND installed. */
async function settleBlindPick(
  L: store.StoreLayout, name: string,
  inv: InvocationRecord,
  candidate: { skillVersionHash: string; standardVersionHash: string; materializedHash: string },
  candRec: InvocationRecord,
  pkg: InstallablePackage,
  move: { requirementId: string; from: Carrier; to: Carrier },
  repairId: string, complaint: string,
): Promise<void> {
  // ── THE BLINDED A/B — the only qualified instrument this system has is its owner ────────────
  // Deterministic over the pair's ids, so a resumed decision sees the same order it was shown.
  const championFirst = sha(`${inv.invocationId}|${candRec.invocationId}`) < '8';
  const [aRec, bRec] = championFirst ? [inv, candRec] : [candRec, inv];
  console.log('──── A ────────────────────────────────────────────');
  console.log(aRec.output);
  console.log('──── B ────────────────────────────────────────────');
  console.log(bRec.output);
  console.log('───────────────────────────────────────────────────\n');
  // ── WHEN THE RULE IS COUNTED, THE COUNT DECIDES ─────────────────────────────────────────────
  //
  // The blinded eye exists because nothing else is qualified to say which output better follows a
  // rule about taste. A rule the owner ratified WITH a measurement is different: whether an output
  // meets it is a fact, the owner already decided what the fact must be, and asking them to eyeball
  // it would be asking them to redo their own count. So when the moved rule is measured, the candidate
  // is kept only if it meets that rule where the current version did not and breaks no other measured
  // rule the current version met; it is dropped if it is worse; and only a tie goes to a person.
  // This changes an implementation, never the standard, and the record names the instrument.
  const std = store.getStandard(L, candidate.standardVersionHash);
  const measuredRule = std?.requirements.find((r) => r.requirementId === move.requirementId && r.measurement);
  let counted: 'a' | 'b' | 'same' | null = null;
  let gateRejected: string | null = null; let countFavoursCandidate = false;
  // The gate runs whether or not a pick was given: `--pick` is a person's answer to the blind question,
  // not a way around a count that already says the candidate is worse.
  if (std && measuredRule) {
    // DRAFT AGAINST DRAFT. The current version's recorded output may already have been repaired by the
    // loop, and the candidate's has not: comparing the two would score the loop, not the carrier, and
    // reject every change. The draft the model first wrote is what the candidate is compared with.
    const champText = inv.repair?.draft ?? inv.output;
    const champReport = verifyText(name, std, champText); const candReport = verifyText(name, std, candRec.output);
    const verdictOf = (r: typeof champReport): Map<string, string> => new Map(r.checked.map((c) => [c.requirementId, c.result.verdict]));
    const champ = verdictOf(champReport); const cand = verdictOf(candReport);
    const fixes = champ.get(move.requirementId) === 'VIOLATED' && cand.get(move.requirementId) === 'MET';
    const breaks = regressions(champReport, candReport).length > 0;
    const worse = champ.get(move.requirementId) === 'MET' && cand.get(move.requirementId) === 'VIOLATED';
    const champLetter = championFirst ? 'a' : 'b';
    // THE COUNT IS EVIDENCE; THE GATE DECIDES WHAT IT AUTHORISES.
    //
    // A count that says the candidate is worse is an evidenced negative, and rejects on its own. A count
    // that says it is better is one generation on one input, measured on the rules alone: it cannot
    // speak to anything the rules do not count, so it is not an improvement the gate can act on, and
    // no instrument here has earned the distinctiveness floor. Adopting it still takes a person.
    const gate: PromotionDecision = resolvePromotion({
      incumbentStandardHash: inv.standardVersionHash, candidateStandardHash: candidate.standardVersionHash,
      evaluatedPackageHash: candRec.servedPackageHash, candidatePackageHash: pkg.packageHash,
      deliveryValid: candRec.delivery.matched,
      deterministicRegression: breaks,
      fidelityAuthority: 'OBSERVE',
      comparison: worse ? 'REGRESSED' : 'INCONCLUSIVE',
      distinctiveness: 'MISSING', floor: null,
    });
    store.appendEvent(L, { kind: 'PROMOTION_GATE', candidateSkillVersionHash: candidate.skillVersionHash,
      requirementId: move.requirementId, authority: gate.authority, unmet: gate.unmet, why: gate.why, at: new Date().toISOString() });
    if (gate.authority === 'AUTO_REJECT') {
      gateRejected = gate.why.split('.')[0];
      if (!flag('--pick')) {
        counted = champLetter;
        console.log(`${move.requirementId} is a measured rule, so this was decided by its count, not by eye: `
          + `the new implementation does worse on the measured rules (${gateRejected}).`);
      }
    } else if (fixes && !breaks) {
      countFavoursCandidate = true;
      // Not which letter: naming it before the pick would unblind the only qualified instrument here.
      if (!flag('--pick')) {
        console.log(`${move.requirementId} is a measured rule, and its count favours one of these two; which one is shown after you pick.`);
        console.log(`That is one draft on one input and says nothing about what the rules do not count, so it is not installed on its own (${gate.unmet[0]}).`);
      }
    }
  }
  // ── WITH AN EARNED FLOOR, THE COUNT CAN BE CONFIRMED WITHOUT YOU ─────────────────────────────
  //
  // One draft on one input cannot authorise an install. Several drafts on each of the floor's tasks,
  // compared rule by rule with the current version's frozen scores under a floor whose false-alarm rate
  // was measured on this skill, can: the promotion gate reads that evidence and may install, reject,
  // or still hand the choice to you. Only when the floor is EARNED; otherwise this spends nothing.
  if (countFavoursCandidate && measuredRule && !flag('--pick') && std) {
    const active = store.getActive(L);
    const runtime = runtimeIdentity();
    const st = active ? floorStateFor(L, active, runtime) : null;
    if (active && st?.state === 'EARNED') {
      console.log('Your regression floor is earned, so the count is being confirmed on its tasks before anything is installed…');
      const { client, binding } = clientAndBinding('target');
      const targetKey = keysOf(std.requirements)[std.requirements.indexOf(measuredRule)];
      const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--floor-cap', 3), maxCalls: store.getFloor(L).tasks.length * st.fires };
      // A floor run that cannot finish (a budget, a refusal, a network error) hands the choice back to
      // you rather than ending the command with the pair shown and nothing recorded.
      let check: CandidateCheck | null = null;
      try { check = await checkCandidate(L, name, std, active, candidate.skillVersionHash, targetKey, budget, client, binding.requestedModel, runtime); }
      catch (e) { console.log(`The floor could not finish (${(e as Error).message.split('\n')[0]}); the choice is yours.\n`); }
      if (check) {
        const at = new Date().toISOString();
        console.log(`floor: ${check.composite} · ${move.requirementId}: ${check.comparison} · gate: ${check.decision.authority}`);
        store.appendEvent(L, { kind: 'PROMOTION_GATE', candidateSkillVersionHash: candidate.skillVersionHash, requirementId: move.requirementId,
          authority: check.decision.authority, unmet: check.decision.unmet, why: check.decision.why, floor: check.composite, comparison: check.comparison, at });
        const basis = { generations: st.fires, instrument: 'QUALIFIED_OBSERVER' as const, orderInvariant: null };
        if (check.decision.authority === 'AUTO_PROMOTE') {
          promoteChecked(L, name, candidate.skillVersionHash, check, complaint);
          store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId, outcome: 'PROMOTED', evaluationBasis: basis, at, note: complaint });
          console.log(`\nKept, by the gate: ${move.requirementId} improved across your floor's tasks and every other enforced rule held.`);
          console.log(`  The previous version remains in history:  atelier rollback --skill ${name} --to ${active}`);
          return;
        }
        if (check.decision.authority === 'AUTO_REJECT') {
          store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId, outcome: 'REJECTED', evaluationBasis: basis, at, note: complaint });
          console.log(`\nThe current version stays: ${check.decision.why}`);
          return;
        }
        console.log(`The gate still needs you: ${check.decision.why}\n`);
      }
    }
  }
  const pick = flag('--pick')?.toLowerCase()
    ?? counted
    ?? await ask('Which is better?  (a / b / same)  ', ['a', 'b', 'same'])
    ?? null;
  // Only a rejection is ever decided by the count. Every adoption is a person's pick.
  const decidedBy: 'HUMAN' | 'DETERMINISTIC' = counted && !flag('--pick') ? 'DETERMINISTIC' : 'HUMAN';
  if (!pick) {
    console.log('Decide when you have read them:');
    console.log(`  atelier fix ${JSON.stringify(complaint)} --pick a|b|same`);
    console.log(`(the candidate ${candidate.skillVersionHash} stays un-adopted until you do)`);
    return;
  }
  if (!['a', 'b', 'same'].includes(pick)) die(`--pick takes a|b|same; got "${pick}".`);
  const choseCandidate = pick !== 'same' && ((pick === 'a') !== championFirst);
  if (choseCandidate && gateRejected) {
    die(`the pick is refused: the count on ${move.requirementId}, a rule you ratified with a measurement, says the new implementation is worse (${gateRejected}). `
      + 'Nothing was promoted. To change what the rule demands, amend it: atelier amend --skill ' + name + ' --rule ' + move.requirementId + ' --measure <observer>:<params>|none --reason "<why>"');
  }
  if (countFavoursCandidate) console.log(`(the count favoured ${championFirst ? 'B' : 'A'}, the new implementation)`);
  const at = new Date().toISOString();

  // The pick is the first BEHAVIOR observation this system has ever recorded — the expert is the
  // instrument, and the judgement ledger accumulates what any future observer must be checked against.
  store.putObservation(L, { requirementId: move.requirementId, domain: 'BEHAVIOR', contextId: inv.inputHash,
    invocationId: candRec.invocationId, generationIndex: 0,
    verdict: pick === 'same' ? 'EQUAL' : choseCandidate ? 'CANDIDATE_PREFERRED' : 'CHAMPION_PREFERRED',
    producer: decidedBy === 'HUMAN' ? 'expert-blind-ab' : 'ratified-measurement', producerVersion: '1', authority: decidedBy,
    evidence: { order: championFirst ? 'champion-first' : 'candidate-first', complaint, champion: inv.invocationId }, at });
  store.appendEvent(L, { kind: 'JUDGEMENT_RECORDED', requirementId: move.requirementId,
    championSkillVersionHash: inv.skillVersionHash, candidateSkillVersionHash: candidate.skillVersionHash,
    choice: choseCandidate ? 'CANDIDATE' : 'CHAMPION', rationale: complaint, at });

  if (!choseCandidate) {
    store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId, outcome: 'REJECTED',
      evaluationBasis: { generations: 1, instrument: decidedBy === 'HUMAN' ? 'HUMAN_EYE' : 'QUALIFIED_OBSERVER', orderInvariant: null }, at, note: complaint });
    console.log(pick === 'same'
      ? '\nSame to your eye — the current version stays, and this move is recorded as tried.'
      : '\nThe current version stays. Recorded, so this move is not re-proposed on evidence this weak;');
    console.log(`a different mechanism will be tried on the next complaint about ${move.requirementId}.`);
    return;
  }

  // ── ADOPTED: active AND installed, one motion — Constraint B checked once more at the door ──
  const prevActive = store.getActive(L);
  const activeSv = prevActive ? store.getSkillVersion(L, prevActive) : null;
  if (activeSv && activeSv.standardVersionHash !== candidate.standardVersionHash) {
    die(`REPAIR INVARIANT: the active version is bound to ${activeSv.standardVersionHash}, the candidate to ${candidate.standardVersionHash}. Nothing was promoted.`);
  }
  const inst = pickHost().install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) return void die(`install failed: ${inst.reason}\n  Nothing was promoted — the active version is unchanged.`);
  store.setActive(L, candidate.skillVersionHash);
  store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId, outcome: 'PROMOTED',
    evaluationBasis: { generations: 1, instrument: decidedBy === 'HUMAN' ? 'HUMAN_EYE' : 'QUALIFIED_OBSERVER', orderInvariant: null }, at, note: complaint });
  store.appendEvent(L, { kind: 'PROMOTED', at, skillVersionHash: candidate.skillVersionHash,
    supersededActive: prevActive, evaluatedInvocation: candRec.invocationId, packageHash: pkg.packageHash });
  console.log(`\nKept. ${pickHost().invocationHint(name).trim()} now serves the new implementation.`);
  console.log(`  StandardVersion ${candidate.standardVersionHash} — unchanged, which is the point.`);
  console.log(`  The previous version remains in history:  atelier rollback --skill ${name} --to ${prevActive ?? ''}`);
}

/** One reflective choice, on the diagnoser model; nothing on failure (the fixed ordering stands). */
async function reflectOnce(v: StandardVersion, legal: readonly Mutation[], failures: readonly Failure[],
  repairs: readonly { requirementId: string; from: Carrier; to: Carrier; outcome: string }[]): Promise<ReturnType<typeof parseReflection>> {
  if (!legal.length) return { proposals: [], invalid: 0 };
  const rules = new Map(v.requirements.map((r) => [r.requirementId, r]));
  try {
    const res = await spend({ spentUsd: 0, capUsd: 0.5, maxCalls: 1 }, 0.05, async () => {
      const x = await clientFor(diagnoserModel()).complete({ stableBlock: REFLECT_SYSTEM, variableBlock: '',
        userMessage: reflectPrompt(rules, legal, failures, repairs), toolName: 'emit_proposals',
        toolDescription: 'Choose legal changes by number.', schema: REFLECT_SCHEMA, maxTokens: 1000 });
      return { value: x, cost: x.cost };
    });
    return parseReflection(res.json, legal);
  } catch (e) {
    console.log(`(reflection could not run: ${(e as Error).message.split('\n')[0]})`);
    return { proposals: [], invalid: 0 };
  }
}
