// atelier/core/contract/arm.ts — WHAT EACH ARM IS SERVED, AND WHY THE DIFFERENCE IS ONE FIELD.
//
// ─── BARE IS A CONDITION, NOT AN OMISSION ──────────────────────────────────────────────────────
//
// "Bare" defined operationally as "don't send the stableBlock" is true today and will stop being
// true. Atelier compiles one file now; when it compiles schemas, references, examples, scripts and
// checks, a bare arm defined by which single field to drop will silently keep receiving whichever
// carriers arrived after the definition was written, and the control will have quietly become a
// treatment. So the condition is named, and what it excludes is stated as a class: every
// Atelier-derived implementation carrier, whatever those turn out to be.
//
// Everything else is held identical BY CONSTRUCTION rather than by care. `requestFor` builds the
// request for all three arms from one shape, so the arms cannot drift apart through an edit that
// only remembered two of them, and a test asserts the BARE and INITIAL requests differ in exactly
// one field.
//
// ─── BARE IS INSTRUMENTATION. IT IS NOT A PARTICIPANT. ─────────────────────────────────────────
//
// It answers "did this skill change the model at all", which is a question a user is entitled to and
// which nothing else here can answer. It does NOT enter the repair decision:
//
//     what to repair  =  f(StandardVersion, what the implementation did)
//     never           =  f(initial - bare)
//
// The optimizer is implementing a fixed standard, not trying to beat a bare model, and those come
// apart immediately. A rule the bare model already satisfies is still a rule the implementation must
// carry, because the next binding may not satisfy it and the standard did not stop being the target.
// Nothing in this file exposes bare to diagnosis, and no promotion gate reads it.
//
// A legitimate and valuable outcome of running it is "the runtime already does this; you may not need
// a skill here at all". A system that only ever justifies its own artifacts cannot say that.

import type { InferenceRequest } from '../inference/client.js';

/**
 * NOT `ArmId` from `reference/arms.ts`, deliberately.
 *
 * Those arms answer a different question against a different denominator: they compare a compiled
 * skill against an expert's real held-out work, and their set includes a pasted corpus and an
 * expert's own one-pager. Sharing the type would let a contract outcome be scored against a
 * reference pair kind, and the two produce claims of completely different strength — one about
 * implementation, one about deployment. Keeping them apart is what stops a constructed result being
 * quoted where an empirical one belongs.
 */
export type ContractArm =
  /** the runtime with no Atelier-derived carrier of any kind. The control. */
  | 'BARE'
  /** the SkillVersion as first compiled from the standard */
  | 'INITIAL'
  /** a SkillVersion an optimizer proposed */
  | 'CANDIDATE';

export const CONTRACT_ARMS: readonly ContractArm[] = ['BARE', 'INITIAL', 'CANDIDATE'];

/** Arms whose results may inform a repair. BARE is absent, and its absence is the point. */
export const MAY_INFORM_REPAIR: readonly ContractArm[] = ['INITIAL', 'CANDIDATE'];

/**
 * Everything an arm shares with every other arm.
 *
 * Held in one object so a change to sampling, tools or token budget lands on all three at once. An
 * arm that quietly ran at a different temperature is not a control.
 */
export interface ArmContext {
  readonly task: string;
  readonly maxTokens: number;
  readonly toolName: string;
  readonly toolDescription: string;
  readonly schema: Record<string, unknown>;
}

export class ArmMisconfigured extends Error {}

/**
 * The request one arm sends.
 *
 * `servedText` is the compiled package's bytes for a skill arm, and must be null for BARE. Passing
 * bytes to BARE is refused rather than ignored: a control that silently accepted a treatment would
 * produce a comparison where both sides are the same and nothing would say so.
 */
export function requestFor(
  arm: ContractArm, servedText: string | null, ctx: ArmContext,
): InferenceRequest {
  if (arm === 'BARE' && servedText !== null) {
    throw new ArmMisconfigured(
      'BARE was given served bytes. It is the condition with no Atelier-derived carrier, so anything '
      + 'compiled reaching it makes it a second treatment arm wearing a control\'s name.');
  }
  if (arm !== 'BARE' && (servedText === null || servedText === '')) {
    throw new ArmMisconfigured(
      `${arm} was given no served bytes. An arm meant to carry a compiled skill and carrying nothing `
      + 'is indistinguishable from BARE, and would report as though the skill had been tested.');
  }
  return {
    // The ONLY field that differs between arms. Everything below is shared by construction.
    stableBlock: servedText ?? '',
    variableBlock: '',
    userMessage: ctx.task,
    toolName: ctx.toolName,
    toolDescription: ctx.toolDescription,
    schema: ctx.schema,
    maxTokens: ctx.maxTokens,
  };
}

/**
 * What actually differs between two arms' requests.
 *
 * Exists so the invariant is checkable rather than asserted in a comment. If a future carrier is
 * added by threading it through a second field, this returns two names and the test that reads it
 * fails — which is the point at which somebody notices the control stopped being one.
 */
export function requestDiff(a: InferenceRequest, b: InferenceRequest): readonly string[] {
  const keys: (keyof InferenceRequest)[] = [
    'stableBlock', 'variableBlock', 'userMessage', 'toolName', 'toolDescription', 'maxTokens',
  ];
  const differing = keys.filter((k) => a[k] !== b[k]);
  if (JSON.stringify(a.schema) !== JSON.stringify(b.schema)) differing.push('schema');
  return differing;
}

/**
 * The identities a three-arm comparison has to record to be reconstructable.
 *
 * Hashes rather than objects, and the INITIAL hash is the one most easily lost: it must be the
 * artifact that was materialized before optimization, read back from the store, never rebuilt from
 * current code. A rebuild produces whatever today's compiler emits, which is a different artifact
 * from the one that was actually tested.
 */
export interface ComparisonIdentity {
  readonly suiteHash: string;
  readonly standardVersionHash: string;
  readonly bindingHash: string;
  readonly initialSkillVersionHash: string;
  readonly candidateSkillVersionHash: string | null;
}
