// atelier/core/story/checks.ts — WHERE A DRAFT LETS ITS READER GO, AS SPANS TO REPAIR.
//
// Three graded targets on a draft's loop graph, each naming the span and what to do there:
//   - every loop the draft opens is closed (unless the request asks for a cliffhanger);
//   - no stretch with nothing in question longer than the user's band for dead air;
//   - no run of three or more beats linked only by succession (AND_THEN).
// Nothing here fails a run: a miss is a target for span repair, and a draft that could not be read has no targets.

import type { Band, StoryBands } from './bands.js';
import { andThenRuns, deadAirStretch, loopFeatures } from './features.js';
import { charSpan, excerptAt, indexText, locateQuote, wordAt } from './locate.js';
import type { LoopGraph } from './loops.js';

export type StoryTargetKind = 'unclosed-loop' | 'dead-air' | 'and-then-run';

export interface StoryTarget {
  readonly kind: StoryTargetKind;
  /** words copied from the draft that mark the span */
  readonly quotes: readonly string[];
  /** character extent in the draft */
  readonly span: { readonly start: number; readonly end: number } | null;
  /** what to do there, said to the repair */
  readonly repair: string;
  /** the measured value and the band it was held to, where one applies */
  readonly measured?: number;
  readonly band?: Band;
}

export interface StoryCheckOptions {
  /** the request asks for a cliffhanger or a series part: an open loop at the end is the point, not a miss */
  readonly cliffhanger?: boolean;
  /** shortest run of AND_THEN links that is a target */
  readonly andThenRun?: number;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function storyTargets(text: string, graph: LoopGraph, bands: StoryBands, opts: StoryCheckOptions = {}): StoryTarget[] {
  const index = indexText(text);
  if (!index.words.length) return [];
  const out: StoryTarget[] = [];

  if (!opts.cliffhanger) {
    for (const l of graph.loops.filter((x) => x.close === null)) {
      out.push({ kind: 'unclosed-loop', quotes: [l.openQuote], span: charSpan(index, l.openWord, locateQuote(index, l.openQuote, l.openWord)?.endWord ?? l.openWord + 1),
        repair: `This raises a question (${l.question || 'what happens'}) that nothing answers. Close the loop before the piece ends: answer it where the piece lands, or cut the opening.` });
    }
  }

  const deadBand = bands.deadAir;
  const dead = deadAirStretch(graph);
  if (deadBand && dead && dead.to - dead.from > deadBand.hi) {
    const a = wordAt(index, dead.from); const b = Math.max(a + 1, wordAt(index, dead.to));
    out.push({ kind: 'dead-air', quotes: [excerptAt(index, a), excerptAt(index, Math.max(a, b - 10))], span: charSpan(index, a, b),
      measured: loopFeatures(graph).deadAir ?? undefined, band: deadBand,
      repair: `For ${pct(dead.to - dead.from)} of the piece nothing is in question (your band allows ${pct(deadBand.hi)}). Open a loop here that a later passage answers, or plant the question earlier so its payoff spans this stretch.` });
  }

  const min = opts.andThenRun ?? 3;
  const links = [...graph.links].sort((x, y) => x.word - y.word);
  for (const [first, last] of andThenRuns(links, min)) {
    const next = links[last + 1] as (typeof links)[number] | undefined;
    const end = next ? next.word : index.words.length;
    out.push({ kind: 'and-then-run', quotes: links.slice(first, last + 1).map((l) => l.quoteStart), span: charSpan(index, links[first].word, end), measured: last - first + 1,
      repair: `${last - first + 1} beats in a row only follow one another. Turn at least one AND_THEN into a BUT (something goes against what came before) or a THEREFORE (it happens because of what came before).` });
  }
  return out;
}
