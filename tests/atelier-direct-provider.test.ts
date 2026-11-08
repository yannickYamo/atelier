// THE DIRECT WRITER'S CALL ON THE ANTHROPIC ADAPTER, intercepted at the SDK boundary (as the termination parity test
// does): a piece asked for as prose is sent with no tool and no thinking field, the effort asked, the pieces cached;
// the reply's text is the piece; a model that refuses the effort setting is asked again once without it; a cut-off
// piece is a typed termination, never a delivered fragment.
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicInferenceClient } from '../providers/anthropic.js';
import { GenerationIncomplete } from '../core/inference/client.js';

const REQ = { stableBlock: 'the pieces', variableBlock: 'the task', userMessage: 'Write the piece now.', toolName: 'emit_piece', toolDescription: 'Write the piece.',
  schema: { type: 'object', properties: { piece: { type: 'string' } } }, maxTokens: 32000, plain: { effort: 'high' as const } };
const done = (text: string, stop = 'end_turn') => ({ stop_reason: stop, model: 'claude-test', usage: { input_tokens: 10, output_tokens: 20 }, content: [{ type: 'text', text }] });

const adapter = (model: string, answers: (() => unknown)[]): { c: AnthropicInferenceClient; sent: Record<string, unknown>[] } => {
  const c = new AnthropicInferenceClient(model, 'sk-ant-test-key');
  const sent: Record<string, unknown>[] = []; let i = 0;
  (c as unknown as { client: unknown }).client = { messages: {
    create: () => { throw new Error('a prose call must stream, not create'); },
    stream: (params: Record<string, unknown>) => { sent.push(params); const a = answers[Math.min(i++, answers.length - 1)]; return { finalMessage: async () => a() }; } } };
  return { c, sent };
};
const refusal = (): never => { throw new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'output_config.effort: not supported on this model' } }, 'effort is not supported', new Headers()); };

describe('a piece asked for as prose', () => {
  it('is sent with no tool and no thinking field, the effort asked and the pieces cached; its text is the piece', async () => {
    const { c, sent } = adapter('claude-plain-a', [() => done('# The piece\n\nBody.')]);
    const r = await c.complete(REQ);
    expect((r.json as { piece: string }).piece).toBe('# The piece\n\nBody.');
    expect(sent[0]).not.toHaveProperty('tools'); expect(sent[0]).not.toHaveProperty('tool_choice'); expect(sent[0]).not.toHaveProperty('thinking');
    expect(sent[0].output_config).toEqual({ effort: 'high' });
    expect(sent[0].max_tokens).toBe(32000);
    expect(sent[0].system).toEqual([{ type: 'text', text: 'the pieces', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'the task' }]);
  });
  it('a model that refuses the effort setting is asked once more without it, and remembered', async () => {
    const { c, sent } = adapter('claude-plain-b', [refusal, () => done('A piece.')]);
    expect((((await c.complete(REQ)).json) as { piece: string }).piece).toBe('A piece.');
    expect(sent.length).toBe(2); expect(sent[1]).not.toHaveProperty('output_config');
    await c.complete(REQ);
    expect(sent[2]).not.toHaveProperty('output_config');
  });
  it('a refusal for anything else is not retried', async () => {
    const { c, sent } = adapter('claude-plain-c', [() => { throw new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long' } }, 'prompt is too long', new Headers()); }]);
    await expect(c.complete(REQ)).rejects.toThrow();
    expect(sent.length).toBe(1);
  });
  it('a piece cut off at the token limit is a typed termination, not a fragment', async () => {
    const { c } = adapter('claude-plain-d', [() => done('# Half a pie', 'max_tokens')]);
    await expect(c.complete(REQ)).rejects.toThrow(GenerationIncomplete);
  });
});
