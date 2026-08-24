// atelier/core/inference/capability.ts — WHAT WE KNOW ABOUT A MODEL, AND THE MUCH SHORTER LIST OF WHAT
// WE HAVE ESTABLISHED.
//
// Four questions get asked about a model and they are routinely answered as one:
//
//   1. Can Atelier talk to it?                                    transport
//   2. Does it return the object the schema asked for?            structure
//   3. Is what it returns anchored in the source it cites?        evidence
//   4. Is the taste it discovers any good?                        semantics
//
// The first three are checkable by a machine, cheaply, with no judge. The fourth is not checkable by
// any instrument this project owns, and the campaigns that tried are the reason this file exists: three
// model-based observers produced zero abstentions in a hundred and fifty observations, which is what an
// instrument looks like when it has no idea and says so confidently.
//
// So a model can pass every automated check here and still infer terrible taste. That is not a hole in
// the pack; it is the pack's most useful output. A small local model that returns clean JSON, quotes
// real spans and never grabs authority it was not given is in a GOOD state — a usable one — and the
// system should say exactly that rather than either blocking it or blessing it.
//
// ─── NOTHING HERE IS INFERRED FROM SIZE, VENDOR, OR FAMILY ─────────────────────────────────────
//
// A parameter count is not evidence about judgment, a frontier label is not evidence about judgment,
// and the fact that a model returned valid JSON is evidence about the SCHEMA, not the reasoning behind
// what filled it. `UNKNOWN` is a legitimate value and stays until something measured it.

/**
 * What a run established about one model, on one operation.
 *
 * Ordered by what it takes to earn them: each is checkable by exactly the means named, and none implies
 * the next. Reaching `EVIDENCE_ANCHORED` says a great deal about honesty and nothing about taste.
 */
export type CapabilityState =
  /** nobody has looked */
  | 'UNKNOWN'
  /** a call reached the backend and came back */
  | 'TRANSPORT_VERIFIED'
  /** the response satisfied the requested schema */
  | 'STRUCTURE_VERIFIED'
  /** every span it cited as evidence occurs verbatim in the source it cited */
  | 'EVIDENCE_ANCHORED'
  /** it did not assign itself materiality, authority, or anything else that is the human's to give */
  | 'AUTHORITY_SAFE'
  /** it failed the check that was run. Which one is carried on the result, not encoded here. */
  | 'FAILED';

/**
 * Whether anyone has established that this model's DISCOVERY is semantically good.
 *
 * Two values, and the qualified one is unreachable by anything in this repository. It requires
 * human-authoritative labels on frozen cases — a person saying "this is the decision, this is its
 * scope, this counterfactual is meaningful" — and no amount of deterministic conformance substitutes.
 * A third value would be an invitation to invent a way to award it.
 */
export type SemanticDiscoveryState = 'SEMANTIC_DISCOVERY_UNQUALIFIED' | 'SEMANTIC_DISCOVERY_QUALIFIED';

/**
 * Whether this model has been shown to reproduce a standard AT RUNTIME.
 *
 * One value. Answering it needs an absolute fidelity anchor — an instrument that can say "this output
 * meets the standard" rather than "this output is closer than that one" — and four campaigns failed to
 * build one. The type has a single member so that no code can accidentally claim the other.
 */
export type RuntimeFidelityState = 'RUNTIME_UNQUALIFIED';

/** Facts the backend itself reports or the adapter knows structurally. Cheap, and not about judgment. */
export interface StaticCapabilities {
  readonly structuredOutput: readonly ('FORCED_TOOL_CALL' | 'JSON_SCHEMA_RESPONSE_FORMAT' | 'NATIVE_TOOL_USE')[];
  readonly promptCaching: 'EXPLICIT' | 'AUTOMATIC_PREFIX' | 'NONE' | 'UNKNOWN';
  readonly reportsResolvedModel: boolean | null;
  readonly contextWindow: number | null;
}

/** What a run measured. Populated only by the conformance packs; never by assumption. */
export interface EmpiricalCapabilities {
  readonly transport: CapabilityState;
  readonly structure: CapabilityState;
  readonly evidenceAnchoring: CapabilityState;
  readonly authoritySafety: CapabilityState;
  readonly semanticDiscovery: SemanticDiscoveryState;
  readonly runtimeFidelity: RuntimeFidelityState;
  /** when, and against what — a capability claim with no date is a claim about a model that has moved */
  readonly measuredAt: string | null;
  readonly measuredOn: string | null;
}

export interface ModelCapabilityProfile {
  readonly providerAdapter: string;
  readonly backend: string;
  readonly modelId: string;
  readonly static: StaticCapabilities;
  readonly empirical: EmpiricalCapabilities;
}

/** The starting state of every model: reachable in principle, established in nothing. */
export const UNMEASURED: EmpiricalCapabilities = {
  transport: 'UNKNOWN', structure: 'UNKNOWN', evidenceAnchoring: 'UNKNOWN', authoritySafety: 'UNKNOWN',
  semanticDiscovery: 'SEMANTIC_DISCOVERY_UNQUALIFIED', runtimeFidelity: 'RUNTIME_UNQUALIFIED',
  measuredAt: null, measuredOn: null,
};

/**
 * How far a provider, backend or model has actually been taken.
 *
 * The distinction the README lives or dies on. One adapter speaks a protocol that six backends also
 * speak; that is a fact about the protocol. Whether any given backend works is a separate fact, and
 * whether a model on it produces anchored candidates is a third. Collapsing them is how a project ends
 * up claiming portability and shipping one vendor.
 */
export type SupportStage =
  | 'ADAPTER_IMPLEMENTED'
  | 'BACKEND_VERIFIED'
  | 'MODEL_TRANSPORT_VERIFIED'
  | 'MODEL_STRUCTURE_VERIFIED'
  | 'MODEL_EVIDENCE_ANCHORED'
  | 'SEMANTIC_DISCOVERY_QUALIFIED';

const PASSED: readonly CapabilityState[] = ['TRANSPORT_VERIFIED', 'STRUCTURE_VERIFIED', 'EVIDENCE_ANCHORED', 'AUTHORITY_SAFE'];
const ok = (s: CapabilityState): boolean => PASSED.includes(s);

/** The highest stage the profile's own measurements support. Never rounds up. */
export function supportStage(p: ModelCapabilityProfile): SupportStage {
  if (p.empirical.semanticDiscovery === 'SEMANTIC_DISCOVERY_QUALIFIED') return 'SEMANTIC_DISCOVERY_QUALIFIED';
  if (ok(p.empirical.evidenceAnchoring) && ok(p.empirical.authoritySafety)) return 'MODEL_EVIDENCE_ANCHORED';
  if (ok(p.empirical.structure)) return 'MODEL_STRUCTURE_VERIFIED';
  if (ok(p.empirical.transport)) return 'MODEL_TRANSPORT_VERIFIED';
  return 'ADAPTER_IMPLEMENTED';
}

/**
 * The guard that keeps the fourth question from being answered by the first three.
 *
 * `SEMANTIC_DISCOVERY_QUALIFIED` may only be set with a named human-authoritative label set behind it.
 * Not a model's self-assessment, not a second model's verdict, not a clean conformance run. The throw
 * is deliberate and there is no flag: this is the exact boundary the whole design is built to hold, and
 * the pressure to cross it will always arrive as a plausible shortcut.
 */
export function assertSemanticQualification(state: SemanticDiscoveryState, humanLabelSetId: string | null): void {
  if (state === 'SEMANTIC_DISCOVERY_QUALIFIED' && !humanLabelSetId) {
    throw new Error(
      'SEMANTIC QUALIFICATION: a model was marked SEMANTIC_DISCOVERY_QUALIFIED with no human-authoritative '
      + 'label set behind it. Deterministic conformance establishes that candidates are well-formed, cite real '
      + 'spans, and claim no authority — it establishes nothing about whether the taste they describe is right. '
      + 'That needs a person scoring frozen cases where the correct decision, its scope and its counterfactual '
      + 'are already known.');
  }
}

/** What the profile means in a sentence, with the gap named rather than left to be assumed. */
export function describeProfile(p: ModelCapabilityProfile): string {
  const stage = supportStage(p);
  const when = p.empirical.measuredAt ? ` (measured ${p.empirical.measuredAt})` : '';
  const head = `${p.modelId} on ${p.backend} via ${p.providerAdapter} — ${stage}${when}`;
  if (stage === 'SEMANTIC_DISCOVERY_QUALIFIED') return head;
  return `${head}\n`
    + `  Whether the taste it discovers is any good has not been established, and nothing here can\n`
    + `  establish it. Its proposals are candidates with evidence attached, and they bind nothing until\n`
    + `  you adopt them.`;
}
