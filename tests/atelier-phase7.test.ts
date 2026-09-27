// tests/atelier-phase7.test.ts — THE REGRESSION FLOOR, FED BY THE STANDARD'S OWN COUNTS.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { orientedScore, proposeMargins, evaluateTask, targetComparison, countAA, qualifyFromAA, clopperPearsonUpper,
  floorDimensions, buildContract, compositeAcross, MIN_MARGIN } from '../core/distinctiveness/measured.js';
import { measure } from '../core/observers/registry.js';
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
  it('half the interquartile range, never below the minimum', () => {
    const pieces = ['synergy', 'synergy synergy', 'synergy synergy synergy', 'synergy synergy synergy synergy'];
    const [p] = proposeMargins(dims, pieces);
    expect(p.spread).toBeGreaterThan(0);
    expect(p.margin).toBeCloseTo(p.spread / 2, 3);
    expect(proposeMargins(dims, ['clean', 'clean', 'clean'])[0].margin).toBe(MIN_MARGIN);
  });
  it('fewer than three pieces the rule applies to: no proposal, not a guess', () => {
    expect(proposeMargins(dims, ['a', 'b'])).toEqual([]);
  });
  it('every dimension starts OBSERVE, and an owner\'s setting survives a new proposal', () => {
    const c = buildContract(proposeMargins(dims, ['a', 'b', 'c']), dims, null);
    expect(Object.values(c.dimensions).every((d) => d.gateRole === 'OBSERVE')).toBe(true);
    const owned: QualityFloorContract = { instrument: 'scoreDimensionByPolicy', dimensions: { [dims[0].key]: { nonInferiorityMargin: 2, gateRole: 'ENFORCE', rationale: 'mine' } } };
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
  it('one task, however many drafts, cannot resolve anything', () => {
    expect(targetComparison([{ candidate: [1, 1, 1, 1, 1], champion: [0, 0, 0, 0, 0] }])).toBe('INCONCLUSIVE');
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
  it('only resolved ENFORCE comparisons are trials; OBSERVE and INCONCLUSIVE are not', () => {
    const r: QualityFloorResult = { composite: 'NONINFERIOR', drivenBy: [], perDim: [
      { dim: 'a', verdict: 'NONINFERIOR', gateRole: 'ENFORCE', margin: 1, delta: 0, lowerBound: 0, upperBound: 0 },
      { dim: 'b', verdict: 'REGRESSION', gateRole: 'OBSERVE', margin: 1, delta: -2, lowerBound: -2, upperBound: -2 },
      { dim: 'c', verdict: 'INCONCLUSIVE', gateRole: 'ENFORCE', margin: 1, delta: 0, lowerBound: -9, upperBound: 9 } ] };
    expect(countAA([r])).toEqual({ trials: 1, falseAlarms: 0 });
  });
  it('qualified only under the bound and over at least three tasks', () => {
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60 }, 3, 'e').qualification).not.toBeNull();
    expect(qualifyFromAA({ falseAlarms: 0, trials: 60 }, 2, 'e').qualification).toBeNull();
    expect(qualifyFromAA({ falseAlarms: 2, trials: 60 }, 10, 'e').qualification).toBeNull();
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

describe('through the binary: propose, freeze, qualify, and a repair that installs itself', () => {
  it('the floor earns its authority, and then a counted improvement is confirmed and installed without a person', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p7-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p7-proj-'));
    const L = { root: data, skillName: 'focus' };
    run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL',
      '--materiality', 'PREFERRED', '--measure', 'LEXICON:synergy');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    await setByTool({ emit_piece: { piece: 'the synergy answer' } });
    expect(run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation')).not.toMatch(/^EXIT:/);

    // Nothing yet: the floor says what to do next.
    expect(run(data, proj, 'floor', '--skill', 'focus')).toContain('--corpus');

    const corpus = join(proj, 'mine'); mkdirSync(corpus);
    for (const i of [1, 2, 3]) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}. Plain words, no jargon at all.`);
    const tasks = join(proj, 'tasks.txt');
    writeFileSync(tasks, Array.from({ length: 60 }, (_, i) => `Write recommendation number ${i + 1}.`).join('\n\n'));
    const set = run(data, proj, 'floor', '--skill', 'focus', '--corpus', corpus, '--tasks', tasks, '--enforce', '1');
    expect(set).toContain('60 task(s) set');
    const f = store.getFloor(L);
    expect(Object.values(f.contract!.dimensions)[0]).toMatchObject({ gateRole: 'ENFORCE' });

    // A candidate cannot be checked before a baseline exists.
    expect(run(data, proj, 'floor', '--skill', 'focus', '--check', 'nope')).toMatch(/^EXIT:1[\s\S]*baseline/);

    expect(run(data, proj, 'floor', '--skill', 'focus', '--baseline', '--fires', '2')).toContain('Baseline frozen');
    expect(store.getBaseline(L, store.getActive(L)!)).toHaveLength(60);
    const q = run(data, proj, 'floor', '--skill', 'focus', '--qualify', '--fires', '2');
    expect(q).toContain('0 false alarm(s) in 60');
    expect(q).toContain('EARNED');
    expect(run(data, proj, 'floor', '--skill', 'focus')).toContain('state: EARNED');

    // Now a complaint whose count favours the candidate: confirmed on the floor's tasks, and installed.
    const before = store.getActive(L);
    await setByTool({ emit_coverage: { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1' },
      emit_piece: { piece: 'the plain answer' } });
    const out = run(data, proj, 'fix', 'it said synergy', '--fires', '2', '--floor-cap', '10');
    expect(out).toContain('Your regression floor is earned');
    expect(out).toContain('gate: AUTO_PROMOTE');
    expect(out).toContain('Kept, by the gate');
    expect(store.getActive(L)).not.toBe(before);
    expect(store.getBaseline(L, store.getActive(L)!), 'the promoted version\'s scores are not the new baseline').toHaveLength(60);
    expect(store.readEvents(L).some((e) => e.kind === 'PROMOTED' && (e as { authority?: string }).authority === 'AUTO_PROMOTE')).toBe(true);
  }, 300_000);

  it('changing the tasks or the margins voids the qualification', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p7b-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p7b-proj-'));
    run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--materiality', 'PREFERRED', '--measure', 'LEXICON:synergy');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    const corpus = join(proj, 'mine'); mkdirSync(corpus);
    for (const i of [1, 2, 3]) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}.`);
    const tasks = join(proj, 'tasks.txt');
    writeFileSync(tasks, Array.from({ length: 60 }, (_, i) => `Task ${i + 1}.`).join('\n\n'));
    await setByTool({ emit_piece: { piece: 'plain' } });
    run(data, proj, 'floor', '--skill', 'focus', '--corpus', corpus, '--tasks', tasks, '--enforce', '1');
    run(data, proj, 'floor', '--skill', 'focus', '--baseline', '--fires', '2');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--qualify', '--fires', '2')).toContain('EARNED');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--margin', '1=0.9')).toContain('state: UNQUALIFIED');
    expect(run(data, proj, 'floor', '--skill', 'focus', '--margin', '1=0')).toMatch(/^EXIT:1[\s\S]*positive number/);
  }, 300_000);
});
