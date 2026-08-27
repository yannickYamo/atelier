// atelier/core/distinctiveness/floor.ts — THE ANTI-COLLAPSE GATE. PORTED, AND UNQUALIFIED.
//
//   from   the frozen comparator in the private predecessor (+ its Welch implementation)
//   audit  a transfer audit of that port concluded PARTIALLY_TRANSFERS
//
// An earlier pass reported distinctiveness "confirmed absent everywhere". It was not: I searched for the
// NAME (TSR, distinctiveness) instead of the FUNCTION — what stops a candidate regressing what made
// the work distinctive. This is that.
//
// ─── THE MECHANISM TRANSFERS. THE QUALIFICATION DOES NOT. ──────────────────────────────────────
//
// What is ported: three-way verdict with INCONCLUSIVE first-class, non-inferiority against a margin,
// fail-closed on an unscored dimension, one owner for the floor, and margins that are product
// quantities rather than functions of instrument noise.
//
// What is NOT ported, deliberately: the four ratified dimensions of that system and their margins,
// and the ~0.4% false-alarm evidence measured on them. Different estimand, different baseline,
// different output distribution, incommensurable qualification unit. **Recovering an instrument is
// not inheriting its qualification**, so this arrives UNQUALIFIED and the gate reports UNQUALIFIED
// rather than MISSING — an honest state change, not an earned one.
//
// ─── AND IT ABSTAINS, WHICH IS THE POINT WORTH CARRYING ────────────────────────────────────────
//
// INCONCLUSIVE is reachable here because it is COMPUTED — an interval spanning the margin — rather
// than ELICITED. Three model-based instruments produced zero abstentions across 150 observations
// because uncertainty was asked for as a second-order judgement they would not make. Prefer
// uncertainty derived from evidence and resolution over uncertainty a model self-reports, wherever
// the former is available.
//
// THE HISTORICAL DEFECTS ARE PORTED AS FIXED, and named so nobody restores them:
//   F1  it used to skip any protected dim the candidate did not carry and return [], which the
//       caller read as "floor held" having evaluated NOTHING. Now an unscored dim THROWS.
//   F2  the floor had three owners and had already drifted. QualityFloorContract is the one.
//   F2b it was a boolean candidateMean < frozenMean at tolerance 0 — a coin flip under a true null,
//       disqualifying roughly three in four quality-NEUTRAL candidates across two dims. The live
//       problem was false alarms, never sensitivity.

import { tCrit, welchDiff, sampleFrom, type Sample } from './stats.js';

export type DimScores = Record<string, number>;

// ── The floor contract: ONE owner, per-dimension margins ──────────────────────────────────────

export type FloorVerdict = 'REGRESSION' | 'NONINFERIOR' | 'INCONCLUSIVE';

/**
 * ENFORCE — this dim can block a candidate.
 * OBSERVE  — measured and reported, never blocks. The gate-registry posture, applied one level up:
 *            a dim whose enforcement is not earned is watched, not obeyed.
 */
export type GateRole = 'ENFORCE' | 'OBSERVE';

export interface DimensionFloor {
  /**
   * How much degradation on this dimension is acceptable in exchange for a target improvement.
   *
   * THIS IS A PRODUCT/EXPERT QUANTITY AND IS NEVER DERIVED FROM MEASUREMENT NOISE. Setting the
   * margin from the instrument's SD lets the instrument define the target, which is the precise
   * inversion this whole program exists to prevent. Noise determines how OFTEN the floor can reach
   * a verdict; it does not determine what counts as a regression.
   */
  readonly nonInferiorityMargin: number;
  readonly gateRole: GateRole;
  /** Why this number and this role. Carried with the value so the two cannot separate. */
  readonly rationale: string;
}

export interface QualityFloorContract {
  /** The single instrument. `scoreDimensionByPolicy` is the I-SER5-locked dimension->model path. */
  readonly instrument: 'scoreDimensionByPolicy';
  readonly dimensions: Readonly<Record<string, DimensionFloor>>;
}

/**
 * THE QUALITY FLOOR CONTRACT.
 *
 * ─── EVERY DIMENSION STARTS AT OBSERVE, AND NONE IS PRE-SELECTED FOR ENFORCE ──────────────────
 *
 * A dimension may not be nominated for ENFORCE before its operating envelope has been measured.
 * Naming a favourite in advance is how a result gets read to confirm a choice already made — the
 * envelope decides, or it decided nothing. An earlier draft of this comment called one dimension
 * "the strongest candidate for the first promotion"; that sentence was exactly the pre-selection
 * this rule forbids, and it is gone.
 *
 * A dimension that is also the loop's OPTIMIZATION TARGET is permanently OBSERVE rather than
 * pending. Guarding the objective with the floor double-counts it.
 *
 * ─── WHY OBSERVE IS THE CORRECT PRE-QUALIFICATION STATE ───────────────────────────────────────
 *
 * The gate registry one level down refuses to let a sensor ENFORCE without a qualification record,
 * because an unqualified semantic checker was once measured firing on almost every cell of a set an
 * expert had marked perfect. That rule does not stop applying because the sensor moved up a layer.
 * A dimension never qualified against expert labels would be the same unearned authority, committed
 * one level up.
 *
 * A contract with nothing enforced yields INCONCLUSIVE, never NONINFERIOR (see
 * `evaluateQualityFloor`). That is the correct pre-qualification state: the floor abstains, the loop
 * routes to human review, and nothing is auto-promoted on an instrument of unknown sensitivity.
 *
 * ─── SATURATION DISQUALIFIES A TARGET, NOT A GUARD ────────────────────────────────────────────
 *
 * A dimension whose spread is small relative to the minimum detectable effect at the available N is
 * SATURATED: it cannot evidence an IMPROVEMENT. That says nothing against using it as a floor,
 * because a floor only ever asks about regressions and the downward direction is unobstructed.
 *
 * Under the three-state rule a margin tighter than the noise does NOT manufacture false regressions
 * — it produces INCONCLUSIVE. A tight margin is therefore SAFE and merely uninformative; its cost is
 * abstention rate, not false rejection, and that rate is a thing to measure rather than assume.
 */
/**
 * THERE IS NO DEFAULT CONTRACT, AND THAT IS THE PORT'S MAIN EDIT.
 *
 * The system this was ported from ships a fixed set of ratified dimensions with fixed margins.
 * Shipping those here would hand every Atelier user a floor built for someone else's work, with
 * margins ratified by someone else, and would make the gate look configured when nothing about
 * their standard had been measured. The margins are PRODUCT quantities: they say how much degradation a person accepts in
 * exchange for a gain, which is a judgement only that person can make.
 *
 * So a contract must be constructed per standard, and constructing one is the work
 * BUILD_DISTINCTIVENESS_BASELINE names. Until then the gate reports UNQUALIFIED and PROMOTE stays
 * unreachable.
 */
export function requireFloorContract(contract: QualityFloorContract | null): QualityFloorContract {
  if (!contract || Object.keys(contract.dimensions).length === 0) {
    throw new Error(
      'DISTINCTIVENESS: no floor contract for this standard. The dimensions that must not regress, and '
      + 'how much regression is acceptable on each, are the author\'s judgement and cannot be defaulted '
      + 'from another product\'s ratified margins. Build a baseline first.');
  }
  return contract;
}

/** What the gate may report today. EARNED is absent because nothing has earned it. */
export type DistinctivenessState = 'MISSING' | 'UNQUALIFIED' | 'EARNED';

/**
 * The gate's honest state.
 *
 * MISSING meant "no instrument exists", which stopped being true when this module was ported.
 * UNQUALIFIED means the mechanism is here and has earned nothing on this standard — a real state
 * change, and not an improvement.
 *
 * EARNED requires a qualification RECORD, not the presence of a contract and a baseline. Having the
 * apparatus is what makes a measurement possible; it is not the measurement. The distinction is the
 * same one the observer campaign spent two months learning, and the parameter is separate so the two
 * cannot be conflated by a caller who has built a baseline and feels finished.
 */
export interface FloorQualification {
  /** the estimand the false-alarm rate was measured on — never inherited from another product */
  readonly estimand: string;
  readonly falseAlarmUpper95: number;
  readonly independentContexts: number;
  readonly decidedAt: string;
}

export function gateState(
  contract: QualityFloorContract | null,
  frozenBaselineExists: boolean,
  qualification: FloorQualification | null,
): { readonly state: DistinctivenessState; readonly why: string } {
  if (!contract || Object.keys(contract.dimensions).length === 0) {
    return { state: 'UNQUALIFIED', why: 'the mechanism exists; no dimensions have been ratified for this standard, so there is nothing to hold still' };
  }
  if (!frozenBaselineExists) {
    return { state: 'UNQUALIFIED', why: 'dimensions are ratified and nothing has been scored and frozen to compare against' };
  }
  if (!qualification) {
    return { state: 'UNQUALIFIED', why: 'a contract and a baseline exist and no false-alarm rate has been measured on THIS estimand — having the apparatus is not the measurement' };
  }
  return { state: 'EARNED', why: `false-alarm upper bound ${(qualification.falseAlarmUpper95 * 100).toFixed(1)}% over ${qualification.independentContexts} independent context(s) on: ${qualification.estimand}` };
}

// ── The frozen baseline ────────────────────────────────────────────────────────────────────────

/** One cluster/fixture's frozen scores, captured at N>=3 (the immovable floor). */
export interface FrozenBaselineEntry {
  clusterId: string;
  fixtureContextId: string;
  nGen: number;
  /**
   * The RESOLVED model snapshot these scores were captured under.
   *
   * WHY THIS IS REQUIRED (P2.1). A frozen baseline is only a valid comparator for candidates fired
   * under the SAME model. Under a model migration the champion's own scores move, so comparing a
   * new-model candidate against an old-model champion measures the edit AND the model change
   * together and attributes the sum to the edit. That is silent invalidity of exactly the comparison
   * the model-migration regime depends on — and model migration is the regime most likely to be
   * granted autonomy first, which makes this the worst possible place to be wrong quietly.
   *
   * On a migration the champion MUST be re-fired under the new model. `evaluateQualityFloor` refuses
   * the comparison rather than silently confounding it.
   *
   * Optional on the type because historical records predate the requirement; the evaluator fails
   * closed when a candidate model is supplied and this is absent.
   */
  capturedUnderModel?: string;
  meanScores: DimScores;
  /**
   * Per-fire scores per dim. REQUIRED for a floor verdict: a three-state decision needs the spread,
   * and a baseline that carries only means cannot support one. Optional on the type because historical
   * records predate the requirement; `evaluateQualityFloor` fails closed when it is absent.
   */
  perFireScores?: Record<string, readonly number[]>;
}

/** Look up a cluster+fixture's frozen entry (throws — a missing baseline must FAIL CLOSED). */
export function requireFrozenEntry(
  set: readonly FrozenBaselineEntry[],
  clusterId: string,
  fixtureContextId: string,
): FrozenBaselineEntry {
  const e = set.find((x) => x.clusterId === clusterId && x.fixtureContextId === fixtureContextId);
  if (!e) {
    throw new Error(
      `I-EV-FLOOR-ANCHORED: no frozen baseline for ${clusterId}/${fixtureContextId}. `
      + `A fresh-fire fallback is prohibited: comparing a candidate against a baseline measured from the `
      + `same run would compare it with itself. Freeze a baseline for this cluster first.`,
    );
  }
  return e;
}

// ── The three-state floor ──────────────────────────────────────────────────────────────────────

export interface DimFloorResult {
  readonly dim: string;
  readonly verdict: FloorVerdict;
  readonly gateRole: GateRole;
  readonly margin: number;
  /** candidate mean − frozen mean. Negative = candidate scored lower. */
  readonly delta: number;
  /** One-sided 95% bounds on the delta (Welch). */
  readonly lowerBound: number;
  readonly upperBound: number;
}

export interface QualityFloorResult {
  readonly perDim: readonly DimFloorResult[];
  /** Determined by ENFORCE dims only; OBSERVE dims are measured and never block. */
  readonly composite: FloorVerdict;
  /** Which ENFORCE dims drove the composite. Empty when composite is NONINFERIOR. */
  readonly drivenBy: readonly string[];
}

/**
 * One dimension's verdict.
 *
 *   REGRESSION    evidence supports  d < −m   (upper 95% bound still below −m)
 *   NONINFERIOR   evidence supports  d > −m   (lower 95% bound still above −m)
 *   INCONCLUSIVE  the interval spans −m; the data cannot separate the two
 *
 * The two tests are one-sided at 95% and mutually exclusive by construction, so exactly one of the
 * three states always applies.
 */
export function dimensionVerdict(candidate: Sample, frozen: Sample, margin: number): {
  verdict: FloorVerdict; delta: number; lowerBound: number; upperBound: number;
} {
  const delta = candidate.mean - frozen.mean;
  const { se, df } = welchDiff(candidate, frozen);
  const t = tCrit(df, 0.95);
  const lowerBound = delta - t * se;
  const upperBound = delta + t * se;
  const verdict: FloorVerdict =
    upperBound < -margin ? 'REGRESSION'
      : lowerBound > -margin ? 'NONINFERIOR'
        : 'INCONCLUSIVE';
  return { verdict, delta, lowerBound, upperBound };
}

/**
 * Evaluate a candidate against the frozen champion under a floor contract.
 *
 * FAILS CLOSED (F1). Every dimension named by the contract must be scored on BOTH sides with per-fire
 * spread. A missing dim, a missing frozen `perFireScores`, or a single-fire arm THROWS — it never
 * degrades to "floor held". Silence is not evidence of non-regression.
 *
 * Composite is lexicographic over ENFORCE dims: any REGRESSION -> REGRESSION; else any INCONCLUSIVE
 * -> INCONCLUSIVE; else NONINFERIOR. INCONCLUSIVE is terminal and is NEVER rewritten as REGRESSION —
 * that collapse is what the acceptance-authority experiment demonstrated the cost of.
 */
export function evaluateQualityFloor(
  candidatePerFire: Record<string, readonly number[]>,
  frozen: FrozenBaselineEntry,
  contract: QualityFloorContract,
  /** The model the CANDIDATE was fired under. Supply it and the comparator checks comparability. */
  candidateModel?: string,
): QualityFloorResult {
  const dims = Object.keys(contract.dimensions);
  if (dims.length === 0) {
    throw new Error('I-EV-FLOOR-ANCHORED: the floor contract declares no dimensions — an empty floor cannot hold (fail closed).');
  }
  // MODEL COMPARABILITY. A frozen baseline is a comparator only for its own model.
  if (candidateModel !== undefined) {
    if (frozen.capturedUnderModel === undefined) {
      throw new Error(
        `I-EV-FLOOR-ANCHORED: the frozen baseline for ${frozen.clusterId}/${frozen.fixtureContextId} does not record which `
        + `model it was captured under, so it cannot be shown comparable to a candidate fired under "${candidateModel}" `
        + '(fail closed). Re-freeze with the model recorded.',
      );
    }
    if (frozen.capturedUnderModel !== candidateModel) {
      throw new Error(
        `I-EV-FLOOR-ANCHORED: model mismatch — the frozen baseline was captured under "${frozen.capturedUnderModel}" and the `
        + `candidate was fired under "${candidateModel}". Comparing them measures the edit AND the model change and credits `
        + 'the sum to the edit. Re-fire the CHAMPION under the new model and re-freeze before comparing (fail closed).',
      );
    }
  }

  if (!frozen.perFireScores) {
    throw new Error(
      `I-EV-FLOOR-ANCHORED: frozen baseline ${frozen.clusterId}/${frozen.fixtureContextId} carries no perFireScores — `
      + 'a three-state verdict needs the spread, and a mean-only floor cannot express uncertainty (fail closed). Re-freeze to capture it.',
    );
  }

  const perDim: DimFloorResult[] = [];
  for (const dim of dims) {
    const cFires = candidatePerFire[dim];
    const fFires = frozen.perFireScores[dim];
    if (!cFires || cFires.length < 2) {
      throw new Error(
        `I-EV-FLOOR-ANCHORED: contract dimension "${dim}" is unscored on the CANDIDATE (got ${cFires ? `n=${cFires.length}` : 'nothing'}) — `
        + 'an unmeasured protected dimension must never read as "floor held" (fail closed). Score it, or remove it from the contract.',
      );
    }
    if (!fFires || fFires.length < 2) {
      throw new Error(
        `I-EV-FLOOR-ANCHORED: contract dimension "${dim}" is unscored on the FROZEN baseline ${frozen.clusterId}/${frozen.fixtureContextId} `
        + `(got ${fFires ? `n=${fFires.length}` : 'nothing'}) — fail closed. Re-freeze with this dimension included.`,
      );
    }
    const { nonInferiorityMargin: margin, gateRole } = contract.dimensions[dim];
    const r = dimensionVerdict(sampleFrom(cFires), sampleFrom(fFires), margin);
    perDim.push({ dim, gateRole, margin, ...r });
  }

  const enforced = perDim.filter((d) => d.gateRole === 'ENFORCE');
  // A contract with NOTHING enforced cannot certify non-inferiority — it measured only dims that are
  // not allowed to block. Reading that as "floor held" is F1 wearing a different hat: an absence of
  // enforcement is not evidence of non-regression. It abstains.
  if (enforced.length === 0) {
    return { perDim, composite: 'INCONCLUSIVE', drivenBy: [] };
  }
  const regressed = enforced.filter((d) => d.verdict === 'REGRESSION');
  const unresolved = enforced.filter((d) => d.verdict === 'INCONCLUSIVE');
  const composite: FloorVerdict =
    regressed.length ? 'REGRESSION' : unresolved.length ? 'INCONCLUSIVE' : 'NONINFERIOR';
  const drivenBy = (regressed.length ? regressed : unresolved).map((d) => d.dim);

  return { perDim, composite, drivenBy };
}

// ── PAIRED evaluation is the inference unit ───────────────────────────────────────────────────
//
// `evaluateQualityFloor` above compares two INDEPENDENT arms. That is the wrong unit for P2.1, which
// runs the candidate and the champion over the SAME contexts: the correct statistic is the paired
// per-context difference, which removes context-level variance rather than carrying it as noise.
// Ignoring the pairing understates power and inflates the abstention rate.
//
// The independent unit is the CONTEXT. A bundle of N contexts contributes N paired differences —
// never one per generation, and never one per derived comparison. In the retrospective qualification
// this is what stops 468 within-context pairs from being read as 468 observations when they rest on
// 20 contexts.

/**
 * One dimension's verdict from PAIRED per-context differences `dᵢ = candidate(i) − champion(i)`.
 * One-sample non-inferiority against `−margin`, df = n−1. Same three states, same rule: the interval
 * spanning `−margin` is INCONCLUSIVE, and INCONCLUSIVE is terminal.
 */
export function pairedDimensionVerdict(diffs: readonly number[], margin: number): {
  verdict: FloorVerdict; delta: number; lowerBound: number; upperBound: number; n: number;
} {
  if (diffs.length < 2) {
    throw new Error(`I-EV-FLOOR-ANCHORED: paired evaluation needs >=2 contexts, got ${diffs.length} (fail closed).`);
  }
  const n = diffs.length;
  const delta = diffs.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(diffs.reduce((a, d) => a + (d - delta) ** 2, 0) / (n - 1));
  const se = s / Math.sqrt(n);
  const t = tCrit(n - 1, 0.95);
  const lowerBound = delta - t * se;
  const upperBound = delta + t * se;
  const verdict: FloorVerdict =
    upperBound < -margin ? 'REGRESSION'
      : lowerBound > -margin ? 'NONINFERIOR'
        : 'INCONCLUSIVE';
  return { verdict, delta, lowerBound, upperBound, n };
}

/**
 * The composite floor over a bundle of paired contexts. `diffsByDim[dim][i]` is the candidate-minus-
 * champion difference on context i. Fails closed on any contract dimension the bundle does not carry,
 * exactly as the unpaired path does; a contract with nothing enforced abstains.
 */
export function evaluatePairedQualityFloor(
  diffsByDim: Record<string, readonly number[]>,
  contract: QualityFloorContract,
): QualityFloorResult {
  const dims = Object.keys(contract.dimensions);
  if (dims.length === 0) {
    throw new Error('I-EV-FLOOR-ANCHORED: the floor contract declares no dimensions — an empty floor cannot hold (fail closed).');
  }
  const perDim: DimFloorResult[] = [];
  for (const dim of dims) {
    const d = diffsByDim[dim];
    if (!d || d.length < 2) {
      throw new Error(
        `I-EV-FLOOR-ANCHORED: contract dimension "${dim}" has ${d ? `${d.length} paired context(s)` : 'no paired differences'} — `
        + 'an unmeasured protected dimension must never read as "floor held" (fail closed).',
      );
    }
    const { nonInferiorityMargin: margin, gateRole } = contract.dimensions[dim];
    const { n: _n, ...r } = pairedDimensionVerdict(d, margin);
    perDim.push({ dim, gateRole, margin, ...r });
  }
  const enforced = perDim.filter((x) => x.gateRole === 'ENFORCE');
  if (enforced.length === 0) return { perDim, composite: 'INCONCLUSIVE', drivenBy: [] };
  const regressed = enforced.filter((x) => x.verdict === 'REGRESSION');
  const unresolved = enforced.filter((x) => x.verdict === 'INCONCLUSIVE');
  const composite: FloorVerdict =
    regressed.length ? 'REGRESSION' : unresolved.length ? 'INCONCLUSIVE' : 'NONINFERIOR';
  return { perDim, composite, drivenBy: (regressed.length ? regressed : unresolved).map((x) => x.dim) };
}

/** One line a human can read. The floor explains itself or it is not auditable. */
export function explainFloor(r: QualityFloorResult): string {
  const head =
    r.composite === 'REGRESSION' ? `REGRESSION on ${r.drivenBy.join(', ')} — revert`
      : r.composite === 'INCONCLUSIVE' ? `INCONCLUSIVE on ${r.drivenBy.join(', ')} — not enough evidence either way; needs review or more samples (this is NOT a rejection)`
        : 'NONINFERIOR — the candidate is not demonstrably worse on any enforced dimension';
  const detail = r.perDim
    .map((d) => `${d.dim}${d.gateRole === 'OBSERVE' ? ' (observe)' : ''}: Δ${d.delta.toFixed(3)} [${d.lowerBound.toFixed(3)}, ${d.upperBound.toFixed(3)}] vs margin −${d.margin} → ${d.verdict}`)
    .join('\n  ');
  return `${head}\n  ${detail}`;
}
