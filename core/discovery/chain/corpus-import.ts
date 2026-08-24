// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
//   from     the private predecessor this was extracted from
//
// Ported rather than rewritten, and the original kept running while this one earned its callers —
// copy-then-delete in one movement is how a reference implementation is lost before the port has
// survived use. Parity between the two is pinned by test.
//
// Nothing here does I/O or calls a model. The whole chain is pure, which is why it ports at all: the
// inference boundary is a PARAMETER, so Atelier supplies its own client and the logic never knew.

/**
 * IMPORT — "show me what good looks like", and everything else is inferred.
 *
 * The entry point. The user does not choose between "create a skill" and "improve a skill";
 * they hand over material and the system says which journey it is taking and why. A branch
 * question at the door asks the user to classify their own situation before they have any reason
 * to trust the classification — and it is a question the material already answers.
 *
 * THE SPLIT IS DECIDED HERE, AND BEFORE ANY CONTENT IS READ. Discovery's anti-circularity rule
 * requires that the goldens a hypothesis is read off are disjoint from the ones its recurrence is
 * scored on. If the split were chosen later, or by anything that had seen the material, it could
 * be steered — deliberately or not — toward the examples that make a pattern look strongest.
 * Assigning it here, deterministically, from an ordering fixed before reading, removes that
 * possibility rather than warning against it.
 *
 * REFUSALS ARE FIRST-CLASS. Too few examples, empty files, failures with nothing to contrast them
 * against — each returns a plain-language refusal rather than a degraded run. A discovery run on
 * three goldens produces numbers that look like evidence and are not, which is worse than no run.
 *
 * CONSUMER (named at design time): `discovery-contract.ts` takes the `GoldenRef[]` this produces,
 * roles already assigned, and refuses if they do not satisfy its own floors.
 *
 * Pure module — zero I/O. A thin harness reads files and hands the text here.
 */
import type { GoldenRef } from './discovery-contract.js';
import { MIN_PROPOSAL_GOLDENS, MIN_HELD_OUT_GOLDENS } from './discovery-contract.js';

export type MaterialKind =
  /** an output the expert considers excellent — the primary signal */
  | 'GOLDEN'
  /** an output the expert rejected — optional, and powerful when present */
  | 'REJECTED'
  /** framework or methodology the expert works from */
  | 'METHODOLOGY'
  /** an existing skill definition — its presence selects the IMPROVE journey */
  | 'EXISTING_SKILL';

export interface ImportedMaterial {
  readonly id: string;
  readonly kind: MaterialKind;
  readonly text: string;
}

export type Journey =
  /** no existing skill — we are standing one up from the expert's examples */
  | 'CREATE'
  /** a skill exists — we are finding what the examples preserve that it does not */
  | 'IMPROVE';

export interface ImportPlan {
  readonly journey: Journey;
  /** goldens with PROPOSAL / HELD_OUT already assigned */
  readonly goldens: readonly GoldenRef[];
  readonly rejectedCount: number;
  readonly methodologyCount: number;
  readonly existingSkillId?: string;
  /** empty means the run may proceed */
  readonly refusals: readonly string[];
  /** what the user is told, in their language, with no branch question */
  readonly summary: string;
}

/** Below this a "golden" is a fragment, not an example of finished work. */
export const MIN_GOLDEN_CHARS = 200;

function assignRoles(ids: readonly string[]): GoldenRef[] {
  // Sorted, then the first MIN_PROPOSAL propose and the remainder are held out. Deterministic and
  // content-blind by construction: the ordering depends only on identifiers.
  const sorted = [...ids].sort();
  return sorted.map((contextId, i) => ({
    contextId,
    role: i < MIN_PROPOSAL_GOLDENS ? 'PROPOSAL' : 'HELD_OUT',
  }));
}

export function planImport(material: readonly ImportedMaterial[]): ImportPlan {
  const goldens = material.filter(m => m.kind === 'GOLDEN');
  const rejected = material.filter(m => m.kind === 'REJECTED');
  const methodology = material.filter(m => m.kind === 'METHODOLOGY');
  const skill = material.find(m => m.kind === 'EXISTING_SKILL');
  const journey: Journey = skill ? 'IMPROVE' : 'CREATE';

  const refusals: string[] = [];
  const thin = goldens.filter(g => g.text.trim().length < MIN_GOLDEN_CHARS);
  for (const t of thin) {
    refusals.push(`"${t.id}" is too short to be an example of finished work — we would be reading a fragment`);
  }

  const usable = goldens.filter(g => g.text.trim().length >= MIN_GOLDEN_CHARS);
  const need = MIN_PROPOSAL_GOLDENS + MIN_HELD_OUT_GOLDENS;
  if (usable.length < need) {
    refusals.push(
      `we have ${usable.length} usable example(s) and need at least ${need}. `
      + `Some are read to find candidate patterns and the rest are kept back to check them on work `
      + `the analysis has not seen — with fewer, anything we found would just be a description of `
      + `the examples themselves.`);
  }
  if (usable.length === 0 && rejected.length > 0) {
    refusals.push('we have examples you rejected but none you consider good — we can only learn what you want by contrast with work you would ship');
  }

  const refs = refusals.length ? [] : assignRoles(usable.map(g => g.id));

  return {
    journey,
    goldens: refs,
    rejectedCount: rejected.length,
    methodologyCount: methodology.length,
    existingSkillId: skill?.id,
    refusals,
    summary: buildSummary(journey, refs, rejected.length, methodology.length, skill?.id, refusals),
  };
}

function buildSummary(
  journey: Journey,
  refs: readonly GoldenRef[],
  rejectedCount: number,
  methodologyCount: number,
  skillId: string | undefined,
  refusals: readonly string[],
): string {
  if (refusals.length) {
    return `We cannot start yet.\n\n${refusals.map(r => `- ${r}`).join('\n')}`;
  }
  const proposal = refs.filter(r => r.role === 'PROPOSAL').length;
  const heldOut = refs.filter(r => r.role === 'HELD_OUT').length;

  const opening = journey === 'IMPROVE'
    ? `You already have a skill (**${skillId}**), so we will look for what your examples preserve that it does not.`
    : `There is no skill here yet, so we will stand one up from your examples.`;

  const extras: string[] = [];
  if (rejectedCount) extras.push(`${rejectedCount} example(s) you rejected — those sharpen the contrast`);
  if (methodologyCount) extras.push(`${methodologyCount} methodology document(s)`);

  return `${opening}\n\n`
    + `We will read **${proposal}** of your examples to find candidate patterns, and keep **${heldOut}** back\n`
    + `to check them against work the analysis has not seen. That split is why a pattern we report is a\n`
    + `finding rather than a restatement of the examples we read.\n`
    + (extras.length ? `\nAlso using: ${extras.join('; ')}.\n` : '');
}
