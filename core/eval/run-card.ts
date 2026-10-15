// atelier/core/eval/run-card.ts — THE EVALUATION OF ONE RUN, AS A PERSON READS IT.
//
// The evaluation is part of what a run returns: it is the product's account of how far the work can be trusted.
// This draws the record (./record.ts) and decides nothing. Three layers, kept apart because they are different
// promises: the owner's rules, what this request set, and what was traced to what was supplied. Under them, the
// habits seen in their examples, which are reported and move nothing.
//
// Four marks, and a mark never says more than was observed:
//   ✓  read in full by a check that can be believed, and it held
//   ✗  seen to fail: the work is blocked, and the whole of what was found is shown
//   ~  a check read part of it and that part held; the rest is named, and is the owner's to read
//   ?  nothing read it: the owner's to judge
// What failed and what is left to the owner are shown whole. What passed is one line.

import type { Entry, EvaluationRecord, RunState } from './record.js';
import { blocks, needsReview } from './record.js';

export interface RunCard {
  readonly record: EvaluationRecord;
  readonly costUsd: number; readonly seconds: number; readonly drafts: number;
  /** what was done to the draft, in plain words; empty when nothing was */
  readonly done: readonly string[];
  readonly invocationId: string;
}

const NAME: Record<RunState, string> = { VERIFIED: 'VERIFIED', NEEDS_REVIEW: 'NEEDS REVIEW', BLOCKED: 'BLOCKED' };
const s = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const clip = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Text wrapped to a width, every line indented alike: nothing a person has to act on is cut short. */
function wrap(text: string, width: number, indent: string): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (line && indent.length + line.length + 1 + w.length > width) { out.push(indent + line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  return line ? [...out, indent + line] : out;
}

const mark = (e: Entry): string => (e.result === 'PASS' ? '✓' : e.result === 'FAIL' ? '✗' : e.result === 'NOT_APPLICABLE' ? '–' : e.reason === 'PARTLY_CHECKED' ? '~' : '?');

/** What is said under a rule: the whole of it where it failed or is left to the owner, a figure where it passed. */
function under(e: Entry): string[] {
  const o = e.observation;
  if (e.result === 'FAIL') return [`found: ${o.evidence ?? 'not met'}`];
  if (e.reason === 'SET_ASIDE' || e.reason === 'REPLACED_BY_REQUEST') return [`not checked on this run: ${o.evidence ?? 'set aside'}`];
  if (e.reason === 'DOES_NOT_APPLY') return [`does not apply to this output${o.evidence ? `: ${o.evidence}` : ''}`];
  if (e.reason === 'PARTLY_CHECKED') return [`checked, and held: ${o.proposition ?? ''}`, `not checked, yours to read: ${o.unchecked ?? 'the rest of it'}`];
  if (e.reason === 'OBSERVER_UNQUALIFIED') return [`${e.dimension === 'STANDARD' ? 'checked, and not enforced' : 'read, and not to be relied on'}: ${o.evidence ?? ''}`];
  // A rule no check reads is one line: a method of twelve judgement steps is not twelve explanations.
  if (e.reason === 'NOT_MACHINE_CHECKABLE') return o.proposition === null ? [] : [`not checked: ${o.evidence ?? 'nothing to check it against'}`];
  if (e.result === 'PASS' && e.dimension !== 'STANDARD') return o.evidence ? [o.evidence] : [];
  return o.evidence && /\d/.test(o.evidence) ? [o.evidence] : [];
}

function rows(e: Entry, w: number): string[] {
  const whole = e.result !== 'PASS' && e.result !== 'NOT_APPLICABLE';
  const head = whole ? wrap(e.statement, w, '       ').map((l, i) => (i === 0 ? `    ${mark(e)}  ${l.trimStart()}` : l)) : [`    ${mark(e)}  ${clip(e.statement.replace(/\s+/g, ' '), w - 8)}`];
  // A line that lists what to check (the grammar checker's uncertain constructions) is said in full: a count is never
  // shown without what it counts.
  const full = whole || (e.observation.evidence ?? '').includes('listed to check: ');
  return [...head, ...under(e).flatMap((l) => (full ? wrap(l, w, '         ') : [`         ${clip(l, w - 10)}`]))];
}

/** Where the run stands, in one sentence that counts what was verified and what is left. */
export function stateLine(r: EvaluationRecord): string {
  const required = r.entries.filter((e) => e.required && e.result !== 'NOT_APPLICABLE');
  const passed = required.filter((e) => e.result === 'PASS').length; const failed = r.entries.filter(blocks); const open = r.entries.filter(needsReview).length;
  if (r.state === 'BLOCKED') return `Not usable as it stands: ${s(failed.length, 'requirement')} seen to fail. ${passed} of ${required.length} verified${open ? `, ${open} left for you` : ''}.`;
  if (r.state === 'VERIFIED') return `Every requirement was read in full and held (${required.length} of ${required.length}).`;
  return `Nothing was seen to fail. ${passed} of ${required.length} verified; ${open} left for you to read.`;
}

/** What to do now: different for each state, and always one thing first. */
function next(c: RunCard, w: number): string[] {
  const failed = c.record.entries.filter(blocks);
  const again = failed.some((e) => e.dimension === 'REQUEST') ? 'run it again, or change what the request asks for'
    : failed.some((e) => e.id === 'specifics') ? 'give it the material those specifics come from (--with <file>), or run it again' : 'run it again';
  const first = c.record.state === 'BLOCKED' ? `Next: ${again}. If the evaluation is wrong about your work: atelier fix "<what was wrong>" --evaluation`
    : c.record.state === 'NEEDS_REVIEW' ? `Next: read what is marked ~ and ?. You would use it: atelier rate ${c.invocationId} yes`
      : `You would use it as it is: atelier rate ${c.invocationId} yes`;
  return [...wrap(first, w, '  '), ...wrap(`${c.record.state === 'BLOCKED' ? '' : 'Not right: atelier fix "<what was wrong>" writes this piece again · '}Every check in full: add --report · Over all your runs: atelier lab eval`, w, '  ')];
}

/** The card, as lines. `width` is the terminal's; the work itself is printed above it by the caller. */
export function renderRunCard(c: RunCard, width = 100): string[] {
  const w = Math.max(60, Math.min(width, 120));
  const right = `$${c.costUsd.toFixed(2)} · ${Math.round(c.seconds)} s`;
  const title = `── Evaluation · ${NAME[c.record.state]} `;
  const out = [`${title}${'─'.repeat(Math.max(2, w - title.length - right.length - 4))} ${right} ──`, ...wrap(stateLine(c.record), w, '  ')];
  const layer = (name: string, es: readonly Entry[]): void => { if (es.length) out.push('', `  ${name}`, ...es.flatMap((e) => rows(e, w))); };
  const of = (d: Entry['dimension']): Entry[] => c.record.entries.filter((e) => e.dimension === d);
  layer('Your rules', of('STANDARD'));
  const judged = of('STANDARD').filter((e) => e.reason === 'NOT_MACHINE_CHECKABLE' && e.observation.proposition === null).length;
  if (judged) out.push(`       (no check reads ${judged === 1 ? 'the rule' : `the ${judged} rules`} marked ? with nothing under ${judged === 1 ? 'it: it is' : 'them: they are'} yours to judge)`);
  layer('This request', of('REQUEST'));
  layer('Evidence', of('EVIDENCE'));
  const habits = of('HABIT').filter((e) => e.result === 'PASS' || e.result === 'FAIL'); const missed = habits.filter((e) => e.result === 'FAIL');
  if (habits.length) out.push('', `  From your examples (not required): ${habits.length - missed.length} of ${habits.length} habits kept`,
    ...missed.flatMap((e) => wrap(`not kept: ${e.statement} (${e.observation.evidence ?? ''})`, w, '         ')));
  const drafts = c.drafts > 1 ? `${c.drafts} drafts written, the better one kept` : '';
  const done = [drafts, ...c.done].filter(Boolean);
  if (done.length) out.push('', ...wrap(`What was done: ${done.join(' · ')}`, w, '  '));
  out.push('', ...next(c, w));
  return out;
}
