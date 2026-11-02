import { describe, expect, it } from 'vitest';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { Card, Rubric } from '../core/library/schema.js';
import { CONTENT_NOT_LENGTH, INVENTORY_SYSTEM, PAIRWISE_SYSTEM, VERDICT_SYSTEM } from '../core/review/prompts.js';
import { capOverall, decideVerdict, MAX_FIXES, REDRAFT_BELOW, reviewDraft, SHIP_AT, weightedAverage, type ReviewInput } from '../core/review/reviewer.js';
import { anInferenceResult } from './fixtures.js';

const RUBRIC: Rubric = {
  kind: 'blog',
  criteria: [{ id: 'proof', weight: 3, question: 'Does each claim carry proof from the material?' }, { id: 'voice', weight: 1, question: 'Does it sound like the author?' }],
  caps: [{ when: 'no claim carries a figure or case from the material', max: 4 }, { when: 'the opening could open any piece', max: 6 }],
};
const CARD: Card = { id: 'c1', kind: 'blog', appliesWhen: 'a post about a result', theCall: 'say what changed and why it matters',
  strong: ['names the number'], nearMiss: 'NEAR-MISS-MARKER: right claim, no number', weak: 'confident and vague', antiPatterns: ['proof by adjective'], evidence: 'principle' };
const CONTRACT = 'CONTRACT-MARKER: open on the result, then the cause.';
const SHORT = 'Signups rose 40% after we cut the form to two fields. The drop-off was the phone number.';
const LONG = 'Growth is a journey. In this comprehensive post we cover every angle of onboarding, from philosophy to practice, '
  + 'from mindset to metrics, and from culture to craft. Onboarding matters. Teams that care about onboarding win. '
  + 'There are many lessons here, and each of them is important, and together they form a complete picture of success.';
const input = (draft: string): ReviewInput => ({ request: 'A post on our signup change', material: 'Signups rose 40%. We cut the form to two fields; the phone number was the drop-off.',
  draft, rubric: RUBRIC, cards: [CARD], contract: CONTRACT });
const budget = () => ({ spentUsd: 0, capUsd: 10 });

/** Routes by tool: the inventory and verdict answers are functions of the request the code sent. */
function scripted(verdict: (req: InferenceRequest) => unknown, inventory: (req: InferenceRequest) => unknown = () => ({ claims: [] })) {
  const seen: InferenceRequest[] = [];
  const client: InferenceClient = { complete: async (req) => { seen.push(req); return anInferenceResult({ json: req.toolName === 'list_claims' ? inventory(req) : verdict(req) }); } };
  return { client, seen };
}
const draftOf = (req: InferenceRequest): string => req.userMessage.split('<draft>\n')[1].split('\n</draft>')[0];

describe('code decides the overall and the verdict', () => {
  it('weights the scores and holds them under every fired cap', () => {
    // (3*8 + 1*4) / 4 = 7
    expect(weightedAverage(RUBRIC, [{ id: 'proof', score: 8, why: '' }, { id: 'voice', score: 4, why: '' }])).toBe(7);
    expect(capOverall(7, [{ when: 'x', max: 6, quote: null }, { when: 'y', max: 6.5, quote: null }])).toBe(6);
    expect(capOverall(7, [])).toBe(7);
  });
  it('maps scores and caps to the verdict words', () => {
    expect(decideVerdict(SHIP_AT, 0, 'none', 0)).toBe('ship');
    expect(decideVerdict(9, 1, 'craft', 0)).toBe('fix');          // a fired cap never ships
    expect(decideVerdict(6, 0, 'missing-facts', 2)).toBe('regather');
    expect(decideVerdict(6, 0, 'missing-facts', 0)).toBe('fix');  // no fact named, nothing to gather
    expect(decideVerdict(REDRAFT_BELOW - 0.1, 0, 'content', 0)).toBe('redraft');
    expect(decideVerdict(REDRAFT_BELOW, 0, 'content', 0)).toBe('fix');
  });
});

describe('reviewDraft', () => {
  it('is unverified with no fixes when no model is set up', async () => {
    const r = await reviewDraft(input(SHORT), { client: null, model: null, budget: budget() });
    expect(r.verdict).toBe('unverified'); expect(r.fixes).toEqual([]); expect(r.overall).toBeNull(); expect(r.by).toBe('floor');
  });

  it('lists its inventory before it sees the contract, and never shows cards there', async () => {
    const s = scripted(() => ({ scores: [{ id: 'proof', score: 8, why: '' }, { id: 'voice', score: 8, why: '' }], caps: [], mainFailure: 'none', missingFacts: [], fixes: [], keep: null }));
    await reviewDraft(input(SHORT), { client: s.client, model: 'm', budget: budget() });
    expect(s.seen.map((r) => r.toolName)).toEqual(['list_claims', 'review_draft']);
    expect(s.seen[0].userMessage).not.toContain('CONTRACT-MARKER');
    expect(s.seen[0].userMessage).not.toContain('NEAR-MISS-MARKER');
    expect(s.seen[1].userMessage).toContain('CONTRACT-MARKER');
    expect(s.seen[1].userMessage).toContain('NEAR-MISS-MARKER');
  });

  it('grounds the inventory: a claim not in the draft drops, a basis not in the source becomes none', async () => {
    const s = scripted(() => ({ scores: [{ id: 'proof', score: 8, why: '' }, { id: 'voice', score: 8, why: '' }], caps: [], mainFailure: 'none', missingFacts: [], fixes: [], keep: null }),
      () => ({ claims: [
        { claim: 'signups up', quote: 'Signups rose 40%', support: 'material', sourceQuote: 'Signups rose 40%.' },
        { claim: 'phone number', quote: 'The drop-off was the phone number', support: 'material', sourceQuote: 'users hated it' },
        { claim: 'invented', quote: 'revenue doubled', support: 'none', sourceQuote: null },
      ] }));
    const r = await reviewDraft(input(SHORT), { client: s.client, model: 'm', budget: budget() });
    expect(r.inventory.dropped).toBe(1);
    expect(r.inventory.claims.map((c) => c.support)).toEqual(['material', 'none']);
    // the inventory reaches the verdict stage
    expect(s.seen[1].userMessage).toContain('signups up');
  });

  it('drops fixes whose quote is not in the draft, keeps at most eight in order, and caps the overall', async () => {
    const fixes = [{ quote: 'not in the draft at all', instruction: 'x', criterion: null },
      ...Array.from({ length: 10 }, (_, i) => ({ quote: 'Signups rose 40%', instruction: `fix ${i}`, criterion: 'proof' }))];
    const s = scripted(() => ({ scores: [{ id: 'proof', score: 8, why: '' }, { id: 'voice', score: 4, why: '' }],
      caps: [{ n: 2, holds: true, quote: 'Signups rose 40%' }, { n: 1, holds: true, quote: 'a quote that is invented' }],
      mainFailure: 'craft', missingFacts: [], fixes, keep: 'the 40% figure' }));
    const r = await reviewDraft(input(SHORT), { client: s.client, model: 'm', budget: budget() });
    expect(r.weightedAverage).toBe(7);
    expect(r.capsFired.map((c) => c.max)).toEqual([6]);   // the cap on an invented quote is dropped
    expect(r.overall).toBe(6);
    expect(r.verdict).toBe('fix');
    expect(r.fixes).toHaveLength(MAX_FIXES);
    expect(r.fixes[0].instruction).toBe('fix 0');
    expect(r.droppedFixes).toBe(1);
    expect(r.keep).toBe('the 40% figure');
  });

  it('is unverified when a criterion is not scored', async () => {
    const s = scripted(() => ({ scores: [{ id: 'proof', score: 8, why: '' }], caps: [], mainFailure: 'none', missingFacts: [], fixes: [], keep: null }));
    const r = await reviewDraft(input(SHORT), { client: s.client, model: 'm', budget: budget() });
    expect(r.verdict).toBe('unverified'); expect(r.fixes).toEqual([]);
  });

  it('returns regather when facts are missing', async () => {
    const s = scripted(() => ({ scores: [{ id: 'proof', score: 5, why: '' }, { id: 'voice', score: 7, why: '' }], caps: [], mainFailure: 'missing-facts', missingFacts: ['the baseline signup rate'], fixes: [], keep: null }));
    const r = await reviewDraft(input(SHORT), { client: s.client, model: 'm', budget: budget() });
    expect(r.verdict).toBe('regather'); expect(r.missingFacts).toEqual(['the baseline signup rate']);
  });

  it('a call that throws is unverified, not an error', async () => {
    const client: InferenceClient = { complete: async () => { throw new Error('down'); } };
    const r = await reviewDraft(input(SHORT), { client, model: 'm', budget: budget() });
    expect(r.verdict).toBe('unverified');
  });
});

describe('judge-bias guard', () => {
  it('every reviewer prompt says to judge content and not length', () => {
    for (const p of [INVENTORY_SYSTEM, VERDICT_SYSTEM, PAIRWISE_SYSTEM]) expect(p).toContain(CONTENT_NOT_LENGTH);
    expect(CONTENT_NOT_LENGTH).toMatch(/longer draft that says less must score lower/);
  });

  it('a longer, emptier draft does not ship when the model fires the proof cap on it', async () => {
    expect(LONG.length).toBeGreaterThan(2 * SHORT.length);
    // a model that follows the instructions: same criterion scores for both, the proof cap fires when the draft
    // carries no figure from the material (an absence, so no quote)
    const verdict = (req: InferenceRequest) => ({
      scores: [{ id: 'proof', score: 9, why: '' }, { id: 'voice', score: 9, why: '' }],
      caps: draftOf(req).includes('40%') ? [] : [{ n: 1, holds: true, quote: null }],
      mainFailure: draftOf(req).includes('40%') ? 'none' : 'content', missingFacts: [], fixes: [], keep: null,
    });
    const long = await reviewDraft(input(LONG), { client: scripted(verdict).client, model: 'm', budget: budget() });
    const short = await reviewDraft(input(SHORT), { client: scripted(verdict).client, model: 'm', budget: budget() });
    expect(long.weightedAverage).toBe(9);
    expect(long.overall).toBe(4);           // min(9, cap 4)
    expect(long.verdict).toBe('redraft');
    expect(short.overall).toBe(9);
    expect(short.verdict).toBe('ship');
  });
});
