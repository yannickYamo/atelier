// atelier/adapters/host-adapter.ts — THE CONTRACT. No host types above this line, ever.
//
// A host may change how a skill is INSTALLED or INVOKED. It must never change what the expert
// RATIFIED. That sentence is the whole architecture, and this interface is where it is enforced:
// nothing an adapter returns can reach a StandardVersion.

import type { CarrierDeliveryMatrix } from '../core/delivery/carrier-delivery.js';

export interface HostCapabilities {
  readonly hostId: string;
  readonly skills: boolean;
  readonly plugins: boolean;
  readonly blockingHooks: boolean;
  readonly persistentPluginData: boolean;
  /** how a user invokes it here — punctuation, not identity */
  readonly invocationStyle: string;
}

export type InstallResult = { readonly ok: true; readonly installedAt: string } | { readonly ok: false; readonly reason: string };
export interface VerificationResult { readonly present: boolean; readonly matchesPackage: boolean; readonly detail: string }

/**
 * A protocol decision, made by core and merely ENFORCED by a host.
 *
 * The rule lives in `run-state.ts`. An adapter receives the verdict. Encoding the rule itself in two
 * host hooks would create two authorities that agree until they don't, and the first divergence would
 * be discovered as a research result rather than as a bug.
 */
export interface ProtocolPolicy {
  readonly canBuild: boolean;
  readonly canReveal: boolean;
  readonly canDiscover: boolean;
  readonly reasonIfBlocked: string | null;
}

/**
 * WHAT IS ACTUALLY ENFORCING THE PROTOCOL, AND WHERE.
 *
 * Both adapters used to return `{ installed: true, enforcedBy: 'BLOCKING_HOOK' }` as a literal, having
 * installed nothing at all. Neither writes a hook file; neither reads one back. The value was a
 * description of what the host is CAPABLE of, returned from a method whose name promises what was DONE.
 *
 * `NOT_INSTALLED` exists so that the honest answer is expressible. A capability is not an installation,
 * and an enforcement claim that nothing can check is worse than an absent one, because a caller that
 * trusts it stops looking.
 */
export type GuardEnforcement = 'BLOCKING_HOOK' | 'CLI_ONLY' | 'NOT_INSTALLED';

export interface GuardResult {
  readonly installed: boolean;
  readonly enforcedBy: GuardEnforcement;
  readonly detail: string;
  /** the file a reader can open to confirm it. `null` when nothing was written — which is checkable too. */
  readonly artifact: string | null;
}

/**
 * WHAT INSTALLING AND VERIFYING ACTUALLY READ.
 *
 * Both methods touch `skillId` and `files` and nothing else. Typing them against the full render
 * output forced every caller to HAVE a render, which is how `inspect` and `rollback` came to
 * re-derive a package instead of reading the one that was built — and a re-derivation that differs by
 * a single frontmatter line reads on disk as a hand-edited file.
 *
 * A stored package satisfies this. So does a fresh render. The narrower type is what lets the caller
 * pass the bytes that were actually installed.
 */
export interface InstallablePackage {
  readonly skillId: string;
  readonly files: Readonly<Record<string, string>>;
  /** the identity the installed bytes are checked against */
  readonly packageHash: string;
}

export interface HostAdapter {
  detect(): HostCapabilities;
  /**
   * Which carrier semantics this host delivers when IT owns the inference request.
   *
   * Not what the package contains — what reaches the model when a user types the host's own invocation
   * instead of going through `atelier invoke`. A host may only claim DELIVERED by naming a mechanism;
   * `assertDeliveryClaim` refuses a basis that describes a file.
   */
  carrierDelivery(): CarrierDeliveryMatrix;
  install(pkg: InstallablePackage, projectDir: string): InstallResult;
  uninstall(skillId: string, projectDir: string): void;
  /** e.g. "/my-voice <brief>" or "$my-voice <brief>" — identity is skillId, not this string */
  invocationHint(skillId: string): string;
  installProtocolGuards(policy: ProtocolPolicy): GuardResult;
  verifyInstallation(pkg: InstallablePackage, projectDir: string): VerificationResult;
  persistentStateLocation(): string;
}

/** A missing host capability degrades installation. It may never alter authority semantics. */
export class CapabilityUnavailable extends Error {
  constructor(public readonly hostId: string, public readonly capability: string) {
    super(`CAPABILITY_UNAVAILABLE: ${hostId} does not provide "${capability}". Atelier degrades enforcement to CLI-only; the standard and its authority are unchanged.`);
    this.name = 'CapabilityUnavailable';
  }
}
