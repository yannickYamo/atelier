// tests/atelier-model-agnostic.test.ts — THE PASS THAT SEPARATED FOUR QUESTIONS THAT WERE ONE.
//
//   Can Atelier talk to this model?              transport   — checked here
//   Does it return the object we asked for?      structure   — checked here
//   Is its evidence real?                        anchoring   — checked here
//   Is the taste it finds any good?              semantics   — NOT checkable here, and pinned as such
//
// The last one is the reason for most of these tests. Every plausible shortcut to it — a clean protocol
// run, valid JSON, a model that never contradicts itself — is a fact about the first three, and each
// pin below exists because that inference is easy to make and wrong.

import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { AnthropicInferenceClient, refusesForcedChoice } from '../providers/anthropic.js';
import { createServer, type Server } from 'node:http';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  bindingHash, compareBindings, describeMismatch, observeRuntime, detectResolvedModelDrift,
  type RuntimeBinding,
} from '../core/runtime/binding.js';
import { budgetUsd, spend, CallBudgetExceeded, BudgetExceeded, UnboundedRuntime, metered, unmetered, unpriced, type Budget, type InferenceClient } from '../core/inference/client.js';
import { costOf, isLocalBackend, priceFor, ANTHROPIC_PRICING } from '../providers/pricing.js';
import { OpenAICompatibleInferenceClient, CapabilityUnsupported, BACKEND_PRESETS } from '../providers/openai-compatible.js';
import { supportStage, describeProfile, assertSemanticQualification, UNMEASURED, type ModelCapabilityProfile } from '../core/inference/capability.js';
import { runDiscoveryConformance, locateSpan, UNQUALIFIED_BY_THIS_PACK } from '../core/discovery/conformance.js';
import { runProviderConformance } from '../core/inference/provider-conformance.js';
import { initStore, recordBinding, expectedBinding, listBindings, type StoreLayout } from '../core/state/store.js';
import { anInferenceResult } from './fixtures.js';
import type { ProposedRule, CorpusItem } from '../core/discovery/propose.js';

const B = (o: Partial<RuntimeBinding> = {}): RuntimeBinding => ({
  providerAdapter: 'anthropic', backend: 'api.anthropic.com', requestedModel: 'm1',
  structuredOutput: 'NATIVE_TOOL_USE', parameters: {}, runtimeProfile: null, ...o,
});

// ── THE THIRD IDENTITY ───────────────────────────────────────────────────────────────────────
describe('a RuntimeBinding is what the package hash could never say', () => {
  it('hashes the configuration, not the order it was written in', () => {
    const a = B({ parameters: { temperature: 0.2, top_p: 1 } });
    const b = B({ parameters: { top_p: 1, temperature: 0.2 } });
    expect(bindingHash(a)).toBe(bindingHash(b));
  });

  it('separates two runtimes serving byte-identical packages', () => {
    expect(bindingHash(B())).not.toBe(bindingHash(B({ requestedModel: 'm2' })));
    expect(bindingHash(B())).not.toBe(bindingHash(B({ providerAdapter: 'openai-compatible' })));
    expect(bindingHash(B())).not.toBe(bindingHash(B({ structuredOutput: 'JSON_SCHEMA_RESPONSE_FORMAT' })));
    expect(bindingHash(B())).not.toBe(bindingHash(B({ parameters: { temperature: 0.9 } })));
  });

  it('has nothing to compare on the first run, and says so rather than passing', () => {
    expect(compareBindings(null, B()).kind).toBe('BINDING_UNRECORDED');
  });

  it('names every field that moved, so the report points somewhere', () => {
    const v = compareBindings(B(), B({ requestedModel: 'llama-3.1-8b', providerAdapter: 'openai-compatible' }));
    expect(v.kind).toBe('TARGET_BINDING_MISMATCH');
    if (v.kind !== 'TARGET_BINDING_MISMATCH') throw new Error('unreachable');
    expect(v.differences.map((d) => d.field).sort()).toEqual(['model', 'provider adapter']);
    // The message has to say what is LOST, not only what differs — a diff alone reads as a warning
    // about tidiness rather than as a statement about which evidence still applies.
    const text = describeMismatch(v, 'k1');
    expect(text).toMatch(/evidence/i);
    expect(text).toMatch(/--accept-new-binding/);
  });
});

// ── WHAT THE PROVIDER SAYS ANSWERED IS NOT WHAT WE CONFIGURED ────────────────────────────────
describe('an echoed model id is not a confirmed revision', () => {
  it('records the echo as AS_REQUESTED, never as a resolved version', () => {
    expect(observeRuntime(B(), 'm1', 't').modelIdentityKind).toBe('AS_REQUESTED');
    expect(observeRuntime(B(), 'm1-20260101', 't').modelIdentityKind).toBe('RESOLVED_REVISION');
    expect(observeRuntime(B(), null, 't').modelIdentityKind).toBe('UNREPORTED');
  });

  it('catches a provider-side flip under an unchanged configuration', () => {
    const before = observeRuntime(B(), 'm1-20260101', 't1');
    const after = observeRuntime(B(), 'm1-20260601', 't2');
    expect(detectResolvedModelDrift(before, after).drifted).toBe(true);
    expect(detectResolvedModelDrift(before, before).drifted).toBe(false);
  });

  it('cannot detect a flip on a backend that reports nothing, and says that instead of passing', () => {
    const a = observeRuntime(B(), null, 't1');
    const b = observeRuntime(B(), null, 't2');
    const d = detectResolvedModelDrift(a, b);
    expect(d.drifted).toBe(false);
    expect(d.why).toMatch(/undetectable/);
  });

  it('never compares across different bindings — that difference is the other guard is job', () => {
    const before = observeRuntime(B(), 'x', 't1');
    const after = observeRuntime(B({ requestedModel: 'other' }), 'y', 't2');
    expect(detectResolvedModelDrift(before, after).drifted).toBe(false);
  });
});

// ── EVIDENCE DOES NOT TRANSFER BETWEEN RUNTIMES ──────────────────────────────────────────────
describe('the recorded binding is the FIRST one, not the most recent', () => {
  const store = (): StoreLayout => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-bind-')), skillName: 's' };
    initStore(L); return L;
  };

  it('keeps the baseline stable when someone tries a second model', () => {
    const L = store();
    recordBinding(L, 'k1', B());
    recordBinding(L, 'k1', B({ requestedModel: 'm2' }));
    // Most-recent would redefine the baseline on every experiment, so the guard would fire once and
    // never again — which is indistinguishable from not having it.
    expect(expectedBinding(L, 'k1')?.requestedModel).toBe('m1');
    expect(listBindings(L, 'k1')).toHaveLength(2);
  });

  // Phase A: the Claude Code Stop hook records `claude-code` first, and every `atelier invoke` after one
  // /skill use was then refused. The baseline is per surface; the guard within a surface is unchanged.
  it('given the binding about to serve, the baseline is the first on that SURFACE, and null if it has none', () => {
    const L = store();
    const host = B({ providerAdapter: 'claude-code', backend: 'claude-code', requestedModel: 'claude-code-session' });
    recordBinding(L, 'k1', host);
    expect(expectedBinding(L, 'k1', B()), 'a host-hook binding is not the CLI surface\'s baseline').toBeNull();
    expect(compareBindings(expectedBinding(L, 'k1', B()), B()).kind).toBe('BINDING_UNRECORDED');
    recordBinding(L, 'k1', B());
    expect(compareBindings(expectedBinding(L, 'k1', B()), B()).kind).toBe('BINDING_MATCHED');
    // The point of the guard survives: another model on the same surface is still flagged.
    expect(compareBindings(expectedBinding(L, 'k1', B({ requestedModel: 'm2' })), B({ requestedModel: 'm2' })).kind).toBe('TARGET_BINDING_MISMATCH');
    expect(expectedBinding(L, 'k1', host)?.requestedModel).toBe('claude-code-session');
    // Without a candidate, the first-ever binding, as before.
    expect(expectedBinding(L, 'k1')?.providerAdapter).toBe('claude-code');
  });

  it('is a no-op for a binding already on the log', () => {
    const L = store();
    recordBinding(L, 'k1', B());
    recordBinding(L, 'k1', B());
    expect(listBindings(L, 'k1')).toHaveLength(1);
  });
});

// ── AN UNMETERED CALL IS NOT A FREE CALL, AND AN UNKNOWN PRICE IS NOT A ZERO PRICE ───────────
describe('cost has one owner and three honest states', () => {
  const usage = { inputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100 };

  it('reports a local run as unmetered rather than as costing nothing', () => {
    const c = costOf(null, usage, true);
    expect(c.basis).toBe('LOCAL_UNMETERED');
    // `null`, not `0`. Zero says the computation was free; it was not, it was unbilled.
    expect(c.billingUsd).toBeNull();
    expect(budgetUsd(c)).toBe(0);
  });

  it('refuses to guess a price for an unrecognised hosted model', () => {
    // The old table fell back to one vendor's mid-tier rate for anything it did not recognise, which
    // is right by luck for that tier and 5x wrong for the one above it.
    expect(priceFor(ANTHROPIC_PRICING, 'some-model-nobody-tabled')).toBeNull();
    expect(costOf(null, usage, false).basis).toBe('UNKNOWN_PRICING');
  });

  it('meters what it knows', () => {
    const c = costOf({ inputPerM: 3, outputPerM: 15 }, usage, false);
    expect(c.basis).toBe('API_METERED');
    expect(c.billingUsd).toBeCloseTo((1000 * 3 + 100 * 15) / 1e6, 12);
  });

  it('knows a backend on this machine bills nobody', () => {
    expect(isLocalBackend('http://localhost:11434/v1')).toBe(true);
    expect(isLocalBackend('http://127.0.0.1:8000/v1')).toBe(true);
    expect(isLocalBackend('https://api.groq.com/openai/v1')).toBe(false);
  });

  it('bounds an unmetered runtime by calls, because a dollar cap never binds there', async () => {
    const budget: Budget = { spentUsd: 0, capUsd: 10, maxCalls: 2 };
    // `unmetered()`, not `0`. The old version of this test passed a bare number, which is the very
    // collapse that hid the defect below: a free call and an unpriced one were both "0".
    const free = async () => ({ value: 1, cost: unmetered() });
    await spend(budget, 0, free);
    await spend(budget, 0, free);
    await expect(spend(budget, 0, free)).rejects.toBeInstanceOf(CallBudgetExceeded);
  });

  // ── A CAP THAT CANNOT BIND MUST SAY SO ─────────────────────────────────────────────────────
  //
  // `OPENAI_COMPATIBLE_PRICING` is deliberately empty, so every hosted call through that adapter
  // priced as UNKNOWN, contributed $0.00, and left `spentUsd` at zero forever. Four commands set a
  // dollar cap and no call bound, which meant they displayed a limit they did not have.
  it('refuses to continue when the runtime is unpriced and only a dollar cap was set', async () => {
    const budget: Budget = { spentUsd: 0, capUsd: 1 };            // no maxCalls — the defect's shape
    const unpricedCall = async () => ({ value: 1, cost: unpriced() });
    await expect(spend(budget, 0, unpricedCall)).rejects.toBeInstanceOf(UnboundedRuntime);
    // and it says which of the three states it is, because the remedy differs
    await expect(spend({ spentUsd: 0, capUsd: 1 }, 0, unpricedCall)).rejects.toThrow(/UNKNOWN_PRICING/);
    await expect(spend({ spentUsd: 0, capUsd: 1 }, 0, unpricedCall)).rejects.toThrow(/--max-calls/);
  });

  it('the same for a local runtime, which bills nobody at all', async () => {
    await expect(spend({ spentUsd: 0, capUsd: 1 }, 0, async () => ({ value: 1, cost: unmetered() })))
      .rejects.toBeInstanceOf(UnboundedRuntime);
  });

  it('POLARITY: a call bound makes an unpriced runtime legal again', async () => {
    const budget: Budget = { spentUsd: 0, capUsd: 1, maxCalls: 3 };
    const unpricedCall = async () => ({ value: 1, cost: unpriced() });
    await spend(budget, 0, unpricedCall);
    await spend(budget, 0, unpricedCall);
    expect(budget.spentUsd).toBe(0);                    // still nothing billed, and that is honest
    expect(budget.calls).toBe(2);                       // but the bound that CAN hold it is moving
    await spend(budget, 0, unpricedCall);
    await expect(spend(budget, 0, unpricedCall)).rejects.toBeInstanceOf(CallBudgetExceeded);
  });

  it('and a priced runtime is untouched by any of this', async () => {
    const budget: Budget = { spentUsd: 0, capUsd: 1 };            // no maxCalls, and that is fine here
    await spend(budget, 0, async () => ({ value: 1, cost: metered(0.4) }));
    expect(budget.spentUsd).toBeCloseTo(0.4);
    await spend(budget, 0, async () => ({ value: 1, cost: metered(0.4) }));
    await expect(spend(budget, 0.4, async () => ({ value: 1, cost: metered(0.4) })))
      .rejects.toBeInstanceOf(BudgetExceeded);
  });
});

// ── THE RATE CARD IS A FACT ABOUT A VENDOR, AND A STALE ONE IS A WRONG ONE ───────────────────
describe('published prices', () => {
  it('the models this build ships as defaults are priced at their real rate', () => {
    // Checked against the published rate card on 2026-08-24. `claude-opus-4-7` shipped at 15/75 — a
    // previous generation's top-tier price — while it is the DEFAULT proposer, so every cost this
    // build reported for its own default configuration was 3x the truth and the cap bound at a third
    // of what the user asked for.
    expect(ANTHROPIC_PRICING['claude-opus-4-7']).toMatchObject({ inputPerM: 5, outputPerM: 25 });
    expect(ANTHROPIC_PRICING['claude-sonnet-4-5-20250929']).toMatchObject({ inputPerM: 3, outputPerM: 15 });
  });

  it('and an unknown model is UNPRICED, never guessed at a neighbour\'s rate', () => {
    expect(priceFor(ANTHROPIC_PRICING, 'some-model-shipped-next-year')).toBeNull();
    expect(costOf(null, { inputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1e6 }, false))
      .toEqual({ basis: 'UNKNOWN_PRICING', billingUsd: null });
  });
});

// ── THE SECOND PROTOCOL ──────────────────────────────────────────────────────────────────────
describe('the OpenAI-compatible adapter, against a stubbed wire', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  const stub = (payload: unknown, ok = true): { body: () => Record<string, unknown> } => {
    let seen: Record<string, unknown> = {};
    globalThis.fetch = (async (_u: string, init: { body: string }) => {
      seen = JSON.parse(init.body) as Record<string, unknown>;
      return { ok, status: ok ? 200 : 500, json: async () => payload, text: async () => 'err' } as unknown as Response;
    }) as unknown as typeof fetch;
    return { body: () => seen };
  };

  const client = (o: Partial<ConstructorParameters<typeof OpenAICompatibleInferenceClient>[0]> = {}) =>
    new OpenAICompatibleInferenceClient({ modelId: 'llama', baseUrl: 'http://localhost:11434/v1', ...o });

  const REQ = {
    stableBlock: 'STABLE', variableBlock: 'VARIABLE', userMessage: 'go',
    toolName: 'emit', toolDescription: 'emit it', schema: { type: 'object' }, maxTokens: 100,
  };

  const answered = (args: string) => ({
    model: 'llama-3.1-8b-instruct',
    choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'emit', arguments: args } }] } }],
    usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } },
  });

  it('maps every field of the request without loss', async () => {
    const s = stub(answered('{"a":1}'));
    await client().complete(REQ);
    const b = s.body() as { messages: { role: string; content: string }[]; tools: unknown[]; tool_choice: unknown; max_tokens: number };
    // STABLE FIRST. There is no per-block cache marker on this protocol, so prefix order is the only
    // lever a prefix cache can act on — and it is the same discipline the interface already asked for.
    expect(b.messages.map((m) => m.content)).toEqual(['STABLE', 'VARIABLE', 'go']);
    expect(b.max_tokens).toBe(100);
    expect(b.tool_choice).toEqual({ type: 'function', function: { name: 'emit' } });
    expect(b.tools).toHaveLength(1);
  });

  it('reports the model the backend named, not the one we asked for', async () => {
    stub(answered('{"a":1}'));
    expect((await client().complete(REQ)).modelId).toBe('llama-3.1-8b-instruct');
  });

  it('does not count cached tokens twice', async () => {
    stub(answered('{"a":1}'));
    const r = await client().complete(REQ);
    // `prompt_tokens` on this protocol INCLUDES the cached ones. Reporting both in full would inflate
    // input by the cache size and make the two adapters' numbers incomparable.
    expect(r.inputTokens).toBe(100);
    expect(r.cacheReadTokens).toBe(20);
  });

  it('prices a localhost backend as unmetered', async () => {
    stub(answered('{"a":1}'));
    expect((await client().complete(REQ)).cost.basis).toBe('LOCAL_UNMETERED');
  });

  it('RAISES on truncation instead of returning half an object', async () => {
    stub({ choices: [{ finish_reason: 'length', message: { content: '{"a":' } }] });
    await expect(client().complete(REQ)).rejects.toThrow(/token limit/);
  });

  it('RAISES on a refusal', async () => {
    stub({ choices: [{ finish_reason: 'stop', message: { refusal: 'no' } }] });
    await expect(client().complete(REQ)).rejects.toThrow(/refused/);
  });

  it('names the missing capability when a backend ignores tool_choice', async () => {
    // The failure mode that makes "OpenAI-compatible" a claim about a wire protocol and nothing else:
    // the backend accepts the tools array, ignores the forcing, and answers in prose.
    stub({ model: 'x', choices: [{ finish_reason: 'stop', message: { content: 'Sure! Here you go:' } }] });
    const e = await client().complete(REQ).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CapabilityUnsupported);
    expect((e as Error).message).toMatch(/forced function calling/);
    expect((e as Error).message).toMatch(/--structured-output json-schema/);
  });

  it('RAISES on a payload that is not JSON, and says it is a structured-output failure', async () => {
    stub(answered('not json at all'));
    await expect(client().complete(REQ)).rejects.toThrow(/not a taste failure/);
  });

  it('uses the schema response format when asked, and forces nothing', async () => {
    const s = stub({ model: 'x', choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }], usage: {} });
    await client({ structuredOutput: 'JSON_SCHEMA_RESPONSE_FORMAT' }).complete(REQ);
    const b = s.body() as { response_format?: unknown; tools?: unknown };
    expect(b.response_format).toBeTruthy();
    expect(b.tools).toBeUndefined();
  });

  it('refuses to send a keyless request to a hosted backend', () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => new OpenAICompatibleInferenceClient({ modelId: 'x', baseUrl: 'https://api.example.com/v1' }))
        .toThrow(/no API key/);
    } finally { if (key !== undefined) process.env.OPENAI_API_KEY = key; }
  });
});

// ── PROTOCOL CONFORMANCE, AND ITS ONE PROBE THAT MATTERS ─────────────────────────────────────
describe('provider conformance establishes what it says and no more', () => {
  const ok: InferenceClient = { complete: async () => anInferenceResult({ json: { colour: 'blue', count: 3 }, inputTokens: 10, outputTokens: 4 }) };

  it('passes a working binding', async () => {
    const r = await runProviderConformance(ok, 'fake', { complete: async () => { throw new Error('truncated'); } });
    expect(r.passed).toBe(true);
    expect(r.reportedModel).toBe('test-model');
  });

  it('fails a backend that returns an object the schema did not ask for', async () => {
    const bad: InferenceClient = { complete: async () => anInferenceResult({ json: { colour: 'blue' }, inputTokens: 10, outputTokens: 4 }) };
    const r = await runProviderConformance(bad, 'fake');
    expect(r.passed).toBe(false);
    expect(r.probes.find((p) => p.id === 'STRUCTURED_OBJECT_RETURNED')?.outcome).toBe('FAIL');
  });

  it('FAILS an adapter that returns a partial object instead of raising', async () => {
    // The whole point of the negative probe. An adapter that hands back half an object has handed a
    // discovery run something it will record as a candidate.
    const r = await runProviderConformance(ok, 'fake', ok);
    expect(r.probes.find((p) => p.id === 'FAILS_CLOSED')?.outcome).toBe('FAIL');
    expect(r.passed).toBe(false);
  });

  it('reports a backend that names no model as a FAILURE, because a version flip would be invisible', async () => {
    const anon: InferenceClient = { complete: async () => anInferenceResult({ json: { colour: 'b', count: 1 }, modelId: '', inputTokens: 1, outputTokens: 1 }) };
    const r = await runProviderConformance(anon, 'fake');
    expect(r.probes.find((p) => p.id === 'MODEL_IDENTITY_CAPTURED')?.outcome).toBe('FAIL');
  });

  it('skips the negative probe rather than failing it when the positive call never returned', async () => {
    const dead: InferenceClient = { complete: async () => { throw new Error('unreachable'); } };
    const r = await runProviderConformance(dead, 'fake', dead);
    expect(r.probes.find((p) => p.id === 'FAILS_CLOSED')?.outcome).toBe('SKIPPED');
  });
});

// ── THE DETERMINISTIC DISCOVERY PACK, AND EVERY EDGE OF IT ───────────────────────────────────
describe('discovery conformance settles what a machine can settle', () => {
  const CORPUS: CorpusItem[] = [{ id: 'a.md', text: 'The bridge was out.\nWe walked the long way round the river.' }];
  const rule = (o: Partial<ProposedRule> = {}): ProposedRule => ({
    statement: 'Open on a concrete obstacle.', appliesWhen: 'GENERAL', kind: 'GENERATIVE',
    evidence: 'The bridge was out.', evidenceItemId: 'a.md',
    wouldBeAbsentIf: 'The piece would open on a summary of the trip.', ...o,
  });

  it('catches a fabricated quote outright', () => {
    const r = runDiscoveryConformance([rule({ evidence: 'The bridge was resplendent.' })], CORPUS, { rules: [] });
    const c = r.checks.find((x) => x.id === 'EVIDENCE_SPAN_VERBATIM')!;
    expect(c.outcome).toBe('FAIL');
    expect(c.failures[0]).toMatch(/does not occur there/);
  });

  it('catches a quote attributed to a file that does not exist', () => {
    const r = runDiscoveryConformance([rule({ evidenceItemId: 'ghost.md' })], CORPUS, { rules: [] });
    expect(r.checks.find((x) => x.id === 'EVIDENCE_SPAN_VERBATIM')!.failures[0]).toMatch(/no such item/);
  });

  it('admits line wrapping as a match but says the bytes were not returned', () => {
    expect(locateSpan('The bridge\nwas out.', 'a.md', CORPUS)).toBe('WHITESPACE_NORMALIZED');
    const r = runDiscoveryConformance([rule({ evidence: 'The bridge\n  was out.' })], CORPUS, { rules: [] });
    const c = r.checks.find((x) => x.id === 'EVIDENCE_SPAN_VERBATIM')!;
    expect(c.outcome).toBe('PASS');
    expect(c.caveat).toMatch(/whitespace/i);
  });

  it('reads the RAW object for grabbed authority, because narrowing deletes the evidence', () => {
    const raw = { rules: [{ statement: 's', materiality: 'REQUIRED' }] };
    const c = runDiscoveryConformance([rule()], CORPUS, raw).checks.find((x) => x.id === 'AUTHORITY_SAFE')!;
    expect(c.outcome).toBe('FAIL');
    expect(c.failures[0]).toMatch(/materiality/);
  });

  it('catches a word-for-word repeat', () => {
    const r = runDiscoveryConformance([rule(), rule()], CORPUS, { rules: [] });
    expect(r.checks.find((x) => x.id === 'NO_EXACT_DUPLICATES')!.outcome).toBe('FAIL');
  });

  it('does NOT catch one decision wearing two costumes, and says so on the pass', () => {
    // The pin that keeps this pack honest. These are one decision; no string comparison will ever say
    // so, and calling the check "duplicate detection" without the caveat would imply otherwise.
    const pair = [
      rule({ statement: 'Preserve uncertainty in types.' }),
      rule({ statement: 'Do not erase unknown states through type widening.' }),
    ];
    const c = runDiscoveryConformance(pair, CORPUS, { rules: [] }).checks.find((x) => x.id === 'NO_EXACT_DUPLICATES')!;
    expect(c.outcome).toBe('PASS');
    expect(c.caveat).toMatch(/same DECISION/);
  });

  it('catches a counterfactual that only restates the rule, and admits it cannot judge a real one', () => {
    const flat = runDiscoveryConformance([rule({ wouldBeAbsentIf: 'Open on a concrete obstacle.' })], CORPUS, { rules: [] });
    expect(flat.checks.find((x) => x.id === 'COUNTERFACTUAL_POPULATED')!.outcome).toBe('FAIL');
    const filled = runDiscoveryConformance([rule({ wouldBeAbsentIf: 'x' })], CORPUS, { rules: [] });
    const c = filled.checks.find((x) => x.id === 'COUNTERFACTUAL_POPULATED')!;
    expect(c.outcome).toBe('PASS');
    expect(c.caveat).toMatch(/string comparison/);
  });

  it('catches an empty required field', () => {
    const r = runDiscoveryConformance([rule({ appliesWhen: '   ' })], CORPUS, { rules: [] });
    expect(r.checks.find((x) => x.id === 'SCHEMA_CONFORMANCE')!.outcome).toBe('FAIL');
  });

  it('never calls a clean run qualified', () => {
    const r = runDiscoveryConformance([rule()], CORPUS, { rules: [rule()] });
    expect(r.allDeterministicChecksPassed).toBe(true);
    // The property is named for what it is. A field called `qualified` would be read as an answer to
    // the fourth question within a week of someone else touching this file.
    expect(Object.keys(r)).not.toContain('qualified');
    expect(r.unqualified).toEqual(UNQUALIFIED_BY_THIS_PACK);
    expect(r.unqualified.length).toBeGreaterThan(0);
  });
});

// ── THE FOURTH QUESTION STAYS SHUT ───────────────────────────────────────────────────────────
describe('semantic qualification cannot be reached from here', () => {
  const profile = (e: Partial<ModelCapabilityProfile['empirical']> = {}): ModelCapabilityProfile => ({
    providerAdapter: 'openai-compatible', backend: 'http://localhost:11434/v1', modelId: 'llama',
    static: { structuredOutput: ['FORCED_TOOL_CALL'], promptCaching: 'AUTOMATIC_PREFIX', reportsResolvedModel: true, contextWindow: null },
    empirical: { ...UNMEASURED, ...e },
  });

  it('never rounds a stage up', () => {
    expect(supportStage(profile())).toBe('ADAPTER_IMPLEMENTED');
    expect(supportStage(profile({ transport: 'TRANSPORT_VERIFIED' }))).toBe('MODEL_TRANSPORT_VERIFIED');
    expect(supportStage(profile({ transport: 'TRANSPORT_VERIFIED', structure: 'STRUCTURE_VERIFIED' }))).toBe('MODEL_STRUCTURE_VERIFIED');
  });

  it('does not let clean structure imply anchored evidence', () => {
    const p = profile({ transport: 'TRANSPORT_VERIFIED', structure: 'STRUCTURE_VERIFIED' });
    expect(supportStage(p)).not.toBe('MODEL_EVIDENCE_ANCHORED');
  });

  it('does not let a fully anchored model imply good taste', () => {
    const p = profile({ transport: 'TRANSPORT_VERIFIED', structure: 'STRUCTURE_VERIFIED',
      evidenceAnchoring: 'EVIDENCE_ANCHORED', authoritySafety: 'AUTHORITY_SAFE' });
    expect(supportStage(p)).toBe('MODEL_EVIDENCE_ANCHORED');
    expect(p.empirical.semanticDiscovery).toBe('SEMANTIC_DISCOVERY_UNQUALIFIED');
    expect(describeProfile(p)).toMatch(/has not been established/);
  });

  it('THROWS if anything tries to award it without human labels', () => {
    expect(() => { assertSemanticQualification('SEMANTIC_DISCOVERY_QUALIFIED', null); }).toThrow(/human-authoritative/);
    expect(() => { assertSemanticQualification('SEMANTIC_DISCOVERY_QUALIFIED', 'labels-v1'); }).not.toThrow();
    expect(() => { assertSemanticQualification('SEMANTIC_DISCOVERY_UNQUALIFIED', null); }).not.toThrow();
  });

  it('keeps runtime fidelity unqualified, because no absolute anchor exists', () => {
    expect(UNMEASURED.runtimeFidelity).toBe('RUNTIME_UNQUALIFIED');
  });
});

// ── THE SEAM IS USED, NOT MERELY PRESENT ─────────────────────────────────────────────────────
describe('no command reaches past the provider factory', () => {
  const files = readdirSync('cli/commands').filter((f) => f.endsWith('.ts')).map((f) => join('cli/commands', f));

  it('constructs no concrete provider outside cli/runtime.ts', () => {
    // The defect this pins: an InferenceClient interface enforced by test, a factory nobody used, and
    // five commands each newing up one vendor. The abstraction existed and could not be reached.
    const offenders = files.filter((f) => /new\s+(Anthropic|OpenAICompatible)InferenceClient/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('serves an invocation through the target runtime and discovers through the discovery one', () => {
    expect(readFileSync('cli/commands/invoke.ts', 'utf8')).toMatch(/clientAndBinding\('target'\)/);
    expect(readFileSync('cli/runtime.ts', 'utf8')).toMatch(/export type Role = 'discovery' \| 'target'/);
  });

  it('checks the binding before spending anything on the call', () => {
    const src = readFileSync('cli/commands/invoke.ts', 'utf8');
    expect(src.indexOf('compareBindings')).toBeLessThan(src.indexOf('await runOnce'));
  });
});

// ── AGNOSTIC MEANS EVERY BACKEND, NOT EVERY BACKEND THAT BEHAVES LIKE THE ONE WE SHIP ─────────
//
// `core/` names no vendor and the request maps onto both protocols without loss, and both were true
// while two hardcoded decisions made a large part of the fleet unusable: `strict: true` went out on
// every request, and one vendor's rate card was the only one that existed. A backend that rejects an
// unrecognised argument — llama.cpp, older vLLM, several routed models — got an HTTP 400 with no
// remedy named, and every non-Anthropic backend priced as UNKNOWN with no way to supply a rate.
describe('a backend that is not the one whose SDK ships', () => {
  const OK = {
    model: 'served-model',
    choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'emit', arguments: '{"a":1}' } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
  const REQ = { stableBlock: 's', variableBlock: 'v', userMessage: 'u', toolName: 'emit',
    toolDescription: 'd', schema: { type: 'object' }, maxTokens: 100 };

  // Restored after each test: a stub left in place leaks into every later suite in this file.
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const wire = (payload: unknown, ok = true, text = ''): { body: () => Record<string, unknown> } => {
    let seen: Record<string, unknown> = {};
    globalThis.fetch = (async (_u: string, init: { body: string }) => {
      seen = JSON.parse(init.body) as Record<string, unknown>;
      return { ok, status: ok ? 200 : 400, json: async () => payload, text: async () => text } as unknown as Response;
    }) as unknown as typeof fetch;
    return { body: () => seen };
  };
  const at = (o: Record<string, unknown> = {}): OpenAICompatibleInferenceClient =>
    new OpenAICompatibleInferenceClient({ modelId: 'vendor/m', baseUrl: 'https://api.example.com/v1', apiKey: 'k', ...o });

  it('sends `strict` by default, because it is the strongest guarantee the protocol offers', async () => {
    const w = wire(OK);
    await at().complete(REQ);
    const fn = (w.body().tools as { function: { strict?: boolean } }[])[0].function;
    expect(fn.strict).toBe(true);
  });

  it('and omits it entirely when asked to, rather than sending `strict: false`', async () => {
    // `strict: false` is still an unrecognised argument to a backend that has never heard of it.
    const w = wire(OK);
    await at({ strictSchema: false }).complete(REQ);
    const fn = (w.body().tools as { function: Record<string, unknown> }[])[0].function;
    expect('strict' in fn, 'the key must be absent, not present-and-false').toBe(false);
  });

  it('a backend that rejects `strict` is told about, and told what to pass', async () => {
    wire({}, false, '{"error":{"message":"Unrecognized request argument supplied: strict"}}');
    await expect(at().complete(REQ)).rejects.toThrow(/--strict-schema off/);
    // and it does not pretend the backend is broken
    await expect(at().complete(REQ)).rejects.toThrow(/does not accept `strict`/);
  });

  it('POLARITY: with the flag off, the same backend goes through', async () => {
    wire(OK);
    const r = await at({ strictSchema: false }).complete(REQ);
    expect(r.json).toEqual({ a: 1 });
  });

  it('200 with no choices is a backend fault, not a missing capability', async () => {
    // It used to be reported as "does not support forced function calling" with advice to switch
    // structured-output mode — a remedy that cannot help, for a diagnosis that was not established.
    wire({ model: 'm', choices: [] });
    await expect(at().complete(REQ)).rejects.toThrow(/no choices/);
    await expect(at().complete(REQ)).rejects.not.toThrow(/does not support forced function calling/);
  });

  it('a rate the user supplies meters the call, on a backend no table covers', async () => {
    wire(OK);
    const r = await at({ pricing: { inputPerM: 3, outputPerM: 15 } }).complete(REQ);
    expect(r.cost.basis).toBe('API_METERED');
    expect(r.cost.billingUsd).toBeCloseTo((100 * 3 + 50 * 15) / 1e6, 9);
  });

  it('and without one it stays honestly UNKNOWN rather than guessing a neighbour', async () => {
    wire(OK);
    const r = await at().complete(REQ);
    expect(r.cost).toEqual({ basis: 'UNKNOWN_PRICING', billingUsd: null });
  });

  it('the request carries nothing vendor-specific', async () => {
    const w = wire(OK);
    await at().complete(REQ);
    const body = w.body();
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'tool_choice', 'tools']);
    expect(JSON.stringify(body)).not.toMatch(/anthropic|claude|openai\.com/i);
  });

  it('OpenRouter is a named backend, so a user gives a name rather than a URL', () => {
    expect(BACKEND_PRESETS.openrouter?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(BACKEND_PRESETS.openrouter?.tokenLimitParam).toBe('max_tokens');
    // and the fleet a reader would expect to find
    for (const b of ['openai', 'groq', 'together', 'deepseek', 'fireworks', 'ollama', 'vllm', 'llama-cpp']) {
      expect(BACKEND_PRESETS[b], `${b} is not a known backend`).toBeTruthy();
    }
  });
});

// ── FORCED TOOL CHOICE, WHERE THE MODEL STILL ACCEPTS IT ─────────────────────────────────────────
describe('a model that refuses forced tool choice is asked in words, and a model that accepts it is not', () => {
  const answer = (model: string) => JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model, stop_reason: 'tool_use', stop_sequence: null,
    content: [{ type: 'tool_use', id: 'tu_1', name: 'emit_answer', input: { ok: true } }], usage: { input_tokens: 5, output_tokens: 5 } });
  const seen: { model: string; choice: string; asked: boolean }[] = [];
  let server: Server; let base = '';
  const saved = process.env.ANTHROPIC_BASE_URL;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', () => {
        const b = JSON.parse(body) as { model: string; tool_choice: { type: string }; messages: { content: string }[] };
        seen.push({ model: b.model, choice: b.tool_choice.type, asked: b.messages[0].content.includes('Answer by calling the emit_answer tool') });
        res.setHeader('content-type', 'application/json');
        const t = (JSON.parse(body) as { temperature?: number }).temperature;
        if (b.model === 'strict-model' && (b.tool_choice.type === 'tool' || t !== undefined)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: b.tool_choice.type === 'tool'
            ? 'tool_choice: type "tool" and "any" are not supported for this model.' : '`temperature` is deprecated for this model.' } }));
          return;
        }
        if (b.model === 'stubborn-model') {
          res.statusCode = 400;
          res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }));
          return;
        }
        if (b.model === 'new-model' && b.tool_choice.type === 'tool') {
          res.statusCode = 400;
          res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }));
          return;
        }
        res.end(answer(b.model));
      });
    });
    await new Promise<void>((ok) => { server.listen(0, '127.0.0.1', () => { ok(); }); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    process.env.ANTHROPIC_BASE_URL = base;
  });
  afterAll(() => { server.close(); if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = saved; });

  const ask = (model: string) => new AnthropicInferenceClient(model, 'sk-test', null).complete({
    stableBlock: 's', variableBlock: '', userMessage: 'q', toolName: 'emit_answer', toolDescription: 'd',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, maxTokens: 100 });

  it('retries once with auto and an instruction, remembers the model, and still returns the tool input', async () => {
    expect((await ask('new-model')).json).toEqual({ ok: true });
    expect((await ask('new-model')).json).toEqual({ ok: true });
    expect(seen.filter((x) => x.model === 'new-model').map((x) => `${x.choice}${x.asked ? '+asked' : ''}`)).toEqual(['tool', 'auto+asked', 'auto+asked']);
    expect(refusesForcedChoice(new Error('tool_choice not supported'))).toBe(false);
  });
  it('a model that refuses forced choice AND temperature, one 400 at a time, still answers: an instrument at temperature 0', async () => {
    const r = await new AnthropicInferenceClient('strict-model', 'sk-test', null).complete({
      stableBlock: 's', variableBlock: '', userMessage: 'q', toolName: 'emit_answer', toolDescription: 'd',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, maxTokens: 100, temperature: 0 });
    expect(r.json).toEqual({ ok: true });
    expect(r.temperatureSent).toBeNull();
    expect(seen.filter((x) => x.model === 'strict-model').map((x) => x.choice)).toEqual(['tool', 'auto', 'auto']);
  });
  it('a model that refuses forced choice even when it is not forced fails after one retry: no loop of paid calls', async () => {
    await expect(new AnthropicInferenceClient('stubborn-model', 'sk-test', null).complete({
      stableBlock: 's', variableBlock: '', userMessage: 'q', toolName: 'emit_answer', toolDescription: 'd',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, maxTokens: 100 })).rejects.toThrow();
    expect(seen.filter((x) => x.model === 'stubborn-model')).toHaveLength(2);
  });
  it('a model that accepts forced choice keeps it: the measured instruments do not change', async () => {
    await ask('claude-haiku-4-5');
    expect(seen.filter((x) => x.model === 'claude-haiku-4-5').map((x) => x.choice)).toEqual(['tool']);
  });
});
