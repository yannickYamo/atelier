// tests/atelier-phase7.test.ts — THE REGRESSION FLOOR, FED BY THE STANDARD'S OWN COUNTS.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { orientedScore, proposeMargins, evaluateTask, targetComparison, countAA, qualifyFromAA, clopperPearsonUpper,
  floorDimensions, buildContract, compositeAcross, MIN_MARGIN } from '../core/distinctiveness/measured.js';
import { measure } from '../core/observers/registry.js';
import { resolvePromotion } from '../core/convergence/promotion.js';
import type { Measurement, StandardVersion } from '../core/state/canonical-state.js';
import type { FrozenBaselineEntry, QualityFloorContract, QualityFloorResult } from '../core/distinctiveness/floor.js';
import * as store from '../core/state/store.js';
import { aRequirement } from './fixtures.js';

describe('scores are oriented so higher is always better', () => {
  const score = (m: Measurement, text: string): number | null => orientedScore(m, measure(text, m));
  it('a ban counts against; fewer uses score higher', () => {
    const m: Measurement = { observer: 'LEXICON', params: { terms: ['synergy'] } };
    expect(score(m, 'synergy and synergy')).toBeLessThan(score(m, 'synergy once')!);
  });
  it('a floor counts for; a cap counts against; a band counts distance outside it', () => {
    const text = Array.from({ length: 40 }, () => 'We tried it but it broke so we fixed it.').join(' ');
    const lo: Measurement = { observer: 'TERM_RATE', params: { terms: ['but'], minPer1000: 1 } };
    const hi: Measurement = { observer: 'TERM_RATE', params: { terms: ['but'], maxPer1000: 1 } };
    const band: Measurement = { observer: 'TERM_RATE', params: { terms: ['but'], minPer1000: 1, maxPer1000: 500 } };
    expect(score(lo, text)).toBeGreaterThan(0);
    expect(score(hi, text)).toBeLessThan(0);
    expect(score(band, text)).toBe(0);
  });
  it('a rule that did not apply gives no score, never a zero', () => {
    expect(score({ observer: 'TERM_RATE', params: { terms: ['but'], minPer1000: 1 } }, 'Too short.')).toBeNull();
  });
});

describe('margins come from the author\'s own spread', () => {
  const rule = aRequirement({ requirementId: 'x1', kind: 'BOUNDARY', statement: 'Never say synergy.',
    measurement: { observer: 'LEXICON', params: { terms: ['synergy'] } } });
  const v = { requirements: [rule] } as unknown as StandardVersion;
  const dims = floorDimensions(v);
  it('half the interquartile range, never finer than one occurrence', () => {
    const pieces = ['synergy', 'synergy synergy synergy', 'synergy synergy synergy synergy synergy', 'synergy synergy synergy synergy synergy synergy synergy'];
    const [p] = proposeMargins(dims, pieces);
    expect(p.spread).toBeGreaterThan(2);
    expect(p.margin).toBeCloseTo(p.spread / 2, 3);
    // An author who never uses the word has no spread: the margin is one use, not 0.05 of one.
    expect(proposeMargins(dims, ['clean', 'clean', 'clean'])[0].margin).toBe(1);
    expect(MIN_MARGIN).toBeLessThan(1);
  });
  it('a rate rule\'s margin is at least one occurrence at the author\'s length', () => {
    const rate = aRequirement({ requirementId: 'c1', kind: 'BOUNDARY', statement: 'Rare.', measurement: { observer: 'PATTERN_RATE', params: { pattern: ['NOT_X_ITS_Y'], maxPer1000: 0.3 } } });
    const long = Array.from({ length: 500 }, () => 'word').join(' ');
    const [p] = proposeMargins(floorDimensions({ requirements: [rate] } as unknown as StandardVersion), [long, long, long]);
    expect(p.margin).toBe(2);   // one occurrence in 500 words is 2 per 1,000
  });
  it('fewer than three pieces the rule applies to: no proposal, not a guess', () => {
    expect(proposeMargins(dims, ['a', 'b'])).toEqual([]);
  });
  it('every dimension starts OBSERVE, and an owner\'s setting survives a new proposal', () => {
    const c = buildContract(proposeMargins(dims, ['a', 'b', 'c']), dims, null);
    expect(Object.values(c.dimensions).every((d) => d.gateRole === 'OBSERVE')).toBe(true);
    const owned: QualityFloorContract = { instrument: 'scoreDimensionByPolicy', dimensions: { [dims[0].key]: { nonInferiorityMargin: 2, gateRole: 'ENFORCE', rationale: 'set by the owner' } } };
    expect(buildContract(proposeMargins(dims, ['a', 'b', 'c']), dims, owned).dimensions[dims[0].key].nonInferiorityMargin).toBe(2);
  });
});

describe('a task\'s verdict, and the verdict across tasks', () => {
  const contract: QualityFloorContract = { instrument: 'scoreDimensionByPolicy', dimensions: {
    a: { nonInferiorityMargin: 0.5, gateRole: 'ENFORCE', rationale: '' }, b: { nonInferiorityMargin: 0.5, gateRole: 'OBSERVE', rationale: '' } } };
  const frozen = (a: number[], b: number[]): FrozenBaselineEntry => ({ clusterId: 'c', fixtureContextId: 't', nGen: a.length, meanScores: {}, perFireScores: { a, b } });
  it('held on the enforced dimension: NONINFERIOR', () => {
    expect(evaluateTask({ a: [0, 0, 0], b: [0, 0, 0] }, frozen([0, 0, 0], [0, 0, 0]), contract).composite).toBe('NONINFERIOR');
  });
  it('clearly worse on the enforced dimension: REGRESSION, whatever the observed one does', () => {
    expect(evaluateTask({ a: [-3, -3, -3], b: [5, 5, 5] }, frozen([0, 0, 0], [0, 0, 0]), contract).composite).toBe('REGRESSION');
  });
  it('an enforced dimension that could not be scored holds the task at INCONCLUSIVE, never "held"', () => {
    const r = evaluateTask({ b: [0, 0] }, frozen([0, 0, 0], [0, 0, 0]), contract);
    expect(r.composite).toBe('INCONCLUSIVE');
    expect(r.drivenBy).toEqual(['a']);
  });
  it('one task regressing is a regression', () => {
    const r = (c: QualityFloorResult['composite']): QualityFloorResult => ({ perDim: [], composite: c, drivenBy: [] });
    expect(compositeAcross([r('NONINFERIOR'), r('REGRESSION'), r('INCONCLUSIVE')])).toBe('REGRESSION');
    expect(compositeAcross([r('NONINFERIOR'), r('INCONCLUSIVE')])).toBe('INCONCLUSIVE');
    expect(compositeAcross([])).toBe('INCONCLUSIVE');
  });
});

describe('the target comparison takes tasks as the unit', () => {
  it('fewer than three tasks, however many drafts, cannot resolve anything', () => {
    expect(targetComparison([{ candidate: [1, 1, 1, 1, 1], champion: [0, 0, 0, 0, 0] }])).toBe('INCONCLUSIVE');
    expect(targetComparison([{ candidate: [1, 1], champion: [0, 0] }, { candidate: [1, 1], champion: [0, 0] }])).toBe('INCONCLUSIVE');
  });
  it('a consistent improvement across tasks is IMPROVED; a consistent drop REGRESSED; noise INCONCLUSIVE', () => {
    const t = (c: number, f: number) => ({ candidate: [c, c], champion: [f, f] });
    expect(targetComparison([t(1, 0), t(1, 0), t(1, 0)])).toBe('IMPROVED');
    expect(targetComparison([t(0, 1), t(0, 1), t(0, 1)])).toBe('REGRESSED');
    expect(targetComparison([t(1, 0), t(0, 1), t(0.1, 0)])).toBe('INCONCLUSIVE');
  });
});

describe('qualification is an exact bound on false alarms from A/A runs', () => {
  it('Clopper–Pearson: no false alarm in 59 trials is just under 5%; in 58 it is not', () => {
    expect(clopperPearsonUpper(0, 59, 0.95)).toBeLessThanOrEqual(0.05);
    expect(clopperPearsonUpper(0, 58, 0.95)).toBeGreaterThan(0.05);
    expect(clopperPearsonUpper(3, 3, 0.95)).toBe(1);
  });
  it('the task is the unit: a resolved task is a trial, a regressed one a false alarm, an unresolved one neither', () => {
    const r = (c: QualityFloorResult['composite']): QualityFloorResult => ({ perDim: [], composite: c, drivenBy: [] });
    expect(countAA([r('NONINFERIOR'), r('REGRESSION'), r('INCONCLUSIVE')])).toEqual({ trials: 2, falseAlarms: 1 });
  });
  it('the variance floor keeps a one-margin blip from zero-spread counts unresolved, and resolves a clear drop', () => {
    const c: QualityFloorContract = { instrument: 'scoreDimensionByPolicy', dimensions: { a: { nonInferiorityMargin: 1, gateRole: 'ENFORCE', rationale: '' } } };
    const f = (xs: number[]): FrozenBaselineEntry => ({ clusterId: 'c', fixtureContextId: 't', nGen: xs.length, meanScores: {}, perFireScores: { a: xs } });
    expect(evaluateTask({ a: [-1, -1, -1] }, f([0, 0, 0]), c).composite).toBe('INCONCLUSIVE');
    expect(evaluateTask({ a: [-3, -3, -3] }, f([0, 0, 0]), c).composite).toBe('REGRESSION');
    expect(evaluateTask({ a: [0, 0, 0] }, f([0, 0, 0]), c).composite).toBe('NONINFERIOR');
  });
  it('the target is left out of the composite: guarding the target with the floor double-counts it', () => {
    const c: QualityFloorContract = { instrument: 'scoreDimensionByPolicy', dimensions: { a: { nonInferiorityMargin: 1, gateRole: 'ENFORCE', rationale: '' } } };
    const f: FrozenBaselineEntry = { clusterId: 'c', fixtureContextId: 't', nGen: 3, meanScores: {}, perFireScores: { a: [0, 0, 0] } };
    expect(evaluateTask({ a: [-9, -9, -9] }, f, c, new Set(['a'])).composite).toBe('INCONCLUSIVE');
  });
  it('qualified only under the false-alarm bound, over at least three tasks, and sensitive to a planted regression', () => {
    const sensitive = { plantedHits: 20, planted: 20 };
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60, ...sensitive }, 3, 'e').qualification).not.toBeNull();
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60, ...sensitive }, 2, 'e').qualification).toBeNull();
    expect(qualifyFromAA({ falseAlarms: 2, trials: 60, ...sensitive }, 10, 'e').qualification).toBeNull();
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60, plantedHits: 10, planted: 20 }, 10, 'e').qualification, 'a floor that misses half of real regressions qualified').toBeNull();
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60, plantedHits: 5, planted: 5 }, 10, 'e').qualification, 'sensitivity from five plantings').toBeNull();
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60 }, 10, 'e').qualification).toBeNull();
  });
});

describe('the promotion gate never reads a missing floor verdict as a pass', () => {
  it('floor null with every other gate met is HUMAN_GATED, not AUTO_PROMOTE', () => {
    const d = resolvePromotion({ incumbentStandardHash: 's', candidateStandardHash: 's', evaluatedPackageHash: 'p', candidatePackageHash: 'p',
      deliveryValid: true, deterministicRegression: false, fidelityAuthority: 'CERTIFY', comparison: 'IMPROVED', distinctiveness: 'EARNED', floor: null });
    expect(d.authority).toBe('HUMAN_GATED');
    expect(d.unmet.join()).toMatch(/none was taken/);
  });
});

// ── Through the binary, with a scripted model ────────────────────────────────────────────────────

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const setByTool = async (byTool: Record<string, unknown>): Promise<void> => {
  // One retry: after a long test the server may have closed the idle keep-alive socket fetch reuses.
  const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool }) });
  try { await send(); } catch { await send(); }
};
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run npm run build first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
});
afterAll(() => { backend.kill(); });

const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj } });
  } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
};

/** A skill with two measured rules, one invocation recorded, a floor with 60 tasks, both rules enforced. */
const seedFloor = async (data: string, proj: string): Promise<void> => {
  run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED', '--measure', 'LEXICON:synergy');
  run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED', '--measure', 'LEXICON:leverage');
  run(data, proj, 'ratify-close', '--work-type', 'writing');
  run(data, proj, 'build', '--name', 'focus');
  await setByTool({ emit_piece: { piece: 'the synergy answer' } });
  expect(run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation')).not.toMatch(/^EXIT:/);
  const corpus = join(proj, 'mine'); mkdirSync(corpus);
  for (const i of [1, 2, 3]) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}. Plain words, no jargon at all.`);
  const tasks = join(proj, 'tasks.txt');
  writeFileSync(tasks, Array.from({ length: 60 }, (_, i) => `Write recommendation number ${i + 1}.`).join('\n\n'));
  expect(run(data, proj, 'floor', '--skill', 'focus', '--corpus', corpus, '--tasks', tasks, '--enforce', '1', '--enforce', '2')).toContain('60 task(s) set');
};

describe('through the binary: propose, freeze, qualify, and a repair that installs itself', () => {
  it('the floor earns its authority on independent A/A runs, a counted improvement installs itself, and the floor must then be re-earned', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p7-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p7-proj-'));
    const L = { root: data, skillName: 'focus' };
    await seedFloor(data, proj);
    expect(run(data, proj, 'floor', '--skill', 'focus', '--check', 'nope')).toMatch(/^EXIT:1[\s\S]*baseline/);
    expect(run(data, proj, 'floor', '--skill', 'focus', '--baseline')).toContain('Baseline frozen');
    const q = run(data, proj, 'floor', '--skill', 'focus', '--qualify');
    expect(q).toContain('0 false alarm(s) in 60 resolved task comparison(s)');
    expect(q).toContain('EARNED');
    expect(run(data, proj, 'floor', '--skill', 'focus')).toContain('state: EARNED');

    const before = store.getActive(L);
    await setByTool({ emit_coverage: { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1' },
      emit_piece: { piece: 'the plain answer' } });
    const out = run(data, proj, 'fix', 'it said synergy', '--floor-cap', '10');
    expect(out).toContain('Your regression floor is earned');
    expect(out).toContain('gate: AUTO_PROMOTE');
    expect(out).toContain('Kept, by the gate');
    expect(store.getActive(L)).not.toBe(before);
    expect(store.readEvents(L).some((e) => e.kind === 'PROMOTION_GATE' && (e as { authority?: string }).authority === 'AUTO_PROMOTE')).toBe(true);
    // The promoted version's check scores are not reused as its baseline, and the qualification no longer applies.
    expect(store.getBaseline(L, store.getActive(L)!)).toBeNull();
    expect(run(data, proj, 'floor', '--skill', 'focus')).not.toContain('state: EARNED');
  }, 300_000);

  it('a floor that cannot finish hands the choice back instead of crashing', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p7c-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p7c-proj-'));
    await seedFloor(data, proj);
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    run(data, proj, 'floor', '--skill', 'focus', '--qualify');
    await setByTool({ emit_coverage: { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1' },
      emit_piece: { piece: 'the plain answer' } });
    const out = run(data, proj, 'fix', 'it said synergy', '--floor-cap', '0.0000001');
    expect(out).toContain('The floor could not finish');
    expect(out).toContain('--pick a|b|same');
  }, 300_000);

  it('with only the target enforced, nothing guards the rest, and nothing installs itself', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p7d-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p7d-proj-'));
    const L = { root: data, skillName: 'focus' };
    await seedFloor(data, proj);
    run(data, proj, 'floor', '--skill', 'focus', '--observe', '2');
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    run(data, proj, 'floor', '--skill', 'focus', '--qualify');
    const before = store.getActive(L);
    await setByTool({ emit_coverage: { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1' },
      emit_piece: { piece: 'the plain answer' } });
    const out = run(data, proj, 'fix', 'it said synergy', '--floor-cap', '10');
    expect(out).toContain('gate: HUMAN_GATED');
    expect(out).toContain('nothing guards what the change did not aim at');
    expect(store.getActive(L)).toBe(before);
  }, 300_000);

  it('changing the margins voids the qualification; a bad margin is refused', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p7b-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p7b-proj-'));
    await seedFloor(data, proj);
    run(data, proj, 'floor', '--skill', 'focus', '--baseline');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--qualify')).toContain('EARNED');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--margin', '1=0.9')).toContain('state: UNQUALIFIED');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--margin', '1=0')).toMatch(/^EXIT:1[\s\S]*positive number/);
  }, 300_000);
});
