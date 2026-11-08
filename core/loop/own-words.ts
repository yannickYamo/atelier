// atelier/core/loop/own-words.ts — THE PIECE SPEAKS TO ITS READER, NEVER ABOUT ITS OWN MAKING.
//
// A writer short of a fact, or told what it was not given, says so on the page: "The brief doesn't say when I first hit
// this", "I don't have the measured lift in front of me, and I'm not going to invent one". A reader of the post never saw
// a brief and never asked for the writer's scruples: the line breaks the piece. On a blind test such lines were in 21 of
// 25 deep posts and 13 of 25 plain ones, and none of the self-review baseline's; the judges named them every time.
//
// What is missing belongs beside the draft (the run's report, `inferred`), never in it. This reading finds, on the text
// a run is about to deliver, each sentence that talks about the piece's own making: its brief, notes, material or sources;
// what it was not given or does not know; what it will not invent or claim; the writer's process or its instructions. For
// each it writes the sentence again so it carries its point to the reader at the strength what is given supports (the
// claim argued as a view, the mechanism, the reasoning), or drops it where it carried nothing but the confession.
//
// The same read is the last guardrail on two more things a reader should never meet. A bracketed slot left for the
// author ("[figure: what it measures]") is a gap shown to the reader: it is written again from what is given, unless the
// person asked for slots (`--placeholders`). And a name of the author's own world (a customer, a colleague, someone
// quoted, a company or product of theirs) that nothing given holds is invented: the sentence is written again without
// it. Code confirms the name is absent from what was given before anything changes; a name the request or the material
// holds is never touched, and a public name used as common knowledge is the reader's to keep.
//
// Code grounds every answer: the sentence must be in the text as written; a rewrite is one sentence, adds no figure and no
// name that neither the sentence nor what was given holds, and is not the sentence as it was. With no model, nothing is
// read and the text stands, said as not checked: a run is never refused for it.

import { readContext, type Decision, type Reading } from '../inference/reading.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { numbersIn, namesIn } from './integrity.js';
import { sentencesOf } from '../observers/text.js';

export interface OwnWordsInput {
  /** the text about to be delivered */
  readonly text: string;
  /** the request and its material: the only figures and names a rewrite may add */
  readonly given: string;
  /** the author's own words (their pieces and voice, as the skill serves them): a name in them is theirs, a figure is not */
  readonly own?: string;
  /** the person asked for slots to fill (`--placeholders`): a slot is theirs, left as it stands */
  readonly slots?: boolean;
  /** only sentences inside these stretches may change (a fix in place changes only what it was asked to); all when absent */
  readonly within?: readonly string[];
}
export interface OwnWordsFix {
  /** the sentence as the text has it */
  readonly sentence: string;
  /** what it talked about, in a few words (the reading's own) */
  readonly about: string;
  /** the sentence carrying its point to the reader; null drops it */
  readonly rewrite: string | null;
  /** what was wrong with it: the piece's own making (the default), a slot left to fill, or a name nothing gave */
  readonly kind?: 'making' | 'slot' | 'name';
  /** for a name: the name, as the piece writes it */
  readonly name?: string;
}
export interface OwnWordsReading { readonly fixes: readonly OwnWordsFix[]; readonly dropped: readonly { readonly sentence: string; readonly why: string }[] }

/** Why a sentence the read found was left alone in a fix in place: it stands outside what the fix changes. */
export const OUTSIDE = 'it stands outside the sentences this fix changes';

/** Why a finding of the read was no finding at all: the person is never told of these (they were not left in the piece). */
const NOT_FINDINGS = new Set(['the sentence is not in the piece as written', OUTSIDE, 'it holds no slot', 'the name is not in the sentence']);
/** The sentences the read found and could not fix, to list beside the piece: never one that was no finding. */
export const listable = (dropped: readonly { sentence: string; why: string }[]): { sentence: string; why: string }[] => dropped.filter((d) => !NOT_FINDINGS.has(d.why));

/** The most sentences one reading rewrites. */
export const MAX_FIXES = 10;

export const OWN_WORDS_SYSTEM = `You read a piece of writing just before it is published, as an editor. Find every sentence its reader should never meet. There are three kinds.

making: the piece talks about its own making instead of to its reader:
- it mentions a brief, notes, material, sources, instructions or a request it was written from;
- it says what it was not given, does not have, does not know or could not find ("the figure isn't in front of me", "no data was provided");
- it says what it will not invent, claim or make up, or apologises for a missing fact;
- it describes the writer's own process of writing it.
A sentence that states a limit of the subject itself, as the author would to a reader ("Nobody has measured this yet across the industry"), or the author's opinion plainly marked as theirs, is the piece talking to its reader: leave it.

slot: a bracketed slot left for the author to fill, such as "[figure: what it measures]" or "[Your own story goes here.]". Only when the request says slots are not wanted.

name: a name from the author's own world that nothing in <given> holds: a customer, a client, a colleague, a person quoted or told about, the author's own company, team or product. A public name a reader knows, used as common knowledge (a well-known company, product, place or person), is not one: leave it. A name <given> holds, in any form, is not one.

For each sentence you find, give:
- kind: making, slot or name;
- sentence: copied exactly from the piece;
- about: what it talked about, in at most six words;
- name: for a name, the name exactly as the piece writes it; otherwise null;
- rewrite: one sentence, in the piece's voice, that carries the same point to the reader at the strength what is given supports: argue it as the author's view, give the mechanism or the reasoning, or name what the reader should check. For a slot, write the sentence whole from what is given, with no bracket. For a name, write the sentence without the name (a role in its place: "a customer", "one team"). No figure, name, date or story that neither the piece nor <given> holds, in digits or in words. Never mention what is missing. Use null when the sentence carried nothing the piece needs and it reads whole without it.

Most pieces have none: then answer with an empty list.`;

export const OWN_WORDS_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['found'],
  properties: { found: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'sentence', 'about', 'name', 'rewrite'],
    properties: { kind: { type: 'string', enum: ['making', 'slot', 'name'] }, sentence: { type: 'string' }, about: { type: 'string' },
      name: { type: ['string', 'null'] }, rewrite: { type: ['string', 'null'] } } } } },
};

/** The most of what was given a reading is shown to tell a given name from an invented one. */
const GIVEN_SHOWN = 12_000;

/**
 * Where `sentence` stands in `text`, spaces and line breaks read as one: every place, in order. A place starts and ends
 * on a word's edge ("not say." is not inside "cannot say."), and a sentence copied without its closing mark stands only
 * where a sentence ends ("The brief does not say" is not the start of "The brief does not say more here.").
 */
export function placesOf(text: string, sentence: string): { start: number; end: number }[] {
  const t = sentence.trim();
  const words = t.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'));
  if (!words.length) return [];
  const closed = /[.!?…:;"”'’)\]*_]$/u.test(t);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${words.join('\\s+')}${closed ? '(?![\\p{L}\\p{N}])' : '(?=[.!?…:;]|[ \\t]*(?:\\n|$))'}`, 'gu');
  return [...text.matchAll(re)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}
/** A slot the piece leaves for the author ("[figure: what it measures]"): the author's to fill, never this reading's. */
export const SLOT = /\[[^\]\n]{2,}\]/;

const flat = (s: string): string => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** Words only, a possessive read as its name ("Acme's" is Acme) and a hyphen or a point as a space ("Jean-Luc" is "Jean Luc"). */
const plainWords = (s: string): string => ` ${flat(s).replace(/'s\b/g, '').replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim()} `;
const NAME_STOP = new Set(['the', 'a', 'an', 'our', 'my', 'their', 'his', 'her', 'its', 'of', 'and', 'for', 'at', 'in', 'on', 'to', 'mr', 'mrs', 'ms', 'dr']);
/**
 * Whether what was given holds `name`: the whole name as words, or any word of it that is not a common one ("Sarah" in
 * "Sarah Chen", "Acme" in "Acme Corp"). Code only: a name it finds is the person's, and never touched.
 */
export function givenHoldsName(name: string, given: string): boolean {
  const g = plainWords(given); const n = plainWords(name).trim();
  if (!n) return true;
  if (g.includes(` ${n} `)) return true;
  // one word of the name stands for it only where what was given writes it as a name, with its capital ("the path is
  // bright" holds no "Bright Path Labs"; "Sarah noticed it" holds "Sarah Chen")
  const capitals = new Set([...given.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}]*/gu)].map((m) => plainWords(m[0]).trim()));
  return n.split(' ').some((w) => w.length >= 3 && !NAME_STOP.has(w) && capitals.has(w));
}

/** Figures written out in words: a rewrite that adds one adds a figure all the same. Not "one": "one customer" names a role, not a count. */
const WORD_FIGURES = /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|thirteen|fourteen|sixteen|seventeen|eighteen|nineteen|hundreds?|thousands?|millions?|billions?|dozens?|half|halves|thirds?|quarters?|fourth|fifth|sixth|seventh|eighth|ninth|tenth|percent|per cent|twice|double|triple|quadruple|\w+fold)\b/gi;
const wordFigures = (s: string): string[] => [...s.matchAll(WORD_FIGURES)].map((m) => m[0].toLowerCase());

/**
 * Why a rewrite may not stand in for `sentence`, or null. Code only. `held` is what a figure or a name may come from: the
 * request and its material, and the piece itself (a name the piece already uses is no new name).
 */
export function ownWordsProblem(sentence: string, rewrite: string, given: string, piece = '', own = ''): string | null {
  const r = rewrite.trim();
  if (!r) return 'the rewrite was empty';
  if (sentencesOf(r).length !== 1) return 'the rewrite is not one sentence';
  if (r.length > sentence.trim().length * 1.6 + 60) return 'the rewrite runs far longer than the sentence';
  if (flat(r) === flat(sentence)) return 'the rewrite is the sentence as it was';
  const held = `${sentence}\n${given}\n${piece}`;
  const figures = new Set(numbersIn(held));
  const newFigure = numbersIn(r).find((n) => !figures.has(n));
  if (newFigure) return `the rewrite states ${newFigure}, which nothing given holds`;
  const spelled = new Set(wordFigures(held));
  const newWord = wordFigures(r).find((w) => !spelled.has(w));
  if (newWord) return `the rewrite states "${newWord}", a figure nothing given holds`;
  // a name is given when what was given holds it anywhere, a sentence's first word included (where no capital marks a name)
  // (the author's own words count for names, never for figures: a figure of their pieces belongs to that piece's case)
  const words = flat(`${held}\n${own}`).replace(/[^\p{L}\p{N}\s'-]/gu, ' ');
  const extra = namesIn(r).filter((x) => !` ${words} `.includes(` ${flat(x).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim()} `));
  if (extra.length) return `the rewrite names ${extra.join(', ')}, which nothing given holds`;
  return null;
}

export const OWN_WORDS: Reading<OwnWordsInput, OwnWordsReading> = {
  id: 'own-words', version: '3', system: OWN_WORDS_SYSTEM, schema: OWN_WORDS_SCHEMA,
  toolName: 'emit_own_words', toolDescription: 'The sentences where the piece talks about its own making, each written again to speak to the reader, or dropped.',
  maxTokens: 1500, estimateUsd: 0.01,
  prompt: (i) => `<given>\n${i.given.trim().slice(0, GIVEN_SHOWN) || '(nothing beyond the request)'}\n</given>\n\n${i.slots ? 'The person asked for slots to fill: leave every bracketed slot as it stands.' : 'Slots are not wanted: every bracketed slot left for the author is a sentence to write again.'}\n\n<piece>\n${i.text.trim()}\n</piece>`,
  decide: (i) => (i.text.trim() ? null : { fixes: [], dropped: [] }),
  ground(raw, i) {
    // v3 (2026-11-03): slots are written again unless asked for; a name nothing given holds is a sentence to write again
    const found = (raw as { found?: unknown } | null)?.found;
    if (!Array.isArray(found)) return null;
    const fixes: OwnWordsFix[] = []; const dropped: { sentence: string; why: string }[] = []; const names = new Set<string>();
    for (const f of found as { kind?: unknown; sentence?: unknown; about?: unknown; name?: unknown; rewrite?: unknown }[]) {
      const sentence = typeof f?.sentence === 'string' ? f.sentence.trim() : '';
      if (!sentence) continue;
      const kind: 'making' | 'slot' | 'name' = f.kind === 'slot' || f.kind === 'name' ? f.kind : 'making';
      if (!placesOf(i.text, sentence).length) { dropped.push({ sentence, why: 'the sentence is not in the piece as written' }); continue; }
      if (i.within && !i.within.some((w) => placesOf(w, sentence).length)) { dropped.push({ sentence, why: OUTSIDE }); continue; }
      if (i.slots && SLOT.test(sentence)) continue;
      if (kind === 'slot' && !SLOT.test(sentence)) { dropped.push({ sentence, why: 'it holds no slot' }); continue; }
      const name = kind === 'name' && typeof f.name === 'string' ? f.name.trim() : '';
      if (kind === 'name') {
        if (!name || !plainWords(sentence).includes(plainWords(name))) { dropped.push({ sentence, why: 'the name is not in the sentence' }); continue; }
        // what was given holds it: the person's own name, never touched (and never listed: nothing was wrong)
        if (givenHoldsName(name, `${i.given}\n${i.own ?? ''}`)) continue;
        names.add(name);
      }
      if (fixes.some((x) => x.sentence === sentence)) continue;
      if (fixes.length >= MAX_FIXES) { dropped.push({ sentence, why: `at most ${MAX_FIXES} sentences are rewritten in one read` }); continue; }
      const about = typeof f.about === 'string' ? f.about.trim().slice(0, 80) : '';
      const tag: Pick<OwnWordsFix, 'kind' | 'name'> = { ...(kind !== 'making' ? { kind } : {}), ...(name ? { name } : {}) };
      if (f.rewrite === null) { fixes.push({ sentence, about, rewrite: null, ...tag }); continue; }
      const rewrite = typeof f.rewrite === 'string' ? f.rewrite.trim() : '';
      const problem = ownWordsProblem(sentence, rewrite, i.given, i.text, i.own ?? '') ?? (!i.slots && SLOT.test(rewrite) ? 'the rewrite leaves a slot to fill' : null);
      // a rewrite that does not hold leaves the sentence for the person, listed: never a deletion the reading did not ask for
      if (problem) { dropped.push({ sentence, why: problem }); continue; }
      fixes.push({ sentence, about, rewrite, ...tag });
    }
    // NO REWRITE KEEPS A NAME THE READ FOUND INVENTED, wherever it stands in the rewrite (a sentence's first word included,
    // where no capital tells a name from an ordinary word)
    const kept = fixes.filter((x) => {
      const n = x.rewrite === null ? undefined : [...names].find((m) => plainWords(x.rewrite ?? '').includes(plainWords(m)));
      if (n) dropped.push({ sentence: x.sentence, why: `the rewrite keeps ${n}, which nothing given holds` });
      return !n;
    });
    return { fixes: kept, dropped };
  },
  floor: () => ({ fixes: [], dropped: [] }),
};

/** The reading on one text: what to change, by a model, or nothing (not checked) without one. */
export function readOwnWords(input: OwnWordsInput, client: InferenceClient | null, model: string | null, budget: Budget): Promise<Decision<OwnWordsReading>> {
  return readContext(OWN_WORDS, input, client, model, budget, 'repair');
}

/** The stretches of fenced code in `text`: never this reading's to change. */
const fences = (text: string): { start: number; end: number }[] => [...text.matchAll(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

/** `text` with `start..end` removed, and only what the removal itself leaves tidied: the space it opened, emphasis it
 * emptied, and the line, when nothing but a list or quote marker is left on it. Nothing else of the text is touched. */
function dropAt(text: string, start: number, end: number): string {
  let b = text.slice(0, start); let a = text.slice(end);
  const em = /(\*\*|__)[ \t]*$/.exec(b); const em2 = em ? new RegExp(`^[ \\t]*${em[1].replace(/\*/g, '\\*')}`).exec(a) : null;
  if (em && em2) { b = b.slice(0, em.index); a = a.slice(em2[0].length); }
  if (/[ \t]$/.test(b) && (/^[ \t]/.test(a) || a.startsWith("\n") || a === '')) b = b.replace(/[ \t]+$/, '');
  else if (b === '' || b.endsWith("\n")) a = a.replace(/^[ \t]+/, '');
  const head = b.slice(b.lastIndexOf('\n') + 1); const nl = a.indexOf('\n'); const tail = nl < 0 ? a : a.slice(0, nl);
  if (/^[ \t]*(?:[-*+•]|\d+[.)]|>)?[ \t]*$/.test(head + tail)) {
    // the line is left empty: it goes, and the blank lines either side of it close to one
    const bb = b.slice(0, b.length - head.length); const aa = nl < 0 ? '' : a.slice(nl);
    const nb = /\n*$/.exec(bb)?.[0].length ?? 0; const na = /^\n*/.exec(aa)?.[0].length ?? 0;
    if (!aa.trim()) return bb.trim() ? `${bb.replace(/\s+$/, '')}${text.endsWith("\n") ? '\n' : ''}` : '';
    if (!bb.trim()) return aa.replace(/^\n+/, '');
    return `${bb.slice(0, bb.length - nb)}${'\n'.repeat(Math.min(2, Math.max(nb, na)))}${aa.slice(na)}`;
  }
  return `${b}${a}`;
}

/**
 * The text with each fix applied where its sentence stands: a rewrite in place, a drop with only what it leaves tidied.
 * Every place the sentence stands is changed, outside fenced code; with `within`, only the places inside those
 * stretches (a fix in place changes only the sentences it wrote).
 */
export function withOwnWords(text: string, fixes: readonly OwnWordsFix[], within?: readonly string[]): string {
  let out = text;
  for (const f of fixes) {
    const code = fences(out);
    const open = within ? within.flatMap((w) => placesOf(out, w)) : null;
    const places = placesOf(out, f.sentence).filter((at) => !code.some((c) => at.start >= c.start && at.end <= c.end)
      && (!open || open.some((o) => at.start >= o.start && at.end <= o.end)));
    for (const at of places.reverse()) out = f.rewrite !== null ? `${out.slice(0, at.start)}${f.rewrite}${out.slice(at.end)}` : dropAt(out, at.start, at.end);
  }
  return out;
}

/** The one line said of what was found and done. */
export function ownWordsNote(fixes: readonly OwnWordsFix[]): string {
  const part = (of: readonly OwnWordsFix[], what: string): string => {
    if (!of.length) return '';
    const re = of.filter((f) => f.rewrite !== null).length; const cut = of.length - re;
    return `${what} in ${of.length} sentence(s) (${of.map((f) => f.name ?? (f.about || 'its notes')).join('; ')}): ${[re ? `${re} written again to speak to the reader` : '', cut ? `${cut} dropped` : ''].filter(Boolean).join(', ')}`;
  };
  const parts = [part(fixes.filter((f) => !f.kind || f.kind === 'making'), 'The piece talked about its own making'),
    part(fixes.filter((f) => f.kind === 'slot'), 'It left a slot to fill'), part(fixes.filter((f) => f.kind === 'name'), 'It named someone nothing given holds')].filter(Boolean);
  return `${parts.join('. ')}. What was missing is listed beside the draft, never in it.`;
}
