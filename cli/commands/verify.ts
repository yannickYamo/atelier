// cli/commands/verify.ts — HOLD ANY TEXT TO THE STANDARD, AND SAY EXACTLY WHERE IT BREAKS.
//
//   atelier verify --skill house-style draft.md
//   cat reply.txt | atelier verify --skill support-voice --json
//
// Runs every rule that carries a measurement against the text and prints each violation with the span
// that caused it. Exits 1 when a REQUIRED rule is broken, so it can sit in a pipeline, a pre-commit
// hook or a host hook as a gate. Rules without a measurement are listed as not checked: a rule about
// when or why is a person's to judge, and this command does not pretend otherwise.

import { readFileSync, existsSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import { measure, observerFor, type ObserverResult } from '../../core/observers/registry.js';
import type { Requirement, StandardVersion } from '../../core/state/canonical-state.js';
import { DATA, die, argv, positional, skillArg } from '../runtime.js';

export interface RuleCheck {
  readonly requirementId: string;
  readonly statement: string;
  readonly materiality: string | null;
  readonly result: ObserverResult;
}

export interface VerifyReport {
  readonly skill: string;
  readonly standardVersionHash: string;
  readonly checked: readonly RuleCheck[];
  /** rules with no measurement: not checked, and named so the absence is visible */
  readonly unchecked: readonly { readonly requirementId: string; readonly statement: string }[];
  /** a REQUIRED rule was violated */
  readonly failed: boolean;
}

/** The pure core, shared with anything that holds text and a standard (the MCP surface, the loop). */
export function verifyText(skill: string, v: StandardVersion, text: string): VerifyReport {
  const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED' && r.materiality !== 'INCIDENTAL');
  const checked: RuleCheck[] = live.filter((r): r is Requirement & { measurement: NonNullable<Requirement['measurement']> } => Boolean(r.measurement))
    .map((r) => ({ requirementId: r.requirementId, statement: r.statement, materiality: r.materiality, result: measure(text, r.measurement) }));
  return {
    skill, standardVersionHash: v.standardVersionHash, checked,
    unchecked: live.filter((r) => !r.measurement).map((r) => ({ requirementId: r.requirementId, statement: r.statement })),
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
  if (!r.checked.length) lines.push('No rule in this standard carries a measurement, so nothing here can be checked mechanically.');
  if (r.unchecked.length) lines.push(`\n${r.unchecked.length} rule(s) are about judgement, not measurement, and were not checked: ${r.unchecked.map((u) => u.requirementId).join(', ')}`);
  lines.push(r.failed ? '\nA REQUIRED rule is broken.' : '\nNo REQUIRED rule is broken.');
  return lines.join('\n');
}

export async function verify(): Promise<void> {
  const name = skillArg('--skill <name> required: atelier verify --skill <name> <file>   (or pipe the text in)');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const file = positional([name]);
  let text: string;
  if (file && file !== '-') {
    if (!existsSync(file)) die(`there is no file at ${file}.`);
    text = readFileSync(file, 'utf8');
  } else {
    if (process.stdin.isTTY) die('give it a file, or pipe the text in: atelier verify --skill <name> draft.md');
    let data = '';
    for await (const chunk of process.stdin) data += (chunk as Buffer).toString();
    text = data;
  }
  const report = verifyText(name, v, text);
  console.log(argv.includes('--json') ? JSON.stringify(report, null, 1) : describeVerify(report));
  if (report.failed) process.exitCode = 1;
}

// Keep the describe used by callers that only need the words of a measurement.
export const describeMeasurement = (r: Requirement): string | null =>
  (r.measurement ? observerFor(r.measurement.observer).describe(r.measurement.params) : null);
