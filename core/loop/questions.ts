// atelier/core/loop/questions.ts — UP TO THREE QUESTIONS BEFORE THE DRAFT, ONLY FOR WHAT ONLY THE AUTHOR KNOWS.
//
// A post written in someone's voice can sound like them and still not be theirs: the angle, why it is worth saying now,
// what may be named, what is new about their own work, what they want stressed. None of that is in the examples, the
// method or the material, and a writer left to guess it guesses the same safe thing each time; the person then edits the
// argument, not the sentences. So before the first draft one reading lists the decisions the piece needs and asks the
// person only the few whose answer is theirs alone and would change the draft.
//
// THE READING (house pattern, ../inference/reading.ts). The reader lists the decisions the piece needs and, for each, a
// closed choice of KIND (what the decision is about: ANGLE, NAMING, NEWS, EMPHASIS, or OTHER for anything else, voice and
// form included), STATUS (KNOWN from what was given, INFERABLE from it, or UNKNOWN), SPREAD (would its likely answers
// give the SAME draft, SOME difference, or DIFFERENT drafts), and SETTLED BY (what settles it: the examples, the request,
// the material, the method, or the author only). Code grounds it: a decision of kind OTHER, or one settled by anything but
// the author, is never asked (the examples, method, request and material settle voice and form: a tone question labelled
// ANGLE is still settled by the examples); only an UNKNOWN whose answers give DIFFERENT drafts is
// above the line; it needs 2 to 4 options and a default among them; one question per kind, at most three, in a fixed order.
// With no model, or nothing grounded, the floor asks nothing.
//
// What the skill was told before is shown to the reader, and kept by code: what may be NAMED stands for the skill once
// said and is never asked again; the other kinds belong to one piece, so last time's answer is only the default ("last
// time you said …"). Nothing here names a kind of work.

import type { Reading } from '../inference/reading.js';

/** What a decision is about. Only the first four are the author's alone; OTHER is never asked. */
export const QUESTION_KINDS = ['ANGLE', 'NAMING', 'NEWS', 'EMPHASIS'] as const;
export type QuestionKind = typeof QUESTION_KINDS[number];
/** A kind whose answer stands for the skill once given: never asked again. */
export const STANDING_KINDS: ReadonlySet<QuestionKind> = new Set(['NAMING']);
/** The most questions a run asks. */
export const MAX_QUESTIONS = 3;
/** What settles a decision, a closed field the reader fills: only `author-only` is asked. */
export const SETTLED_BY = ['examples', 'request', 'material', 'method', 'author-only'] as const;
/** Where an angle or news is stated, a closed field the reader fills with a quote code finds there; NONE where nothing states it. */
export const STATED_IN = ['request', 'material', 'told', 'NONE'] as const;
/** The kinds asked by where they are stated, not by the reader's status: what the piece argues now, and news of the author's own work. */
export const STATED_KINDS: ReadonlySet<QuestionKind> = new Set(['ANGLE', 'NEWS']);
/** What the writer is told a kind's answer is about, where it was given for a kind this run did not ask. */
export const KIND_ASK: Readonly<Record<QuestionKind, string>> = { ANGLE: 'The angle, and why now:', NAMING: 'What the piece may name:', NEWS: 'News of my own work it may carry:', EMPHASIS: 'What to stress:' };

/** One question as the person sees it, and as `--json` and the MCP return it. */
export interface Question {
  /** the kind, lower case: what `--answers <id>=<choice>` names */
  readonly id: string;
  readonly ask: string;
  readonly options: readonly string[];
  /** the option used when nothing is answered (last time's answer, where there is one) */
  readonly default: string;
  /** what this skill was told last time, said as "last time you said …" */
  readonly last?: string;
}
/** An answer the skill was given, kept per skill (../state/store.ts). */
export interface ToldAnswer { readonly id: string; readonly ask: string; readonly answer: string; readonly at: string }

export interface QuestionsInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the method's steps, in the owner's words */
  readonly method: readonly string[];
  /** heads of the owner's examples */
  readonly examples: readonly string[];
  /** what the skill was told on earlier runs */
  readonly told: readonly ToldAnswer[];
}
/** One decision the piece needs, as read and grounded. */
export interface Decided { readonly kind: QuestionKind | 'OTHER'; readonly status: 'KNOWN' | 'INFERABLE' | 'UNKNOWN'; readonly spread: 'SAME' | 'SOME' | 'DIFFERENT'; readonly settledBy: typeof SETTLED_BY[number] | null; readonly what: string }
export interface QuestionsReading { readonly decisions: readonly Decided[]; readonly questions: readonly Question[] }

export const QUESTIONS_SYSTEM = `You prepare a writer to write one piece in a person's own voice. You are shown the person's request, the material that came with it, their method, the heads of a few of their finished pieces, and what they told this skill before.

List the decisions this piece needs (at most six). For each:
- kind: ANGLE (the angle of the piece, or why it is worth saying now), NAMING (what or whom the piece may name), NEWS (news about the person's own company or work that the piece could carry), EMPHASIS (which part to stress), or OTHER (anything else: voice, tone, length, form, structure, wording; the examples and the method settle those).
- status: KNOWN (the request, material, method, examples or what they told before already says it), INFERABLE (a careful reader of those could settle it), or UNKNOWN (only the person can say).
- spread: would the person's likely answers produce the SAME draft, SOME difference, or DIFFERENT drafts.
- settledBy: what settles it: "examples" (their finished pieces show it: voice, tone, form, length), "request", "material", "method", or "author-only" (none of those can; only the person knows it).
- what: the decision in a few words.
- statedIn and quote, for ANGLE and NEWS: where the angle (or why now), or the news of the person's own work, is stated in so many words: "request", "material" or "told" (what they told this skill before), with a short quote copied exactly from there; or "NONE" with no quote where nothing given states it. A point you could argue from the material is not a stated angle: answer NONE. For other kinds, NONE.
For an UNKNOWN decision, and for an ANGLE or NEWS stated NONE, also write the question to the person (one short sentence, in plain words), two to four short options they could pick, and the default: the option you would write with if they say nothing.

Never ask about voice, tone, length or form. Never ask what was already given or what they told before. Most requests carry what they need: then every decision is KNOWN or INFERABLE.`;

export const QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    decisions: { type: 'array', items: { type: 'object', properties: {
      kind: { type: 'string', enum: [...QUESTION_KINDS, 'OTHER'] },
      status: { type: 'string', enum: ['KNOWN', 'INFERABLE', 'UNKNOWN'] },
      spread: { type: 'string', enum: ['SAME', 'SOME', 'DIFFERENT'] },
      settledBy: { type: 'string', enum: [...SETTLED_BY] },
      what: { type: 'string' },
      ask: { type: ['string', 'null'] },
      options: { type: 'array', items: { type: 'string' } },
      default: { type: ['string', 'null'] },
      statedIn: { type: 'string', enum: [...STATED_IN] },
      quote: { type: ['string', 'null'] },
    }, required: ['kind', 'status', 'spread', 'settledBy', 'what', 'ask', 'options', 'default', 'statedIn', 'quote'], additionalProperties: false } },
  },
  required: ['decisions'], additionalProperties: false,
};

const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** How much of each material file the reader is shown, and of all of them together: a "why now" stated further down a file than its head is still a statement. */
export const SHOWN_PER_FILE = 4000;
export const SHOWN_IN_ALL = 12000;
/**
 * THE MATERIAL AS THE READER SEES IT: each file from its start, up to SHOWN_PER_FILE characters, and SHOWN_IN_ALL over
 * every file in order (a later file gets what is left). Shown to the reader and searched for its quotes (`statedWhere`),
 * so a quote the reader copies from anywhere it was shown is found.
 */
export function materialShown(material: readonly { readonly name: string; readonly text: string }[]): { readonly name: string; readonly head: string }[] {
  let left = SHOWN_IN_ALL;
  return material.map((m) => { const head = m.text.slice(0, Math.min(SHOWN_PER_FILE, Math.max(0, left))); left -= head.length; return { name: m.name, head }; });
}
/** Curly and straight apostrophes and quotation marks read as one (a form parser). */
const straight = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const same = (a: string, b: string): boolean => clip(a, 400).toLowerCase() === clip(b, 400).toLowerCase();

/** The score a decision is asked by: only an unknown whose answers give different drafts is above the line. */
export const spreadScore = (d: Pick<Decided, 'status' | 'spread'>): number => (d.status !== 'UNKNOWN' ? 0 : d.spread === 'DIFFERENT' ? 2 : d.spread === 'SOME' ? 1 : 0);
/** The line a decision must reach to be asked. */
export const ASK_THRESHOLD = 2;

/** Whether a quote of five or more characters is in the source the reader named (a form check: the words are there or not). */
function statedWhere(where: string, quote: string, input: QuestionsInput): boolean {
  const q = straight(clip(quote, 400)).toLowerCase();
  if (q.length < 5) return false;
  const source = where === 'request' ? input.request : where === 'material' ? input.material.map((m) => m.head).join('\n') : where === 'told' ? input.told.map((t) => t.answer).join('\n') : '';
  return straight(clip(source, 100000)).toLowerCase().includes(q);
}

export const QUESTIONS: Reading<QuestionsInput, QuestionsReading> = {
  id: 'questions', version: '2',
  system: QUESTIONS_SYSTEM, schema: QUESTIONS_SCHEMA,
  toolName: 'emit_questions', toolDescription: 'The decisions the piece needs, each with its kind, status and spread; a question with options and a default for an unknown one.',
  maxTokens: 1200, estimateUsd: 0.01,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}` : 'No material came with it.',
      input.method.length ? `The method:\n${input.method.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
      ...input.examples.slice(0, 3).map((e, i) => `Piece ${i + 1} (head):\n${e.slice(0, 800)}`),
      input.told.length ? `What they told this skill before:\n${input.told.map((t) => `- ${t.ask} ${t.answer}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
  // An empty request asks for nothing: code decides it, with nothing to ask.
  decide(input) { return input.request.trim() ? null : { decisions: [], questions: [] }; },
  ground(raw, input) {
    const r = raw as { decisions?: unknown } | null;
    if (!r || !Array.isArray(r.decisions)) return null;
    const decisions: Decided[] = []; const asked = new Map<QuestionKind, { q: Question; score: number }>();
    for (const x of r.decisions.slice(0, 6) as Record<string, unknown>[]) {
      const kind = (QUESTION_KINDS as readonly string[]).includes(String(x?.kind)) ? x.kind as QuestionKind : x?.kind === 'OTHER' ? 'OTHER' as const : null;
      const status = x?.status === 'KNOWN' || x?.status === 'INFERABLE' || x?.status === 'UNKNOWN' ? x.status : null;
      const spread = x?.spread === 'SAME' || x?.spread === 'SOME' || x?.spread === 'DIFFERENT' ? x.spread : null;
      const what = typeof x?.what === 'string' ? clip(x.what, 120) : '';
      const settledBy = (SETTLED_BY as readonly string[]).includes(String(x?.settledBy)) ? x.settledBy as typeof SETTLED_BY[number] : null;
      if (!kind || !status || !spread || !what) continue;
      decisions.push({ kind, status, spread, settledBy, what });
      // ABOVE THE LINE: the author's own content (settled by the author alone, by the reader's closed field), unknown, and
      // answers that give different drafts.
      // THE ANGLE AND THE NEWS ARE THE AUTHOR'S WHERE NOTHING GIVEN STATES THEM. Read by where they are stated (a closed field
      // with NONE allowed) and grounded by code: a quote not found where the reader says is no statement. A reader that
      // called an unstated angle inferable from the material had the writer guess it; stated, it is never asked.
      // THE ANGLE AND THE NEWS, unstated, are the author's whatever status the reader gave them (a reader that called an
      // unstated angle inferable from the material had the writer guess it). A statement is held to its quote: one said
      // to be stated in the request with no quote the request holds is no statement, whatever settles it. One gate
      // silences them: the reader says the material already settles it (settledBy 'material', KNOWN). INFERABLE is no
      // settlement, a missing or made-up settledBy means the author's, and spread alone never gates. Every other kind is
      // asked only where the author alone settles it and the answers would change the draft.
      const byStatement = kind !== 'OTHER' && STATED_KINDS.has(kind) && (STATED_IN as readonly string[]).includes(String(x?.statedIn));
      const stated = byStatement && statedWhere(String(x.statedIn), typeof x.quote === 'string' ? x.quote : '', input);
      const settled = byStatement ? settledBy === 'material' && status === 'KNOWN' : settledBy !== 'author-only';
      if (kind === 'OTHER' || asked.has(kind) || stated || settled || (byStatement ? false : spreadScore({ status, spread }) < ASK_THRESHOLD)) continue;
      const told = [...input.told].reverse().find((t) => t.id === kind.toLowerCase());
      // What may be named, once told, stands: never asked again.
      if (told && STANDING_KINDS.has(kind)) continue;
      const ask = typeof x.ask === 'string' ? clip(x.ask, 200) : '';
      const options = [...new Set((Array.isArray(x.options) ? x.options : []).filter((o): o is string => typeof o === 'string' && clip(o, 120).length > 0).map((o) => clip(o, 120)))];
      const def = typeof x.default === 'string' ? options.find((o) => same(o, x.default as string)) : undefined;
      if (!ask || options.length < 2 || options.length > 4 || !def) continue;
      asked.set(kind, { q: { id: kind.toLowerCase(), ask, options, default: told ? told.answer : def, ...(told ? { last: told.answer } : {}) }, score: spreadScore({ status, spread }) });
    }
    if (!decisions.length) return null;
    // At most three, in the kinds' fixed order: the angle first.
    const questions = QUESTION_KINDS.flatMap((k) => { const a = asked.get(k); return a ? [a.q] : []; }).slice(0, MAX_QUESTIONS);
    return { decisions, questions };
  },
  // No model, or nothing grounded: ask nothing.
  floor() { return { decisions: [], questions: [] }; },
};

/** A letter for an option: a, b, c, d. */
export const letter = (i: number): string => String.fromCharCode(97 + i);

/** Where one `id=choice` pair ends and the next begins (a form parser): a comma followed by an id and "=". */
const PAIR_BREAK = /,(?=\s*[a-z][a-z0-9_-]*\s*=)/i;

/**
 * THE ANSWERS GIVEN AS `--answers "angle=b,naming=only the product, never the operator"` (a form parser: `id=choice`
 * pairs, split only where a comma is followed by `<id>=`, so an answer may hold commas). A single letter names that
 * option of the question; a letter past its options is no answer: the default stands, and that is said. Anything else
 * is the person's own answer, kept as written. An id that is a question kind answers that kind, asked this run or not;
 * one that is no kind is said in one line and ignored. Never fails.
 */
export function readAnswers(s: string | undefined, questions: readonly Question[]): { readonly answers: Map<string, string>; readonly said: string[] } {
  const answers = new Map<string, string>(); const said: string[] = [];
  const kinds = QUESTION_KINDS.map((k) => k.toLowerCase());
  for (const part of (s ?? '').split(PAIR_BREAK)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const id = part.slice(0, eq).trim().toLowerCase(); const choice = part.slice(eq + 1).trim();
    if (!id || !choice) continue;
    if (!kinds.includes(id)) { said.push(`${id} matched no question; ignored.`); continue; }
    const q = questions.find((x) => x.id === id);
    const i = /^[a-d]$/i.test(choice) ? choice.toLowerCase().charCodeAt(0) - 97 : -1;
    if (i < 0) { answers.set(id, choice); continue; }
    if (q && i < q.options.length) { answers.set(id, q.options[i]); continue; }
    said.push(q ? `${id}=${choice}: the question has no option ${choice.toLowerCase()}; written with the default (${q.default}).`
      : `${id}=${choice}: no ${id} question was asked this run to pick ${choice.toLowerCase()} from; ignored.`);
  }
  return { answers, said };
}

/** The questions as a person reads them in a terminal: each with its lettered options and its default. */
export function questionLines(qs: readonly Question[]): string[] {
  return qs.flatMap((q, n) => [`${n + 1}. ${q.ask}`, ...q.options.map((o, i) => `   ${letter(i)}) ${o}${same(o, q.default) ? ' (default)' : ''}`),
    ...(q.last ? [`   last time you said: ${q.last}`] : [])]);
}

/** The one line said where the questions are not asked (a host, a pipe, --json): written with the defaults, and how to answer. */
export function defaultsLine(qs: readonly Question[]): string {
  return `Questions before writing (${qs.length}): written with the defaults (${qs.map((q) => `${q.id}: ${q.default}`).join('; ')}); to answer, run again with --answers "${qs.map((q) => `${q.id}=<letter or your words>`).join(',')}".`;
}

/** How a default nobody answered is served to the writer: as an assumption, with the way to change it. */
export const ASSUMED = 'assumed, no answer given (change with --answers):';

/**
 * What the writer is told of the answers, after the skill. `answers` holds only what the person gave (now, or told
 * before): those settle the decisions in the person's own words. A question none of them answers is served with its
 * default as an assumption, apart and said so: the writer never takes a default as the person's position, and never
 * states what rests on it as a fact of theirs (an assumed angle or news served as fact was the person's own work
 * misreported).
 */
export function answersNote(qs: readonly Question[], answers: ReadonlyMap<string, string>): string {
  const mine = qs.filter((q) => answers.has(q.id)).map((q) => `- ${q.ask} ${answers.get(q.id) ?? ''}`);
  const assumed = qs.filter((q) => !answers.has(q.id)).map((q) => `- ${q.ask} ${ASSUMED} ${q.default}`);
  return [mine.length ? `Before writing I settled these (my answers; write from them):\n\n${mine.join('\n')}` : '',
    assumed.length ? `Not settled: nobody answered these, so each is a working assumption, not my position. Write from it as an assumption (never state it as a fact about me, my work or my company) and keep what rests on it easy to change:\n\n${assumed.join('\n')}` : ''].filter(Boolean).join('\n\n');
}
