// atelier/core/ratification/suggest.ts — WHAT THE REVIEW SCREEN PROPOSES, AND WHY. NEVER WHAT IS DECIDED.
//
// Ratification is the one act a machine may not perform, and until now it was also the one a first-time
// user could not get through: sixteen overlapping candidates, each needing a five-way judgement, with the
// evidence for each scattered through the scrollback. Most people either stopped there or accepted
// everything as it stood, which builds a skill that instructs nothing.
//
// So every proposal arrives with a SUGGESTED ruling, computed from evidence discovery already paid for —
// whether the rule held in work the proposer never read, and whether two independent vantages reached
// it — and from what the person said they want the skill for. The person still rules: approving the
// suggestions is one decision they make, recorded in the ledger as theirs, and any one of them can be
// overridden on the same screen. What this module may never do is decide. It returns text and a
// default, and nothing here writes to a standard.
//
// Deterministic and free. No model is asked what it thinks the person would pick; a suggestion that
// could change between two runs over the same evidence would be a suggestion nobody could audit.

import type { Requirement } from '../state/canonical-state.js';
import { isGeneralScope } from '../state/canonical-state.js';

/**
 * What the person wants the skill FOR, read off the words they used. It moves only the default weight
 * of a rule, never whether a rule exists.
 *
 *   GENERATE  "write me a blog post in the voice of the corpus"      — produce new work in a voice
 *   GUARD     "ensure all content outputs follow the corpus"         — hold every output to the standard
 *   RESPOND   "customer support needs to always answer this way"     — answer inside a policy
 */
export type SkillMode = 'GENERATE' | 'GUARD' | 'RESPOND';

export function modeFromIntent(intent: string): { readonly mode: SkillMode; readonly why: string } {
  const t = ` ${intent.toLowerCase()} `;
  if (/\b(support|customers?|client|reply|replies|respond|responses?|answers?|tickets?|inquir\w*|helpdesk|help desk)\b/.test(t)) {
    return { mode: 'RESPOND', why: 'you described answering people, so every rule you keep is a policy the answers must follow' };
  }
  if (/\b(ensure|always|every|all|must|comply|compliance|check|review|audit|consistent|follow)\b/.test(t)) {
    return { mode: 'GUARD', why: 'you described holding outputs to the standard, so the rules you keep default to required' };
  }
  return { mode: 'GENERATE', why: 'you described producing new work, so rules default to required only where the evidence is strong' };
}

export interface ProposalEvidence {
  readonly framings: readonly string[];
  readonly heldOut: { readonly applicable: number; readonly present: number } | null;
  readonly needs: string | null;
  /** a measured rule's conformance on the pieces it was counted from */
  readonly inSample?: { readonly applicable: number; readonly present: number } | null;
}

export interface Suggestion {
  readonly decision: 'APPROVE' | 'REJECT';
  readonly materiality: 'REQUIRED' | 'PREFERRED' | null;
  /** what following it needs from the person, proposed as a prerequisite */
  readonly needs: string | null;
  /** one line a person can disagree with */
  readonly why: string;
  /** how strongly the evidence supports it, for ordering the screen. Not a confidence score. */
  readonly strength: 0 | 1 | 2 | 3;
}

export function suggest(p: Requirement, e: ProposalEvidence | undefined, mode: SkillMode): Suggestion {
  const needs = e?.needs ?? null;
  // A MEASURED rule is a count, and its evidence is how much of the author's own work meets it. When
  // almost all of it does, the target describes them and is checkable on every output: required, in
  // every mode. When much of it does not, the number describes an average nobody writes to.
  if (p.measurement && e?.inSample && e.inSample.applicable > 0) {
    const { applicable, present } = e.inSample;
    const r = present / applicable;
    const seen = `${present} of ${applicable} of your pieces meet it; checked on every output`;
    if (r >= 0.8) return { decision: 'APPROVE', materiality: 'REQUIRED', needs, strength: 3, why: seen };
    if (r >= 0.5) return { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 1, why: seen };
    return { decision: 'REJECT', materiality: null, needs, strength: 0, why: `only ${present} of ${applicable} of your pieces meet it` };
  }
  const agreed = (e?.framings.length ?? 0) > 1;
  const h = e?.heldOut ?? null;
  const rate = h && h.applicable > 0 ? h.present / h.applicable : null;

  // Could have applied in held-out work at least twice and was followed in none of it: the one case the
  // evidence speaks against a rule. It reads like a description of the pieces it came from.
  if (h && h.applicable >= 2 && h.present === 0) {
    return { decision: 'REJECT', materiality: null, needs, strength: 0,
      why: `could have applied in ${h.applicable} pieces discovery never read, and was followed in none of them` };
  }
  const held = rate !== null && rate >= 0.5;
  const strength = ((held ? 2 : 0) + (agreed ? 1 : 0)) as 0 | 1 | 2 | 3;
  const seen = h && h.applicable > 0 ? `followed in ${h.present} of ${h.applicable} unread pieces where it applies` : 'not checked against unread work';
  const also = agreed ? '; two independent readings found it' : '';

  const required = mode === 'GENERATE' ? held : (held || agreed);
  // RESPOND with a condition: the measured weak spot. A conditional rule served as an instruction was
  // applied where its condition did not hold. Suggested as required only on strong evidence, and said.
  const conditionalRespond = mode === 'RESPOND' && !isGeneralScope(p.appliesWhen);
  const materiality = conditionalRespond ? (held && agreed ? 'REQUIRED' : 'PREFERRED') : required ? 'REQUIRED' : 'PREFERRED';
  const caveat = conditionalRespond && materiality === 'PREFERRED'
    ? '; conditional, so shown rather than instructed until the evidence is strong' : '';
  return { decision: 'APPROVE', materiality, needs, strength, why: `${seen}${also}${caveat}` };
}
