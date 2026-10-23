// atelier/core/loop/piece-plan.ts — A PLAN BEFORE THE DRAFT: THE ARGUMENT, AND THE FEW POINTS IT CARRIES.
//
// Given a brief of nine points, a writer used all nine: the piece became a list in prose, with no thesis a reader could
// repeat. A person writing it would first decide the argument and pick the few points that serve it, leaving the rest. So
// before the draft one reading makes that plan: the angle, the pain the reader has, the turn, the answer, at most three
// points chosen from the material (each tied to the words it comes from), one image if any, the close, and the material
// left out with why. The draft is written from the plan; the plan itself is never the work (it stands outside the
// `<work>` field and is kept in the record for `atelier report`). A change the person types rebuilds the plan from
// scratch with their change, never a patch of the last one.
//
// THE READING (house pattern, ../inference/reading.ts). Code grounds it: a point is kept only where the words it says it
// comes from are in the material (at most three kept); a left-out entry only where its words are in the material; the
// angle and the answer must be there. With no model, or nothing grounded, the floor is no plan: the draft is written as
// it was before. Nothing here names a kind of work.

import type { Reading } from '../inference/reading.js';

/** The most points a plan carries. */
export const MAX_POINTS = 3;

export interface PlanPoint { readonly point: string; readonly from: string }
export interface PiecePlan {
  readonly angle: string; readonly pain: string; readonly turn: string; readonly answer: string;
  readonly points: readonly PlanPoint[];
  readonly image: string | null;
  readonly close: string;
  readonly leftOut: readonly { readonly what: string; readonly why: string }[];
}
export interface PlanInput {
  readonly request: string;
  /** the answers the person gave before writing (./questions.ts), as asked and answered */
  readonly answers: readonly { readonly ask: string; readonly answer: string }[];
  readonly method: readonly string[];
  readonly examples: readonly string[];
  readonly material: readonly { readonly name: string; readonly text: string }[];
  /** a change the person typed to the last plan: the plan is made again with it, from scratch */
  readonly change?: string;
}

export const PLAN_SYSTEM = `You plan one piece before it is written, in the person's own voice. You are shown their request, the answers they gave before writing, their method, the heads of a few of their finished pieces, and the material (notes) the piece is written from.

Make the plan a person would make before writing:
- angle: the one thing this piece argues, in a sentence.
- pain: what the reader has or feels that makes it matter to them.
- turn: the move from the pain to the answer.
- answer: what the piece says to do or to see.
- points: at most THREE points from the material that serve the angle; for each, the point in your words, and "from": the words of the material it comes from, copied exactly. Leave the rest out: a piece that uses every note argues nothing.
- image: one concrete image or example for the piece, or null.
- close: how it ends, in a sentence.
- left_out: each piece of the material not used, as "what" (its words, copied exactly) and "why" (a few words).

Where the person's answers or a change they asked for say something, the plan follows it. Where the method says how a piece of theirs is built, the plan follows the method.`;

export const PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    angle: { type: 'string' }, pain: { type: 'string' }, turn: { type: 'string' }, answer: { type: 'string' },
    points: { type: 'array', items: { type: 'object', properties: { point: { type: 'string' }, from: { type: 'string' } }, required: ['point', 'from'], additionalProperties: false } },
    image: { type: ['string', 'null'] }, close: { type: 'string' },
    left_out: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'], additionalProperties: false } },
  },
  required: ['angle', 'pain', 'turn', 'answer', 'points', 'image', 'close', 'left_out'], additionalProperties: false,
};

const clip = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const flat = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

export const PIECE_PLAN: Reading<PlanInput, PiecePlan | null> = {
  id: 'piece-plan', version: '1',
  system: PLAN_SYSTEM, schema: PLAN_SCHEMA,
  toolName: 'emit_plan', toolDescription: 'The plan of the piece: angle, pain, turn, answer, at most three points from the material, one image, the close, and what is left out.',
  maxTokens: 1500, estimateUsd: 0.015,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.answers.length ? `Their answers before writing:\n${input.answers.map((a) => `- ${a.ask} ${a.answer}`).join('\n')}` : '',
      input.method.length ? `The method:\n${input.method.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
      ...input.examples.slice(0, 3).map((e, i) => `Piece ${i + 1} (head):\n${e.slice(0, 800)}`),
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.text.slice(0, 6000)}`).join('\n\n')}` : 'No material came with it.',
      input.change ? `The person asked for this change to the plan; make the plan again with it:\n${input.change.slice(0, 1000)}` : ''].filter(Boolean).join('\n\n');
  },
  // Always read: a plan is the reader's to make, or no plan at all (the floor).
  decide() { return null; },
  ground(raw, input) {
    const r = raw as Record<string, unknown> | null;
    if (!r) return null;
    const angle = clip(r.angle, 300); const answer = clip(r.answer, 300);
    if (!angle || !answer) return null;
    const source = flat(input.material.map((m) => m.text).join('\n'));
    const traced = (q: string): boolean => q.length >= 3 && source.includes(flat(q));
    // A point stands on words the material holds; at most three.
    const points = (Array.isArray(r.points) ? r.points as Record<string, unknown>[] : [])
      .map((p) => ({ point: clip(p?.point, 240), from: clip(p?.from, 400) })).filter((p) => p.point && traced(p.from)).slice(0, MAX_POINTS);
    const leftOut = (Array.isArray(r.left_out) ? r.left_out as Record<string, unknown>[] : [])
      .map((x) => ({ what: clip(x?.what, 240), why: clip(x?.why, 160) })).filter((x) => x.why && traced(x.what)).slice(0, 12);
    return { angle, pain: clip(r.pain, 300), turn: clip(r.turn, 300), answer, points, image: clip(r.image, 240) || null, close: clip(r.close, 300), leftOut };
  },
  // No model, or nothing grounded: no plan, the draft is written as it was.
  floor() { return null; },
};

/** The plan as a person reads it before the draft, in a few lines. */
export function planLines(p: PiecePlan): string[] {
  return [`Angle: ${p.angle}`, ...(p.pain ? [`Pain: ${p.pain}`] : []), ...(p.turn ? [`Turn: ${p.turn}`] : []), `Answer: ${p.answer}`,
    ...p.points.map((x, i) => `Point ${i + 1}: ${x.point}`), ...(p.image ? [`Image: ${p.image}`] : []), ...(p.close ? [`Close: ${p.close}`] : []),
    ...(p.leftOut.length ? [`Left out (${p.leftOut.length}): ${p.leftOut.map((x) => `"${x.what.slice(0, 60)}" (${x.why})`).join('; ')}`] : [])];
}

/** What the writer is told of the plan, after the skill: write from it, and never write it out. */
export function planNote(p: PiecePlan): string {
  return `The plan for this piece (write the piece from it; the plan is not part of the piece, so never write it out):\n\n${planLines(p).map((l) => `- ${l}`).join('\n')}\n\nUse these points from the material and no others; what is left out stays out.`;
}
