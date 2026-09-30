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
import type { ClaimSensor } from './claim-extract.js';
import { checkFormat, type FormatProfile } from '../observers/formats.js';
import { findTerms } from '../observers/text.js';
import { planRepair, repairPrompt, applyRepair, acceptRepair, cutSpan, REPAIR_SYSTEM, REPAIR_SYSTEM_WITH_PLACEHOLDERS, REPAIR_SCHEMA, type Reverted, type Applied } from './repair.js';
import { keysOf, measurementId } from '../state/rule-key.js';
import { mechanicalFixes } from './mechanical-repair.js';
import type { RepairPair } from '../state/canonical-state.js';
import { createHash } from 'node:crypto';

/** Repair pairs kept per invocation: the raw material for "write this, not that" examples, bounded. */
const MAX_PAIRS_KEPT = 12;
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const broken = (r: VerifyReport): string[] => r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').map((c) => c.requirementId);

/**
 * Cut one flagged claim. A sentence goes the way `cutSpan` cuts it. A heading or a table row is a line
 * of its own (./claims.ts, claimUnitsOf), and cutting only its words left a bare `#` or an empty row
 * behind, so the whole line goes: the heading's markers, a setext heading's underline, the row's pipes.
 */
function cutClaim(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end); const lineEnd = nl === -1 ? text.length : nl;
  const pre = text.slice(lineStart, start); const post = text.slice(end, lineEnd);
  const span = text.slice(start, end).trim();
  const heading = /^\s*#{1,6}\s*$/.test(pre) && /^\s*#*\s*$/.test(post);
  const row = !pre.trim() && !post.trim() && span.startsWith('|');
  const under = nl === -1 ? null : /^[ \t]*(=+|-+)[ \t]*(?:\n|$)/.exec(text.slice(nl + 1));
  const setext = !pre.trim() && !post.trim() && under !== null;
  if (!heading && !row && !setext) return cutSpan(text, start, end);
  const stop = setext && under ? nl + 1 + under[0].length : nl === -1 ? text.length : nl + 1;
  // The blank line that set the heading off goes with it, unless it is all that separates two blocks.
  const head = text.slice(0, lineStart); let rest = text.slice(stop);
  if (/^[ \t]*\n/.test(rest) && (!head || /\n[ \t]*\n$/.test(head))) rest = rest.replace(/^[ \t]*\n/, '');
  return `${head}${rest}`;
}

export interface Refined { readonly output: string; readonly repair: RepairRecord | null; readonly report: VerifyReport }

export interface CheckOptions {
  /** what the person supplied: their notes, anecdotes, figures. Claims found here are theirs to make. */
  readonly material?: string;
  /** false turns off the invented-story and invented-figure check (`--allow-unsourced`) */
  readonly guardClaims?: boolean;
  /**
   * What happens to an invented story or figure. By default the sentence is CUT, in code (enforceClaims),
   * and the output lists what was cut, so the person can add their own.
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
  /**
   * WHO READS THE DRAFT FOR INVENTED CLAIMS (./claim-extract.ts): a small model typing every specific,
   * verified in code against the material, or the pattern check when no reader is configured. Absent,
   * the pattern check runs. Read through `checkDraftAsync`, which gives the reader its turn first.
   */
  readonly claimSensor?: ClaimSensor;
  /** the format this text is (../observers/formats.ts): its hard limits checked as the product's floor */
  readonly format?: FormatProfile | null;
}


/**
 * Every check a draft is held to. Where the standard holds the machine-tell rule and `learnedTells` are
 * given, the report carries one extra line, `<rule id>·learned`, for the learned phrases found, with the
 * rule's materiality; it fails the check like the rule itself.
 *
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
  const fmt = opts.format ? checkFormat(text, opts.format) : null;
  const fmtLines = opts.format && fmt ? [
    { requirementId: 'FORMAT', statement: `What ${opts.format.label} holds.`, materiality: 'REQUIRED', phase: 'STYLE' as const,
      result: { verdict: fmt.hard.length ? 'VIOLATED' as const : 'MET' as const, spans: fmt.hard, value: fmt.hard.length,
        detail: fmt.hard.length ? fmt.hard.map((h) => h.why).join('; ') : `within what ${opts.format.label} holds` } },
    ...(fmt.soft.length ? [{ requirementId: 'FORMAT·usual', statement: `Where ${opts.format.label} usually sits.`, materiality: 'PREFERRED', phase: 'STYLE' as const,
      result: { verdict: 'VIOLATED' as const, spans: fmt.soft, value: fmt.soft.length, detail: fmt.soft.map((h) => h.why).join('; ') } }] : []),
  ] : [];
  if (opts.guardClaims === false) return { ...report, checked: [...report.checked, ...fmtLines], failed: report.failed || (fmt?.hard.length ?? 0) > 0 };
  const reading = opts.claimSensor?.reading(text);
  // WHICH READING GATES. A reading from an unqualified reader carries the pattern check's as its `gate`
  // (./claim-extract.ts, QUALIFIED_READERS): the pattern's findings are the REQUIRED `UNSOURCED` line,
  // and the reader's are shown beside it as `UNSOURCED·reader`, PREFERRED: a warning the person reads,
  // never a failure, never a span the repair rewrites. Whichever reading gates keeps the id `UNSOURCED`,
  // because the repair, the last-resort cut and a structured output's retry all key on it.
  const gating = reading?.gate ?? reading;
  const claims = gating ? gating.claims : unsourcedClaims(text, opts.material ?? '', opts.placeholders ?? false);
  // Which instrument ran is part of the verdict: a line that says "no invented claims" means something
  // different from a model reader than from a pattern, and the record keeps the difference.
  const by = gating?.instrument ?? 'pattern check';
  const statement = 'Never invent a story, a quotation, an attribution or a specific the person did not supply.';
  const line = { requirementId: 'UNSOURCED', statement,
    materiality: 'REQUIRED', phase: 'ACCURACY' as const,
    result: { verdict: claims.length ? 'VIOLATED' as const : 'MET' as const, spans: [...claims], value: claims.length,
      detail: `${claims.length ? `${claims.length} claim(s) not in the material supplied` : 'no unsourced stories, quotations or specifics'} [${by}]` } };
  const readerOnly = reading?.gate ? reading : null;
  const readerLine = readerOnly ? [{ requirementId: READER_REPORT, statement,
    materiality: 'PREFERRED', phase: 'ACCURACY' as const,
    result: { verdict: readerOnly.claims.length ? 'VIOLATED' as const : 'MET' as const, spans: [...readerOnly.claims], value: readerOnly.claims.length,
      detail: (readerOnly.claims.length ? `${readerOnly.claims.length} claim(s) the reader found not in the material supplied` : 'the reader found no unsourced stories, quotations or specifics')
        + `; reported only: this reader is not qualified, so the pattern check decides what fails [${readerOnly.instrument}]` } }] : [];
  // PUBLIC FACTS ARE LISTED, NOT CUT. Unattributed general knowledge needs no source of the person's, but
  // it is still a specific someone should check before publishing. PREFERRED, so it warns and never fails.
  const pub = reading?.publicFacts ?? [];
  const pubBy = reading?.instrument ?? by;
  const pubLine = pub.length ? [{ requirementId: PUBLIC_FACTS, statement: 'Specifics stated as general knowledge: check them before you publish.',
    materiality: 'PREFERRED', phase: 'ACCURACY' as const,
    result: { verdict: 'VIOLATED' as const, spans: [...pub], value: pub.length, detail: `${pub.length} public fact(s) to check [${pubBy}]` } }] : [];
  return { ...report, checked: [...report.checked, line, ...readerLine, ...pubLine, ...fmtLines], failed: report.failed || claims.length > 0 || (fmt?.hard.length ?? 0) > 0 };
}

/** The line listing public facts to check: informational, never a rule the draft broke. */
export const PUBLIC_FACTS = 'UNSOURCED·public';
/** The line an unqualified claim reader reports on: PREFERRED, beside the pattern check's `UNSOURCED`. */
export const READER_REPORT = 'UNSOURCED·reader';

/** `checkDraft`, after the claim reader (when there is one) has read the text. Every async path uses this. */
export async function checkDraftAsync(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {}): Promise<VerifyReport> {
  if (opts.guardClaims !== false && opts.claimSensor) await opts.claimSensor.read(text);
  return checkDraft(skill, v, text, opts);
}

/** The spans the gating claim check flagged: whole claim units (a sentence, a heading, a table row). */
const flaggedClaims = (r: VerifyReport): readonly { start: number; end: number; text: string }[] =>
  r.checked.find((c) => c.requirementId === 'UNSOURCED' && c.result.verdict === 'VIOLATED')?.result.spans ?? [];

/** The slot left where a claim was, when the person asked for slots (`--placeholders`). */
export const CLAIM_SLOT = '[your own story, figure or source goes here]';

/**
 * AN INVENTED CLAIM IS DELETED, NEVER REWORDED. Every claim unit the gating check flags is removed in code,
 * or replaced by a slot when the person asked for slots. No model sees it: asked to "rewrite without the
 * story, keeping its point", a model turned "I pulled 200 tickets" into "when we looked at our tickets"
 * and the vaguer claim passed the check. No other guard can keep it either: the cut is not weighed against
 * the style rules, because a draft that breaks a paragraph rule is visible and a false claim is not.
 * Read again after each cut, up to three times, since removing a sentence can change what the next reads as.
 */
export async function enforceClaims(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {},
  known?: VerifyReport): Promise<{ text: string; report: VerifyReport; cut: string[] }> {
  let report = known ?? await checkDraftAsync(skill, v, text, opts);
  const cut: string[] = [];
  if (opts.guardClaims === false) return { text, report, cut };
  for (let round = 0; round < 3; round++) {
    const spans = [...flaggedClaims(report)].sort((a, b) => b.start - a.start);
    if (!spans.length) break;
    let next = text;
    for (const sp of spans) {
      next = opts.placeholders ? `${next.slice(0, sp.start)}${CLAIM_SLOT}${next.slice(sp.end)}` : cutClaim(next, sp.start, sp.end);
      cut.push(sp.text.trim().slice(0, 160));
    }
    if (next === text) break;
    text = next; report = await checkDraftAsync(skill, v, text, opts);
  }
  return { text, report, cut: cut.reverse() };
}

/** The report with the invented-claim line left out: what a model rewrite may be pointed at. */
const withoutClaims = (r: VerifyReport): VerifyReport => ({ ...r, checked: r.checked.filter((c) => c.requirementId !== 'UNSOURCED') });

export async function refineToStandard(
  client: InferenceClient, budget: Budget, skill: string, v: StandardVersion, draft: string, maxPasses = 2,
  opts: CheckOptions = {},
): Promise<Refined> {
  let first = await checkDraftAsync(skill, v, draft, opts);
  if (!first.failed) return { output: draft, repair: null, report: first };
  const cut: string[] = [];
  // Whether the claim reader had already failed before this run: read before the first cut, which may be
  // the read that fails it.
  const sensor = opts.guardClaims !== false ? opts.claimSensor : undefined;
  let readDegraded = sensor?.degraded ?? false; let degradedMidLoop = false;
  // Claims first, in code, before any rewrite: a style pass never holds an invented sentence.
  const enforced = await enforceClaims(skill, v, draft, opts, first);
  let text = enforced.text; let report = enforced.report; let passes = 0;
  cut.push(...enforced.cut);
  let why = cut.length ? 'invented claims cut' : 'every REQUIRED measured rule now holds';
  // ONE INSTRUMENT ON BOTH SIDES OF EVERY COMPARISON. A claim reader that fails mid-loop degrades for
  // good (./claim-extract.ts, modelSensor), and from then on reads every text by the pattern check. The
  // reports this loop holds were read by the model; compared with a report read by the pattern, a figure
  // the model flagged and the pattern cannot see looked fixed. So on the first read after the failure, the
  // held reports are read again by the pattern check before anything is compared.
  const sameInstrument = (): void => {
    if (!sensor?.degraded || readDegraded) return;
    readDegraded = true; degradedMidLoop = true;
    first = checkDraft(skill, v, draft, opts);
    report = checkDraft(skill, v, text, opts);
  };
  sameInstrument();
  const kept: string[] = []; const revertedRules: string[] = [];
  // THE FIXES THAT NEED NO MODEL (./mechanical-repair.ts): an em dash the author never uses, a paragraph
  // longer than they write. Tried before the rewrite passes, which then have less to do, and again after,
  // because a rewrite can put a dash back. Kept only on the same terms as a rewrite: nothing gets worse.
  const mechanical: string[] = [];
  const fixMechanically = async (): Promise<void> => {
    const m = mechanicalFixes(v, report, text);
    if (m.text === text) return;
    const after = await checkDraftAsync(skill, v, m.text, opts);
    sameInstrument();
    if (!acceptRepair(report, after).ok) return;
    text = m.text; report = after; mechanical.push(...m.fixed);
  };
  if (report.failed) await fixMechanically();
  // ACCURACY BEFORE STYLE, for the owner's own accuracy rules (the invented-claim line is never planned:
  // it was cut above). When both kinds are broken, accuracy gets ONE pass of its own, not charged to the
  // `maxPasses` style passes; a pass that makes no progress is dropped and the loop moves on to style.
  let accuracyTried = false; let stylePasses = 0;
  const pairs: RepairPair[] = [];
  const keys = keysOf(v.requirements);
  const keyOf = new Map(v.requirements.map((r, i) => [r.requirementId, keys[i]]));
  const checkOf = new Map(v.requirements.flatMap((r) => (r.measurement ? [[r.requirementId, measurementId(r.measurement)] as const] : [])));
  while (report.failed && stylePasses < maxPasses) {
    const plannable = withoutClaims(report);
    const accuracy = accuracyTried ? [] : planRepair(text, plannable, { phase: 'ACCURACY' });
    const accuracyPass = accuracy.length > 0 && planRepair(text, plannable, { phase: 'STYLE' }).length > 0;
    const targets = accuracyPass ? accuracy : planRepair(text, plannable);
    accuracyTried = true;
    if (!targets.length) { why = cut.length ? `invented claims cut; ${flaggedClaims(report).length ? 'some could not be located to cut' : 'nothing else the rules pointed at could be rewritten'}` : 'nothing the rules pointed at could be rewritten'; break; }
    // A REPAIR THAT CANNOT RUN NEVER COSTS THE DRAFT. The draft is already paid for; a failed call (a
    // refusal, a 500, an exhausted budget) delivers it as it stands and says why.
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
      kept.push(`"${t?.text.slice(0, 80) ?? `span ${r.id}`}" kept: the rewrite ${r.kind === 'MOVE' || r.kind === 'SLOT' ? 'changed' : 'lost'} ${r.lost.join(', ')}`);
      for (const id of t?.requirementIds ?? []) if (!revertedRules.includes(id)) revertedRules.push(id);
    }
    const after = next === text ? report : await checkDraftAsync(skill, v, next, opts);
    sameInstrument();
    // A rewrite that adds an invented claim makes UNSOURCED worse, and `acceptRepair` refuses it.
    const verdict = next === text
      ? { ok: false, why: reverted.length ? `every rewrite was refused (${reverted.map((r) => r.lost[0]).slice(0, 2).join('; ')})` : 'the rewrite returned nothing usable' }
      : acceptRepair(report, after);
    if (!verdict.ok) {
      why = `a rewrite was discarded: ${verdict.why}`;
      continue;
    }
    text = next; report = after;
    // An accepted pass's style rewrites are examples of this standard in action. One rule per pair.
    for (const a of applied) {
      const t = targets.find((x) => x.id === a.id);
      const rid = t?.requirementIds.length === 1 ? t.requirementIds[0] : undefined;
      const key = rid ? keyOf.get(rid) : undefined;
      if (rid && key && a.before !== a.after) pairs.push({ key, check: checkOf.get(rid), before: a.before, after: a.after });
    }
    why = report.failed ? verdict.why : 'every REQUIRED measured rule now holds';
  }
  if (report.failed) await fixMechanically();
  if (mechanical.length) {
    const how = `fixed without a model: ${mechanical.join('; ')}`;
    why = report.failed ? `${why}; ${how}` : `every REQUIRED measured rule now holds (${how})`;
  }
  // AND AGAIN AT THE END, on the text that ships: whatever the passes did, no flagged claim survives them.
  const last = await enforceClaims(skill, v, text, opts, report);
  sameInstrument();
  if (last.cut.length) { text = last.text; report = last.report; cut.push(...last.cut); }
  if (cut.length && !report.failed) why = 'every REQUIRED measured rule now holds (invented claims cut)';
  if (degradedMidLoop) {
    why = `${why} (the claim reader failed during the repair, so the draft and every rewrite were read again by the pattern check: `
      + 'each comparison used one instrument, and a claim only the reader could see is no longer checked)';
  }
  return { output: text, report,
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), draft,
      ...(kept.length ? { integrityReverted: kept, revertedRules } : {}), ...(pairs.length ? { pairs: pairs.slice(0, MAX_PAIRS_KEPT) } : {}),
      ...(cut.length ? { storiesCut: cut } : {}), why } };
}
