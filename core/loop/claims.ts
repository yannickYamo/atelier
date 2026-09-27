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
//               we shipped…") — a subject, a past-tense verb, and a marker of a particular time
//   FIGURE      a number presented as a finding ("according to", "a report", "as of 2025", a percentage)
//
// A claim is supported when the material the person supplied contains it: the figure itself, or most
// of the sentence's content words for an experience. Unsupported claims are not deleted silently and
// not rewritten into other claims: the repair replaces each with a bracketed placeholder saying what
// belongs there, so the person fills it with the truth or cuts it.

import { sentencesOf, wordsOf } from '../observers/text.js';
import type { Span } from '../observers/registry.js';

const EXPERIENCE_SUBJECT = /\b(?:I|we|my team|our team)\b[^.!?]{0,40}?\b(?:worked|spent|shipped|built|wrote|ran|saw|found|learned|led|joined|reviewed|tried|watched|had|was|were|did|made|lost|broke|asked|told|sat|remember|discovered|realized|realised)\b/i;
const PARTICULAR_TIME = /\b(?:years? ago|months? ago|weeks? ago|last (?:week|month|year|quarter|summer|winter)|in (?:19|20)\d\d|at (?:my|our) (?:last|previous|old|first)|once|back when|early in my|a few years back|the first time I)\b/i;
const FIGURE = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:%|percent\b)|[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:million|billion|thousand)\b|\b(?:19|20)\d\d\b|\b\d{2,}\b/;
const FINDING = /\b(?:according to|report(?:ed|s)?|study|studies|survey|data (?:from|show)|found that|estimates?|estimated|as of|signator(?:y|ies)|census|tracks|counted|by most counts)\b/i;
const STOP = new Set(['the', 'and', 'that', 'with', 'this', 'from', 'were', 'was', 'have', 'had', 'into', 'about', 'their', 'there', 'then', 'than', 'when', 'what', 'which', 'would', 'could', 'because', 'years', 'ago', 'last', 'once']);

export interface Claim extends Span { readonly kind: 'EXPERIENCE' | 'FIGURE' }

const contentWords = (s: string): string[] => wordsOf(s).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !STOP.has(w));

export function unsourcedClaims(text: string, material: string): Claim[] {
  const mat = material.toLowerCase();
  const matWords = new Set(contentWords(material));
  const out: Claim[] = [];
  for (const s of sentencesOf(text)) {
    if (EXPERIENCE_SUBJECT.test(s.text) && PARTICULAR_TIME.test(s.text)) {
      const cw = contentWords(s.text);
      const supported = cw.length > 0 && cw.filter((w) => matWords.has(w)).length / cw.length >= 0.5;
      if (!supported) {
        out.push({ ...s, kind: 'EXPERIENCE', why: 'a first-person story that is not in the material you supplied; replace it with a placeholder like [your story: a time you …], or cut it' });
        continue;
      }
    }
    if (FIGURE.test(s.text) && FINDING.test(s.text)) {
      const numbers = s.text.match(/\d[\d,.]*/g) ?? [];
      const supported = numbers.length > 0 && numbers.every((n) => mat.includes(n.replace(/[.,]$/, '').toLowerCase()));
      if (!supported) {
        out.push({ ...s, kind: 'FIGURE', why: 'a figure presented as a finding, not in the material you supplied; replace the number with a placeholder like [figure: what it measures — source?], or cut the claim' });
      }
    }
  }
  return out;
}
