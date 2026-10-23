// tests/atelier-piece-plan.test.ts — A PLAN BEFORE THE DRAFT, WITH AT MOST THREE POINTS FROM THE MATERIAL (plan item 7).
//
// Metric the change must move (named before it was built): points used <= 4 of 9 given. A writer given nine notes used
// all nine; the plan chooses at most three, each tied to the words of the material it comes from, lists the rest as left
// out with why, and the draft is written from it. The plan is served to the writer and kept in the record, never
// delivered as the work. With no model, there is no plan and the run writes as before. Expected values are written out.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PIECE_PLAN, planNote, planLines, withoutPlanLines, type PlanInput } from '../core/loop/piece-plan.js';
import { readContext } from '../core/inference/reading.js';
import { beforeTheDraft } from '../cli/prewrite.js';
import type { InferenceRequest } from '../core/inference/client.js';
import type * as store from '../core/state/store.js';
import { anInferenceResult } from './fixtures.js';

// Nine notes, invented.
const NOTES = ['The harbour reopened on Tuesday.', 'The new berth takes two ferries.', 'Crossings now leave every hour.', 'The quay was rebuilt in stone.',
  'Fares stay the same this year.', 'The café on the pier reopens in May.', 'Night crossings return in summer.', 'The old crane stays as a landmark.', 'Parking moved behind the station.'];
const INPUT: PlanInput = { request: 'A post on the harbour reopening.', answers: [], method: [], examples: [], material: [{ name: 'notes', text: NOTES.join('\n') }] };
const PLAN = { angle: 'The harbour is back, and it is busier than before.', pain: 'Locals planned their days around a closed quay.', turn: 'The reopening changes the timetable.', answer: 'Plan around the hourly crossings.',
  points: NOTES.map((n) => ({ point: n.replace('.', ''), from: n })), image: 'Two ferries side by side at the new berth.', close: 'See you on the quay.',
  left_out: [{ what: 'Fares stay the same this year.', why: 'not the argument' }, { what: 'Something never in the notes.', why: 'invented' }] };

describe('the plan, grounded', () => {
  it('of nine points offered, at most three are kept, each standing on words the material holds', () => {
    const p = PIECE_PLAN.ground(PLAN, INPUT);
    expect(p?.points).toHaveLength(3);
    expect(p?.points.map((x) => x.from)).toEqual(NOTES.slice(0, 3));
    expect(p?.leftOut).toEqual([{ what: 'Fares stay the same this year.', why: 'not the argument' }]);
  });
  it('a point whose words are not in the material is dropped; a plan with no angle is no plan', () => {
    expect(PIECE_PLAN.ground({ ...PLAN, points: [{ point: 'x', from: 'words the notes never hold' }, ...PLAN.points.slice(0, 1)] }, INPUT)?.points.map((x) => x.from)).toEqual([NOTES[0]]);
    expect(PIECE_PLAN.ground({ ...PLAN, angle: '' }, INPUT)).toBeNull();
  });
  it('a point stands on 5 words or more of the material, and every figure and capitalised name in it is in its words or the material', () => {
    const p = PIECE_PLAN.ground({ ...PLAN, points: [
      { point: 'Our CEO won an award in 2025 for 40% savings', from: 'the' },
      { point: 'The harbour reopened', from: 'The harbour reopened' },
      { point: 'The harbour reopened after 14 months', from: 'The harbour reopened on Tuesday.' },
      { point: 'Mayor Lund cut the ribbon at the new berth', from: 'The new berth takes two ferries.' },
      { point: 'Night crossings come back in summer', from: 'Night crossings return in summer.' },
    ] }, INPUT);
    expect(p?.points).toEqual([{ point: 'Night crossings come back in summer', from: 'Night crossings return in summer.' }]);
  });
  it('an image with a figure or a name the material does not hold is dropped; one it holds is kept', () => {
    expect(PIECE_PLAN.ground({ ...PLAN, image: 'A 300-ship armada off the quay' }, INPUT)?.image).toBeNull();
    expect(PIECE_PLAN.ground({ ...PLAN, image: 'Ferries queued at Portwick' }, INPUT)?.image).toBeNull();
    expect(PIECE_PLAN.ground(PLAN, INPUT)?.image).toBe('Two ferries side by side at the new berth.');
  });
  it('with material bound and no point traced there is no plan (the floor); with no material the plan stands without points', () => {
    expect(PIECE_PLAN.ground({ ...PLAN, points: [{ point: 'x', from: 'words the notes never hold' }] }, INPUT)).toBeNull();
    const bare = PIECE_PLAN.ground({ ...PLAN, points: [], image: null, left_out: [] }, { ...INPUT, material: [] });
    expect(bare?.points).toEqual([]);
    expect(planNote(bare!)).not.toContain('no others');
  });
  it('a line of the shown plan printed into the work is dropped, and counted', () => {
    const plan = PIECE_PLAN.ground(PLAN, INPUT)!;
    const work = `${planLines(plan)[0]}\n\nThe harbour is open again.\n- ${planLines(plan)[1]}\nSee you there.`;
    expect(withoutPlanLines(work, plan)).toEqual({ text: 'The harbour is open again.\nSee you there.', removed: 2 });
    expect(withoutPlanLines('The harbour is open again.', plan)).toEqual({ text: 'The harbour is open again.', removed: 0 });
  });
  it('with no model there is no plan', async () => {
    expect((await readContext(PIECE_PLAN, INPUT, null, null, { spentUsd: 0, capUsd: 1 })).value).toBeNull();
  });
  it('the writer is told to write from it and never to write it out', () => {
    const note = planNote(PIECE_PLAN.ground(PLAN, INPUT)!);
    expect(note).toContain('the plan is not part of the piece, so never write it out');
    expect(note).toContain('- Point 3: Crossings now leave every hour');
  });
  it('a change asked for is put to the reader with everything else, to make the plan again from scratch', () => {
    expect(PIECE_PLAN.prompt({ ...INPUT, change: 'lead with the café' })).toContain('The person asked for these changes to the plan, in order; make the plan again with all of them:\nlead with the café');
  });
});

describe('before the draft: the plan is made from the answers and returned', () => {
  it('the answers reach the plan; the plan is in the note and on the record', async () => {
    const seen: string[] = [];
    const client = { complete: async (r: InferenceRequest) => { seen.push(r.userMessage); return anInferenceResult({ json: r.toolName === 'emit_plan' ? PLAN : { decisions: [] } }); } };
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-plan-')), skillName: 'quay' } as unknown as store.StoreLayout;
    const p = await beforeTheDraft({ L, request: INPUT.request, material: INPUT.material, method: [], examples: [], questions: false, plan: true, answers: undefined, interactive: false, client, model: 'reader' });
    expect(p.plan?.points).toHaveLength(3);
    expect(p.note).toContain('The plan for this piece');
    expect(p.record?.planBy).toBe('model');
    expect(p.said).toEqual(['Planned before writing: 3 point(s) from the material, 1 left out; the plan is on the record, never in the work (atelier report <run>).']);
  });
});

describe('at a terminal: a change typed to the plan makes it again from scratch', () => {
  it('a second change keeps the first: the plan is made again from the request and every change, in order', async () => {
    const seen: string[] = [];
    const client = { complete: async (r: InferenceRequest) => { seen.push(r.userMessage); return anInferenceResult({ json: PLAN }); } };
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-plan-t2-')), skillName: 'quay' } as unknown as store.StoreLayout;
    const typed = ['lead with the café', 'and end on the crane', ''];
    const p = await beforeTheDraft({ L, request: INPUT.request, material: INPUT.material, method: [], examples: [], questions: false, plan: true, answers: undefined, interactive: true, client, model: 'reader', read: async () => typed.shift() ?? '' });
    expect(p.record?.planChanges).toBe(2);
    expect(seen[2]).toContain('1. lead with the café\n2. and end on the crane');
  });
  it('the change goes to the reader with the whole input; enter then writes from the new plan', async () => {
    const seen: string[] = []; let n = 0;
    const client = { complete: async (r: InferenceRequest) => { seen.push(r.userMessage); n += 1;
      return anInferenceResult({ json: { ...PLAN, angle: n === 1 ? PLAN.angle : 'The café is the reason to come back.' } }); } };
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-plan-t-')), skillName: 'quay' } as unknown as store.StoreLayout;
    const typed = ['lead with the café', ''];
    const p = await beforeTheDraft({ L, request: INPUT.request, material: INPUT.material, method: [], examples: [], questions: false, plan: true, answers: undefined, interactive: true, client, model: 'reader', read: async () => typed.shift() ?? '' });
    expect(p.plan?.angle).toBe('The café is the reason to come back.');
    expect(p.record?.planChanges).toBe(1);
    expect(seen[1]).toContain('The material:');
    expect(seen[1]).toContain('lead with the café');
  });
});
