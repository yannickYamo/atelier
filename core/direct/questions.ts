// atelier/core/direct/questions.ts — WHAT ONLY THE PERSON KNOWS, ASKED BEFORE THE DRAFT.
//
// Voice comes from the pieces; what a piece argues comes from the person. Where the writing failed was intent: the
// thesis, the news and the business signal an author added by hand afterwards were never asked. And where the notes
// already carried the intent, the questions asked tactics instead (which point opens, which proof leads, "I" or "we"):
// choices among what was given, which are the writer's. So one reading, one call, four fields:
//   point   what the author is saying that others are not, and why now (a topic is not a point)
//   goal    what the piece must do: what the reader does or believes after, and what the author wants from it
//   record  what shows it that the material does not hold: a case, a figure, a name, news or a story of theirs
//   reader  who reads it, in what situation (an audience named alone is not a reader in a situation)
// Each is stated (with a quote code finds in its source), not needed (an answer would not change the piece), or
// asked. At most three are asked, in that order.
//
// WHAT AN ANSWER DOES, AND WHAT NO ANSWER DOES. What the person types, picks or takes with enter at a terminal reaches
// the writer as theirs: they saw the suggestion and chose it (the fewest keystrokes, by the owner's ruling of 24 Nov).
// A suggestion nobody saw (a pipe, --json, a host) is never served: a default told to a writer once came back in the
// piece as a disclaimer. The record has no suggestion: nothing read can know what the author will put on record, so
// enter there leaves it to the writer.

import type { Reading } from '../inference/reading.js';
import { cardLine, type PurposeCard } from './card.js';
import { KIND_ASK, type Question, type ToldAnswer, type QuestionKind, type GapKind } from '../loop/questions.js';

/** What decides what a piece argues, in the order they are asked. */
export const EDITOR_KINDS = ['point', 'goal', 'record', 'reader'] as const;
export type EditorKind = typeof EDITOR_KINDS[number];
/** The most questions asked before one piece. */
export const EDITOR_MAX = 3;
/** The person's own words after the questions ("anything wrong above?"): told to the writer as theirs. */
export const ALSO_ID = 'also';

/** What the writer is told an answer of each kind is about. */
export const EDITOR_ASK: Readonly<Record<EditorKind | typeof ALSO_ID, string>> = {
  point: 'What the author is saying that others are not, and why now:',
  goal: 'What the piece must do (what the reader does or believes after, and what the author wants from it):',
  record: 'What shows it, beyond the material (a case, a figure, a name, news or a story of the author\'s own):',
  reader: 'Who reads it, and the situation they read it in:',
  also: 'The author adds:',
};
/** How each field is named on the brief the person sees before the draft. */
export const EDITOR_LABEL: Readonly<Record<EditorKind, string>> = { point: 'Point', goal: 'Goal', record: 'Proof', reader: 'For' };

/** Where a thing is stated: a closed field. NONE is asked; NOT_NEEDED is neither stated nor worth the person's time. */
export const EDITOR_STATED_IN = ['request', 'material', 'method', 'card', 'told', 'NONE', 'NOT_NEEDED'] as const;

export interface EditorInput {
  readonly request: string;
  readonly material: readonly { readonly name: string; readonly head: string }[];
  /** the author's method, in their words, where the skill has one */
  readonly method: string;
  readonly told: readonly ToldAnswer[];
  /** the kind of work this request was read as (the piece route's kind), where one was read */
  readonly kind?: string | null;
  /** what this skill's work is, read at the build or written by the person (./card.ts), where there is one */
  readonly card?: PurposeCard | null;
  /** how the author writes, read from their finished pieces at the build: each habit with a sentence of theirs */
  readonly habits?: readonly { readonly text: string; readonly theirs: string }[];
}
/** One field as read: stated (where, and the quote), not needed, or asked with its question. */
export interface EditorDecision { readonly kind: string; readonly stated: string | null; readonly quote?: string; readonly question: Question | null; readonly why?: string; readonly from?: 'decision' | 'field' }
export interface EditorReading { readonly decisions: readonly EditorDecision[]; readonly questions: readonly Question[] }

export const EDITOR_SYSTEM = `You prepare a writer the way a good editor does before a first draft: you find what only the author can say about this piece, and nothing else. You are shown the person's request, the material that came with it, their method where they have one, the kind of work where that was read, what their work usually is where that was read, how they write where that was read from their finished pieces, and what they told this skill before.

Four things decide what a piece argues. For each, say where what you were shown states it in so many words:
- point: what the author is saying that others are not, and why now. A topic is not a point: a point takes a position someone could disagree with.
- goal: what the piece must do: what the reader does or believes after reading, and what the author wants from it (trust, sign-ups, hires, a decision). "Learn more" is not a goal.
- record: what shows it is true that the material does not hold: a case, a figure, a name, news or a story of the author's own that they will put on record.
- reader: who reads it, and in what situation. An audience named alone ("engineers") is not a reader in a situation.

For each: statedIn "request", "material", "method", "card" or "told", with a short quote copied exactly from there that states it. Something you could argue from the material is not stated. Where nothing states it, picture the piece under two different answers from the author: where it would come out the same, or the piece needs nothing beyond what was given (a reply, a summary, an update of facts given), statedIn "NOT_NEEDED". Otherwise statedIn "NONE", with the question you would put to the author: one short sentence in plain words, about this piece, in the words this kind of work uses (for a requirements document the point is the problem and the goal is how success is measured). For point, goal and reader also give two to four short options grounded in what you were shown, and the default: the one of them you would pick. For the record give no options and no default: nothing you were shown can tell what the author will put on record.

Never ask for a choice among things already given (which point carries the piece, which proof leads, how it opens or closes, "I" or "we", the order, the length): those are the writer's. Never ask how it should sound: their pieces settle that.`;

const ONE = {
  type: 'object', properties: {
    statedIn: { type: 'string', enum: [...EDITOR_STATED_IN] }, quote: { type: ['string', 'null'] },
    ask: { type: ['string', 'null'] }, options: { type: 'array', items: { type: 'string' } }, default: { type: ['string', 'null'] },
  }, required: ['statedIn', 'quote', 'ask', 'options', 'default'], additionalProperties: false,
};
export const EDITOR_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: {
    fields: { type: 'object', properties: Object.fromEntries(EDITOR_KINDS.map((k) => [k, ONE])), required: [...EDITOR_KINDS], additionalProperties: false },
  }, required: ['fields'], additionalProperties: false,
};

const clip = (s: string, n: number): string => s.replace(/\s+/g, ' ').trim().slice(0, n);
const straight = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Whether a quote of eight characters or more is in the source the reader named (a form check: the words are there or not). */
export function statedIn(where: string, quote: unknown, input: EditorInput): boolean {
  const q = straight(clip(typeof quote === 'string' ? quote : '', 400)).toLowerCase();
  if (q.length < 8) return false;
  const source = where === 'request' ? input.request : where === 'material' ? input.material.map((m) => m.head).join('\n')
    : where === 'method' ? input.method : where === 'card' ? (input.card ? cardLine(input.card) : '')
      : where === 'told' ? input.told.map((t) => t.answer).join('\n') : '';
  return straight(source.replace(/\s+/g, ' ')).toLowerCase().includes(q);
}

/** The question as asked, with the suggestion enter takes (one of its options; none for the record). Null when ill-formed. */
function questionOf(kind: EditorKind, x: Record<string, unknown>): Question | null {
  const ask = typeof x.ask === 'string' ? clip(x.ask, 200) : '';
  const options = kind === 'record' ? [] : [...new Set((Array.isArray(x.options) ? x.options : []).filter((o): o is string => typeof o === 'string' && clip(o, 160).length > 0).map((o) => clip(o, 160)))].slice(0, 4);
  if (!ask || (kind !== 'record' && options.length < 2)) return null;
  const def = typeof x.default === 'string' ? options.find((o) => o.toLowerCase() === clip(x.default as string, 160).toLowerCase()) : undefined;
  return { id: kind, ask, options, default: def ?? options[0] ?? '' };
}

export const EDITOR_QUESTIONS: Reading<EditorInput, EditorReading> = {
  id: 'editor-questions', version: '6',
  system: EDITOR_SYSTEM, schema: EDITOR_SCHEMA,
  toolName: 'emit_editor_questions', toolDescription: 'For the point, the goal, what may be put on record and the reader: where each is stated, whether it is needed, or the question to ask the author.',
  maxTokens: 4000, estimateUsd: 0.03,
  prompt(input) {
    return [`The request:\n${input.request.slice(0, 4000)}`,
      input.kind ? `The kind of work: ${input.kind}` : '',
      input.card ? `${input.card.by === 'you' ? 'What the author says their work is, in their words' : 'What this author\'s work is, read from all their pieces'} (it holds for this piece where the request does not say otherwise): ${cardLine(input.card)}` : '',
      input.material.length ? `The material:\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}` : 'No material came with it.',
      input.method.trim() ? `Their method:\n${input.method.slice(0, 6000)}` : '',
      input.habits?.length ? `How this author writes, read from their finished pieces (each with a sentence of theirs):\n${input.habits.map((h) => `- ${h.text} (as in "${h.theirs}")`).join('\n')}` : '',
      input.told.length ? `What they told this skill before:\n${input.told.map((t) => `- ${t.ask} ${t.answer}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  },
  // An empty request asks nothing: there is no piece to prepare.
  decide(input) { return input.request.trim() ? null : { decisions: [], questions: [] }; },
  ground(raw, input) {
    const r = raw as { fields?: Partial<Record<EditorKind, Record<string, unknown>>> } | null;
    if (!r || typeof r !== 'object' || !r.fields || typeof r.fields !== 'object') return null;
    const decisions: EditorDecision[] = [];
    for (const kind of EDITOR_KINDS) {
      const x = r.fields[kind];
      if (!x || typeof x !== 'object') continue;
      const where = String(x.statedIn);
      if (where === 'NOT_NEEDED') { decisions.push({ kind, stated: null, question: null, why: 'not needed for this piece', from: 'field' }); continue; }
      if (where !== 'NONE' && (EDITOR_STATED_IN as readonly string[]).includes(where) && statedIn(where, x.quote, input)) {
        decisions.push({ kind, stated: where, quote: clip(String(x.quote), 160), question: null, why: `stated in the ${where}`, from: 'field' }); continue;
      }
      const q = questionOf(kind, x);
      decisions.push(q ? { kind, stated: null, question: q, from: 'field' } : { kind, stated: null, question: null, why: 'the question came without two to four options', from: 'field' });
    }
    if (!decisions.length) return null;
    return { decisions, questions: decisions.flatMap((d) => (d.question ? [d.question] : [])).slice(0, EDITOR_MAX) };
  },
  floor() { return { decisions: [], questions: [] }; },
};

/** What the writer is told an answer is about: an editor kind, or one of the compiled path's kinds given with --answers. */
export const askOf = (id: string): string | null => (EDITOR_KINDS as readonly string[]).includes(id) || id === ALSO_ID ? EDITOR_ASK[id as keyof typeof EDITOR_ASK]
  : KIND_ASK[id.toUpperCase() as QuestionKind | GapKind] ?? null;

/** WHAT THE AUTHOR WANTS LEADS WHAT THE WRITER READS: a piece given every point in order recited them in order. */
export const INTENT_HEAD = 'What the author wants from this piece, in their words. Build the piece on it; these are the author\'s, not lines to quote. The voice comes from the author\'s pieces; what the piece argues comes from these answers, then the method, then the material. The material is what the piece may use, not a list to cover.';

/**
 * What the writer is told: only what the person answered, in their words. Empty where nobody answered, so a run nobody
 * answers is written exactly as it would be with no question step.
 */
export function editorNote(answers: readonly { readonly id: string; readonly answer: string }[], asked: readonly (Pick<Question, 'id' | 'about'> & { readonly ask?: string })[] = []): string {
  // a decision of this piece's own is told by what it decides, with the question asked: an option is worded against it
  const label = (id: string): string | null => askOf(id) ?? (() => { const q = asked.find((x) => x.id === id); return q?.about ? `${q.about.replace(/[.:]$/, '')}${q.ask ? ` (asked: "${q.ask}")` : ''}:` : null; })();
  const lines = answers.filter((a) => label(a.id) !== null && a.answer.trim()).map((a) => `- ${label(a.id) ?? ''} ${a.answer.trim()}`);
  return lines.length ? `${INTENT_HEAD}\n\n${lines.join('\n')}` : '';
}
