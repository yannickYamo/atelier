// A STEP'S CHECK IS FROZEN WHEN THE SKILL IS BUILT, keyed by the step's words and the examples: a rebuild reuses it,
// qualification and all, and reads only what changed. Rewording one step changes that step's key and no other; changing
// the examples changes every key; a check no model read is never frozen.
import { describe, it, expect } from 'vitest';
import { examplesKey, freezeKey, frozenFor, toFreeze } from '../core/method/freeze.js';
import type { StepCheck, ExampleCase } from '../core/method/step-check.js';

const cases: ExampleCase[] = [{ id: 'e1', task: 'Draft the memo.', material: [{ name: 'policy', text: 'Clause 4.2' }], reference: '## Summary\nCovered.\n' }];
const steps = [{ id: '1', text: 'Open with a Summary section.', under: null }, { id: '2', text: 'Cite the clause.', under: null }];
const written: StepCheck = { how: 'written', measurement: { observer: 'CHECK', params: { source: ['(t) => ({ ok: true })'], means: ['x'] } }, quote: 'Cite the clause', means: 'x', by: 'model',
  qualification: { examples: { passed: 1, read: 1, of: 1 }, own: { caught: 2, of: 2 }, cross: { fired: 0, of: 1 }, qualified: true, why: null } };
const measured: StepCheck = { how: 'measure', measurement: { observer: 'PRESENCE', params: { sections: ['summary'], opens: 1 } }, quote: 'Open with a Summary', means: 'PRESENCE', by: 'model' };
const floor: StepCheck = { how: 'judgement', measurement: null, quote: 'x', means: 'yours to judge', by: 'floor' };

describe('the key', () => {
  it('the same step and examples give the same key; another wording or other examples another', () => {
    const k = examplesKey(cases);
    expect(examplesKey(cases)).toBe(k);
    expect(freezeKey('Cite the clause.', k)).toBe(freezeKey('Cite the clause.  ', k));
    expect(freezeKey('Cite the policy clause.', k)).not.toBe(freezeKey('Cite the clause.', k));
    expect(examplesKey([{ ...cases[0], reference: '## Summary\nDeclined.\n' }])).not.toBe(k);
    expect(examplesKey([{ ...cases[0], material: [{ name: 'policy', text: 'Clause 4.5' }] }])).not.toBe(k);
  });
});

describe('what is frozen and what is reused', () => {
  const k = examplesKey(cases);
  it('a model\'s checks are frozen with their qualification; the floor\'s are not', () => {
    const f = toFreeze(steps, { 1: measured, 2: written }, k);
    expect(Object.keys(f)).toHaveLength(2);
    expect(f[freezeKey('Cite the clause.', k)].qualification?.qualified).toBe(true);
    expect(toFreeze(steps, { 1: floor, 2: written }, k)).not.toHaveProperty(freezeKey('Open with a Summary section.', k));
  });
  it('a rebuild reuses the unchanged steps and leaves the reworded one to be read', () => {
    const f = toFreeze(steps, { 1: measured, 2: written }, k);
    const again = frozenFor([steps[0], { id: '2', text: 'Cite the policy clause the loss falls under.', under: null }], k, f);
    expect([...again.keys()]).toEqual(['1']);
    expect(again.get('1')).toMatchObject({ how: 'measure', frozen: true });
    expect(frozenFor(steps, examplesKey([{ ...cases[0], reference: 'other' }]), f).size).toBe(0);
  });
});
