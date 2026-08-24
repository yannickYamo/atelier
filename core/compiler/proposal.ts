// atelier/core/compiler/proposal.ts — WHAT WOULD CHANGE, WHAT WOULD NOT, AND WHY.
//
// PORTED IN STRUCTURE from the skill proposer in the private predecessor. Its three obligations are
// carried over verbatim in spirit; its vocabulary is NOT, and that is the whole story of this port.
//
// ─── ONE PROPERTY, THREE OWNERS — WHY THIS IS NOT A COPY ───────────────────────────────────────
//
// "Which carrier holds this requirement" is declared in three places, with three different closed
// sets and two different semantics:
//
//   its compilation-need enum      PROSE_ONLY | SCAFFOLD | HUMAN_AUTHORITY
//   its IR carrier enum            PROSE | METHODOLOGY | SCAFFOLD | EXAMPLE |
//                                                      ROUTING | OUTPUT_CONTRACT | TOOL_CONTRACT |
//                                                      VOCABULARY | HUMAN_AUTHORITY
//   atelier/core/architecture/compile.ts:48            PROSE | SELF_CHECK | EXAMPLE | OUTPUT_CONTRACT
//
// `skill-proposal.ts` keys its phrase tables off the first. Porting it as written would import a
// second vocabulary into a package that already has one, and then require a translation table
// between them — and the two disagree on more than names. The historical carriers are SUBSTITUTIVE
// (`skill-writer.ts:55` returns exactly ONE edit per requirement, so SCAFFOLD replaces the prose);
// Atelier's are CUMULATIVE by a deliberate correction, because substituting a self-check for a
// generation instruction moves a rule from *shape the writing* to *notice afterwards* and calls the
// weakening an escalation.
//
// So the LAWS port and the VOCABULARY does not. Atelier's Carrier is the one owner: it is the set
// that is live, served, and behaviourally verified. A translation layer here would be a fourth
// place where this property is decided.
//
// ─── AND CONFIDENCE IS ALREADY OWNED TOO ───────────────────────────────────────────────────────
//
// The original ranks a rule by `FactorPriority` (CORE/IMPORTANT/CONTEXTUAL/ADVISORY), a discovery-
// side score. Atelier already answers that question with `Authority` — who stands behind this rule —
// which is both stronger and the thing the user is actually being asked about. Importing a priority
// scale beside it would give the same "how much should I trust this" two owners.
//
// NOTHING CHANGES WITHOUT HUMAN APPROVAL. This module emits a PROPOSAL. It does not write skills.
//
// Pure module — zero I/O, no LLM.

import type { Requirement, Authority } from '../state/canonical-state.js';
import type { Carrier, Sensor, GateRole, ArchitectureComponent, SkillArchitecture } from '../architecture/compile.js';

/** The machinery's terms are ours. The user reads these. Translation, never concealment. */
const CARRIER_PHRASE: Record<Carrier, string> = {
  PROSE: 'stated as an instruction while it writes',
  SELF_CHECK: 'checked against the finished draft',
  EXAMPLE: 'shown by example',
  OUTPUT_CONTRACT: 'built into the shape of the output',
  NONE: 'nothing is served for it — the author said it is not taste',
};

const ROLE_PHRASE: Record<GateRole, string> = {
  ENFORCE: 'it shapes what gets written',
  OBSERVE: 'it reports, and never changes your draft',
};

const SENSOR_PHRASE: Record<Sensor, string> = {
  NONE: 'nothing watches it afterwards',
  SELF_REPORT: 'the skill tells you whether it held',
};

const AUTHORITY_PHRASE: Record<Authority, string> = {
  EXPERT_RATIFIED: 'you confirmed this',
  EXPERT_AUTHORED: 'you wrote this',
  DERIVED_UNRATIFIED: 'we inferred this and you have not confirmed it',
  USER_ADOPTED: 'you chose to use this, from work you did not write',
  EXPERT_REJECTED: 'you rejected this',
};

export interface ProposedRule {
  readonly requirementId: string;
  /** the rule in the user's words */
  readonly text: string;
  readonly authority: Authority;
  readonly carrier: Carrier;
  readonly sensor: Sensor;
  readonly gateRole: GateRole;
  readonly rationale: string;
  /** true when the skill being improved already carries this adequately */
  readonly alreadyHandled: boolean;
}

export type ProposalOutcome =
  /** changes are justified and listed */
  | 'CHANGES_PROPOSED'
  /** the existing skill already preserves the standard — a success, not a failure */
  | 'NO_CHANGE_JUSTIFIED';

export interface SkillProposal {
  readonly skillName: string;
  readonly standardVersionHash: string;
  readonly outcome: ProposalOutcome;
  readonly changes: readonly ProposedRule[];
  /** left alone deliberately, with the reason — a first-class part of the output */
  readonly deliberatelyUnchanged: readonly ProposedRule[];
  /** what the proposal does NOT rest on */
  readonly unresolved: readonly string[];
}

/**
 * A rule changes the skill iff the skill does not already carry it.
 *
 * The CARRIER is deliberately not part of this test. A rule the skill does not yet state is a change
 * even when it compiles to the leanest carrier — prose still has to be written. Carrier decides HOW
 * a change lands, never WHETHER there is one.
 */
const isChange = (r: ProposedRule): boolean => !r.alreadyHandled;

/**
 * Build the proposal from a compiled architecture.
 *
 * `alreadyHandled` is a REQUIRED input, with no default, and that is deliberate. Whether an existing
 * skill already carries a rule is a judgement about prose, and every cheap way to answer it is a
 * wording proxy (see `run-methods.ts`, where exactly that proxy produced false alarms on a real
 * skill). Defaulting it either way would bury that judgement: default false and a CREATE run reports
 * every rule as a change, which is true; default false on an IMPROVE run and we claim the user's
 * skill carries nothing, which is a strong assertion nobody made. So the caller must supply it and
 * say how it was decided.
 */
export function buildProposal(
  skillName: string,
  standardVersionHash: string,
  requirements: readonly Requirement[],
  architecture: SkillArchitecture,
  alreadyHandled: ReadonlySet<string>,
  unresolved: readonly string[] = [],
): SkillProposal {
  const componentFor = new Map<string, ArchitectureComponent>();
  for (const c of architecture.components) for (const id of c.carries) componentFor.set(id, c);

  const rules: ProposedRule[] = [];
  for (const r of requirements) {
    // NO REJECTED-REQUIREMENT FILTER HERE, DELIBERATELY. The first draft had one, and it was a
    // second owner of a rule `compileArchitecture` already enforces: `assertNothingRejectedIsServed`
    // (compile.ts:173) THROWS on a standard carrying one, so an architecture cannot exist for a
    // rejected rule and this function cannot be reached with one. A defensive skip here would be
    // dead on the real path and, on any other path, would silently hide the violation the upstream
    // guard exists to shout about.
    const c = componentFor.get(r.requirementId);
    if (!c) continue;                                   // carried by nothing — reported by the compiler, not here
    rules.push({
      requirementId: r.requirementId, text: r.statement, authority: r.authority,
      carrier: c.carrier, sensor: c.sensor, gateRole: c.gateRole, rationale: c.rationale,
      alreadyHandled: alreadyHandled.has(r.requirementId),
    });
  }

  const changes = rules.filter(isChange);
  return {
    skillName, standardVersionHash,
    outcome: changes.length === 0 ? 'NO_CHANGE_JUSTIFIED' : 'CHANGES_PROPOSED',
    changes, deliberatelyUnchanged: rules.filter((r) => !isChange(r)), unresolved,
  };
}

/** One line of plain-language justification for where a rule landed. */
export function explainPlacement(r: ProposedRule): string {
  return `${CARRIER_PHRASE[r.carrier]} — ${ROLE_PHRASE[r.gateRole]}; ${SENSOR_PHRASE[r.sensor]}`;
}

/**
 * Render the proposal a user reads before approving.
 *
 * The NO_CHANGE branch is not a courtesy. Without a first-class refusal state every run gets
 * pressured toward proposing something, which is the failure we diagnose in other systems — an
 * optimizer rewarded for changing things will always find something to change.
 */
export function renderProposal(p: SkillProposal, opts: { readonly gated?: boolean } = {}): string {
  const head = `# Proposed changes to **${p.skillName}**\n\n`;

  if (p.outcome === 'NO_CHANGE_JUSTIFIED') {
    let s = head
      + `## No changes are justified.\n\n`
      + `Your examples did not reveal anything your current skill fails to preserve. That is a real\n`
      + `result, not an empty one: adding rules it already follows would cost you complexity and buy\n`
      + `no reliability. We looked at ${p.deliberatelyUnchanged.length} rule(s) and each is already carried.\n\n`;
    if (p.deliberatelyUnchanged.length) {
      s += `### What we checked and left alone\n\n`;
      for (const r of p.deliberatelyUnchanged) s += `- **${r.text}** — ${explainPlacement(r)}\n`;
      s += `\n`;
    }
    if (p.unresolved.length) s += `### Still open\n\n${p.unresolved.map((u) => `- ${u}\n`).join('')}\n`;
    return s;
  }

  let s = head + `## What we would change\n\n`;
  for (const r of p.changes) {
    s += `### ${r.text}\n\n`
      + `- **Where it goes:** ${explainPlacement(r)}\n`
      + `- **Why there:** ${r.rationale}\n`
      + `- **Who stands behind it:** ${AUTHORITY_PHRASE[r.authority]}\n\n`;
  }

  if (p.deliberatelyUnchanged.length) {
    s += `## What we would deliberately NOT change\n\n`
      + `Rules your examples support, which your skill already carries. Leaving them alone is the\n`
      + `point: every rule we add has to earn its place.\n\n`;
    for (const r of p.deliberatelyUnchanged) s += `- **${r.text}** — ${explainPlacement(r)}\n`;
    s += `\n`;
  }

  if (p.unresolved.length) {
    s += `## What this proposal does NOT rest on\n\n`
      + `Still unresolved, and deliberately not built into the change:\n\n`
      + p.unresolved.map((u) => `- ${u}\n`).join('') + `\n`;
  }

  // THE FOOTER MUST MATCH WHAT ACTUALLY HAPPENS NEXT.
  //
  // The original ends "Nothing changes until you approve it", which was true when a human promoted
  // every candidate. That was a temporary safety constraint, not the target: the human ratifies what
  // GOOD MEANS, and which implementation best reproduces it is the machine's to own. On the routine
  // path this document is therefore a RECORD of a decision already taken, and printing an approval
  // promise over it would state something untrue in the one artifact whose job is to be inspectable.
  return `${s}---\n\n${opts.gated
    ? 'Nothing changes until you approve it.'
    : 'This is a record of what changed and why. Your standard was not touched — run `atelier history` to see every version, or `atelier rollback` to go back.'}\n`;
}

/**
 * The unconfirmed rules a proposal would install, named so the approval is informed.
 *
 * Discovery produces rules nobody has looked at. They are legitimately part of a standard — the
 * ratification gate was removed on purpose — but a user approving a change should be told which
 * parts of it rest on a guess, in the same breath as the change itself.
 */
export function unconfirmedIn(p: SkillProposal): readonly string[] {
  return p.changes.filter((r) => r.authority === 'DERIVED_UNRATIFIED').map((r) => r.text);
}
