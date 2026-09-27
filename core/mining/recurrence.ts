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
// Deterministic: complaints are grouped by the content words they share (single-link, Jaccard), and
// nothing here calls a model.

import type { FeedbackRecord, InvocationRecord, Requirement } from '../state/canonical-state.js';
import { wordsOf } from '../observers/text.js';

const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'has', 'was', 'were', 'are', 'for', 'not', 'but', 'too', 'very',
  'its', "it's", 'you', 'your', 'our', 'they', 'them', 'there', 'then', 'than', 'into', 'about', 'just', 'like', 'more', 'much', 'should',
  'would', 'could', 'again', 'still', 'always', 'never', 'every', 'output', 'answer', 'draft', 'text', 'piece', 'wrote', 'write', 'writes']);

export const contentWordsOf = (s: string): Set<string> =>
  new Set(wordsOf(s).map((w) => w.toLowerCase().replace(/['’]s$/, '')).filter((w) => w.length >= 3 && !STOP.has(w)));

export const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
};

/** Single-link groups of complaints that share enough content words. Order: largest first, then most recent. */
export function clusterComplaints(records: readonly FeedbackRecord[], threshold = 0.3): FeedbackRecord[][] {
  const words = records.map((r) => contentWordsOf(r.complaint));
  const parent = records.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) if (jaccard(words[i], words[j]) >= threshold) parent[find(i)] = find(j);
  }
  const groups = new Map<number, FeedbackRecord[]>();
  records.forEach((r, i) => { const k = find(i); groups.set(k, [...(groups.get(k) ?? []), r]); });
  const latest = (g: readonly FeedbackRecord[]): string => g.map((r) => r.at).sort().at(-1) ?? '';
  return [...groups.values()].sort((a, b) => b.length - a.length || latest(b).localeCompare(latest(a)));
}

export type Recurrence =
  | { readonly kind: 'GAP'; readonly complaints: readonly string[]; readonly count: number; readonly proposal: string | null }
  | { readonly kind: 'MISSED_RULE'; readonly requirementId: string; readonly statement: string; readonly complaints: readonly string[]; readonly count: number }
  | { readonly kind: 'BROKEN_DRAFT'; readonly requirementId: string; readonly statement: string; readonly broken: number; readonly runs: number }
  | { readonly kind: 'LOST_MEANING'; readonly requirementId: string; readonly statement: string; readonly refused: number };

/** The fewest occurrences that count as a recurrence rather than an anecdote. */
export const MIN_RECURRENCE = 2;

/**
 * Everything that recurs, strongest first. `proposals` are the rule wordings `fix` already proposed for
 * individual complaints (a GAP cluster takes the most recent one made for any of its complaints).
 */
export function findRecurrences(input: {
  readonly feedback: readonly FeedbackRecord[];
  readonly invocations: readonly InvocationRecord[];
  readonly requirements: readonly Requirement[];
  readonly proposals: readonly { readonly proposal: string; readonly at: string; readonly accepted: boolean | null }[];
}): Recurrence[] {
  const byId = new Map(input.requirements.map((r) => [r.requirementId, r]));
  const out: Recurrence[] = [];

  // Complaints: grouped by what they say; each group either names a rule the standard has, or none.
  for (const g of clusterComplaints(input.feedback)) {
    if (g.length < MIN_RECURRENCE) continue;
    const named = g.map((r) => r.requirementId).filter((id): id is string => Boolean(id && byId.has(id)));
    const top = [...new Set(named)].map((id) => ({ id, n: named.filter((x) => x === id).length })).sort((a, b) => b.n - a.n)[0];
    if (top && top.n >= MIN_RECURRENCE) {
      out.push({ kind: 'MISSED_RULE', requirementId: top.id, statement: byId.get(top.id)!.statement,
        complaints: g.map((r) => r.complaint), count: top.n });
    } else if (!named.length) {
      // The wording `fix` proposed nearest in time to one of these complaints, unless the owner declined it.
      const times = new Set(g.map((r) => r.at.slice(0, 16)));
      const proposal = [...input.proposals].reverse().find((p) => p.accepted !== false && times.has(p.at.slice(0, 16)))?.proposal ?? null;
      out.push({ kind: 'GAP', complaints: g.map((r) => r.complaint), count: g.length, proposal });
    }
  }

  // Drafts: measured rules the first draft breaks most of the time.
  const drafts = input.invocations.filter((i) => i.repair);
  const runs = input.invocations.length;
  if (runs >= 4) {
    const broken = new Map<string, number>();
    for (const i of drafts) for (const id of i.repair!.violatedBefore) broken.set(id, (broken.get(id) ?? 0) + 1);
    for (const [id, n] of broken) {
      const r = byId.get(id);
      if (r && n >= MIN_RECURRENCE && n / runs >= 0.5) out.push({ kind: 'BROKEN_DRAFT', requirementId: id, statement: r.statement, broken: n, runs });
    }
  }

  // Repairs refused for changing what the text claims, by the rule they were for.
  const refused = new Map<string, number>();
  for (const i of drafts) {
    if (!i.repair!.integrityReverted?.length && !i.repair!.meaningLost?.length) continue;
    for (const id of i.repair!.violatedBefore) if (byId.has(id)) refused.set(id, (refused.get(id) ?? 0) + 1);
  }
  for (const [id, n] of refused) {
    if (n >= MIN_RECURRENCE) out.push({ kind: 'LOST_MEANING', requirementId: id, statement: byId.get(id)!.statement, refused: n });
  }

  const weight = (r: Recurrence): number => (r.kind === 'GAP' || r.kind === 'MISSED_RULE' ? r.count * 3 : r.kind === 'BROKEN_DRAFT' ? r.broken : r.refused * 2);
  return out.sort((a, b) => weight(b) - weight(a));
}
