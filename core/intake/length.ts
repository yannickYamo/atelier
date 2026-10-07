// core/intake/length.ts — THE LENGTH A REQUEST STATES, IN NUMBERS.
//
// A request that says "about 2,000 words" has set the length. The run knew only the words "detailed" and "brief":
// a number went unseen, the author's usual length stayed in the prompt beside pieces of that length, and chapters
// asked at 2,000 words came back at about 1,550. The length belongs to the request, never to the author's rules, so
// it is read here, off the request alone, and kept with it: the words as written, the unit, and what kind of limit
// they state. Nothing is inferred: a request that names no number has no stated length.

export type LengthUnit = 'words' | 'pages' | 'paragraphs' | 'sentences';
export type LengthKind = 'target' | 'exact' | 'min' | 'max' | 'range';

export interface StatedLength {
  /** the request's own words, as written */
  readonly raw: string;
  readonly unit: LengthUnit;
  readonly kind: LengthKind;
  /** the number for target, exact, min or max; the two ends for a range */
  readonly min: number | null; readonly max: number | null; readonly target: number | null;
}

// A number is read as a length only where the request says so. "The 500 words I pasted", "chapter 12", "top 10
// words", "in 2024 words matter" and "24 pages of the report" each hold a number beside a unit and state no length:
// read as one, each took the author's usual length out of the prompt and told the writer to write to it. So a bare
// "N words" counts only with a word before it that introduces a length, or with nothing after it that makes it the
// subject of something else, and never straight after a word that points at text that already exists. This is a
// floor, and a deliberately narrow one: a length said some other way is not seen, which costs nothing that was not
// already so.
const NUMBER = String.raw`(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?k|\d+)`;
const UNIT = String.raw`(words?|pages?|paragraphs?|sentences?)`;
const toNumber = (s: string): number => (/k$/i.test(s.trim()) ? Math.round(parseFloat(s) * 1000) : Number(s.replace(/,/g, '')));
const unitOf = (s: string): LengthUnit => (`${s.toLowerCase().replace(/s$/, '')}s`) as LengthUnit;

/** Words that point at text already there, or number a part of it: the number after them is not a length to write to. */
const POINTS_AT = /\b(?:this|that|the|these|those|my|your|our|his|her|its|their|from|first|last|next|previous|top|chapter|section|page|part|step|item|line|every|each|all|any|few|many|some of|only)\s+$/i;
/** Words that introduce a length whatever follows. */
const APPROX = /(?:\b(?:about|around|roughly|approximately|approx\.?|circa|some)|~)\s*$/i;
/** Words that report a count of text that exists ("my draft has 300 words"). */
const REPORTS = /\b(?:has|have|had|having|contains?|wrote|written|pasted|was|were|are|got|with|already|currently)\s+(?:about\s+|around\s+|roughly\s+|just\s+|only\s+|over\s+)?$/i;
/** What may follow the unit when the number is a length: the end of its phrase, or what the piece is to be about. */
const ENDS_PHRASE = /^(?:\s*$|\s*[.,;:!?)\]"'’”]|\s+(?:long|in length|in total|total|each|per|or so|please|about|on|titled|called|explaining|describing|covering|that|which|and)\b)/i;

type Read = Omit<StatedLength, 'raw'>;
interface Form { readonly re: RegExp; readonly read: (m: RegExpExecArray) => Read; readonly bare: boolean }
const form = (source: string, read: Form['read'], bare = false): Form => ({ re: new RegExp(source, 'gi'), read, bare });
const FORMS: readonly Form[] = [
  // "at least 300 and at most 500 words"
  form(String.raw`\bat least\s+${NUMBER}\s+(?:and|but)\s+(?:at most|no more than)\s+${NUMBER}\s+${UNIT}\b`,
    (m) => ({ unit: unitOf(m[3]), kind: 'range', min: toNumber(m[1]), max: toNumber(m[2]), target: null })),
  form(String.raw`\b(?:at least|no (?:fewer|less) than|not (?:fewer|less) than|a minimum of|minimum(?: of)?|not under)\s+${NUMBER}\s+${UNIT}\b`,
    (m) => ({ unit: unitOf(m[2]), kind: 'min', min: toNumber(m[1]), max: null, target: null })),
  form(String.raw`\b(?:at most|no more than|not more than|a maximum of|maximum(?: of)?|max|under|within|up to|fewer than|less than|not over)\s+${NUMBER}\s+${UNIT}\b`,
    (m) => ({ unit: unitOf(m[2]), kind: 'max', min: null, max: toNumber(m[1]), target: null })),
  form(String.raw`\bexactly\s+${NUMBER}\s+${UNIT}\b`, (m) => ({ unit: unitOf(m[2]), kind: 'exact', min: null, max: null, target: toNumber(m[1]) })),
  // "500 words max", "500 words or fewer"; "1,500 words minimum", "1,500 words or more"
  form(String.raw`${NUMBER}\s+${UNIT}\s+(?:max(?:imum)?|at most|or (?:fewer|less|under)|tops)\b`, (m) => ({ unit: unitOf(m[2]), kind: 'max', min: null, max: toNumber(m[1]), target: null }), true),
  form(String.raw`${NUMBER}\s+${UNIT}\s+(?:min(?:imum)?|at least|or more)\b`, (m) => ({ unit: unitOf(m[2]), kind: 'min', min: toNumber(m[1]), max: null, target: null }), true),
  // "a 2,000-word chapter"
  form(String.raw`${NUMBER}-(word|page|paragraph|sentence)\b`, (m) => ({ unit: unitOf(m[2]), kind: 'target', min: null, max: null, target: toNumber(m[1]) })),
  // "1,500 to 2,000 words", "1500-2000 words", "between 1,500 and 2,000 words"
  form(String.raw`${NUMBER}\s*(?:-|–|to|and)\s*${NUMBER}\s+${UNIT}\b`, (m) => ({ unit: unitOf(m[3]), kind: 'range', min: toNumber(m[1]), max: toNumber(m[2]), target: null }), true),
  // "about 2,000 words", "in 500 words", "2k words"
  form(String.raw`${NUMBER}\s+${UNIT}\b`, (m) => ({ unit: unitOf(m[2]), kind: 'target', min: null, max: null, target: toNumber(m[1]) }), true),
];

/**
 * The length the request states in numbers, or null. Where it states more than one (a title that holds a number,
 * then the length), the last is the length, as the plan of a piece already reads it; of two readings of the same
 * words, the more specific.
 */
export function statedLength(request: string): StatedLength | null {
  let best: { at: number; rank: number; stated: StatedLength } | null = null;
  FORMS.forEach((f, rank) => {
    f.re.lastIndex = 0;
    for (let m = f.re.exec(request); m; m = f.re.exec(request)) {
      const before = request.slice(0, m.index).replace(/\bbetween\s+$/i, ''); const after = request.slice(m.index + m[0].length);
      if (POINTS_AT.test(before) || REPORTS.test(before)) continue;
      // A bare count needs a word before it that introduces a length, or nothing after it that makes it the subject of
      // something else.
      if (f.bare && !APPROX.test(before) && !ENDS_PHRASE.test(after)) continue;
      const read = f.read(m);
      const numbers = [read.min, read.max, read.target].filter((x): x is number => x !== null);
      if (!numbers.length || numbers.some((x) => !Number.isFinite(x) || x <= 0)) continue;
      if (read.kind === 'range' && (read.min ?? 0) > (read.max ?? 0)) continue;
      // Later in the request wins; where two forms end on the same word, the one listed first.
      const end = m.index + m[0].length;
      if (best === null || end > best.at || (end === best.at && rank < best.rank)) best = { at: end, rank, stated: { raw: m[0].trim(), ...read } };
    }
  });
  return (best as { stated: StatedLength } | null)?.stated ?? null;
}

/** How a count sits against a stated length: inside it, or short or long of it. A target is met within a tenth. */
export function againstStated(count: number, s: StatedLength): 'met' | 'short' | 'long' {
  const lo = s.kind === 'range' || s.kind === 'min' ? s.min : s.kind === 'max' ? null : s.kind === 'exact' ? s.target : (s.target ?? 0) * 0.9;
  const hi = s.kind === 'range' || s.kind === 'max' ? s.max : s.kind === 'min' ? null : s.kind === 'exact' ? s.target : (s.target ?? 0) * 1.1;
  return lo !== null && count < lo ? 'short' : hi !== null && count > hi ? 'long' : 'met';
}
