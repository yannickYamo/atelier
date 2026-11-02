// tests/atelier-story.test.ts — THE LOOP GRAPH: QUOTES PLACED BY CODE, FEATURES BY HAND, BANDS, SPAN TARGETS.
import { describe, it, expect } from 'vitest';
import { indexText, locateQuote } from '../core/story/locate.js';
import { agreeLoops, loopReading, placeLoops, readLoops, type LoopGraph, type PlacedLink, type PlacedLoop, type Link } from '../core/story/loops.js';
import { andThenRuns, deadAirStretch, loopFeatures, median, unionWithin } from '../core/story/features.js';
import { betaPriorBand, storyBands, userBand, GENERIC_PRIORS } from '../core/story/bands.js';
import { storyTargets } from '../core/story/checks.js';
import { regularizedBeta } from '../core/stats/habit.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';
import type { BeatPrior } from '../core/library/schema.js';

const loop = (open: number, close: number | null): PlacedLoop => ({ question: 'q', kind: 'mystery', openQuote: 'x', closeQuote: close === null ? null : 'y', open, close, openWord: 0, closeWord: null });
const link = (at: number, l: Link): PlacedLink => ({ quoteStart: 'x', link: l, at, word: Math.round(at * 1000) });
const graph = (p: Partial<LoopGraph>): LoopGraph => ({ words: 1000, loops: [], stakes: [], links: [], dropped: 0, ...p });

// Six sentences in two paragraphs: 14, 13, 14, 15, 14 and 14 words.
const S = [
  'Nobody on the night shift knew why the third pump kept failing every week.',
  'If it failed again, the whole east district would lose water for days.',
  'But the logs showed the pump ran perfectly whenever an engineer was watching it.',
  'The cause turned out to be a timer that cut power at three every morning.',
  'Then the crew replaced the timer and wrote a new checklist for the shift.',
  'Nothing failed after that, and the east district never noticed a single outage again.',
];
const TEXT = `${S.slice(0, 3).join(' ')}\n\n${S.slice(3).join(' ')}`;

describe('locating a quote', () => {
  const ix = indexText('The cat sat. The dog ran far away.');
  it('is a position by words: first word over total words, case, spacing and curly quotes aside', () => {
    expect(ix.words.length).toBe(8);
    expect(locateQuote(ix, 'the dog')?.t).toBe(3 / 8);
    expect(locateQuote(ix, 'THE   Dog')?.word).toBe(3);
    expect(indexText('It’s late now.').words[0]).toBe("it's");
    expect(locateQuote(indexText('It’s late now.'), "it's late")?.word).toBe(0);
  });
  it('a quote not in the text, too short, or before `from` is not found', () => {
    expect(locateQuote(ix, 'the bird')).toBeNull();
    expect(locateQuote(ix, 'the')).toBeNull();
    expect(locateQuote(ix, 'dog ran', 5)).toBeNull();
  });
  it('gives the sentence a quote starts in', () => {
    const t = indexText(TEXT);
    expect(t.sentences.length).toBe(6);
    expect(locateQuote(t, 'a timer that cut power')?.sentence).toBe(3);
    expect(t.sentences[3].paragraph).toBe(1);
  });
});

describe('placing a reading', () => {
  const ix = indexText(TEXT);
  it('drops what it cannot place, including a close before its open, and orders links by position', () => {
    const g = placeLoops({
      loops: [
        { question: 'why does it fail', openQuote: 'knew why the third pump', closeQuote: 'The cause turned out', kind: 'mystery' },
        { question: 'invented', openQuote: 'a quote that is not there', closeQuote: null, kind: 'mystery' },
        { question: 'backwards', openQuote: 'The cause turned out', closeQuote: 'knew why the third pump', kind: 'mystery' },
        { question: 'open', openQuote: 'lose water for days', closeQuote: null, kind: 'stakes' },
      ],
      stakes: [{ what: 'water', forWhom: 'the east district', quote: 'the whole east district would lose water' }, { what: 'x', forWhom: 'y', quote: 'nowhere at all' }],
      beats: [{ quoteStart: 'Then the crew replaced', link: 'AND_THEN' }, { quoteStart: 'But the logs showed', link: 'BUT' }, { quoteStart: 'But the logs showed', link: 'BUT' }],
    }, ix)!;
    expect(g.loops.map((l) => l.question)).toEqual(['why does it fail', 'open']);
    expect(g.loops[0].open).toBe(5 / 84);                   // "knew" is word 5 (from 0) of 84
    expect(g.loops[0].close).toBe(41 / 84);                 // "The" starts sentence 4 after 14 + 13 + 14 words
    expect(g.stakes.length).toBe(1);
    expect(g.links.map((l) => l.link)).toEqual(['BUT', 'AND_THEN']);
    expect(g.dropped).toBe(3);
    expect(g.words).toBe(84);
  });
  it('an answer outside the shape is no answer', () => {
    expect(placeLoops({ loops: [] }, ix)).toBeNull();
    expect(placeLoops('nope', ix)).toBeNull();
  });
});

describe('features, against values worked by hand', () => {
  const g = graph({
    loops: [loop(0.1, 0.4), loop(0.3, 0.5), loop(0.7, 0.9), loop(0.8, null)],
    stakes: [{ what: 'a', forWhom: 'b', quote: 'c', at: 0.2, word: 200 }, { what: 'a', forWhom: 'b', quote: 'c', at: 0.05, word: 50 }],
    links: [link(0.1, 'BUT'), link(0.2, 'AND_THEN'), link(0.3, 'AND_THEN'), link(0.4, 'AND_THEN'), link(0.5, 'THEREFORE'), link(0.6, 'AND_THEN')],
  });
  const f = loopFeatures(g);
  it('stakes, count, density, closure and spans', () => {
    expect(f.stakesPosition).toBe(0.05);
    expect(f.loopCount).toBe(4);
    expect(f.loopDensity).toBe(4);
    expect(f.closureRate).toBe(0.75);
    expect(f.spanMedian).toBeCloseTo(0.2, 10);              // spans 0.3, 0.2, 0.2
    expect(f.spanMax).toBeCloseTo(0.3, 10);
  });
  it('tension coverage and dead air on [0, last close]', () => {
    // horizon 0.9; covered [0.1, 0.5] ∪ [0.7, 0.9] = 0.6; gaps 0.1 (start) and 0.2 (0.5 to 0.7)
    expect(f.tensionCoverage).toBeCloseTo(0.6 / 0.9, 10);
    expect(f.deadAir).toBeCloseTo(0.2, 10);
    expect(f.deadAirSpan?.from).toBeCloseTo(0.5, 10);
    expect(f.deadAirSpan?.to).toBeCloseTo(0.7, 10);
  });
  it('rehook mean and CV from the gaps between opens', () => {
    // opens 0.1, 0.3, 0.7, 0.8: gaps 0.2, 0.4, 0.1; mean 0.23333; sample sd sqrt(0.046667 / 2) = 0.152753
    expect(f.rehookMean).toBeCloseTo(0.7 / 3, 10);
    expect(f.rehookCV).toBeCloseTo(0.152753 / 0.233333, 4);
  });
  it('causal share and the longest AND_THEN run', () => {
    expect(f.causalShare).toBeCloseTo(2 / 6, 10);
    expect(f.longestAndThenRun).toBe(3);
    expect(andThenRuns(g.links, 3)).toEqual([[1, 3]]);
    expect(andThenRuns(g.links)).toEqual([[1, 3], [5, 5]]);
  });
  it('a piece with no loops is dead air throughout; an unclosed loop runs to the end', () => {
    const none = loopFeatures(graph({ words: 500 }));
    expect(none).toMatchObject({ loopCount: 0, loopDensity: 0, closureRate: null, tensionCoverage: 0, deadAir: 1, rehookMean: null, rehookCV: null, causalShare: null, longestAndThenRun: 0 });
    expect(none.deadAirSpan).toEqual({ from: 0, to: 1 });
    const open = loopFeatures(graph({ loops: [loop(0.2, null)] }));
    expect(open.tensionCoverage).toBeCloseTo(0.8, 10);
    expect(open.deadAir).toBeCloseTo(0.2, 10);
    expect(loopFeatures(graph({ words: 0 })).deadAir).toBeNull();
  });
  it('helpers: median, union, and a fully covered piece has no dead air', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(unionWithin([[0.5, 0.9], [0, 0.2], [0.1, 0.3]], 0.8)).toEqual([[0, 0.3], [0.5, 0.8]]);
    expect(deadAirStretch(graph({ loops: [loop(0, 0.6), loop(0.5, 1)] }))).toBeNull();
  });
});

describe('bands: the user\'s own from three pieces, else a weak prior marked assumed', () => {
  it('the span of three pieces, widened by its spread or a quarter of the largest value', () => {
    expect(userBand([0.1, 0.2, 0.3], true)).toMatchObject({ lo: 0, source: 'user', n: 3 });
    expect(userBand([0.1, 0.2, 0.3], true)?.hi).toBeCloseTo(0.5, 10);
    expect(userBand([1, 1, 1], true)).toMatchObject({ lo: 0.75, hi: 1 });
    expect(userBand([4, 4, null, 4], false)).toMatchObject({ lo: 3, hi: 5, n: 3 });
    expect(userBand([0.1, null, 0.3], true)).toBeNull();
  });
  it('a beat prior is a Beta band: Beta(1, 1) gives 5% to 95%', () => {
    const flat = betaPriorBand({ kind: 'blog', beat: 'stakes', position: 0.5, concentration: 2, job: '' });
    expect(flat.lo).toBeCloseTo(0.05, 6);
    expect(flat.hi).toBeCloseTo(0.95, 6);
    const early = betaPriorBand({ kind: 'blog', beat: 'stakes', position: 0.1, concentration: 4, job: '' });
    expect(regularizedBeta(early.lo, 0.4, 3.6)).toBeCloseTo(0.05, 6);
    expect(regularizedBeta(early.hi, 0.4, 3.6)).toBeCloseTo(0.95, 6);
    expect(early.source).toBe('assumed');
  });
  it('below three pieces, positions come from the beat prior of the kind and the rest from generic defaults', () => {
    const beats: BeatPrior[] = [{ kind: 'essay', beat: 'Stakes', position: 0.5, concentration: 2, job: '' }, { kind: 'blog', beat: 'Stakes', position: 0.1, concentration: 4, job: '' }];
    const two = [loopFeatures(graph({ loops: [loop(0.1, 0.5)] })), loopFeatures(graph({ loops: [loop(0.2, 0.6)] }))];
    const b = storyBands(two, 'blog', beats);
    expect(b.stakesPosition?.why).toMatch(/blog prior for the Stakes beat/);
    expect(b.deadAir).toEqual(GENERIC_PRIORS.deadAir);
    expect(b.loopDensity).toBeUndefined();
    const three = storyBands([...two, loopFeatures(graph({ loops: [loop(0.3, 0.7)] }))], 'blog', beats);
    expect(three.deadAir?.source).toBe('user');             // dead air 0.1, 0.2, 0.3
    expect(three.deadAir?.hi).toBeCloseTo(0.5, 10);
  });
});

describe('targets on a draft, never failures', () => {
  const ix = indexText(TEXT);
  const raw = (beats: { quoteStart: string; link: Link }[], close2: string | null) => ({
    loops: [
      { question: 'why does it fail', openQuote: 'knew why the third pump', closeQuote: 'If it failed again', kind: 'mystery' },
      { question: 'will the crew fix it', openQuote: 'Then the crew replaced', closeQuote: close2, kind: 'promise' },
    ], stakes: [], beats });
  it('an unclosed loop names its opening and asks for it to be closed; a cliffhanger request lets it stand', () => {
    const g = placeLoops(raw([], null), ix)!;
    const t = storyTargets(TEXT, g, {}).filter((x) => x.kind === 'unclosed-loop');
    expect(t.length).toBe(1);
    expect(TEXT.slice(t[0].span!.start, t[0].span!.end)).toBe('Then the crew replaced');
    expect(t[0].repair).toMatch(/Close the loop/);
    expect(storyTargets(TEXT, g, {}, { cliffhanger: true }).filter((x) => x.kind === 'unclosed-loop')).toEqual([]);
  });
  it('dead air beyond the band names the stretch; within it, nothing', () => {
    const g = placeLoops(raw([], 'Nothing failed after that'), ix)!;
    // covered: sentence 1 start to sentence 2 start, sentence 5 to 6; the stretch with nothing open runs from
    // "If it failed" to the start of "Then": 13 + 14 + 15 = 42 of 84 words
    const t = storyTargets(TEXT, g, { deadAir: { lo: 0, hi: 0.3, n: 3, source: 'user', why: '' } });
    expect(t.map((x) => x.kind)).toEqual(['dead-air']);
    const span = TEXT.slice(t[0].span!.start, t[0].span!.end);
    expect(span.startsWith('If it failed again')).toBe(true);
    expect(span.endsWith('every morning')).toBe(true);
    expect(t[0].measured).toBeCloseTo(42 / 84, 10);
    expect(storyTargets(TEXT, g, { deadAir: { lo: 0, hi: 0.6, n: 3, source: 'user', why: '' } })).toEqual([]);
  });
  it('three AND_THEN links in a row are one target with each beat quoted; two are not', () => {
    const three = [{ quoteStart: 'If it failed again', link: 'AND_THEN' as const }, { quoteStart: 'But the logs showed', link: 'AND_THEN' as const }, { quoteStart: 'The cause turned out', link: 'AND_THEN' as const }, { quoteStart: 'Then the crew replaced', link: 'THEREFORE' as const }];
    const t = storyTargets(TEXT, placeLoops(raw(three, 'Nothing failed after that'), ix)!, {}).filter((x) => x.kind === 'and-then-run');
    expect(t.length).toBe(1);
    expect(t[0].quotes).toEqual(['If it failed again', 'But the logs showed', 'The cause turned out']);
    expect(t[0].repair).toMatch(/BUT .* THEREFORE/);
    const two = three.map((b, i) => (i === 1 ? { ...b, link: 'BUT' as const } : b));
    expect(storyTargets(TEXT, placeLoops(raw(two, 'Nothing failed after that'), ix)!, {}).filter((x) => x.kind === 'and-then-run')).toEqual([]);
  });
});

describe('read twice, kept where both agree', () => {
  const scripted = (answers: unknown[]): InferenceClient => {
    let k = 0;
    return { complete: () => Promise.resolve({ json: answers[k++], termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never) };
  };
  const a = { loops: [{ question: 'why', openQuote: 'knew why the third pump', closeQuote: 'The cause turned out', kind: 'mystery' }],
    stakes: [{ what: 'water', forWhom: 'district', quote: 'would lose water for days' }],
    beats: [{ quoteStart: 'But the logs showed', link: 'BUT' }, { quoteStart: 'Then the crew replaced', link: 'AND_THEN' }] };
  const b = { loops: [...a.loops, { question: 'fixed?', openQuote: 'Then the crew replaced', closeQuote: 'Nothing failed after that', kind: 'promise' }],
    stakes: a.stakes, beats: [{ quoteStart: 'But the logs showed', link: 'BUT' }, { quoteStart: 'Then the crew replaced', link: 'THEREFORE' }] };
  it('keeps the agreed findings and reports κ per kind, worked by hand', async () => {
    const r = await readLoops(TEXT, scripted([a, b]), 'm', { spentUsd: 0, capUsd: 1, maxCalls: 4 });
    expect(r.by).toBe('model');
    expect(r.graph?.loops.map((l) => l.question)).toEqual(['why']);
    expect(r.graph?.stakes.length).toBe(1);
    expect(r.graph?.links.map((l) => l.link)).toEqual(['BUT']);
    // loops by sentence: A O,-,-,C,-,-  B O,-,-,C,O,C: po 4/6, pe 12/36, κ 0.5
    expect(r.kappa.loops).toBe(0.5);
    // links: A -,-,BUT,-,AND_THEN,-  B -,-,BUT,-,THEREFORE,-: po 5/6, pe 17/36, κ 13/19
    expect(r.kappa.links).toBe(Math.round((13 / 19) * 1000) / 1000);
    expect(r.kappa.stakes).toBe(1);
  });
  it('the second read sees the lists reversed', () => {
    const f = loopReading('forward').system; const s = loopReading('reversed').system;
    expect(f.indexOf('- stakes:')).toBeLessThan(f.indexOf('- setup:'));
    expect(s.indexOf('- setup:')).toBeLessThan(s.indexOf('- stakes:'));
    expect(s.indexOf('- THEREFORE:')).toBeLessThan(s.indexOf('- AND_THEN:'));
  });
  it('with no model, a failed read, or a piece too short, nothing is placed and it says why', async () => {
    const none = await readLoops(TEXT, null, null, { spentUsd: 0, capUsd: 1, maxCalls: 4 });
    expect(none).toMatchObject({ graph: null, by: 'floor' });
    const bad = await readLoops(TEXT, scripted([a, { nonsense: true }]), 'm', { spentUsd: 0, capUsd: 1, maxCalls: 4 });
    expect(bad.graph).toBeNull();
    expect(bad.why).toMatch(/second read/);
    const short = await readLoops('Too short to hold a loop.', scripted([]), 'm', { spentUsd: 0, capUsd: 1, maxCalls: 4 });
    expect(short).toMatchObject({ graph: null, by: 'code' });
  });
  it('agreement is by sentence, not by exact words', () => {
    const ix = indexText(TEXT);
    const g1 = placeLoops({ loops: [{ question: 'q', openQuote: 'Nobody on the night', closeQuote: null, kind: 'mystery' }], stakes: [], beats: [] }, ix)!;
    const g2 = placeLoops({ loops: [{ question: 'q', openQuote: 'kept failing every week', closeQuote: null, kind: 'stakes' }], stakes: [], beats: [] }, ix)!;
    expect(agreeLoops(ix, g1, g2).graph.loops.length).toBe(1);
  });
});
