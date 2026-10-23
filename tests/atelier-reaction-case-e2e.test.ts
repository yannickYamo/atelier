// tests/atelier-reaction-case-e2e.test.ts — THE CASE-SHAPED FIXTURE, BUILT AND RUN THROUGH THE BINARY (round 4).
//
// An invented author (one essay, four short posts on X), ten invented points, four owner rules, and a reaction-post request
// with no stated angle. Against the scripted backend, with the scripted model as every small reader, each answering the
// way its reading now asks. Expected values are the fixture's own strings, written out by hand.
//   item 2: the pieces answer nobody in particular, so the skill builds as documents with no flag, and the questions and
//           the plan run;
//   item 3: the angle is asked where nothing given states it, and not where the request states it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const FX = resolve('tests/fixtures/reaction-case');
const DRAFT = readFileSync(join(FX, 'draft-with-tells.md'), 'utf8').replace(/—/g, ',');
const REQUEST = 'Write a long post on X reacting to this week\'s news about the wharf, about 450 to 700 words.';
const NONE_FORM = { examples: [1, 2, 3, 4, 5].map((n) => ({ example: n, answers: 'NONE', quote: null })), form: 'NONE' };
const ANGLE = { kind: 'ANGLE', status: 'INFERABLE', spread: 'SOME', settledBy: 'material', what: 'why the vote matters now', ask: 'Why does the wharf vote matter to you now?',
  options: ['The growers lose their wharf', 'The lanes fill with lorries', 'Nobody asked the growers'], default: 'The growers lose their wharf' };

describe('the case-shaped fixture, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const set = (byTool: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_work_form: NONE_FORM, emit_piece: { piece: `<work>${DRAFT}</work>` }, emit_draft: { text: DRAFT }, ...byTool } }) });
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-rc-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-rc-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ATELIER_CONTEXT_READER: 'scripted' };
    const be = ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
    const cli = (...a: string[]): string => { try { return execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e as { stdout?: string }).stdout ?? ''; } };
    const build = cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--yes', ...be);
    const invoke = (request: string, ...more: string[]): Record<string, unknown> => {
      const out = cli('invoke', '--skill', 'post-voice', request, '--with', `notes=${join(FX, 'points.md')}`, '--json', '--claims', 'pattern', ...more, ...be);
      return JSON.parse(out.slice(out.indexOf('{'))) as Record<string, unknown>;
    };
    return { data, build, invoke };
  };

  it('item 2: builds as documents with no flag; item 3: the unstated angle is asked', async () => {
    await set({ emit_questions: { decisions: [{ ...ANGLE, statedIn: 'NONE', quote: null }] } });
    const { data, build, invoke } = setup();
    expect(build).toContain('Work form: documents');
    expect(store.getWorkForm({ root: data, skillName: 'post-voice' })).toBe('DOCUMENT');
    const j = invoke(REQUEST);
    expect((j.questions as { id: string }[]).map((q) => q.id)).toEqual(['angle']);
  });
  it('item 3: the request states the angle, and nothing is asked', async () => {
    const stated = 'Write a long post on X arguing that the council should give the co-op one season to build the ramp, about 450 to 700 words.';
    await set({ emit_questions: { decisions: [{ ...ANGLE, status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', statedIn: 'request', quote: 'give the co-op one season to build the ramp' }] } });
    const { invoke } = setup();
    expect(invoke(stated).questions).toEqual([]);
  });
});
