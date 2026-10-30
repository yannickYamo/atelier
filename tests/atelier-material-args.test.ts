// tests/atelier-material-args.test.ts — MATERIAL TAKES FILES, NEVER A FLAG'S VALUE, AND ADDS ALL OR NOTHING.
//
// `atelier material --skill x notes.md --provider openai-compatible --base-url … --model scripted` read the flags' values
// as files ("there is no file at openai-compatible") after it had already added notes.md: a partial success with exit 1.
// The files are the positionals the declared grammar leaves (cli/runtime.ts), and every one is checked before any is added.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const PIECES = [
  'The team shipped the fix on Monday, and the panel held. Nobody asked for more.\n\nThe plan was simple: ship, watch, write it down.',
  'A short note on the release. We watched the queue drain and the panel stay green.\n\nThen we wrote it down, as always.',
  'The outage lasted an hour. The panel went red, the queue filled, and we waited.\n\nWriting it down was the easy part.',
];

describe('material and its arguments (through the binary)', () => {
  let root = ''; let proj = '';
  const run = (...args: string[]): { out: string; err: string; code: number } => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: join(root, 'data'), ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    try {
      const out = execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
      return { out, err: '', code: 0 };
    } catch (e) {
      const x = e as { status?: number; stdout?: string; stderr?: string };
      return { out: x.stdout ?? '', err: x.stderr ?? '', code: x.status ?? 1 };
    }
  };
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    root = mkdtempSync(join(tmpdir(), 'atelier-material-args-')); proj = join(root, 'proj');
    mkdirSync(proj); mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    expect(run('new', 'posts', '--no-model', '--name', 'posts').code).toBe(0);
    writeFileSync(join(proj, 'notes.md'), 'The queue drained in forty minutes on the Monday release.\n');
    writeFileSync(join(proj, 'more.md'), 'The panel stayed green for the whole hour.\n');
  }, 120_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('the values of value-taking flags are not files: the file beside them is added, exit 0', () => {
    const r = run('material', '--skill', 'posts', 'notes.md', '--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:1', '--model', 'scripted');
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('added notes.md');
    expect(r.out).toContain('1 material file(s) for posts');
    expect(r.err).not.toContain('there is no file at');
    // listed as a person cites it: the name without its extension
    expect(run('material', '--skill', 'posts', '--list').out).toContain('  notes  (');
  });
  it('a file that is not there stops the command before anything is added: no partial success', () => {
    const r = run('material', '--skill', 'posts', 'more.md', 'missing.md');
    expect(r.code).toBe(1);
    expect(r.err).toContain('there is no file at missing.md');
    expect(r.out).not.toContain('added more.md');
    const list = run('material', '--skill', 'posts', '--list').out;
    expect(list).toContain('  notes  (');
    expect(list).not.toContain('  more  (');
  });
});
