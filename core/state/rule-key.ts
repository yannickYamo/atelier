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
// `amend`, `confirm` and `floor` take a rule three ways: the run id (`c2`), the key (`R-3f9a1c`, any
// case, with or without the `R-`), or the rule's position in the standard (`19`, as `atelier plan`
// numbers it). Commands tied to a probe or a comparison record (`answer`, `compare`) take the id.

import { createHash } from 'node:crypto';
import type { Measurement, Requirement, StandardVersion } from './canonical-state.js';

const short = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 6);

/** Params that say WHAT a measurement counts, as opposed to how much of it is allowed. A `role` names
 *  what a list is for (the contrast pass's "connectives" floor) so a list that differs from run to run
 *  does not make the rule a different rule. */
const IDENTITY_PARAMS = new Set(['pattern', 'terms', 'numerator', 'denominator', 'edges', 'words', 'maxWords']);
/** Which bounds a measurement sets: a floor and a cap on the same thing are two rules. */
const BOUND_PARAMS = ['minPer1000', 'maxPer1000', 'minShare', 'maxShare'];

const fold = (s: string): string => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** The key a rule has from its content alone, before any lineage is carried onto it. */
export function contentKey(r: Pick<Requirement, 'kind' | 'statement' | 'measurement'>): string {
  if (r.measurement) {
    const p = r.measurement.params;
    const role = Array.isArray(p.role) ? `role=${(p.role as readonly string[]).join('|')}` : null;
    const what = role ?? Object.entries(p)
      .filter(([k]) => IDENTITY_PARAMS.has(k))
      .map(([k, v]) => `${k}=${Array.isArray(v) ? [...(v as readonly (string | number)[])].map(String).sort().join('|') : String(v)}`)
      .sort().join(';');
    const bounds = BOUND_PARAMS.filter((k) => typeof p[k] === 'number').join(',');
    return `R-${short(`M|${r.measurement.observer}|${what}|${bounds}`)}`;
  }
  return `R-${short(`S|${r.kind}|${fold(r.statement)}`)}`;
}

/** A rule's key: the one it carries, or the one its content gives it. */
export const ruleKey = (r: Requirement): string => r.key ?? contentKey(r);

/**
 * Every rule's key within one standard, unique. Two rules can share a content key (two sentence-length
 * rules, say); the second and later get `-2`, `-3` in standard order, so a map keyed by rule never
 * silently loses one. Use this, not `ruleKey`, wherever rules are looked up by key.
 */
export function keysOf(requirements: readonly Requirement[]): string[] {
  const seen = new Map<string, number>();
  return requirements.map((r) => {
    const k = ruleKey(r);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}-${n}`;
  });
}

/** Rules by unique key: see `keysOf`. */
export const byKey = (requirements: readonly Requirement[]): Map<string, Requirement> => {
  const keys = keysOf(requirements);
  return new Map(requirements.map((r, i) => [keys[i], r]));
};

/** A measurement's exact identity, thresholds included: a pair recorded under one check is not evidence for another. */
export const measurementId = (m: Measurement): string => short(JSON.stringify({ o: m.observer, p: Object.fromEntries(Object.entries(m.params).sort(([a], [b]) => a.localeCompare(b))) }));

/**
 * Find a rule by any of the names a person might use for it. Refuses an ambiguous name rather than
 * picking one: acting on the wrong rule is worse than asking.
 */
export function resolveRule(requirements: readonly Requirement[], ref: string): { rule: Requirement } | { error: string } {
  const want = ref.trim();
  const byId = requirements.find((r) => r.requirementId === want);
  if (byId) return { rule: byId };
  const asKey = want.toUpperCase().startsWith('R-') ? want.toUpperCase() : `R-${want.toUpperCase()}`;
  const keys = keysOf(requirements);
  const hit = requirements.filter((_, i) => keys[i].toUpperCase() === asKey);
  if (hit.length === 1) return { rule: hit[0] };
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
  const before = byKey(prev.requirements);
  const after = byKey(next.requirements);
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
