// tests/atelier-real-run-fixes.test.ts — WHAT THE FIRST RUN ON A REAL MODEL BROKE, EACH HELD HERE.
//
// A model that declines one call (the piece, or the reading of how the author writes) is asked again and the person
// gets their piece and their skill whole. The title of a method note is not one of its steps. A check a model wrote
// for a step, failing the author's own pieces, is a wrong check and not a dispute with the author. And where the
// request states no length, the writer is told how long the author's own pieces run, as a guide.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { methodProposals, acrossExamples } from '../core/method/standard.js';
import type { StepPlan } from '../core/method/step-check.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const setBackend = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });
const bodies = async (): Promise<string[]> => ((await (await fetch(`${url()}/__log`)).json()) as { bodies: string[] }).bodies;

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
});
afterAll(() => { backend.kill(); });

const BODY = 'I ran both for a month on the same notes, every working day, and wrote down what broke. Obsidian keeps plain files in a folder I can open with anything; Bear keeps a database I cannot open without Bear. Sync on Bear was faster every single morning, and export on Obsidian was honest about what it gave back.';
const POST = (n: number): string => `# Obsidian against Bear, round ${n}\n\n${BODY}\n\n## Where each one wins\n\n${BODY}\n\nBear wins on the phone. Obsidian wins the day you leave. That is the whole trade.\n`;
const METHOD = 'How I write a post\n\n1. Open on what I did, not on the industry.\n2. Say where each side wins.\n3. Close on one short plain sentence.\n';
const PIECE = '# Logseq against Craft\n\nI ran both for a week on the same notes. Logseq is local-first and free. Craft is paid and syncs through its own cloud. That is the whole trade.';
const PERSONA = { points: [{ aspect: 'close', description: 'Closes on a short plain sentence.', frequency: 'OFTEN', quote: 'That is the whole trade.' }] };

describe('what the first real run broke', () => {
  it('a model that declines is asked again: the skill has how the author writes, and the piece is written; a title is no step; the length is a guide', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-real-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-real-proj-'));
    mkdirSync(join(proj, 'posts')); for (const n of [1, 2, 3]) writeFileSync(join(proj, 'posts', `compare-${n}.md`), POST(n));
    writeFileSync(join(proj, 'method.md'), METHOD);
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER; delete env.ATELIER_GUIDED;
    const at = (...a: string[]): { code: number | null; out: string; err: string } => { const r = spawnSync('node', [CLI, ...a, ...BACKEND()], { encoding: 'utf8', cwd: proj, env, input: '' }); return { code: r.status, out: r.stdout, err: r.stderr }; };

    // THE BUILD: the reading of how the author writes is declined once, and read on the second ask
    await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] }, __plain: [PIECE] }, refuseNext: { emit_persona: 1 } });
    const built = at('new', 'posts', 'write posts in my voice', '--method', 'method.md', '--name', 'posts');
    expect(built.code, built.out + built.err).toBe(0);
    const page = at('status', '--skill', 'posts');
    expect(page.out).toContain('How you write'); expect(page.out).toContain('Closes on a short plain sentence.');
    expect(page.out).not.toContain('was not read when this was built'); expect(page.out).not.toContain('did not finish');
    // THE TITLE OF THE NOTE IS NOT A STEP: the three steps, and no line for "How I write a post"
    expect(page.out).toContain('- Close on one short plain sentence.');
    expect(page.out).not.toContain('- How I write a post');

    // A RUN: the writer declines once, is asked again, and the piece is delivered; said once, beside it
    await setBackend({ byTool: { __plain: [PIECE] }, refuseNext: { __plain: 1 } });
    const ran = at('run', 'Compare Logseq and Craft for my notes.', '--skill', 'posts', '--no-questions');
    expect([0, 1], ran.out + ran.err).toContain(ran.code);
    expect(ran.out).toContain('That is the whole trade.');
    expect(ran.err).toContain('(the model declined to write this; asked again.)');
    // THE LENGTH OF THE AUTHOR'S OWN PIECES, AS A GUIDE: said to the writer where the request states none
    const GUIDE = 'sets a length: the author\'s pieces shown here run';
    expect((await bodies()).some((b) => b.includes('Compare Logseq and Craft') && b.includes(GUIDE) && b.includes('A guide, not a limit.'))).toBe(true);
    // ...and not where it states one
    await setBackend({ byTool: { __plain: [PIECE] } });
    const sized = at('run', 'Compare Bear and Craft for my notes in 300 words.', '--skill', 'posts', '--no-questions');
    expect([0, 1], sized.out + sized.err).toContain(sized.code);
    const sizedBodies = (await bodies()).filter((b) => b.includes('Compare Bear and Craft') && !b.includes('"tools"'));
    expect(sizedBodies.length).toBeGreaterThan(0); expect(sizedBodies.some((b) => b.includes(GUIDE))).toBe(false);

    // A MODEL THAT DECLINES EVERY TIME still ends the run, with the reason: three asks, never more
    await setBackend({ byTool: { __plain: [PIECE] }, refuseNext: { __plain: 9 } });
    const never = at('run', 'Compare Notion and Craft for my notes.', '--skill', 'posts', '--no-questions');
    expect(never.code).not.toBe(0);
    expect((await bodies()).filter((b) => b.includes('Compare Notion and Craft') && !b.includes('"tools"')).length).toBe(3);
  }, 240_000);

  it('the title of a method note is a step only on the reading\'s own word; a sentence beside the list is kept as it was', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-real-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-real-proj-'));
    mkdirSync(join(proj, 'posts')); for (const n of [1, 2, 3]) writeFileSync(join(proj, 'posts', `compare-${n}.md`), POST(n));
    writeFileSync(join(proj, 'method.md'), 'How I write a post\n\nAlways name the tool you tested.\n\n1. Open on what I did, not on the industry.\n2. Close on one short plain sentence.\n');
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER; delete env.ATELIER_GUIDED;
    // the reading answers for the sentence (line 2) and says nothing it can be held to for the title (line 1)
    const unit = { id: '2', kind: 'instruction', decision: null, inputs: [], condition: null, output: null, exception: null, dependsOn: [], quote: 'Always name the tool you tested.' };
    await setBackend({ byTool: { emit_method_units: { units: [unit] }, emit_persona: { points: [] }, emit_holds_back: { ids: [] }, __plain: [PIECE] } });
    const r = spawnSync('node', [CLI, 'new', 'posts', 'write posts in my voice', '--method', 'method.md', '--name', 'posts', ...BACKEND()], { encoding: 'utf8', cwd: proj, env, input: '' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const page = spawnSync('node', [CLI, 'status', '--skill', 'posts'], { encoding: 'utf8', cwd: proj, env }).stdout;
    expect(page).toContain('- Always name the tool you tested.');
    expect(page).toContain('- Close on one short plain sentence.');
    expect(page).not.toContain('- How I write a post');
  }, 120_000);

  it('a check a model wrote for a step, failing the author\'s own pieces, is dropped: the step is theirs to judge, never "not what your pieces do"', () => {
    const NOTE = '1. Give the cost of the change as well as the gain.\n2. Keep it short.\n';
    const piece = (t: string): { task: string; material: never[]; reference: string } => ({ task: '', material: [], reference: t });
    // a check that looks for the word "cost": the author's second piece says "price", and still gives the cost
    const wrote = { observer: 'CHECK', params: { source: ['(text) => { const ok = /\\bcost\\b/.test(text); return { ok, detail: ok ? "a cost is named" : "no cost named" }; }'], means: ['names a cost'] } };
    const step = 'Give the cost of the change as well as the gain.';
    const plan = new Map([[step, { how: 'written', measurement: wrote, quote: step, means: 'names a cost' }]]) as unknown as StepPlan;
    // held by the first piece: the check stays with the step
    const held = methodProposals(NOTE, piece('The cost was two days. The gain was a faster build.'), plan);
    expect(held.find((p) => p.statement === step)?.measurement).not.toBeNull();
    // failed by another of the author's pieces: dropped, with no dispute
    const across = acrossExamples(held, [{ id: 'second.md', ...piece('The price was two days. We gained a faster build.') }], 'first.md');
    const after = across.find((p) => p.statement === step);
    expect(after).toEqual({ statement: step, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: null, conflict: null });
    // failed by the first piece itself: the same
    const lead = methodProposals(NOTE, piece('The price was two days. We gained a faster build.'), plan).find((p) => p.statement === step);
    expect(lead).toEqual({ statement: step, origin: 'STATED', obligation: 'JUDGEMENT', measurement: null, onExample: null, conflict: null });
  });
});
