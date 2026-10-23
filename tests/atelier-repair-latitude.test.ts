// tests/atelier-repair-latitude.test.ts — A REPAIR ANSWERS ONLY TO THE RULES THAT CAN HOLD THE WORK, SPAN BY SPAN.
//
// The defect: on a creative skill a rewrite that fixed three tells was thrown away whole because one of its spans made
// the claim check list one more sentence. On a creative skill the claim check only lists (core/eval/consequence.ts: every
// row is "label"), so it can never hold the work back, yet it vetoed the repair, and the tells were delivered. Now a
// rewrite may be refused only by a rule whose failure would hold delivery at the run's latitude, and each rewritten span
// is judged on its own: a span that fixes its rule and newly breaks nothing that could hold the work is kept, and only a
// harmful span is discarded.
//
// Metric (plan round 1, item 2): tells delivered = 0. Expected values below are the fixture's own sentences, written out.
import { describe, it, expect } from 'vitest';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { repairVeto, tableOf } from '../core/eval/consequence.js';
import { anInferenceResult, aRequirement } from './fixtures.js';

const THAT = "That's the harbour on a calm night.";
const HERE = "Here's the quay where the nets are dried.";
const ASK = 'Who waits for the last ferry?';
const PLAIN = 'The ferry leaves the pier at eleven and the crossing is calm on most nights of the year.';
const P6 = Array.from({ length: 6 }, () => PLAIN).join(" ");
const DRAFT = [`${THAT} ${P6}`, `${HERE} ${P6}`, `${ASK} ${P6}`].join('\n\n');
// The rewrite of each span: the second one says something of the writer's own life no material holds.
const REWRITE: Record<string, string> = {
  [THAT]: 'The harbour lies calm at night.',
  [HERE]: 'Years ago I worked on the quay where the nets are dried.',
  [ASK]: 'Few people wait for the last ferry.',
};
const rule = (id: string, pattern: string, statement: string) => aRequirement({ requirementId: id, statement, materiality: 'REQUIRED',
  measurement: { observer: 'PATTERN_RATE', params: { pattern: [pattern], maxPer1000: 0 } } });
const RULES = [rule('t1', 'THAT_OPENER', 'Never open a sentence with "That\'s".'), rule('t2', 'HERES_OPENER', 'Never open a sentence with "Here\'s".'),
  rule('t3', 'RHETORICAL_QUESTION', 'Never ask the reader a question.')];
const std = (level: 'CREATIVE' | 'GROUNDED'): StandardVersion => ({ standardVersionHash: 's', requirements: RULES, latitude: { level, evidence: [], by: 'owner' } }) as unknown as StandardVersion;

const writer = (): InferenceClient & { calls: number } => {
  const w = { calls: 0, complete: async (req: InferenceRequest) => {
    w.calls += 1;
    const spans = [...req.userMessage.matchAll(/SPAN (\d+)\n"""([\s\S]*?)"""/g)];
    return anInferenceResult({ json: { replacements: spans.map(([, id, t]) => ({ id: Number(id), text: REWRITE[t] ?? t })) } });
  } };
  return w;
};

describe('which rules may refuse a repair, by the table', () => {
  it('creative: none of the rows can hold the work, so no check refuses one', () => {
    const t = tableOf({ latitude: { level: 'CREATIVE', evidence: [], by: 'owner' } });
    expect([repairVeto(t, 'trusted'), repairVeto(t, 'untrusted'), repairVeto(t, 'specifics', 'list')]).toEqual([false, false, false]);
  });
  it('grounded: a trusted check blocks and an unqualified one sends to a person, so both refuse; a listed specific does not', () => {
    const t = tableOf({ latitude: { level: 'GROUNDED', evidence: [], by: 'owner' } });
    expect([repairVeto(t, 'trusted'), repairVeto(t, 'untrusted'), repairVeto(t, 'specifics', 'review'), repairVeto(t, 'specifics', 'list')]).toEqual([true, true, true, false]);
  });
  it('the owner\'s row wins: set to label, a trusted check no longer refuses a repair', () => {
    const t = tableOf({ latitude: { level: 'GROUNDED', evidence: [], by: 'owner' }, consequences: { 'trusted-fail': 'label' } });
    expect(repairVeto(t, 'trusted')).toBe(false);
  });
});

describe('a creative skill: three tells repaired though the claim listing changed', () => {
  it('all three rewrites are kept and none of the tells is delivered', async () => {
    const out = await refineToStandard(writer(), { spentUsd: 0, capUsd: 1 }, 'd', std('CREATIVE'), DRAFT, 2,
      { material: '', level: 'CREATIVE', claimAct: 'list', listsBecause: 'the skill is held creative' });
    expect(out.output).toContain('The harbour lies calm at night.');
    expect(out.output).toContain('Years ago I worked on the quay where the nets are dried.');
    expect(out.output).toContain('Few people wait for the last ferry.');
    for (const id of ['t1', 't2', 't3']) expect(out.report.checked.find((c) => c.requirementId === id)?.result.verdict).toBe('MET');
  });
});

describe('a grounded skill: the harmful span alone is discarded', () => {
  it('the two rewrites that break nothing are kept; the one that adds an untraced story is not', async () => {
    const out = await refineToStandard(writer(), { spentUsd: 0, capUsd: 1 }, 'd', std('GROUNDED'), DRAFT, 1,
      { material: '', level: 'GROUNDED', claimAct: 'review', listsBecause: 'the skill is held grounded' });
    expect(out.output).toContain('The harbour lies calm at night.');
    expect(out.output).toContain('Few people wait for the last ferry.');
    expect(out.output).not.toContain('Years ago I worked');
    const step = out.repair?.controller?.decisions.find((x) => x.action === 'rewrite' && x.outcome === 'kept');
    expect(step?.observed.note).toMatch(/^1 rewritten span\(s\) discarded and 2 kept: "Here's the quay where the nets are dried\." \(it made UNSOURCED/);
    expect(out.report.checked.find((c) => c.requirementId === 't1')?.result.verdict).toBe('MET');
    expect(out.report.checked.find((c) => c.requirementId === 't3')?.result.verdict).toBe('MET');
  });
});
