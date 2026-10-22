// atelier/core/eval/observes.ts — HOW MUCH OF A RULE ITS CHECK READS.
//
// A check reads a proposition: "there is a Parties section and it opens the work". The owner's rule may say more:
// "Open with a Parties section that names both parties exactly as they appear in the term sheet". A tick beside
// that rule says the whole of it held, and half of it was never read. So every rule that carries a check also
// carries what the check reads (the proposition) and whether that is all the rule says (the coverage).
//
// Coverage is decided from the rule's own words and its check, and it errs one way only. A rule the machine wrote
// from its own check is the check, in words. A rule in the owner's words is covered in full only when every word of
// it that carries meaning is one the check accounts for: the names it looks for, its numbers, and the few words that
// say what kind of check it is. Anything left over is a part nobody read, and it is named. A word this reading does
// not know leaves the rule PARTIAL, which costs a tick and never claims one.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import { observerFor } from '../observers/registry.js';
import type { Coverage } from './record.js';

export interface Observes { readonly proposition: string; readonly coverage: Coverage; readonly unchecked?: string }

/** Words that carry no requirement of their own: grammar, and the names people give the work itself. */
const PLAIN = new Set(('a an the this that these those it its is are be was were been being has have had do does of to in on at by for from with as and or then than so into onto '
  + 'must should shall will always there which who whose what where '
  + 'work piece output document text draft page post reply answer review report article essay memo email message response note analysis contract explainer writing').split(' '));

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const words = (s: string): string[] => s.split(' ');
const HAS = words('section sections heading headings include includes add adds contain contains write provide provides under');

/**
 * THE WORDS THAT SAY WHAT A CHECK DOES, AND ONLY WHAT THIS CHECK DOES. A word of place counts only where the check
 * holds the place ("open with" where it checks what opens the work); a word of order only where it holds an order;
 * a word of choice only where it holds a closed set. "Include a Sources section at the end" over a check that reads
 * only that the section exists leaves "end" unread, and the rule is read in part.
 */
function kindWords(m: Measurement): string[] {
  const p = m.params; const has = (k: string): boolean => p[k] !== undefined && p[k] !== 0;
  if (m.observer === 'PRESENCE' && strings(p.sections).length) return [...HAS,
    ...(has('opens') ? words('open opens start starts begin begins lead leads') : []),
    ...(has('closes') ? words('end ends close closes finish finishes conclude concludes') : []),
    // (Not "first" or "after": "a Risks section and a Summary section, Summary first" names an order the check does not hold.)
    ...(strings(p.sections).length > 1 ? words('next order followed finally lastly') : []),
    ...(strings(p.options).length ? words('one holds hold says say reads read gives give states state only exactly following') : [])];
  if (m.observer === 'PRESENCE' && strings(p.starts).length) return words('first last final closing opening paragraph starts start begins begin opens open');
  if (m.observer === 'TABLE') return words('table include includes add adds contain contains columns column named called');
  if (m.observer === 'LENGTH') return [...words('write writes keep hold limit cap length long longer run runs between least most no more fewer less under over up maximum minimum below above exceed exceeds'),
    ...strings(p.unit).flatMap((u) => (u === 'sentence' ? ['sentence', 'words', 'word'] : [u, u.replace(/s$/, '')])),
    ...(strings(p.in).length ? ['section'] : strings(p.unit)[0] === 'sentence' ? [] : words('whole entire total'))];
  // (A paragraph's length is said in words as often as in digits: "three sentences or fewer".)
  if (m.observer === 'PARAGRAPH_LENGTH') return words('keep hold limit cap write every each all any no paragraph paragraphs sentence sentences most least more fewer less under over below longer than up maximum max or run runs past exceed exceeds go goes one two three four five six seven eight nine ten eleven twelve');
  if (m.observer === 'LEXICON') return words('never not don avoid use using say saying write writing word words phrase phrases t');
  return [];
}

/** The numbers a check holds: each limit, and the one beside it that "under" and "over" are written with. */
const numbersOf = (m: Measurement): Set<string> => new Set(Object.values(m.params).filter((v): v is number => typeof v === 'number').flatMap((n) => [n - 1, n, n + 1].map(String)));

const tokens = (s: string): { w: string; at: number; end: number }[] => [...s.matchAll(/[\p{L}\p{N}%][\p{L}\p{N}%,]*[\p{L}\p{N}%]|[\p{L}\p{N}%]/gu)].map((m) => ({ w: m[0].toLowerCase(), at: m.index, end: m.index + m[0].length }));
/** What a check reads, in plain words. */
export const propositionOf = (m: Measurement): string => {
  const sections = m.observer === 'PRESENCE' ? strings(m.params.sections) : [];
  if (sections.length) {
    const names = sections.map((n) => `"${n}"`).join(', '); const options = strings(m.params.options);
    return `${sections.length > 1 ? `the sections ${names}, in that order` : `a ${names} section`}, with something in it${m.params.opens ? ', opening the work' : ''}${m.params.closes ? ', ending the work' : ''}`
      + (options.length ? `, starting with one of ${options.map((o) => `"${o}"`).join(', ')} on a line of its own` : '');
  }
  if (m.observer === 'TABLE' && strings(m.params.columns).length) return `a table with the columns ${strings(m.params.columns).join(', ')}`;
  if (m.observer === 'LINES') {
    const sections = strings(m.params.sections);
    return `every path:line cited is a line of the material with something on it${m.params.perItem ? `, and every finding${sections.length ? ` under ${sections.map((s) => `"${s}"`).join(', ')}` : ''} carries one` : ''}`;
  }
  if (m.observer === 'CITED') return 'every figure is one the request or the material gives';
  if (m.observer === 'NAMES_TEST') return 'the work names a test (a test file, or a test function or case in backticks)';
  // A check this version does not know (a store written by a later one) is said as that, and never stops a record.
  return (observerFor(m.observer) as ReturnType<typeof observerFor> | undefined)?.describe(m.params) ?? `a check this version does not know (${m.observer})`;
};

/**
 * What a check never reads, whatever the rule's words: said as it is, not in the owner's words. A check that looks a
 * citation up reads nothing of whether the line supports what is said of it; one that finds a test's name reads
 * nothing of whether it is the right test. So each of these is read in part, always, and a pass alone never verifies.
 */
const neverRead = (m: Measurement): string | null => {
  if (m.observer === 'LINES') return m.params.perItem ? 'whether the cited line supports the claim' : 'whether each item carries a citation, and whether the cited line is the right one';
  if (m.observer === 'CITED') return 'whether each figure names its source, and whether it is used as the source means it';
  if (m.observer === 'NAMES_TEST') return 'whether the named test is the right one';
  return null;
};

/** The names a check looks for: its sections, columns, options and quoted words. */
const namedIn = (m: Measurement): Set<string> => new Set(Object.values(m.params).flatMap(strings).flatMap((v) => tokens(v).map((t) => t.w)));

/**
 * WHAT THE CHECK OF A RULE READS, AND HOW MUCH OF THE RULE THAT IS. Null for a rule with no check.
 * `fromCheck`: the machine worded the statement from this check, so the check is the whole of it. Anything else (the
 * owner's sentence, a model's) is read word by word.
 */
export function observesOf(statement: string, m: Measurement | null | undefined, fromCheck: boolean): Observes | null {
  if (!m) return null;
  const proposition = propositionOf(m);
  const never = neverRead(m);
  if (never) return { proposition, coverage: 'PARTIAL', unchecked: never };
  if (fromCheck) return { proposition, coverage: 'FULL' };
  // A CHECK WRITTEN FOR THIS STEP reads the step it was written for: that is what it is. Whether it may be trusted is a
  // separate question, answered by its qualification on the owner's examples (core/method/mutants.ts); an unqualified
  // one is held back by the plan and its rule read by the owner, whatever its coverage says.
  if (m.observer === 'CHECK') return { proposition, coverage: 'FULL' };
  const kind = new Set(kindWords(m));
  if (!kind.size) return { proposition, coverage: 'PARTIAL', unchecked: 'how much of this rule the check reads is not known' };
  const named = namedIn(m); const numbers = numbersOf(m);
  const known = (w: string): boolean => PLAIN.has(w) || kind.has(w) || named.has(w) || numbers.has(w.replace(/,/g, ''));
  const left = tokens(statement).filter((t) => !known(t.w));
  if (!left.length) return { proposition, coverage: 'FULL' };
  return { proposition, coverage: 'PARTIAL', unchecked: partNobodyRead(statement, left, named) };
}

/**
 * The part of a rule no check read, as the owner wrote it: the clause the unread words are in. It starts where that
 * clause does (after "that", "which", a colon), and runs to the end of the sentence unless what follows goes back to
 * something the check does read ("Put who wins | under a Verdict heading").
 */
function partNobodyRead(statement: string, left: readonly { at: number; end: number }[], named: ReadonlySet<string>): string {
  const first = left[0].at; const last = left[left.length - 1].end;
  const opener = [...statement.slice(0, first).matchAll(/\b(?:that|which)\s+|[:;.]\s+/gi)].at(-1);
  const start = opener ? opener.index + opener[0].length : first;
  const stop = statement.slice(last).search(/[.;!?](?:\s|$)/);
  const sentenceEnd = stop === -1 ? statement.length : last + stop;
  const joined = /^\S*/.exec(statement.slice(last))?.[0].replace(/[.,;!?]+$/, '') ?? '';
  const end = tokens(statement.slice(last, sentenceEnd)).some((t) => named.has(t.w)) ? last + joined.length : sentenceEnd;
  return statement.slice(start, end).replace(/\s+/g, ' ').trim();
}

/** Is a requirement's statement the owner's own sentence (stated, added or rewritten by them)? */
export const inOwnerWords = (r: Pick<Requirement, 'provenance'>): boolean => r.provenance === 'EXPERT_STATED' || r.provenance === 'EXPERT_ADDED' || r.provenance === 'SUBSTANTIVELY_REWRITTEN';

/**
 * What the check of a requirement reads. The check is the whole of the statement only where the machine worded the
 * statement from it (`wordedFromCheck`); a sentence a person or a model wrote is read for what it says beyond the check.
 */
export const observes = (r: Pick<Requirement, 'statement' | 'measurement' | 'wordedFromCheck'>): Observes | null => observesOf(r.statement, r.measurement, r.wordedFromCheck === true);
