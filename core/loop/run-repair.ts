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
import { findTerms } from '../observers/text.js';
import { planRepair, repairPrompt, applyRepair, acceptRepair, regressions, REPAIR_SYSTEM, REPAIR_SYSTEM_WITH_PLACEHOLDERS, REPAIR_SCHEMA, type Reverted, type Applied } from './repair.js';
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
  /**
   * Phrases this skill's own drafts repeat across unrelated topics and its author never uses
   * (core/observers/tell-lexicon.ts). Checked only where the standard holds the ratified machine-tell rule:
   * the owner decided that such moves go; this list is the sensor that finds them.
   */
  readonly learnedTells?: readonly string[];
}

const CUT_STORY = 'a first-person story that is not in your material or your request: rewrite the span without it, keeping the point it made, and do not invent another';
const CUT_FIGURE = 'a figure presented as a finding, not in your material or your request: say it without the number, or cut the claim';
const CUT_SOURCE = 'a quotation from someone unnamed, not in your material or your request: make the point in your own words without the attribution, or cut it';

/**
 * Every check a draft is held to: the standard's measured rules, and — always, unless turned off — the
 * rule that a voice may not invent the person's experiences or their numbers. The second is not the
 * owner's standard; it is the product's floor, and it is reported as its own line, `UNSOURCED`.
 */
export function checkDraft(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {}): VerifyReport {
  const base = verifyText(skill, v, text);
  const tellRule = v.requirements.find((r) => r.authority !== 'EXPERT_REJECTED' && r.measurement?.observer === 'PATTERN_RATE'
    && (r.measurement.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL');
  const learned = tellRule && opts.learnedTells?.length ? findTerms(text, opts.learnedTells) : [];
  const tellLine = tellRule && opts.learnedTells?.length ? [{ requirementId: `${tellRule.requirementId}·learned`, statement: 'Phrases this skill\'s drafts keep repeating across unrelated topics, which your pieces never use.',
    materiality: tellRule.materiality, phase: 'STYLE' as const, observer: 'LEXICON', pattern: 'MACHINE_TELL',
    result: { verdict: learned.length ? 'VIOLATED' as const : 'MET' as const, value: learned.length,
      spans: learned.map((sp) => ({ ...sp, why: `"${sp.text}", a phrase this skill's drafts repeat and your pieces never use` })),
      detail: learned.length ? `${learned.length} learned machine phrase(s)` : 'none of the learned machine phrases' } }] : [];
  const report = { ...base, checked: [...base.checked, ...tellLine], failed: base.failed || (tellRule?.materiality === 'REQUIRED' && learned.length > 0) };
  if (opts.guardClaims === false) return report;
  const claims = unsourcedClaims(text, opts.material ?? '')
    .map((c) => (opts.placeholders ? c : { ...c, why: c.kind === 'EXPERIENCE' ? CUT_STORY : c.kind === 'SOURCE' ? CUT_SOURCE : CUT_FIGURE }));
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
          stableBlock: opts.placeholders ? REPAIR_SYSTEM_WITH_PLACEHOLDERS : REPAIR_SYSTEM, variableBlock: '', userMessage: repairPrompt(text, targets),
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
    const next = applyRepair(text, targets, reps, reverted, applied, opts.placeholders ?? false);
    for (const r of reverted) {
      const t = targets.find((x) => x.id === r.id);
      kept.push(`"${t?.text.slice(0, 80) ?? `span ${r.id}`}" kept: the rewrite ${r.lost[0]?.startsWith('the move') || r.lost[0]?.startsWith('the text') ? 'changed' : 'lost'} ${r.lost.join(', ')}`);
      for (const id of t?.requirementIds ?? []) if (!revertedRules.includes(id)) revertedRules.push(id);
    }
    const after = next === text ? report : checkDraft(skill, v, next, opts);
    // A span that moved a banned move onto a sibling, or left a slot, was refused inside applyRepair, that
    // span only: one bad sentence no longer throws away every good rewrite in the pass.
    const verdict = next === text
      ? { ok: false, why: reverted.length ? `every rewrite was refused (${reverted.map((r) => r.lost[0]).slice(0, 2).join('; ')})` : 'the rewrite returned nothing usable' }
      : acceptRepair(report, after);
    if (!verdict.ok) {
      why = `a rewrite was discarded: ${verdict.why}`;
      // Another attempt, while passes remain: the spans are planned again from the same draft, and the
      // reasons name the forms a move may not take. Stopping at the first refusal left the guard idle.
      continue;
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
  // THE LAST RESORT FOR AN INVENTED STORY: CUT IT. When every rewrite failed (a model kept offering a
  // slot where it was told to cut), the sentences the claim check flagged are removed outright, and the
  // output lists them. An invented story does not ship because a rewrite could not be agreed.
  if (!opts.placeholders && report.checked.some((c) => c.requirementId === 'UNSOURCED' && c.result.verdict === 'VIOLATED')) {
    const spans = report.checked.find((c) => c.requirementId === 'UNSOURCED')!.result.spans.slice().sort((a, b) => b.start - a.start);
    let next = text;
    for (const sp of spans) {
      const before = next.slice(0, sp.start).replace(/[ \t]+$/, ''); const after = next.slice(sp.end).replace(/^[ \t]+/, '');
      next = `${before}${before && after && !before.endsWith('\n') && !after.startsWith('\n') ? ' ' : ''}${after}`;
    }
    const after = checkDraft(skill, v, next, opts);
    if (!regressions(report, after).filter((id) => id !== 'UNSOURCED').length) {
      for (const sp of spans) cut.push(sp.text.trim().slice(0, 160));
      text = next; report = after;
      why = report.failed ? `invented stories cut outright; ${why}` : 'every REQUIRED measured rule now holds (invented stories cut outright)';
    }
  }
  return { output: text, report,
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), draft,
      ...(kept.length ? { integrityReverted: kept, revertedRules } : {}), ...(pairs.length ? { pairs: pairs.slice(0, 12) } : {}),
      ...(cut.length ? { storiesCut: cut } : {}), why } };
}
