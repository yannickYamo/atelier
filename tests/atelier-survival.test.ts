// tests/atelier-survival.test.ts — NO REPAIR DELIVERS LESS THAN WAS ASKED FOR.
//
// A person must never receive an empty answer marked as repaired. Three paths change the text by removing it: the
// cut of a sentence that is only a machine-writing move (`applyRepair`), any step through the one helper (`applyStep`),
// and the cut of invented claims (`enforceClaims`). Each keeps the work when a removal would take it away. Expected
// values are read off the texts themselves.
import { describe, it, expect } from 'vitest';
import { applyRepair, applyStep, survivalLoss, belowAsked, type Reverted } from '../core/loop/repair.js';
import { stepLedger } from '../core/loop/controller.js';
import { enforceClaims } from '../core/loop/run-repair.js';
import { verifyText } from '../core/observers/verify.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const NONE = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;

describe('the cut of a sentence that is only a move', () => {
  it('a draft that is one tell sentence keeps its text, and the cut is reported as refused', () => {
    const reverted: Reverted[] = [];
    const out = applyRepair('That is the whole game.', [{ id: 1, start: 0, end: 23, text: 'That is the whole game.', cuttable: true } as never], [{ id: 1, text: '' }], reverted);
    expect(out).toBe('That is the whole game.');
    expect(reverted).toHaveLength(1);
    expect(reverted[0]).toMatchObject({ id: 1, kind: 'CUT' });
  });
  it('the same cut in a longer draft is made: the rest of the work stays', () => {
    const text = 'Retries need a budget. That is the whole game.';
    const out = applyRepair(text, [{ id: 1, start: 23, end: 46, text: 'That is the whole game.', cuttable: true } as never], [{ id: 1, text: '' }]);
    expect(out).toBe('Retries need a budget.');
  });
});

describe('the survival rule', () => {
  const ten = 'one two three four five six seven eight nine ten.';
  it('nothing left is refused, whatever the step was for', () => {
    expect(survivalLoss(ten, '')).toBe('it would leave no text at all');
    expect(survivalLoss(ten, '', true)).toBe('it would leave no text at all');
  });
  it('under a quarter of the words is refused, unless the cut is aimed at a length', () => {
    expect(survivalLoss(ten, 'one two.')).toBe('it would leave 2 of 10 words');
    expect(survivalLoss(ten, 'one two.', true)).toBeNull();
  });
  it('a quarter or more is kept', () => {
    expect(survivalLoss(ten, 'one two three.')).toBeNull();
  });
});

describe('any step through the one helper', () => {
  const read = (t: string) => verifyText('d', NONE, t);
  const PLAN = { action: 'rewrite' as const, targets: ['x'], why: 'w', expectedGain: 1, expectedCostUsd: 0 };
  const step = (before: string, after: string, targets = ['x']) => applyStep(stepLedger(null, null, [], ''), { ...PLAN, targets }, { text: before, report: read(before) },
    async () => ({ text: after, report: read(after) }), { purposes: ['repair'] });
  const before = 'We ship on Fridays because the team is around to watch it. Rollbacks are rehearsed every month. Nobody deploys alone.';
  it('a step that empties the draft is not kept', async () => {
    const r = await step(before, '');
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toBe('it would leave no text at all');
  });
  it('a step that leaves under a quarter is not kept', async () => {
    const r = await step(before, 'We ship.');
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/^it would leave 2 of \d+ words$/);
  });
  it('a step aimed at the requested length may cut deep', async () => {
    const r = await step(before, 'We ship on Fridays.', ['request-length']);
    expect(r.kind === 'judged' && r.kept).toBe(true);
  });
});

describe('the cut of invented claims', () => {
  it('a draft made only of invented stories keeps its last sentence, still flagged, and fails instead of delivering nothing', async () => {
    const draft = 'Last year I shipped a retry loop that broke production. I watched a junior engineer debug it for a week. Then I rewrote the whole thing myself over a weekend.';
    const r = await enforceClaims('d', NONE, draft, { material: '' });
    expect(r.text.trim().length).toBeGreaterThan(0);
    expect(r.kept.length).toBeGreaterThan(0);
    expect(r.report.failed).toBe(true);
  });
});

describe('the length the person asked for is part of the work', () => {
  const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
  it('a change that takes a draft under the length asked for is refused', () => {
    expect(belowAsked(words(60), words(40), 50)).toBe('it would take the text to 40 words, below the 50 the request asks for');
  });
  it('a draft already short may not be cut further below it, though it may grow', () => {
    // 600 of 1,000 asked: a repair to 400 delivers less still
    expect(belowAsked(words(600), words(400), 1000)).toBe('it would take the text to 400 words, below the 1000 the request asks for');
    expect(belowAsked(words(600), words(650), 1000)).toBeNull();
  });
  it('a change that stays at or above it is free, and no length asked means no floor', () => {
    expect(belowAsked(words(80), words(55), 50)).toBeNull();
    expect(belowAsked(words(80), words(10), null)).toBeNull();
  });
  it('through the one helper: a step under the asked length is not kept', async () => {
    const NONE2 = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const read = (t: string) => verifyText('d', NONE2, t);
    const r = await applyStep(stepLedger(null, null, [], ''), { action: 'rewrite', targets: ['x'], why: 'w', expectedGain: 1, expectedCostUsd: 0 }, { text: words(60), report: read(words(60)) },
      async () => ({ text: words(45), report: read(words(45)) }), { purposes: ['repair'], floorWords: 50 });
    expect(r.kind === 'judged' && r.kept).toBe(false);
  });
});
