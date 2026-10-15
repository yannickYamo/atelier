// atelier/core/observers/verify.ts — ANY TEXT, HELD TO A STANDARD'S MEASURED RULES.
//
// The pure core behind `atelier verify`, the MCP tool and the repair loop: which rules carry a
// measurement, what each one found, and whether a REQUIRED one is broken. A conditional rule is not
// checked here — whether its condition holds for a given text is a judgement, and applying it to every
// text would be exactly the over-application this project has measured — so it is listed instead.

import type { CheckContext } from './registry.js';
import { measure, observerFor, type ObserverResult } from './registry.js';
import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { isGeneralScope } from '../state/canonical-state.js';
import type { CutAuthority } from '../loop/cut-authority.js';
import { planFor } from '../plan/execution-plan.js';
import { GRAMMAR_NOT_RUN, grammarListed } from './grammar.js';

export interface RuleCheck {
  readonly requirementId: string;
  readonly statement: string;
  readonly materiality: string | null;
  /**
   * MAY THIS LINE ACT WHEN IT FAILS: block the work, have a sentence rewritten, have something cut. For a rule of
   * the standard it is the plan's to say (core/plan/execution-plan.ts) and is carried here; a line of the product's
   * own (a format's limits, the invented-claim line) has no rule and acts when it is REQUIRED. Read with `acts`.
   */
  readonly enforced?: boolean;
  readonly result: ObserverResult;
  /** the observer that measured it; absent for the product's own floor lines */
  readonly observer?: string;
  /** for a PATTERN_RATE rule, the pattern it counts: a repair uses it to know which move a span is */
  readonly pattern?: string;
  /** ACCURACY rules are repaired before STYLE ones; unset reads as STYLE */
  readonly phase?: 'ACCURACY' | 'STYLE';
  /** for a requirement that comes from a method: what kind of thing it asks (core/method/standard.ts). It decides the repair */
  readonly obligation?: 'DELIVERABLE' | 'EXECUTION' | 'JUDGEMENT';
  /** for the invented-claim line: which instrument found its spans, which decides whether they may be cut (run-repair.ts, cutBy) */
  readonly authority?: CutAuthority;
}

export interface VerifyReport {
  readonly skill: string;
  readonly standardVersionHash: string;
  readonly checked: readonly RuleCheck[];
  /** rules with no measurement: not checked, and named so the absence is visible */
  readonly unchecked: readonly { readonly requirementId: string; readonly statement: string }[];
  /** measured rules that apply only under a condition — not checked, because the condition is a judgement */
  readonly conditional: readonly { readonly requirementId: string; readonly statement: string; readonly appliesWhen: string }[];
  /** a REQUIRED rule was violated */
  readonly failed: boolean;
}

export { BAN_OBSERVERS, isOmission } from './obligations.js';

/** May a failed line act (see `RuleCheck.enforced`): the one reading, for everything that repairs, blocks or counts. */
export const acts = (c: { readonly enforced?: boolean; readonly materiality: string | null }): boolean => c.enforced ?? c.materiality === 'REQUIRED';

export function verifyText(skill: string, v: StandardVersion, text: string, context?: CheckContext): VerifyReport {
  const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED' && r.materiality !== 'INCIDENTAL');
  const measured = live.filter((r): r is Requirement & { measurement: NonNullable<Requirement['measurement']> } => Boolean(r.measurement));
  const enforced = new Map(planFor(v).rules.map((p) => [p.id, p.enforced]));
  const checked: RuleCheck[] = measured.filter((r) => isGeneralScope(r.appliesWhen))
    .map((r) => ({ requirementId: r.requirementId, statement: r.statement, materiality: r.materiality, enforced: enforced.get(r.requirementId) ?? false, result: measure(text, r.measurement, context),
      observer: r.measurement.observer, phase: r.phase ?? 'STYLE', ...(r.obligation ? { obligation: r.obligation } : {}),
      ...(r.measurement.observer === 'PATTERN_RATE' && Array.isArray(r.measurement.params.pattern) ? { pattern: String(r.measurement.params.pattern[0]) } : {}) }));
  return {
    skill, standardVersionHash: v.standardVersionHash, checked,
    unchecked: live.filter((r) => !r.measurement).map((r) => ({ requirementId: r.requirementId, statement: r.statement })),
    conditional: measured.filter((r) => !isGeneralScope(r.appliesWhen))
      .map((r) => ({ requirementId: r.requirementId, statement: r.statement, appliesWhen: r.appliesWhen })),
    failed: checked.some((c) => acts(c) && c.result.verdict === 'VIOLATED'),
  };
}

/** A check whose engine could not run: nothing was read, so the rule is not checked (never "does not apply"). */
export const notRun = (c: { readonly result: { readonly verdict: string; readonly detail: string } }): boolean =>
  c.result.verdict === 'NOT_APPLICABLE' && c.result.detail.startsWith(GRAMMAR_NOT_RUN);

/**
 * The check, line by line: each mark is the verdict of a check. `partly`: the rules whose check reads only part of
 * them (core/eval/record.ts); under such a check that held, the line says so and names the part nobody read. Given them, the last line is left to the caller, who has the record.
 */
export function describeVerify(r: VerifyReport, partly?: ReadonlyMap<string, string>): string {
  const lines: string[] = [];
  for (const c of r.checked) {
    // A check whose engine did not run (the grammar checker switched off or not loaded) read nothing: not checked, never n/a.
    // A grammar line that listed what it found is the person's to read: never met, never failed (./grammar.ts).
    const mark = c.result.verdict === 'MET' ? 'ok  ' : c.result.verdict === 'VIOLATED' ? (acts(c) ? 'FAIL' : 'warn') : notRun(c) ? 'not checked' : grammarListed(c) ? 'to check' : 'n/a ';
    lines.push(`${mark}  ${c.requirementId}  ${c.statement}`);
    lines.push(`        ${c.result.detail}`);
    if (c.result.verdict === 'MET' && partly?.has(c.requirementId)) lines.push(`        the check held, and it reads only part of this rule. Not checked, yours to read: ${partly.get(c.requirementId)}`);
    for (const s of c.result.spans.slice(0, 5)) lines.push(`        › "${s.text.length > 90 ? `${s.text.slice(0, 87)}…` : s.text}"  (${s.why})`);
    if (c.result.spans.length > 5) lines.push(`        › …and ${c.result.spans.length - 5} more`);
  }
  if (!r.checked.length) lines.push('No rule in this standard carries a measurement that applies everywhere, so nothing here can be checked mechanically.');
  if (r.conditional.length) {
    lines.push(`\n${r.conditional.length} measured rule(s) apply only under a condition and were not checked: ${r.conditional.map((c) => `${c.requirementId} (when ${c.appliesWhen})`).join(', ')}`);
    // The remedy, verbatim. "Not checked" with no way out read as a bug in verify; the way out is a scope
    // ruling only the owner can make, so it is printed as the exact command rather than described.
    for (const c of r.conditional) lines.push(`  to check ${c.requirementId} on every text: atelier amend --skill ${r.skill} --rule ${c.requirementId} --applies-when GENERAL --reason "<why>"`);
  }
  if (r.unchecked.length) lines.push(`\n${r.unchecked.length} rule(s) are about judgement, not measurement, and no count checks them: ${r.unchecked.map((u) => u.requirementId).join(', ')} (the taste reader reads them: verify --taste)`);
  const missed = r.checked.filter((c) => acts(c) && notRun(c)).map((c) => c.requirementId);
  const listed = r.checked.filter((c) => acts(c) && grammarListed(c)).map((c) => c.requirementId);
  const toRead = listed.length ? `; listed for you to check, and not changed: ${listed.join(', ')}` : '';
  if (!partly) lines.push(r.failed ? '\nA REQUIRED rule is broken.' : missed.length ? `\nNo REQUIRED rule that was checked is broken; not checked: ${missed.join(', ')}${toRead}.` : `\nNo REQUIRED rule is broken${toRead}.`);
  return lines.join('\n');
}

/** The words of a rule's measurement, for any surface that shows one. */
export const describeMeasurement = (r: Requirement): string | null =>
  (r.measurement ? observerFor(r.measurement.observer).describe(r.measurement.params) : null);
