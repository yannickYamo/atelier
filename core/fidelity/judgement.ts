// core/fidelity/judgement.ts — THE CORPUS NOBODY WAS COLLECTING.
//
// Every `compare` puts a machine's ordering of two outputs on ONE rule in front of a person, and
// every `promote` or `reject` that follows is that person agreeing with it or overruling it. Both
// halves were computed and both were discarded. The observer's verdict lived in a terminal until the
// scrollback rolled; the person's decision moved a pointer and recorded that a pointer moved.
//
// So the measurement this programme has never been able to make — does the comparator order two
// outputs the way the expert whose standard it is imitating orders them — had no data. The reason was
// not that expert labels are expensive. It is that we were generating them, one per promotion, and
// writing none of them down.
//
// ─── WHAT THIS IS AND IS NOT ───────────────────────────────────────────────────────────────────
//
// It is a LEDGER. It joins two readings of the same pair and reports where they landed. It computes
// no fidelity, gates nothing, and promotes nothing.
//
// It is NOT a qualification. Agreement on pairs the repair loop happened to generate says nothing
// about the pairs it never generates, and this module states that in its own output rather than
// leaving a reader to supply the caveat. The programme's standing counter-example is a semantic
// validator that carried 100% sensitivity and 7% specificity and improved the metric it was scored
// on while measuring numeric density; a number that looks like agreement is exactly what that
// instrument would have produced.
//
// ─── WHY ORDER-DEPENDENT COMPARISONS ARE EXCLUDED FROM THE CELLS ───────────────────────────────
//
// `compareOnRule` runs both orientations and reports whether exchanging the sides left the verdict
// alone. When it did not, the instrument has said that its own answer is a reading of which text came
// first. Scoring that against a human pick would move the agreement count on a coin flip, in either
// direction. They are counted, separately, and kept out of the comparable set.
//
// Pure module — zero I/O. The caller reads the event log; this decides what it means.

import type { ObserverResult } from './rule-observer.js';

/** Which side the person adopted. There is no EQUAL: promotion and rejection both pick a side. */
export type HumanChoice = 'CANDIDATE' | 'CHAMPION';

/**
 * The machine's reading, written at `compare` time.
 *
 * Recorded whatever it says, including the verdicts that cannot be scored. An instrument that
 * declines to prefer is telling us something about itself, and dropping those rows would leave a
 * ledger that only contains the occasions the observer was willing to commit.
 */
export interface ComparisonObservedEvent {
  readonly kind: 'COMPARISON_OBSERVED';
  readonly requirementId: string;
  readonly championSkillVersionHash: string;
  readonly candidateSkillVersionHash: string;
  readonly result: ObserverResult;
  /** the instrument's own swap test. False means its verdict tracked position. */
  readonly orderInvariant: boolean;
  /** candidate length ÷ champion length, carried so a length confound stays visible in the ledger */
  readonly lengthRatio: number;
  readonly at: string;
}

/**
 * The person's reading, written at `promote` or `reject` time.
 *
 * `rationale` is the field this module exists for. A choice is one bit and cannot distinguish a
 * comparator that was right from one that was right about the wrong thing; the sentence explaining
 * the choice can.
 */
export interface JudgementRecordedEvent {
  readonly kind: 'JUDGEMENT_RECORDED';
  readonly requirementId: string;
  readonly championSkillVersionHash: string;
  readonly candidateSkillVersionHash: string;
  readonly choice: HumanChoice;
  readonly rationale: string | null;
  readonly at: string;
}

/** Same rule, same two versions. The unit a reading is ABOUT. */
export const pairKey = (requirementId: string, champion: string, candidate: string): string =>
  `${requirementId}|${champion}|${candidate}`;

export interface JudgementRecord {
  readonly requirementId: string;
  readonly championSkillVersionHash: string;
  readonly candidateSkillVersionHash: string;
  readonly observer: {
    readonly result: ObserverResult;
    readonly orderInvariant: boolean;
    readonly lengthRatio: number;
    readonly at: string;
  } | null;
  readonly human: {
    readonly choice: HumanChoice;
    readonly rationale: string | null;
    readonly at: string;
  } | null;
}

/** Where a pair landed once both readings are in. */
export type Concordance =
  /** both preferred the same side, and the observer's swap test held */
  | 'AGREED'
  /** both expressed a preference and they were opposite */
  | 'DISAGREED'
  /** the observer expressed no preference (EQUAL / NEITHER_COMPLIES) — not agreement, not dissent */
  | 'OBSERVER_DECLINED'
  /** the observer's verdict flipped when the sides were exchanged, so it has no stable answer here */
  | 'ORDER_DEPENDENT'
  /** one of the two readings is missing */
  | 'INCOMPLETE';

export function concordanceOf(r: JudgementRecord): Concordance {
  if (!r.observer || !r.human) return 'INCOMPLETE';
  if (!r.observer.orderInvariant) return 'ORDER_DEPENDENT';
  if (r.observer.result === 'EQUAL' || r.observer.result === 'NEITHER_COMPLIES') return 'OBSERVER_DECLINED';
  const observerPicked: HumanChoice =
    r.observer.result === 'CANDIDATE_COMPLIES_BETTER' ? 'CANDIDATE' : 'CHAMPION';
  return observerPicked === r.human.choice ? 'AGREED' : 'DISAGREED';
}

const isComparison = (e: Record<string, unknown>): e is ComparisonObservedEvent & Record<string, unknown> =>
  e.kind === 'COMPARISON_OBSERVED';
const isJudgement = (e: Record<string, unknown>): e is JudgementRecordedEvent & Record<string, unknown> =>
  e.kind === 'JUDGEMENT_RECORDED';

/**
 * Join the two readings on the pair they are both about.
 *
 * LAST WRITE WINS PER SIDE, and deliberately so: re-running `compare` on the same pair produces a
 * second, independent sample of a stochastic instrument, and the ledger should hold the reading that
 * was in front of the person when they decided. Ordering follows the log, so the caller controls it.
 */
export function foldJudgements(events: readonly Record<string, unknown>[]): readonly JudgementRecord[] {
  const byKey = new Map<string, JudgementRecord>();
  const seed = (requirementId: string, champion: string, candidate: string): JudgementRecord =>
    byKey.get(pairKey(requirementId, champion, candidate))
    ?? { requirementId, championSkillVersionHash: champion, candidateSkillVersionHash: candidate,
      observer: null, human: null };

  for (const e of events) {
    if (isComparison(e)) {
      const base = seed(e.requirementId, e.championSkillVersionHash, e.candidateSkillVersionHash);
      byKey.set(pairKey(e.requirementId, e.championSkillVersionHash, e.candidateSkillVersionHash), {
        ...base,
        observer: { result: e.result, orderInvariant: e.orderInvariant, lengthRatio: e.lengthRatio, at: e.at },
      });
    } else if (isJudgement(e)) {
      const base = seed(e.requirementId, e.championSkillVersionHash, e.candidateSkillVersionHash);
      byKey.set(pairKey(e.requirementId, e.championSkillVersionHash, e.candidateSkillVersionHash), {
        ...base,
        human: { choice: e.choice, rationale: e.rationale, at: e.at },
      });
    }
  }
  return [...byKey.values()];
}

export interface Agreement {
  /** pairs with both readings, an expressed observer preference, and a surviving swap test */
  readonly comparable: number;
  readonly agreed: number;
  readonly disagreed: number;
  readonly observerDeclined: number;
  readonly orderDependent: number;
  /** the person ruled and no comparison was ever run on that pair */
  readonly humanOnly: number;
  /** a comparison was run and nobody ever ruled */
  readonly observerOnly: number;
  /** human rulings carrying a reason. The other kind cannot tell you WHY it disagreed. */
  readonly withRationale: number;
  readonly humanRulings: number;
}

/**
 * A FLOOR, NOT A POWER CALCULATION.
 *
 * Thirty is not derived from an effect size, and pretending otherwise would be the kind of borrowed
 * rigour this codebase refuses elsewhere. It is a count below which the cells are obviously
 * uninformative, chosen so the report has somewhere to refuse rather than printing a fraction over
 * four observations and letting a reader treat it as a rate.
 */
export const MIN_COMPARABLE = 30;

export function agreement(records: readonly JudgementRecord[]): Agreement {
  let agreed = 0, disagreed = 0, observerDeclined = 0, orderDependent = 0;
  let humanOnly = 0, observerOnly = 0, withRationale = 0, humanRulings = 0;

  for (const r of records) {
    if (r.human) {
      humanRulings += 1;
      if (r.human.rationale?.trim()) withRationale += 1;
    }
    switch (concordanceOf(r)) {
      case 'AGREED': agreed += 1; break;
      case 'DISAGREED': disagreed += 1; break;
      case 'OBSERVER_DECLINED': observerDeclined += 1; break;
      case 'ORDER_DEPENDENT': orderDependent += 1; break;
      case 'INCOMPLETE':
        if (r.human) humanOnly += 1;
        else if (r.observer) observerOnly += 1;
        break;
    }
  }
  return { comparable: agreed + disagreed, agreed, disagreed, observerDeclined, orderDependent,
    humanOnly, observerOnly, withRationale, humanRulings };
}

/** Every rationale a person has left on one rule, newest last. What `compare` shows before it rules. */
export function rationalesFor(
  records: readonly JudgementRecord[], requirementId: string,
): readonly { readonly choice: HumanChoice; readonly rationale: string; readonly at: string }[] {
  return records
    .flatMap((r) => {
      if (r.requirementId !== requirementId || !r.human) return [];
      const { choice, at } = r.human;
      const rationale = r.human.rationale?.trim();
      return rationale ? [{ choice, rationale, at }] : [];
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * What a person reads.
 *
 * PRINTS THE CELLS ALWAYS AND THE RATE ONLY ABOVE THE FLOOR, and attaches what the rate does not
 * establish to the line that carries it rather than to a footnote. The two limits are not stylistic
 * hedges; they are the two ways this number is actually wrong:
 *
 *   SELECTION. A pair enters this ledger only when the loop proposed a repair, a comparison was run,
 *   and someone ruled. Requirements the loop never touches contribute nothing, so the rate describes
 *   the observer on repair-generated pairs and not on the standard.
 *
 *   DIFFICULTY. Agreement is dominated by whichever pairs are easy, and an instrument that tracks
 *   length or fluency will agree on most of them. Held-out difficult pairs are what would separate
 *   the two, and this ledger does not construct them.
 */
export function describeAgreement(a: Agreement): string {
  const head = `\nObserver against you\n\n`
    + `  agreed              ${a.agreed}\n`
    + `  disagreed           ${a.disagreed}\n`
    + `  observer declined   ${a.observerDeclined}   (said EQUAL or that neither complied)\n`
    + `  order-dependent     ${a.orderDependent}   (its verdict flipped when the sides were exchanged)\n`
    + `  you ruled alone     ${a.humanOnly}   (no comparison was run on that pair)\n`
    + `  never ruled on      ${a.observerOnly}   (compared, then nobody decided)\n\n`
    + `  ${a.withRationale} of your ${a.humanRulings} ruling(s) carry a reason.\n`;

  if (a.comparable < MIN_COMPARABLE) {
    return `${head}\n`
      + `${a.comparable} comparable pair(s). Below ${MIN_COMPARABLE} this reports no rate, because a fraction over a\n`
      + `handful of pairs reads as a rate and is not one. Keep using compare and promote; the ledger fills\n`
      + `from ordinary work and needs nothing set up.\n`;
  }
  const pct = ((a.agreed / a.comparable) * 100).toFixed(0);
  return `${head}\n`
    + `  ${pct}% agreement over ${a.comparable} comparable pairs.\n\n`
    + `This does NOT qualify the observer, and two specific things keep it from doing so.\n`
    + `  Selection: a pair is here only because the loop proposed a repair and you ruled on it. Rules the\n`
    + `  loop never touches are absent, so this describes the observer on the pairs it generated.\n`
    + `  Difficulty: easy pairs dominate any such count, and an instrument reading length or fluency\n`
    + `  agrees on most easy pairs. Separating those needs held-out hard pairs, which this does not build.\n\n`
    + `What it IS good for: the disagreements. Read those with your own reasons beside them — that is the\n`
    + `only place the instrument tells you what it is actually measuring.\n`;
}

/** The ledger itself, newest last. Disagreements first because they are the rows worth reading. */
export function describeJudgements(records: readonly JudgementRecord[]): string {
  if (!records.length) {
    return '\nNo judgements recorded yet. `atelier compare` writes the observer\'s reading and\n'
      + '`atelier promote --why` / `atelier reject --why` write yours.\n';
  }
  const rank: Record<Concordance, number> = {
    DISAGREED: 0, ORDER_DEPENDENT: 1, OBSERVER_DECLINED: 2, AGREED: 3, INCOMPLETE: 4,
  };
  const rows = [...records]
    .sort((a, b) => rank[concordanceOf(a)] - rank[concordanceOf(b)])
    .map((r) => {
      const c = concordanceOf(r);
      const obs = r.observer
        ? `${r.observer.result}${r.observer.orderInvariant ? '' : ' (order-dependent)'} · len ×${r.observer.lengthRatio.toFixed(2)}`
        : '(never compared)';
      const hum = r.human ? `you chose ${r.human.choice}` : '(you never ruled)';
      const why = r.human?.rationale?.trim() ? `\n        because: ${r.human.rationale.trim()}` : '';
      return `  ${c.padEnd(17)} ${r.requirementId}  ${r.championSkillVersionHash.slice(0, 8)} vs ${r.candidateSkillVersionHash.slice(0, 8)}\n`
        + `        observer: ${obs}\n`
        + `        ${hum}${why}`;
    }).join('\n');
  return `\nJudgement ledger\n\n${rows}\n`;
}
