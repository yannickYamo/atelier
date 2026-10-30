// tests/atelier-ratify-decisions-file.test.ts — `--decisions @file`, AGAINST THE BINARY.
//
// A tester's endpoint agent killed the node process whenever one argument ran to 1,024 characters or
// more, and a real batch of rulings passes that after a handful of proposals. So the decisions can
// come from a file named `@<path>`. The inline form must keep working, a long file must arrive whole,
// and a path that cannot be read must stop with its name and leave the store exactly as it was.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');

beforeAll(() => {
  // NEVER REBUILD FROM INSIDE A TEST FILE: `npm test` builds once, before any worker starts.
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` before running this file alone.`);
});

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
  data: mkdtempSync(join(tmpdir(), 'atelier-decfile-data-')),
  proj: mkdtempSync(join(tmpdir(), 'atelier-decfile-proj-')),
});

/** Every file under a directory with its bytes, so "nothing written" is a comparison, not a hope. */
const snapshot = (root: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else out[relative(root, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(root);
  return out;
};

const pendingStandard = (data: string): string => {
  const runs = readdirSync(join(data, 'runs'));
  return readFileSync(join(data, 'runs', runs[0], 'pending-standard.json'), 'utf8');
};

describe('ratify --decisions takes the JSON inline or from @<file>', () => {
  it('the inline form still works', () => {
    const { data, proj } = fresh();
    const out = run(data, proj, 'ratify', '--decisions', JSON.stringify([{ decision: 'ADD', statement: 'inline rule', kind: 'GENERATIVE' }]));
    expect(out).not.toMatch(/^EXIT:/);
    expect(run(data, proj, 'ratify-close', '--work-type', 'writing')).toContain('1 requirements');
    expect(pendingStandard(data)).toContain('inline rule');
  });

  it('a decisions file of more than 1,024 characters is read whole', () => {
    const { data, proj } = fresh();
    const long = `File rule ${'x'.repeat(1200)} end-of-file-rule`;
    const decisions = JSON.stringify([
      { decision: 'ADD', statement: long, kind: 'GENERATIVE' },
      { decision: 'ADD', statement: 'second file rule', kind: 'BOUNDARY' },
    ], null, 2);
    expect(decisions.length).toBeGreaterThan(1024);
    writeFileSync(join(proj, 'decisions.json'), decisions);
    const out = run(data, proj, 'ratify', '--decisions', '@decisions.json');
    expect(out).not.toMatch(/^EXIT:/);
    expect(run(data, proj, 'ratify-close', '--work-type', 'writing')).toContain('2 requirements');
    const std = pendingStandard(data);
    expect(std).toContain(long);
    expect(std).toContain('second file rule');
  });

  it('a missing file is refused by name, exits non-zero, and writes nothing', () => {
    const { data, proj } = fresh();
    run(data, proj, 'add', '--statement', 'a rule already there', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    const before = snapshot(data);
    const out = run(data, proj, 'ratify', '--decisions', '@no-such-rulings.json');
    expect(out).toMatch(/^EXIT:1/);
    expect(out).toContain('no-such-rulings.json');
    expect(out).not.toContain('not valid JSON');
    expect(snapshot(data)).toEqual(before);
  });
});
