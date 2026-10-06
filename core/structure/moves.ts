// atelier/core/structure/moves.ts — HOW A PIECE IS BUILT, ONE PARAGRAPH AT A TIME.
//
// A study of AI fiction told human from model stories at 93% F1 on structure alone (arXiv 2604.03136): model
// text over-explains, runs on one tidy track, and lands where the reader expects. Every check Atelier counts sits
// at the level of words and sentences, where model drafts already look typical (decision 0010). This reads the
// level above: what each paragraph DOES in the argument.
//
// WHY ONE CLOSED LABEL PER PARAGRAPH. The first move reader (../taste/moves.ts) asked richer questions per piece
// (the opening, the closing, the figures and their domains) and failed qualification: what it read reliably did
// not separate, and what separated it could not read twice the same way. A piece has one opening; a piece has
// thirty paragraphs. Labels per paragraph, from a closed set, give a sequence long enough for statistics, and a
// question a small model can answer the same way twice.
//
// READ TWICE, KEPT WHERE THE TWO AGREE. The second read gets the moves listed in reverse order, so an order
// effect in the list shows as disagreement. A paragraph the two reads label differently is UNCLEAR and counts in
// no feature: abstention computed, not asked for. Agreement is reported as Cohen's κ.
//
// It reports. Its features steer nothing until they pass the sealed qualification
// (studies/STRUCTURE_READER_PREREGISTRATION.md).

import { createHash } from 'node:crypto';
import { paragraphsOf } from '../observers/text.js';
import { spend, type Budget, type InferenceClient } from '../inference/client.js';
import { cohenKappa } from '../stats/agreement.js';

export const STRUCTURE_MOVES = ['CLAIM', 'EXPLAIN', 'EXAMPLE', 'EVIDENCE', 'STORY', 'CONCESSION', 'DEFINITION', 'INSTRUCTION', 'QUESTION', 'TURN', 'SUMMARY'] as const;
export type StructureMove = typeof STRUCTURE_MOVES[number];

const DEFINITIONS: Readonly<Record<StructureMove, string>> = {
  CLAIM: 'states a position, a thesis or a judgement the piece will stand on',
  EXPLAIN: 'explains how or why something works, in general terms, without a specific case',
  EXAMPLE: 'gives a specific case, scenario, code or illustration of a point',
  EVIDENCE: 'cites data, a measurement, a study, a source or a result as support',
  STORY: 'recounts something that happened, told as events in time',
  CONCESSION: 'grants a limit, a counterpoint, an exception or the other side',
  DEFINITION: 'says what a term or a thing is',
  INSTRUCTION: 'tells the reader what to do or how to do it',
  QUESTION: 'raises a question the piece then takes up',
  TURN: 'changes direction: overturns what came before, or reframes it',
  SUMMARY: 'restates or sums up what was already said',
};

const systemFor = (order: readonly StructureMove[]): string => `You label the structure of a piece of writing. You do not judge it.
For each numbered paragraph, choose the ONE move that best describes what that paragraph does in the piece:
${order.map((m) => `- ${m}: ${DEFINITIONS[m]}`).join('\n')}
Label every paragraph, by its number, with one of these labels written exactly as above. Judge what the paragraph does, not its topic.`;

const SCHEMA = { type: 'object', additionalProperties: false, required: ['labels'], properties: { labels: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['n', 'move'], properties: { n: { type: 'integer', minimum: 1 }, move: { type: 'string', enum: [...STRUCTURE_MOVES] } } } } } };

/** Names the instrument: a change to the definitions, the order rule or the schema is a new reader. */
export const STRUCTURE_READER_VERSION = createHash('sha256').update(`${systemFor(STRUCTURE_MOVES)}|${JSON.stringify(SCHEMA)}|two reads, reversed list|five-letter canonical|v1`).digest('hex').slice(0, 8);

export interface StructureReading {
  readonly version: string;
  /** one entry per prose paragraph, in order: the agreed move, or null where the two reads differ */
  readonly moves: readonly (StructureMove | null)[];
  readonly first: readonly StructureMove[];
  readonly second: readonly StructureMove[];
  /** Cohen's κ between the two reads on this text */
  readonly kappa: number | null;
}

/** Paragraphs shorter than this are headings or transitions; they are labelled by no move. */
const MIN_PARAGRAPH_WORDS = 8;
const paragraphsFor = (text: string): string[] => paragraphsOf(text).map((p) => p.text.replace(/\s+/g, ' ').trim())
  .filter((p) => p.split(' ').length >= MIN_PARAGRAPH_WORDS);

/**
 * A label as returned, mapped onto the closed set: an exact match, or the one move that shares its first five
 * letters ("EXPLANATION" is EXPLAIN, "INSTRUCTIONS" is INSTRUCTION). A model not forced into the tool does not
 * hold to the enum; anything ambiguous or unknown is refused, never guessed.
 */
export function canonicalMove(raw: unknown): StructureMove | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if ((STRUCTURE_MOVES as readonly string[]).includes(s)) return s as StructureMove;
  const hits = STRUCTURE_MOVES.filter((m) => s.length >= 5 && m.slice(0, 5) === s.slice(0, 5));
  return hits.length === 1 ? hits[0] : null;
}

/** A reading's labels in paragraph order, or null when it does not label every paragraph exactly once. */
export function checkLabels(raw: unknown, n: number): StructureMove[] | null {
  const labels = (raw as { labels?: unknown } | null)?.labels;
  if (!Array.isArray(labels)) return null;
  // Filled, not sparse: `every` skips the holes of `new Array(n)`, and a paragraph left unlabelled would pass.
  const out = Array.from({ length: n }, (): StructureMove | undefined => undefined);
  for (const l of labels as { n?: unknown; move?: unknown }[]) {
    const i = typeof l.n === 'number' ? l.n - 1 : -1;
    const move = canonicalMove(l.move);
    if (i < 0 || i >= n || out[i] !== undefined || !move) return null;
    out[i] = move;
  }
  const labelled = out.filter((x): x is StructureMove => x !== undefined);
  return labelled.length === n ? labelled : null;
}

async function readOnce(client: InferenceClient, budget: Budget, paragraphs: readonly string[], order: readonly StructureMove[]): Promise<StructureMove[] | null> {
  const numbered = paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
  return spend(budget, 0.02, async () => {
    const x = await client.complete({ stableBlock: systemFor(order), variableBlock: '', userMessage: numbered,
      toolName: 'emit_labels', toolDescription: 'Return one move per numbered paragraph.', schema: SCHEMA,
      maxTokens: Math.max(800, paragraphs.length * 40), temperature: 0 });
    return { value: checkLabels(x.json, paragraphs.length), cost: x.cost, usage: x };
  }, 'structure');
}

/** Read a text twice and keep the moves both reads agree on. Null when the text has too few paragraphs or a read is malformed. */
export async function readStructure(client: InferenceClient, budget: Budget, text: string): Promise<StructureReading | null> {
  const paragraphs = paragraphsFor(text);
  if (paragraphs.length < 4) return null;
  const first = await readOnce(client, budget, paragraphs, STRUCTURE_MOVES);
  const second = await readOnce(client, budget, paragraphs, [...STRUCTURE_MOVES].reverse());
  if (!first || !second) return null;
  return { version: STRUCTURE_READER_VERSION, moves: first.map((m, i) => (m === second[i] ? m : null)), first, second, kappa: cohenKappa(first, second) };
}
