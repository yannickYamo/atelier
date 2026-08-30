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

import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import * as store from '../../core/state/store.js';
import { readJson } from '../../core/state/read-json.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import { applyEscalation, type ServedMissEvidence } from '../../core/architecture/escalate.js';
import { proposeReplacement, assertStandardUnchanged, eligibleCarriers } from '../../core/architecture/replace-carrier.js';
import { foldRepairs, foldProhibitions, mayPropose, repairKey, WEAKEST_EVALUATION,
  type EvidenceBasis, type RepairScope } from '../../core/architecture/repair-memory.js';
import type { Carrier } from '../../core/architecture/compile.js';
import { diagnose } from '../../core/diagnosis/diagnose.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import { decide } from '../../core/ratification/authority.js';
import { draftHash, appendDecision, stampVersion } from '../../core/ratification/decision-record.js';
import { authorityStateOf, assertSupersessionRecorded, type Requirement, type StandardVersion, type InvocationRecord } from '../../core/state/canonical-state.js';
import type { InstallablePackage } from '../../adapters/host-adapter.js';
import { bindingHash } from '../../core/runtime/binding.js';
import type { Budget } from '../../core/inference/client.js';
import { runOnce } from './improve.js';
import { sha, DATA, die, argv, flag, positional, numericFlag, clientFor, clientAndBinding, MODEL,
  projectDir, pickHost, runFile, assertSkillName, loadSession } from '../runtime.js';

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
  const inv = store.getInvocation(L, invId) ?? die(`no invocation ${invId} for ${name}.`);
  console.log(`About your last run of /${name}: "${inv.input.slice(0, 70)}${inv.input.length > 70 ? '…' : ''}"`);
  console.log(`You said: "${complaint}"\n`);

  const fb = { feedbackId: `f${sha(`${invId}|${complaint}`).slice(0, 10)}`, invocationId: invId, complaint, at: new Date().toISOString() };

  const ranStandard = store.getStandard(L, inv.standardVersionHash) ?? die(`standard ${inv.standardVersionHash} missing.`);
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.0), maxCalls: numericFlag('--max-calls', 12) };
  const d = await diagnose(clientFor(flag('--model') ?? MODEL), budget, ranStandard, inv, fb);
  console.log(`diagnosis  ${d.route}   ($${budget.spentUsd.toFixed(4)})`);
  console.log(`  ${d.reason}\n`);
  // Written ONCE, after diagnosis, so the record can name the rule the miss was attributed to.
  // The id is content-derived, so re-entering with the same complaint writes the same bytes.
  try { store.putFeedback(L, d.route === 'IMPLEMENTATION_MISS' ? { ...fb, requirementId: d.requirementId ?? undefined } : fb); }
  catch { /* the identical record from a previous phase of this same complaint already exists */ }

  // ── DELIVERY: the standard is not involved; put the approved bytes back ─────────────────────
  if (d.route === 'DELIVERY_FAILURE') {
    const active = store.getActive(L) ?? die(`no active version for ${name}.`);
    const sv = store.getSkillVersion(L, active) ?? die(`SkillVersion ${active} missing.`);
    const pkg = store.getPackage(L, sv.materializedHash) ?? die(`package ${sv.materializedHash} missing — rebuild: atelier build --name ${name}`);
    const inst = pickHost().install(pkg, projectDir());
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

    // The machine proposed the words; the person just made them binding — that is ratification of a
    // discovered rule, never authorship, and `decide` records it exactly that way.
    let n = 0; for (const r of ranStandard.requirements) { const m = /^x(\d+)$/.exec(r.requirementId); if (m) n = Math.max(n, Number(m[1])); }
    const base: Requirement = { requirementId: `x${n + 1}`, statement: proposal, appliesWhen: 'GENERAL',
      kind: /\bnever\b|\bnot\b|\bavoid\b/i.test(proposal) ? 'BOUNDARY' : 'GENERATIVE',
      authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED', evidence: null, evidenceItemId: null,
      wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null };
    const outcome = decide(base, { verb: 'APPROVE', materiality: answer.toUpperCase() });
    const requirements = [...ranStandard.requirements, outcome.requirement];
    const body = { evidenceId: ranStandard.evidenceId, workType: ranStandard.workType, requirements };
    const next: StandardVersion = { standardVersionHash: sha(JSON.stringify(body)), ...body,
      authorityState: authorityStateOf(requirements), mintedAt: new Date().toISOString(),
      supersedes: ranStandard.standardVersionHash, reason: complaint };
    assertSupersessionRecorded(next);
    const arch = compileArchitecture(next);
    const activeSv = store.getActive(L) ? store.getSkillVersion(L, store.getActive(L)!) : null;
    const desc = activeSv?.description ?? defaultDescription(next.workType);
    const pkg = renderAgentSkill(next, arch, name, desc);
    assertPortable(pkg);
    const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg.packageHash}`), skillName: name,
      standardVersionHash: next.standardVersionHash, architectureHash: arch.architectureHash,
      materializedHash: pkg.packageHash, builtAt: next.mintedAt, description: desc };
    store.putStandard(L, next); store.putSkillVersion(L, skill); store.putArchitecture(L, arch);
    store.putPackage(L, pkg); store.setActive(L, skill.skillVersionHash);
    const inst = pickHost().install(pkg, projectDir());
    if (!inst.ok) return void die(`install failed: ${inst.reason}`);
    const ledger = stampVersion(appendDecision({ standardDraftHash: draftHash([base]), records: [] },
      base, outcome.ledgerDecision, { note: complaint, decidedAt: next.mintedAt }), next.standardVersionHash);
    store.appendEvent(L, { kind: 'LEDGER_DECISION', record: ledger.records[0], at: next.mintedAt });
    store.appendEvent(L, { kind: 'PROPOSED_CHANGE', at: next.mintedAt, skillVersionHash: skill.skillVersionHash, proposal, accepted: true });
    console.log(`Added as ${answer.toUpperCase()} — ${outcome.requirement.requirementId} ${answer === 'required' ? 'instructs' : 'is shown'}.`);
    console.log(`StandardVersion ${next.standardVersionHash} supersedes ${ranStandard.standardVersionHash}  (reason: your complaint, on file)`);
    console.log(`Rebuilt and installed: ${pickHost().invocationHint(name).trim()} now serves it.`);
    return;
  }

  // ── IMPLEMENTATION MISS: one lateral candidate, the same task re-run, one keystroke ─────────
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
    const candInv = store.listInvocations(L).find((r) => r.skillVersionHash === cand.skillVersionHash)
      ?? die(`pending candidate ${cand.skillVersionHash} has no recorded run — reject it and start over:\n  atelier reject --skill ${name} --candidate ${cand.skillVersionHash} --why "stale"`);
    const candPkg = store.getPackage(L, cand.materializedHash) ?? die(`package ${cand.materializedHash} missing.`);
    await settleBlindPick(L, name, inv, cand, candInv, candPkg,
      { requirementId: pendingRepair.requirementId, from: pendingRepair.from, to: pendingRepair.to },
      pendingRepair.repairId, complaint);
    return;
  }
  const op = proposeReplacement(ev, ranArch, requirement, rejectedHere);
  if ('refused' in op) { console.log(`No repair proposed: ${op.reason}`); return; }

  const misses = store.listFeedback(L)
    .filter((f) => f.requirementId === d.requirementId)
    .map((f) => store.getInvocation(L, f.invocationId))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const evidence: EvidenceBasis = {
    missContexts: new Set([inv.inputHash, ...misses.map((r) => r.inputHash)]).size,
    invocationIds: [...new Set([inv.invocationId, ...misses.map((r) => r.invocationId)])] };
  const may = mayPropose(repairs, prohibitions, op.requirementId, op.from, op.to,
    { evidence, evaluation: WEAKEST_EVALUATION }, scope);
  if (!may.allowed) { console.log(`No repair proposed — ${may.reason}`); return; }

  const nextArch = applyEscalation(ranArch, op, sha(JSON.stringify(op) + ranArch.architectureHash));
  const desc = flag('--description') ?? store.getSkillVersion(L, inv.skillVersionHash)?.description ?? defaultDescription(ranStandard.workType);
  const pkg = renderAgentSkill(ranStandard, nextArch, name, desc);
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
    skillName: name, requirementId: op.requirementId, from: op.from, to: op.to,
    ...scope, bindingHash: bindingHash(inv.runtimeBinding),
    ordering: eligibleCarriers(requirement).join('>'),
    sourceSkillVersionHash: inv.skillVersionHash, candidateSkillVersionHash: candidate.skillVersionHash,
    evidenceBasis: evidence, at: candidate.builtAt });

  console.log(`Trying a different implementation of ${op.requirementId}: ${op.from} → ${op.to} (a different mechanism, not a "stronger" one).`);
  console.log('Re-running your task on it…\n');
  const { client, binding } = clientAndBinding('target');
  const candRec = await runOnce(L, candidate, pkg.files['SKILL.md'] ?? '', pkg.packageHash,
    { expectedPackageHash: pkg.packageHash, servedPackageHash: pkg.packageHash, matched: true, servedFiles: Object.keys(pkg.files) },
    inv.input, client, budget, binding, 'ORGANIC_USE', pkg.files['contracts/output.schema.json'] ?? null, 'HOST_PROMPT');

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
  const pick = flag('--pick')?.toLowerCase()
    ?? await ask('Which is better?  (a / b / same)  ', ['a', 'b', 'same'])
    ?? null;
  if (!pick) {
    console.log('Decide when you have read them:');
    console.log(`  atelier fix ${JSON.stringify(complaint)} --pick a|b|same`);
    console.log(`(the candidate ${candidate.skillVersionHash} stays un-adopted until you do)`);
    return;
  }
  if (!['a', 'b', 'same'].includes(pick)) die(`--pick takes a|b|same; got "${pick}".`);
  const choseCandidate = pick !== 'same' && ((pick === 'a') !== championFirst);
  const at = new Date().toISOString();

  // The pick is the first BEHAVIOR observation this system has ever recorded — the expert is the
  // instrument, and the judgement ledger accumulates what any future observer must be checked against.
  store.putObservation(L, { requirementId: move.requirementId, domain: 'BEHAVIOR', contextId: inv.inputHash,
    invocationId: candRec.invocationId, generationIndex: 0,
    verdict: pick === 'same' ? 'EQUAL' : choseCandidate ? 'CANDIDATE_PREFERRED' : 'CHAMPION_PREFERRED',
    producer: 'expert-blind-ab', producerVersion: '1', authority: 'HUMAN',
    evidence: { order: championFirst ? 'champion-first' : 'candidate-first', complaint, champion: inv.invocationId }, at });
  store.appendEvent(L, { kind: 'JUDGEMENT_RECORDED', requirementId: move.requirementId,
    championSkillVersionHash: inv.skillVersionHash, candidateSkillVersionHash: candidate.skillVersionHash,
    choice: choseCandidate ? 'CANDIDATE' : 'CHAMPION', rationale: complaint, at });

  if (!choseCandidate) {
    store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId, outcome: 'REJECTED',
      evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null }, at, note: complaint });
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
  if (!inst.ok) return void die(`install failed: ${inst.reason}\n  Nothing was promoted — the active version is unchanged.`);
  store.setActive(L, candidate.skillVersionHash);
  store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId, outcome: 'PROMOTED',
    evaluationBasis: { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null }, at, note: complaint });
  store.appendEvent(L, { kind: 'PROMOTED', at, skillVersionHash: candidate.skillVersionHash,
    supersededActive: prevActive, evaluatedInvocation: candRec.invocationId, packageHash: pkg.packageHash });
  console.log(`\nKept. ${pickHost().invocationHint(name).trim()} now serves the new implementation.`);
  console.log(`  StandardVersion ${candidate.standardVersionHash} — unchanged, which is the point.`);
  console.log(`  The previous version remains in history:  atelier rollback --skill ${name} --to ${prevActive ?? ''}`);
}
