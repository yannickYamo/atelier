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
import type { VerifyReport } from '../observers/verify.js';
import { displacedFamilies } from '../observers/style.js';
import { spanIntegrity, namesIn, numbersIn } from './integrity.js';

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
}

/**
 * The spans to rewrite, grown to whole sentences — a banned word replaced inside its sentence reads
 * better than a word swapped in isolation — or whole paragraphs where the rule is about paragraphs.
 * Overlapping targets merge, so one sentence is rewritten once for every reason it broke a rule.
 */
export function planRepair(text: string, report: VerifyReport,
  opts: { readonly requiredOnly?: boolean; readonly phase?: 'ACCURACY' | 'STYLE' } = {}): RepairTarget[] {
  const requiredOnly = opts.requiredOnly ?? true;
  const sentences = sentencesOf(text);
  const paragraphs = paragraphsOf(text);
  const raw: { start: number; end: number; reason: string; rid: string; drop: string | null; swap: string | null; specifics: boolean; whole: boolean; claim: string | null; recase: boolean; cuttable: boolean }[] = [];
  for (const c of report.checked) {
    if (c.result.verdict !== 'VIOLATED') continue;
    if (requiredOnly && c.materiality !== 'REQUIRED') continue;
    if (opts.phase && (c.phase ?? 'STYLE') !== opts.phase) continue;
    // WHAT A METHOD REQUIRES IS NEVER REPAIRED BY REWRITING A SENTENCE. A missing section or table is not a sentence
    // that went wrong: rewritten into the last paragraph it becomes prose that mentions the section, which reads as
    // done and is not. It is answered by writing the piece again with what is missing named (cli/commands/invoke.ts,
    // `withMethod`). A figure the material does not hold is the other kind: the sentence is rewritten without it,
    // which takes the figure out and claims nothing in its place. Held to keep every figure, the rewrite that cut it
    // was refused and the figure delivered; so that figure, and only it, is what the rewrite may lose.
    if (c.obligation === 'DELIVERABLE') continue;
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
      const move = c.pattern ? MOVE_HINT[c.pattern] : undefined;
      raw.push({ start, end, reason: `${c.requirementId}: ${c.statement} (${sp.why})${move ? `. ${move}` : ''}`, rid: c.requirementId,
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
  const merged: { start: number; end: number; reasons: string[]; rids: string[]; drops: string[]; swaps: string[]; specifics: boolean; pure: boolean; claims: string[]; recase: boolean; cuttable: boolean }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
      if (!last.reasons.includes(r.reason)) last.reasons.push(r.reason);
      if (!last.rids.includes(r.rid)) last.rids.push(r.rid);
      if (r.drop && !last.drops.includes(r.drop)) last.drops.push(r.drop);
      if (r.swap && !last.swaps.includes(r.swap)) last.swaps.push(r.swap);
      if (r.claim && !last.claims.includes(r.claim)) last.claims.push(r.claim);
      last.specifics ||= r.specifics; last.pure &&= r.whole; last.recase ||= r.recase; last.cuttable &&= r.cuttable;
    } else merged.push({ start: r.start, end: r.end, reasons: [r.reason], rids: [r.rid], drops: r.drop ? [r.drop] : [], swaps: r.swap ? [r.swap] : [],
      specifics: r.specifics, pure: r.whole, claims: r.claim ? [r.claim] : [], recase: r.recase, cuttable: r.cuttable });
  }
  return merged.map((m, i) => ({ id: i + 1, start: m.start, end: m.end, text: text.slice(m.start, m.end),
    reasons: m.reasons, requirementIds: m.rids, drops: m.drops, swaps: m.swaps, specifics: m.specifics, recase: m.recase, cuttable: m.cuttable,
    ...(m.specifics && !m.pure ? { claims: m.claims, mixed: true } : {}) }));
}

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
  return `THE DRAFT\n"""\n${text}\n"""\n\nTHE SPANS TO REVISE\n\n${list}\n\nReturn one replacement per span.`;
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
      if (!t.cuttable || numbersIn(t.text).length || namesIn(t.text).length) { reverted.push({ id: t.id, kind: 'CUT', lost: ['the sentence: only a sentence that is nothing but the move, with no figure or name in it, may be cut'] }); continue; }
      out = cutSpan(out, t.start, t.end);
      applied.push({ id: t.id, before: t.text, after: '' });
      continue;
    }
    // Only a span that is purely an unsourced claim skips the meaning check; a merged one is checked on
    // everything outside its claims.
    const integrity = spanIntegrity(t.text, rep, new Set(t.drops ?? []), (t.specifics ?? false) && !t.mixed, new Set(t.swaps ?? []), t.recase ?? false,
      t.mixed ? t.claims ?? [] : []);
    if (!integrity.ok) { reverted.push({ id: t.id, kind: 'MEANING', lost: integrity.lost }); continue; }
    // A banned move may not move: a replacement that lowers one spelling of a move and raises another
    // ("not X, it's Y" rewritten as "X rather than Y") is refused, this span only; the rest of the pass
    // stands. Counted inside the span, so nothing elsewhere in the text can veto it.
    const moved = displacedFamilies(t.text, rep);
    if (moved.length) { reverted.push({ id: t.id, kind: 'MOVE', lost: [`the move, recast as its sibling (${moved.join('; ')})`] }); continue; }
    // No slot the person has to fill ships unless they asked for slots.
    const slots = (x: string): number => (x.match(/\[[^\]\n]{3,200}\](?!\()/g) ?? []).length;
    if (!placeholders && slots(rep) > slots(t.text)) { reverted.push({ id: t.id, kind: 'SLOT', lost: ['the text: it left a bracketed slot for the person to fill'] }); continue; }
    // The seams: a replacement that repeats the words just after it (or just before it) left a stutter.
    const seam = seamRepeat(out.slice(0, t.start), rep.trim(), out.slice(t.end), t.text);
    if (seam) { reverted.push({ id: t.id, kind: 'SEAM', lost: [`a repeated "${seam}" at the join`] }); continue; }
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

/** Remove `text[start, end)` and close the gap: one space between the two sides, or none across a line break. */
export function cutSpan(text: string, start: number, end: number): string {
  const before = text.slice(0, start).replace(/[ \t]+$/, ''); const after = text.slice(end).replace(/^[ \t]+/, '');
  return `${before}${before && after && !before.endsWith('\n') && !after.startsWith('\n') ? ' ' : ''}${after}`;
}

export interface RegressionVerdict { readonly ok: boolean; readonly why: string }

/**
 * What got worse between two reports: a rule that was not broken and now is (whatever it was before —
 * MET, or not measurable because the text was too short), or a broken rule broken in more places.
 * Shared by the repair loop and by `fix`, so "worse" means one thing everywhere.
 */
export function regressions(before: VerifyReport, after: VerifyReport): string[] {
  const was = new Map(before.checked.map((c) => [c.requirementId, c.result]));
  return after.checked.filter((c) => {
    const b = was.get(c.requirementId);
    if (c.result.verdict !== 'VIOLATED') return false;
    if (b?.verdict !== 'VIOLATED') return true;
    return c.result.spans.length > b.spans.length;
  }).map((c) => c.requirementId);
}

/** Keep a repair only if nothing got worse, and at least one REQUIRED rule that was broken now holds. */
export function acceptRepair(before: VerifyReport, after: VerifyReport): RegressionVerdict {
  const worse = regressions(before, after);
  if (worse.length) return { ok: false, why: `the rewrite made ${worse.join(', ')} worse` };
  const broken = (r: VerifyReport) => r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED');
  const req = (r: VerifyReport): number => broken(r).length;
  // Progress is fewer broken REQUIRED rules, or the same rules broken in fewer places: fixing one of two
  // invented figures is a step, and discarding it threw away a good placeholder and ended the loop.
  const spans = (r: VerifyReport): number => broken(r).reduce((n, c) => n + Math.max(1, c.result.spans.length), 0);
  if (req(after) < req(before)) return { ok: true, why: `REQUIRED rules broken: ${req(before)} → ${req(after)}` };
  if (spans(after) < spans(before)) return { ok: true, why: `places breaking a REQUIRED rule: ${spans(before)} → ${spans(after)}` };
  return { ok: false, why: 'the rewrite fixed no REQUIRED rule' };
}
