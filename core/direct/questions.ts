// atelier/core/direct/questions.ts — WHAT AN EDITOR ASKS BEFORE THE DRAFT: THE DECISIONS THAT MOVE THIS ARGUMENT MOST.
//
// The direct writer had no question step at all, and the compiled path's asks only for missing facts and positions
// (the angle, what may be named, news, emphasis): on notes that covered those, it asked nothing, and what the person
// then fixed by hand was the argument itself. A fixed list of three (the idea, the pain, the proof) then asked the same
// three of every piece: a topic passed for an idea, nothing checked the next step, and a pricing memo was asked what a
// blog post is. So the questions are shaped by the piece. An editor reads the request, the material, the method and the
// kind of work, and asks the few open decisions that would change THIS argument most, the most important first.
//
// THE READING (house pattern, ../inference/reading.ts), one call:
//   decisions  up to three open decisions, the most important first: what is to be decided, why it moves the
//              argument, the question, two to four options grounded in what was given, and the one it would pick.
//   fields     the five things any argument lands on (the one idea, the reader, their pain, the proof, the next step
//              the reader takes): for each, where the request, the material, the method or what they told this skill
//              before states it in so many words, with a quote; or the question to ask where nothing does.
// Code holds every quote to its source, so only a real absence counts. The decisions come first; where the reading
// names none it can ground, the fields nothing states are asked instead (in that order, at most three), so a request
// with something unstated is never asked nothing. A topic is not an idea, an audience is not a reader in a situation,
// and "learn more" is not a next step: those are said to the reader, never matched in code. With no model, or nothing
// grounded, nothing is asked.
//
// WHAT AN ANSWER DOES, AND WHAT NO ANSWER DOES. Only what the person answers reaches the writer, in their words. A
// question nobody answers (a pipe, --json, an agent) changes nothing in the piece: the writer decides as it would with
// your posts pasted, and the question comes back with its options for the next run (`--answers`). A suggested option is
// never served as though it were the person's: a default told to a writer once came back in the piece as a disclaimer.

import type { Reading } from '../inference/reading.js';
import { KIND_ASK, type Question, type ToldAnswer, type QuestionKind, type GapKind } from '../loop/questions.js';

/** The five things any argument lands on: the fallback when the reading names no decision of this piece's own. */
export const EDITOR_KINDS = ['idea', 'reader', 'pain', 'proof', 'next'] as const;
export type EditorKind = typeof EDITOR_KINDS[number];
/** The most questions asked before one piece. */
export const EDITOR_MAX = 3;

/** What the writer is told an answer of each kind is about. */
export const EDITOR_ASK: Readonly<Record<EditorKind, string>> = {
  idea: 'The one idea the reader should leave with:',
  reader: 'Who reads it, and the situation they read it in:',
  pain: 'What the reader lives with that this piece speaks to:',
  proof: 'What shows it (a case, a figure, or something the reader can try):',
  next: 'What the reader does next, after reading:',
};
/** What answering each unlocks, said once with the question. */
export const EDITOR_UNLOCKS: Readonly<Record<EditorKind, string>> = {
  idea: 'The line the whole piece argues toward, and how it ends.',
  reader: 'What the piece may assume, and what it must explain.',
  pain: 'How the piece opens, and why the reader keeps reading.',
  proof: 'The claim stands on your case or figure, not on assertion.',
  next: 'How the piece closes: one step the reader can take.',
};

/** Where a thing is stated: a closed field, NONE where nothing states it. */
export const EDITOR_STATED_IN = ['request', 'material', 'method', 'told', 'NONE'] as const;

export interface EditorInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the author's method, in their words, where the skill has one */
  readonly method: string;
  readonly told: readonly ToldAnswer[];
  /** the kind of work this request was read as (the piece route's kind), where one was read */
  readonly kind?: string | null;
}
/** One field or decision as read: stated (and where), or asked with its question. */
export interface EditorDecision { readonly kind: string; readonly stated: string | null; readonly question: Question | null; readonly why?: string; readonly from?: 'decision' | 'field' }
export interface EditorReading { readonly decisions: readonly EditorDecision[]; readonly questions: readonly Question[] }

export const EDITOR_SYSTEM = `You prepare a writer the way a good editor does before a first draft. You are shown the person's request, the material that came with it, their method where they have one, the kind of work it is where that was read, and what they told this skill before.

First, decisions: the open decisions that would change this piece's argument most, given what it is and who it is for. At most three, the most important first. A decision is open when nothing you were shown settles it: never ask what the request, the material, the method or what they told you before already decides. Ask what an expert in this kind of work would settle before writing it (for a pricing memo, which price and against what; for a reply to a customer, what is offered; for an essay, the claim it stakes), not questions of voice or form. For each:
- id: two or three lower-case words joined by hyphens naming the decision ("price-anchor", "what-is-offered").
- decides: what is to be decided, in a few words.
- ask: the question you would put to the person (one short sentence, plain words).
- options: two to four short answers they might give, each grounded in what you were shown; default: the one of them you would pick.
Name none when nothing is open.

Then, fields: five things any argument lands on. For each, say whether what you were shown states it in so many words:
- idea: the one idea the reader should leave with. A topic is not an idea: an idea takes a position.
- reader: who reads it, in what situation. An audience named alone ("engineers") is not a reader in a situation.
- pain: what the reader lives with, today, that this piece speaks to.
- proof: what shows the idea is true: a case, a figure, a source, or something the reader can try or check.
- next: the one thing the reader does after reading. "Learn more" is not a next step: a next step is a concrete action.
For each field: statedIn "request", "material", "method" or "told", with a short quote copied exactly from there that states it; or "NONE" with no quote. Something you could argue from the material is not stated: answer NONE. For NONE, also ask, options (two to four) and default, as for a decision; for a stated one, ask and default are null and options is empty.`;

const ONE = {
  type: 'object', properties: {
    statedIn: { type: 'string', enum: [...EDITOR_STATED_IN] }, quote: { type: ['string', 'null'] },
    ask: { type: ['string', 'null'] }, options: { type: 'array', items: { type: 'string' } }, default: { type: ['string', 'null'] },
  }, required: ['statedIn', 'quote', 'ask', 'options', 'default'], additionalProperties: false,
};
const DECISION = {
  type: 'object', properties: { id: { type: 'string' }, decides: { type: 'string' }, ask: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, default: { type: 'string' } },
  required: ['id', 'decides', 'ask', 'options', 'default'], additionalProperties: false,
};
export const EDITOR_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: {
    decisions: { type: 'array', items: DECISION },
    fields: { type: 'object', properties: Object.fromEntries(EDITOR_KINDS.map((k) => [k, ONE])), required: [...EDITOR_KINDS], additionalProperties: false },
  }, required: ['decisions', 'fields'], additionalProperties: false,
};

const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n);
const straight = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const same = (a: string, b: string): boolean => clip(a, 400).toLowerCase() === clip(b, 400).toLowerCase();

/** Whether a quote of eight characters or more is in the source the reader named (a form check: the words are there or not). */
export function statedIn(where: string, quote: unknown, input: EditorInput): boolean {
  const q = straight(clip(typeof quote === 'string' ? quote : '', 400)).toLowerCase();
  if (q.length < 8) return false;
  const source = where === 'request' ? input.request : where === 'material' ? input.material.map((m) => m.head).join('\n')
    : where === 'method' ? input.method : where === 'told' ? input.told.map((t) => t.answer).join('\n') : '';
  return straight(source.replace(/\s+/g, ' ')).toLowerCase().includes(q);
}

/** A decision's id as --answers names it: lower case, words joined by hyphens, never one of the five fields' own. */
export const decisionId = (raw: unknown): string => {
  const id = (typeof raw === 'string' ? raw : '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 4).join('-').slice(0, 40);
  return id && !(EDITOR_KINDS as readonly string[]).includes(id) ? id : '';
};

/** The question as asked: 2 to 4 options, one picked among them, last time's answer as the suggestion. Null when ill-formed. */
function questionOf(id: string, x: Record<string, unknown>, input: EditorInput, extra: Partial<Question>): Question | null {
  const ask = typeof x.ask === 'string' ? clip(x.ask, 200) : '';
  const options = [...new Set((Array.isArray(x.options) ? x.options : []).filter((o): o is string => typeof o === 'string' && clip(o, 160).length > 0).map((o) => clip(o, 160)))];
  const def = typeof x.default === 'string' ? options.find((o) => same(o, x.default as string)) : undefined;
  if (!ask || options.length < 2 || options.length > 4 || !def) return null;
  const told = [...input.told].reverse().find((t) => t.id === id);
  return { id, ask, options, default: told ? told.answer : def, ...(told ? { last: told.answer } : {}), ...extra };
}

export const EDITOR_QUESTIONS: Reading<EditorInput, EditorReading> = {
  id: 'editor-questions', version: '2',
  system: EDITOR_SYSTEM, schema: EDITOR_SCHEMA,
  toolName: 'emit_editor_questions', toolDescription: 'The open decisions that would change this piece\'s argument most, and for the idea, the reader, their pain, the proof and the next step: where each is stated, or the question to ask.',
  maxTokens: 1500, estimateUsd: 0.015,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.kind ? `The kind of work: ${input.kind}` : '',
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}` : 'No material came with it.',
      input.method.trim() ? `Their method:\n${input.method.slice(0, 6000)}` : '',
      input.told.length ? `What they told this skill before:\n${input.told.map((t) => `- ${t.ask} ${t.answer}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
  // An empty request asks nothing: there is no piece to prepare.
  decide(input) { return input.request.trim() ? null : { decisions: [], questions: [] }; },
  ground(raw, input) {
    const r = raw as { decisions?: unknown; fields?: Partial<Record<EditorKind, Record<string, unknown>>> } | null;
    if (!r || typeof r !== 'object') return null;
    const decisions: EditorDecision[] = [];
    // THE PIECE'S OWN DECISIONS, the most important first: each well formed, its id its own
    const seen = new Set<string>();
    for (const x of (Array.isArray(r.decisions) ? r.decisions : []) as Record<string, unknown>[]) {
      if (!x || typeof x !== 'object') continue;
      const id = decisionId(x.id);
      const about = typeof x.decides === 'string' ? clip(x.decides, 120) : '';
      if (!id || seen.has(id) || !about) continue;
      const q = questionOf(id, x, input, { about, unlocks: `What the piece decides about ${about.replace(/[.:]$/, '')}.` });
      seen.add(id);
      decisions.push(q ? { kind: id, stated: null, question: q, from: 'decision' } : { kind: id, stated: null, question: null, why: 'the question came without 2 to 4 options and one picked among them', from: 'decision' });
    }
    // THE FIVE FIELDS: stated with a quote found in its source, or asked
    const fields = r.fields && typeof r.fields === 'object' ? r.fields : {};
    for (const kind of EDITOR_KINDS) {
      const x = fields[kind];
      if (!x || typeof x !== 'object') continue;
      const where = String(x.statedIn);
      if (where !== 'NONE' && (EDITOR_STATED_IN as readonly string[]).includes(where) && statedIn(where, x.quote, input)) {
        decisions.push({ kind, stated: where, question: null, why: `stated in the ${where}`, from: 'field' }); continue;
      }
      const q = questionOf(kind, x, input, { unlocks: EDITOR_UNLOCKS[kind] });
      decisions.push(q ? { kind, stated: null, question: q, from: 'field' } : { kind, stated: null, question: null, why: 'the question came without 2 to 4 options and one picked among them', from: 'field' });
    }
    if (!decisions.length) return null;
    // WHAT IS ASKED: the piece's own decisions first; where it names none it can ask, the fields nothing states
    const asked = (from: 'decision' | 'field'): Question[] => decisions.flatMap((d) => (d.from === from && d.question ? [d.question] : []));
    const own = asked('decision'); const fallback = asked('field');
    return { decisions, questions: (own.length ? own : fallback).slice(0, EDITOR_MAX) };
  },
  floor() { return { decisions: [], questions: [] }; },
};

/** What the writer is told an answer is about: an editor kind, or one of the compiled path's kinds given with --answers. */
export const askOf = (id: string): string | null => (EDITOR_KINDS as readonly string[]).includes(id) ? EDITOR_ASK[id as EditorKind]
  : KIND_ASK[id.toUpperCase() as QuestionKind | GapKind] ?? null;

/**
 * What the writer is told: only what the person answered, in their words. Empty where nobody answered, so a run nobody
 * answers is written exactly as it would be with no question step.
 */
export function editorNote(answers: readonly { readonly id: string; readonly answer: string }[], asked: readonly Question[] = []): string {
  // a decision of this piece's own is told by what it decides; a field or a compiled-path kind by its own words
  const label = (id: string): string | null => askOf(id) ?? (() => { const q = asked.find((x) => x.id === id); return q?.about ? `${q.about.replace(/[.:]$/, '')}:` : null; })();
  const lines = answers.filter((a) => label(a.id) !== null && a.answer.trim()).map((a) => `- ${label(a.id) ?? ''} ${a.answer.trim()}`);
  return lines.length ? `Before writing, the author settled these. Write from them; they are the author's, not lines to quote:\n\n${lines.join('\n')}` : '';
}
