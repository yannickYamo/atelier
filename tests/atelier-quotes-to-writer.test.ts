// tests/atelier-quotes-to-writer.test.ts — WITH THE SWITCH ON, THE WRITER MAY QUOTE WHAT THE NOTES QUOTE.
//
// The defect (25 Nov): notes written as sentences are served as points, and the writer was told not to
// reuse "its coined phrases". Founder notes gave lines in quotation marks, and those lines are the founder's voice: the
// writer dropped or paraphrased 7 of 7 of them, while a writer shown the posts pasted kept 5 of 8. Told that a quoted line may be
// quoted word for word, in quotation marks, it kept 6 of 7. A change to what the writer reads waits for blind pairs, so
// it is behind ATELIER_QUOTES_TO_WRITER=1, off by default (cli/direct.ts).
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { taskBlock, DIRECT_POINTS_NOTE, DIRECT_POINTS_QUOTES_NOTE } from '../core/direct/prompt.js';

const x = { material: [{ name: 'notes', text: "- 'Headcount is a coordination tax.'" }], task: 'Write the essay.' };

describe('what the writer is told of notes written as sentences', () => {
  it('by default: points to write from, in new sentences, as before', () => {
    expect(taskBlock({ ...x, points: true })).toContain(DIRECT_POINTS_NOTE);
    expect(taskBlock({ ...x, points: true })).not.toContain(DIRECT_POINTS_QUOTES_NOTE);
  });
  it('with the switch: the same, and a line the notes quote may be quoted word for word, in quotation marks', () => {
    const t = taskBlock({ ...x, points: 'quotes' });
    expect(t).toContain(DIRECT_POINTS_QUOTES_NOTE);
    expect(t).not.toContain(DIRECT_POINTS_NOTE);
    expect(DIRECT_POINTS_QUOTES_NOTE).toMatch(/word for word, in quotation marks/);
  });
});
