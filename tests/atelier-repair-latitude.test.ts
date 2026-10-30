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
import { repairVetoes } from '../core/loop/run-repair.js';
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

describe('which rules may refuse a repair: every check that reads a rule, whatever the table does with its failure', () => {
  const vOf = (level: 'CREATIVE' | 'GROUNDED'): StandardVersion => ({ requirements: [], latitude: { level, evidence: [], by: 'owner' } } as unknown as StandardVersion);
  it('creative: a counted rule and an unqualified written check both refuse an edit that breaks them; a listed specific does not', () => {
    const veto = repairVetoes(vOf('CREATIVE'), { level: 'CREATIVE', claimAct: 'list' });
    expect([veto('x1'), veto('x2'), veto('UNSOURCED')]).toEqual([true, true, false]);
  });
  it('grounded: the same, and a specific flagged for review refuses too', () => {
    const veto = repairVetoes(vOf('GROUNDED'), { level: 'GROUNDED', claimAct: 'review' });
    expect([veto('x1'), veto('x2'), veto('UNSOURCED')]).toEqual([true, true, true]);
  });
  it('the claim line keeps its act under the table: where the owner labels untraced specifics, a flagged one no longer refuses', () => {
    const t = tableOf({ latitude: { level: 'GROUNDED', evidence: [], by: 'owner' }, consequences: { 'untraced-specific': 'label', 'claim-flagged': 'label' } });
    expect(repairVeto(t, 'specifics', 'review')).toBe(false);
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

describe('span by span, each span read is the step\'s (round-1 gap A6)', () => {
  // A claim reader that costs two cents a read, from its own budget, as the real one does; it finds nothing.
  const reader = () => { let spent = 0; return { instrument: 'a paid reader', notes: [] as string[], version: 'r1', qualified: false, gate: 'pattern' as const, degraded: false,
    get spentUsd() { return spent; }, read: async () => { spent += 0.02; }, reading: () => undefined }; };
  it('with the budget for every read, the harmful span alone is discarded, as before', async () => {
    const out = await refineToStandard(writer(), { spentUsd: 0, capUsd: 1 }, 'd', std('GROUNDED'), DRAFT, 1,
      { material: '', level: 'GROUNDED', claimAct: 'review', listsBecause: 'the skill is held grounded', claimSensor: reader() } as never);
    const step = out.repair?.controller?.decisions.find((x) => x.action === 'rewrite');
    expect(step?.observed.note ?? '').not.toContain('could not hold another read');
  });
  it('where the run cannot pay for another read, a span is not judged alone: it is discarded, said so', async () => {
    const out = await refineToStandard(writer(), { spentUsd: 0, capUsd: 0.08 }, 'd', std('GROUNDED'), DRAFT, 1,
      { material: '', level: 'GROUNDED', claimAct: 'review', listsBecause: 'the skill is held grounded', claimSensor: reader() } as never);
    const notes = (out.repair?.controller?.decisions ?? []).map((x) => x.observed.note ?? '').join(' | ');
    expect(notes).toContain('not checked alone: the step\'s budget could not hold another read');
  });
});
