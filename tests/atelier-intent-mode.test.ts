// WHAT THE SKILL IS FOR IS READ FROM THE SENTENCE. Four word lists decided it; the reading says which of producing,
// guarding or answering the sentence asks for, with a quote from it; the lists are the floor; an empty sentence is
// decided by code.
import { describe, it, expect } from 'vitest';
import { INTENT_MODE } from '../core/observers/intent-mode.js';
import { readContext } from '../core/inference/reading.js';
import type { InferenceClient } from '../core/inference/client.js';

const scripted = (answer: unknown): InferenceClient => ({ complete: async () => ({ json: answer, text: '', cost: { usd: 0 } }) as never });
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 5 });

describe('intent mode', () => {
  it('an empty sentence is decided by code: producing, with no call', async () => {
    const d = await readContext(INTENT_MODE, { intent: '  ' }, scripted({ mode: 'GUARD', quote: '' }), 'm', budget());
    expect(d).toMatchObject({ value: { mode: 'GENERATE' }, by: 'code' });
  });
  it('the reading counts with a mode from the enum and a quote from the sentence, and overrules the floor', async () => {
    const d = await readContext(INTENT_MODE, { intent: 'write a support article' }, scripted({ mode: 'GENERATE', quote: 'write a support article' }), 'm', budget());
    expect(d).toMatchObject({ value: { mode: 'GENERATE' }, by: 'model' });
    const e = await readContext(INTENT_MODE, { intent: 'help people who message us about billing' }, scripted({ mode: 'RESPOND', quote: 'help people who message us' }), 'm', budget());
    expect(e).toMatchObject({ value: { mode: 'RESPOND' }, by: 'model' });
    expect(e.value.why).toMatch(/answering people/);
  });
  it('a quote not in the sentence, or a mode outside the enum, is no reading: the floor decides and says why', async () => {
    const d = await readContext(INTENT_MODE, { intent: 'reply to support tickets like our best agent' }, scripted({ mode: 'GENERATE', quote: 'write posts' }), 'm', budget());
    expect(d).toMatchObject({ value: { mode: 'RESPOND' }, by: 'floor' });
    expect(d.why).toMatch(/could not be grounded/);
    expect((await readContext(INTENT_MODE, { intent: 'review drafts for tone' }, scripted({ mode: 'JUDGE', quote: 'review drafts' }), 'm', budget())).value.mode).toBe('GUARD');
  });
  it('no model: the word lists decide, said as the floor', async () => {
    const d = await readContext(INTENT_MODE, { intent: 'draft replies to customer emails' }, null, null, budget());
    expect(d).toMatchObject({ value: { mode: 'RESPOND' }, by: 'floor', why: 'no model set up' });
  });
});
