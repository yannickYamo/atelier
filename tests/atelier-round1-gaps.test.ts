// tests/atelier-round1-gaps.test.ts — THE GAPS THE ROUND-1 REVIEW FOUND IN THE CODE-ONLY REPAIRS AND THE WORK FIELD.
//
// Found by reproduction, each fixed here with its expected value written out by hand:
//   A1 a double hyphen between digits is a range, not a dash ("2018--2020" became "2018, 2020"); and the dash repair
//      rewrote URLs, class names, front matter and quotations;
//   A2 the signpost cut took a sentence's subject ("The short answer, though, is no." became "Though, is no.");
//   A3 the work field ran from the first <work> to the last </work>, so two fields delivered the reasoning between them,
//      and a field shown inside a code fence was taken for the real one.
import { describe, it, expect } from 'vitest';
import { findPattern } from '../core/observers/style.js';
import { replaceEmDashes, cutSignposts } from '../core/loop/mechanical-repair.js';
import { ruleAgainstExamples } from '../core/observers/derive.js';
import { workField } from '../core/loop/work-field.js';

describe('A1: a range is not a dash, and the dash repair leaves what is not prose alone', () => {
  it('between two digits a double hyphen is a range: not counted, not replaced', () => {
    for (const t of ['The war ran 2018--2020 and ended.', 'Pages 10--20 cover it.', 'The score was 3 -- 2 at half time.', 'Version 1.2--1.4 broke it.']) {
      expect(findPattern(t, 'EM_DASH')).toHaveLength(0);
      expect(replaceEmDashes(t)).toBe(t);
    }
  });
  it('a letter on one side is enough: still a dash', () => {
    expect(findPattern('It took 3--and only 3--weeks.', 'EM_DASH')).toHaveLength(2);
  });
  it('a URL, a path or a class name is a token, not prose', () => {
    for (const t of ['See https://example.com/a--b for it.', 'class block__el--mod is used.', 'Open docs/old--new.md first.']) {
      expect(findPattern(t, 'EM_DASH')).toHaveLength(0);
      expect(replaceEmDashes(t)).toBe(t);
    }
  });
  it('front matter is left as it is; the body under it is repaired', () => {
    expect(replaceEmDashes('---\ntitle: a--b\n---\nBody text--here.')).toBe('---\ntitle: a--b\n---\nBody text, here.');
  });
  it('a quotation keeps its own dashes; the prose around it is repaired', () => {
    expect(replaceEmDashes('He said "it was--honestly--fine" to me.')).toBe('He said "it was--honestly--fine" to me.');
    expect(replaceEmDashes('The quay -- which floods -- says “wait—no” on its sign.')).toBe('The quay, which floods, says “wait—no” on its sign.');
  });
  it('the rule against the examples does not count a range as a dash', () => {
    const ban = { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } } as const;
    const body = Array.from({ length: 15 }, () => 'The ferry leaves the pier at eleven and the crossing is calm.').join(' ');
    expect(ruleAgainstExamples(ban as never, [`It ran 2018--2020. ${body}`, `Pages 10--20. ${body}`])).toBeNull();
    expect(ruleAgainstExamples(ban as never, [`It ran--slowly. ${body}`, `Pages 10--20. ${body}`])).toBe('your examples use em dashes (—) in 1 of 2 pieces; your rule bans it; kept as you wrote it');
  });
});

describe('A2: only a whole set-off clause is cut, never a subject', () => {
  const span = (t: string, s: string) => { const start = t.indexOf(s); return { start, end: start + s.length, text: s, why: 'signposting' }; };
  const cut = (t: string, s: string) => cutSignposts(t, [span(t, s)]).text;
  it('a noun phrase that is the subject is left for the model repair', () => {
    expect(cut('The short answer, though, is no.', 'The short answer')).toBe('The short answer, though, is no.');
    expect(cut('The honest answer, as always, is money.', 'The honest answer')).toBe('The honest answer, as always, is money.');
    expect(cut('Plans fail. The long answer, sadly, takes a book.', 'The long answer')).toBe('Plans fail. The long answer, sadly, takes a book.');
    expect(cut("Here's the thing, though: it fails.", "Here's the thing")).toBe("Here's the thing, though: it fails.");
    expect(cut('The short answer: no.', 'The short answer')).toBe('The short answer: no.');
  });
  it('an opening clause followed by a whole clause is cut; one between two commas too', () => {
    expect(cut('In other words, it fails.', 'In other words')).toBe('It fails.');
    expect(cut('The ferry, to be clear, leaves at eleven.', 'to be clear')).toBe('The ferry leaves at eleven.');
  });
  it('a clause trailing before the stop is not cut by code', () => {
    expect(cut('It is late, in other words.', 'in other words')).toBe('It is late, in other words.');
  });
});

describe('A3: each field closes at its own first close tag', () => {
  it('two fields: their insides are the work, joined; the reasoning between them is outside', () => {
    expect(workField('<work>A</work> I reasoned here. <work>B</work>')).toEqual({ text: 'A\n\nB', delimited: true, outside: 'I reasoned here.' });
  });
  it('a field shown inside a code fence is no field', () => {
    expect(workField('Here is it:\n```\n<work>x</work>\n```\n<work>Real</work>')).toEqual({ text: 'Real', delimited: true, outside: 'Here is it:\n```\n<work>x</work>\n```' });
  });
  it('a stray close tag after the field stays outside', () => {
    expect(workField('Note <work>P</work> and </work> trailing')).toEqual({ text: 'P', delimited: true, outside: 'Note\n\nand </work> trailing' });
  });
  it('markup inside the field is the work', () => {
    expect(workField('<work>use <b>bold</b> a<b</work>')).toEqual({ text: 'use <b>bold</b> a<b', delimited: true, outside: '' });
  });
});
