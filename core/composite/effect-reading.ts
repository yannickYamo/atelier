// atelier/core/composite/effect-reading.ts — IS A RULE ABOUT WHAT THE WRITING MAKES A READER FEEL? READ, NOT MATCHED.
//
// The trait table (./traits.ts) sorts each worded rule into classes, and "effect" (emotion and effect on the reader)
// was the one class read off a word list: "feel", "tension", "moving". A word is not a subject. "Keep the tension
// between the two sources visible" is about evidence; "the piece is moving fast" is about pace; "Let the last line
// land before the reader can look away" names none of those words and is about nothing else. The class steers what a
// person's liking selects and which rules are paired as rivals, so it is a reading (core/inference/reading.ts):
//
//   - code decides where nothing is worded: a counted rule is classed by its observer, never by this;
//   - the reader says, for each worded rule, whether it is about what the writing does to a reader, and whether that
//     is what the rule is MAINLY about, quoting the words that say so; a quote not in the rule drops the answer;
//   - the floor reads no words: an unread rule carries no effect class, and the table says the class was not read.

import type { Reading } from '../inference/reading.js';

/** MAIN: the rule is mainly about the reader's response; ALSO: it names it beside its main subject. */
export type EffectWeight = 'MAIN' | 'ALSO';
export interface EffectInput { readonly statements: readonly { readonly id: string; readonly text: string }[] }
/** The rules read as about the reader's response, by id. A rule absent from it carries no effect class. */
export type EffectRead = Readonly<Record<string, EffectWeight>>;

export const EFFECT_SYSTEM = `You read rules a person wrote for how a piece of writing is done, one per line with an id. Say which rules are about the EFFECT ON THE READER: what the writing makes a reader feel or go through (suspense, dread, delight, laughter, being moved, urgency, unease, empathy, surprise), as opposed to what the text itself contains or how it is built.

For each rule that is about that effect, give:
- id: copied exactly;
- weight: MAIN when the reader's response is what the rule is mainly about ("Make the reader feel the stakes before the facts."), ALSO when the rule is mainly about something else (an opening, a structure, a pace, a figure) and names the response along the way ("Open on a scene that leaves the reader uneasy.");
- quote: the exact words of the rule that name the reader's response, copied character for character.

A word alone is not the effect: "the tension between two sources" is about evidence, "a moving average" is a figure, "move fast" is pace. Leave out every rule that is not about the reader's response.`;

export const EFFECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { rules: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, weight: { type: 'string', enum: ['MAIN', 'ALSO'] }, quote: { type: 'string' },
  }, required: ['id', 'weight', 'quote'], additionalProperties: false } } },
  required: ['rules'], additionalProperties: false,
};

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

export const RULE_EFFECT: Reading<EffectInput, EffectRead> = {
  id: 'rule-effect', version: '1',
  system: EFFECT_SYSTEM, schema: EFFECT_SCHEMA,
  toolName: 'emit_rule_effect', toolDescription: 'The rules about what the writing makes a reader feel, each with whether that is its main subject and the words that say so.',
  maxTokens: 1500, estimateUsd: 0.01,
  prompt(input) { return input.statements.map((s) => `[${s.id}] ${s.text.trim()}`).join('\n'); },
  // Nothing worded, nothing to read.
  decide(input) { return input.statements.length ? null : {}; },
  ground(raw, input) {
    const r = raw as { rules?: unknown } | null;
    if (!r || !Array.isArray(r.rules)) return null;
    const known = new Map(input.statements.map((s) => [s.id, norm(s.text)]));
    const out: Record<string, EffectWeight> = {};
    for (const x of r.rules as { id?: unknown; weight?: unknown; quote?: unknown }[]) {
      if (typeof x?.id !== 'string' || (x.weight !== 'MAIN' && x.weight !== 'ALSO') || typeof x.quote !== 'string') continue;
      const text = known.get(x.id);
      const quote = norm(x.quote);
      // The words that say so must be the rule's own: an answer quoting anything else is dropped.
      if (text === undefined || !quote || !text.includes(quote)) continue;
      out[x.id] = x.weight;
    }
    // An empty list is a reading too: no rule here is about the reader's response.
    return out;
  },
  floor() { return {}; },
};

/** The worded rules of a set, as the reading's input: a counted rule is classed by its observer and is never asked about. */
export function effectInput(proposals: readonly { readonly requirementId: string; readonly statement: string; readonly measurement?: unknown }[]): EffectInput {
  return { statements: proposals.filter((p) => !p.measurement).map((p) => ({ id: p.requirementId, text: p.statement })) };
}
