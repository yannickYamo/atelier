// tests/atelier-fix-seam.test.ts — A SENTENCE LEFT UNFINISHED AT A SPLICE IS SEEN BY FORM, AND THE SPAN STAYS (round 4, item 7).
//
// The defect, from a reviewer's fix round: a named sentence was written again as an unfinished one, and the splice joined it
// to the next ("The good news is that The remedy is a ramp."). The seam guard read only repeated words. A broken join is
// visible in form: the replacement stops on a word with no punctuation where the sentence it replaced had ended, and the
// next sentence starts with a capital; or the text before stops mid-sentence and the replacement now opens on a capital
// the sentence did not have. Such a span is refused and stays as it was. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { fixTargets } from '../core/loop/surgical-fix.js';
import { applyRepair, seamFragment, type Applied, type Reverted } from '../core/loop/repair.js';

const TEXT = 'The council closed the wharf in May. The good news is simple. The remedy is a ramp upstream.';
const run = (named: number[], text: string): { out: string; reverted: Reverted[] } => {
  const reverted: Reverted[] = []; const applied: Applied[] = [];
  const t = fixTargets(TEXT, named, 'make it lead into the remedy', '');
  return { out: applyRepair(TEXT, t, [{ id: t[0].id, text }], reverted, applied), reverted };
};

describe('a fragment joined to the next sentence', () => {
  it('"The good news is that" before "The remedy …" is refused, and the sentence stays', () => {
    const r = run([2], 'The good news is that');
    expect(r.out).toBe(TEXT);
    expect(r.reverted).toEqual([{ id: 1, kind: 'SEAM', lost: ['a sentence left unfinished at the join ("is that The remedy")'] }]);
  });
  it('a whole sentence is spliced as before', () => {
    expect(run([2], 'The good news is that it is cheap.').out).toBe('The council closed the wharf in May. The good news is that it is cheap. The remedy is a ramp upstream.');
  });
  it('by form on either side, and never on a name the sentence already opened with', () => {
    expect(seamFragment('It closed. ', 'The good news is that', ' The remedy works.', 'The good news is simple.')).toBe('is that The remedy');
    expect(seamFragment('We know that', 'The remedy works.', ' It is cheap.', 'the remedy works.')).toBe('know that The remedy');
    expect(seamFragment('We told', 'Mara the news.', ' It is cheap.', 'Mara the news.')).toBeNull();
    expect(seamFragment('It closed. ', 'The news is good:', ' The remedy works.', 'The news is good.')).toBeNull();
  });
});
