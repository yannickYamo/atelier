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
  // THE LEDGER (who decided, how many calls, an answer cut): a reading that fell to its floor is visible on the build
  // screen, never only in a log; a stage with none of it hashes as it did, so a receipt written before the ledger keeps its hash.
  it('the ledger: who decided, the calls, an answer cut at the token limit, a stage that ran and lost part of what it asked', () => {
    const ran: BuildStage = { id: 'moves', ran: true, detail: '20 points in 3 calls: 20 moves', by: 'model', calls: 3, truncated: true, degraded: true, why: '1 of 3 point batch(es) fell to the floor' };
    expect(describeStages([ran])).toBe('Stages: moves ✓ (20 points in 3 calls: 20 moves; 1 of 3 point batch(es) fell to the floor; an answer cut at the token limit)');
    expect(describeStages([{ id: 'persona', ran: false, why: '--persona none', by: 'off' }])).toBe('Stages: persona — --persona none (switched off)');
    expect(describeStages([{ id: 'moves', ran: false, why: 'no model set up: counted by the words alone', by: 'floor', calls: 0 }])).toBe('Stages: moves — no model set up: counted by the words alone (the floor)');
    expect(describeStages([{ id: 'method', ran: true, detail: '3 step(s) served whole; 2 of 3 checked', by: 'model', conflicts: ['1 ban over an examples\' rate'], failed: ['step 2: the written check throws on your example (x)'] }])).toBe('Stages: method ✓ (3 step(s) served whole; 2 of 3 checked)');
    expect(degradedStages({ stages: [ran] }).map((s) => s.id)).toEqual(['moves']);
    // who decided is a decision and moves the hash; the calls a reading made and an answer cut are facts of the run and do not
    // (a rebuild that keeps a persona read before made no call for it, and decided the same)
    const a = receiptOf({ ...base, stages: [{ id: 'persona', ran: true, detail: '2 points', by: 'model' }] });
    expect(receiptOf({ ...base, stages: [{ id: 'persona', ran: true, detail: '2 points' }] }).receiptHash).not.toBe(a.receiptHash);
    expect(receiptOf({ ...base, stages: [{ id: 'persona', ran: true, detail: '2 points', by: 'model', calls: 1, truncated: true }] }).receiptHash).toBe(a.receiptHash);
    expect(receiptOf({ ...base, stages: [{ id: 'persona', ran: true, detail: '2 points', by: 'model', calls: 0 }] }).receiptHash).toBe(a.receiptHash);
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
    // the pieces' own hash, which the profile installed on this path is kept under (cli/corpus.ts, corpusHashOf)
    expect(receipt!.corpusHash).toMatch(/^[0-9a-f]{16}$/);
    const by = Object.fromEntries(receipt!.stages.map((s) => [s.id, s]));
    // the ledger: who decided each stage, and the calls a reading made
    expect(by.method).toMatchObject({ ran: true, by: 'model', detail: '3 step(s) served whole; 3 of 3 checked', failed: [], conflicts: [] });
    expect(by.persona).toMatchObject({ ran: true, detail: '2 points (1 always, 1 often)', by: 'model', calls: 1 });
    expect(by['work-form']).toMatchObject({ ran: true, by: 'code' });
    expect(by.scope).toMatchObject({ ran: false });
    expect(by.counted).toMatchObject({ by: 'code' });
    expect(by.moves).toMatchObject({ ran: false, by: 'floor', calls: 1 });
    expect(receipt!.stages.every((s) => s.by !== undefined)).toBe(true);
    // THE AUTHOR'S RANGE ON THE METHOD PATH: bands from the four pieces alone, installed under the pieces' own hash, with a first release
    expect(by.profile).toMatchObject({ ran: true }); expect(String((by.profile as { detail?: string }).detail)).toMatch(/\d+ feature\(s\) banded/);
    expect(by.contrast).toMatchObject({ ran: false });
    expect(degradedStages(receipt!)).toEqual([]);
    // the short screen stays as the owner ruled it (nothing about a persona that was not asked for); the whole account
    // says the stages in one line, in the order a build reads
    expect(r.out).not.toMatch(/^Stages: /m);
    // the same build again decides the same: the receipt hash is stable, the time is not part of it
    const again = run('build', '--name', 'code-review', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/^Stages: method ✓ \(3 step\(s\) served whole; 3 of 3 checked\) · counted rules ✓ .* · work form ✓ \(documents\) · persona ✓ \(2 points \(1 always, 1 often\)\) · moves — .* \(the floor\) · scope — the work does not answer requests · author profile ✓ \(\d+ feature\(s\) banded\) · signals — .* · model contrast — /m);
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
    expect(receipt.stages.find((s) => s.id === 'persona')).toMatchObject({ by: 'floor', calls: 1 });
    const st = run('status', '--skill', 'code-review');
    expect(st.out).toMatch(/built without: persona \(the call failed.*\)\. Repair: atelier build --name code-review --persona auto/);
  }, 120_000);

  // A WRITTEN CHECK THAT FAILED IS ON THE BUILD SCREEN. "the written check throws on your example (Cannot access
  // 'material' before initialization)" was once one line of a --report log; the method stage now says how many steps are
  // checked and which written check failed with what, the receipt carries it, and `status` prints it.
  it('a written check that throws on the example is said on the method stage, carried by the receipt, and printed by status', async () => {
    const DEAD = "(text, request, material) => { if (text.length) { const material = material ?? []; return { ok: material.length >= 0, detail: 'read', spans: [] }; } return { ok: true, detail: 'empty', spans: [] }; }";
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, emit_check_repair: {}, emit_step_checks: { checks: [
      { id: '1', how: 'measure', measure: 'PRESENCE:sections=Summary,opens=1', source: null, quote: 'Open with a Summary section', means: 'a Summary section opens the work' },
      { id: '2', how: 'written', measure: null, source: DEAD, quote: 'Must fix section', means: 'a Must fix section follows' },
      { id: '3', how: 'judgement', measure: null, source: null, quote: 'End with a Verdict section', means: 'yours to judge' },
    ] } } });
    const { data, run } = seed(4);
    const r = run('new', 'examples', '--method', 'method.md', '--name', 'code-review', '--yes', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const line = "3 step(s) served whole; 1 of 3 checked; 1 written check failed (step 2: the written check throws on your example (Cannot access 'material' before initialization))";
    expect(r.out).toContain(`Stages: method ✓ (${line}; 1 written check failed)`);
    const receipt = store.getReceipt(L(data), store.getActive(L(data))!)!;
    expect(receipt.stages.find((s) => s.id === 'method')).toMatchObject({ ran: true, by: 'model', detail: line, degraded: true, failed: ["step 2: the written check throws on your example (Cannot access 'material' before initialization)"] });
    expect(degradedStages(receipt).map((s) => s.id)).toEqual(['method']);
    const st = run('status', '--skill', 'code-review');
    expect(st.out).toContain(line);
    expect(st.out).toMatch(/built without: method \(1 written check failed\)/);
    expect(st.out).not.toContain('Repair: atelier build');
  }, 120_000);

  it('a profile and signals left in the run folder by another build are never installed: a method rebuild installs the pieces\' own profile and no signals', async () => {
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] } } });
    const { data, run } = seed(4);
    // a first build makes the run folder; then a stale profile is planted where discovery would have written its own
    expect(run('new', 'examples', '--method', 'method.md', '--name', 'code-review', '--yes', ...BACKEND()).code).toBe(0);
    const rd = runDirOf(data);
    writeFileSync(join(rd, 'fidelity.json'), JSON.stringify({ version: 1, corpusHash: 'deadbeef', bands: [{ id: 'question', cls: 'all', band: [0, 9], median: 3, spread: 1, n: 12, role: 'SIGNAL', auc: 0.9 }], detector: null, hash: 'h', factDensity: 0 }));
    writeFileSync(join(rd, 'signals.json'), JSON.stringify([{ id: 'question', band: [0, 9], authorMedian: 3, modelMedian: 1, auc: 0.9 }]));
    // a bare `build` installs nothing it cannot name: the planted profile is not from these pieces and is set aside
    const r = run('build', '--name', 'code-review', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(fstore.getProfile(L(data))?.corpusHash).not.toBe('deadbeef');
    expect(store.getSignals(L(data))).toEqual([]);
    expect(existsSync(join(rd, 'fidelity.stale.json'))).toBe(true);
    expect(existsSync(join(rd, 'signals.stale.json'))).toBe(true);
    expect(r.out).toContain('a fidelity profile in this project\'s run folder is not from these pieces: set aside as fidelity.stale.json, not installed');
    expect(readFileSync(join(rd, 'fidelity.stale.json'), 'utf8')).toContain('deadbeef');
    // the method build again: the pieces' own profile, under their hash, and discovery's leftovers cleared, never installed
    writeFileSync(join(rd, 'signals.json'), JSON.stringify([{ id: 'question', band: [0, 9], authorMedian: 3, modelMedian: 1, auc: 0.9 }]));
    const again = run('new', 'examples', '--method', 'method.md', '--name', 'code-review', '--yes', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    const prof = fstore.getProfile(L(data))!;
    expect(prof.corpusHash).toMatch(/^[0-9a-f]{16}$/); expect(prof.bands.length).toBeGreaterThan(0); expect(prof.detector).toBeNull();
    expect(fstore.getActiveRelease(L(data))).not.toBeNull();
    expect(store.getSignals(L(data))).toEqual([]);
    const receipt = store.getReceipt(L(data), store.getActive(L(data))!)!;
    expect(receipt.stages.find((s) => s.id === 'profile')).toMatchObject({ ran: true });
    expect(receipt.stages.find((s) => s.id === 'signals')).toMatchObject({ ran: false });
  }, 120_000);
});
