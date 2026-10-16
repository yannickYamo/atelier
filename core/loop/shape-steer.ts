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
export const steersMiss = (m: Measurement | null | undefined, error: number | undefined): boolean => steeredShape(m) !== null && (error ?? 0) > 0;

/**
 * IS THIS SHAPE RULE THE AUTHOR'S HABIT, LEARNED FROM THEIR PIECES? Only that is steered as a habit. A rule the owner
 * stated, added or authored is theirs: it is held as they gave it, never pulled at as a preference; one they made
 * REQUIRED is enforced like any rule they require (the caller leaves enforced rules out).
 */
export const learnedShape = (r: Pick<Requirement, 'provenance' | 'authority' | 'measurement'>): boolean =>
  steeredShape(r.measurement) !== null && r.provenance !== 'EXPERT_STATED' && r.provenance !== 'EXPERT_ADDED' && r.authority !== 'EXPERT_AUTHORED';

const HASHTAG = /(?<![\w&])#[\p{L}\p{N}_]+/gu;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/g;
// an emoji with what rides on it: a skin tone, a variation selector, a joiner and the emoji it joins
const EMOJI = /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic})*/gu;
const PATTERN: Readonly<Record<'hashtags' | 'links' | 'emoji', RegExp>> = { hashtags: HASHTAG, links: LINK, emoji: EMOJI };

/**
 * The text with every `shape` (hashtags, links, emoji) past the first `max` removed, and the gaps closed. A hashtag with
 * words of the sentence after it on its line is part of the sentence: its `#` goes and its word stays. Anything else goes
 * whole, with the space before it; a line it empties goes with it. Nothing else in the text changes.
 */
export function removeShapeExtras(text: string, shape: 'hashtags' | 'links' | 'emoji', max: number): string {
  const re = new RegExp(PATTERN[shape].source, PATTERN[shape].flags);
  const found = [...text.matchAll(re)].slice(Math.max(0, max));
  let out = text;
  for (const m of found.reverse()) {
    const start = m.index; const end = start + m[0].length;
    const rest = out.slice(end).split('\n')[0];
    // a hashtag inside a sentence: the words after it on its line are not all hashtags, links or emoji
    const inSentence = shape === 'hashtags' && /[\p{L}\p{N}]/u.test(rest.replace(new RegExp(HASHTAG.source, 'gu'), '').replace(new RegExp(LINK.source, 'g'), ''));
    if (inSentence) { out = `${out.slice(0, start)}${m[0].slice(1)}${out.slice(end)}`; continue; }
    const before = out.slice(0, start).replace(/[ \t]+$/, ''); const after = out.slice(end).replace(/^[ \t]+/, '');
    out = `${before}${before && after && !before.endsWith('\n') && !after.startsWith('\n') && !/^[.,;:!?)]/.test(after) ? ' ' : ''}${after}`;
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * WHAT TO AIM FOR, AFTER A LENGTH MISSES ITS LEARNED BAND: inside the band by as much as the draft was outside it, and
 * by a tenth of the band's edge at most (as `lengthAim` sets a length in words, cli/commands/invoke.ts), so a writer who
 * overshoots lands in the range. With the move that mends it, in the band's own unit.
 */
export function shapeLengthAim(n: number, lo: number | null, hi: number | null, unit: 'characters' | 'words'): { readonly aim?: string; readonly move?: string; readonly off: number } {
  if (hi !== null && n > hi) return { aim: `aim for ${Math.max(hi - (n - hi), Math.round(hi * 0.9))} ${unit} or fewer`, move: `about ${n - hi} ${unit} shorter`, off: n - hi };
  if (lo !== null && n < lo) return { aim: `aim for ${Math.min(lo + (lo - n), Math.round(lo * 1.1))} ${unit} or more`, move: `about ${lo - n} ${unit} longer`, off: lo - n };
  return { off: 0 };
}
