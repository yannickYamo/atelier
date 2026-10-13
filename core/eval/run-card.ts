// atelier/core/eval/run-card.ts — THE EVALUATION OF ONE RUN, AS A PERSON READS IT.
//
// Every output is evaluated: each of the owner's rules is checked or named as theirs to judge, the text is read
// for copying and for specifics nobody supplied, and the run records what it cost. That evaluation is the product,
// and it was shown two ways, both wrong: a panel in the engine's vocabulary (gates, applicability, instruments), and
// then one line that hid it. This is the evaluation in the owner's own words: their rules, one a line, each with
// what was found; what else every run is checked for; what was done to the draft; and what to do next.
//
// Nothing here decides anything: it renders what the run already recorded (./summary.ts, ./run-state.ts).

import type { RunState } from './run-state.js';

export interface RuleLine { readonly statement: string; readonly status: 'met' | 'broken' | 'judge' | 'not-checked'; readonly detail?: string }
export interface RunCard {
  readonly state: RunState; readonly stateLine: string;
  /** the owner's required rules, in the order they wrote them */
  readonly rules: readonly RuleLine[];
  /** habits seen in the owner's examples, shown to the writer and not required: how many the text kept */
  readonly habits: { readonly kept: number; readonly of: number } | null;
  /** what every run is checked for, beyond the owner's rules */
  readonly also: readonly RuleLine[];
  readonly costUsd: number; readonly seconds: number; readonly drafts: number;
  /** what was done to the draft, in plain words; empty when nothing was */
  readonly done: readonly string[];
  readonly invocationId: string;
}

const MARK: Record<RuleLine['status'], string> = { met: '✓', broken: '✗', judge: '?', 'not-checked': '–' };
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function ruleRow(r: RuleLine, width: number): string {
  const note = r.status === 'judge' ? 'for you to judge' : r.status === 'not-checked' ? r.detail ?? 'not checked on this run' : r.detail ?? '';
  // The rule in the owner's words comes first and whole when it fits; what was found sits on the line under it.
  const head = `    ${MARK[r.status]}  ${clip(r.statement.replace(/\s+/g, ' '), width - 8)}`;
  return note && (r.status !== 'met' || /\d/.test(note)) ? `${head}\n         ${clip(note, width - 10)}` : head;
}

/** The card, as lines. `width` is the terminal's; the work itself is printed above it by the caller. */
export function renderRunCard(c: RunCard, width = 100): string[] {
  const w = Math.max(60, Math.min(width, 120));
  const right = `$${c.costUsd.toFixed(2)} · ${Math.round(c.seconds)} s`;
  const title = `── Evaluation · ${c.state} `;
  const out = [`${title}${'─'.repeat(Math.max(2, w - title.length - right.length - 4))} ${right} ──`, `  ${c.stateLine.replace(/^[A-Z]+ · /, '')}`];
  if (c.rules.length) out.push('', '  Your rules', ...c.rules.map((r) => ruleRow(r, w)));
  if (c.habits?.of) out.push('', `  From your examples (not required): ${c.habits.kept} of ${c.habits.of} habits kept`);
  if (c.also.length) out.push('', '  Checked on every run', ...c.also.map((r) => ruleRow(r, w)));
  const drafts = c.drafts > 1 ? `${c.drafts} drafts written, the better one kept` : '';
  const done = [drafts, ...c.done].filter(Boolean);
  if (done.length) out.push('', `  What was done: ${done.join(' · ')}`);
  out.push('', `  Would you use it as it is? atelier rate ${c.invocationId} yes|no "why"   ·   not right? atelier fix "<what was wrong>"`,
    '  every check in full: add --report   ·   over all your runs: atelier lab eval');
  return out;
}
