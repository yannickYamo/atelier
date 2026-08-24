// tests/fixtures.ts — ONE OWNER FOR THE SHAPES EVERY TEST NEEDS.
//
// These existed already, copied by hand into nineteen files, and they had silently drifted from the
// types they claim to be: four fields were added to `Requirement` over two passes and no fixture
// grew them. The suite stayed green the whole time, because vitest runs tests without typechecking
// them and `tsconfig` excluded `tests/` from the only thing that would have noticed.
//
// Both halves of that are fixed. `tests/` is now inside the typecheck (the build reads
// `tsconfig.build.json`, so nothing ships), and the shapes live here, once.

import type { Requirement, InvocationRecord } from '../core/state/canonical-state.js';
import type { InferenceResult } from '../core/inference/client.js';
import type { RuntimeBinding } from '../core/runtime/binding.js';
import { observeRuntime } from '../core/runtime/binding.js';

/** A requirement with every field present. Override what a test is actually about. */
export const aRequirement = (o: Partial<Requirement> & { requirementId: string }): Requirement => ({
  statement: 'Open with a concrete scene.', appliesWhen: 'GENERAL', kind: 'GENERATIVE',
  authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: 'a verbatim quote', evidenceItemId: 'a.md',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...o,
});

export const A_BINDING: RuntimeBinding = {
  providerAdapter: 'test', backend: 'test', requestedModel: 'test-model',
  structuredOutput: 'NATIVE_TOOL_USE', parameters: {}, runtimeProfile: null,
};

export const anInvocation = (o: Partial<InvocationRecord> & { invocationId: string }): InvocationRecord => ({
  skillName: 's', standardVersionHash: 'sv1', skillVersionHash: 'k1', architectureHash: 'a1',
  servedPackageHash: 'p1', runtimeBinding: A_BINDING,
  observedRuntime: observeRuntime(A_BINDING, 'test-model', '2026-01-01T00:00:00.000Z'),
  invocationSurface: 'ATELIER_CLI', provenance: 'ORGANIC_USE', inputHash: 'ih', outputHash: 'oh',
  // BOUND BY DEFAULT so a fixture cannot represent an unbound request; a test that wants a mismatch
  // must state it, which keeps "the request was proven" the boring case and the violation the loud one.
  request: { resolvedTaskHash: 'th', servedTaskHash: 'th', source: 'POSITIONAL' },
  at: '2026-01-01T00:00:00.000Z',
  delivery: { expectedPackageHash: 'p1', servedPackageHash: 'p1', matched: true, servedFiles: ['SKILL.md'], outputContract: null },
  input: 'a task', output: 'an output',
  ...o,
});

/** A free result. `cost` is the authority and `costUsd` is derived from it, exactly as a provider does. */
export const anInferenceResult = (o: Partial<InferenceResult> = {}): InferenceResult => ({
  json: null, modelId: 'test-model', inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1,
  cost: { basis: 'API_METERED', billingUsd: 0 }, costUsd: 0,
  ...o,
});
