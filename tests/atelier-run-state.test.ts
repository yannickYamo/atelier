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
    expect(runState({ applicable: 5, held: 5, judgement: 1, toCheck: 0, broken: [] })).toEqual({ state: 'CHECKED', line: 'CHECKED · every rule that can be checked was met · 1 rule for you to judge' });
    expect(runState({ applicable: 5, held: 5, judgement: 0, toCheck: 3, broken: [] }).line).toBe('CHECKED · every rule that can be checked was met · 3 specifics to check');
    expect(runState({ applicable: 0, held: 0, judgement: 2, toCheck: 0, broken: [] }).state).toBe('CHECKED');
  });
  it('certified only when every required rule was checked and nothing is left to anyone', () => {
    expect(runState({ applicable: 4, held: 4, judgement: 0, toCheck: 0, broken: [] })).toEqual({ state: 'CERTIFIED', line: 'CERTIFIED · every rule you require was checked and met' });
    expect(runState({ applicable: 0, held: 0, judgement: 0, toCheck: 0, broken: [] }).state).toBe('CHECKED');
  });
});

describe('what `atelier run` prints under the work', () => {
  const evalOf = (o: { applicable: number; held: number; broken?: { id: string; detail: string; label?: string }[]; unmeasured?: string | null; conformant?: boolean; reasons?: string[]; waived?: number }) =>
    ({ result: { conformant: o.conformant ?? !(o.broken ?? []).length, reasons: o.reasons ?? [] }, gates: { required: { applicable: o.applicable, held: o.held, broken: o.broken ?? [] }, claims: { unmeasured: o.unmeasured ?? null },
      applicability: { waived: Array.from({ length: o.waived ?? 0 }, (_, i) => ({ id: `w${i}`, why: 'set aside' })) } } }) as never;
  const engine = (o: Parameters<typeof evalOf>[0], toCheck: string[] = [], report: string[] = []) => ({ output: 'the work', invocationId: 'i1', costUsd: 0.1, toCheck, report, eval: evalOf(o) });
  it('the state, then where to go: two lines for a run that needed nothing more', async () => {
    const { linesFor } = await import('../cli/commands/run.js');
    expect(linesFor(engine({ applicable: 5, held: 5 }), 1)).toEqual(['CHECKED · every rule that can be checked was met · 1 rule for you to judge',
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

// A first-time-user review of the first version.
describe('what a review of `atelier run` found', () => {
  const evalOf = (o: { conformant: boolean; reasons?: string[]; waived?: number }) => ({ result: { conformant: o.conformant, reasons: o.reasons ?? [] },
    gates: { required: { applicable: 3, held: 3, broken: [] }, claims: { unmeasured: null }, applicability: { waived: Array.from({ length: o.waived ?? 0 }, (_, i) => ({ id: `w${i}`, why: 'x' })) } } }) as never;
  it('the engine\'s verdict stands: not conformant for a reason that is no rule of the owner\'s is blocked, in its words', async () => {
    const { linesFor } = await import('../cli/commands/run.js');
    const lines = linesFor({ output: 'w', invocationId: 'i', costUsd: 0, toCheck: [], report: [], eval: evalOf({ conformant: false, reasons: ['a run of 139 words is copied from one of your pieces'] }) }, 0);
    expect(lines[0]).toBe('BLOCKED · a run of 139 words is copied from one of your pieces');
  });
  it('a rule set aside for the run was not checked on it: never certified', async () => {
    const { linesFor } = await import('../cli/commands/run.js');
    expect(linesFor({ output: 'w', invocationId: 'i', costUsd: 0, toCheck: [], report: [], eval: evalOf({ conformant: true, waived: 1 }) }, 0)[0]).toBe('CHECKED · every rule that can be checked was met · 1 rule for you to judge');
    expect(linesFor({ output: 'w', invocationId: 'i', costUsd: 0, toCheck: [], report: [], eval: evalOf({ conformant: true }) }, 0)[0]).toMatch(/^CERTIFIED/);
  });
  it('a sentence removed from the work is said under it', async () => {
    const { linesFor } = await import('../cli/commands/run.js');
    const lines = linesFor({ output: 'w', invocationId: 'i', costUsd: 0, cut: ['An invented figure.'], toCheck: [], report: [], eval: evalOf({ conformant: true }) }, 0);
    expect(lines[1]).toBe('1 sentence was removed: not found in the material you gave. See them with --report.');
  });
  it('what was typed is sorted by where it stands, never by what it says', async () => {
    const { sortArgs } = await import('../cli/commands/run.js');
    expect(sortArgs(['scripted', '--model', 'scripted', '--with', 'change.diff', '--report'])).toEqual({ skill: null, task: 'scripted', report: true, machine: false, rest: ['--model', 'scripted', '--with', 'change.diff'] });
    expect(sortArgs(['--skill=review', '--task=Review this change.', '--cap', '2'])).toEqual({ skill: 'review', task: 'Review this change.', report: false, machine: false, rest: ['--cap', '2'] });
    expect(sortArgs(['--skill', 'review', 'review'])).toMatchObject({ skill: 'review', task: 'review' });
    expect(sortArgs(['a task', '--json'])).toMatchObject({ task: 'a task', machine: true, rest: ['--json'] });
  });
});

// The evaluation is part of what a run returns: every rule, as it fared, in the owner's words.
describe('the evaluation card', () => {
  const req = (id: string, statement: string, o: object = {}) => ({ requirementId: id, statement, authority: 'USER_AUTHORED', materiality: 'REQUIRED', ...o }) as never;
  const requirements = [req('x1', 'Open with a Summary section.', { measurement: { observer: 'PRESENCE', params: {} } }), req('x2', 'Between 220 and 420 words.', { measurement: { observer: 'LENGTH', params: {} } }),
    req('x3', 'Weigh the risk before the style.', { materiality: null, obligation: 'JUDGEMENT' }), req('c1', 'I keep paragraphs to 3 sentences at most.', { materiality: 'PREFERRED', measurement: { observer: 'PARAGRAPH_LENGTH', params: {} } }),
    req('x9', 'Rejected.', { authority: 'EXPERT_REJECTED' })];
  const engine = (broken: boolean) => ({ output: 'w', invocationId: 'i8e8c', costUsd: 0.203, toCheck: [], cut: broken ? ['An invented figure.'] : [], report: broken ? ['Written again: ...'] : [],
    rules: { checked: [{ id: 'x1', statement: 's', materiality: 'REQUIRED', verdict: 'MET', detail: 'everything it must contain is there' },
      { id: 'x2', statement: 's', materiality: 'REQUIRED', verdict: broken ? 'VIOLATED' : 'MET', detail: broken ? '469 words (220 to 420): long by 49' : '401 words (220 to 420)' },
      { id: 'c1', statement: 's', materiality: 'PREFERRED', verdict: 'MET', detail: 'd' }], unchecked: [{ id: 'x3', statement: 's' }] },
    eval: { durationMs: 55_000, drafts: 2, result: { conformant: !broken, reasons: [] }, gates: { required: { applicable: 2, held: broken ? 1 : 2, broken: broken ? [{ id: 'x2', label: 'Between 220 and 420 words.', detail: '469 words (220 to 420): long by 49' }] : [] },
      claims: { state: 'checked', delivered: 0, unconfirmed: 0, cut: 0, listed: 0, unmeasured: 'no material was bound to check against' }, copying: { longest: 10, limit: 12 }, applicability: { waived: [] } } } }) as never;
  it('each of the owner\'s rules, in their words: met with what was found, theirs to judge, or not met', async () => {
    const { cardFor } = await import('../cli/commands/run.js');
    const card = cardFor(engine(false), requirements);
    expect(card.state).toBe('CHECKED');
    expect(card.rules).toEqual([{ statement: 'Open with a Summary section.', status: 'met', detail: 'everything it must contain is there' },
      { statement: 'Between 220 and 420 words.', status: 'met', detail: '401 words (220 to 420)' }, { statement: 'Weigh the risk before the style.', status: 'judge' }]);
    expect(card.habits).toEqual({ kept: 1, of: 1 });
    expect(card.also.map((a) => [a.statement, a.status])).toEqual([['Nothing copied from your examples', 'met'], ['Facts traced to your material', 'not-checked']]);
  });
  it('as printed: the state, the rules one a line with a mark, what else is checked, what was done, and what to do next', async () => {
    const { cardFor } = await import('../cli/commands/run.js');
    const { renderRunCard } = await import('../core/eval/run-card.js');
    const text = renderRunCard(cardFor(engine(true), requirements), 100).join('\n');
    expect(text).toMatch(/^── Evaluation · BLOCKED ─+ \$0\.20 · 55 s ──\n {2}1 required rule not met: "Between 220 and 420 words\." \(469 words \(220 to 420\): long by 49\)/);
    expect(text).toContain('  Your rules\n    ✓  Open with a Summary section.\n    ✗  Between 220 and 420 words.\n         469 words (220 to 420): long by 49\n    ?  Weigh the risk before the style.\n         for you to judge');
    expect(text).toContain('From your examples (not required): 1 of 1 habits kept');
    expect(text).toContain('    –  Facts traced to your material\n         no material was given to trace them to');
    expect(text).toContain('What was done: 2 drafts written, the better one kept · written again once to meet your rules · 1 sentence removed (not found in your material)');
    expect(text).toContain('atelier rate i8e8c yes|no "why"');
    expect(text).not.toMatch(/GATES|applicability|REQUIRED|UNSOURCED|instrument/);
  });
  it('a rule set aside for the run is shown as not checked, with why, and a met length shows its count', async () => {
    const { cardFor } = await import('../cli/commands/run.js');
    const { renderRunCard } = await import('../core/eval/run-card.js');
    const e = engine(false) as { eval: { gates: { applicability: { waived: { id: string; why: string }[] } } } };
    e.eval.gates.applicability.waived = [{ id: 'x2', why: 'the request states its own length (about 600 words)' }];
    const card = cardFor(e as never, requirements);
    expect(card.rules[1]).toEqual({ statement: 'Between 220 and 420 words.', status: 'not-checked', detail: 'not checked on this run: the request states its own length (about 600 words)' });
    expect(renderRunCard(cardFor(engine(false), requirements)).join('\n')).toContain('    ✓  Between 220 and 420 words.\n         401 words (220 to 420)');
  });
});
