// core/intake/length.ts — THE LENGTH A REQUEST STATES, IN NUMBERS.
//
// A request that says "about 2,000 words" has set the length. The run knew only the words "detailed" and "brief":
// a number went unseen, the author's usual length stayed in the prompt beside pieces of that length, and chapters
// asked at 2,000 words came back at about 1,550. The length belongs to the request, never to the author's rules, so
// it is read here, off the request alone, and kept with it: the words as written, the unit, and what kind of limit
// they state. Nothing is inferred: a request that names no number, in digits or in words, has no stated length.

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

/** What a count of words can stand before as the length of it: "a 20,000 word book". */
const PIECE = String.raw`(?:book|chapter|post|essay|article|report|piece|brief|memo|story|draft|summary|section|intro(?:duction)?|conclusion|email|letter|note|speech|script|answer|reply|review|bio|description|overview|doc(?:ument)?)`;
// "a 20,000 word book": the unit in the singular, then the kind of piece. It is a length only when that piece is what
// is asked for, which the words straight before it say ("write a", "draft me a", "I need a"). "I wrote a 500 word
// draft", "proofread the attached 3 page report" and "a proposal for a 90,000 word book" each name a piece that is
// not the one to write.
const PIECE_FORM = form(String.raw`${NUMBER}\s+(word|page|paragraph|sentence)(?=\s+${PIECE}\b)`, (m) => ({ unit: unitOf(m[2]), kind: 'target', min: null, max: null, target: toNumber(m[1]) }));
const ASKS_FOR = /\b(?:write|draft|give|send|produce|create|compose|prepare|need|want|make)\s+(?:me\s+|us\s+|up\s+)?an?\s+$/i;
const ALL_FORMS: readonly Form[] = [...FORMS.slice(0, 7), PIECE_FORM, ...FORMS.slice(7)];
/** Words before a count that say the text is to be changed by that much, not written to it. */
const EDITS = /\b(?:remove|delete|cut|drop|trim|add|insert|change|fix|rewrite|move|merge|split)\s+(?:the\s+|about\s+|up to\s+|at least\s+)?$/i;
/** Words that introduce a count spelled out as a length: without one, "two pages", "Three Sentences" and "one page" are prose. */
const INTRODUCES = /(?:\b(?:write|draft|in|of|to|at|is|be|it|about|around|roughly|approximately|some|under|over|within|exactly|least|most|between)|~|-|–)\s*(?:a\s+|an\s+)?$/i;

// WHAT IS INSIDE QUOTATION MARKS IS A TITLE OR A QUOTATION, never the length to write to: a post titled "10 words
// that changed our roadmap" was read as a post of ten words. Blanked, at the same length, so every place stays put.
// Single marks count where they open after a space and close before one, which an apostrophe inside a word never does.
const unquoted = (s: string): string => s.replace(/"[^"\n]*"|“[^”\n]*”|(?<=^|[\s(])'[^'\n]{3,}'(?=$|[\s.,;:!?)])|(?<=^|[\s(])‘[^’\n]{3,}’/g, (m) => ' '.repeat(m.length));

// A NUMBER SPELLED OUT IS A NUMBER: "two thousand", "fifteen hundred", "twenty-five hundred", "a thousand", "three",
// "one thousand, two hundred", and "2 thousand". Read by its grammar, so that two numbers side by side stay two:
// "between two and three paragraphs" is not five, and "five two-sentence blurbs" is not seven.
const ONES: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Readonly<Record<string, number>> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Readonly<Record<string, number>> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SMALL: Readonly<Record<string, number>> = { ...ONES, ...TEENS, ...TENS };
const alt = (o: Readonly<Record<string, number>>): string => Object.keys(o).join('|');
const SUB100 = String.raw`(?:(?:${alt(TENS)})(?:[\s-](?:${alt(ONES)}))?|${alt(TEENS)}|${alt(ONES)})`;
const SUB1000 = String.raw`(?:${SUB100}\s+hundred(?:\s+(?:and\s+)?${SUB100})?|${SUB100})`;
const SPELLED = new RegExp(String.raw`\b(?:(?:an?|${SUB1000}|\d+(?:\.\d+)?)\s+thousand(?:,?\s+(?:and\s+)?${SUB1000})?|(?:an?|\d+(?:\.\d+)?)\s+hundred(?:\s+(?:and\s+)?${SUB100})?|${SUB1000})\b`, 'gi');
function valueOf(spelled: string): number {
  let total = 0; let current = 0;
  for (const w of spelled.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []) {
    if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') { total += (current || 1) * 1000; current = 0; } else if (/^\d/.test(w)) current += Number(w); else current += SMALL[w] ?? 0;
  }
  return Math.round(total + current);
}
/**
 * The request with its spelled numbers in digits; for each place in it, the place in the request it came from; and
 * where each number that was spelled out now starts.
 */
function inDigits(request: string): { text: string; from: number[]; spelled: Set<number> } {
  let text = ''; const from: number[] = []; let at = 0; const spelled = new Set<number>();
  const copy = (to: number): void => { for (; at < to; at++) { text += request[at]; from.push(at); } };
  for (const m of request.matchAll(SPELLED)) {
    const value = valueOf(m[0]);
    // A name is not a number: "the film Three Sentences". A number that opens its sentence is still one.
    const opensSentence = /(?:^|[.!?:]\s+|\n\s*)$/.test(request.slice(0, m.index));
    if (value <= 0 || (/^\p{Lu}/u.test(m[0]) && !opensSentence)) continue;
    copy(m.index);
    spelled.add(text.length);
    for (const d of String(value)) { text += d; from.push(m.index); }
    at = m.index + m[0].length;
  }
  copy(request.length);
  from.push(request.length);
  return { text, from, spelled };
}

/**
 * Every length the request states, one for each unit, in the order they were said: "a 500-word introduction in 3
 * paragraphs" states two. Of two said in the same unit (a first thought, then the length), the later is the length;
 * of two readings of the same words, the more specific. `raw` is the request's own words.
 */
export function statedLengths(request: string): StatedLength[] {
  const { text, from, spelled } = inDigits(unquoted(request));
  const best = new Map<LengthUnit, { at: number; start: number; rank: number; stated: StatedLength }>();
  ALL_FORMS.forEach((f, rank) => {
    f.re.lastIndex = 0;
    for (let m = f.re.exec(text); m; m = f.re.exec(text)) {
      const before = text.slice(0, m.index).replace(/\bbetween\s+$/i, ''); const after = text.slice(m.index + m[0].length);
      if (POINTS_AT.test(before) || REPORTS.test(before) || EDITS.test(before)) continue;
      if (f === PIECE_FORM && !ASKS_FOR.test(before)) continue;
      // A bare count needs a word before it that introduces a length, or nothing after it that makes it the subject of
      // something else. One spelled out needs the word before it: "two pages" alone is how people write prose.
      if (f.bare && !APPROX.test(before) && !ENDS_PHRASE.test(after)) continue;
      const numberAt = m.index + m[0].search(/\d/);
      if (f.bare && spelled.has(numberAt) && !INTRODUCES.test(text.slice(0, m.index)) && text.slice(0, m.index).trim() !== '') continue;
      const read = f.read(m);
      const numbers = [read.min, read.max, read.target].filter((x): x is number => x !== null);
      if (!numbers.length || numbers.some((x) => !Number.isFinite(x) || x <= 0)) continue;
      if (read.kind === 'range' && (read.min ?? 0) > (read.max ?? 0)) continue;
      // Later in the request wins; where two forms end on the same word, the one listed first.
      const end = m.index + m[0].length; const was = best.get(read.unit);
      if (!was || end > was.at || (end === was.at && rank < was.rank)) best.set(read.unit, { at: end, start: m.index, rank, stated: { raw: request.slice(from[m.index], from[end]).trim(), ...read } });
    }
  });
  return [...best.values()].sort((a, b) => a.start - b.start).map((b) => b.stated);
}

/** The length a draft is held to, or null: of the lengths the request states, the last one said. */
export function statedLength(request: string): StatedLength | null {
  return statedLengths(request).reduce<{ at: number; stated: StatedLength } | null>((last, s) => { const at = request.lastIndexOf(s.raw); return !last || at >= last.at ? { at, stated: s } : last; }, null)?.stated ?? null;
}

/** How a count sits against a stated length: inside it, or short or long of it. A target is met within a tenth. */
export function againstStated(count: number, s: StatedLength): 'met' | 'short' | 'long' {
  const lo = s.kind === 'range' || s.kind === 'min' ? s.min : s.kind === 'max' ? null : s.kind === 'exact' ? s.target : (s.target ?? 0) * 0.9;
  const hi = s.kind === 'range' || s.kind === 'max' ? s.max : s.kind === 'min' ? null : s.kind === 'exact' ? s.target : (s.target ?? 0) * 1.1;
  return lo !== null && count < lo ? 'short' : hi !== null && count > hi ? 'long' : 'met';
}
