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

export interface RepairTarget {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly reasons: readonly string[];
  readonly requirementIds: readonly string[];
}

/**
 * The spans to rewrite, grown to whole sentences — a banned word replaced inside its sentence reads
 * better than a word swapped in isolation — or whole paragraphs where the rule is about paragraphs.
 * Overlapping targets merge, so one sentence is rewritten once for every reason it broke a rule.
 */
export function planRepair(text: string, report: VerifyReport, opts: { readonly requiredOnly?: boolean } = {}): RepairTarget[] {
  const requiredOnly = opts.requiredOnly ?? true;
  const sentences = sentencesOf(text);
  const paragraphs = paragraphsOf(text);
  const raw: { start: number; end: number; reason: string; rid: string }[] = [];
  for (const c of report.checked) {
    if (c.result.verdict !== 'VIOLATED') continue;
    if (requiredOnly && c.materiality !== 'REQUIRED') continue;
    for (const sp of c.result.spans) {
      // A span that IS a paragraph (the paragraph-length rule) is rewritten as one; any other span
      // grows to the sentence around it.
      const para = paragraphs.find((p) => sp.start <= p.start && sp.end >= p.end);
      const sent = sentences.find((s) => sp.start >= s.start && sp.start < s.end);
      const start = para ? para.start : sent ? Math.min(sent.start, sp.start) : sp.start;
      const end = para ? para.end : sent ? Math.max(sent.end, sp.end) : sp.end;
      raw.push({ start, end, reason: `${c.requirementId}: ${c.statement} (${sp.why})`, rid: c.requirementId });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number; reasons: string[]; rids: string[] }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
      if (!last.reasons.includes(r.reason)) last.reasons.push(r.reason);
      if (!last.rids.includes(r.rid)) last.rids.push(r.rid);
    } else merged.push({ start: r.start, end: r.end, reasons: [r.reason], rids: [r.rid] });
  }
  return merged.map((m, i) => ({ id: i + 1, start: m.start, end: m.end, text: text.slice(m.start, m.end), reasons: m.reasons, requirementIds: m.rids }));
}

export const REPAIR_SYSTEM = `You revise marked spans of a draft so that each one meets the rules it broke.

You are given the whole draft for context, and a numbered list of spans. For each span, write a
replacement that:
  - fixes every reason listed for that span, and nothing else;
  - keeps the meaning, facts, names and figures of the original span, except where a reason says the
    story or figure is not in the author's material: then replace just that story or figure with a short
    bracketed placeholder saying what belongs there, e.g. [your story: a time a control got routed around],
    and never substitute another invented one;
  - reads naturally in place: the text immediately before and after it will not change;
  - uses no em dash (—) anywhere, placeholders included; write a comma, a colon or " - " instead.

Return a replacement for every numbered span. Do not return the rest of the draft.`;

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

/** Put the replacements back, from the end so offsets stay valid. A span with no replacement is kept. */
export function applyRepair(text: string, targets: readonly RepairTarget[], replacements: readonly { readonly id: number | string; readonly text: string }[]): string {
  // First answer per id wins; an id given as "2" is the span numbered 2.
  const byId = new Map<number, string>();
  for (const r of replacements) {
    const id = Number(r.id);   // a model may send "2"; the schema asks for a number
    if (typeof r.text === 'string' && r.text.trim() && Number.isInteger(id) && !byId.has(id)) byId.set(id, r.text);
  }
  let out = text;
  for (const t of [...targets].sort((a, b) => b.start - a.start)) {
    const rep = byId.get(t.id);
    if (rep === undefined) continue;
    out = out.slice(0, t.start) + rep.trim() + out.slice(t.end);
  }
  return out;
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
  const req = (r: VerifyReport): number => r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').length;
  if (req(after) >= req(before)) return { ok: false, why: 'the rewrite fixed no REQUIRED rule' };
  return { ok: true, why: `REQUIRED rules broken: ${req(before)} → ${req(after)}` };
}
