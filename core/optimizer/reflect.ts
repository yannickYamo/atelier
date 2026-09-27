// atelier/core/optimizer/reflect.ts — PROPOSE A CHANGE BY READING THE FAILURES, NOT BY WALKING A LIST.
//
// GEPA's central move: instead of mutating blindly, a model reads the traces of what went wrong and
// proposes the change most likely to fix it. Atelier's fixed carrier ordering (SELF_CHECK → PROSE →
// EXAMPLE → OUTPUT_CONTRACT) is the blind version. This is the reflective one, bounded three ways so it
// can only ever do what the fixed ordering could:
//
//   1. It chooses among LEGAL moves only: single-gene changes from ./genome.ts, minus those repair
//      memory has already rejected on evidence as strong. Anything else it returns is discarded and
//      counted, so an invalid proposal is visible rather than silently repaired.
//   2. It sees a BOUNDED history (SkillOpt's budget on how much of the past a proposer reads): the most
//      recent failures and prior attempts, a fixed number of each. The measured result that more
//      history makes proposals worse past a point (arXiv 2608.27454) is why the budget is small.
//   3. It proposes; it never decides. Every proposal is built, fired, and judged by the floor and the
//      promotion gate like any other candidate, and it never sees the standard as something to edit.
//
// Whether reflection beats the fixed ordering is an empirical question, and the answer is recorded:
// every REPAIR_PROPOSED event names its proposer, and `atelier optimize --report` compares how often
// each one's candidates were kept.

import type { Carrier } from '../architecture/compile.js';
import type { Requirement } from '../state/canonical-state.js';
import { mutationKey, type Mutation } from './genome.js';

/** SkillOpt-style history budgets. Small on purpose. */
export const MAX_FAILURES_SHOWN = 4;
export const MAX_ATTEMPTS_SHOWN = 6;
export const MAX_PROPOSALS = 3;

export const CARRIER_MEANING: Readonly<Record<Carrier, string>> = {
  PROSE: 'stated in the instructions the model reads while writing',
  SELF_CHECK: 'a check the model runs against its finished draft before answering',
  EXAMPLE: 'shown as an instance of the rule in the author\'s own words, not as an instruction',
  OUTPUT_CONTRACT: 'a machine-checkable shape the runtime enforces',
  NONE: 'nothing reaches the model',
};

export interface Failure { readonly requirementId: string; readonly text: string; readonly why: string }
export interface Attempt { readonly requirementId: string; readonly from: Carrier; readonly to: Carrier; readonly outcome: string }

export const REFLECT_SYSTEM = `You improve how a writing skill is implemented. You never change what its rules say.

A skill's rules are fixed and belong to their owner. What you may change is HOW each rule reaches the
model that writes: its carrier. You are shown the rules that are failing, real passages where they
failed, what has already been tried, and the legal changes. Read the failures, work out why the current
carrier is not producing the behaviour, and choose the changes most likely to fix that.

Choose only from the numbered legal changes, by number. Give one sentence of reasoning for each,
grounded in the failures shown. Propose at most ${MAX_PROPOSALS}. If none is likely to help, propose none.`;

export const REFLECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    proposals: { type: 'array', items: { type: 'object',
      properties: { change: { type: 'number' }, why: { type: 'string' } }, required: ['change', 'why'], additionalProperties: false } },
  },
  required: ['proposals'], additionalProperties: false,
};

export function reflectPrompt(rules: ReadonlyMap<string, Requirement>, legal: readonly Mutation[],
  failures: readonly Failure[], attempts: readonly Attempt[]): string {
  const shownFailures = failures.slice(-MAX_FAILURES_SHOWN);
  const shownAttempts = attempts.slice(-MAX_ATTEMPTS_SHOWN);
  const ruleLines = [...new Set(legal.flatMap((m) => (m.kind === 'CARRIER' ? [m.requirementId] : [])))]
    .map((id) => `  ${id}: ${rules.get(id)?.statement ?? '(unknown)'}`).join('\n');
  const changes = legal.map((m, i) => `  ${i + 1}. ${m.kind === 'CARRIER'
    ? `${m.requirementId}: ${m.from} → ${m.to} (${CARRIER_MEANING[m.to]})`
    : m.kind === 'EXEMPLAR' ? `${m.on ? 'ship' : 'stop shipping'} the author's exemplar piece`
      : `${m.on ? 'ship' : 'stop shipping'} the write-this-not-that examples`}`).join('\n');
  return `THE RULES IN PLAY\n${ruleLines || '  (none)'}\n\n`
    + `WHERE THEY FAILED (most recent ${shownFailures.length})\n${shownFailures.map((f) => `  [${f.requirementId}] "${f.text.slice(0, 240)}" (${f.why})`).join('\n') || '  (no passages recorded)'}\n\n`
    + `ALREADY TRIED (most recent ${shownAttempts.length})\n${shownAttempts.map((a) => `  ${a.requirementId}: ${a.from} → ${a.to}: ${a.outcome}`).join('\n') || '  (nothing)'}\n\n`
    + `THE LEGAL CHANGES\n${changes}\n\nChoose by number.`;
}

export interface Reflection { readonly proposals: readonly { readonly mutation: Mutation; readonly why: string }[]; readonly invalid: number }

/** Keep only proposals that name a legal change, once each, up to the cap. */
export function parseReflection(json: unknown, legal: readonly Mutation[]): Reflection {
  const raw = (json as { proposals?: { change?: unknown; why?: unknown }[] } | null)?.proposals ?? [];
  const seen = new Set<string>();
  const proposals: { mutation: Mutation; why: string }[] = [];
  let invalid = 0;
  for (const p of raw) {
    const i = Number(p.change) - 1;
    const m = Number.isInteger(i) ? legal[i] : undefined;
    if (!m || seen.has(mutationKey(m)) || proposals.length >= MAX_PROPOSALS) { invalid += m ? 0 : 1; continue; }
    seen.add(mutationKey(m));
    proposals.push({ mutation: m, why: typeof p.why === 'string' ? p.why.slice(0, 300) : '' });
  }
  return { proposals, invalid };
}
