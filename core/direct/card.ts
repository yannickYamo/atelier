// atelier/core/direct/card.ts — WHAT THIS SKILL'S WORK IS: ITS KIND, ITS READER, ITS PURPOSE, AND WHAT IT SETTLES.
//
// The editor's questions read one request at a time, so every request started from nothing: a pricing memo skill was
// asked what an essay is asked, and the decisions its kind of work always settles (which price, against what) were
// found again, or not, on each run. A card per kind of work, written by hand, would repeat the cause of every earlier
// loop: each new kind needs a new card, and each exemption brings the finding back on the next kind. So the card is
// READ, once, at the build, from the author's own pieces and the one line they gave for what the skill is for:
//
//   kind      what the pieces are, in a few words ("a pricing memo", "a reply to a customer")
//   reader    who reads them, in what situation
//   purpose   what a piece of this kind is for: what it gets the reader to do or decide
//   settles   the decisions every piece of this kind settles, at most five ("the price, and what it is compared with")
//
// GROUNDED BY CODE. The kind and the reader are kept only with a quote copied from the pieces or the stated purpose,
// found there; a field with none is not read, never guessed. It is shown once at the build and changed with `atelier
// amend --card`; the person's word replaces the reading's. It is never shown to the writer: it tells the editor's
// questions (./questions.ts) what this kind of work decides, so they ask the open ones. With no model, nothing is read.

import type { Reading } from '../inference/reading.js';

export interface PurposeCard {
  readonly kind: string | null;
  readonly reader: string | null;
  readonly purpose: string | null;
  readonly settles: readonly string[];
  /** who wrote it: the build's reading, or the person (`atelier amend --card`) */
  readonly by: 'model' | 'you';
  /** the reading's key (id, version and the pieces' hash): read again only when it changes */
  readonly reading?: string;
}
export interface CardInput { readonly purpose: string | null; readonly pieces: readonly { readonly name: string; readonly text: string }[] }

/** The most decisions a card says its kind of work settles. */
export const SETTLES_MAX = 5;

export const CARD_SYSTEM = `You read a set of one author's finished pieces, and the one line they gave for what the pieces are for where they gave one. Say what this work is, as an editor who knows this kind of work would:

- kind: what the pieces are, in a few words ("a pricing memo", "a reply to a customer's complaint", "a post on engineering practice").
- kindQuote: a short passage copied exactly from a piece or from the stated purpose that shows it.
- reader: who reads them, and in what situation ("a customer who was billed twice", "an engineer choosing a tool").
- readerQuote: a short passage copied exactly from a piece or from the stated purpose that shows it.
- purpose: what a piece of this kind is for: what it gets the reader to know, do or decide. One sentence.
- settles: the decisions every piece of this kind has to settle before it is written, at most five, each in a few words ("the price, and what it is compared with", "what is offered to make it right"). What any piece of writing settles (a title, a length) is not one of them.

Say only what the pieces show. Where they do not show a reader, give null for it and its quote.`;

export const CARD_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: {
    kind: { type: ['string', 'null'] }, kindQuote: { type: ['string', 'null'] },
    reader: { type: ['string', 'null'] }, readerQuote: { type: ['string', 'null'] },
    purpose: { type: ['string', 'null'] }, settles: { type: 'array', items: { type: 'string' } },
  }, required: ['kind', 'kindQuote', 'reader', 'readerQuote', 'purpose', 'settles'], additionalProperties: false,
};

const clip = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const flat = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether a quote of eight characters or more is in the pieces or the stated purpose (a form check). */
const found = (quote: unknown, input: CardInput): boolean => {
  const q = flat(clip(quote, 300));
  return q.length >= 8 && [input.purpose ?? '', ...input.pieces.map((p) => p.text)].some((t) => flat(t).includes(q));
};

export interface CardReading { readonly card: PurposeCard | null }

export const PURPOSE_CARD: Reading<CardInput, CardReading> = {
  id: 'purpose-card', version: '1',
  system: CARD_SYSTEM, schema: CARD_SCHEMA,
  toolName: 'emit_purpose_card', toolDescription: 'What this work is: its kind, its reader, its purpose, and the decisions every piece of it settles.',
  maxTokens: 800, estimateUsd: 0.02,
  prompt(input) {
    return [input.purpose?.trim() ? `What the author said the pieces are for: ${input.purpose.trim()}` : 'The author said nothing about what the pieces are for.',
      `The pieces:\n${input.pieces.slice(0, 12).map((p) => `<piece name="${p.name}">\n${p.text.slice(0, 4000)}\n</piece>`).join('\n\n')}`].join('\n\n');
  },
  // no pieces, nothing to read
  decide(input) { return input.pieces.length ? null : { card: null }; },
  ground(raw, input) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') return null;
    const kind = clip(r.kind, 80); const reader = clip(r.reader, 160);
    const settles = [...new Set((Array.isArray(r.settles) ? r.settles : []).map((x) => clip(x, 120)).filter(Boolean))].slice(0, SETTLES_MAX);
    const card: PurposeCard = {
      kind: kind && found(r.kindQuote, input) ? kind : null,
      reader: reader && found(r.readerQuote, input) ? reader : null,
      purpose: clip(r.purpose, 240) || null,
      settles, by: 'model',
    };
    return { card: card.kind || card.reader || card.settles.length ? card : null };
  },
  floor() { return { card: null }; },
};

/** The card in one line, as the build says it and the editor's questions are told it. */
export function cardLine(c: PurposeCard): string {
  return [c.kind ? `This work: ${c.kind}` : '', c.reader ? `read by ${c.reader}` : '', c.purpose ? `for: ${c.purpose.replace(/\.$/, '')}` : '',
    c.settles.length ? `each piece settles: ${c.settles.join('; ')}` : ''].filter(Boolean).join('; ');
}

/**
 * THE PERSON'S CHANGE (`atelier amend --card "kind=…; reader=…; settles=a; settles=b"`): each field they name replaces the
 * reading's, and the card is theirs from then on. A field left out keeps what was there.
 */
export function amendCard(was: PurposeCard | null, said: string): PurposeCard {
  const next: { kind: string | null; reader: string | null; purpose: string | null; settles: readonly string[] } = {
    kind: was?.kind ?? null, reader: was?.reader ?? null, purpose: was?.purpose ?? null, settles: was?.settles ?? [] };
  let settlesGiven = false;
  for (const part of said.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) throw new Error(`--card takes field=value pairs separated by ";" (kind, reader, purpose, settles); got "${part.trim()}".`);
    const key = part.slice(0, eq).trim().toLowerCase(); const value = part.slice(eq + 1).trim();
    // each `settles=` is one decision, whole: a decision holds commas ("the price, per seat"), so none splits it
    if (key === 'settles') { if (!settlesGiven) next.settles = []; settlesGiven = true; if (value) next.settles = [...next.settles, value].slice(0, SETTLES_MAX); }
    else if (key === 'kind' || key === 'reader' || key === 'purpose') next[key] = value || null;
    else throw new Error(`--card has no field "${key}": kind, reader, purpose or settles.`);
  }
  return { ...next, by: 'you' };
}
