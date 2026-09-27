// atelier/core/taste/repair.ts — REWRITE WHERE THE TASTE READER, HAVING EARNED IT, SAYS A RULE WAS MISSED.
//
// The counted rules are repaired by ../loop/run-repair.ts. This is the same move for the rules only a
// reader can check, under the same three guarantees and one more:
//
//   1. the splice is deterministic: only the sentence (or paragraph) holding the quoted passage changes;
//   2. the rewrite may not change what the text claims (../loop/integrity.ts);
//   3. no counted rule that held may break;
//   4. the reader, asked again, must no longer read that rule as missed. A rewrite the reader cannot
//      confirm is discarded, so the loop never "fixes" a taste rule on the rewriter's say-so.
//
// Only readings from rules holding VETO (./calibration.ts), and only those that quote a passage: an
// omission has nowhere to splice, and is reported instead.

import type { StandardVersion, Requirement } from '../state/canonical-state.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { sentencesOf, paragraphsOf } from '../observers/text.js';
import { applyRepair, regressions, repairPrompt, REPAIR_SYSTEM, REPAIR_SCHEMA, type RepairTarget, type Reverted } from '../loop/repair.js';
import { checkDraft, type CheckOptions } from '../loop/run-repair.js';
import { readTaste, type TasteReading } from './reader.js';

export interface TasteRepair {
  readonly output: string;
  /** rules the reader, holding VETO, read as missed with a passage */
  readonly targeted: readonly string[];
  /** of those, the ones the reader no longer reads as missed after the rewrite */
  readonly fixed: readonly string[];
  /** the readings of the delivered text (after the rewrite when one was kept) */
  readonly readings: readonly TasteReading[];
  readonly why: string;
}

/** Where a quoted passage sits, grown to its sentence, or to the paragraph when it spans sentences. */
export function spanOfQuote(text: string, quote: string): { start: number; end: number } | null {
  const i = text.indexOf(quote.trim());
  if (i < 0) {
    // Not found byte for byte (the quote's whitespace differed): locate it by paragraph instead.
    const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
    const p = paragraphsOf(text).find((x) => squash(x.text).includes(squash(quote)));
    return p ? { start: p.start, end: p.end } : null;
  }
  const end = i + quote.trim().length;
  const s = sentencesOf(text).filter((x) => x.end > i && x.start < end);
  if (s.length === 1) return { start: Math.min(s[0].start, i), end: Math.max(s[0].end, end) };
  const p = paragraphsOf(text).find((x) => x.start <= i && x.end >= end);
  return p ? { start: p.start, end: p.end } : { start: i, end };
}

export async function refineTaste(
  client: InferenceClient, readerClient: InferenceClient, budget: Budget, skill: string, v: StandardVersion,
  text: string, readings: readonly TasteReading[], veto: ReadonlySet<string>, task: string | null, checks: CheckOptions = {},
): Promise<TasteRepair> {
  const byId = new Map<string, Requirement>(v.requirements.map((r) => [r.requirementId, r]));
  const missed = readings.filter((r) => r.verdict === 'MISSED' && r.kind === 'PRESENCE' && r.quote && veto.has(r.key));
  if (!missed.length) return { output: text, targeted: [], fixed: [], readings, why: 'nothing the reader may act on was missed' };
  // One target per located passage; overlapping passages merge, as in the counted repair.
  const raw = missed.flatMap((r) => { const sp = spanOfQuote(text, r.quote!); return sp ? [{ ...sp, r }] : []; }).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; reasons: string[]; rids: string[] }[] = [];
  for (const x of raw) {
    const last = merged.at(-1);
    const reason = `${x.r.requirementId}: ${byId.get(x.r.requirementId)?.statement ?? ''} (a reader found: ${x.r.why})`;
    if (last && x.start < last.end) { last.end = Math.max(last.end, x.end); last.reasons.push(reason); last.rids.push(x.r.requirementId); }
    else merged.push({ start: x.start, end: x.end, reasons: [reason], rids: [x.r.requirementId] });
  }
  const targets: RepairTarget[] = merged.map((m, i) => ({ id: i + 1, start: m.start, end: m.end, text: text.slice(m.start, m.end),
    reasons: m.reasons, requirementIds: m.rids, drops: [], specifics: false }));
  const targeted = [...new Set(missed.map((r) => r.requirementId))];
  let res: Awaited<ReturnType<InferenceClient['complete']>>;
  try {
    res = await spend(budget, 0.05, async () => {
      const x = await client.complete({ stableBlock: REPAIR_SYSTEM, variableBlock: '', userMessage: repairPrompt(text, targets),
        toolName: 'emit_replacements', toolDescription: 'Return one replacement per numbered span.', schema: REPAIR_SCHEMA, maxTokens: 4000 });
      return { value: x, cost: x.cost };
    });
  } catch (e) {
    return { output: text, targeted, fixed: [], readings, why: `the rewrite could not run (${(e as Error).message.split('\n')[0]})` };
  }
  const reverted: Reverted[] = [];
  const next = applyRepair(text, targets, (res.json as { replacements?: { id: number; text: string }[] } | null)?.replacements ?? [], reverted);
  if (next === text) return { output: text, targeted, fixed: [], readings, why: reverted.length ? 'every rewrite changed what the text claims, so none was kept' : 'the rewrite returned nothing usable' };
  // No counted rule that held may break.
  const worse = regressions(checkDraft(skill, v, text, checks), checkDraft(skill, v, next, checks));
  if (worse.length) return { output: text, targeted, fixed: [], readings, why: `the rewrite broke counted rule(s) ${worse.join(', ')}` };
  // And the reader must confirm it: read again, and keep the rewrite only if a targeted rule is fixed
  // and no rule the reader had read as followed is now read as missed.
  let after: TasteReading[];
  try { after = await readTaste(readerClient, budget, v, next, task); } catch (e) {
    return { output: text, targeted, fixed: [], readings, why: `the rewrite could not be re-read (${(e as Error).message.split('\n')[0]})` };
  }
  const was = new Map(readings.map((r) => [r.requirementId, r.verdict]));
  const fixed = targeted.filter((id) => after.find((r) => r.requirementId === id)?.verdict !== 'MISSED');
  const broke = after.filter((r) => r.verdict === 'MISSED' && was.get(r.requirementId) === 'FOLLOWED').map((r) => r.requirementId);
  if (!fixed.length || broke.length) {
    return { output: text, targeted, fixed: [], readings, why: broke.length ? `the rewrite made ${broke.join(', ')} read as missed` : 'the reader still reads every targeted rule as missed' };
  }
  return { output: next, targeted, fixed, readings: after, why: `${fixed.length} of ${targeted.length} rule(s) no longer read as missed` };
}
