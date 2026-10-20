// THE BRIEF IS NEVER PRINTED INTO THE WORK (the v6 study saw it). A line of the served notes that comes back in the draft
// is removed by code before any check reads the draft; the person's own lines are never touched.
import { describe, it, expect } from 'vitest';
import { withoutServedNotes, servedLines } from '../core/loop/echo.js';

const NOTES = `## For this request only

(My usual steps, named below, were read from my own pieces and are not rules I wrote: follow them as my habit, not as requirements.)
For this request, my method's steps that apply: 1, 2, 4. Set aside, not this case: 3 (the request names no vendor).
Decisions it asks for, in order:
- Step 1: decide which vendor costs least for this team (from the price sheet)
Given: the request and prices.md.
Where this piece needs a specific that neither the request nor its material gives, write it in the shape I would and mark it as a slot for me to fill: [figure: what it measures].`;

describe('withoutServedNotes', () => {
  it('removes a served line printed into the draft, with or without its list marker or case, and keeps the rest', () => {
    const draft = `# Which vendor\n\n- For this request, my method's steps that apply: 1, 2, 4. Set aside, not this case: 3 (the request names no vendor).\n\nAcme costs least for this team.\n\nGiven: the request and prices.md.\n\nThe next step is a trial.`;
    const r = withoutServedNotes(draft, NOTES);
    expect(r.removed).toHaveLength(2);
    expect(r.text).toBe('# Which vendor\n\nAcme costs least for this team.\n\nThe next step is a trial.');
  });
  it('an echo with other step numbers opens as the served line opens, and goes too', () => {
    const r = withoutServedNotes('For this request, my method\'s steps that apply: 2 and 5.\n\nAcme costs least.', NOTES);
    expect(r.removed).toEqual(['For this request, my method\'s steps that apply: 2 and 5.']);
    expect(r.text).toBe('Acme costs least.');
  });
  it('touches nothing of the person\'s own: a short served line, a line of code, and prose that shares a few words stay', () => {
    const own = 'Given: the request.\n\n```\nFor this request, my method\'s steps that apply: 1, 2, 4. Set aside, not this case: 3 (the request names no vendor).\n```\n\nFor this request the team needs one vendor by Friday.';
    expect(withoutServedNotes(own, NOTES)).toEqual({ text: own, removed: [] });
    expect(withoutServedNotes('Nothing served here.', '')).toEqual({ text: 'Nothing served here.', removed: [] });
  });
  it('is metamorphic: the same draft against notes about another skill is left alone', () => {
    const draft = 'For this request, my method\'s steps that apply: 1, 2, 4.\n\nAcme costs least.';
    expect(withoutServedNotes(draft, 'Keep every clause of the house NDA in the house order, and number the schedules.').removed).toEqual([]);
    expect(servedLines('a b c\n')).toEqual([]);
  });
});
