// atelier/core/discovery/propose.ts — THE DISCOVERY STEP. Moved verbatim; no algorithm change.
//
// The prompt and schema are byte-identical to the version that produced every result recorded so far.
// Changing them here would silently invalidate the comparison between this build and the measurements
// that justified it, so they move without edits.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { framedPreamble, DEFAULT_FRAMINGS, type FramingId } from './framing.js';
import { runDiscoveryConformance, type ConformanceReport } from './conformance.js';
import { unionFramedRules, type RuleUnion } from './union.js';

export interface ProposedRule {
  readonly statement: string;
  readonly appliesWhen: string;
  readonly evidence: string;
  readonly evidenceItemId: string;
  readonly kind: 'GENERATIVE' | 'BOUNDARY';
  /** what you would see if this rule were NOT operating — the counterfactual a person can argue with */
  readonly wouldBeAbsentIf: string;
}

/** The fields this path asks for. The chain path asks for richer ones; only the preamble is shared. */
const PROPOSER_FIELDS = `For each rule give: STATEMENT (one sentence they could recognise as their own), APPLIES_WHEN (the
condition; say GENERAL only if it truly holds throughout), EVIDENCE (a short verbatim quote), KIND
(GENERATIVE or BOUNDARY), WOULD_BE_ABSENT_IF (what you would see in a piece if this rule were NOT
operating — concrete enough that the author could check it and disagree).

- Up to 12 rules, and FEWER IS BETTER THAN PADDED. State a decision ONCE. If you find
  yourself writing two rules that a person would answer the same way, they are one rule and one of
  them is a form it happens to take. At least three KIND=BOUNDARY: a place the author could easily have gone further and
  chose not to, or a move available to them that they consistently decline.
- Each rule must be FALSIFIABLE — someone could break it on purpose. "Writes clearly" is not a rule.
- Do not comment on quality. Do not guess at influences or writers they resemble.`;

/** The prompt for one vantage. The framing clause is owned by `framing.ts` and varies here alone. */
export const proposerSystemFor = (framing: FramingId): string => `${framedPreamble(framing)}\n\n${PROPOSER_FIELDS}`;

/** Framing B, preserved as a named export because callers referenced it before framings existed. */
export const PROPOSER_SYSTEM = proposerSystemFor('B');

export const PROPOSER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    rules: {
      // NO FLOOR. THE CEILING STAYS.
      //
      // `minItems: 8` was inherited from a frozen experiment, where a fixed count kept two arms
      // comparable. On the production path it does something else: if an author has nine real
      // decisions and the schema demands eight, the cheapest way to fill the quota is to state one
      // decision twice in different surface terms. Measured on a live corpus — "embed the mapping as
      // a bulleted lookup table" and "prefer arrow notation" arrived as separate rules from the same
      // document, one decision wearing two forms, because twelve slots wanted filling.
      //
      // The ceiling is load-bearing and unchanged: without it the model generates until it hits the
      // token limit and truncates the tool call mid-emission, which parses as zero rules and reads as
      // "discovery found nothing".
      //
      // A run that genuinely returns too little is caught where it belongs — the caller refuses on an
      // empty result, which distinguishes "this author has few rules" from "discovery broke".
      type: 'array', minItems: 1, maxItems: 12,
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string' }, appliesWhen: { type: 'string' },
          evidence: { type: 'string' }, evidenceItemId: { type: 'string' },
          kind: { type: 'string', enum: ['GENERATIVE', 'BOUNDARY'] },
          wouldBeAbsentIf: { type: 'string' },
        },
        required: ['statement', 'appliesWhen', 'evidence', 'evidenceItemId', 'kind', 'wouldBeAbsentIf'],
        additionalProperties: false,
      },
    },
  },
  required: ['rules'], additionalProperties: false,
};

export interface CorpusItem { readonly id: string; readonly text: string }

/**
 * Propose rules from a corpus.
 *
 * The corpus goes in the VARIABLE block and the instructions in the STABLE one, which is the opposite
 * of the intuitive arrangement and the correct one: a single discovery call has nothing to reuse, but
 * every later call in a session shares the instructions, and a corpus interpolated into the cached
 * block would make every prefix unique.
 */
export async function proposeRules(
  client: InferenceClient, budget: Budget, corpus: readonly CorpusItem[], estimateUsd = 0.5,
  framing: FramingId = 'B',
): Promise<{ readonly rules: readonly ProposedRule[]; readonly result: Awaited<ReturnType<InferenceClient['complete']>>;
  readonly conformance: ConformanceReport }> {
  if (!corpus.length) throw new Error('DISCOVERY: empty corpus. There is nothing to infer a standard from.');
  const variableBlock = corpus.map((c) => `### ${c.id}\n\n${c.text}`).join('\n\n---\n\n');
  const result = await spend(budget, estimateUsd, async () => {
    const r = await client.complete({
      stableBlock: proposerSystemFor(framing), variableBlock, userMessage: 'Produce the rules now.',
      toolName: 'emit_rules', toolDescription: 'Emit the inferred decision rules.',
      schema: PROPOSER_SCHEMA, maxTokens: 4000,
    });
    return { value: r, cost: r.cost };
  });
  const rules = ((result.json as { rules?: ProposedRule[] } | null)?.rules ?? []);
  // CHECKED HERE BECAUSE THIS IS WHERE THE RAW RESPONSE EXISTS. One step later the object has been
  // narrowed to ProposedRule and any field the model was not entitled to fill has been dropped —
  // which is exactly the evidence the authority check needs, so a pack that ran downstream would
  // report AUTHORITY_SAFE for a model that had grabbed authority.
  //
  // Deterministic and free: no second call, no judge. It establishes that the candidates are
  // well-formed and that every span they quote occurs in the corpus. It establishes nothing about
  // whether the taste they describe is right.
  const conformance = runDiscoveryConformance(rules, corpus, result.json);
  return { rules, result, conformance };
}

/**
 * Discovery across several vantages, unioned.
 *
 * ONE framing recovers one layer of an author and misses another — measured, not assumed: two
 * framings byte-identical but for a single clause recovered 3/9 and 4/9 of an author's own sealed
 * rules, and their union ~7/9. The disjointness is below the same-framing noise floor on both models
 * tested, so it is the framing doing the work rather than run-to-run variance.
 *
 * COST: one proposer call per framing, plus two cheap matcher calls per framing pair. Discovery runs
 * once per skill, so this is a one-time cost on the operation whose output everything downstream is
 * bound to — the cheapest place in the system to spend and the most expensive place to be wrong.
 */
export async function proposeAcrossFramings(
  client: InferenceClient, budget: Budget, corpus: readonly CorpusItem[],
  framings: readonly FramingId[] = DEFAULT_FRAMINGS, estimateUsd = 0.5,
): Promise<{ readonly union: RuleUnion<ProposedRule>;
  readonly byFraming: readonly { framing: FramingId; rules: readonly ProposedRule[]; conformance: ConformanceReport }[] }> {
  if (!framings.length) throw new Error('DISCOVERY: no framing selected. A vantage is required; there is no unframed proposer.');
  const byFraming: { framing: FramingId; rules: readonly ProposedRule[]; conformance: ConformanceReport }[] = [];
  for (const framing of framings) {
    const { rules, conformance } = await proposeRules(client, budget, corpus, estimateUsd, framing);
    byFraming.push({ framing, rules, conformance });
  }
  const union = await unionFramedRules(client, budget, byFraming, (r) => r.statement);
  return { union, byFraming };
}
