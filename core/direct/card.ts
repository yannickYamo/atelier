// atelier/core/direct/card.ts — WHAT THIS SKILL'S WORK IS: ITS KIND, ITS READER, ITS PURPOSE, AND WHAT IT SETTLES.
// READ once, at the build, from the author's pieces, the one line they gave and their note: a card written by hand per
// kind of work would need a new one for each kind. GROUNDED BY CODE: a field is kept only with a quote found there.
// What the person's own words show is theirs (`stated`) and is told to the writer; the rest tells the editor's
// questions (./questions.ts) what this kind of work decides. `atelier amend --card` replaces the reading's word.

import type { Reading } from '../inference/reading.js';

export interface PurposeCard {
  readonly kind: string | null;
  readonly reader: string | null;
  readonly purpose: string | null;
  readonly settles: readonly string[];
  readonly by: 'model' | 'you'; // who wrote it: the build's reading, or the person (`atelier amend --card`)
  readonly stated?: readonly ('kind' | 'reader' | 'purpose')[];
  readonly request?: string; // the line they gave, where it asks for one piece: the build writes it
  /** the reading's key (id, version and the pieces' hash): read again only when it changes */
  readonly reading?: string;
}
export interface CardInput { readonly purpose: string | null; readonly pieces: readonly { readonly name: string; readonly text: string }[];
  /** the author's method note, where they wrote one: it often says who the work is for and what it is to do, which the pieces only show */
  readonly method?: string | null }

/** The most decisions a card says its kind of work settles. */
export const SETTLES_MAX = 5;

export const CARD_SYSTEM = `You read a set of one author's finished pieces, with the one line they gave for what the pieces are for and their own note on how they work, where they gave them. Say what this work is, as an editor who knows this kind of work would:

- kind: what the pieces are, in a few words ("a pricing memo", "a reply to a customer's complaint", "a post on engineering practice").
- kindQuote: a short passage copied exactly from a piece, the stated purpose or the author's note that shows it.
- reader: who reads them, and in what situation ("a customer who was billed twice", "an engineer choosing a tool").
- readerQuote: a short passage copied exactly from a piece, the stated purpose or the author's note that shows it.
- purpose: what a piece of this kind is for: what it gets the reader to know, do or decide. One sentence.
- purposeQuote: a short passage copied exactly from a piece, the stated purpose or the author's note that shows it.
- asksQuote: where the line they gave asks for one particular piece (it says what that piece is about), the words of the line that name it, copied exactly; null where the line only says what the work is in general.
- settles: the decisions every piece of this kind has to settle before it is written, at most five, each in a few words ("the price, and what it is compared with", "what is offered to make it right"). What any piece of writing settles (a title, a length) is not one of them.

Kind and reader are each one short phrase, with no aside and nothing in brackets. Say only what the pieces and the author's own words show. Where the line they gave or their note says who reads the work or what it is for, that is their word: use it, and copy the quote from there, not from a piece. Where nothing shows a reader or a purpose, give null for it and its quote; never a guess, and never a sentence saying it is unclear.`;

export const CARD_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: {
    kind: { type: ['string', 'null'] }, kindQuote: { type: ['string', 'null'] },
    reader: { type: ['string', 'null'] }, readerQuote: { type: ['string', 'null'] },
    purpose: { type: ['string', 'null'] }, purposeQuote: { type: ['string', 'null'] }, asksQuote: { type: ['string', 'null'] }, settles: { type: 'array', items: { type: 'string' } },
  }, required: ['kind', 'kindQuote', 'reader', 'readerQuote', 'purpose', 'purposeQuote', 'asksQuote', 'settles'], additionalProperties: false,
};

const clip = (s: unknown, n: number): string => { const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''; return t.length <= n ? t : `${t.slice(0, n + 1).replace(/\s+\S*$/, '')}…`; };
const flat = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether a quote of eight characters or more is in the pieces, the stated purpose or the author's note (a form check). */
const found = (quote: unknown, input: CardInput, own = false): boolean => {
  const q = flat(typeof quote === 'string' ? quote.slice(0, 300) : '');
  return q.length >= 8 && [input.purpose ?? '', input.method ?? '', ...(own ? [] : input.pieces.map((p) => p.text))].some((t) => flat(t).includes(q));
};

export interface CardReading { readonly card: PurposeCard | null }

export const PURPOSE_CARD: Reading<CardInput, CardReading> = {
  id: 'purpose-card', version: '5',
  system: CARD_SYSTEM, schema: CARD_SCHEMA,
  toolName: 'emit_purpose_card', toolDescription: 'What this work is: its kind, its reader, its purpose, and the decisions every piece of it settles.',
  maxTokens: 800, estimateUsd: 0.02,
  prompt(input) {
    return [input.purpose?.trim() ? `What the author said the pieces are for: ${input.purpose.trim()}` : 'The author said nothing about what the pieces are for.',
      ...(input.method?.trim() ? [`The author's note on how they work:\n<method>\n${input.method.trim().slice(0, 6000)}\n</method>`] : []),
      `The pieces:\n${input.pieces.slice(0, 12).map((p) => `<piece name="${p.name}">\n${p.text.slice(0, 4000)}\n</piece>`).join('\n\n')}`].join('\n\n');
  },
  // no pieces, nothing to read
  decide(input) { return input.pieces.length ? null : { card: null }; },
  ground(raw, input) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') return null;
    const kind = clip(r.kind, 120); const reader = clip(r.reader, 160);
    const settles = [...new Set((Array.isArray(r.settles) ? r.settles : []).map((x) => clip(x, 120)).filter(Boolean))].slice(0, SETTLES_MAX);
    const card: PurposeCard = {
      kind: kind && found(r.kindQuote, input) ? kind : null,
      reader: reader && found(r.readerQuote, input) ? reader : null,
      // A PURPOSE STANDS ON A QUOTE, as the kind and the reader do: one nothing shows is left empty, so the build asks
      // the person for it. A hedge ("unclear from the pieces") was once kept as the purpose, and nothing was asked.
      purpose: clip(r.purpose, 240) && found(r.purposeQuote, input) ? clip(r.purpose, 240) : null,
      settles, by: 'model',
    };
    const stated = (['kind', 'reader', 'purpose'] as const).filter((f) => card[f] && found(r[`${f}Quote`], input, true));
    const asks = flat(typeof r.asksQuote === 'string' ? r.asksQuote.slice(0, 300) : ''); const request = asks.length >= 8 && flat(input.purpose ?? '').includes(asks) ? (input.purpose ?? '').trim() : '';
    return { card: card.kind || card.reader || card.purpose || card.settles.length || request ? { ...card, ...(stated.length ? { stated } : {}), ...(request ? { request } : {}) } : null };
  },
  floor() { return { card: null }; },
};

/** What the person said, to the writer: a line asking for one piece describes that piece, else the pieces. */
export function cardSaid(c: PurposeCard | null, asked: string): string {
  const own = (f: 'kind' | 'reader' | 'purpose'): string => (c && (c.by === 'you' || c.stated?.includes(f)) ? c[f] ?? '' : '');
  const one = Boolean(c?.request); if (one && flat(c?.request ?? '') !== flat(asked)) return '';
  return [own('kind') && `What the author says ${one ? 'this piece is' : 'these pieces are'}: ${own('kind')}.`, own('reader') && `Who the author says reads ${one ? 'it' : 'them'}: ${own('reader')}.`,
    own('purpose') && `What the author says ${one ? 'this piece is' : 'these pieces are'} for: ${own('purpose').replace(/\.$/, '')}.`].filter(Boolean).join('\n');
}

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
