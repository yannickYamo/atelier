// cli/commands/addition.ts — ONE RULE ADDED BY THE OWNER, MINTED, BUILT AND INSTALLED IN ONE MOTION.
//
// The shared end of two paths that end in the same act: `fix` finding that the standard does not say
// what a complaint needs, and `mine` finding the same gap recurring across many complaints. Either way
// the machine proposed the words and the person made them binding, which is ratification of a
// discovered rule, never authorship, and `decide` records it exactly that way.
//
// AN ADDITION LANDS ON THE ACTIVE STANDARD. Two complaints about the same run are two rules; minting
// each from the run's standard would let the second silently drop the first. The complaint's provenance
// is kept in the version's `reason`; the base is whatever the owner holds now.

import * as store from '../../core/state/store.js';
import { decide } from '../../core/ratification/authority.js';
import { draftHash, appendDecision, stampVersion } from '../../core/ratification/decision-record.js';
import { authorityStateOf, assertSupersessionRecorded, type Requirement, type StandardVersion } from '../../core/state/canonical-state.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import { describeBackup } from '../../adapters/install-tree.js';
import { sha, die, projectDir, pickHost, carriedFrom } from '../runtime.js';

export interface Addition {
  readonly requirement: Requirement;
  readonly standard: StandardVersion;
  readonly supersedes: string;
  readonly skillVersionHash: string;
}

export function addRuleToActive(L: store.StoreLayout, name: string, statement: string, materiality: 'REQUIRED' | 'PREFERRED',
  reason: string, fallback: StandardVersion | null = null,
  /** the complaints this rule answers, so `mine` does not offer the same gap again */
  feedbackIds: readonly string[] = []): Addition {
  const activeSv = store.getActive(L) ? store.getSkillVersion(L, store.getActive(L)!) : null;
  const baseStandard = (activeSv && store.getStandard(L, activeSv.standardVersionHash)) ?? fallback
    ?? die(`no standard to add to for ${name}.`);
  let n = 0; for (const r of baseStandard.requirements) { const m = /^x(\d+)$/.exec(r.requirementId); if (m) n = Math.max(n, Number(m[1])); }
  const base: Requirement = { requirementId: `x${n + 1}`, statement, appliesWhen: 'GENERAL',
    kind: /\bnever\b|\bnot\b|\bavoid\b/i.test(statement) ? 'BOUNDARY' : 'GENERATIVE',
    authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED', evidence: null, evidenceItemId: null,
    wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null };
  const outcome = decide(base, { verb: 'APPROVE', materiality });
  const requirements = [...baseStandard.requirements, outcome.requirement];
  const body = { evidenceId: baseStandard.evidenceId, workType: baseStandard.workType, requirements };
  const next: StandardVersion = { standardVersionHash: sha(JSON.stringify(body)), ...body,
    authorityState: authorityStateOf(requirements), mintedAt: new Date().toISOString(),
    supersedes: baseStandard.standardVersionHash, reason };
  assertSupersessionRecorded(next);
  const arch = compileArchitecture(next);
  const desc = activeSv?.description ?? defaultDescription(next.workType);
  const carried = carriedFrom(L, activeSv?.skillVersionHash ?? null, next);
  const pkg = renderAgentSkill(next, arch, name, desc, carried.exemplar, carried.contrast);
  assertPortable(pkg);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: next.standardVersionHash, architectureHash: arch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: next.mintedAt, description: desc };
  store.putStandard(L, next); store.putSkillVersion(L, skill); store.putArchitecture(L, arch); store.putPackage(L, pkg);
  // Installed first, activated second: a failed install leaves the previous version active and serving.
  const inst = pickHost().install(pkg, projectDir());
  { const moved = describeBackup(inst); if (moved) console.log(moved); }
  if (!inst.ok) die(`install failed: ${inst.reason}\n  Nothing was added: the active version is unchanged.`);
  store.setActive(L, skill.skillVersionHash);
  const ledger = stampVersion(appendDecision({ standardDraftHash: draftHash([base]), records: [] },
    base, outcome.ledgerDecision, { note: reason, decidedAt: next.mintedAt }), next.standardVersionHash);
  store.appendEvent(L, { kind: 'LEDGER_DECISION', record: ledger.records[0], at: next.mintedAt });
  store.appendEvent(L, { kind: 'PROPOSED_CHANGE', at: next.mintedAt, skillVersionHash: skill.skillVersionHash, proposal: statement, accepted: true,
    ...(feedbackIds.length ? { feedbackIds } : {}) });
  return { requirement: outcome.requirement, standard: next, supersedes: baseStandard.standardVersionHash, skillVersionHash: skill.skillVersionHash };
}
