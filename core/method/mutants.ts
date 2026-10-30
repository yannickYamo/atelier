// atelier/core/method/mutants.ts — A WRITTEN CHECK EARNS ITS SAY BY CATCHING WHAT BREAKS ITS STEP, AND NOTHING ELSE.
//
// A check a model wrote (core/observers/written.ts) is a claim about the owner's standard: that this function holds a
// text to this step. Nothing in its source proves it. What proves it is the owner's own work and edits of that work:
//
//   1. it passes every finished example the owner gave (a check that fails the owner's own work reads something other
//      than their step, or the step is newer than the work, which the build already shows and asks);
//   2. it catches the MUTANTS of its step: edits of an example that break only that step, which the model writes and
//      code applies (each edit a `find` that occurs once in the example, replaced by `replace`);
//   3. it stays quiet on other steps' mutants: an edit that breaks a different step is not this step broken.
//
// The bars are stated here, before any check is read: every example passed, at least MUTANT_RECALL of its own mutants
// caught, at most MUTANT_CROSS of the others' mutants fired on. A check that meets them is recorded as qualified beside
// the standard (`StandardVersion.qualifications`, outside its hash) and may be enforced like any counted rule; one that
// does not is kept, shown with what it caught and missed, and blocks nothing. Mutation testing, borrowed; the rule that an instrument earns authority by measurement
// is the house's own.

import type { Reading } from '../inference/reading.js';
import type { Measurement, CheckQualification } from '../state/canonical-state.js';
import { measure, type CheckContext } from '../observers/registry.js';
import { quoteIsReal } from '../taste/reader.js';

/** Of a check's own mutants, the share it must catch. */
export const MUTANT_RECALL = 0.9;
/** Of other steps' mutants, the share it may fire on. */
export const MUTANT_CROSS = 0.05;
/** How many mutants are asked for per step. */
export const MUTANTS_PER_STEP = 4;

export interface MutantStep { readonly id: string; readonly text: string; readonly means: string }
export interface MutantsInput { readonly steps: readonly MutantStep[]; readonly example: string }
export interface Mutant { readonly find: string; readonly replace: string; readonly why: string }
export type MutantsOutput = Readonly<Record<string, readonly Mutant[]>>;

export const STEP_MUTANTS_SYSTEM = `You are shown one finished piece of a person's work and some steps of their method, each with what a check written for it reads. For each step, write ${MUTANTS_PER_STEP} small edits of the piece that BREAK THAT STEP AND NO OTHER: a reserve that no longer equals the invoices, a time estimate with its unit removed, a sixth item added to a list of five, a colour written as a hex value where a token was.

Each edit is a find and a replace: find is a short run of text copied exactly from the piece, occurring exactly once in it; replace is what stands in its place. Keep every edit as small as the break allows, and keep the piece otherwise as it is: an edit that also breaks another step, or that changes the piece's structure, is not wanted. why says in a few words what the edit breaks.

Where a step cannot be broken by editing this piece (nothing in it the step speaks of), give that step no edits.`;

export const STEP_MUTANTS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { mutants: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, find: { type: 'string', description: 'copied exactly from the piece; occurs once' }, replace: { type: 'string' }, why: { type: 'string' },
  }, required: ['id', 'find', 'replace', 'why'], additionalProperties: false } } },
  required: ['mutants'], additionalProperties: false,
};

/** A reader numbers the parts of one step 1a, 1-b, 1.c: each is about step 1. */
export const baseId = (id: unknown): string | null => (typeof id === 'string' ? (/^(\d+)(?:[-.]?[a-z])?$/i.exec(id.trim())?.[1] ?? null) : null);

const occurrences = (hay: string, needle: string): number => { if (!needle) return 0; let n = 0; let at = hay.indexOf(needle); while (at !== -1) { n++; at = hay.indexOf(needle, at + needle.length); } return n; };

export const STEP_MUTANTS: Reading<MutantsInput, MutantsOutput> = {
  id: 'step-mutants', version: '1',
  system: STEP_MUTANTS_SYSTEM, schema: STEP_MUTANTS_SCHEMA,
  toolName: 'emit_step_mutants', toolDescription: `For each step: up to ${MUTANTS_PER_STEP} find-and-replace edits of the piece that break that step and no other.`,
  maxTokens: 6000, estimateUsd: 0.03,
  prompt(input) {
    return `The steps and what each check reads:\n${input.steps.map((s) => `${s.id}. ${s.text}\n   (the check reads: ${s.means})`).join('\n')}\n\nThe piece:\n${input.example}`;
  },
  decide(input) { return input.steps.length && input.example.trim() ? null : {}; },
  // GROUNDED EDIT BY EDIT: a find that is not in the piece, or is in it more than once, or a replace that changes
  // nothing, is no edit. A step with no grounded edit has none.
  ground(raw, input) {
    const r = raw as { mutants?: unknown } | null;
    if (!r || !Array.isArray(r.mutants)) return null;
    const ids = new Set(input.steps.map((s) => s.id));
    const out: Record<string, Mutant[]> = {};
    for (const m of r.mutants as { id?: unknown; find?: unknown; replace?: unknown; why?: unknown }[]) {
      const id = baseId(m.id);
      if (!id || !ids.has(id) || typeof m.find !== 'string' || typeof m.replace !== 'string') continue;
      const find = m.find; const replace = m.replace;
      if (!find.trim() || find === replace || occurrences(input.example, find) !== 1 || !quoteIsReal(find, input.example)) continue;
      const list = out[id] ?? (out[id] = []);
      if (list.length >= MUTANTS_PER_STEP || list.some((x) => x.find === find)) continue;
      list.push({ find, replace, why: typeof m.why === 'string' ? m.why.slice(0, 160) : '' });
    }
    return Object.keys(out).length ? out : null;
  },
  floor() { return {}; },
};

/** The piece with one mutant applied. */
export const mutate = (example: string, m: Mutant): string => example.replace(m.find, m.replace);

export type Qualification = CheckQualification;

/**
 * Hold one written check to the three bars. `examples` are the owner's finished pieces with the context each was made
 * in; `own` are the mutants written for this step, each applied to its example; `others` are every other step's.
 */
export function qualifyCheck(check: Measurement, examples: readonly { text: string; context?: CheckContext }[],
  own: readonly { text: string; context?: CheckContext }[], others: readonly { text: string; context?: CheckContext }[]): Qualification {
  const verdict = (x: { text: string; context?: CheckContext }): 'MET' | 'VIOLATED' | 'NOT_APPLICABLE' => measure(x.text, check, x.context).verdict;
  const onExamples = examples.map(verdict);
  const read = onExamples.filter((v) => v !== 'NOT_APPLICABLE').length;
  const passed = onExamples.filter((v) => v === 'MET').length;
  const caught = own.filter((x) => verdict(x) === 'VIOLATED').length;
  const fired = others.filter((x) => verdict(x) === 'VIOLATED').length;
  return barred({ examples: { passed, read, of: examples.length }, own: { caught, of: own.length }, cross: { fired, of: others.length } });
}

/**
 * THE THREE BARS, ON COUNTS: every example it reads passed, at least MUTANT_RECALL of its own breaks caught, at most
 * MUTANT_CROSS of the others' fired on. Shared by the build (`qualifyCheck`) and by the owner's rulings folded in later
 * (core/method/requalify.ts), so a check is held to one bar however its cases came.
 */
export function barred(c: Pick<Qualification, 'examples' | 'own' | 'cross'>): Qualification {
  const { passed, read } = c.examples; const { caught, of: ownOf } = c.own; const { fired, of: othersOf } = c.cross;
  const whyNot = read === 0 ? 'it read none of your examples'
    : passed < read ? `it fails ${read - passed} of the ${read} examples it can read`
      : ownOf === 0 ? 'no edit of your examples that breaks only this step could be written'
        : caught < Math.ceil(ownOf * MUTANT_RECALL) ? `it caught ${caught} of ${ownOf} edits that break the step (needs ${Math.ceil(ownOf * MUTANT_RECALL)})`
          : fired > Math.floor(othersOf * MUTANT_CROSS) ? `it fired on ${fired} of ${othersOf} edits that break other steps`
            : null;
  return { examples: c.examples, own: c.own, cross: c.cross, qualified: whyNot === null, why: whyNot };
}

/** One line for the build screen. */
export function describeQualification(q: Qualification): string {
  const head = q.qualified ? 'qualified' : 'not qualified, reports only';
  return `${head}: passes ${q.examples.passed} of ${q.examples.read} example(s) it reads, catches ${q.own.caught} of ${q.own.of} edit(s) that break the step, fires on ${q.cross.fired} of ${q.cross.of} that break others${q.why ? ` (${q.why})` : ''}`;
}
