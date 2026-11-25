// tests/atelier-no-code-split.test.ts — ON THE DEFAULT RUN A LONG PARAGRAPH IS NEVER CUT BY CODE.
//
// The defect (25 Nov): the fix that needs no model split a paragraph over the author's length at the
// nearest sentence, so a list was broken across two paragraphs ("Our ICP. Our positioning." / "Our tone."; "Their
// accounts. Their signals." / "Their pipeline."). Run on the drafts written without it, it made exactly those cuts.
// The direct writer never refuses a piece, so a paragraph rule left broken there is shown, never forced by a cut.
// Strict delivery on the compiled path keeps the split: there a broken required rule refuses the answer.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { refineToStandard } from '../core/loop/run-repair.js';

const v = { standardVersionHash: 's', requirements: [{ requirementId: 'm2', statement: 'Keep paragraphs to at most 4 sentences.', materiality: 'REQUIRED',
  authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } } }] } as never;
const text = 'We tried it for a quarter. Our ICP changed. Our positioning changed. Our tone changed. Nobody updated the prompts. So they drifted.';
const noCalls = { complete: () => Promise.reject(new Error('no call may be made')) } as never;
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 0, calls: 0 });

describe('a long paragraph on the default run', () => {
  it('is left whole when the run asks for no split: no paragraph break is added', async () => {
    const r = await refineToStandard(noCalls, budget(), 's', v, text, 2, { guardClaims: false, splitParagraphs: false });
    expect(r.output).toBe(text);
  });
  it('is still split where nothing asks otherwise (the compiled path, strict delivery)', async () => {
    const r = await refineToStandard(noCalls, budget(), 's', v, text, 2, { guardClaims: false });
    expect(r.output.split('\n\n')).toHaveLength(2);
  });
});
