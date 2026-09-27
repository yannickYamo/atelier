// atelier/core/observers/structure.ts — WHERE IN THE PIECE: THE OPENING, THE CLOSE, THE HEADINGS.
//
// Every other observer counts across the whole text, and a piece is not uniform. The places a reader
// decides a text was machine-written are its edges and its signposts: the first paragraph that starts
// "In today's fast-moving world", the close that starts "Ultimately,", the headings that read "The thing
// everyone gets wrong about X" and "Why this should not comfort you". An author has habits there too,
// and they differ from the model's. These observers look at one position each:
//
//   OPENING    the first prose paragraph: phrases it must not use, and how long it runs
//   CLOSING    the last prose paragraph: the same
//   HEADINGS   every heading: phrases they must not use, sentence or title case, how long, how many
//
// A title heading (`# Title`) is not a section heading and is left out; a TL;DR block quote at the top
// is prose and counts as the opening, because that is what a reader meets first.

import type { Measurement } from '../state/canonical-state.js';
import type { Observer, Span } from './registry.js';
import { paragraphsOf, wordsOf, findTerms, proseRegions } from './text.js';

const num = (p: Measurement['params'], k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const list = (p: Measurement['params'], k: string): readonly string[] => {
  const v = p[k];
  return Array.isArray(v) && v.every((x): x is string => typeof x === 'string') ? v : [];
};

export interface Heading { readonly level: number; readonly text: string; readonly start: number; readonly end: number }

/** Section headings (level 2 and below; a lone level-1 is the title), outside code and front matter. */
export function headingsOf(text: string): Heading[] {
  const out: Heading[] = [];
  let offset = 0; let fence = false; let front = false;
  text.split('\n').forEach((line, i) => {
    const start = offset; offset += line.length + 1;
    const t = line.trim();
    if (i === 0 && t === '---') { front = true; return; }
    if (front) { if (t === '---' || t === '...') front = false; return; }
    if (/^(```|~~~)/.test(t)) { fence = !fence; return; }
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(t);
    if (m) out.push({ level: m[1].length, text: m[2].replace(/\*\*|__|`/g, '').trim(), start: start + line.indexOf(m[2]), end: start + line.length });
  });
  const titles = out.filter((h) => h.level === 1);
  return titles.length === 1 ? out.filter((h) => h.level > 1) : out;
}

/** Title Case when most words after the first, of four letters or more, start with a capital. */
export function headingCase(h: string): 'TITLE' | 'SENTENCE' | null {
  const ws = wordsOf(h).slice(1).filter((w) => w.length >= 4 && !/^[A-Z0-9]{2,}$/.test(w));
  if (ws.length < 2) return null;
  const caps = ws.filter((w) => /^[A-Z]/.test(w)).length;
  return caps / ws.length >= 0.5 ? 'TITLE' : 'SENTENCE';
}

/** Phrases models put in openings, closes and headings far more than careful writers do. Proposed as a
 *  rule only from the ones the model's own drafts used, and only if the author's work does not. */
export const OPENING_TROPES: readonly string[] = ["in today's", 'in an era', 'in a world where', 'imagine', 'picture this', "let's talk about",
  'have you ever', 'in the world of', 'when it comes to', 'in recent years', 'it is no secret', "it's no secret", 'more than ever'];
export const CLOSING_TROPES: readonly string[] = ['in conclusion', 'to sum up', 'in summary', 'ultimately', 'the bottom line', 'at the end of the day',
  'the takeaway', 'in short', 'moving forward', 'remains to be seen', 'the future is', 'one thing is clear', 'only time will tell'];
export const HEADING_TROPES: readonly string[] = ['the thing', 'gets wrong', 'nobody tells you', 'what nobody', 'why it matters', 'why this matters',
  'the real', 'the hard part', 'the truth about', "here's", 'here is', 'should not comfort', "shouldn't comfort", 'over coffee', 'the bottom line',
  'what this means', 'the big picture', 'key takeaways', 'the path forward', 'a new era'];

/** The first and last prose paragraphs, when there are at least two. */
const edges = (text: string): { first: ReturnType<typeof paragraphsOf>[number]; last: ReturnType<typeof paragraphsOf>[number] } | null => {
  const ps = paragraphsOf(text);
  return ps.length >= 2 ? { first: ps[0], last: ps[ps.length - 1] } : null;
};

function edgeObserver(id: 'OPENING' | 'CLOSING'): Observer {
  const where = id === 'OPENING' ? 'the opening paragraph' : 'the closing paragraph';
  return {
    id,
    describe: (p) => {
      const avoid = list(p, 'avoid'); const lo = num(p, 'minWords'); const hi = num(p, 'maxWords');
      const parts = [avoid.length ? `none of ${avoid.slice(0, 6).map((a) => `"${a}"`).join(', ')}${avoid.length > 6 ? '…' : ''}` : '',
        lo !== null || hi !== null ? `${lo ?? 0}${hi !== null ? `–${hi}` : '+'} words` : ''].filter(Boolean);
      return `${where}: ${parts.join('; ')}`;
    },
    validate: (p) => {
      const lo = num(p, 'minWords'); const hi = num(p, 'maxWords');
      if (!list(p, 'avoid').length && lo === null && hi === null) return 'needs avoid, minWords or maxWords';
      if (lo !== null && hi !== null && lo > hi) return 'minWords cannot exceed maxWords';
      return null;
    },
    observe(text, p) {
      const e = edges(text);
      if (!e) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'fewer than two paragraphs' };
      const para = id === 'OPENING' ? e.first : e.last;
      const words = wordsOf(para.text).length;
      const hits = findTerms(para.text, list(p, 'avoid')).map((s) => ({ ...s, start: s.start + para.start, end: s.end + para.start,
        why: `${where} uses "${s.text}"` }));
      const lo = num(p, 'minWords'); const hi = num(p, 'maxWords');
      const long = hi !== null && words > hi; const short = lo !== null && words < lo;
      const problems = [...hits.map((h) => `"${h.text}"`), long ? `${words} words (at most ${hi})` : '', short ? `${words} words (at least ${lo})` : ''].filter(Boolean);
      if (!problems.length) return { verdict: 'MET', spans: [], value: words, detail: `${where}: ${words} words` };
      // Length is a property of the whole paragraph; a banned phrase is its own span.
      const spans: Span[] = hits.length ? hits : [{ start: para.start, end: para.end, text: para.text,
        why: `${where} is ${words} words; ${long ? `at most ${hi}` : `at least ${lo}`}` }];
      return { verdict: 'VIOLATED', spans, value: words, detail: `${where}: ${problems.join(', ')}` };
    },
  };
}

export const OPENING = edgeObserver('OPENING');
export const CLOSING = edgeObserver('CLOSING');

export const HEADINGS: Observer = {
  id: 'HEADINGS',
  describe: (p) => {
    const avoid = list(p, 'avoid'); const c = list(p, 'case')[0]; const hi = num(p, 'maxWords');
    const lo1k = num(p, 'minPer1000'); const hi1k = num(p, 'maxPer1000');
    return `headings: ${[avoid.length ? `none of ${avoid.slice(0, 5).map((a) => `"${a}"`).join(', ')}${avoid.length > 5 ? '…' : ''}` : '',
      c ? (c === 'SENTENCE' ? 'sentence case' : 'Title Case') : '', hi !== null ? `at most ${hi} words` : '',
      lo1k !== null || hi1k !== null ? `${lo1k ?? 0}–${hi1k ?? '∞'} per 1,000 words` : ''].filter(Boolean).join('; ')}`;
  },
  validate: (p) => {
    const c = list(p, 'case')[0];
    if (c !== undefined && c !== 'SENTENCE' && c !== 'TITLE') return 'case is SENTENCE or TITLE';
    if (!list(p, 'avoid').length && !c && num(p, 'maxWords') === null && num(p, 'minPer1000') === null && num(p, 'maxPer1000') === null) {
      return 'needs avoid, case, maxWords, minPer1000 or maxPer1000';
    }
    return null;
  },
  observe(text, p) {
    const hs = headingsOf(text);
    const words = proseRegions(text).reduce((n, r) => n + wordsOf(r.text).length, 0);
    const lo1k = num(p, 'minPer1000'); const hi1k = num(p, 'maxPer1000');
    const rateRule = lo1k !== null || hi1k !== null;
    if (!hs.length && !(rateRule && words >= 300)) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no section headings' };
    const spans: Span[] = [];
    const avoid = list(p, 'avoid'); const want = list(p, 'case')[0]; const maxW = num(p, 'maxWords');
    for (const h of hs) {
      const why: string[] = [];
      for (const t of findTerms(h.text, avoid)) why.push(`uses "${t.text}"`);
      const c = headingCase(h.text);
      if (want && c && c !== want) why.push(want === 'SENTENCE' ? 'is in Title Case (sentence case wanted)' : 'is in sentence case (Title Case wanted)');
      if (maxW !== null && wordsOf(h.text).length > maxW) why.push(`is ${wordsOf(h.text).length} words (at most ${maxW})`);
      if (why.length) spans.push({ start: h.start, end: h.end, text: h.text, why: `heading ${why.join(', ')}` });
    }
    const rate = words ? Math.round((hs.length / words) * 10000) / 10 : 0;
    const rateBad = rateRule && words >= 300 && ((lo1k !== null && rate < lo1k) || (hi1k !== null && rate > hi1k));
    const detail = `${hs.length} heading(s)${words >= 300 ? `, ${rate} per 1,000 words` : ''}`;
    if (!spans.length && !rateBad) return { verdict: 'MET', spans: [], value: spans.length, detail };
    return { verdict: 'VIOLATED', spans, value: spans.length, detail: `${detail}; ${spans.length} heading(s) break the rule${rateBad ? `; ${rate} per 1,000 words is outside ${lo1k ?? 0}–${hi1k ?? '∞'}` : ''}` };
  },
};
