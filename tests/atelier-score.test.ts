// tests/atelier-score.test.ts — ONE DETERMINISTIC NUMBER FOR A TEXT AGAINST A STANDARD, NO MODEL CALLED.
//
// `atelier score` is the evaluator bench/compare/ hands to GEPA and SkillOpt beside the outside judge. A
// search is only as good as its score, so each component is pinned in both directions: a broken REQUIRED
// rule lowers it, an invented figure lowers it, a missing profile drops the range component and the weights
// renormalise, and the same text scores the same every time. The binary test runs with no backend at all.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkDraft } from '../core/loop/run-repair.js';
import { patternSensor } from '../core/loop/claim-extract.js';
import { readFidelity } from '../core/fidelity/profile.js';
import { scoreOf, SCORE_WEIGHTS } from '../cli/commands/score.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { FidelityProfile } from '../core/fidelity/types.js';
import { aRequirement } from './fixtures.js';

const CLI = resolve('dist/cli/atelier.mjs');

const std = {
  standardVersionHash: 'score-test',
  requirements: [aRequirement({ requirementId: 'r1', statement: 'Never write "leverage".', kind: 'BOUNDARY', materiality: 'REQUIRED',
    measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } })],
} as unknown as StandardVersion;

const TASK = 'Write the launch note for Friday.';
const check = (text: string, material = TASK) =>
  checkDraft('s', std, text, { material, claimSensor: patternSensor(material, false), guardClaims: true });

const HOLDS = 'We ship on Friday. The fix is small, and it makes the export faster for everyone who uses it.';
const BREAKS = 'We ship on Friday. The fix is small, and we leverage the cache to make the export faster.';
const INVENTED = 'We ship on Friday. According to a 2024 survey, 37% of teams wait a week for an export like this.';

/** A profile with one steering band: questions, a share between 0 and 0.1 of sentences. */
const profile: FidelityProfile = {
  version: 1, corpusHash: 'c', detector: null, hash: 'p',
  bands: [{ id: 'question', cls: 'all', band: [0, 0.1], median: 0, spread: 0, n: 6, role: 'SIGNAL', auc: 0.8 }],
};

describe('atelier score: the formula', () => {
  it('is deterministic: the same text and standard give the same score and components', () => {
    const a = scoreOf(check(BREAKS), readFidelity(BREAKS, profile));
    const b = scoreOf(check(BREAKS), readFidelity(BREAKS, profile));
    expect(a).toEqual(b);
  });

  it('a text breaking a REQUIRED rule scores lower than one holding it', () => {
    const held = scoreOf(check(HOLDS), null);
    const broken = scoreOf(check(BREAKS), null);
    expect(held.components.required).toBe(1);
    expect(broken.components.required).toBe(0);
    expect(broken.score).toBeLessThan(held.score);
    expect(broken.perRequirement.find((l) => l.id === 'r1')).toMatchObject({ verdict: 'VIOLATED', counts: 'required' });
  });

  it('an invented figure lowers the claims component; the same figure supplied in the material does not', () => {
    const invented = scoreOf(check(INVENTED), null);
    expect(invented.components.claims).toBeLessThan(1);
    expect(invented.score).toBeLessThan(scoreOf(check(HOLDS), null).score);
    const supplied = scoreOf(check(INVENTED, `${TASK}\n\nA 2024 survey found 37% of teams wait a week for an export.`), null);
    expect(supplied.components.claims).toBe(1);
  });

  it('with no profile the range component is absent and the weights renormalise over what applies', () => {
    const s = scoreOf(check(BREAKS), null);
    expect(s.components.range).toBeUndefined();
    expect(s.components.format).toBeUndefined();
    const w = SCORE_WEIGHTS.required + SCORE_WEIGHTS.claims;
    expect(s.weights).toEqual({ required: Math.round(SCORE_WEIGHTS.required / w * 1e4) / 1e4, claims: Math.round(SCORE_WEIGHTS.claims / w * 1e4) / 1e4 });
    expect(s.score).toBeCloseTo((SCORE_WEIGHTS.required * 0 + SCORE_WEIGHTS.claims * 1) / w, 4);
  });

  it('with a profile the range component is the in-band share, and counts', () => {
    // The question share is measured from ten sentences up; below that the band measures nothing.
    const long = `${HOLDS} ${'The export runs once a day. The team reads the log after it. '.repeat(4)}`;
    expect(scoreOf(check(HOLDS), readFidelity(HOLDS, profile)).components.range).toBeUndefined();
    const inside = scoreOf(check(long), readFidelity(long, profile));
    expect(inside.components.range).toBe(1);
    const asking = `${long} Is it ready? Do we wait? Who signs off? Why now?`;
    const outside = scoreOf(check(asking), readFidelity(asking, profile));
    expect(outside.components.range).toBe(0);
    expect(outside.score).toBeLessThan(inside.score);
    expect(Object.values(inside.weights).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1, 3);
  });
});

describe('atelier score: through the binary, with no backend', () => {
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` before running this file alone.`);
  });

  const run = (data: string, proj: string, ...args: string[]): { out: string; status: number } => {
    // No provider flags and no keys: score must never need a backend.
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CLAIMS_MODEL; delete env.ATELIER_CLAIMS;
    try {
      return { out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), status: 0 };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { out: `${err.stderr ?? ''}${err.stdout ?? ''}`, status: err.status ?? -1 };
    }
  };

  it('scores a built skill: JSON shape, a broken rule lower, the same answer twice, refusals on exit 2', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-score-data-'));
    const proj = mkdtempSync(join(tmpdir(), 'atelier-score-proj-'));
    expect(run(data, proj, 'add', '--statement', 'Never write "leverage".', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL',
      '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage=>use').status).toBe(0);
    expect(run(data, proj, 'ratify-close', '--work-type', 'writing').status).toBe(0);
    expect(run(data, proj, 'build', '--name', 'focus').status).toBe(0);
    writeFileSync(join(proj, 'holds.md'), HOLDS);
    writeFileSync(join(proj, 'breaks.md'), BREAKS);
    writeFileSync(join(proj, 'task.md'), TASK);

    const first = run(data, proj, 'score', '--skill', 'focus', '--task', 'task.md', 'breaks.md', '--json');
    expect(first.status).toBe(0);
    const broken = JSON.parse(first.out) as { score: number; components: Record<string, number>; perRequirement: { id: string; verdict: string }[]; profileHash: string | null };
    expect(broken.components.required).toBe(0);
    expect(broken.components.range).toBeUndefined();
    expect(broken.profileHash).toBeNull();
    expect(broken.perRequirement.some((l) => l.id === 'UNSOURCED' && l.verdict === 'MET')).toBe(true);
    expect(run(data, proj, 'score', '--skill', 'focus', '--task', 'task.md', 'breaks.md', '--json').out).toBe(first.out);

    const held = JSON.parse(run(data, proj, 'score', '--skill', 'focus', '--task', TASK, 'holds.md', '--json').out) as { score: number };
    expect(held.score).toBeGreaterThan(broken.score);

    const human = run(data, proj, 'score', '--skill', 'focus', '--task', TASK, 'holds.md');
    expect(human.out).toMatch(/score 1\.0000/);
    expect(human.out).toContain('0.4·required');

    expect(run(data, proj, 'score', '--skill', 'focus', 'holds.md').status).toBe(2);              // no --task
    expect(run(data, proj, 'score', '--skill', 'nobody', '--task', TASK, 'holds.md').status).toBe(2);
    expect(run(data, proj, 'score', '--skill', 'focus', '--task', TASK, 'missing.md').status).toBe(2);
  }, 60_000);
});
