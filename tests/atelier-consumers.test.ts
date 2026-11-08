// tests/atelier-consumers.test.ts — EVERY ARTIFACT A BUILD WRITES HAS A NAMED READER, OR IS RETIRED.
//
// The persona was served to the writer as rules and buried the voice; the fix stopped serving it, and it stayed built on
// every skill, paid for, and read by nothing on the default run. No test noticed: the tests that guarded its use
// followed the compiled path. Here a skill is built and run the default way with the store traced (core/state/trace.ts),
// and every file and voice field the build wrote is held to this table: read on the default run, or named with the
// reader it has elsewhere. A new artifact with no entry fails; so does an entry that says "default" and is not read, or
// one that says "elsewhere" and is read (the table would be lying). Expected values are written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
}, 60_000);
afterAll(() => { backend.kill(); });
const setBackend = (b: unknown): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(b) });

/** Read on the default run (`atelier run`, the direct writer). */
const DEFAULT = ['skills/*/active.json', 'skills/*/versions/*.json', 'skills/*/standards/*.json', 'skills/*/packages/*.json', 'skills/*/ledgers/*.json',
  'skills/*/voice.json', 'skills/*/method.md', 'skills/*/exemplar.md', 'skills/*/exemplar-request.txt', 'skills/*/step-ledger.json',
  'skills/*/fidelity/active.json', 'skills/*/fidelity/releases/*.json', 'skills/*/fidelity/profiles/*.json'];
/** Written at build and read elsewhere, by the reader named. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  'runs/*': 'the build\'s own run folder: read by the build steps that follow and by `atelier inspect`',
  'sessions/*': 'the run in flight in this project: read by the next command of the build',
  '<project>/.claude/*': 'the skill installed for a host (Claude Code loads SKILL.md and its examples)',
  'skills/*/moves/*.json': 'the compiled path (`--pipeline legacy`) and SKILL.md for a host',
  'skills/*/units/*.json': 'the compiled path only',
  'skills/*/contrast.json': 'SKILL.md for a host and `atelier optimize`',
  'skills/*/architectures/*.json': '`atelier check`, `fix`, `improve`, `optimize`',
  'skills/*/receipts/*.json': '`atelier status --skill`, `tend`, and the next rebuild',
  'skills/*/evals/*.json': '`atelier eval`',
  'skills/*/fidelity/profile.json': '`atelier verify`, `fidelity`, `score`',
  'skills/*/frozen-checks.json': 'the next method build: checks kept while their step and examples are unchanged',
  'skills/*/form.txt': 'the compiled path (what form a reply takes)',
  'skills/*/method-inferred.json': 'the compiled path and `atelier fix` (a skill built with no method note)',
};
/** Voice fields written at build and read elsewhere. */
const VOICE_ELSEWHERE: Readonly<Record<string, string>> = {
  persona: 'the compiled path and SKILL.md for a host',
  lengthSpan: 'the compiled path and SKILL.md\'s length line',
  lengthWords: 'SKILL.md\'s length line',
  servedWhole: 'SKILL.md for a host',
};

const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
] };
const NOTE = 'How I write\n\n1. Open with the problem.\n2. Keep three paragraphs per section.\n3. End on an idea.\n';
const post = (i: number): string => `---\nrequest: Write about tool ${i}.\n---\n# Tool ${i}\n\nI would start with the riskiest line. ${'The tool keeps notes local and syncs when asked. '.repeat(6)}\n\nTests first, then the rest.\n`;
const glob = (p: string): RegExp => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

interface Traced { readonly written: Set<string>; readonly read: Set<string>; readonly voiceRead: Set<string>; readonly voiceWritten: string[] }
async function traced(withMethod: boolean): Promise<Traced> {
  const data = mkdtempSync(join(tmpdir(), 'atelier-consumers-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-consumers-proj-'));
  mkdirSync(join(proj, 'posts')); for (let i = 1; i <= (withMethod ? 4 : 3); i++) writeFileSync(join(proj, 'posts', `p${i}.md`), post(i));
  writeFileSync(join(proj, 'method.md'), NOTE);
  const trace = (n: string): string => join(data, `trace-${n}.txt`);
  const run = (t: string, ...a: string[]): void => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_TRACE_STORE: t };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER;
    execFileSync('node', [CLI, ...a, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
  };
  await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] } } });
  run(trace('build'), 'new', 'posts', ...(withMethod ? ['--method', 'method.md'] : ['write posts like these']), '--name', 'posts', '--yes');
  await setBackend({ byTool: { __plain: ['# Tool\n\nA draft.', '# Tool\n\nI would start with the riskiest line. Reviewed.'] } });
  run(trace('run'), 'invoke', '--skill', 'posts', 'Write about tool 9.', '--json', '--claims', 'pattern', '--no-questions');
  const norm = (p: string): string => p.replace(`${data}/`, '').replace(proj, '<project>').replace(/^runs\/[^/]+\/.*/, 'runs/*').replace(/^sessions\/.*/, 'sessions/*')
    .replace(/^<project>\/\.claude\/.*/, '<project>/.claude/*').replace(/^skills\/[^/]+\//, 'skills/*/').replace(/[0-9a-f]{12,}/g, 'h');
  const lines = (n: string): string[] => (existsSync(trace(n)) ? readFileSync(trace(n), 'utf8').split('\n').filter(Boolean) : []);
  const of = (n: string, k: string): string[] => lines(n).filter((l) => l.startsWith(`${k} `)).map((l) => l.slice(2));
  const voice = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'voice.json'), 'utf8')) as Record<string, unknown>;
  return {
    written: new Set(of('build', 'W').map(norm)), read: new Set(of('run', 'R').map(norm)),
    voiceRead: new Set(of('run', 'F').filter((f) => f.split('#')[0].endsWith('/voice.json')).map((f) => f.split('#')[1])),
    voiceWritten: Object.keys(voice),
  };
}

const declared = (p: string): 'default' | 'elsewhere' | null => {
  const g = (x: string): boolean => glob(x.replace(/h/g, 'h')).test(p) || glob(x).test(p.replace(/\bh\b/g, '*'));
  if (DEFAULT.some(g)) return 'default';
  if (Object.keys(ELSEWHERE).some(g)) return 'elsewhere';
  return null;
};

// Three pieces with no method: built from the pieces as they are (cli/commands/new.ts), the persona read from them.
describe.each([['a method build', true], ['a build from three examples alone', false]])('%s, then a default run', (_, withMethod) => {
  let t: Traced;
  beforeAll(async () => { t = await traced(withMethod); }, 180_000);
  it('every file the build wrote is named: read on the default run, or read elsewhere by the reader the table names', () => {
    expect([...t.written].filter((p) => declared(p) === null)).toEqual([]);
  });
  it('what the table says the default run reads, it reads; what it says is read elsewhere, the default run does not', () => {
    const wrote = [...t.written];
    expect(wrote.filter((p) => declared(p) === 'default' && !t.read.has(p) && ![...t.read].some((r) => glob(p.replace(/\bh\b/g, '*')).test(r)))).toEqual([]);
    expect(wrote.filter((p) => declared(p) === 'elsewhere' && t.read.has(p))).toEqual([]);
  });
  it('every voice field is read on the default run, or named with its reader elsewhere; and the table is true', () => {
    expect(t.voiceWritten.filter((k) => !t.voiceRead.has(k) && !(k in VOICE_ELSEWHERE))).toEqual([]);
    expect(Object.keys(VOICE_ELSEWHERE).filter((k) => t.voiceRead.has(k))).toEqual([]);
  });
});
