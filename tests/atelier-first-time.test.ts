// THE FIRST TEN MINUTES, AS A PERSON MEETS THEM: one command builds the skill from their pieces and their method, says
// what it understood, asks the few things only they can say, writes two pieces, takes one round of changes and says it
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

const POST = (n: number): string => `# Obsidian against Bear, round ${n}\n\nI ran both for a month on the same notes. Obsidian keeps plain files; Bear keeps a database you cannot open. Sync on Bear was faster, export on Obsidian was honest.\n\n## Where each one wins\n\nBear wins on the phone. Obsidian wins the day you leave. That is the whole trade.\n`;
const ESSAY = '# Why I stopped chasing tools\n\nFor years I changed notes apps every spring, as if the next one would make me think better. It never did. The habit was the problem, and the habit was mine.\n\nWhat changed was small: I stopped reading launch posts. The notes stayed where they were, and so did I.\n';
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
    // what the person types: the kind, the reader, enter for the purpose; a first request; a change to the first piece; enter on the second
    const lines = ['a blog post', 'someone choosing a notes app', '', 'Compare Logseq and Craft for my notes.', 'Make the close shorter.', ''];
    const built = typed(`${lines.join('\n')}\n`, 'new', 'posts', 'write posts in my voice', '--method', 'method.md', '--name', 'posts');

    if (process.env.SHOW) writeFileSync(process.env.SHOW, built.out);
    // no stop: the one command ends with a skill that is active
    expect(built.code, built.out).toBe(0);
    expect(store.getActive({ root: data, skillName: 'posts' })).toBeTruthy();
    // what was understood, then at most five questions, and the answers are the agent's from then on
    expect(built.out).toContain('What I understood');
    const asked = (/(\d+|One) questions? before I write/.exec(built.out) ?? [])[1];
    expect(asked === 'One' ? 1 : Number(asked)).toBeLessThanOrEqual(5);
    const card = store.getCard({ root: data, skillName: 'posts' });
    expect(card?.by).toBe('you'); expect(card?.kind).toBe('a blog post'); expect(card?.reader).toBe('someone choosing a notes app');
    // two pieces, one round, and what the person accepted is kept
    expect(built.out.match(/^Sample \d of 2: /gm)?.length).toBe(2);
    expect(built.out).toContain('Sample 1 of 2: Compare Logseq and Craft for my notes.');
    expect(built.out).toContain('That is the whole trade.');
    expect(built.out).toContain('Written again:'); expect(built.out).toContain('Pick by what you would miss.');
    const kept = store.getKept({ root: data, skillName: 'posts' });
    expect(kept.length).toBe(2); expect(kept.some((k) => k.text.includes('Pick by what you would miss.'))).toBe(true);
    expect(built.out).toMatch(/"posts" is ready/);
    // the guided part speaks in the person's words
    const guidedPart = built.out.slice(built.out.indexOf('What I understood'));
    expect(INTERNAL.filter((w) => guidedPart.includes(w))).toEqual([]);

    // one more command writes with it, with nobody asked anything
    await setBackend({ byTool: { __plain: [DRAFT, REVIEWED] } });
    const ran = typed('', 'run', 'Compare Bear and Craft for my notes.');
    expect([0, 1], ran.out).toContain(ran.code);
    expect(ran.out).toContain('That is the whole trade.');
  }, 240_000);

  it('where nobody is there (--yes, or no terminal), the build says ready and asks nothing', async () => {
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
