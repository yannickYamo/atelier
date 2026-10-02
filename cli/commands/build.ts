// cli/commands/build.ts — Compiling a ratified standard into a package and installing it for a host.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import type { StoredSignal } from '../../core/observers/selection.js';
import { selectVoicePieces, usualLength, type Voice } from '../../core/compiler/voice.js';
import { derivePersona, reconcilePersona, standardForbids } from '../../core/compiler/persona.js';
import type { Budget } from '../../core/inference/client.js';
import { sessionCorpus } from '../corpus.js';
import { normalizeClass } from '../../core/observers/doc-class.js';
import { selectContrastPairs } from '../../core/compiler/contrast-examples.js';
import { verifyText } from '../../core/observers/verify.js';
import { describeBackup } from '../../adapters/install-tree.js';
import { onCorpusReader } from './discover.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { compileArchitecture, observedBoundaries, type SkillArchitecture } from '../../core/architecture/compile.js';
import type { HostAdapter } from '../../adapters/host-adapter.js';
import { renderAgentSkill, assertPortable, skillNameFrom, defaultDescription } from '../../renderers/agent-skill/render.js';
import { buildProposal, renderProposal, unconfirmedIn } from '../../core/compiler/proposal.js';
import { defaultPlan, maintenanceMap, describeMaintenance } from '../../core/coverage/observation.js';
import { planImprovement, describeImprovement, type UndoRecord } from '../../core/compiler/apply.js';
import type { AdaptedComponent } from '../../core/intake/package.js';
import { installFidelity } from '../fidelity.js';
import { skillCardFor } from '../skill-card.js';
import { renderSkillCard } from '../../core/eval/skill-card.js';
import * as store from '../../core/state/store.js';
import { extract } from '../../core/intake/extract.js';

import { describeMatrix, type Carrier } from '../../core/delivery/carrier-delivery.js';
import { sha, DATA, die, argv, flag, projectDir, pickHost,
  loadSession, saveSession, step, runFile, numericFlag, orchestrated } from '../runtime.js';

// ── build ────────────────────────────────────────────────────────────────────────────────────
/** Host is detected or forced. Atelier runs the same either way; only install location differs. */

/**
 * Put a foreign package back exactly as it was.
 *
 * Separate from `rollback`, deliberately. Rollback moves the active pointer between SkillVersions
 * Atelier minted and is a statement about Atelier's own state. This restores bytes in a directory
 * that belongs to the user, which is a different act with different stakes — conflating them would
 * let one command mean "change which version is live" in one context and "overwrite the files you
 * wrote yourself" in another.
 */
export function revert(): void {
  const f = runFile('undo.json');
  if (!existsSync(f)) die('nothing to revert — no build has written into a skill of yours.');
  const undo = readJson<UndoRecord>(f, { what: 'an undo record' });
  const paths = Object.keys(undo.before);
  if (!paths.length) die('the last build wrote nothing, so there is nothing to put back.');

  for (const rel of paths) writeAtomic(join(undo.packageRoot, rel), undo.before[rel]);
  rmSync(f, { force: true });
  console.log(`Put ${paths.length} file(s) back as they were, in ${undo.packageRoot}:`);
  for (const rel of paths) console.log(`  ${rel}`);
  console.log(`\nYour standard is untouched — this reverted the SKILL, not what you decided good means.`);
}

/**
 * HOW THE AUTHOR SOUNDS (core/compiler/voice.ts, persona.ts): whole pieces of the author's, chosen to
 * span how they write, their usual length, and a persona brief (how they sound, with how often, each
 * point proven by a quote from their pieces, none describing a move the standard rules out). From the
 * pieces this run read (never a reserved one), kept through every rebuild. `--voice none` serves none of
 * it; `--persona none` keeps the pieces and drops the description; `auto` chooses again.
 */
async function chooseVoice(L: store.StoreLayout, v: StandardVersion): Promise<Voice | null> {
  const choice = (name: string): 'none' | 'auto' | undefined => {
    const x = flag(name)?.trim().toLowerCase();
    if (x !== undefined && x !== 'none' && x !== 'auto') die(`${name} takes none or auto`);
    return x as 'none' | 'auto' | undefined;
  };
  const voiceFlag = choice('--voice'); const personaFlag = choice('--persona');
  if (voiceFlag === 'none') return null;
  let voice: Voice | null = voiceFlag === undefined ? store.getVoice(L) : null;
  // This run's pieces: the run being built is this skill's, whatever name it is built under.
  const readable = !voice || personaFlag === 'auto' ? sessionCorpus() : [];
  if (!voice && readable.length >= 3) {
    const pieces = selectVoicePieces(readable);
    voice = { passages: [], lengthWords: usualLength(readable), pieces };
    if (pieces.length) console.log(`Voice: ${pieces.length} whole piece(s) of the author's own served with the skill, chosen to span how they write. Turn off with --voice none.`);
  }
  if (!voice) return null;
  if (personaFlag === 'none') return { ...voice, persona: undefined };
  if (readable.length < 3 || (personaFlag !== 'auto' && voice.persona)) return voice;
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.5), maxCalls: 1 };
  try {
    const persona = reconcilePersona(await onCorpusReader((c) => derivePersona(c, budget, readable)), standardForbids(v));
    console.log(`Persona: ${persona.points.length} point(s) on how the author sounds, each with how often and a quote from their pieces`
      + (persona.dropped ? ` (${persona.dropped} dropped: their quote was not in the pieces)` : '')
      + `${persona.conflicting ? ` (${persona.conflicting} dropped: they describe a move your standard rules out)` : ''}; $${budget.spentUsd.toFixed(3)}. Turn off with --persona none.`);
    return { ...voice, persona };
  } catch (e) {
    console.log(`(the persona could not be derived: ${(e as Error).message.split('\n')[0]}; the skill is built without it.)`);
    return voice;
  }
}

export async function build(nameArg?: string): Promise<void> {
  let s = loadSession();
  const name = skillNameFrom(nameArg ?? flag('--name') ?? die('--name required'));
  // THE FIRST THING A NEW USER HITS IF THEY RUN THIS TOO EARLY, so it says what to do rather than
  // what failed. It used to surface a raw ENOENT with an absolute store path — technically accurate,
  // and useless to someone who has simply not minted a standard yet.
  const pendingPath = runFile('pending-standard.json');
  if (!existsSync(pendingPath)) {
    die('there is no standard to build from yet.\n'
      + '  A skill is compiled from a ratified StandardVersion, and none has been minted here.\n'
      + '  From your own work:   atelier create <path-to-your-work>   then ratify, then ratify-close\n'
      + '  From what you can state:  atelier skill "<the rules, in your words>"');
  }
  const pending = readJson<StandardVersion>(pendingPath, { what: 'the pending standard' });
  // The document class is not part of the package, so changing it on a skill already built needs no
  // rebuild — and a rebuild of a BUILT run is refused by the run's state machine.
  const clsOnly = flag('--class');
  if (clsOnly !== undefined && s.run.state === 'BUILT') {
    const L0: store.StoreLayout = { root: DATA, skillName: name };
    if (!store.getActive(L0)) die(`no built skill called "${name}".`);
    store.setDocClass(L0, clsOnly.trim().toLowerCase() === 'none' ? null : normalizeClass(clsOnly));
    const now = store.getDocClass(L0);
    console.log(now ? `Document class for ${name}: ${now}. A text declared as another class is refused by verify and invoke.` : `Document class for ${name} cleared.`);
    return;
  }
  // ── THE STANDARD MUST BE THIS RUN'S ──────────────────────────────────────────────────────────
  //
  // The run records the hash it ratified; the file on disk is what will be compiled. Before this
  // check they were assumed to agree, and when two projects shared a store they did not: a build in
  // one project compiled — and stamped as ratified — the standard the other had just closed. The
  // working files are per-project now, and this is the check that makes any future drift refuse.
  if (s.run.standardVersionHash !== pending.standardVersionHash) {
    die(`the pending standard here is ${pending.standardVersionHash}, but this project's run `
      + (s.run.standardVersionHash ? `ratified ${s.run.standardVersionHash}.` : 'has ratified nothing.')
      + '\n  A skill is compiled only from the standard this run closed. Close it again: atelier ratify-close');
  }
  // ── ADVANCE BEFORE WRITING ───────────────────────────────────────────────────────────────────
  //
  // This transition used to be checked LAST: the store was written, the active pointer moved and
  // the skill installed, and then the run refused to advance — so a refused build looked exactly
  // like a successful one on disk and reported failure on the terminal.
  //
  // A BUILT run may be built again: the same ratified standard, compiled into a new implementation (the
  // voice turned on or off, the persona derived again, another skill name). The standard's hash was
  // checked above, so nothing about what "good" means can change here; the new SkillVersion becomes
  // active and the previous one stays in history (`atelier rollback`).
  if (s.run.state !== 'BUILT') s = step(s, 'BUILT');
  // THE HASH IS THE IDENTITY, SO THE FIRST MINT WINS. `mintedAt` sits outside the hash; re-closing
  // identical content in another project would otherwise make the store refuse a body that differs
  // only by timestamp. Same rule as `amend`.
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const v = store.getStandard(L, pending.standardVersionHash) ?? pending;
  // The arrangement is COMPILED, not derived from the requirement list. That is what lets a skill
  // improve while the standard stands still.
  const arch = compileArchitecture(v);
  const desc = flag('--description') ?? defaultDescription(v.workType);
  // ── THE EXEMPLAR, WHEN THE OWNER NAMES ONE ──────────────────────────────────────────────────
  //
  // Never a reserved piece: that work is held back to test the skill blind, and a skill that ships it
  // has read the answer key.
  // Everything this block decides is held in memory and written only when the build commits, below, so
  // `--review` writes nothing.
  const ex = flag('--exemplar');
  let exemplar = store.getExemplar(L);
  if (ex !== undefined) {
    if (ex.trim().toLowerCase() === 'none') exemplar = null;
    else {
      if (!existsSync(ex)) die(`--exemplar: there is no file at ${ex}.`);
      const text = readFileSync(ex, 'utf8');
      // Compared as text, not bytes: a copy with a BOM, Windows line ends or other whitespace is the same piece.
      const norm = (t: string): string => t.replace(/^\uFEFF/, '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
      if (s.reservation?.reserved.some((u) => norm(u.artifact) === norm(text))) {
        die('--exemplar names a piece that was reserved to test the skill blind. Pick one discovery was allowed to read.');
      }
      // The exemplar is what the model imitates, so it should meet the standard it illustrates.
      const report = verifyText(name, v, text);
      const broken = report.checked.filter((c) => c.result.verdict === 'VIOLATED');
      if (broken.length) {
        console.log(`Note: the exemplar breaks ${broken.map((c) => `${c.requirementId} (${c.result.detail})`).join(', ')}. `
          + 'The model will imitate it as it is.');
      }
      exemplar = { text };
      console.log('The exemplar is installed with the skill (examples/exemplar.md). If the skill directory is committed, so is the piece.');
    }
  }
  // The kind of document the standard measures; `verify`, `invoke` and the MCP tool refuse a text
  // declared as another kind. `none` clears it.
  const cls = flag('--class');
  const docClass = cls === undefined ? store.getDocClass(L) : cls.trim().toLowerCase() === 'none' ? null : normalizeClass(cls);
  if (cls !== undefined) {
    console.log(docClass ? `Document class: ${docClass}. A text declared as another class is refused by verify and invoke.` : 'Document class cleared.');
  }
  // Write-this-not-that pairs from the loop's own accepted repairs, re-verified against this standard.
  // Chosen here, at build, and kept through every rebuild; `--contrast none` turns them off.
  const contrastFlag = flag('--contrast');
  if (contrastFlag !== undefined && contrastFlag.trim().toLowerCase() !== 'none' && contrastFlag.trim().toLowerCase() !== 'auto') {
    die('--contrast takes none (ship no contrast examples) or auto (choose them from past repairs, the default)');
  }
  const contrastOff = contrastFlag === undefined ? store.getContrast(L).off : contrastFlag.trim().toLowerCase() === 'none';
  const heldBack = { tasks: (s.reservation?.reserved ?? []).map((u) => u.task), texts: (s.reservation?.reserved ?? []).map((u) => u.artifact) };
  const contrast = { off: contrastOff, pairs: contrastOff ? [] : selectContrastPairs(store.listInvocations(L), v, heldBack) };
  const shipped = contrast.pairs;
  if (shipped.length) console.log(`Contrast examples: ${shipped.length} "write this, not that" pair(s) from past repairs (examples/contrast.md). Turn off with --contrast none.`);
  const voice = await chooseVoice(L, v);
  const pkg0 = renderAgentSkill(v, arch, name, desc, exemplar, shipped, voice);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg0.packageHash}`), skillName: name,
    standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash, materializedHash: pkg0.packageHash, builtAt: new Date().toISOString(), description: desc };

  // ── THE RECORD OF WHAT THIS BUILD DECIDED ──────────────────────────────────────────────────
  //
  // Written on every build and never gating, because the standard is what the human ratifies and the
  // implementation is what the machine owns. `--review` stops before the write for anyone who wants
  // the gate anyway; that is an option, not the routine path.
  //
  // On CREATE nothing is already handled — there is no installed skill to carry anything — so every
  // rule is a change, and saying so is accurate rather than inflated. On IMPROVE the caller must have
  // decided which rules the existing package already carries; `alreadyHandled` has no default
  // precisely so that decision cannot be made silently here.
  const review = argv.includes('--review');
  const proposal = buildProposal(name, v.standardVersionHash, v.requirements, arch, new Set<string>());
  const proposalText = renderProposal(proposal, { gated: review });
  // Under `atelier new` the rule-by-rule plan is written, not printed: the person has just ruled on
  // every rule, and the plan restates each one. `atelier build` on its own prints it.
  if (orchestrated() && !review) console.log(`What each rule became, and why: ${runFile('proposal.md')}`);
  else console.log(`\n${proposalText}`);
  const guessed = unconfirmedIn(proposal);
  if (guessed.length) {
    console.log(`${guessed.length} of these we inferred and you have not confirmed. \`atelier pending\` lists them.\n`);
  }
  if (review) {
    console.log(`--review: stopping before anything is written. Re-run \`atelier build --name ${name}\` to install.`);
    return;
  }
  writeAtomic(runFile('proposal.md'), proposalText);
  store.initStore(L);
  // Only when there IS a corpus. A directly authored standard has no evidence record, and writing an
  // empty one to satisfy a call would fabricate a file that later reads as a sealed corpus.
  if (s.evidence) store.putEvidence(L, s.evidence);
  // The record of who decided this standard travels with it. Only the ledger stamped with THIS
  // version: a directly authored rule set, or a rebuild of an older standard, has none to carry.
  if (s.ledger?.records.some((r) => r.resultingStandardVersionHash === v.standardVersionHash)) {
    store.putLedger(L, v.standardVersionHash, s.ledger);
  }
  store.putStandard(L, v); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg0); store.setActive(L, skill.skillVersionHash);
  store.setExemplar(L, exemplar?.text ?? null); store.setVoice(L, voice); store.setDocClass(L, docClass); store.setContrast(L, contrast);
  // The author's signals, read off their pieces against the model's drafts at discovery (never a rule).
  if (existsSync(runFile('signals.json'))) store.setSignals(L, readJson<StoredSignal[]>(runFile('signals.json'), { what: 'the discovered signals', kind: 'array' }));
  // The fidelity profile and the first implementation release (cli/fidelity.ts): what steers drafts toward
  // the author's range, below the standard and never able to move it.
  const release = installFidelity(L, v, skill.skillVersionHash);
  if (release) console.log(`Implementation release ${release.id}: ${release.settings.drafts} drafts, up to ${release.settings.editBudget} structural edit(s)${release.retrievalHash ? `, ${release.settings.retrievalK} of your passages retrieved per request` : ''}.`);

  // ── IMPROVE: WRITE INTO THE USER'S OWN SKILL ───────────────────────────────────────────────
  //
  // Until this existed, `build` was journey-blind: `planImport` selected IMPROVE, `intake` typed the
  // package, `discover` found what it was missing — and then a brand new skill was installed beside
  // it. The diagnosis was real and nothing acted on it.
  //
  // Every edit is routed through `planPlacement`, so a rule the host could not see is REFUSED rather
  // than written. And the bytes are backed up first, by the same pass that changes them: `rollback`
  // moves a pointer between versions Atelier built and has no authority over a package it did not
  // create.
  const pkgFile = runFile('skill-package.json');
  if (existsSync(pkgFile)) {
    const sp = readJson<{ absRoot: string; components: AdaptedComponent[]; skillId: string }>(
      pkgFile, { what: 'the skill package', requireKeys: ['absRoot', 'components'] });
    const contents = new Map<string, string>();
    for (const c of sp.components) {
      const abs = join(sp.absRoot, c.path);
      if (existsSync(abs)) { const r = extract(abs); if (r.ok) contents.set(c.path, r.text); }
    }

    // ── ONLY WHAT MAY BIND IS WRITTEN, AND ONLY WHAT IS MISSING ────────────────────────────────
    //
    // Every proposal change used to be appended as a plain instruction heading — including rules the
    // compiler had routed to OBSERVE precisely because nobody ratified them. And the `already-handled`
    // list this filter leaned on was read from a file nothing ever wrote, so it was always empty.
    // "Already handled" is now read off the package itself: a rule whose words are in the files needs
    // no second copy.
    const installedText = [...contents.values()].join('\n');
    const writable = proposal.changes.filter((c) => c.gateRole === 'ENFORCE' && !installedText.includes(c.text));
    const plan = planImprovement(sp.skillId, sp.absRoot, writable, sp.components, contents);
    console.log(`\n${describeImprovement(plan, sp.skillId)}`);

    if (plan.edits.length) {
      const undo: UndoRecord = plan.undo;
      writeAtomic(runFile('undo.json'), JSON.stringify(undo, null, 1));
      for (const [rel, text] of Object.entries(plan.resulting)) writeAtomic(join(sp.absRoot, rel), text);
      console.log(`Written into ${sp.absRoot}.`);
      console.log(`  atelier revert    puts every one of those files back exactly as it was\n`);
    }

    saveSession({ ...s, skillName: name });
    console.log(`StandardVersion ${v.standardVersionHash} · architecture ${arch.architectureHash}`);

  // ── WHICH PARTS THIS SYSTEM CAN KEEP HONEST, AND WHICH STAY YOURS ────────────────────────
  //
  // Separate from carrier on purpose. A carrier is how the behaviour is caused; this is how anyone
  // would know it happened. Reporting it at build is the moment the author has just decided what
  // binds and can still see what that costs to maintain.
  {
    const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
    const plans = arch.components.flatMap((c) => c.carries
      .map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => defaultPlan(r, c.carrier)));
    if (plans.length) {
      console.log(describeMaintenance(maintenanceMap(plans),
        (id) => byId.get(id)?.statement ?? id));
    }
  }
    showSkillCard(L, skill.skillVersionHash, s.reservation?.reserved.length ?? 0);
    return;
  }

  const host = pickHost();
  const pkg = pkg0;
  assertPortable(pkg);
  const inst = host.install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  saveSession({ ...s, skillName: name });
  reportInstalled(host, inst.installedAt, name, v, arch, pkg.packageHash);
  reportObservedBoundaries(arch, v, name);
  showSkillCard(L, skill.skillVersionHash, s.reservation?.reserved.length ?? 0);
}

/**
 * THE SKILL'S EVALUATION (cli/skill-card.ts): what every output will be checked by and how far each check can be
 * trusted, printed now and stored with this version (atelier report --skill <name>; the MCP tool). On every
 * build path, the one that writes into the person's own skill included.
 */
function showSkillCard(L: store.StoreLayout, skillVersion: string, heldBack: number): void {
  const card = skillCardFor(L, { heldBack, skillVersion, persist: true });
  if (card && !argv.includes('--quiet')) console.log(`\n${renderSkillCard(card, process.stdout.columns || 110)}\n`);
}

/**
 * The install, reported. "READY" IS EARNED, NOT ANNOUNCED: the banner means at least one rule reaches the
 * model as an instruction. Under `atelier new`, one line and any delivery gap; on its own, the hashes and
 * the host's full delivery matrix.
 */
function reportInstalled(host: HostAdapter, installedAt: string, name: string, v: StandardVersion, arch: SkillArchitecture, packageHash: string): void {
  const instructs = arch.components.some((c) => c.gateRole === 'ENFORCE');
  if (instructs && orchestrated()) {
    console.log(`\nYour skill is ready: ${host.invocationHint(name).trim()}   (installed for ${host.detect().hostId} at ${installedAt})`);
    reportDeliveryGap(host, arch, name);
    return;
  }
  if (instructs) {
    console.log(`\nYour skill is ready.\n`);
  } else {
    console.log(`\nPreview installed — it INSTRUCTS NOTHING until you rule.\n`);
    console.log(v.authorityState === 'DRAFT'
      ? `  Every rule is still a proposal. Rule on them:  atelier ratify --page rulings.html   (or atelier pending)`
      : `  Every kept rule is shown, not instructed. Declare what binds:  "materiality":"REQUIRED" on a ratify decision`);
    console.log('');
  }
  console.log(`  ${host.invocationHint(name)}\n`);
  console.log(`Installed for ${host.detect().hostId} at ${installedAt}`);
  console.log(`StandardVersion ${v.standardVersionHash} · architecture ${arch.architectureHash} · package ${packageHash}`);

  // ── WHAT THIS HOST ACTUALLY HOLDS ──────────────────────────────────────────────────────────
  //
  // Printed at install because this is the moment a person forms a belief about what their skill now
  // does. "Installed" used to be the last word, and it invited the reading that every carrier in the
  // package is in force wherever the package is — which was false for two of them and silently so.
  //
  // The standard is unchanged either way. What a host cannot enforce, it cannot enforce; the answer is
  // to say so here, not to weaken the standard until it fits.
  {
    const present = [...new Set(arch.components.map((c) => c.carrier))] as Carrier[];
    console.log(`\n${describeMatrix(`${host.detect().hostId} (invoked as ${host.invocationHint(name).trim()})`, host.carrierDelivery(), present)}`);
    if (undelivered(host, arch).length) {
      console.log(`Everything in your standard is delivered when Atelier owns the call:`);
      console.log(`  atelier invoke --skill ${name} "<your task>"\n`);
    }
  }
}

/** Carriers in this skill the host does not deliver itself: they reach the model only through `atelier invoke`. */
function undelivered(host: HostAdapter, arch: SkillArchitecture): Carrier[] {
  const present = [...new Set(arch.components.map((c) => c.carrier))] as Carrier[];
  return present.filter((c) => host.carrierDelivery()[c].state !== 'DELIVERED' && c !== 'NONE');
}

/** One line when part of the skill is only referenced on this host, naming the call that delivers all of it. */
function reportDeliveryGap(host: HostAdapter, arch: SkillArchitecture, name: string): void {
  const gap = undelivered(host, arch);
  if (gap.length) console.log(`(${host.detect().hostId} is not seen to load ${gap.join(', ')}; everything is delivered by: atelier invoke --skill ${name} "<your task>")`);
}

/**
 * THE POST-BUILD DISCLOSURE. It comes AFTER the skill works, and asks about one thing only: prohibitions
 * nobody confirmed, the decisions the corpus cannot check, because their evidence is what is not there.
 */
function reportObservedBoundaries(arch: SkillArchitecture, v: StandardVersion, name: string): void {
  const observed = observedBoundaries(arch, v);
  if (observed.length && orchestrated()) {
    console.log(`${observed.length} pattern(s) you seem to avoid are watched, not enforced: ${observed.map((c) => c.carries[0]).join(', ')}. `
      + `Confirm one: atelier confirm --skill ${name} --rule <id>   (or --drop)`);
  } else if (observed.length) {
    const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
    console.log(`\nOne thing worth a look. I noticed ${observed.length} pattern(s) you seem to avoid.`);
    console.log('I could be wrong — absence in your work does not prove it was deliberate — so these are');
    console.log('NOT shaping what your skill writes. It checks its own draft against them and tells you.\n');
    for (const c of observed) {
      const r = byId.get(c.carries[0]);
      if (r) console.log(`  ${r.requirementId}  ${r.statement}`);
    }
    console.log(`\nIf one is right: atelier confirm --skill ${name} --rule <id>   (it starts shaping the writing)`);
    console.log(`If one is wrong: atelier confirm --skill ${name} --rule <id> --drop`);
  }
}
