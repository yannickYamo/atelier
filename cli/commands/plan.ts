// cli/commands/plan.ts — WHAT ATELIER DECIDED ABOUT EACH RULE, AND WHY.
//
// A compiled skill is a set of per-requirement decisions: where each rule lives so a model follows
// it, whether anything watches it afterwards, whether it instructs or is merely shown. Those
// decisions were already being made and already being recorded — `componentFor` is deterministic and
// required to state a reason, and the renderer writes every row to `assurance/manifest.json`.
//
// Nothing surfaced any of it. A person could read the compiled SKILL.md and see the prose, which is
// the one carrier that looks like what they wrote; they could not see that one rule became an output
// contract the runtime enforces, another became an example nobody is instructed to follow, and a
// third reached nothing at all because they ratified it as not taste.
//
// That difference is the product. A generated SKILL.md is a file a model wrote. This is a record of
// what was engineered and on whose authority, and it is READ from what was built rather than
// recomputed — recomputing would show what today's compiler WOULD do, which is a different claim
// from what the installed skill actually is.

import * as store from '../../core/state/store.js';
import { DATA, die, flag } from '../runtime.js';
import { applicabilityModeOf, sourceModeOf, type Requirement } from '../../core/state/canonical-state.js';
import { obligationsForStandard, coverageOf } from '../../core/contract/obligation.js';

/** One row of `assurance/manifest.json`, as the renderer writes it. */
interface ManifestFile {
  readonly requirements: readonly {
    readonly requirementId: string;
    readonly carrier: string;
    readonly gateRole: string;
    readonly emitted: boolean;
    readonly artifact: string | null;
    readonly why: string;
  }[];
}

const SOURCE: Readonly<Record<Requirement['provenance'], string>> = {
  EXPERT_ADDED: 'you wrote it',
  MACHINE_DISCOVERED: 'found in the work',
  SUBSTANTIVELY_REWRITTEN: 'found, then reworded',
  PUBLIC_BEHAVIOUR_INFERRED: 'inferred from public work',
};

const APPLICABILITY: Readonly<Record<string, string>> = {
  GENERAL: 'everywhere',
  CONDITION_PRESENT: 'on a condition',
  UNRESOLVED: 'unstated',
};

export function plan(): void {
  const name = flag('--skill') ?? die('--skill <name> required');
  const L: store.StoreLayout = { root: DATA, skillName: name };

  const active = store.getActive(L) ?? die(`no built skill called "${name}". Run \`atelier build --name ${name}\` first.`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing from the store.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing from the store.`);
  const pkg = store.getPackage(L, sv.materializedHash) ?? die(`package ${sv.materializedHash} is missing from the store.`);

  const raw = pkg.assurance?.['assurance/manifest.json']
    ?? die(`the package for "${name}" carries no manifest, so what was decided per requirement `
      + `cannot be read back. Rebuild it:  atelier build --name ${name}`);
  const manifest = JSON.parse(raw) as ManifestFile;
  const rows = new Map(manifest.requirements.map((r) => [r.requirementId, r]));

  console.log(`plan for ${name}  ·  SkillVersion ${active}  ·  StandardVersion ${v.standardVersionHash}`);
  console.log(`${v.requirements.length} requirement(s), authored ${sourceModeOf(v).toLowerCase()}\n`);

  const w = { id: 4, src: 24, app: 15, car: 16, gate: 10 };
  console.log(`${'id'.padEnd(w.id)} ${'source'.padEnd(w.src)} ${'applies'.padEnd(w.app)} `
    + `${'carrier'.padEnd(w.car)} ${'watched'.padEnd(w.gate)} reaches the model`);
  console.log('-'.repeat(96));

  for (const r of v.requirements) {
    const m = rows.get(r.requirementId);
    // A requirement with no manifest row is the defect the manifest exists to expose: the
    // architecture claims to carry it and the emitted bytes do not mention it.
    const carrier = m?.carrier ?? 'NO MANIFEST ROW';
    const gate = m?.gateRole === 'ENFORCE' ? 'instructs' : m?.gateRole === 'OBSERVE' ? 'watched' : '—';
    const reaches = m?.emitted ? (m.artifact ?? 'yes') : 'nothing is served for it';
    console.log(`${r.requirementId.padEnd(w.id)} ${SOURCE[r.provenance].padEnd(w.src)} `
      + `${(APPLICABILITY[applicabilityModeOf(r.appliesWhen)] ?? '?').padEnd(w.app)} `
      + `${carrier.padEnd(w.car)} ${gate.padEnd(w.gate)} ${reaches}`);
  }

  // The conditions and the reasons are the two things a table cannot hold without becoming
  // unreadable, and they are the two a person most often wants next.
  const conditional = v.requirements.filter((r) => applicabilityModeOf(r.appliesWhen) === 'CONDITION_PRESENT');
  if (conditional.length) {
    console.log('\nconditions:');
    for (const r of conditional) console.log(`  ${r.requirementId}  ${r.appliesWhen}`);
  }

  const unserved = v.requirements.filter((r) => !rows.get(r.requirementId)?.emitted);
  if (unserved.length) {
    console.log(`\n${unserved.length} requirement(s) reach the model through nothing:`);
    for (const r of unserved) console.log(`  ${r.requirementId}  ${rows.get(r.requirementId)?.why ?? 'no manifest row'}`);
  }

  // ── WHAT THE STANDARD OBLIGES ANY IMPLEMENTATION TO DO ────────────────────────────────────────
  //
  // Derived from the standard with no model consulted, so this is available offline and says
  // something the carrier table cannot: how much of what you wrote can be checked automatically.
  // Usually the answer is "very little", and that is the honest starting point rather than a
  // disappointment — a rule with no machine-checkable shape has no qualified observer, and saying so
  // is what stops a semantic guess later being mistaken for a measurement.
  const obligations = obligationsForStandard(v);
  const cov = coverageOf(v);
  const automatic = obligations.filter((o) => o.observation === 'DETERMINISTIC').length;
  console.log(`\nobligations: ${obligations.length} across ${v.requirements.length} requirement(s)`
    + `  ·  ${automatic} checkable without judgment  ·  ${obligations.length - automatic} need a person or an unqualified reader`);
  for (const c of cov) {
    if (c.obligationCount === 0) {
      console.log(`  ${c.requirementId}  none — nothing is served for it, so there is nothing to require`);
    } else {
      console.log(`  ${c.requirementId}  ${c.obligationCount} obligation(s), ${c.automaticallyObservable} automatic`);
    }
  }
  const interactions = obligations.filter((o) => o.kind === 'INTERACTION');
  if (interactions.length) {
    console.log(`  ${interactions.length} interaction(s) where two rules meet — the place skills usually fail`);
  }

  const withPrereqs = v.requirements.filter((r) => (r.prerequisites?.length ?? 0) > 0);
  if (withPrereqs.length) {
    console.log('\nneeds bound before it can execute truthfully:');
    for (const r of withPrereqs) {
      for (const p of r.prerequisites ?? []) console.log(`  ${r.requirementId}  ${p.kind} ${p.name} — ${p.why}`);
    }
  }

  if (flag('--json')) {
    console.log(`\n${JSON.stringify({ skill: name, skillVersionHash: active,
      standardVersionHash: v.standardVersionHash, sourceMode: sourceModeOf(v),
      rows: v.requirements.map((r) => ({
        requirementId: r.requirementId, provenance: r.provenance,
        applicabilityMode: applicabilityModeOf(r.appliesWhen), appliesWhen: r.appliesWhen,
        carrier: rows.get(r.requirementId)?.carrier ?? null,
        gateRole: rows.get(r.requirementId)?.gateRole ?? null,
        emitted: rows.get(r.requirementId)?.emitted ?? false,
        why: rows.get(r.requirementId)?.why ?? null,
      })) }, null, 1)}`);
  }
}
