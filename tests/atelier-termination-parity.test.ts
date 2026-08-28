// PARITY: the real adapter, the real runner, one invariant.
//
// This test exists because a study reported behaviour that never happened. The provider said
// `stop_reason: "max_tokens"` on 54 of 144 generations and the interface threw the fact away, so an
// observer read the fragments as choices. Every unit test in the repo passed throughout, because
// they injected a fake `RunSkill` that HANDED the runner a validity — the one value that was wrong.
//
// So this drives the ANTHROPIC ADAPTER ITSELF, intercepted at the SDK boundary, exactly where the
// empty-cache-block defect was found. A fake InferenceClient would prove nothing here: the bug lived
// in the adapter, and every test that replaced the adapter was blind to it by construction.
import { describe, it, expect } from 'vitest';
import { AnthropicInferenceClient, anthropicTermination } from '../providers/anthropic.js';
import { openAiTermination } from '../providers/openai-compatible.js';
import { GenerationIncomplete, type Budget, type InferenceClient } from '../core/inference/client.js';
import { runCase, validityFrom, validityFromError } from '../core/contract/run.js';
import type { ContractTestCase } from '../core/contract/suite.js';

const REQ = {
  stableBlock: 'a skill', variableBlock: '', userMessage: 'do the work',
  toolName: 'emit_output', toolDescription: 'produce it',
  schema: { type: 'object', properties: { output: { type: 'string' } } }, maxTokens: 64,
};

/** Replace only the SDK call, so serialization, block assembly and result mapping all really run. */
const adapterReturning = (res: unknown): AnthropicInferenceClient => {
  const c = new AnthropicInferenceClient('claude-test', 'sk-ant-test-key');
  (c as unknown as { client: { messages: { create: () => Promise<unknown> } } }).client = {
    messages: { create: () => Promise.resolve(res) },
  };
  return c;
};

const usage = { input_tokens: 10, output_tokens: 8000 };

const aCase = (o: Partial<ContractTestCase> = {}): ContractTestCase => ({
  caseId: 'c1', obligationId: 'o1', obligationKind: 'SHOULD_FIRE', requirementIds: ['r1'],
  task: 'a multi-step task', expectation: 'the answer numbers its steps',
  observation: 'UNQUALIFIED', provenance: 'MACHINE_GENERATED' as ContractTestCase['provenance'], ...o,
});

const budget = (): Budget => ({ spentUsd: 0, capUsd: 10 });

describe('a truncated generation cannot reach a behavioural observer', () => {
  it('the ADAPTER turns the provider limit into a typed termination, not a schema complaint', async () => {
    const c = adapterReturning({ stop_reason: 'max_tokens', content: [], usage, model: 'claude-test' });
    // Before this change the missing tool_use block was reported as "the schema was not satisfied" —
    // the model's fault, on a call it was never allowed to finish.
    await expect(c.complete(REQ)).rejects.toThrow(GenerationIncomplete);
    await expect(c.complete(REQ)).rejects.toThrow(/stopped at the 64-token limit/);
    const err = await c.complete(REQ).catch((e: unknown) => e as GenerationIncomplete);
    expect(err.termination).toEqual({ kind: 'MAX_TOKENS' });
    expect(err.outputTokens).toBe(8000);
  });

  it('and the RUNNER records it as EXECUTION_INVALID without calling the reader', async () => {
    let readerCalls = 0;
    const reader: InferenceClient = { complete: async () => { readerCalls += 1; throw new Error('the reader must not run'); } };
    const c = adapterReturning({ stop_reason: 'max_tokens', content: [], usage, model: 'claude-test' });

    const outcome = await runCase(reader, budget(), aCase(), async () => {
      try {
        const r = await c.complete(REQ);
        return { output: (r.json as { output?: string }).output ?? '', validity: validityFrom(r.termination, '') };
      } catch (e) { return { output: '', validity: validityFromError(e) }; }
    });

    expect(outcome.validity).toBe('TRUNCATED');
    expect(outcome.verdict).toBe('EXECUTION_INVALID');
    // THE INVARIANT. Not "the verdict was invalid" — that a semantic instrument never saw the fragment.
    expect(readerCalls).toBe(0);
  });

  it('POLARITY: a generation that FINISHES is complete, and the reader does run', async () => {
    let readerCalls = 0;
    const reader: InferenceClient = {
      complete: async () => { readerCalls += 1; return { json: { holds: 'YES', evidence: '1. first' },
        modelId: 'm', inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1,
        cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0, termination: { kind: 'COMPLETE' as const } }; },
    };
    const c = adapterReturning({
      stop_reason: 'tool_use', model: 'claude-test', usage: { input_tokens: 10, output_tokens: 40 },
      content: [{ type: 'tool_use', name: 'emit_output', input: { output: '1. first\n2. second' } }],
    });

    const r = await c.complete(REQ);
    expect(r.termination).toEqual({ kind: 'COMPLETE' });

    const outcome = await runCase(reader, budget(), aCase(), async () => {
      const x = await c.complete(REQ);
      const text = (x.json as { output?: string }).output ?? '';
      return { output: text, validity: validityFrom(x.termination, text) };
    });
    expect(outcome.validity).toBe('COMPLETE');
    expect(outcome.verdict).not.toBe('EXECUTION_INVALID');
    // Without this the first test passes for a system that never calls the reader at all.
    expect(readerCalls).toBe(1);
  });

  it('a FINISHED call that returned nothing is EMPTY, not TRUNCATED — the two are different facts', () => {
    expect(validityFrom({ kind: 'COMPLETE' }, '   ')).toBe('EMPTY');
    expect(validityFrom({ kind: 'COMPLETE' }, 'an answer')).toBe('COMPLETE');
    expect(validityFrom({ kind: 'MAX_TOKENS' }, 'a long fluent fragment that trims to something')).toBe('TRUNCATED');
  });

  it('validityFromError refuses to swallow anything that is not an incomplete generation', () => {
    // A runner that mapped every error to EXECUTION_INVALID would turn a bad API key into a wall of
    // rows and call it data.
    expect(() => validityFromError(new Error('401 unauthorized'))).toThrow(/401/);
  });
});

describe('both provider vocabularies map into the one core understands', () => {
  it('a forced tool call ending in a tool call is COMPLETE, not its own kind', () => {
    // Giving tool_use its own kind would make EVERY successful call non-COMPLETE, because every
    // request this system makes forces one.
    expect(anthropicTermination('tool_use')).toEqual({ kind: 'COMPLETE' });
    expect(openAiTermination('tool_calls')).toEqual({ kind: 'COMPLETE' });
  });

  it('each provider\'s limit value maps to MAX_TOKENS despite different spellings', () => {
    expect(anthropicTermination('max_tokens')).toEqual({ kind: 'MAX_TOKENS' });
    expect(openAiTermination('length')).toEqual({ kind: 'MAX_TOKENS' });
  });

  it('an unknown value is kept verbatim rather than flattened into COMPLETE', () => {
    // Defaulting an unrecognised stop reason to COMPLETE is how a new provider state would silently
    // become behavioural evidence.
    expect(anthropicTermination('some_future_reason')).toEqual({ kind: 'OTHER', providerValue: 'some_future_reason' });
    expect(openAiTermination(null)).toEqual({ kind: 'OTHER', providerValue: 'null' });
    expect(anthropicTermination('some_future_reason').kind).not.toBe('COMPLETE');
  });
});
