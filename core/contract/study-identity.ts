// atelier/core/contract/study-identity.ts — WHAT A RUN WAS, RECONSTRUCTIBLE FROM THE ARTIFACT.
//
// ─── "SAME SKILL BYTES" IS NOT ENOUGH, AND WE HAVE THE RECEIPT ─────────────────────────────────
//
// A pre-flight check found two arms that were supposed to differ in one sentence differing in 28
// lines: one had been rendered from a hand-built fixture and carried a different standardVersion and
// mintedAt in its trailing comment. The study had already run. The metadata sat in an HTML comment
// and very likely changed nothing — but "very likely" is not the standard for a controlled
// comparison, and the only reason it was caught is that somebody diffed the files by hand.
//
// Separately, the adapter's cache_control on an empty system block made the BARE arm unrunnable
// against a real provider. The arm's LOGICAL definition was right; what reached the API was not.
//
// So identity is over the bytes the model actually sees AND the request configuration that carried
// them. An arm label is a name for an intention; a hash over served bytes plus request shape is a
// fact about what happened.

import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

export interface ArmIdentity {
  readonly arm: string;
  /** hash of the exact bytes served to the model as the stable block. `null` when nothing was served. */
  readonly servedHash: string | null;
  readonly servedBytes: number;
}

export const armIdentity = (arm: string, servedText: string | null): ArmIdentity => ({
  arm,
  servedHash: servedText === null || servedText === '' ? null : sha(servedText),
  servedBytes: servedText?.length ?? 0,
});

/**
 * Everything outside the served bytes that could change what came back.
 *
 * `maxTokens` is in here because it is not a performance knob: at 1200 it silently truncated 54 of
 * 144 generations and the study measured the limit rather than the behaviour. A run identity that
 * omitted it could not tell two studies apart on the one parameter that invalidated one of them.
 */
export interface RequestShape {
  readonly modelId: string;
  readonly maxTokens: number;
  readonly toolName: string;
  readonly schemaHash: string;
}

export const requestShape = (
  modelId: string, maxTokens: number, toolName: string, schema: unknown,
): RequestShape => ({ modelId, maxTokens, toolName, schemaHash: sha(JSON.stringify(schema)) });

export interface RunIdentity {
  readonly suiteHash: string;
  readonly arms: readonly ArmIdentity[];
  readonly request: RequestShape;
  /** what the PROVIDER said answered, not what was asked for. An alias resolves server-side. */
  readonly reportedModelIds: readonly string[];
  readonly runHash: string;
}

export function runIdentity(
  suiteHash: string, arms: readonly ArmIdentity[], request: RequestShape,
  reportedModelIds: readonly string[],
): RunIdentity {
  const reported = [...new Set(reportedModelIds)].sort();
  return { suiteHash, arms, request, reportedModelIds: reported,
    runHash: sha(JSON.stringify({ suiteHash, arms, request, reported })) };
}

/**
 * Do these arms differ ONLY where they are supposed to?
 *
 * Returns the line-level difference so a study can assert on it BEFORE spending, which is the check
 * that caught the 28-line diff. `expectedChangedLines` is what the design says should move; anything
 * else is a confound the run must not proceed with.
 */
export interface ArmDiff {
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly changedLines: number;
}

export function diffArms(a: string, b: string): ArmDiff {
  const A = a.split('\n'); const B = b.split('\n');
  const setB = new Set(B); const setA = new Set(A);
  const removed = A.filter((l) => !setB.has(l));
  const added = B.filter((l) => !setA.has(l));
  return { removed, added, changedLines: removed.length + added.length };
}
