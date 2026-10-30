// atelier/core/loop/profile.ts — THE KIND OF RUN, READ ONCE FROM WHAT THE RUN ALREADY KNOWS.
//
// Twelve passes wrap the draft on every run (cli/commands/invoke.ts, the repair chain), and each was switched on or off
// by a condition written inline at its site, over values the run had computed earlier. Those conditions, and the reasons
// they are said with, read a handful of facts about the run: whether there is a standard, whether the output is
// structured, what the request states of its own, what the skill's pieces gave (a range, a pair bank, a skeleton,
// examples), the register of the request against the pieces', and whether a context judge reads the run. This module
// names those facts once, as the run's profile, so the route (./route.ts) can be derived from them and said in words, and
// the record can say what kind of run it was.
//
// Every field here is read by a pass's condition or by the reason it is said with, or is printed with the run's stages
// beside them (`stated.parts`, `pieces.skeleton`: the facts the coverage and structure conditions were computed from).
// Nothing else is kept: the run's latitude, its work form, its method and the text it works on are recorded elsewhere and
// switch no pass.

export interface Profile {
  /** a standard to hold the work to; without one nothing is checked or repaired */
  readonly standard: boolean;
  /** the output is structured (the package carries an output contract): held by its contract, never refined as prose */
  readonly structured: boolean;
  /** what the request states of its own: a length (read by the judge, or the word pattern), a shape, and whether it asks for parts (eight words or more) */
  readonly stated: { readonly length: 'LONG' | 'SHORT' | null; readonly shape: 'SHAPE' | 'BARE' | null; readonly parts: boolean };
  /**
   * What the skill's pieces gave this run: a range read from them (the fidelity release's profile), a pair bank for the
   * voice pass (how many pairs; null where there is no bank), a skeleton read for structure, and examples served to the writer.
   */
  readonly pieces: { readonly range: boolean; readonly pairs: number | null; readonly skeleton: boolean; readonly examples: boolean };
  /** the register of the request against the pieces' (core/voice/register.ts); null where no voice policy reads it */
  readonly register: 'in' | 'out' | 'assumed-in' | null;
  /** the context judge that reads this run: one that reads the request's parts too ('covers'), one that reads only sentences, or none (offline, --claims pattern) */
  readonly judge: 'covers' | 'reads' | null;
}

/** What the profile is read from: the values the run holds by the time the chain is composed, by their shape alone. */
export interface ProfileInput {
  readonly std: object | null;
  readonly contractFile: string | null;
  readonly lengthAsked: 'LONG' | 'SHORT' | null;
  readonly shape: 'SHAPE' | 'BARE' | null;
  readonly asked: string;
  readonly fid: object | null;
  readonly bank: { readonly pairs: readonly unknown[] } | null;
  readonly authorStructure: object | null;
  readonly examples: string | undefined;
  readonly register: { readonly status: 'in' | 'out' | 'assumed-in' } | null;
  readonly judge: { readonly covers?: unknown } | undefined;
}

/** A request that can ask for more than one thing: more than a line of words. "Thanks, that solved it." is one ask. */
export const asksParts = (task: string): boolean => (task.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length >= 8;

export function profileOf(x: ProfileInput): Profile {
  return {
    standard: x.std !== null,
    structured: x.contractFile !== null,
    stated: { length: x.lengthAsked, shape: x.shape, parts: asksParts(x.asked) },
    pieces: { range: x.fid !== null, pairs: x.bank ? x.bank.pairs.length : null, skeleton: x.authorStructure !== null, examples: Boolean(x.examples) },
    register: x.register?.status ?? null,
    judge: x.judge ? (x.judge.covers !== undefined ? 'covers' : 'reads') : null,
  };
}
