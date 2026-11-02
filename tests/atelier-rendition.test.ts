// tests/atelier-rendition.test.ts — THE PLAIN MODEL'S HABITS IN FORM: QUOTE-GROUNDED IN AT LEAST TWO BARE DRAFTS, KEPT
// WITH THE SKILL, SERVED AS FORM TO AVOID UNLESS THE AUTHOR USES IT.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RENDITION, renditionNote, writeRenditionPrior, readRenditionPrior, MAX_HABITS } from '../core/library/rendition.js';
import { readContext } from '../core/inference/reading.js';
import { anInferenceResult } from './fixtures.js';

const DRAFTS = [
  'Have you ever wondered why harbours matter? Harbours are vital. In conclusion, the future is bright.',
  'Have you ever stopped to think about ferries? Ferries connect us. Ultimately, the journey continues.',
  'The quay is busy at dawn. Boats leave early. In conclusion, change is coming.',
];
const IN = { kind: 'a blog post', drafts: DRAFTS };

describe('the reading, grounded', () => {
  it('keeps a habit quoted from two drafts, drops one quoted from one, drops a quote no draft holds', () => {
    const g = RENDITION.ground({ habits: [
      { part: 'OPENING', habit: 'opens on a question to the reader', quotes: [{ draft: 1, quote: 'Have you ever wondered' }, { draft: 2, quote: 'Have you ever stopped' }] },
      { part: 'CLOSING', habit: 'closes on a summary signpost', quotes: [{ draft: 1, quote: 'In conclusion' }, { draft: 3, quote: 'In conclusion, change' }, { draft: 2, quote: 'not in it' }] },
      { part: 'STRUCTURE', habit: 'one-line paragraphs', quotes: [{ draft: 3, quote: 'Boats leave early' }] },
      { part: 'CLOSING', habit: 'invented', quotes: [{ draft: 1, quote: 'nowhere at all' }, { draft: 9, quote: 'Harbours' }] },
    ] }, IN);
    expect(g?.habits.map((h) => [h.part, h.habit, h.quotes.map((q) => q.draft)])).toEqual([
      ['OPENING', 'opens on a question to the reader', [1, 2]],
      ['CLOSING', 'closes on a summary signpost', [1, 3]],
    ]);
  });
  it('at most six habits; fewer than two drafts is decided by code with none; no model is the floor with none', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ part: 'OPENING', habit: `h${i}`, quotes: [{ draft: 1, quote: 'Have you' }, { draft: 2, quote: 'Have you' }] }));
    expect(RENDITION.ground({ habits: many }, IN)?.habits).toHaveLength(MAX_HABITS);
    expect(RENDITION.decide({ kind: 'k', drafts: ['one'] })?.habits).toEqual([]);
    const r = await readContext(RENDITION, IN, null, null, { spentUsd: 0, capUsd: 1 });
    expect([r.by, r.value.habits]).toEqual(['floor', []]);
  });
  it('a fake client\'s answer comes through readContext grounded', async () => {
    const client = { complete: async () => anInferenceResult({ json: { habits: [{ part: 'CLOSING', habit: 'ends on a summary', quotes: [{ draft: 1, quote: 'in conclusion' }, { draft: 3, quote: 'IN CONCLUSION' }] }] } }) };
    const r = await readContext(RENDITION, IN, client, 'm', { spentUsd: 0, capUsd: 1 });
    expect([r.by, r.value.habits.length]).toEqual(['model', 1]);
  });
});

describe('kept and served', () => {
  it('is written beside the skill and read back; a missing file is none', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'rendition-')), skillName: 's' };
    expect(readRenditionPrior(L)).toBeNull();
    const prior = { kind: 'a blog post', drafts: 3, habits: [{ part: 'CLOSING' as const, habit: 'ends on a summary', quotes: [{ draft: 1, quote: 'In conclusion' }] }] };
    writeRenditionPrior(L, prior);
    expect(readRenditionPrior(L)).toEqual(prior);
  });
  it('the writer is told the habits as form to avoid, opening first; nothing with no habits', () => {
    const note = renditionNote({ kind: 'k', drafts: 3, habits: [{ part: 'CLOSING', habit: 'ends on a summary', quotes: [] }, { part: 'OPENING', habit: 'opens on a question', quotes: [] }] });
    expect(note).toBe("These are the plain model's habits for this kind: avoid them in form unless the author's own pieces use them.\n\n- Opening: opens on a question\n- Closing: ends on a summary");
    expect(renditionNote(null)).toBe('');
  });
});
