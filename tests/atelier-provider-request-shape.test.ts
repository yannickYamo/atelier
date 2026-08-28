// tests/atelier-provider-request-shape.test.ts — THE REQUEST A PROVIDER ACTUALLY BUILDS.
//
// Every other test in this repository replaces the provider, which is what makes them fast and
// deterministic and is also why a whole arm shipped unrunnable. `requestFor('BARE', null, ctx)`
// returns an empty `stableBlock` by design — that is the condition with no Atelier-derived carrier —
// and the Anthropic adapter wrapped it in a `cache_control` block regardless. The API refuses that:
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
import { requestFor, type ArmContext } from '../core/contract/arm.js';

const ctx: ArmContext = {
  task: 'write the thing', maxTokens: 100, toolName: 'emit_output',
  toolDescription: 'd', schema: { type: 'object', properties: {} },
};

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
    const sent = await capture(requestFor('BARE', null, ctx));
    for (const block of sent.system) {
      expect(block.text, 'an empty text block reached the provider').not.toBe('');
    }
    expect(sent.system.some((b) => 'cache_control' in b && b.text === ''),
      'cache_control was set on an empty block; the API refuses this').toBe(false);
  });

  it('still caches the stable block when there is one', async () => {
    // The ~9x saving depends on this, so omitting the empty case must not omit the useful case.
    const sent = await capture(requestFor('INITIAL', 'COMPILED SKILL BYTES', ctx));
    const cached = sent.system.filter((b) => 'cache_control' in b);
    expect(cached).toHaveLength(1);
    expect(cached[0].text).toBe('COMPILED SKILL BYTES');
  });

  it('carries the variable block uncached, after the stable one', async () => {
    const sent = await capture({
      ...requestFor('INITIAL', 'STABLE', ctx), variableBlock: 'VARIABLE',
    });
    expect(sent.system.map((b) => b.text)).toEqual(['STABLE', 'VARIABLE']);
    expect('cache_control' in sent.system[1]).toBe(false);
  });

  it('a bare request with a variable block still sends the variable block', async () => {
    const sent = await capture({ ...requestFor('BARE', null, ctx), variableBlock: 'VARIABLE' });
    expect(sent.system.map((b) => b.text)).toEqual(['VARIABLE']);
  });
});
