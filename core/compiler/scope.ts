// atelier/core/compiler/scope.ts — HOW MUCH THE AUTHOR WRITES FOR WHAT WAS ASKED: A RELATION, NEVER A WORD COUNT.
//
// A skill built from twelve answers of 9 to 108 words said "my answers usually run about 100 words", and on a
// request that said "I explicitly want a detailed explanation" it wrote a third of what the bare model wrote. The
// number was not a habit of the author's. It was the size of the twelve questions, which the skill had never seen.
//
// WHAT IS DETECTABLE, AND WHAT IS NOT:
//
//   not detectable   a length, from answers alone. Without the request there is no telling a terse author from a
//                    small question, so no length is stated, and the skill says why.
//   detectable       what the author ADDS BEYOND WHAT WAS ASKED: a preamble before the answer, the request said
//                    back, a caveat, an alternative nobody asked for, a next step, an offer of more, a recap. Each
//                    is read per example and must be quoted from the answer; code counts how many examples carry
//                    it. This is the author's economy, and it holds at any length: a long answer with no preamble
//                    and no recap is the same habit as a short one.
//   detectable       with the request beside the answer: whether the request itself asked for detail or brevity,
//                    in so many words, and how long the answer then ran. A length is stated only for a kind of
//                    request seen at least MIN_PER_KIND times, and always as what the examples showed, never a target.
//
// A small model reads; code counts and decides (decision 0011). The reading is one call at build, beside the
// persona's. A quote that is not in its answer drops the finding; a kind outside the list is dropped; "asked for
// detail" on an example with no request is dropped. With no model the profile is built from counts alone and
// states no habit it could not read.
//
// It is an implementation carrier, like the persona: served with the skill, never part of the standard.

import type { Budget, InferenceClient } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { quoteIsReal } from '../taste/reader.js';
import { quantile } from '../observers/text.js';
import { proseWords } from '../observers/style.js';

export const SCOPE_READER_VERSION = 'scope-1';
/** A length is stated for a kind of request only when at least this many paired examples show it. */
export const MIN_PER_KIND = 3;

export const BEYOND_KINDS = ['preamble', 'restates-request', 'caveat', 'alternative', 'next-step', 'offer', 'recap'] as const;
export type BeyondKind = typeof BEYOND_KINDS[number];
/** What each kind is, as the reader is told and as the skill says it. */
export const BEYOND_LABEL: Readonly<Record<BeyondKind, string>> = {
  'preamble': 'a preamble before the answer (a greeting, "great question", what I am about to do)',
  'restates-request': 'the request said back before answering it',
  'caveat': 'a caveat or a warning nobody asked for',
  'alternative': 'an alternative or a second option nobody asked for',
  'next-step': 'a next step beyond what was asked',
  'offer': 'an offer of more ("let me know if", "want me to")',
  'recap': 'a recap or summary of what was just said',
};
/** Kinds that cannot be read without the request: whether it was said back needs the request to compare with. */
const NEEDS_REQUEST: ReadonlySet<BeyondKind> = new Set(['restates-request']);

export type Asked = 'DETAIL' | 'BRIEF' | 'NEITHER';
export interface ScopeExample { readonly text: string; readonly request: string | null }

export interface ScopeProfile {
  readonly version: 1;
  /** `<reader version>:<model>`, or null when no model read the examples (counts only) */
  readonly reader: string | null;
  readonly examples: number;
  /** how many examples came with the request they answer */
  readonly paired: number;
  /** per kind: how many examples carry it, and one quote; only kinds a reader read */
  readonly beyond: readonly { readonly kind: BeyondKind; readonly count: number; readonly of: number; readonly quote: string | null }[];
  /** what the paired examples showed, per kind of request seen MIN_PER_KIND times or more: the middle half, in words */
  readonly lengths: Readonly<Partial<Record<Asked, { readonly lo: number; readonly hi: number; readonly n: number }>>>;
  /** findings the reader offered that code dropped (a quote not in the answer, an unknown kind, an example that does not exist) */
  readonly dropped: number;
  /** examples the reader returned nothing for. Past MAX_UNREAD of them, no frequency is stated for any kind */
  readonly unread?: number;
}

/** More than this share of the examples unread, and what was read is not the corpus: no habit is stated from it. */
export const MAX_UNREAD = 0.2;

export const SCOPE_SYSTEM = `You read examples of how one person answers requests, to describe how much they write for what was asked. Each example is numbered. Some come with the request they answer; some are the answer alone.

For each example:
- asked: only when the request is shown. "DETAIL" if the request asks, in so many words, for detail, depth, a walkthrough, a full explanation or a complete plan. "BRIEF" if it asks, in so many words, for brevity (one line, short, just the answer, yes or no). Otherwise "NEITHER". Do not infer it from the topic.
- beyond: everything in the ANSWER that goes beyond what was asked, each as one of these kinds with a short quote copied exactly from the answer:
  - "preamble": anything before the answer starts (a greeting, praise for the question, a statement of what is about to be done)
  - "restates-request": the request said back before answering it (only when the request is shown)
  - "caveat": a caveat or warning the request did not ask for
  - "alternative": an alternative or second option the request did not ask for
  - "next-step": a next step beyond what was asked
  - "offer": an offer of more ("let me know if", "want me to")
  - "recap": a recap or summary of what was just said

An answer that gives what was asked and stops has an empty "beyond". Judge only what is in the text.`;

export const SCOPE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { examples: { type: 'array', items: { type: 'object',
    properties: {
      example: { type: 'number' }, asked: { type: ['string', 'null'], enum: ['DETAIL', 'BRIEF', 'NEITHER', null] },
      beyond: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, quote: { type: 'string' } }, required: ['kind', 'quote'], additionalProperties: false } },
    },
    required: ['example', 'asked', 'beyond'], additionalProperties: false } } },
  required: ['examples'], additionalProperties: false,
};

interface RawExample { example?: unknown; asked?: unknown; beyond?: unknown }

/** Lengths in words, the middle half, rounded to 10 below 200 and to 50 above: never a floor a short answer cannot reach. */
const span = (xs: readonly number[]): { lo: number; hi: number } => {
  const r = (n: number): number => (n < 200 ? Math.max(5, Math.round(n / 10) * 10) : Math.round(n / 50) * 50);
  return { lo: r(quantile(xs, 0.25)), hi: r(quantile(xs, 0.75)) };
};

/**
 * The profile from the examples and a reader's answer (or none). Everything the reader said is checked here: the
 * example must exist, a kind must be in the list and readable for that example, a quote must be in THAT answer,
 * and "asked" counts only where a request was shown.
 */
export function groundScope(examples: readonly ScopeExample[], raw: readonly RawExample[] | null, reader: string | null): ScopeProfile {
  const paired = examples.filter((e) => e.request !== null).length;
  let dropped = 0;
  const kinds = new Map<BeyondKind, { examples: Set<number>; quote: string }>();
  const asked = new Map<number, Asked>();
  const seen = new Set<number>();
  for (const r of raw ?? []) {
    const i = typeof r.example === 'number' && Number.isInteger(r.example) ? r.example - 1 : -1;
    if (i < 0 || i >= examples.length || seen.has(i)) { dropped += 1; continue; }
    seen.add(i);
    const e = examples[i];
    if (e.request !== null && (r.asked === 'DETAIL' || r.asked === 'BRIEF' || r.asked === 'NEITHER')) asked.set(i, r.asked);
    for (const b of Array.isArray(r.beyond) ? r.beyond as { kind?: unknown; quote?: unknown }[] : []) {
      const kind = BEYOND_KINDS.find((k) => k === b.kind);
      if (!kind || typeof b.quote !== 'string' || !quoteIsReal(b.quote, e.text) || (NEEDS_REQUEST.has(kind) && e.request === null)) { dropped += 1; continue; }
      const k = kinds.get(kind) ?? { examples: new Set<number>(), quote: b.quote.trim() };
      k.examples.add(i); kinds.set(kind, k);
    }
  }
  // A KIND IS COUNTED OVER EVERY EXAMPLE IT COULD BE READ ON, never over the ones the reader happened to answer for:
  // a reader that returned two of twelve examples printed "never (0 of 2)", a habit of the corpus read on two pieces.
  // An example the reader did not return is unread; with more than one in five unread, no frequency is stated at all.
  const unread = raw === null ? 0 : examples.length - seen.size;
  const readable = (kind: BeyondKind): number => examples.filter((e) => !NEEDS_REQUEST.has(kind) || e.request !== null).length;
  const complete = raw !== null && examples.length > 0 && unread / examples.length <= MAX_UNREAD;
  const beyond = !complete ? [] : BEYOND_KINDS.filter((k) => readable(k) > 0).map((kind) => ({ kind, count: kinds.get(kind)?.examples.size ?? 0, of: readable(kind), quote: kinds.get(kind)?.quote ?? null }));
  const lengths: Partial<Record<Asked, { lo: number; hi: number; n: number }>> = {};
  for (const a of ['DETAIL', 'BRIEF', 'NEITHER'] as const) {
    const xs = [...asked].filter(([, v]) => v === a).map(([i]) => proseWords(examples[i].text)).filter((n) => n > 0);
    if (xs.length >= MIN_PER_KIND) lengths[a] = { ...span(xs), n: xs.length };
  }
  return { version: 1, reader, examples: examples.length, paired, beyond, lengths, dropped, ...(unread ? { unread } : {}) };
}

/** Read the examples once: one call, metered on `budget`. A failure is the caller's to catch; counts alone still make a profile. */
export async function deriveScope(client: InferenceClient, budget: Budget, examples: readonly ScopeExample[], model: string): Promise<ScopeProfile> {
  const res = await spend(budget, 0.4, async () => {
    const x = await client.complete({
      stableBlock: SCOPE_SYSTEM, variableBlock: '',
      userMessage: examples.map((e, i) => `<example n="${i + 1}">\n${e.request !== null ? `<request>\n${e.request}\n</request>\n` : ''}<answer>\n${e.text}\n</answer>\n</example>`).join('\n\n'),
      toolName: 'emit_scope', toolDescription: 'What each example asked for and what its answer adds beyond that.', schema: SCOPE_SCHEMA, maxTokens: 4000, temperature: 0,
    });
    return { value: x, cost: x.cost };
  });
  const list = (res.json as { examples?: unknown } | null)?.examples;
  return groundScope(examples, Array.isArray(list) ? list as RawExample[] : null, `${SCOPE_READER_VERSION}:${model}`);
}

const often = (count: number, of: number): string => (count === 0 ? 'never' : count === of ? 'always' : count / of >= 0.6 ? 'usually' : count / of >= 0.25 ? 'sometimes' : 'rarely');
const words = (x: { lo: number; hi: number }): string => (x.lo === x.hi ? `about ${x.lo}` : `${x.lo} to ${x.hi}`);

/**
 * The scope as the skill states it, for a skill that answers requests. No word count is a target anywhere in it:
 * a length appears only as what paired examples showed for one kind of request, and the request always sets it.
 */
export function describeScope(p: ScopeProfile): string {
  const lines = [
    'How much I write follows the request, never a habit of length. I give what was asked, in full, and stop.',
    '- A request for one thing gets that one thing.',
    '- A request for a walkthrough, a comparison, a plan with steps, or one that asks for detail, gets every part it asks for at the length that takes. Never shorten it to match my shorter examples.',
    '- A request for brevity gets less.',
  ];
  const seenLengths = (['NEITHER', 'DETAIL', 'BRIEF'] as const).flatMap((a) => { const x = p.lengths[a]; return x ? [`${a === 'NEITHER' ? 'when the request asked for nothing special' : a === 'DETAIL' ? 'when it asked for detail' : 'when it asked for brevity'}, ${words(x)} words (${x.n} examples)`] : []; });
  lines.push(seenLengths.length
    ? `What my examples showed, as a record and not a target: ${seenLengths.join('; ')}.`
    : p.paired === 0
      ? 'My examples came without the requests they answer, so their length shows how small those requests were, not how long I write. No length is learned from them.'
      : `Only ${p.paired} of my ${p.examples} examples came with their request: too few of any one kind to say how long I write for it.`);
  if (!p.beyond.length && (p.unread ?? 0) > 0) lines.push('', `What I add beyond what was asked could not be counted: ${p.unread} of my ${p.examples} examples could not be read, and a habit is not stated from the rest.`);
  if (p.beyond.length) {
    lines.push('', 'What I add beyond what was asked, counted over my examples. This holds at any length:');
    for (const b of p.beyond) lines.push(`- ${BEYOND_LABEL[b.kind]}: ${often(b.count, b.of)} (${b.count} of ${b.of})${b.quote && b.count > 0 ? `, e.g. "${b.quote}"` : ''}`);
  }
  return lines.join('\n');
}
