// cli/commands/amend.ts — Editing a draft, sharpening a rule, answering a probe.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import {mkdirSync, existsSync} from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import { selectForProbing, prepareProbe, foldAnswer } from '../../core/discovery/run-probes.js';
import type { Budget } from '../../core/inference/client.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { authorityStateOf, assertSupersessionRecorded } from '../../core/state/canonical-state.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import { renderAgentSkill, assertPortable, defaultDescription } from '../../renderers/agent-skill/render.js';
import * as store from '../../core/state/store.js';

import { sha, DATA, die, argv, flag, MODEL, projectDir, pickHost, clientFor , numericFlag} from '../runtime.js';

// ── amend ───────────────────────────────────────────────────────────────────────────────────
/**
 * REWORD A RULE. MINTS A NEW StandardVersion, WITH A REASON.
 *
 * The store could confirm a rule and drop a rule and do nothing in between, which left the one
 * outcome a measurement campaign actually produces — "this rule is not stated well enough for anyone
 * to apply it consistently" — with no way to act on it except deleting the rule or hand-editing the
 * store. Hand-editing is the failure the whole architecture exists to prevent.
 *
 * This is an AUTHORITY path, not an optimizer path. It changes what good means, so it mints a new
 * StandardVersion carrying `supersedes` and the author's reason, exactly as `confirm` does. The
 * optimizer has no route here and never will: `improve` cannot reach this function.
 *
 * The reworded rule becomes EXPERT_AUTHORED — a person wrote these words, so the provenance stops
 * claiming the machine discovered them.
 */
export function amend(): void {
  const name = flag('--skill') ?? die('--skill required');
  const ruleId = flag('--rule') ?? die('--rule required');
  const statement = flag('--statement') ?? die('--statement "<the rule in your words>" required');
  const appliesWhen = flag('--applies-when');
  const reason = flag('--reason') ?? die('--reason required — a version history without reasons can be counted, not audited.');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash)!;
  const prev = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing.');
  const target = prev.requirements.find((r) => r.requirementId === ruleId) ?? die(`${ruleId} is not in ${prev.standardVersionHash}.`);

  const requirements = prev.requirements.map((r) => r.requirementId === ruleId
    ? { ...r, statement, appliesWhen: appliesWhen ?? r.appliesWhen,
        authority: 'EXPERT_AUTHORED' as const, provenance: 'SUBSTANTIVELY_REWRITTEN' as const }
    : r);
  const body = { evidenceId: prev.evidenceId, workType: prev.workType, requirements };
  const minted: StandardVersion = { standardVersionHash: sha(JSON.stringify(body)), ...body,
    authorityState: authorityStateOf(requirements), mintedAt: new Date().toISOString(),
    supersedes: prev.standardVersionHash, reason };
  assertSupersessionRecorded(minted);

  // THE HASH IS THE IDENTITY, SO THE FIRST MINT WINS.
  //
  // `mintedAt`, `supersedes` and `reason` sit OUTSIDE the hash, so re-minting identical content
  // produces a body that differs only by timestamp — and the store correctly refuses to let one
  // replace the other. Under content addressing they are the same version, so the stored one is
  // canonical. This also makes `amend` safely re-runnable after a partial write, which is how the
  // defect surfaced: an earlier attempt wrote the standard and then failed at the architecture step.
  //
  // The underlying issue is real and remains open: two DIFFERENT authority events over identical
  // requirements collapse to one identity, so a supersession chain cannot distinguish them. Recorded
  // as B11. This is the narrow, honest workaround, not the fix.
  const existing = store.getStandard(L, minted.standardVersionHash);
  const next: StandardVersion = existing ?? minted;
  if (existing) console.log(`(this exact standard already exists as ${existing.standardVersionHash}, minted ${existing.mintedAt} — reusing it rather than minting a duplicate identity)`);

  const arch = compileArchitecture(next);
  const desc = flag('--description') ?? sv.description ?? defaultDescription(next.workType);
  const pkg = renderAgentSkill(next, arch, name, desc);
  assertPortable(pkg);
  const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg.packageHash}`), skillName: name,
    standardVersionHash: next.standardVersionHash, architectureHash: arch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: desc };
  store.putStandard(L, next); store.putSkillVersion(L, skill); store.putArchitecture(L, arch);
  store.putPackage(L, pkg); store.setActive(L, skill.skillVersionHash);
  const inst = pickHost().install(pkg, projectDir());
  if (!inst.ok) return void die(`install failed: ${inst.reason}`);

  console.log(`\nAmended ${ruleId}.`);
  console.log(`  was: ${target.statement}`);
  console.log(`  now: ${statement}`);
  if (appliesWhen) console.log(`  applies when: ${target.appliesWhen}  ->  ${appliesWhen}`);
  console.log(`  authority ${target.authority} -> EXPERT_AUTHORED   (you wrote these words)`);
  console.log(`\nStandardVersion ${next.standardVersionHash} supersedes ${prev.standardVersionHash}`);
  console.log(`  reason: ${reason}`);
  console.log(`\nEvery measurement taken against ${prev.standardVersionHash} describes the OLD wording of ${ruleId}.`);
  console.log(`Labels for that rule do not carry over.`);
}


// ── sharpen ─────────────────────────────────────────────────────────────────────────────────
/**
 * ASK THE QUESTION DISCOVERY CANNOT ANSWER FOR ITSELF.
 *
 * Separate from `create` on purpose. Each probe writes three variants, so probing costs real money,
 * and a `create` that quietly spent six extra generations would be a cost surprise on the one command
 * a new user runs first. The standard works without this; it is just under-identified, and Atelier
 * says so rather than hiding it.
 *
 * There is no screen. This writes a markdown sheet and prints its path. Three 200-word passages in
 * terminal scrollback cannot be compared — you would be scrolling back and forth to hold them side by
 * side — and anyone running this already has an editor open next to it.
 */
export async function sharpen(): Promise<void> {
  const name = flag('--skill') ?? die('--skill required');
  const k = numericFlag('--questions', 2);
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash)!;
  const v = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing.');

  // Recurrence is not persisted per requirement yet, so ordering falls back to the discovery order,
  // which is the proposer's own confidence ranking. Declared here rather than silently assumed.
  const candidates = v.requirements.map((r, i) => ({
    requirementId: r.requirementId, statement: r.statement, appliesWhen: r.appliesWhen,
    recurrence: (v.requirements.length - i) / v.requirements.length }));
  const picked = selectForProbing(candidates, k);
  const brief = flag('--brief') ?? `Write a short piece of the kind this author writes (${v.workType}).`;

  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.0), maxCalls: numericFlag('--max-calls', 12) };
  const est = picked.length * 3 * 0.02;
  console.log(`\n${picked.length} question(s), 3 versions each = ${picked.length * 3} short generations, about $${est.toFixed(2)}.`);
  for (const c of picked) console.log(`  ${c.requirementId}  ${c.statement.slice(0, 78)}`);
  if (argv.includes('--dry-run')) { console.log('\n--dry-run: nothing generated.'); return; }

  const client = clientFor(flag('--model') ?? MODEL);
  const dir = join(DATA, 'skills', name, 'probes');
  mkdirSync(dir, { recursive: true });
  for (const [i, c] of picked.entries()) {
    const p = await prepareProbe(client, budget, c, brief, i + 1);
    const sheet = join(dir, `${c.requirementId}.md`);
    writeAtomic(sheet, p.blind.rendered);
    writeAtomic(join(dir, `${c.requirementId}.key.json`), JSON.stringify(p.blind, null, 1));
    console.log(`\n  ${c.requirementId}  ->  ${sheet}`);
  }
  console.log(`\nOpen the sheet(s), read the versions, then tell me which you would ship:`);
  console.log(`  atelier answer --skill ${name} --rule ${picked[0]?.requirementId ?? '<id>'} --pick <number>`);
  console.log(`  ...or --none if you would ship none of them, or --indifferent if two are equally fine.`);
  console.log(`\n($${budget.spentUsd.toFixed(3)})`);
}

// ── answer ──────────────────────────────────────────────────────────────────────────────────
/**
 * Fold one probe answer back into the standard.
 *
 * This is an AUTHORITY path: it can reword or narrow a rule, so it mints a new StandardVersion with
 * the reason recorded, exactly as `confirm` and `amend` do. What it may never do is invent a rule the
 * probe did not ask about.
 */
export function answerProbe(): void {
  const name = flag('--skill') ?? die('--skill required');
  const ruleId = flag('--rule') ?? die('--rule required');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const keyPath = join(DATA, 'skills', name, 'probes', `${ruleId}.key.json`);
  if (!existsSync(keyPath)) die(`no probe for ${ruleId}. Run: atelier sharpen --skill ${name}`);
  const blind = readJson<Parameters<typeof foldAnswer>[0]['blind']>(keyPath, { what: 'a probe key' });

  const pick = argv.includes('--none') ? { none: true }
    : argv.includes('--indifferent') ? { noPreference: blind.key.map((k) => k.tag) }
    : { shipped: flag('--pick') ?? die('--pick <number>, or --none, or --indifferent') };

  const activeHash = store.getActive(L) ?? die(`no active version for ${name}.`);
  const sv = store.getSkillVersion(L, activeHash)!;
  const prev = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing.');
  const target = prev.requirements.find((r) => r.requirementId === ruleId) ?? die(`${ruleId} is not in this standard.`);
  const out = foldAnswer({ requirementId: ruleId, statement: target.statement, blind, costUsd: 0 }, pick);

  console.log(`\n${out.meaning}`);
  console.log(`\n  ${out.consequence}`);
  switch (out.consequence) {
    case 'CONFIRMS':
      console.log(`  "${target.statement}" holds, and you preferred it in measure over both less and more.`);
      console.log(`\n  It is still DERIVED_UNRATIFIED — a probe is evidence, not authority. To make it yours:`);
      console.log(`    atelier confirm --skill ${name} --rule ${ruleId}`);
      break;
    case 'NARROWS':
      console.log(`  The rule does not bind in this context. That NARROWS its scope; it does not refute it.`);
      console.log(`\n  Sharpen the condition in your own words:`);
      console.log(`    atelier amend --skill ${name} --rule ${ruleId} --statement "..." --applies-when "..." --reason "probe: indifferent here"`);
      break;
    default:
      console.log(`  You wanted ${out.consequence === 'REWORD_WEAKER' ? 'LESS' : 'MORE'} of it than your examples suggested.`);
      console.log(`\n  The wording is yours to fix — Atelier will not rewrite what good means:`);
      console.log(`    atelier amend --skill ${name} --rule ${ruleId} --statement "..." --reason "probe: preferred ${out.consequence === 'REWORD_WEAKER' ? 'less' : 'more'}"`);
  }
  store.appendEvent(L, { kind: 'BOUNDARY_PROBE', at: new Date().toISOString(),
    skillVersionHash: activeHash, requirementId: ruleId, preferredLevel: out.label.preferredLevel, consequence: out.consequence });
}
