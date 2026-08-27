// DELIBERATELY DARK — DEFERRED BY POLICY.
//
// This is the machinery that MATERIALISES a discriminating probe, and probes are not fired in the
// AUTONOMOUS_LOOP_READY milestone. The planner emits a ProbeSpec (convergence/probe.ts) which is on
// the live path; turning one into a blind, counterbalanced, manipulation-checked pair is this
// module's job and happens the first time a probe actually runs. Recovered and verified compatible;
// not wired, because wiring it would mean firing it.
//
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
 * DISCRIMINATION PROBE — the one question that can move a candidate off the floor.
 *
 * PLACED BY OBSERVATION, not by design taste. In the first non-author walkthrough the user marked
 * a property "this matters" and the proposal answered **"How sure we are: still uncertain."** That
 * is the ADVISORY cap surfacing at precisely the moment the user gave real input, and it is the
 * worst possible moment for it. So this probe fires exactly there: immediately after a property is
 * marked as mattering, and ONLY for those properties.
 *
 * WHY NOT A BOUNDARY PROBE. The end-to-end test established that boundary labels cannot promote a
 * candidate at any count — 1, 2, 5, 10 all stay ADVISORY — because every non-ADVISORY branch in
 * `assignPriority` needs the DISCRIMINATION channel. A boundary probe asks "how much of this do you
 * want"; only a pairwise comparison asks "does your preference actually MOVE with it", which is the
 * fact the priority rule is waiting on. One discriminating context family reaches CONTEXTUAL; TWO
 * distinct families are required for SUPPORTED, and therefore for IMPORTANT or CORE. So one pair is
 * the minimum USEFUL probe and is also, permanently, the ceiling at CONTEXTUAL — a factor probed in
 * a single family cannot be promoted further no matter how emphatic the answer.
 *
 * SYMMETRIC IN THE SENSE THAT MATTERS. Two outputs on the same fresh case, differing only in this
 * property, presented blind in randomised order — and "they are equally good" is a first-class
 * answer. Without that third option the probe is a forced choice, and a forced choice manufactures
 * a preference where indifference is the truth. Indifference folds to `null`, which is neither
 * support nor counter-evidence: it says the factor did not move the expert here, which is scope
 * information rather than disagreement.
 *
 * FRESH CASE ONLY. Probing on a golden the proposer read asks the expert to re-rate the text a
 * hypothesis was derived from — the circularity the discovery split exists to prevent, one step
 * downstream.
 *
 * CONSUMER (named at design time): `aggregateTasteFactorEvidence` folds the `DiscriminationObservation`
 * carried by a `ProbeOutcome` into the channel `confidenceFrom()` and `assignPriority()` read. Use
 * `observationsFrom()` to extract them — it drops void probes, which must reach no channel at all.
 *
 * Pure module — zero I/O, no LLM. The manipulation CHECK needs a model call, but this module only
 * builds its prompt and folds its verdict; the call itself belongs to the caller.
 */
import type { DiscriminationObservation } from './taste-discovery.js';

/** What the writer must make true of each side. The property is the ONLY difference. */
export interface PairDesign {
  readonly factorId: string;
  /** This probe. */
  readonly contextId: string;
  /**
   * The INDEPENDENT unit this probe belongs to (F4). Provenance-derived — the fixture or golden the
   * probe was built from — never model-emitted. Promotion counts families, so a model that could
   * name its own family could mint its own promotion evidence.
   */
  readonly contextFamilyId: string;
  readonly propertyDescription: string;
  /** written to exhibit the property */
  readonly withInstruction: string;
  /** written to be equally competent WITHOUT it — never a strawman */
  readonly withoutInstruction: string;
}

export function designPair(
  factorId: string,
  contextId: string,
  propertyDescription: string,
  contextFamilyId: string,
): PairDesign {
  if (!contextFamilyId) {
    throw new Error(
      `designPair(${factorId}/${contextId}): contextFamilyId is required — it is the independent unit promotion counts. `
      + 'Derive it from the probe\'s provenance (the fixture or golden it came from); never let the writer name it.',
    );
  }
  return {
    factorId, contextId, contextFamilyId, propertyDescription,
    withInstruction:
      `Write a strong response that clearly exhibits this property: ${propertyDescription}`,
    withoutInstruction:
      `Write an equally strong response that simply does NOT do this: ${propertyDescription}. `
      + `It must be competent and plausible in every other respect — the ONLY difference is the absence `
      + `of that property. Do not weaken it in any other way; a weakened version would tell us nothing, `
      + `because the expert would reject it for the wrong reason.`,
  };
}

export interface WrittenPair {
  readonly withFactor: string;
  readonly withoutFactor: string;
}

export interface BlindPair {
  readonly factorId: string;
  readonly contextId: string;
  /** The independent unit (F4). Carried through so the fold cannot lose it. */
  readonly contextFamilyId: string;
  /** tag → whether that side carries the factor. Sealed; never rendered. */
  readonly key: readonly { tag: 'A' | 'B'; carriesFactor: boolean }[];
  readonly rendered: string;
}

// ── SIDE ASSIGNMENT — one owner, balanced by construction ──────────────────────────
//
// THE DEFECT THIS REPLACES. `blindPair` hashed over (factorId, seed) ONLY — not the context. So a
// factor probed across N contexts put the factor-carrying variant on the SAME side every time. Since
// discrimination is the ONLY channel that can move a factor off ADVISORY, any position preference in
// the rater accumulated as correlated pseudo-support in the one channel with promotion authority.
//
// AND HASHING THE CONTEXT IN IS NOT ENOUGH. Independent pseudo-random assignment at n=3-6 still
// produces A,A,A,A a meaningful fraction of the time. What is needed is BALANCE, not independence:
// the factor sits on side A for half the contexts and side B for the other half, chosen
// reproducibly. So side assignment is planned for the factor's whole context set at once, and
// `blindPair` no longer decides it — it is told.

const fnv = (s: string, seed: number): number => {
  let h = seed >>> 0;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h >>> 0;
};

/**
 * Balanced, reproducible side assignment for one factor across its contexts.
 *
 * Sort (so caller ordering cannot bias the result) → seeded permutation → alternate. With an ODD
 * count perfect balance is impossible, so the extra probe's side is chosen by a seeded bit that
 * varies across factors — otherwise every odd-sized factor would favour the same side, which is the
 * bias we just removed wearing a smaller hat.
 *
 * Returns contextId → `withFirst` (true = the factor-carrying variant is rendered as A).
 */
export function planProbeSides(
  factorId: string,
  contextIds: readonly string[],
  seed: number,
): ReadonlyMap<string, boolean> {
  const ordered = [...new Set(contextIds)].sort();
  let rng = fnv(factorId, seed) || 1;
  const next = () => (rng = (Math.imul(rng, 1103515245) + 12345) >>> 0) / 4294967296;

  // Fisher–Yates under the seeded stream.
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const flip = (fnv(`${factorId}:tiebreak`, seed) & 1) === 1;

  const out = new Map<string, boolean>();
  ordered.forEach((ctx, i) => out.set(ctx, (i % 2 === 0) !== flip));
  return out;
}

/** How balanced an assignment came out — |#A − #B|. 0 for even counts, 1 for odd. Never more. */
export function sideImbalance(plan: ReadonlyMap<string, boolean>): number {
  let a = 0, b = 0;
  for (const withFirst of plan.values()) { if (withFirst) a++; else b++; }
  return Math.abs(a - b);
}

export function blindPair(design: PairDesign, written: WrittenPair, withFirst: boolean): BlindPair {
  const first = withFirst ? written.withFactor : written.withoutFactor;
  const second = withFirst ? written.withoutFactor : written.withFactor;
  const key: BlindPair['key'] = [
    { tag: 'A', carriesFactor: withFirst },
    { tag: 'B', carriesFactor: !withFirst },
  ];

  const rendered = `# Does this actually change your answer?\n\n`
    + `> **The property:** ${design.propertyDescription}\n>\n`
    + `> Two responses to the same case. One does this; the other is equally competent and simply\n`
    + `> does not. Everything else is held the same. They are in random order and carry no labels.\n>\n`
    + `> **Which would you rather send?** If they are equally good, say so — "no difference" is a\n`
    + `> real answer and tells us this does not carry weight here, which is worth knowing.\n\n---\n\n`
    + `## A\n\n${first}\n\n---\n\n## B\n\n${second}\n\n---\n\n`
    + `## Answer\n\n- I would send: \`A | B | no difference\`\n- Why (one line):\n`;

  return { factorId: design.factorId, contextId: design.contextId, contextFamilyId: design.contextFamilyId, key, rendered };
}

// ── MANIPULATION CHECK — "both fine" is ambiguous until the pair actually differed ──
//
// A "no difference" answer has TWO causes and they are opposite facts:
//   (a) the pair genuinely differed on the property and the expert does not care here  → SCOPE
//   (b) the generator wrote two variants that BOTH exhibit the property                → FAILED PROBE
// Reading (b) as (a) records "this factor is inert" when the truth is "we never tested it." Once
// probes fire automatically that error compounds silently, so validity is checked before the answer
// is allowed to mean anything.
//
// THE CHECK IS AN IDENTIFICATION, NOT A QUALITY JUDGMENT. We ask a blind forced choice — "which of
// these two exhibits P?" — which is a far easier question than "which is better" and a DIFFERENT one
// from the judgment we distrust. If the checker cannot tell them apart, the manipulation failed.

/** Blind forced-choice identification prompt. Never asks which is better. */
export function buildManipulationCheckPrompt(design: PairDesign, pair: BlindPair): string {
  return [
    'Two responses to the same case are shown below, labelled A and B.',
    '',
    `THE PROPERTY: ${design.propertyDescription}`,
    '',
    'Exactly one of them was written to exhibit that property; the other was written not to.',
    'Say which one exhibits it. Do NOT judge which response is better, more useful, or higher quality —',
    'that is not the question. If you genuinely cannot tell which one exhibits the property, answer',
    'INDISTINGUISHABLE.',
    '',
    'Answer with one token: A | B | INDISTINGUISHABLE',
    '',
    pair.rendered,
  ].join('\n');
}

/**
 * Did the manipulation land? True only when the checker identified the side that actually carries
 * the factor. A wrong identification and an INDISTINGUISHABLE both mean the pair did not manipulate
 * the property — the probe is void either way.
 */
export function manipulationVerified(pair: BlindPair, identified: 'A' | 'B' | 'INDISTINGUISHABLE'): boolean {
  if (identified === 'INDISTINGUISHABLE') return false;
  return pair.key.find((k) => k.tag === identified)?.carriesFactor === true;
}

/**
 * What a probe yielded. `INVALID_PROBE` carries no observation at all — a void probe must reach
 * neither the discrimination channel nor the scope channel, and it is surfaced as instrument debt
 * rather than absorbed silently.
 */
export type ProbeOutcome =
  | { readonly kind: 'DISCRIMINATION'; readonly observation: DiscriminationObservation }
  | { readonly kind: 'SCOPE'; readonly observation: DiscriminationObservation }
  | { readonly kind: 'INVALID_PROBE'; readonly contextId: string; readonly reason: string };

/**
 * Fold the pick into the discrimination channel.
 *
 * - the factor-carrying side wins  → preference MOVED WITH the factor (support)
 * - the other side wins            → preference moved AGAINST it (genuine counter-evidence)
 * - no difference, manipulation verified   → SCOPE: it did not move the expert HERE. Not
 *                                            counter-evidence; it narrows Q(y|x,S_u).
 * - no difference, manipulation NOT verified → INVALID_PROBE: we learned nothing about the factor.
 *
 * A DIRECTIONAL pick is kept even when the manipulation check is unavailable: the expert choosing a
 * side is itself evidence the sides differed. It is only the NULL that the check disambiguates.
 */
export function foldPairAnswer(
  pair: BlindPair,
  answer: { readonly chose?: 'A' | 'B'; readonly noDifference?: boolean },
  manipulationDidLand?: boolean,
): ProbeOutcome {
  if (answer.noDifference || !answer.chose) {
    if (manipulationDidLand === false) {
      return {
        kind: 'INVALID_PROBE',
        contextId: pair.contextId,
        reason: 'the expert saw no difference AND the manipulation check could not tell the variants apart — '
          + 'the pair did not vary the property, so this says nothing about whether the factor matters',
      };
    }
    return { kind: 'SCOPE', observation: { contextId: pair.contextId, contextFamilyId: pair.contextFamilyId, preferenceMovedWithFactor: null } };
  }
  const entry = pair.key.find((k) => k.tag === answer.chose);
  if (!entry) throw new Error(`answer names no known side (${answer.chose})`);
  return {
    kind: 'DISCRIMINATION',
    observation: { contextId: pair.contextId, contextFamilyId: pair.contextFamilyId, preferenceMovedWithFactor: entry.carriesFactor },
  };
}

/** The observations a set of probe outcomes contributes. Void probes contribute nothing, by design. */
export function observationsFrom(outcomes: readonly ProbeOutcome[]): DiscriminationObservation[] {
  return outcomes.flatMap((o) => (o.kind === 'INVALID_PROBE' ? [] : [o.observation]));
}

/** Void probes, for the readout. Instrument debt is reported, never absorbed. */
export function invalidProbes(outcomes: readonly ProbeOutcome[]): { contextId: string; reason: string }[] {
  return outcomes.flatMap((o) => (o.kind === 'INVALID_PROBE' ? [{ contextId: o.contextId, reason: o.reason }] : []));
}

/** What the pick means, in one sentence, for the user. */
export function interpretPair(o: DiscriminationObservation): string {
  if (o.preferenceMovedWithFactor === null) {
    return 'no difference to you here — so this is a pattern in your work rather than something you would insist on';
  }
  return o.preferenceMovedWithFactor
    ? 'you preferred the version that does this — your judgement moves with it, which is what makes it a rule rather than a habit'
    : 'you preferred the version WITHOUT it — worth understanding before this goes anywhere near your skill';
}
