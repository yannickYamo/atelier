// atelier/core/coverage/candidate-support.ts — WHAT "FOUND SIX TIMES" ACTUALLY MEANS.
//
// ─── THE OVERSTATEMENT THIS TYPE EXISTS TO PREVENT ─────────────────────────────────────────────
//
// A candidate behaviour recurred in six of twelve discovery cells and was reported as "found by 6
// independent cells". Those cells are not independent expert observations. They reuse NESTED
// GoldenUnits (level 1 ⊂ level 2 ⊂ level 5), the same source artifacts, the same two ladders and the
// same two framings. A pattern originating in ONE excerpt can recur in six nested cells without ever
// gaining six pieces of expert evidence.
//
// Recurrence across discovery conditions is real and worth having — it is ROBUSTNESS TO DISCOVERY
// CONDITIONS, evidence that the finding is not one prompt's artifact. It is not statistical
// independence and it may never be used as an inferential n.
//
// So the count is decomposed, and there is no single number to quote.

/** The decomposition. Every field answers a different question; none of them is a sample size. */
export interface EvidenceSupport {
  /** how many discovery cells produced it. ROBUSTNESS TO CONDITIONS — never an inferential n. */
  readonly discoveryCellRecurrence: number;
  /** distinct GoldenUnits any producing cell actually read. The closest thing to expert evidence. */
  readonly uniqueGoldenUnits: number;
  /** distinct source artifacts/clusters those units came from. The unit an across-artifact claim needs. */
  readonly uniqueArtifacts: number;
  /** how many vantages found it — did it survive a change of question? */
  readonly framingDiversity: number;
  /** how many independently composed evidence sets found it — did it survive a change of examples? */
  readonly ladderDiversity: number;
}

/**
 * What a person reads. States the decomposition and refuses to summarise it.
 *
 * The sentence is built so the weakest number is impossible to skip: a candidate recurring in six
 * cells that all read one excerpt reads as exactly that.
 */
export function describeSupport(s: EvidenceSupport): string {
  return `recurred across ${s.discoveryCellRecurrence} discovery condition(s), supported by `
    + `${s.uniqueGoldenUnits} unique GoldenUnit(s) from ${s.uniqueArtifacts} source artifact(s), `
    + `${s.ladderDiversity} ladder(s) and ${s.framingDiversity} vantage(s)`;
}

/** Guard for the one misuse this module exists to prevent. */
export function assertNotSampleSize(field: keyof EvidenceSupport): void {
  if (field === 'discoveryCellRecurrence') {
    throw new Error(
      'discoveryCellRecurrence is robustness to discovery CONDITIONS, not a count of independent expert '
      + 'observations. The cells reuse nested units, artifacts, ladders and framings. Use uniqueArtifacts '
      + 'for anything that needs an independent unit — and even that is a denominator, not a trial count.');
  }
}

// ─── DISPOSITION: RECURRENCE IS NOT A REASON TO REQUIRE SOMETHING ──────────────────────────────
//
// This is where taste systems become caricature generators. Compiled naively, four real observations
// about an author become:
//
//     ALWAYS use sentence fragments. ALWAYS use semicolon lists. INCLUDE typos. END with three adjectives.
//
// Which is a parody. The author does all four; none of them is necessarily a thing an otherwise
// excellent output must do.
//
// The distinguishing question is NOT "do you do this?" — the evidence already answered that. It is:
//
//     "If an otherwise excellent output did NOT do this, would it meaningfully violate your standard?"
//
// The typo case shows why the answer changes the implementation entirely. "Informal punctuation and
// typos sometimes remain" is an observation. The rule underneath is almost certainly not GENERATE
// TYPOS — it is a boundary against over-polishing: *do not sterilise the voice by smoothing away
// imperfection*. Same evidence, opposite implementation.

// ─── THE LATENT DECISION IS NOT ITS SURFACE REALIZATION ────────────────────────────────────────
//
// A cluster proposed "I close final sections with a trilogy of adjectives — capital-letter parallel
// terms". One of its own evidence spans was "The semantic revolution isn't coming. It's here. The
// only question is what you'll build with it." That is not a trilogy of adjectives. The cluster is
// real; the STATEMENT was a description of one realization, mistaken for the rule.
//
// Compiled as written, the autoloop learns "add three adjectives". That is imitation. What is
// actually invariant is closer to: at a final visionary close, COMPRESS rather than re-explain — and
// "Invisible. Reliable. Essential." is then an EXEMPLAR of the decision, not the decision.
//
// So a candidate carries the invariant and its realizations separately, and only the invariant is
// ever a candidate requirement.

export interface LatentDecision {
  readonly decisionSite: string;
  /** what actually matters — stated so a different surface could satisfy it */
  readonly invariant: string;
  /** the forms it took in THIS evidence. Illustrations, never obligations. */
  readonly realizations: readonly string[];
}

// ─── MATERIALITY AND REALIZATION FLEXIBILITY ARE TWO AXES, NOT ONE ─────────────────────────────
//
// An earlier version collapsed them into one question and mapped a NO onto "something to protect",
// which is incoherent: if breaking it does not matter, there is nothing for the optimizer to protect.
// Whether a behaviour must survive, and whether its exact FORM must survive, are different questions
// and an expert can answer them differently — "always compress the close" with "any compressed form
// will do" is a perfectly ordinary position and the one-axis model could not express it.

export type Materiality =
  /** an otherwise excellent output that did the opposite meaningfully violates the standard */
  | 'REQUIRED'
  /** usually chosen, and another realization can still be excellent */
  | 'PREFERRED'
  /** characteristic of the work; no obligation on any particular output */
  | 'EXEMPLAR_ONLY'
  /** occurs because the expert does not over-polish. Must not be actively generated. */
  | 'TOLERATED'
  /** recurred in this evidence and is not taste */
  | 'INCIDENTAL';

export type RealizationTolerance =
  /** this exact surface form is the point */
  | 'STRICT'
  /** any form achieving the same effect satisfies it */
  | 'FUNCTIONALLY_EQUIVALENT'
  /** the form is incidental; only the invariant matters */
  | 'FLEXIBLE';

export const MATERIALITY_QUESTION =
  'Would violating this materially make an otherwise strong output less aligned with your standard?';
export const TOLERANCE_QUESTION =
  'Does the exact form matter, or would any realization achieving the same thing do?';

/** Only REQUIRED compiles as an obligation the model must satisfy. */
export const compilesAsRequirement = (m: Materiality): boolean => m === 'REQUIRED';

/**
 * TOLERATED is protected, never generated — and it is the ONLY materiality with that shape.
 *
 * "Informal punctuation and typos sometimes remain" must compile as a boundary against over-polishing
 * and never as GENERATE TYPOS. Nothing else in this vocabulary has that asymmetry, which is why it is
 * its own value rather than a flag on another one.
 */
export const protectsRatherThanGenerates = (m: Materiality): boolean => m === 'TOLERATED';

/** What may be shown to the model as an example without being an obligation. */
export const compilesAsExemplar = (m: Materiality): boolean =>
  m === 'EXEMPLAR_ONLY' || m === 'PREFERRED';

/**
 * A candidate carries evidence for a decision AND evidence against it at the same decision site.
 *
 * "No cell proposed the opposite rule" is NOT counterevidence. Discovery proposes what it notices;
 * it does not enumerate what it failed to notice. Five clean transitions without a rhetorical
 * question would never produce "I avoid rhetorical questions" — and those five are exactly what
 * decides whether the behaviour is REQUIRED or merely PREFERRED.
 */
export interface CounterEvidence {
  /** a place the SAME decision site occurred */
  readonly unitId: string;
  /** did the expert take the candidate behaviour there? */
  readonly behaviorPresent: boolean;
  readonly span: string;
}

export interface CounterEvidenceSummary {
  readonly sitesFound: number;
  readonly behaviorPresent: number;
  readonly behaviorAbsent: number;
  /** absent at a site where it applied — the number that decides REQUIRED vs PREFERRED */
  readonly exceptions: readonly CounterEvidence[];
  readonly searched: boolean;
}

/** Not "was an opposite rule proposed" but "did the expert do otherwise where they could have". */
export function summariseCounterEvidence(obs: readonly CounterEvidence[], searched: boolean): CounterEvidenceSummary {
  const absent = obs.filter((o) => !o.behaviorPresent);
  return { sitesFound: obs.length, behaviorPresent: obs.length - absent.length,
    behaviorAbsent: absent.length, exceptions: absent, searched };
}

/**
 * What the same-site evidence SHOWS. Deliberately not a rule, and deliberately not a label.
 *
 * An earlier version carried numeric cutoffs — three sites before the evidence could suggest
 * REQUIRED, a 0.6 rate dividing PREFERRED from EXEMPLAR_ONLY. Those numbers were picked while
 * looking at one author's candidates, which makes them that corpus's shape rather than a law, and a
 * threshold that arrived by hindsight will be applied to everybody.
 *
 * So no cutoff. The counts are reported and the reading is left where it belongs: with the person
 * whose standard it is. Two clean sites and twenty clean sites are different, and a reader can see
 * that difference without being told which side of a line it falls on.
 */
export interface SiteEvidence {
  readonly sitesFound: number;
  readonly behaviorPresent: number;
  readonly behaviorAbsent: number;
  /** null when nothing arose — a proportion of zero sites is not zero, it is undefined */
  readonly rate: number | null;
  readonly reading: string;
}

export function readSiteEvidence(c: CounterEvidenceSummary): SiteEvidence {
  const base = { sitesFound: c.sitesFound, behaviorPresent: c.behaviorPresent, behaviorAbsent: c.behaviorAbsent };
  if (!c.searched) return { ...base, rate: null, reading: 'no same-site search was run, so the evidence says nothing about materiality either way.' };
  if (c.sitesFound === 0) return { ...base, rate: null, reading: 'this decision did not arise anywhere in the passages searched. Absence of the site is not absence of the behaviour.' };
  const rate = c.behaviorPresent / c.sitesFound;
  const where = `arose ${c.sitesFound} time(s); taken ${c.behaviorPresent}, not taken ${c.behaviorAbsent}`;
  return { ...base, rate,
    reading: c.behaviorAbsent === 0
      ? `${where}. No exception was seen — at this many sites, that is consistent with an obligation and equally consistent with a habit.`
      : `${where}. The exception(s) are the part that matters: the decision arose and you chose otherwise.` };
}
