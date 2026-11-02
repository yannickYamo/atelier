// WHAT A RULE MAKES A READER FEEL IS READ, NOT MATCHED. The "effect" trait class came off a word list ("feel",
// "tension", "moving"), so a rule about the tension between two sources was filed as emotion and a rule about a last
// line landing was not. Here: the reading's answer counts only with a quote from the rule itself; the floor reads no
// words; the table carries what the reading said, and who said it.
import { describe, it, expect } from 'vitest';
import { RULE_EFFECT, effectInput } from '../core/composite/effect-reading.js';
import { readContext } from '../core/inference/reading.js';
import { buildTraitTable, primaryClassOf, traitClassesOf } from '../core/composite/traits.js';
import type { InferenceClient } from '../core/inference/client.js';
import type { Requirement } from '../core/state/canonical-state.js';

const scripted = (answer: unknown): InferenceClient => ({ complete: async () => ({ json: answer, text: '', cost: { usd: 0 } }) as never });
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 5 });
const rule = (id: string, statement: string, measurement?: Requirement['measurement']): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});

const LAND = rule('a1', 'Let the last line land before the reader can look away.');
const TENSION = rule('a2', 'Keep the tension between the two sources visible.');
const DREAD = rule('b1', 'Open on a scene that leaves the reader uneasy.');
const COUNT = rule('m1', 'Half the sentences run 8 words or fewer.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 8 } });

describe('the reading', () => {
  it('asks only about worded rules; nothing worded is decided by code', async () => {
    expect(effectInput([LAND, COUNT]).statements.map((s) => s.id)).toEqual(['a1']);
    const d = await readContext(RULE_EFFECT, effectInput([COUNT]), scripted({ rules: [] }), 'm', budget());
    expect(d).toMatchObject({ value: {}, by: 'code' });
  });
  it('an answer quoting the rule is kept; one quoting words the rule lacks, or an unknown id, is dropped', async () => {
    const answer = { rules: [
      { id: 'a1', weight: 'MAIN', quote: 'before the reader can  look away' },   // spacing and case are not the words
      { id: 'a2', weight: 'MAIN', quote: 'the reader feels the tension' },       // not in the rule
      { id: 'b1', weight: 'ALSO', quote: 'leaves the reader uneasy' },
      { id: 'zz', weight: 'MAIN', quote: 'land' },
    ] };
    const d = await readContext(RULE_EFFECT, effectInput([LAND, TENSION, DREAD]), scripted(answer), 'm', budget());
    expect(d.by).toBe('model');
    expect(d.value).toEqual({ a1: 'MAIN', b1: 'ALSO' });
  });
  it('an answer outside the shape is no reading: the floor decides, and says why', async () => {
    const d = await readContext(RULE_EFFECT, effectInput([LAND]), scripted({ nope: 1 }), 'm', budget());
    expect(d).toMatchObject({ value: {}, by: 'floor' });
    expect(d.why).toMatch(/could not be grounded/);
  });
  it('with no model the floor reads no words: no rule carries the effect class', async () => {
    const d = await readContext(RULE_EFFECT, effectInput([LAND, TENSION, DREAD]), null, null, budget());
    expect(d).toMatchObject({ value: {}, by: 'floor', why: 'no model set up' });
  });
});

describe('the classes', () => {
  it('a word of feeling no longer makes a rule about feeling', () => {
    // "tension" once filed this under emotion; its words are about evidence ("sources") alone now.
    expect(traitClassesOf(TENSION)).toEqual(['evidence']);
    expect(primaryClassOf(TENSION)).toBe('evidence');
  });
  it('MAIN makes effect what the rule is about; ALSO adds the class and leaves the main subject', () => {
    expect(primaryClassOf(LAND)).toBe('method');
    expect(primaryClassOf(LAND, 'MAIN')).toBe('effect');
    expect(traitClassesOf(LAND, 'MAIN')).toEqual(['effect']);
    expect(primaryClassOf(DREAD, 'ALSO')).toBe('opening');
    expect(traitClassesOf(DREAD, 'ALSO')).toEqual(['opening', 'effect']);
  });
  it('a counted rule is classed by its observer, whatever the reading says', () => {
    expect(primaryClassOf(COUNT, 'MAIN')).toBe('pace');
    expect(traitClassesOf(COUNT, 'MAIN')).toEqual(['pace']);
  });
});

describe('the table', () => {
  const sourceOf = (id: string): string => (id.startsWith('a') ? 'Ada' : 'Bea');
  it('keeps each rule\'s main subject and who read the effect', () => {
    const t = buildTraitTable([LAND, DREAD], sourceOf, () => null, { value: { a1: 'MAIN', b1: 'ALSO' }, by: 'model', reader: 'rule-effect-1:m' });
    expect(t.rows.map((r) => [r.id, r.primary, r.classes])).toEqual([['a1', 'effect', ['effect']], ['b1', 'opening', ['opening', 'effect']]]);
    expect(t.effect).toEqual({ by: 'model', reader: 'rule-effect-1:m' });
  });
  it('built with no reading, the table says the effect was not read', () => {
    const t = buildTraitTable([LAND, DREAD], sourceOf);
    expect(t.rows.map((r) => r.primary)).toEqual(['method', 'opening']);
    expect(t.effect).toMatchObject({ by: 'floor' });
  });
});
