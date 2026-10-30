// tests/atelier-provider-request-shape.test.ts — THE REQUEST A PROVIDER ACTUALLY BUILDS.
//
// Every other test in this repository replaces the provider, which is what makes them fast and
// deterministic and is also why a whole arm shipped unrunnable. A bare arm
// once sent an empty `stableBlock` by design — that is the condition with no
// Atelier-derived carrier — and the Anthropic adapter wrapped it in a `cache_control` block regardless.
// The API refuses that:
//
//     system.0: cache_control cannot be set for empty text blocks
//
// So the control arm failed on its first real call, having passed every test that existed.
//
// This asserts the SHAPE the adapter hands the SDK, by intercepting it, without a network call and
// without a key. It is the narrow band between "our types are consistent" and "a provider accepted
// it", and it is where that defect lived.

import { describe, it, expect } from 'vitest';
import { AnthropicInferenceClient } from '../providers/anthropic.js';
import type { InferenceRequest } from '../core/inference/client.js';

/** The request as every arm built it: only the stable block differs, and the bare arm's is empty. */
const requestWith = (stableBlock: string): InferenceRequest => ({
  stableBlock, variableBlock: '', userMessage: 'write the thing', toolName: 'emit_output',
  toolDescription: 'd', schema: { type: 'object', properties: {} }, maxTokens: 100,
});

/** Build a client and capture the payload its next call would send. */
const capture = async (req: Parameters<AnthropicInferenceClient['complete']>[0]): Promise<{
  system: { type: string; text: string; cache_control?: unknown }[];
}> => {
  const client = new AnthropicInferenceClient('claude-opus-5', 'sk-test-not-used');
  let sent: { system: { type: string; text: string; cache_control?: unknown }[] } | null = null;
  // The SDK object the adapter holds. Replacing `messages.create` intercepts the payload without a
  // network call, which is the only way to see what would actually go out.
  (client as unknown as { client: { messages: { create: unknown } } }).client.messages.create =
    (body: typeof sent): Promise<unknown> => {
      sent = body;
      return Promise.resolve({
        content: [{ type: 'tool_use', input: {} }], model: 'claude-opus-5', stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    };
  await client.complete(req);
  if (!sent) throw new Error('the adapter sent nothing');
  return sent;
};

describe('the system block a provider is handed', () => {
  it('omits an empty stable block rather than sending one', async () => {
    // THE BARE ARM. The API rejects cache_control on an empty text block, so sending it makes the
    // control condition unrunnable — which is what shipped.
    const sent = await capture(requestWith(''));
    for (const block of sent.system) {
      expect(block.text, 'an empty text block reached the provider').not.toBe('');
    }
    expect(sent.system.some((b) => 'cache_control' in b && b.text === ''),
      'cache_control was set on an empty block; the API refuses this').toBe(false);
  });

  it('still caches the stable block when there is one', async () => {
    // The ~9x saving depends on this, so omitting the empty case must not omit the useful case.
    const sent = await capture(requestWith('COMPILED SKILL BYTES'));
    const cached = sent.system.filter((b) => 'cache_control' in b);
    expect(cached).toHaveLength(1);
    expect(cached[0].text).toBe('COMPILED SKILL BYTES');
  });

  it('carries the variable block uncached, after the stable one', async () => {
    const sent = await capture({ ...requestWith('STABLE'), variableBlock: 'VARIABLE' });
    expect(sent.system.map((b) => b.text)).toEqual(['STABLE', 'VARIABLE']);
    expect('cache_control' in sent.system[1]).toBe(false);
  });

  it('caches the variable block too when the caller says it repeats across a run, and the stable one still', async () => {
    // The claim reader reads every candidate of a run against the same material: nine calls carried it uncached.
    const sent = await capture({ ...requestWith('STABLE'), variableBlock: 'MATERIAL', cacheVariableBlock: true });
    expect(sent.system.map((b) => b.text)).toEqual(['STABLE', 'MATERIAL']);
    expect(sent.system.filter((b) => 'cache_control' in b)).toHaveLength(2);
  });

  it('a bare request with a variable block still sends the variable block', async () => {
    const sent = await capture({ ...requestWith(''), variableBlock: 'VARIABLE' });
    expect(sent.system.map((b) => b.text)).toEqual(['VARIABLE']);
  });
});
