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
import { displacedFamilies } from '../observers/style.js';
import { planRepair, repairPrompt, applyRepair, acceptRepair, REPAIR_SYSTEM, REPAIR_SCHEMA, type Reverted, type Applied } from './repair.js';
import { keysOf, measurementId } from '../state/rule-key.js';
import type { RepairPair } from '../state/canonical-state.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const broken = (r: VerifyReport): string[] => r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').map((c) => c.requirementId);

export interface Refined { readonly output: string; readonly repair: RepairRecord | null; readonly report: VerifyReport }

export interface CheckOptions {
  /** what the person supplied: their notes, anecdotes, figures. Claims found here are theirs to make. */
  readonly material?: string;
  /** false turns off the invented-story and invented-figure check (`--allow-unsourced`) */
  readonly guardClaims?: boolean;
  /**
   * What happens to an invented story or figure. By default it is CUT: the span is rewritten without
   * it, keeping the point it made, and the output lists where a story of the person's own would fit.
   * A bracketed slot in the delivered text ("[your story: …]") was honest but read as a broken draft to
   * every reader of a blind round; `placeholders: true` (`--placeholders`) asks for slots instead.
   */
  readonly placeholders?: boolean;
}

const CUT_STORY = 'a first-person story that is not in your material or your request: rewrite the span without it, keeping the point it made, and do not invent another';
const CUT_FIGURE = 'a figure presented as a finding, not in your material or your request: say it without the number, or cut the claim';

/**
 * Every check a draft is held to: the standard's measured rules, and — always, unless turned off — the
 * rule that a voice may not invent the person's experiences or their numbers. The second is not the
 * owner's standard; it is the product's floor, and it is reported as its own line, `UNSOURCED`.
 */
export function checkDraft(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {}): VerifyReport {
  const report = verifyText(skill, v, text);
  if (opts.guardClaims === false) return report;
  const claims = unsourcedClaims(text, opts.material ?? '')
    .map((c) => (opts.placeholders ? c : { ...c, why: c.kind === 'EXPERIENCE' ? CUT_STORY : CUT_FIGURE }));
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
  const kept: string[] = []; const revertedRules: string[] = []; const cut: string[] = [];
  // ACCURACY BEFORE STYLE. A claim that is about to become a placeholder is not worth shortening, and
  // a style pass run over it first can change the words the accuracy check keys on. When both kinds are
  // broken, accuracy gets ONE pass of its own, not charged to the `maxPasses` style passes. An accuracy
  // pass that makes no progress is dropped and the loop moves on to style: it never ends the loop.
  let accuracyTried = false; let stylePasses = 0;
  const pairs: RepairPair[] = [];
  const keys = keysOf(v.requirements);
  const keyOf = new Map(v.requirements.map((r, i) => [r.requirementId, keys[i]]));
  const checkOf = new Map(v.requirements.flatMap((r) => (r.measurement ? [[r.requirementId, measurementId(r.measurement)] as const] : [])));
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
    const reverted: Reverted[] = []; const applied: Applied[] = [];
    const next = applyRepair(text, targets, reps, reverted, applied);
    for (const r of reverted) {
      const t = targets.find((x) => x.id === r.id);
      kept.push(`"${t?.text.slice(0, 80) ?? `span ${r.id}`}" kept: the rewrite lost ${r.lost.join(', ')}`);
      for (const id of t?.requirementIds ?? []) if (!revertedRules.includes(id)) revertedRules.push(id);
    }
    const after = next === text ? report : checkDraft(skill, v, next, opts);
    // A BANNED MOVE MAY NOT MOVE. A pass that lowers one tell while raising a sibling of the same family
    // ("not X, it's Y" rewritten as "X rather than Y") has displaced the move, not removed it.
    const moved = next === text ? [] : displacedFamilies(text, next);
    const verdict = next === text
      ? { ok: false, why: reverted.length ? `every rewrite was refused because it changed what the text claims (${kept.length} span(s) kept as written)` : 'the rewrite returned nothing usable' }
      : moved.length ? { ok: false, why: `it moved a banned move onto a sibling (${moved.join('; ')})` }
        : acceptRepair(report, after);
    if (!verdict.ok) {
      why = `a rewrite was discarded: ${verdict.why}`;
      if (accuracyPass) continue;   // style still gets its passes
      break;
    }
    text = next; report = after;
    for (const a of applied) if (targets.find((x) => x.id === a.id)?.specifics && !opts.placeholders) cut.push(a.before.trim().slice(0, 160));
    // An accepted pass's style rewrites are examples of this standard in action. One rule per pair,
    // and never an invented claim turned placeholder: that teaches nothing about writing.
    for (const a of applied) {
      const t = targets.find((x) => x.id === a.id);
      const rid = t && !t.specifics && t.requirementIds.length === 1 ? t.requirementIds[0] : undefined;
      const key = rid ? keyOf.get(rid) : undefined;
      if (rid && key && a.before !== a.after) pairs.push({ key, check: checkOf.get(rid), before: a.before, after: a.after });
    }
    why = report.failed ? verdict.why : 'every REQUIRED measured rule now holds';
  }
  return { output: text, report,
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), draft,
      ...(kept.length ? { integrityReverted: kept, revertedRules } : {}), ...(pairs.length ? { pairs: pairs.slice(0, 12) } : {}),
      ...(cut.length ? { storiesCut: cut } : {}), why } };
}
