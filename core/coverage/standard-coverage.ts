// atelier/core/coverage/standard-coverage.ts — WHAT ATELIER KNOWS, AND WHAT IT SHOULD ASK NEXT.
//
// Replaces `nGoldens` as the readiness concept. "Uploaded 2 documents" tells a person nothing they
// can act on; "requirement B has strong signal in exactly one context" tells them what to do.
//
// ─── DELIBERATELY NOT A SCORE ──────────────────────────────────────────────────────────────────
//
// There is no scalar here and there will not be one. A single confidence number would be read as
// permission — a threshold someone eventually crosses to "validated" — and it would collapse signals
// that call for DIFFERENT actions into one that calls for none. A requirement with contradictory
// evidence and a requirement seen once in one context might average identically; one needs the
// contradiction resolved and the other needs a second context, and the average asks for neither.
//
// So coverage is a set of typed signals per requirement, and the states derived from them name
// actions rather than levels.
//
// ─── AND IT HAS NO AUTHORITY ───────────────────────────────────────────────────────────────────
//
// Coverage ranks EVIDENCE ACQUISITION. It never decides that a machine-proposed requirement is
// authoritative. STRONG_SIGNAL means "several independent looks agree", not "ratified" — the gap
// between those two is the entire authority boundary of this product, and a coverage model is
// exactly the kind of component that erodes it by looking statistical. `assertNotAuthority` exists
// so the confusion has to be deliberate.

import type { Requirement } from '../state/canonical-state.js';
import type { GoldenUnit } from '../golden/golden-unit.js';

/** Everything observed about one requirement. Raw signals — no weighting, no arithmetic. */
export interface CoverageSignals {
  /** units where the requirement was observed HOLDING */
  readonly supportingUnitIds: readonly string[];
  /** units where it was applicable and NOT holding. Counterevidence, kept separate from absence. */
  readonly counterUnitIds: readonly string[];
  /** distinct decision contexts it has been seen in */
  readonly contextIds: readonly string[];
  /** distinct artifacts/projects — a rule seen 6 times in one repo has cluster diversity 1 */
  readonly clusterIds: readonly string[];
  /** has anyone asked the author when they deliberately do NOT do this? */
  readonly boundaryProbed: boolean;
  /** times seen again in work the proposer never read. The only recurrence that means anything. */
  readonly heldOutRecurrence: number;
  /** vantages that independently proposed it — cross-framing agreement */
  readonly framingsFound: readonly string[];
  /** does it carry a falsifying counterfactual the author can argue with? */
  readonly hasCounterfactual: boolean;
}

/**
 * States, derived. A requirement may be in SEVERAL at once — they are findings, not a ladder.
 *
 * None of them is a grade. Each names a different next action, which is the only reason to compute
 * them at all.
 */
export type CoverageState =
  /** recurs in work the proposer never read, across more than one context, with no counterevidence */
  | 'STRONG_SIGNAL'
  /** real signal, one context only. Not weak — unscoped: nobody knows where else it holds */
  | 'SINGLE_CONTEXT'
  /** claims to hold generally and nobody has asked where it stops */
  | 'BOUNDARY_UNRESOLVED'
  /** observed holding somewhere and observed failing somewhere it applied */
  | 'CONTRADICTORY'
  /** the Barnum shape: one vantage, one context, no counterfactual, never seen again */
  | 'LOW_PRECISION_RISK'
  /** more evidence of the same kind would not change what we know */
  | 'SATURATED';

/** What would most reduce uncertainty about this requirement. The output that is actually usable. */
export type AcquisitionAction =
  | 'ASK_DISCRIMINATING_QUESTION'
  | 'NEED_ANOTHER_NATURAL_CONTEXT'
  | 'NEED_ANOTHER_ARTIFACT'
  | 'PROBE_BOUNDARY'
  | 'RESOLVE_CONTRADICTION'
  | 'NOTHING_WOULD_HELP';

export interface RequirementCoverage {
  readonly requirementId: string;
  readonly signals: CoverageSignals;
  readonly states: readonly CoverageState[];
  readonly nextAction: AcquisitionAction;
  /** why this action, in the words a person would use */
  readonly why: string;
  /**
   * Rank for active querying — higher means a single answer here resolves more.
   *
   * A PRIORITY, NOT A CONFIDENCE. It orders questions; it says nothing about whether the requirement
   * is true, and two requirements with the same priority may be in completely different states.
   */
  readonly informationValue: number;
}

const uniq = (xs: readonly string[]): readonly string[] => [...new Set(xs)];

/** Derive the states. Order of checks is not precedence — every applicable state is reported. */
export function statesOf(r: Requirement, s: CoverageSignals): readonly CoverageState[] {
  const out: CoverageState[] = [];
  const contexts = uniq(s.contextIds).length;
  const contradictory = s.counterUnitIds.length > 0 && s.supportingUnitIds.length > 0;
  const generalScope = /^GENERAL\b/i.test(r.appliesWhen.trim());

  if (contradictory) out.push('CONTRADICTORY');
  if (s.heldOutRecurrence >= 2 && contexts >= 2 && !contradictory) out.push('STRONG_SIGNAL');
  if (contexts <= 1) out.push('SINGLE_CONTEXT');

  // A rule claiming to hold everywhere, that nobody has been asked to bound, is the single most
  // common way a discovered standard overreaches — it is right about the behaviour and wrong about
  // its scope, and the skill then applies it where the author never would.
  if (generalScope && !s.boundaryProbed) out.push('BOUNDARY_UNRESOLVED');

  // The exact shape a plausible-but-not-theirs rule takes. Named so it can be shown to the human,
  // because the human is the only thing that can catch it and ratification is a weak filter.
  if (r.provenance === 'MACHINE_DISCOVERED'
    && uniq(s.framingsFound).length <= 1
    && contexts <= 1
    && !s.hasCounterfactual
    && s.heldOutRecurrence === 0) out.push('LOW_PRECISION_RISK');

  if (out.length === 0 || (out.length === 1 && out[0] === 'STRONG_SIGNAL')) {
    if (s.heldOutRecurrence >= 3 && uniq(s.clusterIds).length >= 2 && s.boundaryProbed) out.push('SATURATED');
  }
  return out;
}

/**
 * The action, and the priority attached to it.
 *
 * ORDER IS THE POLICY. A contradiction outranks everything: while a requirement is both holding and
 * failing, every other question about it is asked against an unstable object, and collecting more
 * evidence before resolving it just produces more of both.
 */
export function actionFor(states: readonly CoverageState[], s: CoverageSignals): { action: AcquisitionAction; value: number; why: string } {
  if (states.includes('CONTRADICTORY')) {
    return { action: 'RESOLVE_CONTRADICTION', value: 100,
      why: `seen holding in ${s.supportingUnitIds.length} place(s) and failing in ${s.counterUnitIds.length} where it applied. Until that is settled it is two different rules wearing one statement, and more evidence produces more of both.` };
  }
  if (states.includes('LOW_PRECISION_RISK')) {
    return { action: 'ASK_DISCRIMINATING_QUESTION', value: 90,
      why: 'one vantage proposed it, from one context, with nothing it predicts and no second sighting. That is the shape a plausible rule takes when it is not actually the author\'s — and agreeing with it is easy, which is why a question beats another document here.' };
  }
  if (states.includes('BOUNDARY_UNRESOLVED')) {
    return { action: 'PROBE_BOUNDARY', value: 70,
      why: 'it claims to hold everywhere and nobody has been asked where it stops. A rule right about the behaviour and wrong about its scope gets applied where the author never would.' };
  }
  if (states.includes('SINGLE_CONTEXT')) {
    const oneCluster = uniq(s.clusterIds).length <= 1;
    return oneCluster
      ? { action: 'NEED_ANOTHER_ARTIFACT', value: 55,
        why: 'seen in one context inside one artifact. A second artifact would say whether this is the author or the occasion.' }
      : { action: 'NEED_ANOTHER_NATURAL_CONTEXT', value: 50,
        why: 'real signal, but only one context knows about it — where else it holds is simply unobserved.' };
  }
  if (states.includes('SATURATED')) {
    return { action: 'NOTHING_WOULD_HELP', value: 0,
      why: 'recurs across contexts and artifacts, and its boundary has been asked about. More of the same evidence would not change what is known.' };
  }
  return { action: 'NEED_ANOTHER_NATURAL_CONTEXT', value: 30,
    why: 'supported, and another context would sharpen where it applies.' };
}

export function coverageFor(r: Requirement, signals: CoverageSignals): RequirementCoverage {
  const states = statesOf(r, signals);
  const { action, value, why } = actionFor(states, signals);
  return { requirementId: r.requirementId, signals, states, nextAction: action, informationValue: value, why };
}

export interface StandardCoverage {
  readonly perRequirement: readonly RequirementCoverage[];
  /** the queue: what to ask next, most informative first. NOT a readiness score. */
  readonly acquisitionQueue: readonly RequirementCoverage[];
  /** requirements nothing further would resolve — discovery looks saturated HERE, not overall */
  readonly saturatedIds: readonly string[];
  readonly why: string;
}

export function coverageOf(
  requirements: readonly Requirement[],
  signalsFor: (r: Requirement) => CoverageSignals,
): StandardCoverage {
  const perRequirement = requirements.map((r) => coverageFor(r, signalsFor(r)));
  const acquisitionQueue = [...perRequirement]
    .filter((c) => c.nextAction !== 'NOTHING_WOULD_HELP')
    .sort((a, b) => b.informationValue - a.informationValue || a.requirementId.localeCompare(b.requirementId));
  const saturatedIds = perRequirement.filter((c) => c.states.includes('SATURATED')).map((c) => c.requirementId);

  const risky = perRequirement.filter((c) => c.states.includes('LOW_PRECISION_RISK')).length;
  return {
    perRequirement, acquisitionQueue, saturatedIds,
    why: `${requirements.length} requirement(s): ${saturatedIds.length} where more evidence would not help, `
      + `${acquisitionQueue.length} where it would${risky ? `, and ${risky} carrying the shape of a rule that may not be yours` : ''}. `
      + 'This ranks what to ask next. It does not say any of them is right — only you can do that.',
  };
}

/**
 * THE AUTHORITY BOUNDARY, made explicit because this module is the kind that erodes it.
 *
 * Coverage looks statistical, and a statistical-looking component is exactly what eventually gets
 * read as permission. It has none. STRONG_SIGNAL means several independent looks agree; it does not
 * mean the author holds the rule, and no accumulation of signal ever crosses into ratification.
 */
export const COVERAGE_AUTHORITY = {
  maySupport: [
    'which ambiguity deserves an active query',
    'which requirement needs another natural context',
    'which hypothesis has counterevidence',
    'where discovery appears saturated',
  ],
  mayNeverSupport: [
    'this machine-proposed requirement is authoritative',
    'this StandardVersion is certified',
    'promotion',
  ],
  why: 'coverage measures what has been OBSERVED about a proposal. Ratification is a person deciding '
    + 'it is theirs, and no quantity of observation performs that act.',
} as const;

/**
 * Refuse a claim that coverage is authority.
 *
 * The predicate used to AND the regex with `claim.includes(c.split(' ')[0])` over `mayNeverSupport`.
 * Those first tokens are 'this', 'this' and 'promotion' — so in practice the guard fired only on
 * claims containing the stopword "this", and let through "the requirement is authoritative" and
 * "coverage certifies the standard", which are exactly the two sentences it exists to refuse. Its
 * test passed because every case it tried happened to contain the word.
 *
 * The regex alone is the check. The example strings stay as documentation of the shape.
 */
export function assertNotAuthority(claim: string): void {
  if (/authorit|certif|promot|ratif/i.test(claim)) {
    throw new Error(`COVERAGE AUTHORITY: standard coverage cannot support "${claim}". ${COVERAGE_AUTHORITY.why}`);
  }
}

/** What a person reads. Leads with what to do, not with how much there is. */
export function describeCoverage(c: StandardCoverage): string {
  let out = `${c.why}\n\n`;
  for (const r of c.perRequirement) {
    const tag = r.states.length ? r.states.join(' · ') : 'supported';
    out += `  [${r.requirementId}] ${tag}\n      ${r.why}\n`;
  }
  if (c.acquisitionQueue.length) {
    out += `\n  Ask about ${c.acquisitionQueue[0].requirementId} first — ${c.acquisitionQueue[0].nextAction.toLowerCase().replace(/_/g, ' ')}.\n`;
  }
  return out;
}

/** Signals from held-out chain observations plus union membership. The wiring, kept in one place. */
export function signalsFromObservations(
  observations: readonly { readonly unit: GoldenUnit; readonly applicable: boolean; readonly present: boolean; readonly heldOut: boolean }[],
  framingsFound: readonly string[],
  boundaryProbed: boolean,
  hasCounterfactual: boolean,
): CoverageSignals {
  const supporting = observations.filter((o) => o.applicable && o.present);
  const counter = observations.filter((o) => o.applicable && !o.present);
  return {
    supportingUnitIds: supporting.map((o) => o.unit.unitId),
    counterUnitIds: counter.map((o) => o.unit.unitId),
    contextIds: uniq(supporting.map((o) => o.unit.provenance.contextId)),
    clusterIds: uniq(supporting.map((o) => o.unit.provenance.clusterId)),
    boundaryProbed,
    heldOutRecurrence: supporting.filter((o) => o.heldOut).length,
    framingsFound: uniq(framingsFound),
    hasCounterfactual,
  };
}
