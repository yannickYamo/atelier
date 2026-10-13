// What a person is told about a run: one word, one line.
import { describe, it, expect } from 'vitest';
import { runState } from '../core/eval/run-state.js';

describe('the three states are not interchangeable', () => {
  it('a required rule that was checked and failed blocks, and is named in the owner\'s words', () => {
    expect(runState({ applicable: 6, held: 5, judgement: 1, toCheck: 0, broken: [{ id: 'x7', label: 'Between 220 and 420 words.', detail: '469 words (220 to 420): long by 49' }] }))
      .toEqual({ state: 'BLOCKED', line: 'BLOCKED · 1 required rule not met: "Between 220 and 420 words." (469 words (220 to 420): long by 49)' });
    expect(runState({ applicable: 6, held: 4, judgement: 0, toCheck: 0, broken: [{ id: 'x1', detail: 'no "Verdict" section' }, { id: 'x2', detail: 'd' }] }).line)
      .toBe('BLOCKED · 2 required rules not met: x1 (no "Verdict" section), and 1 more');
  });
  it('everything checkable met, with a judgement step or a specific left: checked, never certified', () => {
    expect(runState({ applicable: 5, held: 5, judgement: 1, toCheck: 0, broken: [] })).toEqual({ state: 'CHECKED', line: 'CHECKED · 5 of 5 required rules checked and met · 1 rule left to your judgement' });
    expect(runState({ applicable: 5, held: 5, judgement: 0, toCheck: 3, broken: [] }).line).toBe('CHECKED · 5 of 5 required rules checked and met · 3 specifics to check');
    expect(runState({ applicable: 0, held: 0, judgement: 2, toCheck: 0, broken: [] }).state).toBe('CHECKED');
  });
  it('certified only when every required rule was checked and nothing is left to anyone', () => {
    expect(runState({ applicable: 4, held: 4, judgement: 0, toCheck: 0, broken: [] })).toEqual({ state: 'CERTIFIED', line: 'CERTIFIED · all 4 required rules checked and met' });
    expect(runState({ applicable: 0, held: 0, judgement: 0, toCheck: 0, broken: [] }).state).toBe('CHECKED');
  });
});

describe('what `atelier run` prints under the work', () => {
  const evalOf = (o: { applicable: number; held: number; broken?: { id: string; detail: string; label?: string }[]; unmeasured?: string | null }) =>
    ({ gates: { required: { applicable: o.applicable, held: o.held, broken: o.broken ?? [] }, claims: { unmeasured: o.unmeasured ?? null } } }) as never;
  const engine = (o: Parameters<typeof evalOf>[0], toCheck: string[] = [], report: string[] = []) => ({ output: 'the work', invocationId: 'i1', costUsd: 0.1, toCheck, report, eval: evalOf(o) });
  it('the state, then where to go: two lines for a run that needed nothing more', async () => {
    const { linesFor } = await import('../cli/commands/run.js');
    expect(linesFor(engine({ applicable: 5, held: 5 }), 1)).toEqual(['CHECKED · 5 of 5 required rules checked and met · 1 rule left to your judgement',
      'Not right? atelier fix "<what was wrong>" · everything this run checked: add --report']);
  });
  it('a run that was written again says so in plain words, and a blocked one is said to be not deliverable', async () => {
    const { linesFor } = await import('../cli/commands/run.js');
    const lines = linesFor(engine({ applicable: 6, held: 5, broken: [{ id: 'x7', label: 'Between 220 and 420 words.', detail: '425 words (220 to 420): long by 5' }] }, [], ['Written again: the first draft left out 2 thing(s) ...']), 1);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('BLOCKED · 1 required rule not met: "Between 220 and 420 words." (425 words (220 to 420): long by 5)');
    expect(lines[1]).toBe('It was written again once to meet your rules.');
    expect(lines[2]).toMatch(/^Not deliverable as it stands\./);
  });
  it('specifics are counted only where there was material to find them in', async () => {
    const { factsOf } = await import('../cli/commands/run.js');
    expect(factsOf(engine({ applicable: 3, held: 3, unmeasured: 'no material was bound to check against' }, ['a', 'b']), 0).toCheck).toBe(0);
    expect(factsOf(engine({ applicable: 3, held: 3, unmeasured: 'the claim check is not measured on analysis' }, ['a', 'b']), 0).toCheck).toBe(2);
  });
  it('a step of the method read as judgement is the owner\'s rule, and is counted', async () => {
    const { judgementRules } = await import('../cli/commands/run.js');
    const r = (o: object) => ({ requirementId: 'x', statement: 's', authority: 'USER_AUTHORED', ...o }) as never;
    expect(judgementRules([r({ obligation: 'JUDGEMENT' }), r({ materiality: 'REQUIRED' }), r({ materiality: 'REQUIRED', measurement: { observer: 'LENGTH', params: {} } }), r({ materiality: 'PREFERRED' }), r({ obligation: 'JUDGEMENT', authority: 'EXPERT_REJECTED' })])).toBe(2);
  });
});
