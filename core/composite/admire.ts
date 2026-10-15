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
import { TRAIT_CLASSES, TRAIT_LABEL, type TraitClass } from './traits.js';

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
Map each line to the TRAIT CLASSES it names, from these six and no others:

${TRAIT_CLASSES.map((c) => `  ${c.padEnd(10)} ${TRAIT_LABEL[c]}`).join('\n')}

Rules: pick a class only when the line admires it (praise of how it opens is "opening"; of its figures, sources or
examples, "evidence"; of its sentences, paragraphs or speed, "pace"; of its tone or register, "voice"; of how the
argument is built or ordered, "structure"; of how the writer decides or works, "method"). "Everything" or "all of
it" is every class listed as available for that writer. Pick only from the classes listed as available for that
writer: a class their pieces gave no rule for cannot be chosen. A line that admires nothing listed gets no class.
Never pick a class for a writer whose line is empty.`;

const KEYWORDS: readonly (readonly [TraitClass, RegExp])[] = [
  ['opening', /\b(open|opens|opening|openings|begin|begins|start|starts|hook|first line|lead)\b/i],
  ['structure', /\b(structure|structured|argument|arguments|order|ordered|section|sections|build|builds|organi[sz]ed|outline|flow|close|closing|ending)\b/i],
  ['evidence', /\b(evidence|figure|figures|data|number|numbers|source|sources|detail|details|depth|dense|example|examples|specific|specifics|proof|research)\b/i],
  ['pace', /\b(pace|pacing|rhythm|speed|fast|quick|brisk|short|sentence|sentences|paragraph|paragraphs|fragment|fragments|tempo|momentum)\b/i],
  ['voice', /\b(voice|tone|register|formal|formality|informal|warm|dry|wry|humou?r|funny|plain|direct|style|sound|sounds|word|words|phrasing|contraction|contractions)\b/i],
  ['method', /\b(method|approach|decides|decision|decisions|discipline|process|way of working|moves|thinks|thinking|reasoning)\b/i],
];

/** The classes a line names, by its words. The fallback when no model reads it. */
export function keywordClasses(text: string, available: readonly TraitClass[]): TraitClass[] {
  const t = text.trim();
  if (!t) return [];
  if (/\b(everything|all of it|the whole thing|all)\b/i.test(t) && !/\b(not|except|but)\b/i.test(t)) return [...available];
  return KEYWORDS.filter(([, re]) => re.test(t)).map(([c]) => c).filter((c) => available.includes(c));
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
    const line = said.find((l) => l.author.toLowerCase() === String(p.author ?? '').trim().toLowerCase());
    if (!line) continue;
    const classes = (Array.isArray(p.classes) ? p.classes : []).map((c) => String(c).toLowerCase()).filter((c): c is TraitClass => (TRAIT_CLASSES as readonly string[]).includes(c) && line.available.includes(c as TraitClass));
    out[line.author] = [...new Set([...out[line.author], ...classes])];
  }
  return out;
}
