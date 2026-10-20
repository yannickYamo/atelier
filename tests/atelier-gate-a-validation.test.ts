// GATE A ON OTHER SHAPES THAN THE ONE IT WAS BUILT ON. The thank-you case proved the path once; a mechanism tuned to one
// case is what this file guards against. A document skill with material: a term only a golden holds is rewritten out,
// a term the material gives stays, and the document frame is what the writer was served. A reply whose request itself
// names the golden's term: nothing is rewritten (the precision side). Grounding turned off: the term stays, so the
// mechanism that acted is the one named. And the receipt on the shapes the product promises: one golden and a method,
// and a build with no model at all.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { degradedStages } from '../core/state/receipt.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const setBackend = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });
const promptsFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.filter((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name === tool);
};

interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
const seed = (files: Readonly<Record<string, string>>, keyless = false): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-gv-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gv-proj-'));
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(proj, name, '..'), { recursive: true }); writeFileSync(join(proj, name), text); }
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  if (keyless) delete env.ATELIER_PROVIDER;
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
const jsonOf = (out: string): { output: string | null; invocationId: string } => JSON.parse(out.slice(out.indexOf('\n{') + 1)) as { output: string | null; invocationId: string };

// ── A DOCUMENT SKILL: posts about switching tools, every one naming iCloud ────────────────────────────────
const QA = 'I would rather pay for the boring option.'; const QB = 'That is the whole trade.';
const post = (n: number): string => `# Why I moved my notes, part ${n}\n\n## The itch\n\n${QA} For three years every note of mine lived in iCloud and synced when it felt like it. The export was a folder of files with the dates stripped, which is the part nobody warns you about.\n\n## What I did\n\nI moved the lot one weekend and kept the old app installed for a month in case something had not come across. Nothing had gone missing; two tags had. ${QB}\n`;
const POST_PERSONA = { points: [
  { aspect: 'stance', description: 'Prefers the dull reliable choice and says so.', frequency: 'ALWAYS', quote: QA },
  { aspect: 'close', description: 'Closes on a short plain sentence.', frequency: 'OFTEN', quote: QB },
] };
const NOTES = 'Notes for the post: I switched to Obsidian in March. Sync goes through the `obsidian-sync` plugin, which costs four dollars a month. The move took one Saturday.';
const CARRIED_POST = `# Why I switched\n\n## The itch\n\nI would rather pay for the boring option. My notes had lived in iCloud for years and the sync was never quite there. In March I moved them to Obsidian.\n\n## What changed\n\nSync now goes through the \`obsidian-sync\` plugin at four dollars a month, and the move took one Saturday. That is the whole trade.\n`;
const POST_REWRITES = { rewrites: [{ id: 1, text: 'My notes had lived in the old app for years and the sync was never quite there.' }] };

describe('a document skill with material: a golden\'s term is rewritten out, the material\'s term stays, the frame is the author\'s', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('iCloud (only the goldens name it) is rewritten out; obsidian-sync (the notes name it) stays; the writer saw the document frame', async () => {
    await setBackend({ byTool: { emit_persona: POST_PERSONA, emit_holds_back: { ids: [] }, emit_piece: { piece: CARRIED_POST }, emit_rewrites: POST_REWRITES } });
    const { data, proj, run } = seed({ 'posts/p1.md': post(1), 'posts/p2.md': post(2), 'posts/p3.md': post(3), 'notes.md': NOTES });
    const built = run('new', 'posts', 'write posts in my voice', '--name', 'posts', ...BACKEND());
    expect(built.code, built.out).toBe(0);
    expect(readFileSync(join(proj, '.claude', 'skills', 'posts', 'SKILL.md'), 'utf8')).toContain('<!-- form: documents -->');
    const r = run('invoke', '--skill', 'posts', 'Write a post on why I switched notes apps.', '--with', 'notes=notes.md', '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const json = jsonOf(r.out);
    expect(json.output, r.out.slice(0, 500)).not.toBeNull();
    expect(json.output).not.toMatch(/iCloud/);
    expect(json.output).toContain('`obsidian-sync`');
    expect(json.output).toContain('Obsidian');
    const rec = store.listInvocations({ root: data, skillName: 'posts' }).find((i) => i.invocationId === json.invocationId);
    expect(rec?.repair?.draft).toContain('iCloud');
    expect(JSON.stringify(rec)).toMatch(/Grounded: 1 sentence\(s\) stated a fact only an example's case held; 1 rewritten/);
    // the writer was served the author's frame, not the reply frame, and no slot line (material is bound)
    const prompts = await promptsFor('emit_piece');
    expect(prompts.length).toBeGreaterThan(0);
    const last = prompts.at(-1) ?? '';
    expect(last).toContain('a whole piece they wrote on a subject of its own');
    expect(last).not.toContain('earlier conversation with someone');
    expect(last).not.toContain('mark it as a slot for me to fill');
    expect(last).toContain('Leave no bracketed slot for me to fill');
  }, 180_000);
});

// ── A REPLY SKILL: the precision side, and the counterfactual ───────────────────────────────────────────────
const RA = 'run the import once more'; const RB = 'That is all it needs.';
// Three answers of different lengths: three of one length make a band one character wide, which is a fixture's artefact and not a reply's.
const golden = (n: number): string => `---\nrequest: The PDF import stalls at ${n}0% on a scanned file. What do I do?\n---\nThat stall is the OCR pass on the scanned PDF: it reads every page before the import can move. ${'The bigger the scan, the longer that pass takes, and a colour scan takes longest of all. '.repeat(n - 1)}Leave it for a minute, then ${RA} from the same screen; the second pass skips what it has read. ${RB}\n`;
const REPLY_PERSONA = { points: [
  { aspect: 'open', description: 'Names the cause before the fix.', frequency: 'ALWAYS', quote: RA },
  { aspect: 'close', description: 'Closes on a short plain line.', frequency: 'OFTEN', quote: RB },
] };
const REPLY_FORM = { examples: [1, 2, 3].map((n) => ({ example: n, form: 'REPLY', quote: RA })), form: 'REPLY' };
const SCOPE = { examples: [1, 2, 3].map((n) => ({ example: n, asked: 'NEITHER', kind: 'how-to', beyond: [] })) };
// Only terms the request names (PDF, scanned): an answer that explained the stall as the goldens' "OCR pass" would carry a
// term the request never gave, and the signal would read it as borrowed even where it is the right explanation (a limit
// of the signal, measured in core/loop/carry-over.ts, and one the execution brief of Gate B is to narrow).
const ON_TOPIC = 'That stall is the scan pass on the PDF reading every page before the import can move. Leave it for a minute, then run the import once more from the same screen. That is all it needs.';
const CARRIED = 'Glad it worked. If the PDF import stalls again on a scanned file, run the import once more from the same screen. That is all it needs.';
const REWRITES = { rewrites: [{ id: 1, text: 'If the import stalls again, run the import once more from the same screen.' }] };

describe('a reply skill: no false rewrite when the request names the term; the term stays when grounding is off', () => {
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('"The PDF import still stalls at 40%" keeps the PDF: the request named it, nothing is rewritten; with --allow-unsourced the carried PDF stays in the thank-you reply', async () => {
    await setBackend({ byTool: { emit_persona: REPLY_PERSONA, emit_scope: SCOPE, emit_holds_back: { ids: [] }, emit_piece: { piece: ON_TOPIC }, emit_rewrites: REWRITES },
      when: [{ contains: 'The work is described as', answer: REPLY_FORM }] });
    const { data, proj, run } = seed({ 'examples/r1.md': golden(1), 'examples/r2.md': golden(2), 'examples/r3.md': golden(3) });
    const built = run('new', 'examples', 'answer support questions about the importer', '--name', 'support', ...BACKEND());
    expect(built.code, built.out).toBe(0);
    expect(readFileSync(join(proj, '.claude', 'skills', 'support', 'SKILL.md'), 'utf8')).toContain('<!-- form: replies -->');
    // the precision side: the person's own request names the PDF, so a reply about the PDF states nothing borrowed
    const on = run('invoke', '--skill', 'support', 'The PDF import still stalls at 40% on a scanned file. Same fix?', '--json', ...BACKEND());
    expect(on.code, on.out).toBe(0);
    const j1 = jsonOf(on.out);
    expect(j1.output).toContain('PDF');
    const rec1 = store.listInvocations({ root: data, skillName: 'support' }).find((i) => i.invocationId === j1.invocationId);
    expect(JSON.stringify(rec1)).not.toMatch(/Grounded: /);
    // the counterfactual: the same carried reply with grounding off keeps the PDF, so the rewrite above was grounding's
    await setBackend({ byTool: { emit_piece: { piece: CARRIED }, emit_rewrites: REWRITES } });
    const off = run('invoke', '--skill', 'support', 'Thanks, that solved it.', '--allow-unsourced', '--json', ...BACKEND());
    expect(off.code, off.out).toBe(0);
    expect(jsonOf(off.out).output).toContain('PDF');
    const onAgain = run('invoke', '--skill', 'support', 'Thanks, that solved it.', '--json', ...BACKEND());
    expect(onAgain.code, onAgain.out).toBe(0);
    expect(jsonOf(onAgain.out).output).not.toMatch(/PDF/);
    // the writer was served the reply frame
    const prompts = await promptsFor('emit_piece');
    expect(prompts.at(-1) ?? '').toContain('earlier conversation with someone');
  }, 240_000);
});

// ── THE RECEIPT ON THE SHAPES THE PRODUCT PROMISES ─────────────────────────────────────────────────────────
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
const review = (verdict: string): string => `---\nrequest: Review this change.\n---\n## Summary\nI would start with the riskiest line. The change touches the runner and keeps its tests.\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;

describe('the receipt on one golden, and with no model', () => {
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await setBackend({ byTool: { emit_holds_back: { ids: [] } } });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('one golden and a method: built, every stage accounted for, nothing degraded, no persona and the reason says why', () => {
    const { data, run } = seed({ 'method.md': NOTE, 'examples/e1.md': review('Approve') });
    const r = run('new', 'examples', '--method', 'method.md', '--name', 'one', '--yes', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const L = { root: data, skillName: 'one' };
    const receipt = store.getReceipt(L, store.getActive(L)!)!;
    expect(receipt.stages.map((s) => s.id).sort()).toEqual(['contrast', 'counted', 'method', 'moves', 'persona', 'profile', 'scope', 'signals', 'work-form']);
    expect(degradedStages(receipt)).toEqual([]);
    expect(receipt.stages.find((s) => s.id === 'persona')).toMatchObject({ ran: false, why: expect.stringContaining('one example alone') });
    expect(receipt.stages.find((s) => s.id === 'method')).toMatchObject({ ran: true, detail: '3 step(s) served whole' });
    expect(r.out).toMatch(/^Stages: method ✓ \(3 step\(s\) served whole\)/m);
  }, 120_000);

  it('no model at all: built, every model stage says it did not run and why, nothing degraded', () => {
    const { data, run } = seed({ 'method.md': NOTE, 'examples/e1.md': review('Approve'), 'examples/e2.md': review('Comment'), 'examples/e3.md': review('Request changes'), 'examples/e4.md': review('Approve') }, true);
    const r = run('new', 'examples', '--method', 'method.md', '--name', 'dry', '--yes', '--report');
    expect(r.code, r.out).toBe(0);
    const L = { root: data, skillName: 'dry' };
    const receipt = store.getReceipt(L, store.getActive(L)!)!;
    expect(degradedStages(receipt)).toEqual([]);
    expect(receipt.models.contextReader).toBe('none');
    expect(receipt.stages.find((s) => s.id === 'persona')).toMatchObject({ ran: false, why: expect.stringContaining('no model read the pieces') });
    expect(receipt.stages.find((s) => s.id === 'work-form')).toMatchObject({ ran: true });
    // the author's range needs no model: four pieces give their bands on this path too (cli/commands/method.ts)
    expect(receipt.stages.find((s) => s.id === 'profile')).toMatchObject({ ran: true });
  }, 120_000);
});
