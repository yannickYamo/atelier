// atelier/core/reference/arms.ts — WHAT THE COMPILED SKILL IS BEING COMPARED AGAINST.
//
// A comparison against a bare model measures whether instructions do anything, which nobody doubts.
// The comparison that decides whether this system is worth building is against the cheapest thing a
// competent person would try instead: paste the work into the prompt and ask for more of it.
//
// THE ARMS ARE AN ENUM AND NOT A PARAMETER, and that is the whole design of this file. An omitted arm
// is invisible in a result — nothing in the output says "the baseline was not run" — and the arm most
// likely to be omitted is the one most likely to win. A flag that defaults to the flattering subset
// produces an honest-looking number that answers a question nobody asked. So the set is fixed here,
// the run seals which arms it contained, and scoring refuses labels from a different set.
//
// The second rule is REFUSE RATHER THAN SUBSTITUTE. Two arms need an input this system cannot invent:
// a guide written by reading the corpus, and the expert's own one-page attempt at their rules. Filling
// either with a plausible stand-in would produce a comparison whose losing side was authored by the
// thing being measured. Absent input is a refusal, never a default.

import { createHash } from 'node:crypto';

export type ArmId =
  /** task only, no standard and no examples. The floor. It is here to calibrate the others. */
  | 'B0_BARE'
  /** the same corpus discovery read, pasted into the prompt. THE ONE THAT DECIDES THE PRODUCT. */
  | 'B1_CORPUS_IN_PROMPT'
  /** a model reads the corpus and writes its own guide; that guide is the prompt. Isolates
   *  ratification and compilation from "a capable model read the work". */
  | 'B2_MODEL_STYLE_GUIDE'
  /** the ratified standard as flat prose: no carrier selection, no anchored examples, no output
   *  contract. Isolates the compiler from the standard it compiled. */
  | 'B3_STANDARD_AS_PROSE'
  /** what the expert writes in half an hour when asked for their own rules. The commercial
   *  competitor, and the arm this system has the least right to assume it beats. */
  | 'B4_EXPERT_ONE_PAGER'
  /** Atelier as it ships: the compiled package, served as bytes. */
  | 'T_ATELIER';

export const ALL_ARMS: readonly ArmId[] = [
  'B0_BARE', 'B1_CORPUS_IN_PROMPT', 'B2_MODEL_STYLE_GUIDE',
  'B3_STANDARD_AS_PROSE', 'B4_EXPERT_ONE_PAGER', 'T_ATELIER',
];

/** The treatment. Named once so no comparison has to restate which side is ours. */
export const TREATMENT: ArmId = 'T_ATELIER';

/** Arms whose input only a person can supply. Absent input refuses the run. */
export const NEEDS_HUMAN_INPUT: readonly ArmId[] = ['B4_EXPERT_ONE_PAGER'];

export interface ArmInputs {
  /** the compiled package's served bytes, exactly as `invoke` would send them */
  readonly compiledSkillText: string;
  /** the corpus discovery read, concatenated. Not the reserve. */
  readonly corpusText: string;
  /** the ratified requirements as flat prose, one per line, no carriers */
  readonly standardAsProse: string;
  /** written by a model that read the corpus, supplied by the caller so the call is visible in the
   *  budget rather than hidden inside a pure function */
  readonly modelStyleGuide: string | null;
  /** the expert's own one-pager. Only a person can write this one. */
  readonly expertOnePager: string | null;
}

export class MissingArmInput extends Error {}

/**
 * What gets served for one arm. Pure: every input arrives already fetched, so this function can be
 * tested without a model and cannot quietly acquire a second generation path.
 *
 * Throws rather than returning a fallback. A comparison missing an arm should fail loudly at
 * preparation, when it costs nothing, instead of producing a result whose shape hides the gap.
 */
export function servedTextFor(arm: ArmId, i: ArmInputs): string {
  switch (arm) {
    case 'B0_BARE':
      return '';
    case 'B1_CORPUS_IN_PROMPT':
      return 'Here is a body of work by one author. Write the requested piece the way this author '
        + `would have written it.\n\n${i.corpusText}`;
    case 'B2_MODEL_STYLE_GUIDE':
      if (i.modelStyleGuide === null) {
        throw new MissingArmInput('B2_MODEL_STYLE_GUIDE needs a guide written by reading the corpus. '
          + 'It was not supplied, and inventing one here would put the thing being measured in charge '
          + 'of authoring its own baseline.');
      }
      return i.modelStyleGuide;
    case 'B3_STANDARD_AS_PROSE':
      return i.standardAsProse;
    case 'B4_EXPERT_ONE_PAGER':
      if (i.expertOnePager === null) {
        throw new MissingArmInput('B4_EXPERT_ONE_PAGER needs the expert\'s own one-page attempt at '
          + 'their rules, written before they see any output. Pass --one-pager <file>. There is no '
          + 'substitute: a generated stand-in would make the commercial baseline something this '
          + 'system wrote about itself.');
      }
      return i.expertOnePager;
    case 'T_ATELIER':
      return i.compiledSkillText;
  }
}

/**
 * Identity of the arm set a run contained.
 *
 * Sorted, so the hash is a property of the SET and not of the order the caller happened to iterate.
 * Bound to the skill version, because the same arms against a different compiled package is a
 * different comparison. Scoring compares this and refuses a mismatch, which is what stops labels
 * from one run being scored against pairs from another.
 */
export function armSetHash(arms: readonly ArmId[], skillVersionHash: string): string {
  const canonical = [...arms].sort().join(',');
  return createHash('sha256').update(`${canonical}|${skillVersionHash}`).digest('hex').slice(0, 16);
}

/** The comparisons a run reports, and what each one answers. */
export interface PairKind {
  readonly id: string;
  readonly left: ArmId | 'GOLDEN';
  readonly right: ArmId | 'GOLDEN';
  readonly answers: string;
  readonly primary: boolean;
}

/**
 * EVERY ARM IS COMPARED, OR IT IS NOT AN ARM.
 *
 * Three arms — B0, B2 and B3 — were declared here, served by `servedTextFor`, tested for
 * distinctness, and named by no pair kind. They could never generate. The set advertised six arms
 * and a run produced three, and nothing in a result said so, which is the same defect this file was
 * written to prevent one level up: an omitted arm leaves no trace.
 *
 * The three that were missing are the three that say WHICH PART OF THE PIPELINE DID THE WORK. With
 * only T against B1 the run answers "do we beat pasting the corpus" and cannot answer anything else.
 * B2 is the one that matters most, because it is the comparison an external reader will ask for
 * first: a capable model reading the same corpus and writing its own guide. Without it, a win over
 * raw examples is consistent with "compiling a ratified standard works" and equally consistent with
 * "any competent summary of this corpus works", and those are different products.
 *
 * The primary is deliberately unchanged. Which comparison decides the product is a preregistered
 * choice and not something to revise while fixing a wiring defect.
 */
// ─── THE PRIMARY MOVED, DELIBERATELY, BY PREREGISTRATION ──────────────────────────────────────
//
// T_vs_B1 asks whether the pipeline beats pasting the corpus in. T_vs_B2 asks whether a RATIFIED,
// COMPILED standard beats a capable model's own guide to the same corpus — and only that comparison
// tests the moat: if T beats B1 but loses to B2, the product is "a model read your work", which
// anyone reproduces in one prompt. Changed by the external-expert preregistration
// (studies/EXTERNAL_EXPERT_B2_PREREGISTRATION.md), before any corpus was read, as the comment below
// always demanded: which comparison decides the product is a preregistered choice.
export const PAIR_KINDS: readonly PairKind[] = [
  { id: 'T_vs_B1', left: 'T_ATELIER', right: 'B1_CORPUS_IN_PROMPT', primary: false,
    answers: 'does the pipeline beat pasting the work into the prompt' },
  { id: 'T_vs_GOLDEN', left: 'T_ATELIER', right: 'GOLDEN', primary: false,
    answers: 'non-inferiority against the expert\'s own held-out work' },
  { id: 'T_vs_B4', left: 'T_ATELIER', right: 'B4_EXPERT_ONE_PAGER', primary: false,
    answers: 'does it beat the expert\'s own half hour' },
  { id: 'B1_vs_GOLDEN', left: 'B1_CORPUS_IN_PROMPT', right: 'GOLDEN', primary: false,
    answers: 'how good the cheap thing is on its own' },
  { id: 'T_vs_B2', left: 'T_ATELIER', right: 'B2_MODEL_STYLE_GUIDE', primary: true,
    answers: 'does a ratified standard beat a capable model\'s own guide to the same corpus' },
  { id: 'T_vs_B3', left: 'T_ATELIER', right: 'B3_STANDARD_AS_PROSE', primary: false,
    answers: 'does compiling add anything over serving the same standard as flat prose' },
  { id: 'T_vs_B0', left: 'T_ATELIER', right: 'B0_BARE', primary: false,
    answers: 'the floor: does any of this beat asking the model with no standard at all' },
];

/** Arms a given set of pair kinds actually requires. Nothing generates an arm nobody compares. */
export function armsRequiredBy(kinds: readonly PairKind[]): readonly ArmId[] {
  const out = new Set<ArmId>();
  for (const k of kinds) {
    if (k.left !== 'GOLDEN') out.add(k.left);
    if (k.right !== 'GOLDEN') out.add(k.right);
  }
  return [...out].sort();
}
