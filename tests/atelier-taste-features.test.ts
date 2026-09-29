// tests/atelier-taste-features.test.ts — MANY SMALL COUNTS; THE AUTHOR'S PIECES SELECT WHICH ARE TASTE.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FEATURES, featureOf, FEATURE } from '../core/observers/features.js';
import { aucOf, bandOf, judgeFeature, selectFeatures, signalDistance, profileOf, judgeCountedFeatures } from '../core/observers/selection.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { checkReading, moveFeatures, referenceOf, moveSamples } from '../core/taste/moves.js';
import * as store from '../core/state/store.js';

const para = (s: string, n: number): string => Array.from({ length: n }, () => s).join(' ');
const colonHeavy = (i: number): string => Array.from({ length: 8 }, (_, k) =>
  para(`Point ${i}-${k}: the rule holds here, and it holds there too.`, 3)).join('\n\n');
const plain = (i: number): string => Array.from({ length: 8 }, (_, k) =>
  para(`The rule ${i} holds in case ${k} and it holds elsewhere as well today.`, 3)).join('\n\n');

describe('the counted features', () => {
  it('every feature has a unique id and says null on a text too short to mean anything', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    for (const f of FEATURES) expect(f.measure('Too short.'), f.id).toBeNull();
  });
  it('counts what it says: colons per 1,000 prose words', () => {
    expect(featureOf('colon')!.measure(colonHeavy(1))).toBeGreaterThan(20);
    expect(featureOf('colon')!.measure(plain(1))).toBe(0);
  });
  it('the serial comma needs three lists to say anything', () => {
    const f = featureOf('oxfordComma')!;
    expect(f.measure(para('We bought apples, pears, and plums for the table today.', 30))).toBe(1);
    expect(f.measure(para('We bought apples, pears and plums for the table today.', 30))).toBe(0);
  });
  it('the FEATURE observer holds a text to a band, both sides, and refuses an unknown feature', () => {
    expect(FEATURE.validate({ feature: ['nope'], minValue: 1 })).toMatch(/needs feature=/);
    expect(FEATURE.validate({ feature: ['colon'], minValue: 5, maxValue: 1 })).toMatch(/cannot exceed/);
    expect(FEATURE.observe(colonHeavy(1), { feature: ['colon'], maxValue: 5 }).verdict).toBe('VIOLATED');
    expect(FEATURE.observe(plain(1), { feature: ['colon'], maxValue: 5 }).verdict).toBe('MET');
    expect(FEATURE.observe('Short.', { feature: ['colon'], maxValue: 5 }).verdict).toBe('NOT_APPLICABLE');
  });
});

describe('selection: only what separates this author from the model, and holds, is kept', () => {
  it('AUC is the chance an author value beats a model value, ties half', () => {
    expect(aucOf([3, 4, 5], [1, 2])).toBe(1);
    expect(aucOf([1, 2], [1, 2])).toBe(0.5);
    expect(aucOf([], [1])).toBeNull();
  });
  it('the band is the 10th to 90th percentile of the read pieces, widened a quarter each side', () => {
    expect(bandOf([1, 2, 3])).toBeNull();
    const b = bandOf([10, 10, 10, 20, 20, 20, 30, 30, 30, 40])!;
    expect(b[0]).toBeLessThan(10); expect(b[1]).toBeGreaterThan(30);
  });
  it('RULE when single drafts fall outside the band; SIGNAL when only the distributions differ; nothing when neither', () => {
    const rule = judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2] });
    expect(rule).toMatchObject({ kept: true, role: 'RULE' });
    const signal = judgeFeature('x', { read: [2, 10, 3, 9, 4, 8, 5, 7], held: [6, 7], model: [2, 3, 3, 4, 2, 3] });
    expect(signal).toMatchObject({ kept: true, role: 'SIGNAL' });
    const noise = judgeFeature('x', { read: [1, 5, 2, 4, 3], held: [3, 2], model: [1, 5, 2, 4] });
    expect(noise).toMatchObject({ kept: false, role: null });
    expect(noise.why).toMatch(/does not separate/);
  });
  it('a feature the author\'s held-back pieces break is not kept', () => {
    expect(judgeFeature('x', { read: [10, 11, 12, 10, 11], held: [30, 40], model: [1, 2, 1, 2] }).why).toMatch(/held-back pieces fall outside/);
  });
  it('the strongest few are proposed; the rest are shown, not proposed', () => {
    const samples = new Map(Array.from({ length: 5 }, (_, i) => [`f${i}`, { read: [10, 11, 12, 10, 11], held: [11, 12], model: [1, 2, 1, 2] }]));
    const v = selectFeatures(samples, 2);
    expect(v.filter((x) => x.kept)).toHaveLength(2);
    expect(v.filter((x) => x.why.includes('beyond the 2 strongest'))).toHaveLength(3);
  });
  it('a signal scores closeness to the author\'s typical value; a profile reports per layer', () => {
    const signals = [{ id: 'colon', band: [70, 110] as const, authorMedian: 90, modelMedian: 0, auc: 0.9 }];
    expect(signalDistance(colonHeavy(1), signals)!).toBeLessThan(signalDistance(plain(1), signals)!);
    const p = profileOf(plain(1), [{ id: 'colon', band: [20, 60] }]);
    expect(p.layers[0]).toMatchObject({ layer: 'punctuation and typography', features: 1 });
    expect(p.layers[0].distance).toBeGreaterThan(0);
  });
});

describe('discovery proposes a counted feature only when it tells single drafts apart', () => {
  it('colon-heavy author, colon-free model: a FEATURE rule, with both numbers', () => {
    const read = [1, 2, 3, 4, 5].map((i) => ({ id: `r${i}`, text: colonHeavy(i) }));
    const held = [6, 7].map((i) => ({ id: `h${i}`, text: colonHeavy(i) }));
    const drafts = [1, 2, 3, 4].map(plain);
    const props = deriveContrastRules(read, held, drafts, 'EXPERT_AUTHORED' as never);
    const colon = props.find((p) => p.requirement.measurement?.observer === 'FEATURE' && (p.requirement.measurement.params.feature as string[])[0] === 'colon');
    expect(colon?.requirement.statement).toMatch(/^Keep colons within my range/);
    expect(judgeCountedFeatures(read.map((r) => r.text), held.map((h) => h.text), drafts).find((v) => v.id === 'colon')?.role).toBe('RULE');
  });
});

describe('the move reader (a candidate instrument): what it quotes must be where it says', () => {
  const text = 'The factory floor is a lie we tell ourselves.\n\nI was wrong about this for years, and it cost us.';
  it('a figure not in the paragraph named is dropped and counted; unknown enums fall back', () => {
    const r = checkReading(text, { paragraphs: [
      { n: 1, register: 'ANALYTICAL', figures: [{ text: 'factory floor', domain: 'MANUFACTURING' }, { text: 'a battlefield', domain: 'MILITARY' }], concession: false, aphorism: '', callback: false, humour: false, evidence: { namedSource: false, count: false, date: false, caveat: false } },
      { n: 2, register: 'NOPE', figures: [], concession: true, aphorism: 'it cost us', callback: false, humour: false, evidence: {} },
      { n: 9, register: 'ANALYTICAL', figures: [], concession: false, aphorism: '', callback: false, humour: false, evidence: {} },
    ], opening: 'THESIS', closing: 'WHATEVER', moves: ['SELF_CORRECTION', 'NOT_A_MOVE'] })!;
    expect(r.paragraphs).toHaveLength(2);
    expect(r.paragraphs[0].figures.map((f) => f.text)).toEqual(['factory floor']);
    expect(r.dropped).toBe(1);
    expect(r.paragraphs[1].register).toBe('ANALYTICAL');
    expect(r.closing).toBe('OPEN_END');
    expect(r.moves).toEqual(['SELF_CORRECTION']);
    const f = moveFeatures(r, referenceOf([r]));
    expect(f['move.concession']).toBe(0.5);
    expect(f['move.openingTypical']).toBe(1);
  });
  it('a read piece is never typical because it was counted in its own reference', () => {
    const mk = (opening: string) => checkReading(text, { paragraphs: [{ n: 1, register: 'ANALYTICAL', figures: [], concession: false, aphorism: '', callback: false, humour: false, evidence: {} }], opening, closing: 'NOTE', moves: [] })!;
    const s = moveSamples([mk('THESIS'), mk('QUOTE'), mk('QUOTE')], [], []);
    expect(s.get('move.openingTypical')!.read).toEqual([0, 0.5, 0.5]);
  });
});

describe('through the binary: a FEATURE rule by hand, and the profile', () => {
  it('add --measure FEATURE:… is checked by verify, and --profile reports by layer', () => {
    const CLI = resolve('dist/cli/atelier.mjs');
    if (!existsSync(CLI)) throw new Error('build first');
    const data = mkdtempSync(join(tmpdir(), 'atelier-feat-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-feat-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const run = (...a: string[]): { out: string; code: number } => {
      try { return { out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }; } catch (e) {
        const x = e as { stdout?: string; stderr?: string; status?: number }; return { out: `${x.stdout ?? ''}${x.stderr ?? ''}`, code: x.status ?? 1 };
      }
    };
    expect(run('add', '--statement', 'Keep colons rare.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'FEATURE:feature=colon,maxValue=5').code).toBe(0);
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'house');
    store.setSignals({ root: data, skillName: 'house' }, [{ id: 'triad', band: [2, 6], authorMedian: 4, modelMedian: 1, auc: 0.9 }]);
    const file = join(proj, 'd.md'); writeFileSync(file, colonHeavy(1));
    const r = run('verify', '--skill', 'house', file, '--profile');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/colons/);
    expect(r.out).toMatch(/profile \(0 = inside your range/);
    expect(r.out).toMatch(/punctuation and typography/);
    expect(run('add', '--statement', 'x', '--kind', 'BOUNDARY', '--measure', 'FEATURE:feature=Colon,maxValue=5').out).toMatch(/needs feature=/);
  });
});
