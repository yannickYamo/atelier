// tests/atelier-phase-a-regressions.test.ts — defects found by the Phase A audit (2026-09-28) that need a
// model to reach, each pinned through the shipped binary against the scripted backend. The ones that need
// no model sit with their Phase 0 siblings in atelier-phase0-regressions.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;

const factor = (description: string, needs = '') => ({
  description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'],
  wouldBeAbsentIf: 'the opposite shows', needsFromUser: needs, quote: '',
});
const CHAIN = { byTool: {
  emit_factors: { factors: [factor('Lead with the decision, then the reasoning.'), factor('Quantify with the real figure.', 'the actual figures for the period')] },
  emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] },
  emit_observation: { applicable: true, present: true, why: 'seen' },
  emit_rules: { rules: [{ statement: 'Lead with the decision.', appliesWhen: 'GENERAL', evidence: '', evidenceItemId: 'post-0.md',
    kind: 'GENERATIVE', wouldBeAbsentIf: 'the reasoning comes first' }] },
} };
const script = async (body: unknown): Promise<void> => {
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
};

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  await script(CHAIN);
});
afterAll(() => { backend.kill(); });

const MODEL = () => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};
const fresh = (): { data: string; proj: string } => ({
  data: realpathSync(mkdtempSync(join(tmpdir(), 'atelier-pa-data-'))),
  proj: realpathSync(mkdtempSync(join(tmpdir(), 'atelier-pa-proj-'))),
});
const corpus = (proj: string, n: number): string => {
  const dir = join(proj, 'posts');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) writeFileSync(join(dir, `post-${i}.md`), `Post ${i}. ${'We decided first, and explained after. '.repeat(12)}`);
  return dir;
};
const session = (data: string): { proposals: { requirementId: string }[]; run: { heldOutChecked?: boolean } } => {
  const dir = join(data, 'sessions');
  return JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')) as never;
};
const pending = (data: string): { requirements: { requirementId: string; prerequisites?: { why: string }[] }[] } => {
  const runs = readdirSync(join(data, 'runs'));
  return JSON.parse(readFileSync(join(data, 'runs', runs[0], 'pending-standard.json'), 'utf8')) as never;
};

describe('a staged ruling silent on `needs` keeps what discovery found', () => {
  const discovered = (): { data: string; proj: string; ids: string[] } => {
    const { data, proj } = fresh();
    run(data, proj, 'intake', corpus(proj, 8));
    const out = run(data, proj, 'discover', '--no-contrast', ...MODEL());
    expect(out).not.toMatch(/^EXIT:/);
    return { data, proj, ids: session(data).proposals.map((p) => p.requirementId) };
  };
  const approveAll = (ids: string[], p2: Record<string, string> = {}): string =>
    JSON.stringify(ids.map((id) => ({ id, decision: 'APPROVE', materiality: 'REQUIRED', ...(id === 'p2' ? p2 : {}) })));

  it('no `needs` in the ruling: the discovered prerequisite is attached, and the command says so', () => {
    const { data, proj, ids } = discovered();
    const out = run(data, proj, 'ratify', '--decisions', approveAll(ids));
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/p2: needs from you: the actual figures for the period {2}\(found by discovery/);
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    const p2 = pending(data).requirements.find((r) => r.requirementId === 'p2');
    expect(p2?.prerequisites?.[0]?.why).toBe('the actual figures for the period');
  });

  it('"needs":"none" waives it, and says what was waived', () => {
    const { data, proj, ids } = discovered();
    const out = run(data, proj, 'ratify', '--decisions', approveAll(ids, { needs: 'none' }));
    expect(out).toMatch(/p2: needs nothing from you, as you ruled — discovery had found: the actual figures for the period/);
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(pending(data).requirements.find((r) => r.requirementId === 'p2')?.prerequisites).toBeUndefined();
  });

  it('a `needs` the person wrote wins over the discovered one, silently', () => {
    const { data, proj, ids } = discovered();
    const out = run(data, proj, 'ratify', '--decisions', approveAll(ids, { needs: 'the Q3 revenue table' }));
    expect(out).not.toMatch(/found by discovery/);
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(pending(data).requirements.find((r) => r.requirementId === 'p2')?.prerequisites?.[0]?.why).toBe('the Q3 revenue table');
  });
});

describe('a discovery that fell back to a single pass says so on the ratify page', () => {
  it('the chain refuses (no factors), the saved run carries heldOutChecked=false, and the caveat renders', async () => {
    const { data, proj } = fresh();
    run(data, proj, 'intake', corpus(proj, 8));
    await script({ byTool: { ...CHAIN.byTool, emit_factors: { factors: [] } } });
    const out = run(data, proj, 'discover', '--no-contrast', ...MODEL());
    await script(CHAIN);
    expect(out).toMatch(/Falling back to a single pass/);
    expect(session(data).run.heldOutChecked).toBe(false);
    const page = join(proj, 'rulings.html');
    expect(run(data, proj, 'ratify', '--page', page)).not.toMatch(/^EXIT:/);
    expect(readFileSync(page, 'utf8')).toMatch(/This run could not check its\s+proposals against work the proposer had not read/);
  });

  it('a run the chain validated renders no caveat (the polarity)', () => {
    const { data, proj } = fresh();
    run(data, proj, 'intake', corpus(proj, 8));
    run(data, proj, 'discover', '--no-contrast', ...MODEL());
    expect(session(data).run.heldOutChecked).toBe(true);
    const page = join(proj, 'rulings.html');
    run(data, proj, 'ratify', '--page', page);
    expect(readFileSync(page, 'utf8')).not.toMatch(/Read these as proposals, not findings/);
  });
});

describe('a resumed fix pairs the candidate with a run of the same task, or not at all', () => {
  const COVERED = { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1 covers it' };
  const seeded = async (): Promise<{ data: string; proj: string }> => {
    const { data, proj } = fresh();
    run(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    await script({ byTool: { emit_piece: { piece: 'the original answer' } } });
    expect(run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation', ...MODEL())).not.toMatch(/^EXIT:/);
    await script({ byTool: { emit_coverage: COVERED, emit_piece: { piece: 'the improved answer' } } });
    expect(run(data, proj, 'fix', 'the answer buried the recommendation', ...MODEL())).toContain('--pick a|b|same');
    return { data, proj };
  };

  it('a complaint about a DIFFERENT task is not shown beside the pending candidate\'s run; it is sent to promote/reject', async () => {
    const { data, proj } = await seeded();
    await script({ byTool: { emit_piece: { piece: 'the summary answer' } } });
    expect(run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the summary', ...MODEL())).not.toMatch(/^EXIT:/);
    await script({ byTool: { emit_coverage: COVERED, emit_piece: { piece: 'unused' } } });
    const out = run(data, proj, 'fix', 'the summary buried the point', ...MODEL());
    expect(out, 'a run of another task was paired with this one').not.toContain('──── A ────');
    expect(out).not.toContain('the improved answer');
    expect(out).toMatch(/already waiting for your decision/);
    expect(out).toMatch(/atelier promote --skill focus --candidate \S+ --why/);
    expect(out).toMatch(/atelier reject {2}--skill focus --candidate \S+ --why/);
    await script(CHAIN);
  }, 120_000);

  it('the same task resumes the pair as before (the polarity)', async () => {
    const { data, proj } = await seeded();
    await script({ byTool: { emit_coverage: COVERED, emit_piece: { piece: 'unused' } } });
    const out = run(data, proj, 'fix', 'the answer buried the recommendation', ...MODEL());
    expect(out).toContain('──── A ────');
    expect(out).toContain('the improved answer');
    expect(out).toContain('the original answer');
    await script(CHAIN);
  }, 120_000);
});
