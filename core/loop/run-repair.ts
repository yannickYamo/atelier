// atelier/core/loop/run-repair.ts — THE LOOP: CHECK THE DRAFT, REWRITE WHAT BROKE, CHECK AGAIN.
//
// Up to `maxPasses` rewrites of only the spans that break a REQUIRED measured rule, each one kept only
// if it breaks nothing that held and fixes at least one thing that did not (`acceptRepair`). Every
// call is metered through the caller's budget. The standard is read, never written.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { StandardVersion, RepairRecord } from '../state/canonical-state.js';
import { verifyText, type VerifyReport } from '../observers/verify.js';
import { planRepair, repairPrompt, applyRepair, acceptRepair, REPAIR_SYSTEM, REPAIR_SCHEMA } from './repair.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const broken = (r: VerifyReport): string[] => r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').map((c) => c.requirementId);

export interface Refined { readonly output: string; readonly repair: RepairRecord | null; readonly report: VerifyReport }

export async function refineToStandard(
  client: InferenceClient, budget: Budget, skill: string, v: StandardVersion, draft: string, maxPasses = 2,
): Promise<Refined> {
  const first = verifyText(skill, v, draft);
  if (!first.failed) return { output: draft, repair: null, report: first };
  let text = draft; let report = first; let passes = 0; let why = 'every REQUIRED measured rule now holds';
  while (report.failed && passes < maxPasses) {
    const targets = planRepair(text, report);
    if (!targets.length) { why = 'nothing the rules pointed at could be rewritten'; break; }
    const res = await spend(budget, 0.05, async () => {
      const x = await client.complete({
        stableBlock: REPAIR_SYSTEM, variableBlock: '', userMessage: repairPrompt(text, targets),
        toolName: 'emit_replacements', toolDescription: 'Return one replacement per numbered span.',
        schema: REPAIR_SCHEMA, maxTokens: 4000,
      });
      return { value: x, cost: x.cost };
    });
    passes += 1;
    const reps = ((res.json as { replacements?: { id: number; text: string }[] } | null)?.replacements ?? []);
    const next = applyRepair(text, targets, reps);
    const after = verifyText(skill, v, next);
    const verdict = acceptRepair(report, after);
    if (!verdict.ok) { why = `a rewrite was discarded: ${verdict.why}`; break; }
    text = next; report = after;
    why = report.failed ? verdict.why : 'every REQUIRED measured rule now holds';
  }
  return { output: text, report,
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), why } };
}
