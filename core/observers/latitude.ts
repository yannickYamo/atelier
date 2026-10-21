// atelier/core/observers/latitude.ts — HOW STRICTLY A SKILL'S OUTPUT IS HELD, READ FROM THE WORK, RATIFIED BY THE OWNER.
//
// A contract clause and a blog post are held to the same floor (a fact presented as real needs a source) and to very
// different freedoms around it: a clause keeps the house language and an untraced figure stops it; a post may argue,
// take a position and reach for an analogy, and an untraced figure is the author's to check. Which of the two a skill
// is was read off its name (`isReplyWork`, the title of the method note), which knows nothing of what the work is.
// It is a reading on the house pattern (core/inference/reading.ts): the examples, the method and what the skill is for
// are shown to a small model, which names a level and quotes the words it stands on; code keeps the answer only where
// a quote is in what was shown; with no model, or nothing grounded, the floor is GROUNDED and reads no words. The
// level is a proposal: the build screen says it in one line and the owner keeps it or changes it (`--latitude`), and
// the standard's hash covers it.
//
// The same reading at run time may only TIGHTEN (`REQUEST_LATITUDE`): a factual announcement asked of a creative skill
// is held as grounded or strict for that run, never the other way. Nothing here is a case of a kind of work.

import type { Reading } from '../inference/reading.js';
import { DEFAULT_LATITUDE, LATITUDE_LEVELS, type LatitudeLevel } from '../state/canonical-state.js';

export interface LatitudeInput {
  /** what the skill is for, in the owner's words, when they said it */
  readonly purpose: string | null;
  /** the owner's method or stated rules, when there are any */
  readonly method: string | null;
  /** the owner's finished examples, as far as the reader is shown them */
  readonly examples: readonly string[];
}
export interface LatitudeReading { readonly level: LatitudeLevel; readonly evidence: readonly string[] }

const RANK: Readonly<Record<LatitudeLevel, number>> = { STRICT: 0, GROUNDED: 1, CREATIVE: 2 };
/** The stricter of two levels. */
export const stricter = (a: LatitudeLevel, b: LatitudeLevel): LatitudeLevel => (RANK[a] <= RANK[b] ? a : b);
/** A level as the owner may type it (`strict`, `Grounded`); null for anything else. */
export const parseLatitude = (s: string | undefined | null): LatitudeLevel | null => {
  const v = (s ?? '').trim().toUpperCase();
  return (LATITUDE_LEVELS as readonly string[]).includes(v) ? v as LatitudeLevel : null;
};

/** Compared as the same words: case and spacing aside. */
const flat = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const EXAMPLE_HEAD = 1500;
const shown = (input: LatitudeInput): string => [input.purpose ?? '', input.method ?? '', ...input.examples.slice(0, 6).map((e) => e.slice(0, EXAMPLE_HEAD))].join('\n');

const LEVELS_TEXT = `- STRICT: the work binds or decides something: a contract, a policy, a financial or claims decision, a label, a regulated filing. Its wording is house language and defined terms; every figure, date and citation must come from the file.
- GROUNDED: the work reports or explains from a source: a report, an analysis, a review, a support answer, a briefing. Free in wording and composition within the method; its facts come from what was given.
- CREATIVE: the work is the author's own writing for readers: a blog post, an essay, a newsletter, a social post, a talk. It argues, takes positions, uses analogies and hypotheticals; only the facts it presents as real need a source.`;

export const LATITUDE_SYSTEM = `You read examples of one person's work, their method and what the skill is for, and say how strictly new work of this kind must be held.

${LEVELS_TEXT}

Answer with one level and two or three short quotes copied exactly from what you were shown that your answer stands on (a phrase of an example, of the method or of the purpose). Where the work sits between two levels, answer the stricter.`;

export const LATITUDE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { level: { type: 'string', enum: [...LATITUDE_LEVELS] }, quotes: { type: 'array', items: { type: 'string' } } },
  required: ['level', 'quotes'], additionalProperties: false,
};

export const LATITUDE: Reading<LatitudeInput, LatitudeReading> = {
  id: 'latitude', version: '1',
  system: LATITUDE_SYSTEM, schema: LATITUDE_SCHEMA,
  toolName: 'emit_latitude', toolDescription: 'How strictly new work of this kind is held (STRICT, GROUNDED or CREATIVE), with quotes from what was shown.',
  maxTokens: 400, estimateUsd: 0.01,
  prompt(input) {
    return [input.purpose ? `What the skill is for: ${input.purpose}` : '', input.method ? `The method:\n${input.method.slice(0, 4000)}` : '',
      ...input.examples.slice(0, 6).map((e, i) => `Example ${i + 1}:\n${e.slice(0, EXAMPLE_HEAD)}`)].filter(Boolean).join('\n\n');
  },
  // Nothing to read is decided: the default, standing on nothing.
  decide(input) { return shown(input).trim() ? null : { level: DEFAULT_LATITUDE, evidence: [] }; },
  ground(raw, input) {
    const r = raw as { level?: unknown; quotes?: unknown } | null;
    const level = parseLatitude(typeof r?.level === 'string' ? r.level : null);
    if (!level) return null;
    const material = flat(shown(input));
    const evidence = (Array.isArray(r?.quotes) ? r.quotes : []).filter((q): q is string => typeof q === 'string' && q.trim().length >= 3 && material.includes(flat(q))).map((q) => q.trim().slice(0, 160));
    // An answer that cannot point at the work did not read it.
    return evidence.length ? { level, evidence } : null;
  },
  floor() { return { level: DEFAULT_LATITUDE, evidence: [] }; },
};

/** The run-time reading: the skill's level, and the request it is asked to hold. */
export interface RequestLatitudeInput { readonly level: LatitudeLevel; readonly request: string }
export interface RequestLatitude { readonly level: LatitudeLevel; readonly quote: string | null }

export const REQUEST_LATITUDE: Reading<RequestLatitudeInput, RequestLatitude> = {
  id: 'request-latitude', version: '1',
  system: `A skill holds its work at one of three levels:\n\n${LEVELS_TEXT}\n\nYou read one request made of the skill and say whether THIS request must be held more strictly than the skill's level: a factual announcement, a figure to be published, a commitment or a decision asked of a creative skill; a binding clause asked of a grounded one. Answer the level the request needs, never looser than the skill's, and quote the words of the request that make it stricter (none when it is not).`,
  schema: { type: 'object', properties: { level: { type: 'string', enum: [...LATITUDE_LEVELS] }, quote: { type: ['string', 'null'] } }, required: ['level', 'quote'], additionalProperties: false },
  toolName: 'emit_request_latitude', toolDescription: 'The level this request is held at: the skill\'s, or stricter, with the words of the request that make it so.',
  maxTokens: 200, estimateUsd: 0.005,
  prompt(input) { return `The skill's level: ${input.level}\n\nThe request:\n${input.request.slice(0, 4000)}`; },
  // Nothing is stricter than STRICT, and an empty request asks for nothing: code decides both.
  decide(input) { return input.level === 'STRICT' || !input.request.trim() ? { level: input.level, quote: null } : null; },
  ground(raw, input) {
    const r = raw as { level?: unknown; quote?: unknown } | null;
    const level = parseLatitude(typeof r?.level === 'string' ? r.level : null);
    if (!level) return null;
    // NEVER LOOSER: an answer looser than the skill's level is the skill's level.
    const held = stricter(level, input.level);
    if (held === input.level) return { level: held, quote: null };
    // Tighter only on the request's own words.
    const quote = typeof r?.quote === 'string' ? r.quote.trim() : '';
    return quote.length >= 3 && flat(input.request).includes(flat(quote)) ? { level: held, quote: quote.slice(0, 160) } : null;
  },
  floor(input) { return { level: input.level, quote: null }; },
};

/**
 * THE WRITER'S BRIEF FOR THE LEVEL: one builder, three texts, no kind of work named. What every level shares is said in
 * each: a fact presented as real needs a source. What changes is how free the composition is, and what happens to an
 * untraced fact.
 */
export function latitudeBrief(level: LatitudeLevel): string {
  const facts = 'a figure, a date, a name, a quotation, a citation, or something that happened to me';
  if (level === 'CREATIVE') {
    return `How free this piece is: compose freely. Argue, take positions, use analogies, and use hypotheticals marked as hypotheticals ("say", "imagine", "suppose"). Only facts presented as real need a source (${facts}): give those only from my material or the request. Any other is listed for me to check.`;
  }
  if (level === 'STRICT') {
    return `How free this piece is: not free. Use the house language and the defined terms of my examples and method; no analogy, no hypothetical, no position the material does not support. Every fact (${facts}) must be in my material or the request: one that is not stops the work.`;
  }
  return `How free this piece is: free in wording and composition within the method. Facts presented as real (${facts}) come from my material or the request; one that does not is flagged for review.`;
}
