// THE LATITUDE THROUGH THE COMMANDS: read at the build and said in one line, minted into the standard (inside its hash),
// changed by the owner with `--latitude` or `atelier amend --latitude`; at a run, tightened by the request where the
// reading quotes it, said to the writer, and carried on the certificate and the record. Offline, against the scripted
// backend.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { standardHashOf } from '../core/state/canonical-state.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How I write the newsletter\n\n1. Open with a Lead section.\n2. Take a position and defend it.\n';
const piece = (n: number): string => `## Lead\nLast week I deleted half our dashboards, and I would do it again. ${'Nobody missed the ones that went. '.repeat(n)}\n\nThe point is that a dashboard nobody reads is a cost.\n`;
const DRAFT = '## Lead\nRevenue grew 40% this quarter, and the reason is that we stopped guessing.\n';

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const promptsFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === tool).map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};

describe('the latitude through the commands', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_latitude: { level: 'CREATIVE', quotes: ['I would do it again'] },
      emit_request_latitude: { level: 'STRICT', quote: 'Announce our quarterly revenue' },
      emit_holds_back: { ids: [] }, emit_piece: { piece: DRAFT } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('read at the build, said in one line, minted in the standard; tightened by a request; changed by the owner', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-lat-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-lat-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    [1, 2, 3].forEach((n) => { writeFileSync(join(proj, 'examples', `p${n}.md`), piece(n)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const L = { root: data, skillName: 'letter' };
    const active = () => store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;

    const b = run('new', 'examples', '--method', 'method.md', '--name', 'letter', '--yes', ...BACKEND());
    expect(b.code, b.out).toBe(0);
    expect(b.out).toContain('Latitude: creative, read from "I would do it again"');
    expect(b.out).toContain('atelier amend --latitude <level>');
    const v = active();
    expect(v.latitude).toEqual({ level: 'CREATIVE', evidence: ['I would do it again'], by: 'model' });
    // the level is the owner's: in the hash
    expect(standardHashOf(v)).toBe(v.standardVersionHash);
    expect(standardHashOf({ ...v, latitude: { ...v.latitude!, level: 'STRICT' } })).not.toBe(v.standardVersionHash);
    // creative accepts the rule no check reads as unmeasured
    const judged = v.requirements.find((r) => r.statement.startsWith('Take a position'))!;
    expect(v.acceptedUnmeasured).toContain(judged.requirementId);

    // A RUN: the request's words make it strict; the writer is told; the certificate and the record carry it
    const r = run('invoke', '--skill', 'letter', 'Announce our quarterly revenue to the team.', '--json', ...BACKEND());
    expect(r.code === 0 || r.code === 1, r.out).toBe(true);
    const json = JSON.parse(r.out.slice(r.out.indexOf('\n{') + 1)) as { certificate: { latitude: unknown; acceptedUnmeasured: unknown }; record: { latitude?: string } };
    expect(json.certificate.latitude).toEqual({ skill: 'CREATIVE', run: 'STRICT', tightenedBy: 'Announce our quarterly revenue', setBy: 'model' });
    expect(json.record.latitude).toBe('STRICT');
    expect((await promptsFor('emit_piece')).at(-1) ?? '').toContain('How free this piece is: not free.');

    // THE OWNER CHANGES IT: amend, with a reason, a new version
    const a = run('amend', '--skill', 'letter', '--latitude', 'grounded', '--reason', 'it reports on our numbers');
    expect(a.code, a.out).toBe(0);
    expect(a.out).toContain('Latitude: grounded, as you set it');
    const w = active();
    expect(w.latitude).toEqual({ level: 'GROUNDED', evidence: [], by: 'owner' });
    expect(w.supersedes).toBe(v.standardVersionHash);
    expect(w.acceptedUnmeasured ?? []).toEqual([]);
    expect(w.requirements).toEqual(v.requirements);
  }, 240_000);

  it('--latitude at the build is the owner\'s, and a value it cannot read never stops the build', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-lat-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-lat-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), NOTE);
    [1, 2, 3].forEach((n) => { writeFileSync(join(proj, 'examples', `p${n}.md`), piece(n)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const go = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = go('new', 'examples', '--method', 'method.md', '--name', 'clause', '--yes', '--latitude', 'strict', ...BACKEND());
    expect(out).toContain('Latitude: strict, as you set it');
    const L = { root: data, skillName: 'clause' };
    expect(store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!.latitude).toEqual({ level: 'STRICT', evidence: [], by: 'owner' });
    const proj2 = mkdtempSync(join(tmpdir(), 'atelier-lat-proj-'));
    mkdirSync(join(proj2, 'examples')); writeFileSync(join(proj2, 'method.md'), NOTE);
    [1, 2, 3].forEach((n) => { writeFileSync(join(proj2, 'examples', `p${n}.md`), piece(n)); });
    const out2 = execFileSync('node', [CLI, 'new', 'examples', '--method', 'method.md', '--name', 'loose', '--yes', '--latitude', 'loose', ...BACKEND()], { encoding: 'utf8', cwd: proj2, env: { ...env, ATELIER_PROJECT_DIR: proj2 }, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out2).toContain('--latitude takes strict, grounded or creative; "loose" is none of them');
    expect(out2).toContain("Latitude: creative, read from");
  }, 240_000);
});
