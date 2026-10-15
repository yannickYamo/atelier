// tests/fixtures/composite/five-voices.ts — FIVE INVENTED WRITERS, TWO PIECES EACH, AND NO FRONT MATTER.
//
// Nothing in a file says who wrote it: the voices are told apart by how they are written (core/composite/voices.ts).
// Each writer keeps one manner across two topics, so a grouping that follows topic words would get them wrong:
//   ask   opens on questions, two-sentence paragraphs, casual, contractions
//   fig   long paragraphs dense with figures and sources, third person
//   run   fragments, short lines, present tense, no commas to speak of
//   law   formal, no contractions, long sentences with "shall" and "it is not permitted"
//   tale  first-person stories, past tense, dialogue, long flowing sentences
// And one writer, six pieces on six topics, for a folder of one voice.

const paras = (n: number, f: (i: number) => string): string => Array.from({ length: n }, (_, i) => f(i)).join('\n\n');

const ASK = (topic: string, things: readonly string[]): string => paras(12, (i) => {
  const t = things[i % things.length];
  return `Why do we keep ${t} when nobody's asked for it? Because it's easier than saying no, and you'd rather not be the one who does.`
    + (i % 3 === 0 ? ` So what's the ${topic} really for?` : '');
});
const FIG = (topic: string, place: string): string => paras(4, (p) => Array.from({ length: 8 }, (_, i) =>
  `In ${2011 + i}, the ${place} recorded ${31 + i * 3 + p}.${(i + p) % 10} percent more ${topic} than in the previous year, according to survey ${p + 1}, table ${i + 4}, of the regional statistics office.`).join(' '));
const RUN = (verb: string, things: readonly string[]): string => paras(16, (i) =>
  `${verb}. ${things[i % things.length]} ${i + 1}. No pause. Then again. Harder now. Breath short. Go.`);
const LAW = (body: string, act: string): string => paras(10, (i) =>
  `The ${body} requires that each member shall submit item ${i + 1} under the ${act} in writing before the close of the session. It is not permitted to amend the record after the session has closed, and the chair will not accept submissions that do not comply with the procedure set out in schedule ${i + 2}.`);
const TALE = (room: string, who: string): string => paras(8, (i) =>
  `I remember the ${room} the morning ${who} came home, the light coming in sideways through the curtains while she stood at the door with her coat still on and said, "We'll talk later," and I waited, as I always did, for later to arrive, which it did ${i + 2} days after, quietly, over tea that had gone cold.`);

/** Ten pieces by five voices; ids are file names. */
export const FIVE_VOICES: Readonly<Record<string, string>> = {
  'a-meetings.md': ASK('meeting', ['the weekly sync', 'the status call', 'the standing agenda', 'the review slot']),
  'b-harbour.md': FIG('arrivals', 'harbour authority'),
  'c-sprint.md': RUN('The sprint starts', ['Lap', 'Turn', 'Mile']),
  'd-committee.md': LAW('committee', 'standing orders'),
  'e-kitchen.md': TALE('kitchen', 'my grandmother'),
  'f-inbox.md': ASK('inbox', ['the newsletter', 'the reply-all thread', 'the auto-digest', 'the cc list']),
  'g-rail.md': FIG('passenger journeys', 'national rail regulator'),
  'h-climb.md': RUN('The climb begins', ['Step', 'Pitch', 'Ledge']),
  'i-council.md': LAW('council', 'municipal charter'),
  'j-garden.md': TALE('garden', 'my aunt'),
};

/** The pieces of each voice, as the grouping should find them. */
export const FIVE_GROUPS: readonly (readonly string[])[] = [
  ['a-meetings.md', 'f-inbox.md'], ['b-harbour.md', 'g-rail.md'], ['c-sprint.md', 'h-climb.md'], ['d-committee.md', 'i-council.md'], ['e-kitchen.md', 'j-garden.md'],
];

/** One writer on six topics: plain, warm, first person plural, medium sentences, the odd figure. */
const ONE = (topic: string, detail: string, n: number): string => [
  `We started looking at ${topic} last spring, mostly because ${detail} kept coming up in conversations with the team.`,
  `The first thing we noticed was how little anyone had written down. People knew how it worked, roughly, but the knowledge lived in a few heads and moved when they did.`,
  `So we wrote it down. Not a manual, just a page: what happens, who does it, and what to check when it goes wrong. It took ${n} afternoons and one argument about naming.`,
  `The page changed less than we hoped and more than we expected. Fewer questions reached the same two people, and the questions that did were better ones.`,
  `If we did it again, we would start smaller. One process, one page, and a date to look at it again. The rest can wait until someone needs it.`,
  `That is most of what we learned about ${topic}. It is not much, but it was worth the ${n} afternoons, and we would spend them again.`,
].join('\n\n');

export const ONE_VOICE: Readonly<Record<string, string>> = {
  'deploys.md': ONE('deploys', 'the Friday freeze', 3),
  'hiring.md': ONE('hiring', 'the interview loop', 4),
  'oncall.md': ONE('on-call', 'the pager rota', 2),
  'budgets.md': ONE('budgets', 'the cloud bill', 5),
  'docs.md': ONE('documentation', 'the wiki', 3),
  'reviews.md': ONE('code review', 'the review queue', 6),
};
