// tests/atelier-own-words-e2e.test.ts — THE PIECE NEVER TALKS ABOUT ITS OWN MAKING, ON EVERY PATH A RUN TAKES.
//
// Through the binary, against the scripted backend. A writer that says "The brief doesn't say when the berths open, and I
// won't invent a date" in the piece has it written again to speak to the reader (or dropped), on a plain run, a run of two
// drafts and a deep run: one step on the run's ledger, listed beside the work (`inferred`), never left in `output`.
// --no-repair changes nothing and says so. And no prompt that writes or fixes the piece, on a plain or a deep run, carries
// a line telling the writer to say what is missing, to hedge on an assumption, or a default nobody gave as a fact.
// Expected values are the fixture's own strings, written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTES = 'The new terminal opens in March and doubles the number of berths. Ferries to the islands will leave every hour from the first week.';
const CONFESSION = 'The brief doesn\'t say when the berths open, and I won\'t invent a date.';
const REWRITE = 'The berths open with the terminal, and the timetable follows them.';
const PIECE = [
  'Why does the first ferry still leave at dawn? The terminal that opens in March gives the quay twice its berths.',
  `From the first week a boat sails to the islands on every hour. ${CONFESSION}`,
  'Islanders have waited years for this change to their crossing. The shops on the quay expect more visitors through the spring.',
].join('\n\n');
const QUESTIONS = { decisions: [{ kind: 'ANGLE', status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', what: 'why it matters now', ask: 'Why does the terminal matter to you now?',
  options: ['My daily crossing', 'The island shops'], default: 'My daily crossing' },
{ kind: 'NEWS', status: 'UNKNOWN', spread: 'DIFFERENT', settledBy: 'author-only', what: 'news of my own work', ask: 'Any news of your own work to carry?',
  options: ['None', 'We opened a ticket office on the quay'], default: 'We opened a ticket office on the quay' }] };
const PLAN = { angle: 'The terminal gives the islands back their hour.', pain: 'Waiting half a day for a boat.', turn: 'Hourly ferries change the trip.', answer: 'Go and use it.',
  points: [{ point: 'hourly island ferries', from: 'Ferries to the islands will leave every hour' }], image: null, close: 'See you on the first boat.', left_out: [] };
const FACTS = { facts: [
  { text: 'The new terminal opens in March.', quote: 'The new terminal opens in March', source: 'material', sourceRef: 'notes' },
  { text: 'A figure for how long the crossing takes now.', quote: '', source: 'sample', sourceRef: '' },
] };
const GAPS = { claims: [{ claim: 'Hourly ferries change island life.', answer: 'FACT', supportIn: 'NONE', quote: null, unlocks: 'the main claim carried by your own proof' }],
  reader: { statedIn: 'NONE', quote: null, spread: 'DIFFERENT', options: ['Islanders', 'Visitors'], default: 'Islanders' },
  stakes: { statedIn: 'NONE', quote: null, spread: 'SAME', options: ['Lost mornings', 'Lost trade'], default: 'Lost mornings' } };
const VERDICT = { scores: ['one-idea', 'proof', 'reader-moves', 'specific', 'voice'].map((id) => ({ id, score: 8, why: 'sound' })), caps: [], mainFailure: 'none', missingFacts: [], keep: 'the opening question', fixes: [] };

/** Every instruction that once told the writer to put a gap, a hedge or an unanswered default into the piece. */
const BANNED = [/say so in one line/i, /say so in its place/i, /not known yet/i, /working assumption/i, /No proof to hand/i, /say it as my view/i,
  /said to be missing/i, /say the assumption/i, /SAMPLE, not a fact/i, /a specific this needs is not given/i, /We opened a ticket office on the quay/];

describe('a piece that talks about its own making, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const setup = (notesBound = true) => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-own-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-own-proj-'));
    const notes = join(proj, 'notes.md'); writeFileSync(notes, NOTES);
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CONTEXT_READER: 'scripted', ATELIER_LIBRARY: '' };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
    run('add', '--statement', 'Open on the news.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'quay');
    return { data, run, be: [...(notesBound ? ['--with', `notes=${notes}`] : []), '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern'] };
  };
  const set = (body: unknown) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  const script = (rewrite: string | null = REWRITE, piece = PIECE, found: unknown[] | null = null) => set({ byTool: {
    emit_piece: { piece: `<work>${piece}</work>` }, emit_questions: QUESTIONS, emit_plan: PLAN, emit_facts: FACTS, emit_gaps: GAPS,
    emit_choice: { choice: 'canon', reason: 'The notes carry the piece.' }, emit_loops: { loops: [], stakes: [], beats: [] }, emit_novelty: { novel: [], claims: [] },
    list_claims: { claims: [] }, review_draft: VERDICT, choose_draft: { better: 'first', reasons: ['the first opens on the news'] },
    emit_own_words: { found: found ?? [{ sentence: CONFESSION, about: 'the brief and a date', rewrite }] } } });
  const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
  const toolOf = (b: string): string => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name ?? '';
  /** The text of every message a call carried (system and user), as the model read it. */
  const textOf = (b: string): string => ((JSON.parse(b) as { messages?: { content?: unknown }[] }).messages ?? []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  const writes = (bodies: string[]): string[] => bodies.filter((b) => ['emit_piece', 'emit_fix'].includes(toolOf(b))).map(textOf);

  it('a plain run: the sentence is written again to speak to the reader, on the ledger, listed beside the work', async () => {
    await script();
    const { data, run, be } = setup();
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, any>;
    const output = String(j.output);
    expect(output).not.toContain(CONFESSION);
    expect(output).toContain(`From the first week a boat sails to the islands on every hour. ${REWRITE}`);
    // one step on the run's ledger, kept
    expect((j.controller?.decisions ?? []).filter((d: { action: string }) => d.action === 'own-words').map((d: { outcome: string }) => d.outcome)).toEqual(['kept']);
    // beside the work: the sentence and what it became; the unanswered angle decided; the news nobody gave never served
    expect(j.inferred).toContainEqual({ kind: 'own-words', what: CONFESSION, settled: `written again: ${REWRITE}` });
    expect(j.inferred).toContainEqual({ kind: 'decision', what: 'Why does the terminal matter to you now?', settled: 'decided: My daily crossing', add: '--answers "angle=<your answer>"' });
    expect(j.inferred).toContainEqual({ kind: 'specific', what: 'Any news of your own work to carry?', settled: 'not served: the piece is written without it', add: '--answers "news=<your answer>"' });
    expect(JSON.stringify(j.inferred)).not.toContain('ticket office');
    expect(j.ownWords).toEqual({ checked: true });
    expect((j.report as string[]).join('\n')).toContain('The piece talked about its own making in 1 sentence(s) (the brief and a date): 1 written again to speak to the reader. What was missing is listed beside the draft, never in it.');
    expect((j.report as string[]).join('\n')).toContain('Inferred for this piece');
    // the record on disk says the same
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(rec.output).not.toContain(CONFESSION);
    expect(rec.inferred?.some((i) => i.kind === 'own-words')).toBe(true);
    // the writer was told the angle as decided, never as an assumption, and never the news nobody gave
    const w = writes((await log()).slice(seen));
    expect(w.length).toBeGreaterThan(0);
    for (const t of w) {
      expect(t).toContain("Decided for this piece (write from them as the piece's own position):\n\n- Why does the terminal matter to you now? My daily crossing");
      for (const b of BANNED) expect(t, String(b)).not.toMatch(b);
    }
  }, 120_000);

  it('a sentence that carried nothing but the confession is dropped', async () => {
    await script(null);
    const { run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, any>;
    expect(String(j.output)).toContain('From the first week a boat sails to the islands on every hour.\n\nIslanders');
    expect(String(j.output)).not.toContain('brief');
    expect(j.inferred).toContainEqual({ kind: 'own-words', what: CONFESSION, settled: 'dropped: it talked about the piece\'s own making' });
  }, 120_000);

  it('two drafts: the one delivered is read, after the choice', async () => {
    await script();
    const { run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--drafts', '2', '--json', ...be)) as Record<string, any>;
    expect(String(j.output)).not.toContain(CONFESSION);
    expect(String(j.output)).toContain(REWRITE);
  }, 120_000);

  it('--no-repair: nothing is read or changed, and the record says why', async () => {
    await script();
    const { run, be } = setup();
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--no-repair', '--json', ...be)) as Record<string, any>;
    expect((await log()).slice(seen).map(toolOf)).not.toContain('emit_own_words');
    expect(String(j.output)).toContain(CONFESSION);
    expect(j.ownWords).toEqual({ checked: false, why: '--no-repair' });
  }, 120_000);

  it('a deep run: read last, after the review; no prompt that writes or fixes the piece tells it to state a gap', async () => {
    await script();
    const { run, be } = setup();
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--deep', '--json', ...be)) as Record<string, any>;
    const bodies = (await log()).slice(seen);
    const tools = bodies.map(toolOf);
    expect(tools.lastIndexOf('emit_own_words')).toBeGreaterThan(tools.lastIndexOf('review_draft'));
    expect(String(j.output)).not.toContain(CONFESSION);
    expect(String(j.output)).toContain(REWRITE);
    // the proof question was considered and asked of the person, but its default is never served to the writer
    expect((j.questions as { id: string }[]).map((q) => q.id)).toContain('proof');
    expect(j.inferred).toContainEqual(expect.objectContaining({ kind: 'proof', settled: 'argued from what is given, with no figure of yours' }));
    const w = writes(bodies);
    expect(w.length).toBeGreaterThan(0);
    for (const t of w) {
      expect(t).not.toContain('Argue it from what is given, with no figure');
      expect(t).not.toContain('Proof the piece can carry');
      for (const b of BANNED) expect(t, String(b)).not.toMatch(b);
    }
    // every call of the run, readers and reviewers included: none asks for a gap to be said in the piece
    const told = BANNED.filter((b) => !String(b).includes('ticket office'));
    for (const b of bodies) for (const r of told) expect(textOf(b), `${toolOf(b)} ${String(r)}`).not.toMatch(r);
  }, 180_000);

  it('a rewrite that states a figure nothing gave is refused: the sentence is left as written and listed, never cut', async () => {
    await script('The berths open on 14 April, with the terminal.');
    const { run, be } = setup();
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, any>;
    expect(String(j.output)).not.toContain('14 April');
    expect(String(j.output)).toContain(CONFESSION);
    expect(j.inferred).toContainEqual({ kind: 'own-words', what: CONFESSION, settled: 'left as written (the rewrite states 14, which nothing given holds)', add: 'edit or remove this sentence' });
  }, 120_000);

  const SLOTTED = 'The crossing takes [figure: minutes, quay to quay] on a calm day.';
  const WHOLE = 'The crossing is short enough to make on a calm day.';
  it('no material: the writer is told to leave no slot, and a slot it leaves anyway is written whole', async () => {
    await script(null, `${PIECE.split('\n\n')[0]}\n\n${SLOTTED}`, [{ kind: 'slot', sentence: SLOTTED, about: 'a slot', name: null, rewrite: WHOLE }]);
    const { run, be } = setup(false);
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, any>;
    expect(String(j.output)).not.toMatch(/\[[^\]]+\]/);
    expect(String(j.output)).toContain(WHOLE);
    expect(j.inferred).toContainEqual({ kind: 'slot', what: SLOTTED, settled: `written again: ${WHOLE}`, add: 'the specific, as material (--with)' });
    const bodies = (await log()).slice(seen);
    for (const t of writes(bodies)) {
      expect(t).toContain('Leave no bracketed slot for me to fill');
      expect(t).not.toContain('mark it as a slot for me to fill');
    }
    expect(bodies.filter((b) => toolOf(b) === 'emit_own_words').map(textOf).join('\n')).toContain('Slots are not wanted');
  }, 120_000);

  it('--placeholders: slots are served and the last read leaves them as they stand', async () => {
    await script(null, `${PIECE.split('\n\n')[0]}\n\n${SLOTTED}`, [{ kind: 'slot', sentence: SLOTTED, about: 'a slot', name: null, rewrite: WHOLE }]);
    const { run, be } = setup(false);
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--placeholders', '--json', ...be)) as Record<string, any>;
    expect(String(j.output)).toContain(SLOTTED);
    const bodies = (await log()).slice(seen);
    expect(writes(bodies).some((t) => t.includes('mark it as a slot for me to fill'))).toBe(true);
    expect(bodies.filter((b) => toolOf(b) === 'emit_own_words').map(textOf).join('\n')).toContain('The person asked for slots to fill');
  }, 120_000);

  it('a name nothing given holds is written out of the piece and listed; the read sees what was given', async () => {
    const NAMED = 'Our skipper Tomas Varga has waited years for this change.';
    const PLAIN = 'Our skippers have waited years for this change.';
    await script(null, `${PIECE.split('\n\n')[0]}\n\n${NAMED}`, [{ kind: 'name', sentence: NAMED, about: 'a skipper', name: 'Tomas Varga', rewrite: PLAIN }]);
    const { run, be } = setup();
    const seen = (await log()).length;
    const j = JSON.parse(run('invoke', '--skill', 'quay', 'Write a post on the new terminal.', '--json', ...be)) as Record<string, any>;
    expect(String(j.output)).not.toContain('Varga');
    expect(String(j.output)).toContain(PLAIN);
    expect(j.inferred).toContainEqual({ kind: 'name', what: NAMED, settled: `written again: ${PLAIN}`, add: 'the real name, as material (--with)' });
    expect((j.report as string[]).join('\n')).toContain('It named someone nothing given holds in 1 sentence(s) (Tomas Varga)');
    const read = (await log()).slice(seen).filter((b) => toolOf(b) === 'emit_own_words').map(textOf).join('\n');
    expect(read).toContain('<given>');
    expect(read).toContain('Ferries to the islands will leave every hour');
  }, 120_000);

  it('atelier run shows what was decided and fixed beside the work, and atelier report shows it again', async () => {
    await script();
    const { data, run, be } = setup();
    const shown = run('run', 'Write a post on the new terminal.', '--skill', 'quay', ...be);
    expect(shown).toContain('Inferred for this piece');
    expect(shown).toContain(`about its own making: ${CONFESSION} → written again: ${REWRITE}`);
    expect(shown).toContain('decided for you: Why does the terminal matter to you now? → decided: My daily crossing');
    const [rec] = store.listInvocations({ root: data, skillName: 'quay' });
    expect(run('report', rec.invocationId, '--skill', 'quay')).toContain(`about its own making: ${CONFESSION}`);
  }, 120_000);
});
