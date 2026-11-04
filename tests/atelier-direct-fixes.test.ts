// tests/atelier-direct-fixes.test.ts — THE FIVE DEFECTS A TESTER FOUND ON THE DIRECT WRITER'S FIRST RUNS.
//
// 1. a "[needs verification]" note written into the published text (tests/atelier-method.test.ts and
//    tests/atelier-direct.test.ts hold that: no mark unless --mark-unverified);
// 2. `atelier fix` could not reach a table cell (0 of 65 sentences changed), and the run said BLOCKED beside "ship labelled";
// 3. a sentence copied from the notes listed as not given, with nothing saying which words of it were untraced;
// 4. the word list flagging a word inside a link, a word the request asked for, and a word allowed once;
// 5. small invented details of when, how often and who ("two months ago", "every discovery call").
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { findTerms, splitTerm } from '../core/observers/text.js';
import { measure as observe } from '../core/observers/registry.js';
import { parseMeasureSpec } from '../core/measurement/spec.js';
import { reviewAsk } from '../core/direct/prompt.js';
import { toCheckOf } from '../cli/direct.js';
import { decideSpecifics } from '../core/loop/claim-extract.js';
import { fixUnitsOf, fixSpans, fixTargets, sentenceDiff } from '../core/loop/surgical-fix.js';
import { deliveryLine } from '../core/eval/consequence.js';
import type { InferenceClient } from '../core/inference/client.js';
import { anInferenceResult } from './fixtures.js';

const LONG = (s: string): string => `${s} ${'The team writes every week about what they ship and why it matters to the people who use it. '.repeat(3)}`;

describe('4. the word list reads prose, the request and the owner\'s allowance', () => {
  it('a word inside a link address is not a use of it', () => {
    const text = 'Read the guide at https://example.com/hands-on/setup and [the notes](https://example.com/hands) first.';
    expect(findTerms(text, ['hands'])).toEqual([]);
    // the link's own words are prose: they still count
    expect(findTerms('Read [the hands guide](https://example.com/x).', ['hands']).map((s) => s.text)).toEqual(['hands']);
  });
  it('a word allowed once is on the list from its second use', () => {
    expect(splitTerm('MCP<=1')).toEqual({ avoid: 'MCP', prefer: null, allow: 1 });
    expect(findTerms('MCP is new. We use MCP daily. MCP again.', ['MCP<=1']).map((s) => s.start)).toEqual([19, 30]);
    expect(findTerms('MCP is new.', ['MCP<=1'])).toEqual([]);
  });
  it('a word the request uses is left as the person\'s word, and said', () => {
    const kept: { text: string }[] = [];
    expect(findTerms('Put your hands on the work.', ['hands'], { request: 'Write a post titled Hands on the work.', kept: kept as never })).toEqual([]);
    expect(kept.map((k) => k.text)).toEqual(['hands']);
    const r = observe(LONG('Put your hands on the work.'), { observer: 'LEXICON', params: { terms: ['hands', 'leverage'] } }, { request: 'A post called Hands on the work.' });
    expect(r.verdict).toBe('MET');
    expect(r.detail).toBe('none used; left as the request\'s own word: hands');
    // without the request, the same text breaks the rule
    expect(observe(LONG('Put your hands on the work.'), { observer: 'LEXICON', params: { terms: ['hands'] } }).verdict).toBe('VIOLATED');
  });
  it('the allowance is written and parsed as one line, and described', () => {
    const p = parseMeasureSpec('LEXICON:hands|mcp<=1');
    expect(p.measurement?.params.terms).toEqual(['hands', 'mcp<=1']);
  });
});

describe('5. the review is told to write out small details nobody gave', () => {
  it('names when, how often, how many and who', () => {
    const r = reviewAsk('d', { material: [{ name: 'notes', text: 'n' }] });
    expect(r).toContain('every small detail of when, how often, how many or who');
    expect(r).toContain('"two months ago"');
    expect(r).toContain('A detail nobody gave is written out of the sentence');
  });
});

describe('3. a sentence that is in the notes is never listed as not given; an untraced part is named', () => {
  const notes = 'Why it matters: The CRM holds the deals. Agents read it every morning.';
  const report = (spans: { text: string; specific?: string }[]): never => ({ checked: [
    { requirementId: 'UNSOURCED·check', result: { verdict: 'VIOLATED', spans: spans.map((s, i) => ({ start: i, end: i + 1, why: 'x', ...s })) } },
  ] }) as never;
  it('a sentence copied from the notes is dropped from the list, whichever check raised it', () => {
    expect(toCheckOf(report([{ text: 'The CRM holds the deals.' }]), notes)).toEqual([]);
  });
  it('a sentence with a number the notes lack stays listed', () => {
    expect(toCheckOf(report([{ text: 'The CRM holds the 40 deals.' }]), notes)).toEqual([{ sentence: 'The CRM holds the 40 deals.', specific: null }]);
  });
  it('the words a reader found untraced are said with the sentence', () => {
    const s = 'The CRM holds the deals, and two months ago we moved support into it.';
    expect(toCheckOf(report([{ text: s, specific: 'two months ago' }]), notes)).toEqual([{ sentence: s, specific: 'two months ago' }]);
  });
  it('the claim reading carries the specific it found', () => {
    const text = 'Most founders miss it. Two months ago we moved support into the CRM.';
    const r = decideSpecifics(text, [{ text: 'Two months ago we moved support', sentence: 2, kind: 'FIRST_PERSON_EVENT', source: 'NONE', support: '', attributed: false } as never], notes, 'Write the post.', false, 'm');
    expect(r.claims.map((c) => c.specific)).toEqual(['Two months ago we moved support']);
  });
});

describe('2. a fix reaches a table cell, and the delivery line never contradicts the state', () => {
  const MD = '# Plans\n\nWe price by seat.\n\n| plan | price |\n|---|---|\n| Team | $20 |\n| Pro | $40 |\n\nThat is all.';
  it('every table row is a unit a fix can name, the separator row is not', () => {
    expect(fixUnitsOf(MD).map((u) => u.text)).toEqual(['We price by seat.', '| plan | price |', '| Team | $20 |', '| Pro | $40 |', 'That is all.']);
  });
  it('a row written again is spliced and counted as one change', async () => {
    const client: InferenceClient = { complete: async () => anInferenceResult({ json: { reply: '<work>| Team | $25 |</work>' } }) };
    const ids = [3];
    expect(fixTargets(MD, ids, 'Team is $25').map((t) => t.text)).toEqual(['| Team | $20 |']);
    const r = await fixSpans(client, { spentUsd: 0, capUsd: 1 }, MD, ids, 'Team is $25', []);
    expect(r.text).toBe(MD.replace('| Team | $20 |', '| Team | $25 |'));
    expect(sentenceDiff(MD, r.text, ids)).toEqual({ total: 5, changed: 1, outside: 0, unchangedNamed: [] });
  });
  it('a reply that is not one row with the same cells is not spliced', async () => {
    const client: InferenceClient = { complete: async () => anInferenceResult({ json: { reply: '<work>Team now costs $25 a seat.</work>' } }) };
    const r = await fixSpans(client, { spentUsd: 0, capUsd: 1 }, MD, [3], 'Team is $25', []);
    expect(r.text).toBe(MD);
    expect(r.reverted[0].lost[0]).toContain('did not come back as one row with the same 2 cells');
  });
  it('BLOCKED beside a delivery that ships says the work goes out despite the failure', () => {
    const d = { decision: 'SHIP_LABELLED', why: [] } as never;
    expect(deliveryLine(d, 'BLOCKED')).toBe('Delivery: ship labelled, though a required rule failed: this skill\'s consequence table sends such work out marked (atelier amend --consequence changes that)');
    expect(deliveryLine(d, 'NEEDS_REVIEW')).toBe('Delivery: ship labelled');
    expect(deliveryLine({ decision: 'BLOCK', why: [] } as never, 'BLOCKED')).toBe('Delivery: block');
  });
});
