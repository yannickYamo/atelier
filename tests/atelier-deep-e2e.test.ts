// tests/atelier-deep-e2e.test.ts — A DEEP RUN THROUGH THE BINARY, EVERY STEP, AND A PLAIN RUN UNCHANGED BY IT.
//
// `atelier run --deep` against the scripted backend, with the scripted model as the small reader: the library is read, the
// web pass says why it did not run (no search on this provider), the facts are listed with their sources, the questions
// come from the gaps as well as the decisions (at most three, every one logged), three directions are dealt and one is
// chosen, the writer is served the facts, the proof rule and the direction (never a card), the story checks send two
// spans to repair, the two drafts are compared by the reviewer, the reviewer's verdict 'fix' writes its fix where it stands,
// and the record says all of it while `output` stays the piece alone. Then a run without --deep: no deep reading is made,
// nothing of it is served or recorded. Expected values are the fixture's own strings, written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTES = 'The new terminal opens in March and doubles the number of berths. Ferries to the islands will leave every hour from the first week.';
const PIECE = [
  'Why does the first ferry still leave at dawn? The terminal that opens in March gives the quay twice its berths.',
  'From the first week a boat sails to the islands on every hour. The old pier closes once the new berths are open for good.',
  'Islanders have waited years for this change to their crossing. The shops on the quay expect more visitors through the spring.',
  'I will take the first hourly boat and write about the trip. The timetable is posted at the quay beside the ticket office.',
].join('\n\n');
const QUESTIONS = { decisions: [{ kind: 'ANGLE', status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', what: 'why it matters now', ask: 'Why does the terminal matter to you now?',
  options: ['My daily crossing', 'The island shops', 'The old pier'], default: 'My daily crossing' }] };
const PLAN = { angle: 'The terminal gives the islands back their hour.', pain: 'Waiting half a day for a boat.', turn: 'Hourly ferries change the trip.', answer: 'Go and use it.',
  points: [{ point: 'hourly island ferries', from: 'Ferries to the islands will leave every hour' }], image: null, close: 'See you on the first boat.', left_out: [] };
const FACTS = { facts: [
  { text: 'The new terminal opens in March.', quote: 'The new terminal opens in March', source: 'material', sourceRef: 'notes' },
  { text: 'A figure for how long the crossing takes now.', quote: '', source: 'sample', sourceRef: '' },
  { text: 'A figure invented for the islands.', quote: 'not in any source at all', source: 'material', sourceRef: 'notes' },
] };
const GAPS = { claims: [{ claim: 'Hourly ferries change island life.', answer: 'FACT', supportIn: 'NONE', quote: null, unlocks: 'the main claim carried by your own proof' }],
  reader: { statedIn: 'NONE', quote: null, spread: 'DIFFERENT', options: ['Islanders', 'Visitors'], default: 'Islanders' },
  stakes: { statedIn: 'NONE', quote: null, spread: 'DIFFERENT', options: ['Lost mornings', 'Lost trade'], default: 'Lost mornings' } };
const LOOPS = { loops: [{ question: 'why the ferry leaves at dawn', openQuote: 'Why does the first ferry still leave at dawn', closeQuote: null, kind: 'mystery' }], stakes: [], beats: [] };
const NOVELTY = { novel: [{ quote: 'The terminal that opens in March', kind: 'new' }], claims: [{ claimQuote: 'Islanders have waited years for this change', proofQuote: null }] };
const LOOP_FIX = 'The first ferry leaves at dawn because the tide is high then.';
const CLAIM_FIX = 'Islanders have asked for an hourly crossing at every council meeting.';
const REVIEW_FIX = 'The timetable hangs at the quay beside the ticket office, hour by hour.';
const VERDICT = { scores: ['one-idea', 'proof', 'reader-moves', 'specific', 'voice'].map((id) => ({ id, score: 6, why: 'sound, not yet sharp' })),
  caps: [], mainFailure: 'craft', missingFacts: [], keep: 'the opening question',
  fixes: [{ quote: 'The timetable is posted at the quay beside the ticket office.', instruction: 'Say what the timetable shows, hour by hour.', criterion: 'specific' }] };

describe('a deep run, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const setup = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-deep-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-deep-proj-'));
    const notes = join(proj, 'notes.md'); writeFileSync(notes, NOTES);
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CONTEXT_READER: 'scripted', ATELIER_LIBRARY: '' };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    run('add', '--statement', 'Open on the news.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'quay');
    return { data, run, be: ['--with', `notes=${notes}`, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern'] };
  };
  const set = (body: unknown) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  const script = () => set({
    byTool: { emit_piece: { piece: `<work>${PIECE}</work>` }, emit_questions: QUESTIONS, emit_plan: PLAN, emit_facts: FACTS, emit_gaps: GAPS,
      emit_choice: { choice: 'canon', reason: 'The notes give no single figure to build the piece on.' }, emit_loops: LOOPS, emit_novelty: NOVELTY,
      list_claims: { claims: [] }, review_draft: VERDICT, check_fixes: { fixes: [{ n: 1, score: 8 }], regressions: [] },
      choose_draft: { better: 'first', reasons: ['the first opens on the news'] } },
    when: [
      { containsAll: ['emit_fix', 'Close the loop before the piece ends'], answer: { reply: `<work>${LOOP_FIX}</work>` } },
      { containsAll: ['emit_fix', 'asks the reader to accept a claim'], answer: { reply: `<work>${CLAIM_FIX}</work>` } },
      { containsAll: ['emit_fix', 'Say what the timetable shows'], answer: { reply: `<work>${REVIEW_FIX}</work>` } },
    ] });
  const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
  const toolOf = (b: string): string => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name ?? '';

  it('run --deep: facts, questions from the gaps, a dealt direction, story repair, the reviewer\'s choice and fix, all on the record', async () => {
    await script();
    const { data, run, be } = setup();
    const seen = (await log()).length;
    const j = JSON.parse(run('run', '--skill', 'quay', 'Write a post on the new terminal.', '--deep', '--json', ...be)) as Record<string, unknown>;
    const deep = j.deep as Record<string, any>;
    // the library: the public core, no pack
    expect(deep.library.sources).toEqual(['core']);
    expect(deep.kind).toBe('blog');
    // the web pass: not run on this provider, and said why
    expect(deep.enrichment.off).toBe('the web pass runs on the Anthropic provider only');
    expect(deep.enrichment.urls).toEqual([]);
    // the facts: the one grounded in the notes, the sample marked; the one whose quote is in no source is dropped
    expect(deep.inventory.facts.map((f: { text: string; source: string }) => [f.source, f.text])).toEqual([
      ['material', 'The new terminal opens in March.'], ['sample', 'A figure for how long the crossing takes now.']]);
    expect([deep.inventory.sourced, deep.inventory.enriched, deep.inventory.sample]).toEqual([1, 0, 1]);
    // the questions: the angle from the decisions, then proof and reader from the gaps; stakes dropped beside the angle
    expect((j.questions as { id: string }[]).map((q) => q.id)).toEqual(['angle', 'proof', 'reader']);
    const logged = deep.questions as { kind: string; asked: boolean; why: string }[];
    expect(logged.filter((q) => q.asked).map((q) => q.kind)).toEqual(['ANGLE', 'PROOF', 'READER']);
    expect(logged.find((q) => q.kind === 'STAKES')?.why).toBe('the angle question already asks why it matters now');
    expect((j.report as string[]).join('\n')).toContain('Questions before writing (3): written with the defaults');
    // the direction: three dealt from the core's blog angles, the conventional way chosen by the reading, its seed the run id
    expect(deep.direction.dealt).toHaveLength(3);
    expect(deep.direction.choice).toBe('canon');
    expect(deep.direction.by).toBe('model');
    expect(deep.direction.seed).toBe(deep.runId);
    expect(deep.served).toEqual(['facts', 'proof rule', 'direction']);
    // the writer was served the facts, the proof rule and the direction, never a card; the reviewer read the cards
    const bodies = (await log()).slice(seen);
    const writer = bodies.filter((b) => toolOf(b) === 'emit_piece');
    expect(writer).toHaveLength(2);
    for (const w of writer) {
      expect(w).toContain('FACTS ONLY THIS SUBJECT HAS');
      expect(w).toContain('EVERY SPECIFIC FROM WHAT IS GIVEN');
      expect(w).toContain('Direction for this piece');
      expect(w).not.toContain('near miss');
      expect(w).not.toContain('blog-one-idea');
    }
    expect(bodies.find((b) => toolOf(b) === 'review_draft')).toContain('blog-one-idea');
    // the two drafts: the checks tie, the reviewer's two orders disagree, so the usual ranking chose
    expect(deep.choice).toMatchObject({ winner: 'tie', decidedBy: 'the ranking' });
    expect(bodies.filter((b) => toolOf(b) === 'choose_draft')).toHaveLength(2);
    // the story checks: the open loop and the unbacked claim, both spans written again and kept
    expect(deep.story.targets.map((t: { kind: string }) => t.kind).sort()).toEqual(['unclosed-loop', 'unproved-claim']);
    expect([deep.story.repaired, deep.story.kept]).toEqual([2, true]);
    // the review: its verdict word as given, its one fix written where it stood and kept
    expect(deep.review).toMatchObject({ verdict: 'fix', overall: 6, mainFailure: 'craft', action: 'fix', kept: true });
    expect(deep.review.applied).toEqual([{ before: 'The timetable is posted at the quay beside the ticket office.', after: REVIEW_FIX, instruction: 'Say what the timetable shows, hour by hour.' }]);
    // what was delivered: the piece alone, with every change in it, and nothing of the notes
    const output = String(j.output);
    expect(output).toContain(LOOP_FIX);
    expect(output).toContain(CLAIM_FIX);
    expect(output).toContain(REVIEW_FIX);
    expect(output).not.toContain('FACTS ONLY THIS SUBJECT HAS');
    expect(output).not.toContain('Direction for this piece');
    // the record on disk carries the same, and the direction's use is kept for the next deal
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.deep?.review?.verdict).toBe('fix');
    expect(rec.prewrite?.questionLog?.length).toBeGreaterThanOrEqual(4);
    const history = readFileSync(join(data, 'skills', 'quay', 'angle-history.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { angle: string; seed: string });
    expect(history).toEqual([expect.objectContaining({ angle: 'canon', seed: deep.runId })]);
    // the steps are on the run's ledger, under their own names
    const actions = (rec.repair?.controller?.decisions ?? []).map((d) => d.action);
    expect(actions).toEqual(expect.arrayContaining(['story', 'review']));
  }, 120_000);

  it('--no-enrich says the web pass is off by request; the story bands are said as assumed with no pieces of the author\'s', async () => {
    await script();
    const { run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--deep', '--no-enrich', '--json', ...be)) as Record<string, any>;
    expect(j.deep.enrichment.off).toBe('turned off (--no-enrich)');
    expect(j.deep.bands.from).toBe('assumed');
    expect((j.report as string[]).join('\n')).toContain('Web pass: not run (turned off (--no-enrich)).');
  }, 120_000);

  it('without --deep: no deep reading is made, nothing of it is served, and the record has no deep field', async () => {
    await script();
    const { data, run, be } = setup();
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, unknown>;
    const tools = (await log()).slice(seen).map(toolOf);
    // the calls a plain run makes, in order: the questions, the plan, one draft, and the read for sentences about its own making
    expect(tools).toEqual(['emit_questions', 'emit_plan', 'emit_piece', 'emit_own_words']);
    expect(j.deep).toBeUndefined();
    expect((j.questions as { id: string }[]).map((q) => q.id)).toEqual(['angle']);
    expect(String(j.output)).toBe(PIECE);
    const writer = (await log()).slice(seen).find((b) => toolOf(b) === 'emit_piece') ?? '';
    expect(writer).not.toContain('FACTS ONLY THIS SUBJECT HAS');
    expect(writer).not.toContain('Direction for this piece');
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.deep).toBeUndefined();
    expect(rec.prewrite?.questionLog).toBeUndefined();
    expect(existsSync(join(data, 'skills', 'quay', 'angle-history.jsonl'))).toBe(false);
  }, 120_000);
});
