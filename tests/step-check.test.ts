// tests/step-check.test.ts — THE CHECK A STEP ASKS FOR: A MODEL ANSWERS, CODE GROUNDS, THE FLOOR IS JUDGEMENT.
import { describe, it, expect } from 'vitest';
import { STEP_CHECK, planOf, stepCheckInput, judgement, type StepCheckInput, type StepCheck } from '../core/method/step-check.js';
import { readContext } from '../core/inference/reading.js';
import { outlineOf, methodProposals } from '../core/method/standard.js';
import { countWords } from '../core/eval/size.js';

const EXAMPLE = '## Verdict\n\nBorealis wins for a small team.\n\n## Risks\n\nEither vendor can change its list price. The migration takes 3 days.\n';
const steps = [
  { id: '1', text: 'Open with a Verdict section that says who wins.', under: null },
  { id: '2', text: 'Every time estimate carries a unit.', under: null },
  { id: '3', text: 'Weigh switching cost before recommending anything.', under: null },
  { id: '4', text: 'Never use the words leverage or synergy.', under: null },
];
const input: StepCheckInput = stepCheckInput(steps, [{ id: 'e1', task: 'Compare the two.', material: [], reference: EXAMPLE }], outlineOf, countWords);
const UNITS = '(text) => { const bare = [...text.matchAll(/\\b(\\d+)\\s*(min|minutes|h|hours|days?|weeks?)?\\b/g)].filter((m) => !m[2]); return { ok: bare.length === 0, detail: bare.length + " bare", spans: bare.map((m) => ({ start: m.index, end: m.index + m[0].length })) }; }';
const answer = (checks: Record<string, unknown>[]): unknown => ({ checks });

describe('grounding the reading', () => {
  it('a measurement line parses, validates and runs on the example; a written check compiles and runs; judgement is judgement', () => {
    const v = STEP_CHECK.ground(answer([
      { id: '1', how: 'measure', measure: 'PRESENCE:sections=Verdict,body=1,opens=1', source: null, quote: 'Open with a Verdict section', means: 'a Verdict section opens the work' },
      { id: '2', how: 'written', measure: null, source: UNITS, quote: 'time estimate carries a unit', means: 'every time estimate has a unit' },
      { id: '3', how: 'judgement', measure: null, source: null, quote: 'Weigh switching cost', means: 'yours to judge' },
      { id: '4', how: 'measure', measure: 'LEXICON:leverage|synergy', source: null, quote: 'leverage or synergy', means: 'none of leverage, synergy' },
    ]), input)!;
    expect(v['1']).toMatchObject({ how: 'measure', by: 'model', measurement: { observer: 'PRESENCE', params: { sections: ['Verdict'], body: 1, opens: 1 } } });
    expect(v['2']).toMatchObject({ how: 'written', by: 'model', measurement: { observer: 'CHECK', params: { means: ['every time estimate has a unit'] } } });
    expect(v['3']).toMatchObject({ how: 'judgement', by: 'model', measurement: null });
    expect(v['4']).toMatchObject({ how: 'measure', measurement: { observer: 'LEXICON', params: { terms: ['leverage', 'synergy'] } } });
  });
  it('an answer that quotes nothing of the step, names a measurement that does not parse, or writes a check that does not compile, falls to judgement and says why', () => {
    const v = STEP_CHECK.ground(answer([
      { id: '1', how: 'measure', measure: 'PRESENCE:sections=Verdict', source: null, quote: 'words not in the step', means: 'x' },
      { id: '2', how: 'measure', measure: 'PRESENCE:sectionz=Verdict', source: null, quote: 'time estimate', means: 'x' },
      { id: '3', how: 'written', measure: null, source: '(t) => {', quote: 'Weigh switching cost', means: 'x' },
      { id: '4', how: 'written', measure: null, source: '(t) => { throw new Error("no"); }', quote: 'leverage', means: 'x' },
    ]), input)!;
    expect(v['1']).toMatchObject({ how: 'judgement', by: 'floor', means: 'the reader quoted nothing of the step' });
    expect(v['2']).toMatchObject({ how: 'judgement', by: 'floor', means: expect.stringContaining('could not be read') as string });
    expect(v['3']).toMatchObject({ how: 'judgement', by: 'floor', means: expect.stringContaining('could not be compiled') as string });
    expect(v['4']).toMatchObject({ how: 'judgement', by: 'floor', means: expect.stringContaining('throws on your example') as string });
  });
  it('a step the reader said nothing of is judgement; a malformed answer is no answer; the floor is judgement for every step, by no pattern', async () => {
    const v = STEP_CHECK.ground(answer([{ id: '1', how: 'judgement', measure: null, source: null, quote: 'Open with', means: 'x' }]), input)!;
    expect(v['2']).toMatchObject({ how: 'judgement', by: 'floor', means: 'the reader said nothing of this step' });
    expect(STEP_CHECK.ground({ nope: 1 }, input)).toBeNull();
    expect(STEP_CHECK.ground(answer([{ id: '9', how: 'measure', measure: 'LEXICON:x', source: null, quote: 'x', means: 'x' }]), input)).toBeNull();
    const d = await readContext(STEP_CHECK, input, null, null, { spentUsd: 0, capUsd: 1 });
    expect(d.by).toBe('floor');
    expect(Object.values(d.value).every((c) => c.how === 'judgement' && c.measurement === null)).toBe(true);
    expect(STEP_CHECK.decide({ ...input, steps: [] })).toEqual({});
  });
  it('the parts of a compound step (3, 3b) are answers about step 3, and a written check wins over a section check and judgement', () => {
    const v = STEP_CHECK.ground(answer([
      { id: '2', how: 'measure', measure: 'PRESENCE:sections=Risks,body=1', source: null, quote: 'time estimate', means: 'a section' },
      { id: '2b', how: 'written', measure: null, source: UNITS, quote: 'carries a unit', means: 'every time estimate has a unit' },
      { id: '2c', how: 'judgement', measure: null, source: null, quote: 'time estimate', means: 'the rest' },
    ]), input)!;
    expect(v['2']).toMatchObject({ how: 'written', means: 'every time estimate has a unit' });
    expect(v['1']).toMatchObject({ how: 'judgement', by: 'floor' });
  });
  it('a measurement the reader marks as near the step is carried as related: shown, not enforced', () => {
    const v = STEP_CHECK.ground(answer([{ id: '3', how: 'measure', measure: 'CITED:allow=0', source: null, quote: 'Weigh switching cost', means: 'figures in the material', near: true }]), input)!;
    expect(v['3']).toMatchObject({ how: 'measure', near: true });
    const plan = planOf(steps, v);
    const p = methodProposals(steps.map((s) => `- ${s.text}\n`).join(''), { task: 'Compare the two.', material: [], reference: EXAMPLE }, plan);
    expect(p.find((x) => x.statement.startsWith('Weigh'))).toMatchObject({ related: true, measurement: { observer: 'CITED' } });
  });
});

describe('the input a build hands the reading', () => {
  it('joins every example\'s sections and tables, shows the richest example, and says whether material was given', () => {
    const cases = [
      { id: 'a', task: 'x', material: [], reference: '## Summary\n\nOne.\n' },
      { id: 'b', task: 'y', material: [{ name: 'm', text: 't' }], reference: '## Summary\n\nTwo.\n\n## Risks\n\nThree.\n\n| Vendor | Price |\n|---|---|\n| a | 1 |\n' },
    ];
    const i = stepCheckInput(steps, cases, outlineOf, countWords);
    expect(i.example.sections).toEqual(['Summary', 'Risks']);
    expect(i.example.tables.map((t) => t.header)).toEqual([['vendor', 'price']]);
    expect(i.example.hasMaterial).toBe(true);
    expect(i.example.request).toBe('y');
    expect(i.material).toEqual([{ name: 'm', text: 't' }]);
    expect(STEP_CHECK.prompt(i)).toContain('```json');
  });
  it('a plan is keyed by the step\'s text, and a step with no answer is judgement', () => {
    const plan = planOf(steps, { '1': judgement(steps[0], 'model') });
    expect(plan.get(steps[0].text)?.by).toBe('model');
    expect(plan.get(steps[1].text)).toMatchObject({ how: 'judgement', by: 'floor' });
  });
});

// THE LEDGER OF A METHOD'S CHECKS, for the build receipt: how many steps a check holds, which written checks failed and
// why, and who decided (a model, code for a ban, else the floor).
describe('the ledger of the checks', () => {
  it('counts the steps checked, names each failed written check by its step, and says who decided', async () => {
    const { ledgerOf, dashBan } = await import('../core/method/step-check.js');
    const ban = { id: '5', text: 'Never use em dashes.', under: null };
    const all = [...steps, ban];
    const checks: Record<string, StepCheck> = {
      '1': { how: 'measure', measurement: { observer: 'PRESENCE', params: { sections: ['Verdict'] } }, quote: 'Verdict', means: 'm', by: 'model' },
      '2': { ...judgement(steps[1], 'floor', 'the written check throws on your example (Cannot access x)'), attempt: { source: 'x', problem: 'throws on the example: Cannot access x' } },
      '3': judgement(steps[2], 'model', 'weigh it'),
      '4': { ...judgement(steps[3], 'floor', 'the written check could not be compiled (bad)'), attempt: { source: 'y', problem: 'bad' } },
      '5': dashBan(ban)!,
    };
    expect(ledgerOf(all, planOf(all, checks))).toEqual({ steps: 5, checked: 2, by: 'model', failed: ['step 2: the written check throws on your example (Cannot access x)', 'step 4: the written check could not be compiled (bad)'], conflicts: [] });
    expect(ledgerOf(all, planOf(all, {}), ['1 ban over an examples\' rate'])).toEqual({ steps: 5, checked: 1, by: 'code', failed: [], conflicts: ['1 ban over an examples\' rate'] });
    expect(ledgerOf(steps, planOf(steps, {}))).toEqual({ steps: 4, checked: 0, by: 'floor', failed: [], conflicts: [] });
  });
});
