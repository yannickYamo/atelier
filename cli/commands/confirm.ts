// cli/commands/confirm.ts — Ruling on one inferred prohibition.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import type { StandardVersion } from '../../core/state/canonical-state.js';
import { authorityStateOf, assertSupersessionRecorded } from '../../core/state/canonical-state.js';
import { compileArchitecture, observedBoundaries } from '../../core/architecture/compile.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import * as store from '../../core/state/store.js';

import { sha, DATA, die, argv, flag, projectDir, pickHost } from '../runtime.js';

// ── confirm ─────────────────────────────────────────────────────────────────────────────────
/**
 * Rule on ONE observed boundary, after the skill already works.
 *
 * This is the entire remaining human-authority surface, and it is deliberately the smallest one that
 * can exist: a prohibition nobody confirmed either starts shaping the writing, or it goes away.
 *
 * It mints a NEW StandardVersion, because confirming a rule changes what the author stands behind.
 * The architecture is then recompiled and the skill rebuilt — which is the same path the optimizer
 * will take later, exercised here by a person.
 */
export function confirmBoundary(): void {
  const name = flag('--skill') ?? die('--skill required');
  const ruleId = flag('--rule') ?? die('--rule required — confirm one at a time; a bulk yes is not a judgement.');
  const drop = argv.includes('--drop');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash)!;
  const prev = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing.');

  const target = prev.requirements.find((r) => r.requirementId === ruleId)
    ?? die(`${ruleId} is not in standard ${prev.standardVersionHash}.`);
  if (target.authority !== 'DERIVED_UNRATIFIED') die(`${ruleId} is already ${target.authority} — nothing to confirm.`);

  const requirements = drop
    ? prev.requirements.filter((r) => r.requirementId !== ruleId)
    : prev.requirements.map((r) => r.requirementId === ruleId ? { ...r, authority: 'EXPERT_RATIFIED' as const } : r);

  const body = { evidenceId: prev.evidenceId, workType: prev.workType, requirements };
  const next: StandardVersion = { standardVersionHash: sha(JSON.stringify(body)), ...body,
    authorityState: authorityStateOf(requirements), mintedAt: new Date().toISOString(), supersedes: prev.standardVersionHash,
    reason: drop ? `author ruled "${target.statement}" is not a rule they hold` : `author confirmed "${target.statement}"` };
  assertSupersessionRecorded(next);

  const arch = compileArchitecture(next);
  const desc = flag('--description') ?? sv.description ?? defaultDescription(next.workType);
  const pkg = renderAgentSkill(next, arch, name, desc);
  assertPortable(pkg);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: next.standardVersionHash, architectureHash: arch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: desc };

  store.putStandard(L, next); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg); store.setActive(L, skill.skillVersionHash);
  const host = pickHost();
  const inst = host.install(pkg, projectDir());
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  console.log(drop
    ? `Dropped. "${target.statement}" is no longer part of your standard.`
    : `Confirmed. "${target.statement}" now shapes what your skill writes.`);
  console.log(`StandardVersion ${next.standardVersionHash} (supersedes ${prev.standardVersionHash}) · architecture ${arch.architectureHash}`);
  const left = observedBoundaries(arch).length;
  console.log(left ? `${left} still observed-only.` : 'Nothing left unconfirmed.');
}
