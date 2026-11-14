// ONE PLACE WORDS A RESULT (core/eval/wording.ts). These tests are on STATES: which of the five kinds an entry is, and
// which outcome a record comes to. The sentences are pinned once, in the last test, against the module's own table.
import { describe, it, expect } from 'vitest';
import { entry, stateOf, type Entry, type Observation, type EvaluationRecord } from '../core/eval/record.js';
import { kindOf, linesOf, foundLines, outcomeOf, shortLine, SAID, OUTCOME_SAID } from '../core/eval/wording.js';

const obs = (o: Partial<Observation> = {}): Observation => ({ proposition: 'counts it', coverage: 'FULL', qualification: 'DETERMINISTIC', evidence: '1 in 39 words (none allowed)', ...o });
const rule = (id: string, verdict: 'MET' | 'VIOLATED' | null, o: Partial<Observation> = {}, more: Partial<Pick<Entry, 'required'>> & { applies?: false | { setAside: string } } = {}): Entry =>
  entry({ id, dimension: 'STANDARD', source: 'METHOD', statement: `Rule ${id}.`, required: more.required ?? true, observation: obs(o), verdict, ...(more.applies !== undefined ? { applies: more.applies } : {}) });
const record = (...entries: Entry[]): EvaluationRecord => ({ schema: 1, state: stateOf(entries), entries });

describe('what one entry is to the person', () => {
  it('held, broken, unchecked, judge and look, each from the record and nothing else', () => {
    expect(kindOf(rule('a', 'MET'))).toBe('held');
    expect(kindOf(rule('a', 'VIOLATED'))).toBe('broken');
    expect(kindOf(rule('a', 'MET', { coverage: 'PARTIAL' }))).toBe('held');
    expect(kindOf(rule('a', 'VIOLATED', { coverage: 'PARTIAL' }))).toBe('broken');
    expect(kindOf(rule('a', null, { coverage: 'NONE', evidence: 'no material was supplied' }))).toBe('unchecked');
    expect(kindOf(rule('a', null, { proposition: null, coverage: 'NONE', evidence: null }))).toBe('judge');
    expect(kindOf(rule('a', null, { proposition: null, coverage: 'NONE', evidence: 'accepted', listed: true, accepted: true }))).toBe('judge');
    expect(kindOf(rule('a', null, { evidence: 'two figures to confirm', listed: true }))).toBe('look');
    expect(kindOf(rule('a', 'MET', { qualification: 'UNQUALIFIED' }))).toBe('judge');
  });
  it('a check that is not yet relied on never hides what it found: broken by its reading is to look at, and the run is not Ready', () => {
    const e = rule('x3', 'VIOLATED', { qualification: 'UNQUALIFIED' });
    expect(e.result).toBe('UNVERIFIED');
    expect(kindOf(e)).toBe('look');
    expect(linesOf(e)).toHaveLength(1);
    expect(linesOf(e)[0]).not.toContain(SAID.unchecked);
    const r = record(rule('x1', 'MET'), e);
    expect(outcomeOf('SHIP_LABELLED', r.state, r)).toBe('look');
    expect(outcomeOf('SHIP', r.state, r)).toBe('look');
  });
  it('says nothing of what does not apply, was set aside, or is a habit and not a rule', () => {
    expect(kindOf(rule('a', null, {}, { applies: false }))).toBeNull();
    expect(kindOf(rule('a', null, {}, { applies: { setAside: 'the request lifted it' } }))).toBeNull();
    for (const v of ['MET', 'VIOLATED'] as const) expect(kindOf(rule('h', v, {}, { required: false }))).toBeNull();
    expect(kindOf(rule('h', 'VIOLATED', { qualification: 'UNQUALIFIED' }, { required: false }))).toBeNull();
  });
  it('the grammar list is to look at only where a correction can be named', () => {
    const named = rule('g', null, { coverage: 'NONE', listed: true, evidence: 'listed for you to check: 1 possible slip: "are" (agreement: "are" → "is")' });
    const unsure = rule('g', null, { coverage: 'NONE', listed: true, evidence: 'listed for you to check: 1 possible slip: "Wharfside" (a word the checker does not know)' });
    expect(kindOf(named)).toBe('look');
    expect(kindOf(unsure)).toBeNull();
    expect(linesOf(named)).toHaveLength(1);
  });
});

describe('the outcome of a record', () => {
  it('needs a fix where a rule is broken or delivery blocks; needs a look where something is to look at; else ready', () => {
    const broken = record(rule('a', 'VIOLATED'));
    expect(outcomeOf('BLOCK', 'BLOCKED', broken)).toBe('fix');
    expect(outcomeOf('SHIP_LABELLED', broken.state, broken)).toBe('fix');
    expect(outcomeOf('PERSON', 'NEEDS_REVIEW', record(rule('a', 'MET')))).toBe('look');
    const unread = record(rule('a', 'MET'), rule('s', null, { coverage: 'NONE', evidence: 'no material was supplied' }), rule('p', 'MET', { coverage: 'PARTIAL' }));
    expect(outcomeOf('SHIP_LABELLED', unread.state, unread)).toBe('ready');
    expect(outcomeOf('SHIP', 'VERIFIED', record(rule('a', 'MET')))).toBe('ready');
    expect(outcomeOf('SHIP', 'VERIFIED')).toBe('ready');
  });
  it('the sentence never reads "nothing broke" over a broken rule, and counts each kind once', () => {
    const r = record(rule('a', 'MET'), rule('b', 'VIOLATED'), rule('c', 'MET', { coverage: 'PARTIAL' }), rule('d', null, { proposition: null, coverage: 'NONE', evidence: null }), rule('e', 'VIOLATED', { qualification: 'UNQUALIFIED' }));
    const line = shortLine(r);
    expect(line).toMatch(/^1 of your rules is not met/);
    expect(line).toContain('1 measured');
    expect(line).toContain('1 to look at');
    expect(foundLines(r)).toHaveLength(3);
    expect(shortLine(record(rule('a', 'MET')))).toBe('every rule was measured and held.');
  });
});

describe('the words, pinned once', () => {
  it('each kind is said in the one table', () => {
    expect(SAID).toEqual({ broken: 'Not met: ', heldPart: 'Held where it is checked: ', unchecked: 'Not checked on this piece: ', look: 'To look at: ', slip: 'Possible slip: ', toCheck: 'To check: ' });
    expect(OUTCOME_SAID).toEqual({ ready: 'Ready', look: 'Needs a look', fix: 'Needs a fix' });
    expect(linesOf(rule('b', 'VIOLATED'))).toEqual(['  Not met: Rule b. (1 in 39 words (none allowed))']);
  });
});
