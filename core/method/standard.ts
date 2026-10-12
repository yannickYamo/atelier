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
// A STEP GETS A CHECK ONLY WHEN THE EXAMPLE PASSES IT. The owner's finished work is the method carried out. A check
// their own example fails is reading something they did not mean, so the step stays theirs, as a judgement, and the
// screen says the example did not hold it as a check reads it: that is a question for the owner, not a rule.
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
import { headingsOf, sectionHeadsOf } from '../observers/structure.js';
import { tablesOf, figuresOf, targetOf } from '../observers/obligations.js';
import { citesLines } from '../loop/locators.js';
import { norm, lowered, tableColumns, isConditional, sectionsPlaced, sectionsNamed, sectionsOutright, optionsOf, statedCount } from './step-readers.js';

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
  return steps.map(clean).filter((s) => s.text.length >= 8 && !seen.has(s.text.toLowerCase()) && Boolean(seen.add(s.text.toLowerCase())));
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
  /** a stated step whose check the example did not pass: kept as the owner's, as a judgement, with why */
  readonly demoted: string | null;
  /**
   * The check was tied to the step by a section name of the example, not by the step's wording alone ("State the
   * constraints in a Regulation section"). A reading of what the owner meant: shown, and built only on their yes.
   */
  readonly byName?: true;
}

const SOURCING = /\b(?:cit(?:e|es|ed|ation)|sourc(?:e|es|ed|ing)|attribut\w+|referenc\w+)\b/i;
const ABOUT_FIGURES = /\b(?:figure|number|statistic|stat|data|claim|metric|price|pricing|revenue|percent\w*|quantit\w+)s?\b/i;

/**
 * The check a stated step names by its own words, or null. A step that names sections the example has is about
 * those sections; one that speaks of a table is about the example's table whose columns it names (or its only
 * table); one that speaks of sources for figures is about the material.
 */
function checkNamedBy(step: string, outline: ReturnType<typeof outlineOf>, how: { byName?: boolean } = {}): Measurement | null {
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
  if (/\btables?\b/i.test(step) && outline.tables.length) {
    const columnsSaid = (t: (typeof outline.tables)[number]): number => t.header.filter((h) => h.length >= 3 && said.includes(` ${norm(h)} `)).length;
    const best = [...outline.tables].sort((a, b) => columnsSaid(b) - columnsSaid(a))[0];
    if (columnsSaid(best) > 0 || outline.tables.length === 1) return { observer: 'TABLE', params: { columns: best.header.filter(Boolean), minRows: 1 } };
  }
  const counted = statedCount(step);
  if (counted) return counted;
  // A step that names the form of a citation ("cite each item as path:line") is held by looking each one up.
  // Not where the step forbids the form or asks for it only sometimes ("do not cite as path:line", "where there is
  // one"). And "each item" is not "at least one": a review with nothing to fix cites nothing, and holds the step.
  if (citesLines(step) && !/\b(?:do not|don't|never|not|no(?!-)|unless|if|when|where|whenever|except|optional(?:ly)?|avoid|without|instead of|rather than)\b/i.test(step)) return { observer: 'LINES', params: { min: 0 } };
  if (SOURCING.test(step) && ABOUT_FIGURES.test(step)) return { observer: 'CITED', params: { allow: 0 } };
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
  for (const step of stepsOf(note)) {
    const how: { byName?: boolean } = {};
    const m = checkNamedBy(step.text, outline, how);
    if (!m) { out.push({ statement: step.text, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: null, demoted: null }); continue; }
    const r = read(m);
    if (r.verdict !== 'MET') {
      out.push({ statement: step.text, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: r.detail,
        demoted: r.verdict === 'NOT_APPLICABLE' ? `it cannot be read on your example (${r.detail})` : `your example does not hold it as a check would read it (${r.detail})` });
      continue;
    }
    claimed.add(m.observer === 'TABLE' ? `TABLE:${(m.params.columns as readonly string[]).join('|')}` : m.observer);
    if (m.observer === 'PRESENCE') for (const sec of ((m.params.sections as readonly string[] | undefined) ?? [])) claimedSections.add(norm(sec));
    out.push({ statement: step.text, origin: 'STATED', obligation: targetOf(m.observer) === 'BOUND_MATERIAL' ? 'EXECUTION' : 'DELIVERABLE', measurement: m, onExample: r.detail, demoted: null, ...(how.byName ? { byName: true as const } : {}) });
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
    if (r.verdict === 'MET') out.push({ statement, origin: 'STATED', obligation: 'DELIVERABLE', measurement: m, onExample: r.detail, demoted: null });
    else out.push({ statement, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: r.detail, demoted: `your example does not hold it as a check would read it (${r.detail})` });
  }
  for (const t of tablesOf(note)) {
    // A template's cells are placeholders; its header is the statement.
    const columns = t.header.filter((c) => c && !/^[[<].*[\]>]$/.test(c));
    if (columns.length < 2 || claimed.has(`TABLE:${columns.join('|')}`)) continue;
    const m: Measurement = { observer: 'TABLE', params: { columns, minRows: 1 } };
    const r = read(m); const statement = `The work includes a table with the columns ${columns.join(', ')}.`;
    if (r.verdict === 'MET') { claimed.add(`TABLE:${columns.join('|')}`); out.push({ statement, origin: 'STATED', obligation: 'DELIVERABLE', measurement: m, onExample: r.detail, demoted: null }); }
    else out.push({ statement, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: r.detail, demoted: `your example does not hold it as a check would read it (${r.detail})` });
  }
  // WHAT THE EXAMPLE SHOWS AND NO STEP SAID. Proposed in plain words, each with the check it would carry.
  const unsaid = outline.sections.filter((sec) => !claimedSections.has(norm(sec)) && ![...claimedSections].some((c) => norm(sec).includes(c)));
  if (unsaid.length >= 2) {
    const m = sectionsCheck(unsaid, outline);
    if (read(m).verdict === 'MET') out.push({ statement: `The work has these sections, in this order: ${unsaid.join(', ')}.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: m, onExample: read(m).detail, demoted: null });
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
    if (columns.some((c) => norm(c).split(' ').some((w) => proper.has(w) && given.includes(` ${w} `)))) continue;
    const m: Measurement = { observer: 'TABLE', params: { columns, minRows: 1 } };
    out.push({ statement: `The work includes a table with the columns ${columns.join(', ')}.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: m, onExample: read(m).detail, demoted: null });
  }
  if (!claimed.has('CITED') && example.material.length && figuresOf(example.reference).length >= 3) {
    const m: Measurement = { observer: 'CITED', params: { allow: 0 } };
    const r = read(m);
    if (r.verdict === 'MET') out.push({ statement: 'Every figure in the work is one the request or the material gives.', origin: 'SHOWN_BY_EXAMPLE', obligation: 'EXECUTION', measurement: m, onExample: r.detail, demoted: null });
  }
  return out;
}

/**
 * THE SAME METHOD, HELD AGAINST EVERY EXAMPLE. A check read off one example and the note is a reading; the owner's
 * other finished pieces are the test of it. A stated step keeps its check only when every example it can be read on
 * holds it: one that does not is the owner's to settle, exactly as when the single example fails, with the count
 * and the pieces named. What one example shows and the others do not was that piece's own, and is dropped. An owner
 * who hands over twelve pieces and is told a required rule fails three of them has been given the wrong rule, so no
 * such rule is built.
 *
 * A check read against what a piece was made from is read only on the examples that carry their material: a piece
 * handed over without its sources says nothing about whether its figures were given. The count says which it is.
 */
export function acrossExamples(proposals: readonly MethodProposal[], others: readonly (Pick<GoldenCase, 'task' | 'material' | 'reference'> & { readonly id: string })[]): MethodProposal[] {
  if (!others.length) return [...proposals];
  return proposals.flatMap((p): MethodProposal[] => {
    const m = p.measurement;
    if (!m || p.demoted) return [p];
    const bound = targetOf(m.observer) === 'BOUND_MATERIAL';
    const results = others.filter((c) => !bound || c.material.length).map((c) => ({ id: c.id, r: measure(c.reference, m, { ...(c.task ? { request: c.task } : {}), material: c.material } satisfies CheckContext) }))
      .filter((x) => x.r.verdict !== 'NOT_APPLICABLE');
    const fails = results.filter((x) => x.r.verdict === 'VIOLATED'); const n = results.length + 1; const all = others.length + 1;
    const on = n === all ? `your ${all} examples` : `the ${n} of your ${all} examples it can be read on${bound ? ' (those that carry their material)' : ''}`;
    if (!fails.length) return [{ ...p, onExample: n === all ? `held in all ${all} of your examples` : `held in all ${n} of your ${all} examples it can be read on${bound ? ' (those that carry their material)' : ''}` }];
    if (p.origin === 'SHOWN_BY_EXAMPLE') return [];
    const named = fails.slice(0, 3).map((x) => `${x.id} (${x.r.detail})`).join('; ');
    return [{ statement: p.statement, origin: p.origin, obligation: 'JUDGEMENT', measurement: null, onExample: `held in ${n - fails.length} of ${on}`,
      demoted: `${fails.length} of your examples do not hold it as a check would read it: ${named}${fails.length > 3 ? `; and ${fails.length - 3} more` : ''}` }];
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
  let best = { lead: 0, proposals: [] as MethodProposal[], held: -1 };
  cases.forEach((c, i) => {
    // A step the piece read from breaks is said by that piece's name, as one another piece breaks is.
    const read = methodProposals(note, c).map((p) => (cases.length > 1 && p.demoted ? { ...p, demoted: p.demoted.replace(/\byour example\b/, c.id) } : p));
    const proposals = acrossExamples(read, cases.filter((_, k) => k !== i));
    // A step that became a check and that some piece then broke is read too: it is put to the owner, by name.
    const held = proposals.filter((p) => p.origin === 'STATED' && (p.measurement ?? p.demoted)).length;
    if (held > best.held) best = { lead: i, proposals, held };
  });
  return { lead: best.lead, proposals: best.proposals };
}
