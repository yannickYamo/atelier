// THE FIRST TEN MINUTES, AS A PERSON MEETS THEM: one command builds the skill from their pieces and their method, says
// what it understood, asks the few things only they can say, writes two pieces as previews, takes one round of changes
// (a change they confirm is carried to every later piece; a preview is never kept as a piece of theirs) and says it
// is ready; one more command writes with it. Driven through the shipped binary on the scripted backend, with the
// person's lines on stdin. What is counted is the experience: commands typed, flags needed, stops, questions, samples,
// and the internal words a person should never have to read.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const setBackend = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
});
afterAll(() => { backend.kill(); });

const BODY = 'I ran both for a month on the same notes, every working day, and wrote down what broke. Obsidian keeps plain files in a folder I can open with anything; Bear keeps a database I cannot open without Bear. Sync on Bear was faster every single morning, and export on Obsidian was honest about what it gave back. I moved four hundred notes in each direction to see what survived the trip, and the answer was not the one I expected when I started.';
const POST = (n: number): string => `# Obsidian against Bear, round ${n}\n\n${BODY}\n\n## Where each one wins\n\n${BODY}\n\nBear wins on the phone. Obsidian wins the day you leave. That is the whole trade.\n\n## What I would pick\n\n${BODY}\n\nPick the one you can walk away from.\n`;
const ESSAY = `# Why I stopped chasing tools\n\nFor years I changed notes apps every spring, as if the next one would make me think better. It never did. The habit was the problem, and the habit was mine.\n\n${BODY}\n\nWhat changed was small: I stopped reading launch posts. The notes stayed where they were, and so did I.\n\n${BODY}\n`;
const METHOD = 'How I write a post\n\n1. Open on what I did, not on the industry.\n2. Say where each side wins.\n3. Close on one short plain sentence.\n';
const DRAFT = '# Logseq against Craft\n\nA first draft.';
const FIXED = '# Logseq against Craft\n\nI ran both for a week on the same notes. Logseq is local-first and free. Craft is paid and syncs through its own cloud. Pick by what you would miss.';
const REVIEWED = '# Logseq against Craft\n\nI ran both for a week on the same notes. Logseq is local-first and free. Craft is paid and syncs through its own cloud. That is the whole trade.';

/** The words of the machinery: none belongs on a screen a person meets on the way in. */
const INTERNAL = ['StandardVersion', 'SkillVersion', 'latitude', 'Latitude', 'binding', 'ratif', 'materiality', 'REQUIRED', 'PREFERRED', 'invocation', 'compiled', 'consequence', 'hash'];

describe('the first ten minutes', () => {
  it('one command builds, shows, asks, writes two pieces, takes one round and says ready; one more writes', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-first-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-first-proj-'));
    mkdirSync(join(proj, 'posts'));
    writeFileSync(join(proj, 'posts', 'compare-1.md'), POST(1)); writeFileSync(join(proj, 'posts', 'compare-2.md'), POST(2)); writeFileSync(join(proj, 'posts', 'essay.md'), ESSAY);
    writeFileSync(join(proj, 'method.md'), METHOD);
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_GUIDED: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER;
    const typed = (input: string, ...a: string[]): { code: number | null; out: string } => {
      const r = spawnSync('node', [CLI, ...a, ...BACKEND()], { encoding: 'utf8', cwd: proj, env, input });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    await setBackend({ byTool: { emit_persona: { points: [{ aspect: 'close', description: 'Closes on a short plain sentence.', frequency: 'OFTEN', quote: 'That is the whole trade.' }] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED], emit_piece: { piece: FIXED } } });
    // what the person types: the kind, the reader, enter for the purpose; a first request; a change to the first piece
    // and a y to say it is the change they meant; enter on the second
    const lines = ['a blog post', 'someone choosing a notes app', '', 'Compare Logseq and Craft for my notes.', 'Make the close shorter.', 'y', ''];
    const built = typed(`${lines.join('\n')}\n`, 'new', 'posts', 'write posts in my voice', '--method', 'method.md', '--name', 'posts');

    // no stop: the one command ends with a skill that is active
    expect(built.code, built.out).toBe(0);
    expect(store.getActive({ root: data, skillName: 'posts' })).toBeTruthy();
    // what was understood, then at most five questions, and the answers are the agent's from then on
    expect(built.out).toContain('What I understood');
    const asked = (/(\d+|One) questions? before I write/.exec(built.out) ?? [])[1];
    expect(asked === 'One' ? 1 : Number(asked)).toBeLessThanOrEqual(5);
    const card = store.getCard({ root: data, skillName: 'posts' });
    expect(card?.by).toBe('you'); expect(card?.kind).toBe('a blog post'); expect(card?.reader).toBe('someone choosing a notes app');
    expect(card?.purpose ?? null, 'a question answered with enter leaves the field unsaid').toBeNull();
    // two pieces, one round, and what the person accepted is kept
    expect(built.out.match(/^Sample \d of 2: /gm)?.length).toBe(2);
    expect(built.out).toContain('Sample 1 of 2: Compare Logseq and Craft for my notes.');
    expect(built.out).toContain('That is the whole trade.');
    expect(built.out).toContain('Written again:'); expect(built.out).toContain('Pick by what you would miss.');
    // A SAMPLE IS A PREVIEW: the one the person passed with enter is kept nowhere. The one they changed and confirmed
    // is held as their correction (the sentence before and after), never as a piece to write from.
    const kept = store.getKept({ root: data, skillName: 'posts' });
    expect(kept.length).toBe(1); expect(kept[0].correctionOnly).toBe(true);
    expect(kept[0].edits).toEqual([{ before: 'That is the whole trade.', after: 'Pick by what you would miss.' }]);
    expect(built.out).toContain('"posts" is ready: every new piece is reviewed against the correction you just made.');
    expect(built.out).toContain('This is its first version.');
    // the guided part speaks in the person's words
    // the whole build speaks in the person's words: their method as they wrote it, and none of the machinery
    expect(INTERNAL.filter((w) => built.out.includes(w))).toEqual([]);
    expect(built.out).toContain('Your method, which every piece follows:'); expect(built.out).toContain('- Close on one short plain sentence.');
    for (const hidden of ['You judge these yourself', 'never blocking', '--report', 'could not be read']) expect(built.out, hidden).not.toContain(hidden);

    // one more command writes with it, with nobody asked anything
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    const ran = typed('', 'run', 'Compare Bear and Craft for my notes.');
    expect([0, 1], ran.out).toContain(ran.code);
    expect(ran.out).toContain('That is the whole trade.');
    // that run was written from the person's own pieces alone, with their correction before its review
    const lastRun = [...store.listInvocations({ root: data, skillName: 'posts' })].sort((a, b) => b.at.localeCompare(a.at))[0] as unknown as { direct?: { pieces: { kept: boolean }[]; corrections: number } };
    expect(lastRun.direct?.pieces.length).toBeGreaterThan(0);
    expect(lastRun.direct?.pieces.some((x) => x.kept)).toBe(false);
    expect(lastRun.direct?.corrections).toBe(1);
    // what the person said the work is stays out of the writer's prompt unless the experiment switch is on; with it,
    // the writer is told their words (the kind and the reader they typed) and nothing they did not say
    const SAID = 'What the author says these pieces are: a blog post.';
    const bodies = async (): Promise<string[]> => ((await (await fetch(`${url()}/__log`)).json()) as { bodies: string[] }).bodies;
    expect((await bodies()).some((b) => b.includes(SAID))).toBe(false);
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    env.ATELIER_CARD_TO_WRITER = '1'; const told = typed('', 'run', 'Compare Bear and Craft for my notes.'); delete env.ATELIER_CARD_TO_WRITER;
    expect([0, 1], told.out).toContain(told.code);
    const toldBodies = await bodies();
    expect(toldBodies.some((b) => b.includes(SAID) && b.includes('Who the author says reads them: someone choosing a notes app.'))).toBe(true);
    expect(toldBodies.some((b) => b.includes('What the author says a reader should do or know'))).toBe(false);
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    // beside the piece: what the checks found in one sentence and what to do if it is not right, in plain words
    // the one sentence counts what was measured, what is judgement, and what could not be checked, and that last is named
    expect(ran.out).toMatch(/^Checked: nothing broke your rules \(3 measured; 3 are judgement calls the writer was given in your words; 1 could not be checked on this piece, named below\)\.$/m);
    expect(ran.out).toMatch(/^ {2}Not checked on this piece: Every specific in the work .*\(no material was supplied to look them up in\)$/m);
    expect(ran.out).toContain('Not right? atelier fix');
    expect(ran.out).not.toContain('── Evaluation');
    expect(ran.out).not.toMatch(/left for you to read|possible slip|small reader/i);

    // saying what was wrong: the request is named in the person's words, and one line says how to make it a habit
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED], emit_piece: { piece: FIXED } } });
    const fixed = typed('', 'fix', 'the close is too long');
    expect(fixed.out).toContain('About your last run of /posts: "Compare Bear and Craft for my notes."');
    expect(fixed.out).toContain('Pick by what you would miss.');
    expect(fixed.out).not.toMatch(/--evaluation|small reader/);

    // every skill on one line, and nothing of the build's own state
    const listed = typed('', 'status');
    expect(listed.out).toContain('posts  ·  a blog post; read by someone choosing a notes app');
    expect(listed.out).not.toMatch(/state BUILT|proposals \d/);

    // what the skill holds, in the person's words: what it is for, their method, what they kept; none of the machinery
    const page = typed('', 'status', '--skill', 'posts');
    expect(page.out).toContain('For: a blog post; read by someone choosing a notes app');
    expect(page.out).toContain('Your rules, in your words'); expect(page.out).toContain('- Close on one short plain sentence.');
    expect(page.out).toContain('Your corrections (1)'); expect(page.out).not.toContain('Pieces you kept');
    expect(INTERNAL.filter((w) => page.out.includes(w))).toEqual([]);
    expect(page.out).not.toMatch(/receipt|floor|taste reader|dimensions/);

    // the same skill on another model: the piece is written, one line says which model wrote it and which the skill
    // was built on, and the line is said again on the next such run (nobody was asked, so nothing was accepted)
    const other = (): { code: number | null; out: string; err: string } => {
      const r = spawnSync('node', [CLI, 'run', 'Compare Bear and Craft once more.', '--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted-next'], { encoding: 'utf8', cwd: proj, env, input: '' });
      return { code: r.status, out: r.stdout, err: r.stderr };
    };
    for (const r2 of [other(), other()]) {
      expect(r2.code, `${r2.out}${r2.err}`).toBe(ran.code);
      expect(r2.out).toContain('That is the whole trade.');
      expect(r2.err).toContain('(written on scripted-next; this skill was built on scripted.');
      expect(`${r2.out}${r2.err}`).not.toContain('TARGET_BINDING_MISMATCH');
    }

    // built again at a terminal: the pieces already accepted still lead; nothing is asked or written a second time
    await setBackend({ byTool: { emit_persona: { points: [] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const again = typed('', 'new', 'posts', 'write posts in my voice', '--method', 'method.md', '--name', 'posts');
    expect(again.code, again.out).toBe(0);
    expect(again.out).toContain('"posts" is built again. What you kept and corrected is still held.');
    expect(again.out).not.toMatch(/Sample \d of|before I write/);
    expect(store.getKept({ root: data, skillName: 'posts' }).length).toBe(1);
  }, 240_000);

  it('with no model key: nothing is asked, nothing is called ready, the one thing to do is said; the same command again reads the voice', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-first-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-first-proj-'));
    mkdirSync(join(proj, 'posts')); writeFileSync(join(proj, 'posts', 'compare-1.md'), POST(1)); writeFileSync(join(proj, 'posts', 'compare-2.md'), POST(2)); writeFileSync(join(proj, 'posts', 'essay.md'), ESSAY);
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_GUIDED: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER;
    const args = ['new', 'posts', 'write posts in my voice', '--name', 'posts'];
    const bare = spawnSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, input: 'a blog post\n\n\n' });
    const said = `${bare.stdout}${bare.stderr}`;
    expect(bare.status, said).toBe(0);
    expect(said).toContain('"posts" is built, and cannot write yet: no model key is set.');
    expect(said).toContain('export ANTHROPIC_API_KEY=');
    expect(said).not.toMatch(/is ready|questions? before I write|Sample \d of|could not be written/);
    // the same command, once a model is there: the pieces are read for how the person sounds, and it writes
    await setBackend({ byTool: { emit_persona: { points: [{ aspect: 'close', description: 'Closes on a short plain sentence.', frequency: 'OFTEN', quote: 'That is the whole trade.' }] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const again = spawnSync('node', [CLI, ...args, ...BACKEND()], { encoding: 'utf8', cwd: proj, env, input: '\n\n\n\n\n\n' });
    const out = `${again.stdout}${again.stderr}`;
    expect(again.status, out).toBe(0);
    expect(out).toContain('How you write:'); expect(out).toContain('- Closes on a short plain sentence.');
    expect(out).toMatch(/"posts" is ready/);
  }, 240_000);

  it('a person who is not answering is never taken to have accepted: ended input keeps nothing; --yes and --no-model write no sample', async () => {
    const fresh = (): { data: string; proj: string; env: NodeJS.ProcessEnv } => {
      const data = mkdtempSync(join(tmpdir(), 'atelier-first-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-first-proj-'));
      mkdirSync(join(proj, 'posts')); writeFileSync(join(proj, 'posts', 'compare-1.md'), POST(1)); writeFileSync(join(proj, 'posts', 'compare-2.md'), POST(2)); writeFileSync(join(proj, 'posts', 'essay.md'), ESSAY);
      const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_GUIDED: '1' };
      delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER;
      return { data, proj, env };
    };
    const build = (f: { proj: string; env: NodeJS.ProcessEnv }, input: string, ...more: string[]): { code: number | null; out: string } => {
      const r = spawnSync('node', [CLI, 'new', 'posts', 'write posts in my voice', '--name', 'posts', ...more, ...BACKEND()], { encoding: 'utf8', cwd: f.proj, env: f.env, input });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const script = (): Promise<Response> => setBackend({ byTool: { emit_persona: { points: [] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });

    // the input ends at the first question: nothing is written, nothing is kept, and it is not called ready
    await script(); const ended = fresh(); const e1 = build(ended, '');
    expect(e1.code, e1.out).toBe(0);
    expect(e1.out).toContain('the input ended');
    expect(e1.out).not.toMatch(/is ready|Sample \d of/);
    expect(store.getKept({ root: ended.data, skillName: 'posts' })).toEqual([]);

    // the input ends at "anything to change?": the sample was shown, and is not kept as accepted
    await script(); const mid = fresh(); const e2 = build(mid, 'a blog post\n\n\nCompare Logseq and Craft.\n');
    expect(e2.out).toContain('Sample 1 of 2: Compare Logseq and Craft.');
    expect(e2.out).not.toContain('Sample 2 of 2');
    expect(store.getKept({ root: mid.data, skillName: 'posts' })).toEqual([]);

    // enter is not approval: both samples shown, the build is ready, and nothing is kept
    await script(); const skim = fresh(); const e5 = build(skim, 'a blog post\n\n\n\n\n\n');
    expect(e5.out.match(/^Sample \d of 2: /gm)?.length).toBe(2);
    expect(e5.out).toMatch(/"posts" is ready\.$/m);
    expect(store.getKept({ root: skim.data, skillName: 'posts' })).toEqual([]);

    // a change asked for and not confirmed (enter at "is that the change you meant?") carries nothing forward
    await setBackend({ byTool: { emit_persona: { points: [] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED], emit_piece: { piece: FIXED } } });
    const unsure = fresh(); const e6 = build(unsure, 'a blog post\n\n\nCompare Logseq and Craft.\nMake the close shorter.\n\n\n');
    expect(e6.out).toContain('Written again:');
    expect(store.getKept({ root: unsure.data, skillName: 'posts' })).toEqual([]);

    // --yes: built, nothing asked, no sample, though a person's lines are there
    await script(); const yes = fresh(); const e3 = build(yes, 'a blog post\n\n\n\n\n\n', '--yes');
    expect(e3.code, e3.out).toBe(0);
    expect(e3.out).toContain('Your skill "posts" is ready.');
    expect(e3.out).not.toMatch(/What I understood|Sample \d of/);

    // --no-model with a model in reach: the person asked for no model, so none is called for samples
    await script(); const off = fresh(); const e4 = build(off, 'a blog post\n\n\n\n\n\n', '--no-model');
    expect(e4.code, e4.out).toBe(0);
    expect(e4.out).toContain('"posts" is built without a model, as you asked');
    expect(e4.out).not.toMatch(/Sample \d of|before I write|is ready/);
    expect(store.listInvocations({ root: off.data, skillName: 'posts' })).toEqual([]);
  }, 300_000);

  it('where nobody is there (no terminal), the build says ready and asks nothing', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-first-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-first-proj-'));
    mkdirSync(join(proj, 'posts')); writeFileSync(join(proj, 'posts', 'compare-1.md'), POST(1)); writeFileSync(join(proj, 'posts', 'essay.md'), ESSAY);
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_GUIDED;
    await setBackend({ byTool: { emit_persona: { points: [] }, emit_holds_back: { ids: [] }, __plain: [DRAFT, REVIEWED] } });
    const r = spawnSync('node', [CLI, 'new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND()], { encoding: 'utf8', cwd: proj, env, input: '' });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Your skill "posts" is ready.');
    expect(r.stdout).not.toContain('What I understood');
  }, 120_000);
});
