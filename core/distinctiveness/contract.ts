// atelier/core/distinctiveness/contract.ts — WHAT OPTIMIZATION MAY NOT WASH OUT, PROJECTED FROM THE STANDARD.
//
// The floor needs dimensions. The question is where they come from, and there is exactly one legal
// answer: **the ratified StandardVersion**. A protected behaviour that cannot be traced back to a
// requirement the author already ratified is the floor inventing authority — a second standard,
// authored by the optimizer's guardrail, protecting things nobody said mattered.
//
// ─── THE CASE THAT MAKES THIS CONCRETE ─────────────────────────────────────────────────────────
//
// A contract ported from elsewhere might protect, say, a "house voice" dimension. It is an
// obviously reasonable thing to
// protect, and the standard this is being instantiated for contains NO requirement about voice,
// register or rhythm. Adding it because it seems wise is precisely the move this module refuses:
// the honest output is STANDARD_GAP — *you may want this protected, and you have not said so; add it
// to your standard and it becomes protectable* — never "put it in the floor".
//
// ─── AND THE FLOOR IS A PROJECTION, NOT A COPY ─────────────────────────────────────────────────
//
// Not every requirement makes a usable floor dimension. One whose adjudication needs facts outside
// the output — whether a claimed project was really shipped, whether a cited source exists — cannot
// be scored by comparing two texts, and including it would smuggle a grounding requirement into an
// instrument that cannot meet it. Those are REJECTED with a reason rather than silently dropped.
//
// Pure module — zero I/O, no model call. Deriving the proposal is deterministic; APPROVING it is a
// human authority act, and the two are different functions on purpose.

import { createHash } from 'node:crypto';
import type { StandardVersion, Requirement } from '../state/canonical-state.js';
import type { QualityFloorContract, DimensionFloor, GateRole } from './floor.js';

/** A protected behaviour, and the requirements that authorise protecting it. */
export interface FloorDimension {
  readonly id: string;
  /** REQUIRED and non-empty. The trace back to ratified authority. */
  readonly sourceRequirementIds: readonly string[];
  /** what optimization must not wash out, in terms drawn from those requirements */
  readonly protectedBehavior: string;
  /** what a score on this dimension would measure — stated before anything is scored */
  readonly estimand: string;
  readonly margin: number | null;
  readonly gateRole: GateRole;
}

export interface RejectedDimension {
  readonly candidateId: string;
  readonly sourceRequirementIds: readonly string[];
  readonly reason: string;
  readonly disposition: 'NEEDS_EXTERNAL_VERIFICATION' | 'STANDARD_GAP';
}

export interface FloorProposal {
  readonly standardVersionHash: string;
  readonly dimensions: readonly FloorDimension[];
  readonly rejected: readonly RejectedDimension[];
  /** behaviours worth protecting that the standard does not contain — a gap, never a floor entry */
  readonly standardGaps: readonly { readonly wanted: string; readonly why: string }[];
}

/**
 * Requirements whose adjudication needs facts the output cannot supply.
 *
 * Detected structurally rather than by keyword: a requirement is externally-verified when satisfying
 * it requires a claim about the WORLD (a project was shipped, a source exists) rather than about the
 * TEXT. That judgement is made once, by a person, at derivation time — the list is an input, not an
 * inference, because guessing it is how a floor acquires a criterion it cannot score.
 */
export type ExternallyVerified = ReadonlySet<string>;

/**
 * Derive the proposed contract from a frozen standard.
 *
 * Deterministic and conservative: one dimension per requirement, because grouping requirements into
 * a composite behaviour is an editorial act and the composite would then trace to a construct nobody
 * ratified. A person may merge them when approving; the machine does not do it for them.
 */
export function proposeFloor(
  standard: StandardVersion,
  externallyVerified: ExternallyVerified,
  wantedButAbsent: readonly { readonly wanted: string; readonly why: string }[] = [],
): FloorProposal {
  const dimensions: FloorDimension[] = [];
  const rejected: RejectedDimension[] = [];

  for (const r of standard.requirements) {
    if (r.authority === 'EXPERT_REJECTED') continue;
    if (externallyVerified.has(r.requirementId)) {
      rejected.push({
        candidateId: idFor(r), sourceRequirementIds: [r.requirementId],
        disposition: 'NEEDS_EXTERNAL_VERIFICATION',
        reason: 'satisfying this is a claim about the world rather than about the text, so two outputs cannot be compared on it without evidence the floor does not have. Protecting it here would give the instrument a criterion it cannot score.',
      });
      continue;
    }
    dimensions.push({
      id: idFor(r),
      sourceRequirementIds: [r.requirementId],
      protectedBehavior: r.statement,
      estimand: `how closely an output holds to "${short(r.statement)}" — measured on the candidate and on the standard-ablated prior, never on the candidate alone`,
      // NO MARGIN IS PROPOSED. See `margins` below: there is no defensible automatic derivation.
      margin: null,
      // Every dimension arrives OBSERVE. Pre-selecting one for ENFORCE would be the machine deciding
      // which of the author's rules is load-bearing, which is the authority act being asked for.
      gateRole: 'OBSERVE',
    });
  }

  return { standardVersionHash: standard.standardVersionHash, dimensions, rejected,
    standardGaps: wantedButAbsent };
}

const short = (s: string): string => (s.length <= 64 ? s : `${s.slice(0, 61)}...`);

/** Stable id from the requirement it protects, so a dimension cannot drift from its source. */
function idFor(r: Requirement): string {
  const words = r.statement.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 4 && !['their', 'these', 'those', 'about', 'through', 'before', 'instead', 'while'].includes(w));
  return `${r.requirementId}_${words.slice(0, 2).join('_') || 'behavior'}`;
}

/**
 * MARGINS ARE NOT DERIVABLE, AND SAYING SO IS THE HONEST OUTPUT.
 *
 * A margin says how much degradation on a protected behaviour is acceptable in exchange for a gain
 * elsewhere. That is a judgement about what the author would tolerate losing, and there is no
 * measurement that yields it:
 *
 *   - deriving it from the instrument's noise lets the instrument define the target, which is the
 *     precise inversion this whole programme exists to prevent;
 *   - deriving it from observed candidate variation makes the acceptable loss a function of how
 *     unstable the optimizer happens to be;
 *   - inheriting a margin set elsewhere imports another person's tolerance for another
 *     product's objective.
 *
 * So a margin is authored, once, by the person whose standard it protects. That is a one-time
 * standard-protection decision, not recurring supervision of implementations.
 */
export const MARGIN_SEMANTICS = {
  appliesTo: 'the difference in per-dimension mean score between the candidate and the standard-ablated prior, on the scale the scorer emits',
  question: 'how much of this behaviour would you accept losing in exchange for the skill getting better at something else?',
  authorisedBy: 'the author of the standard, once, at contract approval',
  frozenBy: 'inclusion in the content-addressed FloorContractVersion — changing a margin mints a new contract version',
  notDerivableFrom: ['instrument noise', 'candidate variance', 'another product\'s ratified margins'],
} as const;

/** A contract a person has approved. Content-addressed, so approval names exact bytes. */
export interface FloorContractVersion {
  readonly floorContractHash: string;
  readonly standardVersionHash: string;
  readonly dimensions: readonly FloorDimension[];
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface ApprovalRefusal { readonly ok: false; readonly reason: string }
export interface Approved { readonly ok: true; readonly version: FloorContractVersion }

/**
 * The authority act.
 *
 * ONE approval of the exact content-addressed contract is sufficient — per-dimension confirmation
 * would be the repetitive ritual the product deliberately does not have. What it refuses is an
 * approval that is not an authority act at all: a contract with no enforced dimension holds nothing,
 * and a dimension with no margin has not been decided.
 */
export function approveFloor(
  proposal: FloorProposal, dimensions: readonly FloorDimension[], approvedBy: string, approvedAt: string,
): Approved | ApprovalRefusal {
  if (!dimensions.length) {
    return { ok: false, reason: 'an empty floor holds nothing. Approving it would record a protection decision that protects nothing.' };
  }
  for (const d of dimensions) {
    if (!d.sourceRequirementIds.length) {
      return { ok: false, reason: `"${d.id}" traces to no requirement. A protected behaviour with no source is the floor inventing authority — if this matters, it belongs in your standard first.` };
    }
    const unknown = d.sourceRequirementIds.filter((id) => !proposal.dimensions.some((p) => p.sourceRequirementIds.includes(id))
      && !proposal.rejected.some((p) => p.sourceRequirementIds.includes(id)));
    if (unknown.length) {
      return { ok: false, reason: `"${d.id}" cites requirement(s) not in this standard: ${unknown.join(', ')}` };
    }
    if (d.margin === null) {
      return { ok: false, reason: `"${d.id}" has no margin. How much of this you would accept losing is the decision being made; leaving it unset defers the only judgement that cannot be computed.` };
    }
  }
  if (!dimensions.some((d) => d.gateRole === 'ENFORCE')) {
    return { ok: false, reason: 'every dimension is OBSERVE, so the composite verdict is decided by nothing. At least one behaviour has to be one optimization may not trade away.' };
  }

  const body = JSON.stringify({ standardVersionHash: proposal.standardVersionHash,
    dimensions: [...dimensions].sort((a, b) => a.id.localeCompare(b.id)) });
  return { ok: true, version: {
    floorContractHash: createHash('sha256').update(body).digest('hex').slice(0, 16),
    standardVersionHash: proposal.standardVersionHash, dimensions, approvedBy, approvedAt } };
}

/** Convert an approved contract into the arithmetic the floor evaluates. */
export function toQualityFloorContract(v: FloorContractVersion): QualityFloorContract {
  const dimensions: Record<string, DimensionFloor> = {};
  for (const d of v.dimensions) {
    dimensions[d.id] = { nonInferiorityMargin: d.margin!, gateRole: d.gateRole,
      rationale: `protects ${d.sourceRequirementIds.join(', ')}: ${short(d.protectedBehavior)}` };
  }
  return { instrument: 'scoreDimensionByPolicy', dimensions };
}

/**
 * A floor contract belongs to ONE standard version.
 *
 * If the standard changes, the contract does not silently carry forward: a requirement may have been
 * reworded, dropped, or added, and a floor that protects the old text while the skill serves the new
 * one is protecting something nobody ratified any more.
 */
export function revalidate(v: FloorContractVersion, currentStandardHash: string): { ok: boolean; why: string } {
  return v.standardVersionHash === currentStandardHash
    ? { ok: true, why: 'the contract was approved against this exact standard' }
    : { ok: false, why: `this contract protects StandardVersion ${v.standardVersionHash} and the active standard is ${currentStandardHash}. Rederive and re-approve — a floor carried across a standard change protects text that is no longer ratified.` };
}
