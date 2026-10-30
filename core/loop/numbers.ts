// atelier/core/loop/numbers.ts — A FIGURE IS ITS VALUE, HOWEVER IT IS SPELLED.
//
// Shared by the claim reader's decision (./claim-extract.ts) and the pattern check (./claims.ts), so the two
// read "ten hours" and "10 hours" as the same figure and agree on which words are a number at all.

// ── Numbers, however they are spelled ──────────────────────────────────────────────────────────
//
// "ten hours" and "10 hours" state the same figure, so a spelled-out number is read as its value. A number
// is a PHRASE: units, teens, tens, "twenty-five", "two hundred and fifty", "a dozen", and a multiplier on
// words or on digits ("3 million" ≡ "three million" ≡ 3000000). A figure is its value, never a piece of
// it: "3 million" in the notes does not support "3 users", and "fourteen" is not "four". Reading one word
// at a time let both mistakes through.
const UNITS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Readonly<Record<string, number>> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Readonly<Record<string, number>> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Readonly<Record<string, number>> = { thousand: 1e3, million: 1e6, billion: 1e9 };
/** Every word that is part of a number spelled out ("twenty", "hundred", "dozen"), for readers that must know one when they see it. */
export const NUMBER_WORDS: readonly string[] = [...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), 'hundred', ...Object.keys(SCALES), 'dozen'];
/**
 * "ONE" IS USUALLY NOT A FIGURE. "One of the reasons", "no one", "the one that", "one day": read as 1,
 * each would demand a 1 in the material, and a true story would be cut for a pronoun. So a lone "one"
 * counts only where it quantifies: followed by a word that is not a function word or one of these idioms,
 * and not preceded by a determiner. Inside a number phrase ("one million", "twenty-one") it always counts.
 */
const ONE_BEFORE_NOT_A_FIGURE = new Set(['of', 'and', 'or', 'but', 'the', 'a', 'an', 'to', 'that', 'who', 'which', 'is', 'was', 'can', 'could',
  'would', 'should', 'might', 'must', 'will', 'may', 'another', 'other', 'day', 'time', 'thing', 'way', 'point', 'side', 'hand', 'more', 'by',
  'in', 'on', 'at', 'for', 'from', 'with', 'as', 'i', 'we', 'you', 'they', 'it', 'he', 'she', 'has', 'had', 'does', 'did', 'if', 'so',
  // the plural forms, for the counts above one ("these two are the same"; see spelledCounts)
  'are', 'were']);
const ONE_AFTER_NOT_A_FIGURE = new Set(['the', 'this', 'that', 'these', 'those', 'no', 'any', 'each', 'every', 'some', 'which', 'last', 'next', 'only', 'same', 'right', 'wrong']);

export interface NumberPhrase { readonly index: number; readonly length: number; readonly value: string }
/** Every number in `s` written as words, or as digits with a scale word after them, with where it sits. */
export function numberPhrases(s: string): NumberPhrase[] {
  const tokens = [...s.matchAll(/\d[\d,]*(?:\.\d+)?|[A-Za-z]+/g)].map((m) => ({ at: m.index, raw: m[0], w: m[0].toLowerCase() }));
  const out: NumberPhrase[] = [];
  const kind = (w: string): 'UNIT' | 'TEEN' | 'TENS' | 'HUNDRED' | 'SCALE' | 'DOZEN' | null =>
    w in UNITS ? 'UNIT' : w in TEENS ? 'TEEN' : w in TENS ? 'TENS' : w === 'hundred' ? 'HUNDRED' : w in SCALES ? 'SCALE' : w === 'dozen' ? 'DOZEN' : null;
  // Two tokens belong to one phrase only across a space or a hyphen: "five, six" is two numbers.
  const joined = (a: { at: number; raw: string }, b: { at: number }): boolean => /^[\s-]+$/.test(s.slice(a.at + a.raw.length, b.at));
  let i = 0;
  while (i < tokens.length) {
    const t0 = tokens[i];
    const digits = /^\d/.test(t0.raw);
    const leadA = t0.w === 'a' && tokens[i + 1] && joined(t0, tokens[i + 1]) && ['HUNDRED', 'SCALE', 'DOZEN'].includes(kind(tokens[i + 1].w) ?? '');
    if (!digits && !leadA && !kind(t0.w)) { i += 1; continue; }
    // A digit counts here only when a scale word follows it ("3 million"); plain digits are read elsewhere.
    if (digits && !(tokens[i + 1] && joined(t0, tokens[i + 1]) && ['HUNDRED', 'SCALE', 'DOZEN'].includes(kind(tokens[i + 1].w) ?? ''))) { i += 1; continue; }
    let total = 0; let current = digits ? Number(t0.raw.replace(/,/g, '')) : 0;
    let last: string = digits ? 'DIGITS' : leadA ? 'A' : '';
    let j = digits || leadA ? i + 1 : i; let end = j - 1;
    for (; j < tokens.length; j++) {
      const t = tokens[j];
      if (j > i && !joined(tokens[j - 1], t)) break;
      // "two hundred and fifty": "and" joins two parts of one number after a hundred or a scale, nothing else.
      if (t.w === 'and' && (last === 'HUNDRED' || last === 'SCALE') && tokens[j + 1] && joined(t, tokens[j + 1]) && kind(tokens[j + 1].w)) { last = 'SCALED'; continue; }
      const k = kind(t.w);
      if (!k) break;
      // After a unit or a teen only a multiplier may follow: "five six" is two numbers, not eleven.
      if ((last === 'UNIT' || last === 'TEEN') && (k === 'UNIT' || k === 'TEEN' || k === 'TENS')) break;
      if (last === 'TENS' && (k === 'TEEN' || k === 'TENS')) break;
      if (k === 'UNIT') current += UNITS[t.w];
      else if (k === 'TEEN') current += TEENS[t.w];
      else if (k === 'TENS') current += TENS[t.w];
      else if (k === 'HUNDRED') current = (current || 1) * 100;
      else if (k === 'DOZEN') current = (current || 1) * 12;
      else { total += (current || 1) * SCALES[t.w]; current = 0; }
      last = k === 'SCALE' ? 'SCALE' : k; end = j;
      if (k === 'DOZEN') break;
    }
    if (end < i || (leadA && end === i)) { i += 1; continue; }
    const first = tokens[i]; const lastTok = tokens[end];
    // The lone "one": a figure only where it quantifies (see ONE_BEFORE_NOT_A_FIGURE).
    if (end === i && first.w === 'one') {
      const next = tokens[i + 1]; const prev = tokens[i - 1];
      const quantifies = next !== undefined && joined(first, next) && !ONE_BEFORE_NOT_A_FIGURE.has(next.w) && !/^\d/.test(next.raw)
        && !(prev && joined(prev, first) && ONE_AFTER_NOT_A_FIGURE.has(prev.w));
      if (!quantifies) { i += 1; continue; }
    }
    const value = total + current;
    out.push({ index: first.at, length: lastTok.at + lastTok.raw.length - first.at, value: String(Math.round(value * 1000) / 1000) });
    i = end + 1;
  }
  return out;
}

/** Every figure `s` states, as its value: digits ("1,000" is "1000"), and every number phrase. */
export const numbersIn = (s: string): string[] => {
  const phrases = numberPhrases(s);
  // Digits that head a phrase ("3" of "3 million") are the phrase's, not a figure of their own.
  const heads = new Set(phrases.map((p) => p.index));
  const digits = [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].filter((m) => !heads.has(m.index))
    .map((m) => m[0].replace(/[.,]$/, '').replace(/,/g, ''));
  return [...digits, ...phrases.map((p) => p.value)];
};

/**
 * A COUNT WRITTEN IN WORDS. "Three of your prospects", "twelve-plus optimizers", "nine people", "forty
 * percent": a number that quantifies what follows it is a figure, as the reader's own definition says, and
 * the pattern check read only digits, so an invented count of people passed it whole. A phrase counts when
 * it is written in words (digits are read by the statistic patterns), is not the lone "one" (a count of one
 * is how prose says "a", and a true sentence would be cut for it), is not inside a quotation, is not preceded
 * by a determiner that points at a set already named ("the three teams", "these two"), and is followed, across
 * a space or a hyphen and an optional "-plus"/"+", by the thing it counts: a word that is not a function word,
 * or "of" and that word ("three of your prospects", "two of them").
 *
 * WHAT PROSE COUNTS WITHOUT ASSERTING A FIGURE is left alone, because the pattern check cannot tell it from
 * one and a review found it in true sentences: a span of time or an age ("two weeks", "ten minutes later",
 * "three years old"), the writer's own family ("I have two kids"), the structure of the piece itself ("three
 * reasons", "two things", "a hundred small decisions") and the "a hundred"/"a thousand" of hyperbole, which
 * counts only when the thing it counts is one a figure measures (people, customers, dollars, percent...). An
 * "N-plus" form is always a count. "A few weeks" has no number and is never a figure. Returns each count's
 * value, in order.
 */
const OF_DETERMINERS = /^(?:the|your|our|their|my|its|his|her|these|those|all)$/;
const TIME_OR_AGE = /^(?:seconds?|minutes?|hours?|days?|nights?|weeks?|weekends?|months?|quarters?|years?|decades?|centur(?:y|ies)|lifetimes?)$/;
const FAMILY = /^(?:kids?|child|children|sons?|daughters?|brothers?|sisters?|siblings?|parents?|grandchild|grandchildren|grandparents?|cousins?|dogs?|cats?|pets?)$/;
const STRUCTURE = /^(?:reasons?|things?|ways?|steps?|parts?|points?|questions?|kinds?|types?|options?|lessons?|rules?|principles?|ideas?|examples?|cases?|words?|sentences?|paragraphs?|sections?|chapters?|categor(?:y|ies)|approach(?:es)?|strateg(?:y|ies)|takeaways?|mistakes?|problems?|factors?|elements?|levels?|stages?|phases?|pieces?|items?|notes?|caveats?|habits?|signs?|decisions?|choices?|tips?|tricks?|patterns?|modes?|dimensions?|camps?|buckets?|answers?|objections?|assumptions?|conditions?|criteri(?:on|a)|paths?|scenarios?)$/;
const MEASURED = /^(?:people|persons?|customers?|prospects?|users?|clients?|buyers?|readers?|subscribers?|employees?|engineers?|developers?|teams?|compan(?:y|ies)|firms?|vendors?|startups?|products?|tools?|calls?|tokens?|dollars?|euros?|pounds?|cents?|percent|requests?|tickets?|deals?|accounts?|seats?|licen[cs]es?|servers?|machines?|orders?|units?|rows?|records?)$/;
const POSSESSIVE = /^(?:my|our|your|his|her|their)$/i;
const FIRST_PERSON = /\b(?:I|[Ww]e|[Mm]y|[Oo]ur|me|us|I've|[Ww]e've|I'm)\b/;
export function spelledCounts(s: string): string[] {
  const out: string[] = [];
  // Quoted in double quotes, or in single quotes that open after a space and close before a non-letter
  // (an apostrophe inside a word, "it's", opens nothing).
  const quoted = [...s.matchAll(/["“][^"”]*["”]|(?<![A-Za-z0-9])['‘][^'’\n]*?['’](?![A-Za-z])/g)].map((m) => [m.index, m.index + m[0].length] as const);
  const phrases = numberPhrases(s);
  phrases.forEach((p, k) => {
    const phrase = s.slice(p.index, p.index + p.length).toLowerCase();
    if (/^\d/.test(phrase) || phrase === 'one' || quoted.some(([a, b]) => p.index > a && p.index < b)) return;
    const before = /([A-Za-z]+)[\s-]+$/.exec(s.slice(0, p.index));
    if (before && ONE_AFTER_NOT_A_FIGURE.has(before[1].toLowerCase())) return;
    const after = s.slice(p.index + p.length);
    // "Fifty-fifty": a number doubled across a hyphen is an idiom of odds, not a count.
    const twin = /^-([A-Za-z]+)\b/.exec(after)?.[1]?.toLowerCase() ?? (/([A-Za-z]+)-$/.exec(s.slice(0, p.index))?.[1]?.toLowerCase());
    if (twin === phrase) return;
    // "Three in ten developers", "seven out of ten readers": a ratio states both of its numbers.
    const ratio = /^\s+(?:in|out\s+of)\s+$/i;
    const nextP = phrases[k + 1];
    if (nextP && ratio.test(s.slice(p.index + p.length, nextP.index))) { out.push(p.value); return; }
    const rest = after.replace(/^(?:[\s-]*plus\b|\s*\+)/i, '');
    const plus = rest.length < after.length;
    if (/^\s*%/.test(rest)) { out.push(p.value); return; }
    const m = /^[\s-]+(?:of\s+(?:([A-Za-z]+)\s+)?)?([A-Za-z]+)(?:[\s-]+([A-Za-z]+))?/.exec(rest);
    if (!m) return;
    // "two of the": the determiner is consumed only when a word follows it; "two of the" at the end counts nothing.
    const ofDet = m[1] !== undefined && OF_DETERMINERS.test(m[1].toLowerCase());
    const words = (m[1] !== undefined && !ofDet ? [m[1], m[2]] : [m[2], m[3]]).filter((w): w is string => w !== undefined).map((w) => w.toLowerCase());
    if (ONE_BEFORE_NOT_A_FIGURE.has(words[0])) return;
    // "Seven figures", "six figures": the size of a sum, said as an idiom.
    if (/^figures?$/.test(words[0])) return;
    if (!plus) {
      if (words.some((w) => TIME_OR_AGE.test(w) || STRUCTURE.test(w))) return;
      // Family is family whoever's it is: "I have two kids", "their two kids".
      if (words.some((w) => FAMILY.test(w)) && (FIRST_PERSON.test(s) || (before && POSSESSIVE.test(before[1])))) return;
      if (phrase.startsWith('a ') && Number(p.value) >= 100 && !words.some((w) => MEASURED.test(w))) return;
    }
    out.push(p.value);
  });
  return out;
}
