// cli/commands/confirm.ts — Ruling on one inferred prohibition.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { resolveRule } from '../../core/state/rule-key.js';
import { describeBackup } from '../../adapters/install-tree.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { authorityStateOf, assertSupersessionRecorded } from '../../core/state/canonical-state.js';
import { compileArchitecture, observedBoundaries } from '../../core/architecture/compile.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import * as store from '../../core/state/store.js';

import { sha, DATA, die, argv, flag, projectDir, pickHost, skillArg, carriedFrom } from '../runtime.js';
import { decide } from '../../core/ratification/authority.js';
import { draftHash, appendDecision, stampVersion } from '../../core/ratification/decision-record.js';

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
  const name = skillArg();
  const ruleRef = flag('--rule') ?? die('--rule required — confirm one at a time; a bulk yes is not a judgement.');
  const drop = argv.includes('--drop');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash)!;
  const prev = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing.');

  const found = resolveRule(prev.requirements, ruleRef);
  if ('error' in found) return void die(found.error);
  const target = found.rule; const ruleId = target.requirementId;
  if (target.authority !== 'DERIVED_UNRATIFIED') die(`${ruleId} is already ${target.authority} — nothing to confirm.`);

  let confirmedReq = target;
  let confirmedLedger: 'APPROVE' | 'REJECT' = 'REJECT';
  if (!drop) {
    try {
      const outcome = decide(target, { verb: 'CONFIRM' });
      confirmedReq = outcome.requirement;
      confirmedLedger = 'APPROVE';
    } catch (e) { return void die((e as Error).message); }
  }
  const requirements = drop
    ? prev.requirements.filter((r) => r.requirementId !== ruleId)
    : prev.requirements.map((r) => r.requirementId === ruleId ? confirmedReq : r);

  const body = { evidenceId: prev.evidenceId, workType: prev.workType, requirements };
  const next: StandardVersion = { standardVersionHash: sha(JSON.stringify(body)), ...body,
    authorityState: authorityStateOf(requirements), mintedAt: new Date().toISOString(), supersedes: prev.standardVersionHash,
    reason: drop ? `author ruled "${target.statement}" is not a rule they hold` : `author confirmed "${target.statement}"` };
  assertSupersessionRecorded(next);

  const arch = compileArchitecture(next);
  const desc = flag('--description') ?? sv.description ?? defaultDescription(next.workType);
  const carried = carriedFrom(L, sv.skillVersionHash, next);
  const pkg = renderAgentSkill(next, arch, name, desc, carried.exemplar, carried.contrast);
  assertPortable(pkg);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: next.standardVersionHash, architectureHash: arch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: desc };

  store.putStandard(L, next); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg); store.setActive(L, skill.skillVersionHash);
  const host = pickHost();
  const inst = host.install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  // Ledgered like every other ruling. A drop is a REJECT of the inferred rule; a confirm is its APPROVE.
  const ledger = stampVersion(appendDecision({ standardDraftHash: draftHash([target]), records: [] },
    target, confirmedLedger, { ...(next.reason ? { note: next.reason } : {}), decidedAt: next.mintedAt }), next.standardVersionHash);
  store.appendEvent(L, { kind: 'LEDGER_DECISION', record: ledger.records[0], at: next.mintedAt });

  console.log(drop
    ? `Dropped. "${target.statement}" is no longer part of your standard.`
    : `Confirmed. "${target.statement}" now shapes what your skill writes.`);
  console.log(`StandardVersion ${next.standardVersionHash} (supersedes ${prev.standardVersionHash}) · architecture ${arch.architectureHash}`);
  const left = observedBoundaries(arch, next).length;
  console.log(left ? `${left} still observed-only.` : 'Nothing left unconfirmed.');
}
