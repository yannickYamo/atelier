// atelier/core/loop/claims.ts — A VOICE MAY NOT INVENT THE PERSON'S LIFE OR THEIR NUMBERS.
//
// A voice is made partly of specifics: the time something went wrong for the author, the figure they
// cite and where it came from. A model asked to write in that voice supplies both, and a reader cannot
// tell a remembered incident from a generated one. An LLM judge scored exactly that as the best passage
// across three drafts: an invented first-person confession attributed to a real person. For writing
// someone will publish under their name, it is the worst thing the system can produce.
//
// Two deterministic checks, run on every draft:
//
//   EXPERIENCE  a first-person account of something that happened ("years ago I worked on…", "last month
//               we shipped…"): a subject, a past-tense verb and a marker of a particular time, plus the
//               sentences right after it that carry the same story on ("six months later I was…")
//   FIGURE      a statistic (a percentage, a count with thousands separators, money, "N million")
//               presented as a finding or measured by "I"/"we"
//
// A claim is supported when the person supplied it: their material, or the task they typed. A figure
// is supported when that exact number appears there as a whole number, or when the sentence carries its
// own link. A story is supported when most of its content words appear in one passage of the material.
// Unsupported claims are not deleted silently and not rewritten into other claims: the repair replaces
// each with a bracketed placeholder saying what belongs there, so the person fills it or cuts it.

import { sentencesOf, wordsOf } from '../observers/text.js';
import type { Span } from '../observers/registry.js';

const FIRST_PERSON_PAST = /\b(?:I|we|my team|our team)\b[^.!?]{0,40}?\b(?:worked|spent|shipped|built|wrote|ran|saw|found|learned|led|joined|reviewed|tried|watched|had|was|were|did|made|lost|broke|asked|told|sat|remember|discovered|realized|realised|measured|benchmarked|counted)\b/i;
const PARTICULAR_TIME = /\b(?:years? ago|months? ago|weeks? ago|days? ago|last (?:week|month|year|quarter|summer|winter|spring|fall)|in (?:19|20)\d\d|at (?:my|our) (?:last|previous|old|first)|back when|early in my|a few years back|the first time I|once|recently|the other day|a while back|earlier this year|at one point|one time)\b/i;
/**
 * AN ANECDOTE WITHOUT A DATE. A time marker is how a remembered story usually opens, but not always: "I
 * had an agent consolidate three helpers", "I watched a team ship…". A first person acting on a named
 * kind of actor is a story as surely as one that starts "two years ago", and a reader cannot tell it
 * from a memory.
 */
const ANECDOTE = /\b(?:I|we)\b[^.!?]{0,20}?\b(?:had|watched|saw|asked|let|gave|told|paired|coached|helped|reviewed)\b (?:an? |my |one |the |our )?(?:agent|model|team|colleague|engineer|intern|junior|senior|client|customer|manager|startup|developer|contractor)s?\b/i;
/** SOMEONE ELSE'S STORY, TOLD AS KNOWN FIRST-HAND: "a team I worked with", "teams I've talked to have". */
const SECOND_HAND = /\b(?:(?:a|one|the|several|many|most|some) )?(?:teams?|clients?|compan(?:y|ies)|customers?|colleagues?|friends?|engineers?|managers?|startups?|leads?|CTOs?|orgs?|organi[sz]ations?) (?:I|we)(?:['’]ve| have)? (?:worked with|know|knew|advised|talked to|spoke (?:to|with)|met|coached|consulted (?:for|with)|spent time with)\b/i;
/**
 * AN AUTHORITY WITH NO NAME. "A legal scholar put it well", "one engineer told me": a quotation whose
 * source cannot be checked, which is where an invented quote hides. A named source in the person's
 * material is theirs to cite; an anonymous one is not.
 */
const ANONYMOUS_SOURCE = /\b(?:a|one|an) (?:legal scholar|scholar|researcher|professor|senior engineer|staff engineer|principal engineer|CTO|VP|executive|expert|analyst|colleague|former colleague|friend|economist|lawyer|historian|practitioner)\b[^.!?]{0,20}?\b(?:once )?(?:told me|put it|said|described it|wrote|called it|pointed out|argued|observed)\b/i;
/** A sentence that carries the same story on: a later moment, or the same first person acting again. */
const CONTINUES = /^(?:(?:\w+ (?:months?|weeks?|days?|years?) later|later|then|afterwards|by the end|eventually|nobody|everyone|the team|our|we|I)\b)/i;
const STATISTIC = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?percent\b|[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:million|billion|thousand)\b|\b\d{4,}\b/;
const FINDING = /\b(?:according to|(?:a|the|this|their|our|its) (?:\w+ ){0,3}(?:report|study|survey|census|analysis|benchmark)|data (?:from|shows?)|found that|estimates? (?:that|put)|as of (?:19|20)\d\d|signator(?:y|ies)|by most counts|tracks roughly|I (?:ran|measured|benchmarked|counted)|we (?:ran|measured|benchmarked|counted))\b/i;
const LINKED = /\]\(https?:|https?:\/\//;
const STOP = new Set(['the', 'and', 'that', 'with', 'this', 'from', 'were', 'was', 'have', 'had', 'into', 'about', 'their', 'there', 'then', 'than', 'when', 'what', 'which', 'would', 'could', 'because', 'years', 'ago', 'last', 'later', 'months', 'weeks']);

export interface Claim extends Span { readonly kind: 'EXPERIENCE' | 'FIGURE' | 'SOURCE' }

const contentWords = (s: string): string[] => wordsOf(s).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !STOP.has(w));
const numbersIn = (s: string): string[] => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[.,]$/, ''));

export function unsourcedClaims(text: string, material: string): Claim[] {
  // Whole numbers only: "40" is not supported by "400", nor "4%" by "2024".
  const matNumbers = new Set(numbersIn(material));
  // A story is supported by ONE passage that tells it, not by topic words scattered across the notes.
  const passages = material.split(/\n\s*\n|(?<=[.!?])\s+/).map((p) => new Set(contentWords(p))).filter((p) => p.size);
  const storySupported = (sentence: string): boolean => {
    const cw = contentWords(sentence);
    return cw.length > 0 && passages.some((p) => cw.filter((w) => p.has(w)).length / cw.length >= 0.6);
  };
  const out: Claim[] = [];
  const ss = sentencesOf(text);
  let inStory = false;
  for (const s of ss) {
    const opens = (FIRST_PERSON_PAST.test(s.text) && PARTICULAR_TIME.test(s.text)) || ANECDOTE.test(s.text) || SECOND_HAND.test(s.text);
    if (ANONYMOUS_SOURCE.test(s.text) && !storySupported(s.text)) {
      out.push({ ...s, kind: 'SOURCE', why: 'a quotation from someone unnamed, not in your material or your request; name a real source from your material, or cut it' });
      inStory = false;
      continue;
    }
    const continues = inStory && CONTINUES.test(s.text) && (FIRST_PERSON_PAST.test(s.text) || /\b(?:later|then|nobody|everyone)\b/i.test(s.text));
    if ((opens || continues) && !storySupported(s.text)) {
      out.push({ ...s, kind: 'EXPERIENCE', why: 'a first-person story that is not in your material or your request; replace it with a placeholder like [your story: a time you ...], or cut it' });
      inStory = true;
      continue;
    }
    inStory = false;
    if (STATISTIC.test(s.text) && FINDING.test(s.text) && !LINKED.test(s.text)) {
      const numbers = numbersIn(s.text).filter((n) => !/^(?:19|20)\d\d$/.test(n));
      if (numbers.length && !numbers.every((n) => matNumbers.has(n))) {
        out.push({ ...s, kind: 'FIGURE', why: 'a figure presented as a finding, not in your material or your request; replace the number with a placeholder like [figure: what it measures, and its source], or cut the claim' });
      }
    }
  }
  return out;
}
