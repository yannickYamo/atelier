// atelier/core/observers/tell-lexicon.ts — THE PHRASES A SKILL'S OWN DRAFTS REPEAT AND ITS AUTHOR NEVER WRITES.
//
// Every round of blind reading found machine-written sentences, and every round the fix was one more
// string in a hand-written list: the model then reached for the next phrasing. That loop is closed here
// by deriving the list from data, per skill:
//
//   from        drafts the skill itself wrote (its own invocations, and probe drafts on varied topics),
//               because the tells that matter appear under the skill's instructions: plain drafts of the
//               same model on the same corpus held none of the 687 phrases a real skill's outputs repeated
//   a tell is   a run of 4 or 5 words that appears in drafts on at least three DIFFERENT topics (so it is
//               a habit, not a subject), that no piece of the author's corpus contains (so it is not
//               theirs), and whose absence from the corpus cannot be chance: at the rate the drafts use
//               it, the corpus would be expected to hold it three times or more (a Poisson test: zero
//               where three are expected happens about one time in twenty). It also carries at least one
//               word beyond the commonest function words.
//   measured    derived from one skill's drafts on four briefs and applied to a fifth, over 4-fold splits
//               of the author's corpus: 0.09 hits per 1,000 words in the author's withheld pieces, 0.5 to
//               1.1 in the model's. Three-word runs, or no Poisson test, flagged the author ten times as
//               often ("two or three", "at least two": ordinary phrases the corpus happened to lack).
//   topic words any word of four letters or more from the drafts' own tasks is excluded, so "code review"
//               in a batch of briefs about review is never called a tell
//
// The result is implementation, not standard: it is the sensor behind a rule the owner ratified
// ("write none of the moves that mark text as machine-written", ./contrast.ts), checked on every output
// and repaired like any other span. It grows as the skill is used (`atelier tend`), and the owner can add
// or strike an entry (`atelier tells`).

import { proseRegions } from './text.js';

/** One draft the skill wrote, and the task it was written for (the task decides its topic). */
export interface TellDraft { readonly task: string; readonly text: string }
/** The learned phrases, and how much evidence they rest on: how many drafts, on how many distinct topics. */
export interface TellLexicon { readonly terms: readonly string[]; readonly drafts: number; readonly topics: number; readonly at: string }

/** How many distinct topics a phrase must recur across before it is a habit. */
export const TELL_MIN_TOPICS = 3;
/** How many times the corpus should hold a phrase, at the drafts' rate, before its absence counts. */
const TELL_MIN_EXPECTED = 3;
const MIN_WORDS = 4; const MAX_WORDS = 5;
const MAX_TERMS = 60;

const COMMON = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'is', 'are', 'was',
  'were', 'be', 'been', 'it', "it's", 'this', 'that', "that's", 'these', 'those', 'you', 'your', 'we', 'our', 'i', 'my', 'me', 'they', 'their',
  'he', 'she', 'as', 'if', 'so', 'not', 'no', 'do', 'does', "don't", 'have', 'has', 'what', 'which', 'who', 'when', 'where', 'how', 'can',
  'will', 'would', 'there', 'here', 'about', 'into', 'than', 'then', 'just', 'one', 'all', 'more', 'most', 'some', 'any', 'up', 'out']);

const wordsOf = (t: string): string[] => proseRegions(t).flatMap((r) => r.text.toLowerCase().replace(/’/g, "'").match(/[a-z0-9']+/g) ?? []);

/** Derive the lexicon. `corpus` is every piece of the author's the skill was built from, reserved ones included. */
export function deriveTellLexicon(drafts: readonly TellDraft[], corpus: readonly string[], at = new Date().toISOString()): TellLexicon {
  const topicOf = (task: string): string => task.trim().toLowerCase();
  const topics = new Set(drafts.map((d) => topicOf(d.task)));
  const topicWords = new Set(drafts.flatMap((d) => d.task.toLowerCase().match(/[a-z']{4,}/g) ?? []));
  const corpusWords = corpus.map(wordsOf);
  const corpusSize = corpusWords.reduce((n, w) => n + w.length, 0);
  const corpusText = ` ${corpusWords.map((w) => w.join(' ')).join(' | ')} `;
  const draftWords = drafts.map((d) => wordsOf(d.text));
  const draftSize = draftWords.reduce((n, w) => n + w.length, 0) || 1;
  // Which topics each candidate phrase occurs under, and how often.
  const seen = new Map<string, Set<string>>(); const count = new Map<string, number>();
  for (const [j, d] of drafts.entries()) {
    const w = draftWords[j]; const topic = topicOf(d.task);
    for (let n = MIN_WORDS; n <= MAX_WORDS; n++) {
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        if (g.every((x) => COMMON.has(x)) || g.some((x) => topicWords.has(x)) || g.some((x) => /^\d/.test(x))) continue;
        const k = g.join(' ');
        (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(topic);
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
  }
  const candidates = [...seen.entries()]
    .filter(([k, ts]) => ts.size >= TELL_MIN_TOPICS && ((count.get(k) ?? 0) / draftSize) * corpusSize >= TELL_MIN_EXPECTED
      && !corpusText.includes(` ${k} `))
    .sort((a, b) => (count.get(b[0]) ?? 0) - (count.get(a[0]) ?? 0) || a[0].split(' ').length - b[0].split(' ').length);
  // The shortest form of each: a longer phrase containing a kept one adds nothing.
  const terms: string[] = [];
  for (const [k] of candidates) {
    if (terms.some((t) => ` ${k} `.includes(` ${t} `))) continue;
    terms.push(k);
    if (terms.length >= MAX_TERMS) break;
  }
  return { terms, drafts: drafts.length, topics: topics.size, at };
}
