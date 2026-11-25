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
import { spanLines } from '../observers/verify.js';
import type { Span } from '../observers/registry.js';

export type Kind = 'held' | 'broken' | 'unchecked' | 'judge' | 'look';

/** The slips the grammar check named the correction of on this text: `"are" (subject–verb agreement: "are" → "is")`. */
export const slipsOf = (e: Entry): readonly string[] => e.observation.slips ?? [];
/** The grammar check read the whole piece and listed what it is unsure of (a fact on the record, never read from its sentence). */
const grammarList = (e: Entry): boolean => e.observation.slips !== undefined;

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
    // specifics looked for in what the person supplied and not found there are theirs to confirm: to look at
    case 'PARTLY_CHECKED': return !e.required ? null : o.toConfirm ? 'look' : 'held';
    // a check that could not run here is not checked, and is nothing to look at;
    // the grammar check's list: a slip it can name the correction of is to look at; a name or a word it does not know is in --report
    // accepted as unmeasured is theirs to judge, unless the check that reads part of it found it broken
    case 'LISTED_FOR_YOU': return o.accepted ? (o.found === 'VIOLATED' ? 'look' : 'judge') : o.notRun ? 'unchecked' : grammarList(e) ? (slipsOf(e).length ? 'look' : null) : o.evidence ? 'look' : null;
    // A CHECK THAT IS NOT YET RELIED ON NEVER HIDES WHAT IT FOUND: broken by its reading is the person's to look at
    case 'OBSERVER_UNQUALIFIED': return !e.required ? null : o.found === 'VIOLATED' || o.toConfirm ? 'look' : 'judge';
    case 'NOT_MACHINE_CHECKABLE':
      if (!e.required) return null;
      if (grammarList(e)) return slipsOf(e).length ? 'look' : 'held';
      return o.proposition === null && o.incomplete === undefined ? 'judge' : 'unchecked';
  }
}

/** The rule in the person's words, on one line. */
const said = (e: Entry): string => { const t = e.statement.replace(/\s+/g, ' ').trim(); return t.length <= 90 ? t : `${t.slice(0, 90).replace(/\s+\S*$/, '')}…`; };
// what the check saw, never why it is or is not relied on: that is the full account's (--report)
const withFound = (e: Entry): string => { const saw = e.observation.saw ?? e.observation.evidence; return `${said(e)}${saw ? ` (${saw})` : ''}`; };

/** The words each kind is said in under a piece. The only table of them. */
export const SAID = {
  broken: 'Not met: ',
  unchecked: 'Not checked on this piece: ',
  look: 'To look at: ',
  slip: 'Possible slip: ',
  toCheck: 'To check: ',
  check: 'Check: ',
} as const;

/** The most lines said under a piece a run hands over, the way to fix it included. */
export const AFTER_PIECE_MAX = 4;

/**
 * WHAT IS SAID UNDER A PIECE A RUN HANDS OVER: no verdict word, at most three things, then the way to fix it. A rule of
 * theirs still not met, then each sentence with a name, figure, date or quote that nothing given holds. Everything else
 * (what held, what could not be checked, a possible slip) is in the full account.
 */
export function afterPieceLines(r: Pick<EvaluationRecord, 'entries'>, spans: ReadonlyMap<string, readonly Pick<Span, 'text'>[]>, report: string): string[] {
  const items = [
    ...r.entries.filter((e) => kindOf(e) === 'broken' && e.id !== 'specifics').map((e) => `${SAID.broken}${said(e)}`),
    ...r.entries.filter((e) => e.id === 'specifics' && (kindOf(e) === 'look' || kindOf(e) === 'broken')).flatMap((e) => {
      const at = spans.get(e.id) ?? [];
      // with no sentence to quote, one plain line and where the list is, never the check's own wording
      return at.length ? at.map((x) => `${SAID.check}"${x.text.length > 120 ? `${x.text.slice(0, 117)}…` : x.text}" (not in your notes)`) : [`${SAID.check}a name or figure here is not in your notes: atelier report ${report}`];
    }),
  ];
  const room = AFTER_PIECE_MAX - 1;
  const shown = items.length > room ? [...items.slice(0, room - 1), `…and ${items.length - room + 1} more: atelier report ${report}`] : items;
  return [...shown, 'Not right? atelier fix "<what was wrong>"'];
}

/**
 * WHAT IS SAID UNDER THE PIECE FOR ONE ENTRY: nothing for a rule that held or is theirs to judge (both are counted in
 * the line above), one line for anything else.
 */
export function linesOf(e: Entry): string[] {
  const kind = kindOf(e);
  if (kind === null || kind === 'judge') return [];
  if (kind === 'broken') return [`  ${SAID.broken}${withFound(e)}`];
  // held, in full or on the part a check reads: counted in the sentence above, and nothing for the person to do
  if (kind === 'held') return [];
  if (kind === 'unchecked') return [`  ${SAID.unchecked}${withFound(e)}`];
  const slips = slipsOf(e);
  if (slips.length) return [...slips.slice(0, 8).map((m) => `  ${SAID.slip}${m}`), ...(slips.length > 8 ? [`  ${SAID.slip}and ${slips.length - 8} more (each one: --report)`] : [])];
  return e.reason === 'LISTED_FOR_YOU' && !e.observation.accepted ? [`  ${SAID.toCheck}${e.observation.saw ?? e.observation.evidence ?? ''}`] : [`  ${SAID.look}${withFound(e)}`];
}


/** The three outcomes a person reads, and their words. */
export type Outcome = 'ready' | 'look' | 'fix';
export const OUTCOME_SAID: Readonly<Record<Outcome, string>> = { ready: 'Ready', look: 'Needs a look', fix: 'Needs a fix' };

/**
 * THE OUTCOME, FROM THE RECORD AND NEVER FROM A SENTENCE: needs a fix where a rule is broken or delivery blocks; needs a
 * look where delivery sends it to a person or anything is theirs to look at (unless the owner's table ships that plain,
 * where it is still listed); ready otherwise.
 */
export function outcomeOf(decision: string | undefined, state: string | null | undefined, r?: Pick<EvaluationRecord, 'entries'> | null): Outcome {
  const kinds = (r?.entries ?? []).map(kindOf);
  if (decision === 'BLOCK' || state === 'BLOCKED' || kinds.includes('broken')) return 'fix';
  return decision === 'PERSON' || (decision !== 'SHIP' && kinds.includes('look')) ? 'look' : 'ready';
}


/** The outcome of a record, in its word. */
export const outcomeWord = (r: Pick<EvaluationRecord, 'entries' | 'state' | 'delivery'>): string => OUTCOME_SAID[outcomeOf(r.delivery?.decision, r.state, r)];

/**
 * THE RESULT OF A CHECK OF ONE TEXT, AS A PERSON OR A HOST READS IT (`atelier verify`, the MCP tool): the outcome, each
 * thing to look at or fix, and under a rule not met, or a specific to confirm, the passages it is about.
 */
export function verdictLines(r: Pick<EvaluationRecord, 'entries' | 'state' | 'delivery'>, spans: ReadonlyMap<string, readonly Span[]> = new Map()): string[] {
  return [`${outcomeWord(r)}.`,
    ...r.entries.flatMap((e) => { const k = kindOf(e); return [...linesOf(e), ...(k === 'broken' || (k === 'look' && !slipsOf(e).length) ? spanLines(spans.get(e.id) ?? [], '      ') : [])]; })];
}
