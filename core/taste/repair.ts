// atelier/core/taste/repair.ts — REWRITE WHERE THE TASTE READER, HAVING EARNED IT, SAYS A RULE WAS MISSED.
//
// The counted rules are repaired by ../loop/run-repair.ts. This is the same move for the rules only a
// reader can check, under the same three guarantees and one more:
//
//   1. the splice is deterministic: only the sentence (or paragraph) holding the quoted passage changes;
//   2. the rewrite may not change what the text claims (../loop/integrity.ts);
//   3. no counted rule that held may break;
//   4. the reader, asked again, must now read that rule as followed. A rewrite the reader cannot
//      confirm is discarded, so the loop never "fixes" a taste rule on the rewriter's say-so.
//
// The rewrite is a step on the run's one ledger (../loop/controller.ts, rule B), taken through `applyStep`
// (../loop/repair.ts): gated by the step limit and the budget, entered before it runs, and kept only on the one
// acceptance rule (no enforced rule worse by its value, with the standard's params) besides the guarantees above.
//
// Only readings from rules holding VETO (./calibration.ts), and only those that quote a passage: an
// omission has nowhere to splice, and is reported instead.

import type { StandardVersion, Requirement } from '../state/canonical-state.js';
import type { VerifyReport } from '../observers/verify.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { sentencesOf, paragraphsOf } from '../observers/text.js';
import { applyRepair, regressions, readAtLength, featureParamsOf, ruleParamsOf, repairPrompt, applyStep, REPAIR_SYSTEM, REPAIR_SYSTEM_WITH_PLACEHOLDERS, REPAIR_SCHEMA,
  type RepairTarget, type Reverted, type Proposed } from '../loop/repair.js';
import { checkDraftAsync, type CheckOptions } from '../loop/run-repair.js';
import { DEFAULT_COST, type StepLedger } from '../loop/controller.js';
import { readTaste, squash, vetoMisses, type TasteReading } from './reader.js';

export interface TasteRepair {
  readonly output: string;
  /** rules the reader, holding VETO, read as missed with a passage */
  readonly targeted: readonly string[];
  /** of those, the ones the reader reads as followed after the rewrite */
  readonly fixed: readonly string[];
  /** the readings of the delivered text (after the rewrite when one was kept) */
  readonly readings: readonly TasteReading[];
  /** the report counted on the delivered text, when the rewrite was kept */
  readonly report?: VerifyReport;
  readonly why: string;
}

/**
 * Where a quoted passage sits, grown to its sentence, or to its paragraph when it spans sentences. A
 * quote that crosses paragraphs is not spliced (null): rewriting across a paragraph break is a
 * restructuring, not a repair. When the quote occurs more than once, the first occurrence is taken.
 */
export function spanOfQuote(text: string, quote: string): { start: number; end: number } | null {
  const i = text.indexOf(quote.trim());
  if (i < 0) {
    // Not found byte for byte (the quote's whitespace differed): locate it by paragraph instead.
    const p = paragraphsOf(text).find((x) => squash(x.text).includes(squash(quote)));
    return p ? { start: p.start, end: p.end } : null;
  }
  const end = i + quote.trim().length;
  const s = sentencesOf(text).filter((x) => x.end > i && x.start < end);
  if (s.length === 1) return { start: Math.min(s[0].start, i), end: Math.max(s[0].end, end) };
  const p = paragraphsOf(text).find((x) => x.start <= i && x.end >= end);
  return p ? { start: p.start, end: p.end } : null;
}

export async function refineTaste(
  client: InferenceClient, readerClient: InferenceClient, budget: Budget, skill: string, v: StandardVersion,
  text: string, readings: readonly TasteReading[], veto: ReadonlySet<string>, task: string | null, checks: CheckOptions = {},
  /** the task's applicability, when the caller already decided it (reader.ts `applicabilityFor`) */
  decided: readonly boolean[] | null,
  /**
   * THE RUN'S ONE LEDGER the rewrite is a step on, and the claim floor the rewritten text is held to before it is judged:
   * the text with flagged claims cut and the report counted on it, or why it may not be kept.
   */
  step: { readonly ledger: StepLedger; readonly floor?: (next: string, report: VerifyReport) => Promise<Proposed | string> },
): Promise<TasteRepair> {
  const byId = new Map<string, Requirement>(v.requirements.map((r) => [r.requirementId, r]));
  const missed = vetoMisses(readings, veto).filter((r) => r.quote);
  if (!missed.length) return { output: text, targeted: [], fixed: [], readings, why: 'nothing the reader may act on was missed' };
  // One target per located passage; overlapping passages merge, as in the counted repair. A miss whose
  // passage cannot be located is reported, not targeted: no call is spent rewriting nothing.
  const raw = missed.flatMap((r) => { const sp = r.quote ? spanOfQuote(text, r.quote) : null; return sp ? [{ ...sp, r }] : []; }).sort((a, b) => a.start - b.start);
  if (!raw.length) return { output: text, targeted: [], fixed: [], readings, why: 'no quoted passage could be located in the text' };
  const merged: { start: number; end: number; reasons: string[]; rids: string[] }[] = [];
  for (const x of raw) {
    const last = merged.at(-1);
    const reason = `${x.r.requirementId}: ${byId.get(x.r.requirementId)?.statement ?? ''} (a reader found: ${x.r.why})`;
    if (last && x.start < last.end) { last.end = Math.max(last.end, x.end); last.reasons.push(reason); last.rids.push(x.r.requirementId); }
    else merged.push({ start: x.start, end: x.end, reasons: [reason], rids: [x.r.requirementId] });
  }
  const targets: RepairTarget[] = merged.map((m, i) => ({ id: i + 1, start: m.start, end: m.end, text: text.slice(m.start, m.end),
    reasons: m.reasons, requirementIds: m.rids, drops: [], specifics: false }));
  const targeted = [...new Set(raw.map((x) => x.r.requirementId))];
  const paramsOf = ruleParamsOf(v);
  const before = await checkDraftAsync(skill, v, text, checks);
  let after: TasteReading[] = [...readings]; let fixed: string[] = [];
  const s = await applyStep<Proposed>(step.ledger, { action: 'taste', targets: targeted, why: `${targeted.length} rule(s) the taste reader read as missed, each with a passage: the passages are rewritten`,
    expectedGain: targeted.length, expectedCostUsd: DEFAULT_COST.taste }, { text, report: before }, async () => {
    const res = await spend(budget, 0.05, async () => {
      const x = await client.complete({ stableBlock: checks.placeholders ? REPAIR_SYSTEM_WITH_PLACEHOLDERS : REPAIR_SYSTEM, variableBlock: '', userMessage: repairPrompt(text, targets),
        toolName: 'emit_replacements', toolDescription: 'Return one replacement per numbered span.', schema: REPAIR_SCHEMA, maxTokens: 4000 });
      return { value: x, cost: x.cost, usage: x };
    }, 'taste reader');
    const reverted: Reverted[] = [];
    const next = applyRepair(text, targets, (res.json as { replacements?: { id: number; text: string }[] } | null)?.replacements ?? [], reverted, [], checks.placeholders ?? false);
    if (next === text) return { unchanged: reverted.length ? 'every rewrite changed what the text claims, so none was kept' : 'the rewrite returned nothing usable', outcome: 'not kept' as const };
    const report = await checkDraftAsync(skill, v, next, checks);
    if (!step.floor) return { text: next, report };
    const floored = await step.floor(next, report);
    return typeof floored === 'string' ? { unchanged: floored, outcome: 'not kept' as const } : floored;
  }, { paramsOf, purposes: ['taste reader'],
    also: async (x, rule) => {
      // No counted rule that held may break.
      const worse = regressions(readAtLength(before, text, x.text, featureParamsOf(v)), x.report, { paramsOf });
      if (worse.length) return `the rewrite broke counted rule(s) ${worse.join(', ')}`;
      if (rule.worse.length) return null;
      // And the reader must confirm it: read again, and keep the rewrite only if a targeted rule is fixed
      // and no rule the reader had read as followed is now read as missed.
      try { after = await readTaste(readerClient, budget, v, x.text, task, decided); } catch (e) {
        return `the rewrite could not be re-read (${(e as Error).message.split('\n')[0]})`;
      }
      const was = new Map(readings.map((r) => [r.requirementId, r.verdict]));
      // Fixed means read as FOLLOWED. A reader that can no longer tell (UNCLEAR, UNSTABLE) has not confirmed anything.
      fixed = targeted.filter((id) => after.find((r) => r.requirementId === id)?.verdict === 'FOLLOWED');
      const broke = after.filter((r) => r.verdict === 'MISSED' && was.get(r.requirementId) === 'FOLLOWED').map((r) => r.requirementId);
      if (!fixed.length || broke.length) return broke.length ? `the rewrite made ${broke.join(', ')} read as missed` : 'the reader does not read any targeted rule as followed after the rewrite';
      return null;
    },
    note: (_x, kept, why, rule) => (kept ? `${fixed.length} of ${targeted.length} rule(s) now read as followed` : rule.own ?? why ?? undefined),
    movement: (_x, kept) => (kept ? fixed.length : 0) });
  if (s.kind === 'refused') return { output: text, targeted, fixed: [], readings, why: `not rewritten: ${s.why}` };
  if (s.kind === 'failed') return { output: text, targeted, fixed: [], readings, why: `the rewrite could not run (${s.why})` };
  if (s.kind === 'unchanged') return { output: text, targeted, fixed: [], readings, why: s.why };
  if (!s.kept) return { output: text, targeted, fixed: [], readings, why: s.own ?? s.why ?? 'not kept' };
  return { output: s.after.text, report: s.after.report, targeted, fixed, readings: after, why: `${fixed.length} of ${targeted.length} rule(s) now read as followed` };
}
