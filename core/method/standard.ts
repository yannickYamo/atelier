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
import { headingsOf } from '../observers/structure.js';
import { tablesOf, figuresOf, targetOf } from '../observers/obligations.js';

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
  const body = (note.charCodeAt(0) === 0xFEFF ? note.slice(1) : note).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/```[\s\S]*?```/g, '');
  const lines = body.split(/\r?\n/);
  const items: MethodStep[] = []; const prose: MethodStep[] = [];
  let under: string | null = null; let open: string[] | null = null; let para: string[] = [];
  const closeItem = (): void => { if (open) { const text = open.join(' ').replace(/\s+/g, ' ').trim(); if (text) items.push({ text, under }); open = null; } };
  const closePara = (): void => {
    const text = para.join(' ').replace(/\s+/g, ' ').trim(); para = [];
    if (!text) return;
    for (const s of text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)) if (s.trim().split(/\s+/).length >= 3) prose.push({ text: s.trim(), under });
  };
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) { closeItem(); closePara(); under = heading[1].replace(/[*_`]/g, '').trim(); continue; }
    // What the work needs before it starts is not a step of it: a list of inputs says what to bind, not what to do.
    if (under !== null && /^(?:required\s+)?(?:inputs?|prerequisites?|materials?|sources?)\b/i.test(under)) continue;
    if (/^\s*\|/.test(line)) { closeItem(); closePara(); continue; }
    if (item) { closeItem(); closePara(); open = [item[1]]; continue; }
    if (!line.trim()) { closeItem(); closePara(); continue; }
    if (open) open.push(line.trim()); else para.push(line.trim());
  }
  closeItem(); closePara();
  const clean = (s: MethodStep): MethodStep => ({ ...s, text: s.text.replace(/\*\*|__|`/g, '').replace(/^\[[ x]\]\s*/i, '').trim() });
  return (items.length ? items : prose).map(clean).filter((s) => s.text.length >= 8);
}

/** A section's name as a rule can carry it: the heading without what is particular to one piece (a bracket, a subtitle). */
const sectionName = (heading: string): string => heading.replace(/\s*[(:—–].*$/, '').replace(/[*_`]/g, '').trim();
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** What one finished example shows of its own shape: its sections in order, and its tables. */
export function outlineOf(reference: string): { sections: string[]; tables: ReturnType<typeof tablesOf> } {
  const seen = new Set<string>(); const sections: string[] = [];
  for (const h of headingsOf(reference)) { const name = sectionName(h.text); if (name.length >= 3 && !seen.has(norm(name))) { seen.add(norm(name)); sections.push(name); } }
  return { sections, tables: tablesOf(reference) };
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
}

const SOURCING = /\b(?:cit(?:e|es|ed|ation)|sourc(?:e|es|ed|ing)|attribut\w+|referenc\w+)\b/i;
const ABOUT_FIGURES = /\b(?:figure|number|statistic|stat|data|claim|metric|price|pricing|revenue|percent\w*|quantit\w+)s?\b/i;

/**
 * The check a stated step names by its own words, or null. A step that names sections the example has is about
 * those sections; one that speaks of a table is about the example's table whose columns it names (or its only
 * table); one that speaks of sources for figures is about the material.
 */
function checkNamedBy(step: string, outline: ReturnType<typeof outlineOf>): Measurement | null {
  const said = ` ${norm(step)} `;
  const named = outline.sections.filter((s) => norm(s).length >= 5 && said.includes(` ${norm(s)} `));
  if (named.length) return { observer: 'PRESENCE', params: { sections: named } };
  if (/\btables?\b/i.test(step) && outline.tables.length) {
    const columnsSaid = (t: (typeof outline.tables)[number]): number => t.header.filter((h) => h.length >= 3 && said.includes(` ${norm(h)} `)).length;
    const best = [...outline.tables].sort((a, b) => columnsSaid(b) - columnsSaid(a))[0];
    if (columnsSaid(best) > 0 || outline.tables.length === 1) return { observer: 'TABLE', params: { columns: best.header.filter(Boolean), minRows: 1 } };
  }
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
  const out: MethodProposal[] = []; const claimed = new Set<string>();
  for (const step of stepsOf(note)) {
    const m = checkNamedBy(step.text, outline);
    if (!m) { out.push({ statement: step.text, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: null, demoted: null }); continue; }
    const r = read(m);
    if (r.verdict !== 'MET') {
      out.push({ statement: step.text, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: r.detail,
        demoted: r.verdict === 'NOT_APPLICABLE' ? `it cannot be read on your example (${r.detail})` : `your example does not hold it as a check would read it (${r.detail})` });
      continue;
    }
    claimed.add(m.observer === 'TABLE' ? `TABLE:${(m.params.columns as readonly string[]).join('|')}` : m.observer);
    out.push({ statement: step.text, origin: 'STATED', obligation: targetOf(m.observer) === 'BOUND_MATERIAL' ? 'EXECUTION' : 'DELIVERABLE', measurement: m, onExample: r.detail, demoted: null });
  }
  // WHAT THE NOTE LAYS OUT AS A TEMPLATE: its own section headings and its own tables are the owner saying what the
  // work contains, as plainly as a sentence would. Each is held against the example like any stated step: sections
  // the example also has become one requirement, and a table whose columns the example's tables do not carry is kept
  // as a question, because the template and the finished work disagree and only the owner knows which is right.
  const noteSections = headingsOf(note).map((h) => sectionName(h.text.replace(/^(?:part|step|section)\s+\d+\s*[:.)-]\s*/i, ''))).filter((n) => n.length >= 5);
  const shared = outline.sections.filter((sec) => noteSections.some((n) => norm(n) === norm(sec)));
  if (shared.length >= 2 && !claimed.has('PRESENCE')) {
    const m: Measurement = { observer: 'PRESENCE', params: { sections: shared } };
    if (read(m).verdict === 'MET') { claimed.add('PRESENCE'); out.push({ statement: `The work has these sections, in this order: ${shared.join(', ')}.`, origin: 'STATED', obligation: 'DELIVERABLE', measurement: m, onExample: read(m).detail, demoted: null }); }
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
  if (outline.sections.length >= 2 && !claimed.has('PRESENCE')) {
    const m: Measurement = { observer: 'PRESENCE', params: { sections: outline.sections } };
    if (read(m).verdict === 'MET') out.push({ statement: `The work has these sections, in this order: ${outline.sections.join(', ')}.`, origin: 'SHOWN_BY_EXAMPLE', obligation: 'DELIVERABLE', measurement: m, onExample: read(m).detail, demoted: null });
  }
  for (const t of outline.tables) {
    const columns = t.header.filter(Boolean);
    const stated = [...claimed].filter((c) => c.startsWith('TABLE:')).map((c) => c.slice(6).split('|'));
    if (!columns.length || stated.some((cols) => cols.every((c) => columns.some((h) => h.includes(c))))) continue;
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

/** The count a person reads on the screen and on every run: by kind, and how many no code can check. */
export function countByObligation(reqs: readonly Pick<Requirement, 'obligation' | 'measurement'>[]): { deliverable: number; execution: number; judgement: number } {
  const of = (k: Obligation): number => reqs.filter((r) => r.obligation === k).length;
  return { deliverable: of('DELIVERABLE'), execution: of('EXECUTION'), judgement: of('JUDGEMENT') };
}
