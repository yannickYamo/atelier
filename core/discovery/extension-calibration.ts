// atelier/core/discovery/extension-calibration.ts — AGREEING WITH A SENTENCE IS NOT AGREEING ON ITS CASES.
//
// ─── THE GAP THIS CLOSES ───────────────────────────────────────────────────────────────────────
//
// Discovery proposes a sentence, the expert reads it and says "yes, that's mine", and the pipeline
// treats the target as specified. For a mechanical rule that is enough. For a latent one it is not,
// and we now have the measurement: an author ratified "I restate the thesis as a compressed aphorism
// at section boundaries", and when shown concrete sentences his own judgments did not track the
// wording. He marked passages YES that are neither short nor aphoristic. A frozen model observer
// reached kappa 0.257 against him.
//
//     INTENSION   "yes, that description is true of me"
//     EXTENSION   "yes, THESE are the cases I mean, and those similar-looking ones are not"
//
// Ratification currently collects the first and assumes the second. The gap is not incoherent taste;
// it is a LOSSY ABSTRACTION — the machine's paraphrase kept a frequent realization (brevity) and
// dropped the invariant (re-landing a point already made).
//
// ─── WHY THIS IS THE PRODUCT AND NOT A STUDY FIXTURE ───────────────────────────────────────────
//
// Atelier's bet is that recognition is cheaper than authoring. This is where that bet is strongest:
// nobody can write their own style guide, but anyone can say "no, that one isn't what I mean". Two
// signals — approve the sentence, correct the cases — are enough to sharpen a description that
// neither party could have written from scratch.
//
// ─── WHAT THE MACHINE MAY AND MAY NOT DO ───────────────────────────────────────────────────────
//
// It may PROPOSE a refined wording. It may not adopt one. A refinement arrives DERIVED_UNRATIFIED
// exactly as the original candidate did, because a rule rewritten to fit an expert's labels is still
// a machine's guess about what those labels meant, and inheriting the original's authority would let
// a paraphrase acquire authority the expert never granted it.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { Requirement } from '../state/canonical-state.js';

/** One case the expert ruled on, with the context they saw. */
export interface CalibrationCase {
  readonly caseId: string;
  /** the text preceding the target — the expert and any observer must see the SAME amount */
  readonly context: string;
  readonly target: string;
  readonly label: 'YES' | 'NO' | 'UNSURE';
}

export const CALIBRATION_SYSTEM = `An expert approved a sentence describing something they do in their work. They were then shown
concrete passages from their own writing and asked, case by case, whether each one is an instance.

Their rulings do not perfectly track the description. Your job is to work out what the description
got wrong, and propose a better one.

WHAT YOU ARE LOOKING FOR
The original wording is a paraphrase of a real pattern. It usually fails in one of two ways:
  - it names a FREQUENT REALIZATION as if it were the invariant (e.g. "short" when brevity is common
    but not required), or
  - it omits the actual condition that separates the YES cases from the NO cases.

RULES FOR YOUR PROPOSAL
1. Propose ONE rule. Not a list of exceptions, not a disjunction of the cases you were shown.
2. Never refer to a case by its identifier, and never quote one as though it were part of the rule.
   A rule that has to enumerate its own examples has not been found.
3. It must account for the NO cases as well as the YES ones. A rule that only explains the positives
   is the original rule with the counterexamples ignored.
4. The UNSURE cases are evidence too: a good rule explains why they sit near the boundary, rather
   than resolving them by fiat.
5. Stay in the expert's own register. You are sharpening their description of their own work, not
   replacing it with a taxonomy.
6. If the rulings do NOT support a single coherent boundary, say so and set coherent to false. That
   is a real answer. Inventing a rule to cover incoherent labels produces a target nothing can hit.`;

export const CALIBRATION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    coherent: { type: 'boolean' },
    refined: { type: 'string', maxLength: 600 },
    /** what the original wording got wrong, in one sentence */
    diagnosis: { type: 'string', maxLength: 400 },
    /** which of the shown rulings the refined wording still fails to explain */
    unexplained: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  },
  required: ['coherent', 'refined', 'diagnosis', 'unexplained'],
  additionalProperties: false,
};

export interface RefinementProposal {
  readonly coherent: boolean;
  readonly refined: string;
  readonly diagnosis: string;
  readonly unexplained: readonly string[];
  /** always this. A refinement is a proposal, never an amendment. */
  readonly authority: 'DERIVED_UNRATIFIED';
}

const promptFor = (r: Requirement, cases: readonly CalibrationCase[]): string => {
  const show = (c: CalibrationCase): string =>
    `[${c.label}]\n  argument so far: ${c.context}\n  the sentence: ${c.target}`;
  return `THE APPROVED DESCRIPTION:\n${r.statement}\n\n`
    + `THE EXPERT'S RULINGS ON THEIR OWN WRITING:\n\n${cases.map(show).join('\n\n')}\n\n`
    + 'Propose a better description.';
};

/**
 * Ask for a sharper wording, given the expert's own rulings.
 *
 * Refuses on too few cases in either class. A "refinement" fitted to two positives is the original
 * sentence with noise attached, and it would be indistinguishable from one that had learned
 * something.
 */
export const MIN_PER_CLASS = 3;

export class CalibrationRefused extends Error {}

export async function proposeRefinement(
  client: InferenceClient, budget: Budget, requirement: Requirement,
  cases: readonly CalibrationCase[],
): Promise<RefinementProposal> {
  const yes = cases.filter((c) => c.label === 'YES').length;
  const no = cases.filter((c) => c.label === 'NO').length;
  if (yes < MIN_PER_CLASS || no < MIN_PER_CLASS) {
    throw new CalibrationRefused(
      `calibration needs at least ${MIN_PER_CLASS} rulings in each class; got ${yes} YES and ${no} NO. `
      + 'A boundary cannot be recovered from one side of it.');
  }
  const r = await spend(budget, 0.05, async () => {
    const x = await client.complete({
      stableBlock: CALIBRATION_SYSTEM, variableBlock: '',
      userMessage: promptFor(requirement, cases),
      toolName: 'emit_refinement',
      toolDescription: 'Propose one sharper description of the pattern.',
      schema: CALIBRATION_SCHEMA, maxTokens: 4000,
    });
    return { value: x, cost: x.cost };
  });
  const j = r.json as { coherent?: boolean; refined?: string; diagnosis?: string; unexplained?: string[] };
  if (typeof j.coherent !== 'boolean' || typeof j.refined !== 'string') {
    throw new CalibrationRefused('the refinement came back without a usable proposal.');
  }
  return {
    coherent: j.coherent, refined: j.refined, diagnosis: j.diagnosis ?? '',
    unexplained: j.unexplained ?? [],
    // NEVER inherited. A rule rewritten to fit an expert's labels is still a machine's guess about
    // what those labels meant.
    authority: 'DERIVED_UNRATIFIED',
  };
}
