// C0/C1 CONTRACT AUDIT, AS REGRESSIONS (2026-10-19). Each test names the invariant it holds:
//   6. an owner's boundary added after the persona was read drops the point from a KEPT persona and from the moves
//      read from it: no rejected behaviour comes back through a carrier the owner never ruled on;
//   4. a floor profile replaced by a model's stays on disk under its own hash, so the receipt that named it resolves;
//   7. two goldens: no persona, said so, no moves, said so; the no-model floor is unknown throughout and persisted so.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { personaHashOf } from '../core/compiler/moves.js';
import type { PersonaPoint } from '../core/compiler/persona.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const NOTE_BAN = `${NOTE}4. Never use "synergy".\n`;
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} We need synergy here. Tests first, then the rest.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'buzzword', description: 'Leans on the word synergy when a change needs several teams.', frequency: 'OFTEN', quote: 'We need synergy here.' },
] };
const MOVES = { moves: [
  { point: 1, trigger: null, evidence: ['piece-1', 'piece-2', 'piece-3'].map((piece) => ({ piece, quote: 'I would start with the riskiest line.', situationQuote: null })), realisation: 'a position first', forbidden: null, scope: 'sentence', link: 1, check: null },
  { point: 2, trigger: 'when a change needs several teams', evidence: [{ piece: 'piece-1', quote: 'We need synergy here.', situationQuote: 'keeps its tests' }], realisation: 'the word synergy', forbidden: null, scope: 'sentence', link: null, check: null },
] };

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (examples = 4): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gca-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gca-proj-'));
  mkdirSync(join(proj, 'examples'));
  writeFileSync(join(proj, 'method.md'), NOTE); writeFileSync(join(proj, 'method-ban.md'), NOTE_BAN);
  ['Approve', 'Request changes', 'Comment', 'Approve'].slice(0, examples).forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), review(v, i + 1)); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_PROVIDER;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
const L = (data: string) => ({ root: data, skillName: 'code-review' });
const activeOf = (data: string) => store.getSkillVersion(L(data), store.getActive(L(data))!)!;
const skillMd = (proj: string): string => readFileSync(join(proj, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8');

describe('the C0/C1 contract, through the build', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_persona_moves: MOVES, emit_holds_back: { ids: [] } } }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('6. a boundary the owner adds later drops the point from the kept persona, the skill and the moves', () => {
    const s = seed();
    const first = s.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(first.code, first.out).toBe(0);
    expect(skillMd(s.proj)).toContain('Leans on the word synergy');
    const p1 = store.getMoves(L(s.data), personaHashOf(PERSONA.points as PersonaPoint[]))!;
    expect(p1.units.map((u) => u.aspect)).toEqual(['stance', 'buzzword']);
    // the owner's method now bans the word; the persona is kept (no --persona auto), and reconciled
    const second = s.run('method', 'method-ban.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', ...BACKEND());
    expect(second.code, second.out).toBe(0);
    expect(second.out).toContain('persona ✓ (1 point (1 always))');
    const md = skillMd(s.proj);
    expect(md).not.toContain('synergy when a change needs several teams'); expect(md).toContain('Opens from a position of my own');
    const receipt = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!;
    const p2 = store.getMovesByHash(L(s.data), receipt.movesHash!)!;
    expect(p2.units.map((u) => u.aspect)).toEqual(['stance']);
    expect(p2.personaHash).not.toBe(p1.personaHash);
    // the first profile is still on disk under its own hash: the first receipt resolves
    expect(store.getMovesByHash(L(s.data), p1.hash)).not.toBeNull();
  }, 300_000);

  it('4 and 7. a reading that floors (a model present, nothing grounded) persists an unknown-throughout profile; a later reading replaces it under a new hash and the floor stays for the receipt that named it', async () => {
    // the script answers the persona but not the moves: the moves reading grounds nothing and floors
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] } } }) });
    const s = seed();
    const first = s.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND());
    expect(first.code, first.out).toBe(0);
    expect(first.out).toMatch(/· moves — [^·]*every move is of unknown applicability ·/);
    const r1 = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!;
    const floor = store.getMovesByHash(L(s.data), r1.movesHash!)!;
    expect(floor.reader).toBeNull();
    expect(floor.units.map((u) => [u.applicability, u.by, u.trigger.status])).toEqual([['UNKNOWN', 'floor', 'none'], ['UNKNOWN', 'floor', 'none']]);
    expect(skillMd(s.proj)).not.toContain('What my moves');
    // now the script answers the moves: the floor profile is read again, not kept
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_persona_moves: MOVES, emit_holds_back: { ids: [] } } }) });
    const again = s.run('build', '--name', 'code-review', '--report', ...BACKEND());
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/· moves ✓ \(2 moves: 1 general, 1 conditional, 0 unknown\) ·/);
    const r2 = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!;
    expect(r2.movesHash).not.toBe(r1.movesHash);
    expect(store.getMovesByHash(L(s.data), r1.movesHash!)!.hash).toBe(floor.hash);
    expect(store.getMoves(L(s.data), personaHashOf(PERSONA.points as PersonaPoint[]))!.hash).toBe(r2.movesHash);
    // and with no model at all, the model's profile is kept, never replaced by a floor
    const third = s.run('build', '--name', 'code-review', '--report');
    expect(third.code, third.out).toBe(0);
    expect(store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!.movesHash).toBe(r2.movesHash);
  }, 300_000);

  it('7. two goldens: no persona and no moves, each said; the standard is minted all the same', () => {
    const s = seed(2);
    const r = s.run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/· persona — [^·]*· moves — no persona ·/);
    const receipt = store.getReceipt(L(s.data), activeOf(s.data).skillVersionHash)!;
    expect(receipt.movesHash).toBeNull();
    expect(receipt.stages.find((x) => x.id === 'moves')).toMatchObject({ ran: false, why: 'no persona' });
  }, 300_000);
});
