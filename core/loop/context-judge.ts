// atelier/core/loop/context-judge.ts — QUESTIONS THAT NEED CONTEXT, ASKED OF A SMALL MODEL.
//
// Some decisions in the loop turn on reading, not on words: whether "If it can't, we split it." still
// makes sense once the sentence before it is gone; whether a request states its own format ("return only
// the code block", or any of the hundred ways to say it); whether a sentence of an answer claims the
// assistant did or saw something ("Checked this against the failing case…"). Word lists caught some
// phrasings and missed the rest. A small model reads them; code decides, as everywhere in Atelier:
//
//   - every answer is validated in code: a quoted phrase must be in the text, an index must exist, an
//     unknown label is dropped; what fails validation is treated as "no finding";
//   - temperature 0, one call per question per text, cached for the run;
//   - FAIL-OPEN FLOOR: no key, no model, an error or an unreadable answer falls back to the word patterns
//     the loop used before (`null` from every method), never to "no check at all".
//
// Built and tested; not yet measured the way the claim reader is. Its findings only redraft a sentence,
// waive a presentation rule for one run, or mark an answer's own work claims, and each is reported.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { createHash } from 'node:crypto';

export interface RequestIntent {
  /** the request's own words that state its output format, verbatim, or null */
  readonly format: string | null;
  readonly length: 'LONG' | 'SHORT' | null;
  /**
   * The request's own words naming the KIND OF DOCUMENT it asks for ("white paper", "blog post"), verbatim; null
   * when it names none. Undefined when the judge did not say: the word table decides then (../voice/register.ts).
   */
  readonly document?: string | null;
}

/** One thing a request explicitly asks for, and whether the reply gives it. `covered` is null when the reader said yes without a real quote. */
export interface AskedPart { readonly words: string; readonly covered: boolean | null; readonly where?: string }
export interface RequestCoverage { readonly parts: readonly AskedPart[] }

export interface ContextJudge {
  /**
   * WHAT THE REQUEST ASKS FOR, AND WHETHER THE REPLY GIVES EACH PART. "Walk me through PKCE, I want a detailed
   * explanation" met a skill that had learned short answers, and came back condensed; "plan the migration with
   * rollback points" came back without the rollback points. Whether a reply covers what was asked is a reading.
   * Each part must be quoted from the request, and a part marked covered must quote the reply. Null when the judge
   * could not answer. Optional: a judge that cannot read coverage leaves the run as it was.
   */
  covers?(task: string, output: string): Promise<RequestCoverage | null>;
  /** What the request itself asks of the output's form. Null when the judge could not answer. */
  requestIntent(task: string): Promise<RequestIntent | null>;
  /** For each pair, whether `next` still reads on its own once `removed` is gone. Null when it could not answer. */
  standsAlone(pairs: readonly { removed: string; next: string }[]): Promise<boolean[] | null>;
  /** Read an answer once: which of its sentences claim work the assistant did or a result it saw. */
  readAnswer(sentences: readonly string[]): Promise<void>;
  /** The indexes `readAnswer` found, or null when it was not read or could not answer. */
  workClaims(sentences: readonly string[]): ReadonlySet<number> | null;
}

const INTENT_SYSTEM = `You read a request someone made to a writing or coding assistant, and say only whether the request itself dictates the FORM of the reply.

- format: if the request explicitly constrains the reply's shape or content type (for example "return only the code block", "just the number", "answer yes or no", "JSON only", "no explanation", "one line"), copy those exact words from the request. Otherwise null.
- length: "LONG" if it explicitly asks for detail or depth, "SHORT" if it explicitly asks for brevity, otherwise null.

- document: if the request names the KIND OF DOCUMENT to be written (for example "blog post", "white paper", "memo", "speech", "contract", "email", "press release"), copy those exact words from the request; otherwise null. Only the document being asked for: not one the request mentions as its subject or its source ("a post about our quarterly report" asks for a post), and not a verb ("report the bug" names no document).

Judge only what the request says in so many words. Do not infer a format or a document from the topic.`;
const INTENT_SCHEMA = { type: 'object', properties: {
  format: { type: ['string', 'null'] }, length: { type: ['string', 'null'], enum: ['LONG', 'SHORT', null] }, document: { type: ['string', 'null'] } },
  required: ['format', 'length', 'document'], additionalProperties: false };

const ALONE_SYSTEM = `A sentence is being removed from a text. For each numbered pair you get the removed sentence and the sentence that followed it. Say whether the following sentence still makes sense on its own once the removed one is gone: false when it points back at the removed one (a pronoun, "this", "either", "if it can't", a reply to it) so a reader would be lost; true when it stands alone.`;
const ALONE_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object',
  properties: { pair: { type: 'number' }, standsAlone: { type: 'boolean' } }, required: ['pair', 'standsAlone'], additionalProperties: false } } },
  required: ['verdicts'], additionalProperties: false };

const WORK_SYSTEM = `You read an assistant's answer, sentence by sentence. Mark each sentence that claims the ASSISTANT itself did, ran, checked, tested, fixed, changed or observed something, or reports a result or progress figure from the user's system (rows written, time taken, a test now passing, a status code returned). Do not mark instructions to the user ("run the tests"), general knowledge ("PKCE stops a stolen code from being redeemed"), or plans ("I would add a header").`;
const WORK_SCHEMA = { type: 'object', properties: { claims: { type: 'array', items: { type: 'number' } } },
  required: ['claims'], additionalProperties: false };

export const COVER_SYSTEM = `You get a request and the reply to it. List each distinct thing the request explicitly asks the reply to contain, explain, compare, plan or do, quoting the request's own words for it (a few words each; at most eight parts; a plain question is one part). An instruction about form ("return only the code", "in one line") is not a part.

For each part say whether the reply gives it:
- covered true, with a short quote copied exactly from the reply where it does;
- covered false, when the reply does not give it, gives it only in passing where the request asked for detail, or hands it back to the person.

Giving it means the content is there, not that the word appears. Judge only what the request asks for in so many words.`;
const COVER_SCHEMA = { type: 'object', properties: { parts: { type: 'array', items: { type: 'object',
  properties: { words: { type: 'string' }, covered: { type: 'boolean' }, where: { type: ['string', 'null'] } }, required: ['words', 'covered', 'where'], additionalProperties: false } } },
  required: ['parts'], additionalProperties: false };

const squash = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
/** The parts of a model's answer that quote the request; a "covered" with no real quote from the reply is unclear, never covered. */
export function coverageOf(task: string, output: string, raw: unknown): RequestCoverage | null {
  const list = (raw as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(list)) return null;
  const t = squash(task); const o = squash(output);
  const parts: AskedPart[] = [];
  for (const x of list as { words?: unknown; covered?: unknown; where?: unknown }[]) {
    const words = typeof x.words === 'string' ? x.words.trim() : '';
    if (words.length < 3 || !t.includes(squash(words)) || typeof x.covered !== 'boolean' || parts.some((p) => squash(p.words) === squash(words))) continue;
    const where = typeof x.where === 'string' && x.where.trim().length >= 3 && o.includes(squash(x.where)) ? x.where.trim() : null;
    parts.push(x.covered ? (where ? { words, covered: true, where } : { words, covered: null }) : { words, covered: false });
    if (parts.length === 8) break;
  }
  return { parts };
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** A judge backed by a small model. Every failure is a null, and the caller falls back to its patterns. */
export function modelJudge(client: InferenceClient, budget: Budget): ContextJudge {
  const intents = new Map<string, RequestIntent | null>();
  const answers = new Map<string, ReadonlySet<number> | null>();
  const covered = new Map<string, RequestCoverage | null>();
  const ask = async (system: string, user: string, tool: string, schema: Record<string, unknown>): Promise<unknown> => {
    try {
      const res = await spend(budget, 0.005, async () => {
        const x = await client.complete({ stableBlock: system, variableBlock: '', userMessage: user, toolName: tool,
          toolDescription: 'Return the judgement.', schema, maxTokens: 800, temperature: 0 });
        return { value: x, cost: x.cost, usage: x };
      }, 'context judge');
      return res.json;
    } catch { return null; }
  };
  return {
    async requestIntent(task) {
      const k = sha(task);
      if (intents.has(k)) return intents.get(k) ?? null;
      const raw = await ask(INTENT_SYSTEM, `<request>\n${task}\n</request>`, 'emit_intent', INTENT_SCHEMA) as { format?: unknown; length?: unknown; document?: unknown } | null;
      // Validated: a format must be the request's own words; a length must be one of the two labels.
      const format = typeof raw?.format === 'string' && raw.format.trim() && task.toLowerCase().includes(raw.format.trim().toLowerCase()) ? raw.format.trim() : null;
      const length: RequestIntent['length'] = raw?.length === 'LONG' ? 'LONG' : raw?.length === 'SHORT' ? 'SHORT' : null;
      // A document type must be the request's own words too: the reading is of what was declared, never a guess.
      // Absent from the answer, or words the request does not hold, it stays undefined and the word table decides.
      const said = raw?.document;
      const document = said === null ? null
        : typeof said === 'string' && said.trim() && task.toLowerCase().includes(said.trim().toLowerCase()) ? said.trim() : undefined;
      const out: RequestIntent | null = raw ? { format, length, ...(document === undefined ? {} : { document }) } : null;
      intents.set(k, out);
      return out;
    },
    async standsAlone(pairs) {
      if (!pairs.length) return [];
      const user = pairs.map((p, i) => `PAIR ${i + 1}\nremoved: ${p.removed}\nfollowing: ${p.next}`).join('\n\n');
      const raw = await ask(ALONE_SYSTEM, user, 'emit_verdicts', ALONE_SCHEMA) as { verdicts?: unknown } | null;
      if (!Array.isArray(raw?.verdicts)) return null;
      const out = pairs.map(() => true);
      for (const v of raw.verdicts as { pair?: unknown; standsAlone?: unknown }[]) {
        if (typeof v.pair === 'number' && Number.isInteger(v.pair) && v.pair >= 1 && v.pair <= pairs.length && typeof v.standsAlone === 'boolean') out[v.pair - 1] = v.standsAlone;
      }
      return out;
    },
    async readAnswer(sentences) {
      const k = sha(sentences.join('\n'));
      if (answers.has(k) || !sentences.length) return;
      const raw = await ask(WORK_SYSTEM, sentences.map((s, i) => `[${i + 1}] ${s}`).join('\n'), 'emit_claims', WORK_SCHEMA) as { claims?: unknown } | null;
      answers.set(k, Array.isArray(raw?.claims)
        ? new Set((raw.claims as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= sentences.length).map((n) => n - 1))
        : null);
    },
    workClaims(sentences) { return answers.get(sha(sentences.join('\n'))) ?? null; },
    async covers(task, output) {
      if (!task.trim() || !output.trim()) return null;
      // One reading per text for the run: the panel reads the delivered text the loop already read.
      const k = sha(`${task}\u0000${output}`);
      if (covered.has(k)) return covered.get(k) ?? null;
      const out = coverageOf(task, output, await ask(COVER_SYSTEM, `<request>\n${task}\n</request>\n\n<reply>\n${output}\n</reply>`, 'emit_coverage', COVER_SCHEMA));
      covered.set(k, out);
      return out;
    },
  };
}
