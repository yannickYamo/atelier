// GAP AUDIT 2026-10-22, M11: the provider adapter, without a network call. Calls side by side that are all refused
// for `disabled` are each sent again with `between_tools`; a reply under `auto` that ends with no tool call is asked
// for once more; the proposer is given room for a large corpus.
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicInferenceClient } from '../providers/anthropic.js';

interface Body { thinking?: { type: string }; tool_choice: { type: string } }
const ok = (): unknown => ({ content: [{ type: 'tool_use', input: { a: 1 } }], model: 'm', stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } });
const refused = (message: string): Error => new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message } }, message, new Headers());
const client = (model: string, create: (b: Body) => Promise<unknown>): AnthropicInferenceClient => {
  const c = new AnthropicInferenceClient(model, 'sk-test-not-used');
  (c as unknown as { client: { messages: { create: unknown } } }).client.messages.create = create;
  return c;
};
const req = { stableBlock: '', variableBlock: '', userMessage: 'go', toolName: 'emit_x', toolDescription: 'd', schema: { type: 'object', properties: {} }, maxTokens: 100 };

describe('M11: the provider adapter', () => {
  it('calls side by side, all refused for thinking "disabled": every one is sent again with between_tools', async () => {
    const c = client('claude-test-between', async (b) => {
      await new Promise((r) => setTimeout(r, 5));
      if (b.thinking?.type === 'disabled') throw refused('thinking.type: send between_tools instead of disabled for this model');
      return ok();
    });
    const out = await Promise.allSettled([c.complete(req), c.complete(req), c.complete(req)]);
    expect(out.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  });
  it('under tool_choice auto, a reply that ends with no tool call is asked for once more', async () => {
    let n = 0;
    const c = client('claude-test-auto', (b) => {
      if (b.tool_choice.type === 'tool') return Promise.reject(refused('tool_choice of type tool is not supported with this model'));
      n += 1;
      return Promise.resolve(n === 1 ? { content: [{ type: 'text', text: 'Here you go.' }], model: 'm', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } : ok());
    });
    await expect(c.complete(req)).resolves.toMatchObject({ json: { a: 1 } });
    expect(n).toBe(2);
  });
});

import { proposeRules } from '../core/discovery/propose.js';

describe('M11: the proposer has room for the corpus it reads', () => {
  const asked = async (n: number): Promise<number> => {
    let max = 0;
    const fake = { complete: (r: { maxTokens: number }) => { max = r.maxTokens; return Promise.resolve({ json: { rules: [] }, cost: { usd: 0 } }) as never; } };
    await proposeRules(fake, { spentUsd: 0, capUsd: 10 }, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, text: 'A post.' })), 0.01);
    return max;
  };
  it('a 17-post corpus is not held to the 4,000 tokens a small one gets', async () => {
    expect(await asked(3)).toBe(4000);
    expect(await asked(17)).toBeGreaterThan(4000);
  });
});
