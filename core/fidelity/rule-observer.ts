// atelier/core/fidelity/rule-observer.ts — RANKING CANDIDATES WITHOUT CERTIFYING ONE.
//
// PORTED from the rule observer in the private predecessor — the generic half. What is NOT ported,
// and why:
//
// ─── THE SHAPE THAT WAS ALREADY BUILT ────────────────────────────────────────────────
//
// An earlier from-scratch observer, since parked in the private predecessor, was
// TWO-SIDED: it judged each output SATISFIED or VIOLATED. It said SATISFIED 19 times in 33 and
// failed its bar on `dangerousClear` = P(human VIOLATED | observer SATISFIED) — the statistic a
// one-sided instrument makes UNDEFINED BY CONSTRUCTION. The original had already reasoned this out:
//
//   "A detector that says 'I did not find the violation' is not a detector that says 'the rule is
//    satisfied' ... a two-sided reading of a cheap proxy is precisely how a repair gets credited for
//    suppressing the deliverable rather than fixing it."
//
// So this is not the same instrument done properly. It is a WEAKER one that is honest about being
// weak: it ORDERS candidates for a person's attention and has no path to a verdict. That is what
// makes it usable now, with no qualification campaign behind it.
//
// ─── WHAT IS DELIBERATELY LEFT BEHIND ──────────────────────────────────────────────────────────
//
// `observeCommitmentViolation` does not port. It is one rule's proxy — regexes for unlicensed
// figures in pricing recommendations — and Atelier's rules are whatever a user's work implies. A
// per-rule proxy here would have to be generated from the rule text, which is the wording-proxy trap
// `run-methods.ts` already measured producing false alarms on a real skill.
//
// The proxy therefore becomes an OPTIONAL input defaulting to UNKNOWN. Say plainly what that costs:
// with no proxy, key 1 of the ranking is constant and the order is the semantic observer's alone —
// which is the exact configuration the original ranker was rewritten to stop trusting. What survives
// is the half that still bites without a proxy: TIES ARE REPORTED, never broken by array position.
/** What a cheap instrument may honestly say about a ratified requirement. Note what is missing. */
export type RuleObservation =
  /** The violation was positively identified. Actionable, and the only positive this proxy emits. */
  | 'KNOWN_VIOLATION_PRESENT'
  /** Nothing was found. NOT satisfaction — this instrument cannot establish satisfaction. */
  | 'UNKNOWN';

/**
 * A rule-specific proxy, when one exists. There is deliberately no way to return SATISFIED — that
 * absence IS the safety property, and it is why the ranking below may trust a positive detection
 * absolutely while trusting nothing else.
 */
export type RuleProxy = (outputText: string) => RuleObservation;

/** No proxy authored for this rule. Honest, and weaker — see the header. */
export const NO_PROXY: RuleProxy = () => 'UNKNOWN';

// ── the proposer-blind pairwise observer ──────────────────────────────────────────────────────

export interface ObserverPair {
  readonly contextId: string;
  /** tag → whether that side is the CANDIDATE. Sealed; never rendered. */
  readonly key: readonly { readonly tag: 'A' | 'B'; readonly isCandidate: boolean }[];
  readonly rendered: string;
}

/**
 * Build a blind pairwise comparison on ONE ratified rule.
 *
 * `candidateFirst` is supplied by the caller from a balanced plan — the same counterbalancing the
 * discrimination probe uses — so the candidate does not sit on one side across a run.
 *
 * The prompt asks about the RULE, not about quality. A generic "which is better" question invites the
 * observer to reward fluency, which is the failure mode that produced this program's inverted
 * instruments in the first place.
 */
export function buildObserverPair(
  contextId: string,
  situation: string,
  ruleStatement: string,
  championText: string,
  candidateText: string,
  candidateFirst: boolean,
): ObserverPair {
  const first = candidateFirst ? candidateText : championText;
  const second = candidateFirst ? championText : candidateText;
  const rendered = [
    `THE SITUATION:\n${situation}`,
    '',
    `THE RULE BEING TESTED:\n${ruleStatement}`,
    '',
    'Two answers to the same situation, in random order, unlabelled. Judge ONLY against the rule above',
    '— not which is better written, longer, more confident, or more useful in general.',
    '',
    'If neither answer complies, say NEITHER. If they comply equally, say EQUAL. Those are real answers.',
    '',
    `## A\n\n${first}`,
    '',
    `## B\n\n${second}`,
    '',
    'Answer with one token: A | B | EQUAL | NEITHER',
  ].join('\n');
  return {
    contextId,
    key: [{ tag: 'A', isCandidate: candidateFirst }, { tag: 'B', isCandidate: !candidateFirst }],
    rendered,
  };
}

export type ObserverPick = 'A' | 'B' | 'EQUAL' | 'NEITHER';

/** How a candidate ranked against the champion ON THIS RULE. Ordering only — never a verdict. */
export type ObserverResult =
  | 'CANDIDATE_COMPLIES_BETTER'
  | 'CHAMPION_COMPLIES_BETTER'
  | 'EQUAL'
  /** Neither complies — the repair did not land, and the champion was not repaired either. */
  | 'NEITHER_COMPLIES';

export function foldObserverPick(pair: ObserverPair, pick: ObserverPick): ObserverResult {
  if (pick === 'EQUAL') return 'EQUAL';
  if (pick === 'NEITHER') return 'NEITHER_COMPLIES';
  const side = pair.key.find((k) => k.tag === pick);
  if (!side) throw new Error(`observer pick names no known side (${pick})`);
  return side.isCandidate ? 'CANDIDATE_COMPLIES_BETTER' : 'CHAMPION_COMPLIES_BETTER';
}

/**
 * Rank candidates for a human's attention — LEXICOGRAPHIC, and the order of the keys is the policy.
 *
 * ─── THE DEFECT THIS REPLACES (P2.1-improvement-witness-v1) ───────────────────────────────────
 *
 * The previous ranker consumed the semantic observer ALONE. Three candidates tied at
 * CANDIDATE_COMPLIES_BETTER, the tie broke on array position, and it selected the one candidate whose
 * proxy read KNOWN_VIOLATION_PRESENT while two others had the same observer preference and a clean
 * proxy. A one-sided instrument's POSITIVE detection is the one thing it says reliably, and it was
 * being overridden by the instrument with no authority.
 *
 * So:
 *   1. a POSITIVE violation detection demotes, and the semantic observer may never overturn it;
 *   2. then the observer orders what remains;
 *   3. ties are REPORTED, never resolved by array position.
 */
export interface RankInput {
  readonly candidateId: string;
  readonly result: ObserverResult;
  /** The one-sided proxy on the candidate's own output. */
  readonly proxy: RuleObservation;
}

export interface Ranking {
  /** Best-first. Candidates inside a tie group keep their input order, which carries NO meaning. */
  readonly ordered: readonly string[];
  /** Tie groups of size > 1, best-first. A finalist drawn from one of these is arbitrary. */
  readonly ties: readonly (readonly string[])[];
  /** True when the top rank is contested — the caller must not treat position 0 as a winner. */
  readonly topIsTied: boolean;
}

const OBSERVER_RANK: Record<ObserverResult, number> = {
  CANDIDATE_COMPLIES_BETTER: 0, EQUAL: 1, NEITHER_COMPLIES: 2, CHAMPION_COMPLIES_BETTER: 3,
};

export function rankByObserver(inputs: readonly RankInput[]): Ranking {
  // Key 1 dominates: a candidate the proxy caught still violating cannot outrank one it did not,
  // whatever the semantic observer preferred.
  const keyed = inputs.map((i, idx) => ({
    ...i, idx,
    k1: i.proxy === 'KNOWN_VIOLATION_PRESENT' ? 1 : 0,
    k2: OBSERVER_RANK[i.result],
  }));
  const sorted = [...keyed].sort((a, b) => a.k1 - b.k1 || a.k2 - b.k2 || a.idx - b.idx);

  const groups: string[][] = [];
  for (const c of sorted) {
    const last = groups[groups.length - 1];
    const prev = last ? keyed.find((k) => k.candidateId === last[0])! : null;
    if (prev?.k1 === c.k1 && prev.k2 === c.k2) last.push(c.candidateId);
    else groups.push([c.candidateId]);
  }
  const ties = groups.filter((g) => g.length > 1);
  return {
    ordered: sorted.map((c) => c.candidateId),
    ties,
    topIsTied: groups.length > 0 && groups[0].length > 1,
  };
}

/**
 * One line describing the ranking, including whether the top is contested.
 *
 * A contested top must be visible: picking the first element of a tie group is picking arbitrarily,
 * and a witness that reports "finalist: c1" without saying it was tied has hidden the arbitrariness.
 */
export function describeRanking(r: Ranking): string {
  const head = `order: ${r.ordered.join(' > ')}`;
  if (!r.ties.length) return `${head} (no ties)`;
  const t = r.ties.map((g) => `{${g.join(', ')}}`).join(' ');
  return `${head} — TIES ${t}${r.topIsTied ? '  <-- TOP IS TIED: any finalist drawn from it is arbitrary' : ''}`;
}
