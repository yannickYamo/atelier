// atelier/core/mining/recurrence.ts — WHAT KEEPS GOING WRONG, FROM EVERYTHING THE LOOP HAS RECORDED.
//
// Skill-discovery loops find skills in the failures of many executions (arXiv:2603.02766): one failure
// is an anecdote, the same failure ten times is a missing skill. Atelier's version keeps that and
// changes who decides. It
// reads what the system has already recorded, finds what recurs, and puts each recurrence to the owner
// as a proposal they can accept, reword or ignore. It never adds a rule by itself.
//
// Four kinds of recurrence, each pointing at a different remedy:
//
//   GAP          complaints that say the same thing, about no rule the standard has
//                → a rule to add (the owner's words, or a proposal they approve)
//   MISSED_RULE  complaints attributed to the same rule, again and again
//                → the rule is not reaching the model: `optimize` or `fix --reflect`, or re-wording it
//   BROKEN_DRAFT a measured rule the first draft breaks most of the time, repaired every time
//                → the loop is paying for it on every run; a different carrier may prevent it
//   LOST_MEANING a rule whose repairs keep being refused for changing what the text claims
//                → the rule may conflict with how the author qualifies claims; a question about the rule
//
// Deterministic: complaints are grouped by the content words they share (average link over the share
// of the shorter complaint's words, at least two shared, threshold 0.4), and nothing here calls a model.

import type { FeedbackRecord, InvocationRecord, Requirement } from '../state/canonical-state.js';
import { wordsOf } from '../observers/text.js';

const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'has', 'was', 'were', 'are', 'for', 'not', 'but', 'too', 'very',
  'its', "it's", 'you', 'your', 'our', 'they', 'them', 'there', 'then', 'than', 'into', 'about', 'just', 'like', 'more', 'much', 'should',
  'would', 'could', 'again', 'still', 'always', 'never', 'every', 'output', 'answer', 'draft', 'text', 'piece', 'wrote', 'write', 'writes',
  'in', 'on', 'of', 'to', 'a', 'an', 'is', 'it', 'at', 'as', 'by', 'or', 'be', 'so', 'if', 'we', 'me', 'my', 'no', 'do', 'up']);

/** Content words, two letters and up ("em" in "em dashes" is the point), possessives folded. */
export const contentWordsOf = (s: string): Set<string> =>
  new Set(wordsOf(s).map((w) => w.toLowerCase().replace(/['’]s$/, '')).filter((w) => w.length >= 2 && !STOP.has(w)));

export const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
};

/**
 * How much two complaints say the same thing: the shared content words over the shorter complaint's,
 * and nothing unless at least two are shared. Jaccard punishes a longer paraphrase for its extra words
 * (found in a real run: "too many spaced hyphens, it reads like dashes everywhere" and "the spaced
 * hyphens again, far more than the author uses" scored 0.22 and never grouped); one shared word ("tone",
 * "salesy") is a topic, not the same complaint.
 */
export const similarity = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter += 1;
  return inter < 2 ? 0 : inter / Math.min(a.size, b.size);
};

/**
 * Groups of complaints that say the same thing (see `similarity`), by AVERAGE link: two groups merge
 * only while the average similarity between their members clears the threshold. (Single link chains: "tone too
 * formal", "salesy tone", "salesy headings", "headings too long" become one group through their
 * neighbours.) Largest first, then most recent.
 */
export function clusterComplaints(records: readonly FeedbackRecord[], threshold = 0.4): FeedbackRecord[][] {
  const words = records.map((r) => contentWordsOf(r.complaint));
  let groups: number[][] = records.map((_, i) => [i]);
  const link = (a: readonly number[], b: readonly number[]): number =>
    a.reduce((s, i) => s + b.reduce((t, j) => t + similarity(words[i], words[j]), 0), 0) / (a.length * b.length);
  for (;;) {
    let best = { a: -1, b: -1, v: threshold };
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const v = link(groups[i], groups[j]);
      if (v >= best.v) best = { a: i, b: j, v };
    }
    if (best.a < 0) break;
    groups = [...groups.filter((_, k) => k !== best.a && k !== best.b), [...groups[best.a], ...groups[best.b]]];
  }
  const latest = (g: readonly FeedbackRecord[]): string => g.map((r) => r.at).sort().at(-1) ?? '';
  return groups.map((g) => g.map((i) => records[i])).sort((a, b) => b.length - a.length || latest(b).localeCompare(latest(a)));
}

export type Recurrence =
  | { readonly kind: 'GAP'; readonly complaints: readonly string[]; readonly feedbackIds: readonly string[]; readonly count: number; readonly proposal: string | null }
  | { readonly kind: 'MISSED_RULE'; readonly requirementId: string; readonly statement: string; readonly complaints: readonly string[]; readonly count: number }
  | { readonly kind: 'BROKEN_DRAFT'; readonly requirementId: string; readonly statement: string; readonly broken: number; readonly repaired: number; readonly runs: number }
  | { readonly kind: 'LOST_MEANING'; readonly requirementId: string; readonly statement: string; readonly refused: number };

/** The fewest occurrences that count as a recurrence rather than an anecdote. */
export const MIN_RECURRENCE = 2;

export interface ProposalEvent { readonly proposal: string; readonly at: string; readonly accepted: boolean | null; readonly feedbackIds?: readonly string[] }

/**
 * Everything that recurs, strongest first.
 *
 * `proposals` are the PROPOSED_CHANGE events `fix` and `mine` wrote. A GAP takes the wording `fix`
 * proposed for one of its own complaints (matched on the complaint's timestamp, which `fix` stamps on
 * the proposal), unless that wording was ever declined; complaints a rule was already added for, and
 * gaps whose wording was already accepted, are not offered again. Drafts are counted on the CURRENT
 * standard only: rule ids are renumbered between versions.
 */
export function findRecurrences(input: {
  readonly feedback: readonly FeedbackRecord[];
  readonly invocations: readonly InvocationRecord[];
  readonly requirements: readonly Requirement[];
  readonly standardVersionHash?: string;
  readonly proposals: readonly ProposalEvent[];
}): Recurrence[] {
  const byId = new Map(input.requirements.map((r) => [r.requirementId, r]));
  const out: Recurrence[] = [];
  const declined = new Set(input.proposals.filter((p) => p.accepted === false).map((p) => p.proposal.trim()));
  const accepted = new Set(input.proposals.filter((p) => p.accepted === true).map((p) => p.proposal.trim()));
  const addressed = new Set(input.proposals.filter((p) => p.accepted === true).flatMap((p) => p.feedbackIds ?? []));

  // Complaints: grouped by what they say; each group either names a rule the standard has, or none.
  for (const g of clusterComplaints(input.feedback.filter((f) => !addressed.has(f.feedbackId)))) {
    if (g.length < MIN_RECURRENCE) continue;
    const named = g.map((r) => r.requirementId).filter((id): id is string => Boolean(id && byId.has(id)));
    const top = [...new Set(named)].map((id) => ({ id, n: named.filter((x) => x === id).length })).sort((a, b) => b.n - a.n)[0];
    const topRule = top ? byId.get(top.id) : undefined;
    if (top && topRule && top.n >= MIN_RECURRENCE) {
      out.push({ kind: 'MISSED_RULE', requirementId: top.id, statement: topRule.statement,
        complaints: g.map((r) => r.complaint), count: top.n });
    } else if (!named.length) {
      const times = new Set(g.map((r) => r.at));
      const wordings = input.proposals.filter((p) => times.has(p.at)).map((p) => p.proposal.trim());
      if (wordings.some((w) => accepted.has(w))) continue;                     // already added
      const proposal = [...wordings].reverse().find((w) => !declined.has(w)) ?? null;
      out.push({ kind: 'GAP', complaints: g.map((r) => r.complaint), feedbackIds: g.map((r) => r.feedbackId), count: g.length, proposal });
    }
  }

  // Drafts on the current standard: measured rules the first draft breaks most of the time.
  const current = input.invocations.filter((i) => !input.standardVersionHash || i.standardVersionHash === input.standardVersionHash);
  const runs = current.length;
  if (runs >= 4) {
    const broken = new Map<string, { n: number; fixed: number }>();
    for (const i of current) {
      const rep = i.repair; if (!rep) continue;
      for (const id of rep.violatedBefore) {
        const b = broken.get(id) ?? { n: 0, fixed: 0 };
        broken.set(id, { n: b.n + 1, fixed: b.fixed + (rep.violatedAfter.includes(id) ? 0 : 1) });
      }
    }
    for (const [id, b] of broken) {
      const r = byId.get(id);
      if (r && b.n >= MIN_RECURRENCE && b.n / runs >= 0.5) out.push({ kind: 'BROKEN_DRAFT', requirementId: id, statement: r.statement, broken: b.n, repaired: b.fixed, runs });
    }
  }

  // Repairs refused for changing what the text claims, charged to the rule each refusal was for. A host
  // repair records only that the whole answer lost something: charged only when one rule was in play.
  const refused = new Map<string, number>();
  for (const i of current) {
    const rep = i.repair; if (!rep) continue;
    const ids = rep.revertedRules?.length ? rep.revertedRules
      : rep.meaningLost?.length && rep.violatedBefore.length === 1 ? rep.violatedBefore : [];
    for (const id of ids) if (byId.has(id)) refused.set(id, (refused.get(id) ?? 0) + 1);
  }
  for (const [id, n] of refused) {
    const r = byId.get(id);
    if (r && n >= MIN_RECURRENCE) out.push({ kind: 'LOST_MEANING', requirementId: id, statement: r.statement, refused: n });
  }

  const weight = (r: Recurrence): number => (r.kind === 'GAP' || r.kind === 'MISSED_RULE' ? r.count * 3 : r.kind === 'BROKEN_DRAFT' ? r.broken : r.refused * 2);
  return out.sort((a, b) => weight(b) - weight(a));
}

/**
 * HOW OFTEN EACH MEASURED RULE BREAKS, PER VERSION. Internal: the loop reads it, the person is not shown
 * it. Counted on first drafts (`violatedBefore`), per SkillVersion under one standard: a version changes
 * how the rules are carried, never the rules, so the same rule ids compare across versions. Versions in
 * the order they were first used.
 */
export interface VersionBreakRates { readonly skillVersionHash: string; readonly firstUsed: string; readonly runs: number; readonly broken: Readonly<Record<string, number>> }
export function ruleBreakRates(invocations: readonly InvocationRecord[], standardVersionHash?: string): VersionBreakRates[] {
  const by = new Map<string, { firstUsed: string; runs: number; broken: Record<string, number> }>();
  for (const i of invocations) {
    if (standardVersionHash && i.standardVersionHash !== standardVersionHash) continue;
    const v = by.get(i.skillVersionHash) ?? { firstUsed: i.at, runs: 0, broken: {} };
    v.runs += 1; if (i.at < v.firstUsed) v.firstUsed = i.at;
    for (const id of i.repair?.violatedBefore ?? []) v.broken[id] = (v.broken[id] ?? 0) + 1;
    by.set(i.skillVersionHash, v);
  }
  return [...by.entries()].map(([skillVersionHash, v]) => ({ skillVersionHash, ...v })).sort((a, b) => a.firstUsed.localeCompare(b.firstUsed));
}

/** The fewest uses of each version before their break rates are compared, and the rise that counts. */
export const REGRESSION_MIN_RUNS = 3;
export const REGRESSION_MIN_RISE = 0.25;

/**
 * Rules the `current` version breaks clearly more often than `previous` did: at least REGRESSION_MIN_RUNS
 * uses of each, and a rise of at least REGRESSION_MIN_RISE in the share of first drafts that break it.
 */
export function regressedRules(rates: readonly VersionBreakRates[], current: string, previous: string): { requirementId: string; before: number; after: number }[] {
  const a = rates.find((r) => r.skillVersionHash === previous); const b = rates.find((r) => r.skillVersionHash === current);
  if (!a || !b || a.runs < REGRESSION_MIN_RUNS || b.runs < REGRESSION_MIN_RUNS) return [];
  const ids = new Set([...Object.keys(a.broken), ...Object.keys(b.broken)]);
  return [...ids].map((id) => ({ requirementId: id, before: (a.broken[id] ?? 0) / a.runs, after: (b.broken[id] ?? 0) / b.runs }))
    .filter((x) => x.after - x.before >= REGRESSION_MIN_RISE).sort((x, y) => (y.after - y.before) - (x.after - x.before));
}
