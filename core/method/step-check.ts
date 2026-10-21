// atelier/core/method/step-check.ts — THE CHECK A STEP ASKS FOR, READ BY A MODEL, HELD BY CODE.
//
// A step of a person's method is one sentence in their words. Which check holds it was decided by patterns on its
// wording (a step that said "a table with the columns" got a TABLE check), and every round of testing found a wording
// the patterns did not know; a rule written as a heading, or a list under "words to cut", got nothing. Patterns on
// wording are gone from here. The reading pattern of the house stands in their place (core/inference/reading.ts):
//
//   1. the model is shown every step, the outline of the owner's finished example (its sections, its tables, whether
//      material was given) and the menu of measurements (core/measurement/spec.ts); for each step it answers one of
//      three ways: a measurement line from the menu, a check it writes itself, or judgement;
//   2. code grounds each answer: a quote that is not in the step drops it; a measurement line must parse, validate
//      and run on the owner's example; a written check must compile in the sandbox (core/observers/written.ts) and
//      run on the example; anything else is judgement;
//   3. with no model, or an answer code could not ground, the floor is judgement: a step is never given a check its
//      words were only matched to.
//
// Nothing a model says becomes a rule here. The step stays the owner's sentence; what this adds is the check beside
// it, shown on the build screen for the owner to keep or change, and the standard's hash covers it. A written check
// reports until it is qualified on the owner's examples and their mutants (./mutants.ts). Evaluated against labelled
// cases in bench/readings/cases/step-check.json.

import type { Reading } from '../inference/reading.js';
import type { Measurement } from '../state/canonical-state.js';
import { measure } from '../observers/registry.js';
import { parseMeasureSpec, MEASURE_MENU } from '../measurement/spec.js';
import { compileCheck, CHECK_SOURCE_MAX } from '../observers/written.js';

export interface StepToCheck { readonly id: string; readonly text: string; readonly under: string | null }
export interface ExampleOutline {
  readonly sections: readonly string[];
  readonly tables: readonly { readonly header: readonly string[] }[];
  /** the sections are labels on a line, not headings */
  readonly labels: boolean;
  readonly hasMaterial: boolean;
  readonly words: number;
  /** the finished example, as far as the reader is shown it */
  readonly head: string;
  /** the request the example answered, when it is known */
  readonly request: string | null;
}
export interface StepCheckInput { readonly steps: readonly StepToCheck[]; readonly example: ExampleOutline; readonly material: readonly { readonly name: string; readonly text: string }[] }

export interface StepCheck {
  readonly how: 'measure' | 'written' | 'judgement';
  readonly measurement: Measurement | null;
  /** the words of the step the reader read the check from */
  readonly quote: string;
  /** what the check reads, in words; for a measurement, the line it was declared with */
  readonly means: string;
  /** the measurement reads something near the step, not the step itself: shown beside it, never enforced */
  readonly near?: true;
  readonly by: 'model' | 'floor';
}
export type StepCheckOutput = Readonly<Record<string, StepCheck>>;

export const STEP_CHECK_SYSTEM = `You read the steps of one person's working method, numbered, beside the outline of one finished example of their work. For each step, say how code could check a new piece of work against it, or that it cannot.

Answer one of three ways for each step:

- how "measure": the step asks for something one of the listed measurements counts. Give the measurement as one line exactly in the listed form, with the names the EXAMPLE uses (its section names, its table's columns, its phrases), lower-cased where the form says so. A step that names a section the example has ("Open with a Verdict section", "then a Risks heading") is PRESENCE:sections=... with opens=1 or closes=1 only where the step says where. A step that bans words or phrases is LEXICON. A step about a count the list holds (sentences per paragraph, words in the opening) is that measurement.
- how "written": the step asks for something code can decide on the text, the request or the material, and no listed measurement holds it (a unit after every time estimate, no colour written as a hex value, no group of more than five items, every finding opens with a verb, a date in ISO form). Write the check as one JavaScript arrow function (text, request, material) => ({ ok, detail, spans }) where ok is true when the step is held, detail is one short sentence, and spans lists {start, end, why} for each place the text breaks it. material is an array of {name, text}. The function must be pure: no imports, no I/O, no randomness, no state outside it, under ${CHECK_SOURCE_MAX} characters, and it must return ok:true on the example's own text. Return null when the text has nothing the step speaks of.
- near: true when the measurement you name reads something NEAR the step and not the step itself ("name the source the first time I cite a figure" is near CITED, which only looks figures up in the material): such a check is shown beside the step and never blocks.
- how "judgement": the step asks for a decision no code can make on the text alone (weigh the risks, keep the tone warm, name the real cause). Most steps about why, when or how well are judgement. A step that forbids a section, or asks for one only under a condition, is judgement.

Never give a step a check its words do not ask for: a section named in passing, a thing the step says to leave out, a step about when. A wrong check is enforced on every output from then on; "judgement" costs nothing. For every step, quote: a short phrase copied exactly from the step that your reading stands on; means: what the check reads, in plain words.

The measurements:
${MEASURE_MENU}`;

export const STEP_CHECK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { checks: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, how: { type: 'string', enum: ['measure', 'written', 'judgement'] },
    measure: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, quote: { type: 'string' }, means: { type: 'string' }, near: { type: 'boolean' },
  }, required: ['id', 'how', 'measure', 'source', 'quote', 'means'], additionalProperties: false } } },
  required: ['checks'], additionalProperties: false,
};

/** The example's outline, as the reader is shown it and as a test double reads it back. */
export function describeOutline(e: ExampleOutline): string {
  return [
    `sections (${e.labels ? 'labels on a line' : 'headings'}): ${e.sections.length ? e.sections.map((s) => `"${s}"`).join(', ') : 'none'}`,
    `tables: ${e.tables.length ? e.tables.map((t) => `[${t.header.map((h) => `"${h}"`).join(', ')}]`).join('; ') : 'none'}`,
    `material given with it: ${e.hasMaterial ? 'yes' : 'no'}; about ${e.words} words`,
  ].join('\n');
}

const clean = (s: unknown, max = 240): string | null => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);
const inStep = (quote: string, step: StepToCheck): boolean => {
  const own = `${step.text}\n${step.under ?? ''}`.toLowerCase().replace(/\s+/g, ' ');
  return own.includes(quote.toLowerCase().replace(/\s+/g, ' '));
};

/** Judgement: the floor for one step, and the reading's answer where it said so. */
export const judgement = (step: StepToCheck, by: 'model' | 'floor', means = 'yours to judge'): StepCheck => ({ how: 'judgement', measurement: null, quote: step.text.slice(0, 120), means, by });

export const STEP_CHECK: Reading<StepCheckInput, StepCheckOutput> = {
  id: 'step-check', version: '1',
  system: STEP_CHECK_SYSTEM, schema: STEP_CHECK_SCHEMA,
  toolName: 'emit_step_checks', toolDescription: 'For every numbered step: how code checks it (a listed measurement, a written check, or judgement), with a quote from the step and what the check reads.',
  maxTokens: 8000, estimateUsd: 0.04,
  prompt(input) {
    // The input is also given whole as JSON: what the reader is asked about is exactly what code grounds against.
    const given = { steps: input.steps.map((s) => ({ id: s.id, text: s.text, under: s.under })), example: { sections: input.example.sections, tables: input.example.tables.map((t) => t.header), labels: input.example.labels, hasMaterial: input.example.hasMaterial, request: input.example.request } };
    return `The steps:\n${input.steps.map((s) => `${s.id}. ${s.under ? `(under "${s.under}") ` : ''}${s.text}`).join('\n')}\n\nThe example's outline:\n${describeOutline(input.example)}\n\nThe example, as far as shown:\n${input.example.head}\n\n\`\`\`json\n${JSON.stringify(given)}\n\`\`\``;
  },
  decide(input) { return input.steps.length ? null : {}; },
  ground(raw, input) {
    const r = raw as { checks?: unknown } | null;
    if (!r || !Array.isArray(r.checks)) return null;
    const byId = new Map(input.steps.map((s) => [s.id, s]));
    const context = { ...(input.example.request ? { request: input.example.request } : {}), material: input.material };
    const out: Record<string, StepCheck> = {};
    for (const c of r.checks as { id?: unknown; how?: unknown; measure?: unknown; source?: unknown; quote?: unknown; means?: unknown; near?: unknown }[]) {
      const step = typeof c.id === 'string' ? byId.get(c.id) : undefined;
      if (!step || out[step.id]) continue;
      const quote = clean(c.quote, 160);
      // A reading that cannot point at the step's own words did not read the step.
      if (!quote || !inStep(quote, step)) { out[step.id] = judgement(step, 'floor', 'the reader quoted nothing of the step'); continue; }
      const means = clean(c.means, 200) ?? 'a check read from the step';
      if (c.how === 'measure') {
        const spec = clean(c.measure, 400);
        const parsed = spec ? parseMeasureSpec(spec) : { problem: 'no measurement line' as const };
        if (!parsed.measurement) { out[step.id] = judgement(step, 'floor', `the measurement named could not be read (${parsed.problem})`); continue; }
        const m = parsed.measurement;
        // It must run on the owner's example: a measurement that cannot read the example reads no work of this kind.
        try { measure(input.example.head, m, context); } catch (e) { out[step.id] = judgement(step, 'floor', `the measurement could not run on your example (${(e as Error).message.split('\n')[0]})`); continue; }
        out[step.id] = { how: 'measure', measurement: m, quote, means: spec ?? means, ...(c.near === true ? { near: true as const } : {}), by: 'model' };
        continue;
      }
      if (c.how === 'written') {
        const src = clean(c.source, CHECK_SOURCE_MAX + 1) ?? '';
        const compiled = src ? compileCheck(src) : { problem: 'no source' as const };
        if (!compiled.fn) { out[step.id] = judgement(step, 'floor', `the written check could not be compiled (${compiled.problem})`); continue; }
        const fn = compiled.fn;
        // It must run on the owner's example without throwing; whether it holds there is said on the build screen.
        try { fn(input.example.head, context); fn('', context); } catch (e) { out[step.id] = judgement(step, 'floor', `the written check throws on your example (${(e as Error).message.split('\n')[0]})`); continue; }
        out[step.id] = { how: 'written', measurement: { observer: 'CHECK', params: { source: src.split('\n'), means: [means] } }, quote, means, by: 'model' };
        continue;
      }
      out[step.id] = { ...judgement(step, 'model', means), quote };
    }
    if (!Object.keys(out).length) return null;
    for (const s of input.steps) if (!out[s.id]) out[s.id] = judgement(s, 'floor', 'the reader said nothing of this step');
    return out;
  },
  floor(input) { return Object.fromEntries(input.steps.map((s) => [s.id, judgement(s, 'floor')])); },
};

/** One finished example as the reading and the plan see it. */
export interface ExampleCase { readonly id: string; readonly task: string | null; readonly material: readonly { readonly name: string; readonly text: string }[]; readonly reference: string }

/**
 * THE READING'S INPUT FROM A NOTE AND THE OWNER'S EXAMPLES: every example's sections and tables, joined (a step that
 * names a section one example has and another lacks still names that section), the example with the most sections
 * shown as far as the reader reads, and its request. The method standard then holds each check against every example
 * and chooses the lead among them (./standard.ts, `proposalsAcross`).
 */
export function stepCheckInput(steps: readonly StepToCheck[], cases: readonly ExampleCase[], outlineOf: (reference: string) => { sections: readonly string[]; tables: readonly { readonly header: readonly string[] }[]; labels: boolean }, countWords: (t: string) => number): StepCheckInput {
  const outlines = cases.map((c) => ({ c, o: outlineOf(c.reference) }));
  const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sections: string[] = []; const seen = new Set<string>();
  for (const { o } of outlines) for (const s of o.sections) if (!seen.has(key(s))) { seen.add(key(s)); sections.push(s); }
  const tables: { header: string[] }[] = []; const seenT = new Set<string>();
  for (const { o } of outlines) for (const t of o.tables) { const k = t.header.map(key).join('|'); if (!seenT.has(k)) { seenT.add(k); tables.push({ header: [...t.header] }); } }
  const richest = [...outlines].sort((a, b) => b.o.sections.length + b.o.tables.length - (a.o.sections.length + a.o.tables.length))[0] ?? outlines[0];
  return { steps, example: { sections, tables, labels: outlines.some((x) => x.o.labels), hasMaterial: cases.some((c) => c.material.length > 0),
    words: countWords(richest.c.reference), head: richest.c.reference.slice(0, 6000), request: richest.c.task ?? null }, material: richest.c.material };
}

/** The plan a build hands the method standard: each stated step's check, by the step's text. */
export type StepPlan = ReadonlyMap<string, StepCheck>;

export const planOf = (steps: readonly StepToCheck[], value: StepCheckOutput): StepPlan => new Map(steps.map((s) => [s.text, value[s.id] ?? judgement(s, 'floor')]));
