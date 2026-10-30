// tests/atelier-deterministic-repairs.test.ts — THE REPAIRS THAT CANNOT CHANGE WHAT A SENTENCE SAYS, MADE IN CODE.
//
// Two tells have a fix that moves no word of meaning: a dash where a rule bans dashes (an em dash, or the double
// hyphen a writer types for one), replaced by a comma, a colon or a full stop by where it stands; and a signposting
// clause ("To be clear,", "Here's the thing:") set off by its own punctuation, cut with that punctuation. Both are found
// by the counted checks that already report them (the dash family, SIGNPOST, the machine-tell families CANDOUR and
// REFRAME_ANNOUNCE), on the spans those checks report; nothing new reads meaning. A signpost that is no set-off clause
// ("Let me explain why …") is left for the model repair.
//
// Metric (plan round 1, item 3): tells delivered = 0 with no claim changed. Expected strings are written out by hand.
import { describe, it, expect } from 'vitest';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { findPattern } from '../core/observers/style.js';
import { replaceEmDashes, cutSignposts, mechanicalFixes } from '../core/loop/mechanical-repair.js';
import { verifyText } from '../core/observers/verify.js';
import { aRequirement } from './fixtures.js';

describe('a double hyphen typed for a dash is a dash', () => {
  it('counted as one, spaced or not; a flag, a range of rules or a table delimiter is not', () => {
    expect(findPattern('The loop -- which runs nightly -- works.', 'EM_DASH')).toHaveLength(2);
    expect(findPattern('The loop--which runs nightly--works.', 'EM_DASH')).toHaveLength(2);
    expect(findPattern('Run it with --help first.', 'EM_DASH')).toHaveLength(0);
    expect(findPattern('| a | b |\n|---|---|\n| x | y |', 'EM_DASH')).toHaveLength(0);
    expect(findPattern('Above.\n\n---\n\nBelow.', 'EM_DASH')).toHaveLength(0);
  });
});

describe('a dash replaced by its position', () => {
  it('a pair around an aside becomes two commas, whichever way it was typed', () => {
    expect(replaceEmDashes('The loop -- which runs nightly -- works.')).toBe('The loop, which runs nightly, works.');
  });
  it('before a short tail a comma, before a long one a colon', () => {
    expect(replaceEmDashes('We stayed -- mostly.')).toBe('We stayed, mostly.');
    expect(replaceEmDashes('We stayed -- the last ferry had gone an hour before.')).toBe('We stayed: the last ferry had gone an hour before.');
  });
  it('a dash with nothing after it ends the sentence with a full stop', () => {
    expect(replaceEmDashes('We waited on the pier —\nThe boat came at dawn.')).toBe('We waited on the pier.\nThe boat came at dawn.');
  });
});

describe('a signposting clause set off by its own punctuation is cut with it', () => {
  const span = (t: string, s: string) => { const start = t.indexOf(s); return { start, end: start + s.length, text: s, why: 'signposting' }; };
  it('at the start of a sentence, with its comma or colon; the next word takes the capital', () => {
    const t = 'To be clear, the ferry leaves at eleven. Here\'s the thing: the quay floods.';
    expect(cutSignposts(t, [span(t, 'To be clear'), span(t, 'Here\'s the thing')])).toEqual({ text: 'The ferry leaves at eleven. The quay floods.', cut: 2 });
  });
  it('inside a sentence between two commas; one trailing before the stop is left for the model repair', () => {
    const t = 'The ferry, to be clear, leaves at eleven. It is late, in other words.';
    expect(cutSignposts(t, [span(t, 'to be clear'), span(t, 'in other words')]).text).toBe('The ferry leaves at eleven. It is late, in other words.');
  });
  it('a signpost that carries the sentence is left as it is', () => {
    const t = 'Let me explain why the ferry is late.';
    expect(cutSignposts(t, [span(t, 'Let me explain')])).toEqual({ text: t, cut: 0 });
  });
});

describe('only where a rule the work is held to bans them', () => {
  const PLAIN = 'The ferry leaves the pier at eleven and the crossing is calm on most nights of the year.';
  const body = Array.from({ length: 12 }, () => PLAIN).join(' ');
  const std = (...rs: ReturnType<typeof aRequirement>[]): StandardVersion => ({ standardVersionHash: 's', requirements: rs }) as unknown as StandardVersion;
  const dashBan = aRequirement({ requirementId: 'd1', statement: 'Never use a dash.', materiality: 'REQUIRED', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } } });
  const signBan = aRequirement({ requirementId: 's1', statement: 'Never signpost.', materiality: 'REQUIRED', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['SIGNPOST'], maxPer1000: 0 } } });
  it('a dash ban and a signpost ban, each fixed in code, and the record names the rule', () => {
    const text = `To be clear, the harbour -- which floods in spring -- reopened. ${body}`;
    const v = std(dashBan, signBan);
    const m = mechanicalFixes(v, verifyText('s', v, text), text);
    expect(m.text.startsWith('The harbour, which floods in spring, reopened.')).toBe(true);
    expect(m.fixed.map((f) => f.split(':')[0]).sort()).toEqual(['d1', 's1']);
  });
  it('with no rule against them, nothing is touched', () => {
    const text = `To be clear, the harbour -- which floods in spring -- reopened. ${body}`;
    const v = std();
    expect(mechanicalFixes(v, verifyText('s', v, text), text)).toEqual({ text, fixed: [] });
  });
});
