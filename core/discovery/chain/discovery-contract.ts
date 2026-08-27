// PORTED, UNCHANGED EXCEPT IMPORT PATHS.
//
// Ported rather than rewritten, and the original kept running while this one earned its callers:
// copy-then-delete in one movement is how a reference implementation is lost before the port has
// survived use. Its behaviour is pinned by this repository's own tests; the tree it came from is
// not public, and no claim in this repository rests on it.
//
// Nothing here does I/O or calls a model. The whole chain is pure, which is why it ports at all: the
// inference boundary is a PARAMETER, so Atelier supplies its own client and the logic never knew.

/**
 * DISCOVERY CONTRACT — goldens in, candidate hypotheses out, with circularity designed out.
 *
 * This is the step the whole product hinges on and the one with no witnessed evidence: both
 * shipped standards were HAND-AUTHORED, not discovered, and `taste-discovery.ts` has only ever
 * been run by its own author. Everything here is built to make an honest run possible and a
 * self-confirming run impossible.
 *
 * THE CIRCULARITY THIS PREVENTS. A model that proposes "the expert prefers X" and then marks X
 * present across the same goldens has confirmed itself. Recurrence measured on the examples the
 * hypothesis was read off is not evidence, it is a restatement. So discovery SPLITS the corpus:
 *
 *     PROPOSAL set  — the model reads these and proposes hypotheses
 *     HELD-OUT set  — recurrence is counted ONLY here, on goldens the proposer never saw
 *
 * `validateDiscovery` refuses any hypothesis whose recurrence leaks across that boundary.
 *
 * WHAT DISCOVERY CANNOT DO, BY CONSTRUCTION. It cannot make a factor load-bearing. Every
 * hypothesis is DERIVED_UNRATIFIED and `assignPriority` caps it at ADVISORY. And
 * `confidenceFrom()` in taste-discovery.ts takes discrimination and boundary counts ONLY —
 * recurrence is not an input — so a factor present in every held-out golden is still
 * UNDERIDENTIFIED until the expert supplies discriminating or boundary labels. The honest yield
 * is therefore small by design, and that is the correct behaviour rather than a limitation to
 * engineer around.
 *
 * WHAT THE MODEL IS ALLOWED TO DO: propose candidate factors, and observe whether a factor is
 * APPLICABLE and PRESENT in a held-out golden — a comparatively objective reading.
 * WHAT ONLY THE EXPERT MAY DO: say whether their preference MOVES with a factor, and where the
 * boundary sits. Those are the load-bearing channels and no model may supply them.
 *
 * Pure module — zero I/O, no LLM. A thin harness makes the call and feeds the result here.
 */
import type { ConstructScope } from './construct-scope.js';
import type { Predicate } from './taste-factor.js';
import type { TasteFactorHypothesis, GoldenObservation } from './taste-discovery.js';

/** One expert-supplied example, with its role in the split. */
export interface GoldenRef {
  readonly contextId: string;
  /** PROPOSAL goldens are shown to the proposer; HELD_OUT ones are never shown to it. */
  readonly role: 'PROPOSAL' | 'HELD_OUT';
  /** the expert's own framing, if they gave one — never required */
  readonly note?: string;
}

/** What the proposer must return per candidate. Shape is the server's; the words are the model's. */
export interface ProposedFactor {
  readonly proposedId: string;
  /** "names the contradiction in the buyer's belief before introducing the position" */
  readonly description: string;
  /** conditional by law — a factor with no appliesWhen is a caricature */
  readonly appliesWhen: readonly Predicate[];
  /** which PROPOSAL goldens it was read off — provenance, checked against the split */
  readonly readFrom: readonly string[];
  /** the proposer's own statement of what would show this factor ABSENT. Forces falsifiability. */
  readonly wouldBeAbsentIf: string;
  /**
   * A VERBATIM SPAN FROM THE WORK, showing the rule happening.
   *
   * The EXAMPLE carrier exists on the argument that showing beats telling, and until this field it had
   * nothing to show: every compiled example carried the rule's DESCRIPTION, so a carrier whose whole
   * purpose is demonstration was issuing a second sentence of instruction. It matters most for a
   * realization — "end the beat on a short declarative that renames the thing" is a paraphrase of a
   * form, and *"That silence is the product"* is the form.
   *
   * Empty when the proposer offered nothing locatable. Verbatim is checked, never trusted.
   */
  readonly quote: string;
}

export interface DiscoveryInput {
  readonly skillId: string;
  readonly goldens: readonly GoldenRef[];
  readonly proposed: readonly ProposedFactor[];
  /** per factor, per HELD-OUT golden: is it applicable, and is it present? */
  readonly observations: readonly { readonly proposedId: string; readonly observation: GoldenObservation }[];
}

export const MIN_PROPOSAL_GOLDENS = 2;
export const MIN_HELD_OUT_GOLDENS = 2;

/**
 * Refuse a discovery run that cannot yield honest evidence.
 * Every problem returned is a REFUSAL, not a warning — a run that trips any of these produces
 * numbers that look like evidence and are not.
 */
export function validateDiscovery(input: DiscoveryInput): readonly string[] {
  const problems: string[] = [];
  const proposalIds = new Set(input.goldens.filter(g => g.role === 'PROPOSAL').map(g => g.contextId));
  const heldOutIds = new Set(input.goldens.filter(g => g.role === 'HELD_OUT').map(g => g.contextId));

  if (proposalIds.size < MIN_PROPOSAL_GOLDENS) {
    problems.push(`only ${proposalIds.size} proposal golden(s) — a factor read off fewer than ${MIN_PROPOSAL_GOLDENS} is a description of one example, not a pattern`);
  }
  if (heldOutIds.size < MIN_HELD_OUT_GOLDENS) {
    problems.push(`only ${heldOutIds.size} held-out golden(s) — recurrence needs ${MIN_HELD_OUT_GOLDENS}+ examples the proposer never saw, or it is a restatement`);
  }
  const overlap = [...proposalIds].filter(id => heldOutIds.has(id));
  if (overlap.length) problems.push(`golden(s) in BOTH sets: ${overlap.join(', ')} — the split is what prevents self-confirmation`);

  for (const f of input.proposed) {
    if (f.appliesWhen.length === 0) {
      problems.push(`${f.proposedId}: no appliesWhen — taste is Q(y|x,S_u); a factor with no conditions is a caricature`);
    }
    if (!f.wouldBeAbsentIf?.trim()) {
      problems.push(`${f.proposedId}: no falsifier — a hypothesis that cannot be shown absent cannot be tested`);
    }
    if (f.readFrom.length === 0) {
      problems.push(`${f.proposedId}: no provenance — which goldens was this read off?`);
    }
    for (const src of f.readFrom) {
      if (heldOutIds.has(src)) {
        problems.push(`${f.proposedId}: read off HELD-OUT golden ${src} — the proposer saw what it is being scored against`);
      } else if (!proposalIds.has(src)) {
        problems.push(`${f.proposedId}: cites unknown golden ${src}`);
      }
    }
  }

  for (const { proposedId, observation } of input.observations) {
    if (!heldOutIds.has(observation.contextId)) {
      problems.push(`${proposedId}: recurrence counted on ${observation.contextId}, which is not held out — recurrence is only evidence on unseen goldens`);
    }
  }
  return problems;
}

/**
 * Split a run into the candidates whose PROVENANCE holds and those whose does not.
 *
 * WITNESSED, on the first walkthrough by someone who did not write the corpus: the proposer cited
 * a golden it was never shown — it had read two examples and attributed a pattern to a third whose
 * name it could only have inferred from their contents. The held-out guard caught it as a side
 * effect of anti-circularity, which is a second thing the split buys beyond its stated purpose:
 * it detects FABRICATED PROVENANCE.
 *
 * Refusing the whole run for one bad citation is too blunt — it discards candidates whose
 * provenance is sound. Refusing the CANDIDATE is right, because a claim that cites a source it
 * never saw is unreliable as a claim, not merely mis-attributed. So this partitions rather than
 * aborting, and every refusal carries its reason so the driver can show it rather than swallow it.
 *
 * Structural checks only — citation membership, never a judgement about whether a candidate is good.
 */
export function partitionByProvenance(
  input: DiscoveryInput,
): { readonly admissible: DiscoveryInput; readonly refused: readonly { proposedId: string; reason: string }[] } {
  const proposalIds = new Set(input.goldens.filter(g => g.role === 'PROPOSAL').map(g => g.contextId));
  const heldOutIds = new Set(input.goldens.filter(g => g.role === 'HELD_OUT').map(g => g.contextId));
  const refused: { proposedId: string; reason: string }[] = [];
  const keep: ProposedFactor[] = [];

  for (const f of input.proposed) {
    const invented = f.readFrom.filter(id => !proposalIds.has(id));
    if (invented.length === 0) { keep.push(f); continue; }
    const sawHeldOut = invented.filter(id => heldOutIds.has(id));
    refused.push({
      proposedId: f.proposedId,
      reason: sawHeldOut.length
        ? `it credits ${sawHeldOut.join(', ')}, which the analysis was never shown — the citation is invented, so the claim is not reliable`
        : `it credits ${invented.join(', ')}, which is not among the examples read`,
    });
  }
  const keepIds = new Set(keep.map(f => f.proposedId));
  return {
    admissible: { ...input, proposed: keep, observations: input.observations.filter(o => keepIds.has(o.proposedId)) },
    refused,
  };
}

/**
 * Convert a validated discovery run into hypotheses + their held-out recurrence observations.
 * @throws when the run does not validate — an invalid run must never silently yield evidence.
 */
export function toHypotheses(
  input: DiscoveryInput,
  scope: ConstructScope,
  proposedBy: string,
): readonly { hypothesis: TasteFactorHypothesis; golden: readonly GoldenObservation[] }[] {
  const problems = validateDiscovery(input);
  if (problems.length) throw new Error(`discovery run refused:\n  ${problems.join('\n  ')}`);
  return input.proposed.map(f => ({
    hypothesis: {
      proposedId: f.proposedId,
      description: f.description,
      constructScope: scope,
      appliesWhen: f.appliesWhen,
      quote: f.quote,
      provenance: { proposedBy, fromGoldens: f.readFrom },
    },
    golden: input.observations.filter(o => o.proposedId === f.proposedId).map(o => o.observation),
  }));
}

/**
 * The honest headline for a discovery run, phrased for a user rather than a ledger.
 * Deliberately states what the run CANNOT yet claim — recurrence is not preference, and nothing
 * here is load-bearing until the expert answers.
 */
export function discoverySummary(
  factorCount: number,
  heldOutCount: number,
  needingLabels: number,
): string {
  if (factorCount === 0) {
    return 'Nothing distinctive was found that your examples consistently share. That can mean the examples vary more than they align, or that what makes them good is already what any competent draft would do.';
  }
  return `Found ${factorCount} candidate${factorCount === 1 ? '' : 's'}, checked against ${heldOutCount} example${heldOutCount === 1 ? '' : 's'} the analysis had not seen. `
    + `${needingLabels} still need${needingLabels === 1 ? 's' : ''} your judgement before anything can rely on ${needingLabels === 1 ? 'it' : 'them'} — `
    + 'appearing in your examples shows a pattern, not that you would object if it were missing. That is the question only you can answer.';
}
