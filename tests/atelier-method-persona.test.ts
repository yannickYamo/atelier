// THE AUTHOR IS DESCRIBED ON EVERY PATH THAT HAS PIECES. A skill built from a method and a folder of examples, or from
// two or three pieces with no method, used to be built with no model at all: no persona, no scope reading, and no
// line saying so. Those were the three skills in the three-context study, and every skill that scored last on
// "sounds like the author" had no persona while every one that tied or won had one. The rules still need held-out
// pieces to be checked on; a description of how the author sounds does not, since it steers and never blocks.
//
// Here: with a model reachable, a method build and a thin build derive the persona (and the scope, for work that
// answers), the build log says so, and the served skill carries it. With no model, or too few pieces, the log says
// why there is none, and nothing is called. A method build still serves its pieces whole.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section that holds one of: Approve, Request changes, Comment.\n';
// Each piece carries the two phrases the scripted persona quotes, so the quotes are real; a third quote is not in any piece.
const body = (n: number): string => `I would start with the riskiest line. ${Array.from({ length: n }, (_, i) => `The change touches part ${i + 1} of the runner and keeps its tests.`).join(' ')} Tests first, then the rest.`;
const review = (verdict: string, n: number): string => `---\nrequest: Review this change.\n---\n## Summary\n${body(n)}\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const post = (n: number): string => `# Post ${n}\n\nI would start with the riskiest line. ${Array.from({ length: 12 + n }, (_, i) => `Paragraph ${i + 1} says one plain thing about the work and moves on.`).join('\n\n')}\n\nTests first, then the rest.\n`;

const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
  { aspect: 'invented', description: 'Quotes nobody.', frequency: 'OFTEN', quote: 'this sentence is in no piece' },
] };
const SCOPE = (n: number) => ({ examples: Array.from({ length: n }, (_, i) => ({ example: i + 1, asked: 'NEITHER', kind: 'status', beyond: [] })) });
// Replies: short answers to a request, no sections. The work-form reader is scripted to read them as replies, with real quotes.
const reply = (n: number): string => `---\nrequest: Why does the deploy hang on step ${n}?\n---\nI would start with the riskiest line. Step ${n} waits on a lock that the previous job never released; clear it and run the step again. Tests first, then the rest.\n`;
const REPLY_FORM = { examples: [1, 2, 3, 4].map((n) => ({ example: n, form: 'REPLY', quote: 'clear it and run the step again' })), form: 'REPLY' };

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];
const toolsCalled = async (): Promise<string[]> => {
  const { bodies } = await (await fetch(`${url()}/__log`)).json() as { bodies: string[] };
  return bodies.map((b) => (JSON.parse(b) as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name ?? '?');
};

interface Seed { data: string; proj: string; run: (...a: string[]) => { code: number; out: string } }
interface VoiceFile { persona?: { points: { description: string }[]; dropped: number }; scope?: { reader: string | null; examples: number }; pieces?: string[]; form?: string }
const seed = (files: Readonly<Record<string, string>>, withKey: boolean): Seed => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-mp-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-mp-proj-'));
  mkdirSync(join(proj, 'examples'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(proj, name), text);
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  // the openai-compatible provider needs no key: that is how a test reaches a model
  if (!withKey) { delete env.ATELIER_PROVIDER; }
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  return { data, proj, run };
};
const reviews = (n: number): Record<string, string> => Object.fromEntries<string>([['method.md', NOTE], ...['Approve', 'Request changes', 'Comment', 'Approve', 'Comment'].slice(0, n).map((v, i): [string, string] => [`examples/e${i + 1}.md`, review(v, 40 + i)])]);
const voiceOf = (data: string, skill: string): VoiceFile => JSON.parse(readFileSync(join(data, 'skills', skill, 'voice.json'), 'utf8')) as VoiceFile;

describe('the persona on the method path and the thin path', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_persona: PERSONA, emit_scope: SCOPE(4), emit_holds_back: { ids: [] } },
      when: [{ contains: 'The work is described as: answers', answer: REPLY_FORM }] }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('a method and a folder of examples, with a model: the persona is derived, said, served, and the quote-less point dropped', async () => {
    const { data, proj, run } = seed(reviews(4), true);
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/Persona: 2 points \(1 always, 1 often\) on how the author sounds, each with how often and a quote from their pieces \(1 dropped: their quote was not in the pieces\)/);
    // the name says "code review", the pieces are sectioned review documents: code decides the form, no model is asked,
    // and the skill is compiled as documents (no chat assistant's voice, no scope reading, no "never shorten")
    expect(r.out).not.toMatch(/Scope: |Work form: /);
    // (read once and kept; --persona auto asks for every reading again, and the whole account says who decided)
    expect(run('method', 'method.md', '--golden', 'examples', '--name', 'code-review', '--yes', '--report', '--persona', 'auto', ...BACKEND()).out).toContain('(work form: documents, every example is written under sections;');
    const v = voiceOf(data, 'code-review');
    expect(v.persona?.points.map((p) => p.description)).toEqual(['Opens from a position of my own, not a summary.', 'Closes on a short plain instruction.']);
    expect(v.form).toBe('DOCUMENT');
    expect(readFileSync(join(data, 'skills', 'code-review', 'form.txt'), 'utf8')).toBe('DOCUMENT');
    // served to the writer, with how thin the evidence is said in pieces, not as "always"
    const skill = readFileSync(join(proj, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8');
    expect(skill).toContain('How I sound (each point is quoted from my own pieces and holds in most or all of them):');
    expect(skill).toContain('- (always) Opens from a position of my own, not a summary. e.g. "I would start with the riskiest line."');
    expect(skill).not.toContain('too few of any one kind');
    expect(skill).not.toMatch(/handing it back|Never shorten it to match my shorter examples|How much I write follows the request/);
    // a method build still serves its pieces whole, as before (2,000 words of them, past the 1,200 a skill that answers
    // would spread over its kinds): the model reads them, it does not choose them
    expect(v.pieces).toHaveLength(4);
    const tools = await toolsCalled();
    expect(tools).toContain('emit_persona'); expect(tools).not.toContain('emit_scope'); expect(tools).not.toContain('emit_work_form');
    // built again later with --persona auto (how a skill built before this gets its persona), the pieces stay whole:
    // the whole serving is kept with the voice, not with the command that first chose it
    // (and a plain rebuild that serves the same files is the same package, whatever order its record's keys come in)
    const plain = run('build', '--name', 'code-review', ...BACKEND());
    expect(plain.code, plain.out.slice(-600)).toBe(0);
    const again = run('build', '--name', 'code-review', '--persona', 'auto', ...BACKEND());
    expect(again.code, again.out.slice(-600)).toBe(0);
    expect(again.out).toMatch(/Persona: 2 points \(1 always, 1 often\)/);
    expect(voiceOf(data, 'code-review').pieces).toHaveLength(4);
    expect(voiceOf(data, 'code-review').persona?.points).toHaveLength(2);
  }, 120_000);

  it('replies with their requests, with a model: the form is read from the pieces, the scope is read, and the skill is compiled as answers', async () => {
    const before = (await toolsCalled()).length;
    const files = Object.fromEntries([['method.md', NOTE], ...[1, 2, 3, 4].map((n): [string, string] => [`examples/a${n}.md`, reply(n)])]);
    const { data, proj, run } = seed(files, true);
    const r = run('method', 'method.md', '--golden', 'examples', '--name', 'answers', '--yes', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('Work form: replies in a conversation; read from 4 of your examples by scripted.');
    expect(r.out).toMatch(/Scope: what 4 example\(s\) add beyond what was asked, 4 of them read with the request they answer/);
    expect(voiceOf(data, 'answers').form).toBe('REPLY');
    expect(voiceOf(data, 'answers').scope?.reader).toMatch(/^scope-1:/);
    expect(readFileSync(join(proj, '.claude', 'skills', 'answers', 'SKILL.md'), 'utf8')).toContain('How much I write follows the request');
    const tools = (await toolsCalled()).slice(before);
    expect(tools).toContain('emit_work_form'); expect(tools).toContain('emit_scope');
  }, 120_000);

  it('three pieces and no method, with a model: the pieces are served whole and the author is described', async () => {
    const before = (await toolsCalled()).length;
    const files = Object.fromEntries([1, 2, 3].map((n) => [`examples/p${n}.md`, post(n)]));
    const { data, proj, run } = seed(files, true);
    const r = run('new', 'examples', '--name', 'posts', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('With 3 example(s), rules read by a model could not be checked');
    expect(r.out).toContain(', and how you sound, read from them.');
    expect(r.out).toMatch(/Persona: 2 points \(1 always, 1 often\) on how the author sounds/);
    // the pieces are served whole, not within the compact budget a first build of a writing skill takes with a model
    expect(r.out).not.toMatch(/whole pieces served by default, within/);
    expect(voiceOf(data, 'posts').persona?.points).toHaveLength(2);
    const skill = readFileSync(join(proj, '.claude', 'skills', 'posts', 'SKILL.md'), 'utf8');
    expect(skill).toContain('Closes on a short plain instruction. e.g. "Tests first, then the rest."');
    expect((await toolsCalled()).slice(before)).toContain('emit_persona');
  }, 120_000);

  it('two pieces, with a model: no persona, the log says why, and nothing is asked for one', async () => {
    const before = (await toolsCalled()).length;
    const files = Object.fromEntries([1, 2].map((n) => [`examples/p${n}.md`, post(n)]));
    const { data, run } = seed(files, true);
    const r = run('new', 'examples', '--name', 'two', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/\(no persona: 2 piece\(s\) can be read here; three or more are needed to say how often a habit holds\.\)/);
    expect(r.out).not.toContain('and how you sound, read from them');
    expect(voiceOf(data, 'two').persona).toBeUndefined();
    expect((await toolsCalled()).slice(before)).not.toContain('emit_persona');
  }, 120_000);

  it('--no-model with a model set up: nothing is read, as the help promises', async () => {
    const before = (await toolsCalled()).length;
    const files = Object.fromEntries([1, 2, 3].map((n) => [`examples/p${n}.md`, post(n)]));
    const { data, run } = seed(files, true);
    const r = run('new', 'examples', '--name', 'quietly', '--no-model', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/\(no persona: no model read the pieces \(none is set up, or --no-model\)/);
    expect(voiceOf(data, 'quietly').persona).toBeUndefined();
    expect((await toolsCalled()).slice(before)).toEqual([]);
  }, 120_000);

  it('no model set up: the method build is as it was, its short screen unchanged, and the whole account says why there is no persona', () => {
    const { data, run } = seed(reviews(4), false);
    const short = run('method', 'method.md', '--golden', 'examples', '--name', 'review', '--yes');
    expect(short.code, short.out).toBe(0);
    expect(short.out).not.toMatch(/persona/i);
    // a fresh folder: built again in the same one, the voice is kept from the first build and nothing is read or said
    const fresh = seed(reviews(4), false);
    const r = fresh.run('method', 'method.md', '--golden', 'examples', '--name', 'review', '--yes', '--report');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/\(no persona: no model read the pieces \(none is set up, or --no-model\); how the author sounds is read by one\.\)/);
    for (const d of [data, fresh.data]) { expect(voiceOf(d, 'review').pieces).toHaveLength(4); expect(voiceOf(d, 'review').persona).toBeUndefined(); }
  }, 120_000);

  it('--persona none is still the owner\'s to say; the whole account records it, the short screen does not say it back', () => {
    const { data, run } = seed(reviews(4), true);
    const short = run('method', 'method.md', '--golden', 'examples', '--name', 'quiet', '--yes', '--persona', 'none', ...BACKEND());
    expect(short.code, short.out).toBe(0);
    expect(short.out).not.toMatch(/persona/i);
    const r = seed(reviews(4), true).run('method', 'method.md', '--golden', 'examples', '--name', 'quiet', '--yes', '--persona', 'none', '--report', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/\(no persona: --persona none\.\)/);
    expect(voiceOf(data, 'quiet').persona).toBeUndefined();
  }, 120_000);
});
