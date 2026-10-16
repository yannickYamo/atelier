// tests/atelier-compare-skill-version.test.ts — A RUNTIME ARM'S FILE IS ONE SKILL VERSION, SEALED BY ITS FIRST RECORD.
//
// The manifest of a runtime arm hashed the build's paths (its CLI, data and project directories), never the skill that
// answered. A skill rebuilt in place between two sittings kept every path, so a resumed run appended rows written by
// another version of the skill under the same arm. The runner now reads the version `atelier invoke --json` reports on
// the first record, writes it into the manifest and on every row (`skill_version`), and refuses (exit 2, writing
// nothing) a record that names another. The skill here is built offline and answered by the scripted backend.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ENV: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k)));
const RUN = resolve('bench/compare/run.mjs');
const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (b: Buffer) => { const m = /PORT (\d+)/.exec(String(b)); if (m) ok(Number(m[1])); }); });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
    emit_piece: { piece: 'The change is correct. One risk: the cache is never cleared.' }, emit_observation: { applicable: true, present: true, why: 'seen' } } }) });
});
afterAll(() => { backend.kill(); });

const rows = (file: string): Record<string, unknown>[] => readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

describe('a runtime arm\'s file holds one version of the skill', () => {
  it('the first record seals the version; a skill rebuilt with a change is refused on resume, and no row is added', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-compare-version-'));
    const data = join(dir, 'data'); const proj = join(dir, 'proj');
    mkdirSync(data); mkdirSync(proj);
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review change a.' })}\n`);
    writeFileSync(join(proj, 'example.md'), '# Review\n\nThe change is correct. One risk: the retry loop has no limit.\n');
    writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n');
    const env = { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const build = (): void => {
      const b = spawnSync(process.execPath, [CLI, 'new', join(proj, 'example.md'), '--method', join(proj, 'method.md'), '--name', 'rev', '--yes'], { cwd: proj, env, encoding: 'utf8' });
      expect(b.status, b.stdout + b.stderr).toBe(0);
    };
    /** The version the store says is active: read from the store itself, not from anything the runner wrote. */
    const active = (): string => (JSON.parse(readFileSync(join(data, 'skills', 'rev', 'active.json'), 'utf8')) as { skillVersionHash: string }).skillVersionHash;
    build();
    const first = active();
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: CLI, data, proj, skill: 'rev',
      args: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--claims', 'pattern'] } }));
    const out = join(dir, 'rt.jsonl');
    const runner = (trials: string): { status: number | null; err: string } => {
      const r = spawnSync(process.execPath, [RUN, '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out,
        '--condition', 'atelier', '--model', 'scripted', '--trials', trials], { encoding: 'utf8', env });
      return { status: r.status, err: r.stderr };
    };

    // one cell: its row and the manifest carry the version the store had active
    const one = runner('1');
    expect(one.status, one.err).toBe(0);
    expect(rows(out)).toHaveLength(1);
    expect(rows(out)[0].skill_version).toBe(first);
    expect((JSON.parse(readFileSync(`${out}.manifest.json`, 'utf8')) as Record<string, unknown>).skill_version).toBe(first);

    // the skill rebuilt with a change in its method: another version, under the same paths
    writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n3. End with what to test next.\n');
    build();
    expect(active()).not.toBe(first);
    const before = readFileSync(out, 'utf8'); const manifestBefore = readFileSync(`${out}.manifest.json`, 'utf8');
    const resumed = runner('2');
    expect(resumed.status).toBe(2);
    expect(resumed.err).toContain(first);
    expect(resumed.err).toContain(active());
    expect(resumed.err).toMatch(/No row was written/);
    expect(readFileSync(out, 'utf8')).toBe(before);
    expect(readFileSync(`${out}.manifest.json`, 'utf8')).toBe(manifestBefore);
  }, 180_000);


  it('a cell a filter stopped before its record still carries the version, so a resume after a rebuild is refused', async () => {
    const BY_TOOL = { emit_piece: { piece: 'The change is correct. One risk: the cache is never cleared.' }, emit_observation: { applicable: true, present: true, why: 'seen' } };
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: BY_TOOL, when: [{ contains: 'Review change a.', finish: 'content_filter' }] }) });
    try {
      const dir = mkdtempSync(join(tmpdir(), 'atelier-compare-version-filtered-'));
      const data = join(dir, 'data'); const proj = join(dir, 'proj');
      mkdirSync(data); mkdirSync(proj);
      writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review change a.' })}\n`);
      writeFileSync(join(proj, 'example.md'), '# Review\n\nThe change is correct. One risk: the retry loop has no limit.\n');
      writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n');
      const env = { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
      const build = (): void => {
        const b = spawnSync(process.execPath, [CLI, 'new', join(proj, 'example.md'), '--method', join(proj, 'method.md'), '--name', 'rev', '--yes'], { cwd: proj, env, encoding: 'utf8' });
        expect(b.status, b.stdout + b.stderr).toBe(0);
      };
      const active = (): string => (JSON.parse(readFileSync(join(data, 'skills', 'rev', 'active.json'), 'utf8')) as { skillVersionHash: string }).skillVersionHash;
      build(); const first = active();
      writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: CLI, data, proj, skill: 'rev',
        args: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--claims', 'pattern'] } }));
      const out = join(dir, 'rt.jsonl');
      const runner = (trials: string): { status: number | null; err: string } => {
        const r = spawnSync(process.execPath, [RUN, '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out,
          '--condition', 'atelier', '--model', 'scripted', '--trials', trials], { encoding: 'utf8', env });
        return { status: r.status, err: r.stderr };
      };
      const one = runner('1');
      expect(one.status, one.err).toBe(0);
      expect(rows(out)).toHaveLength(1);
      expect(rows(out)[0].filtered).toBeTruthy();
      expect(rows(out)[0].skill_version).toBe(first);
      writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n3. End with what to test next.\n');
      build();
      expect(active()).not.toBe(first);
      const before = readFileSync(out, 'utf8');
      const resumed = runner('2');
      expect(resumed.status, resumed.err).toBe(2);
      expect(resumed.err).toContain(first);
      expect(resumed.err).toContain(active());
      expect(readFileSync(out, 'utf8')).toBe(before);
      // on the version it began with, the same file resumes past its filtered cell
      writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n');
    } finally {
      await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: BY_TOOL, when: [] }) });
    }
  }, 180_000);


  it('a resume on the same version adds its rows, each carrying that version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-compare-version-same-'));
    const data = join(dir, 'data'); const proj = join(dir, 'proj');
    mkdirSync(data); mkdirSync(proj);
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review change a.' })}\n`);
    writeFileSync(join(proj, 'example.md'), '# Review\n\nThe change is correct. One risk: the retry loop has no limit.\n');
    writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n');
    const env = { ...ENV, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const b = spawnSync(process.execPath, [CLI, 'new', join(proj, 'example.md'), '--method', join(proj, 'method.md'), '--name', 'rev', '--yes'], { cwd: proj, env, encoding: 'utf8' });
    expect(b.status, b.stdout + b.stderr).toBe(0);
    const version = (JSON.parse(readFileSync(join(data, 'skills', 'rev', 'active.json'), 'utf8')) as { skillVersionHash: string }).skillVersionHash;
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: CLI, data, proj, skill: 'rev',
      args: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--claims', 'pattern'] } }));
    const out = join(dir, 'rt.jsonl');
    for (const trials of ['1', '2']) {
      const r = spawnSync(process.execPath, [RUN, '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out,
        '--condition', 'atelier', '--model', 'scripted', '--trials', trials], { encoding: 'utf8', env });
      expect(r.status, r.stderr).toBe(0);
    }
    expect(rows(out).map((r) => r.skill_version)).toEqual([version, version]);
  }, 180_000);
});
