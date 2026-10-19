// atelier/core/method/decision-units.ts — WHAT EACH STEP OF A METHOD ASKS THE WRITER TO DECIDE, READ ONCE AT BUILD.
//
// A method note is not seventy flat rules. It holds instructions, template examples, explanations and criteria, and an
// instruction asks for a decision (which initiative is a bet), consults inputs (the term sheet, the diff), applies under
// a condition ("when billing is touched"), puts something in the work (a Risks section), and sometimes depends on an
// earlier step. The method reader (./standard.ts) keeps each step as the owner's sentence and ties a check to it
// where code can hold one; it says nothing about the decision. So the writer was served the method whole on every
// request, and the brief for one request (core/loop/execution-brief.ts) had nothing to select by.
//
// This reading adds those fields to each STATED step as a compilation of the owner's note for execution. It never adds,
// removes or reweights a requirement: a step read as a template example or an explanation stays a requirement with that
// kind shown, for the owner to see at the build and in `report`; a condition is kept only as words of the step itself.
// Code floors: with no model, or a unit code cannot ground, a step is an instruction with no condition, so nothing
// binding is dropped by a reading. Evaluated in bench/readings/cases/method-units.json.

import type { Reading } from '../inference/reading.js';
import type { DecisionUnit, UnitKind } from '../state/canonical-state.js';
import { quoteIsReal } from '../taste/reader.js';
import { isConditional } from './step-readers.js';

export type { DecisionUnit, UnitKind } from '../state/canonical-state.js';

export interface UnitStep { readonly id: string; readonly text: string; readonly under: string | null }
export interface UnitsInput { readonly steps: readonly UnitStep[] }
export type UnitsOutput = Readonly<Record<string, DecisionUnit>>;

const KINDS: readonly UnitKind[] = ['instruction', 'template', 'explanation', 'criterion'];

export const METHOD_UNITS_SYSTEM = `You read the steps of one person's working method, numbered, each with the heading it stands under. For each step say what it is and what it asks of someone doing the work:

- kind: instruction (something to do or decide: "Open with a Summary section: two or three sentences on what the change does" is an instruction, though it describes what the section holds), template (text shown as it would appear in the work, as an example to imitate: a quoted line, a sample table row, "for example: …"; never a description of what to write), explanation (why the method does something, with no instruction in it), criterion (how to judge whether a step was done well).
- decision: the choice the step asks the person to make, in a few words, or null when it asks for none ("which initiatives are bets", "whether the change needs a test").
- inputs: what the step says to consult to make it (the term sheet, the diff, the customer's message); empty when it names none.
- condition: the step's own words that say when it applies ("when billing is touched", "unless asked"), copied exactly; null when it applies always.
- output: what the step puts in the work, in a few words, or null ("a Risks section", "the verdict line").
- exception: the step's own words that change the default, copied exactly, or null.
- dependsOn: the numbers of earlier steps this one needs done first; empty when none.
- quote: a short phrase copied exactly from the step, or from the heading it stands under, that shows your reading of it.

A heading's condition scopes every step under it ("Escalation (only when the customer asks for a manager)" makes each step under it conditional): copy the heading's words as the condition then. Copy quotes character for character. Never invent a condition the step and its heading do not state; when unsure, leave it null. Answer for every step.`;

export const METHOD_UNITS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { units: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, kind: { type: 'string', enum: [...KINDS] }, decision: { type: ['string', 'null'] },
    inputs: { type: 'array', items: { type: 'string' } }, condition: { type: ['string', 'null'] }, output: { type: ['string', 'null'] },
    exception: { type: ['string', 'null'] }, dependsOn: { type: 'array', items: { type: 'string' } }, quote: { type: 'string' },
  }, required: ['id', 'kind', 'decision', 'inputs', 'condition', 'output', 'exception', 'dependsOn', 'quote'], additionalProperties: false } } },
  required: ['units'], additionalProperties: false,
};

const short = (s: unknown, max = 200): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);
const strings = (x: unknown, max = 8): string[] => (Array.isArray(x) ? x.map((s) => short(s, 120)).filter((s): s is string => s !== null).slice(0, max) : []);

/**
 * WHAT THE WORDS ALONE SAY A STEP IS. A line that opens as an example ("For example:", "e.g.", "A typical table:"), a
 * table row or a quoted line is a template; one that opens by giving a reason ("because", "this section exists because",
 * "the reason") is an explanation; anything else an instruction. The floor, and the reader's grounding of a kind it
 * cannot otherwise place; never a weight.
 */
export function kindByWords(text: string): UnitKind {
  const t = text.trim();
  if (/^(?:for example|for instance|e\.g\.|example:|an? (?:typical|sample) (?:table|reply|answer|line|verdict)|sample:|such as:)/i.test(t) || t.startsWith('|') || /^[“"'].*[”"']\.?$/.test(t)) return 'template';
  if (/^(?:because|this (?:section|step|rule) exists because|we (?:do|ask|lead with|put) this because|the reason (?:is|for|we)|rationale:)/i.test(t)) return 'explanation';
  return 'instruction';
}

/**
 * The floor for one step: what its words say it is, applying always unless its own words, or the heading it stands
 * under, say when ("Escalation (only when the customer asks for a manager)" scopes every step under it).
 */
/** A heading that says when: a condition word in a short label scopes every step under it. */
const HEADING_CONDITION = /\b(?:only when|only if|only for|unless|except|when|if|whenever|where|in case of)\b/i;
export function unitFloor(step: UnitStep): DecisionUnit {
  const condition = isConditional(step.text) ? step.text : step.under && HEADING_CONDITION.test(step.under) ? step.under : null;
  return { kind: kindByWords(step.text), decision: null, inputs: [], condition, output: null, exception: null, dependsOn: [], quote: step.text, by: 'floor' };
}

export const METHOD_UNITS: Reading<UnitsInput, UnitsOutput> = {
  id: 'method-units', version: '3',
  system: METHOD_UNITS_SYSTEM, schema: METHOD_UNITS_SCHEMA,
  toolName: 'emit_method_units', toolDescription: 'For every numbered step: its kind, the decision it asks for, its inputs, condition, output, exception, dependencies and a quote.',
  maxTokens: 6000, estimateUsd: 0.03,
  prompt(input) {
    return `The steps:\n${input.steps.map((s) => `${s.id}. ${s.under ? `(under "${s.under}") ` : ''}${s.text}`).join('\n')}`;
  },
  decide(input) { return input.steps.length ? null : {}; },
  // GROUNDED STEP BY STEP. A unit whose quote, condition or exception is not in its step's words, or whose kind is not one
  // of the four, falls to the floor; the rest stand. Nothing read is kept unless its words are the step's.
  ground(raw, input) {
    const r = raw as { units?: unknown } | null;
    if (!r || !Array.isArray(r.units)) return null;
    const byId = new Map(input.steps.map((s) => [s.id, s]));
    const out: Record<string, DecisionUnit> = {};
    for (const u of r.units as { id?: unknown; kind?: unknown; decision?: unknown; inputs?: unknown; condition?: unknown; output?: unknown; exception?: unknown; dependsOn?: unknown; quote?: unknown }[]) {
      const step = typeof u.id === 'string' ? byId.get(u.id) : undefined;
      if (!step || out[step.id]) continue;
      const kind = KINDS.find((k) => k === u.kind);
      // A quote, a condition or an exception may be the step's words or its heading's: a heading's condition scopes the steps under it.
      const own = `${step.text}\n${step.under ?? ''}`;
      const quote = short(u.quote, 160);
      if (!kind || !quote || !quoteIsReal(quote, own)) continue;
      const condition = short(u.condition, 200);
      if (condition !== null && !quoteIsReal(condition, own)) continue;
      const exception = short(u.exception, 200);
      if (exception !== null && !quoteIsReal(exception, own)) continue;
      const dependsOn = strings(u.dependsOn).filter((d) => d !== step.id && byId.has(d));
      out[step.id] = { kind, decision: short(u.decision), inputs: strings(u.inputs), condition, output: short(u.output, 120), exception, dependsOn, quote, by: 'model' };
    }
    if (!Object.keys(out).length) return null;
    for (const s of input.steps) if (!out[s.id]) out[s.id] = unitFloor(s);
    return out;
  },
  floor(input) { return Object.fromEntries(input.steps.map((s) => [s.id, unitFloor(s)])); },
};

/** One line per unit for the build's whole account and `report`. */
export function describeUnit(u: DecisionUnit): string {
  const parts = [u.kind, u.decision ? `decides: ${u.decision}` : null, u.inputs.length ? `from: ${u.inputs.join(', ')}` : null,
    u.condition ? `when: "${u.condition}"` : null, u.output ? `puts: ${u.output}` : null, u.exception ? `except: "${u.exception}"` : null,
    u.dependsOn.length ? `after: ${u.dependsOn.join(', ')}` : null].filter((x): x is string => x !== null);
  return `${parts.join(' · ')}${u.by === 'floor' ? ' (by the words alone)' : ''}`;
}
