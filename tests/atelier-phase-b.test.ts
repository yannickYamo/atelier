// tests/atelier-phase-b.test.ts — SKILLS THAT FIT OTHER DOMAINS.
//
//   B1  a skill that answers people keeps its short examples at intake
//   B2  the request sets the length when it says one; a brief answer is not held to an opening minimum
//   B3  what a piece must contain is counted: sections in order, mentions, figures, how a part starts
//   B4  the skill as one file, examples inlined (the command is exercised through the binary elsewhere)

import { describe, it, expect } from 'vitest';
import { planImport, MIN_GOLDEN_CHARS, MIN_ANSWER_CHARS } from '../core/discovery/chain/corpus-import.js';
import { measure, observerFor } from '../core/observers/registry.js';
import { requestedLength } from '../cli/commands/invoke.js';
import { parseMeasure } from '../cli/commands/ratify.js';
import type { Measurement } from '../core/state/canonical-state.js';

describe('B1: short answers are examples too, in a skill that answers people', () => {
  const golden = (id: string, text: string) => ({ id, name: id, kind: 'GOLDEN' as const, text });
  const pieces = [golden('a', 'Run `npm ci`, then retry.'), ...['b', 'c', 'd', 'e'].map((id) => golden(id, 'x'.repeat(260)))];
  it('the writing floor drops a one-line answer; the answer floor keeps it', () => {
    expect(MIN_ANSWER_CHARS).toBeLessThan(MIN_GOLDEN_CHARS);
    const writing = planImport(pieces);
    const answers = planImport(pieces, { minChars: MIN_ANSWER_CHARS });
    expect(writing.goldens.map((g) => g.contextId)).not.toContain('a');
    expect(answers.goldens.map((g) => g.contextId)).toContain('a');
  });
});

describe('B2: rules bend to the request', () => {
  it('reads a request for detail or for brevity, and nothing else', () => {
    expect(requestedLength('I explicitly want a detailed explanation of the retry logic')).toBe('LONG');
    expect(requestedLength('Walk me through the migration step by step')).toBe('LONG');
    expect(requestedLength('One line, please: what does this flag do?')).toBe('SHORT');
    expect(requestedLength('Why does login take two seconds?')).toBeNull();
  });
  it('a correct two-line answer is not held to an opening of 7 to 50 words', () => {
    const m: Measurement = { observer: 'OPENING', params: { minWords: 7, maxWords: 50 } };
    expect(measure('Run `npm ci`, then retry.\n\nNext: open the log.', m).verdict).toBe('MET');
  });
  it('polarity: in a long piece, a four-word opening still breaks the minimum', () => {
    const m: Measurement = { observer: 'OPENING', params: { minWords: 7, maxWords: 50 } };
    const long = `Short opening line here.\n\n${'The body goes on at some length about the point. '.repeat(6)}`;
    expect(measure(long, m).verdict).toBe('VIOLATED');
  });
});

describe('B3: what a piece must contain', () => {
  const report = '# Plan\n\n## Recommendation\n\nShip it.\n\n## Bets\n\nBet 1: churn drops below 3% in 60 days (Assumed).\n\n## Justification\n\nThe data says so.';
  const presence = (params: Measurement['params']): Measurement => ({ observer: 'PRESENCE', params });

  it('sections present and in order; missing or out of order is named', () => {
    expect(measure(report, presence({ sections: ['recommendation', 'bets', 'justification'] })).verdict).toBe('MET');
    expect(measure(report, presence({ sections: ['bets', 'recommendation'] })).detail).toMatch(/out of order/);
    expect(measure(report, presence({ sections: ['risks'] })).detail).toMatch(/no "risks" section/);
  });
  it('a figure or a mention, in one section', () => {
    expect(measure(report, presence({ in: ['BETS'], figure: 1 })).verdict).toBe('MET');
    expect(measure(report, presence({ in: ['RECOMMENDATION'], figure: 1 })).detail).toBe('no figure');
    expect(measure(report, presence({ any: ['known', 'assumed', 'verify'] })).verdict).toBe('MET');
    expect(measure(report, presence({ any: ['known'], min: 2 })).verdict).toBe('VIOLATED');
  });
  it('how the last paragraph starts: an answer that ends on its next step', () => {
    const m = presence({ in: ['LAST'], starts: ['next'] });
    expect(measure('Run npm ci.\n\nNext: paste the first failing line.', m).verdict).toBe('MET');
    expect(measure('Run npm ci.\n\nOne caveat: this assumes Node 22.', m).verdict).toBe('VIOLATED');
  });
  it('the violated part is the span a repair rewrites, with what it lacks', () => {
    const r = measure('Run npm ci.\n\nOne caveat: this assumes Node 22.', presence({ in: ['LAST'], starts: ['next'] }));
    expect(r.spans[0].text).toBe('One caveat: this assumes Node 22.');
    expect(r.spans[0].why).toMatch(/does not start with "next"/);
  });
  it('declared on the command line like any measure, and refused when it asks for nothing', () => {
    expect(parseMeasure('PRESENCE:in=last,starts=next|then')).toEqual({ observer: 'PRESENCE', params: { in: ['LAST'], starts: ['next', 'then'] } });
    expect(parseMeasure('PRESENCE:sections=Recommendation|Bets').params.sections).toEqual(['recommendation', 'bets']);
    expect(observerFor('PRESENCE').validate({ in: ['LAST'] })).toMatch(/needs sections, any, figure or starts/);
  });
});
