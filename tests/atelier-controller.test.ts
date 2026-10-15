// tests/atelier-controller.test.ts — THE BOUNDED CONTROLLER: WHAT MATTERS MOST FIRST, SIZED TO THE MISS, STOPPED WHEN IT STOPS PAYING.
//
// The expected values below are worked out from the documented thresholds (0.5 and 1.5 band widths, three features),
// the documented defaults (κ = 2 per dollar, four steps, $0.05 a rewrite, $0.40 a draft) and the EWMA weight 0.2, not
// read back from the code.
import { describe, it, expect } from 'vitest';
import { decide, sizedAction, carriersFor, controllerRecord, joinRecords, askedForRedraft, describeController, CONTROLLER_DEFAULTS, type ControllerInput } from '../core/loop/controller.js';
import { summariseEffects, type EffectSource } from '../core/fidelity/estimator.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { processSpendByPurpose, spendBetween, type InferenceClient } from '../core/inference/client.js';
import { featureOf } from '../core/observers/features.js';
import type { ControllerDecisionRecord, StandardVersion } from '../core/state/canonical-state.js';
import type { FidelityProfile } from '../core/fidelity/types.js';

const input = (over: Partial<ControllerInput> = {}): ControllerInput => ({ enforced: [], claims: 0, length: null, graded: [], grammar: null,
  budget: { usdLeft: 1, callsLeft: null }, history: [], observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set(), ...over });
const step = (action: ControllerDecisionRecord['action'], targets: string[], outcome: ControllerDecisionRecord['outcome'], movement = 0, usd = 0.05, calls = 1): ControllerDecisionRecord =>
  ({ action, targets, why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome, observed: { movement, calls, usd } });

describe('the size of a miss picks the action', () => {
  it('three planted |error| levels: under 0.5 operators, 0.5 to 1.5 a carrier rewrite of ceil(|error|) sentences, over 1.5 a redraft', () => {
    expect(sizedAction(0.3, 1)).toBe('operators');
    expect(sizedAction(-1.0, 1)).toBe('carrier-rewrite');
    expect(sizedAction(2.0, 1)).toBe('redraft');
    // three features out at once is a redraft whatever their size
    expect(sizedAction(0.6, 3)).toBe('redraft');
    expect([0.6, 1.0, 1.2, 2.5, 7].map(carriersFor)).toEqual([1, 1, 2, 3, 3]);
  });
  it('through decide: each level, with an enforced rule out of reach keeping the loop going for the smallest', () => {
    // an omission with no redraft to be had keeps the loop going and is not itself a target
    const held = { enforced: [{ id: 'r9', kind: 'omission' as const }], can: { redraft: false, rewrite: true } };
    const small = decide(input({ ...held, graded: [{ id: 'g1', error: 0.4, operatorEffect: 0.2 }] }));
    expect(small).toMatchObject({ kind: 'act', action: 'operators', targets: ['g1'], expectedGain: 0.2, expectedCostUsd: 0 });
    const middle = decide(input({ graded: [{ id: 'g2', error: -1.2, operatorEffect: null }] }));
    // gain: min(1.2, 0.4 × 2 carriers) = 0.8, for $0.05
    expect(middle).toMatchObject({ kind: 'act', action: 'carrier-rewrite', targets: ['g2'], carriers: 2, expectedGain: 0.8, expectedCostUsd: 0.05 });
    const far = decide(input({ graded: [{ id: 'g3', error: 2.0, operatorEffect: null }] }));
    // gain: min(2.0, 1) = 1, for $0.40: 2.5 per dollar, over κ = 2
    expect(far).toMatchObject({ kind: 'act', action: 'redraft', targets: ['g3'], expectedGain: 1, expectedCostUsd: 0.4 });
    // where no draft can be written again, the far miss is rewritten on its carriers instead, three of them
    expect(decide(input({ graded: [{ id: 'g3', error: 2.5, operatorEffect: null }], can: { redraft: false, rewrite: true } })))
      .toMatchObject({ action: 'carrier-rewrite', carriers: 3 });
  });
});

describe('what matters most first', () => {
  it('a missing required conclusion is written again before any cadence issue is touched', () => {
    const d = decide(input({ enforced: [{ id: 'conclusion', kind: 'omission' }], graded: [{ id: 'signal·sentenceSpread', error: 1.2, operatorEffect: null }] }));
    expect(d).toMatchObject({ kind: 'act', action: 'redraft', targets: ['conclusion'] });
    // a span rule is rewritten before the omission is written again, and both before the graded miss
    const both = decide(input({ enforced: [{ id: 'conclusion', kind: 'omission' }, { id: 'nodash', kind: 'span' }], graded: [{ id: 'g', error: 1.2, operatorEffect: null }] }));
    expect(both).toMatchObject({ action: 'rewrite', targets: ['nodash'] });
  });
  it('the furthest graded miss leads, at most three a step, and a feature inside its band is never a target', () => {
    const d = decide(input({ graded: [{ id: 'a', error: 0.6, operatorEffect: null }, { id: 'b', error: -0.9, operatorEffect: null }, { id: 'c', error: 0, operatorEffect: null }] }));
    expect(d).toMatchObject({ action: 'carrier-rewrite', targets: ['b', 'a'] });
  });
  it('claims order only: no step is chosen for them, and with nothing else off the controller stops', () => {
    expect(decide(input({ claims: 3 }))).toMatchObject({ kind: 'stop' });
  });
  it('a correct draft with one harmless deviation: nothing to do', () => {
    expect(decide(input({ graded: [{ id: 'g', error: 0.5, operatorEffect: 0.3 }] })))
      .toEqual({ kind: 'stop', why: 'every enforced rule holds and no graded miss is over 0.5 band widths' });
  });
});

describe('when it stops', () => {
  const miss = { graded: [{ id: 'g', error: 1.0, operatorEffect: null }] };
  it('the same action failing twice on the same target switches once, then stops', () => {
    const once = [step('carrier-rewrite', ['g'], 'not kept')];
    expect(decide(input({ ...miss, history: once }))).toMatchObject({ action: 'carrier-rewrite' });
    const twice = [...once, step('carrier-rewrite', ['g'], 'not kept')];
    expect(decide(input({ ...miss, history: twice }))).toMatchObject({ action: 'redraft', targets: ['g'] });
    const switched = [...twice, step('redraft', ['g'], 'not kept')];
    expect(decide(input({ ...miss, history: switched })))
      .toEqual({ kind: 'stop', why: 'the same repair failed on what is left, and the action it switched to failed too' });
    // a kept step that moved something is no failure
    expect(decide(input({ ...miss, history: [...once, step('carrier-rewrite', ['g'], 'kept', 0.3)] }))).toMatchObject({ action: 'carrier-rewrite' });
  });
  it('the budget: a step it cannot hold is not taken, and the stop says so', () => {
    const d = decide(input({ ...miss, budget: { usdLeft: 0.01, callsLeft: null } }));
    expect(d.kind).toBe('stop'); expect((d as { why: string }).why).toMatch(/^the budget: carrier-rewrite would cost about \$0.05/);
    expect(decide(input({ ...miss, budget: { usdLeft: 1, callsLeft: 0 } }))).toMatchObject({ kind: 'stop', why: expect.stringMatching(/^the budget/) });
  });
  it('gain per dollar under κ: a step this run has seen move nothing, at the price this run pays, is not taken', () => {
    // effect: prior 0.4 halved toward an observed 0 = 0.2 per carrier; gain min(1.0, 0.2) = 0.2 at $0.30 a call: 0.67 per dollar
    const d = decide(input({ ...miss, history: [step('carrier-rewrite', ['other'], 'not kept')], observedUsdPerCall: { 'carrier-rewrite': 0.3 } }));
    expect(d).toMatchObject({ kind: 'stop', why: expect.stringMatching(/^it stopped paying: carrier-rewrite was expected to move 0.2 for \$0.30, under 2 per dollar/) });
    // the same with the release's κ lowered to 0.5 is taken
    expect(decide(input({ ...miss, history: [step('carrier-rewrite', ['other'], 'not kept')], observedUsdPerCall: { 'carrier-rewrite': 0.3 } }), { minGainPerUsd: 0.5 })).toMatchObject({ action: 'carrier-rewrite' });
  });
  it('at most maxActions steps; the claim cut and the mechanical fixes are not counted among them', () => {
    const four = [step('cut', ['UNSOURCED'], 'kept', 1, 0, 0), ...Array.from({ length: 4 }, () => step('carrier-rewrite', ['x'], 'kept', 0.2))];
    expect(decide(input({ ...miss, history: four }))).toEqual({ kind: 'stop', why: `the controller took its ${CONTROLLER_DEFAULTS.maxActions} steps` });
    expect(decide(input({ ...miss, history: four.slice(0, 4) }))).toMatchObject({ kind: 'act' });
  });
  it('one more draft only where the release allows it and an enforced rule still fails that nothing else reaches', () => {
    const stuck = { enforced: [{ id: 'r', kind: 'span' as const }], history: [step('rewrite', ['r'], 'not kept'), step('rewrite', ['r'], 'not kept')] };
    expect(decide(input(stuck))).toMatchObject({ kind: 'stop' });
    expect(decide(input(stuck), { extraDraft: true })).toMatchObject({ kind: 'act', action: 'redraft', targets: ['r'] });
  });
});

describe('the record', () => {
  it('sums the steps\' own calls and dollars; joined records keep their order; a hand-off is recognised', () => {
    const a = controllerRecord([step('rewrite', ['r'], 'kept', 2, 0.001), step('redraft', ['g'], 'handed to a redraft', 0, 0, 0)], 'handed to a redraft: far');
    expect(a).toMatchObject({ policy: 'bounded-v1', callsUsed: 1, usdUsed: 0.001 });
    expect(askedForRedraft(a)).toBe(true);
    const j = joinRecords(a, step('redraft', ['g'], 'kept', 1, 0.002), controllerRecord([], 'every enforced rule holds and nothing graded is off'));
    expect(j.decisions.map((d) => d.action)).toEqual(['rewrite', 'redraft', 'redraft']);
    expect(j).toMatchObject({ callsUsed: 2, usdUsed: 0.003, stoppedBecause: 'every enforced rule holds and nothing graded is off' });
    expect(askedForRedraft(j)).toBe(false);
    const lines = describeController(j);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('1. rewrite on r: w; expected 1 for $0.05; kept, moved 2, 1 call(s), $0.0010');
    expect(lines[3]).toBe('stopped: every enforced rule holds and nothing graded is off · 2 call(s), $0.0030 on its steps');
  });
});

describe('atelier report prints the steps', () => {
  it('a record with a controller shows each step and why it stopped, under the repair', async () => {
    const { traceOf } = await import('../cli/commands/report.js');
    const controller = controllerRecord([step('carrier-rewrite', ['p1'], 'kept', 0.6, 0.001)], 'every enforced rule holds and nothing graded is off');
    const rec = { input: 'write a note', at: '2026-01-01T00:00:00Z', observedRuntime: { resolvedModel: 'm' }, runtimeBinding: {},
      repair: { passes: 1, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w', controller } } as never;
    const steps = traceOf(rec).find(([name]) => name === 'repair steps');
    expect(steps?.[1]).toEqual(describeController(controller));
    expect(steps?.[1][0]).toBe('1. carrier-rewrite on p1: w; expected 1 for $0.05; kept, moved 0.6, 1 call(s), $0.0010');
  });
});

describe('summariseEffects: the learning contract, EWMA λ = 0.2 over past records', () => {
  const rec = (at: string, decisions: ControllerDecisionRecord[]): EffectSource => ({ at, repair: { controller: { decisions } } });
  it('in time order, movement per target and dollars per step; not kept moves nothing; hand-offs and failures to run are no evidence', () => {
    const records = [
      rec('2026-01-02', [step('carrier-rewrite', ['a'], 'not kept', 0, 0.07), step('redraft', ['a'], 'handed to a redraft', 0, 0, 0)]),
      rec('2026-01-01', [step('carrier-rewrite', ['a', 'b'], 'kept', 1.0, 0.05), step('operators', ['c'], 'kept', 0.3, 0, 0)]),
      { at: '2026-01-03', repair: null },
      rec('2026-01-04', [step('rewrite', ['r'], 'could not run', 0, 0, 0)]),
    ];
    const frozen = JSON.stringify(records);
    // carrier-rewrite: 1.0 / 2 targets = 0.5 first, then 0.8 × 0.5 + 0.2 × 0 = 0.4; dollars 0.05, then 0.8 × 0.05 + 0.2 × 0.07 = 0.054
    expect(summariseEffects(records)).toEqual({ 'carrier-rewrite': { movement: 0.4, usdPerAction: 0.054, n: 2 }, operators: { movement: 0.3, usdPerAction: 0, n: 1 } });
    expect(JSON.stringify(records)).toBe(frozen);
    expect(summariseEffects([])).toEqual({});
  });
  it('a release\'s effects change what a step is expected to move', () => {
    const miss = { graded: [{ id: 'g', error: 1.0, operatorEffect: null }] };
    expect(decide(input(miss), { effects: { 'carrier-rewrite': { movement: 0.1, usdPerAction: 0.05, n: 20 } } })).toMatchObject({ action: 'carrier-rewrite', expectedGain: 0.1 });
  });
});

describe('through the loop', () => {
  const ok = (json: unknown): Promise<never> => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  const scripted = (answers: readonly unknown[]): InferenceClient & { calls: number } => {
    const c = { calls: 0, complete: () => { const a = answers[Math.min(c.calls++, answers.length - 1)]; return ok(a); } };
    return c;
  };
  const plainS = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
  const asideS = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
  const pieceOf = (every: number): string => Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % every === 0 ? asideS : plainS)).join(' ')).join('\n\n');
  const text = pieceOf(6);
  const value = featureOf('parenthesis')!.measure(text)!;
  const stdWith = (lo: number, hi: number, extra: object[] = []): StandardVersion => ({ standardVersionHash: 's', requirements: [{ requirementId: 'p1', statement: 'Few asides.', materiality: 'PREFERRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
    measurement: { observer: 'FEATURE', params: { feature: ['parenthesis'], minValue: lo, maxValue: hi } } }, ...extra] } as unknown as StandardVersion);
  const opts = (over: object = {}) => ({ graded: 'all' as const, guardClaims: false, ...over });
  const reps = (t: string) => ({ replacements: [1, 2, 3].map((id) => ({ id, text: t })) });

  it('a correct draft with one harmless deviation is delivered as written, with no call and the reason on the record', async () => {
    // a band whose top is the value / 1.3: 0.3 widths out
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 1.3), text, 2, opts());
    expect(writer.calls).toBe(0);
    expect(r.output).toBe(text);
    expect(r.repair?.passes).toBe(0);
    expect(r.repair?.controller).toEqual({ policy: 'bounded-v1', decisions: [], stoppedBecause: 'every enforced rule holds and no graded miss is over 0.5 band widths', callsUsed: 0, usdUsed: 0 });
  });
  it('a missing required section is handed to a redraft before the far cadence miss is touched, and nothing is spent here', async () => {
    const conclusion = { requirementId: 'r1', statement: 'End with a Conclusion section.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE',
      measurement: { observer: 'PRESENCE', params: { sections: ['Conclusion'] } } };
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 3, [conclusion]), text, 2, opts({ controller: { redraft: true } }));
    expect(writer.calls).toBe(0);
    expect(r.repair?.controller?.decisions.map((d) => [d.action, d.targets, d.outcome])).toEqual([['redraft', ['r1'], 'handed to a redraft']]);
    expect(r.repair?.controller?.stoppedBecause).toMatch(/^handed to a redraft: 1 enforced rule\(s\) need something the draft does not have/);
  });
  it('repeated failed rewrites switch to a redraft, then stop; each step\'s cost is the ledger\'s', async () => {
    // a band two thirds of the value wide at 1.0 width out: the writer returns the spans as they were, so nothing moves
    const writer = scripted([reps(asideS)]);
    const before = processSpendByPurpose();
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 2), text, 2, opts({ controller: { redraft: true } }));
    const ledger = spendBetween(before, processSpendByPurpose()).filter((l) => l.purpose === 'repair' || l.purpose === 'graded');
    const ctl = r.repair!.controller!;
    expect(ctl.decisions.map((d) => [d.action, d.outcome])).toEqual([['carrier-rewrite', 'not kept'], ['carrier-rewrite', 'not kept'], ['redraft', 'handed to a redraft']]);
    expect(ctl.decisions[0]).toMatchObject({ targets: ['p1'], expectedGain: 0.4, expectedCostUsd: 0.05 });
    expect(ctl.callsUsed).toBe(ledger.reduce((n, l) => n + l.calls, 0));
    expect(ctl.usdUsed).toBeCloseTo(ledger.reduce((n, l) => n + l.usd, 0), 9);
    expect(ctl.callsUsed).toBe(2); expect(ctl.usdUsed).toBeCloseTo(0.002, 9);
    expect(r.output).toBe(text);
  });
  it('the budget stop is recorded, and nothing is called', async () => {
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0.99, capUsd: 1 }, 'd', stdWith(0, value / 2), text, 2, opts());
    expect(writer.calls).toBe(0);
    expect(r.repair?.controller?.stoppedBecause).toMatch(/^the budget: carrier-rewrite would cost about \$0.05/);
    expect(r.repair?.controller?.decisions).toEqual([]);
  });
  it('an operator step moves a small miss with no model call, by the profile\'s effect matrix, when something else keeps the loop going', async () => {
    const conclusion = { requirementId: 'r1', statement: 'End with a Conclusion section.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE',
      measurement: { observer: 'PRESENCE', params: { sections: ['Conclusion'] } } };
    const profile: FidelityProfile = { version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: [],
      effects: { 'parenthetical-to-commas': { parenthesis: { mean: -2, n: 10 } } } } as unknown as FidelityProfile;
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 1.4, [conclusion]), text, 2, opts({ gradedProfile: profile }));
    expect(writer.calls).toBe(0);
    const first = r.repair?.controller?.decisions[0];
    expect(first).toMatchObject({ action: 'operators', targets: ['p1'], outcome: 'kept', expectedCostUsd: 0, observed: { calls: 0, usd: 0 } });
    expect(first?.observed.movement).toBeGreaterThan(0);
    expect((r.output.match(/\(/g) ?? []).length).toBeLessThan((text.match(/\(/g) ?? []).length);
  });
  it('the same draft and settings give the same steps', async () => {
    const run = () => refineToStandard(scripted([reps(asideS)]), { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 2), text, 2, opts({ controller: { redraft: true } }));
    expect((await run()).repair?.controller).toEqual((await run()).repair?.controller);
  });
});
