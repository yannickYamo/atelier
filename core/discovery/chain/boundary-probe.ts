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
 * BOUNDARY PROBE — the question discovery cannot answer for itself.
 *
 * Discovery can show that a property RECURS. It cannot show that the expert would OBJECT if it
 * were missing, and those are different facts. Recurrence is a pattern; preference is a standard.
 * Only the expert closes that gap, and this module asks them in the cheapest falsifiable way.
 *
 * SYMMETRIC BY CONSTRUCTION. A probe that shows only "with the property" and "without it" can
 * only confirm. A symmetric probe spans the range — too little, about right, too much — so the
 * expert can reveal three things a one-sided probe hides:
 *   - INDIFFERENCE   (they genuinely do not care here → the factor is scope-limited, not global)
 *   - DISPREFERENCE  (more of it is worse → the factor has a ceiling, not a direction)
 *   - a real boundary (they pick the middle → the factor discriminates, and now it is evidence)
 * `isFalsifiableProbe` in taste-discovery.ts already enforces ≥2 distinct levels; this module
 * builds the variants that satisfy it and keeps the level labels off the expert's sheet.
 *
 * FRESH MATERIAL ONLY. Variants must be written on a context the proposer never read. Probing on
 * a proposal golden asks the expert to re-rate the very text the hypothesis was read off, which
 * confirms by construction — the same circularity the discovery split exists to prevent, moved
 * one step downstream.
 *
 * CONSUMER (named at design time): `aggregateTasteFactorEvidence` folds the returned
 * `BoundaryLabel`s into the boundarySupport channel, which is one of the two channels
 * `confidenceFrom()` actually reads.
 *
 * Pure module — zero I/O, no LLM.
 */
import type { BoundaryLabel, BoundaryLevel, BoundaryProbe } from './taste-discovery.js';

/** What a variant at each level must exhibit. The model writes prose to this spec. */
export interface VariantSpec {
  readonly level: Exclude<BoundaryLevel, 'INDIFFERENT'>;
  /** what the writer must make true of this variant */
  readonly instruction: string;
}

export interface ProbeDesign {
  readonly factorId: string;
  readonly contextId: string;
  /** the property being probed, in the expert's terms */
  readonly propertyDescription: string;
  readonly variants: readonly VariantSpec[];
  /** why this context is legitimate to probe on */
  readonly freshnessNote: string;
}

/**
 * Build a symmetric three-level design for one factor on one FRESH context.
 *
 * The TOO_MUCH variant is the one that earns the probe its falsifiability, and it is the easiest
 * to get wrong: it must be a genuine over-application of the SAME property, not a strawman and
 * not a different defect. If TOO_MUCH is written as "bad in some other way", the expert rejects
 * it for the wrong reason and the probe measures nothing.
 */
export function designProbe(
  factorId: string,
  contextId: string,
  propertyDescription: string,
  tooLittle: string,
  acceptable: string,
  tooMuch: string,
  freshnessNote: string,
): ProbeDesign {
  return {
    factorId, contextId, propertyDescription,
    variants: [
      { level: 'TOO_LITTLE', instruction: tooLittle },
      { level: 'ACCEPTABLE', instruction: acceptable },
      { level: 'TOO_MUCH', instruction: tooMuch },
    ],
    freshnessNote,
  };
}

/** A written variant, before blinding. */
export interface WrittenVariant {
  readonly level: Exclude<BoundaryLevel, 'INDIFFERENT'>;
  readonly text: string;
}

export interface BlindProbe {
  readonly probe: BoundaryProbe;
  /** tag → level, sealed. Never rendered on the sheet. */
  readonly key: readonly { tag: string; level: Exclude<BoundaryLevel, 'INDIFFERENT'> }[];
  readonly rendered: string;
}

const TAGS = ['1', '2', '3', '4'];

/**
 * Blind and render. Order is deterministic from the seed so a run is reproducible, and level
 * labels appear nowhere in the sheet — an expert who can see which variant is "the right one"
 * is being asked a leading question.
 */
export function blindProbe(
  design: ProbeDesign,
  written: readonly WrittenVariant[],
  seed: number,
): BlindProbe {
  if (written.length > TAGS.length) {
    throw new Error(`blindProbe supports at most ${TAGS.length} variants (got ${written.length}) — silently dropping one would corrupt the sealed key`);
  }
  if (written.length < 2) {
    throw new Error('a probe with fewer than 2 variants can only confirm — see isFalsifiableProbe');
  }
  // A proper mix per (seed, index). An earlier version used ((seed + i*C) % 1000), whose relative
  // order is invariant under small seed changes unless it happens to wrap — it produced the SAME
  // order for every seed tried, which would have made "random order" a lie on the expert's sheet.
  const mix = (a: number, b: number): number => {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2545f491); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  const ordered = written
    .map((v, i) => ({ v, k: mix(seed, i) }))
    .sort((a, b) => a.k - b.k)
    .map(z => z.v);

  const key = ordered.map((v, i) => ({ tag: TAGS[i], level: v.level }));
  const probe: BoundaryProbe = {
    factorId: design.factorId,
    contextId: design.contextId,
    variants: ordered.map((v, i) => ({ level: v.level, ref: TAGS[i] })),
  };

  let rendered = `# Boundary probe — one property, three versions\n\n`
    + `> **The property:** ${design.propertyDescription}\n>\n`
    + `> Below are ${ordered.length} versions of the same passage. They differ **only** in how much of\n`
    + `> that property they apply. They are in random order and carry no labels.\n>\n`
    + `> **Pick the one you would ship.** If two are equally fine, say so — "I don't care between\n`
    + `> these" is a real and useful answer, not a failure to decide. If you would ship none of\n`
    + `> them, say that too.\n>\n`
    + `> _Context freshness: ${design.freshnessNote}_\n\n---\n\n`;
  for (let i = 0; i < ordered.length; i++) {
    rendered += `## Version ${TAGS[i]}\n\n${ordered[i].text}\n\n---\n\n`;
  }
  rendered += `## Answer\n\n`
    + `- I would ship: \`${TAGS.slice(0, ordered.length).join(' | ')}\`\n`
    + `- Or: \`no preference between <tags>\` / \`none of them\`\n`
    + `- Why (one line):\n`;

  return { probe, key, rendered };
}

/**
 * Fold the expert's pick into a BoundaryLabel.
 *
 * "No preference" folds to INDIFFERENT, which is deliberately NOT counter-evidence: the factor
 * simply does not bind in this context. That distinction is the whole reason taste is modelled as
 * Q(y|x,S_u), the quality of y for task x under expert u's standard — a factor can be
 * load-bearing in one context and irrelevant in another, and
 * collapsing indifference into disagreement would erase the scope information.
 */
export function foldProbeAnswer(
  blind: BlindProbe,
  answer: { readonly shipped?: string; readonly noPreference?: readonly string[]; readonly none?: boolean },
): BoundaryLabel {
  const levelOf = (tag: string) => blind.key.find(k => k.tag === tag)?.level;
  if (answer.none) {
    // None acceptable: the property is not what separates good from bad here.
    return { contextId: blind.probe.contextId, preferredLevel: 'INDIFFERENT' };
  }
  if (answer.noPreference && answer.noPreference.length > 1) {
    return { contextId: blind.probe.contextId, preferredLevel: 'INDIFFERENT' };
  }
  // "no preference between <one tag>" is not indifference, it is a pick with odd phrasing.
  // Reading it as INDIFFERENT would silently discard a real preference.
  const single = answer.noPreference?.length === 1 ? answer.noPreference[0] : undefined;
  const lvl = (answer.shipped ?? single) ? levelOf((answer.shipped ?? single)!) : undefined;
  if (!lvl) throw new Error(`probe answer names no known variant (got ${JSON.stringify(answer)})`);
  return { contextId: blind.probe.contextId, preferredLevel: lvl };
}

/** What the pick MEANS for the factor, in one plain sentence. */
export function interpretProbe(label: BoundaryLabel): string {
  switch (label.preferredLevel) {
    case 'ACCEPTABLE':
      return 'the property discriminates here — you preferred the version that applies it in measure, over both less and more';
    case 'TOO_LITTLE':
      return 'you preferred LESS of it than the examples suggested — the pattern may be a habit rather than a standard';
    case 'TOO_MUCH':
      return 'you preferred MORE of it — the examples may understate the rule';
    case 'INDIFFERENT':
      return 'the property does not bind in this context — it may still hold elsewhere, so this narrows its scope rather than refuting it';
  }
}
