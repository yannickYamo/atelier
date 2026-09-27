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
  // WHAT THE SKILL IS ASKED TO DO, THEN WHO IT IS FOR. "always write in my voice" is generation with an
  // adverb, "write a support article" is generation about support, and "draft replies to customer
  // emails" is answering people even though it starts with a writing verb. Replying is the act that
  // makes a skill a policy for answers; checking is the act that makes it a gate.
  const replying = /\b(repl(y|ies|ying)|respond(s|ing)?|responses?|answer(s|ing)?)\b/.test(t);
  const people = /\b(customers?|clients?|users?|support|tickets?|help ?desk|inquir\w*|complaints?|emails?|messages?|dms?)\b/.test(t);
  const checks = /\b(ensure|enforce|check(s|ing)?|audit|review(s|ing)?|comply|compliance|make sure|verify|lint|gate|follow(s)?)\b/.test(t);
  const produces = /^\s*(please\s+)?(write|draft|compose|create|generate|produce)\b/.test(t)
    || /\b(write|draft|compose)\s+(me\s+)?(a|an|the|my|our)\b/.test(t);
  if (replying && people) return { mode: 'RESPOND', why: 'you described answering people, so every rule you keep is a policy the answers must follow' };
  if (checks && !produces) return { mode: 'GUARD', why: 'you described holding outputs to the standard, so the rules you keep default to required' };
  return { mode: 'GENERATE', why: 'you described producing new work, so rules default to required only where the evidence is strong' };
}

export interface ProposalEvidence {
  readonly framings: readonly string[];
  readonly heldOut: { readonly applicable: number; readonly present: number } | null;
  readonly needs: string | null;
  /** a measured rule's conformance on the pieces it was counted from */
  readonly inSample?: { readonly applicable: number; readonly present: number; readonly independent?: boolean; readonly weak?: boolean } | null;
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
  // A MEASURED rule is a count, and its evidence is how the author's own UNSEEN work fares against it.
  // Checked on held-out pieces and met by almost all of them, the target describes the author: it can
  // instruct. Checked only on the pieces it was computed from, it passes by construction and is shown,
  // not instructed, until the person says otherwise. A banned-phrase list is a negative from absence —
  // weaker evidence than any count — so it is shown by default in every case.
  if (p.measurement && e?.inSample && e.inSample.applicable > 0) {
    const { applicable, present } = e.inSample;
    const independent = e.inSample.independent === true;
    const r = present / applicable;
    const where = independent ? 'held-out pieces' : 'pieces it was counted from (nothing held out to check it on)';
    const seen = `${present} of ${applicable} ${where} meet it; checked on every output`;
    if (r < 0.5) return { decision: 'REJECT', materiality: null, needs, strength: 0, why: `only ${present} of ${applicable} ${where} meet it` };
    // A style distance is a measure to pick drafts by, not a span anything can rewrite; a floor ("at
    // least so many bold phrases") has nothing to point a repair at either. Both are shown by default.
    if (p.measurement.observer === 'STYLE_DISTANCE') {
      return { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 2,
        why: `${present} of ${applicable} ${where} are closer to you than to the model; used to choose between drafts` };
    }
    if (e.inSample.weak) {
      return { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 1,
        why: `${seen}; the model's plain drafts did not show this habit clearly, so it is shown and used to choose between drafts until you make it required` };
    }
    if (p.measurement.observer === 'PATTERN_RATE' && typeof p.measurement.params.minPer1000 === 'number') {
      return { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 1, why: `${seen}; a floor, so it guides draft selection rather than a rewrite` };
    }
    const lexicon = p.measurement.observer === 'LEXICON';
    const strong = independent && r >= 0.8 && !lexicon;
    return { decision: 'APPROVE', materiality: strong ? 'REQUIRED' : 'PREFERRED', needs, strength: strong ? 3 : 1,
      why: lexicon ? `${seen}; absence is weak evidence, so it is shown until you make it required` : seen };
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
  const seen = !h ? 'not checked against unread work'
    : h.applicable > 0 ? `followed in ${h.present} of ${h.applicable} unread pieces where it applies`
      : 'never applied in the unread pieces, so they could not confirm it';
  const also = agreed ? '; two independent readings found it' : '';

  // A rule that needs material only the person has would, as REQUIRED, refuse every task that does not
  // bind it — for new writing that is most of them. So when producing new work it is suggested as
  // shown and asks for the material in the host; when answering or guarding, the facts are the point.
  const required = mode === 'GENERATE' ? held && !needs : (held || agreed);
  // RESPOND with a condition: the measured weak spot. A conditional rule served as an instruction was
  // applied where its condition did not hold. Suggested as required only on strong evidence, and said.
  const conditionalRespond = mode === 'RESPOND' && !isGeneralScope(p.appliesWhen);
  const materiality = conditionalRespond ? (held && agreed ? 'REQUIRED' : 'PREFERRED') : required ? 'REQUIRED' : 'PREFERRED';
  const caveat = conditionalRespond && materiality === 'PREFERRED'
    ? '; conditional, so shown rather than instructed until the evidence is strong'
    : mode === 'GENERATE' && needs && held ? '; needs your material, so shown until you make it required' : '';
  return { decision: 'APPROVE', materiality, needs, strength, why: `${seen}${also}${caveat}` };
}
