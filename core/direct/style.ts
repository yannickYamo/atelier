// atelier/core/direct/style.ts — HOW THE AUTHOR WRITES, READ ON THE PIECE: THEIR HABITS AND THE STEPS NO CHECK READS.
//
// The build reads how the author sounds from their own pieces (core/compiler/persona.ts): each habit quoted from them, with
// how often they do it. Served to the writer as rules, those habits buried the voice, so the direct writer stopped serving
// them; and nothing read them again. The method's steps that no check can count (an ending on an idea, a reason for every
// feature) were "yours to judge" on every run. This reading gives both a reader, after the draft and never before it:
// for each habit the author shows always or often, and each step of theirs no check reads, is it held in this piece?
//
// WHAT IT DOES. It is never shown to the writer. On a plain run it is read on the delivered piece and said beside it, and
// on the record: report only. With `--style-review`, it is read on the first draft instead, and only what the draft does
// not hold reaches the one self-review, each habit with the author's own sentence: the arm a study compares with the run
// without it, before it is ever the default.
//
// GROUNDED BY CODE. "Held" stands only with a quote copied from the piece, found in it; a "held" with no such quote is
// not read, never held. A habit the build read with no quote of the author's is never asked.

import type { Reading } from '../inference/reading.js';

/** One thing read on the piece: an author's habit, or a step of their method no check reads. */
export interface StyleItem {
  readonly id: string;
  readonly kind: 'habit' | 'step';
  /** the habit as the build described it, or the step in the author's words */
  readonly text: string;
  /** the author's own sentence that shows the habit (habits only) */
  readonly theirs?: string;
}
export interface StyleInput { readonly items: readonly StyleItem[]; readonly piece: string }
/** What was read of one item: held with the piece's own words, not held, or not read (no grounded answer). */
export interface StyleFound { readonly id: string; readonly held: boolean | null; readonly quote?: string }
export interface StyleReading { readonly found: readonly StyleFound[] }

/** The most items one reading is asked: the habits first, then the steps. */
export const STYLE_ITEMS_MAX = 16;
/** Of those, the most the habits take, so a long persona never crowds out the author's own steps. */
export const STYLE_HABITS_MAX = 10;

export const STYLE_SYSTEM = `You read one piece of writing against how its author writes. You are given the author's habits, each with a sentence of theirs that shows it, and steps of the author's method. For each one, say whether the piece holds it.

- held: true when the piece does it, false when it does not.
- quote: for held true, a short passage copied exactly from the piece that shows it; for held false, null.

Judge the piece as the author would. A habit is held when the piece does the same kind of thing, on its own subject; it is not held when the piece never does it, or does the opposite. Do not judge anything else.`;

const ONE = { type: 'object', properties: { id: { type: 'string' }, held: { type: 'boolean' }, quote: { type: ['string', 'null'] } }, required: ['id', 'held', 'quote'], additionalProperties: false };
export const STYLE_SCHEMA: Record<string, unknown> = { type: 'object', properties: { items: { type: 'array', items: ONE } }, required: ['items'], additionalProperties: false };

const flat = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

export const STYLE_READ: Reading<StyleInput, StyleReading> = {
  id: 'style-read', version: '1',
  system: STYLE_SYSTEM, schema: STYLE_SCHEMA,
  toolName: 'emit_style_read', toolDescription: 'For each of the author\'s habits and steps: whether the piece holds it, with the piece\'s own words.',
  maxTokens: 3000, estimateUsd: 0.02,
  prompt(input) {
    const habits = input.items.filter((i) => i.kind === 'habit');
    const steps = input.items.filter((i) => i.kind === 'step');
    return [habits.length ? `The author's habits:\n${habits.map((h) => `- [${h.id}] ${h.text}${h.theirs ? ` (theirs: "${h.theirs}")` : ''}`).join('\n')}` : '',
      steps.length ? `Steps of the author's method:\n${steps.map((s) => `- [${s.id}] ${s.text}`).join('\n')}` : '',
      `The piece:\n<piece>\n${input.piece.slice(0, 24_000)}\n</piece>`].filter(Boolean).join('\n\n');
  },
  // nothing to read, or nothing to read it on: no call
  decide(input) { return input.items.length && input.piece.trim() ? null : { found: [] }; },
  ground(raw, input) {
    const r = raw as { items?: unknown } | null;
    if (!r || !Array.isArray(r.items)) return null;
    const ids = new Set(input.items.map((i) => i.id)); const piece = flat(input.piece);
    const by = new Map<string, StyleFound>();
    for (const x of r.items as Record<string, unknown>[]) {
      const id = typeof x.id === 'string' ? x.id : '';
      if (!ids.has(id) || by.has(id) || typeof x.held !== 'boolean') continue;
      const quote = typeof x.quote === 'string' ? x.quote.trim() : '';
      if (!x.held) { by.set(id, { id, held: false }); continue; }
      // held only with the piece's own words, found in it
      by.set(id, quote.length >= 8 && piece.includes(flat(quote)) ? { id, held: true, quote: quote.slice(0, 200) } : { id, held: null });
    }
    return { found: input.items.map((i) => by.get(i.id) ?? { id: i.id, held: null }) };
  },
  floor(input) { return { found: input.items.map((i) => ({ id: i.id, held: null })) }; },
};

/** A habit as the build read it, enough to be asked: how often, and the author's own sentence. */
interface Habit { readonly description: string; readonly frequency: string; readonly quote: string; readonly kind?: string }

/**
 * What is read: the habits the author shows always or often (where the build counted a habit, its count decides: a
 * standing habit), each with their own sentence, then the steps of their method no check reads.
 */
export function styleItems(habits: readonly Habit[], steps: readonly string[]): StyleItem[] {
  const standing = habits.filter((h) => h.quote.trim() && (h.kind ? h.kind === 'standing' : h.frequency === 'ALWAYS' || h.frequency === 'OFTEN'));
  const own = steps.filter((s) => s.trim());
  // the steps keep their room: the habits take at most STYLE_HABITS_MAX, and whatever the steps leave of the rest
  const nHabits = Math.min(standing.length, Math.max(STYLE_HABITS_MAX, STYLE_ITEMS_MAX - own.length));
  return [...standing.slice(0, nHabits).map((h, i) => ({ id: `h${i + 1}`, kind: 'habit' as const, text: h.description.trim(), theirs: h.quote.trim().slice(0, 200) })),
    ...own.map((s, i) => ({ id: `s${i + 1}`, kind: 'step' as const, text: s.trim() }))].slice(0, STYLE_ITEMS_MAX);
}

/** What the review is told, with --style-review: only what the draft does not hold, each habit with the author's sentence. */
export function styleNote(items: readonly StyleItem[], found: readonly StyleFound[]): string {
  const missed = items.filter((i) => found.find((f) => f.id === i.id)?.held === false);
  if (!missed.length) return '';
  return `Where the draft does not yet write as the author does:\n${missed.map((i) => (i.kind === 'habit'
    ? `- ${i.text.replace(/\.$/, '')}${i.theirs ? ` (theirs: "${i.theirs}")` : ''}: the draft does not.`
    : `- Their method asks: ${i.text}; the draft does not do it.`)).join('\n')}`;
}

/** The lines said beside the piece: what was held, what was not, what could not be read. */
export function styleLines(items: readonly StyleItem[], found: readonly StyleFound[], on: 'draft' | 'piece'): string[] {
  if (!items.length) return [];
  const of = (held: boolean | null): StyleItem[] => items.filter((i) => (found.find((f) => f.id === i.id)?.held ?? null) === held);
  const say = (xs: readonly StyleItem[]): string => xs.map((x) => `"${x.text.slice(0, 90)}"`).join('; ');
  const held = of(true); const missed = of(false); const unread = of(null);
  return [`How you write, read on the ${on === 'draft' ? 'first draft' : 'piece'} (${items.length}; report only, it blocks nothing):`,
    ...(held.length ? [`  held (${held.length}): ${say(held)}`] : []),
    ...(missed.length ? [`  not held (${missed.length}): ${say(missed)}`] : []),
    ...(unread.length ? [`  not read (${unread.length}): ${say(unread)}`] : [])];
}
