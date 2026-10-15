// core/method/standard.ts — ONE METHOD AND ONE FINISHED EXAMPLE, TURNED INTO REQUIREMENTS A RUN CAN BE HELD TO.
//
// A method says what is done: what the work must contain, what it must be made from, what is weighed before a
// conclusion. One finished example shows the method carried out once. Neither is a body of work to read a taste
// from, and nothing here pretends otherwise: no rule about how the author sounds is read off one piece.
//
// EACH STEP THE OWNER STATED becomes a requirement in their own words, and is one of three kinds:
//
//   DELIVERABLE   the output must hold something: these sections, this table. Read by code, on the output.
//   EXECUTION     the work must have been made from what was given: every figure is in the material. Counted only
//                 where an artifact shows it. A step carried out in the writer's head leaves none, and is not this.
//   JUDGEMENT     everything else. Stated, shown to the writer, reported as not measured. Never called checked.
//
// A STEP THE OWNER STATED KEEPS ITS CHECK WHATEVER THEIR EXAMPLE DOES. What they say is required is required. Where
// their own finished work does not do it, either the rule is newer than the work or the step was read as something
// they did not mean: the disagreement is carried with the step (`conflict`) and put to them once, before anything
// is built (cli/commands/method.ts). It is never settled here, in either direction.
//
// WHAT THE EXAMPLE SHOWS AND THE METHOD DID NOT SAY (its sections in order, its tables, that its figures are all in
// the material) is proposed, never assumed: one example cannot tell a habit from an accident.
//
// No model is called. A step is linked to a check by its own words (it names a section the example has, a table,
// sources), and a step that names none of these is a judgement. Narrow on purpose: a link that is not plainly there
// is not made.

import type { Requirement, Measurement } from '../state/canonical-state.js';
import type { GoldenCase } from '../golden/case.js';
import { measure, type CheckContext } from '../observers/registry.js';
import { headingsOf, sectionHeadsOf, sectionBodyOf } from '../observers/structure.js';
import { proseWords } from '../observers/style.js';
import { ownLengthBand } from '../intake/length.js';
import { PER_ROLE_LIMIT } from '../observers/selection.js';
import { tablesOf, figuresOf, targetOf } from '../observers/obligations.js';
import { citesLines } from '../loop/locators.js';
import { deriveMeasuredRules, piecesBreaking } from '../observers/derive.js';
import { isShortForm, shapeBandRules, pooledRateRules, shortFormLimits, shortFormBrief, type ShapeBandRule, type PooledRateRule, type ShortFormOptions } from '../observers/short-form.js';
import { allowed, CORPUS_RULE_SHARE } from '../ratification/suggest.js';
import { machineTellRule } from '../observers/contrast.js';
import { PATTERN_LABEL } from '../observers/style.js';
import { grammarMeasurement, grammarStatus, piecesWithErrors, termsOf, GRAMMAR_STATEMENT } from '../observers/grammar.js';
import { norm, lowered, tableColumns, isConditional, sectionsPlaced, sectionsNamed, sectionsOutright, optionsOf, statedCount, sectionLength, sectionsOpening, citesPlaces, namesTest } from './step-readers.js';

export type Obligation = NonNullable<Requirement['obligation']>;

export interface MethodStep {
  /** the step in the owner's words, one sentence or one list item */
  readonly text: string;
  /** the heading of the note it stands under, when it has one */
  readonly under: string | null;
}

/**
 * THE STEPS OF A METHOD NOTE, in order. A list item is a step. Where the note has no list, each sentence of its
 * paragraphs is. Headings are not steps: they say what the steps under them are about. Front matter, code and
 * tables are left out.
 */
export function stepsOf(note: string): MethodStep[] {
  const body = (note.charCodeAt(0) === 0xFEFF ? note.slice(1) : note).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const lines = body.split(/\r?\n/);
  const items: MethodStep[] = []; const prose: MethodStep[] = [];
  let under: string | null = null; let open: string[] | null = null; let para: string[] = [];
  const closeItem = (): void => { if (open) { const text = open.join(' ').replace(/\s+/g, ' ').trim(); if (text) items.push({ text, under }); open = null; } };
  const closePara = (): void => {
    const text = para.join(' ').replace(/\s+/g, ' ').trim(); para = [];
    if (!text) return;
    for (const s of text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)) if (s.trim().split(/\s+/).length >= 3) prose.push({ text: s.trim(), under });
  };
  // THE NOTE'S TITLE IS NOT A STEP: its first line, when that is a name and not a sentence (no full stop, a blank
  // line under it). "Competitive analysis — how we do it" was shown to the owner as a step nobody can follow.
  const firstAt = lines.findIndex((l) => l.trim());
  // Not a rule ("Always open with the verdict") and not an instruction ("Open with a Summary section"): those are steps
  // however they are punctuated. And only above something: a note of one line is its one step.
  const first = firstAt === -1 ? '' : lines[firstAt].trim();
  const titled = firstAt !== -1 && !/^(?:[-*+]|\d+[.)]|#{1,6})\s/.test(first) && !/[.!?:;]$/.test(first) && first.split(/\s+/).length <= 10
    && !(lines[firstAt + 1] ?? '').trim() && lines.slice(firstAt + 1).some((l) => l.trim())
    && !/\b(?:must|never|always|do not|don't|required?|shall|only)\b/i.test(first)
    && !/^(?:open|start|begin|lead|end|close|finish|conclude|include|add|write|keep|give|put|use|state|list|name|say|check|make|call|flag|ask|point|prefer|separate|weigh|size|then)\b/i.test(first);
  for (const [at, line] of lines.entries()) {
    if (titled && at === firstAt) continue;
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) { closeItem(); closePara(); under = heading[1].replace(/[*_`]/g, '').trim(); continue; }
    // What the work needs before it starts is not a step of it: a list of inputs says what to bind, not what to do.
    if (under !== null && /^(?:required\s+)?(?:inputs?|prerequisites?)$/i.test(under.trim())) continue;
    if (/^\s*\|/.test(line)) { closeItem(); closePara(); continue; }
    if (item) { closeItem(); closePara(); open = [item[1]]; continue; }
    if (!line.trim()) { closeItem(); closePara(); continue; }
    if (open) open.push(line.trim()); else para.push(line.trim());
  }
  closeItem(); closePara();
  const clean = (s: MethodStep): MethodStep => ({ ...s, text: s.text.replace(/\*\*|__|`/g, '').replace(/^\[[ x]\]\s*/i, '').trim() });
  // WHERE A NOTE HAS A LIST, ITS PROSE IS MOSTLY EXPLANATION, and a sentence of it is a step only when it says so
  // (must, never, always, do not, required). Taken whole, a template's description became a dozen judgement steps;
  // dropped whole, an instruction written as a sentence under a heading was lost.
  const RULE = /\b(?:must|never|always|do not|don't|required?|shall|only)\b/i;
  // A sentence that DESCRIBES the work holds those words too ("read by a registrar who has never met the patient"):
  // inside a clause about someone or something else, the word instructs nobody.
  const DESCRIBES = /\b(?:(?:who|whom|whose)\s+(?:\w+\s+){0,3}|(?:which|that)\s+(?:has|have|had|is|are|was|were)\s+(?:\w+\s+){0,2})(?:never|always|only|must|shall)\b/i;
  const instructs = (t: string): boolean => RULE.test(t) && !(DESCRIBES.test(t) && !RULE.test(t.replace(DESCRIBES, ' ')));
  const steps = items.length ? [...items, ...prose.filter((s) => instructs(s.text))] : prose;
  const seen = new Set<string>();
  // A TEMPLATE'S BLANKS ARE NOT STEPS. "> One-line: [What this competitor is, who they serve] > Evidence ceiling:
  // [Decision-grade / Usable]" is a form to fill in: where the bracketed blanks are most of a line, it instructs nobody.
  // Told by what is left when the blanks are taken out: only labels ("One-line:", "Evidence ceiling:"). A step that
  // names a blank to fill ("Open with [the client] and [the date].", "Tag it [URGENT] or [ROUTINE]") still instructs,
  // and a link is not a blank.
  const BLANK = /\[[^\]]{2,}\](?!\()|\{[^}]{2,}\}|<[^<>]{2,}>|_{3,}(?:\s*\([^)]*\))?/g;
  const blanks = (t: string): boolean => { const left = t.replace(BLANK, ' '); return left !== t && /^(?:\s*>?\s*[\p{L}\p{N}' /-]{1,48}:\s*>?\s*)+$/u.test(left); };
  return steps.filter((s) => !blanks(s.text)).map(clean).filter((s) => s.text.length >= 8 && !seen.has(s.text.toLowerCase()) && Boolean(seen.add(s.text.toLowerCase())));
}

/** A section's name as a rule can carry it: the heading without what is particular to one piece (a bracket, a subtitle). */
const sectionName = (heading: string): string => heading.replace(/\s*[(:—–].*$/, '').replace(/[*_`]/g, '').trim();

/** What one finished example shows of its own shape: its sections in order, and its tables. */
export function outlineOf(reference: string): { sections: string[]; tables: ReturnType<typeof tablesOf>; labels: boolean } {
  const seen = new Set<string>(); const sections: string[] = [];
  // WORK THAT MARKS ITS SECTIONS WITH LABELS, NOT HEADINGS (a handover note, a contract, a review) is read as it is
  // written: with no heading in it and two labels or more, its labels are its sections, and its checks say so.
  const labels = headingsOf(reference).length === 0 && sectionHeadsOf(reference, true).length >= 2;
  for (const h of sectionHeadsOf(reference, labels)) { const name = sectionName(h.text); if (name.length >= 3 && !seen.has(norm(name))) { seen.add(norm(name)); sections.push(name); } }
  return { sections, tables: tablesOf(reference), labels };
}

/**
 * The check that named sections are in the work. Each must hold something: a bare heading is not the section. Where
 * the step says where ("open with", "end with"), the place is part of the check.
 */
function sectionsCheck(sections: readonly string[], outline: ReturnType<typeof outlineOf>, where: { opens?: boolean; closes?: boolean; options?: readonly string[] } = {}): Measurement {
  return { observer: 'PRESENCE', params: { sections: [...sections], body: 1, ...(where.opens ? { opens: 1 } : {}), ...(where.closes ? { closes: 1 } : {}), ...(outline.labels ? { labels: 1 } : {}),
    ...(where.options?.length && sections.length === 1 ? { options: [...where.options] } : {}) } };
}

export interface MethodProposal {
  readonly statement: string;
  /** STATED: the owner's own step. SHOWN_BY_EXAMPLE: read off the finished example, and theirs to accept */
  readonly origin: 'STATED' | 'SHOWN_BY_EXAMPLE';
  readonly obligation: Obligation;
  readonly measurement: Measurement | null;
  /** how the finished example fares on the check, in words; null when there is none */
  readonly onExample: string | null;
  /**
   * A stated step whose check the owner's own finished work does not pass, with which pieces and what was found.
   * THE STEP STANDS AS WRITTEN: what the owner says is required is required, and their examples are evidence about
   * the examples. The disagreement is shown once, at the build, for them to keep the rule or change it.
   */
  readonly conflict: string | null;
  /**
   * The check was tied to the step by a section name of the example, not by the step's wording alone ("State the
   * constraints in a Regulation section"). A reading of what the owner meant: said beside the step on the build screen.
   */
  readonly byName?: true;
  /** The check was tied to the step by its subject (sources, figures), not by what it asks: near the rule, and not the rule. */
  readonly related?: true;
  /**
   * Counted off the examples and said by no step: how the pieces are written (a sentence length, a paragraph cap, a
   * word never used). A rule of style, not a part of the work: shown, used to choose between drafts, and repaired
   * by rewriting a sentence where the owner makes it required.
   */
  readonly counted?: true;
  /**
   * Required whatever was read: the owner's standing rule that output adds no machine tell the author does not write
   * (`tellOffers`). The only rule read off the examples that is required without the owner ruling on it.
   */
  readonly required?: true;
  /** The platform's character limit, stated apart because some of the author's own pieces run past it: required, and not their habit. */
  readonly platform?: true;
}

const SOURCING = /\b(?:cit(?:e|es|ed|ation)|sourc(?:e|es|ed|ing)|attribut\w+|referenc\w+)\b/i;
/** A word for a figure itself: what the lookup in the material reads. A claim is not one. */
const FIGURES = /\b(?:figure|number|statistic|stat|data|metric|price|pricing|revenue|percent\w*|quantit\w+)s?\b/i;
const ABOUT_FIGURES = /\b(?:figure|number|statistic|stat|data|claim|metric|price|pricing|revenue|percent\w*|quantit\w+)s?\b/i;

/**
 * The check a stated step names by its own words, or null. A step that names sections the example has is about
 * those sections; one that speaks of a table is about the example's table whose columns it names (or its only
 * table); one that speaks of sources for figures is about the material.
 */
function checkNamedBy(step: string, outline: ReturnType<typeof outlineOf>, how: { byName?: boolean; related?: boolean } = {}): Measurement | null {
  const said = ` ${norm(step)} `;
  // WHAT THE STEP NAMES OUTRIGHT COMES FIRST, whether or not the example has it: "a Risks section", "a table with the
  // columns A, B and C". Read only from the example, a step that names a column the example lacks was given the
  // example's own table and marked as held.
  const columns = tableColumns(step);
  if (columns.length >= 2) return { observer: 'TABLE', params: { columns, minRows: 1 } };
  const conditional = isConditional(step);
  const low = lowered(step);
  const found = conditional ? [] : sectionsPlaced(step, outline.sections);
  const named = conditional ? [] : sectionsNamed(step);
  // The example's own names decide only when they cover everything the step names outright: "open with a Glossary
  // section and include a Summary section", over an example with no Glossary, is the owner's to settle below.
  // A section the step names with a capital and the example does not have ("and a Glossary section") is not dropped:
  // the check asks for it too, the example fails it, and the owner is asked.
  const outright = sectionsOutright(step, outline.sections);
  if (found.length && outright.length && !conditional) return sectionsCheck([...found.map((x) => x.sec), ...outright], outline);
  if (found.length && named.every((x) => found.some((f) => f.name === norm(x.name)))) {
    // Tied by the example's own name where the step's wording alone would not have said it: a reading, said as one.
    how.byName = found.some((f) => !named.some((x) => norm(x.name) === f.name));
    // Where is said by the verb that introduces the name, and by nothing else.
    const before = (x: { at: number }): string => low.slice(0, x.at + 1);
    const opens = /\b(?:opens?|starts?|begins?|leads?)(?: with)? $/.test(before(found[0]));
    const closes = /\b(?:ends?|closes?|finish(?:es)?|concludes?)(?: with)? $/.test(before(found[found.length - 1]));
    return sectionsCheck(found.map((x) => x.sec), outline, { opens, closes: closes && !(opens && found.length === 1), options: optionsOf(step) });
  }
  const sections = named.map((x) => x.name).filter((n, i, all) => all.findIndex((o) => norm(o) === norm(n)) === i);
  if (sections.length) {
    // Where is said by the verb, and by nothing else: "listing the first three risks" says nothing of where.
    const opens = /^(?:open|start|begin|lead)/.test(named[0].verb);
    const closes = /^(?:end|close|finish|conclude)/.test(named[named.length - 1].verb);
    return sectionsCheck(sections, outline, { opens, closes: closes && !(opens && sections.length === 1), options: optionsOf(step) });
  }
  // A STEP THAT ASKS FOR A TABLE ("include a table of…", "holds one table") is held to the example's. One that speaks
  // of a table already there ("three to five rows in that table", "right below the table") asks for something else,
  // which nothing here reads: tied to the table's columns, its check read what the step does not ask.
  if (/\b(?:an?|one|two|three|\d+)\s+(?:[\w-]+\s+){0,3}tables?\b|\btables?\s+(?:with|of|showing|comparing|listing)\b/i.test(step) && outline.tables.length) {
    const columnsSaid = (t: (typeof outline.tables)[number]): number => t.header.filter((h) => h.length >= 3 && said.includes(` ${norm(h)} `)).length;
    const best = [...outline.tables].sort((a, b) => columnsSaid(b) - columnsSaid(a))[0];
    if (columnsSaid(best) > 0 || outline.tables.length === 1) return { observer: 'TABLE', params: { columns: best.header.filter(Boolean), minRows: 1 } };
  }
  // A count in a step that opens on one of the example's sections is that section's. Where it could not be read as
  // the section's length, it is not thereby the whole work's: it is the owner's to judge.
  const whole = (m: Measurement | null): Measurement | null => (m?.observer === 'LENGTH' && !m.params.in && sectionsOpening(step, outline.sections).length ? null : m);
  const counted = sectionLength(step, outline.sections) ?? whole(statedCount(step));
  // Where the example's sections are labels, a section's length is read between them: the check carries their names.
  if (counted) return outline.labels && counted.observer === 'LENGTH' && counted.params.in ? { ...counted, params: { ...counted.params, labels: 1, sections: [...outline.sections] } } : counted;
  // A step that asks for citations of places ("cite each item as path:line", "point to the line", "give the file and
  // line", "every finding points at the code") is held by looking each one up (./step-readers.ts, `citesPlaces`).
  // Not where the step forbids the form or asks for it only sometimes ("do not cite as path:line", "where there is
  // one"). And "each item" is not "at least one": a review with nothing to fix cites nothing, and holds the step.
  // Where the step asks for one on EVERY finding ("each finding cites its line"), each finding is read for one too:
  // under the section the step names where it names one of the example's, else under the headings that call their
  // contents findings. Whether the cited line supports the finding is never read.
  const cites = citesPlaces(step, citesLines, outline.sections);
  if (cites) return { observer: 'LINES', params: { min: 0, ...(cites.perItem ? { perItem: 1, ...(cites.sections.length ? { sections: cites.sections } : {}) } : {}) } };
  // A step that asks the work to name a test ("name the test that would have caught it", "suggest a test") is held
  // by looking for one: a test file, or a test function or case in backticks. Which test is the right one is not read.
  if (namesTest(step)) return { observer: 'NAMES_TEST', params: {} };
  // A STEP THAT SPEAKS OF SOURCES AND OF FIGURES is given the lookup of figures in the material. That is the step's
  // subject, not what it asks: "name the source the first time I cite a figure" is not broken by a figure the
  // material lacks. The check is kept, shown, and marked as near the rule: it blocks nothing.
  // It IS what the step asks where the figures are what the step is about and the source is where they must come
  // from: "every figure must be sourced from the material", "keep numbers as they appeared at source". Said of
  // figures first, then of the source. Anything else (a claim, or the source named before the figure) is near it.
  if (SOURCING.test(step) && ABOUT_FIGURES.test(step)) {
    const figures = step.search(FIGURES); const source = step.search(SOURCING);
    how.related = !(figures !== -1 && figures < source);
    return { observer: 'CITED', params: { allow: 0 } };
  }
  return null;
}

/**
 * THE REQUIREMENTS ONE METHOD AND ONE EXAMPLE SUPPORT, in the order a person reads them: the owner's steps first,
 * then what the example shows that no step said.
 */
export function methodProposals(note: string, example: Pick<GoldenCase, 'task' | 'material' | 'reference'>): MethodProposal[] {
  const outline = outlineOf(example.reference);
  const context: CheckContext = { ...(example.task ? { request: example.task } : {}), material: example.material };
  const read = (m: Measurement): { verdict: string; detail: string } => { const r = measure(example.reference, m, context); return { verdict: r.verdict, detail: r.detail }; };
  const out: MethodProposal[] = []; const claimed = new Set<string>(); const claimedSections = new Set<string>();
  // A step the example does not hold keeps its check: the owner stated it. What the example did is said beside it.
  // (A check against the material says nothing of an example handed over without its material.)
  const unreadable = (m: Measurement): boolean => targetOf(m.observer) === 'BOUND_MATERIAL' && !example.material.length;
  const against = (r: { verdict: string; detail: string }, m: Measurement): string | null => (r.verdict === 'VIOLATED' && !unreadable(m) ? `your example does not do this (${r.detail})` : null);
  for (const step of stepsOf(note)) {
    const how: { byName?: boolean; related?: boolean } = {};
    const m = checkNamedBy(step.text, outline, how);
    if (!m) { out.push({ statement: step.text, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: null, conflict: null }); continue; }
    const r = read(m);
    claimed.add(m.observer === 'TABLE' ? `TABLE:${(m.params.columns as readonly string[]).join('|')}` : m.observer);
    if (m.observer === 'PRESENCE') for (const sec of ((m.params.sections as readonly string[] | undefined) ?? [])) claimedSections.add(norm(sec));
    out.push({ statement: step.text, origin: 'STATED', obligation: targetOf(m.observer) === 'BOUND_MATERIAL' ? 'EXECUTION' : 'DELIVERABLE', measurement: m, onExample: unreadable(m) ? 'could not be read on it: it carries no material' : r.detail, conflict: against(r, m), ...(how.byName ? { byName: true as const } : {}), ...(how.related ? { related: true as const } : {}) });
  }
  // WHAT THE NOTE LAYS OUT AS A TEMPLATE: its own section headings and its own tables are the owner saying what the
  // work contains, as plainly as a sentence would. Each is held against the example like any stated step: sections
  // the example also has become one requirement, and a table whose columns the example's tables do not carry is kept
  // as a question, because the template and the finished work disagree and only the owner knows which is right.
  // In the NOTE's order: the owner wrote the template in that order. Where the example holds the same sections in
  // another order, the two disagree, and that is asked, not settled here.
  const noteSections = headingsOf(note).map((h) => sectionName(h.text.replace(/^(?:part|step|section)\s+\d+\s*[:.)-]\s*/i, ''))).filter((n) => n.length >= 5);
  const shared = noteSections.filter((n, i) => noteSections.findIndex((x) => norm(x) === norm(n)) === i).filter((n) => outline.sections.some((sec) => norm(sec) === norm(n)) && !claimedSections.has(norm(n)));
  if (shared.length >= 2) {
    const m = sectionsCheck(shared, outline);
    const r = read(m); const statement = `The work has these sections, in this order: ${shared.join(', ')}.`;
    for (const n of shared) claimedSections.add(norm(n));
    out.push({ statement, origin: 'STATED', obligation: 'DELIVERABLE', measurement: m, onExample: r.detail, conflict: against(r, m) });
  }
  for (const t of tablesOf(note)) {
    // A template's cells are placeholders; its header is the statement.
    const columns = t.header.filter((c) => c && !/^[[<].*[\]>]$/.test(c));
    if (columns.length < 2 || claimed.has(`TABLE:${columns.join('|')}`)) continue;
    const m: Measurement = { observer: 'TABLE', params: { columns, minRows: 1 } };
    const r = read(m); const statement = `The work includes a table with the columns ${columns.join(', ')}.`;
    claimed.add(`TABLE:${columns.join('|')}`);
    out.push({ statement, origin: 'STATED', obligation: 'DELIVERABLE', measurement: m, onExample: r.detail, conflict: against(r, m) });
  }
  // WHAT THE EXAMPLE SHOWS AND NO STEP SAID. Proposed in plain words, each with the check it would carry.
  const unsaid = outline.sections.filter((sec) => !claimedSections.has(norm(sec)) && ![...claimedSections].some((c) => norm(sec).includes(c)));
  if (unsaid.length >= 2) {
    const m = sectionsCheck(unsaid, outline);
    if (read(m).verdict === 'MET') out.push({ statement: `The work has these sections, in this order: ${unsaid.join(', ')}.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: m, onExample: read(m).detail, conflict: null });
  }
  for (const t of outline.tables) {
    const columns = t.header.filter(Boolean);
    const stated = [...claimed].filter((c) => c.startsWith('TABLE:')).map((c) => c.slice(6).split('|'));
    if (!columns.length || stated.some((cols) => cols.every((c) => columns.some((h) => h.includes(c))))) continue;
    // A column named after something in this example's own task or material (a company, a product) belongs to this
    // piece of work, not to the method: the next piece will have other names.
    const given = ` ${norm([example.task ?? '', ...example.material.map((x) => x.text)].join(' '))} `;
    // A name is a word the task and the material never write in lower case.
    const givenRaw = [example.task ?? '', ...example.material.map((x) => x.text)].join(' ');
    const lower = new Set(givenRaw.match(/\b[a-z][a-zA-Z]{3,}\b/g) ?? []);
    const proper = new Set((givenRaw.match(/\b[A-Z][a-zA-Z]{3,}\b/g) ?? []).map((w) => w.toLowerCase()).filter((w) => !lower.has(w)));
    // And a name the piece itself keeps using: capitalised in the middle of a sentence three times or more, and
    // never written small. An example handed over without its task still names the company it is about.
    const small = new Set(example.reference.match(/\b[a-z][a-zA-Z]{3,}\b/g) ?? []); const mid = new Map<string, number>();
    for (const m of example.reference.matchAll(/(?<=[a-z,;] )([A-Z][a-zA-Z]{3,})\b/g)) mid.set(m[1], (mid.get(m[1]) ?? 0) + 1);
    // Not a word that is itself a column's whole name anywhere in the piece ("Severity", "March"): that is a label the
    // piece uses, capitalised because it is one. A name sits inside a longer heading ("Significance to Payloom").
    const labels = new Set(outline.tables.flatMap((x) => x.header.map((h) => norm(h))));
    const named = new Set([...mid].filter(([w, k]) => k >= 3 && !small.has(w.toLowerCase()) && !labels.has(w.toLowerCase())).map(([w]) => w.toLowerCase()));
    if (columns.some((c) => norm(c).split(' ').length > 1 && norm(c).split(' ').some((w) => named.has(w)))) continue;
    if (columns.some((c) => norm(c).split(' ').some((w) => proper.has(w) && given.includes(` ${w} `)))) continue;
    const m: Measurement = { observer: 'TABLE', params: { columns, minRows: 1 } };
    out.push({ statement: `The work includes a table with the columns ${columns.join(', ')}.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: m, onExample: read(m).detail, conflict: null });
  }
  if (!claimed.has('CITED') && example.material.length && figuresOf(example.reference).length >= 3) {
    const m: Measurement = { observer: 'CITED', params: { allow: 0 } };
    const r = read(m);
    if (r.verdict === 'MET') out.push({ statement: 'Every figure in the work is one the request or the material gives.', origin: 'SHOWN_BY_EXAMPLE', obligation: 'EXECUTION', measurement: m, onExample: r.detail, conflict: null });
  }
  return out;
}

/**
 * THE SAME METHOD, HELD AGAINST EVERY EXAMPLE. Two kinds of rule, held two ways. What was read OFF an example is a
 * reading, and the owner's other finished pieces are the test of it: what one shows and another does not was that
 * piece's own, and is dropped. What the owner STATED is theirs: it keeps its check whatever their pieces do, and the
 * pieces that do not do it are counted and named beside it (`conflict`), once, at the build. An owner told that a
 * rule they wrote fails three of their twelve pieces can keep the rule or change it; a machine that quietly stopped
 * checking it has changed what they meant by good.
 *
 * A check read against what a piece was made from is read only on the examples that carry their material: a piece
 * handed over without its sources says nothing about whether its figures were given. The count says which it is.
 */
export function acrossExamples(proposals: readonly MethodProposal[], others: readonly (Pick<GoldenCase, 'task' | 'material' | 'reference'> & { readonly id: string })[], leadId?: string): MethodProposal[] {
  if (!others.length) return [...proposals];
  return proposals.flatMap((p): MethodProposal[] => {
    const m = p.measurement;
    if (!m) return [p];
    const bound = targetOf(m.observer) === 'BOUND_MATERIAL';
    const results = others.filter((c) => !bound || c.material.length).map((c) => ({ id: c.id, r: measure(c.reference, m, { ...(c.task ? { request: c.task } : {}), material: c.material } satisfies CheckContext) }))
      .filter((x) => x.r.verdict !== 'NOT_APPLICABLE');
    const fails = results.filter((x) => x.r.verdict === 'VIOLATED'); const n = results.length + 1; const all = others.length + 1;
    const on = n === all ? `your ${all} examples` : `the ${n} of your ${all} examples it can be read on${bound ? ' (those that carry their material)' : ''}`;
    if (!fails.length && !p.conflict) return [{ ...p, onExample: n === all ? `held in all ${all} of your examples` : `held in all ${n} of your ${all} examples it can be read on${bound ? ' (those that carry their material)' : ''}` }];
    // EXAMPLE AGREEMENT GATES ONLY WHAT WAS READ FROM THE EXAMPLES. What one piece shows and another does not was that
    // piece's own, and is dropped. What the owner stated stands, with the pieces that do not do it named.
    if (p.origin === 'SHOWN_BY_EXAMPLE') return [];
    const lead = p.conflict ? [p.conflict.replace(/^your example does not do this /, `${leadId ?? 'the first'} `)] : [];
    const named = [...lead, ...fails.map((x) => `${x.id} (${x.r.detail})`)]; const k = named.length;
    return [{ ...p, onExample: `held in ${n - k} of ${on}`,
      conflict: `${k} of your examples ${k === 1 ? 'does' : 'do'} not do this: ${named.slice(0, 3).join('; ')}${k > 3 ? `; and ${k - 3} more` : ''}` }];
  });
}

/**
 * WHICH EXAMPLE THE CHECKS ARE READ FROM. A check is read off one example, and read off the odd one out (the piece
 * that happens to lack a section the other eleven have) the step was left a judgement and nobody was asked. So each
 * example is tried as the one read from, and the one under which the most stated steps are read as checks (held by
 * all, or broken by some and so put to the owner) is taken; the first by name where several do equally. The owner's steps do not change, only which
 * piece they are read against.
 */
export function proposalsAcross(note: string, cases: readonly (Pick<GoldenCase, 'task' | 'material' | 'reference'> & { readonly id: string })[]): { lead: number; proposals: MethodProposal[] } {
  let best = { lead: 0, proposals: [] as MethodProposal[], held: -Infinity };
  cases.forEach((c, i) => {
    const proposals = acrossExamples(methodProposals(note, c), cases.filter((_, k) => k !== i), c.id);
    // The most steps read as checks; among equals, the piece the fewest of them disagree with.
    const held = proposals.filter((p) => p.origin === 'STATED' && p.measurement).length * 1000 - proposals.filter((p) => p.conflict).length;
    if (held > best.held) best = { lead: i, proposals, held };
  });
  return { lead: best.lead, proposals: best.proposals };
}

/**
 * HOW THE EXAMPLES ARE WRITTEN, COUNTED: the measurable part of a voice (../observers/derive.ts), read off the
 * finished pieces with no model. Offered beside the method, never as part of it: the owner wrote steps about what
 * the work holds, and these are what their pieces show about how it is written. Only a count every one of the
 * pieces meets is offered, and none on fewer than three pieces or on too little text to count from.
 */
export function countedFromExamples(cases: readonly (Pick<GoldenCase, 'reference'> & { readonly id: string })[]): MethodProposal[] {
  if (cases.length < 3) return [];
  const texts = cases.map((c) => c.reference);
  // Not the length of a sentence: a count is not a rhythm, and pace is a rule only where it is a detected signature
  // (../observers/rhythm-signature.ts), which a build that calls no model does not read.
  return deriveMeasuredRules(cases.map((c) => ({ id: c.id, text: c.reference })), [], 'MACHINE_DISCOVERED')
    .filter((m) => m.requirement.measurement && !['SENTENCE_LENGTH', 'RHYTHM', 'DISTRIBUTION'].includes(m.requirement.measurement.observer) && piecesBreaking(texts, m.requirement.measurement).length === 0)
    .map((m) => ({ statement: m.requirement.statement, origin: 'SHOWN_BY_EXAMPLE' as const, obligation: 'DELIVERABLE' as const, measurement: m.requirement.measurement ?? null,
      onExample: `set where all ${cases.length} of your examples meet it`, conflict: null, counted: true as const }));
}

/**
 * HOW LONG EACH SECTION RUNS, WHERE THE EXAMPLES KEEP ONE. Twelve explainers each held their "How it works" section
 * to 61 to 76 words, nothing measured a section, and the skill wrote 98 to 122. For a section every example has,
 * the span of its lengths is offered as how the pieces are written (shown, not required), widened as the length of
 * a whole piece is (`ownLengthBand`). Not for a section whose longest is twice its shortest or more: a part that
 * doubles from one piece to the next has no usual length.
 */
export function sectionLengthsFromExamples(cases: readonly (Pick<GoldenCase, 'reference'> & { readonly id: string })[]): MethodProposal[] {
  if (cases.length < 3) return [];
  const outlines = cases.map((c) => outlineOf(c.reference));
  const labels = outlines.every((o) => o.labels);
  const shared = outlines[0].sections.filter((sec) => outlines.every((o) => o.sections.some((x) => norm(x) === norm(sec))));
  return shared.flatMap((sec): (MethodProposal & { spread: number })[] => {
    const lengths = cases.map((c) => proseWords(sectionBodyOf(c.reference, sec, labels, shared) ?? ''));
    const lo = Math.min(...lengths); const hi = Math.max(...lengths); const band = ownLengthBand([lo, hi]);
    // Not a section every piece writes word for word alike (a one-word verdict): that is wording, not a length.
    if (!band || lo < 1 || hi === lo || hi >= lo * 2) return [];
    return [{ statement: `The ${sec} section runs ${lo} to ${hi} words in my pieces.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', counted: true, conflict: null, spread: hi / lo,
      measurement: { observer: 'LENGTH', params: { unit: ['words'], in: [sec], min: band[0], max: band[1], ...(labels ? { labels: 1, sections: [...shared] } : {}) } },
      onExample: `set where all ${cases.length} of your examples meet it` }];
    // The most even first: where there are more than a skill should carry, those are the habits.
  }).sort((a, b) => a.spread - b.spread).map(({ spread: _spread, ...p }) => p);
}

/**
 * EVERYTHING COUNTED FROM THE EXAMPLES THAT A BUILD OFFERS: how the pieces are written, then how long their sections
 * run, less any section whose length the owner already stated, and no more than a skill carries of one kind
 * (../observers/selection.ts, `PER_ROLE_LIMIT`): served all at once, rules crowd each other out.
 */
/**
 * NO ADDED MACHINE TELLS, ON THIS PATH TOO. Discovery from a folder held the rule and a skill built from a method did
 * not: its drafts carried 10 to 23 em dashes a document against an example with none. The rule is the same one
 * (../observers/contrast.ts, `machineTellRule`), worked out from the examples, and required: the moves the author never
 * makes are banned, an em dash only where no example holds one, and one they do write is held to their own rate.
 */
export function tellOffers(cases: readonly (Pick<GoldenCase, 'reference'> & { readonly id: string })[], note = ''): MethodProposal[] {
  const pieces = cases.map((c) => c.reference).filter((t) => t.trim());
  // THE NOTE ALLOWS A MOVE ONLY IN SO MANY WORDS, never by its own style: a note is written as instructions, and pooled
  // with the examples a terse one read as a habit of short sentences. "Use em dashes for asides" allows the dash;
  // "Never use em dashes" does not (a sentence that negates it is no allowance).
  const allowsDash = note.split(/(?<=[.!?\n])\s*/).some((s) => /\b(?:use|keep|allow|write)\b[^.\n]{0,40}\bem[- ]?dash/i.test(s) && !/\b(?:never|no|not|don'?t|do not|avoid|without)\b/i.test(s));
  if (!pieces.length) return [];
  // A move any example makes is the author's (a handful of examples cannot show "most of their pieces"); and the
  // examples must meet the rule they gave (decision 0015), or it is not offered.
  const t = machineTellRule(pieces, { anyUse: true, allow: allowsDash ? ['EM_DASH'] : [] });
  const held = (m: Measurement): boolean => pieces.every((p) => measure(p, m).verdict !== 'VIOLATED');
  const of = (m: Measurement): string => `${pieces.filter((p) => measure(p, m).verdict !== 'VIOLATED').length} of ${pieces.length} example(s) hold it`;
  const tell: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: t.cap, never: t.never, role: ['machine-tell'] } };
  const out: MethodProposal[] = held(tell) ? [{ statement: t.statement, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: tell, onExample: of(tell), conflict: null, counted: true, required: true }] : [];
  if (t.dashCap !== null) {
    const dash: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: t.dashCap } };
    if (held(dash)) out.push({ statement: `Keep ${PATTERN_LABEL.EM_DASH} to at most ${t.dashCap} per 1,000 words, as the examples do.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: dash, onExample: of(dash), conflict: null, counted: true, required: true });
  }
  return out;
}

/**
 * NO MECHANICAL ERRORS, ON THIS PATH TOO (../observers/grammar.ts). The one editorial rule every author holds, stated
 * once on every build and required by default; the owner demotes it like any rule. Read from the examples: the
 * dialect they spell in, and every word the checker would call misspelt in them, which is their vocabulary and is
 * never flagged in new work. Offered whether or not the engine loaded: with none, every check says so, and the rule
 * stands for the day one is wired in.
 */
export function grammarOffer(cases: readonly (Pick<GoldenCase, 'reference'> & { readonly id: string })[], others: readonly MethodProposal[] = []): MethodProposal[] {
  const pieces = cases.map((c) => c.reference).filter((t) => t.trim());
  const measurement = grammarMeasurement(pieces, termsOf(others));
  const status = grammarStatus();
  const broken = status.ready ? piecesWithErrors(pieces, measurement) : 0;
  const onExample = !status.ready ? `not read: ${status.reason}` : broken ? `${broken} of ${pieces.length} example(s) carry a mechanical error beyond their own vocabulary` : `${pieces.length} of ${pieces.length} example(s) hold it; their own words are never flagged`;
  return [{ statement: GRAMMAR_STATEMENT, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement, onExample, conflict: null, counted: true, required: true }];
}

export function countedOffers(stated: readonly MethodProposal[], cases: readonly (Pick<GoldenCase, 'reference'> & { readonly id: string })[], shortForm: ShortFormOptions = {}): MethodProposal[] {
  const said = new Set(stated.flatMap((p) => (p.measurement?.observer === 'LENGTH' ? ((p.measurement.params.in as readonly string[] | undefined) ?? []).map(norm) : [])));
  const sectionsLeft = sectionLengthsFromExamples(cases).filter((p) => !((p.measurement?.params.in as readonly string[] | undefined) ?? []).some((x) => said.has(norm(x))));
  // SHORT PIECES ARE READ FOR THEIR SHAPE AND THEIR POOLED RATES (../observers/short-form.ts), and more of them are
  // offered than of long-form counts: twenty tweets carry a dozen shapes, and each is one line of the skill.
  if (isShortForm(cases.map((c) => c.reference))) return [...shortFormOffers(cases, shortForm).proposals, ...countedFromExamples(cases), ...sectionsLeft].slice(0, SHORT_FORM_OFFER_LIMIT);
  return [...countedFromExamples(cases), ...sectionsLeft].slice(0, PER_ROLE_LIMIT);
}

export type { ShortFormOptions };
/** How many counted offers a skill built from short pieces carries at most: the shapes, the rates, and what else was counted. */
export const SHORT_FORM_OFFER_LIMIT = 20;

/**
 * WHAT SHORT PIECES SHOW: their shape bands and their pooled rates, as offers beside the method, and the limits of the
 * corpus in lines for the build screen. A shape band is required where every example meets it and there are enough
 * examples (`ShapeBandRule.required`); a rate is always a preference. A band the author's own pieces break beyond
 * what the review allows (../ratification/suggest.ts, `allowed`) is not offered: it would be a rule against them.
 */
export function shortFormOffers(cases: readonly (Pick<GoldenCase, 'reference'> & { readonly id: string })[], opts: ShortFormOptions = {}): { proposals: MethodProposal[]; limits: string[]; brief: string | null; shapes: ShapeBandRule[]; rates: PooledRateRule[] } {
  const texts = cases.map((c) => c.reference);
  if (!isShortForm(texts) || texts.length < 3) return { proposals: [], limits: [], brief: null, shapes: [], rates: [] };
  const mayBreak = allowed(texts.length, CORPUS_RULE_SHARE);
  // Pieces that answer requests take their length and shape from the request (../compiler/scope.ts): no band of it.
  const shapes = opts.answers ? [] : shapeBandRules(texts, { limit: opts.limit?.chars ?? null, ...(opts.urlChars !== undefined ? { urlChars: opts.urlChars } : {}) })
    // A band the pieces break is not theirs, and is not offered; a ceiling that is the platform's limit is the owner's
    // fact and is offered whatever the pieces do, with how many of them run past it.
    .filter((s) => s.limited === true || piecesBreaking(texts, s.measurement).length === 0);
  const rates = pooledRateRules(texts).filter((r) => piecesBreaking(texts, r.measurement).length <= mayBreak);
  const met = (m: Measurement): string => { const k = piecesBreaking(texts, m).length; return k === 0 ? `all ${texts.length} of your examples meet it` : `all but ${k} of your ${texts.length} examples meet it`; };
  const proposals: MethodProposal[] = [
    ...shapes.filter((s) => s.platform).map((s): MethodProposal => ({ statement: s.statement, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: s.measurement, conflict: null, counted: true,
      onExample: `${s.evidence}: ${piecesBreaking(texts, s.measurement).map((i) => cases[i].id).join(', ')}`, required: true, platform: true })),
    ...shapes.filter((s) => !s.platform).map((s): MethodProposal => ({ statement: s.statement, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: s.measurement, conflict: null, counted: true,
      onExample: `${s.evidence}; ${met(s.measurement)}${s.required ? '' : `; read from ${texts.length} examples, ${s.more} more would let it block`}`, ...(s.required ? { required: true as const } : {}) })),
    ...rates.map((r): MethodProposal => ({ statement: r.statement, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: r.measurement, conflict: null, counted: true,
      onExample: `${r.evidence}; ${met(r.measurement)}; a rate chooses between drafts and never blocks` })),
  ];
  const answers = opts.answers === true;
  return { proposals, limits: shortFormLimits(texts, shapes, rates, opts.limit ?? null, answers), brief: shortFormBrief(texts, shapes, rates, opts.limit ?? null, answers), shapes, rates };
}
