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
  let prev: { text: string; start: number } | null = null;
  text.split('\n').forEach((line, i) => {
    const start = offset; offset += line.length + 1;
    const t = line.trim();
    if (i === 0 && t === '---') { front = true; return; }
    if (front) { if (t === '---' || t === '...') front = false; return; }
    if (/^(```|~~~)/.test(t)) { fence = !fence; prev = null; return; }
    if (fence) return;
    // A closing run of # counts only after whitespace, so "## Learn C#" keeps its #.
    const m = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(t);
    if (m) { out.push({ level: m[1].length, text: m[2].replace(/\*\*|__|`/g, '').trim(), start: start + line.indexOf(m[2]), end: start + line.length }); prev = null; return; }
    // Setext: a single line of text underlined with === (level 1) or --- (level 2).
    if (prev && /^(=+|-+)$/.test(t)) {
      out.push({ level: t.startsWith('=') ? 1 : 2, text: prev.text.replace(/\*\*|__|`/g, '').trim(), start: prev.start, end: prev.start + prev.text.length });
      prev = null; return;
    }
    prev = t && !/^([-*+>]|\d+[.)])\s/.test(t) ? { text: t, start: start + line.indexOf(t) } : null;
  });
  const titles = out.filter((h) => h.level === 1);
  return titles.length === 1 ? out.filter((h) => h.level > 1) : out;
}

/** Short words a Title Case heading capitalises and a sentence-case heading does not. They decide the
 *  case; names, acronyms ("APIs") and product words ("Kubernetes") are capitalised either way and
 *  cannot. */
const CASE_WORDS = new Set(['with', 'that', 'from', 'your', 'about', 'this', 'what', 'when', 'into', 'over', 'than', 'then', 'they',
  'them', 'their', 'there', 'where', 'which', 'while', 'will', 'have', 'does', 'make', 'more', 'most', 'just', 'only', 'much', 'many',
  'should', 'could', 'would', 'every', 'after', 'before', 'under', 'why', 'how', 'and', 'the', 'for', 'but', 'not', 'you', 'are', 'its', 'our']);

/**
 * TITLE when the common words after the first are capitalised, SENTENCE when they are not, null when
 * the heading has none to tell by. A heading in ALL CAPS reads as TITLE: it is not sentence case.
 */
export function headingCase(h: string): 'TITLE' | 'SENTENCE' | null {
  const all = wordsOf(h);
  const letters = all.filter((w) => /[A-Za-z]{2,}/.test(w));
  if (letters.length >= 2 && letters.every((w) => w === w.toUpperCase())) return 'TITLE';
  const common = all.slice(1).filter((w) => CASE_WORDS.has(w.toLowerCase()));
  if (common.length) return common.filter((w) => /^[A-Z]/.test(w)).length / common.length >= 0.5 ? 'TITLE' : 'SENTENCE';
  // No common word to tell by: only an unambiguous heading decides. Three or more longer words, every
  // one capitalised or none (acronyms and CamelCase set aside), else it cannot be told.
  const ws = all.slice(1).filter((w) => w.length >= 4 && !/[A-Z].*[A-Z]/.test(w));
  if (ws.length < 3) return null;
  const caps = ws.filter((w) => /^[A-Z]/.test(w)).length;
  return caps === ws.length ? 'TITLE' : caps === 0 ? 'SENTENCE' : null;
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
  // An image, a footnote definition or a link reference is not where a reader starts or ends reading.
  const ps = paragraphsOf(text).filter((p) => !/^(!\[[^\]]*\]\([^)]*\)|\[\^[^\]]+\]:|\[[^\]]+\]:\s*\S+)/.test(p.text.trim())
    || p.text.trim().length > 200);
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
      // A MINIMUM IS FOR A PIECE LONG ENOUGH TO HAVE AN OPENING. In a two-line answer the first paragraph is
      // the answer: "Run `npm ci`, then retry." failed an opening of 7 to 50 words for being correct and
      // brief. The minimum holds only when the whole text is at least four times it; the maximum always.
      const long = hi !== null && words > hi; const short = lo !== null && words < lo && wordsOf(text).length >= lo * 4;
      const problems = [...hits.map((h) => `"${h.text}"`), long ? `${words} words (at most ${hi})` : '', short ? `${words} words (at least ${lo})` : ''].filter(Boolean);
      // The value counts what is wrong, so less is better: each banned phrase, plus the words outside the band.
      const off = hits.length + (long ? words - (hi ?? 0) : 0) + (short ? (lo ?? 0) - words : 0);
      if (!problems.length) return { verdict: 'MET', spans: [], value: 0, detail: `${where}: ${words} words` };
      // A banned phrase is its own span; a length problem is the whole paragraph's. Both, when both.
      const spans: Span[] = [...hits, ...(long || short ? [{ start: para.start, end: para.end, text: para.text,
        why: `${where} is ${words} words; ${long ? `at most ${hi}` : `at least ${lo}`}` }] : [])];
      return { verdict: 'VIOLATED', spans, value: off, detail: `${where}: ${problems.join(', ')}` };
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

/**
 * WHAT A PIECE MUST CONTAIN. Every other observer bans or caps: a phrase, a length, a rate. A standard for
 * a report, a contract, a template or an answer also says what has to be there: a Recommendation section
 * before the Bets, a figure in every kill criterion, a last line that is the next step. Those were only
 * read by the taste reader, which reports and never enforces. This counts them.
 *
 *   sections=a|b|c   those headings present, in that order
 *   in=first|last|<heading>   where the rest applies: the first or last prose paragraph, or that section
 *   any=x|y   at least `min` (default 1) mentions of any of these phrases
 *   figure=1   at least one figure
 *   starts=x|y   the scope's first words are one of these (list markers and emphasis set aside)
 */
export const PRESENCE: Observer = {
  id: 'PRESENCE',
  describe: (p) => {
    const sections = list(p, 'sections'); const scope = list(p, 'in')[0]?.toLowerCase(); const any = list(p, 'any'); const starts = list(p, 'starts');
    const where = !scope ? 'the text' : scope === 'first' ? 'the opening paragraph' : scope === 'last' ? 'the last paragraph' : `the "${scope}" section`;
    const needs = [
      sections.length ? `sections ${sections.map((s) => `"${s}"`).join(', ')}, in that order` : '',
      any.length ? `${where} mentions ${num(p, 'min') && (num(p, 'min') ?? 1) > 1 ? `at least ${num(p, 'min')} of ` : ''}${any.map((a) => `"${a}"`).join(' or ')}` : '',
      num(p, 'figure') ? `${where} carries a figure` : '',
      starts.length ? `${where} starts with ${starts.map((a) => `"${a}"`).join(' or ')}` : '',
    ].filter(Boolean);
    return needs.join('; ');
  },
  validate: (p) => (list(p, 'sections').length || list(p, 'any').length || num(p, 'figure') || list(p, 'starts').length
    ? null : 'needs sections, any, figure or starts'),
  observe(text, p) {
    if (!text.trim()) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'no text' };
    const problems: string[] = []; const spans: Span[] = [];
    const heads = headingsOf(text);
    const paras = paragraphsOf(text);
    const lastPara = paras.at(-1);
    // Sections present, in order.
    const sections = list(p, 'sections');
    if (sections.length) {
      const at = sections.map((s) => heads.findIndex((h) => h.text.toLowerCase().includes(s.toLowerCase())));
      const missing = sections.filter((_, i) => at[i] === -1);
      const found = at.filter((i) => i !== -1);
      const ordered = found.every((x, i) => i === 0 || x > found[i - 1]);
      if (missing.length) problems.push(`no ${missing.map((m) => `"${m}"`).join(', ')} section`);
      if (!ordered) problems.push(`sections out of order (${sections.join(' before ')})`);
      if ((missing.length || !ordered) && lastPara) spans.push({ start: lastPara.start, end: lastPara.end, text: lastPara.text,
        why: missing.length ? `add the ${missing.map((m) => `"${m}"`).join(', ')} section(s)` : `put the sections in the order ${sections.join(', ')}` });
    }
    // The scope the other checks read.
    const scopeName = list(p, 'in')[0]?.toLowerCase();
    let scope: { start: number; end: number; text: string } | null = { start: 0, end: text.length, text };
    if (scopeName === 'first') scope = paras[0] ?? null;
    else if (scopeName === 'last') scope = lastPara ?? null;
    else if (scopeName) {
      const i = heads.findIndex((h) => h.text.toLowerCase().includes(scopeName));
      if (i === -1) { scope = null; problems.push(`no "${scopeName}" section`); }
      else {
        const next = heads.slice(i + 1).find((h) => h.level <= heads[i].level);
        const start = heads[i].end; const end = next ? next.start : text.length;
        scope = { start, end, text: text.slice(start, end) };
      }
    }
    if (scope) {
      const why: string[] = [];
      const any = list(p, 'any'); const min = num(p, 'min') ?? 1;
      if (any.length) {
        const n = any.reduce((k, a) => k + findTerms(scope.text, [a]).length, 0);
        if (n < min) why.push(`${n} of the ${min} mention(s) of ${any.map((a) => `"${a}"`).join(' or ')} it needs`);
      }
      if (num(p, 'figure') && !/\d/.test(scope.text)) why.push('no figure');
      const starts = list(p, 'starts');
      if (starts.length) {
        const opening = scope.text.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/^[*_#>\s]+/, '').toLowerCase();
        if (!starts.some((s) => opening.startsWith(s.toLowerCase()))) why.push(`does not start with ${starts.map((s) => `"${s}"`).join(' or ')}`);
      }
      if (why.length) {
        problems.push(...why);
        spans.push({ start: scope.start, end: scope.end, text: scope.text, why: why.join('; ') });
      }
    }
    return problems.length
      ? { verdict: 'VIOLATED', spans, value: problems.length, detail: problems.join('; ') }
      : { verdict: 'MET', spans: [], value: 0, detail: 'everything it must contain is there' };
  },
};
