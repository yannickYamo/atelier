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
import { setGrammarProvider, resetGrammar, ensureGrammar, setGrammarFixing } from '../core/observers/grammar.js';
import { stubGrammar } from '../providers/grammar.js';
import { expectOneCounter } from './one-counter.js';

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
  it('through decide: each level; a miss at or under 0.5 widths is no target of any step, even with an enforced rule keeping the loop going', () => {
    // an omission with no redraft to be had keeps the loop going and is not itself a target; the 0.4 miss is not one either
    const held = { enforced: [{ id: 'r9', kind: 'omission' as const }], can: { redraft: false, rewrite: true } };
    const small = decide(input({ ...held, graded: [{ id: 'g1', error: 0.4, operatorEffect: 0.2 }] }));
    expect(small).toMatchObject({ kind: 'stop' });
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
  it('a failed step is never repeated on its target: a redraft that did no better gives way to a carrier rewrite, then the operators, then a stop naming the failures', () => {
    const far = { graded: [{ id: 'g', error: 2.0, operatorEffect: 0.3 }] };
    expect(decide(input(far))).toMatchObject({ action: 'redraft' });
    const r1 = [step('redraft', ['g'], 'not kept')];
    const d1 = decide(input({ ...far, history: r1 }));
    // the carrier rewrite, sized to the miss (ceil 2.0 = 2 sentences), and the switch said with its reason
    expect(d1).toMatchObject({ kind: 'act', action: 'carrier-rewrite', targets: ['g'], carriers: 2 });
    expect((d1 as { why: string }).why).toMatch(/; switched to it because redraft on g not kept$/);
    const r2 = [...r1, { ...step('carrier-rewrite', ['g'], 'not kept'), observed: { movement: 0, calls: 1, usd: 0.05, note: 'it displaced what your pieces hold' } }];
    const d2 = decide(input({ ...far, history: r2 }));
    expect(d2).toMatchObject({ action: 'operators', targets: ['g'] });
    expect((d2 as { why: string }).why).toContain('carrier-rewrite on g not kept (it displaced what your pieces hold)');
    const r3 = [...r2, step('operators', ['g'], 'no change', 0, 0, 0)];
    expect(decide(input({ ...far, history: r3 }))).toEqual({ kind: 'stop', why: 'every action tried failed on what is left: g (redraft, carrier-rewrite, operators)' });
    // the carrier rewrite is capped at three sentences however far out
    expect(decide(input({ graded: [{ id: 'g', error: 5, operatorEffect: null }], history: r1 }))).toMatchObject({ action: 'carrier-rewrite', carriers: 3 });
  });
  it('a carrier rewrite that fails steps down to the operators, then stops', () => {
    const mid = { graded: [{ id: 'g', error: 0.8, operatorEffect: 0.2 }] };
    expect(decide(input(mid))).toMatchObject({ action: 'carrier-rewrite' });
    const c1 = [step('carrier-rewrite', ['g'], 'not kept')];
    expect(decide(input({ ...mid, history: c1 }))).toMatchObject({ action: 'operators', targets: ['g'] });
    expect(decide(input({ ...mid, history: [...c1, step('operators', ['g'], 'no change', 0, 0, 0)] })))
      .toEqual({ kind: 'stop', why: 'every action tried failed on what is left: g (carrier-rewrite, operators)' });
  });
  it('a carrier rewrite that failed once is not repeated; one that moved something is', () => {
    const once = [step('carrier-rewrite', ['g'], 'not kept')];
    expect(decide(input({ ...miss, history: once }))).toMatchObject({ kind: 'stop', why: 'every action tried failed on what is left: g (carrier-rewrite)' });
    expect(decide(input({ ...miss, history: [step('carrier-rewrite', ['g'], 'kept', 0.3)] }))).toMatchObject({ action: 'carrier-rewrite' });
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
    const stuck = { enforced: [{ id: 'r', kind: 'span' as const }], history: [step('rewrite', ['r'], 'not kept')] };
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
    expectOneCounter(r.repair?.controller, writer.calls);
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
    expectOneCounter(r.repair?.controller, writer.calls);
    expect(r.repair?.controller?.decisions.map((d) => [d.action, d.targets, d.outcome])).toEqual([['redraft', ['r1'], 'handed to a redraft']]);
    expect(r.repair?.controller?.stoppedBecause).toMatch(/^handed to a redraft: 1 enforced rule\(s\) need something the draft does not have/);
  });
  const failedRedraft: ControllerDecisionRecord = { action: 'redraft', targets: ['p1'], why: 'far', expectedGain: 1, expectedCostUsd: 0.4, outcome: 'not kept', observed: { movement: 0, calls: 1, usd: 0.3, note: 'one more draft did not do better' } };
  it('after a redraft that did no better, a carrier rewrite is tried on the same target and kept when it helps', async () => {
    // two widths out (a band a third of the value): the redraft failed, so two carrier sentences are rewritten without asides
    const writer = scripted([reps(asideS.replace(/[()]/g, ''))]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 3), text, 2, opts({ controller: { redraft: true, history: [failedRedraft] } }));
    const ctl = r.repair!.controller!;
    expectOneCounter(ctl, writer.calls, [failedRedraft]);
    expect(ctl.decisions[0]).toMatchObject({ action: 'carrier-rewrite', targets: ['p1'], outcome: 'kept' });
    expect(ctl.decisions[0].why).toMatch(/switched to it because redraft on p1 not kept \(one more draft did not do better\)/);
    expect(ctl.decisions[0].observed.movement).toBeGreaterThan(0);
    // the history is the caller's: only this piece's own steps are recorded here
    expect(ctl.decisions.some((d) => d.action === 'redraft')).toBe(false);
    expect((r.output.match(/\(/g) ?? []).length).toBeLessThan((text.match(/\(/g) ?? []).length);
  });
  it('a target every action fails on ends the repair with a stop naming the failures; each step\'s cost is the ledger\'s', async () => {
    // the writer returns the spans as they were, so the carrier rewrite moves nothing; no effect matrix, so no operators
    const writer = scripted([reps(asideS)]);
    const before = processSpendByPurpose();
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 3), text, 2, opts({ controller: { redraft: true, history: [failedRedraft] } }));
    const ledger = spendBetween(before, processSpendByPurpose()).filter((l) => l.purpose === 'repair' || l.purpose === 'graded');
    const ctl = r.repair!.controller!;
    expectOneCounter(ctl, writer.calls, [failedRedraft]);
    expect(ctl.decisions.map((d) => [d.action, d.outcome])).toEqual([['carrier-rewrite', 'not kept']]);
    expect(ctl.decisions[0]).toMatchObject({ targets: ['p1'], expectedCostUsd: 0.05 });
    expect(ctl.stoppedBecause).toBe('every action tried failed on what is left: p1 (redraft, carrier-rewrite)');
    expect(ctl.callsUsed).toBe(ledger.reduce((n, l) => n + l.calls, 0));
    expect(ctl.usdUsed).toBeCloseTo(ledger.reduce((n, l) => n + l.usd, 0), 9);
    expect(ctl.callsUsed).toBe(1); expect(ctl.usdUsed).toBeCloseTo(0.001, 9);
    expect(r.output).toBe(text);
  });
  it('by default there is no grammar step: the slip is listed on the rule\'s line and left as written', async () => {
    resetGrammar(); setGrammarProvider(stubGrammar); await ensureGrammar();
    const faulty = text.replace(plainS, 'They seperate the rule from this case, whatever the reader brings to it.');
    const v0 = featureOf('parenthesis')!.measure(faulty)!;
    const g1 = { requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', kind: 'BOUNDARY',
      measurement: { observer: 'GRAMMAR', params: {} } };
    const writer = scripted([reps('The rule holds here, as it did last year, and it holds there too, most of the time, at least.')]);
    const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, v0 / 2, [g1]), faulty, 2, opts());
    expectOneCounter(r.repair?.controller, writer.calls);
    expect(r.repair!.controller!.decisions.map((d) => d.action)).not.toContain('grammar');
    expect(r.output).toContain('They seperate the rule from this case');
    const line = r.report.checked.find((c) => c.requirementId === 'g1');
    expect(line?.result).toMatchObject({ verdict: 'NOT_APPLICABLE', detail: expect.stringMatching(/^listed for you to check: 1 possible slip: "seperate"/) });
    expect(r.repair?.violatedAfter ?? []).not.toContain('g1');
  });
  it('under --fix-grammar, one mechanical error and one graded miss: the graded miss is moved first, then the error corrected in place, with no call for it', async () => {
    resetGrammar(); setGrammarProvider(stubGrammar); await ensureGrammar(); setGrammarFixing(true);
    try {
      const faulty = text.replace(plainS, 'They seperate the rule from this case, whatever the reader brings to it.');
      const v0 = featureOf('parenthesis')!.measure(faulty)!;
      const g1 = { requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', kind: 'BOUNDARY',
        measurement: { observer: 'GRAMMAR', params: {} } };
      // the writer turns the asides of the carrier sentences it is given into commas, every word kept: the rate falls
      const writer = scripted([reps('The rule holds here, as it did last year, and it holds there too, most of the time, at least.')]);
      const r = await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, v0 / 2, [g1]), faulty, 2, opts());
      expectOneCounter(r.repair?.controller, writer.calls);
      const steps = r.repair!.controller!.decisions.map((d) => [d.action, d.targets, d.outcome]);
      expect(steps[0]).toEqual(['carrier-rewrite', ['p1'], 'kept']);
      const at = steps.findIndex((d) => d[0] === 'grammar');
      expect(at).toBeGreaterThan(0);
      expect(steps[at]).toEqual(['grammar', ['g1'], 'kept']);
      expect(r.repair!.controller!.decisions[at]).toMatchObject({ expectedCostUsd: 0, observed: { calls: 0, usd: 0 } });
      expect(r.output).toContain('They separate the rule from this case');
      expect(r.repair?.violatedAfter).toEqual([]);
    } finally { setGrammarFixing(false); }
  });
  it('through decide: grammar comes after enforced rules, length and graded misses, is free, and is never chosen for nothing', () => {
    const graded = [{ id: 'p', error: 1.0, operatorEffect: null }];
    expect(decide(input({ graded, grammar: ['g'] }))).toMatchObject({ action: 'carrier-rewrite', targets: ['p'] });
    expect(decide(input({ enforced: [{ id: 'r', kind: 'span' }], grammar: ['g'] }))).toMatchObject({ action: 'rewrite', targets: ['r'] });
    // alone, with no model call left, it is still taken: it costs nothing and calls nothing
    expect(decide(input({ grammar: ['g'], budget: { usdLeft: 0, callsLeft: 0 }, can: { redraft: false, rewrite: false } })))
      .toMatchObject({ kind: 'act', action: 'grammar', targets: ['g'], expectedCostUsd: 0, expectedGain: 2 });
    expect(decide(input({ grammar: [] }))).toMatchObject({ kind: 'stop' });
    expect(decide(input({ grammar: ['g'], unreachable: new Set(['g']) }))).toMatchObject({ kind: 'stop' });
    // a grammar step that failed is not repeated, on this draft or carried from the one before
    expect(decide(input({ grammar: ['g'], history: [step('grammar', ['g'], 'not kept', 0, 0, 0)] }))).toMatchObject({ kind: 'stop' });
    expect(decide(input({ grammar: ['g', 'h'], history: [step('grammar', ['g'], 'no change', 0, 0, 0)] }))).toMatchObject({ action: 'grammar', targets: ['h'] });
  });
  it('the budget stop is recorded, and nothing is called', async () => {
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0.99, capUsd: 1 }, 'd', stdWith(0, value / 2), text, 2, opts());
    expect(writer.calls).toBe(0);
    expectOneCounter(r.repair?.controller, writer.calls);
    expect(r.repair?.controller?.stoppedBecause).toMatch(/^the budget: carrier-rewrite would cost about \$0.05/);
    // the step the budget refused is on the record as refused, and is no step (core/loop/controller.ts, rule B)
    expect(r.repair?.controller?.decisions.map((d) => [d.action, d.outcome, d.observed.calls])).toEqual([['carrier-rewrite', 'refused', 0]]);
    expect(r.repair?.controller?.decisions[0]?.observed.note).toMatch(/^the budget: carrier-rewrite would cost about \$0.05/);
  });
  it('an operator step moves a miss with no model call, by the profile\'s effect matrix, when the budget holds no model call', async () => {
    const profile: FidelityProfile = { version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: [],
      effects: { 'parenthetical-to-commas': { parenthesis: { mean: -2, n: 10 } } } } as unknown as FidelityProfile;
    const writer = scripted([reps('x')]);
    const r = await refineToStandard(writer, { spentUsd: 0.99, capUsd: 1 }, 'd', stdWith(0, value / 2), text, 2, opts({ gradedProfile: profile }));
    expect(writer.calls).toBe(0);
    expectOneCounter(r.repair?.controller, writer.calls);
    // the carrier rewrite the budget refused is on the record first, as refused; the free step is the first taken
    expect(r.repair?.controller?.decisions[0]).toMatchObject({ action: 'carrier-rewrite', outcome: 'refused' });
    const first = r.repair?.controller?.decisions.find((d) => d.outcome !== 'refused');
    expect(first).toMatchObject({ action: 'operators', targets: ['p1'], outcome: 'kept', expectedCostUsd: 0, observed: { calls: 0, usd: 0 } });
    expect(first?.why).toMatch(/^the budget: carrier-rewrite would cost about \$0\.05.*; the operators still run, no model/);
    expect(first?.observed.movement).toBeGreaterThan(0);
    expect((r.output.match(/\(/g) ?? []).length).toBeLessThan((text.match(/\(/g) ?? []).length);
  });
  it('the same draft and settings give the same steps', async () => {
    const writer = scripted([reps(asideS)]);
    expectOneCounter((await refineToStandard(writer, { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 3), text, 2, opts({ controller: { redraft: true, history: [failedRedraft] } }))).repair?.controller, writer.calls, [failedRedraft]);
    const run = () => refineToStandard(scripted([reps(asideS)]), { spentUsd: 0, capUsd: 1 }, 'd', stdWith(0, value / 3), text, 2, opts({ controller: { redraft: true, history: [failedRedraft] } }));
    expect((await run()).repair?.controller).toEqual((await run()).repair?.controller);
  });
});
