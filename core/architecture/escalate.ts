// atelier/core/architecture/escalate.ts — THE ONLY THING AN OPTIMIZER MAY PROPOSE IN V1.
//
// ─── WHY THIS IS NOT `resolveCompilationNeed` ──────────────────────────────────────────────────
//
// The historical compiler already contains a deterministic carrier decision
// in the private predecessor this was extracted from, and reusing it was the first plan. Its
// evidence contract does not fit, and the mismatch is not cosmetic:
//
//   casesProbed      DISCRIMINATING cases, built to expose the requirement — "typical cases cannot
//                    separate the arms" (native-failure-prober.ts). We have one arbitrary user task.
//   bareFailures     cases where the BARE model violated it. No bare arm is ever run in production.
//   repairedByProse  of those, how many a LEAN-PROSE arm repaired. There is no two-arm comparison.
//   expertConfirmed  a blind PAIR label with arm identity sealed. We have a complaint on one output.
//
// Reaching `hasDemonstratedNativeFailure` would require asserting a bare-model failure never
// observed, and setting `repairedByProse = 0` — which in that module means "prose was tried and did
// not repair it", not "no prose repair was attempted". Encoding never-attempted as attempted-and-
// failed is fabricating the measurement, so the resolver is left alone and this module states what
// we actually saw.
//
// They are DIFFERENT ESTIMANDS, not competing implementations. The prober answers a PRE-deployment
// question — does the bare model need this rule, and is prose enough? This answers a POST-deployment
// one — prose was served and the requirement was missed anyway. Both are legitimate carrier
// evidence; conflating them is the adjacent-estimand error. The prober remains the right reuse
// point the day we want pre-deployment evidence.

import type { Carrier, SkillArchitecture, ArchitectureComponent } from './compile.js';

/**
 * What we can HONESTLY say after one real invocation and one human complaint.
 *
 * Every field is something observed. There is deliberately no count, rate or probe here: naming a
 * denominator we never had is how a single anecdote acquires the authority of a measurement.
 */
export interface ServedMissEvidence {
  readonly invocationId: string;
  readonly requirementId: string;
  /** where the requirement lived in the architecture THAT RAN — not the current one */
  readonly carrierAtServe: Carrier;
  /** the person said this output missed this requirement. Not a proxy, not a judge. */
  readonly expertConfirmed: true;
  readonly at: string;
}

/**
 * The ladder. Cumulative, weakest first — each level KEEPS the previous and adds to it.
 *
 * `EXAMPLE` and `OUTPUT_CONTRACT` are deliberately absent from the ladder even though `Carrier`
 * declares them: the renderer cannot honour them yet, and returning a level nothing can render
 * would mint a candidate whose SkillVersion moved while the model read the same words.
 */
const LADDER: readonly Carrier[] = ['PROSE', 'SELF_CHECK'];

export const nextLevel = (current: Carrier): Carrier | null => {
  const i = LADDER.indexOf(current);
  return i === -1 || i === LADDER.length - 1 ? null : LADDER[i + 1];
};

export interface EscalateCarrier {
  readonly kind: 'ESCALATE_CARRIER';
  readonly requirementId: string;
  readonly from: Carrier;
  readonly to: Carrier;
  /** the full provenance chain, so V(n+1) can always say why it differs from V(n) */
  readonly becauseInvocation: string;
  readonly rationale: string;
}

export interface EscalationRefusal { readonly refused: true; readonly reason: string }

/**
 * ONE observed miss proposes ONE escalation of ONE requirement, or it proposes nothing.
 *
 * The refusals matter more than the acceptance. An optimizer that always finds something to do is
 * not responding to evidence, and "the demo needs a candidate" is not evidence.
 */
export function proposeEscalation(
  ev: ServedMissEvidence, arch: SkillArchitecture,
): EscalateCarrier | EscalationRefusal {
  const carrying = arch.components.filter((c) => c.carries.includes(ev.requirementId));
  if (carrying.length === 0) {
    return { refused: true, reason: `no component in architecture ${arch.architectureHash} carries ${ev.requirementId}; there is nothing to escalate.` };
  }
  if (carrying.length > 1) {
    return { refused: true, reason: `${ev.requirementId} is carried by ${carrying.length} components; escalating one and not the others would leave the requirement in two places at two strengths.` };
  }
  const c = carrying[0];
  if (c.carrier !== ev.carrierAtServe) {
    // The architecture moved since the output was produced. Escalating now would repair a version
    // nobody complained about, and would attribute someone else's change to this evidence.
    return { refused: true, reason: `${ev.requirementId} was served at ${ev.carrierAtServe} but is now at ${c.carrier}. The implementation already changed; this evidence is about the one that ran.` };
  }
  const to = nextLevel(c.carrier);
  if (!to) {
    return { refused: true, reason: `${ev.requirementId} is already at ${c.carrier}, the strongest carrier this renderer implements. A stronger arrangement is not available, so the miss is not an arrangement problem.` };
  }
  return {
    kind: 'ESCALATE_CARRIER', requirementId: ev.requirementId, from: c.carrier, to,
    becauseInvocation: ev.invocationId,
    rationale: `served at ${c.carrier} on invocation ${ev.invocationId} and the author confirmed the output missed it, so the least stronger arrangement is ${to}`,
  };
}

/**
 * Apply the operation. Pure; returns a NEW architecture.
 *
 * `gateRole` and `carries` are copied UNTOUCHED. That is not tidiness — gate role is derived from
 * authority and is the one thing an optimizer may never move, so this function must be structurally
 * incapable of moving it. `assertArchitectureServesStandard` will refuse the result if it ever does.
 */
export function applyEscalation(arch: SkillArchitecture, op: EscalateCarrier, newHash: string): SkillArchitecture {
  const components: ArchitectureComponent[] = arch.components.map((c) =>
    c.carries.includes(op.requirementId)
      ? { ...c, carrier: op.to, rationale: `${c.rationale}; escalated ${op.from}->${op.to} after ${op.becauseInvocation}` }
      : c);
  return { ...arch, architectureHash: newHash, components };
}
