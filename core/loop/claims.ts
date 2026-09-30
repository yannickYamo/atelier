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
// is supported when that exact number appears there as a whole number, or when the sentence links a
// source the person supplied (a link the draft made up supports nothing). A story is supported when most of its content words appear in one passage of the material.
// Unsupported claims are never rewritten: the loop deletes each flagged unit in code (./run-repair.ts,
// enforceClaims), or leaves a bracketed slot when the person asked for slots, and lists what it cut.
//
//   EVIDENCE    a first person gathering evidence with nothing shown ("I checked our logs and…", "we
//               tested this", "a customer told me…"), undated and unnumbered but a claim all the same

import { sentencesOf, wordsOf, type Sentence } from '../observers/text.js';
import type { Span } from '../observers/registry.js';

/**
 * WHAT THE CLAIM CHECK READS: every sentence of prose, AND every heading and table row. `sentencesOf`
 * is right for the style observers, which count how a writer writes prose: a heading is not a sentence
 * and a table row is not pace. It was wrong here, and the audit showed how: "# How we cut latency 73% at
 * Stripe" over "| p99 | 900ms | 120ms |" reached the reader as one sentence ("We changed the cache.")
 * and neither check saw a figure, so the most prominent claim on the page was the one never checked. An
 * invented specific is as invented in a title as in a paragraph. Only code fences and front matter are
 * left out: code is not a claim in the writer's voice, and front matter is metadata.
 *
 * Offsets point at the real text (a heading's words, not its `#`; a row from its first `|` to its
 * last), because a flagged unit is what the loop deletes (run-repair.ts, enforceClaims). A table's rule row
 * (`|---|:--:|`) carries no words and is not a unit.
 */
export function claimUnitsOf(text: string): Sentence[] {
  const extra: Sentence[] = [];
  const lines = text.split('\n');
  let offset = 0; let fence: string | null = null; let front = false;
  const unit = (start: number, body: string): void => {
    const w = wordsOf(body).length;
    if (w) extra.push({ start, end: start + body.length, text: body, words: w });
  };
  lines.forEach((line, i) => {
    const lineStart = offset;
    offset += line.length + 1;
    const t = line.trim();
    // Front matter and fences, exactly as the prose reader skips them (core/observers/text.ts).
    if (i === 0 && t === '---') { front = true; return; }
    if (front) { if (t === '---' || t === '...') front = false; return; }
    const f = /^(```|~~~)/.exec(t);
    if (fence) { if (f && t.startsWith(fence)) fence = null; return; }
    if (f) { fence = f[1]; return; }
    const lead = line.length - line.trimStart().length;
    const atx = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(t);
    if (atx) { unit(lineStart + lead + t.indexOf(atx[2], atx[1].length), atx[2]); return; }
    if (t.startsWith('|')) {
      if (/^\|[\s:|-]*$/.test(t)) return;
      unit(lineStart + lead, t);
      return;
    }
    // A setext heading: one line of text alone in its block, underlined with === (or --- after text,
    // which the prose reader also takes as an underline). The prose reader drops the line; it is read here.
    const next = lines[i + 1]?.trim() ?? '';
    const prev = i > 0 ? lines[i - 1].trim() : '';
    const alone = !prev || /^(```|~~~|#{1,6}\s|\||([-*_])(\s*\2){2,}$)/.test(prev);
    if (t && /^(=+|-+)$/.test(next) && alone && !/^([-*+]|\d+[.)])\s/.test(t) && !t.startsWith('>')) unit(lineStart + lead, t);
  });
  if (!extra.length) return sentencesOf(text);
  return [...sentencesOf(text), ...extra].sort((a, b) => a.start - b.start);
}

const FIRST_PERSON_PAST = /\b(?:I|we|my team|our team)\b[^.!?]{0,40}?\b(?:worked|spent|shipped|built|wrote|ran|saw|found|learned|led|joined|reviewed|tried|watched|had|was|were|did|made|lost|broke|asked|told|sat|remember|discovered|realized|realised|measured|benchmarked|counted)\b/i;
const PARTICULAR_TIME = /\b(?:years? ago|months? ago|weeks? ago|days? ago|last (?:week|month|year|quarter|summer|winter|spring|fall)|in (?:19|20)\d\d|at (?:my|our) (?:last|previous|old|first)|back when|early in my|a few years back|the first time I|once|recently|the other day|a while back|earlier this year|at one point|one time)\b/i;
/**
 * AN ANECDOTE WITHOUT A DATE. A time marker is how a remembered story usually opens, but not always: "I
 * had an agent consolidate three helpers", "I watched a team ship…". A first person acting on a named
 * kind of actor is a story as surely as one that starts "two years ago", and a reader cannot tell it
 * from a memory.
 */
const ANECDOTE = /\b(?:I|we)\b[^.!?]{0,20}?\b(?:had|watched|saw|asked|let|gave|told|paired|coached|helped|reviewed)\b (?:an? |my |one |the |our )?(?:agent|model|team|colleague|engineer|intern|junior|senior|client|customer|manager|startup|developer|contractor)s?\b/i;
/**
 * EVIDENCE CLAIMED, NOTHING SHOWN. "I checked our logs and most failures came from retries", "we tested
 * this internally", "a customer told me it changed how they work": no date, no figure, no name, and still a
 * claim that something was looked at and found. A model writes these to sound grounded, and the checks
 * above passed every one of them. A first person doing a verb of gathering evidence counts when it is a
 * verb only evidence takes (tested, measured, surveyed…) or when what was examined is named (logs,
 * tickets, the data, customers…). A view ("I think", "in my experience") is not evidence and stays.
 */
const EVIDENCE_ACT = /\b(?:I|we|my team|our team)(?:['’]ve| have| had)?\b[^.!?]{0,15}?\b(?:tested|measured|surveyed|interviewed|audited|benchmarked|polled|asked around|ran the numbers|crunched the numbers)\b/i;
const EVIDENCE_LOOK = /\b(?:I|we|my team|our team)(?:['’]ve| have| had)?\b[^.!?]{0,15}?\b(?:checked|looked (?:at|into|through)|reviewed|pulled|analy[sz]ed|went through|dug into|combed through|counted|tracked|traced|compared|talked to|spoke (?:to|with)|asked|saw|seen|noticed)\b[^.!?]{0,40}?\b(?:logs?|data|tickets?|numbers|metrics|dashboards?|analytics|customers?|users?|clients?|teams?|engineers?|results?|incidents?|feedback|interviews?|surveys?|codebase|repos?|pull requests|PRs|production|support queue|churn|usage|traces)\b/i;
/** "We should have tested", "I'd check", "we need to measure": what one would or should do, not what was done. */
const NOT_DONE = /\b(?:I|we|my team|our team)(?:['’]d|['’]ll)?\s+(?:should|could|would|might|must|will|can|may|need to|want to|plan to|have to|never)\b|\b(?:I|we)['’](?:d|ll)\b/i;
const REPORTED_TO_US = /\b(?:a|one|some|several|many|most|our|the) (?:customers?|users?|clients?|readers?|engineers?|developers?|people|teams?|prospects?|buyers?)\b[^.!?]{0,20}?\b(?:told (?:me|us)|tell (?:me|us)|said to (?:me|us)|wrote to (?:me|us)|emailed (?:me|us)|keep telling (?:me|us))\b/i;
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

/** An unsupported claim: a first-person or second-hand story, a figure presented as a finding, or an anonymous quotation. */
export interface Claim extends Span { readonly kind: 'EXPERIENCE' | 'FIGURE' | 'SOURCE' }

const contentWords = (s: string): string[] => wordsOf(s).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !STOP.has(w));
const numbersIn = (s: string): string[] => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/[.,]$/, ''));

/** What the person is told about each kind of claim: it is cut (the default), or a slot is left. */
const WHY: Readonly<Record<Claim['kind'], { readonly cut: string; readonly slot: string }>> = {
  EXPERIENCE: { cut: 'a first-person story or claim of evidence that is not in your material or your request: the sentence is cut; if it is yours, add it to your material (atelier material)',
    slot: 'a first-person story that is not in your material or your request; replace it with a placeholder like [your story: a time you ...]' },
  SOURCE: { cut: 'a quotation from someone unnamed, not in your material or your request: the sentence is cut; if it is yours, add it to your material (atelier material)',
    slot: 'a quotation from someone unnamed, not in your material or your request; replace it with a placeholder like [source: who said this]' },
  FIGURE: { cut: 'a figure presented as a finding, not in your material or your request: the sentence is cut; if it is yours, add it to your material (atelier material)',
    slot: 'a figure presented as a finding, not in your material or your request; replace the number with a placeholder like [figure: what it measures, and its source]' },
};

/**
 * Every story, anonymous quotation and figure in `text` that `material` does not support. `placeholders`
 * picks the repair instruction each claim carries: cut it (the default) or leave a slot for the person.
 */
export function unsourcedClaims(text: string, material: string, placeholders = false): Claim[] {
  const why = (k: Claim['kind']): string => (placeholders ? WHY[k].slot : WHY[k].cut);
  // Whole numbers only: "40" is not supported by "400", nor "4%" by "2024".
  const matNumbers = new Set(numbersIn(material));
  // A story is supported by ONE passage that tells it, not by topic words scattered across the notes.
  const passages = material.split(/\n\s*\n|(?<=[.!?])\s+/).map((p) => new Set(contentWords(p))).filter((p) => p.size);
  const storySupported = (sentence: string): boolean => {
    const cw = contentWords(sentence);
    return cw.length > 0 && passages.some((p) => cw.filter((w) => p.has(w)).length / cw.length >= 0.6);
  };
  const out: Claim[] = [];
  const ss = claimUnitsOf(text);
  let inStory = false;
  for (const s of ss) {
    const opens = (FIRST_PERSON_PAST.test(s.text) && PARTICULAR_TIME.test(s.text)) || ANECDOTE.test(s.text) || SECOND_HAND.test(s.text)
      || ((EVIDENCE_ACT.test(s.text) || EVIDENCE_LOOK.test(s.text)) && !NOT_DONE.test(s.text)) || REPORTED_TO_US.test(s.text);
    if (ANONYMOUS_SOURCE.test(s.text) && !storySupported(s.text)) {
      out.push({ ...s, kind: 'SOURCE', why: why('SOURCE') });
      inStory = false;
      continue;
    }
    const continues = inStory && CONTINUES.test(s.text) && (FIRST_PERSON_PAST.test(s.text) || /\b(?:later|then|nobody|everyone)\b/i.test(s.text));
    if ((opens || continues) && !storySupported(s.text)) {
      out.push({ ...s, kind: 'EXPERIENCE', why: why('EXPERIENCE') });
      inStory = true;
      continue;
    }
    inStory = false;
    // A link is support only when the person supplied it: a model invents URLs as readily as figures.
    const urls = s.text.match(/https?:\/\/[^\s)\]]+/g) ?? [];
    const linkedByPerson = LINKED.test(s.text) && urls.length > 0 && urls.every((u) => material.includes(u));
    if (STATISTIC.test(s.text) && FINDING.test(s.text) && !linkedByPerson) {
      const numbers = numbersIn(s.text).filter((n) => !/^(?:19|20)\d\d$/.test(n));
      if (numbers.length && !numbers.every((n) => matNumbers.has(n))) {
        out.push({ ...s, kind: 'FIGURE', why: why('FIGURE') });
      }
    }
  }
  return out;
}
