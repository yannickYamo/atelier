// atelier/core/loop/run-repair.ts — THE LOOP: CHECK THE DRAFT, REWRITE WHAT BROKE, CHECK AGAIN.
//
// Up to `maxPasses` rewrites of only the spans that break a REQUIRED measured rule, each one kept only
// if it breaks nothing that held and fixes at least one thing that did not (`acceptRepair`). Every
// call is metered through the caller's budget. The standard is read, never written.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { StandardVersion, RepairRecord } from '../state/canonical-state.js';
import { verifyText, type VerifyReport } from '../observers/verify.js';
import { unsourcedClaims } from './claims.js';
import { planRepair, repairPrompt, applyRepair, acceptRepair, REPAIR_SYSTEM, REPAIR_SCHEMA, type Reverted } from './repair.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const broken = (r: VerifyReport): string[] => r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').map((c) => c.requirementId);

export interface Refined { readonly output: string; readonly repair: RepairRecord | null; readonly report: VerifyReport }

export interface CheckOptions {
  /** what the person supplied: their notes, anecdotes, figures. Claims found here are theirs to make. */
  readonly material?: string;
  /** false turns off the invented-story and invented-figure check (`--allow-unsourced`) */
  readonly guardClaims?: boolean;
}

/**
 * Every check a draft is held to: the standard's measured rules, and — always, unless turned off — the
 * rule that a voice may not invent the person's experiences or their numbers. The second is not the
 * owner's standard; it is the product's floor, and it is reported as its own line, `UNSOURCED`.
 */
export function checkDraft(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {}): VerifyReport {
  const report = verifyText(skill, v, text);
  if (opts.guardClaims === false) return report;
  const claims = unsourcedClaims(text, opts.material ?? '');
  const line = { requirementId: 'UNSOURCED', statement: 'Never invent a first-person story or a figure presented as a finding.',
    materiality: 'REQUIRED', phase: 'ACCURACY' as const,
    result: { verdict: claims.length ? 'VIOLATED' as const : 'MET' as const, spans: claims, value: claims.length,
      detail: claims.length ? `${claims.length} claim(s) not in the material supplied` : 'no unsourced stories or findings' } };
  return { ...report, checked: [...report.checked, line], failed: report.failed || claims.length > 0 };
}

export async function refineToStandard(
  client: InferenceClient, budget: Budget, skill: string, v: StandardVersion, draft: string, maxPasses = 2,
  opts: CheckOptions = {},
): Promise<Refined> {
  const first = checkDraft(skill, v, draft, opts);
  if (!first.failed) return { output: draft, repair: null, report: first };
  let text = draft; let report = first; let passes = 0; let why = 'every REQUIRED measured rule now holds';
  const kept: string[] = [];
  // ACCURACY BEFORE STYLE. A claim that is about to become a placeholder is not worth shortening, and
  // a style pass run over it first can change the words the accuracy check keys on. When both kinds are
  // broken, accuracy gets ONE pass of its own, not charged to the `maxPasses` style passes. An accuracy
  // pass that makes no progress is dropped and the loop moves on to style: it never ends the loop.
  let accuracyTried = false; let stylePasses = 0;
  while (report.failed && stylePasses < maxPasses) {
    const accuracy = accuracyTried ? [] : planRepair(text, report, { phase: 'ACCURACY' });
    const accuracyPass = accuracy.length > 0 && planRepair(text, report, { phase: 'STYLE' }).length > 0;
    const targets = accuracyPass ? accuracy : planRepair(text, report);
    accuracyTried = true;
    if (!targets.length) { why = 'nothing the rules pointed at could be rewritten'; break; }
    // A REPAIR THAT CANNOT RUN NEVER COSTS THE DRAFT. The draft is already paid for and already meets
    // every rule the repair was not about; a failed call (a refusal, a 500, an exhausted budget)
    // delivers it as it stands and says why, rather than ending the command with nothing.
    let res: Awaited<ReturnType<InferenceClient['complete']>>;
    try {
      res = await spend(budget, 0.05, async () => {
        const x = await client.complete({
          stableBlock: REPAIR_SYSTEM, variableBlock: '', userMessage: repairPrompt(text, targets),
          toolName: 'emit_replacements', toolDescription: 'Return one replacement per numbered span.',
          schema: REPAIR_SCHEMA, maxTokens: 4000,
        });
        return { value: x, cost: x.cost };
      });
    } catch (e) {
      why = `the rewrite could not run (${(e as Error).message.split('\n')[0]}); the draft is delivered as it stands`;
      break;
    }
    passes += 1;
    if (!accuracyPass) stylePasses += 1;
    const reps = ((res.json as { replacements?: { id: number; text: string }[] } | null)?.replacements ?? []);
    const reverted: Reverted[] = [];
    const next = applyRepair(text, targets, reps, reverted);
    for (const r of reverted) kept.push(`"${targets.find((t) => t.id === r.id)?.text.slice(0, 80) ?? `span ${r.id}`}" kept: the rewrite lost ${r.lost.join(', ')}`);
    const after = next === text ? report : checkDraft(skill, v, next, opts);
    const verdict = next === text
      ? { ok: false, why: reverted.length ? `every rewrite was refused because it changed what the text claims (${kept.length} span(s) kept as written)` : 'the rewrite returned nothing usable' }
      : acceptRepair(report, after);
    if (!verdict.ok) {
      why = `a rewrite was discarded: ${verdict.why}`;
      if (accuracyPass) continue;   // style still gets its passes
      break;
    }
    text = next; report = after;
    why = report.failed ? verdict.why : 'every REQUIRED measured rule now holds';
  }
  return { output: text, report,
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), draft,
      ...(kept.length ? { integrityReverted: kept } : {}), why } };
}
