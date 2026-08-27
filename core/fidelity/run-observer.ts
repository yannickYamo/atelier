// atelier/core/fidelity/run-observer.ts — THE PAIRWISE OBSERVER, WIRED, AND MADE TO TEST ITSELF.
//
// `rule-observer.ts` builds a blind pair and folds a pick. It never makes a call. This does, and it
// adds the one thing the original did not need and we do.
//
// ─── THE ORIGINAL ASSUMED A QUALIFICATION CAMPAIGN. WE DO NOT HAVE ONE. ────────────────────────
//
// `judge-qualification.ts` admits a sensor only after it reproduces expert boundary labels and
// survives a swap-and-pad length-neutrality test. That is the right gate and it costs expert hours
// per instrument. Nothing here has been through it, so an unqualified observer's preference is not
// evidence about the rule — it is one model's opinion, and the honest question is whether it is even
// a STABLE opinion.
//
// So each comparison runs TWICE with the sides exchanged. If the verdict follows the rule, swapping
// which text appears first changes nothing. If it follows POSITION, swapping flips it — and an
// instrument that flips on presentation order is measuring the presentation.
//
// This proves far less than qualification. It proves order-invariance on THIS pair, and nothing
// about construct validity: an observer that reliably prefers the longer answer is perfectly
// order-invariant. That is why the length delta is reported beside the verdict rather than folded
// into it — the reader needs to see the one confound this check cannot catch.
//
// ─── WHAT A QUALIFIED COMPARATOR MAY AND MAY NOT CONCLUDE ──────────────────────────────────────
//
// This distinction is policy and it lives here because it is easy to lose. A comparator that earns
// authority earns it over ONE claim:
//
//   CANDIDATE_BETTER_THAN_INCUMBENT   under the SAME frozen StandardVersion
//
// It never earns:
//
//   ABSOLUTE_FIDELITY_ACHIEVED / TARGET_REACHED
//
// An ordering says which of two is closer to the standard. It cannot say either has reached it, and
// a loop that reads "the candidate won" as "the skill is now good" would climb to a local optimum and
// call it expert fidelity. Until an ABSOLUTE anchor exists — and three attempts at one have failed —
// the honest stop states remain PLATEAU, NO_LEGAL_REPAIR, MORE_EVIDENCE and BUDGET_LIMIT.
//
// The comparator measures an implementation against a human-owned frozen target. It may never
// create, modify, reprioritise or reinterpret that target.
//
// ─── AND IT STILL CANNOT CERTIFY ───────────────────────────────────────────────────────────────
//
// A stable preference orders two candidates for a person's attention. It is not a finding that the
// rule now holds; there is no code path here that produces one. Promotion still requires a person to
// have run the candidate and looked at it.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { asText } from '../discovery/text.js';
import { readGraded, describeGraded, SCALE_MIN, SCALE_MAX, type GradedReading } from './graded-readout.js';
import {
  buildObserverPair, foldObserverPick, type ObserverPick, type ObserverResult,
} from './rule-observer.js';

export const PICK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    pick: { type: 'string', enum: ['A', 'B', 'EQUAL', 'NEITHER'] },
    // THE POSITION A DISTRIBUTION CAN BE READ AT. The pick is an enum and an enum cannot express
    // spread: four members, one token, no room for "I could not separate these". A graded integer
    // gives the model somewhere to put uncertainty without being asked for uncertainty, and the
    // logprobs at that position are what `readGraded` reads. The pick still decides; this is a
    // second reading of the same answer.
    confidence: { type: 'integer', minimum: SCALE_MIN, maximum: SCALE_MAX },
    why: { type: 'string' },
  },
  required: ['pick', 'why', 'confidence'], additionalProperties: false,
};

export interface Comparison {
  /** the folded result of the first orientation — meaningful only when `orderInvariant` */
  readonly result: ObserverResult;
  readonly picks: readonly [ObserverPick, ObserverPick];
  /**
   * The distribution the model put over its own answer, in each orientation.
   *
   * Reported beside the pick, never folded into it. The pick decides; this is a second and
   * UNQUALIFIED reading of the same call, kept because an enum cannot express spread and every
   * model-based instrument here has so far declined to abstain when asked to.
   */
  readonly graded: readonly [GradedReading, GradedReading];
  /** did exchanging the sides leave the verdict alone? */
  readonly orderInvariant: boolean;
  /** candidate length ÷ champion length — the confound this check cannot catch */
  readonly lengthRatio: number;
  /** true when the preferred side was also the longer one, null when there was no preference */
  readonly preferredLonger: boolean | null;
  readonly why: string;
  readonly costUsd: number;
}

const askOnce = async (
  client: InferenceClient, budget: Budget, rendered: string,
): Promise<{ pick: ObserverPick; why: string; graded: GradedReading }> => {
  const r = await spend(budget, 0.05, async () => {
    const x = await client.complete({
      stableBlock: rendered,
      variableBlock: 'Judge strictly against the stated rule. Do not reward length, confidence or polish.',
      userMessage: 'Answer now.',
      toolName: 'emit_pick', toolDescription: 'Which answer complies with the rule?',
      schema: PICK_SCHEMA, maxTokens: 400,
      // ASKED FOR ON THIS CALL AND NO OTHER. The pick is what decides; the distribution is a second,
      // unqualified reading of the SAME answer, and it is read from the response this call already
      // makes rather than from an extra one. An instrument that cost a second call would be a second
      // instrument, and this programme has enough of those.
      wantLogprobs: true,
    });
    return { value: x, cost: x.cost };
  });
  const j = r.json as { pick?: string; why?: string; confidence?: unknown } | null;
  const pick = (['A', 'B', 'EQUAL', 'NEITHER'] as const).find((p) => p === j?.pick) ?? 'EQUAL';
  return { pick, why: asText(j?.why), graded: readGraded(r.logprobs) };
};

/**
 * Compare a champion and a candidate on ONE rule, twice, with the sides exchanged.
 *
 * Both orientations are built through `buildObserverPair`, so each run's fold consults its OWN
 * sealed key. Comparing raw picks across the two would be wrong by construction — "A" means the
 * candidate in one orientation and the champion in the other, which is the entire point.
 */
export async function compareOnRule(
  client: InferenceClient, budget: Budget,
  contextId: string, situation: string, ruleStatement: string,
  championText: string, candidateText: string,
): Promise<Comparison> {
  const before = budget.spentUsd;

  const forward = buildObserverPair(contextId, situation, ruleStatement, championText, candidateText, true);
  const reverse = buildObserverPair(contextId, situation, ruleStatement, championText, candidateText, false);

  const a = await askOnce(client, budget, forward.rendered);
  const b = await askOnce(client, budget, reverse.rendered);

  const ra = foldObserverPick(forward, a.pick);
  const rb = foldObserverPick(reverse, b.pick);
  const orderInvariant = ra === rb;

  const lengthRatio = championText.length ? candidateText.length / championText.length : 1;
  const preferredLonger =
    ra === 'CANDIDATE_COMPLIES_BETTER' ? lengthRatio > 1
      : ra === 'CHAMPION_COMPLIES_BETTER' ? lengthRatio < 1
        : null;

  return {
    result: ra, picks: [a.pick, b.pick], graded: [a.graded, b.graded], orderInvariant, lengthRatio, preferredLonger,
    why: orderInvariant ? a.why
      : `the verdict changed when the two answers swapped places (${ra} then ${rb}). It is reading position, not the rule.`,
    costUsd: budget.spentUsd - before,
  };
}

/** What the user reads. Says what this is worth, in the same breath as saying what it found. */
export function describeComparison(c: Comparison, ruleStatement: string): string {
  const pct = `${Math.round(c.lengthRatio * 100)}%`;

  if (!c.orderInvariant) {
    return `On "${ruleStatement}" — **no usable reading.**\n\n`
      + `  ${c.why}\n\n`
      + `Nothing here should move your decision. Read both outputs yourself.\n`;
  }

  const headline = {
    CANDIDATE_COMPLIES_BETTER: 'the NEW version follows it more closely',
    CHAMPION_COMPLIES_BETTER: 'your CURRENT version follows it more closely',
    EQUAL: 'the two are equally close to it',
    NEITHER_COMPLIES: 'NEITHER follows it — the repair did not land',
  }[c.result];

  let out = `On "${ruleStatement}" — ${headline}.\n\n  ${c.why}\n\n`
    + `The same judgement held when the two answers swapped places, so it is not simply preferring\n`
    + `whichever it saw first.\n`;

  // THE SECOND READING, SHOWN AND NOT USED. It is read from the same call, it has never been
  // qualified against expert labels, and it moves nothing. Printing it is how it can be measured
  // later against runs a person also judged; hiding it until it is qualified would guarantee it
  // never is.
  const g = c.graded[0];
  if (g.kind === 'READ') out += `\n${describeGraded(g)}\n`;

  if (c.preferredLonger === true) {
    out += `\n**It preferred the longer answer** (${pct} the length of the other). This check cannot tell\n`
      + `that apart from preferring the better one — a judge that always picks the longer text passes it\n`
      + `every time. Weigh it accordingly.\n`;
  }

  return `${out}\nThis orders your attention. It does not decide: nothing here has been checked against\n`
    + `your own judgement, so it carries no authority over what gets promoted.\n`;
}


/** What a comparative verdict may support, stated as a value so no caller has to remember it. */
export const COMPARATIVE_AUTHORITY = {
  maySupport: 'CANDIDATE_BETTER_THAN_INCUMBENT, under the same frozen StandardVersion',
  mayNeverSupport: ['ABSOLUTE_FIDELITY_ACHIEVED', 'TARGET_REACHED'],
  why: 'an ordering says which of two is closer to the standard; it cannot say either has reached it. '
    + 'Reading "the candidate won" as "the skill is good" is how a search reaches a local optimum and '
    + 'calls it expert fidelity.',
} as const;

/**
 * Guard for the one confusion this module exists to prevent.
 *
 * No call site yet. Kept rather than deleted because the refusal it encodes is the module's subject,
 * and stated here rather than left implied, since an uncalled guard that reads as installed is worse
 * than no guard at all.
 */
export function assertNotAbsoluteClaim(claim: string): void {
  if (claim === 'ABSOLUTE_FIDELITY_ACHIEVED' || claim === 'TARGET_REACHED') {
    throw new Error(
      `COMPARATIVE AUTHORITY: a comparator cannot support ${claim}. ${COMPARATIVE_AUTHORITY.why} `
      + 'That claim needs an absolute fidelity anchor, and none exists.');
  }
}
