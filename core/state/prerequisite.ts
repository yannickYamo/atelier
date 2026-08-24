// core/state/prerequisite.ts — WHAT MUST EXIST BEFORE A REQUIREMENT CAN BE EXECUTED TRUTHFULLY.
//
// A compiled standard said: *cite one specific counted observation from our own records*. It was
// REQUIRED, it compiled to PROSE, and the invocation supplied no records. The model satisfied it —
// "I pulled our last 200 tickets. 63% of them are…" — by inventing the records.
//
// The rule was followed. The condition that makes following it truthful was absent, and nothing in
// the system could represent that, so an impossible epistemic demand was handed to a model as an
// instruction and the model did the only thing it could.
//
// ─── THIS IS NOT AN OBSERVATION PROBLEM ────────────────────────────────────────────────────────
//
// It is tempting to file this under "we could not observe whether the citation was grounded", which
// leads straight back to building a semantic judge. That is the wrong read and the expensive one.
// We did not need to observe the outcome. We could have known BEFORE the call, deterministically,
// that the required source was not bound to this invocation.
//
// A precondition is checkable. Groundedness is not, yet. Do the checkable thing.
//
// ─── DELIBERATELY NOT AN ONTOLOGY ──────────────────────────────────────────────────────────────
//
// One case justified this, so it represents that case and no more: a requirement names a resource it
// needs, an invocation binds resources by name, and the two are compared by string. What a resource
// IS — a file, a query, a connector — is not decided here, because nothing has yet demanded that it
// be. `RECORDS("support-ticket-history")` can later be satisfied by a file or a CRM without this
// module learning either.

/** A named thing a requirement needs in order to be executed truthfully. */
export interface Prerequisite {
  /** the kind of thing needed. Open on purpose; the runtime matches on `name`, not on this. */
  readonly kind: 'RECORDS' | 'CONTEXT' | 'TOOL';
  /** the identifier the invocation must bind. Compared as a string, deliberately. */
  readonly name: string;
  /** what the author was relying on, in their words. Shown when the run is refused. */
  readonly why: string;
}

/** What an invocation actually has. Names only — the value is the caller's business. */
export type BoundResources = ReadonlySet<string>;

export type SatisfiabilityVerdict =
  /** every prerequisite of every REQUIRED rule is bound */
  | { readonly kind: 'SATISFIABLE' }
  /** a REQUIRED rule needs something this invocation does not have. Refuse before the call. */
  | { readonly kind: 'MISSING_REQUIRED_EVIDENCE'; readonly missing: readonly MissingPrerequisite[] }
  /** only non-obligatory rules are short. The run proceeds and the behaviour is not attempted. */
  | { readonly kind: 'DEGRADED'; readonly missing: readonly MissingPrerequisite[] };

export interface MissingPrerequisite {
  readonly requirementId: string;
  readonly statement: string;
  readonly materiality: string | null;
  readonly prerequisite: Prerequisite;
}

interface RequirementLike {
  readonly requirementId: string;
  readonly statement: string;
  readonly materiality: string | null;
  readonly prerequisites?: readonly Prerequisite[];
}

/**
 * Decide before spending anything.
 *
 * REQUIRED is the line. A rule the author made obligatory, whose evidence is absent, cannot be
 * executed honestly and must not be attempted — the alternative is asking a model not to invent, which
 * is not a mechanism. A PREFERRED rule in the same position simply does not fire, and saying so is
 * more useful than silently dropping it.
 */
export function checkSatisfiable(
  requirements: readonly RequirementLike[], bound: BoundResources,
): SatisfiabilityVerdict {
  const missing: MissingPrerequisite[] = [];
  for (const r of requirements) {
    for (const p of r.prerequisites ?? []) {
      if (bound.has(p.name)) continue;
      missing.push({ requirementId: r.requirementId, statement: r.statement, materiality: r.materiality, prerequisite: p });
    }
  }
  if (!missing.length) return { kind: 'SATISFIABLE' };
  return missing.some((m) => m.materiality === 'REQUIRED')
    ? { kind: 'MISSING_REQUIRED_EVIDENCE', missing }
    : { kind: 'DEGRADED', missing };
}

/** What a person reads. Names the rule, the source, and the two ways forward. */
export function describeSatisfiability(v: SatisfiabilityVerdict): string | null {
  if (v.kind === 'SATISFIABLE') return null;
  const rows = v.missing.map((m) =>
    `  ${m.requirementId}  [${m.materiality ?? 'undeclared'}]  needs ${m.prerequisite.kind}("${m.prerequisite.name}")\n`
    + `      rule: ${m.statement.slice(0, 96)}\n`
    + `      why:  ${m.prerequisite.why}`).join('\n');

  if (v.kind === 'DEGRADED') {
    return `\nNot every rule can fire on this invocation.\n\n${rows}\n\n`
      + 'None of these is REQUIRED, so the run proceeds and those behaviours are not attempted.\n'
      + 'Bind the source to get them.\n';
  }
  return `MISSING_REQUIRED_EVIDENCE — nothing was generated.\n\n${rows}\n\n`
    + 'A REQUIRED rule depends on a source this invocation does not have. Running anyway would ask the\n'
    + 'model to satisfy it without the evidence, and a model asked for a counted observation it cannot\n'
    + 'make will produce a plausible one. That is not a risk to be warned about; it is the outcome.\n\n'
    + '  Bind the source:   --with <name>=<path>\n'
    + '  Or run a version of the standard that does not require it.\n';
}
