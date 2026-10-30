// atelier/core/observers/work-form.ts — WHAT FORM THE WORK TAKES: A REPLY IN A CONVERSATION, OR A DOCUMENT.
//
// The form decides how a skill is compiled and run. Replies get the voice of someone answering (give what was
// asked first, state assumptions, name the check), their length follows the request, and specifics are listed for
// the reader rather than cut. Documents keep the author's shape and length and the method's sections. For a long
// time the form was read off the skill's NAME by a word pattern, since removed: "code
// review" matched "reply work", and a skill for sectioned review documents was served a chat assistant's voice no
// example of the author's carried. The name is the least of the evidence. The examples are the most of it.
//
// So the form is a reading (core/inference/reading.ts): code decides where the examples are decisive (every one
// of them sectioned under headings is a document; nothing in a conversation looks like that), a small model reads
// the examples otherwise and quotes what shows the form in each, code grounds the quotes and takes the majority,
// and with no model, or no grounded reading, the floor is a document: it reads no words, so a name never makes a reply. Read once at build, stored with the skill
// (core/state/store.ts, `setWorkForm`), carried with the voice to the renderer, and never read again unless asked.

import type { Reading } from '../inference/reading.js';
import { quoteIsReal } from '../taste/reader.js';

export type WorkForm = 'REPLY' | 'DOCUMENT';

export interface WorkFormInput {
  /** what the owner said the skill is for: the reading's least evidence */
  readonly workType: string;
  /** the author's pieces, with the request each answered where known */
  readonly examples: readonly { readonly text: string; readonly request: string | null }[];
  /** the owner's method note, when there is one */
  readonly method: string | null;
  /**
   * The form the owner's own choices already name, where they name one: a class of work that answers people
   * (`--class assistant-reply`, which `atelier new --mode respond` sets). The floor where nothing read the examples.
   */
  readonly declared?: WorkForm | null;
}

/** Headings in a piece: ATX only, outside code fences. */
export function headingCount(text: string): number {
  let fenced = false; let n = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (!fenced && /^#{1,6}\s+\S/.test(line)) n += 1;
  }
  return n;
}

/** How many examples are shown to the reader, and how much of each: enough to see the form, never the whole corpus. */
const SHOWN = 8; const CHARS = 1800;

export const WORK_FORM_SYSTEM = `You read examples of one person's work and say, for each, whether it answers a particular person who wrote to its author first.

A REPLY answers someone: a turn in a conversation, written back to a person who asked or wrote first, in a chat, a support thread, a code-review comment thread or a ticket. It speaks to that person and is shaped by what they said.

Anything else is not a reply: an article, an essay, a post to followers, an announcement, an explainer, a report, a memo, a plan. A post on a social network written to whoever reads it answers nobody in particular, however short or conversational it is. A piece written to a request is still not a reply when it addresses no particular person and would read the same published on its own.

For each example answer one of two:
- "PERSON_WHO_ASKED": it answers a particular person who wrote first. Copy a short quote (under 25 words, exactly as written) that shows it: an address to that person, or a reference to what they asked or said.
- "NONE": nobody in particular asked; it stands on its own. No quote is needed.

When unsure, answer NONE. Judge the pieces, not the name of the work. With no examples, answer from the description in "form".`;

export const WORK_FORM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    examples: { type: 'array', items: { type: 'object', properties: {
      example: { type: 'number' }, answers: { type: 'string', enum: ['PERSON_WHO_ASKED', 'NONE'] }, quote: { type: ['string', 'null'] } },
      required: ['example', 'answers', 'quote'], additionalProperties: false } },
    form: { type: 'string', enum: ['REPLY', 'DOCUMENT', 'NONE'] },
  },
  required: ['examples', 'form'], additionalProperties: false,
};

export const WORK_FORM: Reading<WorkFormInput, WorkForm> = {
  id: 'work-form', version: '3',
  system: WORK_FORM_SYSTEM, schema: WORK_FORM_SCHEMA,
  toolName: 'emit_work_form', toolDescription: 'For each example, whether it answers a particular person who wrote first (with a quote that shows it), or NONE.',
  maxTokens: 1200, estimateUsd: 0.02,
  prompt(input) {
    const shown = input.examples.slice(0, SHOWN);
    const head = `The work is described as: ${input.workType || '(not described)'}.${input.method ? `\n\nThe person's method note:\n<method>\n${input.method.slice(0, CHARS)}\n</method>` : ''}`;
    if (!shown.length) return `${head}\n\nNo examples are given: judge from the description and the method alone, with an empty examples list.`;
    return `${head}\n\n${shown.map((e, i) => `<example n="${i + 1}">\n${e.request ? `<request>\n${e.request.slice(0, 400)}\n</request>\n` : ''}<piece>\n${e.text.slice(0, CHARS)}\n</piece>\n</example>`).join('\n\n')}`;
  },
  // DECISIVE EVIDENCE: every example sectioned under two or more headings is a document. Nothing said in a
  // conversation looks like that, whatever the work is called; one such piece is enough.
  decide(input) {
    if (input.examples.length >= 1 && input.examples.every((e) => headingCount(e.text) >= 2)) return 'DOCUMENT';
    return null;
  },
  ground(raw, input) {
    const r = raw as { examples?: unknown; form?: unknown } | null;
    if (!r || typeof r !== 'object') return null;
    const shown = input.examples.slice(0, SHOWN);
    const forms: WorkForm[] = [];
    const seen = new Set<number>();
    // A CLOSED CHOICE WITH NONE ALLOWED. A piece is a reply only where the reader names the person it answers, by a quote
    // that is in the piece (or its request); NONE needs no quote and reads as a piece that stands on its own. A reply
    // claimed with no grounded quote is no finding: a post to followers was read as a turn in a conversation.
    for (const x of Array.isArray(r.examples) ? r.examples as { example?: unknown; answers?: unknown; quote?: unknown }[] : []) {
      const i = typeof x.example === 'number' && Number.isInteger(x.example) ? x.example - 1 : -1;
      if (i < 0 || i >= shown.length || seen.has(i)) continue;
      if (x.answers === 'NONE') { seen.add(i); forms.push('DOCUMENT'); continue; }
      if (x.answers !== 'PERSON_WHO_ASKED') continue;
      const where = `${shown[i].request ?? ''}\n${shown[i].text}`;
      if (typeof x.quote !== 'string' || !quoteIsReal(x.quote, where)) continue;
      seen.add(i); forms.push('REPLY');
    }
    if (shown.length) {
      // Read on more than half the examples, a majority of replies decides; a tie or too few read is no reading.
      if (forms.length * 2 <= shown.length) return null;
      const replies = forms.filter((f) => f === 'REPLY').length;
      if (replies * 2 === forms.length) return null;
      return replies * 2 > forms.length ? 'REPLY' : 'DOCUMENT';
    }
    return r.form === 'REPLY' || r.form === 'DOCUMENT' ? r.form : null;
  },
  // The floor reads no words: the form the owner's choices name, or a document, the form that keeps the author's own shape.
  floor(input) { return input.declared ?? 'DOCUMENT'; },
};
