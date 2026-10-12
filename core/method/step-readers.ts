// atelier/core/method/step-readers.ts — WHAT ONE STEP OF A METHOD ASKS FOR, READ FROM ITS OWN WORDS.
//
// Each reader takes a step as the owner wrote it and answers one question about it: does it name a table's columns,
// does it put a section in the work, is it about when, does it state a length. `checkNamedBy` (./standard.ts) asks
// them in order and holds the answer against the owner's example. A reader that is unsure answers no: a step left
// to judgement costs a check, and a rule the owner did not write costs their trust.

import type { Measurement } from '../state/canonical-state.js';

/** A name as it is compared: lower case, letters, digits and % only. */
export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** A step as its words are searched: lower case, every run of punctuation one space, a space at each end. */
export const lowered = (step: string): string => ` ${step.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim()} `;

/** The columns a step gives a table: "a table with the columns Vendor, Price and Minimum". Two or more, or none. */
export const tableColumns = (step: string): string[] => /\btable\b[^.]*?\bcolumns?\s+(?:of\s+|named\s+|called\s+|:\s*)?(.+?)\s*(?:[.;]|$)/i.exec(step)?.[1]
    ?.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((c) => norm(c)).filter((c) => c.length >= 2 && c.split(' ').length <= 5) ?? [];

// A STEP THAT FORBIDS A SECTION, OR ASKS FOR IT ONLY SOMETIMES, DOES NOT REQUIRE IT. "Do not end with a Sources
// section unless asked" and "add a Risks section only when billing is touched" are judgements about when.
const COND = /\b(?:do not|don't|never|not|no(?!-)|unless|only when|only if|only for|only|if|when|where|whenever|except|optional(?:ly)?|rarely|sometimes|avoid|without|instead of|rather than|skip|replace)\b/i;
// A later clause that only says when is a condition too, though it names nothing: "Only for billing changes.",
// "Billing changes only.", "Optional for small changes.", "omit when nothing was cited".
const WHEN = /^(?:only|unless|if|when|whenever|except|optional(?:ly)?|rarely|sometimes|skip|omit|leave (?:it )?out|drop)\b|\bonly[.!]?$|\b(?:optional(?:ly)?|omit|skip|leave (?:it )?out|drop)\b/i;
/**
 * Is the step about when, not about what? The condition counts where it is about the section: in the clause that
 * names one, or in a later sentence that says when. "Then a Suggestions section: improvements that do not block the
 * merge. Write None when there are none." asks for the section; its "not" and "when" describe what goes in it. What
 * follows a colon is the same sentence: "holds one of: Approve, Request changes, or Comment only." is a list.
 */
export const isConditional = (step: string): boolean => step.split(/(?<=[.:;!?])\s+/).some((c) => COND.test(c) && /\b(?:sections?|headings?|tables?|parts?|it|its|them)\b/i.test(c))
    || step.split(/(?<=[.;!?])\s+/).some((c, i) => i > 0 && WHEN.test(c.trim()));

const PUTS = ['with', 'in', 'under', 'include', 'includes', 'add', 'adds', 'have', 'has', 'contain', 'contains', 'write', 'provide', 'provides', 'need', 'needs', 'there must be', 'there is'];
const EDGE = /\b(?:opens?|starts?|begins?|leads?|ends?|closes?|finish(?:es)?|concludes?) with $/;
const SEQUENCE = 'then|next|after that|after it|finally|lastly|last|first|second|third|fourth|fifth';

/** Where in the lowered step a section of the example is put in the work, or -1 where it is only mentioned. */
function placedAt(low: string, sec: string, sequenced: string): number {
  const hits: number[] = [];
  for (const art of ['a', 'an', 'one']) for (const kind of ['section', 'heading', 'line']) {
    const phrase = ` ${art} ${norm(sec)} ${kind} `;
    for (let at = low.indexOf(phrase); at !== -1; at = low.indexOf(phrase, at + 1)) {
      const before = low.slice(0, at + 1);
      if (kind === 'line' ? EDGE.test(before) : PUTS.some((w) => before.endsWith(` ${w} `))) hits.push(at);
      // "and" and "then" carry on a list of sections; alone they join two clauses ("readers skim, and a Summary section helps").
      else if (kind !== 'line' && /\b(?:section|heading|line) (?:and then|and|then) $/.test(before)) hits.push(at);
      // A step that is the next thing in the order: "Then a Must fix section: ...", "Next, a Suggestions section."
      // Only as the step's first words, and only where the section is all the clause says, or is followed by what
      // it holds: "Then a Summary section helps the reader" and "First a Background section is tempting" ask for nothing.
      else if (kind !== 'line' && sequenced === norm(sec) && /^ (?:and )?(?:then|next|after that|after it|finally|lastly|last|first|second|third|fourth|fifth) $/.test(before)) hits.push(at);
    }
  }
  return hits.length ? Math.min(...hits) : -1;
}

/**
 * THE EXAMPLE'S SECTIONS A STEP PUTS IN THE WORK, in the order the step names them. A section named in the step,
 * in any case, is that section when the step puts it there: after "with", "in", "under", "include", "add", "have",
 * "contain", "write", or carrying on a list, as "a", "an" or "one" of them, and called a section or a heading.
 * "A Summary line" is one only where the work opens or ends with it. Everything else names it in passing or tells
 * the writer to leave it out ("avoid a Summary section", "add a status line to the footer"), and asks for nothing.
 */
export function sectionsPlaced(step: string, sections: readonly string[]): { sec: string; name: string; at: number }[] {
  const low = lowered(step);
  // A step that is the next thing in the order: "Then a Must fix section: ...", "Next, a Suggestions section."
  const sequenced = norm(new RegExp(String.raw`^\s*(?:and\s+)?(?:${SEQUENCE}),?\s+(?:a|an|one)\s+(.+?)\s+(?:section|heading)\s*(?:[:.;]|$|,?\s*(?:that|which|with|listing|holding|naming|giving)\b)`, 'i').exec(step)?.[1] ?? '');
  return sections.map((sec) => ({ sec, name: norm(sec), at: placedAt(low, sec, sequenced) })).filter((x) => x.at !== -1 && x.name.length >= 3).sort((a, b) => a.at - b.at);
}

const NAME = String.raw`(?:["“']([^"”']{3,40})["”']|((?:\p{Lu}[\w'-]*\s?){1,5}))`;
const VERB = String.raw`(?:[Oo]pen|[Ss]tart|[Bb]egin|[Ll]ead|[Ee]nd|[Cc]lose|[Ff]inish|[Cc]onclude|[Ii]nclude|[Aa]dd|[Ww]rite|[Hh]ave|[Hh]as|[Cc]ontain)`;
/**
 * The sections a step names outright, by a verb that says the work has them: "open with a Verdict section",
 * 'must have a "Security" section', "add a section called Background". A name is capitalised or in quotation marks.
 */
export const sectionsNamed = (step: string): { verb: string; name: string; at: number }[] => [
    ...step.matchAll(new RegExp(String.raw`\b(${VERB})\w*\s+(?:with\s+)?(?:an?\s+|the\s+|its\s+|one\s+)?${NAME}\s*(?:section|heading|part)\b`, 'gu')),
    ...step.matchAll(new RegExp(String.raw`\b(${VERB})\w*\b[^.;]*?\b(?:section|heading|part)\s+(?:called|named|titled|headed)\s+${NAME}`, 'gu')),
    ...step.matchAll(new RegExp(String.raw`\b([Uu]nder)\s+(?:the\s+|a\s+)?heading\s+${NAME}`, 'gu')),
  ].map((m) => ({ verb: m[1].toLowerCase(), name: (m[2] ?? m[3]).trim(), at: m.index })).filter((x) => x.name.length >= 3).sort((a, b) => a.at - b.at);

/** Capitalised sections a step asks for that the example does not have: kept, so the owner is asked about them. */
export const sectionsOutright = (step: string, sections: readonly string[]): string[] => [...step.matchAll(/\b(?:an?|one)\s+((?:\p{Lu}[\w'-]*\s?){1,4}?)\s*(?:section|heading)\b/gu)].map((m) => m[1].trim())
    .filter((n) => !sections.some((sec) => norm(sec) === norm(n)));

/**
 * The closed set a step gives a section: "a Verdict section that holds one of: Approve, Request changes, Comment".
 * Two to six short options, read only in the clause that names the section, after a verb that says the section is
 * one of them; a bracketed aside and a trailing "only" are not part of an option. "Name one of the authors" in a
 * later sentence gives the section nothing.
 */
export function optionsOf(step: string): string[] {
  const said = /\b(?:section|heading)\b[^.;]*?\b(?:holds?|is|says?|reads?|gives?|states?|contains?|with)\s+(?:exactly\s+|only\s+)?one of(?: these| the following)?\s*:?\s+([^.;]+)/i.exec(step)?.[1];
  if (!said) return [];
  const options = said.replace(/\([^)]*\)/g, ' ').split(/\s*,\s*(?:or\s+|and\s+)?|\s+or\s+/)
    .map((o) => o.replace(/[*_`"“”']/g, '').replace(/\s+only$/i, '').trim()).filter(Boolean);
  return options.length >= 2 && options.length <= 6 && options.every((o) => o.split(/\s+/).length <= 4) ? options : [];
}

const SOFT = /\b(?:unless|if|when|whenever|except|sometimes|rarely|optional(?:ly)?|usually|about|around|roughly|approximately|ideally|aim|try|typically|possible|in most cases|generally|prefer(?:ably)?|normally|often|mostly|give or take|rule of thumb|excluding|not counting|depending)\b|~/i;
// Double quotes hold an apostrophe ("in today's world"); single quotes count only standing clear of a letter.
const QUOTED = String.raw`(?:["“]([^"”]{2,40})["”]|(?<![\p{L}])'([^']{2,40})'(?![\p{L}]))`;
const n = (x: string): number => Number(x.replace(/,/g, ''));
const quotedIn = (t: string): string[] => [...t.matchAll(new RegExp(QUOTED, 'gu'))].map((m) => (m[1] ?? m[2]).trim());
const negated = (t: string): boolean => /\b(?:not|never|cannot|no)\b|n't\b/i.test(t.replace(/\bno (?:more|fewer|longer|sentence)\b/gi, ' '));

/** "No sentence is longer than 25 words." */
function longestSentence(step: string): Measurement | null {
  const longest = /\bno sentence\b[^.]*?\b(?:longer than|over|more than|above|exceed(?:s|ing)?)\s+(\d[\d,]*)\s+words\b/i.exec(step);
  return longest && !negated(step) ? { observer: 'LENGTH', params: { unit: ['sentence'], max: n(longest[1]) } } : null;
}

const UNIT = String.raw`(words?|characters?|sentences?)`;
const unitOf = (u: string): string => (u.toLowerCase().startsWith('word') ? 'words' : u.toLowerCase().startsWith('char') ? 'characters' : 'sentences');
/** Every number the step gives with a unit of length. */
const countsIn = (step: string): RegExpMatchArray[] => [...step.matchAll(new RegExp(String.raw`\d[\d,]*\s+${UNIT}\b`, 'gi'))];
const PART = /\b(?:per|each|every|title|headline|subject line|summary|intro(?:duction)?|hook|bullets?|items?|paragraphs?|sections?|quot(?:e|es|ed|ation)|examples?|captions?|headings?|replies|posts)\b/i;
/** Is a count the length of a part ("each bullet", "3 examples of 20 words"), which nothing here measures? */
const ofAPart = (step: string, counts: readonly RegExpMatchArray[]): boolean =>
  PART.test(step) || counts.some((m) => /^\s+(?:of|in the|for|from|like|by)\b/i.test(step.slice((m.index ?? 0) + m[0].length)));

/** "Between 150 and 230 words", "150–230 words". */
function rangeOf(step: string): { unit: string; min: number; max: number } | null {
  const m = new RegExp(String.raw`\b(?:between|from)\s+(\d[\d,]*)\s+(?:and|to)\s+(\d[\d,]*)\s+${UNIT}\b`, 'i').exec(step)
    ?? new RegExp(String.raw`(?<![\d-])(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)\s+${UNIT}\b`, 'i').exec(step);
  return m ? { unit: unitOf(m[3]), min: n(m[1]), max: n(m[2]) } : null;
}

// "At least" is read before "at most", and taken out once read, so that "no fewer than" is never read as "fewer than".
const LEAST = new RegExp(String.raw`\b(at least|no fewer than|a minimum of|minimum of|over|(?<!\bno )more than)\s+(\d[\d,]*)\s+${UNIT}\b`, 'i');
const MOST = new RegExp(String.raw`\b(at most|no more than|no longer than|up to|a maximum of|maximum of|under|fewer than|less than|below)\s+(\d[\d,]*)\s+${UNIT}\b`, 'i');
/** "At least 100 words", "under 280 characters", or both; null unless every count in the step is one of the two. */
function boundsOf(step: string, counts: number): { unit: string; min: number | null; max: number | null } | null {
  const least = LEAST.exec(step); const most = MOST.exec(least ? step.replace(least[0], ' ') : step);
  if ((least ? 1 : 0) + (most ? 1 : 0) !== counts) return null;
  if (least && most && unitOf(least[3]) !== unitOf(most[3])) return null;
  const min = least ? n(least[2]) + (/over|more than/i.test(least[1]) ? 1 : 0) : null;
  const max = most ? n(most[2]) - (/under|fewer|less|below/i.test(most[1]) ? 1 : 0) : null;
  return { unit: unitOf((least ?? most)?.[3] ?? 'words'), min, max };
}

/** A length of the whole work: "between 150 and 230 words", "under 280 characters", "at least 5 sentences". */
function wholeLength(step: string, counts: readonly RegExpMatchArray[]): Measurement | null {
  if (ofAPart(step, counts) || negated(step)) return null;
  const range = rangeOf(step);
  const b = range ? (counts.length === 1 ? range : null) : boundsOf(step, counts.length);
  if (!b || (b.min === null && b.max === null) || (b.min !== null && b.max !== null && b.min > b.max)) return null;
  return { observer: 'LENGTH', params: { unit: [b.unit], ...(b.min !== null ? { min: b.min } : {}), ...(b.max !== null ? { max: b.max } : {}) } };
}

/** 'The last paragraph starts with "In short,"'. */
function edgeWords(step: string): Measurement | null {
  const edges = [...step.matchAll(/\b(last|final|closing|first|opening)\s+(?:paragraph|line|sentence)\b/gi)];
  const edge = edges.length === 1 ? new RegExp(String.raw`\b(?:last|final|closing|first|opening)\s+(?:paragraph|line|sentence)\b[^.]*?\b(?:starts?|begins?|opens?)\s+with\s+((?:${QUOTED}\s*(?:,|or)?\s*)+)`, 'iu').exec(step) : null;
  if (edge && !negated(step)) {
    const starts = quotedIn(edge[1]);
    if (starts.length) return { observer: 'PRESENCE', params: { in: [/^(?:first|opening)$/i.test(edges[0][1]) ? 'first' : 'last'], starts } };
  }
  return null;
}

/** 'Never use the word "excited".' The quoted words end the sentence, so nothing after them narrows where or how often. */
function bannedWords(step: string): Measurement | null {
  const banned = new RegExp(String.raw`\b(?:never|do not|don't|avoid)\s+(?:use|say|write|using|saying|writing)\s+(?:the\s+)?(?:words?|phrases?)?\s*((?:${QUOTED}\s*(?:,|or|and)?\s*)+)[.!]?\s*$`, 'iu').exec(step.trim());
  if (banned) {
    const terms = quotedIn(banned[1]).map((t) => t.toLowerCase());
    if (terms.length) return { observer: 'LEXICON', params: { terms } };
  }
  return null;
}

/**
 * WHAT THE OWNER STATED AS A COUNT OR AS EXACT WORDS, held as they said it: a length of the whole work in words,
 * characters or sentences; the longest a sentence may run; the words the first or last paragraph starts with; a
 * word never to use. Read narrowly, because a rule the owner did not write is worse than a step left to judgement:
 *
 *   only where the step gives the number or quotes the words ("keep it short" gives neither);
 *   never from a step that says when, or says it softly ("unless", "ideally", "aim for", "usually", "about");
 *   a length only when it is of the whole work: a count of a part ("each bullet", "the title", "per section",
 *   "3 examples of 20 words") is that part's, and nothing here measures parts;
 *   never from a negation other than the plain forms ("no more than", "no fewer than", "no sentence"): "never go
 *   over 100 words" read by its comparator alone is the opposite of what was written;
 *   a banned word only where the quoted words end the sentence ('never use "very" in headings' bans it somewhere).
 *
 * Each is then held against every example before it is a rule (`acrossExamples`): a count the owner's own pieces
 * break is put to them, not built.
 */
export function statedCount(step: string): Measurement | null {
  if (SOFT.test(step)) return null;
  const longest = longestSentence(step);
  if (longest) return longest;
  // A step that gives a count is about that count: where it is not a length of the whole work, it is nothing else.
  const counts = countsIn(step);
  return counts.length ? wholeLength(step, counts) : edgeWords(step) ?? bannedWords(step);
}
