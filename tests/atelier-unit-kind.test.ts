// AN EXAMPLE WHOSE MAIN JOB IS TO SETTLE A CHOICE IS A DECISION MEMO, READ AT INTAKE. Every example was minted a
// section of prose. Here: the reader's DECISION counts only with the words that state it, found in what it was shown;
// a held-back piece is shown by its request alone; with no model or no usable answer every unit stays PROSE_SECTION.
import { describe, it, expect } from 'vitest';
import { UNIT_KIND, UNREAD_UNIT_KIND, SHOWN_CHARS, unitKindInput, mintKinds } from '../core/golden/unit-kind.js';
import { readContext } from '../core/inference/reading.js';
import type { InferenceClient } from '../core/inference/client.js';

const asked: string[] = [];
const scripted = (answer: unknown): InferenceClient => ({ complete: async (req: { userMessage: string }) => { asked.push(req.userMessage); return { json: answer, text: '', cost: { usd: 0 } }; } } as never);
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 5 });

const MEMO = 'Pilot review.\n\nDecision: we stop the pilot in March and move the budget to onboarding.';
const ESSAY = 'Why cities forget their rivers. A walk along a buried stream, and what it says about planning.';
const units = [
  { unitId: 'memo.md', kind: 'PROSE_SECTION', task: 'produce memo.md', artifact: MEMO },
  { unitId: 'essay.md', kind: 'PROSE_SECTION', task: 'produce essay.md', artifact: ESSAY },
  { unitId: 'held.md', kind: 'PROSE_SECTION', task: 'produce held.md', artifact: 'Decision: ship the new plan on Monday.' },
];
const requests: Record<string, string | null> = { 'memo.md': null, 'essay.md': null, 'held.md': 'Recommend whether we ship the new pricing plan' };
const input = unitKindInput(units, new Set(['held.md']), (id) => requests[id] ?? null);

describe('the input', () => {
  it('a held-back piece is shown by its request alone, never its text', () => {
    expect(input.pieces.find((p) => p.id === 'held.md')).toEqual({ id: 'held.md', request: requests['held.md'], text: null });
    expect(UNIT_KIND.prompt(input)).not.toContain('ship the new plan on Monday');
    expect(UNIT_KIND.prompt(input)).toContain('Recommend whether we ship');
  });
  it('a long piece is shown in part', () => {
    const long = unitKindInput([{ unitId: 'l', task: '', artifact: `${'a'.repeat(SHOWN_CHARS)}TAIL` }], new Set(), () => null);
    expect(UNIT_KIND.prompt(long)).not.toContain('TAIL');
  });
});

describe('the reading', () => {
  it('nothing anyone may read is decided by code: every unit stays unread', async () => {
    const none = unitKindInput([{ unitId: 'h', task: '', artifact: MEMO }], new Set(['h']), () => null);
    const d = await readContext(UNIT_KIND, none, scripted({ pieces: [] }), 'm', budget());
    expect(d).toMatchObject({ value: { h: 'PROSE_SECTION' }, by: 'code' });
  });
  it('DECISION with a quote from what was shown is a decision memo; OTHER is prose', async () => {
    asked.length = 0;
    const d = await readContext(UNIT_KIND, input, scripted({ pieces: [
      { id: 'memo.md', job: 'DECISION', quote: 'Decision: we stop the pilot in March' },
      { id: 'essay.md', job: 'OTHER' },
      { id: 'held.md', job: 'DECISION', quote: 'Recommend whether we ship the new pricing plan' },
    ] }), 'm', budget());
    expect(asked).toHaveLength(1);
    expect(d.by).toBe('model');
    expect(d.value).toEqual({ 'memo.md': 'DECISION_MEMO', 'essay.md': 'PROSE_SECTION', 'held.md': 'DECISION_MEMO' });
  });
  it('a quote not in what the reader was shown drops the answer: the held text, a made-up line, no quote at all', async () => {
    const d = await readContext(UNIT_KIND, input, scripted({ pieces: [
      { id: 'held.md', job: 'DECISION', quote: 'ship the new plan on Monday' },   // the held-back text, never shown
      { id: 'memo.md', job: 'DECISION', quote: 'we recommend option B' },
      { id: 'essay.md', job: 'DECISION' },
      { id: 'other.md', job: 'OTHER' },
    ] }), 'm', budget());
    expect(d.by).toBe('floor');
    expect(mintKinds(units, d.value).map((u) => u.kind)).toEqual(['PROSE_SECTION', 'PROSE_SECTION', 'PROSE_SECTION']);
  });
  it('with no model the floor reads no words, and the memo stays a prose section', async () => {
    const d = await readContext(UNIT_KIND, input, null, null, budget());
    expect(d).toMatchObject({ by: 'floor', why: 'no model set up' });
    expect(Object.values(d.value)).toEqual([UNREAD_UNIT_KIND, UNREAD_UNIT_KIND, UNREAD_UNIT_KIND]);
  });
});

describe('minting', () => {
  it('a unit the reading answered for takes its kind; one it skipped keeps the unread kind; nothing else moves', () => {
    const minted = mintKinds(units, { 'memo.md': 'DECISION_MEMO' });
    expect(minted.map((u) => [u.unitId, u.kind])).toEqual([['memo.md', 'DECISION_MEMO'], ['essay.md', 'PROSE_SECTION'], ['held.md', 'PROSE_SECTION']]);
    expect(minted[0]).toEqual({ ...units[0], kind: 'DECISION_MEMO' });
  });
});
