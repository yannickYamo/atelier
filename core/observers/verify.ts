// atelier/core/observers/verify.ts — ANY TEXT, HELD TO A STANDARD'S MEASURED RULES.
//
// The pure core behind `atelier verify`, the MCP tool and the repair loop: which rules carry a
// measurement, what each one found, and whether a REQUIRED one is broken. A conditional rule is not
// checked here — whether its condition holds for a given text is a judgement, and applying it to every
// text would be exactly the over-application this project has measured — so it is listed instead.

import { measure, observerFor, type ObserverResult } from './registry.js';
import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { isGeneralScope } from '../state/canonical-state.js';

export interface RuleCheck {
  readonly requirementId: string;
  readonly statement: string;
  readonly materiality: string | null;
  readonly result: ObserverResult;
  /** the observer that measured it; absent for the product's own floor lines */
  readonly observer?: string;
  /** for a PATTERN_RATE rule, the pattern it counts: a repair uses it to know which move a span is */
  readonly pattern?: string;
  /** ACCURACY rules are repaired before STYLE ones; unset reads as STYLE */
  readonly phase?: 'ACCURACY' | 'STYLE';
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

export function verifyText(skill: string, v: StandardVersion, text: string): VerifyReport {
  const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED' && r.materiality !== 'INCIDENTAL');
  const measured = live.filter((r): r is Requirement & { measurement: NonNullable<Requirement['measurement']> } => Boolean(r.measurement));
  const checked: RuleCheck[] = measured.filter((r) => isGeneralScope(r.appliesWhen))
    .map((r) => ({ requirementId: r.requirementId, statement: r.statement, materiality: r.materiality, result: measure(text, r.measurement),
      observer: r.measurement.observer, phase: r.phase ?? 'STYLE',
      ...(r.measurement.observer === 'PATTERN_RATE' && Array.isArray(r.measurement.params.pattern) ? { pattern: String(r.measurement.params.pattern[0]) } : {}) }));
  return {
    skill, standardVersionHash: v.standardVersionHash, checked,
    unchecked: live.filter((r) => !r.measurement).map((r) => ({ requirementId: r.requirementId, statement: r.statement })),
    conditional: measured.filter((r) => !isGeneralScope(r.appliesWhen))
      .map((r) => ({ requirementId: r.requirementId, statement: r.statement, appliesWhen: r.appliesWhen })),
    failed: checked.some((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED'),
  };
}

export function describeVerify(r: VerifyReport): string {
  const lines: string[] = [];
  for (const c of r.checked) {
    const mark = c.result.verdict === 'MET' ? 'ok  ' : c.result.verdict === 'VIOLATED' ? (c.materiality === 'REQUIRED' ? 'FAIL' : 'warn') : 'n/a ';
    lines.push(`${mark}  ${c.requirementId}  ${c.statement}`);
    lines.push(`        ${c.result.detail}`);
    for (const s of c.result.spans.slice(0, 5)) lines.push(`        › "${s.text.length > 90 ? `${s.text.slice(0, 87)}…` : s.text}"  (${s.why})`);
    if (c.result.spans.length > 5) lines.push(`        › …and ${c.result.spans.length - 5} more`);
  }
  if (!r.checked.length) lines.push('No rule in this standard carries a measurement that applies everywhere, so nothing here can be checked mechanically.');
  if (r.conditional.length) lines.push(`\n${r.conditional.length} measured rule(s) apply only under a condition and were not checked: ${r.conditional.map((c) => `${c.requirementId} (when ${c.appliesWhen})`).join(', ')}`);
  if (r.unchecked.length) lines.push(`\n${r.unchecked.length} rule(s) are about judgement, not measurement, and no count checks them: ${r.unchecked.map((u) => u.requirementId).join(', ')} (the taste reader reads them: verify --taste)`);
  lines.push(r.failed ? '\nA REQUIRED rule is broken.' : '\nNo REQUIRED rule is broken.');
  return lines.join('\n');
}

/** The words of a rule's measurement, for any surface that shows one. */
export const describeMeasurement = (r: Requirement): string | null =>
  (r.measurement ? observerFor(r.measurement.observer).describe(r.measurement.params) : null);
