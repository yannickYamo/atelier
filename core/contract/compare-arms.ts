// atelier/core/contract/compare-arms.ts — THREE ARMS, THREE DENOMINATORS, AND NO NUMBER ACROSS THEM.
//
// A three-arm table is the most useful thing this system can show a person: it separates what the
// STANDARD contributed from what OPTIMIZATION contributed, and it can say the thing an artifact
// vendor never says — that the runtime already did this and no skill was needed.
//
//     compile gain     = INITIAL  - BARE
//     optimization gain= CANDIDATE - INITIAL
//
// ─── AND IT IS THE PLACE A COMBINED RATE WOULD GET INVENTED ────────────────────────────────────
//
// Three rows of a contract run have three different epistemic standings:
//
//   decided                a qualified observer ruled. A verdict.
//   read by an unqualified reader   evidence for diagnosis. Not a verdict.
//   nothing looked         absence of observation. Not a result of any kind.
//
// "6 of 9 appear to pass" adds a verdict to a suggestion, divides by a denominator that includes
// cases nobody examined, and produces a percentage that reads like adherence. It would undo the
// distinction the run exists to preserve, and it is exactly the shape a person will ask for.
//
// So there is no function here that returns one. `ArmTally` has three separate denominators and no
// total; the renderer prints rows and never a summary line; and a test fails on any field whose name
// could hold a rate.

import type { ContractArm } from './arm.js';
import type { ContractResult } from './suite.js';

/** One arm's standing, per channel. No total, and adding these is the mistake. */
export interface ArmTally {
  readonly arm: ContractArm;
  /** ruled on by a qualified observer */
  readonly decidedPass: number;
  readonly decidedFail: number;
  /** an unqualified reader's view. Diagnostic evidence. */
  readonly apparentPass: number;
  readonly apparentFail: number;
  /** nobody looked */
  readonly notObserved: number;
}

export const tallyOf = (arm: ContractArm, r: ContractResult): ArmTally => ({
  arm,
  decidedPass: r.passed.length,
  decidedFail: r.failed.length,
  apparentPass: r.apparentPass.length,
  apparentFail: r.apparentFail.length,
  notObserved: r.unobservable.length,
});

/**
 * A change between two arms, reported per channel and never rolled up.
 *
 * `null` where an arm has no cases in that channel: a movement from nothing to nothing is not an
 * improvement, and rendering it as 0 invites reading a flat line as a measured result.
 */
export interface ChannelDelta {
  readonly decided: number | null;
  readonly apparent: number | null;
}

export const deltaBetween = (from: ArmTally, to: ArmTally): ChannelDelta => ({
  decided: (from.decidedPass + from.decidedFail) === 0 && (to.decidedPass + to.decidedFail) === 0
    ? null : to.decidedPass - from.decidedPass,
  apparent: (from.apparentPass + from.apparentFail) === 0 && (to.apparentPass + to.apparentFail) === 0
    ? null : to.apparentPass - from.apparentPass,
});

/**
 * The table a person reads.
 *
 * Rows are channels, columns are arms, and there is deliberately no final row. The absent total is
 * the design: any single number here would span a verdict, a suggestion and an absence.
 */
export function describeArmComparison(tallies: readonly ArmTally[]): string {
  if (!tallies.length) return 'no arms were run.';
  const name = (t: ArmTally): string => t.arm.padEnd(10);
  const head = `${''.padEnd(34)}${tallies.map(name).join('')}`;
  const row = (label: string, f: (t: ArmTally) => number): string =>
    `${label.padEnd(34)}${tallies.map((t) => String(f(t)).padEnd(10)).join('')}`;

  const lines = [
    head,
    '-'.repeat(34 + tallies.length * 10),
    row('decided — passed', (t) => t.decidedPass),
    row('decided — failed', (t) => t.decidedFail),
    row('unqualified read — appears ok', (t) => t.apparentPass),
    row('unqualified read — appears wrong', (t) => t.apparentFail),
    row('nothing looked', (t) => t.notObserved),
  ];

  const bare = tallies.find((t) => t.arm === 'BARE');
  const initial = tallies.find((t) => t.arm === 'INITIAL');
  const candidate = tallies.find((t) => t.arm === 'CANDIDATE');

  const say = (label: string, d: ChannelDelta): string =>
    `  ${label}: decided ${d.decided === null ? 'n/a' : signed(d.decided)}`
    + `, unqualified read ${d.apparent === null ? 'n/a' : signed(d.apparent)}`;

  if (bare && initial) lines.push('', say('what the standard added (initial - bare)', deltaBetween(bare, initial)));
  if (initial && candidate) lines.push(say('what optimization added (candidate - initial)', deltaBetween(initial, candidate)));

  lines.push('',
    'Only the "decided" rows are verdicts. The unqualified rows are what an unqualified reader saw:',
    'they guide diagnosis and certify nothing. "Nothing looked" is an absence of observation, not a',
    'result. There is no combined figure across these rows, and any percentage spanning them would',
    'be adding a verdict to a suggestion and dividing by cases nobody examined.',
    '',
    'All of it is constructed challenges derived from the standard, not samples of real work.');

  if (bare && initial
    && bare.apparentPass >= initial.apparentPass && bare.decidedPass >= initial.decidedPass) {
    lines.push('',
      'BARE did at least as well as the compiled skill on every channel that was observed. On these',
      'constructed cases this runtime already satisfies the standard, and a skill may not be what this',
      'needs. That is a legitimate answer and worth more than an artifact nobody required.');
  }

  return lines.join('\n');
}

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
