// atelier/core/composite/traits.ts — THE TRAIT TABLE: WHAT EACH AUTHOR'S RULES ARE ABOUT, AND HOW THEY STAND TO ONE ANOTHER.
//
// Discovery has read each author's pieces on their own (cli/commands/discover.ts), so every proposal names the
// author it came from. This pass, deterministic and free, sorts those proposals two ways:
//
//   CLASS   what a rule is about, one or more of eight: opening, structure, evidence, pace, voice, method, figure, effect. A counted rule is
//           classed by its observer; a worded one by the words it uses. The person's "I like how it opens" is
//           mapped to the same eight (./admire.ts), which is how a free line selects rules.
//   KIND    how a rule stands to the other authors' rules of the same class:
//             SHARED          two or more authors propose compatible rules (a limit within tolerance, or the same
//                             statement in other words). Evidence that the trait recurs; not thereby a rule.
//             UNIQUE          one author alone. Kept when admired, however many authors lack it.
//             CONFLICTING     two authors propose incompatible values ("never contractions" against "contractions
//                             throughout"), or both state a length on one measure, in words on at least one side
//                             (./length.ts): asked whatever the numbers say. Surfaced, never averaged.
//             TASK_DEPENDENT  conflicting, but the two authors write pieces of different lengths (the length
//                             classes of core/fidelity/types.ts): the difference may be the kind of work, not taste.
//
// Nothing here calls a model, and nothing resolves a conflict: that is the person's, on the composite screen.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import type { ContextClass } from '../fidelity/types.js';
import { NUMBER_WORDS } from '../loop/numbers.js';
import { boundedNumber, quantitiesOf, withinTolerance, type Quantity } from './quantity.js';
import { sharedLengthMeasures } from './length.js';

// FIGURE and EFFECT come last: what a person most often likes in a writer is how they write (their figures of speech,
// and what the writing does to whoever reads it), and a rule about either was a decision move before they had a class.
// Last, so a rule that also names an opening or a pace is still mainly about that.
export type TraitClass = 'opening' | 'structure' | 'evidence' | 'pace' | 'voice' | 'method' | 'figure' | 'effect';
export const TRAIT_CLASSES: readonly TraitClass[] = ['opening', 'structure', 'evidence', 'pace', 'voice', 'method', 'figure', 'effect'];
export const TRAIT_LABEL: Readonly<Record<TraitClass, string>> = {
  opening: 'openings', structure: 'argument structure', evidence: 'evidence and its depth',
  pace: 'pacing and paragraph construction', voice: 'tone, register and voice', method: 'method and recurring moves',
  figure: 'figures of speech and imagery', effect: 'emotion and effect on the reader',
};
/** The same classes in a word or two, for the one line a build ends on. */
export const TRAIT_SHORT: Readonly<Record<TraitClass, string>> = {
  opening: 'openings', structure: 'structure', evidence: 'evidence handling', pace: 'pace', voice: 'tone and word choice',
  method: 'recurring moves', figure: 'figures of speech', effect: 'emotional effect',
};

/** How a counted rule's observer places it. Anything not listed is read from its words. */
const BY_OBSERVER: Readonly<Partial<Record<string, TraitClass>>> = {
  OPENING: 'opening', CLOSING: 'structure', HEADINGS: 'structure', PRESENCE: 'structure', TABLE: 'structure', LENGTH: 'structure',
  SENTENCE_LENGTH: 'pace', PARAGRAPH_LENGTH: 'pace', FRAGMENT_SHARE: 'pace', RHYTHM: 'pace', DISTRIBUTION: 'pace',
  CITED: 'evidence', LINES: 'evidence',
  HEDGE_RATE: 'voice', LEXICON: 'voice', TERM_RATE: 'voice', PATTERN_RATE: 'voice', RATIO: 'voice', STYLE_DISTANCE: 'voice', FEATURE: 'voice',
};

/**
 * THE WORDS OF EACH CLASS: one list, read the same way for a rule (here) and for what a person says they like
 * (./admire.ts, when no model reads their line). A statement carries every class whose words it uses, wherever they
 * stand in it. A count's unit ("fifteen words in a sentence", "eight hundred words") is not a word about words.
 */
const COUNT_UNIT = String.raw`(?<!\b(?:\d[\d,]*|${NUMBER_WORDS.join('|')})[\s-])`;
export const CLASS_WORDS: readonly (readonly [TraitClass, RegExp])[] = [
  ['opening', /\b(open|opens|opening|openings|begin|begins|beginning|first (?:sentence|line|paragraph|words)|lead(?:s)? with|start(?:s)? with|hook|title)\b/i],
  ['evidence', /\b(evidence|figure|figures|number|numbers|data|source|sources|cite|cites|citation|citations|example|examples|specific|specifics|detail|details|proof|statistic|statistics|quote|quotes|footnote|reference|references)\b/i],
  ['pace', /\b(sentence|sentences|paragraph|paragraphs|pace|pacing|rhythm|fragment|fragments|brisk|fast|slow|cadence|clipped|tempo)\b/i],
  ['structure', /\b(structure|structured|argument|arguments|section|sections|order|sequence|outline|heading|headings|subheading|subheadings|list|lists|bullet|bullets|numbered|step|steps|close|closes|closing|end|ends|ending|conclusion|transition|transitions|moves)\b/i],
  ['voice', new RegExp(String.raw`\b(tone|register|voice|formal|informal|casual|conversational|chatty|relaxed|colloquial|impersonal|person|tense|contraction|contractions|first person|we|humou?r|wry|warm|dry|plain|jargon|hedge|hedges|hedging|spelling|dash|dashes|${COUNT_UNIT}word|${COUNT_UNIT}words|phrasing|vocabulary|irony|understatement|slang|diction)\b`, 'i')],
  ['figure', /\b(metaphor|metaphors|metaphorical|analogy|analogies|simile|similes|image|images|imagery|figurative|figures? of speech|personification|comparison|comparisons|allusion|allusions)\b/i],
  ['effect', /\b(emotion|emotions|emotional|feel|feels|feeling|feelings|moved|moving|suspense|tension|surprise|surprises|delight|urgency|unease|empathy|laugh|laughter|tender|tenderness|nostalgia|nostalgic|dread)\b/i],
];
const BY_WORDS = CLASS_WORDS;

/**
 * A LENGTH SAID IN WORDS IS CLASSED AS A COUNT OF IT IS: the piece's length as LENGTH is (structure), a sentence's or a
 * paragraph's as SENTENCE_LENGTH and PARAGRAPH_LENGTH are (pace). "Keep the piece to about 300 words" names no class
 * word, and is not a decision move.
 */
const quantityClasses = (statement: string): TraitClass[] => [...new Set(quantitiesOf(statement).map((q): TraitClass => (q.measure === 'piece' ? 'structure' : 'pace')))];

/**
 * WHAT A RULE IS ABOUT, AS EVERY CLASS IT CARRIES. The observer decides for a counted rule; for a worded one, every class
 * whose words it uses, in the fixed order of TRAIT_CLASSES (never the order of its words), so "a paragraph may run long
 * when the evidence needs it" is both pace and evidence, and so is the same rule said the other way round. A rule with
 * none of these words is a decision move.
 */
export function traitClassesOf(r: Pick<Requirement, 'statement' | 'measurement'>): TraitClass[] {
  const byObserver = r.measurement ? BY_OBSERVER[r.measurement.observer] : undefined;
  if (byObserver) return [byObserver];
  const found = new Set([...BY_WORDS.filter(([, re]) => re.test(r.statement)).map(([cls]) => cls), ...quantityClasses(r.statement)]);
  const ordered = TRAIT_CLASSES.filter((c) => found.has(c));
  return ordered.length ? ordered : ['method'];
}

/** The first of a rule's classes, in the fixed order: how it is listed when nothing chooses between its classes. */
export const traitClassOf = (r: Pick<Requirement, 'statement' | 'measurement'>): TraitClass => traitClassesOf(r)[0];

/**
 * WHAT A RULE IS MAINLY ABOUT: the class of its observer, or of the first class word it says. "Never use bullet lists;
 * carry items in sentences" is about lists, and only mentions sentences; "Let a paragraph run long when the argument
 * needs room" is about paragraphs. Admiring a class takes the rules mainly about it, never a rule that merely uses
 * one of its words (./selection.ts).
 */
export function primaryClassOf(r: Pick<Requirement, 'statement' | 'measurement'>): TraitClass {
  const byObserver = r.measurement ? BY_OBSERVER[r.measurement.observer] : undefined;
  if (byObserver) return byObserver;
  let best: { cls: TraitClass; at: number } | null = null;
  for (const cls of TRAIT_CLASSES) {
    const re = BY_WORDS.find(([c]) => c === cls)?.[1];
    const at = re ? r.statement.search(re) : -1;
    if (at >= 0 && (!best || at < best.at)) best = { cls, at };
  }
  return best?.cls ?? quantityClasses(r.statement)[0] ?? 'method';
}

export type TraitKind = 'SHARED' | 'UNIQUE' | 'CONFLICTING' | 'TASK_DEPENDENT';

export interface TraitRow {
  readonly id: string;
  readonly author: string;
  /** the first of its classes, in the fixed order */
  readonly cls: TraitClass;
  /** every class the rule carries (one for a counted rule; one or more for a worded one) */
  readonly classes: readonly TraitClass[];
  readonly kind: TraitKind;
  /** the ids of the other authors' rules this one is shared with, or conflicts with */
  readonly with: readonly string[];
  /** the same rule said again by the same author (a repeated reading): it stands and falls with this one */
  readonly sameAs?: string;
}

export interface ConflictSide { readonly id: string; readonly author: string; readonly statement: string }
export interface Conflict {
  /** 1-based, the number a person answers by (`--conflict 1=A`) */
  readonly n: number;
  readonly cls: TraitClass;
  /** one line naming what the two disagree on */
  readonly label: string;
  readonly sides: readonly [ConflictSide, ConflictSide];
  /** the two authors write pieces of different lengths: the difference may be the kind of work */
  readonly taskDependent: boolean;
}

export interface TraitTable { readonly rows: readonly TraitRow[]; readonly conflicts: readonly Conflict[] }

const STOP = new Set(['i', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'with', 'and', 'or', 'for', 'my', 'it', 'its', 'is', 'are', 'be',
  'that', 'this', 'as', 'by', 'from', 'when', 'then', 'than', 'so', 'if', 'each', 'every', 'one', 'all', 'most', 'keep', 'use', 'write', 'give', 'make']);
const NEGATION = /\b(never|no|not|avoid|without|don't|do not|rarely)\b/i;
const contentWords = (s: string): Set<string> => new Set((s.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [])
  .map((w) => w.replace(/'s$/, '').replace(/(?<=[a-z]{3})s$/, '')).filter((w) => !STOP.has(w) && !NEGATION.test(w)));
const jaccard = (a: Set<string>, b: Set<string>): number => { const inter = [...a].filter((w) => b.has(w)).length; const uni = new Set([...a, ...b]).size; return uni ? inter / uni : 0; };
/** Two worded rules are about the same thing when they share this much of their content words. */
export const SAME_SUBJECT = 0.34;

/** How far two limits may sit apart and still be one trait: within 30% of the larger, and never less than 2 apart counts (./quantity.ts). */

type Relation = 'SAME' | 'CONFLICT' | 'UNRELATED';

/**
 * PLAINLY OPPOSED, WHATEVER ELSE THE TWO SAY. "Use contractions throughout, in a chatty register" against "Never use
 * contractions; keep a formal, precise register" share too few words to pass as one subject, and both would instruct
 * the writer. So each statement is read for the subjects it names (headings, lists, contractions...) and the values it
 * takes on a few known questions (tone, person, tense, spelling, length), each with the polarity of the words that
 * govern it:
 *
 *   A NEGATION GOVERNS WHAT IT IS SAID OF, NOT ITS WHOLE CLAUSE. "Avoid headings" bans headings; "Avoid headings that
 *   are questions" bans a kind of heading (scoped); "Never pad a list" bans padding; "Avoid contractions in headings"
 *   is about headings only; "Avoid American spelling" asks for British; "never more than twenty words" is a cap.
 *
 * Opposed: a subject one bans and the other asks for, generally; or two values of one question that cannot both hold
 * (casual against formal, first person against third, present tense against past).
 */
const SUBJECT = /\b(contractions?|sub-?headings?|headings?|numbered lists?|lists?|bullet(?:s| points?)?|questions?|sources?|citations?|dash(?:es)?|emoji|jargon|footnotes?|anecdotes?|worked examples?|examples?|figures?|paragraphs?|sentences?|spellings?|exclamation marks?|semicolons?|tables?|hedg(?:e|es|ing)|block ?quotes?|quotes|quotations?)\b/gi;
/**
 * A SUBJECT AND ITS KINDS. A ban on the general subject covers every kind of it: "never use lists of any kind" bans
 * bullet lists and numbered lists; "never use headings" bans subheadings. A ban on one kind says nothing of the others.
 */
export const KIND_OF: Readonly<Record<string, string>> = { bullet: 'list', 'numbered list': 'list', subheading: 'heading', 'block quote': 'quote', 'worked example': 'example' };

const CLAUSE_NEGATION = /^(never|no|not|avoid|avoids|without|don't|doesn't|rarely|none)$/i;
/**
 * Words that may sit between a negation and what it governs: "never use bullet lists", "with no lists", "never as I".
 * A verb that only says to do the thing itself ("do not cite sources", "never quote sources") is one of them: the
 * negation bans its object. Any other verb narrows it ("never invent examples" bans inventing, not examples).
 */
const FILLER = /^(use|using|uses|write|writing|include|including|put|add|any|a|an|the|ever|be|have|has|as|in|more|too|many|much|do|does|cite|citing|quote|quoting|mention|mentioning|name|naming|give|giving|provide|providing|offer|offering|employ|employing|insert|inserting|show|showing)$/i;
/** Words after a subject that narrow it to a kind of itself: "headings that are questions", "no source without a link". */
const RESTRICT = /^(that|which|who|whose|with|without|unless|except|when|whenever|where|if|than)$/i;
/** Prepositions that narrow a subject, unless what follows is the whole piece: "in headings" narrows, "in the piece" does not. */
const PREPOSITION = /^(in|on|at|for|from|of|to|within|inside|under|across|about|after|before)$/i;
const GENERAL_SCOPE = /^(?:(?:the |a |an |any |your |my |this |each |every |all )?(?:piece|pieces|text|texts|writing|prose|draft|drafts|work|article|articles|post|posts|essay|essays|body|copy|it|them|general|places?|anywhere|everything)|(?:any|all|every|whatever) (?:kinds?|sorts?|forms?|types?))\b/i;
interface Dimension { readonly name: string; readonly values: readonly (readonly [string, RegExp])[]; readonly needsSubject?: true }
const DIMENSIONS: readonly Dimension[] = [
  { name: 'register', values: [['casual', /\b(casual|conversational|informal|chatty|relaxed|colloquial|like a friend)\b/gi], ['formal', /\b(formal|impersonal)\b/gi]] },
  { name: 'person', values: [['first', /\bfirst[- ]person\b|\bas (?:I|we)\b|\bI\/we\b/gi], ['second', /\bsecond[- ]person\b|\bas you\b|\breader as you\b/gi],
    ['third', /\bthird[- ]person\b|\bhe\/she\b|\bhe or she\b|\bas (?:he|she|they)\b/gi]] },
  { name: 'tense', values: [['present', /\bpresent tense\b|\bin the present\b/gi], ['past', /\bpast tense\b|\bin the past\b/gi]] },
  { name: 'spelling', values: [['british', /\bbritish\b/gi], ['american', /\bamerican\b/gi]] },
  { name: 'length', needsSubject: true, values: [['short', /\b(short|shorter|brief|tight)\b/gi], ['long', /\b(long|longer|run long|lengthy)\b/gi]] },
];

/** One word as its subject: "sources" is source, "dashes" is dash, "bullet points" is bullet. */
export const singular = (w: string): string => {
  const x = w.toLowerCase().replace(/\s+/g, ' ');
  if (x.startsWith('bullet')) return 'bullet';
  if (x.startsWith('hedg')) return 'hedge';
  if (/^block ?quote/.test(x)) return 'block quote';
  if (/^quot(?:e|es|ation|ations)$/.test(x)) return 'quote';
  if (/^sub-?heading/.test(x)) return 'subheading';
  // "focus", "status", "analysis", "class": already one; "quizzes" is quiz.
  if (/(?:us|is|ss)$/.test(x)) return x;
  if (x.endsWith('zzes')) return x.slice(0, -3);
  if (/(?:ch|sh|ss|x|z)es$/.test(x)) return x.slice(0, -2);
  return /[^s]s$/.test(x) ? x.slice(0, -1) : x;
};

type Polarity = 'pos' | 'neg' | 'scoped';
interface Reading {
  readonly subjects: Map<string, Polarity>; readonly values: Map<string, { pos: Set<string>; neg: Set<string> }>;
  /** a negation in it governs only a kind or a place of what it names ("avoid the present tense in captions") */
  readonly narrowed: boolean;
}

/** The polarity of every subject and value a statement names, clause by clause. */
export function readPolarity(statement: string): Reading {
  const subjects = new Map<string, Polarity>();
  const values = new Map<string, { pos: Set<string>; neg: Set<string> }>();
  let narrowed = false;
  const setSubject = (k: string, p: Polarity): void => {
    const was = subjects.get(k);
    // A subject said both ways keeps its general reading: a ban or an ask outranks a narrowed mention.
    if (!was || (was === 'scoped' && p !== 'scoped')) subjects.set(k, p);
  };
  const setValue = (dim: Dimension, v: string, negated: boolean): void => {
    const slot = values.get(dim.name) ?? { pos: new Set<string>(), neg: new Set<string>() };
    values.set(dim.name, slot);
    // A two-valued question negated is the other value: "avoid American spelling" asks for British.
    if (negated && dim.values.length === 2) slot.pos.add(dim.values.find(([name]) => name !== v)?.[0] ?? v);
    else (negated ? slot.neg : slot.pos).add(v);
  };
  for (const clause of statement.split(/[;:.!?]|,\s*(?:and|but)\b|\bbut\b/i)) {
    const tokens = [...clause.matchAll(/[A-Za-z][A-Za-z'/-]*|\d+/g)].map((m) => ({ w: m[0], at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
    const subj = [...clause.matchAll(SUBJECT)].map((m) => ({ k: singular(m[1]), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
    const vals = DIMENSIONS.flatMap((dim) => dim.values.flatMap(([v, re]) => [...clause.matchAll(re)].map((m) => ({ dim, v, at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))));
    const k = tokens.findIndex((t) => CLAUSE_NEGATION.test(t.w) || (/^not$/i.test(t.w)));
    // A ceiling, not a ban: "never more than twenty words", "no paragraph should run past five sentences" (./quantity.ts).
    const cap = k >= 0 && boundedNumber(clause);
    // The span a negation governs, [from, to): what is banned; `narrowFrom` on, what only narrows it.
    let from = Infinity; let to = Infinity; let narrowFrom = Infinity; let phraseScoped = false;
    if (k >= 0 && !cap) {
      let j = k + 1;
      while (j < tokens.length && FILLER.test(tokens[j].w) && !CLAUSE_NEGATION.test(tokens[j].w)) j++;
      const head = tokens[j];
      if (head) {
        from = tokens[k].end;
        const nominal = subj.some((x) => x.at === head.at) || vals.some((x) => x.at === head.at || (x.at < head.end && x.end > head.at));
        if (!nominal) {
          // A verb is negated ("never pad a list", "never end on a question"): what follows only narrows it.
          to = head.end; narrowFrom = head.end; phraseScoped = true;
        } else {
          let e = j;
          while (e < tokens.length && !RESTRICT.test(tokens[e].w) && !PREPOSITION.test(tokens[e].w) && !clause.slice(tokens[e - 1]?.end ?? 0, tokens[e].at).includes(',')) e++;
          to = tokens[e - 1].end;
          const next = tokens[e];
          const comma = next ? clause.slice(to, next.at).includes(',') : true;
          if (next && !comma && (RESTRICT.test(next.w) || (PREPOSITION.test(next.w) && !GENERAL_SCOPE.test(clause.slice(next.end).trim())))) { phraseScoped = true; narrowFrom = to; narrowed = true; }
        }
      }
    }
    // A modifier said before a subject inside a ban ("long paragraphs", "American spelling") negates the modifier, and
    // only narrows the subject.
    const inBan = (x: { at: number }): boolean => x.at >= from && x.at < to;
    const modified = new Set(subj.filter((x) => inBan(x) && vals.some((v) => inBan(v) && v.at < x.at && v.dim.name !== 'person')).map((x) => x.at));
    const commaAfter = (at: number): boolean => Number.isFinite(to) && clause.slice(to, at).includes(',');
    for (const x of subj) {
      if (cap) { setSubject(x.k, 'scoped'); continue; }
      if (inBan(x)) setSubject(x.k, modified.has(x.at) || phraseScoped ? 'scoped' : 'neg');
      else if (x.at >= narrowFrom && !commaAfter(x.at)) setSubject(x.k, 'scoped');
      else setSubject(x.k, 'pos');
    }
    for (const v of vals) {
      // A value banned only somewhere ("avoid the first person in headings", "avoid a casual tone in headings") says
      // nothing of the rest of the piece: it is scoped, as a narrowed subject is.
      if (inBan(v)) { if (!phraseScoped) setValue(v.dim, v.v, true); }
      else if (v.at >= narrowFrom && !commaAfter(v.at)) continue;
      else setValue(v.dim, v.v, false);
    }
  }
  return { subjects, values, narrowed };
}

export function plainlyOpposed(a: string, b: string): boolean {
  const ra = readPolarity(a); const rb = readPolarity(b);
  const shared = [...ra.subjects.keys()].filter((k) => rb.subjects.has(k));
  if (shared.some((k) => { const x = ra.subjects.get(k); const y = rb.subjects.get(k); return (x === 'pos' && y === 'neg') || (x === 'neg' && y === 'pos'); })) return true;
  // A ban on a general subject against asking for one of its kinds: "never use lists of any kind" / "use bullet lists".
  const bansKind = (ban: Reading, ask: Reading): boolean => [...ask.subjects].some(([k, p]) => p === 'pos' && KIND_OF[k] !== undefined && ban.subjects.get(KIND_OF[k]) === 'neg');
  if (bansKind(ra, rb) || bansKind(rb, ra)) return true;
  return DIMENSIONS.some((dim) => {
    if (dim.needsSubject && !shared.length) return false;
    const x = ra.values.get(dim.name); const y = rb.values.get(dim.name);
    if (!x || !y) return false;
    const meets = (p: Set<string>, q: Set<string>): boolean => [...p].some((v) => q.has(v));
    if (meets(x.pos, y.neg) || meets(y.pos, x.neg)) return true;
    return x.pos.size > 0 && y.pos.size > 0 && !meets(x.pos, y.pos);
  });
}

/** Whether a statement bans something outright (not a kind of it, not past a cap). */
const bansOutright = (statement: string): boolean => {
  const r = readPolarity(statement);
  if ([...r.subjects.values()].includes('neg')) return true;
  if ([...r.subjects.values()].includes('scoped') || r.narrowed) return false;
  return NEGATION.test(statement) && !boundedNumber(statement);
};

/**
 * A NUMBER A WORDED RULE SETS ON A COUNTED SUBJECT, as the bound it is: a ceiling ("two sentences at most", "no more
 * than twenty words"), a floor ("at least six sentences") or an allowance ("let a paragraph run to eight sentences": it
 * may go that far). Read by the one quantity grammar (./quantity.ts); null when the rule sets no single bound on
 * the words of a sentence or the sentences of a paragraph (a range, a size said "about", or no number).
 */
interface Bound { readonly subject: 'paragraph' | 'sentence'; readonly kind: 'ceiling' | 'allowance' | 'floor'; readonly n: number }
export function boundOf(said: string): Bound | null {
  for (const q of quantitiesOf(said)) {
    if (!((q.measure === 'paragraph' && q.unit === 'sentences') || (q.measure === 'sentence' && q.unit === 'words'))) continue;
    const subject = q.measure;
    if (q.allows && q.max !== null) return { subject, kind: 'allowance', n: q.max };
    if (q.min === null && q.max !== null) return { subject, kind: 'ceiling', n: q.max };
    if (q.max === null && q.min !== null) return { subject, kind: 'floor', n: q.min };
  }
  return null;
}

/**
 * HEADINGS AND LISTS, ASKED FOR OR BANNED OUTRIGHT, against a count of them or another rule's words: "use headings"
 * cannot hold where the count allows none. A length is not compared here: two lengths on one measure from two
 * authors are always asked (./length.ts), whatever their numbers say.
 */
type Presence = Readonly<Partial<Record<'heading' | 'list', boolean>>>;
function presenceOf(statement: string): Presence {
  const r = readPolarity(statement);
  const present: Partial<Record<'heading' | 'list', boolean>> = {};
  for (const [subject, keys] of [['heading', ['heading', 'subheading']], ['list', ['list', 'bullet', 'numbered list']]] as const) {
    const ps = keys.map((k) => r.subjects.get(k)).filter(Boolean);
    if (ps.includes('pos')) present[subject] = true;
    else if (r.subjects.get(keys[0]) === 'neg') present[subject] = false;
  }
  return present;
}

/** Headings or lists said in words, against a count's rate of them: asked for where none is allowed, or banned where some are required. */
function presenceAgainstCount(present: Presence, m: Measurement): Relation {
  const n = (k: string): number | null => (typeof m.params[k] === 'number' ? m.params[k] : null);
  for (const subject of ['heading', 'list'] as const) {
    const p = present[subject];
    if (p === undefined) continue;
    const rate = subject === 'heading'
      ? (m.observer === 'HEADINGS' ? { lo: n('minPer1000'), hi: n('maxPer1000') } : null)
      : (m.observer === 'FEATURE' && Array.isArray(m.params.feature) && m.params.feature.includes('listItem') ? { lo: n('minValue'), hi: n('maxValue') } : null);
    if (rate && (p ? rate.hi === 0 : (rate.lo ?? 0) > 0)) return 'CONFLICT';
  }
  return 'UNRELATED';
}

/**
 * TWO COUNTED BANDS ON ONE OBSERVER. Each limit is read as a bound on what it limits: `max`, `maxPer1000`, `medianMax`
 * a ceiling, `min`, `minPer1000` a floor, paired by what they limit (`minPer1000` with `maxPer1000`). Two ceilings, or
 * two floors, never conflict: a text under the lower ceiling is under both. Only bands that cannot meet do: one's
 * floor above the other's ceiling. Close on every limit, they are one trait.
 */
const CEILING_KEY = /max|Max|^allow$/; const FLOOR_KEY = /min|Min|^need$/;
const limitOf = (k: string): string => k.replace(/^(?:max|min)/, '').replace(/(?:Max|Min)$/, '').replace(/^(?:allow|need)$/, '');
function countedRelation(pa: Measurement['params'], pb: Measurement['params']): Relation {
  const ranges = (p: Measurement['params']): Map<string, { lo: number; hi: number }> => {
    const out = new Map<string, { lo: number; hi: number }>();
    for (const [k, v] of Object.entries(p)) {
      if (typeof v !== 'number') continue;
      const ceiling = CEILING_KEY.test(k); const floor = !ceiling && FLOOR_KEY.test(k);
      if (!ceiling && !floor) continue;
      const base = limitOf(k); const r = out.get(base) ?? { lo: -Infinity, hi: Infinity };
      out.set(base, ceiling ? { ...r, hi: Math.min(r.hi, v) } : { ...r, lo: Math.max(r.lo, v) });
    }
    return out;
  };
  const ra = ranges(pa); const rb = ranges(pb);
  for (const [k, x] of ra) { const y = rb.get(k); if (y && Math.max(x.lo, y.lo) > Math.min(x.hi, y.hi)) return 'CONFLICT'; }
  const numeric = Object.keys(pa).filter((k) => typeof pa[k] === 'number' && typeof pb[k] === 'number');
  return numeric.every((k) => withinTolerance(pa[k] as number, pb[k] as number)) ? 'SAME' : 'UNRELATED';
}

/** A rule as two rules are compared: its words, its count if it has one, and (for a worded rule) every reading of its quantities. */
export type ReadRule = Pick<Requirement, 'statement' | 'measurement' | 'kind'> & {
  /**
   * The readings of its quantities when more than one stands: the grammar's (./quantity.ts) and the model's, where the
   * two disagree. A reading can only add a measure the rule states a length on (./length.ts), never decide a pair.
   */
  readonly readings?: readonly (readonly Quantity[])[];
};

/**
 * How two rules of two authors stand to each other.
 *
 * TWO LENGTHS ON ONE MEASURE, either of them said in words, are a CONFLICT, always: the person is asked, whatever the
 * numbers say (./length.ts). Only two counted bands are compared by their numbers, which were measured on the
 * authors' own pieces, not read from words.
 */
export function relationOf(a: ReadRule, b: ReadRule): Relation {
  if (a.measurement && b.measurement) {
    if (a.measurement.observer !== b.measurement.observer) return 'UNRELATED';
    const pa = a.measurement.params; const pb = b.measurement.params;
    // Two bands on different patterns or features are different traits; the same pattern or feature, compared by limits.
    for (const key of ['pattern', 'feature', 'terms', 'unit']) {
      if (key in pa || key in pb) { if (JSON.stringify(pa[key] ?? null) !== JSON.stringify(pb[key] ?? null)) return 'UNRELATED'; }
    }
    return countedRelation(pa, pb);
  }
  if (sharedLengthMeasures(a, b).length) return 'CONFLICT';
  // A WORDED RULE AGAINST A COUNTED ONE: headings or lists asked for where the count allows none, or the reverse.
  const counted = a.measurement ?? b.measurement;
  if (counted) return presenceAgainstCount(presenceOf((a.measurement ? b : a).statement), counted);
  // TWO WORDED RULES: headings or lists asked for against the same banned; then their words.
  const pa = presenceOf(a.statement); const pb = presenceOf(b.statement);
  if ((['heading', 'list'] as const).some((k) => pa[k] !== undefined && pb[k] !== undefined && pa[k] !== pb[k])) return 'CONFLICT';
  if (plainlyOpposed(a.statement, b.statement)) return 'CONFLICT';
  const wa = contentWords(a.statement); const wb = contentWords(b.statement);
  if (jaccard(wa, wb) < SAME_SUBJECT) return 'UNRELATED';
  // Both name a subject the polarity reading has already compared: the same subject, not opposed.
  const ra = readPolarity(a.statement); const rb = readPolarity(b.statement);
  // A subject and a kind of it ("never use bullet lists" / "use lists") count as one subject here: a ban on one kind
  // leaves the others, so the two are not opposed.
  const related = (k: string, j: string): boolean => k === j || KIND_OF[k] === j || KIND_OF[j] === k;
  if ([...ra.subjects.keys()].some((k) => [...rb.subjects.keys()].some((j) => related(k, j)))) return 'SAME';
  // The same subject, and one bans outright where the other does not: a conflict. (A boundary against a generative rule too.)
  const na = bansOutright(a.statement) || a.kind === 'BOUNDARY'; const nb = bansOutright(b.statement) || b.kind === 'BOUNDARY';
  return na === nb ? 'SAME' : 'CONFLICT';
}

/**
 * A MEASUREMENT COVERING BOTH SIDES OF A CONFLICT ("both, as a range"): every upper limit takes the larger value, every
 * lower limit the smaller; other parameters must agree. Null when the two cannot be one range.
 */
export function mergedMeasurement(a: Measurement | null | undefined, b: Measurement | null | undefined): Measurement | null {
  if (!a || !b) return null;
  if (a.observer !== b.observer) return null;
  const params: Record<string, Measurement['params'][string]> = {};
  for (const k of new Set([...Object.keys(a.params), ...Object.keys(b.params)])) {
    const x = a.params[k]; const y = b.params[k];
    if (typeof x === 'number' && typeof y === 'number') {
      if (/max|Max|tolerance/.test(k)) params[k] = Math.max(x, y);
      else if (/min|Min/.test(k)) params[k] = Math.min(x, y);
      else if (x === y) params[k] = x; else return null;
    } else if (JSON.stringify(x ?? null) === JSON.stringify(y ?? null)) { if (x !== undefined) params[k] = x; }
    else return null;
  }
  // A median's ceiling above the tail's describes no text: the range takes the tail at least as high as the median.
  if (typeof params.medianMax === 'number' && typeof params.p90Max === 'number' && params.medianMax > params.p90Max) params.p90Max = params.medianMax;
  return { observer: a.observer, params };
}

/** What two conflicting rules disagree on, in a few words. */
export const labelOf = (a: Requirement, b: Requirement): string => {
  const m = a.measurement ?? b.measurement;
  if (m) {
    const names: Readonly<Record<string, string>> = { PARAGRAPH_LENGTH: 'paragraph length', SENTENCE_LENGTH: 'sentence length', HEDGE_RATE: 'hedging', FRAGMENT_SHARE: 'fragments', OPENING: 'opening length', HEADINGS: 'headings', RHYTHM: 'rhythm' };
    return names[m.observer] ?? m.observer.toLowerCase().replace(/_/g, ' ');
  }
  // Two lengths on one measure: "piece length" whatever words each uses ("under 2,000 characters", "a five-minute read").
  const common = sharedLengthMeasures(a, b)[0];
  if (common) return `${common} length`;
  const shared = [...contentWords(a.statement)].filter((w) => contentWords(b.statement).has(w));
  // The subject the two share, named as a person would: "paragraph length", not "let, paragraph, run".
  const SUBJECTS: readonly (readonly [string, string])[] = [['paragraph', 'paragraph length'], ['sentence', 'sentence length'], ['contraction', 'contractions'],
    ['open', 'openings'], ['opening', 'openings'], ['hedge', 'hedging'], ['heading', 'headings'], ['list', 'lists'], ['example', 'examples'], ['figure', 'figures'],
    ['person', 'person'], ['tense', 'tense'], ['register', 'register'], ['spelling', 'spelling'], ['quote', 'quotes'], ['piece', 'piece length'], ['word', 'piece length']];
  const named = SUBJECTS.find(([w]) => shared.includes(w));
  if (named) return named[1];
  // No word shared, but one names a kind of what the other names: "lists" against "bullet lists", "headings" against "subheadings".
  const ka = [...readPolarity(a.statement).subjects.keys()]; const kb = [...readPolarity(b.statement).subjects.keys()];
  const general = ka.flatMap((k) => kb.flatMap((j) => (k === j ? [k] : KIND_OF[k] === j ? [j] : KIND_OF[j] === k ? [k] : [])))[0];
  const plural: Readonly<Record<string, string>> = { list: 'lists', heading: 'headings', quote: 'quotes', example: 'examples' };
  if (general) return plural[general] ?? general;
  return shared.slice(0, 3).join(', ') || 'one statement against another';
};

/**
 * THE TABLE. `sourceOf` names each proposal's author; `lengthClassOf` the length class an author's pieces fall in (or
 * null when unknown), which tells a conflict of taste from one of kind of work.
 */
export function buildTraitTable(proposals: readonly Requirement[], sourceOf: (id: string) => string | undefined,
  lengthClassOf: (author: string) => ContextClass | null = () => null): TraitTable {
  const all = proposals.flatMap((p) => { const author = sourceOf(p.requirementId); const classes = traitClassesOf(p); return author ? [{ p, author, cls: classes[0], classes }] : []; });
  // ONE RULE SAID TWICE BY ONE AUTHOR (two readings that agreed) is one rule: paired once, so one disagreement is one
  // conflict, not one per repetition. The repetition stands and falls with the first.
  const keyOf = (x: (typeof all)[number]): string => JSON.stringify([x.author, x.p.statement.trim().toLowerCase().replace(/\s+/g, ' '), x.p.measurement ?? null]);
  const firstOf = new Map<string, string>();
  const sameAs = new Map<string, string>();
  for (const x of all) { const k = keyOf(x); const f = firstOf.get(k); if (f) sameAs.set(x.p.requirementId, f); else firstOf.set(k, x.p.requirementId); }
  const items = all.filter((x) => !sameAs.has(x.p.requirementId));
  const same = new Map<string, string[]>(); const conflict = new Map<string, string[]>();
  const conflicts: Conflict[] = [];
  const push = (m: Map<string, string[]>, k: string, v: string): void => { m.set(k, [...(m.get(k) ?? []), v]); };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]; const b = items[j];
      // Two lengths on one measure are paired whatever else each rule is about (./length.ts): a length's class is the
      // class a count of it has (a piece's length is structure; a sentence's or a paragraph's, pace).
      const lengths = sharedLengthMeasures(a.p, b.p);
      const common = [...a.classes.filter((c) => b.classes.includes(c)), ...lengths.map((m): TraitClass => (m === 'piece' ? 'structure' : 'pace'))];
      if (a.author === b.author || !common.length) continue;
      const rel = relationOf(a.p, b.p);
      if (rel === 'SAME') { push(same, a.p.requirementId, b.p.requirementId); push(same, b.p.requirementId, a.p.requirementId); }
      if (rel === 'CONFLICT') {
        push(conflict, a.p.requirementId, b.p.requirementId); push(conflict, b.p.requirementId, a.p.requirementId);
        const la = lengthClassOf(a.author); const lb = lengthClassOf(b.author);
        conflicts.push({ n: conflicts.length + 1, cls: common[0], label: labelOf(a.p, b.p), taskDependent: la !== null && lb !== null && la !== lb,
          sides: [{ id: a.p.requirementId, author: a.author, statement: a.p.statement }, { id: b.p.requirementId, author: b.author, statement: b.p.statement }] });
      }
    }
  }
  const rows: TraitRow[] = all.map(({ p, author, cls, classes }) => {
    const first = sameAs.get(p.requirementId);
    const id = first ?? p.requirementId;
    const c = conflict.get(id) ?? []; const s = same.get(id) ?? [];
    const kind: TraitKind = c.length
      ? (conflicts.filter((x) => x.sides.some((side) => side.id === id)).every((x) => x.taskDependent) ? 'TASK_DEPENDENT' : 'CONFLICTING')
      : s.length ? 'SHARED' : 'UNIQUE';
    return { id: p.requirementId, author, cls, classes, kind, with: [...new Set([...c, ...s])], ...(first ? { sameAs: first } : {}) };
  });
  return { rows, conflicts };
}

/** The table in one line, the same wherever it is said: rows, and how they stand (a task-dependent conflict is a conflict). */
export function describeTraitCounts(table: TraitTable): string {
  const n = (...k: TraitKind[]): number => table.rows.filter((r) => k.includes(r.kind)).length;
  return `${table.rows.length} rule(s) read, each author on their own: ${n('SHARED')} shared, ${n('UNIQUE')} unique to one author, ${n('CONFLICTING', 'TASK_DEPENDENT')} in conflict between authors`;
}
