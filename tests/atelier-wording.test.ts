// ONE PLACE WORDS A RESULT (core/eval/wording.ts). These tests are on STATES: which of the five kinds an entry is, and
// which outcome a record comes to. The sentences are pinned once, in the last test, against the module's own table.
import { describe, it, expect } from 'vitest';
import { entry, stateOf, type Entry, type Observation, type EvaluationRecord } from '../core/eval/record.js';
import { spansByEntry } from '../cli/eval-run.js';
import { COPIED_LINE } from '../core/loop/run-repair.js';
import { kindOf, linesOf, outcomeOf, verdictLines, afterPieceLines, AFTER_PIECE_MAX, SAID, OUTCOME_SAID } from '../core/eval/wording.js';

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
    // where the owner's own table ships that finding plain, the line is still listed and the outcome is theirs
    expect(outcomeOf('SHIP', r.state, r)).toBe('ready');
    expect(outcomeOf(undefined, r.state, r)).toBe('look');
  });
  it('says what the check saw, never why the check is not relied on', () => {
    const e = rule('x3', 'VIOLATED', { qualification: 'UNQUALIFIED', evidence: '1 found. This check has not qualified on your examples, so it blocks nothing and the rule is yours to read', saw: '1 found' });
    expect(linesOf(e)).toEqual(['  To look at: Rule x3. (1 found)']);
  });
  it('a rule accepted as unmeasured is theirs to judge, unless the check that reads part of it found it broken', () => {
    expect(kindOf(rule('a', null, { qualification: 'UNQUALIFIED', listed: true, accepted: true, evidence: 'none found; accepted by you as unmeasured', saw: 'none found', found: 'MET' }))).toBe('judge');
    const broke = rule('a', null, { qualification: 'UNQUALIFIED', listed: true, accepted: true, evidence: '1 found. Not relied on; accepted by you as unmeasured', saw: '1 found', found: 'VIOLATED' });
    expect(kindOf(broke)).toBe('look');
    expect(linesOf(broke)).toEqual(['  To look at: Rule a. (1 found)']);
  });
  it('the passages a check pointed at are found for the two entries the record names itself', () => {
    const line = (requirementId: string, text: string): unknown => ({ requirementId, result: { verdict: 'VIOLATED', spans: [{ start: 0, end: 1, text, why: 'w' }] } });
    const by = spansByEntry({ checked: [line('x1', 'a'), line('UNSOURCED', '73%'), line(COPIED_LINE, 'a lifted run')] } as never);
    expect(by.get('x1')?.[0].text).toBe('a');
    expect(by.get('specifics')?.[0].text).toBe('73%');
    expect(by.get('lifted')?.[0].text).toBe('a lifted run');
  });
  it('lists at most eight slips and counts the rest', () => {
    const many = rule('g', null, { coverage: 'NONE', listed: true, evidence: 'a list', slips: Array.from({ length: 11 }, (_, i) => `"w${i}" (spelling: "w${i}" → "v${i}")`) });
    expect(linesOf(many)).toHaveLength(9);
    expect(linesOf(many)[8]).toContain('and 3 more');
  });
  it('says nothing of what does not apply, was set aside, or is a habit and not a rule', () => {
    expect(kindOf(rule('a', null, {}, { applies: false }))).toBeNull();
    expect(kindOf(rule('a', null, {}, { applies: { setAside: 'the request lifted it' } }))).toBeNull();
    for (const v of ['MET', 'VIOLATED'] as const) expect(kindOf(rule('h', v, {}, { required: false }))).toBeNull();
    expect(kindOf(rule('h', 'VIOLATED', { qualification: 'UNQUALIFIED' }, { required: false }))).toBeNull();
  });
  it('the grammar list is to look at only where a correction can be named', () => {
    const named = rule('g', null, { coverage: 'NONE', listed: true, evidence: 'listed for you to check: 1 possible slip', slips: ['"are" (agreement: "are" → "is")'] });
    const unsure = rule('g', null, { coverage: 'NONE', listed: true, evidence: 'listed for you to check: 1 possible slip', slips: [] });
    expect(kindOf(named)).toBe('look');
    expect(kindOf(unsure)).toBeNull();
    expect(linesOf(named)).toHaveLength(1);
  });
  it('a listing check that could not run is not checked, and is nothing to look at', () => {
    const off = rule('g', null, { coverage: 'NONE', listed: true, notRun: true, evidence: 'grammar not checked: switched off' });
    expect(kindOf(off)).toBe('unchecked');
    const r = record(rule('a', 'MET'), off);
    expect(outcomeOf('SHIP_LABELLED', r.state, r)).toBe('ready');
  });
});

describe('specifics looked for in what the person supplied', () => {
  const specifics = (o: Partial<Observation>, verdict: 'MET' | 'VIOLATED' | null = 'MET'): Entry => entry({ id: 'specifics', dimension: 'EVIDENCE', source: 'SYSTEM', statement: 'Every name and figure in the work is in what you supplied', required: true, observation: obs(o), verdict });
  it('one not found in the notes is to look at, whether or not the reader is relied on; with no notes it is not checked', () => {
    const open = specifics({ coverage: 'PARTIAL', evidence: '1 could not be found in it: listed for you', toConfirm: 1 });
    expect(kindOf(open)).toBe('look');
    expect(kindOf(specifics({ coverage: 'PARTIAL', qualification: 'UNQUALIFIED', evidence: '1 could not be found in it: listed for you (why)', saw: '1 could not be found in it: listed for you', toConfirm: 1 }))).toBe('look');
    expect(kindOf(specifics({ coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: 'no material was supplied to look them up in: 1 listed for you' }, null))).toBe('unchecked');
    expect(kindOf(specifics({ evidence: 'all found' }))).toBe('held');
    const r = record(rule('a', 'MET'), open);
    expect(outcomeOf('SHIP_LABELLED', r.state, r)).toBe('look');
    // the passage is shown under it by verify
    expect(verdictLines(r, new Map([['specifics', [{ start: 0, end: 3, text: '73%', why: 'a figure not in your material' }]]]))).toHaveLength(3);
  });
  it('a rule that held on the part a check reads is counted, and is not a line under the piece', () => {
    expect(linesOf(rule('a', 'MET', { coverage: 'PARTIAL' }))).toEqual([]);
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
  it('under a piece a run hands over: no verdict word, a rule not met and each sentence nothing given holds, at most four lines', () => {
    const r = record(rule('a', 'MET'), rule('b', 'VIOLATED'), rule('c', 'MET', { coverage: 'PARTIAL' }), rule('e', 'VIOLATED', { qualification: 'UNQUALIFIED' }));
    expect(afterPieceLines(r, new Map(), 'i1')).toEqual(['Not met: Rule b.', 'Not right? atelier fix "<what was wrong>"']);
    expect(afterPieceLines(record(rule('a', 'MET')), new Map(), 'i1')).toEqual(['Not right? atelier fix "<what was wrong>"']);
    const many = record(rule('b', 'VIOLATED'), rule('c', 'VIOLATED'), rule('d', 'VIOLATED'), rule('f', 'VIOLATED'));
    const lines = afterPieceLines(many, new Map(), 'i1');
    expect(lines).toHaveLength(AFTER_PIECE_MAX);
    expect(lines[2]).toBe('…and 2 more: atelier report i1');
    for (const l of lines) expect(l).not.toMatch(new RegExp(`^(${Object.values(OUTCOME_SAID).join('|')})`));
  });
});

describe('the check of one text, as verify and the MCP tool say it', () => {
  it('opens with the outcome and puts the passages that broke a rule under that rule only', () => {
    const r = record(rule('a', 'MET'), rule('b', 'VIOLATED'));
    const lines = verdictLines(r, new Map([['a', []], ['b', [{ start: 0, end: 1, text: '—', why: 'an em dash' }]]]));
    expect(lines[0]).toBe(`${OUTCOME_SAID.fix}.`);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('an em dash');
    expect(verdictLines(record(rule('a', 'MET')))).toEqual([`${OUTCOME_SAID.ready}.`]);
  });
});

describe('the words, pinned once', () => {
  it('each kind is said in the one table', () => {
    expect(SAID).toEqual({ broken: 'Not met: ', unchecked: 'Not checked on this piece: ', look: 'To look at: ', slip: 'Possible slip: ', toCheck: 'To check: ', check: 'Check: ' });
    expect(OUTCOME_SAID).toEqual({ ready: 'Ready', look: 'Needs a look', fix: 'Needs a fix' });
    expect(linesOf(rule('b', 'VIOLATED'))).toEqual(['  Not met: Rule b. (1 in 39 words (none allowed))']);
  });
});
