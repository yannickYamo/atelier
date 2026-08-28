// cli/commands/build.ts — Compiling a ratified standard into a package and installing it for a host.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { existsSync, rmSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { compileArchitecture, observedBoundaries } from '../../core/architecture/compile.js';
import { renderAgentSkill, assertPortable, skillNameFrom, defaultDescription } from '../../renderers/agent-skill/render.js';
import { buildProposal, renderProposal, unconfirmedIn } from '../../core/compiler/proposal.js';
import { defaultPlan, maintenanceMap, describeMaintenance } from '../../core/coverage/observation.js';
import { planImprovement, describeImprovement, type UndoRecord } from '../../core/compiler/apply.js';
import type { AdaptedComponent } from '../../core/intake/package.js';
import * as store from '../../core/state/store.js';
import { extract } from '../../core/intake/extract.js';

import { describeMatrix, type Carrier } from '../../core/delivery/carrier-delivery.js';
import { sha, DATA, die, argv, flag, projectDir, pickHost,
  loadSession, saveSession, step } from '../runtime.js';

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
  const f = join(DATA, 'undo.json');
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

export function build(nameArg?: string): void {
  let s = loadSession();
  const name = skillNameFrom(nameArg ?? flag('--name') ?? die('--name required'));
  const v = readJson<StandardVersion>(join(DATA, 'pending-standard.json'), { what: 'the pending standard' });
  // The arrangement is COMPILED, not derived from the requirement list. That is what lets a skill
  // improve while the standard stands still.
  const arch = compileArchitecture(v);
  const desc = flag('--description') ?? defaultDescription(v.workType);
  const pkg0 = renderAgentSkill(v, arch, name, desc);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg0.packageHash}`), skillName: name,
    standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash, materializedHash: pkg0.packageHash, builtAt: new Date().toISOString(), description: desc };

  const L: store.StoreLayout = { root: DATA, skillName: name };
  store.initStore(L);
  // Only when there IS a corpus. A directly authored standard has no evidence record, and writing an
  // empty one to satisfy a call would fabricate a file that later reads as a sealed corpus.
  if (s.evidence) store.putEvidence(L, s.evidence);
  store.putStandard(L, v); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg0); store.setActive(L, skill.skillVersionHash);

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
  const alreadyHandled = new Set<string>(
    existsSync(join(DATA, 'already-handled.json'))
      ? readJson<string[]>(join(DATA, 'already-handled.json'), { kind: 'array', what: 'the already-handled list' })
      : []);
  const review = argv.includes('--review');
  const proposal = buildProposal(name, v.standardVersionHash, v.requirements, arch, alreadyHandled);
  const proposalText = renderProposal(proposal, { gated: review });
  writeAtomic(join(DATA, 'proposal.md'), proposalText);
  console.log(`\n${proposalText}`);
  const guessed = unconfirmedIn(proposal);
  if (guessed.length) {
    console.log(`${guessed.length} of these we inferred and you have not confirmed. \`atelier pending\` lists them.\n`);
  }
  if (review) {
    console.log(`--review: stopping before anything is written. Re-run \`atelier build --name ${name}\` to install.`);
    return;
  }

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
  const pkgFile = join(DATA, 'skill-package.json');
  if (existsSync(pkgFile)) {
    const sp = readJson<{ absRoot: string; components: AdaptedComponent[]; skillId: string }>(
      pkgFile, { what: 'the skill package', requireKeys: ['absRoot', 'components'] });
    const contents = new Map<string, string>();
    for (const c of sp.components) {
      const abs = join(sp.absRoot, c.path);
      if (existsSync(abs)) { const r = extract(abs); if (r.ok) contents.set(c.path, r.text); }
    }

    const plan = planImprovement(sp.skillId, sp.absRoot, proposal.changes, sp.components, contents);
    console.log(`\n${describeImprovement(plan, sp.skillId)}`);

    if (plan.edits.length) {
      const undo: UndoRecord = plan.undo;
      writeAtomic(join(DATA, 'undo.json'), JSON.stringify(undo, null, 1));
      for (const [rel, text] of Object.entries(plan.resulting)) writeAtomic(join(sp.absRoot, rel), text);
      console.log(`Written into ${sp.absRoot}.`);
      console.log(`  atelier revert    puts every one of those files back exactly as it was\n`);
    }

    s = step(s, 'BUILT');
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
    return;
  }

  const host = pickHost();
  const pkg = pkg0;
  assertPortable(pkg);
  const inst = host.install(pkg, projectDir());
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  s = step(s, 'BUILT');
  saveSession({ ...s, skillName: name });
  console.log(`\nYour skill is ready.\n`);
  console.log(`  ${host.invocationHint(name)}\n`);
  console.log(`Installed for ${host.detect().hostId} at ${inst.installedAt}`);
  console.log(`StandardVersion ${v.standardVersionHash} · architecture ${arch.architectureHash} · package ${pkg.packageHash}`);

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
    const gap = present.filter((c) => host.carrierDelivery()[c].state !== 'DELIVERED' && c !== 'NONE');
    if (gap.length) {
      console.log(`Everything in your standard is delivered when Atelier owns the call:`);
      console.log(`  atelier invoke --skill ${name} "<your task>"\n`);
    }
  }

  // ── THE POST-BUILD DISCLOSURE ──────────────────────────────────────────────────────────────
  // It comes AFTER the skill works, and it asks about one thing only: prohibitions nobody confirmed.
  // Those are the decisions that cannot be checked against the corpus, because the evidence for a
  // prohibition is the thing that is not there.
  const observed = observedBoundaries(arch, v);
  if (observed.length) {
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
