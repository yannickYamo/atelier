// tests/atelier-session-isolation.test.ts — A RUN BELONGS TO A PROJECT, NOT TO A MACHINE.
//
// The session used to be a single `~/.atelier/session.json`. Finished skills never collided, because
// the store already namespaces them under `skills/<name>/`. The run IN FLIGHT did. Starting a corpus
// in one project silently inherited the half-finished run from another, and the symptom was an
// illegal-transition refusal naming a state the person had never put anything into — the worst kind
// of error, because the cause was a file they were never told existed.
//
// Two properties are worth pinning and they fail differently. Isolation is what the change is for.
// Migration is the promise that upgrading does not strand a run someone is in the middle of, and it
// has a sharp edge: the legacy file must be MOVED, because a readable one would be adopted by every
// project in turn, which is the collision this exists to end.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const roots: string[] = [];
const scratch = (p: string): string => {
  const d = mkdtempSync(join(tmpdir(), p));
  roots.push(d);
  return d;
};
afterEach(() => { roots.splice(0).forEach((d) => { rmSync(d, { recursive: true, force: true }); }); });

/** The runtime resolves ATELIER_DATA at module load, so each question needs a fresh module graph. */
const inProject = async <T>(data: string, project: string, fn: (rt: {
  sessionPath: () => string;
  loadSession: () => { decided: unknown[] };
  saveSession: (s: unknown) => void;
}) => T): Promise<T> => {
  const prior = { data: process.env.ATELIER_DATA, proj: process.env.ATELIER_PROJECT_DIR };
  process.env.ATELIER_DATA = data;
  process.env.ATELIER_PROJECT_DIR = project;
  try {
    vi.resetModules();
    return fn(await import('../cli/runtime.js') as never);
  } finally {
    process.env.ATELIER_DATA = prior.data;
    process.env.ATELIER_PROJECT_DIR = prior.proj;
  }
};

const sessionWith = (decided: unknown[]): unknown => ({
  run: { runId: 'r1', state: 'EMPTY', enrolments: [], corpusHash: null, listHash: null,
    standardVersionHash: null, preference: null, terminal: null },
  skillName: null, evidence: null, proposals: [], decided, reservation: null,
});

describe('two projects sharing one store keep separate runs', () => {
  it('resolves a different session file per project, under one data dir', async () => {
    const data = scratch('atelier-iso-data-');
    const a = scratch('atelier-alpha-');
    const b = scratch('atelier-beta-');

    const pa = await inProject(data, a, (rt) => rt.sessionPath());
    const pb = await inProject(data, b, (rt) => rt.sessionPath());

    expect(pa).not.toBe(pb);
    // Both live under the shared store: this separates RUNS, it does not fork the data directory.
    expect(pa.startsWith(data)).toBe(true);
    expect(pb.startsWith(data)).toBe(true);
  });

  it('the file is named after the project, so `ls sessions/` is legible to a person', async () => {
    const data = scratch('atelier-iso-data-');
    const proj = join(scratch('atelier-holder-'), 'my-project');
    mkdirSync(proj, { recursive: true });
    const p = await inProject(data, proj, (rt) => rt.sessionPath());
    expect(p).toContain('my-project');
  });

  it('a run saved in one project is not visible from the other', async () => {
    const data = scratch('atelier-iso-data-');
    const a = scratch('atelier-alpha-');
    const b = scratch('atelier-beta-');

    await inProject(data, a, (rt) => { rt.saveSession(sessionWith([{ requirementId: 'alpha-only' }])); });

    const seenFromB = await inProject(data, b, (rt) => rt.loadSession());
    expect(seenFromB.decided, 'project B inherited project A\'s in-flight run').toEqual([]);

    // And A still has its own, so isolation is not achieved by losing the run.
    const seenFromA = await inProject(data, a, (rt) => rt.loadSession());
    expect(seenFromA.decided).toHaveLength(1);
  });
});

describe('an upgrade does not strand a run that was already in flight', () => {
  const seedLegacy = (data: string, decided: unknown[]): void => {
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, 'session.json'), JSON.stringify(sessionWith(decided)));
  };

  it('adopts the previous global run into the project that asks first', async () => {
    const data = scratch('atelier-mig-data-');
    const proj = scratch('atelier-mig-proj-');
    seedLegacy(data, [{ requirementId: 'from-the-old-world' }]);

    const s = await inProject(data, proj, (rt) => rt.loadSession());
    expect(s.decided).toHaveLength(1);

    const p = await inProject(data, proj, (rt) => rt.sessionPath());
    expect(existsSync(p), 'the adopted run was not written to the project path').toBe(true);
  });

  it('MOVES the legacy file, so a second project cannot adopt the same run', async () => {
    const data = scratch('atelier-mig-data-');
    const first = scratch('atelier-mig-first-');
    const second = scratch('atelier-mig-second-');
    seedLegacy(data, [{ requirementId: 'claimed-once' }]);

    await inProject(data, first, (rt) => rt.loadSession());
    expect(existsSync(join(data, 'session.json')), 'legacy file still adoptable').toBe(false);
    expect(existsSync(join(data, 'session.json.migrated')), 'legacy file was deleted, not moved').toBe(true);

    const s = await inProject(data, second, (rt) => rt.loadSession());
    expect(s.decided, 'a second project adopted an already-claimed run').toEqual([]);
  });

  it('a project with no legacy file and no session starts empty', async () => {
    const data = scratch('atelier-fresh-data-');
    const proj = scratch('atelier-fresh-proj-');
    const s = await inProject(data, proj, (rt) => rt.loadSession());
    expect(s.decided).toEqual([]);
    // Polarity: prove the fixture really is empty rather than the assertion being unreachable.
    expect(existsSync(join(data, 'sessions'))).toBe(false);
  });
});

describe('the store itself is still shared', () => {
  it('sessions live beside skills, not instead of them', async () => {
    const data = scratch('atelier-shared-');
    const a = scratch('atelier-a-');
    mkdirSync(join(data, 'skills', 'existing-skill'), { recursive: true });

    await inProject(data, a, (rt) => { rt.saveSession(sessionWith([])); });

    const entries = readdirSync(data).sort();
    expect(entries).toContain('skills');
    expect(entries).toContain('sessions');
    // A compiled skill from any project remains reachable; only the run in flight is partitioned.
    expect(existsSync(join(data, 'skills', 'existing-skill'))).toBe(true);
  });

  it('the session path sits under a sessions/ directory that is created on save', async () => {
    const data = scratch('atelier-mk-');
    const a = scratch('atelier-mk-proj-');
    const p = await inProject(data, a, (rt) => { rt.saveSession(sessionWith([])); return rt.sessionPath(); });
    expect(dirname(p)).toBe(join(data, 'sessions'));
    expect(JSON.parse(readFileSync(p, 'utf8'))).toHaveProperty('run');
  });
});

describe('a moved project can find the run it left behind', () => {
  // Runs are keyed by the project PATH, so renaming a directory mid-run leaves the old session
  // unreachable by name and a fresh empty one in its place. Silently, before this: the person saw
  // "decided 0" and had no way to learn their work still existed. The recovery is only possible
  // because the file records where it came from.
  it('records which project a run belongs to', async () => {
    const data = scratch('atelier-rec-data-');
    const proj = scratch('atelier-rec-proj-');
    await inProject(data, proj, (rt) => { rt.saveSession(sessionWith([])); });
    const p = await inProject(data, proj, (rt) => rt.sessionPath());
    expect((JSON.parse(readFileSync(p, 'utf8')) as { projectDir?: string }).projectDir).toBe(proj);
  });

  it('lists the other runs in flight, and marks which one is here', async () => {
    const data = scratch('atelier-rec-data-');
    const a = scratch('atelier-rec-a-');
    const b = scratch('atelier-rec-b-');
    await inProject(data, a, (rt) => { rt.saveSession(sessionWith([{ requirementId: 'x' }])); });

    const fromB = await inProject(data, b, (rt) => (rt as unknown as {
      listSessions: () => { projectDir: string | null; here: boolean }[] }).listSessions());
    expect(fromB).toHaveLength(1);
    expect(fromB[0].projectDir, 'the orphan does not say where it came from').toBe(a);
    expect(fromB[0].here).toBe(false);
  });

  it('a damaged session file is still listed, so it does not hide the others', async () => {
    const data = scratch('atelier-rec-data-');
    const a = scratch('atelier-rec-a-');
    const b = scratch('atelier-rec-b-');
    await inProject(data, a, (rt) => { rt.saveSession(sessionWith([])); });
    writeFileSync(await inProject(data, a, (rt) => rt.sessionPath()), 'not json at all');

    const fromB = await inProject(data, b, (rt) => (rt as unknown as {
      listSessions: () => { projectDir: string | null }[] }).listSessions());
    expect(fromB).toHaveLength(1);
    expect(fromB[0].projectDir, 'a damaged file should list with no project, not vanish').toBeNull();
  });
});
