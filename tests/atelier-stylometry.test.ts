// tests/atelier-stylometry.test.ts — THE STYLOMETRIC DETECTOR AND THE BARS A SENSOR MUST CLEAR.
//
// Offline and deterministic. The corpora are built here by template code from a seeded generator: the
// "author" narrates in short plain sentences, the "model" leans on than, that's, isn't, because and
// contrast phrasing about the same subjects. That difference is planted, so a detector that cannot find it
// is broken, and a qualification that passes pure noise is broken.
import { describe, it, expect } from 'vitest';
import {
  trainDetector, scoreDetector, topWeights, groupFolds, proseLine, fitPlatt, detectorVersion,
  FUNCTION_WORDS, MIN_PROSE_WORDS, type Piece,
} from '../core/fidelity/stylometry.js';
import {
  aucWithCi, aucRaw, heldOutAuc, qualifyAll, holdOutFolds, detectorSensor, mulberry32, itemsHash,
  QUALIFY_BARS, HOLD_OUTS, type QualifyItem, type Sensor,
} from '../core/fidelity/qualify.js';

const SUBJECTS = ['the garden', 'the old bridge', 'my sister', 'the night shift', 'the harbour', 'the kitchen', 'the bus', 'the library'];
const VERBS = ['walked past', 'fixed', 'watched', 'painted', 'carried', 'found', 'opened', 'cleaned'];
const OBJECTS = ['a red door', 'the long fence', 'two boxes', 'a broken lamp', 'the morning paper', 'a cold cup', 'the last train', 'some rope'];

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

/** Terse narration: who did what, then a short detail. */
function authorText(seed: number, words = 220): string {
  const rnd = mulberry32(seed);
  const out: string[] = [];
  let n = 0;
  while (n < words) {
    const s = rnd() < 0.5
      ? `${pick(rnd, SUBJECTS)} ${pick(rnd, VERBS)} ${pick(rnd, OBJECTS)}.`
      : `We ${pick(rnd, VERBS)} ${pick(rnd, OBJECTS)} near ${pick(rnd, SUBJECTS)} and went home.`;
    const cap = s[0].toUpperCase() + s.slice(1);
    out.push(cap); n += cap.split(' ').length;
  }
  return out.join(' ');
}

/** The imitation: the same subjects, wrapped in comparison and contrast. */
function modelText(seed: number, words = 220): string {
  const rnd = mulberry32(seed);
  const out: string[] = [];
  let n = 0;
  while (n < words) {
    const r = rnd();
    const s = r < 0.33
      ? `It isn't about ${pick(rnd, OBJECTS)}, it's about ${pick(rnd, SUBJECTS)}, because that's what matters more than anything.`
      : r < 0.66
        ? `That's why ${pick(rnd, SUBJECTS)} ${pick(rnd, VERBS)} ${pick(rnd, OBJECTS)} rather than ${pick(rnd, OBJECTS)}.`
        : `This isn't simply ${pick(rnd, OBJECTS)}; it is more than that, because ${pick(rnd, SUBJECTS)} matters.`;
    const cap = s[0].toUpperCase() + s.slice(1);
    out.push(cap); n += cap.split(' ').length;
  }
  return out.join(' ');
}

const N = 10;
const authorPieces: Piece[] = Array.from({ length: N }, (_, i) => ({ text: authorText(100 + i, 150 + i * 15), group: `src${i}` }));
const modelPieces: Piece[] = Array.from({ length: N }, (_, i) => ({ text: modelText(500 + i, 150 + i * 15), group: `src${i}` }));
const wordCount = (t: string): number => t.split(/\s+/).length;

describe('the stylometric detector', () => {
  const m = trainDetector(authorPieces, modelPieces);

  it('the synthetic corpora are the size the test claims', () => {
    for (const p of [...authorPieces, ...modelPieces]) {
      expect(wordCount(p.text)).toBeGreaterThanOrEqual(150);
      expect(wordCount(p.text)).toBeLessThanOrEqual(320);
    }
    expect(FUNCTION_WORDS.length).toBeGreaterThanOrEqual(150);
    for (const w of ['than', "that's", "isn't", 'not', 'let', "let's", 'you', 'because', 'which', 'this', "it's", "don't", 'but', 'and', 'so',
      'just', 'really', 'actually', "here's", 'what', 'when', 'while', 'also', 'however', 'instead', 'rather']) expect(FUNCTION_WORDS).toContain(w);
  });

  it('is deterministic: the same pieces train the same model, named by the same version', () => {
    const again = trainDetector(authorPieces, modelPieces);
    expect(again.version).toBe(m.version);
    expect(again.weights).toEqual(m.weights);
    expect(m.version).toBe(detectorVersion(m));
    expect(m.kind).toBe('stylometric-lr');
    expect(m.trainedOn).toEqual({ author: N, model: N });
    expect(m.features.length).toBe(m.weights.length);
    expect(m.features.filter((f) => f.startsWith('c:')).length).toBe(300);
  });

  it('separates training-style data on held-out folds (cvAuc > 0.8)', () => {
    expect(m.cvAuc).not.toBeNull();
    expect(m.cvAuc ?? 0).toBeGreaterThan(0.8);
  });

  it('scores a calibrated probability in (0, 1) and ranks an unseen imitation above an unseen author piece', () => {
    const a = scoreDetector(m, authorText(9001, 200));
    const b = scoreDetector(m, modelText(9002, 200));
    expect(a).not.toBeNull(); expect(b).not.toBeNull();
    for (const s of [a, b]) { expect(s?.p ?? 0).toBeGreaterThan(0); expect(s?.p ?? 1).toBeLessThan(1); }
    expect(b?.logit ?? 0).toBeGreaterThan(a?.logit ?? 0);
    expect(b?.p ?? 0).toBeGreaterThan(a?.p ?? 1);
  });

  it('returns null for a text under the prose-word floor, and code fences are not prose', () => {
    expect(scoreDetector(m, authorText(1, 40))).toBeNull();
    const code = '```\n' + 'const x = 1; '.repeat(200) + '\n```\n\nShort words here.';
    expect(scoreDetector(m, code)).toBeNull();
    expect(MIN_PROSE_WORDS).toBe(100);
  });

  it('chooses its trigrams from the training texts only', () => {
    const training = [...authorPieces, ...modelPieces].map((p) => proseLine(p.text)).join(' | ');
    for (const f of m.features.filter((x) => x.startsWith('c:'))) expect(training).toContain(f.slice(2));
    const scored = `${authorText(77, 200)} Zqxj zqxj zqxj zqxj zqxj.`;
    expect(scoreDetector(m, scored)).not.toBeNull();
    expect(m.features.some((f) => f.includes('zq') || f.includes('qx'))).toBe(false);
  });

  it('names what each side overuses, and the imitation side carries the planted words', () => {
    const top = topWeights(m, 10);
    expect(top.model.length).toBe(10); expect(top.author.length).toBe(10);
    expect(top.model.every((x) => x.weight > 0)).toBe(true);
    expect(top.author.every((x) => x.weight < 0)).toBe(true);
    const planted = ['w:than', "w:that's", "w:isn't", 'w:because', 'w:rather'];
    const modelSide = topWeights(m, 60).model.map((x) => x.feature);
    expect(planted.some((p) => modelSide.includes(p))).toBe(true);
  });

  it('has no held-out AUC and an identity calibration when there is too little to fold', () => {
    const tiny = trainDetector(authorPieces.slice(0, 3), modelPieces.slice(0, 3));
    expect(tiny.cvAuc).toBeNull();
    expect(tiny.platt).toEqual({ a: 1, b: 0 });
    // one group per class: also nothing to fold
    const one = trainDetector(authorPieces.map((p) => ({ text: p.text, group: 'A' })), modelPieces.map((p) => ({ text: p.text, group: 'M' })));
    expect(one.cvAuc).toBeNull();
  });

  it('refuses to train without texts of both kinds', () => {
    expect(() => trainDetector(authorPieces, [{ text: 'too short' }])).toThrow(/both kinds/);
  });

  it('fits a Platt calibration that orders as the logits do', () => {
    const { a } = fitPlatt([-2, -1, -0.5, 0.5, 1, 2], [0, 0, 1, 0, 1, 1]);
    expect(a).toBeGreaterThan(0);
    expect(fitPlatt([1, 2], [1, 1])).toEqual({ a: 1, b: 0 });
  });
});

describe('grouped folds', () => {
  it('never put one group in training and test at once, and spread each class across folds', () => {
    const groups = ['a', 'a', 'b', 'c', 'c', 'd', 'e', 'f', 'g', 'g', 'h'];
    const labels = [0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1];
    const k = 4;
    const fold = groupFolds(groups, labels, k);
    expect(fold).toEqual(groupFolds(groups, labels, k));               // deterministic
    for (let f = 0; f < k; f++) {
      const test = new Set(groups.filter((_, i) => fold[i] === f));
      const train = new Set(groups.filter((_, i) => fold[i] !== f));
      for (const g of test) expect(train.has(g)).toBe(false);
      // with at least 2 groups per class and k >= 2, no fold holds every group of a class
      for (const label of [0, 1]) expect(groups.some((_, i) => labels[i] === label && fold[i] !== f)).toBe(true);
    }
    expect(new Set(fold).size).toBe(k);
  });
});

describe('aucWithCi', () => {
  const pos = [0.9, 0.8, 0.75, 0.6, 0.55, 0.4, 0.85, 0.7];
  const neg = [0.3, 0.45, 0.5, 0.2, 0.6, 0.1, 0.35, 0.65];

  it('is deterministic for a seed, and the interval holds the point', () => {
    const a = aucWithCi(pos, neg, { seed: 7, resamples: 500 });
    expect(aucWithCi(pos, neg, { seed: 7, resamples: 500 })).toEqual(a);
    expect(a.ci95[0]).toBeLessThanOrEqual(a.auc);
    expect(a.ci95[1]).toBeGreaterThanOrEqual(a.auc);
    expect(a.ci95[1] - a.ci95[0]).toBeGreaterThan(0);
    expect(aucWithCi(pos, neg, { seed: 8, resamples: 500 }).auc).toBe(a.auc);
  });

  it('counts ties half and matches the pairwise definition', () => {
    expect(aucRaw([1, 1], [1, 1])).toBe(0.5);
    let wins = 0;
    for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
    expect(aucRaw(pos, neg)).toBeCloseTo(wins / (pos.length * neg.length), 10);
    expect(() => aucWithCi([], neg)).toThrow();
  });
});

// Items for qualification: 3 topics, 2 generators, author and model sharing sources.
function items(): QualifyItem[] {
  const out: QualifyItem[] = [];
  for (let i = 0; i < 12; i++) {
    const topic = ['harbour', 'garden', 'trains'][i % 3];
    out.push({ text: authorText(1000 + i), label: 'author', source: `s${i}`, topic });
    out.push({ text: modelText(2000 + i), label: 'model', source: `s${i}`, topic, generator: i % 2 ? 'gen-b' : 'gen-a' });
  }
  return out;
}

/** A deterministic noise score: a hash of the text, unrelated to its label. */
const noise = (t: string): number => parseInt(itemsHash([{ text: t, label: 'author', source: '' }]).slice(0, 8), 16) / 0xffffffff;
const thanRate = (t: string): number => (t.match(/\bthan\b|\bisn't\b|\bthat's\b/gi) ?? []).length / wordCount(t);

describe('heldOutAuc and qualifyAll', () => {
  const data = items();

  it('a pure-noise feature does not pass', () => {
    const r = heldOutAuc(data, { kind: 'feature', measure: noise }, 'source', { seed: 3, resamples: 500 });
    expect(r.passes).toBe(false);
    expect(r.pooled).not.toBeNull();
    expect(r.pooled?.separation ?? 1).toBeLessThan(QUALIFY_BARS.minSeparation);
  });

  it('a strongly separating feature passes, and its orientation is read or declared', () => {
    const r = heldOutAuc(data, { kind: 'feature', measure: thanRate }, 'topic', { seed: 3, resamples: 500 });
    expect(r.passes).toBe(true);
    expect(r.pooled?.orientation).toBe('model-higher');
    expect(r.pooled?.ci95[0] ?? 0).toBeGreaterThanOrEqual(QUALIFY_BARS.minCiLow);
    expect(r.folds.length).toBe(3);
    // the same feature, negated: orientation-free separation is the same, and read from the data it passes
    const neg: Sensor = { kind: 'feature', measure: (t) => -thanRate(t) };
    const n = heldOutAuc(data, neg, 'topic', { seed: 3, resamples: 500 });
    expect(n.pooled?.orientation).toBe('model-lower');
    expect(n.pooled?.separation).toBe(r.pooled?.separation);
    // declared the wrong way round, it fails
    const wrong = heldOutAuc(data, { kind: 'feature', measure: (t) => -thanRate(t), direction: 'model-higher' }, 'topic', { seed: 3, resamples: 500 });
    expect(wrong.passes).toBe(false);
  });

  it('deals author sources across generator folds so every fold has both labels', () => {
    const folds = holdOutFolds(data, 'generator');
    expect(folds.map((f) => f.held)).toEqual(['gen-a', 'gen-b']);
    const all = folds.flatMap((f) => f.test);
    expect(new Set(all).size).toBe(data.length);                       // every item tested exactly once
    expect(all.length).toBe(data.length);
    for (const f of folds) {
      expect(f.test.some((i) => data[i].label === 'author')).toBe(true);
      expect(f.test.some((i) => data[i].label === 'model')).toBe(true);
      const authorSources = new Set(f.test.filter((i) => data[i].label === 'author').map((i) => data[i].source));
      const other = folds.filter((g) => g !== f).flatMap((g) => g.test).filter((i) => data[i].label === 'author').map((i) => data[i].source);
      for (const s of other) expect(authorSources.has(s)).toBe(false);
    }
  });

  it('the trained detector, retrained inside each fold, holds with a generator held out', () => {
    const r = heldOutAuc(data, detectorSensor(), 'generator', { seed: 1, resamples: 300 });
    expect(r.unscored).toBe(0);
    expect(r.pooled?.auc ?? 0).toBeGreaterThan(0.8);
    expect(r.passes).toBe(true);
  });

  it('qualifyAll skips a hold-out the data cannot support, and says why', () => {
    const flat = data.map((it) => ({ ...it, topic: undefined, generator: it.label === 'model' ? 'only-one' : undefined }));
    const q = qualifyAll(flat, { kind: 'feature', measure: thanRate }, { seed: 2, resamples: 300 });
    expect(q.skipped.map((s) => s.holdOut).sort()).toEqual(['generator', 'topic']);
    for (const s of q.skipped) expect(s.why).toMatch(/at least 2/);
    expect(q.results.map((r) => r.holdOut)).toEqual(['source']);
    expect(q.passes).toBe(true);
    expect(q.bars).toEqual(QUALIFY_BARS);

    const full = qualifyAll(data, { kind: 'feature', measure: noise }, { seed: 2, resamples: 300 });
    expect(full.results.map((r) => r.holdOut)).toEqual([...HOLD_OUTS]);
    expect(full.passes).toBe(false);
  });
});
