// atelier/core/compiler/contrast-examples.ts — WRITE THIS, NOT THAT, FROM THE LOOP'S OWN REPAIRS.
//
// Rules state what to do; a model follows a demonstration more reliably than a description. The best
// demonstrations this system has are the repairs it has already made: a sentence the model wrote that
// broke one of the owner's measured rules, next to the rewrite that met it and changed nothing it
// claimed (the meaning check in ../loop/integrity.ts). Each pair is verified twice before it ships —
// when the pass was accepted, and again here against the CURRENT standard — and they are drawn from
// the model's output only, never from the author's corpus and never from a held-out piece.
//
// Not from the ratification ledger. The ledger holds rule wordings: "not this phrasing of the rule"
// teaches a model nothing about writing, and a rejected rule is exactly what must never reach it.
//
// Bounded: at most two pairs per rule and six in all, newest first, each short. A contrast set that
// grows with use would make the skill larger with every run and eventually crowd out the rules.

import type { InvocationRecord, Measurement, RepairPair, Requirement, StandardVersion } from '../state/canonical-state.js';
import { byKey, measurementId } from '../state/rule-key.js';
import { measure, findTerms, DEFAULT_HEDGES } from '../observers/registry.js';
import { findPattern, type PatternId } from '../observers/style.js';
import { describeMeasurement } from '../observers/verify.js';

export interface ContrastPair extends RepairPair {
  /** the rule, in the owner's words, as of the standard it ships with */
  readonly statement: string;
}

export const MAX_PAIRS = 6;
export const MAX_PER_RULE = 2;
export const MAX_PAIR_CHARS = 400;

/**
 * Whether a pair still teaches the current standard. The rule must be live and measured, and have the
 * SAME check it had when the pair was recorded (an amended threshold or word list makes the pair an
 * example of something else). Both sides must be short and different. Where the check points at words,
 * the passage is re-counted: the "after" must have fewer of what the rule counts than the "before".
 * Length and mix rules are NOT_APPLICABLE on one passage; for those the evidence is the accepted pass,
 * which measured the whole draft.
 */
function stillTeaches(p: RepairPair, rule: Requirement | undefined): rule is Requirement {
  if (!rule?.measurement || rule.authority === 'EXPERT_REJECTED' || rule.materiality === 'INCIDENTAL') return false;
  if (p.check !== undefined && p.check !== measurementId(rule.measurement)) return false;
  if (!p.before.trim() || !p.after.trim() || p.before.trim() === p.after.trim()) return false;
  if (p.before.length > MAX_PAIR_CHARS || p.after.length > MAX_PAIR_CHARS) return false;
  const counted = wordsCounted(rule.measurement);
  if (counted) return counted(p.after) < counted(p.before);
  return true;
}

/** For checks about words, how many of the words the rule wants fewer of a passage has. */
function wordsCounted(m: Measurement): ((t: string) => number) | null {
  const list = (k: string): readonly string[] => (Array.isArray(m.params[k]) ? m.params[k] as readonly string[] : []);
  switch (m.observer) {
    case 'LEXICON': return (t) => measure(t, m).spans.length;
    case 'HEDGE_RATE': return (t) => findTerms(t, list('terms').length ? list('terms') : DEFAULT_HEDGES).length;
    case 'TERM_RATE': return typeof m.params.maxPer1000 === 'number' ? (t) => findTerms(t, list('terms')).length : null;
    case 'RATIO': return typeof m.params.minShare === 'number' ? (t) => findTerms(t, list('denominator')).length
      : typeof m.params.maxShare === 'number' ? (t) => findTerms(t, list('numerator')).length : null;
    case 'PATTERN_RATE': return typeof m.params.maxPer1000 === 'number' ? (t) => findPattern(t, list('pattern')[0] as PatternId).length : null;
    default: return null;
  }
}

/**
 * What must never become an example: the tasks and texts held back for the blind comparison. A run on
 * a reserved task (`atelier reference --loop`) is written for work the skill must not have seen.
 */
export interface HeldBack { readonly tasks: readonly string[]; readonly texts: readonly string[] }

/** Pick the pairs to ship with a standard, from every repair the skill's invocations recorded. */
export function selectContrastPairs(invocations: readonly InvocationRecord[], v: StandardVersion,
  heldBack: HeldBack = { tasks: [], texts: [] }): ContrastPair[] {
  const reservedTask = new Set(heldBack.tasks.map((t) => t.trim()));
  const inHeldBackText = (x: string): boolean => heldBack.texts.some((t) => t.includes(x.trim()));
  const rules = byKey(v.requirements);
  const perRule = new Map<string, number>();
  const seen = new Set<string>();
  const out: ContrastPair[] = [];
  const newestFirst = [...invocations].filter((i) => !reservedTask.has(i.input.trim())).sort((a, b) => b.at.localeCompare(a.at));
  for (const inv of newestFirst) {
    for (const p of inv.repair?.pairs ?? []) {
      if (out.length >= MAX_PAIRS) return out;
      const rule = rules.get(p.key);
      const id = `${p.key}|${p.before}`;
      if (seen.has(id) || (perRule.get(p.key) ?? 0) >= MAX_PER_RULE || !stillTeaches(p, rule)) continue;
      if (inHeldBackText(p.before) || inHeldBackText(p.after)) continue;
      seen.add(id);
      perRule.set(p.key, (perRule.get(p.key) ?? 0) + 1);
      out.push({ key: p.key, before: p.before, after: p.after, statement: rule.statement });
    }
  }
  return out;
}

/** Keep only the stored pairs that still teach this standard, with its current wording. */
export function contrastFor(stored: readonly ContrastPair[], v: StandardVersion): ContrastPair[] {
  const rules = byKey(v.requirements);
  return stored.flatMap((p) => {
    const rule = rules.get(p.key);
    return stillTeaches(p, rule) ? [{ ...p, statement: rule.statement }] : [];
  });
}

/** The file the skill ships: each pair under the rule it demonstrates. */
export function renderContrastFile(pairs: readonly ContrastPair[], v: StandardVersion): string {
  const rules = byKey(v.requirements);
  const blocks = pairs.map((p, i) => {
    const rule = rules.get(p.key);
    const check = rule ? describeMeasurement(rule) : null;
    return `## ${i + 1}. ${p.statement}${check ? `\n\n_Checked: ${check}._` : ''}\n\nNot this:\n\n> ${p.before.replace(/\n/g, '\n> ')}\n\nThis:\n\n> ${p.after.replace(/\n/g, '\n> ')}`;
  });
  return `# Write this, not that\n\nEach pair is a sentence a model wrote for this skill that broke one of its rules, and the rewrite that met\nthe rule without changing what the sentence claimed. Both sides are model-written; neither is the author's.\nTake the move, not the content.\n\n${blocks.join('\n\n')}\n`;
}
