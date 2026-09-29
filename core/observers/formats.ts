// atelier/core/observers/formats.ts — WHAT A FORMAT FIXES, WHATEVER THE AUTHOR'S TASTE.
//
// A standard measures one class of document (./doc-class.ts): its thresholds were read off the owner's
// pieces of that class, which is how taste is conditioned on genre. One standard per format, built from
// pieces of that format. Some classes also carry facts no author's taste decides: a post on X holds 280
// characters; a LinkedIn post folds after its first couple of lines; a white paper or a financial report
// may state no figure its author did not supply, public or not.
//
// A FORMAT PROFILE is those facts, as data. When a skill's class (or a text's declared --class) names a
// known format, its profile adds:
//
//   a hard limit      checked on every draft as the product's floor (the FORMAT line, REQUIRED): a limit
//                     the platform enforces is not a preference, and an over-long post is not delivered
//   a length band     where pieces of this format usually sit (PREFERRED: it warns, it never fails)
//   strict specifics  the claim check (../loop/claim-extract.ts) cuts even "public" specifics unless the
//                     person supplied them: in these formats a figure without a source is the failure
//
// A profile never adds a rule to the owner's standard and never changes what the model is told. It is
// how a draft is checked, not what good means; what good means is still the owner's pieces of that class.

import { wordsOf } from './text.js';
import type { Span } from './registry.js';
import { normalizeClass } from './doc-class.js';

export interface FormatProfile {
  readonly id: string;
  readonly label: string;
  /** characters the platform accepts; over it the post is broken */
  readonly maxChars?: number;
  /** what the platform counts one URL as, whatever its length (X shortens every link to 23 characters) */
  readonly urlChars?: number;
  /** characters shown before a "see more" fold: the opening line should land within it */
  readonly foldChars?: number;
  /** where pieces of this format usually sit, in words */
  readonly words?: readonly [number, number];
  /** every specific must trace to the person's material or task: nothing passes as "public" */
  readonly strictSpecifics: boolean;
}

export const FORMATS: Readonly<Record<string, FormatProfile>> = {
  'x-post': { id: 'x-post', label: 'a post on X', maxChars: 280, urlChars: 23, words: [5, 60], strictSpecifics: false },
  'linkedin-post': { id: 'linkedin-post', label: 'a LinkedIn post', maxChars: 3000, foldChars: 210, words: [60, 600], strictSpecifics: false },
  'blog-post': { id: 'blog-post', label: 'a blog post', words: [500, 5000], strictSpecifics: false },
  'book-chapter': { id: 'book-chapter', label: 'a book chapter', words: [1500, 12000], strictSpecifics: false },
  'one-pager': { id: 'one-pager', label: 'a website one-pager', words: [200, 1000], strictSpecifics: true },
  'white-paper': { id: 'white-paper', label: 'a white paper', words: [2000, 12000], strictSpecifics: true },
  'financial-report': { id: 'financial-report', label: 'a financial report', strictSpecifics: true },
  'contract': { id: 'contract', label: 'a contract', strictSpecifics: true },
};

/** The profile a class names, if it is a known format. Unknown classes carry none: nothing is assumed. */
export const formatOf = (cls: string | null | undefined): FormatProfile | null => (cls ? FORMATS[normalizeClass(cls)] ?? null : null);

/** A text's length as the platform counts it: every URL as `urlChars` where the format says so. */
export const charsOf = (body: string, f: FormatProfile): number =>
  (f.urlChars === undefined ? body.length : body.replace(/https?:\/\/\S+/g, 'x'.repeat(f.urlChars)).length);

export interface FormatFindings { readonly hard: Span[]; readonly soft: Span[] }

/** Check a text against its format's fixed facts: hard limits, and the usual length. */
export function checkFormat(text: string, f: FormatProfile): FormatFindings {
  const hard: Span[] = []; const soft: Span[] = [];
  const body = text.trim();
  const chars = charsOf(body, f);
  if (f.maxChars !== undefined && chars > f.maxChars) {
    hard.push({ start: 0, end: text.length, text: body.slice(0, 80), why: `${chars} characters; ${f.label} holds at most ${f.maxChars}${f.urlChars !== undefined ? ` (a link counts as ${f.urlChars})` : ''}` });
  }
  if (f.foldChars !== undefined) {
    const first = body.split('\n')[0] ?? '';
    if (first.length > f.foldChars) {
      const at = text.indexOf(first);
      soft.push({ start: at, end: at + first.length, text: first, why: `the opening line runs ${first.length} characters; ${f.label} folds after about ${f.foldChars}, so the hook should land before it` });
    }
  }
  if (f.words) {
    const n = wordsOf(body).length;
    const [lo, hi] = f.words;
    if (n < lo || n > hi) soft.push({ start: 0, end: text.length, text: body.slice(0, 80), why: `${n} words; ${f.label} usually runs ${lo} to ${hi}` });
  }
  return { hard, soft };
}
