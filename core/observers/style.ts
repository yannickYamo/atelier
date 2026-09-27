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
  | 'RHETORICAL_QUESTION' | 'REPEATED_OPENER'
  | 'DASH_ASIDE' | 'FIRST_PERSON' | 'BRITISH_SPELLING' | 'AMERICAN_SPELLING';

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
  // THE MOVE, NOT THE GLYPH. Banning the em dash rerouted every dramatic aside through " - " (8.9 per
  // 1,000 words against the author's 2.9 in a blind round). Counting every dash that sets off an aside,
  // whatever the character, measures the move a ban was meant to limit.
  DASH_ASIDE: 'dash asides (—, – or " - ")',
  FIRST_PERSON: 'first person ("I", "my", "me")',
  BRITISH_SPELLING: 'British spellings (behaviour, organise, centre, licence)',
  AMERICAN_SPELLING: 'American spellings (behavior, organize, center, license)',
};

export const PATTERN_IDS = Object.keys(PATTERN_LABEL) as PatternId[];

// Spelling that marks a dialect. Only words whose spelling differs and is not ambiguous in the other
// dialect: "program" (software in both) and "license" (a verb in both) are left out; "licence" is British.
const IZE = 'organi|reali|recogni|prioriti|optimi|summari|standardi|minimi|maximi|authori|characteri|critici|apologi|categori|capitali|centrali|normali|utili|visuali|speciali|finali|formali|generali|legali|locali|moneti|operationali|personali|externali|internali|industriali|commerciali|moderni|synchroni|customi|monopoli|stabili|neutrali|scrutini|emphasi|memori|hypothesi|theori|jeopardi|mobili|incentivi|priori|democrati';
const BRITISH = new RegExp(`\\b(?:(?:${IZE})s(?:e|es|ed|ing|ation|ations|er|ers)|(?:behavi|col|fav|hon|lab|neighb|harb|rum|hum|vap|endeav)our(?:s|ed|ing|ite|ites|able|al|ally)?|(?:cent|theat|lit|fib|sab)re(?:s|d)?|metres?|catalogue(?:s|d)?|licence(?:s)?|defence|offence|pretence|programmes?|(?:travel|label|model|cancel|signal|channel|fuel|level|counsel|marshal)l(?:ed|ing|er|ers)|judgement(?:s)?|analys(?:e|es|ed|ing)|paralys(?:e|ed|ing)|ageing|grey)\\b`, 'gi');
const AMERICAN = new RegExp(`\\b(?:(?:${IZE})z(?:e|es|ed|ing|ation|ations|er|ers)|(?:behavi|col|fav|hon|lab|neighb|harb|rum|hum|vap|endeav)or(?:s|ed|ing|ite|ites|able|al|ally)?|(?:cent|theat|fib)er(?:s|ed)?|catalog(?:s|ed)?|defense|offense|pretense|(?:travel|label|model|cancel|signal|channel|fuel|level|counsel|marshal)(?:ed|ing|er|ers)|judgment(?:s)?|analyz(?:e|es|ed|ing)|paralyz(?:e|ed|ing)|aging|gray)\\b`, 'gi');

const REGEX: Partial<Record<PatternId, RegExp>> = {
  EM_DASH: /—/g,
  DASH_ASIDE: /—|\s–\s|(?<!\d)\s-\s(?!\d)/g,
  FIRST_PERSON: /\b(?:I'm|I’m|I've|I’ve|I'd|I’d|I'll|I’ll|I|myself|mine|me|my)\b/g,
  BRITISH_SPELLING: BRITISH,
  AMERICAN_SPELLING: AMERICAN,
  SPACED_HYPHEN: /(?<!\d)\s-\s(?!\d)/g,
  SEMICOLON: /(?<!&[a-z]{1,8});/g,
  // "not X, it's Y", "isn't X. It's Y", "not X — it's Y". Not "not X, but Y": that is an ordinary concession.
  NOT_X_ITS_Y: /\b(?:not|isn'?t|aren'?t|wasn'?t|is not|are not) [^.;!?—]{1,60}?(?:[,;.]|—|\s-\s)\s?(?:it'?s|it is|that'?s|they'?re|they are)\b/gi,
  SIGNPOST: /\b(?:let me (?:be|explain|walk|start|offer|put|say|give)|I want to (?:spend|talk|be|start|make|offer)|in other words|to be clear|the (?:short|long|honest) answer|let'?s be (?:clear|honest)|here'?s the thing)\b/gi,
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
    case 'RHETORICAL_QUESTION': return sentences.filter((s) => /\?["'”’)]*$/.test(s.text) && !/^["“'‘]/.test(s.text)).map(asSpan);
    case 'SHORT_VERDICT': return sentences.filter((s) => s.words <= 6
      && /\b(?:is|are|was) (?:dead|over|broken|gone|the point|everything|nothing|real|wrong)\b|\b(?:breaks|matters|moved|wins|changes everything)[.!]$/i.test(s.text)).map(asSpan);
    // A one-sentence paragraph is prose: it ends as a sentence ends and has a few words. An image
    // caption, a link on its own line or a bold label is not one, and counting them read a Substack
    // author's rate as 10 per 1,000 words where their prose had about 2.5.
    case 'ONE_LINE_PARAGRAPH': return paragraphsOf(text).filter((x) => x.sentences === 1 && isProseLine(x.text))
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

/** A line that is a sentence of prose: ends with terminal punctuation, is not only a link, image or bold label, and has three words or more. */
export function isProseLine(line: string): boolean {
  const t = line.trim();
  if (/^!?\[[^\]]*\]\([^)]*\)$/.test(t) || /^\*\*[^*]+\*\*:?$/.test(t)) return false;
  return /[.!?…]["'”’)*_]*$/.test(t) && wordsOf(t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')).length >= 3;
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

// Profiles are pure in the text, and the contrast pass's leave-one-out asks for each piece's profile once
// per held-out piece: (A+D)² tokenisations without this, A+D with it. Bounded, first in first out.
const PROFILES = new Map<string, number[]>();
const PROFILE_CACHE = 256;

export const functionProfile = (text: string, words: readonly string[] = FUNCTION_WORDS): number[] => {
  if (words !== FUNCTION_WORDS) return profileOf(text, words);
  const had = PROFILES.get(text);
  if (had) return had;
  const p = profileOf(text, words);
  if (PROFILES.size >= PROFILE_CACHE) PROFILES.delete(PROFILES.keys().next().value!);
  PROFILES.set(text, p);
  return p;
};

const profileOf = (text: string, words: readonly string[]): number[] => {
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
  /** each author piece's z-profile */
  readonly authorDocs: readonly (readonly number[])[];
  /** each of the model's plain drafts' z-profile */
  readonly modelDocs: readonly (readonly number[])[];
}

export function deltaReference(authorTexts: readonly string[], modelTexts: readonly string[]): DeltaReference {
  const profiles = [...authorTexts, ...modelTexts].map((t) => functionProfile(t));
  const k = FUNCTION_WORDS.length;
  const mean = Array.from({ length: k }, (_, i) => profiles.reduce((s0, p) => s0 + p[i], 0) / profiles.length);
  const sd = Array.from({ length: k }, (_, i) => Math.sqrt(profiles.reduce((s0, p) => s0 + (p[i] - mean[i]) ** 2, 0) / Math.max(1, profiles.length - 1)) || 1e-6);
  const r = (x: number): number => Math.round(x * 1e4) / 1e4;
  const z = (p: number[]): number[] => p.map((v, i) => r((v - mean[i]) / sd[i]));
  return { words: FUNCTION_WORDS, mean: mean.map((x) => Math.round(x * 1e6) / 1e6), sd: sd.map((x) => Math.round(x * 1e6) / 1e6),
    authorDocs: profiles.slice(0, authorTexts.length).map(z), modelDocs: profiles.slice(authorTexts.length).map(z) };
}

/** Mean Delta from a text to each author piece and to each model draft. Lower is closer. */
export function styleDistanceDocs(text: string, ref: DeltaReference): { author: number; model: number } {
  const p = functionProfile(text, ref.words);
  const z = p.map((v, i) => (v - ref.mean[i]) / ref.sd[i]);
  const d = (doc: readonly number[]): number => z.reduce((s0, v, i) => s0 + Math.abs(v - doc[i]), 0) / z.length;
  const avg = (docs: readonly (readonly number[])[]): number => docs.reduce((s0, doc) => s0 + d(doc), 0) / Math.max(1, docs.length);
  return { author: Math.round(avg(ref.authorDocs) * 1000) / 1000, model: Math.round(avg(ref.modelDocs) * 1000) / 1000 };
}

export const perPieceP = (texts: readonly string[], f: (t: string) => number, q: number): number => quantile(texts.map(f), q);
