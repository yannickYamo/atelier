// atelier/core/delivery/carrier-delivery.ts — A FILE ON DISK IS NOT A CARRIER THAT REACHED THE MODEL.
//
// This is the defect this project has already paid for once, arriving one layer up. The first time it
// was a skill file that was written, installed, and never read: the artefact existed, the manifest said
// so, and 0% of it reached the model. The fix then was to prove delivery by BYTES. This module is that
// same fix applied to CARRIER SEMANTICS, which the byte check cannot see.
//
//   contracts/output.schema.json is on disk        ← proven by the package hash
//   the schema constrained the generation          ← a completely different claim
//
// The manifest used to answer the second question with `served: carrier !== 'NONE'` — that is, by
// checking that a file had been emitted. Every OUTPUT_CONTRACT row in every package read `served: true`
// while the generation ran against a hardcoded `{piece: string}`.
//
// ─── DELIVERY IS A PROPERTY OF A SURFACE, NOT OF A PACKAGE ─────────────────────────────────────
//
// The same package on two surfaces delivers different things, and no field on the package can say
// which. When Atelier owns the inference request it can compose examples into the payload and hand the
// contract to the provider as the schema. When the host owns the request, Atelier has written files and
// asked; what happens next belongs to the host.
//
// ─── THE STATE BETWEEN SUPPORTED AND UNSUPPORTED ───────────────────────────────────────────────
//
// REFERENCED_UNVERIFIED is the one that keeps this honest. A progressive-disclosure host loads SKILL.md
// and reads further material when the instructions point at it — so naming `examples/p4.md` in SKILL.md
// gives the host a reason to load it, which sibling files sitting nearby never had. That is a real
// improvement and it is still not an observation. Whether a given host, on a given task, actually
// loaded the file is a fact somebody has to witness.
//
// Collapsing it into DELIVERED would rebuild the original bug with a tidier directory name.

export type Carrier = 'PROSE' | 'SELF_CHECK' | 'EXAMPLE' | 'OUTPUT_CONTRACT' | 'NONE';

/** Who composes the request the model actually receives. */
export type ExecutionSurface =
  /** Atelier builds the payload and calls the provider. It can prove what went in. */
  | 'ATELIER_CLI'
  /** the host builds the payload. Atelier wrote files and can prove only that. */
  | 'HOST_NATIVE';

export type DeliveryState =
  /** this surface composes the carrier into the model's input, by a named mechanism */
  | 'DELIVERED'
  /** the package points the host at it; whether the host loads it has not been observed */
  | 'REFERENCED_UNVERIFIED'
  /** this surface has no mechanism for the carrier's semantics. Degrading it silently is forbidden. */
  | 'UNSUPPORTED'
  /** NONE — the author ratified this as not taste, so there is nothing to deliver */
  | 'NOT_APPLICABLE';

/**
 * A claim about one carrier on one surface, WITH ITS BASIS.
 *
 * The basis is required and it is the point. "DELIVERED" with no mechanism named is the same sentence
 * the old `served` field was making, and the reason it went unchallenged for so long is that a bare
 * boolean has nowhere to be wrong out loud.
 */
export interface DeliveryClaim {
  readonly state: DeliveryState;
  /** the mechanism, named concretely enough that a reader can go and check it */
  readonly basis: string;
}

export type CarrierDeliveryMatrix = Readonly<Record<Carrier, DeliveryClaim>>;

/**
 * A DELIVERED claim must name a mechanism, not an artefact.
 *
 * The distinction is the whole module: "the file is written" and "the file is installed" are facts
 * about disk, and neither is a mechanism by which a model receives anything. Throws rather than warns,
 * because the next person to add a host will reach for exactly those phrases.
 */
const ARTEFACT_TALK = /\b(file|files|written|emitted|installed|on disk|exists|present)\b/i;

export function assertDeliveryClaim(carrier: Carrier, surface: ExecutionSurface, claim: DeliveryClaim): void {
  if (claim.state !== 'DELIVERED') return;
  if (!claim.basis.trim()) {
    throw new Error(`DELIVERY CLAIM: ${carrier} is DELIVERED on ${surface} with no basis. Name the mechanism.`);
  }
  if (ARTEFACT_TALK.test(claim.basis)) {
    throw new Error(
      `DELIVERY CLAIM: ${carrier} on ${surface} claims DELIVERED because "${claim.basis}". That describes an\n`
      + `  artefact, not a mechanism. A file being written, installed or present says nothing about whether its\n`
      + `  semantics reached the model — which is the exact substitution that let every OUTPUT_CONTRACT row read\n`
      + `  served:true while generation ran against a hardcoded schema.\n`
      + `  Say HOW the model receives it, or use REFERENCED_UNVERIFIED.`);
  }
}

export function assertMatrix(surface: ExecutionSurface, m: CarrierDeliveryMatrix): void {
  for (const c of Object.keys(m) as Carrier[]) assertDeliveryClaim(c, surface, m[c]);
}

/**
 * What Atelier itself delivers when it owns the call.
 *
 * OUTPUT_CONTRACT is DELIVERED here only because the invocation path now reads the stored contract and
 * passes it as the provider's schema. Before that change this entry would have been a lie, and it is
 * pinned by an end-to-end test that captures the request the provider actually received.
 */
export const ATELIER_CLI_DELIVERY: CarrierDeliveryMatrix = {
  PROSE: { state: 'DELIVERED', basis: 'composed into the system block of the inference request' },
  SELF_CHECK: { state: 'DELIVERED', basis: 'composed into the system block of the inference request' },
  EXAMPLE: { state: 'DELIVERED', basis: 'appended to the model payload after context routing, before the call' },
  OUTPUT_CONTRACT: { state: 'DELIVERED', basis: 'passed to the provider as the structured-output schema for the generation' },
  NONE: { state: 'NOT_APPLICABLE', basis: 'the author ratified this as not taste' },
};

const label: Readonly<Record<DeliveryState, string>> = {
  DELIVERED: 'DELIVERED',
  REFERENCED_UNVERIFIED: 'REFERENCED (unverified)',
  UNSUPPORTED: 'UNSUPPORTED',
  NOT_APPLICABLE: '—',
};

/** Carriers actually present in a package. A matrix over carriers nobody used is noise. */
export function describeMatrix(
  surface: string, m: CarrierDeliveryMatrix, present: readonly Carrier[] = Object.keys(m) as Carrier[],
): string {
  const rows = (Object.keys(m) as Carrier[]).filter((c) => present.includes(c))
    .map((c) => `  ${c.padEnd(17)} ${label[m[c].state].padEnd(24)} ${m[c].basis}`).join('\n');
  const unsupported = (Object.keys(m) as Carrier[]).filter((c) => present.includes(c) && m[c].state === 'UNSUPPORTED');
  const referenced = (Object.keys(m) as Carrier[]).filter((c) => present.includes(c) && m[c].state === 'REFERENCED_UNVERIFIED');

  let out = `Carrier delivery on ${surface}\n\n${rows}\n`;
  if (unsupported.length) {
    out += `\n${unsupported.join(', ')} cannot be enforced here. Your standard is unchanged and the package still\n`
      + `installs — what is not true is that this surface holds that behaviour. Run it through \`atelier invoke\`\n`
      + `for the surface that does, or treat those rules as unenforced here and decide accordingly.\n`;
  }
  if (referenced.length) {
    out += `\n${referenced.join(', ')} is pointed at from SKILL.md, which is how a host that reads further material\n`
      + `finds it. Nobody has watched this host load it, so it is reported as referenced rather than delivered.\n`;
  }
  return out;
}
