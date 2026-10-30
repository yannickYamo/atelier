// tests/atelier-review-subject-e2e.test.ts — A TEXT UNDER REVIEW IS NOT NOTES TO WRITE FROM, THROUGH THE BINARY.
//
// A review quotes what it reviews: its title, its section names, its paths. When the request's own words name the
// supplied text as what the work is about ("review this design proposal"), the material is not served as points, the
// writer is not told to avoid its wording, and quoting it is no copied stretch. When the request names no subject, a
// text of finished sentences is still points, as before. The intent reading is scripted; the expected values are the
// fixture's own strings, written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const DOC = 'Scheduler queue isolation for batch workloads. The controller moves every batch job into its own queue before admission. Section 3 changes pkg/scheduler/queue/admission.go so that a full queue rejects new jobs at once.';
// the review quotes the document's title and its path, nine words and more in a row
const REVIEW = '- Section 3, pkg/scheduler/queue/admission.go: "Scheduler queue isolation for batch workloads" says nothing of how a full queue reports the rejection; the controller moves every batch job into its own queue before admission, so say what a rejected job sees.';
const REQUEST = 'Review this design proposal the way this project\'s reviewers do. List each finding on its own line, starting with "- ".';
// no shape of its own: a request that states its form never gets a plan, so it could not show the plan is skipped
const PLAIN_REVIEW = 'Review this design proposal the way this project\'s reviewers do.';
const NOTES_REQUEST = 'Write a short post for the team about the scheduler change.';
const intent = (subject: string | null) => ({ format: null, shape: null, length: null, document: null, deliver: [], unknowns: [], act_on: null, irreversible: null, subject });

describe('the text under review, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-rs-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-rs-proj-'));
    const doc = join(proj, 'proposal.md'); writeFileSync(doc, DOC);
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CONTEXT_READER: 'scripted', ATELIER_CLAIMS: 'model' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): string => {
      try { return execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (e) { const x = e as { stdout: string }; return x.stdout; }
    };
    run('add', '--statement', 'Name the section a finding is about.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'review');
    return { data, run, be: ['--with', `draft=${doc}`, '--no-plan', '--no-questions', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'] };
  };
  // a plan that would serve one point in place of the document, in the writer's own words
  const PLAN = { angle: 'Say what a rejected job sees.', pain: null, turn: null, answer: 'Name the rejection a full queue gives.', points: [{ point: 'full queues reject at once', from: 'a full queue rejects new jobs at once' }], image: null, close: null, left_out: [] };
  const script = (subject: string | null) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${REVIEW}</work>` }, emit_intent: intent(subject), emit_plan: PLAN, emit_questions: { decisions: [] } } }) });
  const writerPrompt = async (): Promise<string> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies.filter((b) => b.includes('emit_piece')).pop() ?? '';
  const parse = (out: string): Record<string, unknown> => JSON.parse(out.slice(out.indexOf('{'))) as Record<string, unknown>;

  it('a request naming the supplied text as what it reviews: no points line, no note to avoid its wording, quoting it is no copy', async () => {
    await script('this design proposal');
    const { data, run, be } = setup();
    const j = parse(run('invoke', '--skill', 'review', REQUEST, '--json', ...be));
    const report = (j.report as string[]).join('\n');
    expect(report).not.toContain('Your material holds finished sentences');
    expect(report).toContain('The material is the text this request works on (this design proposal)');
    expect(j.copied ?? null).toBeNull();
    expect(String(j.output)).toContain('Scheduler queue isolation for batch workloads');
    const writer = await writerPrompt();
    expect(writer).toContain('Scheduler queue isolation for batch workloads');
    expect(writer).not.toContain('Do not reuse its sentences');
    // the record says why no copying was checked
    const [rec] = store.listInvocations({ root: data, skillName: 'review' });
    expect(rec.worksOn).toBe('this design proposal');
    expect(rec.copied).toBeUndefined();
  }, 120_000);

  it('with the plan on (the default): no plan is made, and the whole document reaches the writer, not a plan\'s points', async () => {
    await script('this design proposal');
    const { run, be } = setup();
    const j = parse(run('invoke', '--skill', 'review', PLAIN_REVIEW, '--json', ...be.filter((a) => a !== '--no-plan')));
    const report = (j.report as string[]).join('\n');
    expect(report).toContain('No plan: the request works on the text it supplies, which is served whole.');
    expect(j.plan ?? null).toBeNull();
    const writer = await writerPrompt();
    expect(writer).toContain('Section 3 changes pkg/scheduler/queue/admission.go so that a full queue rejects new jobs at once.');
    expect(writer).not.toContain('These points are the material for this piece');
    expect(writer).not.toContain('Say what a rejected job sees.');
  }, 120_000);

  it('a subject the request does not hold is no subject: the material is still points', async () => {
    await script('the attached RFC');
    const { run, be } = setup();
    const j = parse(run('invoke', '--skill', 'review', NOTES_REQUEST, '--json', ...be));
    expect((j.report as string[]).join('\n')).toContain('Your material holds finished sentences');
    expect(j.copied).toBeTruthy();
  }, 120_000);

  // the person's standing notes for this skill, written as sentences; the review below copies ten of its words
  const NOTES = 'The team agreed last quarter that every batch job should get its own queue before admission is decided. Nothing else about the scheduler was settled in that meeting by anyone.';
  const REVIEW_WITH_NOTES = `${REVIEW}\n- The team agreed last quarter that every batch job should get its own queue, so say so.`;
  // a review that keeps every sentence of the document nearly as written, then a finding
  const REVIEW_QUOTING_ALL = `- "${DOC}" Name the rejection a full queue gives.`;

  it('the default run (questions on): the record says why there is no plan, and --json carries worksOn', async () => {
    await script('this design proposal');
    const { data, run, be } = setup();
    const j = parse(run('invoke', '--skill', 'review', PLAIN_REVIEW, '--json', ...be.filter((a) => a !== '--no-plan' && a !== '--no-questions')));
    expect(j.worksOn).toBe('this design proposal');
    const [rec] = store.listInvocations({ root: data, skillName: 'review' });
    expect(rec.prewrite?.noPlan).toBe('no plan: the request works on the text it supplies');
    expect(rec.prewrite?.planBy).toBe('off');
  }, 120_000);

  it('standing notes beside the text under review are still notes: served as points and checked for copying, the text whole', async () => {
    await script('this design proposal');
    const { data, run, be } = setup();
    const notes = join(data, 'team-notes.md'); writeFileSync(notes, NOTES);
    run('material', '--skill', 'review', notes);
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${REVIEW_WITH_NOTES}</work>` }, emit_intent: intent('this design proposal'), emit_questions: { decisions: [] } } }) });
    const j = parse(run('invoke', '--skill', 'review', REQUEST, '--json', ...be));
    const report = (j.report as string[]).join('\n');
    expect(report).toContain('The material is the text this request works on (this design proposal)');
    expect(report).toContain('finished sentences');
    expect(j.worksOn).toBe('this design proposal');
    // the ten words copied from the notes are on the record; the document's own words are not
    const copied = j.copied as { shown: string[] } | undefined;
    expect(copied).toBeTruthy();
    expect(copied!.shown.join(' ')).toContain('every batch job should get its own queue');
    expect(copied!.shown.join(' ')).not.toContain('controller moves every batch job');
    const writer = await writerPrompt();
    expect(writer).toContain('Section 3 changes pkg/scheduler/queue/admission.go so that a full queue rejects new jobs at once.');
    expect(writer).toContain('team notes');
    const [rec] = store.listInvocations({ root: data, skillName: 'review' });
    expect(rec.worksOn).toBe('this design proposal');
  }, 120_000);

  it('standing notes alone, with nothing bound for the run: a subject read names no text of the run, so the notes stay points', async () => {
    await script('this design proposal');
    const { run, be } = setup();
    const proj = mkdtempSync(join(tmpdir(), 'atelier-rs-notes-')); const notes = join(proj, 'team-notes.md'); writeFileSync(notes, NOTES);
    run('material', '--skill', 'review', notes);
    const j = parse(run('invoke', '--skill', 'review', REQUEST, '--json', ...be.filter((a, i, all) => a !== '--with' && all[i - 1] !== '--with')));
    expect((j.report as string[]).join('\n')).toContain('Your material holds finished sentences');
    expect(j.worksOn ?? null).toBeNull();
  }, 120_000);

  it('the subject may be the bound file by its name, or "it" where one file is bound', async () => {
    await script('draft');
    const { run, be } = setup();
    const byName = parse(run('invoke', '--skill', 'review', 'Review it the way this project\'s reviewers do.', '--json', ...be));
    expect(byName.worksOn).toBe('draft');
    expect(byName.copied ?? null).toBeNull();
    await script('it');
    const byIt = parse(run('invoke', '--skill', 'review', 'Review it the way this project\'s reviewers do.', '--json', ...be));
    expect(byIt.worksOn).toBe('it');
  }, 120_000);

  it('two files bound: the reading names the one under review; the other is notes, served as points and checked for copying', async () => {
    const { run, be } = setup();
    const proj = mkdtempSync(join(tmpdir(), 'atelier-rs-two-')); const notes = join(proj, 'team-notes.md'); writeFileSync(notes, NOTES);
    const both = [...be, '--with', `team-notes=${notes}`];
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${REVIEW_WITH_NOTES}</work>` }, emit_intent: intent('draft'), emit_questions: { decisions: [] } } }) });
    const named = parse(run('invoke', '--skill', 'review', REQUEST, '--json', ...both));
    expect(named.worksOn).toBe('draft');
    const copied = named.copied as { shown: string[] } | undefined;
    expect(copied).toBeTruthy();
    expect(copied!.shown.join(' ')).toContain('every batch job should get its own queue');
    expect(copied!.shown.join(' ')).not.toContain('controller moves every batch job');
    const served = await writerPrompt();
    expect(served).toContain('is notes to write from, not text to copy');
    expect(served).toMatch(/Of the material above, \\"team-notes\\" is notes/);
    // the request's words name neither file: with two bound, no subject, and both are notes
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${REVIEW_WITH_NOTES}</work>` }, emit_intent: intent('this design proposal'), emit_questions: { decisions: [] } } }) });
    const words = parse(run('invoke', '--skill', 'review', REQUEST, '--json', ...both));
    expect(words.worksOn ?? null).toBeNull();
    expect((words.copied as { shown: string[] }).shown.join(' ')).toContain('controller moves every batch job');
  }, 120_000);

  it('a review that quotes the text it works on is no restyle of it', async () => {
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${REVIEW_QUOTING_ALL}</work>` }, emit_intent: intent('this design proposal'), emit_questions: { decisions: [] } } }) });
    const { run, be } = setup();
    const j = parse(run('invoke', '--skill', 'review', REQUEST, '--json', ...be));
    expect(j.worksOn).toBe('this design proposal');
    expect((j.report as string[]).join('\n')).not.toContain('Restyle of');
  }, 120_000);

  it('a request naming no subject: finished sentences are still points, as before', async () => {
    await script(null);
    const { run, be } = setup();
    const j = parse(run('invoke', '--skill', 'review', NOTES_REQUEST, '--json', ...be));
    const report = (j.report as string[]).join('\n');
    expect(report).toContain('Your material holds finished sentences');
    expect(j.copied).toBeTruthy();
    expect(await writerPrompt()).toContain('Do not reuse its sentences');
  }, 120_000);
});
