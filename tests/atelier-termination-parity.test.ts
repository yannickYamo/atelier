// PARITY: the real adapter, one invariant.
//
// This test exists because a study reported behaviour that never happened. The provider said
// `stop_reason: "max_tokens"` on 54 of 144 generations and the interface threw the fact away, so an
// observer read the fragments as choices. Every unit test in the repo passed throughout, because
// they injected a fake client that HANDED the study runner a validity — the one value that was wrong.
//
// So this drives the ANTHROPIC ADAPTER ITSELF, intercepted at the SDK boundary, exactly where the
// empty-cache-block defect was found. A fake InferenceClient would prove nothing here: the bug lived
// in the adapter, and every test that replaced the adapter was blind to it by construction. (The
// adapter's typed termination stays.)
import { describe, it, expect } from 'vitest';
import { AnthropicInferenceClient, anthropicTermination } from '../providers/anthropic.js';
import { openAiTermination } from '../providers/openai-compatible.js';
import { GenerationIncomplete } from '../core/inference/client.js';

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
