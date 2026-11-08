// atelier/core/review/reviewer.ts — AN ISOLATED REVIEWER: ITS OWN INVENTORY FIRST, THEN THE VERDICT.
//
// The writer reads its own intentions into the page. The reviewer is a separate context that never shared the
// writer's prompt, and it reads in two stages:
//
//   1. INVENTORY: request, material and draft only. It lists what the draft claims and what each claim stands on,
//      before it sees what the writer meant to do (the contract). Code keeps a claim only when its quote is in the
//      draft, and keeps its support only when the source quote is in that source.
//   2. VERDICT: now the contract, the rubric and the cards (strong, near miss, weak, anti-patterns) join. The model
//      scores each criterion, says which caps hold, names the main failure and lists fixes. Code does the rest:
//      the overall score is the weighted average held under every fired cap's maximum, the verdict word comes from
//      thresholds below, and a fix whose quote is not in the draft is dropped.
//
// Cards are read here and nowhere on the writer's side. With no model, or an answer code cannot ground, the verdict
// is 'unverified' with no fixes: a review is never the reason a run stops.

import type { Card, Rubric } from '../library/schema.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { readContext, type DecidedBy, type Reading } from '../inference/reading.js';
import { quoteIsReal } from '../taste/reader.js';
import { INVENTORY_SYSTEM, VERDICT_SYSTEM } from './prompts.js';

/** At or above this overall score, with no cap fired, the draft ships. */
export const SHIP_AT = 7.5;
/** Below this overall score the draft is written again rather than fixed. */
export const REDRAFT_BELOW = 5;
/** The most fixes a review returns. */
export const MAX_FIXES = 8;
/** The most claims an inventory keeps. */
export const MAX_CLAIMS = 20;

export type ReviewVerdict = 'ship' | 'fix' | 'redraft' | 'regather' | 'unverified';
export type MainFailure = 'missing-facts' | 'invention' | 'content' | 'craft' | 'none';
const FAILURES: readonly MainFailure[] = ['missing-facts', 'invention', 'content', 'craft', 'none'];

export interface ReviewInput {
  readonly request: string;
  readonly material: string;
  /** background documents found for the piece (facts, never voice) */
  readonly enrichment?: readonly string[];
  /** a few excerpts of the user's own finished pieces, for voice fit */
  readonly goldenExcerpts?: readonly string[];
  readonly draft: string;
  readonly rubric: Rubric;
  readonly cards: readonly Card[];
  /** what the writer set out to do: shown only at the verdict stage */
  readonly contract: string;
}

export interface ReviewModel {
  readonly client: InferenceClient | null;
  readonly model: string | null;
  readonly budget: Budget;
}

export type ClaimSupport = 'material' | 'enrichment' | 'none';
export interface InventoryClaim { readonly claim: string; readonly quote: string; readonly support: ClaimSupport; readonly sourceQuote: string | null }
export interface Inventory {
  readonly claims: readonly InventoryClaim[];
  /** claims the model listed whose draft quote was not in the draft */
  readonly dropped: number;
  readonly by: DecidedBy;
  readonly why?: string;
}

export interface CriterionScore { readonly id: string; readonly score: number; readonly why: string }
export interface FiredCap { readonly when: string; readonly max: number; readonly quote: string | null }
export interface Fix { readonly quote: string; readonly instruction: string; readonly criterion: string | null }

export interface Review {
  readonly verdict: ReviewVerdict;
  /** min(weighted average, every fired cap's max); null when unverified */
  readonly overall: number | null;
  readonly weightedAverage: number | null;
  readonly scores: readonly CriterionScore[];
  readonly capsFired: readonly FiredCap[];
  readonly mainFailure: MainFailure | null;
  readonly missingFacts: readonly string[];
  /** ordered, at most MAX_FIXES, every quote found in the draft */
  readonly fixes: readonly Fix[];
  /** fixes the model gave whose quote was not in the draft */
  readonly droppedFixes: number;
  readonly keep: string | null;
  readonly inventory: Inventory;
  readonly by: DecidedBy;
  readonly reader: string;
  readonly why?: string;
}

// ── stage 1: inventory ────────────────────────────────────────────────────────────────────────────────────────

interface InventoryIn { readonly request: string; readonly material: string; readonly enrichment: readonly string[]; readonly draft: string }
interface InventoryOut { readonly claims: readonly InventoryClaim[]; readonly dropped: number }

const block = (tag: string, body: string): string => `<${tag}>\n${body}\n</${tag}>`;
const enrichmentBlock = (docs: readonly string[]): string =>
  docs.length ? block('background', docs.map((d, i) => `[${i + 1}]\n${d}`).join('\n\n')) : '';

export const inventoryReading: Reading<InventoryIn, InventoryOut> = {
  id: 'review-inventory', version: '1', system: INVENTORY_SYSTEM,
  toolName: 'list_claims', toolDescription: 'List what the draft claims and what each claim is built on.',
  maxTokens: 3000, estimateUsd: 0.05,
  schema: {
    type: 'object', additionalProperties: false, required: ['claims'],
    properties: { claims: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['claim', 'quote', 'support', 'sourceQuote'],
      properties: { claim: { type: 'string' }, quote: { type: 'string' },
        support: { type: 'string', enum: ['material', 'enrichment', 'none'] }, sourceQuote: { type: ['string', 'null'] } } } } },
  },
  prompt: (x) => [block('request', x.request), block('material', x.material), enrichmentBlock(x.enrichment), block('draft', x.draft)]
    .filter(Boolean).join('\n\n'),
  decide: () => null,
  ground(raw, x) {
    const list = (raw as { claims?: unknown } | null)?.claims;
    if (!Array.isArray(list)) return null;
    const claims: InventoryClaim[] = []; let dropped = 0;
    const sources: Record<Exclude<ClaimSupport, 'none'>, string> = { material: `${x.request}\n${x.material}`, enrichment: x.enrichment.join('\n') };
    for (const c of list as Partial<InventoryClaim>[]) {
      if (typeof c?.claim !== 'string' || typeof c.quote !== 'string' || !quoteIsReal(c.quote, x.draft)) { dropped += 1; continue; }
      let support: ClaimSupport = c.support === 'material' || c.support === 'enrichment' ? c.support : 'none';
      const sq = typeof c.sourceQuote === 'string' ? c.sourceQuote : null;
      // support is kept only when its source quote is in that source: a claimed basis that is not there is no basis
      if (support !== 'none' && !(sq && quoteIsReal(sq, sources[support]))) support = 'none';
      claims.push({ claim: c.claim.trim(), quote: c.quote, support, sourceQuote: support === 'none' ? null : sq });
      if (claims.length >= MAX_CLAIMS) break;
    }
    return { claims, dropped };
  },
  floor: () => ({ claims: [], dropped: 0 }),
};

// ── stage 2: verdict ──────────────────────────────────────────────────────────────────────────────────────────

interface VerdictIn extends ReviewInput { readonly inventory: readonly InventoryClaim[] }
interface VerdictOut {
  readonly scores: readonly CriterionScore[];
  readonly capsFired: readonly FiredCap[];
  readonly mainFailure: MainFailure;
  readonly missingFacts: readonly string[];
  readonly fixes: readonly Fix[];
  readonly droppedFixes: number;
  readonly keep: string | null;
}

/** The cards as the reviewer reads them: the call, the strong version, the near miss, the weak one, the failures. */
export function renderCards(cards: readonly Card[]): string {
  return cards.map((c) => [
    `Card ${c.id} (applies when: ${c.appliesWhen})`,
    `  the call: ${c.theCall}`,
    `  strong: ${c.strong.join('; ')}`,
    `  near miss: ${c.nearMiss}`,
    `  weak: ${c.weak}`,
    c.antiPatterns.length ? `  content failures: ${c.antiPatterns.join('; ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function renderRubric(r: Rubric): string {
  const crit = r.criteria.map((c) => `- ${c.id} (weight ${c.weight}): ${c.question}`).join('\n');
  const caps = r.caps.map((c, i) => `${i + 1}. when ${c.when}: overall at most ${c.max}`).join('\n');
  return `Criteria:\n${crit}\n\nCaps:\n${caps || '(none)'}`;
}

const renderInventory = (claims: readonly InventoryClaim[]): string => claims.length
  ? claims.map((c, i) => `${i + 1}. ${c.claim} — "${c.quote}" (support: ${c.support})`).join('\n')
  : '(no claims could be listed)';

export const verdictReading: Reading<VerdictIn, VerdictOut> = {
  id: 'review-verdict', version: '2', system: VERDICT_SYSTEM,
  toolName: 'review_draft', toolDescription: 'Score the draft against the rubric, name the caps that hold, and list fixes.',
  maxTokens: 4000, estimateUsd: 0.08,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['scores', 'caps', 'mainFailure', 'missingFacts', 'fixes', 'keep'],
    properties: {
      scores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'score', 'why'],
        properties: { id: { type: 'string' }, score: { type: 'number' }, why: { type: 'string' } } } },
      caps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'holds', 'quote'],
        properties: { n: { type: 'integer' }, holds: { type: 'boolean' }, quote: { type: ['string', 'null'] } } } },
      mainFailure: { type: 'string', enum: [...FAILURES] },
      missingFacts: { type: 'array', items: { type: 'string' } },
      fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quote', 'instruction', 'criterion'],
        properties: { quote: { type: 'string' }, instruction: { type: 'string' }, criterion: { type: ['string', 'null'] } } } },
      keep: { type: ['string', 'null'] },
    },
  },
  prompt: (x) => [
    block('request', x.request), block('material', x.material), enrichmentBlock(x.enrichment ?? []),
    (x.goldenExcerpts ?? []).length ? block('author_excerpts', (x.goldenExcerpts ?? []).join('\n\n---\n\n')) : '',
    block('draft', x.draft),
    block('your_inventory', renderInventory(x.inventory)),
    block('writer_contract', x.contract),
    block('rubric', renderRubric(x.rubric)),
    x.cards.length ? block('reference_cards', renderCards(x.cards)) : '',
  ].filter(Boolean).join('\n\n'),
  decide: () => null,
  ground(raw, x) {
    const r = raw as Record<string, unknown> | null;
    if (!r || !Array.isArray(r.scores) || !Array.isArray(r.fixes)) return null;
    // every criterion scored once, in range: a review missing a criterion has no overall to compute
    const scores: CriterionScore[] = [];
    for (const c of x.rubric.criteria) {
      const s = (r.scores as Partial<CriterionScore>[]).find((y) => y?.id === c.id);
      if (!s || typeof s.score !== 'number' || !Number.isFinite(s.score) || s.score < 0 || s.score > 10) return null;
      scores.push({ id: c.id, score: s.score, why: typeof s.why === 'string' ? s.why : '' });
    }
    const capsFired: FiredCap[] = [];
    for (const c of Array.isArray(r.caps) ? r.caps as { n?: unknown; holds?: unknown; quote?: unknown }[] : []) {
      if (c?.holds !== true || typeof c.n !== 'number') continue;
      const cap = x.rubric.caps[c.n - 1];
      if (!cap || capsFired.some((f) => f.when === cap.when)) continue;
      const quote = typeof c.quote === 'string' && c.quote.trim() ? c.quote : null;
      if (quote !== null && !quoteIsReal(quote, x.draft)) continue;   // a cap fired on words the draft does not hold
      capsFired.push({ when: cap.when, max: cap.max, quote });
    }
    const mainFailure = FAILURES.includes(r.mainFailure as MainFailure) ? r.mainFailure as MainFailure : 'none';
    const missingFacts = Array.isArray(r.missingFacts) ? (r.missingFacts as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim().length > 0) : [];
    const fixes: Fix[] = []; let droppedFixes = 0;
    for (const f of r.fixes as Partial<Fix>[]) {
      if (typeof f?.quote !== 'string' || typeof f.instruction !== 'string' || !f.instruction.trim() || !quoteIsReal(f.quote, x.draft)) { droppedFixes += 1; continue; }
      if (fixes.length < MAX_FIXES) fixes.push({ quote: f.quote, instruction: f.instruction.trim(), criterion: typeof f.criterion === 'string' ? f.criterion : null });
    }
    const keep = typeof r.keep === 'string' && r.keep.trim() ? r.keep.trim() : null;
    return { scores, capsFired, mainFailure, missingFacts, fixes, droppedFixes, keep };
  },
  floor: () => ({ scores: [], capsFired: [], mainFailure: 'none', missingFacts: [], fixes: [], droppedFixes: 0, keep: null }),
};

// ── code decides ──────────────────────────────────────────────────────────────────────────────────────────────

/** The weighted mean of the scores by the rubric's weights; null when the weights sum to nothing. */
export function weightedAverage(rubric: Rubric, scores: readonly CriterionScore[]): number | null {
  let num = 0, den = 0;
  for (const c of rubric.criteria) {
    const s = scores.find((x) => x.id === c.id);
    if (!s || !(c.weight > 0)) continue;
    num += c.weight * s.score; den += c.weight;
  }
  return den > 0 ? num / den : null;
}

/** Caps override the average: the overall is at most every fired cap's max. */
export function capOverall(average: number, caps: readonly FiredCap[]): number {
  return caps.reduce((o, c) => Math.min(o, c.max), average);
}

/** The verdict word, from the overall score, the caps and the main failure. */
export function decideVerdict(overall: number, capsFired: number, mainFailure: MainFailure, missingFacts: number): Exclude<ReviewVerdict, 'unverified'> {
  if (overall >= SHIP_AT && capsFired === 0) return 'ship';
  if (mainFailure === 'missing-facts' && missingFacts > 0) return 'regather';
  if (overall < REDRAFT_BELOW) return 'redraft';
  return 'fix';
}

/** Review a draft: inventory without the contract, then the verdict with it. */
export async function reviewDraft(input: ReviewInput, m: ReviewModel): Promise<Review> {
  const inv = await readContext(inventoryReading,
    { request: input.request, material: input.material, enrichment: input.enrichment ?? [], draft: input.draft },
    m.client, m.model, m.budget, 'other');
  const inventory: Inventory = { claims: inv.value.claims, dropped: inv.value.dropped, by: inv.by, ...(inv.why ? { why: inv.why } : {}) };
  const unverified = (reader: string, why: string): Review => ({
    verdict: 'unverified', overall: null, weightedAverage: null, scores: [], capsFired: [], mainFailure: null, missingFacts: [],
    fixes: [], droppedFixes: 0, keep: null, inventory, by: 'floor', reader, why,
  });
  const v = await readContext(verdictReading, { ...input, inventory: inventory.claims }, m.client, m.model, m.budget, 'other');
  if (v.by !== 'model') return unverified(v.reader, v.why ?? 'no verdict could be read');
  const avg = weightedAverage(input.rubric, v.value.scores);
  if (avg === null) return unverified(v.reader, 'the rubric has no weighted criteria');
  const overall = capOverall(avg, v.value.capsFired);
  return {
    verdict: decideVerdict(overall, v.value.capsFired.length, v.value.mainFailure, v.value.missingFacts.length),
    overall, weightedAverage: avg, scores: v.value.scores, capsFired: v.value.capsFired,
    mainFailure: v.value.mainFailure, missingFacts: v.value.missingFacts,
    fixes: v.value.fixes, droppedFixes: v.value.droppedFixes, keep: v.value.keep,
    inventory, by: 'model', reader: v.reader,
  };
}
