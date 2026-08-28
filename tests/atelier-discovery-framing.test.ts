// tests/atelier-discovery-framing.test.ts — THE POLARITY TEST FOR MULTI-FRAMING DISCOVERY.
//
// Every assertion here FAILS against the pre-fix code, which is the only property that makes a test
// evidence rather than decoration. Before the change there was ONE hardcoded proposer prompt per
// path, duplicated across the two paths, so:
//
//   - "two framings produce different prompts" fails: there was one prompt and no framing parameter
//   - "BOTH paths vary with framing" fails: it is the dark-path check — a framing wired into the
//     fallback while the chain kept its own copy would ship a feature the main path never serves
//   - "the union never drops" fails: there was no union
//
// The third is the one that matters after the feature works, because a union that quietly loses two
// rules looks exactly like a union that had two fewer rules to begin with.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { FRAMINGS, DEFAULT_FRAMINGS, framedPreamble, type FramingId } from '../core/discovery/framing.js';
import { proposerSystemFor } from '../core/discovery/propose.js';
import { chainProposerSystemFor } from '../core/discovery/run-chain.js';
import { assertNothingDropped, unionFramedRules, describeUnion, type UnionMember } from '../core/discovery/union.js';
import type { InferenceClient, Budget } from '../core/inference/client.js';

const cliSource = (): string => {
  // The CLI is a TREE now — dispatch in atelier.mts, one file per command group, shared ground in
  // runtime.ts. These assertions are about what the CLI DOES, not which file it happens to live in,
  // so they read the whole tree and stay true across a refactor.
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  return walk('cli').filter((f) => /\.(ts|mts)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
};

describe('discovery framing — one owner, both paths', () => {
  it('two framings produce genuinely different prompts on the fallback path', () => {
    expect(proposerSystemFor('A')).not.toBe(proposerSystemFor('B'));
    expect(proposerSystemFor('A')).toContain('Not a description of their style');
    expect(proposerSystemFor('B')).toContain('Formal and figurative choices COUNT as decisions');
  });

  it('the CHAIN path varies with framing too — the dark-path check', () => {
    // The chain is the path a real user takes. A framing wired into the fallback alone would be a
    // feature that never serves anybody, and would look shipped.
    expect(chainProposerSystemFor('A')).not.toBe(chainProposerSystemFor('B'));
    expect(chainProposerSystemFor('A')).toContain('Not a description of their style');
    expect(chainProposerSystemFor('B')).toContain('Formal and figurative choices COUNT as decisions');
  });

  it('the framing clause has exactly ONE owner', () => {
    // Both prompts must carry the SAME clause bytes for a given framing. If the two paths ever
    // re-acquire private copies, these drift and this fails.
    for (const f of ['A', 'B', 'C'] as FramingId[]) {
      expect(proposerSystemFor(f)).toContain(FRAMINGS[f].clause);
      expect(chainProposerSystemFor(f)).toContain(FRAMINGS[f].clause);
      expect(framedPreamble(f)).toContain(FRAMINGS[f].clause);
    }
  });

  it('the two prompts still differ BELOW the shared preamble', () => {
    // They are not collapsed and must not be: the chain asks for richer per-rule fields.
    expect(proposerSystemFor('B')).not.toBe(chainProposerSystemFor('B'));
    expect(chainProposerSystemFor('B')).toContain('READ_FROM');
    expect(proposerSystemFor('B')).not.toContain('READ_FROM');
  });

  it('ships only framings with recorded recall behind them', () => {
    // C is MORE disjoint from A than B is. Disjointness says a vantage finds DIFFERENT rules, never
    // TRUE ones — shipping C on that alone would let the measurable outcome decide a question it
    // cannot answer.
    expect([...DEFAULT_FRAMINGS].sort()).toEqual(['A', 'B']);
    for (const f of DEFAULT_FRAMINGS) expect(FRAMINGS[f].evidence).not.toBeNull();
    expect(FRAMINGS.C.evidence).toBeNull();
  });
});

describe('the chain actually RUNS several vantages — not just able to', () => {
  it('runDiscoveryChain defaults to the shipped framing set', async () => {
    // Reachability, not capability. `chainProposerSystemFor` existing proves nothing if the chain
    // still calls it once with a hardcoded framing, which is exactly the dark-path shape.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../core/discovery/run-chain.ts', import.meta.url), 'utf8'));
    expect(src).toMatch(/framings: readonly FramingId\[\] = DEFAULT_FRAMINGS/);
    expect(src).toMatch(/for \(const framing of framings\)/);
    expect(src).toMatch(/chainProposerSystemFor\(framing\)/);
    // and the ids are assigned after the union, so p3 names a decision not a framing's third guess
    expect(src).toMatch(/proposedId: `p\$\{i \+ 1\}`/);
  });

  it('a single vantage skips the matcher entirely', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../core/discovery/run-chain.ts', import.meta.url), 'utf8'));
    expect(src).toMatch(/perFraming\.length > 1/);
  });
});

describe('the union invariant', () => {
  const member = (rules: { framing: FramingId; index: number }[]): UnionMember<string> => ({
    rules: rules.map((r) => ({ ...r, rule: `r${r.index}` })),
    framings: [...new Set(rules.map((r) => r.framing))],
    crossFramingAgreement: new Set(rules.map((r) => r.framing)).size > 1,
  });

  it('accepts a union that kept everything', () => {
    expect(() => { assertNothingDropped(3, [
      member([{ framing: 'A', index: 0 }, { framing: 'B', index: 0 }]),
      member([{ framing: 'A', index: 1 }]),
    ]); }).not.toThrow();
  });

  it('REFUSES a union that dropped a rule — the failure that is invisible in the output', () => {
    expect(() => { assertNothingDropped(4, [
      member([{ framing: 'A', index: 0 }, { framing: 'B', index: 0 }]),
      member([{ framing: 'A', index: 1 }]),
    ]); }).toThrow(/must\s+never drop one/);
  });

  it('REFUSES a rule that landed in two members', () => {
    expect(() => { assertNothingDropped(2, [
      member([{ framing: 'A', index: 0 }]),
      member([{ framing: 'A', index: 0 }]),
    ]); }).toThrow(/more than one member/);
  });
});


describe('a silently-failed matcher is announced, not absorbed', () => {
  const rules = (p: string) => [`${p} one`, `${p} two`, `${p} three`];
  const client = (matches: unknown): InferenceClient => ({
    async complete() {
      return { json: matches, modelId: 'fake', inputTokens: 1, cacheReadTokens: 0,
        cacheWriteTokens: 0, outputTokens: 1, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0, termination: { kind: 'COMPLETE' as const } };
    },
  });
  const budget = (): Budget => ({ spentUsd: 0, capUsd: 10 });
  const arms = [{ framing: 'A' as const, rules: rules('a') }, { framing: 'B' as const, rules: rules('b') }];

  it('flags the case where two vantages ran and NOTHING merged', async () => {
    const u = await unionFramedRules(client({ matches: [] }), budget(), arms, (r) => r);
    expect(u.suspectMatcherFailure).toBe(true);
    expect(u.matchedPairs).toBe(0);
    expect(u.distinctCount).toBe(6);            // nothing dropped, everything ungrouped
    // and it SAYS so, in the place a person reads — with the cost consequence attached
    expect(describeUnion(u, (r) => r)).toMatch(/twice what a merged one would/);
  });

  it('does NOT flag a working matcher', async () => {
    const u = await unionFramedRules(
      client({ matches: [0, 1, 2].map((i) => ({ leftIndex: i, matchedRightIndex: i })) }),
      budget(), arms, (r) => r);
    expect(u.suspectMatcherFailure).toBe(false);
    expect(u.distinctCount).toBe(3);
    expect(u.members.every((m) => m.crossFramingAgreement)).toBe(true);
    expect(describeUnion(u, (r) => r)).not.toMatch(/twice what a merged one would/);
  });

  it('a ONE-SIDED match is not a merge', async () => {
    // left->right says 0 matches 0; right->left is asked the same question and the fake answers the
    // same way, naming left 0 — so this pair DOES agree. The asymmetric case is index 1 vs 2, which
    // only ever gets named in one direction and must stay split.
    const u = await unionFramedRules(
      client({ matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 2 }] }),
      budget(), arms, (r) => r);
    expect(u.matchedPairs).toBe(1);             // only the reciprocated pair merged
    expect(u.distinctCount).toBe(5);
  });
});

describe('the counterfactual reaches the human — it was collected and dropped before', () => {
  it('Requirement carries wouldBeAbsentIf', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../core/state/canonical-state.ts', import.meta.url), 'utf8'));
    expect(src).toMatch(/readonly wouldBeAbsentIf: string \| null;/);
  });

  it('BOTH proposer paths ask for it', async () => {
    const fs = await import('node:fs');
    const propose = fs.readFileSync(new URL('../core/discovery/propose.ts', import.meta.url), 'utf8');
    const chain = fs.readFileSync(new URL('../core/discovery/run-chain.ts', import.meta.url), 'utf8');
    // the thin-corpus path is the LEVEL 1 path, where the counterfactual matters most
    expect(propose).toMatch(/WOULD_BE_ABSENT_IF/);
    expect(propose).toMatch(/'wouldBeAbsentIf'/);
    expect(chain).toMatch(/WOULD_BE_ABSENT_IF/);
  });

  it('the CLI shows it at ratification, beside the claim', async () => {
    const src = cliSource();
    expect(src).toMatch(/if you did NOT do this, I'd expect/);
    // and both discovery paths populate it rather than defaulting it away
    expect(src).toMatch(/wouldBeAbsentIf: r\.wouldBeAbsentIf/);
    expect(src).toMatch(/wouldBeAbsentIf: chain\.proposed\.find/);
  });
});

describe('the counterfactual may NOT silently gain enforcement authority', () => {
  it('never reaches the model — asserted on the rendered bytes', async () => {
    const fs = await import('node:fs');
    // Living on Requirement is what lets ratification show it. It must not be what lets the model
    // receive it: a machine-proposed falsifying counterfactual is NOT a second ratified requirement,
    // and serving it would give an unratified sentence the same carrier as a ratified one.
    const compile = fs.readFileSync(new URL('../core/architecture/compile.ts', import.meta.url), 'utf8');
    expect(compile).not.toMatch(/wouldBeAbsentIf/);

    // The renderer NAMES it, in a comment saying why it is withheld. So the assertion moved from the
    // source to the BYTES, which is the property that was always meant: not "the token is absent from
    // the file" but "the counterfactual never reaches the model".
    const { renderAgentSkill } = await import('../renderers/agent-skill/render.js');
    const { componentFor } = await import('../core/architecture/compile.js');
    const r = { requirementId: 'g1', statement: 'I compress the close.', appliesWhen: 'GENERAL',
      kind: 'GENERATIVE' as const, authority: 'EXPERT_RATIFIED' as const, provenance: 'MACHINE_DISCOVERED' as const,
      evidence: 'a quote', evidenceItemId: 'u1',
      wouldBeAbsentIf: 'SENTINEL-COUNTERFACTUAL-TEXT', materiality: 'PREFERRED' as const,
      realizationTolerance: null, outputShape: null };
    const v: any = { standardVersionHash: 'sv', evidenceId: 'e', workType: 'w', requirements: [r],
      authorityState: 'RATIFIED', mintedAt: '2026-08-23T00:00:00Z' };
    const pkg = renderAgentSkill(v, { architectureHash: 'a', standardVersionHash: 'sv',
      components: [componentFor(r)] }, 'skill', 'desc');
    for (const [file, body] of Object.entries(pkg.runtime)) {
      expect(body, `counterfactual leaked into ${file}`).not.toMatch(/SENTINEL-COUNTERFACTUAL-TEXT/);
    }
  });

  it('carries no authority of its own — authority stays on the requirement', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../core/state/canonical-state.ts', import.meta.url), 'utf8'));
    // it is a nullable string beside the rule, never an Authority-bearing object
    expect(src).toMatch(/readonly wouldBeAbsentIf: string \| null;/);
    expect(src).not.toMatch(/wouldBeAbsentIf:\s*\{/);
  });
});

describe('a decision stated twice by ONE vantage is one decision', () => {
  const client = (matches: unknown): InferenceClient => ({
    async complete() {
      return { json: matches, modelId: 'f', inputTokens: 1, cacheReadTokens: 0,
        cacheWriteTokens: 0, outputTokens: 1, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0, termination: { kind: 'COMPLETE' as const } };
    },
  });
  const budget = (): Budget => ({ spentUsd: 0, capUsd: 10 });

  it('merges within a vantage — the case that used to sail through', () => {
    // "link to the authoritative doc rather than restating it" arrived once from AGENTS.md and again
    // from CONTRIBUTING.md, as two rules from one proposer. Cross-vantage matching never saw it.
    const arms = [{ framing: 'A' as const, rules: ['link, do not restate', 'restating duplicates it', 'unrelated rule'] }];
    // 0<->1 reciprocated; 2 matches nothing
    const m = { matches: [{ leftIndex: 0, matchedRightIndex: 1 }, { leftIndex: 1, matchedRightIndex: 0 }, { leftIndex: 2, matchedRightIndex: null }] };
    return unionFramedRules(client(m), budget(), arms, (r) => r).then((u) => {
      expect(u.distinctCount).toBe(2);
      expect(u.withinVantageDuplicates).toBe(1);
      expect(describeUnion(u, (r) => r)).toMatch(/stated TWICE by a single vantage/);
    });
  });

  it('a rule matching only ITSELF is never merged away', () => {
    const arms = [{ framing: 'A' as const, rules: ['a', 'b'] }];
    const m = { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] };
    return unionFramedRules(client(m), budget(), arms, (r) => r).then((u) => {
      expect(u.distinctCount).toBe(2);
      expect(u.withinVantageDuplicates).toBe(0);
    });
  });

  it('reports nothing when one vantage produced no duplicates', () => {
    const arms = [{ framing: 'A' as const, rules: ['a', 'b'] }];
    const m = { matches: [{ leftIndex: 0, matchedRightIndex: null }, { leftIndex: 1, matchedRightIndex: null }] };
    return unionFramedRules(client(m), budget(), arms, (r) => r).then((u) => {
      expect(describeUnion(u, (r) => r)).not.toMatch(/stated TWICE/);
    });
  });
});

describe('the proposer is not made to pad', () => {
  it('has no count FLOOR, and keeps the CEILING', async () => {
    // Asserted on the SCHEMA VALUE, not on the source text. Twice now a source-text assertion has
    // tripped on the comment explaining the very fix it was checking; the schema is the contract.
    const { PROPOSER_SCHEMA: fallback } = await import('../core/discovery/propose.js');
    const { PROPOSER_SCHEMA: chain } = await import('../core/discovery/run-chain.js');
    const arrayOf = (schema: Record<string, unknown>): Record<string, unknown> => {
      const props = schema.properties as Record<string, Record<string, unknown>>;
      return Object.values(props).find((v) => v.type === 'array')!;
    };
    for (const s of [fallback, chain]) {
      const arr = arrayOf(s);
      expect(arr.minItems, 'a floor of 8 forces one decision to be stated twice to fill it').toBe(1);
      expect(arr.maxItems, 'the ceiling stops the model truncating the tool call mid-emission').toBe(12);
    }
    const fs = await import('node:fs');
    for (const rel of ['../core/discovery/propose.ts', '../core/discovery/run-chain.ts']) {
      expect(fs.readFileSync(new URL(rel, import.meta.url), 'utf8')).toMatch(/FEWER IS BETTER THAN PADDED/);
    }
  });
});
