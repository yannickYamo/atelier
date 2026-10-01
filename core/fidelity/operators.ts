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
// Every operator keeps the words and their order, except a dropped "and" at a split and an added "and" at a
// join; figures, names, negations and qualifiers are untouched, so the integrity guard holds by construction
// (and is still checked by the caller). Only prose paragraphs are touched: never a heading, a list item, a
// quotation, a table or a code fence.

import { featureOf } from '../observers/features.js';

export type OperatorId = 'split-conjunction' | 'join-adjacent' | 'break-paragraph' | 'merge-paragraphs' | 'parenthetical-to-commas' | 'semicolon-to-period';
export const OPERATOR_IDS: readonly OperatorId[] = ['split-conjunction', 'join-adjacent', 'break-paragraph', 'merge-paragraphs', 'parenthetical-to-commas', 'semicolon-to-period'];

interface Block { text: string; prose: boolean }

/** Blocks separated by blank lines; a block is prose unless it is a heading, list, quotation, table, or inside a code fence. */
function blocksOf(text: string): Block[] {
  const raw = text.split(/\n[ \t]*\n/);
  let fence = false;
  return raw.map((b) => {
    const t = b.trim();
    const fences = (t.match(/^(```|~~~)/gm) ?? []).length;
    const inFence = fence || fences > 0;
    if (fences % 2 === 1) fence = !fence;
    const prose = !inFence && t.length > 0 && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/.test(t) && !/\n\s*([-*+]|\d+[.)])\s/.test(t);
    return { text: b, prose };
  });
}
const joinBlocks = (bs: readonly Block[]): string => bs.map((b) => b.text).join('\n\n');

/** Sentences of one prose paragraph: split after . ! ? before a capital, a quote or a bracket. */
const sentencesIn = (p: string): string[] => p.trim().split(/(?<=[.!?]["”')\]]?)\s+(?=["“([]?[A-Z0-9])/).filter(Boolean);
const words = (s: string): number => (s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
const cap = (s: string): string => s.replace(/^(["“([]?)([a-z])/, (_, q: string, c: string) => `${q}${c.toUpperCase()}`);

/**
 * Words written with a capital somewhere other than a sentence start: names, which a join must not lower-case.
 * "I" always counts.
 */
function namesOf(text: string): Set<string> {
  const out = new Set<string>(['I']);
  for (const m of text.matchAll(/(?<=[a-z,;:] )([A-Z][A-Za-z'’-]*)/g)) out.add(m[1]);
  return out;
}

/** Sentence-opening words a join may lower-case: function words, never something that could be a name. */
const LOWERABLE: ReadonlySet<string> = new Set(['the', 'a', 'an', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'then', 'we', 'they', 'he', 'she',
  'you', 'our', 'my', 'your', 'their', 'his', 'her', 'nobody', 'everyone', 'nothing', 'most', 'some', 'all', 'each', 'one', 'no', 'not', 'in', 'on', 'at', 'by',
  'for', 'with', 'when', 'if', 'after', 'before', 'once', 'now', 'today', 'still', 'even', 'only', 'what', 'which', 'who']);

const CONJ = /,\s+(and|but|so|yet)\s+/g;

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
    if (op === 'parenthetical-to-commas') n += (b.text.match(/ \(([^()\n]{8,120})\)/g) ?? []).length;
    if (op === 'semicolon-to-period') n += (b.text.match(/;\s+[a-z]/g) ?? []).length;
  }
  if (op === 'merge-paragraphs') for (let i = 0; i + 1 < bs.length; i++) n += mergeable(bs[i], bs[i + 1]) ? 1 : 0;
  return n;
}

/** Where a sentence may be split at ", and|but|so|yet": both sides at least five words, the sentence at least sixteen. */
function splitPoints(s: string): number[] {
  if (words(s) < 16) return [];
  const out: number[] = [];
  for (const m of s.matchAll(CONJ)) {
    const at = m.index ?? 0;
    if (words(s.slice(0, at)) >= 5 && words(s.slice(at + m[0].length)) >= 5) out.push(at);
  }
  return out;
}
const joinable = (a: string, b: string): boolean => /[a-z0-9)]\.$/.test(a) && words(a) <= 12 && words(b) <= 14 && words(a) + words(b) <= 26 && !/[?!:]$/.test(b.slice(0, -1));
const mergeable = (a: Block, b: Block): boolean => a.prose && b.prose && sentencesIn(a.text).length <= 2 && sentencesIn(b.text).length <= 2;

/** The text with `op` applied at site `k` (as `sitesOf` counts them), or null when there is no such site. */
export function applyOperator(op: OperatorId, text: string, k: number): string | null {
  const bs = blocksOf(text);
  const names = namesOf(text);
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
          const joined = [...ss.slice(0, si), `${ss[si].slice(0, at)}.`, second, ...ss.slice(si + 1)].join(' ');
          return replace(joined);
        }
      }
    }
    if (op === 'join-adjacent') {
      for (let si = 0; si + 1 < ss.length; si++) {
        if (!joinable(ss[si], ss[si + 1]) || n++ !== k) continue;
        const first = /^\S+/.exec(ss[si + 1])?.[0].replace(/[^A-Za-z'’-]/g, '') ?? '';
        // Lower-cased only when it is a common word: a capital that might be a name is kept as written.
        const second = names.has(first) || !LOWERABLE.has(first.toLowerCase()) ? ss[si + 1] : ss[si + 1].replace(/^(["“([]?)([A-Z])/, (_, q: string, c: string) => `${q}${c.toLowerCase()}`);
        return replace([...ss.slice(0, si), `${ss[si].slice(0, -1)}, and ${second}`, ...ss.slice(si + 2)].join(' '));
      }
    }
    if (op === 'break-paragraph' && ss.length >= 4) {
      if (n++ === k) { const mid = Math.floor(ss.length / 2); return joinBlocks([...bs.slice(0, bi), { text: ss.slice(0, mid).join(' '), prose: true }, { text: ss.slice(mid).join(' '), prose: true }, ...bs.slice(bi + 1)]); }
    }
    if (op === 'parenthetical-to-commas') {
      let found: string | null = null;
      const next = b.text.replace(/ \(([^()\n]{8,120})\)/g, (all, inner: string) => { if (found === null && n++ === k) { found = inner; return `, ${inner},`; } return all; });
      if (found !== null) return replace(next.replace(/,,/g, ',').replace(/,\./g, '.'));
    }
    if (op === 'semicolon-to-period') {
      let done = false;
      const next = b.text.replace(/;\s+([a-z])/g, (all, c: string) => { if (!done && n++ === k) { done = true; return `. ${c.toUpperCase()}`; } return all; });
      if (done) return replace(next);
    }
  }
  return null;
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
  for (const op of OPERATOR_IDS) {
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const d of drafts) {
      const sites = Math.min(sitesOf(op, d), perText);
      for (let k = 0; k < sites; k++) {
        const after = applyOperator(op, d, k);
        if (after === null) continue;
        for (const id of features) {
          const f = featureOf(id);
          const a = f?.measure(d) ?? null; const b = f?.measure(after) ?? null;
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
