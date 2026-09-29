// atelier/core/observers/features.ts — MANY SMALL COUNTS, SO THE AUTHOR'S TASTE CAN SELECT AMONG THEM.
//
// Taste lives at several depths, and the shallow ones are cheap to count and easy to fake. The patterns in
// ./style.ts are the constructions that were known to matter before any author was read. This registry
// is the other half: a wide set of plain, deterministic features across the layers of a text
// (punctuation, sentence shape, page furniture, wording, stance, sound, unevenness), none of which is
// assumed to matter. Which of them carry THIS author's taste is decided by ./selection.ts, from their
// own pieces against the model's own drafts: most features separate nobody, and a feature that does not
// separate is not taste and is never proposed.
//
// Every feature is a number per text, or null when the text is too short or has too few events for the
// number to mean anything. No feature calls a model. The FEATURE observer holds a text to the band the
// selection read off the author's pieces, both sides: a floor with no ceiling is how a model overshoots.

import { wordsOf, proseRegions, proseSentencesOf, quantile } from './text.js';
import type { Observer } from './registry.js';

/** The layers of a text a feature belongs to. Numbered as in docs/FORMATS.md. */
export type Layer = 1 | 2 | 3 | 4 | 7 | 9 | 10;
export const LAYER_LABEL: Readonly<Record<Layer, string>> = {
  1: 'punctuation and typography', 2: 'sentence architecture', 3: 'page and document', 4: 'lexicon and wording',
  7: 'narrator and stance', 9: 'sound', 10: 'irregularity',
};

export interface Feature {
  readonly id: string;
  readonly layer: Layer;
  readonly label: string;
  /** how the value reads: a rate per 1,000 prose words, a share between 0 and 1, or a plain value */
  readonly unit: 'per1000' | 'share' | 'value';
  /**
   * More of it means more specifics the writer must supply (links, figures, names, quotations). Such a
   * feature is only ever proposed as a cap: a floor would ask a draft for links or figures that the
   * UNSOURCED check (../loop/claim-extract.ts) then cuts, because nobody supplied them.
   */
  readonly specifics?: true;
  measure(text: string): number | null;
}

const MIN_WORDS = 150;
const prose = (text: string): string => proseRegions(text).map((r) => r.text).join('\n\n');
const proseWordCount = (text: string): number => wordsOf(prose(text)).length;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** A count per 1,000 prose words, or null under MIN_WORDS. */
const per1000 = (count: (p: string, raw: string) => number) => (text: string): number | null => {
  const n = proseWordCount(text);
  return n < MIN_WORDS ? null : r3((count(prose(text), text) / n) * 1000);
};
/** A share of sentences, or null under ten sentences. */
const sentenceShare = (test: (s: string) => boolean) => (text: string): number | null => {
  const ss = proseSentencesOf(text);
  return ss.length < 10 ? null : r3(ss.filter((s) => test(s.text.trim())).length / ss.length);
};
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

/**
 * THE PAGE, WITHOUT WHAT IS NOT WRITING. The page-furniture counts read the raw markdown (a list item
 * is its marker), so they must not read YAML front matter (a `tags:` list took list items from 0 to
 * 15 per 1,000 words, and a `url:` line counted as a link) or the inside of a code fence (a `- flag`
 * in a shell snippet is not a list item). Both are blanked, line for line; the fences themselves are
 * counted, ``` and ~~~ alike, the same way ./text.ts reads them. An unclosed fence runs to the end.
 */
export function pageOf(text: string): { readonly body: string; readonly fences: number } {
  const lines = text.split('\n');
  let fence: string | null = null; let front = false; let fences = 0;
  const body = lines.map((line, i) => {
    const t = line.trim();
    if (i === 0 && t === '---') { front = true; return ''; }
    if (front) { if (t === '---' || t === '...') front = false; return ''; }
    const f = /^(```|~~~)/.exec(t);
    if (fence) { if (f && t.startsWith(fence)) fence = null; return ''; }
    if (f) { fence = f[1]; fences += 1; return ''; }
    return line;
  }).join('\n');
  return { body, fences };
}
/** A count over the page (see `pageOf`) per 1,000 prose words, or null under MIN_WORDS. */
const perPage1000 = (c: (page: { body: string; fences: number }) => number) => (text: string): number | null => {
  const n = proseWordCount(text);
  return n < MIN_WORDS ? null : r3((c(pageOf(text)) / n) * 1000);
};
const lengths = (text: string): number[] => proseSentencesOf(text).map((s) => s.words).filter((w) => w > 0);

const syllables = (w: string): number => {
  const x = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!x) return 0;
  if (x.length <= 3) return 1;
  const groups = x.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
};

/** Measure of textual lexical diversity, one direction: the mean length of runs that keep type/token above 0.72. */
function mtldOneWay(words: readonly string[]): number {
  let factors = 0; let types = new Set<string>(); let tokens = 0;
  for (const w of words) {
    types.add(w); tokens += 1;
    if (types.size / tokens <= 0.72) { factors += 1; types = new Set(); tokens = 0; }
  }
  if (tokens > 0) factors += (1 - types.size / tokens) / (1 - 0.72);
  return factors > 0 ? words.length / factors : words.length;
}

const SMALL_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const IMPERATIVES = new Set(['use', 'write', 'stop', 'start', 'try', 'make', 'keep', 'ask', "don't", 'do', 'pick', 'run', 'read', 'think', 'look',
  'let', 'take', 'give', 'put', 'avoid', 'build', 'treat', 'check', 'measure', 'add', 'drop', 'cut', 'set', 'go', 'consider', 'remember', 'notice']);
const DISCOURSE = /^(?:so|now|look|okay|ok|well|right|anyway|honestly)\b[,:]?/i;
/** Words that open a sentence and take a comma without starting a list: sentence adverbs and connectives. */
const INTRODUCTORY = new Set(['however', 'so', 'now', 'well', 'yes', 'no', 'still', 'also', 'then', 'thus', 'therefore', 'instead',
  'meanwhile', 'moreover', 'furthermore', 'besides', 'indeed', 'first', 'second', 'third', 'finally', 'next', 'again', 'otherwise',
  'anyway', 'look', 'okay', 'ok', 'right', 'today', 'yesterday', 'here', 'sometimes', 'often', 'later', 'afterwards', 'consequently',
  'hence', 'nevertheless', 'nonetheless', 'similarly', 'likewise', 'overall', 'ultimately', 'but', 'and', 'or', 'yet']);
/**
 * Lists of three matched by `re`, less those whose first item (group 1) is an introductory word, or any
 * -ly adverb, opening its sentence. Not a parser: the one bias it removes is the common one.
 */
function listsOf(p: string, re: RegExp): number {
  let n = 0;
  const g = new RegExp(re.source, 'g');
  for (let m = g.exec(p); m; m = g.exec(p)) {
    const first = m[1].toLowerCase();
    const opensSentence = /(?:^|[.!?]["”')\]]*\s+)$/.test(p.slice(0, m.index));
    // Skipped, the search resumes just past the introductory word, so a real list after it still counts.
    if (opensSentence && (INTRODUCTORY.has(first) || first.endsWith('ly'))) { g.lastIndex = m.index + first.length; continue; }
    n += 1;
  }
  return n;
}

export const FEATURES: readonly Feature[] = [
  // ── 1. punctuation and typography ──────────────────────────────────────────────────────────────
  { id: 'colon', layer: 1, label: 'colons', unit: 'per1000', measure: per1000((p) => count(p.replace(/https?:\/\//g, ''), /:(?=\s)/g)) },
  { id: 'parenthesis', layer: 1, label: 'parenthetical asides', unit: 'per1000', measure: per1000((p) => count(p.replace(/\]\([^)]*\)/g, ']'), /\(/g)) },
  { id: 'exclamation', layer: 1, label: 'exclamation marks', unit: 'per1000', measure: per1000((p) => count(p, /!(?!\[)/g)) },
  { id: 'ellipsis', layer: 1, label: 'ellipses', unit: 'per1000', measure: per1000((p) => count(p, /…|\.\.\./g)) },
  { id: 'question', layer: 1, label: 'questions', unit: 'share', measure: sentenceShare((s) => s.endsWith('?')) },
  { id: 'italic', layer: 1, label: 'italics', unit: 'per1000', measure: perPage1000(({ body }) => count(body.replace(/\*\*[^*]+\*\*/g, ''), /(?<![*\w])[*_][^*_\n]{2,80}[*_](?![*\w])/g)) },
  { id: 'quoted', layer: 1, label: 'quoted phrases', unit: 'per1000', specifics: true, measure: per1000((p) => count(p, /["“][^"”\n]{2,200}["”]/g)) },
  // A list's first item is never an introductory word that opens its sentence: "However, the cat and
  // dog" is a sentence adverb and a pair, not three items without the serial comma.
  { id: 'oxfordComma', layer: 1, label: 'the serial comma, in lists of three', unit: 'share', measure: (text) => {
    const p = prose(text);
    const withComma = listsOf(p, /\b(\w+), \w+(?: \w+){0,2}, (?:and|or) \w/g);
    const without = listsOf(p, /\b(\w+), \w+(?: \w+){0,2} (?:and|or) \w/g);
    return withComma + without < 3 ? null : r3(withComma / (withComma + without));
  } },
  { id: 'smallNumerals', layer: 1, label: 'small numbers written as digits rather than words', unit: 'share', measure: (text) => {
    const p = prose(text);
    // A digit is part of a larger number only when a digit is on the other side of the point or comma:
    // "3.5" and "4,000" are not small numbers, "We had 3." and "then 4, then 5" are.
    const digits = count(p, /(?<!\d[.,])\b[2-9]\b(?![.,]\d|%)/g);
    const spelled = count(p, new RegExp(`\\b(?:${SMALL_WORDS.join('|')})\\b`, 'gi'));
    return digits + spelled < 3 ? null : r3(digits / (digits + spelled));
  } },
  // ── 2. sentence architecture ───────────────────────────────────────────────────────────────────
  { id: 'sentenceP10', layer: 2, label: 'the length of your short sentences (10th percentile, words)', unit: 'value', measure: (t) => { const l = lengths(t); return l.length < 10 ? null : quantile(l, 0.1); } },
  { id: 'sentenceP90', layer: 2, label: 'the length of your long sentences (90th percentile, words)', unit: 'value', measure: (t) => { const l = lengths(t); return l.length < 10 ? null : quantile(l, 0.9); } },
  { id: 'cadence', layer: 2, label: 'cadence: how much one sentence\'s length predicts the next (lag-one correlation)', unit: 'value', measure: (t) => {
    const l = lengths(t);
    if (l.length < 12) return null;
    const m = l.reduce((a, b) => a + b, 0) / l.length;
    let num = 0; let den = 0;
    for (let i = 0; i < l.length; i++) { den += (l[i] - m) ** 2; if (i > 0) num += (l[i] - m) * (l[i - 1] - m); }
    return den === 0 ? null : r3(num / den);
  } },
  { id: 'openerConjunction', layer: 2, label: 'sentences opening on And, But, So, Or or Yet', unit: 'share', measure: sentenceShare((s) => /^(?:and|but|so|or|yet)\b/i.test(s)) },
  { id: 'openerSelf', layer: 2, label: 'sentences opening on I or We', unit: 'share', measure: sentenceShare((s) => /^(?:i|we)\b/i.test(s)) },
  { id: 'openerDeictic', layer: 2, label: 'sentences opening on The, This, That, It, These or There', unit: 'share', measure: sentenceShare((s) => /^(?:the|this|that|it|these|there)\b/i.test(s)) },
  { id: 'passive', layer: 2, label: 'passive constructions', unit: 'per1000', measure: per1000((p) => count(p, /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/gi)) },
  { id: 'nominalisation', layer: 2, label: 'nominalisations (-tion, -ment, -ness, -ity, -ance, -ence)', unit: 'per1000', measure: per1000((p) => count(p, /\b\w{4,}(?:tion|ment|ness|ity|ance|ence)s?\b/gi)) },
  { id: 'triad', layer: 2, label: 'three-item lists', unit: 'per1000', measure: per1000((p) => count(p, /\b\w+(?: \w+)?, \w+(?: \w+)?,? (?:and|or) \w+/g)) },
  // ── 3. page and document ──────────────────────────────────────────────────────────────────────
  // Page furniture is read off the raw page, less front matter and the inside of code fences (`pageOf`).
  { id: 'listItem', layer: 3, label: 'list items', unit: 'per1000', measure: perPage1000(({ body }) => count(body, /^\s*(?:[-*+]|\d+[.)])\s+\S/gm)) },
  { id: 'link', layer: 3, label: 'links', unit: 'per1000', specifics: true, measure: perPage1000(({ body }) => count(body, /\]\(https?:\/\/|(?<!\()https?:\/\/\S+/g)) },
  { id: 'codeBlock', layer: 3, label: 'code blocks', unit: 'per1000', measure: perPage1000(({ fences }) => fences) },
  { id: 'blockquote', layer: 3, label: 'block quotations', unit: 'per1000', measure: perPage1000(({ body }) => count(body, /^>\s*\S/gm)) },
  // ── 4. lexicon and wording ────────────────────────────────────────────────────────────────────
  { id: 'lexicalDiversity', layer: 4, label: 'lexical diversity (MTLD)', unit: 'value', measure: (text) => {
    const w = wordsOf(prose(text)).map((x) => x.toLowerCase());
    return w.length < MIN_WORDS ? null : r3((mtldOneWay(w) + mtldOneWay([...w].reverse())) / 2);
  } },
  { id: 'wordLength', layer: 4, label: 'mean word length (letters)', unit: 'value', measure: (text) => {
    const w = wordsOf(prose(text)).map((x) => x.replace(/[^A-Za-z]/g, '')).filter(Boolean);
    return w.length < MIN_WORDS ? null : r3(w.reduce((n, x) => n + x.length, 0) / w.length);
  } },
  { id: 'secondPerson', layer: 4, label: '"you" and "your"', unit: 'per1000', measure: per1000((p) => count(p, /\byou(?:r|rs|rself)?\b/gi)) },
  { id: 'firstPlural', layer: 4, label: '"we", "our" and "us"', unit: 'per1000', measure: per1000((p) => count(p, /\b(?:we|our|ours|us)\b/gi)) },
  { id: 'tentativeModal', layer: 4, label: 'tentative modals (might, may, could)', unit: 'per1000', measure: per1000((p) => count(p, /\b(?:might|may|could)\b/gi)) },
  { id: 'firmModal', layer: 4, label: 'firm modals (must, should, need to)', unit: 'per1000', measure: per1000((p) => count(p, /\b(?:must|should|need to|needs to)\b/gi)) },
  { id: 'numbers', layer: 4, label: 'figures written in digits', unit: 'per1000', specifics: true, measure: per1000((p) => count(p, /\b\d[\d,.]*%?/g)) },
  { id: 'names', layer: 4, label: 'names mid-sentence (people, products, organisations)', unit: 'per1000', specifics: true, measure: per1000((p) => count(p, /(?<=[a-z,;:] )[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g)) },
  { id: 'discourse', layer: 4, label: 'spoken discourse markers opening a sentence (so, now, look, okay, well)', unit: 'share', measure: sentenceShare((s) => DISCOURSE.test(s)) },
  // ── 7. narrator and stance ────────────────────────────────────────────────────────────────────
  { id: 'imperative', layer: 7, label: 'sentences that tell the reader what to do', unit: 'share', measure: sentenceShare((s) => IMPERATIVES.has((s.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z']/g, ''))) },
  // ── 9. sound ──────────────────────────────────────────────────────────────────────────────────
  { id: 'readingEase', layer: 9, label: 'reading ease (Flesch)', unit: 'value', measure: (text) => {
    const w = wordsOf(prose(text)); const l = lengths(text);
    if (w.length < MIN_WORDS || l.length < 5) return null;
    const syl = w.reduce((n, x) => n + syllables(x), 0);
    return r3(206.835 - 1.015 * (w.length / l.length) - 84.6 * (syl / w.length));
  } },
  { id: 'commasPerSentence', layer: 9, label: 'commas per sentence', unit: 'value', measure: (text) => { const ss = proseSentencesOf(text); return ss.length < 10 ? null : r3(ss.reduce((n, s) => n + count(s.text, /,/g), 0) / ss.length); } },
  { id: 'monosyllabicRun', layer: 9, label: 'runs of five or more one-syllable words', unit: 'per1000', measure: per1000((p) => {
    let runs = 0; let run = 0;
    for (const w of wordsOf(p)) { if (syllables(w) === 1) { run += 1; if (run === 5) runs += 1; } else run = 0; }
    return runs;
  }) },
  // ── 10. irregularity ──────────────────────────────────────────────────────────────────────────
  { id: 'sectionSpread', layer: 10, label: 'how uneven your sections are (longest over shortest, in words)', unit: 'value', measure: (text) => {
    const sections = pageOf(text).body.split(/^#{2,6}\s.*$/m).map((s) => wordsOf(prose(s)).length).filter((n) => n >= 30);
    return sections.length < 3 ? null : r3(Math.max(...sections) / Math.min(...sections));
  } },
  { id: 'paragraphSpread', layer: 10, label: 'how uneven your paragraphs are (variation in length)', unit: 'value', measure: (text) => {
    const ps = prose(text).split(/\n\s*\n/).map((p) => wordsOf(p).length).filter((n) => n > 0);
    if (ps.length < 6) return null;
    const m = ps.reduce((a, b) => a + b, 0) / ps.length;
    return r3(Math.sqrt(ps.reduce((n, x) => n + (x - m) ** 2, 0) / ps.length) / m);
  } },
];

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]));
export const featureOf = (id: string): Feature | null => BY_ID.get(id) ?? null;

const num = (p: Readonly<Record<string, unknown>>, k: string): number | null => (typeof p[k] === 'number' ? p[k] : null);
const fmt = (f: Feature, x: number): string => (f.unit === 'share' ? `${Math.round(x * 100)}%` : `${x}`);

/** FEATURE: one registered feature held to a band, both sides. No spans: there is no single place a rate lives. */
export const FEATURE: Observer = {
  id: 'FEATURE',
  describe: (p) => {
    const f = featureOf(((p.feature as readonly string[] | undefined) ?? [])[0] ?? '');
    const lo = num(p, 'minValue'); const hi = num(p, 'maxValue');
    if (!f) return 'an unknown feature';
    const unit = f.unit === 'per1000' ? ' per 1,000 words' : '';
    return `${f.label}${lo !== null && hi !== null ? ` between ${fmt(f, lo)} and ${fmt(f, hi)}${unit}` : lo !== null ? ` at least ${fmt(f, lo)}${unit}` : hi !== null ? ` at most ${fmt(f, hi)}${unit}` : ''}`;
  },
  validate: (p) => {
    const id = ((p.feature as readonly string[] | undefined) ?? [])[0];
    if (!id || !featureOf(id)) return `needs feature=<one of: ${FEATURES.map((f) => f.id).join(', ')}>`;
    const lo = num(p, 'minValue'); const hi = num(p, 'maxValue');
    if (lo === null && hi === null) return 'needs minValue, maxValue or both';
    return lo !== null && hi !== null && lo > hi ? 'minValue cannot exceed maxValue' : null;
  },
  observe(text, p) {
    const f = featureOf(((p.feature as readonly string[] | undefined) ?? [])[0] ?? '');
    if (!f) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: 'unknown feature' };
    const v = f.measure(text);
    if (v === null) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `too short to measure ${f.label}` };
    const lo = num(p, 'minValue'); const hi = num(p, 'maxValue');
    const out = (lo !== null && v < lo) || (hi !== null && v > hi);
    return { verdict: out ? 'VIOLATED' : 'MET', spans: [], value: v,
      detail: `${f.label}: ${fmt(f, v)}${out ? `, outside ${lo !== null ? fmt(f, lo) : '…'} to ${hi !== null ? fmt(f, hi) : '…'}` : ''}` };
  },
};
