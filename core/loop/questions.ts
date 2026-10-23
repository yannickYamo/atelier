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
// form included), STATUS (KNOWN from what was given, INFERABLE from it, or UNKNOWN), and SPREAD (would its likely answers
// give the SAME draft, SOME difference, or DIFFERENT drafts). Code grounds it: a decision of kind OTHER is never asked (the
// examples, method, request and material settle voice and form); only an UNKNOWN whose answers give DIFFERENT drafts is
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
export interface Decided { readonly kind: QuestionKind | 'OTHER'; readonly status: 'KNOWN' | 'INFERABLE' | 'UNKNOWN'; readonly spread: 'SAME' | 'SOME' | 'DIFFERENT'; readonly what: string }
export interface QuestionsReading { readonly decisions: readonly Decided[]; readonly questions: readonly Question[] }

export const QUESTIONS_SYSTEM = `You prepare a writer to write one piece in a person's own voice. You are shown the person's request, the material that came with it, their method, the heads of a few of their finished pieces, and what they told this skill before.

List the decisions this piece needs (at most six). For each:
- kind: ANGLE (the angle of the piece, or why it is worth saying now), NAMING (what or whom the piece may name), NEWS (news about the person's own company or work that the piece could carry), EMPHASIS (which part to stress), or OTHER (anything else: voice, tone, length, form, structure, wording; the examples and the method settle those).
- status: KNOWN (the request, material, method, examples or what they told before already says it), INFERABLE (a careful reader of those could settle it), or UNKNOWN (only the person can say).
- spread: would the person's likely answers produce the SAME draft, SOME difference, or DIFFERENT drafts.
- what: the decision in a few words.
For an UNKNOWN decision only, also write the question to the person (one short sentence, in plain words), two to four short options they could pick, and the default: the option you would write with if they say nothing.

Never ask about voice, tone, length or form. Never ask what was already given or what they told before. Most requests carry what they need: then every decision is KNOWN or INFERABLE.`;

export const QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    decisions: { type: 'array', items: { type: 'object', properties: {
      kind: { type: 'string', enum: [...QUESTION_KINDS, 'OTHER'] },
      status: { type: 'string', enum: ['KNOWN', 'INFERABLE', 'UNKNOWN'] },
      spread: { type: 'string', enum: ['SAME', 'SOME', 'DIFFERENT'] },
      what: { type: 'string' },
      ask: { type: ['string', 'null'] },
      options: { type: 'array', items: { type: 'string' } },
      default: { type: ['string', 'null'] },
    }, required: ['kind', 'status', 'spread', 'what', 'ask', 'options', 'default'], additionalProperties: false } },
  },
  required: ['decisions'], additionalProperties: false,
};

const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n);
const same = (a: string, b: string): boolean => clip(a, 400).toLowerCase() === clip(b, 400).toLowerCase();

/** The score a decision is asked by: only an unknown whose answers give different drafts is above the line. */
export const spreadScore = (d: Pick<Decided, 'status' | 'spread'>): number => (d.status !== 'UNKNOWN' ? 0 : d.spread === 'DIFFERENT' ? 2 : d.spread === 'SOME' ? 1 : 0);
/** The line a decision must reach to be asked. */
export const ASK_THRESHOLD = 2;

export const QUESTIONS: Reading<QuestionsInput, QuestionsReading> = {
  id: 'questions', version: '1',
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
      if (!kind || !status || !spread || !what) continue;
      decisions.push({ kind, status, spread, what });
      // ABOVE THE LINE: the author's own content, unknown, and answers that give different drafts.
      if (kind === 'OTHER' || spreadScore({ status, spread }) < ASK_THRESHOLD || asked.has(kind)) continue;
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

/**
 * THE ANSWERS GIVEN AS `--answers "angle=b,naming=only the product"` (a form parser: comma-separated `id=choice`). A
 * choice that is a single letter names that option of the question; anything else is the person's own answer, kept as
 * written. An id no question carries is kept too: it answers that kind if a later run asks it. Never fails.
 */
export function parseAnswers(s: string | undefined, questions: readonly Question[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (s ?? '').split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const id = part.slice(0, eq).trim().toLowerCase(); const choice = part.slice(eq + 1).trim();
    if (!id || !choice) continue;
    const q = questions.find((x) => x.id === id);
    const i = /^[a-d]$/i.test(choice) ? choice.toLowerCase().charCodeAt(0) - 97 : -1;
    out.set(id, q && i >= 0 && i < q.options.length ? q.options[i] : choice);
  }
  return out;
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

/** What the writer is told of the answers, after the skill: the person's own words settle these decisions. */
export function answersNote(qs: readonly Question[], answers: ReadonlyMap<string, string>): string {
  const lines = qs.map((q) => `- ${q.ask} ${answers.get(q.id) ?? q.default}`);
  return lines.length ? `Before writing I settled these (my answers; write from them):\n\n${lines.join('\n')}` : '';
}
