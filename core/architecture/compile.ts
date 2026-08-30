// atelier/core/architecture/compile.ts — THE STANDARD IS THE TARGET; THIS IS THE ARRANGEMENT.
//
// Until this module existed, a skill's identity was a hash of its standard's requirement ids. That
// made `SkillVersion` a pure function of `StandardVersion`, so the implementation could not change
// unless the standard changed — the exact inverse of the law the whole system exists to hold:
//
//   STANDARD        what the expert means      stable, authority-controlled
//   ARCHITECTURE    how a model realizes it    free to change, carries no authority
//
// An optimizer needs something it is allowed to move. This is that thing. One standard can now have
// many architectures, and therefore many skills, none of which touch what was ratified.
//
// ─── MINIMUM SUFFICIENT SPECIALIZATION ────────────────────────────────────────────────────────
//
// The question is never "how much structure can we add?" but "what is the LEAST arrangement that
// still carries this requirement?" Both axes default to their weakest setting and every escalation
// has to be paid for. Absence of evidence is not evidence, on either axis.
//
// ─── WHY BOUNDARIES DO NOT CONSTRAIN GENERATION UNTIL SOMEONE CONFIRMS THEM ───────────────────
//
// The asymmetry is the whole ruling, and it is not a preference:
//
//   A GENERATIVE rule is an EXISTENCE PROOF. The corpus contains the thing being described, so the
//   inference is checkable against text that is present. If it is wrong, the output is visibly
//   wrong and the author corrects it.
//
//   A BOUNDARY rule is inferred from ABSENCE, and absence is ambiguous between "deliberate" and
//   "never came up". If it is wrong, it SUPPRESSES something — and a suppression leaves no trace in
//   the output for anyone to notice. Nothing in the corpus can resolve that ambiguity, because the
//   evidence for a prohibition is the thing that is not there.
//
// So an unconfirmed boundary compiles to OBSERVE: the skill checks its own draft against it and
// REPORTS, and the draft stands either way. Confirming one is a single yes on the post-build screen,
// after which it carries the same weight as anything else the expert authored.
//
// Positive rules ENFORCE from the start. Prohibitions are earned.

import { createHash } from 'node:crypto';
import type { StandardVersion, Requirement } from '../state/canonical-state.js';
import { assertRealizationGraph } from '../state/canonical-state.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * WHERE a requirement lives so the model follows it. Ordered weakest first; the compiler never
 * escalates past PROSE without evidence that prose alone did not carry it, and today no such
 * evidence exists in the product, so PROSE is what every component gets.
 */
export type Carrier =
  /** stated in the instructions the model reads while writing */
  | 'PROSE'
  /** a check against the finished draft, on top of whatever else carries it */
  | 'SELF_CHECK'
  /** shown as an instance of how the expert works. NOT an instruction. */
  | 'EXAMPLE'
  /** a machine-checkable shape the runtime enforces, rather than prose describing that shape */
  | 'OUTPUT_CONTRACT'
  /**
   * Nothing reaches the model.
   *
   * Needed because INCIDENTAL is a real ratification outcome — the expert looked at a genuine
   * regularity of their work and said it is not taste. Without this the compiler had to pick some
   * carrier for it, and the cheapest available was PROSE, which serves the model an instruction the
   * expert explicitly declined to give.
   */
  | 'NONE';

/** WHETHER anything watches the requirement after generation. NONE is the default. */
export type Sensor = 'NONE' | 'SELF_REPORT';

/**
 * What a component is allowed to do to the output.
 *
 *   ENFORCE  the model is instructed to satisfy it while writing
 *   OBSERVE  the model checks the finished draft against it and reports; the draft is never
 *            suppressed, rewritten or withheld on its account
 */
export type GateRole = 'ENFORCE' | 'OBSERVE';

export interface ArchitectureComponent {
  readonly id: string;
  /** requirement ids this component carries. Never empty — a component carrying nothing is not one. */
  readonly carries: readonly string[];
  readonly carrier: Carrier;
  readonly sensor: Sensor;
  readonly gateRole: GateRole;
  /** why this component landed here, in one line. Every decision is auditable or it is not a decision. */
  readonly rationale: string;
}

export interface SkillArchitecture {
  readonly architectureHash: string;
  readonly standardVersionHash: string;
  readonly components: readonly ArchitectureComponent[];
}

/** Confirmed by a person, in either direction. Discovery alone never produces one of these. */
/**
 * Exported because the RENDERER needs the same answer, and a second definition of "did the author
 * stand behind this" would drift from this one — which is the seam the authority model rests on.
 */
export const isConfirmed = (r: Requirement): boolean =>
  r.authority === 'EXPERT_RATIFIED' || r.authority === 'EXPERT_AUTHORED'
  // A user who adopted a behaviour for their own skill HAS decided. What they did not decide is
  // whose standard it is, and that distinction lives in `provenance`, which adoption never touches.
  || r.authority === 'USER_ADOPTED';

/**
 * THE GATE ROLE IS DERIVED FROM AUTHORITY. IT IS NOT A CHOICE.
 *
 * This is the invariant that makes it safe to hand an optimizer write access to an architecture.
 * Carrier and sensor are arrangement — an optimizer may move a requirement into an example, add a
 * self-check, drop a redundant component. Gate role is not arrangement. It answers "may this shape
 * the output?", and that question is settled by who stands behind the rule, never by what a search
 * process found effective.
 *
 * Without this, a transaction that flips an unconfirmed prohibition from OBSERVE to ENFORCE passes
 * every other guard: it invented no requirement, dropped none, and serves the same standard. It has
 * simply promoted a machine guess into an active suppression rule. That is the whole failure this
 * system exists to prevent, arriving through the one door we just opened.
 */
/**
 * ─── AND MATERIALITY IS THE SECOND HALF OF THE DERIVATION ─────────────────────────────────────
 *
 * `EXPERT_RATIFIED` was read as "this must be enforced". It does not mean that. It means the expert
 * is authoritative about the item's DECLARED MATERIALITY — and one of the things they are entitled
 * to declare is that an otherwise excellent output may break it.
 *
 * Conflating the two made a ratified PREFERRED requirement unrepresentable: the expert had said
 * "I usually do this and another way is still excellent", and the compiler could only say ENFORCE.
 *
 * So the derivation reads BOTH. Authority still decides whether a rule may shape output at all;
 * materiality decides whether this particular rule is an obligation or guidance. Neither is a choice
 * an optimizer may make, which is what keeps the invariant intact.
 */
export const roleFor = (r: Requirement): GateRole => {
  // ─── NOTHING UNCONFIRMED SHAPES OUTPUT. NOT A PROHIBITION, NOT A POSITIVE RULE. ────────────
  //
  // This used to cover prohibitions only, on the reasoning that absence in a corpus cannot tell
  // "deliberate" from "never came up". The identical argument covers a positive rule: RECURRENCE
  // cannot tell "they decided this" from "it happened to come up", and a machine has no way to
  // separate the two from the corpus alone.
  //
  // Restricting it to BOUNDARY let a whole skill compile from unconfirmed discovery as hard
  // instruction. Sixteen candidate rules inferred from a third party's public writing became
  // sixteen ENFORCE components, and the model duly produced "It MUST Never change its own
  // objective" — a recurrence turned into law by a compiler nobody had authorised to do it.
  //
  // An unconfirmed standard now serves everything as OBSERVE: notice it after the draft exists,
  // report what you find, leave the draft alone. That is a usable preview and it cannot be mistaken
  // for a ratified skill, without adding a state to keep consistent.
  if (!isConfirmed(r)) return 'OBSERVE';
  // A REALIZATION IS NEVER AN OBLIGATION. The decision it realizes carries that, and enforcing both
  // would issue two commands for one choice. Stated HERE rather than in the component branch, because
  // a rule that lives in one function and is restated in five places will be wrong in at least one of
  // them — which this file has already paid for once, in the other direction.
  if (r.realizes) return 'OBSERVE';
  switch (r.materiality) {
    // The expert said an output breaking this is not thereby worse. It may be shown; it may not bind.
    case 'PREFERRED':
    case 'EXEMPLAR_ONLY':
    case 'TOLERATED':
      return 'OBSERVE';
    // Declared not to be taste — it reaches nothing, and `componentFor` gives it no runtime carrier.
    case 'INCIDENTAL':
      return 'OBSERVE';
    // ── UNDECLARED IS SOURCE-AWARE, BECAUSE THE TWO SILENCES MEAN DIFFERENT THINGS ──────────
    //
    // REQUIRED binds, whoever said it. For a rule with NO declared materiality, who wrote it is the
    // whole question. "Never end with an offer of help", typed by the person, is enough authority to
    // instruct — asking "does breaking this make the work worse?" about their own sentence would be
    // a questionnaire about what they just said. The same silence on a DISCOVERED rule the person
    // merely approved is a question nobody answered, and the old default answered it at maximum
    // strength: ratified + undeclared compiled to ENFORCE while the CLI printed "they will be SHOWN,
    // not instructed" — the message and the compiler disagreeing about the strongest thing a skill
    // does. Undeclared-discovered now observes until its owner says it matters; materiality remains
    // semantic metadata either way, and never picks the carrier.
    default:
      return r.materiality === 'REQUIRED' || r.authority === 'EXPERT_AUTHORED' ? 'ENFORCE' : 'OBSERVE';
  }
};

/**
 * Decide the arrangement for one requirement. Deterministic, lexicographic, no scores — so the
 * compiler can always say WHY something landed where it did.
 */
export function componentFor(r: Requirement): ArchitectureComponent {
  // EVERY branch below reads `roleFor(r)`. None states a gate role of its own.
  //
  // Two branches used to hardcode ENFORCE, and that is exactly how an unconfirmed rule reached hard
  // instruction after `roleFor` had already been taught to refuse it: the derivation was correct and
  // the component ignored it. A rule that lives in one function and is restated in five places will
  // be wrong in at least one of them.
  // ── UNCONFIRMED EVIDENCE IS SHOWN, NEVER INSTRUCTED ──────────────────────────────────────
  //
  // A positive rule read off a corpus is an EXISTENCE PROOF: the author demonstrably did this, more
  // than once. That is real, and hiding it would waste the discovery. It is also not an obligation —
  // recurrence establishes that they did it and never that an output failing to do it is worse. On
  // one live corpus seven recurring behaviours produced exactly one requirement once a person was
  // asked, and the six others would each have been served as law.
  //
  // So it reaches the model as an EXAMPLE under OBSERVE: here is what we saw in the work, nobody has
  // confirmed it binds, do not let it shape the writing. The prohibition case is unchanged and stays
  // in self-check, because absence proves nothing and a wrong one suppresses silently.
  if (!isConfirmed(r) && r.kind === 'GENERATIVE') {
    return {
      id: `show:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'EXAMPLE',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: 'observed in the work and confirmed by nobody — shown as an instance of what the '
        + 'author does, never as an instruction. Ratify it and it can begin to bind.',
    };
  }

  // ── A LINKED REALIZATION IS EVIDENCE OF FORM, NOT A SECOND COMMAND ───────────────────────
  //
  // Read before materiality, because the RELATION decides what this is. The parent decision carries
  // the obligation; this carries how the author characteristically lands it. Compiling both as
  // instructions would issue two commands for one choice and weight the form equally with the
  // decision it serves — which is how "end the beat on a short declarative" stops being taste and
  // becomes a rule about sentence length.
  //
  // EXAMPLE regardless of materiality, and OBSERVE regardless of it too. For form, showing beats
  // telling: a paragraph describing cadence is a worse carrier of cadence than one instance of it.
  // The author still says how tightly the form binds — that is `realizationTolerance`, and it is the
  // question the packet asks about a realization instead of asking whether it is REQUIRED.
  if (r.realizes) {
    return {
      id: `realizes:${r.realizes}:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'EXAMPLE',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: `one way the author realizes ${r.realizes}. Shown as evidence of form, not issued as a `
        + `second instruction — ${r.realizes} is the obligation and this is how it characteristically `
        + `lands${r.realizationTolerance ? `; the author marked the form ${r.realizationTolerance}` : ''}.`,
    };
  }

  // ── MATERIALITY DECIDES WHETHER THE MODEL IS OBLIGED AT ALL ──────────────────────────────
  //
  // Recurrence made these candidates; a person decided what they oblige. Compiling every ratified
  // behaviour as an instruction is how a true observation becomes a caricature — an author who ends
  // some sections on three parallel adjectives becomes a skill that ends every section that way.
  //
  // TOLERATED is the case that has to be built rather than derived. "This appears in my work and
  // must not be manufactured" is not a weaker obligation, it is an obligation pointing the other
  // way: leave it alone. It compiles to an OBSERVE component that watches for the output being
  // POLISHED, never for it being absent.
  if (r.materiality === 'TOLERATED') {
    return {
      id: `protect:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'SELF_CHECK',
      sensor: 'SELF_REPORT',
      gateRole: roleFor(r),
      rationale: 'the author marked this TOLERATED — it occurs because they do not over-polish, and '
        + 'generating it deliberately would be wrong. Carried as a check against smoothing it away, '
        + 'never as an instruction to produce it.',
    };
  }
  if (r.materiality === 'INCIDENTAL') {
    return {
      id: `none:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'NONE',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: 'the author marked this INCIDENTAL — a regularity of the evidence, not taste. It is '
        + 'recorded and nothing is asked of the model.',
    };
  }
  if (r.materiality === 'PREFERRED' || r.materiality === 'EXEMPLAR_ONLY') {
    return {
      id: `show:${r.requirementId}`,
      carries: [r.requirementId],
      // EXAMPLE, not PROSE: the difference between "do this" and "here is how they do it" is the
      // whole distinction the author drew, and a prose instruction erases it.
      carrier: 'EXAMPLE',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: `the author marked this ${r.materiality} — characteristic and not obligatory, so it `
        + 'is shown as an example rather than instructed. An output that does otherwise is not wrong.',
    };
  }
  if (r.kind === 'BOUNDARY' && !isConfirmed(r)) {
    return {
      id: `observe:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'SELF_CHECK',
      sensor: 'SELF_REPORT',
      gateRole: roleFor(r),
      rationale: 'an inferred prohibition — absence in the corpus cannot distinguish "deliberate" from '
        + '"never came up", so it reports on the finished draft rather than shaping it',
    };
  }
  if (r.kind === 'BOUNDARY') {
    return {
      id: `avoid:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'PROSE',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: 'a prohibition the author confirmed — it may shape the draft',
    };
  }
  // ── REALIZATION TOLERANCE DECIDES WHETHER THE FORM IS PINNED ─────────────────────────────
  //
  // STRICT means the surface IS the decision, so an example pins it — a statement alone leaves the
  // model free to satisfy the invariant in a form the author would not have chosen. FLEXIBLE and
  // FUNCTIONALLY_EQUIVALENT mean the opposite: pinning the form there would compile the realization
  // instead of the decision, which is the failure the invariant/realization split exists to prevent.
  if (r.materiality === 'REQUIRED' && r.realizationTolerance === 'STRICT') {
    return {
      id: `do:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'EXAMPLE',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: 'required, and the author said the exact form is the point — so it is carried with '
        + 'an example that pins the realization, not by a statement that leaves it open',
    };
  }
  // A shape the RUNTIME can check does not belong in prose describing that shape. Prose asking for
  // twelve fields is a request; a schema is a guarantee, and the model cannot half-satisfy it.
  if (r.materiality === 'REQUIRED' && r.outputShape) {
    return {
      id: `contract:${r.requirementId}`,
      carries: [r.requirementId],
      carrier: 'OUTPUT_CONTRACT',
      sensor: 'NONE',
      gateRole: roleFor(r),
      rationale: 'required, and its shape is machine-checkable — so the runtime enforces it rather '
        + 'than the instructions asking for it. Prose describing a schema is a weaker version of the schema.',
    };
  }
  return {
    id: `do:${r.requirementId}`,
    carries: [r.requirementId],
    carrier: 'PROSE',
    sensor: 'NONE',
    gateRole: roleFor(r),
    rationale: 'a positive rule evidenced by work the author supplied — prose is the least arrangement that carries it',
  };
}

/**
 * Compile the minimum architecture for a standard.
 *
 * The hash is over the COMPONENTS, never over the requirement list. That is the point: two
 * architectures over one standard differ here, which is what lets a skill improve without the
 * standard moving.
 */
export function compileArchitecture(v: StandardVersion): SkillArchitecture {
  assertNothingRejectedIsServed(v);
  // The graph is checked before anything is compiled: a realization pointing at a missing rule, or a
  // chain, is a malformed standard and must not reach a package.
  assertRealizationGraph(v.requirements);
  const components = v.requirements.map(componentFor);
  return {
    architectureHash: sha(JSON.stringify(components.map((c) => [c.id, c.carries, c.carrier, c.sensor, c.gateRole]))),
    standardVersionHash: v.standardVersionHash,
    components,
  };
}

/**
 * An architecture may only arrange requirements its own standard contains.
 *
 * This is the guard that replaces the old build-time ratification block. The invariant worth
 * enforcing was never "a human clicked approve" — it is that the arrangement cannot introduce,
 * drop or invent a requirement. An optimizer may rewrite every component here and still be unable
 * to change what the skill is for.
 */
/**
 * A rule the author refused must never reach a skill.
 *
 * `EXPERT_REJECTED` and "nobody has looked yet" used to be the same value, so this could not be
 * checked. Now that they differ, the check is cheap and the failure it prevents is severe: a
 * rejected GENERATIVE rule would otherwise compile to ENFORCE like any other and instruct the model
 * to do the exact thing its author said no to. Rejection means removal; a rejected rule sitting
 * inside an authority record is itself the defect, so this fails closed at the boundary.
 */
export function assertNothingRejectedIsServed(v: StandardVersion): void {
  const rejected = v.requirements.filter((r) => r.authority === 'EXPERT_REJECTED').map((r) => r.requirementId);
  if (rejected.length) {
    throw new Error(
      `REJECTED REQUIREMENT IN A STANDARD: ${rejected.join(', ')}. The author refused these; they must `
      + 'be absent from the requirement set, not carried inside it. Serving one would instruct the model '
      + 'to do the thing its author said no to.',
    );
  }
}

export function assertArchitectureServesStandard(a: SkillArchitecture, v: StandardVersion): void {
  if (a.standardVersionHash !== v.standardVersionHash) {
    throw new Error(
      `ARCHITECTURE MISMATCH: architecture ${a.architectureHash} was compiled for standard `
      + `${a.standardVersionHash} but is being built against ${v.standardVersionHash}. An arrangement `
      + 'of one standard cannot serve another; recompile it.',
    );
  }
  const declared = new Set(v.requirements.map((r) => r.requirementId));
  const carried = new Set(a.components.flatMap((c) => c.carries));
  const invented = [...carried].filter((id) => !declared.has(id));
  if (invented.length) {
    throw new Error(
      `ARCHITECTURE INVENTED REQUIREMENTS: ${invented.join(', ')} appear in components but not in `
      + 'the standard. The arrangement may move a requirement anywhere; it may never add one.',
    );
  }
  const dropped = [...declared].filter((id) => !carried.has(id));
  if (dropped.length) {
    throw new Error(
      `ARCHITECTURE DROPPED REQUIREMENTS: ${dropped.join(', ')} are in the standard and carried by no `
      + 'component. A requirement no component carries is a requirement the skill silently stopped serving.',
    );
  }
  for (const c of a.components) {
    if (c.carries.length === 0) throw new Error(`ARCHITECTURE: component ${c.id} carries nothing — a component that carries no requirement is not a component.`);
  }

  // THE AUTHORITY INVARIANT. Everything above this line is about the requirement SET; this is about
  // what the arrangement is allowed to do with it. An optimizer may rewrite carrier and sensor
  // freely. It may not decide that a rule it cannot see the provenance of should start shaping output.
  const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
  for (const c of a.components) {
    for (const id of c.carries) {
      const r = byId.get(id)!;
      const allowed = roleFor(r);
      if (c.gateRole !== allowed) {
        throw new Error(
          `AUTHORITY ESCALATION: component ${c.id} sets gateRole ${c.gateRole} for requirement ${id}, `
          + `which is ${r.kind} / ${r.authority} and may only be ${allowed}. Gate role is DERIVED from `
          + 'who stands behind a rule; it is not an arrangement an optimizer may choose. Promoting an '
          + 'unconfirmed prohibition to ENFORCE turns a machine guess into active suppression, and a '
          + 'suppression leaves no trace in the output for anyone to notice.',
        );
      }
    }
  }
}

/** What the post-build screen asks about: inferred prohibitions, watched but not yet enforced. */
export const observedBoundaries = (a: SkillArchitecture, v: StandardVersion): readonly ArchitectureComponent[] => {
  // BOUNDARIES, not everything that observes. Unconfirmed positive rules now observe too — they are
  // shown as examples — and the post-build screen exists to ask about inferred PROHIBITIONS, whose
  // wrongness suppresses silently. Sweeping the positives in would bury that question in a list.
  // The standard was OPTIONAL and neither caller passed it, so `kindOf` was always empty and the
  // fallback ran every time — selecting on `carrier === 'SELF_CHECK'`, which is exactly the shape a
  // TOLERATED "protect, never generate" component has. So the screen asked the author to re-confirm
  // rules they had already decided, which is the opposite of what the note above says it is for.
  // Required now: both call sites hold the standard, and a filter that cannot see kinds cannot
  // filter on kind.
  const kindOf = new Map(v.requirements.map((r) => [r.requirementId, r.kind]));
  return a.components.filter((c) => c.gateRole === 'OBSERVE'
    && c.carries.some((id) => kindOf.get(id) === 'BOUNDARY'));
};
