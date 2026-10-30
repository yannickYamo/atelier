// tests/atelier-prewrite-e2e.test.ts — THE QUESTIONS, THE PLAN AND THE COPIED-STRETCH CHECK, THROUGH THE BINARY (plan items 6-8).
//
// Every path wired to a command a person or a host runs: `atelier invoke --json` returns the questions as structured
// choices and the plan, writes with the defaults and says so; `--answers` answers them on the next call and is remembered;
// the plan reaches the writer and never the delivered work; material written as sentences is said once, and every copied
// stretch is on the record; `atelier report <run>` shows what was settled before the draft. Against the scripted backend,
// with the scripted model as the small reader. Expected values are the fixture's own strings, written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTES = 'The new terminal opens in March and doubles the number of berths. Ferries to the islands will leave every hour from the first week.';
const PIECE = 'March brings the new terminal and twice the berths. I will take the first hourly ferry to the islands.';
const QUESTIONS = { decisions: [{ kind: 'ANGLE', status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', what: 'why it matters now', ask: 'Why does the terminal matter to you now?',
  options: ['My daily crossing', 'The island shops', 'The old pier'], default: 'My daily crossing' }] };
const PLAN = { angle: 'The terminal gives the islands back their hour.', pain: 'Waiting half a day for a boat.', turn: 'Hourly ferries change the trip.', answer: 'Go and use it.',
  points: [{ point: 'hourly island ferries', from: 'Ferries to the islands will leave every hour' }], image: null, close: 'See you on the first boat.', left_out: [] };

describe('before the draft, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-pw-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-pw-proj-'));
    const notes = join(proj, 'notes.md'); writeFileSync(notes, NOTES);
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CONTEXT_READER: 'scripted' };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    run('add', '--statement', 'Open on the news.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'quay');
    return { data, run, be: ['--with', `notes=${notes}`, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern'] };
  };
  const script = () => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${PIECE}</work>` }, emit_questions: QUESTIONS, emit_plan: PLAN } }) });
  const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;

  it('--json: the questions as choices, written with the default; the plan returned and served, never delivered; the copying read', async () => {
    await script();
    const { data, run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, unknown>;
    expect(j.questions).toEqual([{ id: 'angle', ask: 'Why does the terminal matter to you now?', options: ['My daily crossing', 'The island shops', 'The old pier'], default: 'My daily crossing' }]);
    expect(j.answers).toEqual([{ id: 'angle', answer: 'My daily crossing', by: 'default' }]);
    expect((j.plan as { angle: string }).angle).toBe('The terminal gives the islands back their hour.');
    expect(String(j.output)).not.toContain('The terminal gives the islands back their hour.');
    expect(j.copied).toEqual({ runs: 0, longest: 0, shown: [], repairAt: 8 });
    const report = (j.report as string[]).join('\n');
    expect(report).toContain('Your material holds finished sentences');
    expect(report).toContain('--answers "angle=<letter or your words>"');
    // the writer was told the answer and the plan, after the skill
    const writer = (await log()).filter((b) => b.includes('emit_piece')).pop() ?? '';
    expect(writer).toContain('The terminal gives the islands back their hour.');
    expect(writer).toContain('My daily crossing');
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.prewrite?.plan?.angle).toBe('The terminal gives the islands back their hour.');
    // `atelier report <run>` shows what was settled before the draft
    const shown = run('report', rec.invocationId, '--skill', 'quay');
    expect(shown).toContain('before the draft');
    expect(shown).toContain('plan · Angle: The terminal gives the islands back their hour.');
    // THE SERVED CHECK (core/eval/stages.ts): the record says the plan and the answers were in the bytes the writer got,
    // read off the composer's own markers, not off the flags; `report --stages` reads the run stage by stage.
    expect(rec.served?.blocks.plan).toBe(true);
    expect(rec.served?.blocks.assumed).toBe(true);
    expect(rec.served?.blocks.forThisRequest).toBe(true);
    const stages = run('report', rec.invocationId, '--skill', 'quay', '--stages');
    expect(stages).toContain('plan       model');
    expect(stages).toContain('points=1');
    expect(stages).toContain('block.plan=true');
  });
  it('--answers answers the question on the next call, and the skill remembers it', async () => {
    await script();
    const { data, run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', '--answers', 'angle=b', ...be)) as Record<string, unknown>;
    expect(j.answers).toEqual([{ id: 'angle', answer: 'The island shops', by: 'person' }]);
    expect(store.getTold({ root: data, skillName: 'quay' }).map((t) => t.answer)).toEqual(['The island shops']);
  });
  it('a plan line the writer printed into the work is dropped and said; an answer holding commas and an id no question carries', async () => {
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>Angle: ${PLAN.angle}\n\n${PIECE}</work>` }, emit_questions: QUESTIONS, emit_plan: PLAN } }) });
    const { run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', '--answers', 'angle=the shops, not the pier,tone=dry', ...be)) as Record<string, unknown>;
    expect(String(j.output)).not.toContain('Angle:');
    expect(j.answers).toEqual([{ id: 'angle', answer: 'the shops, not the pier', by: 'person' }]);
    const report = (j.report as string[]).join('\n');
    expect(report).toContain('Removed from the work: 1 line(s) of the plan the writer printed into it');
    expect(report).toContain('tone matched no question; ignored.');
  });
  it('--no-questions --no-plan: nothing is read before the draft', async () => {
    await script();
    const { data, run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', '--no-questions', '--no-plan', ...be)) as Record<string, unknown>;
    expect([j.questions, j.plan]).toEqual([[], null]);
    // and the bytes agree: no plan note and no answers in what the writer was served; the stage ledger says off
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.served?.blocks.plan).toBe(false);
    expect(rec.served?.blocks.answers).toBe(false);
    expect(rec.served?.blocks.assumed).toBe(false);
    const stages = run('report', rec.invocationId, '--skill', 'quay', '--stages');
    expect(stages).toContain('plan       off');
    expect(stages).toContain('block.plan=false');
  });
});
