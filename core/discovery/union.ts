// atelier/core/discovery/union.ts — N FRAMINGS IN, ONE RATIFIABLE LIST OUT, NOTHING DROPPED.
//
// ─── THE ONE INVARIANT ─────────────────────────────────────────────────────────────────────────
//
// EVERY input rule appears in exactly one output member. The matcher groups; it never filters.
//
// That is not fastidiousness. The whole reason to run a second framing is that the first one MISSES
// things, and a merge step that silently drops a rule because an unqualified matcher thought it was a
// near-duplicate would throw away the exact material the second framing was bought to find. Grouping
// is reversible and a person can split a bad group; dropping is not, and nobody sees what went.
//
// `assertNothingDropped` is checked on every call rather than tested once, because the failure is
// invisible in the output: a union that quietly lost two rules looks exactly like a union that had
// two fewer rules to begin with.
//
// ─── THE MATCHER IS UNQUALIFIED, AND THAT IS ACCEPTABLE FOR THIS JOB ONLY ──────────────────────
//
// No qualification campaign stands behind it. It is used here to ORDER A PERSON'S ATTENTION — which
// rules to read together, which to read first — and never to decide anything. Every rule reaches
// ratification whatever the matcher says. Its errors cost a person a moment of re-reading; they
// cannot cost a rule.
//
// It would NOT be acceptable for an absolute overlap number. It is acceptable for a CONTRAST measured
// by one instrument applied identically to both arms, which is how the framing-vs-noise result was
// obtained, and it is acceptable for grouping that decides nothing.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { FramingId } from './framing.js';

/** A rule, tagged with the vantage that produced it. */
export interface FramedRule<T> { readonly framing: FramingId; readonly index: number; readonly rule: T }

export interface UnionMember<T> {
  /** every input rule expressing this decision. Length 1 is the common case and is not a defect. */
  readonly rules: readonly FramedRule<T>[];
  /** the framings that independently arrived at it */
  readonly framings: readonly FramingId[];
  /**
   * Found by more than one framing.
   *
   * CONSUMER, named here because a typed field without one is decoration: the ratification view sorts
   * on it, so rules two independent vantages both reached are read first. It is an attention order and
   * NOT a confidence score — a rule only one framing found is not thereby weaker, and the recorded
   * result is precisely that the single-framing finds are where the value hides.
   */
  readonly crossFramingAgreement: boolean;
}

export interface RuleUnion<T> {
  readonly members: readonly UnionMember<T>[];
  readonly perFramingCount: Readonly<Record<string, number>>;
  /** distinct decisions after grouping — the number that matters against a single framing's count */
  readonly distinctCount: number;
  /** how many cross-framing pairs the matcher actually joined */
  readonly matchedPairs: number;
  /**
   * Groups formed from ONE vantage's own output — the same decision stated twice by one proposer.
   *
   * CONSUMER: `describeUnion` reports it, because a non-zero count is diagnostic rather than
   * cosmetic. It means the proposer padded, and the usual cause is a schema asking for more rules
   * than the evidence contains.
   */
  readonly withinVantageDuplicates: number;
  /**
   * Several vantages ran, every one returned rules, and the matcher joined NOTHING.
   *
   * CONSUMER: `describeUnion` prints it, and the chain caller reads it before committing to the
   * downstream observation calls — which is where the cost lands. Every proposed rule is observed
   * against every held-out document, so a union that failed to merge does not merely look untidy, it
   * DOUBLES the most expensive stage of discovery. Silent degradation here is a budget event.
   *
   * It is a SUSPICION and never an error. Genuinely disjoint vantages exist: the unguided arm
   * overlapped a guided one at 12% on the recorded corpus, so a zero is possible. The observed
   * cross-framing range was 12-63%, which makes an exact zero unlikely enough to say out loud and
   * not unlikely enough to refuse on.
   */
  readonly suspectMatcherFailure: boolean;
  readonly costUsd: number;
}

const MATCH_SYSTEM = `Two lists of writing rules, each inferred from the same author's work by a different process.

For EVERY rule in LIST 1, decide whether LIST 2 contains a rule expressing SUBSTANTIALLY THE SAME
DECISION about how to write — same choice, same trigger, whatever the wording. Give its index, or null.

Same decision described differently = a MATCH.
Two rules about the same TOPIC that tell the writer to do DIFFERENT things = NOT a match.
A rule that is strictly more specific than the other = NOT a match; it decides something extra.

Be strict and be consistent.`;

const MATCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    matches: { type: 'array', items: { type: 'object', properties: {
      leftIndex: { type: 'number' },
      matchedRightIndex: { type: ['number', 'null'] },
    }, required: ['leftIndex', 'matchedRightIndex'], additionalProperties: false } },
  }, required: ['matches'], additionalProperties: false,
};

async function matchOneWay(
  client: InferenceClient, budget: Budget, left: readonly string[], right: readonly string[],
): Promise<(number | null)[]> {
  if (!left.length || !right.length) return left.map(() => null);
  const r = await spend(budget, 0.04, async () => {
    const x = await client.complete({
      stableBlock: MATCH_SYSTEM,
      variableBlock: `LIST 1\n${left.map((s, i) => `${i}. ${s}`).join('\n')}\n\nLIST 2\n${right.map((s, i) => `${i}. ${s}`).join('\n')}`,
      userMessage: 'Emit one entry for every rule in LIST 1.',
      toolName: 'emit_matches', toolDescription: 'Match LIST 1 rules to LIST 2.',
      schema: MATCH_SCHEMA, maxTokens: 2500,
    });
    return { value: x, cost: x.cost };
  });
  const m = (r.json as { matches?: { leftIndex: number; matchedRightIndex: number | null }[] } | null)?.matches ?? [];
  return left.map((_, i) => {
    const hit = m.find((x) => x.leftIndex === i)?.matchedRightIndex;
    return typeof hit === 'number' && hit >= 0 && hit < right.length ? hit : null;
  });
}

/**
 * Union N framed proposals.
 *
 * A match is taken only when BOTH directions agree — left→right names right, and right→left names
 * left back. A one-sided match is left ungrouped, because the two rules are then not interchangeable
 * and merging them would hide whichever one is the more specific.
 */
export async function unionFramedRules<T>(
  client: InferenceClient, budget: Budget,
  byFraming: readonly { framing: FramingId; rules: readonly T[] }[],
  statementOf: (r: T) => string,
): Promise<RuleUnion<T>> {
  const before = budget.spentUsd;
  const all: FramedRule<T>[] = byFraming.flatMap((f) => f.rules.map((rule, index) => ({ framing: f.framing, index, rule })));

  // group id per input rule; starts as its own singleton
  const group = new Map<string, string>();
  const keyOf = (f: FramedRule<T>): string => `${f.framing}:${f.index}`;
  for (const f of all) group.set(keyOf(f), keyOf(f));
  const find = (k: string): string => { let c = k; while (group.get(c) !== c) c = group.get(c)!; return c; };
  const join = (a: string, b: string): void => { const ra = find(a), rb = find(b); if (ra !== rb) group.set(ra, rb); };

  // ── WITHIN ONE VANTAGE FIRST ────────────────────────────────────────────────────────────
  //
  // The union deduplicated ACROSS vantages and never WITHIN one, so a proposer that met the same
  // decision in two different documents and stated it twice sailed through. Observed on a live
  // corpus: "link to the authoritative document rather than restating it" arrived once from
  // AGENTS.md and again from CONTRIBUTING.md as separate rules.
  //
  // Same reciprocity rule as the cross-vantage pass — both directions must name each other — and
  // self-matches are excluded, since every rule trivially matches itself.
  for (const f of byFraming) {
    if (f.rules.length < 2) continue;
    const ss = f.rules.map(statementOf);
    const fwd = await matchOneWay(client, budget, ss, ss);
    fwd.forEach((hit, li) => {
      if (hit === null || hit === li) return;
      if (fwd[hit] === li || fwd[hit] === hit) join(`${f.framing}:${li}`, `${f.framing}:${hit}`);
    });
  }

  for (let i = 0; i < byFraming.length; i += 1) {
    for (let j = i + 1; j < byFraming.length; j += 1) {
      const L = byFraming[i], R = byFraming[j];
      const ls = L.rules.map(statementOf), rs = R.rules.map(statementOf);
      const fwd = await matchOneWay(client, budget, ls, rs);
      const rev = await matchOneWay(client, budget, rs, ls);
      fwd.forEach((hit, li) => {
        // BOTH directions must agree. A one-sided match is not a duplicate.
        if (hit !== null && rev[hit] === li) join(`${L.framing}:${li}`, `${R.framing}:${hit}`);
      });
    }
  }

  const buckets = new Map<string, FramedRule<T>[]>();
  for (const f of all) {
    const root = find(keyOf(f));
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root)!.push(f);
  }

  const members: UnionMember<T>[] = [...buckets.values()].map((rules) => {
    const framings = [...new Set(rules.map((r) => r.framing))].sort();
    return { rules, framings, crossFramingAgreement: framings.length > 1 };
  }).sort((a, b) =>
    Number(b.crossFramingAgreement) - Number(a.crossFramingAgreement)
    || a.rules[0].framing.localeCompare(b.rules[0].framing)
    || a.rules[0].index - b.rules[0].index);

  assertNothingDropped(all.length, members);

  const matchedPairs = all.length - members.length;
  // duplicates the SAME vantage produced — the quota tell. A vantage asked for a count it could not
  // fill honestly will state one decision twice, and this is where that shows up.
  const withinVantage = members.filter((m) => m.rules.length > 1 && m.framings.length === 1).length;
  return {
    members,
    perFramingCount: Object.fromEntries(byFraming.map((f) => [f.framing, f.rules.length])),
    distinctCount: members.length,
    matchedPairs, withinVantageDuplicates: withinVantage,
    suspectMatcherFailure: byFraming.length > 1 && byFraming.every((f) => f.rules.length > 0) && matchedPairs === 0,
    costUsd: budget.spentUsd - before,
  };
}

/**
 * The invariant, checked every call.
 *
 * A union that lost rules is indistinguishable from a union that never had them, which is why this
 * cannot be a test that runs once in CI and is trusted thereafter.
 */
export function assertNothingDropped<T>(inputCount: number, members: readonly UnionMember<T>[]): void {
  const out = members.reduce((n, m) => n + m.rules.length, 0);
  if (out !== inputCount) {
    throw new Error(
      `DISCOVERY UNION: ${inputCount} rules went in and ${out} came out. The union groups rules; it must `
      + 'never drop one. A second framing is bought precisely to find what the first missed, and losing '
      + 'its finds to a near-duplicate call would discard the thing that was paid for.');
  }
  const seen = new Set<string>();
  for (const m of members) for (const r of m.rules) {
    const k = `${r.framing}:${r.index}`;
    if (seen.has(k)) throw new Error(`DISCOVERY UNION: rule ${k} appears in more than one member.`);
    seen.add(k);
  }
}

/** What a person reads. Leads with the number that justifies the second call. */
export function describeUnion<T>(u: RuleUnion<T>, statementOf: (r: T) => string): string {
  const per = Object.entries(u.perFramingCount).map(([f, n]) => `${f}: ${n}`).join(', ');
  const shared = u.members.filter((m) => m.crossFramingAgreement).length;
  let out = '';
  if (u.withinVantageDuplicates) {
    out += `  NOTE: ${u.withinVantageDuplicates} decision(s) were stated TWICE by a single vantage and have been\n`
      + `  merged. One proposer describing the same choice in two ways usually means it was asked for\n`
      + `  more rules than the work contains.\n\n`;
  }
  if (u.suspectMatcherFailure) {
    out += `  NOTE: ${Object.keys(u.perFramingCount).length} vantages ran and none of their rules were matched to\n`
      + `  each other. On measured corpora these overlap 12-63%, so an exact zero usually means the\n`
      + `  matcher failed rather than that the vantages disagreed completely. Nothing was lost — every\n`
      + `  rule is below — but each one will be checked against every held-out piece, so this run costs\n`
      + `  about twice what a merged one would.\n\n`;
  }
  out += `${u.distinctCount} distinct rules from ${Object.keys(u.perFramingCount).length} vantages (${per}).\n`
    + `  ${shared} were found by more than one vantage; ${u.distinctCount - shared} by only one.\n`
    + `  Rules only one vantage found are NOT weaker — on the recorded corpus they are where the\n`
    + `  author's own most central rules turned up. They are listed second because they need more\n`
    + `  of your attention, not less.\n\n`;
  for (const m of u.members) {
    out += `  [${m.framings.join('+')}] ${statementOf(m.rules[0].rule)}\n`;
    for (const alt of m.rules.slice(1)) out += `        also, as ${alt.framing} put it: ${statementOf(alt.rule)}\n`;
  }
  return out;
}
