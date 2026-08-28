// atelier/core/contract/obligation.ts — WHAT MUST BE TESTED, DECIDED BEFORE ANYTHING IS GENERATED.
//
// ─── THE SPLIT THIS MODULE EXISTS TO ENFORCE ───────────────────────────────────────────────────
//
// "Generate tests for this skill" hands a model both halves of the job: inventing the situation AND
// deciding what counts as passing it. The second half is authority. A generator that decides what
// success means has written a standard, and nobody ratified it.
//
// So the halves are separated here. THE STANDARD DETERMINES WHAT MUST BE TESTED — deterministically,
// from typed fields, with no model consulted. A generator may later invent a task that puts a model
// in the situation an obligation describes. It may not invent the obligation, and it may not decide
// whether the obligation was met.
//
// ─── WHY THIS IS NOT A NICE-TO-HAVE ────────────────────────────────────────────────────────────
//
// `add` defaulted rule kind to BOUNDARY, so an authored rule reading "lead with the next action"
// compiled into the prohibitions section and reached the model as a rule AGAINST doing it. Green
// suite, clean build, inverted meaning, and nothing anywhere would have said so. A SHOULD_FIRE
// obligation derived from that requirement is exactly the check that catches it: the standard says
// this behaviour must appear, and the compiled package produced its opposite.
//
// ─── WHAT AN OBLIGATION IS NOT ─────────────────────────────────────────────────────────────────
//
// It is not evidence. Cases built from these obligations test whether an IMPLEMENTATION carries the
// standard it was compiled from. They are constructed, they come from one procedure, and they are
// not independent draws from any deployment distribution — see the sealed warning in `suite.ts`.

import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { applicabilityModeOf } from '../state/canonical-state.js';

export type ObligationKind =
  /** the behaviour MUST appear when the rule's condition holds */
  | 'SHOULD_FIRE'
  /**
   * A PROHIBITION was violated: the forbidden behaviour appeared.
   *
   * Distinct from SHOULD_NOT_APPLY, and the distinction decides whether a repair is even pointed the
   * right way. Both once carried this name, which made "the output did the thing it must not" and
   * "a conditional rule fired where its condition was absent" indistinguishable to anything
   * downstream — and the only repair this system owns helps the first and worsens the second.
   */
  | 'SHOULD_NOT_FIRE'
  /**
   * A CONDITIONAL rule was invoked where its condition does not hold.
   *
   * An over-application. Carrying the rule harder makes it more prominent and more likely to fire
   * again, so escalation is the wrong direction here. This is the failure the pricing study measured
   * as compilation keeping WHAT to say and losing WHEN NOT to say it.
   */
  | 'SHOULD_NOT_APPLY'
  /** the edge of the condition, where a reasonable reader could argue either way */
  | 'BOUNDARY'
  /** two requirements meeting in one task, where satisfying one could break the other */
  | 'INTERACTION'
  /** the output must hold a machine-checkable shape */
  | 'OUTPUT_SHAPE';

/**
 * HOW ANYONE WOULD KNOW whether this obligation was met.
 *
 * Derived only where the derivation is honest. A requirement carrying an `outputShape` is
 * machine-checkable and says so structurally. Everything else is UNQUALIFIED, and that is not
 * pessimism — it is the absence of a qualified observer, which is a real state this programme has
 * paid to learn. Reading prose to decide whether a rule is "structurally checkable" would be exactly
 * the word-list-as-proxy mistake, and it would manufacture confidence in the one place confidence
 * has repeatedly been wrong.
 *
 * STRUCTURAL and QUALIFIED_MODEL exist in the vocabulary because an author may assert them and an
 * observer may earn them. Nothing in this file assigns them.
 */
export type ObservationMode =
  | 'DETERMINISTIC'
  | 'STRUCTURAL'
  | 'QUALIFIED_MODEL'
  | 'HUMAN'
  | 'UNQUALIFIED';

export interface Obligation {
  readonly obligationId: string;
  /** the requirement(s) this obligation is derived from. Never empty. */
  readonly requirementIds: readonly string[];
  readonly kind: ObligationKind;
  /** what a task built for this obligation has to put the model in the way of */
  readonly situation: string;
  /** what the standard says must happen there. THE STANDARD'S WORDS, not a generator's. */
  readonly expectation: string;
  readonly observation: ObservationMode;
  /** why this obligation exists, traceable to the field that produced it */
  readonly why: string;
}

const idFor = (kind: ObligationKind, ids: readonly string[]): string =>
  `${kind.toLowerCase()}:${ids.join('+')}`;

/** A shape is machine-checkable; nothing else here is, and pretending otherwise would be the defect. */
const observationFor = (r: Requirement): ObservationMode =>
  r.outputShape ? 'DETERMINISTIC' : 'UNQUALIFIED';

/**
 * The obligations one requirement places on any implementation of it.
 *
 * Empty for a requirement that reaches the model through nothing. An INCIDENTAL rule was looked at
 * by its author and declared not taste, so there is no behaviour to require and testing for one
 * would be testing a rule the standard says it does not have.
 */
export function obligationsFor(r: Requirement): readonly Obligation[] {
  if (r.materiality === 'INCIDENTAL') return [];

  const mode = applicabilityModeOf(r.appliesWhen);
  const out: Obligation[] = [];
  const ids = [r.requirementId];

  // A prohibition's primary obligation is an ABSENCE, and a positive rule's is a PRESENCE. Getting
  // this backwards is the inversion that motivated the module, so it is read from `kind` and never
  // from the statement's wording.
  const primary: ObligationKind = r.kind === 'BOUNDARY' ? 'SHOULD_NOT_FIRE' : 'SHOULD_FIRE';
  out.push({
    obligationId: idFor(primary, ids), requirementIds: ids, kind: primary,
    situation: mode === 'GENERAL'
      ? 'an ordinary task of this work type'
      : `a task where this holds: ${r.appliesWhen}`,
    expectation: r.kind === 'BOUNDARY'
      ? `the output must NOT do this: ${r.statement}`
      : `the output must do this: ${r.statement}`,
    observation: observationFor(r),
    why: `kind is ${r.kind}, so the standard requires ${r.kind === 'BOUNDARY' ? 'an absence' : 'a presence'} here`,
  });

  // A CONDITIONAL rule owes a case where its condition does NOT hold. Without it, a rule that fires
  // everywhere passes every test — which is precisely the failure the pricing study measured, where
  // compilation preserved what to say and lost when not to say it.
  if (mode === 'CONDITION_PRESENT') {
    out.push({
      obligationId: idFor('SHOULD_NOT_APPLY', ids), requirementIds: ids, kind: 'SHOULD_NOT_APPLY',
      situation: `a task of this work type where this does NOT hold: ${r.appliesWhen}`,
      expectation: `the output must not invoke this rule at all: ${r.statement}`,
      observation: observationFor(r),
      why: 'the rule states a condition, so an implementation that applies it unconditionally is wrong '
        + 'in a way no positive test can see',
    });
    out.push({
      obligationId: idFor('BOUNDARY', ids), requirementIds: ids, kind: 'BOUNDARY',
      situation: `a task where it is genuinely arguable whether this holds: ${r.appliesWhen}`,
      expectation: 'either answer is defensible; what is recorded is which way the implementation went',
      observation: 'UNQUALIFIED',
      why: 'the edge of a condition is where an implementation reveals how it read the condition, and '
        + 'no automatic verdict is available there',
    });
  }

  if (r.outputShape) {
    out.push({
      obligationId: idFor('OUTPUT_SHAPE', ids), requirementIds: ids, kind: 'OUTPUT_SHAPE',
      situation: 'any task where this requirement applies',
      expectation: `the output must validate against the declared shape: ${JSON.stringify(r.outputShape)}`,
      observation: 'DETERMINISTIC',
      why: 'the requirement carries a machine-checkable shape, so this one needs no judgment at all',
    });
  }

  return out;
}

/**
 * Obligations for the standard as a whole, including where its rules meet.
 *
 * INTERACTIONS ARE NOT AN EXTRA. Requirements are tested one at a time everywhere else in this
 * system, and a skill fails in the places two of them collide: "lead with the action" and "number
 * multi-step work" are both satisfiable alone and can be argued against each other on a task that
 * needs both. Nothing else in the suite would look there.
 *
 * Pairs are limited to requirements that can co-apply — two rules with different stated conditions
 * are not necessarily ever live at once, and generating a task for an impossible pair produces a
 * case nobody can build.
 */
export function obligationsForStandard(v: StandardVersion): readonly Obligation[] {
  const perRule = v.requirements.flatMap(obligationsFor);

  const served = v.requirements.filter((r) => r.materiality !== 'INCIDENTAL');
  const general = served.filter((r) => applicabilityModeOf(r.appliesWhen) === 'GENERAL');

  const interactions: Obligation[] = [];
  for (let i = 0; i < general.length; i++) {
    for (let j = i + 1; j < general.length; j++) {
      const a = general[i]; const b = general[j];
      const ids = [a.requirementId, b.requirementId];
      interactions.push({
        obligationId: idFor('INTERACTION', ids), requirementIds: ids, kind: 'INTERACTION',
        situation: 'one task that puts both of these in play at once',
        expectation: `both must hold together — ${a.statement} / ${b.statement}`,
        observation: 'UNQUALIFIED',
        why: 'both apply everywhere, so every real task is a place they can contradict each other',
      });
    }
  }

  return [...perRule, ...interactions];
}

/** What a suite would have to cover, by requirement, so a gap is visible rather than implied. */
export interface ObligationCoverage {
  readonly requirementId: string;
  readonly obligationCount: number;
  readonly automaticallyObservable: number;
}

export function coverageOf(v: StandardVersion): readonly ObligationCoverage[] {
  const all = obligationsForStandard(v);
  return v.requirements.map((r) => {
    const mine = all.filter((o) => o.requirementIds.includes(r.requirementId));
    return {
      requirementId: r.requirementId,
      obligationCount: mine.length,
      automaticallyObservable: mine.filter((o) => o.observation === 'DETERMINISTIC').length,
    };
  });
}
