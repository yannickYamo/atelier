// atelier/core/review/choose.ts — WHICH OF TWO DRAFTS, ASKED TWICE WITH THE ORDER SWAPPED.
//
// A model comparing two texts leans toward one position. Asking twice, once each way round, cancels that lean: when
// both answers name the same draft, it wins; when they disagree (or either cannot be read) it is a tie, and the
// caller's own ranking decides. The reviewer here is the same isolated one: it sees the request, the material, the
// rubric and the cards, never the writer's contract.

import type { Card, Rubric } from '../library/schema.js';
import type { InferenceClient, InferenceRequest } from '../inference/client.js';
import { readContext, type Reading } from '../inference/reading.js';
import { PAIRWISE_SYSTEM } from './prompts.js';
import { renderCards, renderRubric, type ReviewModel } from './reviewer.js';

export interface ChooseContext extends ReviewModel {
  readonly request: string;
  readonly material: string;
  readonly enrichment?: readonly string[];
  readonly goldenExcerpts?: readonly string[];
  readonly rubric: Rubric;
  readonly cards: readonly Card[];
}

export interface Choice {
  readonly winner: 'a' | 'b' | 'tie';
  readonly reasons: readonly string[];
  /** model calls made */
  readonly calls: number;
}

type Pick = 'first' | 'second' | 'neither';
interface PairIn { readonly ctx: ChooseContext; readonly first: string; readonly second: string }
interface PairOut { readonly better: Pick; readonly reasons: readonly string[] }

export const pairwiseReading: Reading<PairIn, PairOut | null> = {
  id: 'review-pairwise', version: '1', system: PAIRWISE_SYSTEM,
  toolName: 'choose_draft', toolDescription: 'Say which draft better meets the rubric for this request.',
  maxTokens: 800, estimateUsd: 0.05,
  schema: {
    type: 'object', additionalProperties: false, required: ['better', 'reasons'],
    properties: { better: { type: 'string', enum: ['first', 'second', 'neither'] }, reasons: { type: 'array', items: { type: 'string' } } },
  },
  prompt: ({ ctx, first, second }) => [
    `<request>\n${ctx.request}\n</request>`,
    `<material>\n${ctx.material}\n</material>`,
    (ctx.enrichment ?? []).length ? `<background>\n${(ctx.enrichment ?? []).join('\n\n')}\n</background>` : '',
    (ctx.goldenExcerpts ?? []).length ? `<author_excerpts>\n${(ctx.goldenExcerpts ?? []).join('\n\n---\n\n')}\n</author_excerpts>` : '',
    `<rubric>\n${renderRubric(ctx.rubric)}\n</rubric>`,
    ctx.cards.length ? `<reference_cards>\n${renderCards(ctx.cards)}\n</reference_cards>` : '',
    `<first_draft>\n${first}\n</first_draft>`,
    `<second_draft>\n${second}\n</second_draft>`,
  ].filter(Boolean).join('\n\n'),
  decide: () => null,
  ground(raw) {
    const r = raw as { better?: unknown; reasons?: unknown } | null;
    if (!r || (r.better !== 'first' && r.better !== 'second' && r.better !== 'neither')) return null;
    const reasons = Array.isArray(r.reasons) ? (r.reasons as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 3) : [];
    return { better: r.better, reasons };
  },
  floor: () => null,
};

const counting = (client: InferenceClient, onCall: () => void): InferenceClient => ({
  complete: (req: InferenceRequest) => { onCall(); return client.complete(req); },
});

/** Compare two drafts in both orders. Agreement wins; anything else is a tie for the caller's own ranking. */
export async function chooseDraft(a: string, b: string, ctx: ChooseContext): Promise<Choice> {
  if (!ctx.client || !ctx.model) return { winner: 'tie', reasons: ['no model set up: the caller ranks'], calls: 0 };
  let calls = 0;
  const client = counting(ctx.client, () => { calls += 1; });
  const ab = await readContext(pairwiseReading, { ctx, first: a, second: b }, client, ctx.model, ctx.budget, 'other');
  const ba = await readContext(pairwiseReading, { ctx, first: b, second: a }, client, ctx.model, ctx.budget, 'other');
  const one = ab.value, two = ba.value;
  if (!one || !two) return { winner: 'tie', reasons: ['a comparison could not be read: the caller ranks'], calls };
  const first: 'a' | 'b' | null = one.better === 'first' ? 'a' : one.better === 'second' ? 'b' : null;
  const second: 'a' | 'b' | null = two.better === 'first' ? 'b' : two.better === 'second' ? 'a' : null;
  if (first !== null && first === second) return { winner: first, reasons: [...one.reasons, ...two.reasons], calls };
  return { winner: 'tie', reasons: ['the two orders disagreed: the caller ranks'], calls };
}
