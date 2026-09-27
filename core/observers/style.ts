// atelier/core/observers/style.ts — WHAT THE MODEL DOES THAT THE AUTHOR DOESN'T, COUNTED.
//
// Discovery reads what an author does. The fingerprint a reader recognises as machine-written is made of
// what the author does NOT do and the model does by default: em dashes where the author writes a spaced
// hyphen, five-word fragments, "That's not X. It's Y.", "Here's the thing", "quietly". None of those is
// a decision anyone would name, so no reading of the author surfaces them, and no list of clichéd words
// catches them, because they are punctuation and sentence shape.
//
// So they are counted, the same way, in two places: the author's own work, and plain drafts the model
// writes on the same kind of topic with no skill at all. Where the rates differ by a wide margin, the gap
// is the fingerprint, and a rule proposed from it carries both numbers. Every pattern here is a fixed,
// named, deterministic construction; none of them judges whether a sentence is good.

import type { Span } from './registry.js';
import { proseBlocks, sentencesOf, paragraphsOf, proseRegions, wordsOf, quantile } from './text.js';

export type PatternId =
  | 'EM_DASH' | 'SPACED_HYPHEN' | 'SEMICOLON' | 'NOT_X_ITS_Y' | 'THAT_OPENER' | 'HERES_OPENER'
  | 'SIGNPOST' | 'INTENSIFIER' | 'SHORT_VERDICT' | 'BOLD_SPAN' | 'ONE_LINE_PARAGRAPH'
  | 'RHETORICAL_QUESTION' | 'REPEATED_OPENER';

/** How each pattern reads to a person, for statements and reports. */
export const PATTERN_LABEL: Readonly<Record<PatternId, string>> = {
  EM_DASH: 'em dashes (—)',
  SPACED_HYPHEN: 'spaced hyphens ( - )',
  SEMICOLON: 'semicolons',
  NOT_X_ITS_Y: '"not X, it\'s Y" constructions',
  THAT_OPENER: 'sentences opening "That\'s" or "This is"',
  HERES_OPENER: 'sentences opening "Here\'s" or "Here is"',
  SIGNPOST: 'signposting ("let me…", "I want to…", "here\'s the thing")',
  INTENSIFIER: 'intensifiers ("quietly", "genuinely", "deeply", "fundamentally")',
  SHORT_VERDICT: 'short verdict sentences ("X is dead.", "That changes everything.")',
  BOLD_SPAN: 'bold phrases',
  ONE_LINE_PARAGRAPH: 'one-sentence paragraphs',
  RHETORICAL_QUESTION: 'rhetorical questions',
  REPEATED_OPENER: 'repeated sentence openings (the same two words starting three or more sentences)',
};

export const PATTERN_IDS = Object.keys(PATTERN_LABEL) as PatternId[];

const REGEX: Partial<Record<PatternId, RegExp>> = {
  EM_DASH: /—/g,
  SPACED_HYPHEN: /\s-\s/g,
  SEMICOLON: /;/g,
  NOT_X_ITS_Y: /\bnot [^.;!?—]{1,60}?(?:,|;|—|\s-\s)\s?(?:it'?s|it is|but|that'?s|they'?re)\b|\b(?:it'?s|that'?s|this is|this isn'?t|it isn'?t) not [^.!?]{1,60}[.!?]\s+(?:it'?s|that'?s|it is)\b/gi,
  SIGNPOST: /\b(?:let me (?:be|explain|walk|start|offer|put|say|give)|I want to (?:spend|talk|be|start|make|offer)|here'?s (?:the thing|what|why|how|the part)|here is (?:the thing|what|why|how)|in other words|to be clear|the (?:short|long|honest) answer|let'?s be (?:clear|honest))\b/gi,
  INTENSIFIER: /\b(?:quietly|genuinely|deeply|truly|fundamentally|incredibly|remarkably|profoundly)\b/gi,
  BOLD_SPAN: /\*\*[^*\n]+\*\*/g,
};

const STOP = new Set(['the', 'a', 'an', 'and', 'but', 'so', 'or', 'it', 'i', 'we', 'you', 'this', 'that', 'in', 'on', 'of', 'to', 'is', 'if', 'for', 'as', 'at']);

/** Every occurrence of a pattern in the prose of `text`, as spans in the original text. */
export function findPattern(text: string, p: PatternId): Span[] {
  const re = REGEX[p];
  if (re) {
    const spans: Span[] = [];
    for (const b of proseBlocks(text)) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(b.text)) !== null) {
        const start = b.at[m.index]; const end = b.at[m.index + m[0].length - 1] + 1;
        spans.push({ start, end, text: text.slice(start, end), why: PATTERN_LABEL[p] });
      }
    }
    return spans;
  }
  const sentences = sentencesOf(text);
  const asSpan = (s: { start: number; end: number; text: string }): Span => ({ start: s.start, end: s.end, text: s.text, why: PATTERN_LABEL[p] });
  switch (p) {
    case 'THAT_OPENER': return sentences.filter((s) => /^(?:That'?s|That is|This is)\b/.test(s.text)).map(asSpan);
    case 'HERES_OPENER': return sentences.filter((s) => /^Here(?:'?s| is| are)\b/.test(s.text)).map(asSpan);
    case 'RHETORICAL_QUESTION': return sentences.filter((s) => /\?["'”’)]*$/.test(s.text)).map(asSpan);
    case 'SHORT_VERDICT': return sentences.filter((s) => s.words <= 6
      && /\b(?:is|are|was) (?:dead|over|broken|gone|the point|everything|nothing|real|wrong)\b|\b(?:breaks|matters|moved|wins|changes everything|is scheduling)[.!]$/i.test(s.text)).map(asSpan);
    case 'ONE_LINE_PARAGRAPH': return paragraphsOf(text).filter((x) => x.sentences === 1)
      .map((x) => ({ start: x.start, end: x.end, text: x.text, why: PATTERN_LABEL[p] }));
    case 'REPEATED_OPENER': {
      const key = (s: string): string | null => {
        const w = wordsOf(s).slice(0, 2).map((x) => x.toLowerCase());
        return w.length === 2 && !(STOP.has(w[0]) && STOP.has(w[1])) ? w.join(' ') : null;
      };
      const groups = new Map<string, typeof sentences>();
      for (const s of sentences) { const k = key(s.text); if (k) groups.set(k, [...(groups.get(k) ?? []), s]); }
      // The third and later sentences opening the same way: one repetition is emphasis, three is a template.
      return [...groups.values()].filter((g) => g.length >= 3).flatMap((g) => g.slice(2)).map(asSpan);
    }
    default: return [];
  }
}

export const proseWords = (text: string): number => proseRegions(text).reduce((n, r) => n + wordsOf(r.text).length, 0);

/** Occurrences per 1,000 words, one decimal. */
export const patternRate = (text: string, p: PatternId): number => {
  const w = proseWords(text);
  return w ? Math.round((findPattern(text, p).length / w) * 10000) / 10 : 0;
};

export const fragmentShare = (text: string, maxWords: number): number => {
  const s = sentencesOf(text);
  return s.length ? s.filter((x) => x.words <= maxWords).length / s.length : 0;
};

// ── Style distance: Burrows' Delta ────────────────────────────────────────────────────────────────
//
// The standard method of authorship attribution: how often a writer uses the most common function
// words — "the", "of", "but", "which" — is a fingerprint below the level anyone chooses deliberately.
// Each word's rate is standardised against a reference set (the author's pieces and the model's plain
// drafts together), and a text's distance to a group is the mean absolute difference of those scores.
// A text is in the author's voice, by this measure, when it is closer to the author than to the model.

export const FUNCTION_WORDS: readonly string[] = [
  'the', 'of', 'and', 'a', 'to', 'in', 'is', 'that', 'it', 'for', 'you', 'was', 'with', 'on', 'as', 'have',
  'be', 'at', 'but', 'this', 'not', 'are', 'or', 'from', 'by', 'they', 'we', 'i', 'an', 'which', 'one', 'so',
  'if', 'what', 'there', 'all', 'can', 'their', 'more', 'when', 'will', 'would', 'about', 'just', 'like',
  'them', 'then', 'than', 'into', 'my', 'our', 'your', 'how', 'these', 'do', 'no', 'only', 'because', 'also',
  'very', 'most', 'some', 'any', 'even', 'much', 'where', 'here', 'now', 'still', 'yet', 'those', 'each',
  'every', 'should', 'could', 'may', 'might', 'must', 'it\'s', 'that\'s', 'don\'t', 'you\'re',
];

export const functionProfile = (text: string, words: readonly string[] = FUNCTION_WORDS): number[] => {
  const tokens = proseRegions(text).flatMap((r) => wordsOf(r.text).map((w) => w.toLowerCase().replace(/’/g, '\'')));
  const n = tokens.length || 1;
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return words.map((w) => (counts.get(w) ?? 0) / n);
};

export interface DeltaReference {
  readonly words: readonly string[];
  readonly mean: readonly number[];
  readonly sd: readonly number[];
  /** mean z-profile of the author's pieces */
  readonly author: readonly number[];
  /** mean z-profile of the model's plain drafts */
  readonly model: readonly number[];
}

export function deltaReference(authorTexts: readonly string[], modelTexts: readonly string[]): DeltaReference {
  const profiles = [...authorTexts, ...modelTexts].map((t) => functionProfile(t));
  const k = FUNCTION_WORDS.length;
  const mean = Array.from({ length: k }, (_, i) => profiles.reduce((s, p) => s + p[i], 0) / profiles.length);
  const sd = Array.from({ length: k }, (_, i) => Math.sqrt(profiles.reduce((s, p) => s + (p[i] - mean[i]) ** 2, 0) / Math.max(1, profiles.length - 1)) || 1e-6);
  const z = (p: number[]): number[] => p.map((v, i) => (v - mean[i]) / sd[i]);
  const centroid = (ps: number[][]): number[] => Array.from({ length: k }, (_, i) => ps.reduce((s, p) => s + p[i], 0) / (ps.length || 1));
  const r = (x: number): number => Math.round(x * 1e6) / 1e6;
  return {
    words: FUNCTION_WORDS, mean: mean.map(r), sd: sd.map(r),
    author: centroid(authorTexts.map((t) => z(functionProfile(t)))).map(r),
    model: centroid(modelTexts.map((t) => z(functionProfile(t)))).map(r),
  };
}

/** Distance of a text to the author and to the model. Lower is closer. */
export function styleDistance(text: string, ref: DeltaReference): { author: number; model: number } {
  const p = functionProfile(text, ref.words);
  const z = p.map((v, i) => (v - ref.mean[i]) / ref.sd[i]);
  const d = (c: readonly number[]): number => z.reduce((s, v, i) => s + Math.abs(v - c[i]), 0) / z.length;
  return { author: Math.round(d(ref.author) * 1000) / 1000, model: Math.round(d(ref.model) * 1000) / 1000 };
}

export const perPieceP = (texts: readonly string[], f: (t: string) => number, q: number): number => quantile(texts.map(f), q);
