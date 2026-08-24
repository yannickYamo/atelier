// atelier/core/runtime/binding.ts — THE THIRD OBJECT. WHAT ACTUALLY SERVED THE PACKAGE.
//
// Atelier already had two identities and they were the right two:
//
//   StandardVersion   what the human decided good means.        Human-owned, immutable.
//   SkillVersion      the compiled package that implements it.  Machine-owned, replaceable.
//
// Neither of them says WHERE THE PACKAGE RAN, and for a while nothing did. A SkillVersion served to
// Claude and the identical bytes served to a 7B model on a laptop produced the same hashes, the same
// delivery proof, and the same clean record — while being, in every sense a user cares about, two
// different systems. The delivery check caught an edited package and had nothing at all to say about
// a swapped model.
//
//   StandardVersion  →  SkillVersion  →  RuntimeBinding
//
// ─── WHAT IS IDENTITY AND WHAT IS OBSERVATION ──────────────────────────────────────────────────
//
// The binding's identity is WHAT WAS CONFIGURED: adapter, backend, requested model, structured-output
// mode, and the generation parameters that can move behaviour. All of it is known before the call, so
// the mismatch check is deterministic and runs before any money is spent.
//
// What the provider says ANSWERED is a different kind of fact. It arrives after the call, it is
// frequently just an echo of what we asked for, and on a mutable alias it can change under a stable
// name without anything in the configuration moving. Folding it into the identity would make the hash
// unstable for a reason the user did not cause; leaving it out entirely would lose the one signal that
// catches a silent provider-side version flip. So it is recorded BESIDE the binding as an observation,
// and a change in it is its own event.
//
// ─── WHY THE TARGET MODEL IS NOT PART OF SkillVersion IDENTITY, TODAY ──────────────────────────
//
// It would be, if it changed the artefact. Compilation is not target-adaptive: the same standard
// compiles to byte-identical bytes whichever model will run them, so putting the target in the
// SkillVersion hash would mint a new "version" of an unchanged package every time someone switched
// runtimes. When carrier selection does start reading a target capability profile, that profile
// becomes a compilation INPUT and joins the SkillVersion hash properly — as a cause of a different
// artefact, which is what that hash is for.

import { createHash } from 'node:crypto';

/**
 * How the backend was asked to produce a typed object.
 *
 * Part of the identity because it is not a formatting preference. The same model asked for a forced
 * function call and asked for a schema-constrained response is not reliably the same system, and a
 * discovery run that silently fell back from one to the other has changed what constrained the output.
 */
export type StructuredOutputMode = 'FORCED_TOOL_CALL' | 'JSON_SCHEMA_RESPONSE_FORMAT' | 'NATIVE_TOOL_USE';

/**
 * Generation parameters that can materially move behaviour.
 *
 * Deliberately a closed record of primitives rather than an open bag. An open bag would hash a request
 * id, a timestamp, or anything else a caller happened to have, and every binding would then mismatch
 * every other one — a guard that fires always is a guard nobody keeps.
 */
export type RuntimeParameters = Readonly<Record<string, string | number | boolean>>;

export interface RuntimeBinding {
  /** which adapter spoke the protocol: `anthropic`, `openai-compatible`, … */
  readonly providerAdapter: string;
  /**
   * which backend it spoke to. A base URL where one exists, a vendor name where the adapter has a
   * fixed endpoint. Part of the identity because one protocol reaches many backends and they are not
   * interchangeable — an OpenAI-compatible URL says nothing about who is behind it.
   */
  readonly backend: string;
  /** the model id ASKED FOR. What the user controls and what they can reproduce. */
  readonly requestedModel: string;
  readonly structuredOutput: StructuredOutputMode;
  readonly parameters: RuntimeParameters;
  /** a named prompt/runtime profile, where a host imposes one. `null` when the package is served as-is. */
  readonly runtimeProfile: string | null;
}

/**
 * What the provider said answered — and how much that is worth.
 *
 * `AS_REQUESTED` is the honest and most common state, and it is NOT the same as a confirmed revision.
 * The provider echoed the string we sent. Whether that string names an immutable snapshot or a moving
 * alias is a fact about that vendor's naming policy, which this code does not know and will not guess.
 * A system that recorded the echo as a version would be claiming reproducibility it cannot support.
 */
export type ModelIdentityKind =
  /** the provider named something other than what we asked for — a real resolution */
  | 'RESOLVED_REVISION'
  /** the provider echoed our string. It may be a snapshot or a mutable alias; nothing here can tell. */
  | 'AS_REQUESTED'
  /** the provider reported no model at all */
  | 'UNREPORTED';

export interface ObservedRuntime {
  readonly bindingHash: string;
  readonly resolvedModel: string | null;
  readonly modelIdentityKind: ModelIdentityKind;
  readonly at: string;
}

export function observeRuntime(binding: RuntimeBinding, reportedModel: string | null | undefined, at: string): ObservedRuntime {
  const kind: ModelIdentityKind = !reportedModel ? 'UNREPORTED'
    : reportedModel === binding.requestedModel ? 'AS_REQUESTED' : 'RESOLVED_REVISION';
  return { bindingHash: bindingHash(binding), resolvedModel: reportedModel ?? null, modelIdentityKind: kind, at };
}

/**
 * A stable identity for one runtime configuration.
 *
 * Keys are sorted at every level, so two bindings built by different code paths in a different field
 * order hash the same. Without that the guard would fire on formatting and be switched off within a
 * week.
 */
export function bindingHash(b: RuntimeBinding): string {
  const params = Object.keys(b.parameters).sort().map((k) => `${k}=${String(b.parameters[k])}`).join(';');
  const canonical = [
    `adapter=${b.providerAdapter}`, `backend=${b.backend}`, `model=${b.requestedModel}`,
    `structured=${b.structuredOutput}`, `profile=${b.runtimeProfile ?? ''}`, `params=${params}`,
  ].join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export interface BindingDifference { readonly field: string; readonly expected: string; readonly actual: string }

export type BindingVerdict =
  | { readonly kind: 'BINDING_MATCHED' }
  /** nothing to compare against — the first run of this SkillVersion establishes the binding */
  | { readonly kind: 'BINDING_UNRECORDED' }
  | { readonly kind: 'TARGET_BINDING_MISMATCH'; readonly differences: readonly BindingDifference[] };

const params = (b: RuntimeBinding): string =>
  Object.keys(b.parameters).sort().map((k) => `${k}=${String(b.parameters[k])}`).join(', ') || '(none)';

/**
 * Compare the binding about to serve against the one this SkillVersion's evidence came from.
 *
 * Deterministic, and before any call. The point is not that a different runtime is forbidden — it is
 * not — but that everything recorded against this SkillVersion was recorded somewhere else, and no
 * part of it transfers by default.
 */
export function compareBindings(expected: RuntimeBinding | null, actual: RuntimeBinding): BindingVerdict {
  if (!expected) return { kind: 'BINDING_UNRECORDED' };
  const diffs: BindingDifference[] = [];
  const add = (field: string, e: string, a: string): void => { if (e !== a) diffs.push({ field, expected: e, actual: a }); };
  add('provider adapter', expected.providerAdapter, actual.providerAdapter);
  add('backend', expected.backend, actual.backend);
  add('model', expected.requestedModel, actual.requestedModel);
  add('structured output', expected.structuredOutput, actual.structuredOutput);
  add('runtime profile', expected.runtimeProfile ?? '(none)', actual.runtimeProfile ?? '(none)');
  add('parameters', params(expected), params(actual));
  return diffs.length ? { kind: 'TARGET_BINDING_MISMATCH', differences: diffs } : { kind: 'BINDING_MATCHED' };
}

/**
 * A provider-side version flip under an unchanged configuration.
 *
 * Only detectable where the provider reports a model at all, and only meaningful where it reported
 * something other than our own string back to us. Reported rather than thrown: the user changed
 * nothing, so refusing to run would punish them for a vendor's decision. What they need is to know it
 * happened, because evidence gathered before it was gathered elsewhere.
 */
export function detectResolvedModelDrift(before: ObservedRuntime | null, now: ObservedRuntime): { drifted: boolean; why: string } {
  if (before?.bindingHash !== now.bindingHash) return { drifted: false, why: 'nothing comparable was recorded' };
  if (before.modelIdentityKind === 'UNREPORTED' || now.modelIdentityKind === 'UNREPORTED') {
    return { drifted: false, why: 'this backend does not report which model answered, so a version flip here would be undetectable' };
  }
  if (before.resolvedModel === now.resolvedModel) return { drifted: false, why: 'the same model answered' };
  return { drifted: true,
    why: `the configuration did not change and the backend answered with "${now.resolvedModel}" where it previously answered with "${before.resolvedModel}"` };
}

/** What a person reads when the guard fires. Says what is lost, not only what differs. */
export function describeMismatch(v: Extract<BindingVerdict, { kind: 'TARGET_BINDING_MISMATCH' }>, skillVersionHash: string): string {
  const rows = v.differences.map((d) => `  ${d.field.padEnd(18)} recorded: ${d.expected}\n  ${' '.repeat(18)} now:      ${d.actual}`).join('\n');
  return `TARGET_BINDING_MISMATCH\n\n`
    + `Everything recorded against SkillVersion ${skillVersionHash} was produced somewhere else:\n\n${rows}\n\n`
    + `The package is unchanged and the standard is untouched. What does not carry over is the evidence:\n`
    + `every observation on this version describes how the other runtime behaved, and nothing here has\n`
    + `established how this one does.\n\n`
    + `  Run it anyway, on a fresh record:  --accept-new-binding\n`
    + `  Go back to the recorded runtime:   change the model or provider back\n`;
}
