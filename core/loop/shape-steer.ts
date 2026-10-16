// atelier/core/loop/shape-steer.ts — WHICH LEARNED SHAPE BANDS A RUN STEERS, AND THE REMOVAL THAT NEEDS NO MODEL.
//
// A skill built from five tweets learns its shape bands as PREFERRED (../observers/short-form.ts): the author's habit,
// never a rule until the owner makes it one. Listed only, they did nothing: a writer that answered "write a tweet" with
// a 384-character corporate paragraph had it delivered as written, against pieces that run 117 to 155 characters. So a
// learned band is a GRADED TARGET for the run, routed as a counted feature's miss is (./run-repair.ts, `gradedRules`):
// never a failure, never a line that lowers the verdict, off with `--graded none`, and every step it causes held to
// the one acceptance rule (./repair.ts, `applyStep`: no enforced rule newly broken or further from holding).
//
//   LENGTH     characters and words past their band's ceiling: the piece is written again toward the band (the
//              length-aimed action, ./controller.ts), told how far and what to aim for. A sentence rewrite cannot carry a
//              length. A draft short of the band is not steered up: that asks for padding (`steersMiss`).
//   REMOVAL    hashtags, links and emoji over the band's ceiling: the extras removed in code, no model call. A trailing
//              run of them goes whole; a hashtag inside a sentence keeps its word ("the #approval" → "the approval").
//
// NOT STEERED, ON PURPOSE: the count of sentences, the longest sentence, line breaks, mentions, and what a piece opens or
// closes on. Rhythm and the build of a sentence are never steered by a count (a draft cut to the author's number of
// sentences is pace by arithmetic), and an opening or a closing is a kind a rewrite would have to invent: those stay
// preferences the run lists, for the person to read.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import type { NumericShape } from '../observers/shape.js';

/** The learned shapes a run steers toward their band, and how. */
export const STEERED_SHAPES: Readonly<Partial<Record<NumericShape, 'length' | 'remove'>>> = {
  characters: 'length', words: 'length', hashtags: 'remove', links: 'remove', emoji: 'remove',
};

/** The shape a SHAPE measurement holds, when a run may steer it; null for every other measurement. */
export function steeredShape(m: Measurement | null | undefined): { readonly shape: NumericShape; readonly how: 'length' | 'remove' } | null {
  if (m?.observer !== 'SHAPE') return null;
  const id = (m.params.shape as readonly string[] | undefined)?.[0] as NumericShape | undefined;
  const how = id ? STEERED_SHAPES[id] : undefined;
  return id && how ? { shape: id, how } : null;
}

/**
 * IS A MISS OF A STEERED SHAPE ONE THE RUN ACTS ON? Only one past the band's ceiling: a piece that runs long, a hashtag
 * too many. A draft short of the author's floor is not steered up toward it: it could be filled only with words the
 * request did not ask for, which is padding at best and invention at worst (as a specifics feature below its band is
 * never a miss, ./graded.ts). Such a miss stays a preference the run lists.
 */
export function steersMiss(m: Measurement | null | undefined, error: number | undefined, value?: number | null): boolean {
  const sh = steeredShape(m);
  if (sh === null || (error ?? 0) <= 0) return false;
  // a length is acted on only past the ceiling by more than the tolerance (LENGTH_TOLERANCE): length is held loosely
  const max = m?.params.max;
  return sh.how !== 'length' || typeof value !== 'number' || typeof max !== 'number' || value > max * (1 + LENGTH_TOLERANCE);
}

/**
 * IS THIS SHAPE RULE THE AUTHOR'S HABIT, LEARNED FROM THEIR PIECES? Only that is steered as a habit. A rule the owner
 * stated, added or authored is theirs: it is held as they gave it, never pulled at as a preference; one they made
 * REQUIRED is enforced like any rule they require (the caller leaves enforced rules out).
 */
export const learnedShape = (r: Pick<Requirement, 'provenance' | 'authority' | 'measurement'>): boolean =>
  steeredShape(r.measurement) !== null && r.provenance !== 'EXPERT_STATED' && r.provenance !== 'EXPERT_ADDED' && r.authority !== 'EXPERT_AUTHORED';

// a hashtag holds a letter: "#42" is an issue number, "C#" a language
const HASHTAG = /(?<![\w&])#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/g;
// an emoji with what rides on it: a skin tone, a variation selector, a joiner and the emoji it joins
const EMOJI = /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic})*/gu;
const PATTERN: Readonly<Record<'hashtags' | 'links' | 'emoji', RegExp>> = { hashtags: HASHTAG, links: LINK, emoji: EMOJI };

/**
 * The text with every `shape` (hashtags, links, emoji) past the first `max` removed, and the gaps closed. A HASHTAG IS A
 * TAG ONLY WHERE IT STANDS OUTSIDE THE SENTENCE: on a line of tags, or after the sentence has ended (". #devops"). There
 * it goes whole. Anywhere else it is a word of the sentence ("after #approval.", "#Python is"): its `#` goes and its word
 * stays, so no removal takes a word away. Links and emoji go whole, with the space before them; a line a removal empties
 * goes with it. Nothing else in the text changes.
 */
export function removeShapeExtras(text: string, shape: 'hashtags' | 'links' | 'emoji', max: number): string {
  const re = new RegExp(PATTERN[shape].source, PATTERN[shape].flags);
  const found = [...text.matchAll(re)].slice(Math.max(0, max));
  let out = text;
  for (const m of found.reverse()) {
    const start = m.index; const end = start + m[0].length;
    // what stands beside it on its line once the other tags, links and emoji are set aside
    const bare = (t: string): string => t.replace(new RegExp(HASHTAG.source, 'gu'), '').replace(new RegExp(LINK.source, 'g'), '').replace(new RegExp(EMOJI.source, 'gu'), '').trim();
    const lineBefore = bare(out.slice(0, start).split('\n').pop() ?? ''); const lineAfter = bare(out.slice(end).split('\n')[0]);
    // a tag: nothing of the sentence after it, and before it either nothing or a sentence that has already ended
    const isTag = !/[\p{L}\p{N}]/u.test(lineAfter) && (lineBefore === '' || /[.!?…]["'”’)\]]*$/u.test(lineBefore));
    const inSentence = shape === 'hashtags' && !isTag;
    if (inSentence) { out = `${out.slice(0, start)}${m[0].slice(1)}${out.slice(end)}`; continue; }
    const before = out.slice(0, start).replace(/[ \t]+$/, ''); const after = out.slice(end).replace(/^[ \t]+/, '');
    out = `${before}${before && after && !before.endsWith('\n') && !after.startsWith('\n') && !/^[.,;:!?)]/.test(after) ? ' ' : ''}${after}`;
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * HOW CLOSE A LENGTH NEEDS TO BE (owner, 16 Oct): length comes with pace and style, so it is held loosely. A draft within
 * 15% of the author's band is left as it is; one further out is aimed at the band itself, never at a number under its
 * floor, so the writer cannot be sent below the author's range.
 */
export const LENGTH_TOLERANCE = 0.15;
/** What to aim for once a length is past its learned band and the tolerance: the band, with the move that mends it. */
export function shapeLengthAim(n: number, lo: number | null, hi: number | null, unit: 'characters' | 'words'): { readonly aim?: string; readonly move?: string; readonly off: number } {
  const band = lo !== null && hi !== null ? `${lo} to ${hi}` : hi !== null ? `${hi} or fewer` : `${lo} or more`;
  if (hi !== null && n > hi * (1 + LENGTH_TOLERANCE)) return { aim: `aim for ${band} ${unit}`, move: `about ${n - hi} ${unit} shorter`, off: n - hi };
  if (lo !== null && n < lo * (1 - LENGTH_TOLERANCE)) return { aim: `aim for ${band} ${unit}`, move: `about ${lo - n} ${unit} longer`, off: lo - n };
  return { off: 0 };
}
