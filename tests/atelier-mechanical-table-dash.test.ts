// tests/atelier-mechanical-table-dash.test.ts — AN EM DASH IN A TABLE IS A CELL, NOT A CLAUSE.
//
// The repair that needs no model split a sentence on its em dashes and joined the parts with commas. In a
// markdown table the dash is often the whole content of a cell ("| Switching costs | — | — |", meaning none),
// and 5 of 16 real outputs shipped rows like "| Switching costs |, |, |". A dash beside a quoted question
// produced ': "doesn't GEPA already do this?" : is'. Held here: a table row keeps its cells and reads as a
// table after the repair, a quoted or colon-edged dash becomes a spaced hyphen, prose keeps its comma, code
// is untouched, and the machine-tell check reads no em dash after the repair.
import { describe, it, expect } from 'vitest';
import { replaceEmDashes } from '../core/loop/mechanical-repair.js';
import { findPattern } from '../core/observers/style.js';
import { measure } from '../core/observers/registry.js';

const cells = (line: string): number => line.split('|').length;

describe('an em dash in a table row', () => {
  it('a cell that is only a dash becomes a hyphen, with the spaces around it kept', () => {
    expect(replaceEmDashes('| Switching costs | — | — |')).toBe('| Switching costs | - | - |');
    expect(replaceEmDashes('| Absent | — | — | — |')).toBe('| Absent | - | - | - |');
    expect(replaceEmDashes('| Absent |—|  –  |')).toBe('| Absent |-|  -  |');
  });
  it('a dash inside a cell becomes a spaced hyphen, never a comma', () => {
    expect(replaceEmDashes('| Cost | low — for now | — |')).toBe('| Cost | low - for now | - |');
    expect(replaceEmDashes('| Cost | low—for now | high |')).toBe('| Cost | low - for now | high |');
    expect(replaceEmDashes('| Cost | `a—b` stays — code | — |')).toBe('| Cost | `a—b` stays - code | - |');
  });
  it('a header separator row is untouched', () => {
    for (const row of ['|---|---|---|', '| :--- | ---: | :---: |', '| Feature | A | B |']) expect(replaceEmDashes(row)).toBe(row);
  });
  it('every row keeps its cell count', () => {
    const table = [
      '| Feature | Us | Them |',
      '|---|---|---|',
      '| Switching costs | — | — |',
      '| Lock-in | low — for now | — |',
      '| Absent | — | — | — |',
      '  | Indented | — | yes |',
    ].join('\n');
    const out = replaceEmDashes(table).split('\n');
    const rows = table.split('\n');
    expect(out).toHaveLength(rows.length);
    rows.forEach((row, i) => { expect(cells(out[i]), out[i]).toBe(cells(row)); });
    expect(out.join('\n')).not.toContain('—');
    expect(out.join('\n')).not.toContain(',');
  });
});

describe('an em dash in prose', () => {
  it('beside a quotation mark or a colon becomes a spaced hyphen, so no \': "…" :\' is left behind', () => {
    expect(replaceEmDashes('The question — "doesn\'t GEPA already do this?" — is the one they ask.'))
      .toBe('The question - "doesn\'t GEPA already do this?" - is the one they ask.');
    expect(replaceEmDashes('The title: — "Why" — is short.')).toBe('The title: - "Why" - is short.');
    expect(replaceEmDashes('He called it “done” — then left.')).toBe('He called it “done” - then left.');
  });
  it('in a plain sentence still gets the comma, and a pair of them a pair of commas', () => {
    expect(replaceEmDashes('Done — really.')).toBe('Done, really.');
    expect(replaceEmDashes('The chart runs — every morning — at 08:00.')).toBe('The chart runs, every morning, at 08:00.');
  });
  it('inside a code fence is untouched, table rows included', () => {
    const code = '```\n| a | — |\nx — y\n```';
    expect(replaceEmDashes(code)).toBe(code);
    expect(replaceEmDashes('~~~\n| a | — |\n~~~\nSo — yes.')).toBe('~~~\n| a | — |\n~~~\nSo, yes.');
  });
});

describe('the machine-tell check after the repair', () => {
  const text = [
    'A short comparison — nothing more.',
    '',
    '| Feature | Us | Them |',
    '|---|---|---|',
    '| Switching costs | — | — |',
    '| Lock-in | low — for now | — |',
    '',
    'The question — "doesn\'t GEPA already do this?" — is the one they ask.',
  ].join('\n');
  it('reads zero em dashes on a text with tables', () => {
    const before = findPattern(text, 'MACHINE_TELL').filter((s) => s.family === 'EM_DASH');
    expect(before.length, 'the fixture must carry em dashes the check sees').toBeGreaterThan(0);
    const out = replaceEmDashes(text);
    expect(findPattern(out, 'MACHINE_TELL').filter((s) => s.family === 'EM_DASH')).toEqual([]);
    const rule = { observer: 'PATTERN_RATE' as const, params: { pattern: ['MACHINE_TELL'], maxPer1000: 1, never: ['EM_DASH'] } };
    expect(measure(text, rule).verdict).toBe('VIOLATED');
    expect(measure(out, rule).verdict).not.toBe('VIOLATED');
  });
});
