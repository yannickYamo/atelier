// tests/atelier-house-text.test.ts — WHAT THE AUTHOR REPEATS IN THEIR PIECES IS THEIRS, NOT ONE EXAMPLE'S CASE.
//
// The defect (25 Nov): every opinion post of the blog ends on the same author line ("… on a mission
// to reach $5M ARR with just 4 people and good tools. Previously built and sold two B2B companies."). The
// writer copied it, as the house does, and the grounding step read "ARR" and "B2B" as facts of another example's case
// and rewrote it in all five drafts ("an ambitious revenue goal", "The author is a founder…"). With the step off, the
// line came back word for word in 4 of 4. And on the direct writer a borrowed fact kept "as an assumption" printed the
// step's own doubt in a post: "Assuming Harbor builds AI GTM software…".
// The author's own line is read on distinct pieces, whole sentences of six words or more held by two pieces or more: a
// short fact hidden in longer sentences, or one piece served twice, is still one example's case.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { houseLines } from '../core/loop/carry-over.js';
import { carriedClaims, rewriteProblem, groundCarried } from '../core/loop/grounding.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';

const asking = (): InferenceClient & { seen: InferenceRequest[] } => { const seen: InferenceRequest[] = [];
  return { seen, complete: (req: InferenceRequest) => { seen.push(req); return Promise.resolve({ json: { rewrites: [] }, cost: { basis: 'API_METERED', billingUsd: 0 }, termination: 'COMPLETE', modelId: 'm' } as never); } }; };

const BIO = 'Dana is building a small studio, on a mission to reach $5M ARR with just 4 people and good tools. Previously built and sold two B2B companies.';
const P1 = `# AI Tourists\n\nWe call them AI tourists. Our ARR grew when we stopped chasing them.\n\n${BIO}`;
const P2 = `# Judgment debt\n\nShortcuts cost you later. That is your judgment debt.\n\n${BIO}`;
const REQUEST = 'Write a founder essay arguing that demo forms lose pipeline.';
const draft = `Demo forms lose pipeline.\n\n${BIO}`;

describe('the author\'s own line', () => {
  it('two pieces hold it whole: a draft that ends on it, word for word, has nothing to ground', () => {
    expect(carriedClaims(draft, `${P1}\n\n${P2}`, REQUEST, houseLines([P1, P2]))).toEqual([]);
  });
  it('without the pieces read one by one, it is still found, as before', () => {
    expect(carriedClaims(draft, `${P1}\n\n${P2}`, REQUEST)).toHaveLength(2);
  });
  it('one piece served twice is one piece: its line stays that example\'s case', () => {
    expect(houseLines([P1, P1]).size).toBe(0);
  });
  it('a short fact inside longer sentences of two pieces is no line of the author\'s', () => {
    const a = 'Glad it works now that the CORS is fixed.'; const b = 'We shipped on Friday once the CORS is fixed.';
    expect(carriedClaims('CORS is fixed.', `${a}\n\n${b}`, 'Thanks, that solved it.', houseLines([a, b]))).toHaveLength(1);
  });
  it('a term of one example said of this case in the draft\'s own sentence is still found', () => {
    expect(carriedClaims('Our ARR doubled once the form was gone.', `${P1}\n\n${P2}`, REQUEST, houseLines([P1, P2]))).toHaveLength(1);
  });
});

describe('a borrowed fact kept as an assumption', () => {
  const s = 'Harbor is the AI GTM platform for revenue teams.'; const hedged = 'Assuming Harbor builds AI GTM software, it sits here as an alternative.';
  it('on the direct writer is refused: the sentence stays as written, listed', () => {
    expect(rewriteProblem(s, hedged, ['gtm'], P1, REQUEST, false)).toMatch(/still states gtm/);
    expect(rewriteProblem(s, 'Harbor is a platform for revenue teams.', ['gtm'], P1, REQUEST, false)).toBeNull();
  });
  it('elsewhere (a reply on the compiled path) still stands, as before', () => {
    expect(rewriteProblem(s, hedged, ['gtm'], P1, REQUEST)).toBeNull();
  });
});

describe('what the rewrite is asked', () => {
  const run = async (assume?: boolean) => { const c = asking();
    await groundCarried('Our ARR doubled.', { client: c, budget: { spentUsd: 0, capUsd: 1 }, request: REQUEST, evidence: '', examples: P1, ...(assume === undefined ? {} : { assume }) });
    return c.seen[0]?.stableBlock ?? ''; };
  it('on the direct writer: drop the borrowed fact, no assumption offered', async () => {
    const asked = await run(false);
    expect(asked).toMatch(/Drop the borrowed fact/);
    expect(asked).not.toMatch(/assuming/);
  });
  it('elsewhere: as before, an assumption stated as one is offered', async () => {
    expect(await run()).toMatch(/keep it only as an assumption/);
  });
});
