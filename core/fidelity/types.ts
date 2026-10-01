// atelier/core/fidelity/types.ts — THE SHAPES THE FIDELITY LOOP SHARES.
//
// The standard says what good is, and only the owner moves it. Everything here is below it: where a
// skill's outputs sit against the author's own range, how sure a stylometric detector is that a text was
// written by a model, and which implementation release produced an output. Each piece is recorded with
// the output it describes, so a run can be replayed and a change can be undone.
//
// THE TARGET IS THE AUTHOR'S RANGE, NEVER THE AUTHOR'S MEAN. Imitations already sit nearer an author's
// average than the author's own pieces do (Burrows' Delta put imitations nearer the mean in 28 of 28
// pairs in one study), so pulling a draft toward the typical value makes it more typical than the
// author, and more detectable. A feature is held inside the band the author's pieces span, and across
// many outputs its spread should match the author's spread.
//
// TARGETS ARE CONDITIONAL. A one-line reply and a 3,000-word essay by the same author do not share a
// paragraph length. Bands are estimated per context class where the author has enough pieces in that
// class, and pooled otherwise; the class is decided from the request and the output's length alone.

/** The context classes a band can be conditioned on. Length is the only axis with enough data per author. */
export type ContextClass = 'short' | 'medium' | 'long' | 'longform';
export const CONTEXT_CLASSES: readonly ContextClass[] = ['short', 'medium', 'long', 'longform'];

/** Below this many of the author's pieces in a class, that class's band is the pooled one. */
export const CLASS_MIN_PIECES = 6;

/** The class of a text of `words` prose words: under 150, under 600, under 2,000, and longer. */
export function contextClassOf(words: number): ContextClass {
  return words < 150 ? 'short' : words < 600 ? 'medium' : words < 2000 ? 'long' : 'longform';
}

/**
 * One feature's target: the author's band (10th to 90th percentile, widened as in ../observers/selection.ts),
 * their median and their spread, for one class or pooled ('all').
 *
 *   RULE     checked on every output (a REQUIRED or PREFERRED rule in the standard holds it)
 *   SIGNAL   chooses between drafts and steers the inner loop; never fails an output on its own
 *   MONITOR  recorded and estimated across outputs, never steers (not yet qualified to)
 */
export interface FeatureBand {
  readonly id: string;
  readonly cls: ContextClass | 'all';
  readonly band: readonly [number, number];
  readonly median: number;
  /** the author's own standard deviation on this feature, across their pieces in the class */
  readonly spread: number;
  /** how many of the author's pieces measured it */
  readonly n: number;
  readonly role: 'RULE' | 'SIGNAL' | 'MONITOR';
  /** separation from the model's plain drafts on the pieces it was selected on (AUC, author above model) */
  readonly auc: number | null;
  /**
   * Selection found it strong enough to propose as a rule to the owner. Such a feature steers only if the
   * owner ratified it (then as RULE, with the ratified band); rejected or not adopted, it is only monitored.
   */
  readonly proposable?: true;
}

/**
 * A stylometric detector: a logistic regression over function-word and character n-gram rates, trained
 * on the author's pieces against model imitations, with a Platt calibration fitted on held-out folds.
 * Deterministic to score. It is a MONITOR: recorded on every output and estimated across outputs, at most
 * a low-weight tie-breaker between drafts, never a requirement (it has not been shown to be independent of
 * content, and an instrument steered toward is no longer an instrument to judge by).
 */
export interface DetectorModel {
  readonly kind: 'stylometric-lr';
  /** hash of everything below: the detector an output was scored by is named by it */
  readonly version: string;
  /** the feature names, in weight order: `w:<word>` for a word rate, `c:<ngram>` for a character n-gram rate */
  readonly features: readonly string[];
  readonly weights: readonly number[];
  readonly bias: number;
  /** standardisation, per feature, from the training texts */
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  /** Platt scaling of the raw logit into P(model-written) */
  readonly platt: { readonly a: number; readonly b: number };
  readonly trainedOn: { readonly author: number; readonly model: number };
  /** cross-validated AUC with sources held out (null when too few texts to fold) */
  readonly cvAuc: number | null;
}

/** Where one text sits: the class, every feature's value, how many of the steering bands it is inside. */
export interface FidelityReading {
  readonly cls: ContextClass;
  /** the band set it was read against (pooled when the class had too few pieces) */
  readonly bandsFrom: ContextClass | 'all';
  readonly values: Readonly<Record<string, number | null>>;
  /** features measured and inside their band, over RULE and SIGNAL bands only */
  readonly inBand: number;
  readonly measured: number;
  /** ids outside their band, worst first, with the distance in band-widths */
  readonly outside: readonly { readonly id: string; readonly distance: number; readonly direction: 'low' | 'high' }[];
  /** the detector's reading, when the skill has one: P(model-written), and which detector */
  readonly detector: { readonly p: number; readonly version: string } | null;
}

/** The author's fidelity profile, stored with the skill at build time. */
export interface FidelityProfile {
  readonly version: 1;
  readonly corpusHash: string;
  readonly bands: readonly FeatureBand[];
  readonly detector: DetectorModel | null;
  /**
   * specifics per 100 words in the author's own pieces (median; ../loop/fact-ledger.ts): the density a draft
   * reaches by using the facts it was GIVEN, never by producing specific-looking text
   */
  readonly factDensity?: number | null;
  /**
   * What each deterministic operator (./operators.ts) does to each feature, measured on the model's own drafts
   * at discovery: operator id → feature id → mean change per application and how many applications.
   */
  readonly effects?: Readonly<Record<string, Readonly<Record<string, { readonly mean: number; readonly n: number }>>>>;
  /** hash of bands and detector, recorded with every reading */
  readonly hash: string;
}

/**
 * A lesson about how to MEET the standard, distilled from comparing drafts the sensors scored apart.
 * Implementation, never a rule: it never says what good is, only what helped a draft land inside the
 * author's range. Kept only while it keeps helping (`evidence`).
 */
export interface ExperienceNote {
  readonly id: string;
  /** at most 32 words */
  readonly text: string;
  readonly cls: ContextClass | 'all';
  /** the features it was distilled for */
  readonly features: readonly string[];
  /** comparisons it was distilled from, and the mean in-band gain of the winners */
  readonly evidence: { readonly pairs: number; readonly gain: number };
}

/** Settings an implementation release may change. None of them can move the standard. */
export interface ImplementationSettings {
  /** drafts written per output */
  readonly drafts: number;
  /** paragraph-level redrafts allowed per output, against the worst band */
  readonly editBudget: number;
  /** passages of the author's retrieved per output, closest to the request (0: off) */
  readonly retrievalK: number;
  /** experience notes served (0: off) */
  readonly notesCap: number;
  readonly temperature?: number;
}

/**
 * THE DEFAULT IS 0.7'S COST. B6 ran the full loop against 0.7's settings and it did not move the author's range
 * (20 structural edits tried, none kept; in range 0.733 against 0.738) at 3.3 times the cost. Until a study shows
 * it pays, the loop is opt-in (decision 0007): two drafts, no edits, the author's closest passages retrieved,
 * no experience notes.
 */
export const DEFAULT_SETTINGS: ImplementationSettings = { drafts: 2, editBudget: 0, retrievalK: 3, notesCap: 0 };

/** The full loop, opt-in: `invoke --fidelity`, or `atelier fidelity --set drafts=4,editBudget=2,notesCap=6`. */
export const LOOP_SETTINGS: ImplementationSettings = { drafts: 4, editBudget: 2, retrievalK: 3, notesCap: 6 };

/**
 * AN IMPLEMENTATION RELEASE: everything below the standard that shaped an output, frozen and hashed.
 * The standard's hash and the skill version are named, never changed. A change is a new release with a
 * parent; rollback is pointing back at the parent. Mutable background state is not allowed: whatever the
 * loop learned is in a release, or it did not shape an output.
 */
export interface ImplementationRelease {
  /** hash of every field below except createdAt and why */
  readonly id: string;
  readonly parent: string | null;
  readonly standardVersionHash: string;
  readonly skillVersionHash: string;
  readonly settings: ImplementationSettings;
  readonly notes: readonly ExperienceNote[];
  /** the fidelity profile it steers against */
  readonly profileHash: string | null;
  /** the retrieval index over the author's passages */
  readonly retrievalHash: string | null;
  readonly createdAt: string;
  readonly why: string;
}

/** Recorded with every invocation: enough to replay how the output was steered. */
export interface FidelityRecord {
  /** the release that steered, or null when the run overrode its settings (then it is not that release's evidence) */
  readonly release: string | null;
  /** the settings that actually ran */
  readonly settings?: ImplementationSettings;
  readonly profileHash: string | null;
  readonly seed: number;
  readonly reading: FidelityReading | null;
  /** readings of every draft before selection, in the order written */
  readonly drafts?: readonly FidelityReading[];
  /**
   * every application of an actuator against a band (./structural.ts), kept or not: which actuator, the target
   * feature, its value before and after, and why it was kept or refused
   */
  readonly edits?: readonly { readonly target: string; readonly kept: boolean; readonly why: string;
    readonly actuator?: string; readonly before?: number | null; readonly after?: number | null }[];
  /** the passages retrieved for this request, by index into the author's passages */
  readonly retrieved?: readonly number[];
  /** how many of the facts the request and the bound material supplied the output used, and its density per 100 words */
  readonly coverage?: { readonly supplied: number; readonly used: number; readonly per100: number; readonly authorPer100: number | null };
  /** each requirement: applied to this output, not applicable to it, or waived with the reason */
  readonly applicability?: readonly { readonly requirementId: string; readonly status: 'APPLIED' | 'NOT_APPLICABLE' | 'WAIVED'; readonly why?: string }[];
}
