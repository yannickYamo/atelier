// atelier/core/direct/questions.ts — WHAT AN EDITOR ASKS BEFORE THE DRAFT: THE ONE IDEA, THE READER'S PAIN, THE PROOF.
//
// The direct writer had no question step at all, and the compiled path's asks only for missing facts and positions
// (the angle, what may be named, news, emphasis): on notes that covered those, it asked nothing, and what the person
// then fixed by hand was the argument itself. An editor asks three other things before a piece is written, the ones an
// argument lands on: what the reader lives with that this piece speaks to (their pain), the one idea they should leave
// with, and what shows it (a case, a figure, or something the reader can try). Those are asked here.
//
// THE READING (house pattern, ../inference/reading.ts). For each of the three, the reader says where the request, the
// material, the author's method or what they told this skill before states it in so many words, with a quote; code holds
// the quote to that source, so only a real absence is asked. A point the reader could argue from the material is not a
// stated one. For an absence it writes the question, two to four options grounded in what was given, and the one it
// would pick. With no model, or nothing grounded, nothing is asked.
//
// WHAT AN ANSWER DOES, AND WHAT NO ANSWER DOES. Only what the person answers reaches the writer, in their words. A
// question nobody answers (a pipe, --json, an agent) changes nothing in the piece: the writer decides as it would with
// your posts pasted, and the question comes back with its options for the next run (`--answers`). A suggested option is
// never served as though it were the person's: a default told to a writer once came back in the piece as a disclaimer.

import type { Reading } from '../inference/reading.js';
import { KIND_ASK, type Question, type ToldAnswer, type QuestionKind, type GapKind } from '../loop/questions.js';

/** The three things an editor asks, in the order they are asked. */
export const EDITOR_KINDS = ['idea', 'pain', 'proof'] as const;
export type EditorKind = typeof EDITOR_KINDS[number];

/** What the writer is told an answer of each kind is about. */
export const EDITOR_ASK: Readonly<Record<EditorKind, string>> = {
  idea: 'The one idea the reader should leave with:',
  pain: 'What the reader lives with that this piece speaks to:',
  proof: 'What shows it (a case, a figure, or something the reader can try):',
};
/** What answering each unlocks, said once with the question. */
export const EDITOR_UNLOCKS: Readonly<Record<EditorKind, string>> = {
  idea: 'The line the whole piece argues toward, and how it ends.',
  pain: 'How the piece opens, and why the reader keeps reading.',
  proof: 'The claim stands on your case or figure, not on assertion.',
};

/** Where a thing is stated: a closed field, NONE where nothing states it. */
export const EDITOR_STATED_IN = ['request', 'material', 'method', 'told', 'NONE'] as const;

export interface EditorInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the author's method, in their words, where the skill has one */
  readonly method: string;
  readonly told: readonly ToldAnswer[];
}
/** One of the three as read: stated (and where), or asked with its question. */
export interface EditorDecision { readonly kind: EditorKind; readonly stated: string | null; readonly question: Question | null; readonly why?: string }
export interface EditorReading { readonly decisions: readonly EditorDecision[]; readonly questions: readonly Question[] }

export const EDITOR_SYSTEM = `You prepare a writer the way a good editor does before a first draft. You are shown the person's request, the material that came with it, their method where they have one, and what they told this skill before.

An argument lands on three things. For each of them, say whether what you were shown states it in so many words:
- idea: the one idea the reader should leave the piece with.
- pain: what the reader lives with, today, that this piece speaks to.
- proof: what shows the idea is true: a case, a figure, a source, or something the reader can try or check.

For each:
- statedIn: "request", "material", "method" or "told" (what they told this skill before), with a short quote copied exactly from there that states it; or "NONE" with no quote. Something you could argue from the material is not stated: answer NONE. A topic is not an idea; an audience is not a pain.
- For NONE, also: ask, the question you would put to the person (one short sentence, plain words); options, two to four short answers they might give, each grounded in what you were shown; and default, the one of them you would pick.
For a stated one, ask and default are null and options is empty.`;

const ONE = {
  type: 'object', properties: {
    statedIn: { type: 'string', enum: [...EDITOR_STATED_IN] }, quote: { type: ['string', 'null'] },
    ask: { type: ['string', 'null'] }, options: { type: 'array', items: { type: 'string' } }, default: { type: ['string', 'null'] },
  }, required: ['statedIn', 'quote', 'ask', 'options', 'default'], additionalProperties: false,
};
export const EDITOR_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: { idea: ONE, pain: ONE, proof: ONE }, required: [...EDITOR_KINDS], additionalProperties: false,
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

export const EDITOR_QUESTIONS: Reading<EditorInput, EditorReading> = {
  id: 'editor-questions', version: '1',
  system: EDITOR_SYSTEM, schema: EDITOR_SCHEMA,
  toolName: 'emit_editor_questions', toolDescription: 'For the idea, the reader\'s pain and the proof: where each is stated, or the question to ask.',
  maxTokens: 1000, estimateUsd: 0.01,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}` : 'No material came with it.',
      input.method.trim() ? `Their method:\n${input.method.slice(0, 6000)}` : '',
      input.told.length ? `What they told this skill before:\n${input.told.map((t) => `- ${t.ask} ${t.answer}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
  // An empty request asks nothing: there is no piece to prepare.
  decide(input) { return input.request.trim() ? null : { decisions: [], questions: [] }; },
  ground(raw, input) {
    const r = raw as Partial<Record<EditorKind, Record<string, unknown>>> | null;
    if (!r || typeof r !== 'object') return null;
    const decisions: EditorDecision[] = [];
    for (const kind of EDITOR_KINDS) {
      const x = r[kind];
      if (!x || typeof x !== 'object') continue;
      const where = String(x.statedIn);
      if (where !== 'NONE' && (EDITOR_STATED_IN as readonly string[]).includes(where) && statedIn(where, x.quote, input)) {
        decisions.push({ kind, stated: where, question: null, why: `stated in the ${where}` }); continue;
      }
      const ask = typeof x.ask === 'string' ? clip(x.ask, 200) : '';
      const options = [...new Set((Array.isArray(x.options) ? x.options : []).filter((o): o is string => typeof o === 'string' && clip(o, 160).length > 0).map((o) => clip(o, 160)))];
      const def = typeof x.default === 'string' ? options.find((o) => same(o, x.default as string)) : undefined;
      if (!ask || options.length < 2 || options.length > 4 || !def) { decisions.push({ kind, stated: null, question: null, why: 'the question came without 2 to 4 options and one picked among them' }); continue; }
      const told = [...input.told].reverse().find((t) => t.id === kind);
      decisions.push({ kind, stated: null, question: { id: kind, ask, options, default: told ? told.answer : def, ...(told ? { last: told.answer } : {}), unlocks: EDITOR_UNLOCKS[kind] } });
    }
    if (!decisions.length) return null;
    return { decisions, questions: decisions.flatMap((d) => (d.question ? [d.question] : [])) };
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
export function editorNote(answers: readonly { readonly id: string; readonly answer: string }[]): string {
  const lines = answers.filter((a) => askOf(a.id) !== null && a.answer.trim()).map((a) => `- ${askOf(a.id) ?? ''} ${a.answer.trim()}`);
  return lines.length ? `Before writing, the author settled these. Write from them; they are the author's, not lines to quote:\n\n${lines.join('\n')}` : '';
}
