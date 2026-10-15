// atelier/core/loop/run-repair.ts — THE LOOP: CHECK THE DRAFT, REWRITE WHAT BROKE, CHECK AGAIN.
//
// Up to `maxPasses` rewrites of only the spans that break a REQUIRED measured rule, each one kept only
// if it breaks nothing that held and fixes at least one thing that did not (`acceptRepair`). Every
// call is metered through the caller's budget. The standard is read, never written.

import type { CheckContext } from '../observers/registry.js';
import type { InferenceClient, Budget } from '../inference/client.js';
import { spend, processSpendByPurpose, spendBetween, type SpendPurpose, type SpendLine } from '../inference/client.js';
import type { StandardVersion, RepairRecord, RepairEdits, GradedRecord, ControllerDecisionRecord } from '../state/canonical-state.js';
import { acts, verifyText, type VerifyReport, type RuleCheck } from '../observers/verify.js';
import { planFor } from '../plan/execution-plan.js';
import { unsourcedClaims, wordCountClaims, claimUnitsOf } from './claims.js';
import { derivedFromKnown } from './derived.js';
import { answerWorkClaims, answerSentences, judgedOnly } from './answer-claims.js';
import { assertMayCut, type CutAuthority } from './cut-authority.js';
import type { ContextJudge } from './context-judge.js';
import type { ClaimSensor } from './claim-extract.js';
import { checkFormat, type FormatProfile } from '../observers/formats.js';
import { findTerms } from '../observers/text.js';
import { errorAtLength, featureWordCount } from '../observers/features.js';
import { signalRules, signalChecks, isSignal, displacement, type Displacement } from './graded.js';
import type { FidelityProfile, ControllerSettings } from '../fidelity/types.js';
import { decide, controllerRecord, ENFORCED_WEIGHT, SETTLED_ERROR, type ControllerInput, type Decision, type EnforcedMiss, type GradedMiss } from './controller.js';
import { applyOperator, operatorsToward, sitesOf, keepsWords } from '../fidelity/operators.js';
import { SITES_PER_OPERATOR } from '../fidelity/structural.js';
import { spanIntegrity } from './integrity.js';
import { planRepair, repairPrompt, applyRepair, acceptRepair, addsNoWords, cutSpan, REPAIR_SYSTEM, REPAIR_SYSTEM_WITH_PLACEHOLDERS, REPAIR_SCHEMA, type Reverted, type Applied } from './repair.js';
import { keysOf, measurementId } from '../state/rule-key.js';
import { mechanicalFixes } from './mechanical-repair.js';
import type { RepairPair } from '../state/canonical-state.js';
import { createHash } from 'node:crypto';

/** Repair pairs kept per invocation: the raw material for "write this, not that" examples, bounded. */
const MAX_PAIRS_KEPT = 12;
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const broken = (r: VerifyReport): string[] => r.checked.filter((c) => acts(c) && c.result.verdict === 'VIOLATED').map((c) => c.requirementId);

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
  /**
   * GRADED FEATURES (on by default; `--graded none` turns them off): the counted features whose FEATURE rules a miss
   * of is a REPAIR TARGET without being a failure. A PREFERRED rule naming one of them is planned and accepted as an
   * enforced rule is, on copies of the report; the report that is recorded, and the evaluation, never see it as
   * enforced. 'all' grades every FEATURE rule of the standard, and every SIGNAL feature of `gradedProfile`. Absent,
   * nothing is graded.
   */
  readonly graded?: readonly string[] | 'all';
  /**
   * The author's fidelity profile (../fidelity/types.ts): its SIGNAL features, for the text's length class, are graded
   * targets when far outside their band (./graded.ts, `signalChecks`), and its RULE and SIGNAL bands are what no
   * rewrite may displace (`displacement`). Null or absent: only the standard's FEATURE rules are graded.
   */
  readonly gradedProfile?: FidelityProfile | null;
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
  /**
   * Why the claim check lists and does not cut here (./claim-extract.ts, `listsBecause`): the whole reason, as said.
   * Everything the reader and the patterns find is then LISTED for the person to check and nothing is cut:
   * no instrument may delete where nobody has measured how often its deletions are wrong.
   */
  readonly listsBecause?: string | null;
  /**
   * THE BOUNDED CONTROLLER (./controller.ts): the release's settings for it (absent: its defaults), whether a draft can
   * be written again by the caller when it asks for one (`withRedraft` in cli/commands/invoke.ts; absent: it cannot,
   * and a far miss is rewritten on its carriers instead), and the ledger as it stood when the run began, so the cost of
   * a step is read from what this run has paid.
   */
  readonly controller?: { readonly settings?: ControllerSettings | null; readonly redraft?: boolean; readonly ledgerFrom?: readonly SpendLine[] };
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
    materiality: tellRule.materiality, enforced: planFor(v).rules.find((p) => p.id === tellRule.requirementId)?.enforced ?? false, phase: 'STYLE' as const, observer: 'LEXICON', pattern: 'MACHINE_TELL',
    result: { verdict: learned.length ? 'VIOLATED' as const : 'MET' as const, value: learned.length,
      spans: learned.map((sp) => ({ ...sp, why: `"${sp.text}", a phrase this skill's drafts repeat and your pieces never use` })),
      detail: learned.length ? `${learned.length} learned machine phrase(s)` : 'none of the learned machine phrases' } }] : [];
  const report = { ...base, checked: [...base.checked, ...tellLine], failed: base.failed || tellLine.some((c) => acts(c) && c.result.verdict === 'VIOLATED') };
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
  // ON A KIND OF WORK NOBODY MEASURED, NOTHING IS CUT. The reader's findings and the patterns' are one list
  // for the person to check: on 27 real competitive analyses the cut deleted 32 legitimate sentences of 41.
  const unmeasured = !listOnly && opts.listsBecause ? opts.listsBecause : null;
  // Each finding's own words say what a cut does; here nothing is cut, and the words say so.
  const everyFinding = unmeasured ? [...claims, ...(reading?.gate ? reading.claims.filter((c) => !claims.some((x) => x.start === c.start)) : [])]
    .sort((x, y) => x.start - y.start).map((c) => ({ ...c, why: c.why.replace(/: the sentence is cut; /, ': listed for you to check; ') })) : [];
  const toCut = unmeasured ? [] : listOnly ? workClaims : claims;
  const toList = unmeasured ? everyFinding
    : listOnly ? [...claims.filter((c) => !workClaims.some((w) => w.start === c.start)), ...judgeFlags.filter((j) => !claims.some((c) => c.start === j.start))] : [];
  // A COUNT WRITTEN IN WORDS IS LISTED, NEVER CUT. "Nine people", "three of your prospects": the pattern check
  // reads a spelled-out count with less confidence than a figure in digits (./claims.ts, wordCountClaims), and a
  // review found it in true sentences. Whatever the kind of work, these join the list for the person to check
  // and never fail the draft. A qualified reader's reading carries none: it types such counts itself.
  const words = (gating?.listed ?? (opts.claimSensor ? [] : wordCountClaims(text, opts.material ?? '')))
    .filter((w) => !toCut.some((c) => c.start === w.start) && !toList.some((c) => c.start === w.start));
  const listed = [...toList, ...words].sort((x, y) => x.start - y.start);
  const statement = 'Never invent a story, a quotation, an attribution or a specific the person did not supply.';
  // Which instrument found what may be cut: the patterns decide an answer's work claims; otherwise the
  // gating reading's instrument, qualified or not (./cut-authority.ts refuses the ones that may not cut).
  // The sensor says which instrument gates: 'pattern' for the pattern check, or a reader that degraded to it.
  const authority: CutAuthority = unmeasured ? 'unqualified-reader' : listOnly || !gating || reading?.gate || !opts.claimSensor || opts.claimSensor.gate === 'pattern' ? 'pattern'
    : opts.claimSensor?.qualified ? 'qualified-reader' : process.env.ATELIER_CLAIMS_GATE === 'reader' ? 'owner-override' : 'unqualified-reader';
  const line = { requirementId: 'UNSOURCED', statement: listOnly ? 'Never claim work done, a result seen, or a detail of the person\'s own system that the request did not give.' : statement,
    materiality: 'REQUIRED', phase: 'ACCURACY' as const, authority,
    result: { verdict: toCut.length ? 'VIOLATED' as const : 'MET' as const, spans: [...toCut], value: toCut.length,
      detail: `${unmeasured ? `${unmeasured}: ${listed.length ? `${listed.length} sentence(s) listed to check, none cut` : 'nothing found, and nothing would be cut'}`
        : toCut.length ? `${toCut.length} claim(s) not in the material supplied` : 'no unsourced stories, quotations or specifics'} [${by}]` } };
  const checkLine = listed.length ? [{ requirementId: CLAIMS_TO_CHECK, statement: unmeasured ? `Not found in what you supplied: listed for you to check, never cut, because ${unmeasured}.`
    : listOnly ? 'Specifics not in the material supplied: listed for you to check, never cut in this format.'
      : 'Counts written in words that are not in the material supplied: listed for you to check, never cut; the pattern check reads them with less confidence than a figure in digits.',
    materiality: 'PREFERRED', phase: 'ACCURACY' as const,
    result: { verdict: 'VIOLATED' as const, spans: [...listed], value: listed.length, detail: `${listed.length} specific(s) to check [${by}]` } }] : [];
  const readerOnly = reading?.gate && !unmeasured ? reading : null;
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
  const unread = !listOnly && !unmeasured && opts.claimSensor?.degraded && opts.claimSensor.qualified ? [{ requirementId: UNREAD, materiality: 'REQUIRED', phase: 'ACCURACY' as const,
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
  return { ...r, checked, failed: checked.some((c) => acts(c) && c.result.verdict === 'VIOLATED') };
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
  r.checked.find((c) => c.requirementId === 'UNSOURCED' && acts(c) && c.result.verdict === 'VIOLATED')?.result.spans ?? [];
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
    return { ...report, checked, failed: checked.some((c) => acts(c) && c.result.verdict === 'VIOLATED') };
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
  known?: VerifyReport, memory: ClaimMemory = claimMemory()): Promise<{ text: string; report: VerifyReport; cut: string[]; listed: string[]; kept: string[] }> {
  let report = memory.apply(text, known ?? await checkDraftAsync(skill, v, text, opts));
  const cut: string[] = []; const kept = new Set<string>();
  if (opts.guardClaims === false) return { text, report, cut, listed: [], kept: [] };
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
    // NO CUT BREAKS A RULE THE DRAFT WAS MEETING. The standard is read in code before and after each deletion,
    // and a deletion that turns a met rule into a broken one is not made: the sentence stays, still flagged, and
    // the check names it. A length the person asked for, a section that must hold something, a closing the
    // standard requires: deleting the sentence that carried one fixed a doubt by breaking a certainty.
    // REQUIRED rules only: a preference does not outweigh an invented figure. And not under --placeholders: the
    // person asked for a visible slot, which hides nothing. With no counted REQUIRED rule there is nothing to read.
    const guarded = !opts.placeholders && planFor(v).rules.some((p) => p.enforced);
    const brokenIn = (t: string): Set<string> => new Set(!guarded ? [] : checkDraft(skill, v, t, { ...opts, guardClaims: false }).checked
      .filter((c) => acts(c) && c.result.verdict === 'VIOLATED').map((c) => c.requirementId));
    let held = brokenIn(next);
    for (const sp of spans) {
      const without = opts.placeholders ? `${next.slice(0, sp.start)}${CLAIM_SLOT}${next.slice(sp.end)}` : cutClaim(next, sp.start, sp.end);
      // NO CUT EMPTIES A SECTION. The last sentence under a heading stays, still flagged: the check fails on it
      // and names it, which a person can act on. A heading over nothing passed as a section that was there.
      if (emptyHeadings(without) > emptyHeadings(next)) { kept.add(sp.text.trim().slice(0, 160)); continue; }
      const after = brokenIn(without);
      if ([...after].some((id) => !held.has(id))) { kept.add(sp.text.trim().slice(0, 160)); continue; }
      held = after;
      next = without;
      cut.push(sp.text.trim().slice(0, 160));
    }
    if (next === text) break;
    text = next; report = memory.apply(text, await checkDraftAsync(skill, v, text, opts));
  }
  return { text, report, cut: cut.reverse(), listed: memory.listed(), kept: [...kept] };
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
  if (emptyHeadings(after) > emptyHeadings(before)) return 'a section with nothing under its heading';
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

/**
 * HEADINGS WITH NOTHING UNDER THEM. A markdown heading whose section, up to the next heading of its level or
 * above, holds no word outside headings. Three real analyses were delivered with a section cut to nothing,
 * two of them counted as conformant: a required section that is only its title is not the section.
 */
export function emptyHeadings(text: string): number {
  const lines = text.split(/\r?\n/);
  // A heading however markdown writes one: "## Risks" (indented up to three spaces), "Risks" over a rule of = or -,
  // and a line that is nothing but bold, which writers use as one. Bold sits below every real heading.
  const underline = (i: number): number => { const m = /^ {0,3}(=+|-{3,})\s*$/.exec(lines[i] ?? ''); return m ? (m[1].startsWith('=') ? 1 : 2) : 0; };
  let fence = false;
  const levels = lines.map((l, i) => {
    if (/^ {0,3}(```|~~~)/.test(l)) { fence = !fence; return 0; }
    if (fence) return 0;
    const atx = /^ {0,3}(#{1,6})[ \t]+\S/.exec(l);
    if (atx) return atx[1].length;
    // Written as a name: a few words that do not end as a sentence does. "None known today." over a rule is a
    // paragraph and a rule; "Why now?" and "FAQ: billing" are headings.
    const name = (t: string): boolean => t.trim().split(/\s+/).length <= 8 && !/[.!,;:]$/.test(t.trim());
    if (l.trim() && name(l) && !/^\s*(?:[-*+>|]|\d+[.)])/.test(l) && (i === 0 || !lines[i - 1].trim()) && underline(i + 1)) return underline(i + 1);
    const bold = /^\s*(?:\*\*|__)([^*_\n]{2,60}?):?(?:\*\*|__):?\s*$/.exec(l);
    return bold && name(bold[1]) ? 7 : 0;
  });
  let empty = 0;
  for (let i = 0; i < lines.length; i++) {
    const at = levels[i];
    if (!at) continue;
    let body = false;
    for (let j = i + 1; j < lines.length && !body; j++) {
      if (levels[j] && levels[j] <= at) break;
      // the rule under a heading is part of the heading
      if (!levels[j] && !(j === i + 1 && underline(j)) && /[\p{L}\p{N}]/u.test(lines[j])) body = true;
    }
    if (!body) empty++;
  }
  return empty;
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

/** At most this many graded features are targeted in one pass: the ones furthest outside their band first. */
export const GRADED_PER_PASS = 3;

/**
 * The rules a run grades (`CheckOptions.graded`): requirement id to the feature it counts. The standard's FEATURE
 * rules, and, with a profile, its SIGNAL features under their own ids (./graded.ts). Empty without the option.
 */
export function gradedRules(v: Pick<StandardVersion, 'requirements'>, graded: CheckOptions['graded'], profile?: FidelityProfile | null): Map<string, string> {
  const out = new Map<string, string>();
  if (graded === undefined) return out;
  for (const r of v.requirements) {
    if (r.authority === 'EXPERT_REJECTED' || r.measurement?.observer !== 'FEATURE') continue;
    const f = (r.measurement.params.feature as readonly string[] | undefined)?.[0];
    if (f && (graded === 'all' || graded.includes(f))) out.set(r.requirementId, f);
  }
  for (const [id, f] of signalRules(profile)) if (graded === 'all' || graded.includes(f)) out.set(id, f);
  return out;
}

/**
 * The graded checks one pass is pointed at: the broken ones, the largest |error| first (../observers/registry.ts,
 * `ObserverResult.error`), at most GRADED_PER_PASS features. Two rules on one feature count as one feature.
 */
export function gradedTargets(report: VerifyReport, rules: ReadonlyMap<string, string>): RuleCheck[] {
  const broken = report.checked.filter((c) => rules.has(c.requirementId) && c.result.verdict === 'VIOLATED')
    .sort((a, b) => Math.abs(b.result.error ?? 0) - Math.abs(a.result.error ?? 0) || a.requirementId.localeCompare(b.requirementId));
  const features = new Set<string>(); const out: RuleCheck[] = [];
  for (const c of broken) {
    const f = rules.get(c.requirementId) ?? c.requirementId;
    if (!features.has(f) && features.size >= GRADED_PER_PASS) continue;
    features.add(f); out.push(c);
  }
  return out;
}

/** A copy of the report with the named checks read as enforced: what the planner and the acceptance read, never the record. */
export function withGraded(report: VerifyReport, ids: ReadonlySet<string>): VerifyReport {
  return ids.size ? { ...report, checked: report.checked.map((c) => (ids.has(c.requirementId) ? { ...c, enforced: true } : c)) } : report;
}

/** The report with the invented-claim line left out: what a model rewrite may be pointed at. */
const withoutClaims = (r: VerifyReport): VerifyReport => ({ ...r, checked: r.checked.filter((c) => c.requirementId !== 'UNSOURCED' && c.requirementId !== INCONCLUSIVE && c.requirementId !== UNREAD) });

export async function refineToStandard(
  client: InferenceClient, budget: Budget, skill: string, v: StandardVersion, draft: string, maxPasses = 2,
  opts: CheckOptions = {},
): Promise<Refined> {
  const memory = claimMemory();
  // GRADED FEATURES (`opts.graded`): repair targets that are never failures. Which rules, which checks a pass is
  // pointed at, and what the run did about them; `pending` is what keeps the loop going where `failed` would not.
  // The profile's SIGNAL features ride on the reports this loop holds as checks of their own (./graded.ts), and are
  // taken off every report this function returns: the record and the evaluation never see them.
  const graded = gradedRules(v, opts.graded, opts.gradedProfile);
  const gradedOn = opts.graded !== undefined && graded.size > 0;
  const profile = gradedOn ? opts.gradedProfile ?? null : null;
  const withSignals = (t: string, r: VerifyReport): VerifyReport => (profile ? { ...r, checked: [...r.checked, ...signalChecks(t, profile)] } : r);
  const recorded = (r: VerifyReport): VerifyReport => (profile ? { ...r, checked: r.checked.filter((c) => !isSignal(c.requirementId)) } : r);
  const check = async (t: string): Promise<VerifyReport> => withSignals(t, memory.apply(t, await checkDraftAsync(skill, v, t, opts)));
  let first = await check(draft);
  // WHAT KEEPS THE LOOP GOING (./controller.ts): an enforced rule broken, or a graded miss over SETTLED_ERROR band widths.
  // A graded miss nearer its band than that is delivered as it is: no pull to the median.
  const gradedOff = (r: VerifyReport): RuleCheck[] => r.checked.filter((c) => graded.has(c.requirementId) && !acts(c) && c.result.verdict === 'VIOLATED');
  const pending = (r: VerifyReport): boolean => r.failed || gradedOff(r).some((c) => Math.abs(c.result.error ?? 0) > SETTLED_ERROR);
  const gradedTargeted = new Set<string>(); const gradedRepaired = new Set<string>();
  // EVERY EDIT, COUNTED: span rewrites kept, and those refused by a guard or discarded with their pass, with the reasons.
  // The passes the flag alone caused (every span of them for a graded rule the standard does not enforce) are counted
  // apart, and charged to the ledger under their own purpose, so the record's calls and cost are the ledger's.
  const edits = { accepted: 0, rejected: 0, reasons: [] as string[] }; const gradedEdits = { accepted: 0, rejected: 0, reasons: [] as string[] };
  const ledgerBefore = processSpendByPurpose();
  const editsRecord = (): { edits: RepairEdits } | Record<string, never> => (edits.accepted + edits.rejected ? { edits: { ...edits, reasons: [...new Set(edits.reasons)] } } : {});
  const displaced: string[] = [];
  const gradedRecord = (final: VerifyReport, finalText: string): { graded: GradedRecord } | Record<string, never> => {
    if (!gradedOn) return {};
    const values: Record<string, GradedRecord['values'][string]> = {};
    const valueOf = (r: VerifyReport, id: string): number | null => { const x = r.checked.find((c) => c.requirementId === id)?.result.value; return typeof x === 'number' ? x : null; };
    const paramsOf = (r: VerifyReport, id: string): Readonly<Record<string, unknown>> => (isSignal(id) ? (r.checked.find((c) => c.requirementId === id) as { params?: Record<string, unknown> } | undefined)?.params ?? {}
      : v.requirements.find((x) => x.requirementId === id)?.measurement?.params ?? {});
    // A feature the standard rules is recorded under its rule; the same feature as a signal only when no rule holds it.
    for (const [id, f] of [...graded].sort((a, b) => Number(isSignal(a[0])) - Number(isSignal(b[0])))) {
      if (values[f]) continue;
      const p = paramsOf(final, id); if (isSignal(id) && !Object.keys(p).length) continue;
      values[f] = { before: valueOf(first, id), after: valueOf(final, id), lo: typeof p.minValue === 'number' ? p.minValue : null, hi: typeof p.maxValue === 'number' ? p.maxValue : null, source: isSignal(id) ? 'profile' : 'standard' };
    }
    const line = spendBetween(ledgerBefore, processSpendByPurpose()).find((l) => l.purpose === 'graded');
    const disp = displacement(draft, finalText, profile, gradedTargeted);
    return { graded: { features: [...new Set(graded.values())].sort(), targeted: gradedTargeted.size, repaired: gradedRepaired.size, steered: [...gradedTargeted].sort(), redrafts: 0, notes: [], values,
      edits: { ...gradedEdits, reasons: [...new Set(gradedEdits.reasons)] }, calls: line?.calls ?? 0, costUsd: line?.usd ?? 0,
      ...(disp ? { displacement: { before: disp.before, after: disp.after, refusedFor: [...displaced] } } : {}) } };
  };
  // THE BOUNDED CONTROLLER (./controller.ts): each step chosen from the report as it stands, recorded with what it was
  // expected to gain and cost, what it did, and what the ledger charged for it; and why the loop stopped.
  const decisions: ControllerDecisionRecord[] = []; let stoppedBecause: string | null = null;
  const unreachable = new Set<string>();
  const STEP_PURPOSES: readonly SpendPurpose[] = ['repair', 'graded', 'steering'];
  const costSince = (snap: readonly SpendLine[], purposes: readonly SpendPurpose[] = STEP_PURPOSES): { calls: number; usd: number } => {
    const ls = spendBetween(snap, processSpendByPurpose()).filter((l) => purposes.includes(l.purpose));
    return { calls: ls.reduce((n, l) => n + l.calls, 0), usd: Math.round(ls.reduce((n, l) => n + l.usd, 0) * 1e6) / 1e6 };
  };
  const record = (d: Pick<Decision, 'action' | 'targets' | 'why' | 'expectedGain' | 'expectedCostUsd'>, snap: readonly SpendLine[], outcome: ControllerDecisionRecord['outcome'], movement: number, note?: string): void => {
    decisions.push({ action: d.action, targets: [...d.targets], why: d.why, expectedGain: d.expectedGain, expectedCostUsd: d.expectedCostUsd, outcome,
      observed: { movement: Math.round(movement * 1000) / 1000, ...costSince(snap), ...(note ? { note } : {}) } });
  };
  const ledgerFrom = opts.controller?.ledgerFrom ?? ledgerBefore;
  const perCall = (purposes: readonly SpendPurpose[]): number | undefined => {
    const ls = spendBetween(ledgerFrom, processSpendByPurpose()).filter((l) => purposes.includes(l.purpose));
    const calls = ls.reduce((n, l) => n + l.calls, 0);
    return calls ? ls.reduce((n, l) => n + l.usd, 0) / calls : undefined;
  };
  const effects = gradedOn ? opts.gradedProfile?.effects ?? null : null;
  const paramsFor = (c: RuleCheck): Readonly<Record<string, unknown>> => v.requirements.find((x) => x.requirementId === c.requirementId)?.measurement?.params ?? (c as { params?: Record<string, unknown> }).params ?? {};
  /** What the best operator is expected to move this miss, in band widths, from the effect matrix; null when none moves it. */
  const operatorEffect = (t: string, c: RuleCheck): number | null => {
    const f = graded.get(c.requirementId);
    if (!effects || !f) return null;
    const op = operatorsToward(effects, f, (c.result.error ?? 0) > 0 ? 'high' : 'low')[0];
    const sites = op ? Math.min(sitesOf(op, t), SITES_PER_OPERATOR) : 0;
    if (!op || !sites) return null;
    const p = paramsFor(c); const lo = typeof p.minValue === 'number' ? p.minValue : null; const hi = typeof p.maxValue === 'number' ? p.maxValue : null;
    const width = lo !== null && hi !== null && hi > lo ? hi - lo : 1;
    return Math.round((Math.abs(effects[op]?.[f]?.mean ?? 0) * sites / width) * 1000) / 1000;
  };
  const CLAIM_LINES = new Set(['UNSOURCED', INCONCLUSIVE, UNREAD]);
  const controllerInput = (t: string, r: VerifyReport, canRewrite: boolean): ControllerInput => {
    const enforced: EnforcedMiss[] = r.checked.filter((c) => acts(c) && c.result.verdict === 'VIOLATED' && !CLAIM_LINES.has(c.requirementId))
      .map((c) => ({ id: c.requirementId, kind: c.obligation === 'DELIVERABLE' || c.observer === 'LINES' || !c.result.spans.length ? 'omission' as const : 'span' as const }));
    // one miss per feature: a rule and a signal on the same feature are one target, the further out of the two
    const byFeature = new Map<string, GradedMiss>();
    for (const c of gradedOff(r)) {
      const f = graded.get(c.requirementId) ?? c.requirementId; const e = c.result.error ?? 0; const was = byFeature.get(f);
      if (!was || Math.abs(e) > Math.abs(was.error)) byFeature.set(f, { id: c.requirementId, error: e, operatorEffect: operatorEffect(t, c) });
    }
    const usdLeft = budget.capUsd - budget.spentUsd - (budget.inFlightUsd ?? 0);
    const rewriteUsd = perCall(['repair', 'graded']); const draftUsd = perCall(['writing']);
    return { enforced, claims: flaggedClaims(r).length, length: null, graded: [...byFeature.values()], grammar: null,
      budget: { usdLeft, callsLeft: budget.maxCalls !== undefined ? budget.maxCalls - (budget.calls ?? 0) : null }, history: decisions,
      observedUsdPerCall: { ...(rewriteUsd !== undefined ? { rewrite: rewriteUsd, 'carrier-rewrite': rewriteUsd } : {}), ...(draftUsd !== undefined ? { redraft: draftUsd } : {}) },
      can: { redraft: opts.controller?.redraft ?? false, rewrite: canRewrite }, unreachable };
  };
  const controllerOf = (): { controller: ReturnType<typeof controllerRecord> } => ({ controller: controllerRecord(decisions, stoppedBecause ?? 'every enforced rule holds and nothing graded is off') });
  if (!pending(first)) {
    const toCheck = listedClaims(first);
    const settled = decide(controllerInput(draft, first, true), opts.controller?.settings ?? null);
    stoppedBecause = settled.kind === 'stop' ? settled.why : `every enforced rule holds and no graded miss is over ${SETTLED_ERROR} band widths`;
    return { output: draft, report: recorded(first), repair: toCheck.length || gradedOn ? { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: sha(draft), draft,
      ...(toCheck.length ? { claimsToCheck: toCheck } : {}), ...gradedRecord(first, draft), ...(gradedOn ? controllerOf() : {}), why: 'every REQUIRED measured rule holds' } : null };
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
    // Said once, and the cut at the end of the run still happens: a sentence kept for its section does not let a
    // claim a later rewrite adds stay.
    if (e.kept.length) {
      const note = 'a flagged claim was not cut, because cutting it would empty its section or break a required rule: check it before you use this';
      if (!notes.includes(note)) notes.push(note);
      listedHere.push(...e.kept);
    }
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
  // (2) CLAIMS, in code, before any step the controller chooses: recorded as a step, with what the cut cost the ledger.
  const flaggedFirst = flaggedClaims(first).length; const cutSnap = processSpendByPurpose();
  const enforced = await cutSafely(draft, first);
  let text = enforced.text; let report = enforced.report; let passes = 0;
  cut.push(...enforced.cut);
  if (flaggedFirst) record({ action: 'cut', targets: ['UNSOURCED'], why: `${flaggedFirst} invented claim(s) flagged: cut in code before anything else`, expectedGain: flaggedFirst, expectedCostUsd: 0 },
    cutSnap, enforced.cut.length ? 'kept' : 'no change', enforced.cut.length, enforced.cut.length ? undefined : 'nothing could be cut without breaking the text');
  let why = cut.length ? 'invented claims cut' : 'every REQUIRED measured rule now holds';
  // ONE INSTRUMENT ON BOTH SIDES OF EVERY COMPARISON. A claim reader that fails mid-loop degrades for
  // good (./claim-extract.ts, modelSensor), and from then on reads every text by the pattern check. The
  // reports this loop holds were read by the model; compared with a report read by the pattern, a figure
  // the model flagged and the pattern cannot see looked fixed. So on the first read after the failure, the
  // held reports are read again by the pattern check before anything is compared.
  const sameInstrument = (): void => {
    if (!sensor?.degraded || readDegraded) return;
    readDegraded = true; degradedMidLoop = true;
    first = withSignals(draft, memory.apply(draft, checkDraft(skill, v, draft, opts)));
    report = withSignals(text, memory.apply(text, checkDraft(skill, v, text, opts)));
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
    const snap = processSpendByPurpose();
    const after = await check(m.text);
    sameInstrument();
    // A FIX THAT NEEDS NO MODEL IS NEVER DROPPED IN SILENCE. When it cannot be kept (it would break another rule),
    // the record says which fix and why, so a refusal names the real conflict and not the rule the fix was for.
    const accepted = acceptRepair(report, after, { wordsAdded: !addsNoWords(text, m.text) });
    const step = { action: 'mechanical' as const, targets: [...new Set(broken(report))], why: `fixed without a model: ${m.fixed.join('; ')}`, expectedGain: 0, expectedCostUsd: 0 };
    if (!accepted.ok) { record(step, snap, 'not kept', 0, accepted.why); if (!notKept.length) notKept.push(`${m.fixed.join('; ')} not kept: ${accepted.why}`); return; }
    record(step, snap, 'kept', ENFORCED_WEIGHT * (broken(report).length - broken(after).length));
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
  // LENGTH DRIFT, for the graded checks' distance. A rate per 1,000 words rises when a rewrite shortens the text with
  // the count unchanged; the before-report the acceptance compares against reads each graded miss with its value
  // scaled to the after-length (../observers/features.ts, `errorAtLength`), so only the count's own move is read.
  const featureParams = new Map(v.requirements.flatMap((r) => (r.measurement?.observer === 'FEATURE' ? [[r.requirementId, r.measurement.params] as const] : [])));
  const atLength = (r: VerifyReport, soft: ReadonlySet<string>, from: string, to: string): VerifyReport => {
    if (!soft.size) return r;
    const wb = featureWordCount(from); const wa = featureWordCount(to);
    return { ...r, checked: r.checked.map((c) => { const p = soft.has(c.requirementId) ? featureParams.get(c.requirementId) ?? (c as { params?: Record<string, unknown> }).params : undefined;
      return p && c.result.verdict === 'VIOLATED' && typeof c.result.value === 'number' ? { ...c, result: { ...c.result, error: errorAtLength(p, c.result.value, wb, wa) } } : c; }) };
  };
  const checkOf = new Map(v.requirements.flatMap((r) => (r.measurement ? [[r.requirementId, measurementId(r.measurement)] as const] : [])));
  /** What a step moved: rules held (weighted, a share for fewer places) for a rewrite; band widths nearer for a graded step. */
  const movedBy = (ids: readonly string[], before: VerifyReport, after: VerifyReport, enforcedStep: boolean): number => {
    const find = (r: VerifyReport, id: string): RuleCheck | undefined => r.checked.find((c) => c.requirementId === id);
    return ids.reduce((n, id) => {
      const b = find(before, id); const a = find(after, id);
      if (b?.result.verdict !== 'VIOLATED') return n;
      const off = (c: RuleCheck | undefined): number => (c?.result.verdict !== 'VIOLATED' ? 0 : enforcedStep ? c.result.spans.length || 1 : Math.abs(c.result.error ?? 0));
      const was = off(b); const now = off(a);
      return n + (enforcedStep ? ENFORCED_WEIGHT * Math.max(0, was - now) / Math.max(1, was) : Math.max(0, was - now));
    }, 0);
  };
  /** The report the planner reads: only the step's targets are planned; every other check keeps its verdict for the acceptance. */
  const focus = (r: VerifyReport, ids: ReadonlySet<string>): VerifyReport => ({ ...r, checked: r.checked.map((c) => (ids.has(c.requirementId) || !acts(c) ? c : { ...c, enforced: false })) });
  /**
   * A REWRITE STEP: the enforced rules' spans, or a graded feature's carrier sentences (at most `carriers` of each), through
   * the span rewrite that was the whole loop before: one call, spliced in code, kept only if it breaks nothing that held,
   * fixes something, and displaces nothing.
   */
  const rewriteStep = async (d: Decision): Promise<{ outcome: ControllerDecisionRecord['outcome']; movement: number; note?: string; stop?: string }> => {
    const ids = new Set(d.targets);
    const gradedIds = d.action === 'carrier-rewrite' ? ids : new Set<string>();
    const plannable = focus(withGraded(withoutClaims(report), gradedIds), ids);
    const accuracy = accuracyTried || d.action !== 'rewrite' ? [] : planRepair(text, plannable, { phase: 'ACCURACY' });
    const accuracyPass = accuracy.length > 0 && planRepair(text, plannable, { phase: 'STYLE' }).length > 0;
    let targets = accuracyPass ? accuracy : planRepair(text, plannable);
    if (d.action === 'rewrite') accuracyTried = true;
    // SIZED TO THE MISS: k carrier sentences of each feature, k = ceil(|error|), at most three (./controller.ts, `carriersFor`).
    if (d.carriers) {
      const n = new Map<string, number>();
      targets = targets.filter((t) => {
        const ok = t.requirementIds.some((id) => (n.get(id) ?? 0) < (d.carriers ?? 0));
        if (ok) for (const id of t.requirementIds) n.set(id, (n.get(id) ?? 0) + 1);
        return ok;
      }).map((t, i) => ({ ...t, id: i + 1 }));
    }
    if (!targets.length) {
      for (const id of d.targets) unreachable.add(id);
      why = cut.length ? `invented claims cut; ${flaggedClaims(report).length ? 'some could not be located to cut' : 'nothing else the rules pointed at could be rewritten'}` : 'nothing the rules pointed at could be rewritten';
      return { outcome: 'no change', movement: 0, note: 'nothing in the text to rewrite for it' };
    }
    // A rule graded but not enforced by the standard: its progress may be a fall in |error| (repair.ts, `acceptRepair`),
    // and its rewrites make no contrast pair below. An enforced rule that is also graded keeps the enforced rule's terms.
    const soft = new Set([...gradedIds].filter((id) => !report.checked.some((c) => c.requirementId === id && acts(c))));
    // A pass that only the flag asked for (every span of it for a rule the standard does not enforce) is the flag's
    // spend, under its own purpose; a pass an enforced rule asked for is the repair's, whatever else it carries.
    const gradedPass = targets.every((t) => t.requirementIds.every((id) => soft.has(id)));
    const purpose: SpendPurpose = gradedPass ? 'graded' : 'repair';
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
      }, purpose);
    } catch (e) {
      why = `the rewrite could not run (${(e as Error).message.split('\n')[0]}); the draft is delivered as it stands`;
      return { outcome: 'could not run', movement: 0, stop: why };
    }
    passes += 1;
    if (!accuracyPass) stylePasses += 1;
    for (const t of targets) for (const id of t.requirementIds) { const f = graded.get(id); if (f) gradedTargeted.add(f); }
    const reps = ((res.json as { replacements?: { id: number; text: string }[] } | null)?.replacements ?? []);
    const reverted: Reverted[] = []; const applied: Applied[] = [];
    const next = applyRepair(text, targets, reps, reverted, applied, opts.placeholders ?? false);
    const tally = gradedPass ? [edits, gradedEdits] : [edits];
    for (const r of reverted) {
      const t = targets.find((x) => x.id === r.id);
      kept.push(`"${t?.text.slice(0, 80) ?? `span ${r.id}`}" kept: the rewrite ${r.kind === 'MOVE' || r.kind === 'SLOT' ? 'changed' : 'lost'} ${r.lost.join(', ')}`);
      for (const id of t?.requirementIds ?? []) if (!revertedRules.includes(id)) revertedRules.push(id);
      for (const e of tally) { e.rejected += 1; e.reasons.push(`refused (${r.kind ?? 'MEANING'}): ${r.lost.join(', ')}`); }
    }
    const after = next === text ? report : await check(next);
    sameInstrument();
    // A rewrite that adds an invented claim makes UNSOURCED worse, and `acceptRepair` refuses it.
    const verdict = next === text
      ? { ok: false, why: reverted.length ? `every rewrite was refused (${reverted.map((r) => r.lost[0]).slice(0, 2).join('; ')})` : 'the rewrite returned nothing usable' }
      : acceptRepair(atLength(withGraded(report, gradedIds), soft, text, next), withGraded(after, gradedIds), { graded: soft });
    // THE DISPLACEMENT GUARD (./graded.ts): a rewrite that puts more of the author's features outside their bands, or
    // pushes one it was not pointed at far out, is refused whatever it fixed. Enforced rules keep the acceptance above.
    const pointedAt = new Set(targets.flatMap((t) => t.requirementIds.map((id) => graded.get(id)).filter((f): f is string => f !== undefined)));
    const disp: Displacement | null = verdict.ok && next !== text ? displacement(text, next, profile, pointedAt) : null;
    const displacedWhy = disp?.refusedFor.length ? `it displaced what your pieces hold: ${disp.refusedFor.join('; ')}` : null;
    if (!verdict.ok || displacedWhy) {
      why = `a rewrite was discarded: ${displacedWhy ?? verdict.why}`;
      if (disp && displacedWhy) displaced.push(...disp.refusedFor);
      for (const e of tally) { e.rejected += applied.length; if (applied.length || !reverted.length) e.reasons.push(`discarded: ${displacedWhy ?? verdict.why}`); }
      return { outcome: 'not kept', movement: 0, note: displacedWhy ?? verdict.why };
    }
    for (const e of tally) e.accepted += applied.length;
    // A graded feature is repaired when a kept rewrite moved its value toward the band.
    const errorOf = (r: VerifyReport, id: string): number => Math.abs(r.checked.find((c) => c.requirementId === id)?.result.error ?? 0);
    for (const id of gradedIds) if (errorOf(after, id) < errorOf(report, id)) gradedRepaired.add(graded.get(id) ?? id);
    const movement = movedBy(d.targets, atLength(withGraded(report, gradedIds), soft, text, next), after, d.action === 'rewrite');
    text = next; report = after;
    // An accepted pass's style rewrites are examples of this standard in action. One rule per pair.
    for (const a of applied) {
      const t = targets.find((x) => x.id === a.id);
      const rid = t?.requirementIds.length === 1 ? t.requirementIds[0] : undefined;
      const key = rid ? keyOf.get(rid) : undefined;
      if (rid && key && a.before !== a.after && !soft.has(rid)) pairs.push({ key, check: checkOf.get(rid), before: a.before, after: a.after });
    }
    why = report.failed ? verdict.why : 'every REQUIRED measured rule now holds';
    return { outcome: 'kept', movement };
  };
  /**
   * AN OPERATOR STEP (../fidelity/operators.ts): re-punctuation of the words already there, only the operators whose
   * measured effect moves the target the right way, site by site, no model. Screened on the deterministic checks (an
   * operator keeps every word, so it adds no claim), kept on the acceptance's terms and the displacement guard's, and
   * the kept text read again in full.
   */
  const operatorStep = async (ids: readonly string[]): Promise<{ kept: boolean; movement: number; note: string }> => {
    if (!effects) return { kept: false, movement: 0, note: 'no effect matrix: this skill\'s profile predates the operators' };
    const idSet = new Set(ids);
    const soft = new Set(ids.filter((id) => !report.checked.some((c) => c.requirementId === id && acts(c))));
    const offline = { ...opts, claimSensor: undefined };
    const read = (t: string): VerifyReport => withSignals(t, checkDraft(skill, v, t, offline));
    const before = read(text);
    const features = new Set(ids.map((id) => graded.get(id)).filter((f): f is string => f !== undefined));
    for (const id of ids) {
      const c = report.checked.find((x) => x.requirementId === id); const f = graded.get(id);
      if (!c || !f) continue;
      for (const op of operatorsToward(effects, f, (c.result.error ?? 0) > 0 ? 'high' : 'low')) {
        const n = Math.min(sitesOf(op, text), SITES_PER_OPERATOR);
        for (let k = 0; k < n; k++) {
          const next = applyOperator(op, text, k);
          if (next === null || next === text) continue;
          if (!keepsWords(text, next) || !spanIntegrity(text, next, new Set(['and']), false).ok) continue;
          const after = read(next);
          if (!acceptRepair(atLength(withGraded(before, idSet), soft, text, next), withGraded(after, idSet), { graded: soft }).ok) continue;
          const disp = displacement(text, next, profile, features);
          if (disp?.refusedFor.length) { displaced.push(...disp.refusedFor); continue; }
          const movement = movedBy(ids, atLength(withGraded(before, idSet), soft, text, next), after, false);
          for (const x of features) { gradedTargeted.add(x); gradedRepaired.add(x); }
          text = next; report = await check(next);
          sameInstrument();
          return { kept: true, movement, note: `${op}, site ${k + 1}` };
        }
      }
    }
    return { kept: false, movement: 0, note: 'no operator moved a target without breaking or displacing something' };
  };
  const settings = opts.controller?.settings ?? null;
  // THE STEPS. Each one chosen by the controller from the report as it stands (./controller.ts, `decide`), carried out
  // through the paths that already existed (the span rewrite, the operators, a draft written again by the caller), and
  // recorded with what it moved and what the ledger charged for it. The loop ends where the controller stops.
  for (;;) {
    const d = decide(controllerInput(text, report, stylePasses < maxPasses), settings);
    if (d.kind === 'stop') { stoppedBecause = d.why; break; }
    const snap = processSpendByPurpose();
    if (d.action === 'redraft') {
      // Written again by the caller (cli/commands/invoke.ts, `withRedraft`), told each miss's direction and distance.
      record(d, snap, 'handed to a redraft', 0);
      stoppedBecause = `handed to a redraft: ${d.why}`;
      break;
    }
    if (d.action === 'grammar' || d.action === 'cut' || d.action === 'mechanical') {
      // No grammar observer exists yet: the controller's input is the hook, and a step here reaches nothing.
      record(d, snap, 'no change', 0, 'no step carries this out yet');
      for (const id of d.targets) unreachable.add(id);
      continue;
    }
    if (d.action === 'operators') {
      const o = await operatorStep(d.targets);
      record(d, snap, o.kept ? 'kept' : 'no change', o.movement, o.note);
      continue;
    }
    const step = await rewriteStep(d);
    record(d, snap, step.outcome, step.movement, step.note);
    if (step.stop) { stoppedBecause = step.stop; break; }
  }
  if (report.failed) await fixMechanically();
  if (mechanical.length) {
    const how = `fixed without a model: ${mechanical.join('; ')}`;
    why = report.failed ? `${why}; ${how}` : `every REQUIRED measured rule now holds (${how})`;
  }
  if (report.failed && notKept.length) why = `${why}; ${notKept.join('; ')}`;
  // AND AGAIN AT THE END, on the text that ships: whatever the passes did, no flagged claim survives them.
  // Once the flagged claims were kept uncut, cutting them again at the end would only repeat the attempt.
  const lastSnap = processSpendByPurpose(); const flaggedLast = keptUncut ? 0 : flaggedClaims(report).length;
  const last = keptUncut ? { text, report, cut: [] as string[] } : await cutSafely(text, report);
  sameInstrument();
  if (last.cut.length) { text = last.text; report = last.report; cut.push(...last.cut); }
  // A claim a rewrite put back is cut again: a step like the first cut, recorded with what it cost.
  if (flaggedLast) record({ action: 'cut', targets: ['UNSOURCED'], why: `${flaggedLast} invented claim(s) flagged after the steps: cut in code`, expectedGain: flaggedLast, expectedCostUsd: 0 },
    lastSnap, last.cut.length ? 'kept' : 'no change', last.cut.length);
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
  return { output: text, report: recorded(report),
    repair: { passes, violatedBefore: broken(first), violatedAfter: broken(report), originalOutputHash: sha(draft), draft,
      ...(kept.length ? { integrityReverted: kept, revertedRules } : {}), ...(pairs.length ? { pairs: pairs.slice(0, MAX_PAIRS_KEPT) } : {}),
      ...(cut.length ? { storiesCut: cut } : {}), ...(toCheck.length ? { claimsToCheck: toCheck } : {}), ...editsRecord(), ...gradedRecord(report, text), ...controllerOf(), why } };
}
