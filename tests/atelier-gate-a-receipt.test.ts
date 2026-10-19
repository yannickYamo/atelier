// THE BUILD RECEIPT, THE STAGES IT RECORDS, AND WHAT IT REFUSES. A skill version names its files; the receipt beside it
// names what the build read, with what, and what it could not: a persona lost to a failed call was once said in one
// line of a log and nowhere else, and a fidelity profile left in a project's run folder by an earlier discovery would
// be installed by any later build in that folder, for pieces it never measured.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { receiptOf, describeStages, degradedStages, type BuildStage } from '../core/state/receipt.js';
import * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} Tests first, then the rest.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
] };

describe('the receipt as a value', () => {
  const stages: BuildStage[] = [{ id: 'persona', ran: true, detail: '2 points' }, { id: 'profile', ran: false, why: 'fewer than 7 pieces read' }];
  const base = { skillVersionHash: 'v1', standardVersionHash: 's1', architectureHash: 'a1', packageHash: 'p1', corpusHash: null, methodHash: 'm1', models: { contextReader: 'claude-haiku-5-5' }, stages, builtAt: '2026-10-18T00:00:00Z' };
  it('hashes everything but the time, in a stable order of stages', () => {
    const a = receiptOf(base);
    const b = receiptOf({ ...base, builtAt: '2026-10-19T00:00:00Z', stages: [...stages].reverse() });
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(receiptOf({ ...base, models: { contextReader: 'other' } }).receiptHash).not.toBe(a.receiptHash);
    expect(a.schema).toBe(1);
  });
  it('says the stages in one line and names what was lost', () => {
    expect(describeStages(stages)).toBe('Stages: persona ✓ (2 points) · author profile — fewer than 7 pieces read');
    expect(degradedStages({ stages })).toEqual([]);
    expect(degradedStages({ stages: [{ id: 'persona', ran: false, why: 'the call failed', degraded: true }] }).map((s) => s.id)).toEqual(['persona']);
  });
});

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const setBackend = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });

interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (n: number): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-ga-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-ga-proj-'));
  mkdirSync(join(proj, 'examples'));
  writeFileSync(join(proj, 'method.md'), NOTE);
  ['Approve', 'Request changes', 'Comment', 'Approve', 'Comment'].slice(0, n).forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, 40 + i)); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
const L = (data: string): store.StoreLayout => ({ root: data, skillName: 'code-review' });
const runDirOf = (data: string): string => { const d = join(data, 'runs'); return join(d, readdirSync(d)[0]); };

describe('the receipt of a method build', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('records every stage, ran or not with its reason, keyed by the skill version; the screen says the stages in one line', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] } } });
    const { data, run } = seed(4);
    const r = run('new', 'examples', '--method', 'method.md', '--name', 'code-review', '--yes', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const active = store.getActive(L(data))!;
    const receipt = store.getReceipt(L(data), active);
    expect(receipt).not.toBeNull();
    expect(receipt!.skillVersionHash).toBe(active);
    expect(receipt!.methodHash).not.toBeNull();
    expect(receipt!.corpusHash).toBeNull();
    const by = Object.fromEntries(receipt!.stages.map((s) => [s.id, s]));
    expect(by.method).toMatchObject({ ran: true });
    expect(by.persona).toMatchObject({ ran: true, detail: '2 points' });
    expect(by['work-form']).toMatchObject({ ran: true });
    expect(by.scope).toMatchObject({ ran: false });
    expect(by.profile).toMatchObject({ ran: false });
    expect(by.contrast).toMatchObject({ ran: false });
    expect(degradedStages(receipt!)).toEqual([]);
    // the short screen stays as the owner ruled it (nothing about a persona that was not asked for); the whole account
    // says the stages in one line, in the order a build reads
    expect(r.out).not.toMatch(/^Stages: /m);
    // the same build again decides the same: the receipt hash is stable, the time is not part of it
    const again = run('build', '--name', 'code-review', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/^Stages: method ✓ \(3 step\(s\) served whole\) · counted rules ✓ .* · work form ✓ \(documents\) · persona ✓ \(2 points\) · scope — the work does not answer requests · author profile — .* · signals — .* · model contrast — /m);
    expect(store.getReceipt(L(data), store.getActive(L(data))!)!.receiptHash).toBe(receipt!.receiptHash);
  }, 120_000);

  it('a persona lost to a failed call is said with the command that repairs it, recorded as degraded, and shown by status', async () => {
    await setBackend({ byTool: { emit_holds_back: { ids: [] } }, when: [{ contains: 'You describe how a writer sounds', finish: 'content_filter' }] });
    const { data, run } = seed(4);
    const r = run('new', 'examples', '--method', 'method.md', '--name', 'code-review', '--yes', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/\(the persona could not be derived: .*; the skill is built without it\. Read it later: atelier build --name code-review --persona auto\.\)/);
    const receipt = store.getReceipt(L(data), store.getActive(L(data))!)!;
    expect(degradedStages(receipt).map((s) => s.id)).toEqual(['persona']);
    expect(receipt.stages.find((s) => s.id === 'persona')?.why).toMatch(/^the call failed: /);
    const st = run('status', '--skill', 'code-review');
    expect(st.out).toMatch(/built without: persona \(the call failed.*\)\. Repair: atelier build --name code-review --persona auto/);
  }, 120_000);

  it('a profile and signals left in the run folder by another build are set aside, never installed, and the build says so', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] } } });
    const { data, run } = seed(4);
    // a first build makes the run folder; then a stale profile is planted where discovery would have written its own
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'code-review', '--yes', ...BACKEND()).code).toBe(0);
    const rd = runDirOf(data);
    writeFileSync(join(rd, 'fidelity.json'), JSON.stringify({ version: 1, corpusHash: 'deadbeef', bands: [{ id: 'question', cls: 'all', band: [0, 9], median: 3, spread: 1, n: 12, role: 'SIGNAL', auc: 0.9 }], detector: null, hash: 'h', factDensity: 0 }));
    writeFileSync(join(rd, 'signals.json'), JSON.stringify([{ id: 'question', band: [0, 9], authorMedian: 3, modelMedian: 1, auc: 0.9 }]));
    const r = run('build', '--name', 'code-review', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(fstore.getProfile(L(data))).toBeNull();
    expect(fstore.getActiveRelease(L(data))).toBeNull();
    expect(store.getSignals(L(data))).toEqual([]);
    expect(existsSync(join(rd, 'fidelity.stale.json'))).toBe(true);
    expect(existsSync(join(rd, 'fidelity.json'))).toBe(false);
    expect(existsSync(join(rd, 'signals.stale.json'))).toBe(true);
    expect(r.out).toContain('a fidelity profile in this project\'s run folder is not from these pieces: set aside as fidelity.stale.json, not installed');
    const receipt = store.getReceipt(L(data), store.getActive(L(data))!)!;
    expect(receipt.stages.find((s) => s.id === 'profile')).toMatchObject({ ran: false, why: expect.stringContaining('set aside') });
    expect(readFileSync(join(rd, 'fidelity.stale.json'), 'utf8')).toContain('deadbeef');
  }, 120_000);
});
