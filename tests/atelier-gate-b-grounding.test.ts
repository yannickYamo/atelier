// VALID METHOD TERMINOLOGY SURVIVES; A GOLDEN'S OWN TOPIC DOES NOT TRAVEL. The carry-over signal reads every term of the
// served examples as the examples' own; the owner's method is not an example. A method about scanned imports names the
// OCR pass, so a reply that names it states approved terminology, not a borrowed fact, whatever the goldens say. The
// same reply from a skill with no method, where only the goldens name OCR, is the borrowed case and is rewritten.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const setBackend = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });

const RA = 'run the import once more'; const RB = 'That is all it needs.';
const golden = (n: number): string => `---\nrequest: The PDF import stalls at ${n}0% on a scanned file. What do I do?\n---\nThat stall is the OCR pass on the scanned PDF: it reads every page before the import can move. ${'The bigger the scan, the longer that pass takes. '.repeat(n - 1)}Leave it for a minute, then ${RA} from the same screen; the second pass skips what it has read. ${RB}\n`;
const METHOD = 'How I answer importer questions\n\n1. Name the cause first: a stall on a scan is the OCR pass reading every page.\n2. Then the one thing to do.\n3. End on a short plain line.\n';
const PERSONA = { points: [{ aspect: 'open', description: 'Names the cause before the fix.', frequency: 'ALWAYS', quote: RA }, { aspect: 'close', description: 'Closes on a short plain line.', frequency: 'OFTEN', quote: RB }] };
const REPLY_FORM = { examples: [1, 2, 3].map((n) => ({ example: n, form: 'REPLY', quote: RA })), form: 'REPLY' };
const SCOPE = { examples: [1, 2, 3].map((n) => ({ example: n, asked: 'NEITHER', kind: 'how-to', beyond: [] })) };
const REPLY = 'That stall is the OCR pass reading every page of the scan before the import can move. Leave it for a minute, then run the import once more from the same screen. That is all it needs.';
const REWRITES = { rewrites: [{ id: 1, text: 'That stall is the first pass reading every page of the scan before the import can move.' }] };

interface Seed { data: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (files: Readonly<Record<string, string>>): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gb-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gb-proj-'));
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(proj, name, '..'), { recursive: true }); writeFileSync(join(proj, name), text); }
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, run };
};
const jsonOf = (out: string): { output: string | null; invocationId: string } => JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { output: string | null; invocationId: string };
const goldens = { 'examples/r1.md': golden(1), 'examples/r2.md': golden(2), 'examples/r3.md': golden(3) };

describe('the OCR pass: approved terminology when the method names it, a borrowed fact when only the goldens do', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await setBackend({ byTool: { emit_persona: PERSONA, emit_scope: SCOPE, emit_holds_back: { ids: [] }, emit_piece: { piece: REPLY }, emit_rewrites: REWRITES },
      when: [{ contains: 'The work is described as', answer: REPLY_FORM }] });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('with the method naming the OCR pass, the reply keeps it and nothing is grounded', () => {
    const { data, run } = seed({ ...goldens, 'method.md': METHOD });
    const built = run('new', 'examples', '--method', 'method.md', '--name', 'support', '--yes', ...BACKEND());
    expect(built.code, built.out).toBe(0);
    const r = run('invoke', '--skill', 'support', 'The import stalls on a scan. Why?', '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const j = jsonOf(r.out);
    expect(j.output).toContain('OCR pass');
    const rec = store.listInvocations({ root: data, skillName: 'support' }).find((i) => i.invocationId === j.invocationId);
    expect(JSON.stringify(rec)).not.toMatch(/Grounded: /);
  }, 180_000);

  it('with no method, only the goldens name OCR: the same reply is grounded and the term rewritten out', () => {
    const { data, run } = seed(goldens);
    const built = run('new', 'examples', 'answer support questions about the importer', '--name', 'support', ...BACKEND());
    expect(built.code, built.out).toBe(0);
    const r = run('invoke', '--skill', 'support', 'The import stalls on a scan. Why?', '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const j = jsonOf(r.out);
    expect(j.output).not.toMatch(/OCR/);
    expect(j.output).toContain('first pass reading every page');
    const rec = store.listInvocations({ root: data, skillName: 'support' }).find((i) => i.invocationId === j.invocationId);
    expect(JSON.stringify(rec)).toMatch(/Grounded: 1 sentence/);
  }, 180_000);
});
