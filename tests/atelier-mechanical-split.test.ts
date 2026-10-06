// tests/atelier-mechanical-split.test.ts — WHAT THE PARAGRAPH RULE FLAGS IS WHAT THE SPLIT FIXES.
//
// Under strict delivery an answer was refused for a paragraph of five sentences against a limit of four: the split
// that needs no model found paragraphs and sentences its own way, saw nothing to split, and the rule stayed broken.
// The split now reads the text as the rule does. Held here as an invariant: whatever the rule flags, after the
// split the rule holds, and not a word has changed.
import { describe, it, expect } from 'vitest';
import { splitLongParagraphs } from '../core/loop/mechanical-repair.js';
import { measure } from '../core/observers/registry.js';
import { wordsOf } from '../core/observers/text.js';

const rule = (max: number) => ({ observer: 'PARAGRAPH_LENGTH' as const, params: { maxSentences: max } });
const holds = (text: string, max: number): boolean => measure(text, rule(max)).verdict !== 'VIOLATED';
const sameWords = (a: string, b: string): boolean => wordsOf(a).join(' ') === wordsOf(b).join(' ');

describe('a long paragraph is split wherever the rule sees one', () => {
  const cases: [string, string][] = [
    ['a plain paragraph', 'Run the migration. Then restart the worker. Check the queue. It should drain. If it does not, stop.'],
    ['a paragraph with a list directly under it', 'Run the migration. Then restart the worker. Check the queue. It should drain. If it does not, stop:\n- roll back\n- page the owner'],
    ['a hard-wrapped paragraph', 'Run the migration. Then restart\nthe worker. Check the queue. It\nshould drain. If it does not, stop.'],
    ['sentences that carry inline code', 'Run `npm ci`. Then `npm test` checks it. Use `--force` only once. It rewrites the lock. Commit the result.'],
    ['a block quote', '> Run the migration. Then restart the worker. Check the queue. It should drain. If it does not, stop.'],
    ['two paragraphs, one long', 'Short one. Still short.\n\nRun the migration. Then restart the worker. Check the queue. It should drain. If it does not, stop. Then tell the team.'],
  ];
  for (const [name, text] of cases) {
    it(`${name}: the rule is broken before, holds after, and no word changed`, () => {
      expect(holds(text, 4), 'the fixture must break the rule').toBe(false);
      const out = splitLongParagraphs(text, 4);
      expect(holds(out, 4), out).toBe(true);
      expect(sameWords(text, out)).toBe(true);
    });
  }
  it('keeps the quote in a block quote, the list under its paragraph, and the code inside its sentence', () => {
    expect(splitLongParagraphs('> One. Two. Three. Four. Five.', 4)).toBe('> One. Two. Three.\n\n> Four. Five.');
    expect(splitLongParagraphs('One. Two. Three. Four. Five:\n- a\n- b', 4)).toMatch(/Four\. Five:\n- a\n- b$/);
    expect(splitLongParagraphs('Run `npm ci`. Then `npm test` checks it. Use `--force` only once. It rewrites the lock. Commit the result.', 4)).toContain('`--force` only once.');
  });
  it('for every length and every limit, the rule holds after the split', () => {
    for (let max = 1; max <= 6; max++) {
      for (let n = 1; n <= 20; n++) {
        const text = Array.from({ length: n }, (_, i) => `Sentence number ${i + 1} is here.`).join(' ');
        const out = splitLongParagraphs(text, max);
        expect(holds(out, max), `${n} sentences, at most ${max}`).toBe(true);
        expect(sameWords(text, out)).toBe(true);
      }
    }
  });
  it('leaves alone what is not a long paragraph: a list item, a short paragraph, code', () => {
    for (const t of ['- One. Two. Three. Four. Five. Six. Seven.', 'One. Two.', '```\nOne. Two. Three. Four. Five. Six.\n```']) expect(splitLongParagraphs(t, 4)).toBe(t);
  });
});
