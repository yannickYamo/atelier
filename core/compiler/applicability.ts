// atelier/core/compiler/applicability.ts — HOW A MOVE IS SERVED IS DECIDED BY HOW MUCH OF THE CORPUS SHOWS IT.
//
// A skill built from 24 example answers, 3 of which ask before delivering, served "ask first" four ways at once: a
// persona trait, two "moves I sometimes make", and a built-in paragraph. Against a careful hand-written skill it
// lost 14 of 15 cases the same way: it withheld the thing that was asked for. A habit of three pieces in twenty-four
// was being carried as if it held everywhere.
//
// The rule this file applies: a move is carried no more widely than the corpus supports.
//
//   general      the move's condition holds across the corpus (the lower end of the 95% interval of
//                applicable / pieces is at least GENERAL_SHARE): it may be stated as something I do.
//   conditional  the move is well evidenced where it applies and applies in part of the corpus: it is stated
//                only with its condition, and with what to do when the condition does not hold.
//   exemplar     too little evidence to state at all (fewer than MIN_APPLICABLE pieces where it could apply, or a
//                one-sided 95% lower bound of present / applicable under MIN_PRESENT_BOUND): the author's own
//                words are shown as one instance, with the condition, and no instruction is written from them.
//
// WHAT THE NUMBER IS, AND IS NOT. It is evidence density in the corpus: how often the examples show the move. It
// is the only number a build has. How often the condition holds in use is a different quantity and is measured in
// use, from the runs' own applicability records; a build never claims it.
//
// A MOVE THAT HOLDS BACK what was asked (a refusal, a question before any answer) costs more when misapplied than a
// move about wording, because the person leaves with nothing. Such a move is `exemplar` until the owner rules on it
// (REQUIRED, or a condition they authored): the owner decides when they refuse, never the compiler.
//
// This changes how a rule is CARRIED, never the rule: the standard, its hash and the owner's rulings are untouched.

import type { Budget, InferenceClient } from '../inference/client.js';
import { spend } from '../inference/client.js';

export type MoveCarrier = 'general' | 'conditional' | 'exemplar';

/** A move is stated only when at least this many pieces could have shown it. */
export const MIN_APPLICABLE = 3;
/** And the one-sided 95% lower bound of present / applicable is at least this. Three of three clears it (0.37); two of two does not (0.22). */
export const MIN_PRESENT_BOUND = 0.3;
/** A move is general when the lower end of the 95% interval of applicable / pieces is at least this. */
export const GENERAL_SHARE = 0.6;

/** Exact (Clopper-Pearson) lower bound of a binomial proportion at one-sided level `alpha`, by bisection. */
export function lowerBound(successes: number, n: number, alpha = 0.05): number {
  if (n <= 0 || successes <= 0) return 0;
  if (successes >= n) return Math.pow(alpha, 1 / n);
  // P(X >= successes | p) = alpha at the bound; the tail is increasing in p.
  const tail = (p: number): number => { let s = 0; let c = 1; for (let k = 0; k <= n; k++) { if (k >= successes) s += c * Math.pow(p, k) * Math.pow(1 - p, n - k); c = (c * (n - k)) / (k + 1); } return s; };
  let lo = 0; let hi = successes / n;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tail(mid) > alpha) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

export interface MoveEvidence {
  readonly present: number | null;
  readonly applicable: number | null;
  /** readable pieces of the corpus, when the build knows it */
  readonly pieces: number | null;
  /** one-sided 95% lower bound of present / applicable */
  readonly presentBound: number | null;
  /** lower end of the two-sided 95% interval of applicable / pieces */
  readonly shareBound: number | null;
  readonly carrier: MoveCarrier;
  /** why, in words a skill card can print */
  readonly why: string;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The carrier of one move. `holdsBack`: the move tells the writer to refuse or to ask before giving anything;
 * `ownerRuled`: the owner made it REQUIRED or authored its condition.
 */
export function moveEvidence(rate: { readonly present: number; readonly applicable: number } | undefined, pieces: number | null,
  opts: { readonly general: boolean; readonly holdsBack?: boolean; readonly ownerRuled?: boolean;
    /** a skill that answers requests: the evidence gate and the hold-back rule apply. For writing, a move keeps its rate and its per-piece cap, as measured there. */
    readonly answers?: boolean } = { general: false }): MoveEvidence {
  const base = { present: rate?.present ?? null, applicable: rate?.applicable ?? null, pieces };
  // WHERE THE FAILURE WAS MEASURED, AND ONLY THERE. Thin moves stated as habits lost coding answers against a
  // hand-written skill. For writing, a move stated with its rate and a cap per piece is what earlier blind rounds
  // found to work, and nothing has measured otherwise: it is left as it was.
  if (!opts.answers) {
    return { ...base, presentBound: null, shareBound: null, carrier: opts.general ? 'general' : 'conditional',
      why: rate ? `stated with its rate: ${rate.present} of ${rate.applicable} piece(s) where it could apply` : 'stated with its condition' };
  }
  // THE OWNER'S OWN WORDS NEED NO COUNT. A rule the owner wrote, added or re-scoped is stated as they scoped it.
  if (opts.ownerRuled) return { ...base, presentBound: null, shareBound: null, carrier: opts.general ? 'general' : 'conditional', why: 'stated as you wrote it' };
  if (!rate || rate.applicable <= 0) {
    // NOTHING WAS COUNTED FOR THIS BUILD (a corpus too small to hold pieces back, a skill from stated rules): there
    // is no evidence either way, so the move is stated with its condition, as before counting existed. When the
    // build did count and this move showed up in none of the pieces checked, it is an example only.
    if (pieces === null) {
      return opts.holdsBack ? { ...base, presentBound: null, shareBound: null, carrier: 'exemplar', why: 'shown as an example only: it holds back what was asked, and when to do that is yours to rule on' }
        : { ...base, presentBound: null, shareBound: null, carrier: opts.general ? 'general' : 'conditional', why: 'stated with its condition: this build counted no pieces' };
    }
    return { ...base, presentBound: null, shareBound: null, carrier: 'exemplar', why: `shown as an example only: it applied in none of the ${pieces} piece(s) it was checked against` };
  }
  // Compared as computed, rounded only to be shown: 11 of 23 has a bound of 0.296, which rounded is 0.30 and passed 0.3.
  const presentRaw = lowerBound(rate.present, rate.applicable);
  const shareRaw = pieces && pieces >= rate.applicable ? lowerBound(rate.applicable, pieces, 0.025) : null;
  const presentBound = r2(presentRaw); const shareBound = shareRaw === null ? null : r2(shareRaw);
  const counted = `${rate.present} of ${rate.applicable} piece(s) where it could apply${pieces ? `, of ${pieces} in all` : ''}`;
  if (rate.applicable < MIN_APPLICABLE || presentRaw < MIN_PRESENT_BOUND) {
    return { ...base, presentBound, shareBound, carrier: 'exemplar', why: `shown as an example only: ${counted} is too little to state as a habit` };
  }
  if (opts.holdsBack && !opts.ownerRuled) {
    return { ...base, presentBound, shareBound, carrier: 'exemplar', why: `shown as an example only: it holds back what was asked (${counted}), and when to do that is yours to rule on` };
  }
  if (opts.general && shareRaw !== null && shareRaw >= GENERAL_SHARE) return { ...base, presentBound, shareBound, carrier: 'general', why: `stated as something I do: ${counted}` };
  return { ...base, presentBound, shareBound, carrier: 'conditional', why: `stated only with its condition: ${counted}` };
}

/** The word-pattern floor for "this move holds back what was asked", used when no model read the moves. */
export const HOLDS_BACK = /\b(?:refus\w*|declin\w*|won[’']t|will not|do(?:es)? not (?:give|provide|hand|comply)|rather than comply\w*|instead of (?:answering|complying)|ask\w* (?:one|a|a single|the)\b[^.]{0,60}\b(?:first|before)|(?:first|before) (?:answering|doing|writing|acting))\b/i;

// ── WHICH MOVES HOLD BACK WHAT WAS ASKED, READ BY A SMALL MODEL ─────────────────────────────────────────────
//
// "I ask one specific question first" and "I confirm the branch before any destructive command" are the same
// kind of move in different words, and a word list catches the phrasings someone listed. One call at build reads
// the moves; code keeps only ids that exist. With no model the word pattern above is the floor.

export const HOLDS_BACK_SYSTEM = `You read short statements describing how one person answers requests. For each, say whether following it could mean the reply does NOT give what was asked: the person refuses, declines, or asks a question before (or instead of) giving the answer, the code, the command or the fix.

A statement about how to give the answer (its order, its length, a warning beside it, a safer command offered with it) does not hold anything back. Return only the ids of the statements that do.`;
const HOLDS_BACK_SCHEMA = { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'], additionalProperties: false };

/** The ids of the moves that hold back what was asked, or null when the reader could not answer (the pattern decides then). */
export async function readHoldsBack(client: InferenceClient, budget: Budget, moves: readonly { readonly id: string; readonly statement: string }[]): Promise<string[] | null> {
  if (!moves.length) return [];
  try {
    const raw = await spend(budget, 0.05, async () => {
      const x = await client.complete({ stableBlock: HOLDS_BACK_SYSTEM, variableBlock: '', userMessage: moves.map((m) => `[${m.id}] ${m.statement}`).join('\n'),
        toolName: 'emit_holds_back', toolDescription: 'Return the ids of the statements that hold back what was asked.', schema: HOLDS_BACK_SCHEMA, maxTokens: 400, temperature: 0 });
      return { value: x.json, cost: x.cost };
    });
    const ids = (raw as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids)) return null;
    const known = new Set(moves.map((m) => m.id));
    return [...new Set(ids.filter((i): i is string => typeof i === 'string' && known.has(i)))];
  } catch { return null; }
}

/** Whether the owner wrote, added or re-scoped this rule themselves: such a rule is carried as they scoped it. */
export const ownerWrote = (r: { readonly authority: string; readonly provenance?: string }): boolean =>
  r.authority === 'EXPERT_AUTHORED' || r.provenance === 'EXPERT_ADDED' || r.provenance === 'EXPERT_STATED' || r.provenance === 'SUBSTANTIVELY_REWRITTEN';
