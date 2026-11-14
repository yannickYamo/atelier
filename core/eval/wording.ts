// core/eval/wording.ts — THE ONE PLACE A RESULT IS WORDED FOR A PERSON.
//
// `judge` (./record.ts) decides what a check's reading of a rule comes to. This file says it. A rule on a piece is one
// of five things to the person who owns it, and nothing else is ever said of it under a piece:
//
//   held        a check read it and it held (in full, or on the part a check reads)
//   broken      a check that is relied on found it not met
//   unchecked   a check exists and could not read it on this piece (no notes to trace a figure to)
//   judge       no check that is relied on reads it: it is the person's to judge, and nothing was found against it
//   look        something was found for the person to look at: a possible slip, a specific to confirm, or a rule a
//               check that is not yet relied on found broken
//
// `kindOf` covers every reason an entry can carry (the switch has no default: a new reason does not compile until it is
// given a kind). Why a check is not relied on is mechanics, and stays in the full account (--report).

import type { Entry, EvaluationRecord } from './record.js';
import { GRAMMAR_LISTED } from '../observers/grammar.js';
import { spanLines } from '../observers/verify.js';
import type { Span } from '../observers/registry.js';

export type Kind = 'held' | 'broken' | 'unchecked' | 'judge' | 'look';

/** The slips the grammar check can name the correction of, as it wrote them: `"are" (subject–verb agreement: "are" → "is")`. */
export const slipsOf = (e: Entry): string[] => {
  const ev = e.observation.evidence ?? '';
  return ev.startsWith(GRAMMAR_LISTED) || ev.includes('listed to check: ') ? ev.match(/"[^"]*" \([^()]*→[^()]*\)/g) ?? [] : [];
};
/** The grammar check read the whole piece and listed what it is unsure of. */
const grammarList = (e: Entry): boolean => { const ev = e.observation.evidence ?? ''; return ev.startsWith(GRAMMAR_LISTED) || ev.includes('listed to check: '); };

/**
 * WHAT ONE ENTRY IS TO THE PERSON, or null where there is nothing to say of it: it does not apply to this piece, or it
 * is a habit read from the examples and not a rule of theirs (its account is in --report).
 */
export function kindOf(e: Entry): Kind | null {
  const o = e.observation;
  switch (e.reason) {
    case 'DOES_NOT_APPLY': case 'REPLACED_BY_REQUEST': case 'SET_ASIDE': return null;
    case 'MET': return e.required ? 'held' : null;
    case 'NOT_MET': return e.required ? 'broken' : null;
    case 'PARTLY_CHECKED': return e.required ? 'held' : null;
    // the grammar check's list: a slip it can name the correction of is to look at; a name or a word it does not know is in --report
    case 'LISTED_FOR_YOU': return o.accepted ? 'judge' : grammarList(e) ? (slipsOf(e).length ? 'look' : null) : o.evidence ? 'look' : null;
    // A CHECK THAT IS NOT YET RELIED ON NEVER HIDES WHAT IT FOUND: broken by its reading is the person's to look at
    case 'OBSERVER_UNQUALIFIED': return !e.required ? null : o.found === 'VIOLATED' ? 'look' : 'judge';
    case 'NOT_MACHINE_CHECKABLE':
      if (!e.required) return null;
      if (grammarList(e)) return slipsOf(e).length ? 'look' : 'held';
      return o.proposition === null && o.incomplete === undefined ? 'judge' : 'unchecked';
  }
}

/** The rule in the person's words, on one line. */
const said = (e: Entry): string => e.statement.replace(/\s+/g, ' ').trim().slice(0, 90);
const withFound = (e: Entry): string => `${said(e)}${e.observation.evidence ? ` (${e.observation.evidence})` : ''}`;

/** The words each kind is said in under a piece. The only table of them. */
export const SAID = {
  broken: 'Not met: ',
  heldPart: 'Held where it is checked: ',
  unchecked: 'Not checked on this piece: ',
  look: 'To look at: ',
  slip: 'Possible slip: ',
  toCheck: 'To check: ',
} as const;

/**
 * WHAT IS SAID UNDER THE PIECE FOR ONE ENTRY: nothing for a rule that held in full or is theirs to judge (both are
 * counted in the line above), one line for anything else.
 */
export function linesOf(e: Entry): string[] {
  const kind = kindOf(e);
  if (kind === null || kind === 'judge') return [];
  if (kind === 'broken') return [`  ${SAID.broken}${withFound(e)}`];
  if (kind === 'held') return e.reason === 'PARTLY_CHECKED' ? [`  ${SAID.heldPart}${withFound(e)}`] : [];
  if (kind === 'unchecked') return [`  ${SAID.unchecked}${withFound(e)}`];
  if (grammarList(e)) return slipsOf(e).map((m) => `  ${SAID.slip}${m}`);
  return e.reason === 'LISTED_FOR_YOU' ? [`  ${SAID.toCheck}${e.observation.evidence ?? ''}`] : [`  ${SAID.look}${withFound(e)}`];
}

/** Every line under a piece, in the record's order. */
export const foundLines = (r: Pick<EvaluationRecord, 'entries'>): string[] => r.entries.flatMap(linesOf);

/** The three outcomes a person reads, and their words. */
export type Outcome = 'ready' | 'look' | 'fix';
export const OUTCOME_SAID: Readonly<Record<Outcome, string>> = { ready: 'Ready', look: 'Needs a look', fix: 'Needs a fix' };

/**
 * THE OUTCOME, FROM THE RECORD AND NEVER FROM A SENTENCE: needs a fix where a rule is broken or delivery blocks; needs a
 * look where delivery sends it to a person or anything is theirs to look at; ready otherwise.
 */
export function outcomeOf(decision: string | undefined, state: string | null | undefined, r?: Pick<EvaluationRecord, 'entries'> | null): Outcome {
  const kinds = (r?.entries ?? []).map(kindOf);
  if (decision === 'BLOCK' || state === 'BLOCKED' || kinds.includes('broken')) return 'fix';
  return decision === 'PERSON' || kinds.includes('look') ? 'look' : 'ready';
}

const n = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;

/**
 * WHAT THE CHECKS FOUND, IN ONE SENTENCE. It never says more than was observed, and a rule not met leads it: it never
 * reads "nothing broke your rules" over a line that says one did.
 */
export function shortLine(r: Pick<EvaluationRecord, 'entries' | 'state'>): string {
  const of = (k: Kind, part?: boolean): number => r.entries.filter((e) => e.required && kindOf(e) === k && (part === undefined || (e.reason === 'PARTLY_CHECKED') === part)).length;
  const held = of('held', false); const partly = of('held', true); const broken = of('broken'); const judged = of('judge'); const unread = of('unchecked');
  const look = r.entries.filter((e) => kindOf(e) === 'look');
  const slip = look.some((e) => slipsOf(e).length > 0); const other = look.filter((e) => e.reason === 'OBSERVER_UNQUALIFIED').length;
  if (!broken && !partly && !judged && !unread && !look.length) return r.state === 'VERIFIED' ? 'every rule was measured and held.' : `nothing broke your rules (${held} measured).`;
  const parts = [`${held} measured`,
    ...(judged ? [`${n(judged, 'is a judgement call', 'are judgement calls')} the writer was given in your words`] : []),
    ...(partly ? [`${partly} held where ${partly === 1 ? 'it is' : 'they are'} checked`] : []),
    ...(unread ? [`${unread} could not be checked on this piece, named below`] : []),
    ...(other ? [`${other} to look at, named below`] : []),
    ...(slip ? ['a possible slip is listed below'] : [])];
  return `${broken ? `${broken} of your rules ${broken === 1 ? 'is' : 'are'} not met, named below` : 'nothing broke your rules'} (${parts.join('; ')}).`;
}

/** The outcome of a record, in its word. */
export const outcomeWord = (r: Pick<EvaluationRecord, 'entries' | 'state' | 'delivery'>): string => OUTCOME_SAID[outcomeOf(r.delivery?.decision, r.state, r)];

/**
 * THE RESULT OF A CHECK OF ONE TEXT, AS A PERSON OR A HOST READS IT (`atelier verify`, the MCP tool): the outcome, each
 * thing to look at or fix, and under a rule not met the passages that broke it.
 */
export function verdictLines(r: Pick<EvaluationRecord, 'entries' | 'state' | 'delivery'>, spans: ReadonlyMap<string, readonly Span[]> = new Map()): string[] {
  return [`${outcomeWord(r)}.`,
    ...r.entries.flatMap((e) => [...linesOf(e), ...(kindOf(e) === 'broken' ? spanLines(spans.get(e.id) ?? [], '      ') : [])])];
}
