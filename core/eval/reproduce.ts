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

import { headingsOf, sectionHeadsOf, type Heading } from '../observers/structure.js';

export interface CaseOutcome {
  readonly id: string;
  /** `ran`: the case was run and has a verdict (a refusal under strict delivery is one). `not-run`: it could not be run, for the reason in `why` */
  readonly state: 'ran' | 'not-run';
  readonly why?: string;
  /** the run's own verdict; false also when the output carried the reference's wording. null when it did not run */
  readonly conformant: boolean | null;
  /** strict delivery refused to deliver: counted as not reproduced */
  readonly refused?: boolean;
  readonly required: { readonly held: number; readonly applicable: number; /** the rules this run broke, by id */ readonly broken?: readonly string[] } | null;
  /** the run that produced this case's output, and the output by hash: a count that can be walked back to its bytes */
  readonly invocationId?: string | null; readonly outputHash?: string;
  /** the longest run of words the output shares with a piece the skill carries (the run's own copying check) */
  readonly sharedWithCarriedPieces?: number | null;
  /** of the rules this run broke, the ones the expert's own held-back piece breaks too: the standard asks more than their work does */
  readonly alsoBrokenByReference?: readonly string[];
  /** `qualified`: a qualified reader decided what is unsupported; otherwise the pattern check did, and the count says so */
  readonly claims: { readonly qualified: boolean; readonly instrument: string | null; readonly unsupported: number } | null;
  /** the longest run of words the output shares with the held-back piece and not with its material */
  readonly sharedWithReference?: number;
  /** the expert's own reference, on the counted required rules that apply to every piece */
  readonly reference: { readonly met: number; readonly applicable: number; readonly broken?: readonly string[] };
  readonly words: { readonly output: number | null; readonly reference: number };
  /** the sections of the held-back piece, read on the output in code: how many it has, with something in each, and which it lacks */
  readonly shape?: Shape;
  readonly costUsd: number;
}

export interface Shape { readonly sections: { readonly of: number; readonly held: number; readonly missing: readonly string[] } }

/** A section's name as two writers would both write it: no case, no numbering, "&" as "and", no punctuation. */
const nameOf = (h: string): string => h.toLowerCase().normalize('NFKC').replace(/^\s*\d+(?:\.\d+)*[.)]?\s+/, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * THE SHAPE OF THE WORK HELD BACK, READ ON THE OUTPUT. The held-back piece is the expert's answer to the same task
 * from the same material. It is never served; read here, in code, beside the output, it says what a reproduction
 * has: the piece's top sections, each with something in it. Named as two writers would both write them, and found
 * in the output however it marks its sections, headings or labels.
 */
export function shapeAgainst(output: string, reference: string): Shape {
  const words = (t: string): number => (t.replace(/^\s*#{1,6}\s.*$/gm, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const bodies = (text: string, heads: readonly Heading[]): { name: string; said: number; body: string }[] => heads.map((h, i) => {
    const next = heads.slice(i + 1).find((x) => x.level <= h.level);
    const body = text.slice(h.end, next ? next.start : text.length);
    return { name: h.text, said: words(body), body };
  });
  // A section that holds only a promise of itself holds nothing.
  const PLACEHOLDER = /^[\W_]*(?:tbd|tbc|todo|tk|n\/?a|to be (?:done|written|added|confirmed|decided)|coming soon|placeholder|lorem ipsum)[\W_]*$/i;
  const headings = headingsOf(reference);
  const top = headings.length ? Math.min(...headings.map((h) => h.level)) : 0;
  // The piece's own headings at its top level. With none, its labels, where three or more each say something: an
  // email is not a set of sections because some of its lines hold a colon.
  const labelled = headings.length ? [] : bodies(reference, sectionHeadsOf(reference, true)).filter((x) => x.said >= 5);
  const mine = headings.length ? bodies(reference, headings).filter((_, i) => headings[i].level === top) : labelled.length >= 3 ? labelled : [];
  const wanted = mine.filter((x, i, all) => nameOf(x.name).length >= 3 && all.findIndex((o) => nameOf(o.name) === nameOf(x.name)) === i);
  const found = bodies(output, sectionHeadsOf(output, true));
  // Named by its words, in order: "The plan" is "Plan", and "Explanation" is not. And it says something: "TBD" under
  // a heading is not the section.
  const holds = (want: { name: string }): boolean => found.some((f) => {
    const a = ` ${nameOf(f.name)} `; const b = ` ${nameOf(want.name)} `;
    return (a.includes(b) || (a.trim().includes(' ') && b.includes(a))) && f.said >= 1 && !PLACEHOLDER.test(f.body.trim());
  });
  const missing = wanted.filter((x) => !holds(x)).map((x) => x.name);
  return { sections: { of: wanted.length, held: wanted.length - missing.length, missing } };
}

/**
 * Whether an output has the shape of the piece held back: two thirds of its sections or more, where it has two or
 * more. One heading is not a shape, and a heading that says what this one piece concluded need not be said the same
 * way twice.
 */
export const hasShape = (shape: Shape): boolean => shape.sections.of < 2 || shape.sections.held >= Math.ceil((shape.sections.of * 2) / 3);

export interface ReproductionRecord {
  readonly schema: 1;
  /** what was run against what, by identity; absent on a record written before these were kept */
  readonly runId?: string; readonly corpusHash?: string | null; readonly reservationHash?: string;
  /** the owner amended the standard after the run that held these pieces back closed it */
  readonly standardAmendedSinceRun?: boolean;
  /** runs of these cases on each skill version, this one included */
  readonly runsByVersion?: Readonly<Record<string, number>>;
  /** `bare`: a one-shot floor. The same cases, one plain call each, read with `atelier verify`: not the skill's runtime with the skill taken away. Absent for the skill's own run */
  readonly arm?: 'bare';
  readonly skill: string; readonly skillVersion: string; readonly standardVersion: string; readonly at: string;
  /** what was held back, by what it carries: only the first kind can be run */
  readonly heldBack: { readonly full: number; readonly taskOnly: number; readonly referenceOnly: number };
  readonly cases: readonly CaseOutcome[];
  /** required rules no code checks: outside every count here, and said */
  readonly notCheckable: number;
  /** FIRST: the first run of these cases, the only one that is a test. A repeat on the same version, or after the skill changed, is development */
  readonly look?: 'FIRST' | 'REPEAT_SAME_VERSION' | 'REPEAT_AFTER_CHANGE';
  /** where this run is kept, and where the first run of these cases is: neither is ever written over */
  readonly file?: string; readonly firstLook?: string;
  /** how many times these held-back cases have been run on this skill, this time included */
  readonly timesRun: number;
  readonly costUsd: number;
}

const ran = (r: ReproductionRecord): CaseOutcome[] => r.cases.filter((c) => c.state === 'ran');

/** The counts the record is read by. Nothing here is a rate, and nothing is added across kinds. */
export function countsOf(r: ReproductionRecord): {
  readonly ran: number; readonly reproduced: number; readonly refused: number;
  /** ran, and no required rule was checked by code on them: read as neither reproduced nor not */
  readonly notObserved: number;
  /** cases with no unsupported specific, by a qualified reader on every case; null when any case was read by patterns alone */
  readonly factSafe: number | null;
  readonly required: { readonly held: number; readonly applicable: number };
  readonly reference: { readonly met: number; readonly applicable: number; readonly whole: number };
  /** sections of the held-back pieces that the outputs have, over the cases whose shape was read; null when none was */
  readonly shape: { readonly held: number; readonly of: number } | null;
} {
  const done = ran(r);
  const qualified = done.length > 0 && done.every((c) => (c.refused === true ? true : c.claims?.qualified === true));
  return {
    ran: done.length,
    reproduced: done.filter((c) => c.conformant === true).length,
    notObserved: done.filter((c) => c.conformant === null).length,
    refused: done.filter((c) => c.refused).length,
    factSafe: qualified ? done.filter((c) => !c.refused && c.claims?.unsupported === 0).length : null,
    required: { held: done.reduce((n, c) => n + (c.required?.held ?? 0), 0), applicable: done.reduce((n, c) => n + (c.required?.applicable ?? 0), 0) },
    shape: done.some((c) => c.shape) ? { held: done.reduce((n, c) => n + (c.shape?.sections.held ?? 0), 0), of: done.reduce((n, c) => n + (c.shape?.sections.of ?? 0), 0) } : null,
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
  out.push(r.arm === 'bare' ? `ONE-SHOT FLOOR: THE SAME HELD-BACK CASES, ONE PLAIN CALL EACH · read against ${r.skill} · ${s(c.ran, 'case')}` : `REPRODUCTION ON WORK THE SKILL NEVER SAW · ${r.skill} · ${s(c.ran, 'case')}`);
  out.push(`  ${c.reproduced} of ${c.ran}   reproduced: ${r.arm === 'bare' ? 'no required counted rule broken and nothing flagged as unsourced, by atelier verify' : `the run's own verdict was "conformant"`}${c.shape?.of ? ', and the output has two thirds or more of the sections of the piece held back' : ''}${c.refused ? ` (${c.refused} refused under strict delivery, counted as not reproduced)` : ''}`);
  out.push(c.factSafe === null
    ? '  not read   unsupported specifics: no qualified reader read every case, so the pattern check decided, and it misses what a reader finds'
    : `  ${c.factSafe} of ${c.ran}   with no unsupported specific, read by a qualified reader`);
  if (c.shape?.of) out.push(`  ${c.shape.held} of ${c.shape.of}   sections of your held-back pieces are in the outputs, each with something in it`);
  if (c.notObserved) out.push(`  ${c.notObserved} of ${c.ran}   not observed: no required rule is checked by code on ${c.notObserved === 1 ? 'it' : 'them'}, so ${c.notObserved === 1 ? 'it is' : 'they are'} read as neither`);
  if (c.required.applicable) out.push(`  ${c.required.held} of ${c.required.applicable}   required rules met, over the ${s(c.ran, 'case')}`);
  if (c.reference.applicable) {
    out.push(`  ${c.reference.met} of ${c.reference.applicable}   on your own held-back work, for the counted required rules that apply to every piece; ${c.reference.whole} of ${c.ran} of your ${c.ran === 1 ? 'pieces meets' : 'pieces meet'} every one`);
    if (c.reference.whole < c.ran) out.push('  Where your own piece breaks such a rule, the rule asks for more than your work does: atelier build names the ruling.');
  }
  if (r.notCheckable) out.push(`  ${s(r.notCheckable, 'required rule')} cannot be checked by code, and ${r.notCheckable === 1 ? 'is' : 'are'} in none of these counts`);
  for (const x of not) out.push(`  not run: ${x.id}: ${x.why ?? 'no reason recorded'}`);
  const rest = r.heldBack.taskOnly + r.heldBack.referenceOnly;
  if (rest) out.push(`  ${s(rest, 'more held-back piece')} ${rest === 1 ? 'does' : 'do'} not carry both task and material, and cannot be run.`);
  out.push(`  ${s(c.ran, 'case')}: a count, not a rate.${c.ran < 10 ? ' Hold back more examples that carry their task and material to read more from it.' : ''}`);
  if (r.arm === 'bare') out.push('  A floor, not an ablation: the skill\'s run drafts more than once, chooses, repairs and has its claims read. The gap to it is the runtime and the skill together.');
  if (r.standardAmendedSinceRun) out.push('  The standard was amended after these pieces were held back: they were not read to amend it only if you did not read them.');
  const both = ran(r).filter((x) => x.alsoBrokenByReference?.length);
  if (both.length) out.push(`  In ${s(both.length, 'case')} a rule the output broke is one your own held-back piece breaks too (${[...new Set(both.flatMap((x) => x.alsoBrokenByReference ?? []))].join(', ')}): there the standard asks more than your work does, and the skill is not what failed.`);
  if (r.look && r.look !== 'FIRST') out.push(`  This is a repeat${r.look === 'REPEAT_AFTER_CHANGE' ? ' after the skill changed' : ' on the same version'}, not the first look at these cases${r.firstLook ? `: the first is kept at ${r.firstLook}` : ''}.`);
  if (r.timesRun > 1) out.push(`  These cases have now been run ${r.timesRun} times on this skill. A piece held back is unseen once: if the skill was changed between runs because of what they showed, read this as work in progress, not as a test.`);
  for (const x of ran(r)) {
    const req = x.required ? `${x.required.held}/${x.required.applicable} rules` : 'rules not read';
    const cl = x.refused ? 'refused, nothing delivered' : x.claims ? `${x.claims.unsupported} unsupported${x.claims.qualified ? '' : ' (patterns only)'}` : '';
    const carried = x.sharedWithReference !== undefined && x.conformant === false && !x.refused && x.why ? ` · ${x.why}` : '';
    out.push(`    ${x.conformant === null ? 'not observed  ' : x.conformant ? 'reproduced    ' : 'not reproduced'}  ${x.id}  ·  ${req}${cl ? ` · ${cl}` : ''} · ${x.words.output ?? 0} words (yours: ${x.words.reference}) · your piece: ${x.reference.met}/${x.reference.applicable}${carried}`);
  }
  return out.join('\n');
}
