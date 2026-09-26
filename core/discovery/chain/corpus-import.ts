// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
// Ported rather than rewritten, and the original kept running while this one earned its callers:
// copy-then-delete in one movement is how a reference implementation is lost before the port has
// survived use. Its behaviour is pinned by this repository's own tests; the tree it came from is
// not public, and no claim in this repository rests on it.
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
  /** usable pieces past what the proposer reads in one pass — named, never silently dropped */
  readonly unread?: readonly string[];
}

/** Below this a "golden" is a fragment, not an example of finished work. */
export const MIN_GOLDEN_CHARS = 200;

/**
 * THE SPLIT SCALES WITH THE CORPUS. It used the MINIMUM as the value: two pieces proposed, whatever the
 * corpus held, so forty documents yielded rules read off the two whose filenames sorted first and
 * nothing in pieces three to forty could ever be proposed. "Point it at a folder of your best work"
 * was untrue in exactly the case it is said about.
 *
 * Now roughly a third is held out to check the proposals (never fewer than two, never more than
 * MAX_HELD_OUT, because every held-out piece is observed against every rule and that is where the cost
 * lands), and everything else is read — up to what the proposer can read in one pass. The defaults
 * are the ones a person gets without being asked; `heldOut` overrides the count.
 *
 * Still content-blind: which piece lands where depends only on the sorted identifiers. Held-out
 * pieces are taken at an even stride through that order rather than as its tail, because names often
 * carry dates, and a tail would test last year's rules only on this year's work.
 */
export const HELD_OUT_SHARE = 0.3;
export const MAX_HELD_OUT = 8;
/** What the proposer is given in one read, in tokens (~4 characters each). Beyond it, pieces wait. */
export const PROPOSAL_POOL_TOKENS = 100_000;

export interface SplitOptions {
  /** held-out count, when the author declares one */
  readonly heldOut?: number;
  readonly poolTokens?: number;
}

export function assignRoles(goldens: readonly { readonly id: string; readonly text: string }[], opts: SplitOptions = {}): {
  readonly refs: GoldenRef[]; readonly unread: readonly string[];
} {
  const sorted = [...goldens].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = sorted.length;
  const maxHeld = n - MIN_PROPOSAL_GOLDENS;
  const want = opts.heldOut ?? Math.min(MAX_HELD_OUT, Math.round(n * HELD_OUT_SHARE));
  const h = Math.max(MIN_HELD_OUT_GOLDENS, Math.min(maxHeld, want));
  const heldIdx = new Set<number>();
  for (let k = 0; k < h; k++) heldIdx.add(Math.floor(((k + 0.5) * n) / h));
  const cap = opts.poolTokens ?? PROPOSAL_POOL_TOKENS;
  const refs: GoldenRef[] = [];
  const unread: string[] = [];
  let pool = 0;
  sorted.forEach((g, i) => {
    if (heldIdx.has(i)) { refs.push({ contextId: g.id, role: 'HELD_OUT' }); return; }
    const tok = Math.ceil(g.text.length / 4);
    const proposing = refs.filter((r) => r.role === 'PROPOSAL').length;
    // The floor is honoured even past the cap: two pieces is what makes a pattern a pattern.
    if (proposing >= MIN_PROPOSAL_GOLDENS && pool + tok > cap) { unread.push(g.id); return; }
    pool += tok;
    refs.push({ contextId: g.id, role: 'PROPOSAL' });
  });
  return { refs, unread };
}

export function planImport(material: readonly ImportedMaterial[], opts: SplitOptions & { readonly reserved?: readonly string[] } = {}): ImportPlan {
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

  // Reserved pieces take no role at all: nothing in discovery reads them, not even the observer.
  const reserved = new Set(opts.reserved ?? []);
  const usable = goldens.filter(g => g.text.trim().length >= MIN_GOLDEN_CHARS && !reserved.has(g.id));
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

  const split = refusals.length ? { refs: [], unread: [] } : assignRoles(usable, opts);
  const refs = split.refs;

  return {
    journey,
    goldens: refs,
    rejectedCount: rejected.length,
    methodologyCount: methodology.length,
    existingSkillId: skill?.id,
    refusals,
    unread: split.unread,
    summary: buildSummary(journey, refs, rejected.length, methodology.length, skill?.id, refusals, split.unread),
  };
}

function buildSummary(
  journey: Journey,
  refs: readonly GoldenRef[],
  rejectedCount: number,
  methodologyCount: number,
  skillId: string | undefined,
  refusals: readonly string[],
  unread: readonly string[] = [],
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
    + (extras.length ? `\nAlso using: ${extras.join('; ')}.\n` : '')
    + (unread.length ? `\n${unread.length} more piece(s) are past what the proposer reads in one pass and are not read: ${unread.join(', ')}.\n` : '');
}
