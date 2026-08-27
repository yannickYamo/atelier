// atelier/providers/anthropic.ts — ONE implementation of InferenceClient. Not core, not an adapter.
//
// Deliberately outside core/: this file knows a vendor, and core must not. Deliberately outside
// adapters/: a host is where a skill RUNS, a provider is what INFERS — conflating them is how a system
// ends up unable to change model without changing harness.
//
// The stable/variable split from the interface is honoured here, which is where the ~9x saving lives:
// the instructions are marked cache_control and the corpus is not.

import Anthropic from '@anthropic-ai/sdk';
import type { InferenceClient, InferenceRequest, InferenceResult } from '../core/inference/client.js';
import { budgetUsd } from '../core/inference/client.js';
import { ANTHROPIC_PRICING, costOf, priceFor, type Pricing } from './pricing.js';

export type { Pricing } from './pricing.js';
export class AnthropicInferenceClient implements InferenceClient {
  private readonly client: Anthropic;
  constructor(private readonly modelId: string, apiKey?: string, private readonly pricing: Pricing | null = priceFor(ANTHROPIC_PRICING, modelId)) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set.\n'
        + '  export ANTHROPIC_API_KEY=sk-...\n'
        + 'Atelier needs an inference provider for the discovery step. Your corpus, standard and outputs '
        + 'stay on this machine; nothing is sent anywhere except that one call.',
      );
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async complete(req: InferenceRequest): Promise<InferenceResult> {
    const res = await this.client.messages.create({
      model: this.modelId,
      max_tokens: req.maxTokens,
      // STABLE first and cached; VARIABLE second and not. Reversing these still works and costs ~9x.
      system: [
        { type: 'text', text: req.stableBlock, cache_control: { type: 'ephemeral' } },
        ...(req.variableBlock ? [{ type: 'text' as const, text: req.variableBlock }] : []),
      ],
      messages: [{ role: 'user', content: req.userMessage }],
      tools: [{ name: req.toolName, description: req.toolDescription, input_schema: req.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: req.toolName },
    });

    const block = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
    if (!block) throw new Error(`inference returned no tool_use block (stop_reason: ${res.stop_reason}). The schema was not satisfied.`);

    const u = res.usage as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    const usage = {
      inputTokens: u.input_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0, outputTokens: u.output_tokens,
    };
    const cost = costOf(this.pricing, usage, false);
    // `res.model` and not `this.modelId`: an alias resolves server-side, and the RuntimeBinding needs
    // to record what answered rather than what we asked for.
    // NULL, AND IT IS A PROTOCOL FACT RATHER THAN AN OMISSION. The Messages API does not expose
    // per-token logprobs, so an instrument that reads a distribution cannot run on this adapter. It
    // must say which backend it needs instead of quietly producing a weaker reading here.
    return { json: block.input, modelId: res.model, ...usage, cost, costUsd: budgetUsd(cost), logprobs: null };
  }
}
