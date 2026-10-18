// atelier/core/observers/rule-polarity.ts — IS A RULE A PROHIBITION OR A THING TO DO? READ, NOT MATCHED.
//
// A rule's kind routes it: a BOUNDARY is served under "What not to do", caps what a persona may describe
// (core/compiler/persona.ts, `standardForbids`) and is repaired by cutting; a GENERATIVE rule is served under "What to
// do" and is repaired by writing. The kind was read by three different word patterns in three places ("never", "not",
// "avoid" anywhere in the sentence; or only at its start; or "no" at its start), and "Then a Suggestions section:
// improvements that do not block the merge" was once filed under what not to do. A negative word is not a prohibition:
// "Keep the summary to two sentences, not three" asks for two sentences, and "Use no more than one example" is a cap
// on something to do. So the kind is a reading (core/inference/reading.ts): the reader says, for each statement,
// whether following it means NOT doing something, or doing something; code keeps only answers for statements it
// asked about, a statement the reading skipped falls to the floor, and the anchored word pattern is that floor.

import type { Reading } from '../inference/reading.js';

export type Polarity = 'BOUNDARY' | 'GENERATIVE';
export interface PolarityInput { readonly statements: readonly { readonly id: string; readonly text: string }[] }
export type PolarityReading = Readonly<Record<string, Polarity>>;

/** The floor: a statement that opens with a prohibition is one. Anchored, so a negative clause inside a positive step is not. */
export const polarityByWords = (statement: string): Polarity => (/^\s*(?:never|do not|don't|must not|avoid|no)\b/i.test(statement) ? 'BOUNDARY' : 'GENERATIVE');

export const RULE_POLARITY_SYSTEM = `You read rules a person wrote for how a piece of work is done, one per line with an id. For each, say what following it means:

- BOUNDARY: the rule forbids something. Following it means NOT doing a thing (a word, a phrase, a move, a structure, a tone). "Never use 'best efforts'." "Avoid jargon." "No bullet points." "Do not open with a question."
- GENERATIVE: the rule asks for something. Following it means doing or including a thing, even when the sentence contains a negative word. "Open with a Summary section." "Keep paragraphs to four sentences, not more." "Then a Suggestions section: improvements that do not block the merge." "Use at most one example."

A cap on how much of something to do ("at most", "no more than") asks for the thing within a limit: GENERATIVE. A rule that bans a thing outright is BOUNDARY. Answer for every id given, and copy each id exactly.`;

export const RULE_POLARITY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { rules: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['BOUNDARY', 'GENERATIVE'] } }, required: ['id', 'kind'], additionalProperties: false } } },
  required: ['rules'], additionalProperties: false,
};

export const RULE_POLARITY: Reading<PolarityInput, PolarityReading> = {
  id: 'rule-polarity', version: '1',
  system: RULE_POLARITY_SYSTEM, schema: RULE_POLARITY_SCHEMA,
  toolName: 'emit_rule_polarity', toolDescription: 'For each rule id, whether following it means not doing something (BOUNDARY) or doing something (GENERATIVE).',
  maxTokens: 800, estimateUsd: 0.01,
  prompt(input) { return input.statements.map((s) => `[${s.id}] ${s.text.trim()}`).join('\n'); },
  // Nothing to read is decided: an empty list has no kinds.
  decide(input) { return input.statements.length ? null : {}; },
  ground(raw, input) {
    const r = raw as { rules?: unknown } | null;
    const known = new Map(input.statements.map((s) => [s.id, s]));
    const out: Record<string, Polarity> = {};
    for (const x of Array.isArray(r?.rules) ? r.rules as { id?: unknown; kind?: unknown }[] : []) {
      if (typeof x.id !== 'string' || !known.has(x.id) || (x.kind !== 'BOUNDARY' && x.kind !== 'GENERATIVE')) continue;
      out[x.id] = x.kind;
    }
    // A reading that skipped a statement is no reading of it: the caller's floor decides that one. Nothing valid at all is no reading.
    return Object.keys(out).length ? out : null;
  },
  floor(input) { return Object.fromEntries(input.statements.map((s) => [s.id, polarityByWords(s.text)])); },
};
