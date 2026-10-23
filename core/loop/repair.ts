// atelier/core/loop/repair.ts — REWRITE WHAT BROKE A RULE, AND NOTHING ELSE.
//
// A compiled standard sits in a preamble and the model is trusted to hold every rule to the end of the
// piece. At the length this product is for, it does not: later sections drift back toward the model's
// own register, and nothing measured the finished draft. This is the pass that does.
//
//   generate → verify (every measured rule, with spans) → rewrite ONLY the violating spans → verify again
//
// Three properties make it safe to run without a person watching:
//
//   1. THE SPLICE IS DETERMINISTIC. The model returns replacement text for numbered spans; this module
//      puts them back. Nothing outside a span can change, because the model never holds the pen for it.
//   2. A REPAIR THAT MAKES ANYTHING WORSE IS DISCARDED. Every measured rule met before the pass must still
//      be met after it, and the count of broken REQUIRED rules must fall. Otherwise the previous text is
//      kept and the result says so.
//   3. IT CHANGES THE IMPLEMENTATION'S OUTPUT, NEVER THE STANDARD. What counts as broken is the owner's
//      ratified measurement; the loop has no authority to relax a target to make a draft pass.

import { sentencesOf, paragraphsOf } from '../observers/registry.js';
import { acts, isOmission, type RuleCheck, type VerifyReport } from '../observers/verify.js';
import { errorAtLength, featureWordCount } from '../observers/features.js';
import type { StandardVersion } from '../state/canonical-state.js';
import { displacedFamilies } from '../observers/style.js';
import { spanIntegrity, namesIn, numbersIn, addedFigures, workLost, hedgesIn } from './integrity.js';
import { isGrammarNote } from '../observers/grammar.js';
import { processSpendByPurpose, spendBetween, type SpendPurpose } from '../inference/client.js';
import type { PlannedStep, StepLedger } from './controller.js';
import { inStep } from '../inference/step-guard.js';
import { proseWordsOf } from '../observers/text.js';
import { materialName } from '../golden/case.js';

/** What a rewrite is told for a mechanical error no correction in place could fix: the error, and nothing else. */
const GRAMMAR_HINT = 'Fix only the mechanical error named, in the fewest words; change no other word, and keep every figure, name and spelling the author chose';

/** Observers whose spans ARE the thing to remove: a banned term, a flagged hedge, a counted habit, an
 *  occurrence over a word rate. */
const REMOVES_SPAN = new Set(['LEXICON', 'HEDGE_RATE', 'PATTERN_RATE', 'TERM_RATE', 'OPENING', 'CLOSING']);
// Not HEADINGS: its span is the whole heading line, which is not a sentence, so licensing its text would
// let a rewrite drop a name or a negation from the heading. A heading is rewritten under the full guard.
/** Observers whose spans are to be SWAPPED for a competing form ("is not" for "isn't"): the word may go,
 *  but what it asserted may not, so a swap never licenses dropping a negation. */
const SWAPS_SPAN = new Set(['RATIO']);

/**
 * WHAT A MOVE MAY NOT TURN INTO. A rewrite told only "avoid 'not X, it's Y'" wrote "X rather than Y";
 * one told to drop an announced insight announced it differently. So the reason names the move's other
 * spellings, and asks for the point to be stated plainly instead.
 */
const MOVE_HINT: Readonly<Record<string, string>> = {
  NOT_X_ITS_Y: 'State the point directly; do not recast it as another contrast ("X rather than Y", "not X but Y", "has little to do with", "what matters is")',
  CONTRAST_VERDICT: 'State the point directly; do not recast it as another contrast ("X rather than Y", "not X but Y", "has little to do with", "what matters is")',
  RATHER_THAN: 'State the point directly, without setting it against what it is not',
  REFRAME: 'State the point directly, without setting it against what it is not',
  MACHINE_TELL: 'Delete the move itself (the announcement, the self-grading, the superlative, the costume) and keep only the claim, said plainly; if the sentence is only the move, return an empty replacement to cut it',
  THAT_OPENER: 'Open the sentence on its subject; do not replace one stock opener with another',
  HERES_OPENER: 'Open the sentence on its subject; do not replace one stock opener with another',
};

export interface RepairTarget {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly reasons: readonly string[];
  readonly requirementIds: readonly string[];
  /** words the broken rules asked to remove; the integrity check lets exactly these go */
  readonly drops: readonly string[];
  /** words the broken rules asked to swap for a competing form; they may go, their negations may not */
  readonly swaps?: readonly string[];
  /** a heading a rule asks to recase: its capitalised words are compared without case */
  readonly recase?: boolean;
  /** an invented story or figure: its specifics are meant to be replaced by a placeholder */
  readonly specifics: boolean;
  /**
   * The unsourced claims' own text, when a claim span MERGED with a span that broke another rule. Only a
   * span that is purely a claim skips the meaning check; a merged one is checked on everything outside
   * these (see spanIntegrity's claimParts).
   */
  readonly claims?: readonly string[];
  /** true when the span merged a claim with a span that is not one */
  readonly mixed?: boolean;
  /** a machine-writing move: the sentence may be cut outright when it carries no figure and no name */
  readonly cuttable?: boolean;
  /** the clauses banned words stand in: a hedge of one may go where the rewrite takes the whole clause out */
  readonly clauses?: readonly Clause[];
  /** the documents of the bound material, by file name: a bracketed citation naming one is no slot left to fill */
  readonly cites?: readonly string[];
  /**
   * A SPAN THE PERSON NAMED (`atelier fix`, ./surgical-fix.ts): their instruction is what licenses the change, so the
   * meaning guard and the cut guard do not hold it to its claims; the seam, the move and the slot guards still apply. It
   * may change what the span claims, never add a figure or a name found neither in the span nor in `traced`.
   */
  readonly asked?: boolean;
  /** what an asked span's new figures and names may come from: the person's words, the bound material, the piece */
  readonly traced?: string;
}

/**
 * The spans to rewrite, grown to whole sentences — a banned word replaced inside its sentence reads
 * better than a word swapped in isolation — or whole paragraphs where the rule is about paragraphs.
 * Overlapping targets merge, so one sentence is rewritten once for every reason it broke a rule.
 */
export function planRepair(text: string, report: VerifyReport,
  opts: { readonly requiredOnly?: boolean; readonly phase?: 'ACCURACY' | 'STYLE'; readonly cites?: readonly string[] } = {}): RepairTarget[] {
  const requiredOnly = opts.requiredOnly ?? true;
  const sentences = sentencesOf(text);
  const paragraphs = paragraphsOf(text);
  const raw: { start: number; end: number; reason: string; rid: string; clauses: readonly Clause[]; drop: string | null; swap: string | null; specifics: boolean; whole: boolean; claim: string | null; recase: boolean; cuttable: boolean }[] = [];
  for (const c of report.checked) {
    if (c.result.verdict !== 'VIOLATED') continue;
    if (requiredOnly && !acts(c)) continue;
    if (opts.phase && (c.phase ?? 'STYLE') !== opts.phase) continue;
    // WHAT A METHOD REQUIRES IS NEVER REPAIRED BY REWRITING A SENTENCE. A missing section or table is not a sentence
    // that went wrong: rewritten into the last paragraph it becomes prose that mentions the section, which reads as
    // done and is not. It is answered by writing the piece again with what is missing named (cli/commands/invoke.ts,
    // `withRedraft`). A figure the material does not hold is the other kind: the sentence is rewritten without it,
    // which takes the figure out and claims nothing in its place. Held to keep every figure, the rewrite that cut it
    // was refused and the figure delivered; so that figure, and only it, is what the rewrite may lose.
    // Nor is a citation that is no line of the material: the right number is on the page the writer was given, not
    // in the sentence, and a rewrite that only has the sentence can drop the citation or guess another. Nor is a
    // test the work never named: an omission has no span to rewrite.
    // (A written check that names the sentences it fails on is the exception: those sentences are the repair's to rewrite.)
    if (isOmission(c) && !(c.observer === 'CHECK' && c.result.spans.length)) continue;
    // What the grammar checker was unsure of is listed for the person and rewritten by nobody.
    if (isGrammarNote(c)) continue;
    for (const sp of c.result.spans) {
      // A span that IS a paragraph (the paragraph-length rule) is rewritten as one; any other span
      // grows to whole sentences at BOTH ends. A span that ends inside the next sentence ("The fix is not
      // X. It's") used to stop mid-sentence, and the rewrite, which finishes the thought, left the rest
      // of that sentence behind it: "…rather than moral suasion: coupling: make market access…".
      const para = paragraphs.find((p) => sp.start <= p.start && sp.end >= p.end);
      const sent = sentences.find((s) => sp.start >= s.start && sp.start < s.end);
      const last = sentences.find((s) => sp.end > s.start && sp.end <= s.end);
      const start = para ? para.start : sent ? Math.min(sent.start, sp.start) : sp.start;
      const end = para ? para.end : Math.max(sent?.end ?? sp.end, last?.end ?? sp.end, sp.end);
      const move = c.pattern ? MOVE_HINT[c.pattern] : c.observer === 'GRAMMAR' ? GRAMMAR_HINT : undefined;
      // A BANNED WORD TAKES ITS HEDGE WITH IT when its whole clause goes: "and may be a scam" cannot lose "scam" and keep
      // "may". The clause is read by form (./repair.ts, `clauseAround`); whether it went is read on the rewrite (`applyRepair`).
      const clauses = c.observer && REMOVES_SPAN.has(c.observer) && sent ? [{ text: clauseAround(text, sent, sp), banned: sp.text }] : [];
      raw.push({ start, end, reason: `${c.requirementId}: ${c.statement} (${sp.why})${move ? `. ${move}` : ''}`, rid: c.requirementId, clauses,
        // Only a PART of a sentence is licensed to go. A span that is the whole sentence ("sentences
        // opening That's") asks for the sentence to be recast, not for its claims to be dropped. A MOVE
        // is the exception: the negation in "not X. It's Y" is the move itself, and a guard that kept
        // it forced the rewrite into "X rather than Y" every time.
        drop: c.observer && REMOVES_SPAN.has(c.observer) && (move !== undefined || !(sent && sp.start <= sent.start && sp.end >= sent.end))
          ? sp.text.trim().toLowerCase() : null,
        swap: c.observer && SWAPS_SPAN.has(c.observer) ? sp.text.trim().toLowerCase() : null,
        specifics: c.requirementId === 'UNSOURCED' || c.observer === 'CITED',
        // An invented story is the whole of its sentence, and the whole may go. A figure the material lacks is one part
        // of a sentence that says other things too: the figure may go, and everything else is held as in any rewrite.
        whole: c.requirementId === 'UNSOURCED', claim: c.requirementId === 'UNSOURCED' || c.observer === 'CITED' ? sp.text : null, recase: c.observer === 'HEADINGS' && sp.why.includes('Case'), cuttable: c.pattern === 'MACHINE_TELL' });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  // `specifics` stays "carries an unsourced claim" (what the loop reports as cut); `pure` is whether every
  // part merged into the span is one. It was ORed into the one flag the meaning check read, so a style
  // span that happened to overlap an invented figure skipped every check: its hedges and names could go.
  const merged: { start: number; end: number; reasons: string[]; rids: string[]; drops: string[]; clauses: Clause[]; swaps: string[]; specifics: boolean; pure: boolean; allClaims: boolean; anyWhole: boolean; claims: string[]; recase: boolean; cuttable: boolean }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
      if (!last.reasons.includes(r.reason)) last.reasons.push(r.reason);
      if (!last.rids.includes(r.rid)) last.rids.push(r.rid);
      if (r.drop && !last.drops.includes(r.drop)) last.drops.push(r.drop);
      last.clauses.push(...r.clauses);
      if (r.swap && !last.swaps.includes(r.swap)) last.swaps.push(r.swap);
      if (r.claim && !last.claims.includes(r.claim)) last.claims.push(r.claim);
      last.specifics ||= r.specifics; last.allClaims &&= r.specifics; last.anyWhole ||= r.whole;
      // The whole may go when a part of the span is an invented story and every other part is a claim too: a figure
      // inside an invented sentence goes with the sentence.
      last.pure = last.allClaims && last.anyWhole; last.recase ||= r.recase; last.cuttable &&= r.cuttable;
    } else merged.push({ start: r.start, end: r.end, reasons: [r.reason], rids: [r.rid], drops: r.drop ? [r.drop] : [], clauses: [...r.clauses], swaps: r.swap ? [r.swap] : [],
      specifics: r.specifics, pure: r.whole, allClaims: r.specifics, anyWhole: r.whole, claims: r.claim ? [r.claim] : [], recase: r.recase, cuttable: r.cuttable });
  }
  return merged.map((m, i) => ({ id: i + 1, start: m.start, end: m.end, text: text.slice(m.start, m.end),
    reasons: m.reasons, requirementIds: m.rids, drops: m.drops, swaps: m.swaps, specifics: m.specifics, recase: m.recase, cuttable: m.cuttable,
    ...(m.specifics && !m.pure ? { claims: m.claims, mixed: true } : {}), ...(opts.cites?.length ? { cites: opts.cites } : {}), ...(m.clauses.length ? { clauses: m.clauses } : {}) }));
}

/** The clause a banned word stands in, and the word: its hedges may go where the whole clause does. */
export interface Clause { readonly text: string; readonly banned: string }

/**
 * THE CLAUSE AROUND A SPAN, by form: from the last comma, colon, semicolon or coordinating "and", "but", "or" before it
 * in its sentence, to the next one after it or the sentence's end. A form parser of punctuation and three function words.
 */
function clauseAround(text: string, sent: { start: number; end: number }, sp: { start: number; end: number }): string {
  const s = text.slice(sent.start, sent.end);
  const at = sp.start - sent.start; const to = sp.end - sent.start;
  const BREAK = /[,;:]|\s(?:and|but|or)\s/gi;
  let from = 0; let till = s.length;
  for (const m of s.matchAll(BREAK)) {
    const i = m.index;
    if (i + m[0].length <= at) from = i + m[0].length;
    else if (i >= to) { till = i; break; }
  }
  return s.slice(from, till).trim();
}

/**
 * THE BANNED CLAUSES A REWRITE TOOK OUT WHOLE: no word of four letters or more of the clause, other than the banned word
 * and its hedges, is left in the replacement ("the" and "and" survive any rewrite and say nothing of the clause). A
 * clause that carries a figure is never treated as gone: a figure is a fact, and the meaning check keeps it.
 */
function clausesGone(clauses: readonly Clause[], replacement: string): Clause[] {
  const kept = new Set(replacement.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? []);
  return clauses.filter((c) => {
    if (/\d/.test(c.text)) return false;
    const hedges = hedgesIn(c.text);
    const banned = new Set(c.banned.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? []);
    const rest = (c.text.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? []).filter((w) => w.length >= 4 && !banned.has(w) && !hedges.includes(w));
    return rest.every((w) => !kept.has(w));
  });
}

/**
 * The span as the meaning check reads it: without the banned clauses the rewrite took out whole. Their hedge goes with
 * them, and only theirs: a "may" elsewhere in the span is still the span's, and still required ("Repairs may take a week,
 * and it may be a scam" rewritten as "Repairs take a week" loses the first "may" and is refused).
 */
function withoutGoneClauses(span: string, clauses: readonly Clause[], replacement: string): string {
  let out = span;
  for (const c of clausesGone(clauses, replacement)) { const at = out.indexOf(c.text); if (at !== -1) out = `${out.slice(0, at)}${out.slice(at + c.text.length)}`; }
  return out;
}

/** A document's name as a citation reads it: lower case, no extension, "-", "_" and spaces alike. */
const citeKey = (s: string): string => materialName(s).toLowerCase();

export const REPAIR_SYSTEM = `You revise marked spans of a draft so that each one meets the rules it broke.

You are given the whole draft for context, and a numbered list of spans. For each span, write a
replacement that:
  - fixes every reason listed for that span, and nothing else;
  - keeps the meaning, facts, names and figures of the original span, and every negation and qualifier
    ("not", "may", "most", "roughly"), unless a reason names that very word as the problem: a rewrite
    that drops one is refused and the original kept;
  - adds no story, figure, quotation, source or first-hand claim ("I checked", "we found") that the span
    did not already carry, and never leaves a bracketed slot;
  - keeps every [bracketed placeholder] already in the span, word for word;
  - reads naturally in place: the text immediately before and after it will not change;
  - uses no em dash (—) anywhere, placeholders included; write a comma, a colon or " - " instead.

Return a replacement for every numbered span. Do not return the rest of the draft.`;

/**
 * The same instructions for a person who asked for slots (`--placeholders`). An invented claim never
 * reaches a rewrite (it is cut or slotted in code, ./run-repair.ts enforceClaims); this variant only lets
 * a rewrite keep the slots already there.
 */
export const REPAIR_SYSTEM_WITH_PLACEHOLDERS = REPAIR_SYSTEM.replace(', and never leaves a bracketed slot;', ';');

export const REPAIR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    replacements: { type: 'array', items: { type: 'object',
      properties: { id: { type: 'number' }, text: { type: 'string' } }, required: ['id', 'text'], additionalProperties: false } },
  },
  required: ['replacements'], additionalProperties: false,
};

export function repairPrompt(text: string, targets: readonly RepairTarget[]): string {
  const list = targets.map((t) => `SPAN ${t.id}\n"""${t.text}"""\nbroke:\n${t.reasons.map((r) => `  - ${r}`).join('\n')}`).join('\n\n');
  const cites = [...new Set(targets.flatMap((t) => t.cites ?? []).map(citeKey))];
  return `THE DRAFT\n"""\n${text}\n"""\n\nTHE SPANS TO REVISE\n\n${list}\n\n${cites.length ? `The documents in the material, which a citation in square brackets may name: ${cites.join(', ')}.\n\n` : ''}Return one replacement per span.`;
}

/**
 * A span whose replacement was refused, and why. `kind` says which guard refused it: the meaning guard
 * (a figure, negation, qualifier, name or slot lost), a move recast as its sibling, a slot left for the
 * person, a stutter at the join, or a cut that was not allowed.
 */
export interface Reverted { readonly id: number; readonly lost: readonly string[]; readonly kind?: 'MEANING' | 'MOVE' | 'SLOT' | 'SEAM' | 'CUT' }
/** A span the splice replaced, and what replaced it. */
export interface Applied { readonly id: number; readonly before: string; readonly after: string }

/**
 * Put the replacements back, from the end so offsets stay valid. A span with no replacement is kept,
 * and so is a span whose replacement lost a figure, a negation, a qualifier or a name the original
 * carried (see ./integrity.ts): the rule stays broken there, which is visible, rather than the claim
 * quietly changing, which is not. `reverted` collects which spans were kept and why; `applied` collects
 * the spans that were replaced, before and after.
 */
export function applyRepair(text: string, targets: readonly RepairTarget[], replacements: readonly { readonly id: number | string; readonly text: string }[],
  reverted: Reverted[] = [], applied: Applied[] = [],
  /** true lets a replacement carry a bracketed slot ("[your story: …]"); off, one that adds a slot is refused */
  placeholders = false): string {
  // First answer per id wins; an id given as "2" is the span numbered 2.
  const byId = new Map<number, string>();
  for (const r of replacements) {
    const id = Number(r.id);   // a model may send "2"; the schema asks for a number
    // An empty replacement is a cut: kept here, and allowed below only for a machine-writing move.
    if (typeof r.text === 'string' && Number.isInteger(id) && !byId.has(id)) byId.set(id, r.text);
  }
  let out = text;
  for (const t of [...targets].sort((a, b) => b.start - a.start)) {
    const rep = byId.get(t.id);
    if (rep === undefined) continue;
    if (!rep.trim()) {
      // CUTTING A SENTENCE THAT IS ONLY A MOVE. "I want to be careful not to be cynical about this" has a
      // "not" the meaning guard protects, but no claim a reader loses when it goes. A cut is allowed for a
      // machine-writing move whose sentence carries no figure and no name; anything else keeps its words.
      if (!t.asked && (!t.cuttable || numbersIn(t.text).length || namesIn(t.text).length)) { reverted.push({ id: t.id, kind: 'CUT', lost: ['the sentence: only a sentence that is nothing but the move, with no figure or name in it, may be cut'] }); continue; }
      const cutTo = cutSpan(out, t.start, t.end);
      // A cut that would leave no text at all is not a repair: the sentence stays, and its move is still reported.
      if (proseWordsOf(text) > 0 && proseWordsOf(cutTo) === 0) { reverted.push({ id: t.id, kind: 'CUT', lost: ['the whole text: cutting this sentence would leave nothing'] }); continue; }
      out = cutTo;
      applied.push({ id: t.id, before: t.text, after: '' });
      continue;
    }
    // Only a span that is purely an unsourced claim skips the meaning check; a merged one is checked on
    // everything outside its claims.
    const integrity = t.asked ? { ok: true as const, lost: [] } : spanIntegrity(withoutGoneClauses(t.text, t.clauses ?? [], rep), rep, new Set(t.drops ?? []), (t.specifics ?? false) && !t.mixed, new Set(t.swaps ?? []), t.recase ?? false,
      t.mixed ? t.claims ?? [] : []);
    if (!integrity.ok) { reverted.push({ id: t.id, kind: 'MEANING', lost: integrity.lost }); continue; }
    // AN ASKED SPAN MAY CHANGE WHAT IT CLAIMS, NEVER INVENT. A figure or a name the replacement adds that neither the span
    // nor what the person gave (their words, the material, the piece) carries is refused: the span stays as it was.
    if (t.asked) {
      const src = `${t.text}\n${t.traced ?? ''}`; const had = new Set(namesIn(src));
      const added = [...addedFigures(t.text, rep, t.traced ?? ''), ...namesIn(rep).filter((n) => !had.has(n) && !src.includes(n))];
      if (added.length) { reverted.push({ id: t.id, kind: 'MEANING', lost: [`nothing: it added ${added.map((a) => `"${a}"`).join(', ')}, which neither the sentence nor what you gave carries`] }); continue; }
    }
    // A banned move may not move: a replacement that lowers one spelling of a move and raises another
    // ("not X, it's Y" rewritten as "X rather than Y") is refused, this span only; the rest of the pass
    // stands. Counted inside the span, so nothing elsewhere in the text can veto it.
    const moved = displacedFamilies(t.text, rep);
    if (moved.length) { reverted.push({ id: t.id, kind: 'MOVE', lost: [`the move, recast as its sibling (${moved.join('; ')})`] }); continue; }
    // No slot the person has to fill ships unless they asked for slots.
    // A citation naming a document of the bound material is the work's own reference, never a slot.
    const named = new Set((t.cites ?? []).map(citeKey));
    const slots = (x: string): number => (x.match(/\[[^\]\n]{3,200}\](?!\()/g) ?? []).filter((b) => !named.has(citeKey(b.slice(1, -1)))).length;
    if (!placeholders && slots(rep) > slots(t.text)) { reverted.push({ id: t.id, kind: 'SLOT', lost: ['the text: it left a bracketed slot for the person to fill'] }); continue; }
    // The seams: a replacement that repeats the words just after it (or just before it) left a stutter.
    const seam = seamRepeat(out.slice(0, t.start), rep.trim(), out.slice(t.end), t.text);
    if (seam) { reverted.push({ id: t.id, kind: 'SEAM', lost: [`a repeated "${seam}" at the join`] }); continue; }
    const fragment = seamFragment(out.slice(0, t.start), rep.trim(), out.slice(t.end), t.text);
    if (fragment) { reverted.push({ id: t.id, kind: 'SEAM', lost: [`a sentence left unfinished at the join ("${fragment}")`] }); continue; }
    out = out.slice(0, t.start) + rep.trim() + out.slice(t.end);
    applied.push({ id: t.id, before: t.text, after: rep.trim() });
  }
  return out;
}

const seamWords = (s: string): string[] => s.toLowerCase().match(/[a-z0-9'’]+/g) ?? [];

/**
 * The words a splice would repeat across a join, or null.
 *
 *   repeated   the last one to four words of the replacement are the same as the words just after the
 *              span (or its first words as those just before). A single repeated word counts only when
 *              it is a content word (four letters or more): "the the" is rare, "coupling coupling" is not.
 *   absorbed   a span that stops mid-sentence, rewritten into a replacement that uses the word right
 *              after the span, which the original span did not have: the rewrite finished the thought
 *              and the rest of the sentence is still there. "It's" + "coupling: make…" rewritten as
 *              "…rather than moral suasion:" left "…moral suasion: coupling: make market access…".
 */
export function seamRepeat(before: string, replacement: string, after: string, original = ''): string | null {
  const r = seamWords(replacement); const a = seamWords(after.slice(0, 200)); const b = seamWords(before.slice(-200));
  for (let k = Math.min(4, r.length); k >= 1; k--) {
    const tail = r.slice(-k).join(' '); const head = r.slice(0, k).join(' ');
    const ok = (w: string): boolean => k > 1 || w.length >= 4;
    if (a.length >= k && a.slice(0, k).join(' ') === tail && ok(tail)) return tail;
    if (b.length >= k && b.slice(-k).join(' ') === head && ok(head)) return head;
  }
  if (original && !/[.!?]["'”’)*_]*\s*$/.test(original)) {
    const had = new Set(seamWords(original)); const next = a[0];
    if (next && next.length >= 4 && r.includes(next) && !had.has(next)) return next;
  }
  return null;
}

const SENTENCE_END = /[.!?:;…]["'”’)\]*_]*$/;
const joinWords = (s: string): string[] => s.match(/[\p{L}\p{N}'’]+/gu) ?? [];
/**
 * A SENTENCE LEFT UNFINISHED AT A JOIN, by form, or null: the replacement stops on a word with no punctuation where the
 * span it replaced had ended its sentence, and what follows on the line opens with a capital ("The good news is that" +
 * " The remedy …"); or the text before stops on a word with no punctuation and the replacement opens with a capital the
 * span did not ("We know that" + "The remedy …" for "the remedy …"). Returned as the words either side of the join.
 */
export function seamFragment(before: string, replacement: string, after: string, original = ''): string | null {
  const next = /^[ \t]*(\p{Lu})/u.exec(after);
  if (next && SENTENCE_END.test(original.trim()) && !SENTENCE_END.test(replacement) && /\p{L}$/u.test(replacement)) {
    return [...joinWords(replacement).slice(-2), ...joinWords(after.split('\n')[0]).slice(0, 2)].join(' ');
  }
  const line = before.split('\n').pop() ?? '';
  if (/\p{Ll}$/u.test(line) && /^\p{Lu}/u.test(replacement) && /^\p{Ll}/u.test(original.trim())) {
    return [...joinWords(line).slice(-2), ...joinWords(replacement).slice(0, 2)].join(' ');
  }
  return null;
}

/** Remove `text[start, end)` and close the gap: one space between the two sides, or none across a line break. */
/** Below this share of the words a text had, a change has taken the work, not repaired it. */
export const SURVIVAL_SHARE = 0.25;
/**
 * NEVER DELIVER LESS THAN WAS ASKED FOR. Why a change from `before` to `after` takes the work away, or null: it leaves
 * no prose at all, or, unless `lengthCut` (a cut aimed at a length the person or the standard set), under a quarter of
 * the prose words `before` had.
 */
export function survivalLoss(before: string, after: string, lengthCut = false): string | null {
  const was = proseWordsOf(before); const now = proseWordsOf(after);
  if (was > 0 && now === 0) return 'it would leave no text at all';
  if (!lengthCut && was >= 8 && now < Math.ceil(was * SURVIVAL_SHARE)) return `it would leave ${now} of ${was} words`;
  return null;
}

/**
 * THE LENGTH THE PERSON ASKED FOR IS PART OF THE WORK. A change that takes the text below the fewest words the request
 * asks for, or further below it when it was already short, delivers less than was asked. Why, or null.
 */
export function belowAsked(before: string, after: string, floor: number | null): string | null {
  if (!floor) return null;
  const was = proseWordsOf(before); const now = proseWordsOf(after);
  return now < floor && now < was ? `it would take the text to ${now} words, below the ${floor} the request asks for` : null;
}

export function cutSpan(text: string, start: number, end: number): string {
  const before = text.slice(0, start).replace(/[ \t]+$/, ''); const after = text.slice(end).replace(/^[ \t]+/, '');
  return `${before}${before && after && !before.endsWith('\n') && !after.startsWith('\n') ? ' ' : ''}${after}`;
}

export interface RegressionVerdict { readonly ok: boolean; readonly why: string }

/**
 * The least a FEATURE check's |error| (in widths of its band) may move for the move to count: a fall of this much is
 * progress on it (`acceptRepair`), and a rise of this much is a regression on it (`regressions`). Read on every FEATURE
 * check that carries an error, enforced or graded; a caller comparing two lengths of one text reads a steering check
 * of the earlier report at the later length first (`readAtLength`); an enforced rule is read as it is.
 */
export const GRADED_STEP = 0.1;

/** Is this a FEATURE check with a distance to read? Its spans are carriers of a rate, not places that are wrong. */
const hasDistance = (c: { observer?: string; result: { error?: number } }): boolean => c.observer === 'FEATURE' && typeof c.result.error === 'number';

/**
 * A report with each broken STEERING FEATURE check's error read as it would be at another length (../observers/features.ts,
 * `errorAtLength`): what the earlier text of an edit is compared as, so only the count's own move is read. `paramsOf`
 * gives a check's FEATURE params (the standard's measurement, or a SIGNAL check's own band); a check without them is
 * read as it is.
 *
 * ONLY FOR STEERING (./controller.ts, the separation principle). An enforced rule is judged by its value on the text
 * as it is: an owner's "at most 5 asides per 1,000 words" broken at 11.7 and delivered at 16 is worse, whatever the
 * length did. `steering` says which checks are graded or SIGNAL; by default every check that does not act (a rule the
 * standard does not enforce, a SIGNAL band). A caller whose report marks graded checks as acting (run-repair.ts,
 * `withGraded`) passes its own.
 */
export function readAtLength(r: VerifyReport, from: string, to: string, paramsOf: (c: RuleCheck) => Readonly<Record<string, unknown>> | undefined,
  steering: (c: RuleCheck) => boolean = (c) => !acts(c)): VerifyReport {
  const wb = featureWordCount(from); const wa = featureWordCount(to);
  return { ...r, checked: r.checked.map((c) => {
    const v = c.result.value;
    const p = c.observer === 'FEATURE' && c.result.verdict === 'VIOLATED' && typeof v === 'number' && steering(c) ? paramsOf(c) : undefined;
    return p && typeof v === 'number' ? { ...c, result: { ...c.result, error: errorAtLength(p, v, wb, wa) } } : c;
  }) };
}

/** The FEATURE params of a standard's rule, or of a check that carries its own (a SIGNAL band): what `readAtLength` reads. */
export const featureParamsOf = (v: Pick<StandardVersion, 'requirements'>) => (c: RuleCheck): Readonly<Record<string, unknown>> | undefined => {
  const m = v.requirements.find((x) => x.requirementId === c.requirementId)?.measurement;
  return m?.observer === 'FEATURE' ? m.params : (c as { params?: Readonly<Record<string, unknown>> }).params;
};

/** The measurement params of a standard's rule, whatever its observer (or a check's own): what `distanceOf` reads a rate's direction from. */
export const ruleParamsOf = (v: Pick<StandardVersion, 'requirements'>) => (c: RuleCheck): Readonly<Record<string, unknown>> | undefined =>
  v.requirements.find((x) => x.requirementId === c.requirementId)?.measurement?.params ?? (c as { params?: Readonly<Record<string, unknown>> }).params;

export interface RegressionOptions {
  /**
   * STEERING IS SUBORDINATE TO THE OWNER'S RULES. The checks a step may not be refused for: the graded features and
   * the profile's SIGNAL bands, when the step was taken for an enforced rule (./run-repair.ts). They are never read
   * here, as worse or as better.
   */
  readonly ignore?: ReadonlySet<string>;
  /** a rule's measurement params, to read which way a rate is out (a ceiling or a floor); without it the check's detail says */
  readonly paramsOf?: ParamsOf;
}

/** A check's measurement params, where the caller knows the standard: what says whether a rate is a ceiling or a floor. */
export type ParamsOf = (c: RuleCheck) => Readonly<Record<string, unknown>> | undefined;

/** The observers whose broken check is read by its measured value (./controller.ts, rule A): rates, counts, lengths. */
const BY_VALUE = new Set(['PATTERN_RATE', 'HEDGE_RATE', 'TERM_RATE', 'LEXICON', 'LENGTH', 'FEATURE']);

/**
 * HOW FAR A BROKEN CHECK IS FROM HOLDING, by its measured value on the text as it is (no length rescaling):
 *   FEATURE (and any check carrying a band distance)  |error|, in widths of its band;
 *   PATTERN_RATE, TERM_RATE                            how far the rate is past its ceiling or under its floor, per 1,000 words;
 *   HEDGE_RATE                                         the rate (a ceiling only);
 *   LEXICON                                            the count of banned uses;
 *   LENGTH                                             the words (or characters, sentences) outside the range; a cap on the
 *                                                      longest sentence, the count of sentences over it.
 * A check that carries no value (or a kind of measure that changed between the two texts) is read by its count of places.
 */
export function distanceOf(c: RuleCheck, paramsOf?: ParamsOf): { readonly kind: 'error' | 'value' | 'places'; readonly d: number } {
  const places = { kind: 'places' as const, d: c.result.spans.length };
  const v = c.result.value; const e = c.result.error;
  if (c.observer === 'FEATURE' || (typeof e === 'number' && !BY_VALUE.has(c.observer ?? ''))) return typeof e === 'number' ? { kind: 'error', d: Math.abs(e) } : places;
  if (!BY_VALUE.has(c.observer ?? '') || typeof v !== 'number') return places;
  const p = paramsOf?.(c) ?? {};
  const num = (k: string): number | null => { const x = p[k]; return typeof x === 'number' ? x : null; };
  if (c.observer === 'LEXICON' || c.observer === 'HEDGE_RATE') return { kind: 'value', d: v };
  if (c.observer === 'LENGTH') {
    if (((p.unit as readonly string[] | undefined)?.[0] ?? '').toLowerCase() === 'sentence') return { kind: 'value', d: v };
    const lo = num('min'); const hi = num('max');
    if (lo === null && hi === null) { const m = /: (?:long|short) by (\d+)/.exec(c.result.detail); return m ? { kind: 'value', d: Number(m[1]) } : places; }
    return { kind: 'value', d: Math.max(0, hi !== null ? v - hi : 0, lo !== null ? lo - v : 0) };
  }
  // PATTERN_RATE, TERM_RATE: a ceiling, a floor or both. A move the author never makes is broken at any rate: the rate of
  // all such moves is its value, read as a ceiling at zero.
  if (((p.never as readonly string[] | undefined) ?? []).length) return { kind: 'value', d: v };
  const lo = num('minPer1000'); const hi = num('maxPer1000');
  // Without the params, the check's own detail says which side it is out: "(at least …)" is a floor, lower is further.
  if (lo === null && hi === null) return { kind: 'value', d: /\(at least [\d.]+\)/.test(c.result.detail) ? -v : v };
  return { kind: 'value', d: Math.max(0, hi !== null ? v - hi : 0, lo !== null ? lo - v : 0) };
}

/** The least move of each kind of measure that counts: GRADED_STEP band widths, any rise in a rate or a count. */
const stepOf = (kind: 'error' | 'value' | 'places'): number => (kind === 'error' ? GRADED_STEP - 1e-9 : 1e-9);

/** Is `a` further from holding than `b` was, read on one measure? A change of measure falls back to the count of places. */
function further(b: RuleCheck, a: RuleCheck, paramsOf?: ParamsOf): boolean {
  let x = distanceOf(b, paramsOf); let y = distanceOf(a, paramsOf);
  if (x.kind !== y.kind) { x = { kind: 'places', d: b.result.spans.length }; y = { kind: 'places', d: a.result.spans.length }; }
  return y.d - x.d >= stepOf(y.kind) && (y.kind !== 'places' || y.d > x.d);
}
/**
 * A CHECK THAT READ NOTHING BECAUSE THE TEXT IS TOO SHORT: its observer's "too short to measure", or the record's
 * `UNMEASURED` mark on it. Not a rule the request or the format excludes (that is "does not apply"): one that could be
 * read on a longer text and cannot be on this one.
 */
export const UNMEASURED = 'not measured: ';
export const tooShort = (c: { result: { verdict: string; detail: string } } | undefined): boolean =>
  c?.result.verdict === 'NOT_APPLICABLE' && (c.result.detail.startsWith('too short to measure') || c.result.detail.startsWith(UNMEASURED));
/**
 * UNMEASURABLE IS NOT HELD. Was the rule read on `b` (broken or held) and is `a` too short to read it? Then nothing is
 * known of it on `a`: a step that does this moved it no nearer holding, and the record may never say it holds.
 */
export const lostToLength = (b: { result: { verdict: string } } | undefined, a: { result: { verdict: string; detail: string } } | undefined): boolean =>
  (b?.result.verdict === 'VIOLATED' || b?.result.verdict === 'MET') && tooShort(a);
/**
 * `after` as every comparison of it with `before` reads it: a rule `before` read and `after` is too short to read stands
 * as it stood on `before`, so becoming unmeasurable is neither progress (a broken rule is still broken) nor a pass.
 */
export function asMeasured(before: VerifyReport, after: VerifyReport): VerifyReport {
  const was = new Map(before.checked.map((c) => [c.requirementId, c]));
  if (!after.checked.some((c) => lostToLength(was.get(c.requirementId), c))) return after;
  return { ...after, checked: after.checked.map((c) => { const b = was.get(c.requirementId); return b && lostToLength(b, c) ? b : c; }) };
}
/**
 * The enforced rules `before` read and `after` is too short to read, by id: what the record says was not measured on
 * the text delivered (core/eval/record-build.ts), never that it holds.
 */
export const unmeasuredIn = (before: VerifyReport, after: VerifyReport): string[] => {
  const was = new Map(before.checked.map((c) => [c.requirementId, c]));
  return after.checked.filter((c) => acts(c) && lostToLength(was.get(c.requirementId), c)).map((c) => c.requirementId);
};

/** Is `a` nearer holding than `b` was, read on one measure? A rule `a` is too short to read is not: nothing is known of it. */
function nearerOn(b: RuleCheck, a: RuleCheck | undefined, paramsOf?: ParamsOf): boolean {
  if (lostToLength(b, a)) return false;
  if (a?.result.verdict !== 'VIOLATED') return true;
  let x = distanceOf(b, paramsOf); let y = distanceOf(a, paramsOf);
  if (x.kind !== y.kind) { x = { kind: 'places', d: b.result.spans.length }; y = { kind: 'places', d: a.result.spans.length }; }
  return x.d - y.d >= stepOf(y.kind) && (y.kind !== 'places' || y.d < x.d);
}

/**
 * THE ONE ACCEPTANCE RULE (./controller.ts, rule A): the enforced rules `after` breaks that `before` did not, or breaks
 * further from holding by their value (`distanceOf`), each read on its own text with no length rescaling. Empty: no
 * enforced rule got worse. Every replacement of the working text is held to it, whichever loop proposes it: a rewrite,
 * a carrier rewrite, the operators, a fix without a model, a trim, a draft written again for any reason, a shape round.
 * The grammar checker's uncertain list is a note to the person, not a rule.
 */
export function enforcedNeverWorse(before: VerifyReport, after: VerifyReport, enforcedIds: ReadonlySet<string>, paramsOf?: ParamsOf): string[] {
  const was = new Map(before.checked.map((c) => [c.requirementId, c]));
  return asMeasured(before, after).checked.filter((c) => {
    if (!enforcedIds.has(c.requirementId) || c.result.verdict !== 'VIOLATED' || isGrammarNote(c)) return false;
    const b = was.get(c.requirementId);
    if (b?.result.verdict !== 'VIOLATED') return true;
    return further(b, c, paramsOf);
  }).map((c) => c.requirementId);
}

/**
 * The targets a step moved nearer holding (now held, or nearer by their value): a step made FOR enforced rules is kept
 * only when this is not empty (./controller.ts, rule A).
 */
export function enforcedNearer(before: VerifyReport, after: VerifyReport, targets: Iterable<string>, paramsOf?: ParamsOf): string[] {
  const now = new Map(after.checked.map((c) => [c.requirementId, c]));
  return [...targets].filter((id) => {
    const b = before.checked.find((c) => c.requirementId === id);
    return b?.result.verdict === 'VIOLATED' && nearerOn(b, now.get(id), paramsOf);
  });
}

/**
 * What got worse between two reports: a rule that was not broken and now is (whatever it was before —
 * MET, or not measurable because the text was too short), or a broken rule further from holding.
 *
 * Further from holding is read by distance wherever a check carries one (`distanceOf`): a FEATURE check's spans are the
 * CARRIERS of a rate (../observers/features.ts), and a rate's spans are where a rewrite starts, not how far it is out:
 * three carriers can become one while the value moves twice as far out. So an enforced check is read as
 * `enforcedNeverWorse` reads it, and a steering FEATURE check by |error| up by GRADED_STEP; only a check that carries no
 * value is worse when broken in more places. Shared by the repair loop and by `fix`, so "worse" means one thing everywhere.
 */
export function regressions(before: VerifyReport, after: VerifyReport, opts: RegressionOptions = {}): string[] {
  const was = new Map(before.checked.map((c) => [c.requirementId, c.result]));
  const acting = new Set(after.checked.filter((c) => acts(c) && !opts.ignore?.has(c.requirementId)).map((c) => c.requirementId));
  const enforcedWorse = new Set(enforcedNeverWorse(before, after, acting, opts.paramsOf));
  return after.checked.filter((c) => {
    if (opts.ignore?.has(c.requirementId)) return false;
    if (acting.has(c.requirementId)) return enforcedWorse.has(c.requirementId);
    const b = was.get(c.requirementId);
    if (c.result.verdict !== 'VIOLATED') return false;
    // The grammar checker's uncertain list is a note to the person, not a rule: a rewrite that adds one is not worse.
    if (isGrammarNote(c)) return false;
    if (b?.verdict !== 'VIOLATED') return true;
    if (c.observer === 'FEATURE') {
      const e = c.result.error;
      return typeof e === 'number' && typeof b.error === 'number' && Math.abs(e) - Math.abs(b.error) >= GRADED_STEP - 1e-9;
    }
    return c.result.spans.length > b.spans.length;
  }).map((c) => c.requirementId);
}

/** Does `after` hold no word or sign (%, $, +) that `before` does not, as many times? Punctuation and layout may change; words may only go. */
export function addsNoWords(before: string, after: string): boolean {
  const words = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.,-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu)?.map((w) => w.replace(/[.,]+$/, '')) ?? [];
  const had = new Map<string, number>(); for (const w of words(before)) had.set(w, (had.get(w) ?? 0) + 1);
  for (const w of words(after)) { const n = had.get(w) ?? 0; if (!n) return false; had.set(w, n - 1); }
  // A sign that changes what a figure says ("5" made "5%", "$5", "+5", "-5") is an added specific, though no word is
  // added. Markup is not such a sign: a quoted paragraph split in two gains a "> ".
  const signs = (t: string): string[] => t.match(/[\p{Sc}%‰+±×°]|[-−](?=\d)/gu) ?? [];
  const kept = new Map<string, number>(); for (const c of signs(before)) kept.set(c, (kept.get(c) ?? 0) + 1);
  for (const c of signs(after)) { const n = kept.get(c) ?? 0; if (!n) return false; kept.set(c, n - 1); }
  return true;
}

/** Which rules may refuse a step, by id: read by the caller off the consequence table (core/loop/run-repair.ts). */
export type Vetoes = (id: string) => boolean;
/** May this rule refuse a step? Every rule may, unless the caller said which may. */
export const mayRefuse = (id: string, vetoes: Vetoes | undefined): boolean => !vetoes || vetoes(id);

/**
 * Keep a repair only if nothing got worse, and it moved something nearer holding. The owner's enforced rules are read
 * by the one acceptance rule (`enforcedNeverWorse`, on each text as it is); the steering checks by `regressions`, on
 * the before-report the caller read at the new length. A step made FOR enforced rules (`targets`) must, in addition,
 * move at least one of its targets nearer holding (`enforcedNearer`): a rewrite for one rule that only happened to
 * move another is not that rule's repair. A change that adds no word (`wordsAdded: false`: an em dash made a comma)
 * cannot add an invented specific, so the reading of specifics read again is no evidence against it: an em dash fix
 * was thrown away because that reading listed one sentence more.
 */
export function acceptRepair(before: VerifyReport, after: VerifyReport,
  opts: { wordsAdded?: boolean;
    /** GRADED checks (run-repair.ts, `CheckOptions.graded`) read as enforced on these copies: only what the record's wording says of them */
    graded?: ReadonlySet<string>;
    /** steering checks never read for this step (`RegressionOptions.ignore`) */
    ignore?: ReadonlySet<string>;
    /** the enforced rules the step was made for: one of them must be nearer holding after it */
    targets?: readonly string[];
    /** the rules the standard enforces (read before any copy marks a graded check as acting); absent, every acting check that is not graded */
    enforced?: ReadonlySet<string>;
    /** what says whether a rate is a ceiling or a floor (`distanceOf`) */
    paramsOf?: ParamsOf;
    /**
     * WHICH RULES MAY REFUSE IT (core/eval/consequence.ts, `repairVeto`): a rule this says no to (one whose failure would
     * only label or list the work at the run's latitude) never makes a repair "worse". Absent, every rule may.
     */
    vetoes?: Vetoes } = {}): RegressionVerdict {
  // A rule the rewrite made too short to read stands as it stood: no fewer broken rules for it, and no pass.
  after = asMeasured(before, after);
  const enforced = new Set([...(opts.enforced ?? [...before.checked, ...after.checked].filter((c) => acts(c) && !opts.graded?.has(c.requirementId)).map((c) => c.requirementId))]
    .filter((id) => !opts.ignore?.has(id)));
  const steer = regressions(before, after, { ignore: new Set([...(opts.ignore ?? []), ...enforced]), paramsOf: opts.paramsOf });
  const worse = [...enforcedNeverWorse(before, after, enforced, opts.paramsOf), ...steer].filter((id) => opts.wordsAdded !== false || !id.startsWith('UNSOURCED'))
    .filter((id) => mayRefuse(id, opts.vetoes));
  if (worse.length) return { ok: false, why: `the rewrite made ${worse.join(', ')} worse` };
  const closer = opts.targets?.length ? enforcedNearer(before, after, opts.targets, opts.paramsOf) : null;
  if (closer && !closer.length) return { ok: false, why: `the rewrite moved none of ${opts.targets?.join(', ')} nearer holding` };
  const broken = (r: VerifyReport) => r.checked.filter((c) => acts(c) && c.result.verdict === 'VIOLATED' && !opts.ignore?.has(c.requirementId));
  const req = (r: VerifyReport): number => broken(r).length;
  // Said as what was counted: a graded check reads as enforced on the copy it is counted on, and is no REQUIRED rule.
  const gradedCount = broken(before).filter((c) => opts.graded?.has(c.requirementId)).length;
  const label = gradedCount === 0 ? 'REQUIRED' : gradedCount === req(before) ? 'graded' : 'REQUIRED or graded';
  // Progress is fewer broken REQUIRED rules, or the same rules broken in fewer places: fixing one of two
  // invented figures is a step, and discarding it threw away a good placeholder and ended the loop.
  if (req(after) < req(before)) return { ok: true, why: `${label} rules broken: ${req(before)} → ${req(after)}` };
  // A FEATURE check's places are the carriers it is pointed at, never how far it is out: fewer carriers with the value
  // further out is no step. Its progress is a fall in |error| of GRADED_STEP (in band widths) or more, read below.
  const spans = (r: VerifyReport): number => broken(r).filter((c) => !hasDistance(c)).reduce((n, c) => n + Math.max(1, c.result.spans.length), 0);
  if (spans(after) < spans(before)) return { ok: true, why: `places breaking a ${label} rule: ${spans(before)} → ${spans(after)}` };
  const errorOf = (r: VerifyReport, id: string): number => Math.abs(r.checked.find((c) => c.requirementId === id)?.result.error ?? 0);
  const moved = broken(before).filter(hasDistance).map((c) => ({ id: c.requirementId, from: errorOf(before, c.requirementId), to: errorOf(after, c.requirementId) }))
    .filter((x) => x.from - x.to >= GRADED_STEP - 1e-9);
  if (moved.length) {
    const kind = moved.every((x) => opts.graded?.has(x.id)) ? 'graded feature(s)' : 'feature rule(s)';
    return { ok: true, why: `${kind} nearer the band: ${moved.map((x) => `${x.id} ${x.from.toFixed(1)} → ${x.to.toFixed(1)}`).join(', ')}` };
  }
  if (closer?.length) return { ok: true, why: `nearer holding by their value: ${closer.join(', ')}` };
  return { ok: false, why: `the rewrite fixed no ${label} rule` };
}

/**
 * ONE STEP, ON THE ONE LEDGER, HELD TO THE ONE ACCEPTANCE RULE (./controller.ts, rules A and B). Every replacement of the
 * working text in a run is proposed through here, whichever loop proposes it: the controller's rewrites, carrier
 * rewrites, operators and fixes without a model (./run-repair.ts), the draft written again around a claim cut, the trims
 * and drafts written again, the draft written again for what the request asks, the structural edits, the voice pass
 * (cli/commands/invoke.ts) and the taste reader's rewrite (../taste/repair.ts). In order, it:
 *   1. asks the ledger whether the cap and the budget hold the step; one they refuse is entered as 'refused' and not run;
 *   2. enters the step before it runs, so a step that throws is on the record as one that could not run;
 *   3. calls `propose`, which makes the step's calls and returns the text it would put in place with the report counted
 *      on it. A step that writes a whole draft and refines it on the same ledger calls `taken` once the draft is written:
 *      the step is then counted while the draft is refined, and what it cost is read at that moment, so the steps on the
 *      draft are not charged to it twice;
 *   4. judges the result: no enforced rule newly broken or further from holding by its value (`enforcedNeverWorse`, with
 *      the standard's params); no figure added that neither the text before it, the request nor the bound material holds
 *      (./integrity.ts, `addedFigures`, against the ledger's `source`); and, for a step made for targets (`forEnforced`),
 *      at least one of them nearer holding (`enforcedNearer`), where a rule the step left too short to measure is not
 *      nearer (`lostToLength`); then the step's own goal (`also`: what it was for, its own guards). Kept only when all hold;
 *   5. settles the step as kept or not kept with why, what it moved and what the ledger charged for it. The steps taken
 *      on a draft that is not kept are marked as taken on that draft, and the hand-offs it made are withdrawn.
 * The caller keeps the text this returns; nothing else may replace the working text.
 */
export interface Proposed { readonly text: string; readonly report: VerifyReport }
/** A step that proposed no change: why, and how the record says it ('no change', or 'not kept' when what came back was refused). */
export interface NoChange { readonly unchanged: string; readonly outcome?: 'no change' | 'not kept' }
/** What the step is, and the targets it is made for: one of them must be nearer holding after it. */
export interface StepPlan extends PlannedStep { readonly forEnforced?: readonly string[] }
/**
 * The one rule's reading of a proposal: the enforced rules it made worse, the figures it added that neither the text
 * before it, the request nor the material holds, and which of its targets it moved nearer (null: made for none).
 */
export interface StepVerdict { readonly worse: readonly string[]; readonly invented: readonly string[]; readonly nearer: readonly string[] | null }
export interface StepRule<T extends Proposed> {
  /** the rules the standard enforces; absent, every check acting in either report */
  readonly enforced?: ReadonlySet<string>;
  /** which way a rate is out (`ruleParamsOf`) */
  readonly paramsOf?: ParamsOf;
  /** which rules may refuse the step (`acceptRepair`, `vetoes`); absent, every rule may */
  readonly vetoes?: Vetoes;
  /** false when the change adds no word: it cannot add an invented specific, so a claim reading is no evidence against it */
  readonly wordsAdded?: (after: T) => boolean;
  /** how a target the before-report does not hold as broken (the request's length, a miss read apart) is read as nearer */
  readonly nearerOther?: (id: string, after: T) => boolean;
  /** the step's own goal and guards, read after the one rule: why it may not be kept, or null */
  readonly also?: (after: T, verdict: StepVerdict) => string | null | Promise<string | null>;
  /** the spend purposes the step's calls are charged under */
  readonly purposes: readonly SpendPurpose[];
  /** the fewest words the request asks for, when it names a length: no step takes the text further below it */
  readonly floorWords?: number | null;
  /** what the step moved, in the units of its expected gain */
  readonly movement?: (after: T, kept: boolean) => number;
  /** the note the record carries; absent, why it was not kept */
  readonly note?: (after: T, kept: boolean, why: string | null, verdict: StepVerdict & { readonly own: string | null }) => string | undefined;
}
export type StepResult<T> =
  | { readonly kind: 'refused'; readonly why: string }
  | { readonly kind: 'failed'; readonly why: string; readonly at: number }
  | { readonly kind: 'unchanged'; readonly why: string; readonly at: number }
  /** `why`: why it was not kept, the one rule first; `own`: the step's own goal's reason, read whatever the rule said */
  | { readonly kind: 'judged'; readonly kept: boolean; readonly why: string | null; readonly own: string | null; readonly after: T; readonly verdict: StepVerdict; readonly at: number };

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export async function applyStep<T extends Proposed>(ledger: StepLedger, plan: StepPlan, before: Proposed | (() => Proposed),
  propose: (taken: (movement?: number) => void) => Promise<T | NoChange>, rule: StepRule<T>): Promise<StepResult<T>> {
  const refused = ledger.gate(plan);
  if (refused) return { kind: 'refused', why: refused };
  // Every call the step makes, in whatever module, is the step's: the run's clients allow it (../inference/step-guard.ts).
  return inStep(() => takeStep(ledger, plan, before, propose, rule));
}

async function takeStep<T extends Proposed>(ledger: StepLedger, plan: StepPlan, before: Proposed | (() => Proposed),
  propose: (taken: (movement?: number) => void) => Promise<T | NoChange>, rule: StepRule<T>): Promise<StepResult<T>> {
  const snap = processSpendByPurpose();
  const cost = (): { calls: number; usd: number } => {
    const ls = spendBetween(snap, processSpendByPurpose()).filter((l) => rule.purposes.includes(l.purpose));
    return { calls: ls.reduce((n, l) => n + l.calls, 0), usd: Math.round(ls.reduce((n, l) => n + l.usd, 0) * 1e6) / 1e6 };
  };
  const at = ledger.begin(plan);
  const nested = at + 1;
  let paid: { calls: number; usd: number } | null = null;
  const taken = (movement = 0): void => { paid = cost(); ledger.settle(at, 'kept', { movement: r3(movement), ...paid }); };
  /** the steps taken on a draft that is not delivered belong to that draft, and its hand-offs asked for nothing */
  const discardNested = (): void => { if (ledger.entries.length > nested) { ledger.withdrawHandOffs(nested); ledger.markOnDraftNotKept(nested, at); } };
  let after: T | NoChange;
  try { after = await propose(taken); } catch (e) {
    const why = (e as Error).message.split('\n')[0];
    ledger.settle(at, 'could not run', { movement: 0, ...(paid ?? cost()), note: why });
    discardNested();
    return { kind: 'failed', why, at };
  }
  const spent = paid ?? cost();
  if ('unchanged' in after) {
    ledger.settle(at, after.outcome ?? 'no change', { movement: 0, ...spent, note: after.unchanged });
    discardNested();
    return { kind: 'unchanged', why: after.unchanged, at };
  }
  const b = typeof before === 'function' ? before() : before;
  const enforced = rule.enforced ?? new Set([...b.report.checked, ...after.report.checked].filter((c) => acts(c)).map((c) => c.requirementId));
  const quiet = rule.wordsAdded !== undefined && !rule.wordsAdded(after);
  const worse = enforcedNeverWorse(b.report, after.report, enforced, rule.paramsOf).filter((id) => (!quiet || !id.startsWith('UNSOURCED')) && mayRefuse(id, rule.vetoes));
  // NO NEW INVENTED SPECIFIC, ON ANY PATH: a figure neither the text before the step, the request nor the material holds.
  const invented = addedFigures(b.text, after.text, ledger.source);
  const forE = plan.forEnforced ?? [];
  const nearer = forE.length ? forE.filter((id) => (b.report.checked.some((c) => c.requirementId === id && c.result.verdict === 'VIOLATED')
    ? enforcedNearer(b.report, after.report, [id], rule.paramsOf).length > 0 : rule.nearerOther?.(id, after) ?? false)) : null;
  const verdict: StepVerdict = { worse, invented, nearer };
  const own = await rule.also?.(after, verdict) ?? null;
  // NEVER LESS THAN WAS ASKED FOR, ON ANY PATH: a change that takes the work away, or makes a required rule it could
  // read unreadable (the text now too short for it), is not kept. A cut aimed at a length is exempt from the share.
  // Exempt from the share, never from emptiness: a step aimed at a length (the request's, or the length a draft is cut
  // to), and a redraft whose purpose is to drop invented claims.
  // EXEMPT FROM THE SHARE, NEVER FROM THE FLOOR THE REQUEST NAMES. A 1,300-word draft of a 1,000-word analysis may be cut
  // down to the request's band, never through it: a length step aimed at the request is the step most likely to
  // overshoot, so it is the last one to exempt. A claim redraft is held to the floor too: dropping an invented claim may
  // shorten the piece, but not below what was asked; when it would, the redraft is not kept and the claim stays listed
  // for the person, which is the truthful outcome (no repair delivers less than was asked).
  // A SHAPE target is a length only when it counts characters or words; removing a link, a tag or an emoji is not a
  // length cut and is held to the share like any edit.
  const lengthShape = (c: RuleCheck): boolean => { const sh = rule.paramsOf?.(c)?.shape ?? (c as { params?: Record<string, unknown> }).params?.shape; const first: unknown = Array.isArray(sh) ? (sh as unknown[])[0] : sh; return first === 'characters' || first === 'words'; };
  const lengthCut = plan.action === 'claim-redraft' || plan.targets.some((id) => id === 'request-length' || id === 'length'
    || [...b.report.checked, ...after.report.checked].some((c) => c.requirementId === id && (c.observer === 'LENGTH' || (c.observer === 'SHAPE' && lengthShape(c)))));
  const lost = survivalLoss(b.text, after.text, lengthCut) ?? belowAsked(b.text, after.text, rule.floorWords ?? null)
    ?? workLost(b.text, after.text, plan.action);
  const unreadable = enforced.size ? [...enforced].filter((id) => lostToLength(b.report.checked.find((c) => c.requirementId === id), after.report.checked.find((c) => c.requirementId === id))) : [];
  const why = lost ?? (unreadable.length ? `it would leave the text too short to check ${unreadable.join(', ')}`
    : worse.length ? `it made ${worse.join(', ')} worse`
    : invented.length ? `it added ${invented.length === 1 ? 'a figure' : 'figures'} that neither the text before it, the request nor your material holds (${invented.join(', ')})`
      : nearer && !nearer.length ? `it moved none of ${forE.join(', ')} nearer holding` : own);
  const kept = why === null;
  const note = rule.note ? rule.note(after, kept, why, { ...verdict, own }) : why ?? undefined;
  ledger.settle(at, kept ? 'kept' : 'not kept', { movement: r3(rule.movement?.(after, kept) ?? 0), ...spent, ...(note ? { note } : {}) });
  if (!kept) discardNested();
  return { kind: 'judged', kept, why, own, after, verdict, at };
}
