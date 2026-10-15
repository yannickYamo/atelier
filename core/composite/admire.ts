// atelier/core/composite/admire.ts — "WHAT DO YOU LIKE ABOUT THIS ONE?", READ INTO THE SIX TRAIT CLASSES.
//
// The person says, in a free line per author, what they admire. One model call maps every line to the classes
// (./traits.ts) that author's rules fall into, so "the way it opens, and how the argument builds" selects the
// author's opening and structure rules and nothing else of theirs. One call for all the lines, not one per
// author; a class the author's rules do not carry cannot be selected, and the screen says so.
//
// Without a model (the call fails), the same words are read by a keyword table: cruder, said as such, and never
// a reason to stop.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { CLASS_WORDS, TRAIT_CLASSES, TRAIT_LABEL, type TraitClass } from './traits.js';

export interface AdmireLine { readonly author: string; readonly text: string; readonly available: readonly TraitClass[] }

export const ADMIRE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    picks: { type: 'array', items: { type: 'object',
      properties: { author: { type: 'string' }, classes: { type: 'array', items: { type: 'string', enum: [...TRAIT_CLASSES] } } },
      required: ['author', 'classes'], additionalProperties: false } },
  },
  required: ['picks'], additionalProperties: false,
};

const SYSTEM = `A person has read pieces by several writers and said, in a line each, what they like about each writer's work.
Map each line to the TRAIT CLASSES it names, from these and no others:

${TRAIT_CLASSES.map((c) => `  ${c.padEnd(10)} ${TRAIT_LABEL[c]}`).join('\n')}

Rules: pick a class only when the line admires it (praise of how it opens is "opening"; of its figures, sources or
examples, "evidence"; of its sentences, paragraphs or speed, "pace"; of its tone or register, "voice"; of how the
argument is built or ordered, "structure"; of how the writer decides or works, "method"; of its metaphors, analogies
or imagery, "figure"; of what it makes a reader feel, "effect"). "Everything" or "all of
it" is every class listed as available for that writer. Pick only from the classes listed as available for that
writer: a class their pieces gave no rule for cannot be chosen. A line that admires nothing listed gets no class.
Never pick a class for a writer whose line is empty.`;

/**
 * THE KEYWORD READING uses the same words of each class a rule is sorted by (./traits.ts, CLASS_WORDS), so a line
 * that admires "the bullet lists", "the headings" or "its numbered steps" names the class those rules are in. Added to
 * them only words of praise that no rule says ("the speed of it", "how the argument builds"), and the words of
 * method, which a rule never names (a rule with no class word is a method rule).
 */
const PRAISE: Readonly<Partial<Record<TraitClass, RegExp>>> = {
  opening: /\b(start|starts|lead|first line)\b/i,
  structure: /\b(build|builds|organi[sz]ed|flow|ordered)\b/i,
  evidence: /\b(depth|deep|dense|research)\b/i,
  pace: /\b(speed|quick|momentum)\b/i,
  voice: /\b(formality|funny|direct|style|sound|sounds)\b/i,
  figure: /\b(vivid|picture|pictures|paints)\b/i,
  effect: /\b(touching|gripping|haunting|heart|warmth|makes me|made me)\b/i,
  method: /\b(method|approach|decides|decision|decisions|discipline|process|way of working|moves|thinks|thinking|reasoning)\b/i,
};
const KEYWORDS: readonly (readonly [TraitClass, RegExp | undefined, RegExp | undefined])[] = TRAIT_CLASSES.map((c) => [c, CLASS_WORDS.find(([k]) => k === c)?.[1], PRAISE[c]]);

/** The classes a line names, by its words. The fallback when no model reads it. */
export function keywordClasses(text: string, available: readonly TraitClass[]): TraitClass[] {
  const t = text.trim();
  if (!t) return [];
  // Only an explicit "everything" or "all of it" takes every class: "above all, the openings" names one.
  if (/\b(everything|all of it)\b/i.test(t) && !/\b(not|except|but)\b/i.test(t)) return [...available];
  return KEYWORDS.filter(([, words, praise]) => words?.test(t) === true || praise?.test(t) === true).map(([c]) => c).filter((c) => available.includes(c));
}

/**
 * Every line read in one call. Returns the classes per author, each restricted to what that author's rules carry.
 * Authors whose line is empty get none. Throws when the model gives nothing usable: the caller falls back to the
 * keyword reading and says so.
 */
export async function readAdmiration(client: InferenceClient, budget: Budget, lines: readonly AdmireLine[]): Promise<Record<string, TraitClass[]>> {
  const said = lines.filter((l) => l.text.trim());
  if (!said.length) return Object.fromEntries(lines.map((l) => [l.author, []]));
  const variableBlock = said.map((l) => `WRITER: ${l.author}\nAVAILABLE: ${l.available.join(', ') || '(none)'}\nLINE: ${l.text.trim()}`).join('\n\n');
  const r = await spend(budget, 0.05, async () => {
    const x = await client.complete({ stableBlock: SYSTEM, variableBlock, userMessage: 'Map every line now.',
      toolName: 'emit_admired', toolDescription: 'The trait classes each line admires, per writer.', schema: ADMIRE_SCHEMA, maxTokens: 1500, temperature: 0 });
    return { value: x, cost: x.cost };
  }, 'preference');
  const picks = (r.json as { picks?: { author?: unknown; classes?: unknown }[] } | null)?.picks;
  if (!Array.isArray(picks)) throw new Error('the admiration reader returned nothing usable');
  const out: Record<string, TraitClass[]> = Object.fromEntries(lines.map((l) => [l.author, []]));
  for (const p of picks) {
    const line = said.find((l) => l.author.toLowerCase() === (typeof p.author === 'string' ? p.author : '').trim().toLowerCase());
    if (!line) continue;
    const classes = (Array.isArray(p.classes) ? p.classes : []).map((c) => String(c).toLowerCase()).filter((c): c is TraitClass => (TRAIT_CLASSES as readonly string[]).includes(c) && line.available.includes(c as TraitClass));
    out[line.author] = [...new Set([...out[line.author], ...classes])];
  }
  return out;
}
