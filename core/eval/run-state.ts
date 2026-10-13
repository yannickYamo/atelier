// atelier/core/eval/run-state.ts — WHAT A PERSON IS TOLD ABOUT A RUN, IN ONE WORD AND ONE LINE.
//
// A run carries a long report: every rule, every reading, what was cut, what it cost. The person who asked for a
// piece of work needs one thing from it: can I use this? Three answers, and they are not interchangeable:
//
//   BLOCKED     a required rule that can be checked was checked, and failed. Shown, and not deliverable.
//   CHECKED     everything that can be checked passed. Some of what the owner requires cannot be checked by a
//               machine (a judgement step, a specific nobody can trace), and that part is named as theirs to judge.
//   CERTIFIED   every required rule was checked and held, and nothing was left for anyone to judge.
//
// CHECKED is not a softer CERTIFIED and is never rounded up to it: what the owner requires stays required whether
// or not a check exists for it. For work with judgement in it, CHECKED is the best a machine can honestly say.

export type RunState = 'BLOCKED' | 'CHECKED' | 'CERTIFIED';

export interface RunFacts {
  /** required rules a check read on this output, and how many of them held */
  readonly applicable: number; readonly held: number;
  /** the required rules that failed their check: what each is, in the owner's words, and what the check found */
  readonly broken: readonly { readonly id: string; readonly label?: string; readonly detail: string }[];
  /** required rules no machine checks: the owner's judgement steps */
  readonly judgement: number;
  /** specifics in the output that could not be traced to what was supplied, listed for the person */
  readonly toCheck: number;
}

const s = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The state of a run, and the line that says it. */
export function runState(f: RunFacts): { readonly state: RunState; readonly line: string } {
  if (f.broken.length) {
    const first = f.broken[0];
    const what = first.label ? `"${first.label.length > 60 ? `${first.label.slice(0, 57)}...` : first.label}"` : first.id === 'verdict' ? '' : first.id;
    const more = f.broken.length > 1 ? `, and ${f.broken.length - 1} more` : '';
    if (!what) return { state: 'BLOCKED', line: `BLOCKED · ${first.detail}${more}` };
    return { state: 'BLOCKED', line: `BLOCKED · ${s(f.broken.length, 'required rule')} not met: ${what} (${first.detail})${more}` };
  }
  // No count of what was met: a run checks the owner's rules and a few of its own, and a number that differs from
  // the one the build gave reads as a discrepancy where there is none.
  const held = f.applicable ? 'every rule that can be checked was met' : 'no rule could be checked on this output';
  const left = [f.judgement ? `${s(f.judgement, 'rule')} for you to judge` : '', f.toCheck ? `${s(f.toCheck, 'specific')} to check` : ''].filter(Boolean);
  if (!left.length && f.applicable) return { state: 'CERTIFIED', line: 'CERTIFIED · every rule you require was checked and met' };
  return { state: 'CHECKED', line: `CHECKED · ${held}${left.length ? ` · ${left.join(' · ')}` : ''}` };
}
