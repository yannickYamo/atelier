// core/eval/reproduce.ts — DOES THE SKILL REPRODUCE WORK IT NEVER SAW? ONE ANSWER PER HELD-BACK CASE.
//
// A skill leaves its build with rules it holds. Whether it does the work is a different question, and the only
// honest test of it is on examples that were held back before anything read them, given what the expert was given
// (the task and the material, core/golden/case.ts) and never what the expert wrote.
//
// THE NUMBER IS A COUNT OF CASES, AND IT IS BINARY PER CASE. A case is reproduced when the run's own verdict found
// it conformant: every required rule checked on it held, and nothing unsupported was delivered. Rules met are not
// added to facts supported: a total can be high over a required rule that failed, which is why no panel in this
// product has one. What sits under the count explains it, and never replaces it.
//
// THREE THINGS ARE SAID BESIDE IT, ALWAYS. How the expert's own held-back work fares on the counted rules that
// apply to every piece: a rule the expert's own piece breaks is a finding about the standard, not about the skill.
// How many cases there are: three of four is a count, and no rate is read from it. And how many times these cases
// have been run: a piece held back is unseen once, and a reserve run again after each change to the skill is being
// worked toward.

export interface CaseOutcome {
  readonly id: string;
  /** `ran`: the case was run and has a verdict (a refusal under strict delivery is one). `not-run`: it could not be run, for the reason in `why` */
  readonly state: 'ran' | 'not-run';
  readonly why?: string;
  /** the run's own verdict; false also when the output carried the reference's wording. null when it did not run */
  readonly conformant: boolean | null;
  /** strict delivery refused to deliver: counted as not reproduced */
  readonly refused?: boolean;
  readonly required: { readonly held: number; readonly applicable: number } | null;
  /** `qualified`: a qualified reader decided what is unsupported; otherwise the pattern check did, and the count says so */
  readonly claims: { readonly qualified: boolean; readonly instrument: string | null; readonly unsupported: number } | null;
  /** the longest run of words the output shares with the held-back piece and not with its material */
  readonly sharedWithReference?: number;
  /** the expert's own reference, on the counted required rules that apply to every piece */
  readonly reference: { readonly met: number; readonly applicable: number };
  readonly words: { readonly output: number | null; readonly reference: number };
  readonly costUsd: number;
}

export interface ReproductionRecord {
  readonly schema: 1;
  readonly skill: string; readonly skillVersion: string; readonly standardVersion: string; readonly at: string;
  /** what was held back, by what it carries: only the first kind can be run */
  readonly heldBack: { readonly full: number; readonly taskOnly: number; readonly referenceOnly: number };
  readonly cases: readonly CaseOutcome[];
  /** required rules no code checks: outside every count here, and said */
  readonly notCheckable: number;
  /** how many times these held-back cases have been run on this skill, this time included */
  readonly timesRun: number;
  readonly costUsd: number;
}

const ran = (r: ReproductionRecord): CaseOutcome[] => r.cases.filter((c) => c.state === 'ran');

/** The counts the record is read by. Nothing here is a rate, and nothing is added across kinds. */
export function countsOf(r: ReproductionRecord): {
  readonly ran: number; readonly reproduced: number; readonly refused: number;
  /** cases with no unsupported specific, by a qualified reader on every case; null when any case was read by patterns alone */
  readonly factSafe: number | null;
  readonly required: { readonly held: number; readonly applicable: number };
  readonly reference: { readonly met: number; readonly applicable: number; readonly whole: number };
} {
  const done = ran(r);
  const qualified = done.length > 0 && done.every((c) => (c.refused === true ? true : c.claims?.qualified === true));
  return {
    ran: done.length,
    reproduced: done.filter((c) => c.conformant === true).length,
    refused: done.filter((c) => c.refused).length,
    factSafe: qualified ? done.filter((c) => !c.refused && c.claims?.unsupported === 0).length : null,
    required: { held: done.reduce((n, c) => n + (c.required?.held ?? 0), 0), applicable: done.reduce((n, c) => n + (c.required?.applicable ?? 0), 0) },
    reference: { met: done.reduce((n, c) => n + c.reference.met, 0), applicable: done.reduce((n, c) => n + c.reference.applicable, 0), whole: done.filter((c) => c.reference.met === c.reference.applicable).length },
  };
}

const s = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The record as a person reads it. No label, no total, and the number of cases beside every count. */
export function renderReproduction(r: ReproductionRecord): string {
  const out: string[] = [];
  const held = r.heldBack.full + r.heldBack.taskOnly + r.heldBack.referenceOnly;
  if (!r.heldBack.full) {
    out.push(`REPRODUCTION · ${r.skill}: not tested.`);
    out.push(held
      ? `  ${s(held, 'piece')} held back, and none carries both its task and the material it was made from. A candidate can only be given what you were given when both are there.`
      : '  No piece was held back when this skill was built.');
    out.push('  Add the task (`request:` in the front matter) and the material (a folder `<example>.material` beside it) to some examples, and build again.');
    return out.join('\n');
  }
  const c = countsOf(r);
  const not = r.cases.filter((x) => x.state !== 'ran');
  if (!c.ran) {
    out.push(`REPRODUCTION · ${r.skill}: no case could be run.`);
    for (const x of not) out.push(`  not run: ${x.id}: ${x.why ?? 'no reason recorded'}`);
    return out.join('\n');
  }
  out.push(`REPRODUCTION ON WORK THE SKILL NEVER SAW · ${r.skill} · ${s(c.ran, 'case')}`);
  out.push(`  ${c.reproduced} of ${c.ran}   reproduced: the run's own verdict was "conformant"${c.refused ? ` (${c.refused} refused under strict delivery, counted as not reproduced)` : ''}`);
  out.push(c.factSafe === null
    ? '  not read   unsupported specifics: no qualified reader read every case, so the pattern check decided, and it misses what a reader finds'
    : `  ${c.factSafe} of ${c.ran}   with no unsupported specific, read by a qualified reader`);
  out.push(c.required.applicable
    ? `  ${c.required.held} of ${c.required.applicable}   required rules met, over the ${s(c.ran, 'case')}`
    : '  No required rule is checked by code on these cases: "reproduced" says only that nothing unsupported was found.');
  if (c.reference.applicable) {
    out.push(`  ${c.reference.met} of ${c.reference.applicable}   on your own held-back work, for the counted required rules that apply to every piece; ${c.reference.whole} of ${c.ran} of your ${c.ran === 1 ? 'pieces meets' : 'pieces meet'} every one`);
    if (c.reference.whole < c.ran) out.push('  Where your own piece breaks such a rule, the rule asks for more than your work does: atelier build names the ruling.');
  }
  if (r.notCheckable) out.push(`  ${s(r.notCheckable, 'required rule')} cannot be checked by code, and ${r.notCheckable === 1 ? 'is' : 'are'} in none of these counts`);
  for (const x of not) out.push(`  not run: ${x.id}: ${x.why ?? 'no reason recorded'}`);
  const rest = r.heldBack.taskOnly + r.heldBack.referenceOnly;
  if (rest) out.push(`  ${s(rest, 'more held-back piece')} ${rest === 1 ? 'does' : 'do'} not carry both task and material, and cannot be run.`);
  out.push(`  ${s(c.ran, 'case')}: a count, not a rate.${c.ran < 10 ? ' Hold back more examples that carry their task and material to read more from it.' : ''}`);
  if (r.timesRun > 1) out.push(`  These cases have now been run ${r.timesRun} times on this skill. A piece held back is unseen once: if the skill was changed between runs because of what they showed, read this as work in progress, not as a test.`);
  for (const x of ran(r)) {
    const req = x.required ? `${x.required.held}/${x.required.applicable} rules` : 'rules not read';
    const cl = x.refused ? 'refused, nothing delivered' : x.claims ? `${x.claims.unsupported} unsupported${x.claims.qualified ? '' : ' (patterns only)'}` : '';
    const carried = x.sharedWithReference !== undefined && x.conformant === false && !x.refused && x.why ? ` · ${x.why}` : '';
    out.push(`    ${x.conformant ? 'reproduced    ' : 'not reproduced'}  ${x.id}  ·  ${req}${cl ? ` · ${cl}` : ''} · ${x.words.output ?? 0} words (yours: ${x.words.reference}) · your piece: ${x.reference.met}/${x.reference.applicable}${carried}`);
  }
  return out.join('\n');
}
