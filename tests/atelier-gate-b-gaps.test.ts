// TWO GAPS THE REVIEW NAMED, PINNED. The author's length is never a binding rule read from a few pieces: three replies of
// one length give a preference, and an output far outside it is reported, never blocked. And an approved term is not
// approved evidence: "OCR" may be named because the method names it, but whether an OCR pass caused this person's stall
// is a decision the brief marks unsupported when nothing given supports it, and the writer is told to leave it open.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const RA = 'run the import once more'; const RB = 'That is all it needs.';
// three answers of ONE length: the case that once made a band one character wide
const same = (n: number): string => `---\nrequest: The PDF import stalls at ${n}0% on a scanned file. What do I do?\n---\nThat stall is the OCR pass on the scanned PDF: it reads every page before the import can move. Leave it for a minute, then ${RA} from the same screen; the second pass skips what it has read. ${RB}\n`;
const METHOD = 'How I answer importer questions\n\n1. Name the cause first: a stall on a scan is the OCR pass reading every page.\n2. Then the one thing to do.\n3. End on a short plain line.\n';
const PERSONA = { points: [{ aspect: 'open', description: 'Names the cause before the fix.', frequency: 'ALWAYS', quote: RA }, { aspect: 'close', description: 'Closes on a short plain line.', frequency: 'OFTEN', quote: RB }] };
const REPLY_FORM = { examples: [1, 2, 3].map((n) => ({ example: n, answers: 'PERSON_WHO_ASKED', quote: RA })), form: 'REPLY' };
const SCOPE = { examples: [1, 2, 3].map((n) => ({ example: n, asked: 'NEITHER', kind: 'how-to', beyond: [] })) };
const UNITS = { units: [
  { id: '1', kind: 'instruction', decision: 'the cause of the stall', inputs: ['what the person reports'], condition: null, output: 'the cause, first', exception: null, dependsOn: [], quote: 'Name the cause first' },
  { id: '2', kind: 'instruction', decision: 'the one thing to do', inputs: [], condition: null, output: 'one instruction', exception: null, dependsOn: ['1'], quote: 'the one thing to do' },
  { id: '3', kind: 'instruction', decision: null, inputs: [], condition: null, output: 'a short plain line', exception: null, dependsOn: [], quote: 'End on a short plain line' },
] };
// the brief: nothing in "The import stalls. Why?" says what caused it
const BRIEF = { placed: [], unsupported: [{ n: 1, missing: 'what the person saw before the stall' }], contradicted: [] };
// three times the goldens' length, in its own words (a run shared with a golden would be a lifted passage, which blocks for its own reason)
const LONG = `An OCR pass reads every page of a scan before an import can move, and that is the usual reason a scanned import looks stuck. ${'It is slow rather than broken, and a second attempt goes faster because the pages already read are skipped. '.repeat(6)}Give it a minute, then start the import again from where you are. Nothing more is needed.`;

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--context-reader', 'scripted'];
const promptsFor = async (tool: string): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages?: { content?: string }[] })
    .filter((b) => b.tools?.[0]?.function?.name === tool).map((b) => (b.messages ?? []).map((m) => m.content ?? '').join('\n'));
};

describe('provisional length, and terminology that is not evidence', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    // the intent reading says the four-word request asks for something, in the request's words: that is what makes it the method's work
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_scope: SCOPE, emit_holds_back: { ids: [] }, emit_method_units: UNITS, emit_execution_brief: BRIEF, emit_piece: { piece: LONG },
      emit_intent: { format: null, shape: null, length: null, document: null, deliver: ['The import stalls'], unknowns: [], act_on: null, irreversible: null } },
      when: [{ contains: 'The work is described as', answer: REPLY_FORM }] }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('three goldens of one length: the length is a preference, its band a quarter wide at least, and a reply three times as long is not blocked; the unsupported cause is left open and said', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gg-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gg-proj-'));
    mkdirSync(join(proj, 'examples')); writeFileSync(join(proj, 'method.md'), METHOD);
    for (const n of [1, 2, 3]) writeFileSync(join(proj, 'examples', `r${n}.md`), same(n));
    // the context judge reads the request only in claims mode `model` (the suite's default `pattern` turns it off); it is scripted here
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_TASTE_HOLDBACK: '0', ATELIER_CLAIMS: 'model' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const built = run('new', 'examples', '--method', 'method.md', '--name', 'support', '--yes', ...BACKEND());
    expect(built.code, built.out).toBe(0);
    const L = { root: data, skillName: 'support' };
    const std = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!;
    const lengths = std.requirements.filter((q) => q.measurement?.observer === 'SHAPE' && ['characters', 'words'].includes((q.measurement.params.shape as string[])[0]));
    expect(lengths.length).toBeGreaterThan(0);
    for (const q of lengths) {
      expect(q.materiality, q.statement).toBe('PREFERRED');
      const p = q.measurement!.params as { min?: number; max: number };
      expect(p.max - (p.min ?? 0), q.statement).toBeGreaterThanOrEqual(Math.floor(p.max * 0.25));
    }
    // a reply three times the goldens' length: reported against the band, never blocked
    const r = run('invoke', '--skill', 'support', 'The import stalls. Why?', '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const json = JSON.parse(r.out.slice(r.out.indexOf('\n{') + 1)) as { output: string | null; rulesBroken: string[] };
    expect(json.output).toContain('OCR pass');
    expect(json.rulesBroken.filter((id) => lengths.some((q) => q.requirementId === id))).toEqual([]);
    // the term is the method's and stands; the cause is a decision nothing given supports, and the writer was told
    const prompts = await promptsFor('emit_piece');
    const prompt = prompts.find((p) => p.includes("For this request, my method's steps that apply")) ?? '';
    const intents = await promptsFor('emit_intent'); const briefs = await promptsFor('emit_execution_brief');
    expect(prompt, `${prompts.length} writer prompt(s), ${intents.length} intent reading(s), ${briefs.length} brief reading(s); run said: ${r.out.split('\n').filter((l) => /For this request|Read before writing|brief|intent/.test(l)).join(' | ')}; tails: ${prompts.map((p) => p.slice(-200).replace(/\s+/g, ' ')).join(' || ')}`).toContain('- Step 1: decide the cause of the stall (from what the person reports) — a specific this needs is not given (what the person saw before the stall): say so in one line, and decide on what is given');
    expect(prompt).toContain('A specific not given is said to be missing, never invented; every decision is still made, on what is given, in the shape my method asks for.');
    expect(r.out).toMatch(/1 decision\(s\) need a specific not given/);
  }, 240_000);
});
