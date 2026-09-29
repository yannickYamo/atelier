// atelier/core/compiler/persona.ts — HOW THE AUTHOR SOUNDS, DESCRIBED, WITH HOW OFTEN, AND PROVEN BY QUOTES.
//
// Four blind rounds on one author's corpus taught the same thing four ways: rules about a writer do not
// make a model sound like them, and a description of the writer does. A model-written style guide came
// second of five in the fourth round while a skill of 21 required rules came fourth: constraints do not
// generate a voice, a persona to inhabit does. But that guide also invented anecdotes and asserted
// habits the author does not have. So this is the guide, made accountable:
//
//   every point is about HOW the author writes (speaker, register, hedging, argument, devices, openings
//   and closings, the kinds of pieces they write), never their topics, facts, names or life;
//   every point says HOW OFTEN (always, often, sometimes, rarely), because an author writes in modes and
//   a habit of two pieces in five, stated as a rule, becomes a template in every piece;
//   every point carries a short quote from the author's own pieces, and a point whose quote is not
//   verbatim in the corpus is dropped, so nothing here is the model's imagination of the author.
//
// It is an implementation carrier, like the exemplar: served with the skill, not part of the standard,
// and chosen from pieces discovery was allowed to read (never a reserved one).

import type { Budget, InferenceClient } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { quoteIsReal } from '../taste/reader.js';
import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { measure, findTerms } from '../observers/registry.js';
import { findPattern, PATTERN_FAMILIES, PATTERN_LABEL, type PatternId } from '../observers/style.js';

export type Frequency = 'ALWAYS' | 'OFTEN' | 'SOMETIMES' | 'RARELY';
export interface PersonaPoint {
  readonly aspect: string;
  readonly description: string;
  readonly frequency: Frequency;
  readonly quote: string;
}
export interface Persona {
  readonly points: readonly PersonaPoint[];
  /** points the model offered whose quote was not in the corpus: dropped, counted so the drop is visible */
  readonly dropped: number;
  /** points dropped because they describe a move a boundary the standard holds (required or shown) forbids */
  readonly conflicting?: number;
}

export const PERSONA_SYSTEM = `You describe how a writer sounds, so another writer could sound like them on ANY topic.

You are given pieces by one author. Describe their voice, not their subjects:
- who is speaking: point of view, stance, how sure they sound, how they address the reader;
- register: contractions, spoken looseness, asides, humour, how formal;
- how they hedge, concede and qualify, and how they handle evidence and sources;
- how they build an argument and structure a piece, and the kinds of pieces they write (their modes);
- recurring devices and moves, openings and closings;
- what they conspicuously do not do.

For every point say how often it happens across the pieces: ALWAYS (every piece), OFTEN, SOMETIMES (a
minority of pieces) or RARELY. Most habits are OFTEN or SOMETIMES; reserve ALWAYS for what truly holds in
every piece. For every point give one short quote (a phrase or sentence, under 30 words) copied exactly
from the pieces that shows it.

Never describe the author's topics, facts, figures, names, employers, projects or life story, and never
suggest reusing their sentences or coined terms. Twelve to twenty points.`;

export const PERSONA_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { points: { type: 'array', items: { type: 'object',
    properties: {
      aspect: { type: 'string' }, description: { type: 'string' },
      frequency: { type: 'string', enum: ['ALWAYS', 'OFTEN', 'SOMETIMES', 'RARELY'] },
      quote: { type: 'string' },
    },
    required: ['aspect', 'description', 'frequency', 'quote'], additionalProperties: false } } },
  required: ['points'], additionalProperties: false,
};

/** Keep only points whose quote is in the corpus, verbatim (whitespace and emphasis aside). */
export function groundPersona(raw: readonly Partial<PersonaPoint>[], corpus: readonly string[]): Persona {
  const joined = corpus.join('\n\n');
  const freq = new Set<Frequency>(['ALWAYS', 'OFTEN', 'SOMETIMES', 'RARELY']);
  const points = raw.filter((p): p is PersonaPoint =>
    typeof p.description === 'string' && p.description.trim().length > 0 && typeof p.quote === 'string'
    && p.frequency !== undefined && freq.has(p.frequency) && quoteIsReal(p.quote, joined));
  return { points: points.map((p) => ({ aspect: (typeof p.aspect === 'string' ? p.aspect : '').trim(), description: p.description.trim(), frequency: p.frequency, quote: p.quote.trim() })),
    dropped: raw.length - points.length };
}

/** Derive the persona from the author's readable pieces: one call, metered on `budget`. */
export async function derivePersona(client: InferenceClient, budget: Budget, corpus: readonly string[]): Promise<Persona> {
  const res = await spend(budget, 0.6, async () => {
    const x = await client.complete({
      stableBlock: PERSONA_SYSTEM, variableBlock: '',
      userMessage: corpus.map((t) => `<piece>\n${t}\n</piece>`).join('\n\n'),
      toolName: 'emit_persona', toolDescription: 'How the author sounds, point by point, with how often and a verbatim quote.',
      schema: PERSONA_SCHEMA, maxTokens: 5000,
    });
    return { value: x, cost: x.cost };
  });
  return groundPersona((res.json as { points?: Partial<PersonaPoint>[] } | null)?.points ?? [], corpus);
}

const WORD: Readonly<Record<Frequency, string>> = { ALWAYS: 'always', OFTEN: 'often', SOMETIMES: 'sometimes', RARELY: 'rarely' };

/** The persona as the skill states it: one line per point, its frequency first, its quote as evidence. */
export function describePersona(p: Persona): string {
  return p.points.map((x) => `- (${WORD[x.frequency]}) ${x.description} e.g. "${x.quote}"`).join('\n');
}

/**
 * THE STANDARD WINS. A persona point that describes, or quotes, a move any boundary the standard holds
 * (required or shown, not rejected) caps or bans is dropped: the persona is how the author sounds, but the owner's ratified
 * rules say what the output may not do. (A persona once said the author "always" writes "not X, it's
 * Y" while the standard capped exactly that.)
 */
export function reconcilePersona(p: Persona, forbids: (text: string) => boolean): Persona {
  const points = p.points.filter((x) => !forbids(`${x.description} ${x.quote}`));
  return { points, dropped: p.dropped, ...(p.points.length - points.length ? { conflicting: p.points.length - points.length } : {}) };
}

/**
 * What the standard rules out, as a test on a persona point: any boundary it holds (required or shown,
 * not rejected) whose pattern or listed words the text contains, and a contrast in any spelling where the
 * standard caps any one spelling (a point describing "not X, but Y" survived a cap on "not X, it's Y").
 *
 * AND WHAT THE OWNER REJECTED. Only kept boundaries were consulted, so a habit the owner looked at and
 * refused ("use rhetorical questions", rejected) came straight back as a persona point saying the author
 * "often asks the reader a question", quoted from their own pieces — the persona is served with the skill,
 * so the refusal was undone by a carrier the owner never ruled on. For a REJECTED rule with a measurement,
 * a point that DESCRIBES the rule's pattern (its label) or names its listed words restates the rejected
 * claim, whichever kind it was. For a rejected GENERATIVE pattern rule, a point that EXHIBITS the pattern
 * is dropped as well: its quote teaches the move by example. A rejected BOUNDARY is not treated that
 * way: refusing a ban says the author does not avoid the move, so a quote that uses it is consistent
 * with the refusal, and dropping it would cut a true habit.
 */
export function standardForbids(v: StandardVersion): (text: string) => boolean {
  const boundaries = v.requirements.filter((r) => r.kind === 'BOUNDARY' && r.measurement && r.authority !== 'EXPERT_REJECTED');
  const rejected = v.requirements.filter((r) => r.measurement && r.authority === 'EXPERT_REJECTED');
  const patternOf = (r: Requirement): PatternId | null => (r.measurement?.observer === 'PATTERN_RATE'
    ? ((r.measurement.params.pattern as readonly string[] | undefined)?.[0] as PatternId | undefined) ?? null : null);
  const capsContrast = boundaries.some((r) => { const p = patternOf(r); return p !== null && PATTERN_FAMILIES.contrast.includes(p); });
  return (text) => (capsContrast && findPattern(text, 'CONTRAST_VERDICT').length > 0)
    || boundaries.some((r) => {
      if (r.measurement?.observer === 'LEXICON') return measure(text, r.measurement).verdict === 'VIOLATED';
      const p = patternOf(r);
      return p !== null && findPattern(text, p).length > 0;
    })
    || rejected.some((r) => restatesRejected(text, r, patternOf(r)));
}

/** The words a pattern's label names it by, singular: "rhetorical questions" → "rhetorical question". */
const labelStem = (p: PatternId): string =>
  (PATTERN_LABEL[p].split(/ \(| "|"/)[0] ?? '').toLowerCase().trim().replace(/(?<=[a-z])e?s$/, '');

function restatesRejected(text: string, r: Requirement, pattern: PatternId | null): boolean {
  if (r.measurement?.observer === 'LEXICON') {
    // the lexicon's own matcher, so a term is found here exactly where `verify` would find it
    return findTerms(text, (r.measurement.params.terms as readonly string[] | undefined) ?? []).length > 0;
  }
  if (pattern === null) return false;
  const stem = labelStem(pattern);
  if (stem.length >= 4 && text.toLowerCase().includes(stem)) return true;
  return r.kind === 'GENERATIVE' && findPattern(text, pattern).length > 0;
}
