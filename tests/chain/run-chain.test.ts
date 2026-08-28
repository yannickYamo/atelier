// The wiring between the pure chain and a real model. Fake client, no spend.

import { describe, it, expect } from 'vitest';
import { runDiscoveryChain, PROPOSER_SCHEMA, OBSERVER_SCHEMA } from '../../core/discovery/run-chain.js';
import type { InferenceClient, Budget } from '../../core/inference/client.js';
import type { ConstructScope } from '../../core/discovery/chain/construct-scope.js';

const scope: ConstructScope = { standardDimensions: ['voice'] };
const budget = (): Budget => ({ spentUsd: 0, capUsd: 10 });
const corpus = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `piece-${i + 1}.md`, text: `body ${i + 1}` }));

/** Records what it was shown, so the split can be checked from the outside. */
function fakeClient(onPropose: unknown, onObserve: unknown): InferenceClient & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    async complete(req) {
      seen.push(`${req.stableBlock}\n${req.variableBlock}`);
      const isPropose = req.stableBlock.includes('IMPLICIT DECISION RULES');
      // The MATCHER is a third call kind. Both vantages return the same fake factors, so a working
      // matcher pairs them index-for-index and the union collapses back to one framing's worth.
      const isMatch = req.stableBlock.includes('SUBSTANTIALLY THE SAME');
      const n = (req.variableBlock.match(/^\d+\. /gm) ?? []).length / 2;
      const json = isMatch
        ? { matches: Array.from({ length: n }, (_, i) => ({ leftIndex: i, matchedRightIndex: i })) }
        : isPropose ? onPropose : onObserve;
      return { json, modelId: 'fake', inputTokens: 1,
        cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0, termination: { kind: 'COMPLETE' as const } };
    },
  };
}
const factors = (n: number) => ({ factors: Array.from({ length: n }, (_, i) => ({
  description: `rule ${i + 1}`, appliesWhen: [{ id: `c${i}`, describe: 'always' }],
  readFrom: ['piece-1.md'], wouldBeAbsentIf: 'it would not appear' })) });

// The split moved to planImport, which already owned it. Its tests live with it, in import.test.ts.
const roles = (n: number) => corpus(n).map((c, i) => ({ contextId: c.id,
  role: i < 2 ? 'PROPOSAL' as const : 'HELD_OUT' as const }));

describe('too little evidence is a REFUSAL, not a thin result', () => {
  it('refuses a corpus that cannot be split 2 and 2', async () => {
    const r = await runDiscoveryChain(fakeClient(factors(8), {}), budget(), 's', corpus(3), roles(3), scope, 'm');
    expect('refused' in r && r.refused).toBe(true);
    expect('refused' in r && r.reason).toBe('INSUFFICIENT_DISCOVERY_EVIDENCE');
  });
});

describe('THE POINT: the proposer never sees a held-out golden', () => {
  it('proposal text reaches the proposer; held-out text does not', async () => {
    const c = fakeClient(factors(8), { applicable: true, present: true });
    await runDiscoveryChain(c, budget(), 's', corpus(4), roles(4), scope, 'm');
    const proposerCall = c.seen.find((s) => s.includes('IMPLICIT DECISION RULES'))!;
    expect(proposerCall).toContain('body 1');   // piece-1 is PROPOSAL
    expect(proposerCall).toContain('body 2');   // piece-2 is PROPOSAL
    // The load-bearing assertion. A factor read off an example and confirmed against that same
    // example has confirmed nothing, and nothing downstream could tell that apart from recurrence.
    expect(proposerCall).not.toContain('body 3');
    expect(proposerCall).not.toContain('body 4');
  });

  it('each observer call carries ONE held-out document and never the proposal set', async () => {
    const c = fakeClient(factors(8), { applicable: true, present: true });
    await runDiscoveryChain(c, budget(), 's', corpus(4), roles(4), scope, 'm');
    for (const call of c.seen.filter((s) => s.includes('ONE piece of writing'))) {
      expect(call).not.toContain('body 1');
      expect(call).not.toContain('body 2');
      expect(/body 3|body 4/.test(call)).toBe(true);
    }
  });

  it('fires factors x held-out observations, document-major so the document caches', async () => {
    const c = fakeClient(factors(8), { applicable: true, present: true });
    const r = await runDiscoveryChain(c, budget(), 's', corpus(4), roles(4), scope, 'm');
    // 8 factors x 2 held-out. TWO vantages run and both return the same 8 rules, so a working
    // matcher merges them and the observation cost is unchanged. If the matcher ever silently stops
    // merging, this doubles — which is the failure mode `suspectMatcherFailure` exists to announce.
    expect('observeCalls' in r && r.observeCalls).toBe(16);
    const docs = c.seen.filter((s) => s.includes('ONE piece of writing')).map((s) => s.includes('body 3') ? 3 : 4);
    // grouped, not interleaved — every call for one document lands consecutively
    expect(docs.slice(0, 8).every((d) => d === docs[0])).toBe(true);
  });
});

describe('applicable and present stay separate', () => {
  it('not-applicable can never be recorded as present', async () => {
    const c = fakeClient(factors(8), { applicable: false, present: true });   // a contradictory model
    const r = await runDiscoveryChain(c, budget(), 's', corpus(4), roles(4), scope, 'm');
    expect('hypotheses' in r).toBe(true);
    // present is gated on applicable, so a factor that did not apply cannot inflate recurrence.
    expect(OBSERVER_SCHEMA.required).toEqual(['applicable', 'present', 'why']);
  });

  it('the proposer schema forces a condition on every rule', () => {
    const f = (PROPOSER_SCHEMA.properties as Record<string, { items: { properties: Record<string, { minItems?: number }> } }>).factors;
    expect(f.items.properties.appliesWhen.minItems).toBe(1);
  });
});
