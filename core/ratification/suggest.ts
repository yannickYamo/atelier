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

// ── HOW MUCH UNREAD WORK A SUGGESTION NEEDS ────────────────────────────────────────────────────
//
// Pressing Enter accepts every suggestion, so for most people the suggestion IS the ruling, and it has
// to be safe on thin evidence. Two pieces discovery never read decided too much: on a six-post corpus a
// rule was suggested for rejection because two unread pieces lacked it, while one of them plainly made
// the move. Below this floor the evidence cannot speak against a rule, so it is SHOWN AS AN EXAMPLE and
// the reason says so: the person can still reject it.
//
// The pieces RESERVED for the blind comparison are never consulted here, even when one of them would
// break a count suggested as an instruction: using them to shape the standard would spend the one check
// nothing has read. `atelier new` reports how the reserved pieces fare after the build instead.

/** Pieces where a rule applied and was never followed, before rejecting it is suggested (unread ones, when any were held out). */
export const MIN_PIECES_TO_REJECT = 4;

const TOO_FEW_TO_REJECT =
  `too few pieces to suggest rejecting it (${MIN_PIECES_TO_REJECT} needed), so it is shown as an example for you to judge`;

export interface ProposalEvidence {
  readonly framings: readonly string[];
  readonly heldOut: { readonly applicable: number; readonly present: number } | null;
  readonly needs: string | null;
  /** a measured rule's conformance on the pieces it was counted from */
  readonly inSample?: { readonly applicable: number; readonly present: number; readonly independent?: boolean; readonly weak?: boolean;
    /** the proposed limit was moved to where the author's pieces are; the counts are against the limit before it was moved */
    readonly fitted?: boolean } | null;
  /** a measured rule against the author's own pieces (read and held out): how many pieces, and which break it */
  readonly corpus?: { readonly pieces: number; readonly breaking: readonly number[] } | null;
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
    // A FITTED LIMIT IS JUDGED ON THE CORPUS, NOT ON THE HELD-OUT PIECES. Its limit was moved to where the author's
    // own pieces are (../observers/derive.ts, `fitToCorpus`), using the held-out pieces too, so they are no
    // independent check of it, and the counts above are against the limit before it moved. What stands for the
    // moved limit is the count of the author's pieces that meet it, which is the evidence a REQUIRED rule is held
    // to anyway (`suggestAll`). It still needs pieces to have been held out: with none, a rule that was not fitted
    // is shown rather than instructed, and a fitted one is treated no better.
    const own = e.corpus ?? null;
    const ownBreaking = new Set(own?.breaking ?? []).size;
    const fittedHolds = e.inSample.fitted === true && independent && own !== null && own.pieces > 0 && ownBreaking <= allowed(own.pieces, CORPUS_RULE_SHARE);
    if (r < 0.5 && !fittedHolds) {
      return applicable >= MIN_PIECES_TO_REJECT
        ? { decision: 'REJECT', materiality: null, needs, strength: 0, why: `only ${present} of ${applicable} ${where} meet it` }
        : { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 0, why: `only ${present} of ${applicable} ${where} meet it; ${TOO_FEW_TO_REJECT}` };
    }
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
    // A COUNTED FEATURE qualified as a DETECTOR: its band told the author's pieces from the model's plain
    // drafts. Nothing measured whether holding a draft to it makes the draft better, so it is never
    // suggested as required, however well it held (../observers/selection.ts: detection is not enforcement).
    if (p.measurement.observer === 'FEATURE') {
      return { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 1,
        why: `${seen}; qualified to tell your pieces from the model's drafts, not to steer a draft, so it is shown and used to choose between drafts until you make it required` };
    }
    const floorOnly = (p.measurement.observer === 'PATTERN_RATE' || p.measurement.observer === 'TERM_RATE')
      && typeof p.measurement.params.minPer1000 === 'number' && typeof p.measurement.params.maxPer1000 !== 'number';
    if (floorOnly) {
      return { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 1, why: `${seen}; a floor, so it guides draft selection rather than a rewrite` };
    }
    // A MIX OF SENTENCE LENGTHS IS THE AUTHOR'S RHYTHM, AND IT INSTRUCTS when their unread work bears it
    // out, like any count. Held only as a way to choose between drafts, it never moved a draft: in a
    // rewrite toward the company blog's voice every version kept the source's short sentences (a median of 11 words
    // against the company's 15). The observer points repair at the sentences in the overfull band and names the
    // band to rewrite them into (../observers/balance.ts, DISTRIBUTION).
    const lexicon = p.measurement.observer === 'LEXICON';
    if (fittedHolds && own !== null && !lexicon) {
      return { decision: 'APPROVE', materiality: 'REQUIRED', needs, strength: 3,
        why: `set where ${own.pieces - ownBreaking} of your ${own.pieces} pieces meet it; checked on every output` };
    }
    const strong = independent && r >= 0.8 && !lexicon;
    return { decision: 'APPROVE', materiality: strong ? 'REQUIRED' : 'PREFERRED', needs, strength: strong ? 3 : 1,
      why: lexicon ? `${seen}; absence is weak evidence, so it is shown until you make it required` : seen };
  }
  const agreed = (e?.framings.length ?? 0) > 1;
  const h = e?.heldOut ?? null;
  const rate = h && h.applicable > 0 ? h.present / h.applicable : null;

  // Could have applied in enough held-out work and was followed in none of it: the one case the evidence
  // speaks against a rule. It reads like a description of the pieces it came from. On fewer pieces the
  // same zero is shown as an example, the weakest on the screen, for the person to judge.
  if (h && h.applicable > 0 && h.present === 0) {
    return h.applicable >= MIN_PIECES_TO_REJECT
      ? { decision: 'REJECT', materiality: null, needs, strength: 0,
        why: `could have applied in ${h.applicable} pieces discovery never read, and was followed in none of them` }
      : { decision: 'APPROVE', materiality: 'PREFERRED', needs, strength: 0,
        why: `could have applied in ${h.applicable} unread piece(s) and was followed in none; ${TOO_FEW_TO_REJECT}` };
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
  // FOR NEW WRITING, REQUIRED MEANS "NEARLY ALWAYS". A move the author makes in three of five pieces,
  // instructed as a rule, is made in every piece, and several such moves stacked became a template a
  // blind reader recognised across five unrelated topics. So a reading-based rule instructs only when it
  // held in at least four in five unread pieces where it applied (three or more); the rest are moves
  // the author SOMETIMES makes, shown with their rate and a cap on how many one piece may carry.
  const nearlyAlways = rate !== null && h !== null && h.applicable >= 3 && rate >= 0.8;
  const required = mode === 'GENERATE' ? nearlyAlways && !needs : (held || agreed);
  // RESPOND with a condition: the measured weak spot. A conditional rule served as an instruction was
  // applied where its condition did not hold. Suggested as required only on strong evidence, and said.
  // The bar is the same as for new writing: "followed in 1 of 1 unread pieces" made a conditional rule
  // REQUIRED, and it refused every request it did not apply to. It must have held in four of five unread
  // pieces where it applied (three or more), and a rule that needs the person's material is never
  // suggested REQUIRED from here: answering binds that material per request, and most requests have none.
  const conditionalRespond = mode === 'RESPOND' && !isGeneralScope(p.appliesWhen);
  const materiality = conditionalRespond ? (nearlyAlways && agreed && !needs ? 'REQUIRED' : 'PREFERRED') : required ? 'REQUIRED' : 'PREFERRED';
  const caveat = conditionalRespond && materiality === 'PREFERRED'
    ? (needs ? '; conditional and needs your material, so shown rather than instructed' : '; conditional, so shown rather than instructed until the evidence is strong')
    : mode === 'GENERATE' && needs && held ? '; needs your material, so shown until you make it required' : '';
  return { decision: 'APPROVE', materiality, needs, strength, why: `${seen}${also}${caveat}` };
}

// ── A GOLDEN CORPUS PASSES ITS OWN STANDARD ────────────────────────────────────────────────────
//
// Each counted rule is set a little tighter than the author's average and is checked on its own, on the few
// pieces held out. Every rule can pass that check while the rules together fail the author: an outside tester
// found 13 of 24 of one author's own posts breaking a REQUIRED rule of the standard read from those posts, and 8
// of 24 of another's. Thirteen required rules that each hold in nineteen pieces of twenty hold together in about
// half of them. A person who hands over their best work and is told half of it fails has been given the wrong
// standard, and a draft held to it is held to something the author does not do.
//
// So the suggestions are read once more, together, against the pieces they came from (those read and those held
// out; never the reserve, which nothing may consult):
//
//   each rule   is suggested REQUIRED only if at least CORPUS_RULE_SHARE of the author's pieces meet it
//   the set     of rules suggested REQUIRED must leave at least CORPUS_SET_SHARE of the pieces breaking none;
//               when it does not, the fewest rules that bring it there are suggested PREFERRED instead
//
// On a small corpus a share is a blunt thing: one piece in nineteen is already more than a twentieth, so "95%"
// would mean "every piece", and one unusual post would move a rule the rest of the author's work keeps. So each
// check always allows one piece (`allowed`): a rule may be broken by one of the author's pieces, and one piece may
// break the set, however few pieces there are.
//
// A rule moved this way is still approved, still shown, still counted on every output and still used to choose
// between drafts. It stops failing an output on its own. The person can make it required on the same screen: this
// changes a default, never a ruling. A session recorded before the corpus was counted has no such evidence, and
// its suggestions are left as they were.

/** A rule is suggested REQUIRED only if at least this share of the author's own pieces meet it. */
export const CORPUS_RULE_SHARE = 0.95;
/** The rules suggested REQUIRED must, together, be met by at least this share of the author's own pieces. */
export const CORPUS_SET_SHARE = 0.9;

/**
 * How many of `pieces` may fall short of a share: the share's own count, and never fewer than one, from three pieces
 * up. With one piece or two, one allowed is the whole test given away (a rule the only piece breaks stayed required),
 * so none is.
 */
export const allowed = (pieces: number, share: number): number => (pieces < 3 ? 0 : Math.max(1, Math.floor((1 - share) * pieces + 1e-9)));

/** Sets of rules tried before the search for the fewest to move gives way to one rule at a time. */
const TRIES = 50_000;

/**
 * THE FEWEST RULES TO MOVE so that at most `room` pieces still break a rule. `breaking[k]` is the pieces rule `k`
 * breaks; the answer is positions in that list, ascending, or null when the search ran past TRIES (the caller then
 * moves one rule at a time, which is never wrong, only sometimes larger). Sets are tried smallest first. Among sets
 * of the first size that works: the one that leaves the fewest pieces breaking a rule, then the one whose rules the
 * most pieces break, then the one listed latest.
 */
export function fewestToMove(breaking: readonly (readonly number[])[], room: number): number[] | null {
  const failingWithout = (gone: ReadonlySet<number>): number => new Set(breaking.flatMap((b, k) => (gone.has(k) ? [] : [...b]))).size;
  let best: number[] | null = null; let tried = 0;
  const better = (a: readonly number[], b: readonly number[]): boolean => {
    const fa = failingWithout(new Set(a)); const fb = failingWithout(new Set(b));
    if (fa !== fb) return fa < fb;
    const weight = (x: readonly number[]): number => x.reduce((n, k) => n + breaking[k].length, 0);
    if (weight(a) !== weight(b)) return weight(a) > weight(b);
    for (let k = a.length - 1; k >= 0; k--) if (a[k] !== b[k]) return a[k] > b[k];
    return false;
  };
  for (let size = 0; size <= breaking.length && best === null && tried < TRIES; size++) {
    const pick = (from: number, chosen: number[]): void => {
      if (tried >= TRIES) return;
      if (chosen.length === size) { tried++; if (failingWithout(new Set(chosen)) <= room && (best === null || better(chosen, best))) best = [...chosen]; return; }
      for (let k = from; k < breaking.length; k++) pick(k + 1, [...chosen, k]);
    };
    pick(0, []);
  }
  return best;
}

/** How the author's own pieces fare against the rules suggested REQUIRED, for the screen and the build to say. */
export interface CorpusStanding { readonly pieces: number; readonly passing: number; readonly moved: readonly string[];
  /** counted rules still suggested REQUIRED: with none, there is nothing for the pieces to meet and nothing is said */
  readonly required: number }

/**
 * EVERY SUGGESTION, THEN THE TWO CHECKS ABOVE. `suggest` rules on one proposal from its own evidence; this is the
 * only place the suggestions are read together. Returns one suggestion per proposal, in the order given, and how
 * the corpus stands against what is left REQUIRED (null when no proposal carries the corpus's count).
 */
export function suggestAll(proposals: readonly Requirement[], meta: Readonly<Record<string, ProposalEvidence | undefined>> | null | undefined, mode: SkillMode):
{ readonly suggestions: readonly Suggestion[]; readonly corpus: CorpusStanding | null } {
  const out = proposals.map((p) => suggest(p, meta?.[p.requirementId], mode));
  const counted = proposals.map((p) => (p.measurement ? meta?.[p.requirementId]?.corpus ?? null : null));
  const pieces = Math.max(0, ...counted.map((c) => c?.pieces ?? 0));
  if (pieces === 0) return { suggestions: out, corpus: null };
  const required = (i: number): boolean => out[i].decision === 'APPROVE' && out[i].materiality === 'REQUIRED' && counted[i] !== null;
  const moved: string[] = [];
  const demote = (i: number, why: string): void => { out[i] = { ...out[i], materiality: 'PREFERRED', strength: 1, why: `${out[i].why}; ${why}` }; moved.push(proposals[i].requirementId); };
  const until = 'so it is shown and used to choose between drafts until you make it required';
  // Each rule on its own.
  proposals.forEach((_, i) => {
    const c = counted[i];
    if (!required(i) || !c) return;
    if (new Set(c.breaking).size > allowed(c.pieces, CORPUS_RULE_SHARE)) demote(i, `${new Set(c.breaking).size} of your own ${c.pieces} pieces break it, ${until}`);
  });
  // Then the rules together: the pieces that break none of them.
  const breakingAny = (): Set<number> => new Set(proposals.flatMap((_, i) => (required(i) ? [...(counted[i]?.breaking ?? [])] : [])));
  const room = allowed(pieces, CORPUS_SET_SHARE);
  if (breakingAny().size > room) {
    // THE FEWEST RULES MOVED. Moving the rule the most pieces break, one at a time, can move more rules than it has
    // to: a tester's replay kept 7 required rules of 13 on one author where 10 could have stayed. So the sets are
    // tried smallest first, and the first size at which some set brings the corpus within the room is the answer.
    // Among sets of that size: the one that leaves the fewest pieces breaking a rule, then the one whose rules the
    // most pieces break, then the one listed latest. The search is exact while it is small; past TRIES it falls back
    // to one rule at a time, which is never wrong, only sometimes larger.
    const live = proposals.map((_, i) => i).filter(required).filter((i) => (counted[i]?.breaking.length ?? 0) > 0);
    const failingWithout = (gone: ReadonlySet<number>): number => new Set(proposals.flatMap((_, i) => (required(i) && !gone.has(i) ? [...(counted[i]?.breaking ?? [])] : []))).size;
    const chosen = fewestToMove(live.map((i) => counted[i]?.breaking ?? []), room);
    const best = chosen === null ? null : chosen.map((k) => live[k]);
    if (best !== null) {
      const left = pieces - failingWithout(new Set(best));
      for (const i of best) demote(i, `with it, fewer than ${pieces - room} of your own ${pieces} pieces would meet every required rule (${left} do without it), ${until}`);
    } else {
      for (let failing = breakingAny(); failing.size > room; failing = breakingAny()) {
        const worst = proposals.map((_, i) => i).filter(required).sort((x, y) => (counted[y]?.breaking.length ?? 0) - (counted[x]?.breaking.length ?? 0) || y - x)[0];
        if (worst === undefined || !counted[worst]?.breaking.length) break;
        demote(worst, `with it, only ${pieces - failing.size} of your own ${pieces} pieces would meet every required rule, ${until}`);
      }
    }
  }
  return { suggestions: out, corpus: { pieces, passing: pieces - breakingAny().size, moved, required: proposals.filter((_, i) => required(i)).length } };
}

