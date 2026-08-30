// tests/atelier-p0-regressions.test.ts — FOUR WAYS A USER LOST WORK, PINNED AGAINST THE BINARY.
//
// Each of these was reproduced by hand against `dist/cli/atelier.mjs` before it was fixed, and none
// was caught by the 1,173 tests that existed, because every one of them lives in the glue between
// commands rather than inside a function: a file read from the wrong place, a name joined onto a
// path unchecked, two allocators for one id, a state the machine could enter and never leave.
// So the witness is the binary, run the way a person runs it.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');

beforeAll(() => {
  if (!existsSync(CLI)) execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
}, 120_000);

/** Run the CLI. Returns stdout on success, or `EXIT:<code>\n<stderr+stdout>` so refusals are testable. */
const run = (dataRoot: string, projectDir: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, ATELIER_DATA: dataRoot, ATELIER_PROJECT_DIR: projectDir },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

const fresh = () => ({
  data: mkdtempSync(join(tmpdir(), 'atelier-p0-data-')),
  proj: mkdtempSync(join(tmpdir(), 'atelier-p0-proj-')),
});

const add = (data: string, proj: string, statement: string, kind = 'GENERATIVE'): string =>
  run(data, proj, 'add', '--statement', statement, '--kind', kind, '--applies-when', 'GENERAL');

const skillFile = (proj: string, name: string): string => join(proj, '.claude', 'skills', name, 'SKILL.md');

describe('P0-1: a build compiles the standard THIS project ratified, never another project\'s', () => {
  it('two projects sharing one store each build their own standard', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p0-data-'));
    const a = mkdtempSync(join(tmpdir(), 'atelier-p0-a-'));
    const b = mkdtempSync(join(tmpdir(), 'atelier-p0-b-'));

    add(data, a, 'Rule that belongs to project A.');
    const closeA = run(data, a, 'ratify-close', '--work-type', 'writing');
    const hashA = /StandardVersion ([0-9a-f]{16})/.exec(closeA)?.[1];
    expect(hashA).toBeDefined();

    add(data, b, 'Rule that belongs to project B.', 'BOUNDARY');
    const closeB = run(data, b, 'ratify-close', '--work-type', 'writing');
    const hashB = /StandardVersion ([0-9a-f]{16})/.exec(closeB)?.[1];
    expect(hashB).toBeDefined();
    expect(hashB).not.toBe(hashA);

    // B closed AFTER A. Before the fix, A's build read B's standard.
    const buildA = run(data, a, 'build', '--name', 'alpha');
    expect(buildA).not.toMatch(/^EXIT:/);
    expect(buildA).toContain(`StandardVersion ${hashA}`);
    const served = readFileSync(skillFile(a, 'alpha'), 'utf8');
    expect(served).toContain('Rule that belongs to project A.');
    expect(served).not.toContain('Rule that belongs to project B.');
    expect(existsSync(join(data, 'skills', 'alpha', 'standards', `${hashA}.json`))).toBe(true);
    expect(existsSync(join(data, 'skills', 'alpha', 'standards', `${hashB}.json`))).toBe(false);
  });

  it('the working files live under runs/<project>, not at the store root', () => {
    const { data, proj } = fresh();
    add(data, proj, 'Any rule.');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(existsSync(join(data, 'pending-standard.json')), 'pending standard written at the shared root').toBe(false);
    const runs = readdirSync(join(data, 'runs'));
    expect(runs).toHaveLength(1);
    expect(existsSync(join(data, 'runs', runs[0], 'pending-standard.json'))).toBe(true);
  });

  it('a pending standard that is not the one this run ratified is refused, not compiled', () => {
    const { data, proj } = fresh();
    add(data, proj, 'Any rule.');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    // Simulate drift: the session forgets its hash (a rewritten or foreign session file).
    const sessions = join(data, 'sessions');
    const file = join(sessions, readdirSync(sessions).find((f) => f.endsWith('.json'))!);
    const s = JSON.parse(readFileSync(file, 'utf8')) as { run: { standardVersionHash: string | null } };
    s.run.standardVersionHash = 'deadbeefdeadbeef';
    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(JSON.stringify(s))})`]);
    const out = run(data, proj, 'build', '--name', 'drift');
    expect(out).toMatch(/^EXIT:1/);
    expect(out).toContain('ratified deadbeefdeadbeef');
    expect(existsSync(join(data, 'skills', 'drift'))).toBe(false);
  });
});

describe('P0-2: --skill cannot leave skills/', () => {
  it.each([
    ['feedback', '--skill', '../../escaped', '--invocation', 'i1', '--verdict', 'GOOD'],
    ['inspect', '--skill', '../escaped'],
    ['history', '--skill', 'a/b'],
    ['rollback', '--skill', '..', '--to', 'x'],
    ['plan', '--skill', 'Has Spaces'],
  ])('%s refuses a name that is not a skill name', (...args) => {
    const { data, proj } = fresh();
    const out = run(data, proj, ...args);
    expect(out).toMatch(/^EXIT:1/);
    expect(out).toContain('is not a skill name');
    // Nothing was created anywhere: the store root holds nothing but what `fresh()` made.
    expect(readdirSync(data)).toEqual([]);
    expect(existsSync(join(data, '..', 'escaped'))).toBe(false);
  });

  it('a well-formed name still works, so the guard is a guard and not a lockout', () => {
    const { data, proj } = fresh();
    add(data, proj, 'a rule');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'real-name');
    const out = run(data, proj, 'feedback', '--skill', 'real-name', '--invocation', 'i1', '--verdict', 'GOOD');
    expect(out).not.toMatch(/^EXIT:/);
    expect(existsSync(join(data, 'skills', 'real-name', 'events.jsonl'))).toBe(true);
  });
});

describe('P0-3: every rule a person adds survives to the standard', () => {
  it('`add` and a batch ADD do not share an id', () => {
    const { data, proj } = fresh();
    expect(add(data, proj, 'rule A')).toContain('added x1');
    const batch = run(data, proj, 'ratify', '--decisions',
      JSON.stringify([{ decision: 'ADD', statement: 'rule B', kind: 'GENERATIVE' }]));
    expect(batch).not.toMatch(/^EXIT:/);
    const close = run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(close).toContain('2 requirements');
    const runs = readdirSync(join(data, 'runs'));
    const pending = readFileSync(join(data, 'runs', runs[0], 'pending-standard.json'), 'utf8');
    expect(pending).toContain('rule A');
    expect(pending).toContain('rule B');
    expect(pending).toContain('"x2"');
  });

  it('two batch ADDs in separate calls do not collide either', () => {
    const { data, proj } = fresh();
    run(data, proj, 'ratify', '--decisions', JSON.stringify([{ decision: 'ADD', statement: 'first', kind: 'GENERATIVE' }]));
    run(data, proj, 'ratify', '--decisions', JSON.stringify([{ decision: 'ADD', statement: 'second', kind: 'GENERATIVE' }]));
    const close = run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(close).toContain('2 requirements');
  });
});

describe('P0-4: a project is never a dead end', () => {
  it('a rule added after a build closes as a superseding StandardVersion and builds again', () => {
    const { data, proj } = fresh();
    add(data, proj, 'first rule');
    const close1 = run(data, proj, 'ratify-close', '--work-type', 'writing');
    const v1 = /StandardVersion ([0-9a-f]{16})/.exec(close1)![1];
    expect(run(data, proj, 'build', '--name', 'grow')).toContain('Your skill is ready');

    const added = add(data, proj, 'second rule');
    expect(added).toContain('supersedes');                     // the user is told what closing will do

    // Without a reason: refused, and the refusal says what to type — never "abort".
    const noReason = run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(noReason).toMatch(/^EXIT:1/);
    expect(noReason).toContain('--reason');
    expect(noReason).not.toContain('atelier abort');

    const close2 = run(data, proj, 'ratify-close', '--work-type', 'writing', '--reason', 'forgot one');
    expect(close2).not.toMatch(/^EXIT:/);
    const v2 = /StandardVersion ([0-9a-f]{16})/.exec(close2)![1];
    expect(v2).not.toBe(v1);

    const build2 = run(data, proj, 'build', '--name', 'grow');
    expect(build2).toContain('Your skill is ready');
    expect(readFileSync(skillFile(proj, 'grow'), 'utf8')).toContain('second rule');

    const history = run(data, proj, 'history', '--skill', 'grow');
    expect(history.trim().split('\n')).toHaveLength(2);
    const stored = JSON.parse(readFileSync(join(data, 'skills', 'grow', 'standards', `${v2}.json`), 'utf8')) as { supersedes: string | null; reason: string | null };
    expect(stored.supersedes).toBe(v1);
    expect(stored.reason).toBe('forgot one');
  });

  it('a rule added after close but before build also supersedes', () => {
    const { data, proj } = fresh();
    add(data, proj, 'one');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    add(data, proj, 'two');
    const close = run(data, proj, 'ratify-close', '--work-type', 'writing', '--reason', 'one more');
    expect(close).toContain('2 requirements');
    expect(run(data, proj, 'build', '--name', 'both')).toContain('Your skill is ready');
  });

  it('closing the same decisions twice says nothing changed, instead of minting a duplicate', () => {
    const { data, proj } = fresh();
    add(data, proj, 'one');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    const again = run(data, proj, 'ratify-close', '--work-type', 'writing', '--reason', 'no reason at all');
    expect(again).toMatch(/^EXIT:1/);
    expect(again).toContain('nothing changed');
  });

  it('`abort` puts the run aside, and the next command starts a new one', () => {
    const { data, proj } = fresh();
    add(data, proj, 'doomed');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'doomed');
    const aborted = run(data, proj, 'abort');
    expect(aborted).toContain('run aborted');
    expect(run(data, proj, 'status')).toContain('state EMPTY');

    // Nothing is lost: the aborted run is archived, not deleted.
    expect(readdirSync(join(data, 'sessions', 'aborted'))).toHaveLength(1);

    // And the project is usable: this used to be refused forever as "a terminal run is never resumed".
    add(data, proj, 'reborn');
    const close = run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(close).not.toMatch(/^EXIT:/);
    expect(close).toContain('1 requirements');
    expect(run(data, proj, 'build', '--name', 'reborn')).toContain('Your skill is ready');
  });

  it('`abort` with nothing in flight is harmless, and does not brick the project', () => {
    const { data, proj } = fresh();
    expect(run(data, proj, 'abort')).toContain('nothing in flight');
    add(data, proj, 'after');
    expect(run(data, proj, 'ratify-close', '--work-type', 'writing')).not.toMatch(/^EXIT:/);
  });

  it('a refused build writes nothing: no store entry, no installed skill', () => {
    const { data, proj } = fresh();
    add(data, proj, 'one');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'first');
    const second = run(data, proj, 'build', '--name', 'second');
    expect(second).toMatch(/^EXIT:1/);
    expect(existsSync(join(data, 'skills', 'second')), 'a refused build reached the store').toBe(false);
    expect(existsSync(join(proj, '.claude', 'skills', 'second')), 'a refused build was installed').toBe(false);
  });

  it('`--review` really writes nothing', () => {
    const { data, proj } = fresh();
    add(data, proj, 'one');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    const out = run(data, proj, 'build', '--name', 'peek', '--review');
    expect(out).toContain('stopping before anything is written');
    expect(existsSync(join(data, 'skills', 'peek'))).toBe(false);
    expect(existsSync(join(proj, '.claude'))).toBe(false);
    // And the run did not advance, so the real build is still available.
    expect(run(data, proj, 'build', '--name', 'peek')).toContain('Your skill is ready');
  });
});

describe('upgrade: working files left at the store root by an older version are adopted', () => {
  it('when this is the only run under the store, the root pending standard moves into runs/', () => {
    const { data, proj } = fresh();
    add(data, proj, 'legacy rule');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    // Move the file back to where the old layout kept it, as an upgrade would find it.
    const runs = join(data, 'runs');
    const from = join(runs, readdirSync(runs)[0], 'pending-standard.json');
    const rootFile = join(data, 'pending-standard.json');
    execFileSync('node', ['-e', `require('fs').renameSync(${JSON.stringify(from)}, ${JSON.stringify(rootFile)})`]);
    expect(existsSync(from)).toBe(false);

    const out = run(data, proj, 'build', '--name', 'adopted');
    expect(out).toContain('Your skill is ready');
    expect(existsSync(rootFile), 'the legacy file was copied rather than moved').toBe(false);
  });

  it('with two runs in flight, a root file is left alone rather than guessed at', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p0-data-'));
    const a = mkdtempSync(join(tmpdir(), 'atelier-p0-a-'));
    const b = mkdtempSync(join(tmpdir(), 'atelier-p0-b-'));
    add(data, a, 'a');
    add(data, b, 'b');
    mkdirSync(data, { recursive: true });
    const rootFile = join(data, 'pending-standard.json');
    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(rootFile)}, '{}')`]);
    run(data, a, 'status');
    expect(existsSync(rootFile)).toBe(true);
  });
});
