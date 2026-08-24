// core/coverage/observation.ts — HOW WE WOULD KNOW, WHICH IS NOT HOW WE ASK.
//
// A carrier is an ACTUATOR: how Atelier tries to cause a behaviour. An observation is a SENSOR: how
// Atelier could know whether the behaviour happened. They are separate decisions and were being
// treated as one.
//
// The tempting shortcut is `OUTPUT_CONTRACT -> observable, PROSE -> unobservable`. It is wrong in
// both directions:
//
//   OUTPUT_CONTRACT deterministically observes SHAPE. It says nothing about whether a cited
//   observation is factually grounded. Same carrier, and whether the requirement is observed depends
//   entirely on what the requirement MEANS.
//
//   PROSE has no sensor by default and can have an excellent one. "Never open with a bulleted list"
//   is a parse. "Correct the premise before answering" is not, today, by anything qualified.
//
//   SELF_CHECK is not an independent sensor. The model rereading its own draft is the same estimator
//   grading its own output, and this programme has already measured what that is worth: three
//   model-based instruments, zero abstentions across 150 observations.
//
// ─── AND THE SYSTEM IS PARTIALLY OBSERVABLE, NOT UNOBSERVABLE ──────────────────────────────────
//
// Some requirements have deterministic checks. Some are judged by a person, and a person is a valid
// sensor — human comparison is exactly what makes human promotion legitimate today. What is missing
// is AUTOMATIC SEMANTIC observation for judgment-shaped requirements, which is narrower than "the
// loop cannot be closed" and matters because the narrower statement is true.

import type { Carrier } from '../delivery/carrier-delivery.js';

export type ObservationMechanism =
  /** a parse, a comparison, a test. Runs without a model and without a person. */
  | 'DETERMINISTIC'
  /** a person reads the output and rules. Valid, and the reason human promotion is legitimate. */
  | 'HUMAN'
  /** a mechanism exists but has never been qualified against expert labels. Reports, never gates. */
  | 'UNQUALIFIED'
  /** nothing today can tell whether this held. Stated rather than implied by silence. */
  | 'NONE';

export interface ObservationPlan {
  readonly requirementId: string;
  readonly mechanism: ObservationMechanism;
  /** what would actually run, named concretely enough to be checked or built */
  readonly basis: string;
  /** an observation blocked on a resource says so, instead of reading as absent */
  readonly blockedOn?: string;
}

/**
 * The default plan for a requirement.
 *
 * DELIBERATELY CONSERVATIVE, and deliberately not a function of carrier alone. Shape is the one thing
 * a compiled contract genuinely observes, so a shape requirement gets DETERMINISTIC. Everything else
 * defaults to HUMAN when the author made it obligatory — someone has to be able to say whether their
 * own standard held — and to NONE when they did not, because nothing will look at it.
 *
 * An author or a later mechanism may override this. What it must never do is award automatic
 * observability because of the carrier a requirement happens to compile to.
 */
export function defaultPlan(r: {
  requirementId: string; materiality: string | null;
  outputShape?: Readonly<Record<string, unknown>> | null;
  prerequisites?: readonly { readonly name: string }[];
}, carrier: Carrier): ObservationPlan {
  const blockedOn = r.prerequisites?.[0]?.name;

  if (r.outputShape && carrier === 'OUTPUT_CONTRACT') {
    return { requirementId: r.requirementId, mechanism: 'DETERMINISTIC',
      basis: 'the compiled schema is enforced by the provider and the response is parsed against it — '
        + 'this observes SHAPE, not whether the content is true' };
  }
  if (blockedOn) {
    return { requirementId: r.requirementId, mechanism: 'NONE', blockedOn,
      basis: `a grounding check becomes possible once "${blockedOn}" is bound — the cited value could `
        + 'then be looked up. Until then nothing can tell a real citation from an invented one' };
  }
  if (r.materiality === 'REQUIRED') {
    return { requirementId: r.requirementId, mechanism: 'HUMAN',
      basis: 'a person reads the output and rules on whether their own standard held' };
  }
  return { requirementId: r.requirementId, mechanism: 'NONE',
    basis: 'not obligatory, and nothing is watching it' };
}

export interface MaintenanceMap {
  readonly plans: readonly ObservationPlan[];
  readonly automatic: number;
  readonly human: number;
  readonly unobserved: number;
}

export const maintenanceMap = (plans: readonly ObservationPlan[]): MaintenanceMap => ({
  plans,
  automatic: plans.filter((p) => p.mechanism === 'DETERMINISTIC').length,
  human: plans.filter((p) => p.mechanism === 'HUMAN').length,
  unobserved: plans.filter((p) => p.mechanism === 'NONE' || p.mechanism === 'UNQUALIFIED').length,
});

/**
 * What a person reads at ratification or build.
 *
 * NOT a score. A standard that is mostly human-observed is a normal standard, not a broken one, and
 * collapsing this into one number would invite exactly the reading the numbers do not support.
 */
export function describeMaintenance(m: MaintenanceMap, labelFor: (id: string) => string): string {
  const rows = m.plans.map((p) => {
    const head = `  ${p.requirementId.padEnd(5)} ${labelFor(p.requirementId).slice(0, 58)}`;
    const mech = p.mechanism === 'DETERMINISTIC' ? 'automatic check'
      : p.mechanism === 'HUMAN' ? 'you read it'
        : p.mechanism === 'UNQUALIFIED' ? 'mechanism exists, not qualified' : 'no qualified check';
    return `${head}\n        observation: ${mech}${p.blockedOn ? `  (unblocks when "${p.blockedOn}" is bound)` : ''}`;
  }).join('\n');

  return `\nHow this standard can be maintained\n\n${rows}\n\n`
    + `  ${m.automatic} with an automatic check · ${m.human} you would read yourself · ${m.unobserved} with no qualified check\n\n`
    + 'This is not a quality score. A standard about judgment is mostly judgment, and a person is a\n'
    + 'valid way to check one. What it tells you is which parts Atelier could keep honest on its own\n'
    + 'and which parts stay yours — and that a repair proposed against a rule in the last group cannot\n'
    + 'be promoted without you.\n';
}

/**
 * WHETHER A REPAIR MAY BE PROMOTED WITHOUT A PERSON.
 *
 * The precise statement, which is narrower than "promotion is blocked". Human comparison IS a valid
 * observation: if `atelier compare` puts two implementations in front of the author and they choose,
 * promotion has a sensor and that sensor is the person. What is unavailable is AUTONOMOUS semantic
 * promotion — a machine deciding a repair improved fidelity on a requirement nothing qualified can
 * measure.
 *
 * So this gates one thing and leaves the rest alone. Automatic diagnosis, automatic candidate
 * generation, human comparison and human promotion all stay available, which is already a useful
 * governed loop with the authority intact.
 */
export type PromotionAutonomy =
  | { readonly autonomous: true }
  | { readonly autonomous: false; readonly because: readonly string[]; readonly why: string };

export function autonomousPromotionAllowed(
  touched: readonly { readonly requirementId: string; readonly materiality: string | null }[],
  plans: readonly ObservationPlan[],
): PromotionAutonomy {
  const byId = new Map(plans.map((p) => [p.requirementId, p]));
  const blocking = touched
    .filter((r) => r.materiality === 'REQUIRED')
    .filter((r) => {
      const m = byId.get(r.requirementId)?.mechanism;
      return m !== 'DETERMINISTIC';
    })
    .map((r) => r.requirementId);

  if (!blocking.length) return { autonomous: true };
  return { autonomous: false, because: blocking,
    why: `this repair touches REQUIRED requirement(s) ${blocking.join(', ')} that no qualified automatic `
      + 'check can measure. A machine cannot establish that the change improved fidelity against them, so '
      + 'it may not promote on its own.\n'
      + '  What IS available: the candidate was built, `atelier compare` will show you both, and your '
      + 'choice promotes it. The authority is yours because nothing else has earned it, not because the '
      + 'loop is broken.' };
}
