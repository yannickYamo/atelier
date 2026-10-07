// tests/atelier-clean-pass.test.ts — FOUR SMALL DEFECTS A READ OF THE WHOLE PRODUCT FOUND, EACH HELD BOTH WAYS.
//
// A reply with no text was delivered as a draft that broke no rule. With one piece or two, "one piece is always
// allowed" allowed every piece. A rule that quotes both kinds of quote had no command that could be pasted. And the
// skill's card said pieces were reserved for a baseline on one line and that none was reserved on another.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { spendOneWithResult } from '../cli/commands/improve.js';
import { amendToFit } from '../cli/commands/amend.js';
import { allowed, CORPUS_RULE_SHARE, CORPUS_SET_SHARE } from '../core/ratification/suggest.js';
import { renderSkillCard, type SkillCard } from '../core/eval/skill-card.js';
import type { InferenceClient } from '../core/inference/client.js';
import { aRequirement } from './fixtures.js';

const client = (json: unknown): InferenceClient => ({ complete: () => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never) });

describe('a reply with no text in it is a failed draft call, never an empty draft', () => {
  it('no piece, an empty piece and a blank one are each refused; a piece with words is the draft', async () => {
    for (const json of [{}, { piece: '' }, { piece: ' \n\n ' }, { rules: [] }, null]) {
      await expect(spendOneWithResult(client(json), { spentUsd: 0, capUsd: 1 }, 'the skill', 'write a post')).rejects.toThrow('the model returned no text for the draft');
    }
    expect((await spendOneWithResult(client({ piece: 'We decided first.' }), { spentUsd: 0, capUsd: 1 }, 'the skill', 'write a post')).piece).toBe('We decided first.');
  });
  it('the call is still counted in what the run spent', async () => {
    const budget = { spentUsd: 0, capUsd: 1 };
    await expect(spendOneWithResult(client({}), budget, 'the skill', 'write a post')).rejects.toThrow();
    expect(budget.spentUsd).toBeCloseTo(0.001);
  });
});

describe('one piece is allowed to fall short from three pieces up, and none below', () => {
  it('with one piece or two, allowing one would allow them all', () => {
    expect([1, 2].map((n) => allowed(n, CORPUS_RULE_SHARE))).toEqual([0, 0]);
    expect([1, 2].map((n) => allowed(n, CORPUS_SET_SHARE))).toEqual([0, 0]);
    expect([3, 8, 19, 20, 40].map((n) => allowed(n, CORPUS_RULE_SHARE))).toEqual([1, 1, 1, 1, 2]);
    expect([3, 8, 19, 20].map((n) => allowed(n, CORPUS_SET_SHARE))).toEqual([1, 1, 1, 2]);
  });
});

describe('the command that fits a limit can be pasted whatever the rule quotes', () => {
  const sentence = (n: number): string => `${Array.from({ length: n }, () => 'stone').join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
  const even = (n: number): string => Array.from({ length: 12 }, (_, i) => `${sentence(n)}${i % 3 === 2 ? '\n\n' : ' '}`).join('').trim();
  const corpus = [...Array.from({ length: 20 }, () => even(10)), even(21), even(22), even(23), even(25)];
  it('a statement with both kinds of quote is carried whole, and a shell reads it back as written', () => {
    const rule = aRequirement({ requirementId: 'm1', statement: 'I keep sentences short ("don\'t ramble", I say): a median under 19 words, and nine in ten under 36.', materiality: 'REQUIRED',
      measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 19, p90Max: 36 } } });
    const line = amendToFit('blog', rule, corpus, allowed(corpus.length, CORPUS_RULE_SHARE)) ?? '';
    expect(line).not.toMatch(/<the rule, with its new limit>/);
    const statement = /--statement ('.*') --reason /.exec(line)?.[1] ?? '';
    expect(statement).not.toBe('');
    expect(execFileSync('sh', ['-c', `printf %s ${statement}`], { encoding: 'utf8' })).toBe('I keep sentences short ("don\'t ramble", I say): a median under 23 words, and nine in ten under 36.');
  });
  it('a statement with no quote in it is in double quotes, as before', () => {
    const rule = aRequirement({ requirementId: 'm1', statement: 'I keep sentences short: a median under 19 words, and nine in ten under 36.', materiality: 'REQUIRED',
      measurement: { observer: 'SENTENCE_LENGTH', params: { medianMax: 19, p90Max: 36 } } });
    expect(amendToFit('blog', rule, corpus, 1)).toMatch(/--statement "I keep sentences short: a median under 23 words, and nine in ten under 36\." --reason/);
  });
});

describe('the card says one thing about the reserved pieces', () => {
  const card = { schema: 1, skill: 'x', skillVersion: 'a'.repeat(16), standardVersion: 'b'.repeat(16), builtAt: null, corpus: { pieces: 17, heldBack: 3 }, copying: true,
    rules: { total: 2, required: 1, counted: 2, read: 0, conditional: 0, needsMaterial: 0 }, claims: { instrument: 'pattern check', qualified: false, measured: null, answers: false },
    fidelity: { profile: 'c'.repeat(16), features: 53, steering: 0, layers: [], classes: [], baseline: null, operators: false, detector: null },
    release: null, taste: null, notMeasured: ['voice'], next: ['atelier invoke'] } satisfies SkillCard;
  it('reserved and no baseline: the cause is that nothing steers, and no line promises a baseline below', () => {
    const text = renderSkillCard(card);
    expect(text).toMatch(/built from 17 of your pieces; 3 more reserved unseen, for a blind comparison\n/);
    expect(text).toMatch(/baseline\s+none: no feature steers drafts yet, so your 3 reserved piece\(s\) have nothing to be read\s+against/);
    expect(text).not.toMatch(/no reserved piece to compare with/);
    // with features that steer, the card does not say that none does
    const steering = renderSkillCard({ ...card, fidelity: { ...card.fidelity, steering: 7 } });
    expect(steering).toMatch(/baseline\s+none: no steering feature could be measured on your 3 reserved piece\(s\)/);
    expect(steering).not.toMatch(/no feature steers drafts yet/);
  });
  it('with a baseline the first line names it, and with nothing reserved the card says how to reserve', () => {
    const withBaseline = renderSkillCard({ ...card, fidelity: { ...card.fidelity, baseline: { medianInBand: 8, medianMeasured: 10, n: 3 } } });
    expect(withBaseline).toMatch(/3 more reserved unseen, for a blind comparison and the baseline below/);
    expect(withBaseline).toMatch(/your reserved pieces sit in range on a median 8 of 10 \(n=3\)/);
    expect(renderSkillCard({ ...card, corpus: { pieces: 17, heldBack: 0 } })).toMatch(/none: no reserved piece to compare with \(reserve some with atelier new --reserve\)/);
  });
  it('a caller that ends on its own list of what to do next leaves the card\'s out', () => {
    expect(renderSkillCard(card)).toMatch(/^ {2}next: atelier invoke$/m);
    expect(renderSkillCard(card, 110, { next: false })).not.toMatch(/^ {2}next:/m);
  });
});
