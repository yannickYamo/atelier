// The bounded boundary probe: selection, blinding, and what an answer is allowed to change.

import { describe, it, expect } from 'vitest';
import { selectForProbing, prepareProbe, foldAnswer, type ProbeCandidate } from '../../core/discovery/run-probes.js';
import type { InferenceClient, Budget } from '../../core/inference/client.js';

const cand = (id: string, recurrence: number): ProbeCandidate =>
  ({ requirementId: id, statement: `rule ${id}`, appliesWhen: 'always', recurrence });
const budget = (): Budget => ({ spentUsd: 0, capUsd: 10 });
const client: InferenceClient = {
  async complete(req) {
    // echo the instruction so a test can tell the three doses apart
    return { json: { piece: `PIECE[${req.variableBlock.includes('LESS') ? 'less' : req.variableBlock.includes('MORE') ? 'more' : 'measure'}]` },
      modelId: 'fake', inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0 };
  },
};

describe('the bound is declared, and points at the costliest error', () => {
  it('probes the HIGHEST-recurrence factors — the ones that will shape most output', () => {
    const picked = selectForProbing([cand('a', 0.2), cand('b', 0.9), cand('c', 0.5)], 2);
    expect(picked.map((p) => p.requirementId)).toEqual(['b', 'c']);
  });

  it('ties break by id, so the selection is reproducible', () => {
    expect(selectForProbing([cand('z', 0.5), cand('a', 0.5)], 1)[0].requirementId).toBe('a');
  });

  it('selection reads recurrence only — never a probe result, which does not exist yet', () => {
    expect(selectForProbing.length).toBe(2);   // (candidates, k)
    expect(selectForProbing.toString()).not.toMatch(/label|preferred|answer/i);
  });
});

describe('three doses of ONE property, blinded', () => {
  it('writes three variants from the same brief, differing only in dose', async () => {
    const p = await prepareProbe(client, budget(), cand('a', 0.9), 'write about a delayed train', 42);
    expect(p.blind.key).toHaveLength(3);
    expect(new Set(p.blind.key.map((k) => k.level))).toEqual(new Set(['TOO_LITTLE', 'ACCEPTABLE', 'TOO_MUCH']));
  });

  it('THE SHEET NEVER NAMES THE LEVELS — an author who can see the intended answer is being led', () => {
    return prepareProbe(client, budget(), cand('a', 0.9), 'brief', 7).then((p) => {
      expect(p.blind.rendered).not.toMatch(/TOO_LITTLE|ACCEPTABLE|TOO_MUCH/);
      expect(p.blind.rendered).not.toMatch(/less|more/i.test('') ? /$^/ : /\bLESS\b|\bMORE\b/);
    });
  });

  it('the sealed key is what maps a pick back to a level, and it is separate from the sheet', async () => {
    const p = await prepareProbe(client, budget(), cand('a', 0.9), 'brief', 7);
    const accepted = p.blind.key.find((k) => k.level === 'ACCEPTABLE')!;
    expect(foldAnswer(p, { shipped: accepted.tag }).label.preferredLevel).toBe('ACCEPTABLE');
  });
});

describe('what an answer is allowed to do to the rule', () => {
  const prep = () => prepareProbe(client, budget(), cand('a', 0.9), 'brief', 3);

  it('picking the measured version CONFIRMS the rule discriminates', async () => {
    const p = await prep();
    const tag = p.blind.key.find((k) => k.level === 'ACCEPTABLE')!.tag;
    const o = foldAnswer(p, { shipped: tag });
    expect(o.consequence).toBe('CONFIRMS');
    expect(o.meaning).toContain('discriminates');
  });

  it('preferring LESS says the pattern may be a habit rather than a standard', async () => {
    const p = await prep();
    const tag = p.blind.key.find((k) => k.level === 'TOO_LITTLE')!.tag;
    const o = foldAnswer(p, { shipped: tag });
    expect(o.consequence).toBe('REWORD_WEAKER');
    expect(o.meaning).toContain('habit');
  });

  it('preferring MORE says the examples UNDERSTATE the rule', async () => {
    const p = await prep();
    const tag = p.blind.key.find((k) => k.level === 'TOO_MUCH')!.tag;
    expect(foldAnswer(p, { shipped: tag }).consequence).toBe('REWORD_STRONGER');
  });

  it('no preference NARROWS scope — it does not refute the rule', async () => {
    // The distinction that matters: "you do not care HERE" is not "you disagree". Collapsing them
    // would delete a rule that holds elsewhere.
    const p = await prep();
    const o = foldAnswer(p, { none: true });
    expect(o.consequence).toBe('NARROWS');
    expect(o.meaning).toContain('narrows its scope rather than refuting');
  });
});
