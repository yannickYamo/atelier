// atelier/core/observers/work-form.ts — WHAT FORM THE WORK TAKES: A REPLY IN A CONVERSATION, OR A DOCUMENT.
//
// The form decides how a skill is compiled and run. Replies get the voice of someone answering (give what was
// asked first, state assumptions, name the check), their length follows the request, and specifics are listed for
// the reader rather than cut. Documents keep the author's shape and length and the method's sections. For a long
// time the form was read off the skill's NAME by a word pattern (core/observers/formats.ts, `isReplyWork`): "code
// review" matched "reply work", and a skill for sectioned review documents was served a chat assistant's voice no
// example of the author's carried. The name is the least of the evidence. The examples are the most of it.
//
// So the form is a reading (core/inference/reading.ts): code decides where the examples are decisive (every one
// of them sectioned under headings is a document; nothing in a conversation looks like that), a small model reads
// the examples otherwise and quotes what shows the form in each, code grounds the quotes and takes the majority,
// and the word pattern on the name is the floor when no model is set up. Read once at build, stored with the skill
// (core/state/store.ts, `setWorkForm`), carried with the voice to the renderer, and never read again unless asked.

import type { Reading } from '../inference/reading.js';
import { quoteIsReal } from '../taste/reader.js';
import { isReplyWork } from './formats.js';

export type WorkForm = 'REPLY' | 'DOCUMENT';

export interface WorkFormInput {
  /** what the owner said the skill is for: the floor's whole evidence, the reading's least */
  readonly workType: string;
  /** the author's pieces, with the request each answered where known */
  readonly examples: readonly { readonly text: string; readonly request: string | null }[];
  /** the owner's method note, when there is one */
  readonly method: string | null;
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

export const WORK_FORM_SYSTEM = `You read examples of one person's work and say what form it takes.

A REPLY is a turn in a conversation: an answer to someone who asked, read once in the flow of a chat, a support thread, a code-review comment thread or a ticket. It speaks to that person, it is shaped by their question, and it ends when the question is answered.

A DOCUMENT is a self-standing piece: an article, an essay, a post, an explainer, a report, a review written up under its own sections, a contract, a memo, a plan. It has a shape of its own (a title, sections, a template, a closing part) that does not come from a question, and it is read apart from any conversation. A piece written to a request is still a document when it addresses no particular person and would read the same published on its own: an explainer commissioned by a request is a document; a message back to the person who asked is a reply.

For each example, say its form and copy a short quote (under 25 words, exactly as written) that shows it: a greeting or an address to the person, a reference to their question, a section heading, a title, a closing formula. Then give the form of the work as a whole. Judge the pieces, not the name of the work.`;

export const WORK_FORM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    examples: { type: 'array', items: { type: 'object', properties: {
      example: { type: 'number' }, form: { type: 'string', enum: ['REPLY', 'DOCUMENT'] }, quote: { type: 'string' } },
      required: ['example', 'form', 'quote'], additionalProperties: false } },
    form: { type: 'string', enum: ['REPLY', 'DOCUMENT'] },
  },
  required: ['examples', 'form'], additionalProperties: false,
};

export const WORK_FORM: Reading<WorkFormInput, WorkForm> = {
  id: 'work-form', version: '2',
  system: WORK_FORM_SYSTEM, schema: WORK_FORM_SCHEMA,
  toolName: 'emit_work_form', toolDescription: 'The form of each example and of the work as a whole, each with a quote that shows it.',
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
    for (const x of Array.isArray(r.examples) ? r.examples as { example?: unknown; form?: unknown; quote?: unknown }[] : []) {
      const i = typeof x.example === 'number' && Number.isInteger(x.example) ? x.example - 1 : -1;
      if (i < 0 || i >= shown.length || seen.has(i)) continue;
      if (x.form !== 'REPLY' && x.form !== 'DOCUMENT') continue;
      // A quote must be in the piece (or its request): a finding about a piece the reader did not read is no finding.
      const where = `${shown[i].request ?? ''}\n${shown[i].text}`;
      if (typeof x.quote !== 'string' || !quoteIsReal(x.quote, where)) continue;
      seen.add(i); forms.push(x.form);
    }
    if (shown.length) {
      // Grounded on more than half the examples, the majority decides; a tie or too few grounded is no reading.
      if (forms.length * 2 <= shown.length) return null;
      const replies = forms.filter((f) => f === 'REPLY').length;
      if (replies * 2 === forms.length) return null;
      return replies * 2 > forms.length ? 'REPLY' : 'DOCUMENT';
    }
    return r.form === 'REPLY' || r.form === 'DOCUMENT' ? r.form : null;
  },
  floor(input) { return isReplyWork(input.workType) ? 'REPLY' : 'DOCUMENT'; },
};
