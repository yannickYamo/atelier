// atelier/core/loop/run-repair.ts — THE LOOP: CHECK THE DRAFT, REWRITE WHAT BROKE, CHECK AGAIN.
//
// Up to `maxPasses` rewrites of only the spans that break a REQUIRED measured rule, each one kept only
// if it breaks nothing that held and fixes at least one thing that did not (`acceptRepair`). Every
// call is metered through the caller's budget. The standard is read, never written.

import type { CheckContext } from '../observers/registry.js';
import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { StandardVersion, RepairRecord } from '../state/canonical-state.js';
import { verifyText, type VerifyReport, type RuleCheck } from '../observers/verify.js';
import { unsourcedClaims, claimUnitsOf } from './claims.js';
import { derivedFromKnown } from './derived.js';
import { answerWorkClaims, answerSentences, judgedOnly } from './answer-claims.js';
import { assertMayCut, type CutAuthority } from './cut-authority.js';
import type { ContextJudge } from './context-judge.js';
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
  /** the request and the named material this output was written from, for the rules that are about them (../observers/registry.ts, `CheckContext`) */
  readonly context?: CheckContext;
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
  /**
   * Rules not applied to this output, and why: withheld from the run's prompt, so not counted against it
   * either (a conditional rule whose material is not bound; a presentation rule the request overrides).
   * Reported as not applicable with the reason, never silently dropped.
   */
  readonly waived?: ReadonlyMap<string, string>;
  /** a small model for the questions that need context (./context-judge.ts); absent, the word patterns decide */
  readonly judge?: ContextJudge;
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
  const base = waive(verifyText(skill, v, text, opts.context), opts.waived);
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
  const flagged = gating ? gating.claims : unsourcedClaims(text, opts.material ?? '', opts.placeholders ?? false);
  // A FIGURE COMPUTED FROM THE PERSON'S OWN is theirs: "17 times 6 is 102", "revenue grew 25%" from 80 to 100.
  // Listed with its arithmetic to check, never cut (./derived.ts).
  // THE NUMBER IS EXEMPT, NOT THE SENTENCE. "According to a 2024 report, revenue grew 25% from 80 to 100"
  // has correct arithmetic and an invented report; exempting the sentence let the report ride through on
  // the arithmetic. A sentence that also attributes or cites something stays flagged, as a source.
  const derived = flagged.filter((c) => c.kind === 'FIGURE' && !ATTRIBUTION.test(c.text) && derivedFromKnown(c.text, opts.material ?? ''));
  const claims = flagged.filter((c) => !derived.includes(c))
    .map((c) => (c.kind === 'FIGURE' && ATTRIBUTION.test(c.text) && derivedFromKnown(c.text, opts.material ?? '')
      ? { ...c, kind: 'SOURCE' as const, why: 'a source or attribution not in your material or your request, around a figure that is yours: the sentence is cut; if the source is yours, add it to your material' } : c));
  // Which instrument ran is part of the verdict: a line that says "no invented claims" means something
  // different from a model reader than from a pattern, and the record keeps the difference.
  const by = gating?.instrument ?? 'pattern check';
  // LISTED, NOT CUT, where the format says specifics are the reader's to check (formats.ts, `claims`).
  // IN ANSWERS, WHAT IS ABOUT THE PERSON'S OWN SYSTEM IS CUT; GENERAL KNOWLEDGE IS LISTED. Listing
  // everything left "Checked this against the failing case: … returns 200" and an invented "2.3M rows, 40
  // min" in the answer, and a plan that named a table and a script the request never mentioned. An
  // answer's claim that the assistant did or saw something, a result figure, or an identifier from the
  // person's environment that the request did not give is cut (./answer-claims.ts); the rest is listed.
  const listOnly = opts.format?.claims === 'list';
  const workClaims = listOnly ? answerWorkClaims(text, opts.material ?? '', claims) : [];
  const judgeFlags = listOnly ? judgedOnly(text, opts.judge?.workClaims(answerSentences(text)) ?? null, workClaims) : [];
  const toCut = listOnly ? workClaims : claims;
  const toList = listOnly ? [...claims.filter((c) => !workClaims.some((w) => w.start === c.start)), ...judgeFlags.filter((j) => !claims.some((c) => c.start === j.start))] : [];
  const statement = 'Never invent a story, a quotation, an attribution or a specific the person did not supply.';
  // Which instrument found what may be cut: the patterns decide an answer's work claims; otherwise the
  // gating reading's instrument, qualified or not (./cut-authority.ts refuses the ones that may not cut).
  // The sensor says which instrument gates: 'pattern' for the pattern check, or a reader that degraded to it.
  const authority: CutAuthority = listOnly || !gating || reading?.gate || !opts.claimSensor || opts.claimSensor.gate === 'pattern' ? 'pattern'
    : opts.claimSensor?.qualified ? 'qualified-reader' : process.env.ATELIER_CLAIMS_GATE === 'reader' ? 'owner-override' : 'unqualified-reader';
  const line = { requirementId: 'UNSOURCED', statement: listOnly ? 'Never claim work done, a result seen, or a detail of the person\'s own system that the request did not give.' : statement,
    materiality: 'REQUIRED', phase: 'ACCURACY' as const, authority,
    result: { verdict: toCut.length ? 'VIOLATED' as const : 'MET' as const, spans: [...toCut], value: toCut.length,
      detail: `${toCut.length ? `${toCut.length} claim(s) not in the material supplied` : 'no unsourced stories, quotations or specifics'} [${by}]` } };
  const checkLine = toList.length ? [{ requirementId: CLAIMS_TO_CHECK, statement: 'Specifics not in the material supplied: listed for you to check, never cut in this format.',
    materiality: 'PREFERRED', phase: 'ACCURACY' as const,
    result: { verdict: 'VIOLATED' as const, spans: [...toList], value: toList.length, detail: `${toList.length} specific(s) to check [${by}]` } }] : [];
  const readerOnly = reading?.gate ? reading : null;
  const readerLine = readerOnly ? [{ requirementId: READER_REPORT, statement,
    materiality: 'PREFERRED', phase: 'ACCURACY' as const,
    result: { verdict: readerOnly.claims.length ? 'VIOLATED' as const : 'MET' as const, spans: [...readerOnly.claims], value: readerOnly.claims.length,
      detail: (readerOnly.claims.length ? `${readerOnly.claims.length} claim(s) the reader found not in the material supplied` : 'the reader found no unsourced stories, quotations or specifics')
        + `; reported only: this reader is not qualified, so the pattern check decides what fails [${readerOnly.instrument}]` } }] : [];
  // PUBLIC FACTS ARE LISTED, NOT CUT. Unattributed general knowledge needs no source of the person's, but
  // it is still a specific someone should check before publishing. PREFERRED, so it warns and never fails.
  const pub = [...(reading?.publicFacts ?? []), ...derived.map((c) => ({ start: c.start, end: c.end, text: c.text, why: 'a figure computed from yours: check the arithmetic' }))];
  const pubBy = reading?.instrument ?? by;
  const pubLine = pub.length ? [{ requirementId: PUBLIC_FACTS, statement: 'Specifics stated as general knowledge: check them before you publish.',
    materiality: 'PREFERRED', phase: 'ACCURACY' as const,
    result: { verdict: 'VIOLATED' as const, spans: [...pub], value: pub.length, detail: `${pub.length} public fact(s) to check [${pubBy}]` } }] : [];
  // FAILS CLOSED. A qualified reader that could not run leaves the pattern check, which catches a fraction
  // of what the reader does. In writing that is not a check of invented claims at the level the standard was
  // promised, and it is not reported as one: the run fails until it is read again. Answers list by design.
  const unread = !listOnly && opts.claimSensor?.degraded && opts.claimSensor.qualified ? [{ requirementId: UNREAD, materiality: 'REQUIRED', phase: 'ACCURACY' as const,
    statement: 'The qualified claim reader read this text.',
    result: { verdict: 'VIOLATED' as const, spans: [], value: null, detail: 'the claim reader could not run, so this text was checked by the pattern check only: run it again, or check its specifics yourself' } }] : [];
  return { ...report, checked: [...report.checked, line, ...checkLine, ...readerLine, ...pubLine, ...fmtLines, ...unread],
    failed: report.failed || toCut.length > 0 || (fmt?.hard.length ?? 0) > 0 || unread.length > 0 };
}

/** The line that fails a writing check whose qualified claim reader could not run. */
export const UNREAD = 'UNSOURCED·unread';

/** The report with each waived rule shown as not applicable, with its reason, and `failed` recomputed. */
function waive(r: VerifyReport, waived?: ReadonlyMap<string, string>): VerifyReport {
  if (!waived?.size) return r;
  const checked = r.checked.map((c) => (waived.has(c.requirementId)
    ? { ...c, result: { verdict: 'NOT_APPLICABLE' as const, spans: [], value: null, detail: `withheld for this run: ${waived.get(c.requirementId) ?? ''}` } } : c));
  return { ...r, checked, failed: checked.some((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED') };
}

/** A sentence that attributes or cites: its source is a claim of its own, whatever its figures. */
const ATTRIBUTION = /\b(?:according to|(?:a|an|the|this|one)\s+(?:\d{4}\s+)?(?:\w+\s+){0,2}(?:report|study|survey|poll|paper|analysis|benchmark|audit)\b|research (?:shows|found|finds|suggests)|studies (?:show|found)|data from|(?:said|says|told (?:me|us)|reported|estimated|estimates)\b)|["“][^"”]{3,}["”]/i;

/** The line listing public facts to check: informational, never a rule the draft broke. */
export const PUBLIC_FACTS = 'UNSOURCED·public';
/** The line an unqualified claim reader reports on: PREFERRED, beside the pattern check's `UNSOURCED`. */
export const READER_REPORT = 'UNSOURCED·reader';

/** `checkDraft`, after the claim reader (when there is one) has read the text. Every async path uses this. */
export async function checkDraftAsync(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {}): Promise<VerifyReport> {
  if (opts.guardClaims !== false && opts.claimSensor) await opts.claimSensor.read(text);
  if (opts.guardClaims !== false && opts.format?.claims === 'list' && opts.judge) await opts.judge.readAnswer(answerSentences(text));
  return checkDraft(skill, v, text, opts);
}

/** The spans the gating claim check flagged: whole claim units. Only a REQUIRED line cuts; a listed one never does. */
const flaggedClaims = (r: VerifyReport): readonly { start: number; end: number; text: string }[] =>
  r.checked.find((c) => c.requirementId === 'UNSOURCED' && c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED')?.result.spans ?? [];
/** The specifics a `list` format leaves in for the person to check. */
export const listedClaims = (r: VerifyReport): string[] =>
  (r.checked.find((c) => c.requirementId === CLAIMS_TO_CHECK && c.result.verdict === 'VIOLATED')?.result.spans ?? []).map((sp) => sp.text.trim().slice(0, 160));
/** The line listing an answer's specifics to check: never a rule the answer broke. */
export const CLAIMS_TO_CHECK = 'UNSOURCED·check';

/** The slot left where a claim was, when the person asked for slots (`--placeholders`). */
export const CLAIM_SLOT = '[your own story, figure or source goes here]';

/**
 * ONE JUDGEMENT PER SENTENCE. The claim reader is a model, and a model reading the same sentence twice
 * can answer differently. The loop re-reads the text after every cut and every rewrite, and a reader that
 * flagged three sentences of a technical answer on the first read flagged others it had passed on the
 * next, and others again on the next: fourteen sentences of sixteen were cut, the answer was gone, and
 * the report said every rule held. So a sentence the reader has passed once, in the fuller text, keeps
 * that verdict for the rest of the run. A sentence a rewrite changed, or added, is new and is read.
 */
export interface ClaimMemory {
  apply(text: string, report: VerifyReport): VerifyReport;
  /** hold these sentences to "listed for the person to check" for the rest of the run: never cut, never failing */
  demote(sentences: readonly string[]): void;
  /** every sentence demoted so far, in order */
  listed(): string[];
  /**
   * hold these demoted sentences as UNCONFIRMED: never cut, and while they stay in the text, a failure of
   * the claim floor (`INCONCLUSIVE`) rather than a pass
   */
  doubt(sentences: readonly string[]): void;
}
export function claimMemory(): ClaimMemory {
  const key = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase();
  const passed = new Set<string>();
  const demoted = new Map<string, string>();
  const doubted: string[] = [];
  return {
    demote(sentences) { for (const t of sentences) demoted.set(key(t), t.trim().slice(0, 160)); },
    doubt(sentences) { doubted.push(...sentences); },
    listed() { return [...demoted.values()]; },
    apply(text, report) { return withInconclusive(settle(text, report), text, doubted); },
  };
  function settle(text: string, report: VerifyReport): VerifyReport {
    const line = report.checked.find((c) => c.requirementId === 'UNSOURCED');
    if (!line) return report;
    const flagged = new Set(line.result.spans.map((sp) => key(sp.text)));
    const kept = line.result.spans.filter((sp) => !passed.has(key(sp.text)) && !demoted.has(key(sp.text)));
    for (const u of claimUnitsOf(text)) { const k = key(u.text); if (k && !flagged.has(k)) passed.add(k); }
    if (kept.length === line.result.spans.length) return report;
    const settled = line.result.spans.length - kept.length;
    const checked = report.checked.map((c) => (c !== line ? c : { ...c, result: { ...c.result, spans: kept, value: kept.length,
      verdict: kept.length ? 'VIOLATED' as const : 'MET' as const,
      detail: `${c.result.detail}; ${settled} sentence(s) already passed or listed for you to check kept that verdict` } }));
    return { ...report, checked, failed: checked.some((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED') };
  }
}

/**
 * AN INVENTED CLAIM IS DELETED, NEVER REWORDED. Every claim unit the gating check flags is removed in code,
 * or replaced by a slot when the person asked for slots. No model sees it: asked to "rewrite without the
 * story, keeping its point", a model turned "I pulled 200 tickets" into "when we looked at our tickets"
 * and the vaguer claim passed. No other rule can keep it either: the cut is not weighed against the style
 * rules, because a draft that breaks a paragraph rule is visible and a false claim is not. The text is read
 * again after each cut, at most three times, with `memory` holding each sentence to its first verdict.
 */
export async function enforceClaims(skill: string, v: StandardVersion, text: string, opts: CheckOptions = {},
  known?: VerifyReport, memory: ClaimMemory = claimMemory()): Promise<{ text: string; report: VerifyReport; cut: string[]; listed: string[] }> {
  let report = memory.apply(text, known ?? await checkDraftAsync(skill, v, text, opts));
  const cut: string[] = [];
  if (opts.guardClaims === false) return { text, report, cut, listed: [] };
  for (let round = 0; round < 3; round++) {
    let spans = [...flaggedClaims(report)].sort((a, b) => b.start - a.start);
    if (!spans.length) break;
    const authority = report.checked.find((c) => c.requirementId === 'UNSOURCED')?.authority ?? 'unqualified-reader';
    // An owner's override fails the check on what the unqualified reader finds; it never deletes (./cut-authority.ts).
    if (authority === 'owner-override') break;
    assertMayCut(authority);
    // THE BALANCE. A third or more of the text flagged (at least three sentences) is the check misreading
    // general knowledge far more often than a draft that invented a third of itself. Then only what is
    // unambiguously invented is cut: a story told as lived, a claim of evidence, a quotation or an
    // attribution. Figures, dates and facts are listed for the person to check instead of deleted.
    const units = claimUnitsOf(text).length;
    if (spans.length >= 3 && units && spans.length / units >= 1 / 3) {
      const lived = (sp: object): boolean => { const k = (sp as { kind?: string }).kind; return k === 'EXPERIENCE' || k === 'SOURCE'; };
      const unsure = spans.filter((sp) => !lived(sp)).map((sp) => sp.text);
      memory.demote(unsure);
      // LISTED IS NOT PASSED. Where the format lists specifics by design (an answer), the list is the verdict.
      // In published writing it is not: a heavy flag rate means the check could not tell general knowledge
      // from invention, and an invented figure listed behind a "holds" line ships as if checked. Those
      // sentences stay a failure of the claim floor until the person confirms them or binds their material.
      if (opts.format?.claims !== 'list') memory.doubt(unsure);
      report = memory.apply(text, report);
      spans = spans.filter(lived);
      if (!spans.length) break;
    }
    let next = text;
    for (const sp of spans) {
      next = opts.placeholders ? `${next.slice(0, sp.start)}${CLAIM_SLOT}${next.slice(sp.end)}` : cutClaim(next, sp.start, sp.end);
      cut.push(sp.text.trim().slice(0, 160));
    }
    if (next === text) break;
    text = next; report = memory.apply(text, await checkDraftAsync(skill, v, text, opts));
  }
  return { text, report, cut: cut.reverse(), listed: memory.listed() };
}

/** The id of the line that holds claims the check could neither clear nor cut. */
export const INCONCLUSIVE = 'UNSOURCED·inconclusive';

/**
 * The report with one REQUIRED line for the flagged sentences still in the text that were listed, not
 * cut, because too much was flagged to cut. It fails the check: not a pass, not a cut, a question for
 * the person. Absent when there are none.
 */
export function withInconclusive(report: VerifyReport, text: string, sentences: readonly string[]): VerifyReport {
  const norm = (t: string): string => t.replace(/\s+/g, ' ').trim();
  const here = norm(text);
  const still = [...new Set(sentences.map(norm))].filter((t) => t && here.includes(t));
  if (!still.length) return report;
  const spans = still.map((t) => { const at = text.indexOf(t); return { start: Math.max(0, at), end: Math.max(0, at) + t.length, text: t,
    why: 'one of many specifics flagged at once: the check could not tell general knowledge from invention, so it is neither cut nor passed. Confirm it, or bind your material' }; });
  const line: RuleCheck = { requirementId: INCONCLUSIVE, statement: 'Specifics the claim check could neither clear nor cut: yours to confirm before this is used.',
    materiality: 'REQUIRED', phase: 'ACCURACY', result: { verdict: 'VIOLATED', spans, value: spans.length, detail: `${spans.length} specific(s) unconfirmed` } };
  return { ...report, checked: [...report.checked.filter((c) => c.requirementId !== INCONCLUSIVE), line], failed: true };
}

/**
 * DID THE CUT LEAVE A FRAGMENT? A list item with nothing in it, a label with nothing under it, nothing at
 * all, only a label or a "Next:" line where the answer was, or, in a draft of 80 words or more, under half
 * its words. Returns what broke, most specific first, or null. Only what the cut introduced counts: a draft
 * that had an empty bullet already is not blamed on the cut. `structureOnly` judges a redraft, which is
 * meant to be shorter by what it dropped.
 */
export function brokenByCut(before: string, after: string, opts: { readonly structureOnly?: boolean } = {}): string | null {
  const count = (t: string, re: RegExp): number => (t.match(re) ?? []).length;
  // A marker alone on its line inside a list (next to another item). A bare "102." answering "17 times 6"
  // is an answer, not an empty item.
  const EMPTY_ITEM = /(?:^[ \t]*(?:\d+[.)]|[-*+])[ \t]+\S[^\n]*\n)[ \t]*(?:\d+[.)]|[-*+])[ \t]*$|^[ \t]*(?:\d+[.)]|[-*+])[ \t]*\n[ \t]*(?:\d+[.)]|[-*+])[ \t]/gm;
  const DANGLING = /^[^\n#|>`]*\S:[ \t]*\n(?:[ \t]*\n)*(?=#|$(?![\s\S]))/gm;
  if (count(after, EMPTY_ITEM) > count(before, EMPTY_ITEM)) return 'an empty list item';
  if (count(after, DANGLING) > count(before, DANGLING)) return 'a label with nothing under it';
  const words = (t: string): number => (t.match(/\S+/g) ?? []).length;
  if (!words(after)) return 'nothing';
  // Only a label or a "Next:" line left: the answer it introduced is gone ("Next: nothing to do.").
  const body = after.split('\n').map((l) => l.trim()).filter(Boolean);
  if (body.every((l) => l.endsWith(':') || /^(?:\*\*|_)?next\b/i.test(l))) return 'no answer, only its label';
  // A redraft is meant to be shorter by what it dropped: only its structure is judged.
  if (opts.structureOnly) return null;
  // A share only means something in a draft long enough for a gutting to show.
  if (words(before) >= 80 && words(after) < words(before) / 2) return `${words(after)} of ${words(before)} words`;
  return null;
}

/** A sentence that opens by pointing back at what came before it. */
const POINTS_BACK = /^\W*(?:this|that|these|those|it|its|they|them|either|if it|if so|so|but|which|such|here|there|nobody\b[^.!?]*\bthem)\b/i;
const norm = (t: string): string => t.toLowerCase().replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();

/**
 * THE SENTENCES A CUT LEFT POINTING AT NOTHING. "An issue must fit in a week. If it can't, we split it."
 * with the first cut delivers "If it can't, we split it."; a post opened on "Nobody misses them." once
 * their subject went. Each sentence of the cut text that opens by pointing back, and that followed a cut
 * sentence (or is the new first sentence), is returned.
 */
export function danglingAfterCut(before: string, after: string, cut: readonly string[]): string[] {
  const gone = new Set(cut.map(norm));
  const was = claimUnitsOf(before).map((u) => u.text.trim());
  const now = claimUnitsOf(after).map((u) => u.text.trim());
  const out: string[] = [];
  now.forEach((t, i) => {
    if (!POINTS_BACK.test(t)) return;
    const at = was.findIndex((w) => norm(w) === norm(t));
    const followedCut = at > 0 && gone.has(norm(was[at - 1]));
    const newlyFirst = i === 0 && at > 0;
    if (followedCut || newlyFirst) out.push(t);
  });
  return out;
}

/**
 * Whether a redraft kept everything it was not asked to change: every sentence of the original outside the
 * cut and the dangling ones is still there (compared without markup, case or spacing), save a label that
 * the cut left empty. A redraft that drops supported content is refused like one that invents.
 */
export function redraftPreserves(original: string, redrafted: string, changeable: readonly string[]): boolean {
  const free = new Set(changeable.map(norm));
  const body = norm(redrafted);
  return claimUnitsOf(original).map((u) => u.text.trim())
    .filter((t) => !free.has(norm(t)) && !t.endsWith(':'))
    .every((t) => body.includes(norm(t)));
}

/**
 * `danglingAfterCut`, read by the context judge when there is one: every sentence that followed a cut one
 * (or is the new first sentence) is put to it, and those it says no longer stand alone are returned. The
 * word pattern is the floor when there is no judge or it cannot answer.
 */
export async function danglingJudged(before: string, after: string, cut: readonly string[], judge?: ContextJudge): Promise<string[]> {
  if (!judge) return danglingAfterCut(before, after, cut);
  const gone = new Set(cut.map(norm));
  const was = claimUnitsOf(before).map((u) => u.text.trim());
  const now = new Set(claimUnitsOf(after).map((u) => norm(u.text)));
  const pairs: { removed: string; next: string }[] = [];
  was.forEach((w, i) => {
    const next = was[i + 1];
    if (gone.has(norm(w)) && next && !gone.has(norm(next)) && now.has(norm(next))) pairs.push({ removed: w, next });
  });
  const verdicts = await judge.standsAlone(pairs);
  if (!verdicts) return danglingAfterCut(before, after, cut);
  return pairs.filter((_, i) => !verdicts[i]).map((p) => p.next);
}

export const REDRAFT_SYSTEM = `You are given a draft and a numbered list of statements that must go because nothing the author
supplied supports them. Rewrite the draft so it reads whole without them.

  - Remove each listed statement entirely. Do not restate it in other words, soften it, or hint at it.
  - Add nothing: no new claim, story, figure, result, source or example.
  - Keep everything else word for word, including its structure, code blocks and the answer to the
    request. Only the sentences listed as pointing at removed text may be rewritten, so each stands on
    its own, or dropped.
  - If a list or a section is left without content, drop its heading or label too.
  - If what remains no longer answers the request, end with the one question you would need answered
    to answer it (which service, which environment, which file), instead of guessing.
  - Use no em dash (—).

Return the whole rewritten draft.`;
export const REDRAFT_SCHEMA: Record<string, unknown> = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false };

/**
 * WHEN THE CUT TOOK THE ANSWER WITH IT. A third or more of a draft's sentences cut (and at least three)
 * is not a draft with a few invented claims removed; it is usually the check misreading general knowledge
 * (a coding answer, an explainer) as the person's own specifics. It is said as that, never as "every rule
 * holds". Returns the sentence to say, or null.
 */
export function heavyCut(draft: string, cut: readonly string[]): string | null {
  const units = claimUnitsOf(draft).length;
  if (cut.length < 3 || !units || cut.length / units < 1 / 3) return null;
  return `the claim check cut ${cut.length} of ${units} sentences, so much of the draft is gone. `
    + 'If they are general knowledge rather than claims about you (a coding answer, an explainer), run with '
    + '--allow-unsourced; if they are yours, bind them with --with or atelier material';
}

/** The report with the invented-claim line left out: what a model rewrite may be pointed at. */
const withoutClaims = (r: VerifyReport): VerifyReport => ({ ...r, checked: r.checked.filter((c) => c.requirementId !== 'UNSOURCED' && c.requirementId !== INCONCLUSIVE && c.requirementId !== UNREAD) });

export async function refineToStandard(
  client: InferenceClient, budget: Budget, skill: string, v: StandardVersion, draft: string, maxPasses = 2,
  opts: CheckOptions = {},
): Promise<Refined> {
  const memory = claimMemory();
  const check = async (t: string): Promise<VerifyReport> => memory.apply(t, await checkDraftAsync(skill, v, t, opts));
  let first = await check(draft);
  if (!first.failed) {
    const toCheck = listedClaims(first);
    return { output: draft, report: first, repair: toCheck.length ? { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: sha(draft), draft,
      claimsToCheck: toCheck, why: 'every REQUIRED measured rule holds' } : null };
  }
  const cut: string[] = [];
  // Whether the claim reader had already failed before this run: read before the first cut, which may be
  // the read that fails it.
  const sensor = opts.guardClaims !== false ? opts.claimSensor : undefined;
  let readDegraded = sensor?.degraded ?? false; let degradedMidLoop = false;
  // Claims first, in code, before any rewrite: a style pass never holds an invented sentence.
  // NEVER A FRAGMENT FOR A PASS. A cut that leaves an empty bullet, a bare label or no answer is redrafted
  // once without the flagged statements (never reworded, see REDRAFT_SYSTEM) and kept only if it reads
  // whole and nothing in it is flagged. Otherwise the text goes out uncut, the claims listed and the check
  // failed: a visible failure, never a hollow pass.
  const listedHere: string[] = []; const notes: string[] = []; let keptUncut = false;
  const cutSafely = async (t: string, known: VerifyReport): Promise<{ text: string; report: VerifyReport; cut: string[] }> => {
    const e = await enforceClaims(skill, v, t, opts, known, memory);
    listedHere.push(...e.listed);
    // Found by the pattern (may be cut with its parent) or by the judge (may only be redrafted).
    const patternDangling = e.cut.length ? danglingAfterCut(t, e.text, e.cut) : [];
    const judgedDangling = e.cut.length && opts.judge ? await danglingJudged(t, e.text, e.cut, opts.judge) : [];
    const dangling = [...new Set([...patternDangling, ...judgedDangling])];
    const broke = e.cut.length ? brokenByCut(t, e.text) ?? (dangling.length ? `${dangling.length} sentence(s) pointing at cut text` : null) : null;
    if (!broke) return e;
    const redrafted = await redraft(t, e.cut, dangling);
    if (redrafted !== null) {
      const rr = await check(redrafted);
      if (!flaggedClaims(rr).length && !brokenByCut(t, redrafted, { structureOnly: true }) && redraftPreserves(t, redrafted, [...e.cut, ...dangling])) {
        notes.push(`cutting ${e.cut.length} flagged claim(s) left ${broke}, so the draft was rewritten once without them`);
        return { text: redrafted, report: rr, cut: e.cut };
      }
    }
    // Only sentences left pointing at nothing, and no redraft to be had: they go with their parent, when
    // that leaves the text whole. An invented claim is not shipped to spare a sentence that means nothing.
    if (patternDangling.length && !brokenByCut(t, e.text)) {
      assertMayCut('pattern');
      let withParents = e.text;
      for (const d of patternDangling) { const at = withParents.indexOf(d); if (at !== -1) withParents = cutClaim(withParents, at, at + d.length); }
      if (!brokenByCut(t, withParents)) {
        notes.push(`${patternDangling.length} sentence(s) that pointed at cut text were cut with it`);
        return { text: withParents, report: await check(withParents), cut: [...e.cut, ...patternDangling] };
      }
    }
    // Only the judge saw a dangling sentence and no redraft could be had: the cut stands, the sentence is said.
    if (!brokenByCut(t, e.text) && judgedDangling.length && !patternDangling.length) {
      notes.push(`${judgedDangling.length} sentence(s) may point at cut text (read by the context judge, not measured): check them`);
      return e;
    }
    notes.push(`the ${e.cut.length} flagged claim(s) were not cut: cutting them left ${broke}. Check them before you use this`);
    listedHere.push(...e.cut); keptUncut = true;
    return { text: t, report: known, cut: [] };
  };
  const redraft = async (t: string, gone: readonly string[], pointing: readonly string[] = []): Promise<string | null> => {
    try {
      const res = await spend(budget, 0.05, async () => {
        const x = await client.complete({ stableBlock: REDRAFT_SYSTEM, variableBlock: '',
          userMessage: `THE DRAFT\n"""\n${t}\n"""\n\nTHE STATEMENTS THAT MUST GO\n${gone.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
            + (pointing.length ? `\n\nSENTENCES THAT WILL POINT AT REMOVED TEXT (rewrite each to stand alone, or drop it)\n${pointing.map((g) => `- ${g}`).join('\n')}` : ''),
          toolName: 'emit_draft', toolDescription: 'Return the whole rewritten draft.', schema: REDRAFT_SCHEMA, maxTokens: 6000 });
        return { value: x, cost: x.cost, usage: x };
      }, 'repair');
      const out = (res.json as { text?: unknown } | null)?.text;
      return typeof out === 'string' && out.trim() ? out.trim() : null;
    } catch { return null; }
  };
  const enforced = await cutSafely(draft, first);
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
    first = memory.apply(draft, checkDraft(skill, v, draft, opts));
    report = memory.apply(text, checkDraft(skill, v, text, opts));
  };
  sameInstrument();
  const kept: string[] = []; const revertedRules: string[] = [];
  // THE FIXES THAT NEED NO MODEL (./mechanical-repair.ts): an em dash the author never uses, a paragraph
  // longer than they write. Tried before the rewrite passes, which then have less to do, and again after,
  // because a rewrite can put a dash back. Kept only on the same terms as a rewrite: nothing gets worse.
  const mechanical: string[] = [];
  const notKept: string[] = [];
  const fixMechanically = async (): Promise<void> => {
    const m = mechanicalFixes(v, report, text);
    if (m.text === text) return;
    const after = await check(m.text);
    sameInstrument();
    // A FIX THAT NEEDS NO MODEL IS NEVER DROPPED IN SILENCE. When it cannot be kept (it would break another rule),
    // the record says which fix and why, so a refusal names the real conflict and not the rule the fix was for.
    const accepted = acceptRepair(report, after);
    if (!accepted.ok) { if (!notKept.length) notKept.push(`${m.fixed.join('; ')} not kept: ${accepted.why}`); return; }
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
        return { value: x, cost: x.cost, usage: x };
      }, 'repair');
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
    const after = next === text ? report : await check(next);
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
  if (report.failed && notKept.length) why = `${why}; ${notKept.join('; ')}`;
  // AND AGAIN AT THE END, on the text that ships: whatever the passes did, no flagged claim survives them.
  // Once the flagged claims were kept uncut, cutting them again at the end would only repeat the attempt.
  const last = keptUncut ? { text, report, cut: [] as string[] } : await cutSafely(text, report);
  sameInstrument();
  if (last.cut.length) { text = last.text; report = last.report; cut.push(...last.cut); }
  if (cut.length && !report.failed) why = 'every REQUIRED measured rule now holds (invented claims cut)';
  const heavy = heavyCut(draft, cut);
  if (heavy) why = `${heavy}; ${why}`;
  const toCheck = [...new Set([...memory.listed(), ...listedHere, ...listedClaims(report)])];
  if (notes.length) why = `${notes.join('; ')}; ${why}`;
  if (memory.listed().length) why = `${why}; ${memory.listed().length} flagged figure(s) or fact(s) left in for you to check, because the check flagged too much of the draft to trust every flag`;
  if (degradedMidLoop) {
    why = `${why} (the claim reader failed during the repair, so the draft and every rewrite were read again by the pattern check: `
      + 'each comparison used one instrument, and a claim only the reader could see is no longer checked)';
  }
  return { output: text, report,
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), draft,
      ...(kept.length ? { integrityReverted: kept, revertedRules } : {}), ...(pairs.length ? { pairs: pairs.slice(0, MAX_PAIRS_KEPT) } : {}),
      ...(cut.length ? { storiesCut: cut } : {}), ...(toCheck.length ? { claimsToCheck: toCheck } : {}), why } };
}
