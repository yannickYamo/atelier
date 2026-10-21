// atelier/core/measurement/spec.ts — A MEASUREMENT WRITTEN AS ONE LINE, PARSED STRICTLY.
//
//   LEXICON:leverage|utilize|synergy
//   SENTENCE_LENGTH:medianMax=15,p90Max=28
//   PRESENCE:sections=verdict|risks,opens=1
//
// Written by a person (`atelier add --measure`, `atelier amend --measure`) or by the step reading
// (core/method/step-check.ts), which names the check a step asks for in this same line. Strict either way:
// `medianMax=` read as 0, `0x10` as 16 and `15=20` as 15 would each be a target nobody meant, enforced on every
// output from then on. A problem is returned, never thrown: the caller says it in its own voice.

import type { Measurement, ObserverId } from '../state/canonical-state.js';
import { validateMeasurement, OBSERVER_IDS } from '../observers/registry.js';

/** The parameter names each observer takes, as a person or a reading may write them. */
export const MEASURE_KEYS: Readonly<Record<string, readonly string[]>> = {
  LEXICON: ['terms'],
  SENTENCE_LENGTH: ['medianMax', 'p90Max'], PARAGRAPH_LENGTH: ['maxSentences'], HEDGE_RATE: ['maxPer1000'],
  PATTERN_RATE: ['pattern', 'minPer1000', 'maxPer1000', 'prefer'], FRAGMENT_SHARE: ['maxWords', 'maxShare'],
  TERM_RATE: ['terms', 'minPer1000', 'maxPer1000'], RATIO: ['numerator', 'denominator', 'minShare', 'maxShare'],
  DISTRIBUTION: ['edges', 'shares', 'tolerance'],
  OPENING: ['avoid', 'minWords', 'maxWords'], CLOSING: ['avoid', 'minWords', 'maxWords'],
  HEADINGS: ['avoid', 'case', 'maxWords', 'minPer1000', 'maxPer1000'], RHYTHM: ['unit', 'minCv', 'maxCv'],
  FEATURE: ['feature', 'minValue', 'maxValue'], PRESENCE: ['sections', 'in', 'any', 'min', 'figure', 'starts', 'body', 'opens', 'closes', 'labels', 'options'],
  TABLE: ['columns', 'minRows'], CITED: ['allow'], LINES: ['min', 'perItem', 'sections'], LENGTH: ['unit', 'min', 'max', 'in', 'labels', 'need', 'sections'], NAMES_TEST: [],
  SHAPE: ['shape', 'kinds', 'min', 'max', 'urlChars'],
  GRAMMAR: ['dialect', 'vocabulary'],
};

// A pattern id and a heading case are ids, upper-cased; `prefer` keeps its spaces; a unit and a place (`in=first`, `in=<section name>`) are kept as written.
const UPPER_KEYS = new Set(['pattern', 'case']);
const AS_WRITTEN_KEYS = new Set(['prefer', 'unit', 'in']);
// A shape and its kinds are case-sensitive ids (core/observers/shape.ts): `characters`, `claim`.
const ID_LIST_KEYS = new Set(['shape', 'kinds']);
// Word lists, "|"-separated: TERM_RATE:terms=but|so,minPer1000=4. Kept as written: the observers compare names and
// terms without regard to case, and the build screen says them as the owner or their example wrote them.
const LIST_KEYS = new Set(['vocabulary', 'terms', 'numerator', 'denominator', 'avoid', 'sections', 'any', 'starts', 'columns', 'options']);
// Number lists, "/"-separated: DISTRIBUTION:edges=8/20/35,shares=0.3/0.4/0.2/0.1,tolerance=0.2.
const NUMBER_LIST_KEYS = new Set(['edges', 'shares']);

export type ParsedMeasure = { readonly measurement: Measurement; readonly problem?: undefined } | { readonly measurement?: undefined; readonly problem: string };

export function parseMeasureSpec(spec: string): ParsedMeasure {
  const i = spec.indexOf(':');
  const observer = (i === -1 ? spec : spec.slice(0, i)).trim().toUpperCase() as ObserverId;
  const rest = i === -1 ? '' : spec.slice(i + 1);
  if (observer === 'STYLE_DISTANCE') return { problem: 'STYLE_DISTANCE is computed from your corpus by discovery, not declared by hand.' };
  // A written check is read from a step and carried as its own code (core/observers/written.ts); it is not a line.
  if (observer === 'CHECK') return { problem: 'CHECK is a check written for one step, not a line to declare.' };
  if (!OBSERVER_IDS.includes(observer)) return { problem: `unknown observer "${observer}". Available: ${OBSERVER_IDS.filter((o) => o !== 'STYLE_DISTANCE' && o !== 'CHECK').join(', ')}` };
  const params: Record<string, number | string[] | number[]> = {};
  if (observer === 'LEXICON') params.terms = rest.split('|').map((t) => t.trim()).filter(Boolean);
  else {
    // A pair ends where the next `name=` begins: a comma inside a value ("In short,|So,") is the value's own.
    for (const kv of rest.split(/,(?=\s*[A-Za-z][A-Za-z0-9]*=)/).filter((x) => x.trim())) {
      const eq = kv.indexOf('=');
      const k = kv.slice(0, eq).trim(); const v = kv.slice(eq + 1);
      if (eq === -1 || !k) return { problem: `"${kv}" is not name=value` };
      if (MEASURE_KEYS[observer] && !MEASURE_KEYS[observer].includes(k)) return { problem: `${observer} takes ${MEASURE_KEYS[observer].join(', ')}; not "${k}"` };
      if (UPPER_KEYS.has(k)) { params[k] = [v.trim().toUpperCase()]; continue; }
      if (AS_WRITTEN_KEYS.has(k)) { params[k] = [k === 'prefer' ? v : v.trim()]; continue; }
      // A feature id is case-sensitive (core/observers/features.ts), and its band may sit below zero.
      if (k === 'feature') { params[k] = [v.trim()]; continue; }
      // A dialect and a vocabulary are words the grammar engine reads lower-case: GRAMMAR:dialect=british,vocabulary=zorbletron.
      if (k === 'dialect') { params[k] = [v.trim().toLowerCase()]; continue; }
      if (k === 'vocabulary') { params[k] = v.split('|').map((t) => t.trim().toLowerCase()).filter(Boolean); continue; }
      if (ID_LIST_KEYS.has(k)) { params[k] = v.split('|').map((t) => t.trim()).filter(Boolean); continue; }
      if (observer === 'FEATURE') {
        if (!/^-?\d+(\.\d+)?$/.test(v.trim())) return { problem: `"${kv}" is not name=number` };
        params[k] = Number(v); continue;
      }
      if (LIST_KEYS.has(k)) { params[k] = v.split('|').map((t) => t.trim()).filter(Boolean); continue; }
      if (NUMBER_LIST_KEYS.has(k)) {
        const xs = v.split('/').map((t) => t.trim());
        if (!xs.every((t) => /^\d+(\.\d+)?$/.test(t))) return { problem: `"${kv}" is not name=number/number/...` };
        params[k] = xs.map(Number); continue;
      }
      if (!/^\d+(\.\d+)?$/.test(v.trim())) return { problem: `"${kv}" is not name=number` };
      const n = Number(v);
      // Zero is a real target for a rate cap and for a share bound; for a length it describes no text.
      // (And a shape's "none": SHAPE:shape=hashtags,max=0 is a count of zero hashtags.)
      // (And CITED:allow=0: no figure of the writer's own, which is the ordinary rule.)
      const zeroOk = n === 0 && (['HEDGE_RATE', 'PATTERN_RATE', 'TERM_RATE', 'LINES', 'SHAPE', 'CITED'].includes(observer) || ['minShare', 'maxShare', 'minPer1000', 'maxPer1000', 'minWords', 'allow'].includes(k));
      if (n <= 0 && !zeroOk) return { problem: `${k} must be greater than zero` };
      params[k] = n;
    }
  }
  const m: Measurement = { observer, params };
  const problem = validateMeasurement(m);
  return problem ? { problem } : { measurement: m };
}

/** The menu of measurements a reading may name: each observer, what it counts, and the line that declares it. */
export const MEASURE_MENU = [
  'LEXICON:word|phrase|...                           none of these words or phrases anywhere (a banned list)',
  'TERM_RATE:terms=a|b,maxPer1000=N  (or minPer1000)   how often any of a word list occurs per 1,000 words',
  'PATTERN_RATE:pattern=ID,maxPer1000=N              a named construction per 1,000 words; IDs: EM_DASH, SPACED_HYPHEN, SEMICOLON, NOT_X_ITS_Y, THAT_OPENER, HERES_OPENER, SIGNPOST, INTENSIFIER, SHORT_VERDICT, BOLD_SPAN, ONE_LINE_PARAGRAPH, RHETORICAL_QUESTION, REPEATED_OPENER',
  'SENTENCE_LENGTH:medianMax=N,p90Max=N              sentence length',
  'PARAGRAPH_LENGTH:maxSentences=N                   sentences per paragraph',
  'HEDGE_RATE:maxPer1000=N                           hedging words per 1,000',
  'FRAGMENT_SHARE:maxWords=N,maxShare=0.x            the share of very short sentences',
  'OPENING:avoid=phrase|phrase,maxWords=N            the first prose paragraph: phrases it must not use, its length',
  'CLOSING:avoid=phrase|phrase,maxWords=N            the last prose paragraph: the same',
  'PRESENCE:sections=name|name,body=1[,opens=1][,closes=1]   these sections, in this order, each with something under it; opens/closes where the step says where',
  'PRESENCE:any=phrase|phrase                        at least one of these phrases somewhere',
  'PRESENCE:starts=phrase|phrase,in=first            how a part starts (in=first, in=last, in=<section name>)',
  'HEADINGS:case=SENTENCE|TITLE,maxWords=N,avoid=... section headings: case, length, phrases to avoid',
  'TABLE:columns=name|name,minRows=N                 a table whose header holds these columns',
  'LENGTH:unit=WORDS|SENTENCES|PARAGRAPHS,min=N,max=N[,in=<section name>]   the length of the whole, or of one section',
  'LINES:min=N[,perItem=1][,sections=name]            every path:line cited is a line of the material; perItem: every finding cites one',
  'CITED:allow=0                                     every figure is in the request or the material',
  'NAMES_TEST                                        the work names a test (a test file, or a test function in backticks)',
  'SHAPE:shape=characters|words|sentences|hashtags|links|emoji,max=N,min=N   the shape of one short piece',
].join('\n');
