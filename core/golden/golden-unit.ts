// atelier/core/golden/golden-unit.ts — A GOLDEN IS A DECISION, NOT A DOCUMENT.
//
// ─── WHY THE DOCUMENT WAS THE WRONG UNIT ───────────────────────────────────────────────────────
//
// Treating a document as the golden produced a requirement of ~21 pieces of matched expert work,
// which is a number no real user has and which answers a question onboarding never asks. It also
// throws away most of what a document contains: one 300-word passage carries a dozen observable
// decisions — how the author opens, orders evidence, handles uncertainty, transitions, closes.
//
// Those twelve are not twelve independent validation trials. They ARE twelve usable observations for
// discovery. Independence governs what may be CLAIMED; it does not govern what may be LEARNED, and
// conflating the two is what made a usable corpus look insufficient.
//
// ─── THE SAME SHAPE FITS EVERY DOMAIN, WHICH IS WHY IT IS THE CORE ONTOLOGY ────────────────────
//
//   prose      technical argument for executives  ->  the actual 600-word section
//   code       bug + repository state + issue     ->  the accepted patch
//   review     proposed change                    ->  the review decision + final implementation
//   contract   counterparty clause + conditions   ->  the redline, fallback or acceptance
//   support    ticket + account state             ->  the approved response
//
// A developer with no essays has a repository, 37 PRs, 12 reviews and 18 accepted fixes. Unitised as
// documents that is one sample. Unitised as decisions it is a large expert-behaviour corpus, and one
// that comes with deterministic sensors — tests, types, lint, review acceptance — which carry part of
// the evaluation burden and leave the taste layer exposed: abstraction boundaries, when a helper
// earns its place, naming, API shape, error strategy, how much to generalize.

import type { Consumption } from '../reference/holdout-integrity.js';

/**
 * What kind of decision this is — an OPEN string, deliberately.
 *
 * The core concept is `context -> expert decision -> artifact/reference -> provenance`. It is not one
 * of six permanent work types, and a closed union would make it one: every new domain would then be a
 * core-ontology change rather than an adapter, and the integrations built against the enum would all
 * have to move. The six below are the adapters registered TODAY.
 */
export type UnitKind = string;

/** The adapters that exist now. Adding one is a registration, never a change to this type. */
export const REGISTERED_UNIT_KINDS = [
  'PROSE_SECTION', 'CODE_CHANGE', 'CODE_REVIEW_DECISION',
  'CONTRACT_REDLINE', 'DECISION_MEMO', 'GENERIC_INPUT_OUTPUT',
] as const;

export type RegisteredUnitKind = typeof REGISTERED_UNIT_KINDS[number];
export const isRegisteredKind = (k: UnitKind): k is RegisteredUnitKind =>
  (REGISTERED_UNIT_KINDS as readonly string[]).includes(k);

/**
 * Where a unit came from, and what has since read it.
 *
 * `consumedBy` is APPEND-ONLY and it is the whole basis of every holdout audit. A unit that cannot
 * say what has read it cannot be reserved, and a reservation that cannot be audited is decoration.
 */
export interface UnitProvenance {
  readonly sourceRef: string;
  /**
   * The artifact or project this decision was taken inside — repository, contract, article.
   *
   * CONSUMER: `independentUnitFor` and every confidence bound. Two decisions sharing a clusterId are
   * correlated, and counting them as two independent observations inflates precision. This is the
   * same law `contextClusteredInterval` already enforces for generations inside a context; carrying
   * it in the data model rather than only in one statistics function is the point.
   */
  readonly clusterId: string;
  /** the decision episode — PR, clause negotiation, section. The finer unit. */
  readonly contextId: string;
  /**
   * WHY this cluster exists. Carried because not every cluster is equally certain, and later
   * analysis must be able to tell them apart.
   *
   * A directory boundary is an OBSERVED STRUCTURAL HEURISTIC, never epistemic truth: a monorepo with
   * `payments/`, `identity/`, `infra/` looks like three projects and may be one for the claim that
   * matters; a directory may equally hold several imported repositories. Recording the basis lets a
   * reader discount a bound that rests on inferred boundaries without discounting one the author
   * declared.
   */
  readonly clusterBasis: ClusterBasis;
  readonly consumedBy: readonly Consumption[];
}

/** How a cluster boundary was arrived at, weakest evidence last. */
export type ClusterBasis =
  /** the person whose corpus it is said so */
  | 'USER_DECLARED'
  /** inferred from directory structure — a heuristic that can be wrong in both directions */
  | 'OBSERVED_DIRECTORY_BOUNDARY'
  /** nothing observable separated the evidence, so it was merged. The safe error direction. */
  | 'SINGLE_CLUSTER_FALLBACK';

/** Here was a situation, and here is what the expert chose to do. */
export interface GoldenUnit {
  readonly unitId: string;
  readonly kind: UnitKind;
  /** the situation */
  readonly context: string;
  /** what was being attempted */
  readonly task: string;
  /** what the expert chose to do, stated as a choice */
  readonly expertAction: string;
  /** the thing produced. THIS is the reference in a held-out test and must never be consumed. */
  readonly artifact: string;
  readonly outcome?: string;
  readonly rationale?: string;
  readonly provenance: UnitProvenance;
}

/**
 * WHICH UNIT IS INDEPENDENT DEPENDS ON WHAT IS BEING CLAIMED. This is the law, not a caveat.
 *
 * Ten PRs from one repository, zero failures, exact one-sided 95% bound:
 *
 *   "reproduces this developer INSIDE THIS REPO"      -> n = 10 episodes -> 26%
 *   "reproduces this developer's judgment ACROSS PROJECTS" -> n = 1 cluster -> 95%
 *
 * Same evidence, same expert, same observed result. The claim moves the denominator, and a system
 * that picks its denominator without naming its claim will always find the flattering one.
 */
export type ClaimScope =
  /** the claim is bounded to the artifact/project the evidence came from */
  | 'WITHIN_CLUSTER'
  /** the claim generalises across artifacts/projects */
  | 'ACROSS_CLUSTERS';

export const independentUnitFor = (scope: ClaimScope): 'contextId' | 'clusterId' =>
  scope === 'WITHIN_CLUSTER' ? 'contextId' : 'clusterId';

/**
 * How many units of the CLAIMED KIND a set supplies. A DENOMINATOR SELECTOR, NOT A SAMPLE SIZE.
 *
 * ─── READ THIS BEFORE PUTTING THE RESULT INTO A CONFIDENCE INTERVAL ────────────────────────────
 *
 * This counts distinct claim units. It does NOT establish that they are independent, and a scope
 * mapping cannot manufacture independence that the evidence does not have. Ten PR decision contexts
 * inside one repository are ten relevant within-repo units AND they remain dependent: they share a
 * codebase, conventions, a review culture and often an author's week. Feeding 10 into an exact
 * binomial as if it were an independent-trial count overstates precision, and the overstatement is
 * invisible in the output.
 *
 * For any interval, use the cluster-aware machinery that already exists —
 * `contextClusteredInterval` in `../comparison/resolution.ts` — which takes per-context differences
 * and computes on the between-cluster variation rather than pretending the nesting away.
 *
 * The name says `claimUnitCount` and not `effectiveN` for exactly this reason: "effective N" is a
 * term of art for a variance-adjusted sample size, and this is not one. A caller reaching for it as
 * an interval's n would be reading the right number for the wrong purpose.
 */
export function claimUnitCount(units: readonly GoldenUnit[], scope: ClaimScope): number {
  const key = independentUnitFor(scope);
  return new Set(units.map((u) => u.provenance[key])).size;
}

/** Is this count also a defensible independent-trial count, or does clustering remain unaccounted? */
export function clusteringUnaccounted(units: readonly GoldenUnit[], scope: ClaimScope): boolean {
  // Only an ACROSS_CLUSTERS claim counts clusters, so its denominator is already one-per-cluster.
  // A WITHIN_CLUSTER claim counting contexts leaves the shared cluster entirely unmodelled.
  return scope === 'WITHIN_CLUSTER' && claimUnitCount(units, scope) > new Set(units.map((u) => u.provenance.clusterId)).size;
}

/** What a person reads when the two numbers differ, which is the case that misleads. */
export function describeEvidence(units: readonly GoldenUnit[], scope: ClaimScope): string {
  const n = claimUnitCount(units, scope);
  const clusters = new Set(units.map((u) => u.provenance.clusterId)).size;
  const caveat = clusteringUnaccounted(units, scope)
    ? `\n  These ${n} are the right DENOMINATOR for the claim and are not independent trials — they `
      + `sit inside ${clusters} artifact(s). Any interval must be computed cluster-aware `
      + `(contextClusteredInterval), never by putting ${n} into a binomial.`
    : '';
  if (n === units.length && !caveat) return `${units.length} claim unit(s).`;
  return `${units.length} decision(s) across ${clusters} artifact(s). For a claim scoped `
    + `${scope === 'ACROSS_CLUSTERS' ? 'ACROSS artifacts' : 'WITHIN one artifact'}, that is `
    + `**${n} claim unit(s)**, not ${units.length}. Decisions inside one artifact remain fully usable `
    + `for discovery; it is the confidence bound they cannot inflate.${caveat}`;
}

/**
 * CONTAMINATION AND CORRELATION ARE DIFFERENT PROPERTIES, AND CONFLATING THEM COSTS REAL EVIDENCE.
 *
 * An earlier version of this module reserved by CLUSTER, on the reasoning that same-cluster evidence
 * is statistically dependent. That is true and it is the wrong rule: it throws away perfectly valid
 * held-out decisions to avoid a dependence that should be handled in the UNCERTAINTY, not by refusing
 * the data.
 *
 * The case it destroys: discovery reads PRs 1-8 of repository R; PRs 9-12 were reserved at intake and
 * their expert patches were never read by anything. For a claim scoped INSIDE repository R those four
 * are valid held-out decision contexts. For a claim scoped ACROSS projects they remain one cluster.
 * Same units, same provenance, two honest readings — and cluster-wide reservation would have made
 * them unusable for either.
 *
 * So the anti-leakage rule stays exactly as strict as it was, and narrows to what it is actually
 * about: CONTAMINATION IS THE UNIT'S OWN REFERENCE HAVING BEEN CONSUMED. Nothing else contaminates.
 */
export type EvidenceState =
  /** nothing has read this unit's reference, and nothing has read anything in its cluster */
  | 'CLEAN'
  /** this unit's reference is untouched; something else in its cluster was consumed */
  | 'CLEAN_BUT_CORRELATED'
  /** this unit's own reference/answer was consumed. The only disqualifying state. */
  | 'CONTAMINATED';

export const isContaminated = (u: GoldenUnit): boolean => u.provenance.consumedBy.length > 0;

/**
 * Classify one unit against the corpus it sits in.
 *
 * `CLEAN_BUT_CORRELATED` is a usable state, not a warning to be cleared. It says: this reference is
 * genuinely untouched, and the confidence interval computed from it must account for the cluster.
 */
export function evidenceStateOf(unit: GoldenUnit, corpus: readonly GoldenUnit[]): EvidenceState {
  if (isContaminated(unit)) return 'CONTAMINATED';
  const clusterTouched = corpus.some((o) =>
    o.unitId !== unit.unitId
    && o.provenance.clusterId === unit.provenance.clusterId
    && isContaminated(o));
  return clusterTouched ? 'CLEAN_BUT_CORRELATED' : 'CLEAN';
}

/** Everything whose own reference is untouched — the reservable set. Correlation does not exclude. */
export const usableAsReference = (corpus: readonly GoldenUnit[]): readonly GoldenUnit[] =>
  corpus.filter((u) => !isContaminated(u));

// ─── WHERE A CLUSTER COMES FROM, AND WHY THE DEFAULT MUST UNDER-CLAIM ──────────────────────────
//
// `clusterId` decides the denominator of every across-artifact claim, so getting it from the wrong
// place does not produce a slightly wrong number — it produces a confident one. Intake originally
// used the FILE as the cluster, which says every file is its own project. Point that at a repository
// and 200 source files become 200 independent projects: `claimUnitCount(units, 'ACROSS_CLUSTERS')`
// returns 200, `clusteringUnaccounted` returns false because nothing looks nested, and the guard
// written to catch exactly this is defeated by the value feeding it.
//
// The asymmetry that settles the default: treating one project as many inflates a claim SILENTLY;
// treating many projects as one deflates it VISIBLY, and a deflated claim can be corrected by the
// person who knows better. So the rule is to claim a boundary only where one is observable.
//
//   nested   `repo-a/src/x.ts` -> cluster `repo-a`. A directory is an observable boundary.
//   flat     `x.md`, `y.md`    -> ONE shared cluster. Adjacency in a folder is not evidence of
//                                 anything: two files side by side may be two projects or two files
//                                 of one, and nothing structural tells them apart.
//
// A person who knows the boundaries states them. The machine never guesses one into existence.

export interface ClusterAssignment {
  readonly clusterOf: (relPath: string) => string;
  /** what was used, for the report AND for the unit's provenance. A silent choice here is the failure. */
  readonly basis: ClusterBasis;
  readonly why: string;
}

/**
 * How much a bound resting on these clusters should be discounted.
 *
 * Not a weight and not a multiplier — a statement a reader acts on. An across-project interval built
 * on inferred directory boundaries is not the same evidence as one built on boundaries the author
 * confirmed, and averaging that difference away is how a soft assumption becomes a hard number.
 */
export const clusterCertainty = (b: ClusterBasis): string => ({
  USER_DECLARED: 'the author declared these boundaries.',
  OBSERVED_DIRECTORY_BOUNDARY: 'boundaries were INFERRED from directory structure. A monorepo may look like several projects and be one; a directory may hold several. Treat an across-project claim as resting on that inference.',
  SINGLE_CLUSTER_FALLBACK: 'no boundary was observable, so everything was merged into one. Any across-project claim is therefore bounded at n=1 — understated by construction, never inflated.',
}[b]);

/**
 * Derive the cluster rule from the corpus layout.
 *
 * `perFileAsserted` is the escape hatch for a user who genuinely has one project per file and says
 * so. It is never the default, because it is the only setting that can manufacture independence.
 */
export function clusterAssignment(
  relPaths: readonly string[], perFileAsserted = false,
): ClusterAssignment {
  if (perFileAsserted) {
    return { clusterOf: (p) => p, basis: 'USER_DECLARED',
      why: 'you asserted one project per file. Every across-project claim will count files as independent projects — correct only if they really are.' };
  }
  const seg = (p: string): string | null => {
    const i = p.replace(/\\/g, '/').indexOf('/');
    return i > 0 ? p.slice(0, i) : null;
  };
  const dirs = relPaths.map(seg);
  if (dirs.some((d) => d !== null)) {
    const named = [...new Set(dirs.filter((d): d is string => d !== null))];
    return { clusterOf: (p) => seg(p) ?? '(root)', basis: 'OBSERVED_DIRECTORY_BOUNDARY',
      why: `grouped by top-level directory: ${named.join(', ')}${dirs.some((d) => d === null) ? ', and (root) for the loose files' : ''}. A directory is an observable project boundary.` };
  }
  return { clusterOf: () => '(one corpus)', basis: 'SINGLE_CLUSTER_FALLBACK',
    why: 'every piece sits in one flat folder, so nothing observable separates them into projects. They are counted as ONE — which UNDERSTATES independence rather than inventing it. If they really are separate projects, put each in its own directory or pass --cluster-per-file.' };
}
