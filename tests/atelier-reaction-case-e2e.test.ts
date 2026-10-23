// tests/atelier-reaction-case-e2e.test.ts — THE CASE-SHAPED FIXTURE, BUILT AND RUN THROUGH THE BINARY (round 4).
//
// An invented author (one essay, four short posts on X), ten invented points, four owner rules, and a reaction-post request
// with no stated angle. Against the scripted backend, with the scripted model as every small reader, each answering the
// way its reading now asks. Expected values are the fixture's own strings, written out by hand.
//   item 2: the pieces answer nobody in particular, so the skill builds as documents with no flag, and the questions and
//           the plan run;
//   item 3: the angle is asked where nothing given states it, and not where the request states it;
//   item 4: with a plan, the writer is served the plan's points in the plan's words, never the raw notes or what the plan
//           left out (a scripted writer that writes from what it is served: points used and copied runs read as the
//           benchmark reads them, bench/voice-benchmark/audit.mjs);
//   item 6: a run with no plan says why on the record.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { sharedRuns } from '../core/observers/copied-runs.js';
import { wordsOf } from '../core/observers/text.js';

const CLI = resolve('dist/cli/atelier.mjs');
const FX = resolve('tests/fixtures/reaction-case');
const DRAFT = readFileSync(join(FX, 'draft-with-tells.md'), 'utf8').replace(/—/g, ',');
const REQUEST = 'Write a long post on X reacting to this week\'s news about the wharf, about 450 to 700 words.';
const NONE_FORM = { examples: [1, 2, 3, 4, 5].map((n) => ({ example: n, answers: 'NONE', quote: null })), form: 'NONE' };
const ANGLE = { kind: 'ANGLE', status: 'INFERABLE', spread: 'SOME', settledBy: 'material', what: 'why the vote matters now', ask: 'Why does the wharf vote matter to you now?',
  options: ['The growers lose their wharf', 'The lanes fill with lorries', 'Nobody asked the growers'], default: 'The growers lose their wharf' };

const NOTES = readFileSync(join(FX, 'points.md'), 'utf8');
const POINTS = NOTES.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
/** A point carried: any 5 consecutive words of it in the text (the benchmark's own reading). */
const carried = (text: string): number => POINTS.filter((p) => { const w = wordsOf(p).map((x) => x.toLowerCase()); const t = ` ${wordsOf(text).map((x) => x.toLowerCase()).join(' ')} `;
  return Array.from({ length: Math.max(1, w.length - 4) }, (_, i) => w.slice(i, i + 5).join(' ')).some((g) => t.includes(` ${g} `)); }).length;
const PLAN = { angle: 'Nobody asked the growers before the wharf vote.', pain: 'Sixty lorries a season through the lanes.', turn: 'A ramp upstream keeps the barges.', answer: 'Give the co-op one season to build it.',
  points: [{ point: 'a vote taken without a word to the growers', from: 'The wharf closure was decided without a consultation with the growers.' },
    { point: 'an upstream wharf that only needs a ramp', from: 'There is a second wharf 400 metres upstream that could take the barges with a small loading ramp.' },
    { point: 'the meeting where the growers decide', from: 'The growers meet on the first Thursday of next month to decide what to do.' }],
  image: null, close: 'Come to the meeting.', left_out: [{ what: 'The co-op\'s electric tug runs on panels', why: 'not this argument' }] };

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
  it('item 4: with a plan the writer is served its points, not the notes: points used at most 4 of 10, fewer copied runs', async () => {
    await set({ emit_questions: { decisions: [] }, emit_plan: PLAN, emit_piece: { servedPiece: true } });
    const { invoke } = setup();
    const j = invoke(REQUEST, '--no-questions');
    const out = String(j.output);
    expect(carried(out)).toBeLessThanOrEqual(4);
    expect(sharedRuns(out, NOTES, 5)).toHaveLength(0);
    const writer = ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.filter((b) => b.includes('emit_piece')).pop() ?? '';
    expect(writer).toContain('Point 2: an upstream wharf that only needs a ramp');
    expect(writer).not.toContain('<material name=');
    expect(writer).not.toContain('Left out');
    // without a plan the same writer is served the notes, and carries all ten
    await set({ emit_questions: { decisions: [] }, emit_piece: { servedPiece: true } });
    const raw = String(setup().invoke(REQUEST, '--no-questions', '--no-plan').output);
    expect(carried(raw)).toBe(10);
    expect(sharedRuns(raw, NOTES, 5).length).toBeGreaterThan(0);
  });
  it('item 6: a run with no plan says why on the record', async () => {
    // a plan whose points trace to nothing in the notes is no plan
    await set({ emit_questions: { decisions: [] }, emit_plan: { ...PLAN, points: [{ point: 'a ferry to the islands', from: 'The ferry leaves the pier at eleven every night.' }] } });
    const { data, invoke } = setup();
    invoke(REQUEST, '--no-questions');
    invoke(REQUEST, '--no-questions', '--no-plan');
    const recs = store.listInvocations({ root: data, skillName: 'post-voice' });
    expect(recs.map((r) => r.prewrite?.noPlan).sort()).toEqual(['no plan: --no-plan was given', 'no plan: the reading could not be grounded in the material']);
    // and `atelier report <run>` says it where the plan would be
    const shown = execFileSync('node', [CLI, 'report', recs[0].invocationId, '--skill', 'post-voice'], { encoding: 'utf8', env: { ...process.env, ATELIER_DATA: data } });
    expect(shown).toContain(recs[0].prewrite?.noPlan ?? 'x');
  });
});
