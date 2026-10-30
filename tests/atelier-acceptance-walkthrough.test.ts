// tests/atelier-acceptance-walkthrough.test.ts — WHAT A PERSON SEES, IN THE SITUATIONS THAT MATTER, BEFORE PHASE F.
//
// One file, one scenario each, read as the person would meet it. Every expected value is read off the scenario, never
// off the code under test. These close a round of fixes; the scenarios
// that need a model or a judge (an absent capability asserted about a competitor) are on the roadmap, not here.
import { describe, it, expect } from 'vitest';
import { applyStep } from '../core/loop/repair.js';
import { stepLedger } from '../core/loop/controller.js';
import { decide, type ControllerInput } from '../core/loop/controller.js';
import { verifyText } from '../core/observers/verify.js';
import { buildRecord } from '../core/eval/record-build.js';
import { GRAMMAR_NOT_RUN } from '../core/observers/grammar.js';
import { statedLength, statedBounds } from '../core/intake/length.js';
import { tellOffers, grammarOffer, countedOffers } from '../core/method/standard.js';
import { shortFormTransfer } from '../core/observers/short-form.js';
import { groupByStyle } from '../core/composite/voices.js';
import { measure } from '../core/observers/registry.js';
import { statedFigureClaims } from '../core/loop/claims.js';
import type { ControllerDecisionRecord, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';
import { GOOD } from './fixtures/shortform.js';
import { FIVE_VOICES, FIVE_GROUPS } from './fixtures/composite/five-voices.js';

const NONE = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const read = (t: string) => verifyText('d', NONE, t);
const words = (n: number): string => Array.from({ length: n }, (_, i) => `point${i}`).join(' ') + '.';
const PLAN = { action: 'rewrite' as const, targets: ['x'], why: 'w', expectedGain: 1, expectedCostUsd: 0 };

describe('1. a 1,000-word analysis is shortened by a repair', () => {
  it('a change that takes it below what was asked is not kept, and says why', async () => {
    const asked = statedLength('Write a 1,000-word analysis of the market.');
    const floor = asked ? statedBounds(asked)[0] : null;
    expect(floor).toBeGreaterThan(0);
    const r = await applyStep(stepLedger(null, null, [], ''), PLAN, { text: words(600), report: read(words(600)) },
      async () => ({ text: words(400), report: read(words(400)) }), { purposes: ['repair'], floorWords: floor });
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/below the \d+ the request asks for/);
  });
});

describe('1b. a 1,000-word analysis drafted at 1,300 words is cut to its length', () => {
  // The request asks for 1,000 words, held to its ten-per-cent band: 900 to 1,100. A cut aimed at the request's length
  // may cut down to the band, never through it: 700 words is less than was asked; 1,050 is inside it.
  const asked = statedLength('Write a 1,000-word analysis');
  const floor = asked ? statedBounds(asked)[0] : null;
  const AIMED = { action: 'redraft' as const, targets: ['request-length'], why: 'the draft is longer than asked', expectedGain: 1, expectedCostUsd: 0 };
  it('a length step that takes it to 700 words is not kept, and says it is below what was asked', async () => {
    expect(floor).toBe(900);
    const r = await applyStep(stepLedger(null, null, [], ''), AIMED, { text: words(1300), report: read(words(1300)) },
      async () => ({ text: words(700), report: read(words(700)) }), { purposes: ['repair'], floorWords: floor });
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/below the 900 the request asks for/);
  });
  it('a claim redraft that would drop it to 700 words is held to the same floor', async () => {
    const r = await applyStep(stepLedger(null, null, [], ''), { ...AIMED, action: 'claim-redraft' as const, targets: ['UNSOURCED'] },
      { text: words(1300), report: read(words(1300)) },
      async () => ({ text: words(700), report: read(words(700)) }), { purposes: ['repair'], floorWords: floor });
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/below the 900 the request asks for/);
  });
  it('a length step from 1,300 to 1,050 words is kept', async () => {
    const r = await applyStep(stepLedger(null, null, [], ''), AIMED, { text: words(1300), report: read(words(1300)) },
      async () => ({ text: words(1050), report: read(words(1050)) }), { purposes: ['repair'], floorWords: floor });
    expect(r.kind === 'judged' && r.kept).toBe(true);
  });
});

describe('2. the grammar checker is unavailable', () => {
  it('the standard reads VERIFIED, and grammar is said to be not checked, never claimed', () => {
    const rule = aRequirement({ requirementId: 'x1', statement: 'Between 100 and 400 words.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 100, max: 400 } } });
    const grammar = aRequirement({ requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.', authority: 'EXPERT_RATIFIED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'GRAMMAR', params: {} } });
    const r = buildRecord({ requirements: [rule, grammar], checked: [{ id: 'x1', required: true, verdict: 'MET', detail: '250 words' }, { id: 'g1', required: true, verdict: 'NOT_APPLICABLE', detail: `${GRAMMAR_NOT_RUN}: could not load` }],
      waived: new Map(), request: null, claims: null, copying: null });
    expect(r.state).toBe('VERIFIED');
    const g = r.entries.find((e) => e.id === 'g1');
    expect(g?.result).not.toBe('PASS');
    expect(g?.observation.evidence).toBe('grammar not checked: could not load');
  });
});

describe('3. five short examples carry no hashtags', () => {
  it('no ban on hashtags is made: the band steers, and nothing learned is required', () => {
    const cases = GOOD.slice(0, 5).map((reference, i) => ({ id: `t${i}`, reference }));
    const counted = countedOffers([], cases);
    const offered = [...tellOffers(cases), ...grammarOffer(cases, counted), ...counted];
    const hashtags = offered.filter((p) => p.measurement?.observer === 'SHAPE' && (p.measurement.params.shape as string[])[0] === 'hashtags');
    expect(hashtags.length).toBeGreaterThan(0);
    expect(hashtags.some((p) => p.required)).toBe(false);
  });
});

describe('4. twenty tweets establish an author\'s voice', () => {
  it('a tell they never use fails at tweet length; every one of their own tweets passes', () => {
    const cases = GOOD.map((reference, i) => ({ id: `t${i}`, reference }));
    const tell = tellOffers(cases).find((p) => p.measurement?.params.role)?.measurement;
    expect(tell).toBeDefined();
    if (!tell) return;
    expect(measure('Shipping beats planning. Every time. No exceptions.', tell).verdict).toBe('VIOLATED');
    expect(GOOD.filter((t) => measure(t, tell).verdict === 'VIOLATED')).toEqual([]);
  });
});

describe('5. one tweet-shape rule beside long-form rules', () => {
  it('each rule keeps its scope on a short post: the long-form band does not apply, the shape rule does', () => {
    const req = (id: string, measurement: Requirement['measurement']): Requirement => aRequirement({ requirementId: id, statement: id, materiality: 'PREFERRED', ...(measurement ? { measurement } : {}) });
    const std = [req('para', { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } }), req('shape', { observer: 'SHAPE', params: { shape: ['hashtags'], max: 0 } })];
    const t = shortFormTransfer(std, null, 'a post on X');
    expect(t?.doesNotApply.has('para')).toBe(true);
    expect(t?.doesNotApply.has('shape')).toBe(false);
  });
});

describe('6. several writers who disagree', () => {
  it('each voice is found from the writing, and none is averaged into another', () => {
    const g = groupByStyle(Object.entries(FIVE_VOICES).map(([id, text]) => ({ id, text })));
    expect(g.groups.map((x) => [...x.pieces].sort())).toEqual(FIVE_GROUPS.map((x) => [...x].sort()));
  });
});

describe('7. a style change that would invent a figure', () => {
  it('is refused, and the figure is named', async () => {
    const before = 'Retries need a budget, and the team agreed on one.';
    const after = `${before} Retries cut errors by 37%.`;
    const r = await applyStep(stepLedger(null, null, [], ''), { ...PLAN, action: 'steer' }, { text: before, report: read(before) },
      async () => ({ text: after, report: read(after) }), { purposes: ['steering'] });
    expect(r.kind === 'judged' && r.kept).toBe(false);
    expect(r.kind === 'judged' ? r.why : '').toMatch(/added a figure .*\(37\)/);
  });
});

describe('8. a review states a figure the material does not hold', () => {
  it('the figure is listed for the person, and a line reference is not', () => {
    const diff = 'diff --git a/retry.ts b/retry.ts\n+  retry(3)';
    expect(statedFigureClaims('The change is correct. One risk: 95% of callers hit the retry path on line 40.', diff)).toHaveLength(1);
    expect(statedFigureClaims('Line 40 adds the loop.', diff)).toEqual([]);
  });
});

describe('9. repairs that keep failing', () => {
  it('stop with a truthful reason instead of paying again for the same action', () => {
    const step = (action: ControllerDecisionRecord['action'], outcome: ControllerDecisionRecord['outcome']): ControllerDecisionRecord =>
      ({ action, targets: ['g'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome, observed: { movement: 0, calls: 1, usd: 0.05 } });
    const input: ControllerInput = { enforced: [], claims: 0, length: null, graded: [{ id: 'g', error: 2.5, operatorEffect: 0.2 }], grammar: null,
      budget: { usdLeft: 1, callsLeft: null }, observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set(),
      history: [step('redraft', 'not kept'), step('carrier-rewrite', 'not kept'), step('operators', 'no change')] };
    expect(decide(input)).toEqual({ kind: 'stop', why: 'every action tried failed on what is left: g (redraft, carrier-rewrite, operators)' });
  });
});
