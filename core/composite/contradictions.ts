// atelier/core/composite/contradictions.ts — THE FINAL INSTRUCTIONS, READ ONCE BY A MODEL FOR PAIRS THAT CANNOT BOTH BE FOLLOWED.
//
// The trait table and the final guard (./traits.ts, ./selection.ts) find contradictions by their words: a subject one
// rule bans and another asks for, two values of one question, a number on a counted subject. Words can say the same
// thing in ways no keyword list holds ("write as a column of crisp fragments" against "every sentence earns its
// subordinate clause"). So when a model is set up, the rules that will instruct, after the guard, are given to it once,
// numbered, each with its author, and it names every pair that cannot both be followed in one piece, with a reason
// quoting both.
//
// What it returns only ASKS. Every pair the person did not answer "both" becomes an open question on the composite
// screen (neither side instructs until they answer), recorded as "read by the model at build". It never resolves a
// conflict, never sets a rule aside on its own, and never touches how an output is judged. One call per list of
// instructions, kept with the run: a continuation with the same list, and every rebuild, reads it from there.
//
// THE SAME CALL READS EVERY QUANTITY the instructions state ("about 300 words", "a five-minute read") as a range, by
// the conventions of the quantity grammar (./quantity.ts). Code compares those ranges with the grammar's own function;
// a rule the two read differently is read both ways, held against any rule either reading conflicts with, and said so
// on the screen (./selection.ts). Nothing is resolved by choosing one reading.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { ModelPair, ModelQuantity } from './selection.js';
import type { QuantityMeasure, QuantityUnit } from './quantity.js';
import { CHARACTERS_PER_WORD, WORDS_PER_MINUTE } from './quantity.js';

export interface InstructionLine { readonly id: string; readonly author: string; readonly statement: string }

export const CONTRADICTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    pairs: { type: 'array', items: { type: 'object',
      properties: { a: { type: 'integer' }, b: { type: 'integer' }, reason: { type: 'string' } },
      required: ['a', 'b', 'reason'], additionalProperties: false } },
    quantities: { type: 'array', items: { type: 'object',
      properties: { n: { type: 'integer' }, measure: { type: 'string', enum: ['piece', 'sentence', 'paragraph'] }, unit: { type: 'string', enum: ['words', 'sentences', 'paragraphs'] },
        min: { type: ['number', 'null'] }, max: { type: ['number', 'null'] } },
      required: ['n', 'measure', 'unit', 'min', 'max'], additionalProperties: false } },
  },
  required: ['pairs', 'quantities'], additionalProperties: false,
};

const SYSTEM = `You are given the numbered instructions a writer will be told to follow, all at once, in one piece of writing.
They were taken from several authors; each line names its author.

Name every pair of instructions that cannot BOTH be followed in one piece: following one breaks the other. Two
instructions about different things, or that can be satisfied together (one about the opening, one about the rest;
a general habit and a narrower exception that leaves room for it), are not a pair. Do not name a pair because the
two differ in emphasis or taste. Never invent an instruction.

For each pair give the two numbers and a one-line reason that quotes the words of both instructions that clash.
If no pair clashes, return an empty list.

Separately, for every instruction that states a quantity (a length in words, characters or minutes of reading, or a
number of sentences or paragraphs), give its number and the range it allows:
  measure  what is counted: piece (the whole piece), sentence (each sentence) or paragraph (each paragraph)
  unit     words, sentences or paragraphs; characters are ${CHARACTERS_PER_WORD} to a word, a minute of reading is ${WORDS_PER_MINUTE} words
  min/max  the range, null where it is open. "At most N", "no more than N", "never more than N", "up to N": max N.
           "Under N", "fewer than N": max N-1. "At least N": min N. "Over N", "more than N": min N+1. "About N", or a size
           said plainly: 0.8N to 1.2N. "N to M", "between N and M": N to M.
Give one entry per quantity; an instruction with none gets no entry.`;

/**
 * The pairs that cannot both be followed, by rule id. Throws when the model gives nothing usable: the caller then says
 * the instructions were checked by keyword only.
 */
export async function readContradictions(client: InferenceClient, budget: Budget, lines: readonly InstructionLine[]): Promise<ModelPair[]> {
  return (await readInstructionLines(client, budget, lines)).pairs;
}

/** The pairs that cannot both be followed, and every quantity the model read, by rule id: one call. */
export async function readInstructionLines(client: InferenceClient, budget: Budget, lines: readonly InstructionLine[]): Promise<{ pairs: ModelPair[]; quantities: ModelQuantity[] }> {
  if (lines.length < 2) return { pairs: [], quantities: [] };
  const variableBlock = lines.map((l, i) => `${i + 1}. (${l.author}) ${l.statement.trim()}`).join('\n');
  const r = await spend(budget, 0.05, async () => {
    const x = await client.complete({ stableBlock: SYSTEM, variableBlock, userMessage: 'Name every pair that cannot both be followed.',
      toolName: 'emit_contradictions', toolDescription: 'Every pair of the numbered instructions that cannot both be followed in one piece.', schema: CONTRADICTIONS_SCHEMA, maxTokens: 2000, temperature: 0 });
    return { value: x, cost: x.cost };
  }, 'composite contradictions');
  const pairs = (r.json as { pairs?: { a?: unknown; b?: unknown; reason?: unknown }[] } | null)?.pairs;
  const given = (r.json as { quantities?: unknown } | null)?.quantities;
  if (!Array.isArray(pairs)) throw new Error('the contradiction reader returned nothing usable');
  const out: ModelPair[] = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    const a = lines[Number(p.a) - 1]; const b = lines[Number(p.b) - 1];
    if (!a || !b || a.id === b.id) continue;
    const key = [a.id, b.id].sort().join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    const reason = (typeof p.reason === 'string' ? p.reason : '').replace(/\s+/g, ' ').trim().slice(0, 300);
    out.push({ a: a.id, b: b.id, reason: reason || 'the two cannot both be followed' });
  }
  // A reading that names no line, an unknown measure or unit, or a bound that is not a number, is not a reading.
  const bound = (x: unknown): number | null | undefined => (x === null ? null : typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined);
  const quantities: ModelQuantity[] = [];
  for (const q of Array.isArray(given) ? given as { n?: unknown; measure?: unknown; unit?: unknown; min?: unknown; max?: unknown }[] : []) {
    const line = lines[Number(q.n) - 1];
    const min = bound(q.min); const max = bound(q.max);
    if (!line || !['piece', 'sentence', 'paragraph'].includes(String(q.measure)) || !['words', 'sentences', 'paragraphs'].includes(String(q.unit))) continue;
    if (min === undefined || max === undefined || (min === null && max === null) || (min !== null && max !== null && min > max)) continue;
    quantities.push({ id: line.id, quantity: { measure: q.measure as QuantityMeasure, unit: q.unit as QuantityUnit, min, max } });
  }
  return { pairs: out, quantities };
}
