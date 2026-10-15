// tests/fixtures/composite/natural-writers.ts — INVENTED WRITERS WITH NATURAL VARIATION, FOR THE VOICE GROUPING.
//
// Real folders do not repeat a template: a writer's pieces vary in topic, length and which of their habits show up. Each
// writer here has a bank of sentence frames in their own habits (function words, connectives, asides, register) and a
// piece is a seeded draw from that bank across topics, so no two pieces share a paragraph and the variation inside one
// writer is real. Two writers differ in habits a reader would notice, not in a caricature.

const rand = (seed: number): (() => number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const TOPICS = ['the onboarding flow', 'our pricing page', 'the weekly planning meeting', 'the support queue', 'the new search feature', 'the release checklist', 'hiring for the data team', 'the quarterly roadmap', 'customer interviews', 'the analytics dashboard', 'the mobile app', 'our documentation'];

/** A writer's piece: `paras` paragraphs of 4 to 6 sentences drawn from their frames, on one topic, from a seed. */
function piece(frames: readonly ((t: string) => string)[], topic: string, seed: number, paras: number): string {
  // A writer's habits are steady from piece to piece: every frame comes round in each piece, in a shuffled order, so
  // what changes between pieces is the topic, the length and the order, as in a real folder.
  const r = rand(seed);
  let deck: number[] = [];
  const next = (): number => {
    if (!deck.length) { deck = frames.map((_, i) => i); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
    return deck.pop() ?? 0;
  };
  return Array.from({ length: paras }, () => Array.from({ length: 4 + Math.floor(r() * 3) }, () => frames[next()](topic)).join(' ')).join('\n\n');
}

// Mara: plain and direct, first person singular, "so", "really", "actually", contractions, short asides with dashes.
const MARA: readonly ((t: string) => string)[] = [
  (t) => `I spent most of last week on ${t}, and honestly it went better than I expected.`,
  (t) => `So here's what I actually did with ${t}: I wrote down the three things that kept breaking.`,
  () => `It's not complicated, really. You just have to look at it every day.`,
  (t) => `I'd been putting off ${t} for months, so I finally blocked a morning for it.`,
  () => `What surprised me was how little of it was hard - most of it was just tedious.`,
  () => `I don't think there's a trick here. You show up and you fix the next thing.`,
  (t) => `So I asked two people who use ${t} every day what annoys them most.`,
  () => `They both said the same thing, which I didn't expect, and it's an easy fix.`,
  () => `I'll be honest: I was wrong about this for a long time.`,
  (t) => `If you're stuck on ${t}, start with the part you'd be embarrassed to show someone.`,
  () => `That's usually where the real problem is, and it's usually smaller than it feels.`,
  () => `Anyway, it's done now, and I'm not going to pretend it was clever.`,
  (t) => `I really think ${t} gets better the moment someone actually owns it.`,
  () => `So that's my advice, for what it's worth - pick one thing and finish it.`,
];
// Theo: measured and analytical, first person plural, "however", "therefore", "in practice", no contractions, colons.
const THEO: readonly ((t: string) => string)[] = [
  (t) => `We examined ${t} over the course of the quarter, and the findings were mixed.`,
  (t) => `In practice, ${t} depends on three conditions: ownership, measurement and review.`,
  () => `However, the evidence for the second condition is weaker than we had assumed.`,
  (t) => `We therefore propose a modest change to how ${t} is reviewed each month.`,
  () => `It is worth noting that the earlier approach was not wrong; it was incomplete.`,
  () => `The data suggest a consistent pattern, although the sample remains small.`,
  (t) => `For ${t}, the relevant question is not whether it works but under which conditions.`,
  () => `We do not recommend a wholesale redesign; the cost would exceed the benefit.`,
  () => `Instead, we recommend a narrower intervention, evaluated against a clear baseline.`,
  (t) => `In our experience, teams that measure ${t} early make fewer costly reversals.`,
  () => `This is, however, an observation rather than a result, and it should be tested.`,
  () => `The implication is straightforward: decisions should follow the evidence, not precede it.`,
  (t) => `We will revisit ${t} once the next cycle of data is available.`,
  () => `Until then, the current arrangement remains the most defensible option.`,
];

/** Six pieces by one writer, each on a different topic, of varying length. */
const series = (prefix: string, frames: readonly ((t: string) => string)[], seed: number, n: number, offset = 0): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}-${String(i + 1).padStart(2, '0')}.md`, piece(frames, TOPICS[(i + offset) % TOPICS.length], seed + i * 7919, 4 + (i % 3))]));

/** One writer across twelve topics and three lengths. */
export const ONE_WRITER_MANY_TOPICS: Readonly<Record<string, string>> = series('mara', MARA, 11, 12);
/** Two writers on the same topics, six pieces each, of the same range of lengths. */
export const TWO_NATURAL_WRITERS: Readonly<Record<string, string>> = { ...series('mara', MARA, 101, 6), ...series('theo', THEO, 202, 6) };
export const TWO_NATURAL_GROUPS: readonly (readonly string[])[] = [Array.from({ length: 6 }, (_, i) => `mara-0${i + 1}.md`), Array.from({ length: 6 }, (_, i) => `theo-0${i + 1}.md`)];
/** A minority: nine pieces by one writer and three by another. */
export const MINORITY_WRITER: Readonly<Record<string, string>> = { ...series('mara', MARA, 303, 9), ...series('theo', THEO, 404, 3, 4) };

// One writer, two subjects, each with its own vocabulary: half the pieces about search ranking, half about payroll.
const SEARCH = ['The ranking weights for the search index were retuned after the relevance review.', 'Query latency on the search cluster dropped once the index shards were rebalanced.', 'Stemming and synonym expansion changed which documents the search index returned first.', 'We logged every zero-result query and fed the misses back into the index.'];
const PAYROLL = ['Payroll runs on the twenty-fifth, and the reconciliation against the ledger follows the next morning.', 'Withholding tables changed in January, so every payslip template had to be checked by hand.', 'The payroll export now matches the accounting codes the auditors asked for.', 'Contractors are paid through a separate payroll batch with its own approval step.'];
const subject = (lines: readonly string[], seed: number): string => {
  const r = rand(seed); const own = piece(MARA, lines === SEARCH ? 'search' : 'payroll', seed, 4).split('\n\n');
  return own.map((p) => `${p} ${lines[Math.floor(r() * lines.length)]} ${lines[Math.floor(r() * lines.length)]}`).join('\n\n');
};
/** Eight pieces by one writer: four on search ranking and four on payroll, each subject with its own vocabulary. */
export const ONE_WRITER_TWO_SUBJECTS: Readonly<Record<string, string>> = Object.fromEntries([
  ...Array.from({ length: 4 }, (_, i) => [`search-${i + 1}.md`, subject(SEARCH, 500 + i)]),
  ...Array.from({ length: 4 }, (_, i) => [`payroll-${i + 1}.md`, subject(PAYROLL, 600 + i)]),
]);
