// tests/atelier-story-novelty.test.ts — THE NOVELTY MAP: SENTENCES THAT PAY, STRETCHES THAT DO NOT, CLAIMS WITHOUT PROOF.
import { describe, it, expect } from 'vitest';
import { agreeNovelty, noveltyBand, noveltyFeatures, noveltyFeaturesOf, noveltyReading, placeNovelty, readNovelty, thinStretches, thinTargets, GENERIC_STRETCH } from '../core/story/novelty.js';
import { indexText } from '../core/story/locate.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';

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

describe('features, worked by hand', () => {
  it('stretches are runs of sentences with nothing new, in words', () => {
    expect(thinStretches([10, 5, 8, 12, 4], [false, true, false, false, true])).toEqual([{ from: 0, to: 0, words: 10 }, { from: 2, to: 3, words: 20 }]);
    const f = noveltyFeatures([10, 5, 8, 12, 4], [false, true, false, false, true]);
    expect(f).toMatchObject({ words: 39, novelCount: 2, longestStretchWords: 20 });
    expect(f.densityPer100).toBeCloseTo((2 / 39) * 100, 10);
    expect(noveltyFeatures([7, 3], [false, false]).longestStretchWords).toBe(10);
    expect(noveltyFeatures([7, 3], [true, true]).longestStretchWords).toBe(0);
    expect(noveltyFeatures([], []).densityPer100).toBeNull();
  });
  it('the band is the user\'s from three pieces, else the generic default marked assumed', () => {
    const golden = [noveltyFeatures([40, 10], [false, true]), noveltyFeatures([60, 10], [false, true])];
    expect(noveltyBand(golden).longestStretchWords).toEqual(GENERIC_STRETCH);
    const b = noveltyBand([...golden, noveltyFeatures([80, 10], [false, true])]);
    expect(b.longestStretchWords).toMatchObject({ lo: 0, hi: 120, source: 'user' });   // span 40-80, widened by 40
  });
});

describe('placing and agreeing', () => {
  const ix = indexText(TEXT);
  const a = { novel: [{ quote: 'knew why the third pump', kind: 'new' }, { quote: 'a timer that cut power', kind: 'surprise' }, { quote: 'not in the piece', kind: 'new' }],
    claims: [{ claimQuote: 'the east district never noticed', proofQuote: null }, { claimQuote: 'the pump ran perfectly', proofQuote: 'the logs showed' }, { claimQuote: 'lose water for days', proofQuote: 'made up proof' }] };
  const b = { novel: [{ quote: 'Nobody on the night shift', kind: 'surprise' }, { quote: 'The cause turned out', kind: 'new' }, { quote: 'Nothing failed after that', kind: 'new' }],
    claims: [{ claimQuote: 'never noticed a single outage', proofQuote: null }] };
  it('places quotes in sentences and drops what it cannot place, a named proof that is not there included', () => {
    const m = placeNovelty(a, ix)!;
    expect(m.novel).toEqual(['new', null, null, 'surprise', null, null]);
    expect(m.claims.map((c) => [c.sentence, c.proofSentence])).toEqual([[5, null], [2, 2]]);
    expect(m.dropped).toBe(2);
    expect(placeNovelty({ novel: [] }, ix)).toBeNull();
  });
  it('a sentence is novel where both reads mark it; κ worked by hand', () => {
    const { map, kappa } = agreeNovelty(placeNovelty(a, ix)!, placeNovelty(b, ix)!);
    expect(map.novel).toEqual(['new', null, null, 'surprise', null, null]);
    expect(map.claims.map((c) => c.sentence)).toEqual([5]);
    // A N,-,-,N,-,-  B N,-,-,N,-,N: po 5/6, pe 1/2, κ 2/3
    expect(kappa).toBe(0.667);
    expect(noveltyFeaturesOf(TEXT, map)).toMatchObject({ words: 84, novelCount: 2, longestStretchWords: 28 });
  });
  it('reads twice through the house reading; no model means unverified', async () => {
    let k = 0; const answers = [a, b];
    const client: InferenceClient = { complete: () => Promise.resolve({ json: answers[k++], termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never) };
    const r = await readNovelty(TEXT, client, 'm', { spentUsd: 0, capUsd: 1, maxCalls: 4 });
    expect(r).toMatchObject({ by: 'model', kappa: 0.667 });
    expect(await readNovelty(TEXT, null, null, { spentUsd: 0, capUsd: 1, maxCalls: 4 })).toMatchObject({ map: null, by: 'floor' });
    expect(noveltyReading('reversed').system.indexOf('CLAIMS')).toBeLessThan(noveltyReading('reversed').system.indexOf('NOVEL.'));
  });
});

describe('the thin check', () => {
  const ix = indexText(TEXT);
  it('flags stretches longer than the band with their sentences, and paragraphs that claim without proof', () => {
    const m = placeNovelty({ novel: [{ quote: 'knew why the third pump', kind: 'new' }, { quote: 'a timer that cut power', kind: 'surprise' }],
      claims: [{ claimQuote: 'the east district never noticed', proofQuote: null }, { claimQuote: 'the pump ran perfectly', proofQuote: 'the logs showed' }] }, ix)!;
    // stretches: sentences 1-2 = 13 + 14 = 27 words, sentences 4-5 = 14 + 14 = 28 words; band 27.5 flags only the second
    const t = thinTargets(TEXT, m, { lo: 0, hi: 27.5, n: 3, source: 'user', why: '' });
    expect(t.map((x) => x.kind)).toEqual(['thin-stretch', 'unproved-claim']);
    expect(t[0].measured).toBe(28);
    expect(TEXT.slice(t[0].span.start, t[0].span.end)).toBe(`${S[4]} ${S[5]}`);
    expect(t[1].quotes).toEqual(['the east district never noticed']);
    expect(TEXT.slice(t[1].span.start, t[1].span.end)).toBe(S.slice(3).join(' '));
    expect(thinTargets(TEXT, { ...m, claims: [] }, { lo: 0, hi: 30, n: 3, source: 'user', why: '' })).toEqual([]);
  });
});
