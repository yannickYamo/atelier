// atelier/core/state/rule-key.ts — A RULE KEEPS ITS NAME ACROSS VERSIONS.
//
// A requirement's id (`p3`, `m1`, `c2`) is a position in one run: discovery numbers what it found, and
// a second run over the same work numbers again from 1. So "c2" in one version and "c2" in the next can
// be different rules, and nothing could say which rule an amendment moved.
//
// The key is the rule's identity across versions, derived from what the rule IS:
//
//   measured   the observer and what it counts (the pattern, the word lists, the bands), never the
//              threshold: moving a cap from 1.5 to 1.2 is the same rule, tightened
//   otherwise  its kind and its statement, lower-cased with punctuation and spacing folded
//
// and then carried: an amendment that rewords a rule writes the old key onto the new wording, so the
// rule the person amended is still the rule they amended. Two runs that discover the same measured
// rule, or the same sentence, give it the same key without coordinating.
//
// Rules can be named three ways wherever a command takes `--rule`: the run id (`c2`), the key
// (`R-3f9a1c`, any case, with or without the `R-`), or the rule's position in the standard (`19`).

import { createHash } from 'node:crypto';
import type { Requirement, StandardVersion } from './canonical-state.js';

const short = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 6);

/** Params that say WHAT a measurement counts, as opposed to how much of it is allowed. */
const IDENTITY_PARAMS = new Set(['pattern', 'terms', 'numerator', 'denominator', 'edges', 'words', 'maxWords']);

const fold = (s: string): string => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** The key a rule has from its content alone, before any lineage is carried onto it. */
export function contentKey(r: Pick<Requirement, 'kind' | 'statement' | 'measurement'>): string {
  if (r.measurement) {
    const what = Object.entries(r.measurement.params)
      .filter(([k]) => IDENTITY_PARAMS.has(k))
      .map(([k, v]) => `${k}=${Array.isArray(v) ? [...(v as readonly (string | number)[])].map(String).sort().join('|') : String(v)}`)
      .sort().join(';');
    return `R-${short(`M|${r.measurement.observer}|${what}`)}`;
  }
  return `R-${short(`S|${r.kind}|${fold(r.statement)}`)}`;
}

/** A rule's key: the one it carries, or the one its content gives it. */
export const ruleKey = (r: Requirement): string => r.key ?? contentKey(r);

/**
 * Find a rule by any of the names a person might use for it. Refuses an ambiguous name rather than
 * picking one: acting on the wrong rule is worse than asking.
 */
export function resolveRule(requirements: readonly Requirement[], ref: string): { rule: Requirement } | { error: string } {
  const want = ref.trim();
  const byId = requirements.find((r) => r.requirementId === want);
  if (byId) return { rule: byId };
  const asKey = want.toUpperCase().startsWith('R-') ? want.toUpperCase() : `R-${want.toUpperCase()}`;
  const byKey = requirements.filter((r) => ruleKey(r).toUpperCase() === asKey);
  if (byKey.length === 1) return { rule: byKey[0] };
  if (byKey.length > 1) return { error: `${ref} names ${byKey.length} rules (${byKey.map((r) => r.requirementId).join(', ')}); use the id.` };
  const pos = /^#?(\d+)$/.exec(want);
  if (pos) {
    const i = Number(pos[1]) - 1;
    if (i >= 0 && i < requirements.length) return { rule: requirements[i] };
  }
  return { error: `no rule "${ref}" in this standard. Name it by id (${requirements.slice(0, 3).map((r) => r.requirementId).join(', ')}…), by key (${requirements[0] ? ruleKey(requirements[0]) : 'R-…'}), or by its number in \`atelier plan\`.` };
}

export interface RuleChange {
  readonly key: string;
  readonly change: 'ADDED' | 'REMOVED' | 'CHANGED';
  readonly id: string;
  /** what moved, in words, for CHANGED */
  readonly fields: readonly string[];
  readonly statement: string;
}

/** Which rules moved between two versions of a standard, matched by key rather than by run id. */
export function diffStandards(prev: StandardVersion, next: StandardVersion): RuleChange[] {
  const before = new Map(prev.requirements.map((r) => [ruleKey(r), r]));
  const after = new Map(next.requirements.map((r) => [ruleKey(r), r]));
  const out: RuleChange[] = [];
  for (const [key, r] of after) {
    const was = before.get(key);
    if (!was) { out.push({ key, change: 'ADDED', id: r.requirementId, fields: [], statement: r.statement }); continue; }
    const fields: string[] = [];
    if (was.statement !== r.statement) fields.push('wording');
    if (was.materiality !== r.materiality) fields.push(`weight ${was.materiality ?? 'undeclared'} → ${r.materiality ?? 'undeclared'}`);
    if (JSON.stringify(was.measurement ?? null) !== JSON.stringify(r.measurement ?? null)) fields.push('check');
    if ((was.phase ?? 'STYLE') !== (r.phase ?? 'STYLE')) fields.push(`phase ${was.phase ?? 'STYLE'} → ${r.phase ?? 'STYLE'}`);
    if (was.appliesWhen !== r.appliesWhen) fields.push('condition');
    if (was.authority !== r.authority) fields.push(`authority ${was.authority} → ${r.authority}`);
    if (fields.length) out.push({ key, change: 'CHANGED', id: r.requirementId, fields, statement: r.statement });
  }
  for (const [key, r] of before) if (!after.has(key)) out.push({ key, change: 'REMOVED', id: r.requirementId, fields: [], statement: r.statement });
  return out;
}
