// atelier/core/measurement/longitudinal.ts — WHAT THE EVIDENCE ACTUALLY SAYS, FOR ONE FROZEN STANDARD.
//
// The loop could fire, diagnose and repair, and remember none of it in a form anything could read
// back. `listInvocations` had two callers: printing the last three, and gating one promotion. This
// is the layer that turns a pile of records into answers to the questions a convergence decision
// actually rests on.
//
// ─── IT REUSES THE RECORDS THAT ALREADY EXIST ──────────────────────────────────────────────────
//
// InvocationRecord, FeedbackRecord and the append-only repair events are the substrate. Nothing new
// is persisted here and no parallel store is created — the shape of the answer was missing, not the
// data.
//
// ─── AND IT NEVER COLLAPSES NESTED GENERATIONS INTO INDEPENDENT n ──────────────────────────────
//
// Every count that could be read as statistical strength is reported as INDEPENDENT CONTEXTS, with
// the raw observation count beside it. The gap between the two is the whole reason this layer is
// careful: the v2 campaign's "n=60" was 2 contexts, and nothing in the system said so.
//
// Pure module — zero I/O. The caller reads the store; this decides what it means.

import type { Observation, DomainState } from './observation.js';
import { tally, claimability, normalisedWeights, domainState } from './observation.js';
import type { RepairRecord, Prohibition } from '../architecture/repair-memory.js';

export interface RequirementEvidence {
  readonly requirementId: string;
  /** contexts in which this requirement was exercised at all — the denominator that matters */
  readonly independentContexts: number;
  /** raw observations, which repetition inflates. Shown beside the above, never instead of it. */
  readonly observations: number;
  /** contexts with more than one generation, and the largest such nesting */
  readonly nestedContexts: number;
  readonly maxGenerationsInOneContext: number;
  readonly byVerdict: ReturnType<typeof tally>;
  /** verdicts that differ WITHIN one context — the same skill, the same task, two answers */
  readonly mixedWithinContext: readonly string[];
  /** distinct contexts in which a miss was observed. Recurrence across contexts, never within one. */
  readonly recurringMissContexts: number;
  /** BEHAVIOUR claimability. Named for its domain so it cannot be read as a general one. */
  readonly claim: ReturnType<typeof claimability>;
  /** the two domains, reported separately because neither is evidence for the other */
  readonly delivery: DomainState;
  readonly behavior: DomainState;
  /** observations that speak to behaviour at all — the denominator symptoms are drawn from */
  readonly behaviorObservations: number;
  readonly repairs: readonly RepairRecord[];
  readonly prohibitions: readonly Prohibition[];
}

/** Verdicts that count as a miss. Supplied by the caller because each instrument has its own words. */
export type MissVerdicts = ReadonlySet<string>;

export function evidenceFor(
  requirementId: string,
  observations: readonly Observation[],
  repairs: readonly RepairRecord[],
  prohibitions: readonly Prohibition[],
  missVerdicts: MissVerdicts,
): RequirementEvidence {
  const all = observations.filter((o) => o.requirementId === requirementId);
  // EVERY behavioural question is asked of behavioural observations only. A delivery check is
  // deterministic and trustworthy about delivery; it is silent about whether the rule was followed.
  const obs = all.filter((o) => o.domain === 'BEHAVIOR');

  const byContext = new Map<string, Observation[]>();
  for (const o of obs) byContext.set(o.contextId, [...(byContext.get(o.contextId) ?? []), o]);

  const mixed = [...byContext.entries()]
    .filter(([, os]) => new Set(os.map((o) => o.verdict)).size > 1)
    .map(([c]) => c);

  const missContexts = new Set(obs.filter((o) => missVerdicts.has(o.verdict)).map((o) => o.contextId));

  return {
    requirementId,
    independentContexts: byContext.size,
    observations: obs.length,
    nestedContexts: [...byContext.values()].filter((os) => os.length > 1).length,
    maxGenerationsInOneContext: Math.max(0, ...[...byContext.values()].map((os) => os.length)),
    byVerdict: tally(obs),
    mixedWithinContext: mixed,
    recurringMissContexts: missContexts.size,
    claim: claimability(all, 'BEHAVIOR'),
    delivery: domainState(all, 'DELIVERY', missVerdicts),
    behavior: domainState(all, 'BEHAVIOR', missVerdicts),
    behaviorObservations: obs.length,
    repairs: repairs.filter((r) => r.requirementId === requirementId),
    prohibitions: prohibitions.filter((p) => p.requirementId === requirementId),
  };
}

/**
 * The plain-language readout.
 *
 * Every strength claim is followed by the
 * denominator it rests on, and a claim that cannot be made says why rather than being omitted.
 */
export function describeRequirementEvidence(e: RequirementEvidence): string {
  if (!e.observations) {
    return `${e.requirementId}: delivery ${e.delivery}, behaviour ${e.behavior}.\n`
      + (e.delivery === 'PROVEN'
        ? `  The rule reached the model every time it was checked. Nothing has looked at whether it was FOLLOWED —\n`
          + `  and a rule can be perfectly delivered and perfectly ignored.\n`
        : `  Nothing has looked at whether this rule is being followed.\n`);
  }

  let out = `${e.requirementId}\n`
    + `  ${e.independentContexts} independent context(s), ${e.observations} observation(s)`;
  if (e.nestedContexts) {
    out += ` — ${e.nestedContexts} context(s) produced more than one generation, up to ${e.maxGenerationsInOneContext}.\n`
      + `  Those repeats are NOT independent evidence; they are the same task answered again.\n`;
  } else out += `.\n`;

  out += `  verdicts:\n`;
  for (const t of e.byVerdict) {
    out += `    ${t.verdict.padEnd(12)} ${String(t.observations).padStart(3)} obs`
      + `   ${t.weight.toFixed(1).padStart(5)} context-weight   across ${t.contexts} context(s)\n`;
  }

  if (e.mixedWithinContext.length) {
    out += `  ${e.mixedWithinContext.length} context(s) produced DIFFERENT verdicts on repeated generations.\n`
      + `  The same skill answered the same task and was judged both ways — which is information about\n`
      + `  the skill, the instrument, or both, and cannot be resolved by counting.\n`;
  }

  out += e.recurringMissContexts > 1
    ? `  A miss recurred across ${e.recurringMissContexts} independent contexts — not one bad day.\n`
    : e.recurringMissContexts === 1
      ? `  A miss was seen in 1 context. One context is an anecdote; it is a reason to look, not a finding.\n`
      : `  No miss observed.\n`;

  out += e.claim.claimable
    ? `  These observations MAY support a statement about behaviour (${e.claim.independentContexts} independent context(s)).\n`
    : `  These observations may NOT support a statement about behaviour: ${e.claim.reason}\n`;

  if (e.prohibitions.length) {
    out += `  You ruled out: ${e.prohibitions.map((p) => `${p.from}->${p.to}`).join(', ')}\n`;
  }
  if (e.repairs.length) {
    out += `  repair history:\n`;
    for (const r of e.repairs) {
      out += `    ${r.from} -> ${r.to}  ${r.outcome.toLowerCase()}`
        + `  on ${r.evidenceBasis.missContexts} miss context(s), ${r.evaluationBasis?.generations ?? 1} generation(s)`
        + `${r.note ? ` — "${r.note}"` : ''}\n`;
    }
  }
  return out;
}

/** Every requirement in a standard, worst-evidenced first — where a reader should look. */
export function evidenceAcross(
  requirementIds: readonly string[],
  observations: readonly Observation[],
  repairs: readonly RepairRecord[],
  prohibitions: readonly Prohibition[],
  missVerdicts: MissVerdicts,
): readonly RequirementEvidence[] {
  return requirementIds
    .map((id) => evidenceFor(id, observations, repairs, prohibitions, missVerdicts))
    .sort((a, b) => a.independentContexts - b.independentContexts || a.requirementId.localeCompare(b.requirementId));
}

/** Exposed so a caller can show the inflation directly rather than being told about it. */
export { normalisedWeights };


/**
 * THE ELIGIBILITY LADDER — three different questions, three different bars.
 *
 * The first version required RECURRENT_MISS for everything, which made a single authoritative miss
 * unable to produce even a reversible experiment. That is too strict in the direction that costs
 * learning: a candidate SkillVersion changes nothing until promoted, is revertible by a pointer
 * move, and is the cheapest way to find out whether a hypothesis survives contact.
 *
 * What one miss may NOT do is promote. The strong recurrence and distributional requirements are
 * preserved exactly where they were always load-bearing — the irreversible step.
 *
 * The g9 history stays legal under this: one natural miss, hypothesis formed, candidate built,
 * evaluated, rejected. Every step was eligible; none of them was a promotion.
 */
export type Eligibility = 'NONE' | 'HYPOTHESIS_ELIGIBLE' | 'CANDIDATE_ELIGIBLE' | 'PROMOTION_ELIGIBLE';

export function eligibilityOf(e: RequirementEvidence, minContextsForPromotion = 2): {
  readonly level: Eligibility; readonly why: string;
} {
  if (e.behavior === 'UNOBSERVED') {
    return { level: 'NONE', why: 'no behavioural observation exists; delivery evidence says nothing about whether the rule was followed' };
  }
  if (!e.recurringMissContexts) {
    return { level: 'NONE', why: 'no miss observed' };
  }
  // ONE AUTHORITATIVE MISS IS ENOUGH TO EXPERIMENT. It is not enough to ship.
  if (!e.claim.claimable) {
    return { level: 'HYPOTHESIS_ELIGIBLE', why:
      'a miss was observed by an instrument that has not earned the right to be believed. That is enough to form a hypothesis and to seek discriminating evidence; it is not enough to change the skill on.' };
  }
  if (e.recurringMissContexts < minContextsForPromotion) {
    return { level: 'CANDIDATE_ELIGIBLE', why:
      `an authoritative miss in ${e.recurringMissContexts} context(s). Enough for a reversible candidate and a discriminating probe — a candidate changes nothing until promoted and is undone by a pointer move. Not enough to promote: one situation cannot distinguish an implementation problem from an occasion.` };
  }
  return { level: 'PROMOTION_ELIGIBLE', why:
    `an authoritative miss recurred across ${e.recurringMissContexts} independent contexts` };
}
