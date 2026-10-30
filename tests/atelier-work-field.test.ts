// tests/atelier-work-field.test.ts — ONLY THE WORK FIELD IS DELIVERED; WHAT THE WRITER SAYS AROUND IT IS SET ASIDE.
//
// The defect: a writer opened its reply with lines about the task ("Here is a post built on the brief's points.")
// and they were delivered as the piece's first paragraph, and checked as part of it. The writer is now asked to put the
// piece inside `<work>…</work>`; only the inside is delivered and checked, and what stood outside is kept on the record.
// A reply with no field is taken whole, as before, and the record says the field was missing.
//
// Metric (plan round 1, item 1): outputs opening with reasoning about the task = 0. Expected values below are the
// fixture's own strings, written out by hand, never read back from the code.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { workField, workRecord, WORK_FIELD_ASK } from '../core/loop/work-field.js';
import { spendOneWithResult } from '../core/loop/run-once.js';
import type { InferenceClient } from '../core/inference/client.js';
import * as store from '../core/state/store.js';

const ABOUT = 'Here is a post built on the three points of the brief, opening on the harbour news.';
const PIECE = 'The harbour reopened on Tuesday.\n\nI walked the north quay before the ferries ran and counted the gulls instead of the boats.';

describe('the field, read by its two tags', () => {
  it('the inside is the work, trimmed; the lines before and after it are outside', () => {
    const f = workField(`${ABOUT}\n\n<work>\n${PIECE}\n</work>\n\nTell me if you want it shorter.`);
    expect(f).toEqual({ text: PIECE, delimited: true, outside: `${ABOUT}\n\nTell me if you want it shorter.` });
  });
  it('no field: the whole reply is the work, unchanged, and it is said to be undelimited', () => {
    const reply = `${ABOUT}\n\n${PIECE}`;
    expect(workField(reply)).toEqual({ text: reply, delimited: false, outside: '' });
    expect(workRecord(workField(reply))).toEqual({ delimited: false });
  });
  it('an empty field, or an opening tag never closed, is no field: the reply is taken whole without the stray tag', () => {
    expect(workField('<work></work> The harbour reopened.')).toEqual({ text: 'The harbour reopened.', delimited: false, outside: '' });
    expect(workField('<work>The harbour reopened.')).toEqual({ text: 'The harbour reopened.', delimited: false, outside: '' });
  });
  it('a piece that quotes the tag word in prose is not split: only the first opening and the last closing tag count', () => {
    const f = workField('<work>Write <work> on the jar.</work>');
    expect(f).toEqual({ text: 'Write <work> on the jar.', delimited: true, outside: '' });
  });
});

describe('the writer is asked for the field, and only the field comes back as the piece', () => {
  const fake = (piece: string, seen: string[]): InferenceClient => ({
    complete: async (req: { userMessage: string }) => { seen.push(req.userMessage); return { json: { piece }, text: '', cost: 0, modelId: 'fake', inputTokens: 1, outputTokens: 1 }; },
  }) as unknown as InferenceClient;
  it('the request asks for it, the piece is the inside, and the outside is on the record', async () => {
    const seen: string[] = [];
    const w = await spendOneWithResult(fake(`${ABOUT}\n<work>${PIECE}</work>`, seen), { spentUsd: 0, capUsd: 5 }, 'the skill', 'write the post');
    expect(seen[0]).toContain(WORK_FIELD_ASK);
    expect(w.piece).toBe(PIECE);
    expect(w.work).toEqual({ delimited: true, outside: ABOUT });
  });
  it('a contract-shaped output is not read for a field', async () => {
    const seen: string[] = [];
    const w = await spendOneWithResult(fake('x', seen), { spentUsd: 0, capUsd: 5 }, 'the skill', 'fill it', { schema: { type: 'object' }, artifact: 'contracts/output.schema.json' });
    expect(w.work).toBeNull();
    expect(seen[0]).not.toContain(WORK_FIELD_ASK);
  });
});

describe('through the binary: the delivered work and its record', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-wf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-wf-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
    run('add', '--statement', 'Open on the news.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'quay');
    return { data, run, be: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern'] };
  };
  const script = (piece: string) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece } } }) });
  it('the lines about the task are neither printed nor delivered; the record keeps them apart', async () => {
    await script(`${ABOUT}\n\n<work>${PIECE}</work>`);
    const { data, run, be } = setup();
    const out = run('invoke', '--skill', 'quay', 'write the post', ...be);
    expect(out).toContain('I walked the north quay');
    expect(out).not.toContain('Here is a post built on');
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.output.trim()).toBe(PIECE);
    expect(rec.work).toEqual({ delimited: true, outside: ABOUT });
  });
  it('--json carries the record\'s field, so a harness can read what was set aside', async () => {
    await script(`${ABOUT}\n\n<work>${PIECE}</work>`);
    const { run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'write the post', '--json', ...be)) as { work?: unknown; output: string };
    expect(j.work).toEqual({ delimited: true, outside: ABOUT });
    expect(j.output.trim()).toBe(PIECE);
  });
  it('with no field the reply is delivered whole, as before, and the record says the field was missing', async () => {
    await script(PIECE);
    const { data, run, be } = setup();
    run('invoke', '--skill', 'quay', 'write the post', ...be);
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.output.trim()).toBe(PIECE);
    expect(rec.work).toEqual({ delimited: false });
  });
});
