// tests/atelier-phase0-regressions.test.ts — defects found by the 2026-09-25/26 audits, each pinned
// through the shipped binary, because every one of them was invisible to a source-level guard.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { USAGE } from '../cli/help.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const CLI = resolve('dist/cli/atelier.mjs');
beforeAll(() => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
});

const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};
const fresh = (): { data: string; proj: string } =>
  ({ data: mkdtempSync(join(tmpdir(), 'atelier-p0-data-')), proj: mkdtempSync(join(tmpdir(), 'atelier-p0-proj-')) });

describe('--help never runs the command', () => {
  it('abort --help prints usage and leaves the run in place', () => {
    const { data, proj } = fresh();
    run(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    const out = run(data, proj, 'abort', '--help');
    expect(out).toMatch(/^usage: atelier abort/);
    expect(run(data, proj, 'status')).toMatch(/decided 1/);
  });

  it('every dispatched command has a usage line', () => {
    // Read from source: importing the dispatcher would run it.
    const src = readFileSync('cli/atelier.mts', 'utf8');
    const dispatched = [...src.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]);
    expect(dispatched.length).toBeGreaterThan(30);
    expect(dispatched.filter((c) => !(c in USAGE))).toEqual([]);
  });

  it('--version answers', () => {
    const { data, proj } = fresh();
    expect(run(data, proj, '--version').trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('--reserve keeps every value', () => {
  it('two --reserve flags reserve two pieces, not the last one', () => {
    const { data, proj } = fresh();
    const corpus = join(proj, 'work');
    execFileSync('mkdir', ['-p', corpus]);
    for (let i = 0; i < 5; i++) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}. ${'A sentence of real prose. '.repeat(20)}`);
    const out = run(data, proj, 'intake', corpus, '--reserve', 'p0.md', '--reserve', 'p1.md');
    expect(out).toMatch(/p0\.md/);
    expect(out).toMatch(/p1\.md/);
    expect(out).toMatch(/RESERVED/);
  });

  it('a single-valued option given twice is refused, not resolved last-wins', () => {
    const { data, proj } = fresh();
    expect(run(data, proj, 'build', '--name', 'a', '--name', 'b')).toMatch(/--name was given more than once/);
  });
});

describe('closing a standard that instructs nothing says so', () => {
  it('an empty-instruction close warns before pointing at build', () => {
    const { data, proj } = fresh();
    // A PREFERRED rule the person wrote is shown, never instructed.
    run(data, proj, 'add', '--statement', 'Open with a scene.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED');
    const out = run(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(out).toMatch(/PREFERRED is shown to the model as an example, not instructed/);
    expect(out).toMatch(/NOTHING HERE INSTRUCTS THE MODEL YET/);
  });
});

describe('a conditional rule reads as English', () => {
  const v: StandardVersion = {
    standardVersionHash: 's', evidenceId: null, workType: 'writing', authorityState: 'RATIFIED',
    mintedAt: '2026-09-26T00:00:00Z', reason: null, supersedes: null,
    requirements: [{
      requirementId: 'x1', statement: 'I close by refusing the obvious takeaway.',
      appliesWhen: 'final paragraph; the story invites a generic best-practice moral',
      kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED', wouldBeAbsentIf: null,
      evidence: null, evidenceItemId: null, materiality: 'REQUIRED', realizationTolerance: 'FLEXIBLE', outputShape: null,
    }],
  } as unknown as StandardVersion;
  const md = renderAgentSkill(v, compileArchitecture(v), 'voice', 'd').files['SKILL.md'];

  it('the author\'s "I" survives, the semicolon is resolved, and both branches are stated', () => {
    expect(md).toContain('Only when final paragraph, and the story invites a generic best-practice moral: I close by refusing the obvious takeaway. Otherwise, don\'t.');
    expect(md).not.toMatch(/\bi close\b/);
  });
});
