// atelier/renderers/agent-skill/render.ts — ONE STANDARD, ONE PORTABLE SKILL, MANY HOSTS.
//
// Claude Code, Codex, OpenClaw and the OpenAI Skills tool all consume the open Agent Skills format:
// a directory with SKILL.md plus optional references/ and scripts/. So there is no ClaudeSkill and no
// CodexSkill — there is one PortableSkillPackage, and adapters differ only in how they INSTALL it.
//
// ─── THE RESTRAINT THAT MAKES IT PORTABLE ─────────────────────────────────────────────────────
//
// Every host offers frontmatter fields and template variables the others do not. Using one is how a
// portable artifact quietly becomes a host artifact — it still renders everywhere, it just stops
// meaning the same thing. So the renderer emits ONLY `name` and `description`, and anything
// host-specific must be declared as an explicit adaptation the compiler chose, never a default.

import { createHash } from 'node:crypto';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { assertArchitectureServesStandard, type SkillArchitecture, type Carrier, type GateRole } from '../../core/architecture/compile.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * Normalise a skill identity. kebab-case works as a directory name on every host and as the suffix of
 * both `/name` and `$name`, so identity survives the move between them.
 */
export function skillNameFrom(raw: string): string {
  const n = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!n) throw new Error('SKILL NAME: empty after normalisation — supply a name with at least one alphanumeric character.');
  return n;
}

/** The only frontmatter keys guaranteed to mean the same thing on every host. */
export const PORTABLE_FRONTMATTER = ['name', 'description'] as const;

/** Carriers this renderer can actually honour. Anything else must refuse, not quietly degrade. */
const IMPLEMENTED_CARRIERS = new Set<Carrier>(['PROSE', 'SELF_CHECK', 'EXAMPLE', 'OUTPUT_CONTRACT', 'NONE']);

/**
 * A carrier the renderer cannot honour must FAIL, not fall through to prose.
 *
 * All five carriers render now, so this guard is a tripwire for the NEXT one rather than a live gate.
 * It stays because falling through is the worst available outcome: the architecture id and the
 * SkillVersion id would both move while the model read the same instructions, so an optimizer would
 * record an escalation it never received and a person would be shown "a repaired skill" that is the
 * old skill.
 *
 * Emitting the artefact is where this guard stops, and that is deliberately not the same as the
 * carrier reaching a model — see `core/delivery/carrier-delivery.ts` for the surface that answers
 * the second question, and for the reason one field could not answer both.
 */
function assertCarriersImplemented(carried: readonly { readonly r: { readonly requirementId: string }; readonly carrier: Carrier }[]): void {
  const unimplemented = carried.filter((x) => !IMPLEMENTED_CARRIERS.has(x.carrier));
  if (unimplemented.length) {
    const detail = unimplemented.map((x) => `${x.r.requirementId}:${x.carrier}`).join(', ');
    throw new Error(
      `CARRIER NOT IMPLEMENTED: ${detail}. This renderer honours ${[...IMPLEMENTED_CARRIERS].join(' and ')}. `
      + 'Rendering an unimplemented carrier as prose would change the architecture and SkillVersion ids '
      + 'while serving identical instructions — an escalation on the record that the model never saw.',
    );
  }
}

export interface PortableSkillPackage {
  /** conceptual identity — NOT invocation punctuation, which differs per host */
  readonly skillId: string;
  readonly standardVersionHash: string;
  /** which arrangement produced this. Two packages over one standard differ HERE. */
  readonly architectureHash: string;
  /**
   * What the model receives. Nothing else may be served.
   *
   * Kept apart from `assurance` because the separation is a correctness property, not tidiness: an
   * eval case in the model's context is a test whose answers the subject can read, and the result
   * would look like fidelity.
   */
  readonly runtime: Readonly<Record<string, string>>;
  /** Provenance and regression material. NEVER served. */
  readonly assurance: Readonly<Record<string, string>>;
  /** runtime only, preserved for callers that predate the split */
  readonly files: Readonly<Record<string, string>>;
  readonly packageHash: string;
}

/**
 * One row per requirement: what it became, where it landed, and whether it reached the model.
 *
 * This exists because an architecture hash moving is a CLAIM about served behaviour, and the claim
 * has been wrong before — a carrier changed, both ids moved, and the model read identical bytes. A
 * manifest that names the emitted artifact for each requirement makes that checkable by anyone,
 * without trusting the compiler's own account of itself.
 */
export interface ManifestRow {
  readonly requirementId: string;
  readonly materiality: string;
  readonly realizationTolerance: string;
  readonly carrier: Carrier;
  readonly gateRole: GateRole;
  /** the file it landed in, or null when the carrier is NONE */
  readonly artifact: string | null;
  /**
   * did the COMPILER emit a carrier for this requirement?
   *
   * Renamed from `served`, which was computed as `carrier !== 'NONE'` — that is, by checking that a
   * file had been produced. Emission is a build-time, host-independent fact and this field owns it.
   * Whether the carrier's semantics REACH the model is a different question with a different owner:
   * it depends on which surface runs the package, and it is answered by the host's delivery matrix.
   * One boolean cannot hold both, and trying made every OUTPUT_CONTRACT row read `served: true` while
   * generation ran against a hardcoded schema.
   */
  readonly emitted: boolean;
  /** the condition under which it is relevant — carried so a router can exclude it */
  readonly appliesWhen: string;
  readonly why: string;
}

/**
 * Render a standard THROUGH an architecture.
 *
 * The architecture is a parameter, not a derivation, and that is the whole change: the same standard
 * arranged differently produces a different skill, so an optimizer has something to improve that is
 * not the thing the expert authorized.
 *
 * ENFORCE components instruct the model while it writes. OBSERVE components are checked against the
 * finished draft and reported — never used to suppress or rewrite it.
 */
export function renderAgentSkill(
  v: StandardVersion,
  arch: SkillArchitecture,
  skillId: string,
  description: string,
): PortableSkillPackage {
  assertArchitectureServesStandard(arch, v);
  // SECTION ROUTING IS BY AUTHORITY AND KIND, NEVER BY COMPONENT ID.
  //
  // The first version keyed on an id prefix (`do:` / `avoid:` / `observe:`). That made the safety of
  // the output depend on a naming convention an optimizer is free to rename around: a transaction
  // that both escalated the role AND renamed the component would have walked an unconfirmed
  // prohibition straight into the instructions. The requirement's own kind and authority cannot be
  // renamed, so they decide where it lands.
  const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
  const carried = arch.components.flatMap((c) => c.carries.map((id) => ({ r: byId.get(id)!, role: c.gateRole, carrier: c.carrier })))
    .filter((x) => x.r);

  assertCarriersImplemented(carried);

  // A NONE carrier reaches the model nowhere. Without this filter an INCIDENTAL requirement — one
  // the expert LOOKED AT and declared not to be taste — still landed in the observe section, which
  // is the instruction they declined to give, delivered by a different door.
  const serves = carried.filter((x) => x.carrier !== 'NONE');
  // AND AN OUTPUT_CONTRACT DOES NOT ALSO BECOME AN INSTRUCTION.
  //
  // EXAMPLE was already excluded from its section for this reason and OUTPUT_CONTRACT was not, so a
  // rule whose carrier is a schema was ALSO restated in the prose. Two owners of one shape, and the
  // compiler's own rationale for choosing the carrier says why that is wrong: "prose describing a
  // schema is a weaker version of the schema", chosen so "the runtime enforces it rather than the
  // instructions asking for it".
  //
  // The consequence was worse than redundancy. On a host that cannot enforce the schema, the rule was
  // still quietly present as an instruction — the silent degradation to prose that the delivery matrix
  // reports as UNSUPPORTED. The report was right and the bytes disagreed with it.
  //
  // Removing it means that on such a host NOTHING carries this rule, which is the honest outcome and
  // exactly what UNSUPPORTED says. What to do about that is the author's call, made with the matrix in
  // front of them, not a decision the renderer makes for them by smuggling the rule back in.
  const gen = serves.filter((x) => x.role === 'ENFORCE' && x.r.kind === 'GENERATIVE' && x.carrier !== 'OUTPUT_CONTRACT').map((x) => x.r);
  const bound = serves.filter((x) => x.role === 'ENFORCE' && x.r.kind === 'BOUNDARY').map((x) => x.r);
  // EXAMPLE components are shown in their own files, not restated in the observe pass.
  const observed = serves.filter((x) => x.role === 'OBSERVE' && x.carrier !== 'EXAMPLE').map((x) => x.r);

  // ESCALATION IS CUMULATIVE, NOT SUBSTITUTIVE.
  //
  // These requirements are ALREADY in `gen` or `bound` above and stay there. SELF_CHECK adds a
  // pre-finalize check on top of the generation instruction; it does not move the rule out of the
  // instructions. The historical compiler chose the other way — `editFor` in
  // The skill writer in the private predecessor returns METHODOLOGY_PROSE *or* SECTION_CONTRACT,
  // never both — and inheriting that here would demote a rule from "shape the writing" to "notice
  // afterwards" while calling it an escalation. A carrier may buy MORE support for a requirement.
  // It may never buy less.
  const preFinalize = serves.filter((x) => x.role === 'ENFORCE' && x.carrier === 'SELF_CHECK').map((x) => x.r);

  const line = (r: typeof v.requirements[number], i: number): string => {
    const cond = /^GENERAL\b/i.test(r.appliesWhen.trim()) ? '' : `\n   Applies when: ${r.appliesWhen}`;
    const prov = r.provenance === 'MACHINE_DISCOVERED' ? 'discovered' : r.provenance === 'EXPERT_ADDED' ? 'added by you' : 'rewritten by you';
    return `${i + 1}. ${r.statement}${cond}\n   <!-- ${r.requirementId} · ${prov} -->`;
  };

  const avoidSection = bound.length
    ? `\n## What not to do\n\n${bound.map(line).join('\n\n')}\n`
    : '';

  // ENFORCE + SELF_CHECK: the rule is confirmed, so the check MAY act on the draft.
  //
  // This is a different section from the OBSERVE pass below, and the separation is the point. One
  // section cannot hold both without either licensing revision on a prohibition nobody confirmed —
  // the exact escalation the authority seam exists to refuse — or forbidding it on a rule the
  // author stands behind, which would make the escalation buy nothing.
  const preFinalizeSection = preFinalize.length
    ? `\n## Before you finalize\n\nYou were told these while writing. Now read the draft back against them one at a time. Where the\ndraft does not meet one, REVISE it so that it does, then continue.\n\n${preFinalize.map(line).join('\n\n')}\n`
    : '';

  // OBSERVE lands AFTER the draft exists, in its own pass, and says so. A prohibition nobody has
  // confirmed must not quietly shape the writing — if it is wrong it would suppress something and
  // leave no trace that it did.
  const observeSection = observed.length
    ? `\n## After you have written it, check yourself\n\nThese are patterns inferred from the author's work that NO ONE HAS CONFIRMED yet. Do not let them\nshape what you write. Once the draft is finished, read it back and note briefly whether any of them\napply. Report what you find and leave the draft as it is.\n\n${observed.map(line).join('\n\n')}\n`
    : '';

  // ── REFERENCE MATERIAL, NAMED FROM SKILL.md ────────────────────────────────────────────────
  //
  // Examples used to be written to `examples/*.md` and never mentioned anywhere the model would read.
  // On Atelier's own invocation path that was fine — it composes the files into the payload itself.
  // On a host's native path it was the old bug in a new place: the artefact existed, the manifest said
  // so, and the host had no reason to open it.
  //
  // A host that reads further material does so when the instructions point at it. So SKILL.md names each
  // file and the condition it applies under, which also carries the routing that `context-map.json`
  // holds — a condition stated where the reader is, rather than in a sidecar only Atelier parses.
  //
  // This makes the file REFERENCED. It does not make it read, and the host capability matrix says
  // REFERENCED_UNVERIFIED for exactly that reason.
  //
  // The OUTPUT CONTRACT is deliberately NOT referenced here. Restating a schema as an instruction is
  // the weaker version of the schema — half-satisfiable with nothing noticing — and swapping a runtime
  // guarantee for a request is the substitution the carrier exists to prevent. Where a host cannot
  // enforce it, the honest report is UNSUPPORTED, not a paragraph.
  const exampleCarried = carried.filter((x) => x.carrier === 'EXAMPLE');
  const always = (r: { appliesWhen: string }): boolean => /^GENERAL\b/i.test(r.appliesWhen.trim());
  const referenceSection = exampleCarried.length
    ? `\n## Reference material\n\nEach file below shows how the author actually did one of these. Read a file when its condition\napplies to what you are writing; they are instances, not extra instructions.\n\n`
      + exampleCarried.map((x) => `- \`examples/${x.r.requirementId}.md\` — `
        + (always(x.r) ? 'relevant to any piece of this kind' : `when ${x.r.appliesWhen}`)).join('\n') + '\n'
    : '';

  const skillMd = `---
name: ${skillId}
description: ${description}
---

# ${skillId}

Write as the author of the standard below. Apply it as judgment, not as a checklist — including
knowing when a rule does not apply.

## What to do

${gen.map(line).join('\n\n') || '_(none)_'}
${avoidSection}${preFinalizeSection}${observeSection}${referenceSection}
---

<!--
Atelier materialization. Do not edit this file to change the standard.
This is a compiled output; the authority record is StandardVersion ${v.standardVersionHash}.
Editing here changes what is served without changing what was ratified, and the two would silently diverge.

Two different things can change, and they are not the same command:
  the IMPLEMENTATION — how this is arranged so a model reproduces the standard reliably.
    atelier improve  keeps this StandardVersion and mints a new SkillVersion.
  the STANDARD — what the author means by good.
    atelier confirm  rules on one inferred rule and mints a new StandardVersion, with a reason.

standardVersion: ${v.standardVersionHash}
architecture:    ${arch.architectureHash} (${arch.components.length} component(s))
workType:        ${v.workType}
requirements:    ${v.requirements.length} — ${gen.length} enforced, ${bound.length} confirmed boundary, ${observed.length} observed-only
authority:       ${v.authorityState}
mintedAt:        ${v.mintedAt}
-->
`;
  // ── EXAMPLES ────────────────────────────────────────────────────────────────────────────────
  //
  // One file per requirement rather than one file of examples, so a router can serve the two that
  // apply to a task and leave the other nine unread. Framed as "how the author did it, and an output
  // that does otherwise is not wrong" — which is the entire difference between PREFERRED and
  // REQUIRED, and is unsayable in a document whose every line reads as instruction.
  const exampleFiles: Record<string, string> = {};
  for (const x of exampleCarried) {
    const r = x.r;
    const binding = r.materiality === 'REQUIRED'
      ? 'This IS required, and the form shown is the point — the author said the exact realization matters.'
      : 'This is NOT required. It is how the author works. An output that does otherwise is not wrong;\nreach for this when it fits, and do not force it.';
    exampleFiles[`examples/${r.requirementId}.md`] =
      `# ${r.requirementId}\n\n${r.statement}\n\n`
      + (/^GENERAL\b/i.test(r.appliesWhen.trim()) ? '' : `**Applies when:** ${r.appliesWhen}\n\n`)
      + `${binding}\n\n`
      // THE COUNTERFACTUAL IS NOT SERVED, AND THIS IS THE PLACE IT NEARLY WAS.
      //
      // `wouldBeAbsentIf` is a machine-proposed falsifying statement whose whole job is to give the
      // AUTHOR something to disagree with at ratification. It is not a second ratified requirement.
      // Rendering it here reads as "avoid X" and would hand an unratified sentence the same carrier
      // as a ratified one — the precise escalation the authority seam exists to refuse.
      + (r.evidence ? `## How the author did it\n\n> ${r.evidence.replace(/\n/g, '\n> ')}\n` : '');
  }

  // ── OUTPUT CONTRACTS ────────────────────────────────────────────────────────────────────────
  //
  // A schema, not prose about a schema. Where the runtime can hold the shape, asking the model to
  // hold it is strictly weaker — it can be half-satisfied and nothing notices.
  const contractCarried = carried.filter((x) => x.carrier === 'OUTPUT_CONTRACT');
  const contractFiles: Record<string, string> = {};
  if (contractCarried.length) {
    const props: Record<string, unknown> = {};
    for (const x of contractCarried) Object.assign(props, x.r.outputShape ?? {});
    contractFiles['contracts/output.schema.json'] = `${JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: `${skillId} output`,
      description: 'Enforced by the runtime. The instructions do not restate it.',
      type: 'object', properties: props,
      required: Object.keys(props), additionalProperties: false,
    }, null, 2)}\n`;
  }

  // ── CONTEXT MAP ─────────────────────────────────────────────────────────────────────────────
  //
  // Deterministic, and deliberately not a semantic router. It records the condition each component
  // already carries so a runtime can exclude what plainly does not apply. Having `appliesWhen` text
  // is not the same as routing on it, and this is the smallest thing that is actually routing.
  const conditional = carried.filter((x) => !/^GENERAL\b/i.test(x.r.appliesWhen.trim()) && x.carrier !== 'NONE');
  const contextMap: Record<string, string> = conditional.length ? { 'context-map.json': `${JSON.stringify({
    note: 'Serve a component when its condition holds. Unconditional components always serve.',
    components: conditional.map((x) => ({ requirementId: x.r.requirementId, carrier: x.carrier,
      artifact: x.carrier === 'EXAMPLE' ? `examples/${x.r.requirementId}.md` : 'SKILL.md',
      appliesWhen: x.r.appliesWhen })),
  }, null, 2)}\n` } : {};

  const runtime: Record<string, string> = { 'SKILL.md': skillMd, ...exampleFiles, ...contractFiles, ...contextMap };

  // ── MANIFEST + ASSURANCE ────────────────────────────────────────────────────────────────────
  const artifactFor = (c: Carrier, id: string): string | null =>
    c === 'NONE' ? null
      : c === 'EXAMPLE' ? `examples/${id}.md`
        : c === 'OUTPUT_CONTRACT' ? 'contracts/output.schema.json' : 'SKILL.md';
  const rows: ManifestRow[] = carried.map((x) => ({
    requirementId: x.r.requirementId,
    materiality: x.r.materiality ?? 'UNDECLARED',
    realizationTolerance: x.r.realizationTolerance ?? 'UNDECLARED',
    carrier: x.carrier, gateRole: x.role,
    artifact: artifactFor(x.carrier, x.r.requirementId),
    emitted: x.carrier !== 'NONE',
    appliesWhen: x.r.appliesWhen,
    why: x.carrier === 'NONE' ? 'the author ratified this as not taste; nothing is served for it'
      : `carried as ${x.carrier} under gate role ${x.role}`,
  }));
  const assurance: Record<string, string> = {
    'assurance/manifest.json': `${JSON.stringify({
      skillId, standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash,
      workType: v.workType, authorityState: v.authorityState,
      runtimeFiles: Object.keys(runtime).sort(),
      requirements: rows,
      emittedCount: rows.filter((r) => r.emitted).length,
      notEmittedCount: rows.filter((r) => !r.emitted).length,
      note: 'Every requirement appears exactly once. An architecture hash that moved without a row '
        + 'moving is a claim about served behaviour that the bytes do not support. `emitted` says the '
        + 'compiler produced a carrier; it does NOT say the carrier reached a model. Which carriers a '
        + 'given surface delivers is that surface\'s claim, not this file\'s.',
    }, null, 2)}\n`,
  };

  return { skillId, standardVersionHash: v.standardVersionHash, architectureHash: arch.architectureHash,
    runtime, assurance, files: runtime, packageHash: sha(JSON.stringify(runtime)) };
}

/** Refuses a package that has picked up host-only frontmatter. */
export function assertPortable(pkg: PortableSkillPackage): void {
  const md = pkg.files['SKILL.md'] ?? '';
  const fm = md.split('---')[1] ?? '';
  const keys = fm.split('\n').map((l) => l.split(':')[0]?.trim()).filter((k): k is string => !!k);
  const foreign = keys.filter((k) => !(PORTABLE_FRONTMATTER as readonly string[]).includes(k));
  if (foreign.length) {
    throw new Error(
      `PORTABILITY: SKILL.md declares host-specific frontmatter (${foreign.join(', ')}). Only ` +
      `${PORTABLE_FRONTMATTER.join(', ')} mean the same thing on every host. A key one host ignores is a ` +
      'key that silently changes behaviour when the standard moves — which is the thing the standard is for.',
    );
  }
  if (/\$\{[A-Z_]+\}/.test(md)) {
    throw new Error('PORTABILITY: SKILL.md contains a host template variable. It would expand on one host and remain literal on another.');
  }
}
