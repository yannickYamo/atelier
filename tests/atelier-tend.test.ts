// tests/atelier-tend.test.ts — THE LOOP WITHOUT A PERSON IN IT: SET UP ONCE, THEN TENDED.
//
// `floor --setup` does in one command what used to take seven; `tend` runs mining, the taste reader's
// status, the floor and one round of the optimizer within one budget; `status --skill` is the one page
// that says where a skill stands. Driven through the built binary against a scripted model.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const post = async (body: unknown): Promise<void> => {
  const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
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

/** A skill with two REQUIRED counted rules and a folder of six titled pieces of the author's own. */
const seed = (): { data: string; proj: string; corpus: string } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-tend-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-tend-proj-'));
  run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:synergy');
  run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
  run(data, proj, 'ratify-close', '--work-type', 'writing');
  run(data, proj, 'build', '--name', 'focus');
  const corpus = join(proj, 'mine'); mkdirSync(corpus);
  ['On plain words', 'Why reviews matter', 'The cost of jargon', 'Writing for one reader', 'Short is not simple', 'Ending well']
    .forEach((t, i) => { writeFileSync(join(corpus, `p${i}.md`), `# ${t}\n\nPiece ${i}. Plain words, no jargon at all, and a point made once.`); });
  return { data, proj, corpus };
};

describe('floor --setup: one command from nothing to an earned floor', () => {
  it('takes tasks from the titles of your pieces, enforces the REQUIRED counted rules, freezes a baseline and qualifies until earned', async () => {
    const { data, proj, corpus } = seed();
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the plain answer' } } });
    const out = run(data, proj, 'floor', '--skill', 'focus', '--setup', '--corpus', corpus, '--runs', '12');
    expect(out).toContain('Tasks: 6, from the titles of your own pieces');
    expect(out).toContain('Enforced: 2 counted rule(s).');
    expect(out).toMatch(/At most \d+ draft\(s\)/);
    expect(out).toContain('Baseline frozen');
    expect(out).toContain('EARNED');
    expect(out).toMatch(/\(\d+ model call\(s\), \$/);
    const floor = store.getFloor(L);
    expect(floor.tasks[0]).toBe('Write a piece titled "On plain words".');
    expect(floor.qualification).not.toBeNull();
    // It stops as soon as the floor is earned: one A/A run gives one trial per enforced rule, so 6 of the 12.
    expect(out.match(/^This run:/gm)).toHaveLength(6);
  }, 300_000);

  it('says what is missing rather than guessing: too few titled pieces is refused before anything is spent', () => {
    const { data, proj } = seed();
    const few = join(proj, 'few'); mkdirSync(few);
    for (const i of [1, 2]) writeFileSync(join(few, `p${i}.md`), `# Title ${i}\n\nBody ${i}.`);
    const out = run(data, proj, 'floor', '--skill', 'focus', '--setup', '--corpus', few);
    expect(out).toMatch(/^EXIT:1[\s\S]*found 2 titled piece\(s\); the floor needs 5 tasks/);
    expect(store.getBaseline({ root: data, skillName: 'focus' }, store.getActive({ root: data, skillName: 'focus' })!)).toBeNull();
  });
});

describe('the audit\'s refusals come before any spend', () => {
  it('floor --setup refuses with fewer than two enforceable rules, before drafting anything', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-tend1-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-tend1-proj-'));
    run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:synergy');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'focus');
    const corpus = join(proj, 'mine'); mkdirSync(corpus);
    for (let i = 0; i < 6; i++) writeFileSync(join(corpus, `p${i}.md`), `# Title number ${i}\n\nPiece ${i}. Plain words, no jargon.`);
    const out = run(data, proj, 'floor', '--skill', 'focus', '--setup', '--corpus', corpus);
    expect(out).toMatch(/^EXIT:1[\s\S]*needs at least two[\s\S]*Nothing was spent/);
    expect(out).not.toContain('model call');
  });
  it('optimize refuses a baseline frozen under another model before its screen spends anything', async () => {
    const { data, proj, corpus } = seed();
    await post({ byTool: { emit_piece: { piece: 'the plain answer' } } });
    expect(run(data, proj, 'floor', '--skill', 'focus', '--setup', '--corpus', corpus, '--runs', '1')).toContain('Baseline frozen');
    const L = { root: data, skillName: 'focus' };
    const other = run(data, proj, 'optimize', '--skill', 'focus', '--target-model', 'scripted-v2');
    expect(other).toMatch(/^EXIT:1[\s\S]*frozen under scripted, not scripted-v2/);
    // Nothing was proposed, so nothing is left PENDING to block the next round.
    expect(store.readEvents(L).some((e) => e.kind === 'REPAIR_PROPOSED')).toBe(false);
  });
});

describe('tend and status --skill', () => {
  it('before setup, tend mines and reports, and points at the one command that sets up the floor; status says the same on one page', async () => {
    const { data, proj } = seed();
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer' } } });
    run(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation');
    const out = run(data, proj, 'tend', '--skill', 'focus');
    expect(out).toContain('── focus, tended ──');
    expect(out).toContain('taste reader: reports on 0 rule(s), acts on none yet');
    expect(out).toContain('set it up once: atelier floor --skill focus --setup');
    expect(out).not.toContain('── optimize ──');
    expect(store.readEvents(L).some((e) => e.kind === 'TENDED')).toBe(true);
    expect(store.getMining(L)).not.toBeNull();
    const page = run(data, proj, 'status', '--skill', 'focus');
    expect(page).toMatch(/rules\s+2: 2 counted, 0 read by the taste reader/);
    expect(page).toMatch(/uses\s+1 recorded/);
    expect(page).toMatch(/last tended\s+\d{4}-/);
  }, 120_000);

  it('after setup, tend runs a round of the optimizer and, with --auto, lets the gate install a winner', async () => {
    const { data, proj, corpus } = seed();
    const L = { root: data, skillName: 'focus' };
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'the rule is skimmed while drafting' }] } } });
    expect(run(data, proj, 'floor', '--skill', 'focus', '--setup', '--corpus', corpus, '--runs', '12')).toContain('EARNED');
    const std = store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash;
    const before = store.getActive(L);
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'the rule is skimmed while drafting' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the plain answer' } }] });
    const out = run(data, proj, 'tend', '--skill', 'focus', '--auto', '--cap', '50');
    expect(out).toContain('── optimize ──');
    expect(out).toMatch(/installed \S+; the previous version remains: atelier rollback --skill focus --to /);
    expect(store.getActive(L)).not.toBe(before);
    expect(store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash, 'tend moved the standard').toBe(std);
    expect(run(data, proj, 'status', '--skill', 'focus')).toMatch(/floor\s+\S+/);
  }, 300_000);
});
