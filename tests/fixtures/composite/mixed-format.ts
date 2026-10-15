// tests/fixtures/composite/mixed-format.ts — ONE WRITER IN SEVERAL FORMATS, AND TWO WRITERS IN ONE FORMAT.
//
// Format and length are not authorship. A writer's folder holds essays and lists, long pieces and short posts, posts
// and threads, and it is still one voice; two writers who both write essays of the same length are still two. Every
// writer here is invented. Each keeps a bank of their own sentences (their function words, their turns of phrase),
// and a piece is drawn from that bank at whatever length and in whatever format it takes, on topics the writers share,
// so neither topic nor format can tell the voices apart and only the writing can.

/** Picks `n` sentences from a bank, starting at `from` and stepping by `step`, with the topic filled in. */
const draw = (bank: readonly ((t: string) => string)[], topic: string, n: number, from: number, step = 1): string[] =>
  Array.from({ length: n }, (_, i) => bank[(from + i * step) % bank.length](topic));
const paragraphs = (sentences: readonly string[], per: number): string =>
  Array.from({ length: Math.ceil(sentences.length / per) }, (_, i) => sentences.slice(i * per, i * per + per).join(' ')).join('\n\n');

// ── THE ESSAYS-AND-LISTS FOLDER THE EFFICIENCY JOURNEYS BUILD FROM (tests/atelier-efficiency.test.ts) ─────────────
/** A piece of `paragraphs` distinct paragraphs, each about 45 words. */
const piece = (id: number, paras: number): string => Array.from({ length: paras }, (_, k) =>
  `Piece ${id} paragraph ${k} opens here. I think this matters, and I don't say that lightly, because the argument of piece ${id} turns on point ${k}. `
  + `We decided first and explained after, which is how the work of piece ${id} went at step ${k}, and nobody regretted it.`).join('\n\n');
const list = (id: number): string => `# List ${id}\n\n${Array.from({ length: 30 }, (_, k) => `- **Item ${k} of list ${id}.** A short point about step ${k}.`).join('\n')}`;
/** Seven essays and two list posts by one writer, unlabelled: exactly the folder those journeys write. */
export const ESSAYS_AND_LISTS: Readonly<Record<string, string>> = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [`post-${i}.md`, i % 4 === 3 ? list(i) : piece(i, 30)]));

// ── ONE WRITER: LONG ESSAYS AND SHORT POSTS ──────────────────────────────────────────────────────────────────────
// Noor: first person, contractions, "honestly", "here's the thing", asides in parentheses, "which is to say".
const NOOR: readonly ((t: string) => string)[] = [
  (t) => `Here's the thing about ${t}: I'd been doing it wrong for years, and honestly I didn't notice.`,
  (t) => `I used to think ${t} was a matter of willpower (it isn't, or not mostly).`,
  () => `What changed my mind was small, which is to say it was a Tuesday and I was tired.`,
  (t) => `I'd sat down to sort out ${t} and found I couldn't remember why I'd started.`,
  () => `That's the part nobody tells you, I think: the reasons fade before the habit does.`,
  () => `So I wrote the reasons down, on paper, in a notebook I still keep by the kettle.`,
  (t) => `Honestly, it's a little embarrassing how much that helped with ${t}.`,
  () => `I'm not saying it'll work for you; I'm saying it worked for me, and I was surprised.`,
  () => `Here's what I mean, in practice: I read the page before I start, and I stop when it stops making sense.`,
  (t) => `Most weeks that's enough. Some weeks it isn't, and then I let ${t} wait (it always waits).`,
  () => `I've come to like that about it, honestly; it doesn't punish you for a bad week.`,
  () => `Which is to say, the system isn't clever. It's just written down, and I look at it.`,
];
const noorEssay = (topic: string, from: number): string => paragraphs(draw(NOOR, topic, 36, from, 5), 4);
const noorPost = (topic: string, from: number): string => draw(NOOR, topic, 3, from, 7).join(' ');
export const ESSAYS_AND_POSTS: Readonly<Record<string, string>> = {
  'essay-budgets.md': noorEssay('the budget', 0),
  'essay-running.md': noorEssay('running', 3),
  'essay-letters.md': noorEssay('letters', 7),
  'post-01.md': noorPost('the inbox', 1),
  'post-02.md': noorPost('the garden', 4),
  'post-03.md': noorPost('the commute', 6),
  'post-04.md': noorPost('the reading list', 9),
  'post-05.md': noorPost('the laundry', 2),
};

// ── ONE WRITER: TWEETS AND ONE LONG PIECE ────────────────────────────────────────────────────────────────────────
// Ivo: dry, declarative, "the trick is", "turns out", numbers as digits, no questions, "anyway" as a closer.
const IVO: readonly ((t: string) => string)[] = [
  (t) => `Turns out ${t} is mostly a scheduling problem.`,
  () => `The trick is to decide once and stop deciding.`,
  (t) => `Spent 3 hours on ${t} today and 2 of them were waiting.`,
  () => `Nobody reads the second paragraph. Put it first.`,
  (t) => `The trick with ${t} is the same as the trick with everything: fewer steps.`,
  () => `Turns out the slow part was never the work. It was the handover.`,
  () => `Wrote it down. Deleted half. Better.`,
  (t) => `${t[0].toUpperCase()}${t.slice(1)} is a queue with feelings. Anyway.`,
  () => `If it needs a meeting, it needs a document first.`,
  () => `4 people, 1 decision, 0 owners. That's the bug.`,
];
const ivoLong = (topic: string): string => paragraphs(draw(IVO, topic, 60, 0, 3), 5);
export const TWEETS_AND_ONE_LONG: Readonly<Record<string, string>> = {
  'tweet-01.md': draw(IVO, 'hiring', 2, 0).join(' '),
  'tweet-02.md': draw(IVO, 'the release', 2, 2).join(' '),
  'tweet-03.md': draw(IVO, 'on-call', 1, 4).join(' '),
  'tweet-04.md': draw(IVO, 'the roadmap', 2, 5).join(' '),
  'tweet-05.md': draw(IVO, 'code review', 1, 7).join(' '),
  'tweet-06.md': draw(IVO, 'planning', 2, 8).join(' '),
  'tweet-07.md': draw(IVO, 'the backlog', 2, 1, 4).join(' '),
  'tweet-08.md': draw(IVO, 'support', 2, 3, 5).join(' '),
  'long-handovers.md': ivoLong('the handover'),
};

// ── ONE WRITER: POSTS, THREADS AND LISTS ─────────────────────────────────────────────────────────────────────────
// Dee: warm and plain, "we", "a bit", "the honest answer is", "and that's fine", lists and threads in the same words.
const DEE: readonly ((t: string) => string)[] = [
  (t) => `We get asked about ${t} a lot, and the honest answer is that we're still figuring it out.`,
  () => `It's a bit messy, and that's fine.`,
  (t) => `What we do know is that ${t} goes better when someone owns it.`,
  () => `We tried rotating it once, and it went about as well as you'd guess.`,
  () => `The honest answer is usually the boring one: write it down, share it, check it next month.`,
  (t) => `If you're starting on ${t} now, start small, and that's fine too.`,
  () => `We'd rather have one page people read than ten nobody opens.`,
  () => `A bit of structure goes a long way, and the rest can be loose.`,
];
const deePost = (topic: string, from: number): string => paragraphs(draw(DEE, topic, 12, from, 3), 3);
const deeThread = (topic: string, from: number): string => draw(DEE, topic, 6, from, 3).map((s, i) => `${i + 1}/ ${s}`).join('\n\n');
const deeList = (topic: string, from: number): string => `# On ${topic}\n\n${draw(DEE, topic, 8, from, 3).map((s) => `- ${s}`).join('\n')}`;
export const POSTS_THREADS_LISTS: Readonly<Record<string, string>> = {
  'post-onboarding.md': deePost('onboarding', 0),
  'post-releases.md': deePost('releases', 2),
  'post-docs.md': deePost('docs', 5),
  'thread-hiring.md': deeThread('hiring', 1),
  'thread-oncall.md': deeThread('on-call', 4),
  'thread-planning.md': deeThread('planning', 6),
  'list-meetings.md': deeList('meetings', 3),
  'list-budgets.md': deeList('budgets', 7),
};

// ── TWO WRITERS, ONE FORMAT ──────────────────────────────────────────────────────────────────────────────────────
// Pell: plain and quick, "we", "so", "just", contractions. Quist: formal, "one", "thus", "whereas", no contractions.
// Both write essays of the same length on the same four topics, and both write short posts on the same four.
const PELL: readonly ((t: string) => string)[] = [
  (t) => `So we looked at ${t} again last week, and it's just not working.`,
  () => `We'd set it up in a hurry, so that's on us.`,
  (t) => `The fix for ${t} isn't hard; we just hadn't made time for it.`,
  () => `So here's what we're doing: one owner, one list, and we check it on Fridays.`,
  () => `It won't be perfect, but it'll be better than what we've got.`,
  () => `We'll see in a month. If it's still bad, we'll just try something else.`,
];
const QUIST: readonly ((t: string) => string)[] = [
  (t) => `One is obliged to consider ${t} not as a convenience but as an obligation of the institution.`,
  () => `It is a principle, whereas the arrangement that preceded it was merely a custom.`,
  (t) => `Thus the question of ${t} cannot be settled by preference alone; it must be settled by reason.`,
  () => `One does not abandon a principle because it is inconvenient, nor does one adopt a custom because it is familiar.`,
  () => `It follows, therefore, that the burden of proof rests upon those who would change it.`,
  () => `Whereas haste produces error, deliberation, however slow, produces a record upon which others may rely.`,
];
const essay = (bank: readonly ((t: string) => string)[], topic: string, from: number): string => paragraphs(draw(bank, topic, 30, from, 5), 3);
const short = (bank: readonly ((t: string) => string)[], topic: string, from: number): string => draw(bank, topic, 2, from, 1).join(' ');
const TOPICS = ['the archive', 'the rota', 'the budget', 'the library'] as const;
/** Four essays each, the same length, on the same four topics. */
export const TWO_ESSAYISTS: Readonly<Record<string, string>> = Object.fromEntries([
  ...TOPICS.map((t, i) => [`pell-${i + 1}.md`, essay(PELL, t, i)]),
  ...TOPICS.map((t, i) => [`quist-${i + 1}.md`, essay(QUIST, t, i)]),
]);
export const TWO_ESSAYISTS_GROUPS: readonly (readonly string[])[] = [TOPICS.map((_, i) => `pell-${i + 1}.md`), TOPICS.map((_, i) => `quist-${i + 1}.md`)];
/** Four short posts each, the same length, on the same four topics. */
export const TWO_POSTERS: Readonly<Record<string, string>> = Object.fromEntries([
  ...TOPICS.map((t, i) => [`pell-post-${i + 1}.md`, short(PELL, t, i * 2)]),
  ...TOPICS.map((t, i) => [`quist-post-${i + 1}.md`, short(QUIST, t, i * 2)]),
]);
export const TWO_POSTERS_GROUPS: readonly (readonly string[])[] = [TOPICS.map((_, i) => `pell-post-${i + 1}.md`), TOPICS.map((_, i) => `quist-post-${i + 1}.md`)];
