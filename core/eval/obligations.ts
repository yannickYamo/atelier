// core/eval/obligations.ts — ONE LINE ON EVERY RUN OF A SKILL BUILT FROM A METHOD: WHAT WAS HELD, BY KIND.
//
// Three counts that are never added together. What the work must contain, read by code on the output. What it must
// be made from, read against the material. And the judgement steps, which no code reads: said as a count of what is
// not measured, every time, so that a line of ticks is never read as the method having been followed.
import type { Requirement } from '../state/canonical-state.js';
import type { VerifyReport } from '../observers/verify.js';

export interface MethodReading {
  readonly deliverable: { readonly held: number; readonly applicable: number; readonly missing: readonly string[] };
  readonly execution: { readonly held: number; readonly applicable: number; readonly missing: readonly string[]; readonly notRead: number };
  /** steps of the method no code checks */
  readonly judgement: number;
}

/** Null for a standard that holds no requirement from a method. */
export function methodReading(requirements: readonly Requirement[], report: VerifyReport): MethodReading | null {
  const live = requirements.filter((r) => r.obligation && r.authority !== 'EXPERT_REJECTED');
  if (!live.length) return null;
  const verdict = new Map(report.checked.map((c) => [c.requirementId, c]));
  const of = (kind: 'DELIVERABLE' | 'EXECUTION'): { held: number; applicable: number; missing: string[]; notRead: number } => {
    const rs = live.filter((r) => r.obligation === kind && r.measurement && r.materiality === 'REQUIRED');
    const read = rs.map((r) => ({ r, v: verdict.get(r.requirementId)?.result.verdict ?? 'NOT_APPLICABLE' }));
    return { held: read.filter((x) => x.v === 'MET').length, applicable: read.filter((x) => x.v !== 'NOT_APPLICABLE').length,
      missing: read.filter((x) => x.v === 'VIOLATED').map((x) => x.r.requirementId), notRead: read.filter((x) => x.v === 'NOT_APPLICABLE').length };
  };
  const d = of('DELIVERABLE'); const e = of('EXECUTION');
  return { deliverable: { held: d.held, applicable: d.applicable, missing: d.missing }, execution: e, judgement: live.filter((r) => !r.measurement).length };
}

/** "Method: contains 5 of 5 · made from what was given 1 of 1 · 12 judgement step(s) not measured". */
export function methodLine(m: MethodReading): string {
  const parts = [
    m.deliverable.applicable ? `contains ${m.deliverable.held} of ${m.deliverable.applicable} thing(s) it must${m.deliverable.missing.length ? ` (missing: ${m.deliverable.missing.join(', ')})` : ''}` : '',
    m.execution.applicable ? `made from what was given ${m.execution.held} of ${m.execution.applicable}${m.execution.missing.length ? ` (not: ${m.execution.missing.join(', ')})` : ''}` : '',
    m.execution.notRead ? `${m.execution.notRead} check(s) on the material not read: none was bound` : '',
    m.judgement ? `${m.judgement} judgement step(s) not measured` : '',
  ].filter(Boolean);
  return `Method: ${parts.join(' · ')}.`;
}
