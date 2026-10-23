// atelier/core/loop/piece-plan.ts — A PLAN BEFORE THE DRAFT: THE ARGUMENT, AND THE FEW POINTS IT CARRIES.
//
// Given a brief of nine points, a writer used all nine: the piece became a list in prose, with no thesis a reader could
// repeat. A person writing it would first decide the argument and pick the few points that serve it, leaving the rest. So
// before the draft one reading makes that plan: the angle, the pain the reader has, the turn, the answer, at most three
// points chosen from the material (each tied to the words it comes from), one image if any, the close, and the material
// left out with why. The draft is written from the plan; the plan itself is never the work (it stands outside the
// `<work>` field and is kept in the record for `atelier report`; a line of it the writer prints into the work is dropped,
// and said). A change the person types rebuilds the plan from scratch with every change typed so far, in order, never a
// patch of the last one.
//
// THE READING (house pattern, ../inference/reading.ts). Code grounds it, by form: a point is kept only where the words it
// says it comes from are 5 or more and stand in the material, and every figure (digit sequence) and every capitalised
// name in the point is in those words or the material (at most three kept); the image only where its figures and names
// are in the material; a left-out entry only where its words are in the material; the angle and the answer must be
// there. With material bound and no point traced, the plan would tell the writer to use none of it: there is no plan.
// With no model, or nothing grounded, the floor is no plan: the draft is written as it was before. Nothing here names a
// kind of work.

import { normalLine } from './echo.js';
import { figuresOf } from '../observers/obligations.js';

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
  /** the changes the person typed to the plan, in order: the plan is made again with all of them, from scratch */
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
/** The fewest words the material a point comes from must be. */
export const FROM_WORDS = 5;
// FORM PARSERS, named: words; digit sequences; capitalised tokens other than a sentence's first word.
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const wordsIn = (t: string): string[] => t.match(WORD) ?? [];
const digitsIn = (t: string): string[] => t.match(/\d+/g) ?? [];
const namesIn = (t: string): string[] => t.split(/(?<=[.!?:;])\s+/).flatMap((sentence) => wordsIn(sentence).slice(1).filter((w) => /^\p{Lu}/u.test(w)));
/** Whether every figure and every capitalised name of `t` stands in `source` (its digit sequences, its words). */
const heldBy = (t: string, source: string): boolean => {
  const digits = new Set(digitsIn(source)); const words = new Set(wordsIn(source).map((w) => w.toLowerCase()));
  return digitsIn(t).every((d) => digits.has(d)) && namesIn(t).every((n) => words.has(n.toLowerCase()));
};

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
      input.change ? `The person asked for these changes to the plan, in order; make the plan again with all of them:\n${input.change.slice(0, 2000)}` : ''].filter(Boolean).join('\n\n');
  },
  // Always read: a plan is the reader's to make, or no plan at all (the floor).
  decide() { return null; },
  ground(raw, input) {
    const r = raw as Record<string, unknown> | null;
    if (!r) return null;
    const angle = clip(r.angle, 300); const answer = clip(r.answer, 300);
    if (!angle || !answer) return null;
    const given = input.material.map((m) => m.text).join('\n');
    const source = flat(given);
    const traced = (q: string): boolean => q.length >= 3 && source.includes(flat(q));
    // A point stands on 5 words or more the material holds, and says no figure or name that neither those words nor the
    // material hold; at most three.
    const points = (Array.isArray(r.points) ? r.points as Record<string, unknown>[] : [])
      .map((p) => ({ point: clip(p?.point, 240), from: clip(p?.from, 400) }))
      .filter((p) => p.point && wordsIn(p.from).length >= FROM_WORDS && traced(p.from) && heldBy(p.point, `${p.from}\n${given}`)).slice(0, MAX_POINTS);
    // Material bound and no point traced: a plan would tell the writer to use none of it. No plan; the draft is written as before.
    if (input.material.some((m) => m.text.trim()) && !points.length) return null;
    const leftOut = (Array.isArray(r.left_out) ? r.left_out as Record<string, unknown>[] : [])
      .map((x) => ({ what: clip(x?.what, 240), why: clip(x?.why, 160) })).filter((x) => x.why && traced(x.what)).slice(0, 12);
    const image = clip(r.image, 240);
    return { angle, pain: clip(r.pain, 300), turn: clip(r.turn, 300), answer, points, image: image && heldBy(image, given) ? image : null, close: clip(r.close, 300), leftOut };
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

/**
 * What the writer is told of the plan, after the skill: write from it, and never write it out. Each point is served with
 * the words of the material it comes from and the name of the file that holds them, so its figures and names reach the
 * writer as the material gives them; what the plan left out is not served.
 */
export function planNote(p: PiecePlan, material: readonly { readonly name: string; readonly text: string }[] = []): string {
  // What the plan left out is the person's to see, never the writer's: named to the writer, it was written back in.
  const fromLine = (x: PlanPoint): string => {
    const file = material.find((m) => flat(m.text).includes(flat(x.from)))?.name;
    return `\n  from ${file ? `"${file}"` : 'the material'}, in its words: "${x.from}"`;
  };
  const lines = planLines({ ...p, leftOut: [] }).map((l) => {
    const i = p.points.findIndex((x, k) => l === `Point ${k + 1}: ${x.point}`);
    return `- ${l}${i === -1 ? '' : fromLine(p.points[i])}`;
  });
  return `The plan for this piece (write the piece from it; the plan is not part of the piece, so never write it out):\n\n${lines.join('\n')}${p.points.length ? '\n\nThese points are the material for this piece: write them in your own words, with each figure and name as the material gives it, and nothing else from the notes.' : ''}`;
}

/**
 * THE FIGURES AND NAMES OF THE MATERIAL, as it writes them (form parsers: digit-bearing figures, capitalised tokens other
 * than a sentence's first word). Served beside a plan where a rule of the standard reads the work against the material:
 * the plan serves its points only, and such a rule checks every figure (and, for a written check, every name) against the
 * whole of it.
 */
export function figuresAndNames(material: readonly { readonly text: string }[], withNames: boolean): { readonly figures: readonly string[]; readonly names: readonly string[] } {
  const text = material.map((m) => m.text).join('\n');
  return { figures: [...new Set(figuresOf(text).filter((f) => !f.key.startsWith('pair:')).map((f) => f.raw))], names: withNames ? [...new Set(namesIn(text))] : [] };
}

/**
 * A LINE OF THE SHOWN PLAN PRINTED INTO THE WORK is dropped (a form check: the work line, read without its list marker,
 * case and spacing, is a line of the plan as shown). The text without them, and how many were dropped.
 */
export function withoutPlanLines(text: string, p: PiecePlan): { readonly text: string; readonly removed: number } {
  const shown = new Set(planLines(p).map(normalLine));
  const lines = text.split('\n'); const kept = lines.filter((l) => !(l.trim() && shown.has(normalLine(l))));
  const removed = lines.length - kept.length;
  return removed ? { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, ''), removed } : { text, removed: 0 };
}
