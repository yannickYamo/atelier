// atelier/core/discovery/run-chain.ts — THE CHAIN, WIRED TO A REAL MODEL.
//
// The ported chain is pure: it plans the calls and folds the results, and never makes one. This is
// the only place that turns its plan into inference, which is why the chain could move into the
// product at all — the model boundary was always a parameter.
//
// ─── WHAT THIS BUYS OVER ONE PROPOSER CALL ─────────────────────────────────────────────────────
//
// The shipped discovery was a single call over the whole corpus: propose rules, trust them. A factor
// read off an example and then confirmed against that same example has confirmed nothing, and there
// was no way to tell that from a factor that genuinely recurs.
//
// Here the corpus is SPLIT before anything is read. The proposer sees only PROPOSAL goldens. A
// separate observer sees ONE HELD-OUT golden and a factor description, never the proposal set, so it
// cannot recognise "the example this was read off" and mark it present out of loyalty. Recurrence is
// counted only on documents the proposer never saw, and `validateDiscovery` refuses any hypothesis
// whose evidence crosses that line.
//
// This buys PRECISION, not recall. It removes factors that were never really there. Finding MORE of
// what is there is the multi-framing lever, and that is a different build.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { framedPreamble, DEFAULT_FRAMINGS, type FramingId } from './framing.js';
import { unionFramedRules } from './union.js';
import { planDiscovery, ingestProbeResults, type ProbeResults, type InferenceRequest } from './chain/discovery-orchestration.js';

/** The plan emits a union; observeRequestsFor only ever produces this arm. Narrowed, not cast. */
type ObserveRequest = Extract<InferenceRequest, { readonly kind: 'OBSERVE' }>;
const isObserve = (r: InferenceRequest): r is ObserveRequest => r.kind === 'OBSERVE';
import type { GoldenRef, ProposedFactor } from './chain/discovery-contract.js';
import type { GoldenObservation } from './chain/taste-discovery.js';
import type { ConstructScope } from './chain/construct-scope.js';
import { asText, asTextList } from './text.js';

export interface CorpusItem { readonly id: string; readonly text: string }

/**
 * THE SPLIT IS NOT DECIDED HERE. `planImport` in the chain already assigns PROPOSAL/HELD_OUT, and
 * this used to assign them again with a different rule — two owners of the one decision everything
 * downstream rests on. The roles arrive as a parameter.
 */

/** The chain's own fields — richer than the fallback path's. Only the preamble above is shared. */
const CHAIN_FIELDS = `For each rule give:
  DESCRIPTION      one sentence the author could recognise as their own
  APPLIES_WHEN     the conditions it holds under, as one or more short predicates. A rule with no
                   condition claims to hold everywhere, which is almost never true of taste.
  READ_FROM        which of the pieces above you read it off
  WOULD_BE_ABSENT_IF  what you would see in a piece if this rule were NOT operating
  QUOTE            a SHORT VERBATIM span from one of the pieces where this rule is visibly happening.
                   Copy it exactly, character for character — it is checked against the source and
                   dropped if it does not appear there. Prefer the shortest span that still shows the
                   rule; one sentence is usually enough, and a clause is often better. This is what a
                   reader will be SHOWN, so quote the moment the rule is doing its work rather than a
                   sentence that merely sits near it.

- Up to 12 rules, and FEWER IS BETTER THAN PADDED. State a decision ONCE. If you find
  yourself writing two rules that a person would answer the same way, they are one rule and one of
  them is a form it happens to take.
- Each must be FALSIFIABLE — someone could break it on purpose. "Writes clearly" is not a rule.
- Do not comment on quality. Do not guess at influences or writers they resemble.
`;

/** The chain prompt for one vantage. The framing clause has ONE owner and it is `framing.ts`. */
export const chainProposerSystemFor = (framing: FramingId): string => `${framedPreamble(framing)}\n\n${CHAIN_FIELDS}`;

/** Framing B, the default vantage. Local: the only caller is the chain below. */
const PROPOSER_SYSTEM = chainProposerSystemFor('B');

export const PROPOSER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    factors: {
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
          description: { type: 'string' },
          appliesWhen: { type: 'array', minItems: 1, items: { type: 'object',
            properties: { id: { type: 'string' }, describe: { type: 'string' } },
            required: ['id', 'describe'], additionalProperties: false } },
          readFrom: { type: 'array', items: { type: 'string' } },
          wouldBeAbsentIf: { type: 'string' },
          quote: { type: 'string' },
        },
        required: ['description', 'appliesWhen', 'readFrom', 'wouldBeAbsentIf', 'quote'], additionalProperties: false,
      },
    },
  },
  required: ['factors'], additionalProperties: false,
};

/**
 * The observer's whole job, and the two things it must keep apart.
 *
 * APPLICABLE and PRESENT are different questions, and collapsing them destroys the denominator: a
 * factor that simply did not come up in this piece is not a factor the author declined to apply.
 * Recurrence is counted over APPLICABLE contexts, so "not applicable" must be reachable.
 */
export const OBSERVER_SYSTEM = `You are shown ONE piece of writing and ONE described rule.

You have never seen where the rule came from. Do not try to infer it.

Answer two SEPARATE questions:

  APPLICABLE  could this rule even have applied to this piece? A rule about openings does not apply
              to a piece with no opening; a rule about handling numbers does not apply to a piece
              with no numbers.
  PRESENT     if it applied, did the author actually follow it here?

If it did not apply, PRESENT is irrelevant — say applicable: false and present: false.
Do not judge whether the writing is good. Only whether this specific rule was operating.`;

export const OBSERVER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    applicable: { type: 'boolean' },
    present: { type: 'boolean' },
    // BOUNDED AT THE SCHEMA, not by hoping the model is brief. `why` is the only unbounded field in
    // this object, so it is the only thing that can push the response past the token limit — and a
    // response that does not finish is not a partial observation, it is no observation.
    why: { type: 'string', maxLength: 400 },
  },
  required: ['applicable', 'present', 'why'], additionalProperties: false,
};

type Ingested = Extract<ReturnType<typeof ingestProbeResults>, { readonly ok: true }>;

export interface ChainRun {
  readonly hypotheses: Ingested['hypotheses'];
  readonly proposed: readonly ProposedFactor[];
  readonly proposalIds: readonly string[];
  readonly heldOutIds: readonly string[];
  readonly observeCalls: number;
  /** which vantages were run, and which rules more than one of them reached. Null when only one ran. */
  readonly framingUnion: Awaited<ReturnType<typeof unionFramedRules<ProposedFactor>>> | null;
}

export interface ChainRefusal { readonly refused: true; readonly reason: string; readonly detail: string }

export async function runDiscoveryChain(
  client: InferenceClient, budget: Budget, skillId: string, items: readonly CorpusItem[],
  goldens: readonly GoldenRef[], scope: ConstructScope, modelPin: string,
  framings: readonly FramingId[] = DEFAULT_FRAMINGS,
): Promise<ChainRun | ChainRefusal> {
  const textOf = (id: string): string => items.find((i) => i.id === id)?.text ?? '';

  const plan = planDiscovery(skillId, goldens, textOf, {
    proposer: () => PROPOSER_SYSTEM,
    observer: (f) => `${OBSERVER_SYSTEM}\n\n## THE RULE\n\n${f.description}\n\nApplies when: ${f.appliesWhen.map((p) => p.describe).join('; ')}`,
  });
  if ('refusal' in plan) {
    return { refused: true, reason: plan.refusal, detail: `${plan.detail}\n\nA split needs at least 2 pieces on each side: 2 the proposer reads, and 2 it never sees. With fewer, a rule cannot be told apart from a description of one example.` };
  }

  // ── PROPOSE, ONCE PER VANTAGE ────────────────────────────────────────────────────────────
  //
  // One framing recovers one layer of an author and misses another — measured, not assumed. The
  // corpus split is identical across framings, so only the vantage varies and the held-out documents
  // stay held out for all of them.
  //
  // The union is proposed BEFORE observation deliberately: held-out validation is the thing that
  // separates a real rule from a description of one example, and it should get the richer set to
  // work on. It also means the extra vantage buys nothing it cannot defend — a rule only framing A
  // found still has to be seen again in work the proposer never read.
  const perFraming: { framing: FramingId; rules: readonly ProposedFactor[] }[] = [];
  for (const framing of framings) {
    const res = await spend(budget, 0.6, async () => {
      const r = await client.complete({
        stableBlock: chainProposerSystemFor(framing), variableBlock: plan.proposeRequest.contextPrompt,
        userMessage: 'Produce the rules now.', toolName: 'emit_factors',
        toolDescription: "Emit the author's inferred decision rules.", schema: PROPOSER_SCHEMA, maxTokens: 4000,
      });
      return { value: r, cost: r.cost };
    });
    const raw = ((res.json as { factors?: Record<string, unknown>[] } | null)?.factors ?? []);
    perFraming.push({ framing, rules: raw.map((f) => ({
      proposedId: '', description: asText(f.description),
      appliesWhen: (f.appliesWhen as ProposedFactor['appliesWhen']),
      readFrom: asTextList(f.readFrom), wouldBeAbsentIf: asText(f.wouldBeAbsentIf),
      quote: asText(f.quote),
    })).filter((f) => f.description) });
  }

  // One vantage is the degenerate case and must not pay for a matcher call.
  const union = perFraming.length > 1
    ? await unionFramedRules(client, budget, perFraming, (f) => f.description)
    : null;

  // Ids are assigned AFTER the union, so `p3` names one decision rather than one framing's third
  // guess. The representative is the first framing's phrasing; the alternates are not discarded —
  // they stay reachable through the union for the ratification view.
  const proposed: ProposedFactor[] = (union
    ? union.members.map((m) => m.rules[0].rule)
    : perFraming[0].rules
  ).map((f, i) => ({ ...f, proposedId: `p${i + 1}` }));

  if (!proposed.length) return { refused: true, reason: 'NO_FACTORS', detail: 'the proposer returned nothing parseable.' };

  // ── OBSERVE ──────────────────────────────────────────────────────────────────────────────
  //
  // Fired DOCUMENT-MAJOR though the plan emits them factor-major. Same set of calls, same results —
  // but every call against one document shares a prefix, so the document is written to cache once
  // and read by each subsequent factor. Factor-major would re-send the whole document every time.
  const requests = plan.observeRequestsFor(proposed).filter(isObserve)
    .sort((a, b) => a.contextId.localeCompare(b.contextId) || a.proposedId.localeCompare(b.proposedId));

  const observations: { proposedId: string; observation: GoldenObservation }[] = [];
  for (const req of requests) {
    const r = await spend(budget, 0.02, async () => {
      const x = await client.complete({
        // the DOCUMENT is the stable block — it repeats across factors and is the expensive half
        stableBlock: req.contextPrompt, variableBlock: req.systemPrompt,
        userMessage: 'Answer both questions now.', toolName: 'emit_observation',
        toolDescription: 'Is this rule applicable here, and was it followed?',
        // 500 truncated in practice on a long `why`, and the read below turned every truncation into
        // "the rule does not apply and was not followed" — a silent FALSE NEGATIVE in the direction
        // that under-reports the expert's own rules. `why` is now capped at 400 characters, so this
        // is roughly six times what the object can need.
        schema: OBSERVER_SCHEMA, maxTokens: 1500,
      });
      return { value: x, cost: x.cost };
    });
    const j = r.json as { applicable?: boolean; present?: boolean } | null;
    // ── AN ABSENT ANSWER IS NOT A NEGATIVE ANSWER ──────────────────────────────────────────────
    //
    // This read was `j?.applicable === true`, which is indistinguishable from a confident NO when
    // the object never arrived. `GoldenObservation` carries two booleans and has no way to say
    // "not observed", so a missing field HAD to become "the rule does not apply here" — and that
    // biases held-out confirmation downward, silently, in the direction that under-reports the
    // expert's own standard. Refusing is the only honest option the type allows.
    if (typeof j?.applicable !== 'boolean' || typeof j.present !== 'boolean') {
      throw new Error(
        `the observer returned no usable answer for ${req.proposedId} on ${req.contextId}. `
        + 'Recording it as "not applicable" would turn a missing observation into evidence against '
        + 'a rule the expert may well hold.');
    }
    observations.push({ proposedId: req.proposedId, observation: {
      contextId: req.contextId, applicable: j.applicable, present: j.applicable && j.present } });
  }

  // PROSPECTIVE, because these calls just happened. `assertProspective` exists so a cached result
  // cannot be replayed into a product claim, and mislabelling here is how that guard gets defeated
  // by the one caller it was written to constrain.
  const results: ProbeResults = { provenance: 'PROSPECTIVE_RESULT', proposed, observations };
  // ingest REFUSES on an incomplete or leaking observation set, and both are real conditions rather
  // than errors: a partial set makes under-observed factors look better supported than fully
  // observed ones, and nothing downstream would notice.
  const ingested = ingestProbeResults(plan, results, scope, modelPin);
  if (!ingested.ok) return { refused: true, reason: ingested.refusal, detail: ingested.detail };
  return { framingUnion: union, hypotheses: ingested.hypotheses, proposed,
    proposalIds: goldens.filter((g) => g.role === 'PROPOSAL').map((g) => g.contextId),
    heldOutIds: goldens.filter((g) => g.role === 'HELD_OUT').map((g) => g.contextId),
    observeCalls: requests.length };
}
