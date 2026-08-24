// atelier/core/architecture/repair-memory.ts — WHAT WAS TRIED, ON WHAT EVIDENCE, AND WHAT CAME OF IT.
//
// The loop could propose a repair, build a candidate, have a person reject it, and propose the
// identical repair on the next complaint about the same rule — forever, reading each re-derivation
// as a fresh idea. The g9 repair is the witnessed case: proposed, built, evaluated, REJECTED, and
// that negative lived only in a session transcript.
//
// ─── A REJECTION IS EVIDENCE, AND IT IS THE EVIDENCE MOST EASILY LOST ──────────────────────────
//
// A promotion leaves a trace by construction: the pointer moves. A rejection changes nothing, which
// is exactly why it has to be written down deliberately. A system that remembers only what worked
// will re-derive what did not, forever.
//
// ─── AND A REJECTION IS NOT A PROHIBITION. THE FIRST VERSION MADE IT ONE. ──────────────────────
//
// The first version keyed refusal on rule + transition alone, so ONE rejection permanently closed an
// architecture family. That is wrong, and it contradicts what the g9 result actually established:
//
//   observed:   PROSE -> SELF_CHECK, one natural candidate, still produced unsupported numbers, REJECT
//   means:      THIS candidate did not demonstrate improvement
//   NOT:        SELF_CHECK can never help g9 under any future evidence
//
// One generation is stochastic. Banning the transition forever converts a single weak observation
// into a permanent architectural law, which is precisely the move this system exists to prevent —
// an optimizer's own history acquiring authority nobody granted it. It also makes Atelier unable to
// learn statistically: the evidence that would justify reconsidering can never be gathered, because
// the attempt that would gather it is forbidden.
//
// So the policy has two halves that must not be confused:
//
//   LAUNDERING — forbidden absolutely. The same transition, retried on evidence no stronger than the
//                evidence that already failed, is the rejected candidate returning under a new hash.
//   RECONSIDERATION — permitted. The same transition, on materially STRONGER evidence, is a
//                different question. The prior rejection travels with it as a prior, never as a veto.
//
// ─── AND "REJECT THIS CANDIDATE" IS NOT "NEVER USE THIS TRANSITION" ───────────────────────────
//
// Those are two different human statements and only one of them was made. The second is an
// architectural constraint carrying expert authority, so it is a SEPARATE, EXPLICIT event that a
// person has to author — never inferred from a rejection. `TRANSITION_FORBIDDEN` is absolute
// because a person said the absolute thing; `REPAIR_SETTLED/REJECTED` is not, because they did not.
//
// ─── APPEND-ONLY, FOLDED — REUSING THE EVENT LOG THAT ALREADY EXISTS ───────────────────────────
//
// A repair attempt, its outcome, and any prohibition are EVENTS in `appendEvent`/`readEvents`, and
// the current state is folded. `putByHash` refuses differing content under an existing id precisely
// so records cannot be quietly rewritten; a mutable surface beside it would make the store
// immutable-except-here, which is not a property.
//
// Pure module — zero I/O. The caller reads the event log; this decides what it means.

import type { Carrier } from './compile.js';

export type RepairOutcome = 'PENDING' | 'PROMOTED' | 'REJECTED';

/**
 * WHY the repair was proposed — the strength of the miss behind it.
 *
 * `missContexts` is the count of INDEPENDENT contexts in which the requirement was observed missed.
 * One is the weakest possible basis and is what g9 had. Six would be a different claim about the
 * same transition, which is the whole point of recording it.
 */
export interface EvidenceBasis {
  readonly missContexts: number;
  readonly invocationIds: readonly string[];
}

/** HOW the candidate was judged. An instrument with no authority produces a weak evaluation. */
export interface EvaluationBasis {
  /** how many generations of the candidate were looked at. One is stochastic. */
  readonly generations: number;
  readonly instrument: 'HUMAN_EYE' | 'UNQUALIFIED_COMPARATOR' | 'QUALIFIED_OBSERVER';
  /** null when the instrument does not report it */
  readonly orderInvariant: boolean | null;
}

export const WEAKEST_EVIDENCE: EvidenceBasis = { missContexts: 1, invocationIds: [] };
export const WEAKEST_EVALUATION: EvaluationBasis = { generations: 1, instrument: 'HUMAN_EYE', orderInvariant: null };

const INSTRUMENT_STRENGTH: Record<EvaluationBasis['instrument'], number> = {
  HUMAN_EYE: 0, UNQUALIFIED_COMPARATOR: 0, QUALIFIED_OBSERVER: 1,
};

export interface RepairProposedEvent {
  readonly kind: 'REPAIR_PROPOSED';
  readonly repairId: string;
  readonly skillName: string;
  readonly requirementId: string;
  readonly from: Carrier;
  readonly to: Carrier;
  readonly sourceSkillVersionHash: string;
  readonly candidateSkillVersionHash: string;
  readonly evidenceBasis: EvidenceBasis;
  readonly at: string;
}

export interface RepairSettledEvent {
  readonly kind: 'REPAIR_SETTLED';
  readonly repairId: string;
  readonly outcome: 'PROMOTED' | 'REJECTED';
  readonly evaluationBasis: EvaluationBasis;
  readonly at: string;
  readonly note: string | null;
}

/**
 * A person stating an architectural constraint, deliberately and separately.
 *
 * This is the ONLY absolute prohibition in the module, and it exists so that "never use self-checks
 * for this rule" has somewhere to live that is not a side effect of "this candidate was worse".
 */
export interface TransitionForbiddenEvent {
  readonly kind: 'TRANSITION_FORBIDDEN';
  readonly requirementId: string;
  readonly from: Carrier;
  readonly to: Carrier;
  readonly by: string;
  readonly reason: string;
  readonly at: string;
}

/** The folded view. Never stored — always derived, so it cannot disagree with the log. */
export interface RepairRecord {
  readonly repairId: string;
  readonly skillName: string;
  readonly requirementId: string;
  readonly from: Carrier;
  readonly to: Carrier;
  readonly sourceSkillVersionHash: string;
  readonly candidateSkillVersionHash: string;
  readonly evidenceBasis: EvidenceBasis;
  readonly evaluationBasis: EvaluationBasis | null;
  readonly at: string;
  readonly outcome: RepairOutcome;
  readonly outcomeAt: string | null;
  readonly note: string | null;
}

export type Prohibition = Omit<TransitionForbiddenEvent, 'kind'>;

/** The transition family: same rule, same move. */
export const repairKey = (requirementId: string, from: Carrier, to: Carrier): string =>
  `${requirementId}|${from}->${to}`;

/**
 * Is `next` materially stronger evidence than what already failed?
 *
 * Dominance, not a score: at least one dimension strictly better and none worse. A scalar would let
 * an optimizer buy a retry by inflating the cheap dimension — running the same weak candidate twice
 * to "outweigh" a single-context miss — which is how a threshold becomes a target.
 */
export function strictlyStronger(
  next: { evidence: EvidenceBasis; evaluation: EvaluationBasis },
  prior: { evidence: EvidenceBasis; evaluation: EvaluationBasis },
): boolean {
  const dims: readonly (readonly [number, number])[] = [
    [next.evidence.missContexts, prior.evidence.missContexts],
    [next.evaluation.generations, prior.evaluation.generations],
    [INSTRUMENT_STRENGTH[next.evaluation.instrument], INSTRUMENT_STRENGTH[prior.evaluation.instrument]],
  ];
  return dims.every(([a, b]) => a >= b) && dims.some(([a, b]) => a > b);
}

export type RepairJudgement =
  | { readonly allowed: true; readonly priors: readonly RepairRecord[]; readonly note: string | null }
  | { readonly allowed: false; readonly reason: string };

/**
 * May this repair be proposed?
 *
 * Order matters and is the policy:
 *   1. an explicit human prohibition is absolute — a person said the absolute thing;
 *   2. an unjudged candidate blocks, because asking for a second decision before the first is made
 *      hands the person a choice they did not ask for;
 *   3. a prior REJECTION blocks ONLY while the new evidence is no stronger than the evidence that
 *      already failed. That is the laundering case: the same move, retried on the same grounds.
 *   4. otherwise it is allowed, and every prior rejection travels with it as a PRIOR — visible,
 *      never a veto.
 */
export function mayPropose(
  history: readonly RepairRecord[],
  prohibitions: readonly Prohibition[],
  requirementId: string, from: Carrier, to: Carrier,
  proposed: { evidence: EvidenceBasis; evaluation: EvaluationBasis },
): RepairJudgement {
  const key = repairKey(requirementId, from, to);

  const banned = prohibitions.find((p) => repairKey(p.requirementId, p.from, p.to) === key);
  if (banned) {
    return { allowed: false, reason:
      `you ruled that ${requirementId} must not move ${from} -> ${to}: "${banned.reason}". `
      + `That is a decision about your architecture, not about one candidate, so no evidence reopens it here — `
      + `it is yours to withdraw.` };
  }

  const prior = history.filter((r) => repairKey(r.requirementId, r.from, r.to) === key);

  const pending = prior.find((r) => r.outcome === 'PENDING');
  if (pending) {
    return { allowed: false, reason:
      `${requirementId} already has an unjudged candidate for this change (${pending.candidateSkillVersionHash}). `
      + `Run it and decide before another is made:\n`
      + `  atelier compare --skill ${pending.skillName} --candidate ${pending.candidateSkillVersionHash} --rule ${requirementId}` };
  }

  const rejections = prior.filter((r) => r.outcome === 'REJECTED');
  const notOutgrown = rejections.filter((r) => !strictlyStronger(proposed, {
    evidence: r.evidenceBasis, evaluation: r.evaluationBasis ?? WEAKEST_EVALUATION,
  }));

  if (notOutgrown.length) {
    const r = notOutgrown[0];
    const b = r.evidenceBasis, e = r.evaluationBasis ?? WEAKEST_EVALUATION;
    return { allowed: false, reason:
      `this move was already tried on ${requirementId} and you rejected it`
      + `${r.note ? `, saying: "${r.note}"` : ''}. `
      + `That attempt rested on ${b.missContexts} observed miss(es) and ${e.generations} generation(s) judged by `
      + `${e.instrument.toLowerCase().replace(/_/g, ' ')}, and this one is no stronger — so it is the same question, `
      + `not a new one.\n`
      + `  It is NOT ruled out. More independent misses, more generations, or a qualified instrument would make it a `
      + `different question and it would be proposed again.` };
  }

  return {
    allowed: true, priors: rejections,
    note: rejections.length
      ? `This move was rejected before, on weaker evidence. Treat that as a prior, not a verdict: `
        + `one generation is stochastic, and what failed once under a single observed miss is not thereby impossible.`
      : null,
  };
}

/**
 * Fold the event log into the current view.
 *
 * FIRST settlement wins. A second one is ignored rather than overwriting: "you rejected this, then
 * something recorded that you promoted it" is a contradiction, and letting the later write silently
 * decide is how a rejection disappears.
 */
export function foldRepairs(events: readonly Record<string, unknown>[]): readonly RepairRecord[] {
  const byId = new Map<string, RepairRecord>();
  for (const e of events) {
    if (e.kind !== 'REPAIR_PROPOSED') continue;
    const p = e as unknown as RepairProposedEvent;
    if (byId.has(p.repairId)) continue;
    byId.set(p.repairId, {
      ...p, evidenceBasis: p.evidenceBasis ?? WEAKEST_EVIDENCE,
      evaluationBasis: null, outcome: 'PENDING', outcomeAt: null, note: null,
    });
  }
  for (const e of events) {
    if (e.kind !== 'REPAIR_SETTLED') continue;
    const s = e as unknown as RepairSettledEvent;
    const cur = byId.get(s.repairId);
    if (cur?.outcome !== 'PENDING') continue;
    byId.set(s.repairId, { ...cur, outcome: s.outcome, outcomeAt: s.at, note: s.note,
      evaluationBasis: s.evaluationBasis ?? WEAKEST_EVALUATION });
  }
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Explicit human prohibitions, which are a different thing from rejections. */
export function foldProhibitions(events: readonly Record<string, unknown>[]): readonly Prohibition[] {
  return events.filter((e) => e.kind === 'TRANSITION_FORBIDDEN')
    .map((e) => { const { kind: _kind, ...rest } = e as unknown as TransitionForbiddenEvent; return rest; });
}

/** What the person is shown about a rule's repair history. Rejections carry their basis. */
export function describeHistory(
  history: readonly RepairRecord[], prohibitions: readonly Prohibition[], requirementId: string,
): string {
  const mine = history.filter((r) => r.requirementId === requirementId);
  const bans = prohibitions.filter((p) => p.requirementId === requirementId);
  if (!mine.length && !bans.length) return `No repair has been attempted on ${requirementId}.`;

  let out = '';
  if (bans.length) {
    out += `You ruled these out for ${requirementId}:\n`
      + bans.map((b) => `  ${b.from} -> ${b.to}  — "${b.reason}"`).join('\n') + '\n';
  }
  if (!mine.length) return out;

  const line = (r: RepairRecord): string => {
    const e = r.evaluationBasis ?? WEAKEST_EVALUATION;
    const basis = `on ${r.evidenceBasis.missContexts} miss(es), ${e.generations} generation(s)`;
    return `  ${r.from} -> ${r.to}  ${r.outcome.toLowerCase()} ${basis}`
      + `${r.note ? ` — "${r.note}"` : ''}  (${r.candidateSkillVersionHash.slice(0, 8)})`;
  };
  const rejected = mine.filter((r) => r.outcome === 'REJECTED');
  const rest = mine.filter((r) => r.outcome !== 'REJECTED');

  out += `${mine.length} repair attempt(s) on ${requirementId}:\n`;
  if (rejected.length) out += `${rejected.map(line).join('\n')}\n`;
  if (rest.length) out += `${rest.map(line).join('\n')}\n`;
  return out;
}
