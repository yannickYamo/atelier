// atelier/core/state/canonical-state.ts — THE CANONICAL STATE IS OURS, NOT THE HOST'S.
//
// Five host-independent objects carry everything. Claude Code's SKILL.md is a COMPILED MATERIALIZATION
// of these — an output, never an input.
//
// ─── THE RULE THAT MAKES PORTABILITY REAL ─────────────────────────────────────────────────────
//
// A generated SKILL.md must NEVER be read back as authority while a StandardVersion exists. The moment
// it is, the host's file format becomes the source of truth, a second adapter means a second standard,
// and "the optimizer may not redefine what the human ratified" becomes unenforceable — because anyone
// editing the materialization would be editing the standard.
//
// This is the same defect the compiler work found earlier at a different layer: reading an authored file
// as evidence of what is served. Here it would be reading a served file as evidence of what was ratified.

import type { RuntimeBinding, ObservedRuntime } from '../runtime/binding.js';
import type { Prerequisite } from './prerequisite.js';
// ALIASED, because two unrelated things in this codebase are called `Provenance`. The one declared
// below says where a REQUIREMENT came from (discovered, rewritten, added, inferred from public work).
// This one says why an INVOCATION was made (organic use, dev probe, stress probe). They share no
// values. An inline `import()` was hiding the collision at the one place both are in scope.
import type { Provenance as InvocationProvenance } from '../fidelity/provenance.js';

/**
 * Who stands behind a requirement.
 *
 * `EXPERT_REJECTED` exists because "the expert looked and said no" and "nobody has looked yet" were
 * the same value until the ratification gate came out. While every unconfirmed rule was dropped at
 * build, the conflation was invisible. The moment unconfirmed rules reach the standard, it stops
 * being invisible: without the distinction, a rule the author explicitly refused would come back.
 */
export type Authority =
  /** the expert whose standard this is confirmed it */
  | 'EXPERT_RATIFIED'
  /** the expert wrote it themselves */
  | 'EXPERT_AUTHORED'
  /** the expert looked at it and said no */
  | 'EXPERT_REJECTED'
  /**
   * A USER adopted a behaviour inferred from someone ELSE's work, for their own skill.
   *
   * Two different facts, and only one of them is the user's to assert:
   *   "I want this behaviour in the skill I am building."   — theirs
   *   "This is definitively part of that author's standard." — not theirs, and never obtainable
   *                                                            from a corpus
   *
   * Without this value the two collapse. Adopting a rule read off a third party's public writing
   * would have to be recorded as EXPERT_RATIFIED, which asserts something about a person who was
   * never asked. The source provenance stays PUBLIC_BEHAVIOUR_INFERRED for the life of the rule;
   * adoption records who chose to use it, and rewrites nothing about where it came from.
   */
  | 'USER_ADOPTED'
  /** nobody has confirmed anything. May never shape output. */
  | 'DERIVED_UNRATIFIED';
export type Provenance =
  | 'MACHINE_DISCOVERED' | 'SUBSTANTIVELY_REWRITTEN' | 'EXPERT_ADDED'
  /**
   * Inferred from an expert's PUBLIC BEHAVIOUR, with no contact and no ratification.
   *
   * A public record contains an expert's decisions and not their authority. A maintainer who wrote
   * "should use a Map here" made a decision; they did not review, correct, or endorse any standard
   * inferred from it. Reading behaviour as endorsement is the exact inversion this system exists to
   * prevent — and it is most tempting in a study designed to prove the system, because a cooperating
   * expert is the expensive part.
   *
   * CEILING: such a requirement may be DERIVED_UNRATIFIED or USER_ADOPTED, and nothing above.
   * `assertAuthorityCeiling` enforces exactly that. An earlier version of this comment said the cap
   * was DERIVED_UNRATIFIED alone, which is narrower than the code and wrong in a way that matters: a
   * reader planning a public-corpus study would conclude adoption was impossible and either abandon
   * it or reach for EXPERT_RATIFIED, which is the inversion the ceiling exists to stop.
   */
  | 'PUBLIC_BEHAVIOUR_INFERRED';
export type RuleKind = 'GENERATIVE' | 'BOUNDARY';

/** 1. What the expert supplied. Frozen at seal time; its hash is the run's identity. */
export interface ExpertEvidence {
  readonly evidenceId: string;
  readonly workType: string;
  readonly items: readonly { readonly id: string; readonly contentHash: string; readonly tokens: number }[];
  readonly corpusHash: string;
  readonly sealedAt: string;
  /** declared, never inferred — it changes what any result means */
  readonly aiAssisted: boolean | null;
  readonly published: boolean | null;
}

/** A ratified rule. `appliesWhen` is required; GENERAL is a value, and a smell, not an absence. */
/**
 * Public behaviour can never become expert authority.
 *
 * Enforced as a function rather than a convention because the convenient move in a public-corpus
 * study is to mark the inferred standard ratified so the rest of the pipeline runs.
 */
export function assertAuthorityCeiling(r: Pick<Requirement, 'provenance' | 'authority'>): void {
  if (r.provenance === 'PUBLIC_BEHAVIOUR_INFERRED'
    && r.authority !== 'DERIVED_UNRATIFIED' && r.authority !== 'USER_ADOPTED') {
    throw new Error(
      `AUTHORITY CEILING: a requirement inferred from public behaviour cannot be ${r.authority}. `
      + 'The author was never asked and ratified nothing. A user may ADOPT it for their own skill '
      + '(USER_ADOPTED) — that is their decision to make. Claiming it as that author\'s ratified '
      + 'standard is not, and no corpus can supply it.');
  }
}

export interface Requirement {
  readonly requirementId: string;
  readonly statement: string;
  readonly appliesWhen: string;
  readonly kind: RuleKind;
  readonly authority: Authority;
  readonly provenance: Provenance;
  /** verbatim span from the corpus, or null when EXPERT_ADDED */
  readonly evidence: string | null;
  readonly evidenceItemId: string | null;
  /**
   * What you would see in a piece if this rule were NOT operating.
   *
   * THE ANTIDOTE TO RECOGNITION-AS-RATIFICATION. An expert reading "you ground abstract concepts in
   * concrete moments" agrees readily, and agreement is a weak signal — the recorded study saw it
   * exactly: *"'yes, I do write like this' is recognition, not fidelity; people recognise themselves
   * in horoscopes."* At one or two goldens the discovery is least reliable and human ratification is
   * the only filter, so the filter has to be given something to bite on.
   *
   * A counterfactual is that something. "If you didn't, I'd expect X" is falsifiable against the
   * corpus and against the expert's memory in a way a bare statement is not, and a rule for which no
   * counterfactual can be stated is a horoscope regardless of how readily it is recognised.
   *
   * Null for EXPERT_ADDED rules — a person stating their own rule owes no counterfactual to a
   * machine — and for anything proposed before this field existed.
   */
  readonly wouldBeAbsentIf: string | null;
  /**
   * HOW MUCH the expert's judgment binds, and HOW MUCH its surface form binds. Two axes, because one
   * cannot express "always compress the close, and any compressed form will do".
   *
   * Null for requirements ratified before the axes existed — absent, not defaulted, because a
   * default here would silently answer a question the author was never asked.
   */
  readonly materiality: Materiality | null;
  readonly realizationTolerance: RealizationTolerance | null;
  /**
   * THE DECISION THIS IS ONE WAY OF CARRYING OUT, when it is a way of carrying out another rule.
   *
   * Discovery finds expressive taste at roughly the rate it finds judgmental taste — form, figure,
   * rhythm, register, pronoun discipline. What it could not do was say that one of those is HOW
   * another one lands. Read flat, "end the beat on a short declarative that renames the thing" is a
   * fussy habit and gets rejected. Read as the way a concrete scene is landed, it is the more
   * interesting half of the pair. That is not a discovery failure; the ratification packet lost it.
   *
   * ASSERTED, NEVER INFERRED SILENTLY. Deriving this edge from a model was measured across three
   * independent runs on one corpus: one rule was given three different parents in three runs, a
   * standalone preference was captured into a parent twice, and the graph produced a chain the design
   * forbids. A proposer may offer an edge with its run-stability; only the author's confirmation makes
   * it structure. Discovery grants no authority, and that rule does not stop applying because the
   * object being discovered is a relationship.
   *
   * `null` is BOTH "a latent decision" and "an expressive preference that stands on its own". Those
   * are distinguished by materiality and tolerance, which they already carry, not by a third state.
   */
  readonly realizes?: string | null;
  /**
   * A machine-checkable shape this requirement demands of the output, when it demands one.
   *
   * Present only where the requirement genuinely constrains STRUCTURE rather than judgment. Most do
   * not: "name the real constraint before proposing solutions" has no schema, and inventing one for
   * it would convert judgment into form-filling. Null is the ordinary case and must stay cheap.
   */
  readonly outputShape: Readonly<Record<string, unknown>> | null;
  /**
   * WHAT MUST BE BOUND FOR THIS RULE TO BE EXECUTED TRUTHFULLY.
   *
   * Orthogonal to carrier and to materiality. The carrier says how the behaviour is caused; this says
   * whether causing it is currently possible at all. A REQUIRED rule reading "cite one counted
   * observation from our own records" is not satisfiable by a runtime with no records, and asking a
   * model to satisfy it anyway produced an invented statistic rather than a refusal.
   */
  readonly prerequisites?: readonly Prerequisite[];
}

/**
 * What a behaviour obliges. Only REQUIRED compiles as an obligation.
 *
 * TOLERATED is the asymmetric member and the reason this is not a boolean: a behaviour the expert
 * declines to polish away is PROTECTED, never GENERATED. "Informal punctuation sometimes remains"
 * must reach the model as a bound against over-smoothing and must never reach it as an instruction
 * to introduce errors.
 */
export type Materiality =
  | 'REQUIRED' | 'PREFERRED' | 'EXEMPLAR_ONLY' | 'TOLERATED' | 'INCIDENTAL';

/** Whether the exact realization is the point, or only what it achieves. */
export type RealizationTolerance = 'STRICT' | 'FUNCTIONALLY_EQUIVALENT' | 'FLEXIBLE';

/**
 * A realization points at a rule that exists, and never at itself or at another realization.
 *
 * One level, deliberately. The measured failure mode when this was derived automatically was chained
 * edges — A realizes B while B realizes C — which is a hierarchy nobody authored and nobody can
 * ratify. If a real corpus ever demands depth, that is a decision with evidence behind it; today it
 * would be graph theory solved in advance of a problem.
 */
export function assertRealizationGraph(reqs: readonly Requirement[]): void {
  const byId = new Map(reqs.map((r) => [r.requirementId, r]));
  for (const r of reqs) {
    if (!r.realizes) continue;
    if (r.realizes === r.requirementId) {
      throw new Error(`REALIZATION: ${r.requirementId} cannot realize itself.`);
    }
    const parent = byId.get(r.realizes);
    if (!parent) {
      throw new Error(
        `REALIZATION: ${r.requirementId} realizes "${r.realizes}", which is not in this standard. `
        + 'A realization without its decision is a form with nothing to serve.');
    }
    if (parent.realizes) {
      throw new Error(
        `REALIZATION: ${r.requirementId} realizes ${parent.requirementId}, which itself realizes `
        + `${parent.realizes}. Chains are not represented — a realization attaches to a decision, and `
        + 'a decision stands on its own. Point it at the decision, or leave it independent.');
    }
  }
}


/**
 * 2. THE TARGET. Immutable. Editing mints a new version; it never amends this one.
 *
 * ─── WHY THIS IS NOT SIMPLY "THE RATIFIED RECORD" ANY MORE ──────────────────────────────────
 *
 * When ratification was a mandatory gate, everything in here had been confirmed by a person and the
 * word "ratified" was accurate. Removing the gate changed that: a standard now also carries rules
 * nobody has looked at yet. Keeping a field called `ratifiedAt` on an object containing unconfirmed
 * proposals would state, in the record itself, something untrue — and the record is the one place
 * that must never overstate its own authority.
 *
 * So the timestamp says only when the version was MINTED, and `authorityState` says plainly whether
 * a person stands behind all of it. DRAFT is not a lesser object; it is an honest one. What protects
 * the law is not the label but the compiler: an unconfirmed prohibition can never reach ENFORCE, and
 * no optimizer can change that (`roleFor` in core/architecture/compile.ts).
 */
export type AuthorityState = 'DRAFT' | 'RATIFIED';

export interface StandardVersion {
  readonly standardVersionHash: string;
  readonly evidenceId: string;
  readonly workType: string;
  readonly requirements: readonly Requirement[];
  /** DRAFT while any requirement is still DERIVED_UNRATIFIED. Derived, never asserted by a caller. */
  readonly authorityState: AuthorityState;
  /** when this version came into existence — NOT a claim that anyone approved it */
  readonly mintedAt: string;
  readonly supersedes: string | null;
  /** why this version exists, when it supersedes another */
  readonly reason: string | null;
}

/**
 * 3. How the standard is arranged for execution. May change freely — it carries no authority.
 *
 * Defined in `core/architecture/compile.ts` and re-exported here so the five canonical objects still
 * read as one set. It lives there because it has real compilation rules; a shape with no rules was
 * how it degenerated into a hash of the requirement list.
 */
export type { SkillArchitecture, ArchitectureComponent, Carrier, Sensor, GateRole } from '../architecture/compile.js';

/** 4. A built, installable artifact. */
export interface SkillVersion {
  readonly skillVersionHash: string;
  readonly skillName: string;
  readonly standardVersionHash: string;
  readonly architectureHash: string;
  /** hash of the emitted SKILL.md — proves what was installed, is NEVER read back as authority */
  readonly materializedHash: string;
  readonly builtAt: string;
  /**
   * The frontmatter description this version was built with.
   *
   * Stored because it is an INPUT to materialization and was previously reconstructed from a default
   * at every later mint, so a description set once on `build` silently reverted on the next `improve`,
   * `amend` or `confirm`. Its consumers are those three commands, which inherit it when no new one is
   * given.
   *
   * Optional because SkillVersions minted before 2026-08-24 do not carry it. Absent means "unknown",
   * and the reader falls back to the default rather than pretending to know.
   */
  readonly description?: string;
}

/** 5. Append-only. Feedback and outcomes accumulate here; nothing here mutates a standard. */
export type EvidenceEvent =
  | { readonly kind: 'FEEDBACK'; readonly at: string; readonly skillVersionHash: string; readonly verdict: 'GOOD' | 'CLOSE' | 'BAD'; readonly note: string | null }
  | { readonly kind: 'PROPOSED_CHANGE'; readonly at: string; readonly skillVersionHash: string; readonly proposal: string; readonly accepted: boolean | null }
  | { readonly kind: 'BLIND_PREFERENCE'; readonly at: string; readonly skillVersionHash: string; readonly preference: 'A' | 'B' | 'TIE' | 'NONE' };

export interface EvidenceHistory { readonly skillName: string; readonly events: readonly EvidenceEvent[] }

/**
 * 6. ONE REAL EXECUTION. Immutable.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
 *
 * Feedback used to bind to a skill NAME and a free-text note, which cannot answer the only question
 * a repair needs answered: *what exact implementation produced the output the person disliked?*
 * A name resolves to whatever is active when the complaint arrives, which is not necessarily what
 * was active when the output was made. Binding feedback to an invocation makes the causal chain a
 * fact rather than an inference.
 *
 * ─── WHY `invocationSurface` IS A TYPED VALUE AND NOT A BOOLEAN ─────────────────────────────────
 *
 * V1's only instrumented execution owner is the Atelier CLI. Claude Code and Codex invoke the
 * installed skill through their own hosts and Atelier never sees it, so those invocations produce
 * NO record. That is a real gap, and a typed surface means closing it later ADDS a value rather
 * than silently reusing this one — nobody can mistake a CLI-proven loop for a host-proven one.
 */
export type InvocationSurface = 'ATELIER_CLI';

/**
 * WHY THIS INPUT EXISTS. Declared at the call, never inferred afterwards.
 *
 * The defect this closes: a first version derived context provenance from the EXECUTION PATH — every
 * input that had reached a real InvocationRecord was stamped REAL_USAGE. So seven tasks written to
 * stress-test the skill became a "certification-grade" suite, because they had been run properly.
 * Passing through the real invocation path says how an input was EXECUTED. It says nothing about
 * where it CAME FROM, and only the latter decides what a result may claim.
 *
 * UNDECLARED is the default and is treated as the WEAKEST grade. Certification has to be asserted,
 * never fallen into: an unflagged probe must not drift upward, and an unflagged genuine use costing
 * us evidence is the cheap direction to be wrong in.
 */
export type InputOrigin =
  /** authored to test, probe or optimise the skill. Never certification evidence. */
  | 'PROBE'
  /** a real person wanting real work done. The only origin that can certify. */
  | 'GENUINE_USE'
  /** nobody said. Treated as PROBE. */
  | 'UNDECLARED';

/**
 * Proof that what the model was given is what this SkillVersion says it should have been given.
 *
 * Recomputed at serve time from the STORED package, never re-derived from the standard: re-rendering
 * would prove the renderer still agrees with itself, which is a different claim from "the artefact
 * on record is the artefact that ran".
 */
export interface DeliveryEvidence {
  readonly expectedPackageHash: string;
  readonly servedPackageHash: string;
  readonly matched: boolean;
  readonly servedFiles: readonly string[];
  /**
   * Proof that the OUTPUT_CONTRACT carrier reached the provider — not that its file exists.
   *
   * The package hash above proves the contract file is the compiled one. It cannot see whether the
   * schema was ever handed to the model, and for a while it was not: the file was emitted, the
   * manifest read `served: true`, and generation ran against a hardcoded `{piece: string}`. The
   * carrier was dark in exactly the way this system was built to prevent.
   *
   * So the schema ACTUALLY SENT is hashed at the call and compared with the stored contract. `null`
   * when the package carries no contract, which is different from a contract that failed to arrive.
   */
  readonly outputContract: {
    readonly artifact: string;
    /** hash of the contract file in the stored package */
    readonly contractHash: string;
    /** hash of the schema object the provider actually received */
    readonly schemaHash: string;
    readonly enforced: boolean;
  } | null;
}

/** Where a task came from, so a wrong task can be traced to the surface that produced it. */
export type TaskSource = 'POSITIONAL' | 'FLAG' | 'STDIN' | 'FILE' | 'API' | 'HARNESS';

export interface RequestBinding {
  /** what the command resolved the user's request to be */
  readonly resolvedTaskHash: string;
  /** what the inference request actually carried. Equal to the above, or the run is refused. */
  readonly servedTaskHash: string;
  readonly source: TaskSource;
}

/**
 * I-REQUEST-BOUND — the resolved task and the served task are the same task.
 *
 * Deterministic, and checked at the moment the record is written rather than trusted. A mismatch is
 * not a degraded run to be reported; it means the system did work the user did not ask for, and there
 * is nothing to salvage from it.
 */
export function assertRequestBound(r: RequestBinding, resolvedTask: string): void {
  if (r.resolvedTaskHash !== r.servedTaskHash) {
    throw new Error(
      `I-REQUEST-BOUND: the task recorded for this invocation is not the task the model received.\n`
      + `  resolved: ${r.resolvedTaskHash} (from ${r.source})\n`
      + `  served:   ${r.servedTaskHash}\n`
      + `  resolved task began: "${resolvedTask.slice(0, 80)}"\n`
      + `  The output answers a request nobody made. Nothing is recorded.`);
  }
}

export interface InvocationRecord {
  readonly invocationId: string;
  readonly skillName: string;
  /** the full identity chain, so a diagnosis never has to guess which version spoke */
  readonly standardVersionHash: string;
  readonly skillVersionHash: string;
  readonly architectureHash: string;
  readonly servedPackageHash: string;
  /**
   * WHAT SERVED IT. The third identity, and the one a package hash cannot supply.
   *
   * `provider` and `model` used to sit here as two loose strings, which was enough to print and not
   * enough to compare: the same bytes served by two different models produced two records that
   * differed in a field nothing checked. A binding is one object with one hash, so "was this the same
   * system?" is a comparison rather than a habit.
   */
  readonly runtimeBinding: RuntimeBinding;
  /** which model the provider said answered, and how much that is worth. Observed, never configured. */
  readonly observedRuntime: ObservedRuntime;
  readonly invocationSurface: InvocationSurface;
  /** WHY this input existed. Resolved at the call; never derived from how it ran. */
  readonly provenance: InvocationProvenance;
  readonly inputHash: string;
  /**
   * THE FOURTH BINDING. What the user asked for, and what the model was actually given.
   *
   * Three identities were tracked — standard, skill, runtime — and the delivery proof answered "did
   * this package reach this model". Nothing answered "is this the task the user asked for". A CLI
   * parser that inferred the positional from token shape handed a flag's VALUE to inference as the
   * brief; the record hashed and stored it faithfully; the output was fluent and about the wrong
   * question. Every guard in the system passed.
   *
   * `resolvedTaskHash` is what the command resolved from the user's input. `servedTaskHash` is what
   * the inference request carried. They are recorded separately BECAUSE they can disagree, and the
   * disagreement is the only thing that can catch this class.
   */
  readonly request: RequestBinding;
  readonly outputHash: string;
  readonly at: string;
  readonly delivery: DeliveryEvidence;
  /** Kept in full, not only hashed. A hash proves identity; it cannot be read back to diagnose. */
  readonly input: string;
  readonly output: string;
}

/**
 * 7. What a person said about ONE execution. Append-only; never overwrites the observation.
 *
 * `verdict` is deliberately absent. A verdict is a summary, and the repair path needs the complaint
 * itself — "the opening is too abstract" routes to a requirement; "BAD" routes nowhere.
 */
export interface FeedbackRecord {
  readonly feedbackId: string;
  readonly invocationId: string;
  readonly complaint: string;
  readonly at: string;
}

// ─── GUARDS ───────────────────────────────────────────────────────────────────────────────────

/**
 * THE PORTABILITY INVARIANT. Refuses any attempt to treat a materialization as authority.
 *
 * Called wherever a SKILL.md might be parsed. There is no flag to bypass it: a caller who needs to read
 * the file for display can read it; a caller who needs to know what was ratified reads the
 * StandardVersion, which is a different object with a different hash.
 */
export function assertNotAuthority(source: 'SKILL_MD' | 'STANDARD_VERSION', hasCanonical: boolean): void {
  if (source === 'SKILL_MD' && hasCanonical) {
    throw new Error(
      'AUTHORITY SOURCE: a generated SKILL.md was read as authority while a StandardVersion exists. '
      + 'SKILL.md is a compiled materialization — an output. Treating it as input makes the host file '
      + 'format the source of truth, so a second adapter becomes a second standard and editing the '
      + 'materialization silently edits what the human ratified.',
    );
  }
}

/** Feedback is evidence. It may PROPOSE a change; it may never apply one. */
export function assertFeedbackDidNotMutate(before: StandardVersion, after: StandardVersion): void {
  if (before.standardVersionHash !== after.standardVersionHash) {
    throw new Error(
      `STANDARD MUTATED BY FEEDBACK: ${before.standardVersionHash} -> ${after.standardVersionHash}. `
      + 'Feedback accumulates in EvidenceHistory and may propose a change. An authority-changing update '
      + 'mints a new StandardVersion with an explicit supersedes link and a recorded reason.',
    );
  }
}

/** A new version must say what it replaces and why. An unexplained supersession is an untraceable one. */
export function assertSupersessionRecorded(v: StandardVersion): void {
  if (v.supersedes !== null && (!v.reason || v.reason.trim() === '')) {
    throw new Error(`SUPERSESSION: ${v.standardVersionHash} supersedes ${v.supersedes} with no recorded reason. Version history without reasons cannot be audited, only counted.`);
  }
}

/**
 * How much of this standard no person has confirmed. REPORTED, never a build block.
 *
 * The old guard here refused to build with any DERIVED_UNRATIFIED requirement, which made
 * ratification a mandatory form standing between a person and any output at all. That gate is
 * retired (a ruling by the person whose standard it is): the expert authorizes by supplying the work, the arrangement is
 * compiled automatically, and what no one has confirmed is DISCLOSED rather than demanded up front.
 *
 * The authority record did not weaken — every requirement still carries its own `authority`, an
 * unconfirmed BOUNDARY still compiles to OBSERVE and cannot shape output, and the optimizer still
 * has no write access to any of it. What went away was the click, not the control.
 */
/** DRAFT the moment anything in it is unconfirmed. Computed at mint; never passed in by a caller. */
export const authorityStateOf = (rs: readonly Requirement[]): AuthorityState =>
  rs.some((r) => r.authority === 'DERIVED_UNRATIFIED') ? 'DRAFT' : 'RATIFIED';

export const unconfirmedRate = (v: StandardVersion): number =>
  v.requirements.length === 0 ? 0 : v.requirements.filter((r) => r.authority === 'DERIVED_UNRATIFIED').length / v.requirements.length;

/** Discovery credit counts only what the machine found. Human completion is product, not recall. */
export const discoveryRecall = (v: StandardVersion): number =>
  v.requirements.length === 0 ? 0 : v.requirements.filter((r) => r.provenance === 'MACHINE_DISCOVERED').length / v.requirements.length;

/**
 * Does this rule apply everywhere, or only under a stated condition?
 *
 * THIS IS THE ONE PLACE THAT DECIDES. The question was previously answered at thirteen call sites
 * with two different rules: twelve tested `/^GENERAL\b/i` against a trimmed value, and the prose
 * baseline in `cli/commands/reference.ts` tested `!== 'GENERAL'` exactly, case-sensitively and
 * untrimmed. One of those sites also skipped the trim.
 *
 * The divergence was not cosmetic. That baseline is the B3_STANDARD_AS_PROSE arm, whose whole
 * purpose is to present the SAME standard without the compiler's machinery. A rule written
 * `general` or `GENERAL ` would have been unconditional to the renderer and conditional to the
 * baseline, so the two arms would have described the same standard differently and the comparison
 * between them would have been measuring a formatting disagreement.
 *
 * Blank counts as GENERAL. A rule that names no condition applies always; that is the only reading
 * under which the two former behaviours agree, and it is the sensible one. Blankness is still a
 * smell, which is what `unconditionalRate` is for.
 */
export const isGeneralScope = (appliesWhen: string): boolean => {
  const v = appliesWhen.trim();
  return v === '' || /^GENERAL\b/i.test(v);
};

/** Reported, not enforced: the share of rules that declined to name a condition. */
export const unconditionalRate = (v: StandardVersion): number =>
  v.requirements.length === 0 ? 0 : v.requirements.filter((r) => isGeneralScope(r.appliesWhen)).length / v.requirements.length;
