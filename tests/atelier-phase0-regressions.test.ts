// tests/atelier-phase0-regressions.test.ts — defects found by the 2026-09-25/26 audits, each pinned
// through the shipped binary, because every one of them was invisible to a source-level guard.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
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
// realpath, because on macOS tmpdir() is /var/... and the CLI's process.cwd() reports the resolved
// /private/var/...: a test comparing the two failed on the path spelling, not on the behaviour.
const fresh = (): { data: string; proj: string } => ({
  data: realpathSync(mkdtempSync(join(tmpdir(), 'atelier-p0-data-'))),
  proj: realpathSync(mkdtempSync(join(tmpdir(), 'atelier-p0-proj-'))),
});

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

  it('the author\'s "I" survives, the join reads as English, and the measured two-branch frame is kept', () => {
    expect(md).toContain('When final paragraph and the story invites a generic best-practice moral, I close by refusing the obvious takeaway. When that does not hold, do not.');
    expect(md).not.toMatch(/\bi close\b/);
  });

  // Phase A: a quantified noun phrase after "When" was not a sentence. Only that shape moves frame.
  const render = (appliesWhen: string, statement: string): string => {
    const one = { ...v, requirements: [{ ...v.requirements[0], appliesWhen, statement }] } as StandardVersion;
    return renderAgentSkill(one, compileArchitecture(one), 'voice', 'd').files['SKILL.md'];
  };

  it('a quantified noun-phrase condition reads "For …, … Elsewhere, do not."', () => {
    const out = render('any statement about size, frequency, or duration', 'I give the number, not an adjective.');
    expect(out).toContain('For any statement about size, frequency, or duration, I give the number, not an adjective. Elsewhere, do not.');
    expect(out).not.toContain('When any statement');
    expect(render('each section header', 'Keep it under six words.')).toContain('For each section header, keep it under six words. Elsewhere, do not.');
  });

  it('a clause keeps the measured When frame verbatim, articles and quantified clauses alike', () => {
    expect(render('the post reports an outcome metric', 'I name the baseline.'))
      .toContain('When the post reports an outcome metric, I name the baseline. When that does not hold, do not.');
    expect(render('every piece ends with a question', 'I answer it first.'))
      .toContain('When every piece ends with a question, I answer it first. When that does not hold, do not.');
    expect(render('any figure is an estimate', 'I say so.'))
      .toContain('When any figure is an estimate, I say so. When that does not hold, do not.');
  });
});

// ── Found by the Phase 0 gap audit ─────────────────────────────────────────────────────────────
import * as store from '../core/state/store.js';
import { mkdirSync } from 'node:fs';

const runIn = (data: string, cwd: string, ...args: string[]): string => {
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data };
  delete env.ATELIER_PROJECT_DIR; delete env.CLAUDE_PROJECT_DIR;
  try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd, env }); }
  catch (e) { const err = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`; }
};

describe('a command typed in a subdirectory finds the project run above it', () => {
  it('status in docs/ reports the run made at the project root', () => {
    const { data, proj } = fresh();
    runIn(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    const sub = join(proj, 'docs', 'drafts');
    mkdirSync(sub, { recursive: true });
    const out = runIn(data, sub, 'status');
    expect(out).toMatch(/decided 1/);
    expect(out).toContain(`project ${proj}`);
  });
});

describe('a closed rule can be reweighed', () => {
  it('amend --materiality REQUIRED makes a PREFERRED rule instruct, as a recorded supersession', () => {
    const { data, proj } = fresh();
    run(data, proj, 'add', '--statement', 'Open with a scene.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'PREFERRED');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'demo');
    const out = run(data, proj, 'amend', '--skill', 'demo', '--rule', 'x1', '--materiality', 'REQUIRED', '--reason', 'it is not optional');
    expect(out).toMatch(/weight PREFERRED -> REQUIRED/);
    const text = run(data, proj, 'plan', '--skill', 'demo', '--json');
    const plan = JSON.parse(text.slice(text.lastIndexOf('\n{'))) as { rows: { materiality: string; gateRole: string }[] };
    expect(plan.rows[0].materiality).toBe('REQUIRED');
    expect(plan.rows[0].gateRole).toBe('ENFORCE');
  });
});

describe('the ledger store', () => {
  it('the first ledger for a standard wins; a second, differing only by time, does not block the build', () => {
    const root = mkdtempSync(join(tmpdir(), 'atelier-ledger-'));
    const L: store.StoreLayout = { root, skillName: 'demo' };
    const rec = (at: string) => ({ standardDraftHash: 'd', records: [{ requirementId: 'p1', decision: 'APPROVE', decidedAt: at, resultingStandardVersionHash: 's1' }] }) as never;
    store.putLedger(L, 's1', rec('2026-01-01'));
    expect(() => { store.putLedger(L, 's1', rec('2026-02-02')); }).not.toThrow();
    expect(JSON.stringify(store.getLedger(L, 's1'))).toContain('2026-01-01');
  });
});

describe('a value is not an option', () => {
  it('a statement that spells --name does not trip the duplicate-option refusal', () => {
    const { data, proj } = fresh();
    const out = run(data, proj, 'add', '--statement', '--name', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--name', 'x');
    expect(out).not.toMatch(/given more than once/);
  });
});

describe('a blog post is finished work, whatever its title says', () => {
  it('"playbook", "framework" or "before" in a title does not move a post out of the corpus; a methodology/ folder does', () => {
    const { data, proj } = fresh();
    const dir = join(proj, 'posts');
    execFileSync('mkdir', ['-p', join(dir, 'methodology')]);
    const body = 'A real sentence of finished prose sits here. '.repeat(20);
    for (const n of ['the-data-engineering-playbook-for-ai.md', 'the-compound-product-framework.md', 'what-i-knew-before-launch.md', 'plain-post.md'])
      writeFileSync(join(dir, n), body);
    writeFileSync(join(dir, 'methodology', 'how-we-review.md'), body);
    const out = run(data, proj, 'intake', dir, '--dry-run');
    expect(out).toMatch(/We will read \*\*2\*\* of your examples/);
    expect(out).toMatch(/1 methodology document/);
    expect(out).not.toMatch(/you rejected/);
  });
});

// ── Found by the Phase A audit (2026-09-28) ─────────────────────────────────────────────────────

describe('a conditional measured rule can be widened, and verify says how', () => {
  it('verify prints the exact amend; amend --applies-when GENERAL alone is accepted; the rule is then checked', () => {
    const { data, proj } = fresh();
    run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'GENERATIVE', '--applies-when', 'the post is about strategy',
      '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'demo');
    writeFileSync(join(proj, 't.md'), 'We leverage things.');
    const before = run(data, proj, 'verify', '--skill', 'demo', 't.md');
    expect(before).not.toMatch(/^EXIT:/);
    expect(before).toContain('atelier amend --skill demo --rule x1 --applies-when GENERAL --reason "<why>"');
    const amended = run(data, proj, 'amend', '--skill', 'demo', '--rule', 'x1', '--applies-when', 'GENERAL', '--reason', 'it holds everywhere');
    expect(amended).not.toMatch(/^EXIT:/);
    expect(amended).toMatch(/applies when: the post is about strategy {2}-> {2}GENERAL/);
    const after = run(data, proj, 'verify', '--skill', 'demo', 't.md');
    expect(after).toMatch(/^EXIT:1/);
    expect(after).toMatch(/FAIL {2}x1 {2}Never say leverage\./);
    expect(after).not.toContain('--applies-when GENERAL');
  });

  it('amend with nothing to change is still refused', () => {
    const { data, proj } = fresh();
    run(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    run(data, proj, 'ratify-close', '--work-type', 'writing');
    run(data, proj, 'build', '--name', 'demo');
    expect(run(data, proj, 'amend', '--skill', 'demo', '--rule', 'x1', '--reason', 'r')).toMatch(/^EXIT:1[\s\S]*--applies-when <condition>\|GENERAL required/);
  });
});
