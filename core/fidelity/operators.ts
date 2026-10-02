// atelier/core/fidelity/operators.ts — RE-PUNCTUATION THAT MOVES A MEASURED FEATURE, CHOSEN BY ITS MEASURED EFFECT.
//
// A whole-text "redraft for form" was tried in 0.8 and B6 kept none of its 20 attempts: asked to change
// rhythm without changing content, a model changed content, and the guards refused it. An offline probe then
// showed why naive operators fail too: splitting long sentences moved mean length the right way and the
// short-sentence percentile and the variation the WRONG way. The author's gap was not "shorter sentences"; it
// was fewer very short ones, more evenly.
//
// So operators here are deterministic re-punctuations of the words already there, and none is applied on a
// guess. At discovery each operator is applied to the model's own drafts and its effect on every feature is
// measured (the EFFECT MATRIX, stored in the profile). At invoke, for the feature furthest outside the author's
// range, only operators whose measured effect moves it toward the range are tried, site by site, and an
// application is kept only if that feature moved toward the band and no other steering feature left its band.
//
// WHAT AN OPERATOR MAY TOUCH. Only prose paragraphs: never a heading, a list, a quotation, a table, a code
// fence, an indented code block, or a paragraph hard-wrapped over several lines. Inside a paragraph, inline
// code, links, bare URLs, HTML entities and quotations are masked before anything is matched, so no split, join or
// re-punctuation lands inside them; an abbreviation ("Mr.", "e.g.", "vs.", "U.S.") does not end a sentence.
// Every operator keeps every word except a dropped "and" at a split and an added "and" at a join; the caller
// checks that (`keepsWords`) and the integrity guard on every application.

import { featureOf } from '../observers/features.js';

export type OperatorId = 'split-conjunction' | 'join-adjacent' | 'break-paragraph' | 'merge-paragraphs' | 'parenthetical-to-commas' | 'semicolon-to-period';
export const OPERATOR_IDS: readonly OperatorId[] = ['split-conjunction', 'join-adjacent', 'break-paragraph', 'merge-paragraphs', 'parenthetical-to-commas', 'semicolon-to-period'];

interface Block { text: string; prose: boolean }

/** Blocks separated by blank lines; a block is prose only if it is one line of running text outside any code. */
function blocksOf(text: string): Block[] {
  const raw = text.split(/\n[ \t]*\n/);
  let fence = false;
  return raw.map((b) => {
    const t = b.trim();
    const fences = (t.match(/^(```|~~~)/gm) ?? []).length;
    const inFence = fence || fences > 0;
    if (fences % 2 === 1) fence = !fence;
    const prose = !inFence && t.length > 0 && !b.replace(/^\n+|\n+$/g, '').includes('\n') && !/^( {4}|\t)/.test(b)
      && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||<)/.test(t);
    return { text: b, prose };
  });
}
const joinBlocks = (bs: readonly Block[]): string => bs.map((b) => b.text).join('\n\n');

/** The paragraph with inline code, links, URLs and entities blanked to private-use characters of the same length. */
function masked(p: string): string {
  const blank = (m: string): string => ''.repeat(m.length);
  // A quotation is someone's words: no split, join or re-punctuation lands inside one.
  return p.replace(/`[^`\n]*`/g, blank).replace(/\[[^\]\n]*\]\([^)\n]*\)/g, blank).replace(/\bhttps?:\/\/\S+/g, blank).replace(/&[a-z]+;|&#\d+;/gi, blank)
    .replace(/"[^"\n]{1,300}"|“[^”\n]{1,300}”/g, blank);
}

/** Abbreviations that end with a full stop without ending a sentence. */
const ABBREVIATION = /(?:^|\s|\()(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e|cf|al|approx|Inc|Ltd|Co|Corp|No|Fig|U\.S|U\.K|a\.m|p\.m)\.$/i;

/** Sentences of one prose paragraph, with their offsets: never split inside a masked span or after an abbreviation. */
function sentenceSpans(p: string): { start: number; end: number }[] {
  const m = masked(p);
  const out: { start: number; end: number }[] = [];
  let start = m.search(/\S/);
  if (start < 0) return out;
  const re = /[.!?]["”')\]]?(?=\s+["“([]?[A-Z0-9])/g;
  for (let x = re.exec(m); x; x = re.exec(m)) {
    const end = x.index + x[0].length;
    if (ABBREVIATION.test(m.slice(start, end))) continue;
    out.push({ start, end });
    start = end + (/^\s+/.exec(m.slice(end))?.[0].length ?? 0);
  }
  const tail = m.slice(start).trimEnd();
  if (tail.length) out.push({ start, end: start + tail.length });
  return out;
}
const sentencesIn = (p: string): string[] => sentenceSpans(p).map((s) => p.slice(s.start, s.end));
const words = (s: string): number => (s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
const cap = (s: string): string => s.replace(/^(["“([]?)([a-z])/, (_, q: string, c: string) => `${q}${c.toUpperCase()}`);

/** Sentence-opening words a join may lower-case: function words, never something that could be a name. */
const LOWERABLE: ReadonlySet<string> = new Set(['the', 'a', 'an', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'then', 'we', 'they', 'he', 'she',
  'you', 'our', 'my', 'your', 'their', 'his', 'her', 'nobody', 'everyone', 'nothing', 'most', 'some', 'all', 'each', 'one', 'no', 'not', 'in', 'on', 'at', 'by',
  'for', 'with', 'when', 'if', 'after', 'before', 'once', 'now', 'today', 'still', 'even', 'only', 'what', 'which', 'who']);

const CONJ = /,\s+(and|but|so|yet)\s+/g;
/** A conjunction followed by one of these is not a clause boundary: "so that", "and then", "but which". */
const NOT_A_CLAUSE = /^(?:that|which|then|on|far|much|long|too|forth)\b/i;

/** Where a sentence may be split at ", and|but|so|yet": both sides five words or more, not inside a list or a masked span. */
function splitPoints(s: string): number[] {
  if (words(s) < 16) return [];
  const m = masked(s);
  const out: number[] = [];
  for (const x of m.matchAll(CONJ)) {
    const at = x.index;
    const left = m.slice(0, at); const right = m.slice(at + x[0].length);
    // A list ("flour, sugar, eggs, and salt") has two commas or more before its "and": not a clause.
    if ((left.match(/,/g) ?? []).length >= 2 || NOT_A_CLAUSE.test(right)) continue;
    if (words(left) >= 5 && words(right) >= 5) out.push(at);
  }
  return out;
}
const firstWord = (s: string): string => /^["“([]?([A-Za-z'’-]+)/.exec(s)?.[1] ?? '';
/** Two short sentences that both end on a full stop, the second opening on a function word. */
const joinable = (a: string, b: string): boolean => /[a-z0-9)]\.$/.test(a) && /[a-z0-9)]\.$/.test(b) && !ABBREVIATION.test(a)
  && words(a) <= 12 && words(b) <= 14 && words(a) + words(b) <= 26 && LOWERABLE.has(firstWord(b).toLowerCase());
const mergeable = (a: Block, b: Block): boolean => a.prose && b.prose && sentencesIn(a.text).length <= 2 && sentencesIn(b.text).length <= 2;
/** A parenthetical that can become commas: inside a sentence, no sentence of its own inside it, not opening on a capital. */
const PAREN = / \(([a-z][^()\n.!?]{7,119})\)/g;

/** The sites one operator could act on, in a fixed order: the k-th site is always the same place in the same text. */
export function sitesOf(op: OperatorId, text: string): number {
  const bs = blocksOf(text);
  let n = 0;
  for (const b of bs) {
    if (!b.prose) continue;
    const ss = sentencesIn(b.text);
    if (op === 'split-conjunction') for (const s of ss) n += splitPoints(s).length;
    if (op === 'join-adjacent') for (let i = 0; i + 1 < ss.length; i++) n += joinable(ss[i], ss[i + 1]) ? 1 : 0;
    if (op === 'break-paragraph') n += ss.length >= 4 ? 1 : 0;
    if (op === 'parenthetical-to-commas') n += (masked(b.text).match(PAREN) ?? []).length;
    if (op === 'semicolon-to-period') n += (masked(b.text).match(/;\s+[a-z]/g) ?? []).length;
  }
  if (op === 'merge-paragraphs') for (let i = 0; i + 1 < bs.length; i++) n += mergeable(bs[i], bs[i + 1]) ? 1 : 0;
  return n;
}

/** The text with `op` applied at site `k` (as `sitesOf` counts them), or null when there is no such site. */
export function applyOperator(op: OperatorId, text: string, k: number): string | null {
  const bs = blocksOf(text);
  let n = 0;
  if (op === 'merge-paragraphs') {
    for (let i = 0; i + 1 < bs.length; i++) {
      if (!mergeable(bs[i], bs[i + 1])) continue;
      if (n++ === k) return joinBlocks([...bs.slice(0, i), { text: `${bs[i].text.trimEnd()} ${bs[i + 1].text.trimStart()}`, prose: true }, ...bs.slice(i + 2)]);
    }
    return null;
  }
  for (let bi = 0; bi < bs.length; bi++) {
    const b = bs[bi];
    if (!b.prose) continue;
    const ss = sentencesIn(b.text);
    const replace = (next: string): string => joinBlocks([...bs.slice(0, bi), { text: next, prose: true }, ...bs.slice(bi + 1)]);
    if (op === 'split-conjunction') {
      for (let si = 0; si < ss.length; si++) {
        for (const at of splitPoints(ss[si])) {
          if (n++ !== k) continue;
          const m = /^,\s+(and|but|so|yet)\s+/.exec(ss[si].slice(at));
          if (!m) return null;
          const rest = ss[si].slice(at + m[0].length);
          // "and" is dropped; "but", "so" and "yet" carry meaning and open the new sentence.
          const second = m[1] === 'and' ? cap(rest) : `${cap(m[1])} ${rest}`;
          return replace([...ss.slice(0, si), `${ss[si].slice(0, at)}.`, second, ...ss.slice(si + 1)].join(' '));
        }
      }
    }
    if (op === 'join-adjacent') {
      for (let si = 0; si + 1 < ss.length; si++) {
        if (!joinable(ss[si], ss[si + 1]) || n++ !== k) continue;
        const second = ss[si + 1].replace(/^(["“([]?)([A-Z])/, (_, q: string, c: string) => `${q}${c.toLowerCase()}`);
        return replace([...ss.slice(0, si), `${ss[si].slice(0, -1)}, and ${second}`, ...ss.slice(si + 2)].join(' '));
      }
    }
    if (op === 'break-paragraph' && ss.length >= 4) {
      if (n++ === k) { const mid = Math.floor(ss.length / 2); return joinBlocks([...bs.slice(0, bi), { text: ss.slice(0, mid).join(' '), prose: true }, { text: ss.slice(mid).join(' '), prose: true }, ...bs.slice(bi + 1)]); }
    }
    if (op === 'parenthetical-to-commas' || op === 'semicolon-to-period') {
      const m = masked(b.text);
      const re = op === 'parenthetical-to-commas' ? new RegExp(PAREN.source, 'g') : /;\s+([a-z])/g;
      for (let x = re.exec(m); x; x = re.exec(m)) {
        if (n++ !== k) continue;
        const before = b.text.slice(0, x.index); const after = b.text.slice(x.index + x[0].length);
        if (op === 'parenthetical-to-commas') {
          const inner = b.text.slice(x.index + 2, x.index + x[0].length - 1);
          const tail = /^[.,;:!?]/.test(after) ? after : `,${after}`;
          return replace(`${before}, ${inner}${tail}`);
        }
        return replace(`${before}. ${b.text.charAt(x.index + x[0].length - 1).toUpperCase()}${after}`);
      }
    }
  }
  return null;
}

/**
 * Whether an operator kept the words: the same words in the same order, case aside, but for one "and" dropped
 * at a split or added at a join. The guard every application passes before anything else is weighed.
 */
export function keepsWords(before: string, after: string): boolean {
  const ws = (t: string): string[] => (t.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? []);
  const a = ws(before); const b = ws(after);
  if (Math.abs(a.length - b.length) > 1) return false;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  let i = 0; let j = 0; let skipped = 0;
  while (i < long.length) {
    if (long[i] === short[j]) { i++; j++; continue; }
    if (long[i] === 'and' && skipped === 0) { skipped = 1; i++; continue; }
    return false;
  }
  return j === short.length;
}

/** The measured effect of one operator on each feature: the mean change per application, and how many applications. */
export type EffectMatrix = Readonly<Record<string, Readonly<Record<string, { readonly mean: number; readonly n: number }>>>>;

/**
 * THE EFFECT MATRIX. Each operator applied at up to `perText` sites of each of the model's drafts, every
 * feature in `features` measured before and after. No model call. What it says is what this operator does to
 * text like this model's, which is the text it will be applied to.
 */
export function effectMatrix(drafts: readonly string[], features: readonly string[], perText = 4): EffectMatrix {
  const out: Record<string, Record<string, { mean: number; n: number }>> = {};
  const measured = features.flatMap((id) => { const f = featureOf(id); return f ? [{ id, f }] : []; });
  for (const op of OPERATOR_IDS) {
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const d of drafts) {
      const sites = Math.min(sitesOf(op, d), perText);
      if (!sites) continue;
      const before = new Map(measured.map(({ id, f }) => [id, f.measure(d)]));
      for (let k = 0; k < sites; k++) {
        const after = applyOperator(op, d, k);
        if (after === null) continue;
        for (const { id, f } of measured) {
          const a = before.get(id) ?? null; const b = f.measure(after);
          if (a === null || b === null) continue;
          (acc[id] ??= { sum: 0, n: 0 }).sum += b - a; acc[id].n += 1;
        }
      }
    }
    out[op] = Object.fromEntries(Object.entries(acc).map(([id, x]) => [id, { mean: Math.round((x.sum / x.n) * 10000) / 10000, n: x.n }]));
  }
  return out;
}

/**
 * The operators whose measured effect moves `feature` in `direction` ('high' means the text is above the band,
 * so the effect must be negative), strongest first, ignoring effects measured fewer than `minN` times.
 */
export function operatorsToward(m: EffectMatrix, feature: string, direction: 'low' | 'high', minN = 3): OperatorId[] {
  return OPERATOR_IDS.map((op) => ({ op, e: m[op]?.[feature] }))
    .filter((x): x is { op: OperatorId; e: { mean: number; n: number } } => !!x.e && x.e.n >= minN && (direction === 'high' ? x.e.mean < 0 : x.e.mean > 0))
    .sort((a, b) => Math.abs(b.e.mean) - Math.abs(a.e.mean) || a.op.localeCompare(b.op)).map((x) => x.op);
}

/**
 * The prose sentences of a whole text, with where each starts: prose paragraphs only, split with the same
 * abbreviation-aware, mask-aware splitter the operators use. For a caller that rewrites one sentence.
 */
export function proseSentences(text: string): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = [];
  let offset = 0;
  for (const b of blocksOf(text)) {
    const at = text.indexOf(b.text, offset);
    if (b.prose && at >= 0) for (const sp of sentenceSpans(b.text)) out.push({ s: b.text.slice(sp.start, sp.end), at: at + sp.start });
    offset = Math.max(offset, at + b.text.length);
  }
  return out;
}
