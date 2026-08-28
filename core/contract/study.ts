// atelier/core/contract/study.ts — THE ONE PLACE A BEHAVIOURAL STUDY IS DECIDED.
//
// ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
//
// Every result this programme has published came out of a throwaway script in /tmp. The validity
// gate, the diversity ceiling, arm hashing, the paired bootstrap and the scoring rule lived there
// and nowhere else, while `core/contract/` — which ships — had never executed a study. The
// instrument we trusted and the instrument we shipped were different code, so a paper measured
// something a user could not run and a user ran something the paper had not measured.
//
// ─── THE BOUNDARY, WHICH IS THE POINT ──────────────────────────────────────────────────────────
//
// A study script may choose PARAMETERS: which behaviour, how many contexts, how many generations,
// which arms, the seed, where output lands. It may not implement a SEMANTIC OR STATISTICAL RULE.
// Scoring, validity, diversity, sealing, identity and analysis are decided here, once, and any
// script that reimplements one has forked the instrument.
//
// The parity test holds this: given the same sealed inputs, the study entry point and the product
// contract path must produce the SAME suite hash, arm hashes, validity classifications, per-context
// observations and paired analysis. Not approximately the same.

import { createHash } from 'node:crypto';
import type { InferenceClient } from '../inference/client.js';
import { GenerationIncomplete } from '../inference/client.js';
import { validityFrom, validityFromError, type GenerationValidity } from './run.js';
import { judgeCandidate, worstPair, violatesThreshold, MAX_OVERLAP,
  type DiversityDecision, type DiversityLedger } from './diversity.js';
import { armIdentity, requestShape, runIdentity, type ArmIdentity, type RunIdentity } from './study-identity.js';
import { pairedBootstrap, type ContextRates, type PairedEstimate } from './analysis.js';
import { headroomOf, screenCandidate, type CandidateScreen, type ScreenVerdict } from './headroom.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Which side of a conditional a context is built to exercise. */
export type StudyKind = 'SHOULD_FIRE' | 'SHOULD_NOT_APPLY';

export interface StudyContext {
  readonly contextId: string;
  readonly kind: StudyKind;
  readonly task: string;
}

/**
 * A frozen suite. Once this exists nothing may be added, removed or reworded.
 *
 * The ledger travels with it because a filter whose decisions are unrecorded is a claim about the
 * suite rather than a property of it — a reader must be able to reconstruct candidates generated ->
 * similarity decisions -> what was rejected -> what was sealed.
 */
export interface SealedStudySuite {
  readonly suiteHash: string;
  readonly frozenAt: string;
  readonly contexts: readonly StudyContext[];
  readonly diversity: DiversityLedger;
  readonly worstPairOverlap: number;
}

export class SuiteNotDiverse extends Error {
  constructor(a: string, b: string, overlap: number, threshold: number) {
    super(`${a} and ${b} overlap at ${overlap.toFixed(2)}, above the ${threshold} ceiling this suite `
      + 'claims to have applied. The gate admits against what is accepted so far, so a violating pair '
      + 'can survive while every individual decision looked right. Sealing is refused.');
    this.name = 'SuiteNotDiverse';
  }
}

/**
 * Seal a suite, or refuse.
 *
 * `frozenAt` is supplied rather than read from the clock so the artifact is reproducible: a hash
 * that includes a timestamp nobody passed in cannot be re-derived.
 */
export function sealStudySuite(
  contexts: readonly StudyContext[], decisions: readonly DiversityDecision[], frozenAt: string,
  threshold: number = MAX_OVERLAP,
): SealedStudySuite {
  const asPairs = contexts.map((c) => ({ id: c.contextId, task: c.task }));
  if (violatesThreshold(asPairs, threshold)) {
    const w = worstPair(asPairs)!;
    throw new SuiteNotDiverse(w.a, w.b, w.overlap, threshold);
  }
  return {
    suiteHash: sha(JSON.stringify(contexts)),
    frozenAt,
    contexts,
    diversity: { threshold, decisions },
    worstPairOverlap: worstPair(asPairs)?.overlap ?? 0,
  };
}

/** Re-export so a script reaches the gate through this module rather than reimplementing it. */
export { judgeCandidate, screenCandidate, headroomOf };
export type { CandidateScreen, ScreenVerdict };

// ─── SCORING ───────────────────────────────────────────────────────────────────────────────────

/**
 * Does the output carry a numbered list of two or more items?
 *
 * THE EMPHASIS MARKER IS NOT COSMETIC. The first version required a digit at line start and could
 * not see `**1.` bold-numbered lists; on one run that mislabelled 4 of 144 generations. It moved no
 * conclusion, and it is fixed here because running a study on an instrument known to be blind is
 * indefensible whether or not the blindness happens to matter.
 */
export const hasNumberedList = (text: string): boolean =>
  (text.match(/^\s*(?:[*_]{0,2})\s*\d+[.)]\s*(?:[*_]{0,2})\s*\S/gm) ?? []).length >= 2;

export type StructuralScore = 'CORRECT' | 'WRONG' | 'EXECUTION_INVALID';

/**
 * COMPLETENESS GATES BEHAVIOUR, and it is checked first.
 *
 * A cut-off answer records nothing about what the model would have done. A structural observer
 * reading one returns a confident, well-formed, meaningless label — which is exactly how 54
 * truncated generations became a published coverage effect.
 */
export function scoreStructural(
  kind: StudyKind, validity: GenerationValidity, text: string,
): StructuralScore {
  if (validity !== 'COMPLETE') return 'EXECUTION_INVALID';
  const fired = hasNumberedList(text);
  return kind === 'SHOULD_FIRE' ? (fired ? 'CORRECT' : 'WRONG') : (fired ? 'WRONG' : 'CORRECT');
}

// ─── EXECUTION ─────────────────────────────────────────────────────────────────────────────────

export interface StudyGeneration {
  readonly contextId: string;
  readonly kind: StudyKind;
  readonly arm: string;
  readonly rep: number;
  readonly validity: GenerationValidity;
  readonly structural: StructuralScore;
  readonly outputTokens: number;
  readonly output: string;
}

export interface StudyArm {
  readonly arm: string;
  /** the exact bytes served as the stable block, or null for a control that serves nothing */
  readonly servedText: string | null;
}

/**
 * Run one generation through the product's own validity semantics.
 *
 * The try/catch is the whole reason a study can count truncations while every other caller keeps
 * failing closed: `validityFromError` rethrows anything that is not an incomplete generation, so a
 * bad key cannot become a wall of EXECUTION_INVALID rows that reads as data.
 */
export async function runStudyGeneration(
  client: InferenceClient, arm: StudyArm, ctx: StudyContext, rep: number,
  cfg: { readonly maxTokens: number; readonly toolName: string; readonly schema: Record<string, unknown> },
): Promise<StudyGeneration> {
  const base = { contextId: ctx.contextId, kind: ctx.kind, arm: arm.arm, rep };
  try {
    const r = await client.complete({
      stableBlock: arm.servedText ?? '', variableBlock: '', userMessage: ctx.task,
      toolName: cfg.toolName, toolDescription: 'Produce the requested work.',
      schema: cfg.schema, maxTokens: cfg.maxTokens,
    });
    const out = (r.json as { output?: unknown }).output;
    const text = typeof out === 'string' ? out : '';
    const validity = validityFrom(r.termination, text);
    return { ...base, validity, structural: scoreStructural(ctx.kind, validity, text),
      outputTokens: r.outputTokens, output: text };
  } catch (e) {
    const validity = validityFromError(e);
    return { ...base, validity, structural: 'EXECUTION_INVALID',
      outputTokens: e instanceof GenerationIncomplete ? e.outputTokens ?? 0 : 0, output: '' };
  }
}

// ─── REDUCTION TO THE UNIT OF ANALYSIS ─────────────────────────────────────────────────────────

/**
 * Generations -> one rate per context per arm. THE CONTEXT IS THE UNIT.
 *
 * Invalid generations are excluded from the numerator AND the denominator, so a context whose arm
 * lost a generation reports a rate over what actually ran rather than being silently penalised.
 */
export function toContextRates(gens: readonly StudyGeneration[]): ContextRates[] {
  const byCtx = new Map<string, StudyGeneration[]>();
  for (const g of gens) {
    const list = byCtx.get(g.contextId) ?? [];
    list.push(g); byCtx.set(g.contextId, list);
  }
  return [...byCtx.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([contextId, rows]) => {
    const byArm: Record<string, number> = {};
    const validByArm: Record<string, number> = {};
    for (const arm of [...new Set(rows.map((r) => r.arm))]) {
      const valid = rows.filter((r) => r.arm === arm && r.validity === 'COMPLETE');
      validByArm[arm] = valid.length;
      byArm[arm] = valid.length === 0 ? 0 : valid.filter((r) => r.structural === 'CORRECT').length / valid.length;
    }
    return { contextId, byArm, validByArm };
  });
}

/** The per-stratum estimate. Strata are never averaged into one figure. */
export interface StratumResult {
  readonly kind: StudyKind;
  readonly estimate: PairedEstimate;
  readonly controlRate: number;
}

export function analyseStratum(
  suite: SealedStudySuite, gens: readonly StudyGeneration[], kind: StudyKind,
  treatment: string, control: string, opts: { readonly seed?: number; readonly resamples?: number } = {},
): StratumResult {
  const ids = new Set(suite.contexts.filter((c) => c.kind === kind).map((c) => c.contextId));
  const rows = toContextRates(gens.filter((g) => ids.has(g.contextId)));
  const controlRates = rows.map((r) => r.byArm[control] ?? 0);
  return {
    kind,
    estimate: pairedBootstrap(rows, treatment, control, opts),
    controlRate: controlRates.length ? controlRates.reduce((a, b) => a + b, 0) / controlRates.length : 0,
  };
}

export { armIdentity, requestShape, runIdentity };
export type { ArmIdentity, RunIdentity, ContextRates, PairedEstimate, DiversityLedger };
