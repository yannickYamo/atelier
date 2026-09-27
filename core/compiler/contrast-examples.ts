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

import type { InvocationRecord, RepairPair, Requirement, StandardVersion } from '../state/canonical-state.js';
import { ruleKey } from '../state/rule-key.js';
import { measure } from '../observers/registry.js';
import { describeMeasurement } from '../observers/verify.js';

export interface ContrastPair extends RepairPair {
  /** the rule, in the owner's words, as of the standard it ships with */
  readonly statement: string;
}

export const MAX_PAIRS = 6;
export const MAX_PER_RULE = 2;
export const MAX_PAIR_CHARS = 400;

/**
 * Whether a pair still teaches the current standard: its rule is live and measured, and both sides are
 * short and different. A banned-word rule is checked on the passage itself: the "before" must contain a
 * listed word and the "after" none. Rate and mix rules are NOT_APPLICABLE on one sentence, so for those
 * the pair's evidence is the pass that accepted it, which measured the whole draft.
 */
function stillTeaches(p: RepairPair, rule: Requirement | undefined): rule is Requirement {
  if (!rule?.measurement || rule.authority === 'EXPERT_REJECTED' || rule.materiality === 'INCIDENTAL') return false;
  if (!p.before.trim() || !p.after.trim() || p.before.trim() === p.after.trim()) return false;
  if (p.before.length > MAX_PAIR_CHARS || p.after.length > MAX_PAIR_CHARS) return false;
  if (rule.measurement.observer === 'LEXICON') {
    const hits = (t: string): number => measure(t, rule.measurement!).spans.length;
    if (hits(p.after) > 0 || hits(p.before) === 0) return false;
  }
  return true;
}

/** Pick the pairs to ship with a standard, from every repair the skill's invocations recorded. */
export function selectContrastPairs(invocations: readonly InvocationRecord[], v: StandardVersion): ContrastPair[] {
  const byKey = new Map(v.requirements.map((r) => [ruleKey(r), r]));
  const perRule = new Map<string, number>();
  const seen = new Set<string>();
  const out: ContrastPair[] = [];
  const newestFirst = [...invocations].sort((a, b) => b.at.localeCompare(a.at));
  for (const inv of newestFirst) {
    for (const p of inv.repair?.pairs ?? []) {
      if (out.length >= MAX_PAIRS) return out;
      const rule = byKey.get(p.key);
      const id = `${p.key}|${p.before}`;
      if (seen.has(id) || (perRule.get(p.key) ?? 0) >= MAX_PER_RULE || !stillTeaches(p, rule)) continue;
      seen.add(id);
      perRule.set(p.key, (perRule.get(p.key) ?? 0) + 1);
      out.push({ key: p.key, before: p.before, after: p.after, statement: rule.statement });
    }
  }
  return out;
}

/** Keep only the stored pairs that still teach this standard, with its current wording. */
export function contrastFor(stored: readonly ContrastPair[], v: StandardVersion): ContrastPair[] {
  const byKey = new Map(v.requirements.map((r) => [ruleKey(r), r]));
  return stored.flatMap((p) => {
    const rule = byKey.get(p.key);
    return stillTeaches(p, rule) ? [{ ...p, statement: rule.statement }] : [];
  });
}

/** The file the skill ships: each pair under the rule it demonstrates. */
export function renderContrastFile(pairs: readonly ContrastPair[], v: StandardVersion): string {
  const byKey = new Map(v.requirements.map((r) => [ruleKey(r), r]));
  const blocks = pairs.map((p, i) => {
    const check = byKey.get(p.key) ? describeMeasurement(byKey.get(p.key)!) : null;
    return `## ${i + 1}. ${p.statement}${check ? `\n\n_Checked: ${check}._` : ''}\n\nNot this:\n\n> ${p.before.replace(/\n/g, '\n> ')}\n\nThis:\n\n> ${p.after.replace(/\n/g, '\n> ')}`;
  });
  return `# Write this, not that\n\nEach pair is a sentence written for this skill that broke one of its rules, and the rewrite that met\nthe rule without changing what the sentence claimed. Take the move, not the content.\n\n${blocks.join('\n\n')}\n`;
}
