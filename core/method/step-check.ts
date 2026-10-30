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
// cases.

import type { Reading } from '../inference/reading.js';
import type { Measurement, CheckQualification } from '../state/canonical-state.js';
import { measure } from '../observers/registry.js';
import { parseMeasureSpec, MEASURE_MENU } from '../measurement/spec.js';
import { compileCheck, CHECK_SOURCE_MAX } from '../observers/written.js';
import { baseId } from './mutants.js';

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
  /** a written check the reader gave that did not compile or threw: kept so the build can send it back once with the problem */
  readonly attempt?: { readonly source: string; readonly problem: string };
  /** a written check's standing on the owner's examples and their mutants (./mutants.ts); absent where none could be read */
  readonly qualification?: CheckQualification;
  /** of the reading's draws, how many gave this check (a reading varies; the build keeps what the draws agree on) */
  readonly agreed?: { readonly of: number; readonly same: number };
  /** kept from the build that ratified it: the step's words and the examples are unchanged, so it was not read again (./freeze.ts) */
  readonly frozen?: true;
  /** what the step is, a prohibition or a thing to do, as the reading that was frozen with the check said (./freeze.ts) */
  readonly kind?: 'BOUNDARY' | 'GENERATIVE';
  /** who gave the check: the reader; the floor (judgement, where no model read or nothing it said could be grounded); code, for a ban on a construction Atelier counts */
  readonly by: 'model' | 'floor' | 'code';
}
export type StepCheckOutput = Readonly<Record<string, StepCheck>>;

export const STEP_CHECK_SYSTEM = `You read the steps of one person's working method, numbered, beside the outline of one finished example of their work. For each step, say how code could check a new piece of work against it, or that it cannot.

Answer one of three ways for each step:

- how "measure": the step asks for something one of the listed measurements counts. Give the measurement as one line exactly in the listed form, with the names the EXAMPLE uses (its section names, its table's columns, its phrases), lower-cased where the form says so. A step that names a section the example has ("Open with a Verdict section", "then a Risks heading") is PRESENCE:sections=... with opens=1 or closes=1 only where the step says where. A step that bans words or phrases is LEXICON. A step about a count the list holds (sentences per paragraph, words in the opening) is that measurement.
- how "written": the step asks for something code can decide on the text, the request or the material, and no listed measurement holds it: a unit after every time estimate, no colour written as a hex value, no list of more than five items, every finding opening with a verb, a date in ISO form, a figure with its currency. These are NOT judgement: a person could check them with a ruler, so write the check. Arithmetic over figures in the material is NOT judgement either: "the reserve equals the sum of the invoices in the file" is a written check that finds the invoice amounts in material, sums them and compares with the figure in the text; "the conclusion cites the policy clause" is a written check that finds a clause number in the section and looks it up in the policy text in material; "every fact cites a document in the file" is a written check that each sentence of the section carries a bracketed name that is a document in material. Write it as one JavaScript arrow function (text, request, material) => ({ ok, detail, spans }) where ok is true when the step is held, detail is one short sentence, and spans lists {start, end, why} for each place the text breaks it. material is an array of {name, text}. The function must be pure: no imports, no I/O, no randomness, no state outside it, under ${CHECK_SOURCE_MAX} characters, and it must return ok:true on the example's own text. Return null when the text has nothing the step speaks of (a declined claim with no reserve, a section the piece does not have). material names are written the way a person cites a document: the file's name without its folder or extension, "-" and "_" read as spaces ("notice of loss" for notice-of-loss.txt, "invoice 1" for invoice_1.txt); compare a name after lower-casing it. Put the whole function in the "source" field: a "written" answer with no source is no check at all. For example, for "Keep any list to five items or fewer":
  (text) => { const bad = []; let run = 0, start = -1; const lines = text.split('\\n'); let at = 0; for (const l of lines) { if (/^\\s*(?:[-*+]|\\d+[.)])\\s/.test(l)) { if (run === 0) start = at; run++; if (run === 6) bad.push({ start, end: at + l.length, why: 'a list of more than five items' }); } else run = 0; at += l.length + 1; } return { ok: bad.length === 0, detail: bad.length ? bad.length + ' list(s) over five items' : 'no list over five items', spans: bad }; }
- near: true when the measurement you name reads something NEAR the step and not the step itself ("name the source the first time I cite a figure" is near CITED, which only looks figures up in the material): such a check is shown beside the step and never blocks.
- how "judgement": the step asks for a decision no code can make on the text alone (weigh the risks, keep the tone warm, name the real cause). Most steps about why, when or how well are judgement. A step that FORBIDS a section ("Do not end with a Sources section unless asked"), asks for one only under a condition ("Add a Risks section only when the change touches billing"), or names a section in passing ("Give the Risks section a second read") is judgement, never PRESENCE: PRESENCE would require the very section the step forbids or conditions.

A step that says every figure must come from, be sourced from or be found in the material or the request is CITED:allow=0: code looks each figure up there, which is exactly what the step asks. A step that bans a construction a listed measurement names (em dashes, "not X, it's Y" constructions, semicolons, rhetorical questions) is that measurement at zero, PATTERN_RATE:pattern=EM_DASH,maxPer1000=0 for "No em dashes": never judgement and never a written check, since a count holds a ban exactly and code repairs what it finds. Place matters: "Never open with X" is OPENING:avoid=X (the first paragraph), not LEXICON (which bans X everywhere); "never end with X" is CLOSING:avoid=X; "never use X" anywhere is LEXICON.

A step with a decidable part and a judgement part ("a Coverage analysis section; the conclusion cites the clause it rests on, and every exclusion that could apply is addressed") gets the check for its decidable part, written or listed; the rest is left to the person and said in means. Never give a step a check its words do not ask for: a section named in passing, a thing the step says to leave out, a step about when. A wrong check is enforced on every output from then on; "judgement" costs nothing. For every step, quote: a short phrase copied exactly from the step that your reading stands on; means: what the check reads, in plain words.

The measurements:
${MEASURE_MENU}`;

export const STEP_CHECK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { checks: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, how: { type: 'string', enum: ['measure', 'written', 'judgement'] },
    measure: { type: ['string', 'null'], description: 'for how "measure": the one measurement line, exactly in a listed form; null otherwise' },
    source: { type: ['string', 'null'], description: 'for how "written": the whole JavaScript function, (text, request, material) => ({ ok, detail, spans }); null otherwise. A "written" answer with no source is no check.' },
    quote: { type: 'string' }, means: { type: 'string' }, near: { type: 'boolean' },
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

/**
 * A BAN ON THE EM DASH IS HELD BY THE COUNT AT ZERO, WITH NO MODEL TOO. With no model every step was a judgement: a step
 * that said "Never use em dashes" blocked nothing, and the examples' own dash cap stood beside it as leave to use them.
 * A PARSER OF THE CONSTRUCTION'S NAME, the mirror of `allowsDash` (./standard.ts): a sentence of the step that names
 * the em dash ("em dash", "em dashes", "em-dash") and negates it (never, no, not, don't, do not, avoid, without). It
 * reads no meaning beyond the name and its negation; a sentence that also places the ban (open, close, end, first,
 * last) says less than "nowhere", and is left to a reader. A sentence that states a number or a bound ("No more than
 * two em dashes", "at most one") is a cap, not a ban: its "no" negates the excess, and the count at zero would ban
 * what the step allows; it is left to a reader too. A typed double hyphen is a dash to the counter (../observers/tells.ts, `DASH`).
 */
export function dashBan(step: StepToCheck): StepCheck | null {
  const NAME = /\bem[- ]?dash(?:es)?\b/i; const NEGATION = /\b(?:never|no|not|don'?t|do not|avoid|without)\b/i; const PLACED = /\b(?:open|opening|opens|close|closing|closes|end|ending|ends|first|last)\b/i;
  const CAPPED = /\b(?:more than|at most|up to|fewer than|less than|per|one|two|three|four|five|six|seven|eight|nine|ten|a few|\d+)\b/i;
  const sentence = step.text.split(/(?<=[.!?\n])\s*/).find((s) => NAME.test(s) && NEGATION.test(s) && !PLACED.test(s) && !CAPPED.test(s));
  if (!sentence) return null;
  const quote = new RegExp(`${NEGATION.source}[^.!?\\n]*?${NAME.source}`, 'i').exec(sentence)?.[0] ?? sentence.trim().slice(0, 120);
  const measurement: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0, anyLength: 1 } };
  return { how: 'measure', measurement, quote, means: 'PATTERN_RATE:pattern=EM_DASH,maxPer1000=0 (a ban on a construction Atelier counts, read by code from its name)', by: 'code' };
}

/** The floor for one step: a ban code reads from the construction's name, else judgement, with why. */
export const floorFor = (step: StepToCheck, means?: string): StepCheck => dashBan(step) ?? judgement(step, 'floor', means);

export const STEP_CHECK: Reading<StepCheckInput, StepCheckOutput> = {
  id: 'step-check', version: '7',
  system: STEP_CHECK_SYSTEM, schema: STEP_CHECK_SCHEMA,
  toolName: 'emit_step_checks', toolDescription: 'For every numbered step: how code checks it (a listed measurement, a written check, or judgement), with a quote from the step and what the check reads.',
  maxTokens: 8000, estimateUsd: 0.04,
  prompt(input) {
    // The input is also given whole as JSON: what the reader is asked about is exactly what code grounds against.
    const given = { steps: input.steps.map((s) => ({ id: s.id, text: s.text, under: s.under })), example: { sections: input.example.sections, tables: input.example.tables.map((t) => t.header), labels: input.example.labels, hasMaterial: input.example.hasMaterial, request: input.example.request } };
    // With no finished example (rules a person stated, `atelier skill`), the reader is told so: a listed measurement
    // is still readable on new work; a written check cannot be qualified here and reports until the owner gives examples.
    const example = input.example.head.trim() ? `The example's outline:\n${describeOutline(input.example)}\n\nThe example, as far as shown:\n${input.example.head}` : 'No finished example was given: these are rules the person stated. A listed measurement must still read new work of this kind; a written check will report and block nothing until the person gives finished examples it can be qualified on.';
    return `The steps:\n${input.steps.map((s) => `${s.id}. ${s.under ? `(under "${s.under}") ` : ''}${s.text}`).join('\n')}\n\n${example}\n\n\`\`\`json\n${JSON.stringify(given)}\n\`\`\``;
  },
  decide(input) { return input.steps.length ? null : {}; },
  ground(raw, input) {
    const r = raw as { checks?: unknown } | null;
    if (!r || !Array.isArray(r.checks)) return null;
    const byId = new Map(input.steps.map((s) => [s.id, s]));
    const context = { ...(input.example.request ? { request: input.example.request } : {}), material: input.material };
    // A READER NUMBERS THE PARTS OF A COMPOUND STEP 3, 3b, 3c. Each answer is about step 3; the step keeps one check: a
    // written one before a listed measurement before judgement, the first of its kind otherwise.
    const rank = (c: StepCheck): number => (c.how === 'written' ? 2 : c.how === 'measure' ? 1 : 0);
    const out: Record<string, StepCheck> = {};
    const keep = (id: string, c: StepCheck): void => { if (!out[id] || rank(c) > rank(out[id])) out[id] = c; };
    for (const c of r.checks as { id?: unknown; how?: unknown; measure?: unknown; source?: unknown; quote?: unknown; means?: unknown; near?: unknown }[]) {
      const id = baseId(c.id); const step = id ? byId.get(id) : undefined;
      if (!step) continue;
      const quote = clean(c.quote, 160);
      // A reading that cannot point at the step's own words did not read the step.
      if (!quote || !inStep(quote, step)) { keep(step.id, judgement(step, 'floor', 'the reader quoted nothing of the step')); continue; }
      const means = clean(c.means, 200) ?? 'a check read from the step';
      if (c.how === 'measure') {
        const spec = clean(c.measure, 400);
        const parsed = spec ? parseMeasureSpec(spec) : { problem: 'no measurement line' as const };
        if (!parsed.measurement) { keep(step.id, judgement(step, 'floor', `the measurement named could not be read (${parsed.problem})`)); continue; }
        const m = parsed.measurement;
        // It must run on the owner's example: a measurement that cannot read the example reads no work of this kind.
        try { measure(input.example.head, m, context); } catch (e) { keep(step.id, judgement(step, 'floor', `the measurement could not run on your example (${(e as Error).message.split('\n')[0]})`)); continue; }
        // A ban is a ban at any length: a short post's one dash breaks it (core/observers/registry.ts, `anyLength`).
        const held = m.observer === 'PATTERN_RATE' && m.params.maxPer1000 !== undefined && Number(Array.isArray(m.params.maxPer1000) ? m.params.maxPer1000[0] : m.params.maxPer1000) === 0
          ? { ...m, params: { ...m.params, anyLength: 1 } } : m;
        keep(step.id, { how: 'measure', measurement: held, quote, means: spec ?? means, ...(c.near === true ? { near: true as const } : {}), by: 'model' });
        continue;
      }
      if (c.how === 'written') {
        const src = clean(c.source, CHECK_SOURCE_MAX + 1) ?? '';
        const compiled = src ? compileCheck(src) : { problem: 'no source' as const };
        if (!compiled.fn) { keep(step.id, { ...judgement(step, 'floor', `the written check could not be compiled (${compiled.problem})`), attempt: { source: src, problem: compiled.problem } }); continue; }
        const fn = compiled.fn;
        // It must run on the owner's example without throwing; whether it holds there is said on the build screen.
        try { fn(input.example.head, context); fn('', context); } catch (e) { keep(step.id, { ...judgement(step, 'floor', `the written check throws on your example (${(e as Error).message.split('\n')[0]})`), attempt: { source: src, problem: `throws on the example: ${(e as Error).message.split('\n')[0]}` } }); continue; }
        keep(step.id, { how: 'written', measurement: { observer: 'CHECK', params: { source: src.split('\n'), means: [means] } }, quote, means, by: 'model' });
        continue;
      }
      // A BAN THE READER CALLED JUDGEMENT IS STILL A BAN: a count holds it exactly, as the reader was told.
      keep(step.id, dashBan(step) ?? { ...judgement(step, 'model', means), quote });
    }
    if (!Object.keys(out).length) return null;
    for (const s of input.steps) if (!out[s.id]) out[s.id] = floorFor(s, 'the reader said nothing of this step');
    return out;
  },
  floor(input) { return Object.fromEntries(input.steps.map((s) => [s.id, floorFor(s)])); },
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
  // No example at all (rules stated with no finished work): an empty outline, said to the reader as such.
  if (!richest) return { steps, example: { sections: [], tables: [], labels: false, hasMaterial: false, words: 0, head: '', request: null }, material: [] };
  return { steps, example: { sections, tables, labels: outlines.some((x) => x.o.labels), hasMaterial: cases.some((c) => c.material.length > 0),
    words: countWords(richest.c.reference), head: richest.c.reference.slice(0, 6000), request: richest.c.task ?? null }, material: richest.c.material };
}

/**
 * A PROHIBITION IS NOT HELD BY A CHECK THAT REQUIRES THE THING IT FORBIDS. The rule-polarity reading says whether a
 * step forbids or asks for something; a step read as a prohibition ("Do not end with a Sources section unless asked")
 * that the check reading gave a presence or a table check would be required to contain the very thing it forbids.
 * Two readings, held against each other by code: such a step is judgement, and says why.
 */
export function heldByPolarity(c: StepCheck, step: StepToCheck, kind: 'BOUNDARY' | 'GENERATIVE' | undefined): StepCheck {
  const m = c.measurement;
  if (kind !== 'BOUNDARY' || !m) return c;
  const requires = m.observer === 'TABLE' || (m.observer === 'PRESENCE' && Array.isArray(m.params.sections) && m.params.sections.length > 0);
  return requires ? judgement(step, 'floor', 'the step forbids or conditions what the check would require, so it is yours to judge') : c;
}

/**
 * A WRITTEN CHECK SENT BACK ONCE WITH WHAT WENT WRONG. A check that did not compile, threw, or failed the owner's own
 * examples is not thrown away: the reader is shown the step, the check as written, and the failure (the compile error,
 * or which example failed and what the check said of it), and writes it again. One attempt; the result is grounded and
 * qualified like the first (./mutants.ts). What the owner's work does is the witness, as everywhere.
 */
export interface CheckRepairInput { readonly step: StepToCheck; readonly means: string; readonly source: string; readonly problem: string; readonly example: string; readonly material: readonly { readonly name: string; readonly text: string }[] }
export const STEP_CHECK_REPAIR: Reading<CheckRepairInput, { source: string | null }> = {
  id: 'step-check-repair', version: '2',
  system: `You wrote a JavaScript check for one step of a person's method, and it failed: it did not compile, it threw, or it fails the person's own finished example, which by definition holds the step. Write it again, correctly, as one arrow function (text, request, material) => ({ ok, detail, spans }); material is an array of {name, text}, each name written the way a person cites the document ("notice of loss" for notice-of-loss.txt). Pure, no I/O, under ${CHECK_SOURCE_MAX} characters. It must return ok:true on the example shown and still catch a text that breaks the step. Where the step cannot be decided on the text, the request and the material at all, return an empty object instead of a check.`,
  schema: { type: 'object', properties: { source: { type: 'string', description: 'the whole corrected function; omit when the step cannot be checked by code' } }, additionalProperties: false },
  toolName: 'emit_check_repair', toolDescription: 'The corrected check, or nothing.',
  maxTokens: 3000, estimateUsd: 0.02,
  prompt(i) { return `The step:\n${i.step.text}\n\nWhat the check reads: ${i.means}\n\nThe check as written:\n${i.source}\n\nWhat went wrong:\n${i.problem}\n\nThe person's finished example, which holds the step:\n${i.example.slice(0, 5000)}\n\nThe material it was made from (names and the first lines):\n${i.material.map((m) => `- ${m.name}: ${m.text.slice(0, 300).replace(/\n/g, ' ')}`).join('\n')}`; },
  decide() { return null; },
  ground(raw, i) {
    const r = raw as { source?: unknown } | null;
    if (!r || typeof r.source !== 'string' || !r.source.trim()) return { source: null };
    const compiled = compileCheck(r.source.slice(0, CHECK_SOURCE_MAX + 1));
    if (!compiled.fn) return null;
    try { compiled.fn(i.example, { request: i.step.text, material: i.material }); compiled.fn(''); } catch { return null; }
    return { source: r.source };
  },
  floor() { return { source: null }; },
};

/** The plan a build hands the method standard: each stated step's check, by the step's text. */
export type StepPlan = ReadonlyMap<string, StepCheck>;

/**
 * THE LEDGER OF A METHOD'S CHECKS, for the build receipt (core/state/receipt.ts, the method stage): how many steps a
 * check holds, each written check that failed with its step and why, what the build settled between the owner and
 * the examples, and who decided (a model where one read; code where a ban was read from its name; else the floor).
 */
export interface StepLedger { readonly steps: number; readonly checked: number; readonly by: 'model' | 'code' | 'floor'; readonly failed: readonly string[]; readonly conflicts: readonly string[] }
export function ledgerOf(steps: readonly StepToCheck[], plan: StepPlan, conflicts: readonly string[] = []): StepLedger {
  const checks = steps.map((st) => ({ st, c: plan.get(st.text) ?? floorFor(st) }));
  return { steps: steps.length, checked: checks.filter((x) => x.c.measurement !== null).length,
    by: checks.some((x) => x.c.by === 'model') ? 'model' : checks.some((x) => x.c.by === 'code') ? 'code' : 'floor',
    failed: checks.flatMap((x) => (x.c.attempt ? [`step ${x.st.id}: ${x.c.means}`] : [])), conflicts: [...conflicts] };
}

export const planOf = (steps: readonly StepToCheck[], value: StepCheckOutput): StepPlan => new Map(steps.map((s) => [s.text, value[s.id] ?? floorFor(s)]));
