// tests/atelier-phase0-regressions.test.ts — defects found by the 2026-09-25/26 audits and the 2026-09-28
// Phase A audit, each pinned through the shipped binary, because every one of them was invisible to a
// source-level guard.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

  it('bare --help leads with the common workflow, in order, then still lists every command', () => {
    const { data, proj } = fresh();
    const out = run(data, proj, '--help');
    expect(out).not.toMatch(/^EXIT:/);
    const lines = out.split('\n');
    expect(lines[0]).toBe('common workflow:');
    expect(lines.slice(1, 7).map((l) => /atelier ([a-z]+)/.exec(l)?.[1])).toEqual(['new', 'invoke', 'verify', 'material', 'fix', 'status']);
    // AGENTS.md: "`atelier --help` lists everything". `study` is the one eval-only command left out.
    const every = /every command: (.+)/.exec(out)?.[1].split(' · ') ?? [];
    expect(Object.keys(USAGE).filter((c) => c !== 'study' && !every.includes(c))).toEqual([]);
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

/** A built skill holding one inferred, unconfirmed prohibition: what `confirm` rules on. */
const seedInferred = (): { data: string; proj: string; L: store.StoreLayout; first: string } => {
  const { data, proj } = fresh();
  const L: store.StoreLayout = { root: data, skillName: 'demo' };
  store.initStore(L);
  const base = { appliesWhen: 'GENERAL', evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
    realizationTolerance: 'FLEXIBLE', outputShape: null } as const;
  const sv0 = {
    standardVersionHash: 'std0', evidenceId: null, workType: 'writing', authorityState: 'PARTIAL',
    mintedAt: '2026-09-01T00:00:00Z', reason: null, supersedes: null,
    requirements: [
      { ...base, requirementId: 'x1', statement: 'Lead with the action.', kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED', materiality: 'REQUIRED' },
      { ...base, requirementId: 'p2', statement: 'Never open with a question.', kind: 'BOUNDARY', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED', materiality: null },
    ],
  } as unknown as StandardVersion;
  const arch = compileArchitecture(sv0);
  const pkg = renderAgentSkill(sv0, arch, 'demo', 'd');
  store.putStandard(L, sv0); store.putArchitecture(L, arch); store.putPackage(L, pkg);
  store.putSkillVersion(L, { skillVersionHash: 'k0', skillName: 'demo', standardVersionHash: 'std0', architectureHash: arch.architectureHash,
    materializedHash: pkg.packageHash, builtAt: '2026-09-01T00:00:00Z', description: 'd' } as never);
  store.setActive(L, 'k0');
  return { data, proj, L, first: 'k0' };
};

describe('the same standard minted twice is one version, not a conflict', () => {
  it('confirm, rollback, confirm again: the second confirm installs, reusing the first mint', () => {
    const { data, proj, L, first } = seedInferred();
    expect(run(data, proj, 'confirm', '--skill', 'demo', '--rule', 'p2')).toMatch(/Confirmed\./);
    const confirmed = store.getActive(L)!;
    const stdHash = store.getSkillVersion(L, confirmed)!.standardVersionHash;
    const mintedAt = store.getStandard(L, stdHash)!.mintedAt;
    expect(run(data, proj, 'rollback', '--skill', 'demo', '--to', first)).toMatch(/rolled back/);
    const again = run(data, proj, 'confirm', '--skill', 'demo', '--rule', 'p2');
    expect(again).not.toMatch(/^EXIT:/);
    expect(again).toMatch(/Confirmed\./);
    expect(store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash).toBe(stdHash);
    expect(store.getStandard(L, stdHash)!.mintedAt, 'the stored file is kept, not replaced').toBe(mintedAt);
  });

  it('the store still refuses a different body under an existing hash (the polarity)', () => {
    const { L } = seedInferred();
    const v = store.getStandard(L, 'std0')!;
    expect(() => store.putStandard(L, { ...v, mintedAt: '2030-01-01T00:00:00Z', reason: 'again' })).not.toThrow();
    expect(store.putStandard(L, { ...v, mintedAt: '2030-01-01T00:00:00Z' }).mintedAt).toBe('2026-09-01T00:00:00Z');
    expect(() => store.putStandard(L, { ...v, workType: 'journal' })).toThrow(/two bodies cannot share one/);
  });
});

describe('confirm installs before it activates', () => {
  it('a failed install leaves the active pointer where it was', () => {
    const { data, proj, L, first } = seedInferred();
    // A regular file where the skills DIRECTORY must go makes every install fail.
    mkdirSync(join(proj, '.claude'), { recursive: true });
    writeFileSync(join(proj, '.claude', 'skills'), 'not a directory');
    const out = run(data, proj, 'confirm', '--skill', 'demo', '--rule', 'p2');
    expect(out).toMatch(/^EXIT:1[\s\S]*install failed/);
    expect(store.getActive(L), 'a failed install must not move the active pointer').toBe(first);
  });
});

// ── Phase A, through a model: the scripted backend ─────────────────────────────────────────────
// The defects below need a model to reach, so this part of the file runs the binary against
// tests/fixtures/scripted-backend.mjs, out of process for the reason that file gives.
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync } from 'node:fs';

let backend: ChildProcess; let port = 0;

const factor = (description: string, needs = '') => ({
  description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'],
  wouldBeAbsentIf: 'the opposite shows', needsFromUser: needs, quote: '',
});
const CHAIN = { byTool: {
  emit_factors: { factors: [factor('Lead with the decision, then the reasoning.'), factor('Quantify with the real figure.', 'the actual figures for the period')] },
  emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] },
  emit_observation: { applicable: true, present: true, why: 'seen' },
  emit_rules: { rules: [{ statement: 'Lead with the decision.', appliesWhen: 'GENERAL', evidence: '', evidenceItemId: 'post-0.md',
    kind: 'GENERATIVE', wouldBeAbsentIf: 'the reasoning comes first' }] },
} };
const script = async (body: unknown): Promise<void> => {
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
};

beforeAll(async () => {
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  await script(CHAIN);
});
afterAll(() => { backend.kill(); });

const MODEL = () => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
const runM = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};
const corpus = (proj: string, n: number): string => {
  const dir = join(proj, 'posts');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) writeFileSync(join(dir, `post-${i}.md`), `Post ${i}. ${'We decided first, and explained after. '.repeat(12)}`);
  return dir;
};
const session = (data: string): { proposals: { requirementId: string }[]; run: { heldOutChecked?: boolean } } => {
  const dir = join(data, 'sessions');
  return JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')) as never;
};
const pending = (data: string): { requirements: { requirementId: string; prerequisites?: { why: string }[] }[] } => {
  const runs = readdirSync(join(data, 'runs'));
  return JSON.parse(readFileSync(join(data, 'runs', runs[0], 'pending-standard.json'), 'utf8')) as never;
};

describe('a staged ruling silent on `needs` keeps what discovery found', () => {
  const discovered = (): { data: string; proj: string; ids: string[] } => {
    const { data, proj } = fresh();
    runM(data, proj, 'intake', corpus(proj, 8));
    const out = runM(data, proj, 'discover', '--no-contrast', ...MODEL());
    expect(out).not.toMatch(/^EXIT:/);
    return { data, proj, ids: session(data).proposals.map((p) => p.requirementId) };
  };
  const approveAll = (ids: string[], p2: Record<string, string> = {}): string =>
    JSON.stringify(ids.map((id) => ({ id, decision: 'APPROVE', materiality: 'REQUIRED', ...(id === 'p2' ? p2 : {}) })));

  it('no `needs` in the ruling: the discovered prerequisite is attached, and the command says so', () => {
    const { data, proj, ids } = discovered();
    const out = runM(data, proj, 'ratify', '--decisions', approveAll(ids));
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/p2: needs from you: the actual figures for the period {2}\(found by discovery/);
    runM(data, proj, 'ratify-close', '--work-type', 'writing');
    const p2 = pending(data).requirements.find((r) => r.requirementId === 'p2');
    expect(p2?.prerequisites?.[0]?.why).toBe('the actual figures for the period');
  });

  it('"needs":"none" waives it, and says what was waived', () => {
    const { data, proj, ids } = discovered();
    const out = runM(data, proj, 'ratify', '--decisions', approveAll(ids, { needs: 'none' }));
    expect(out).toMatch(/p2: needs nothing from you, as you ruled — discovery had found: the actual figures for the period/);
    runM(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(pending(data).requirements.find((r) => r.requirementId === 'p2')?.prerequisites).toBeUndefined();
  });

  it('a `needs` the person wrote wins over the discovered one, silently', () => {
    const { data, proj, ids } = discovered();
    const out = runM(data, proj, 'ratify', '--decisions', approveAll(ids, { needs: 'the Q3 revenue table' }));
    expect(out).not.toMatch(/found by discovery/);
    runM(data, proj, 'ratify-close', '--work-type', 'writing');
    expect(pending(data).requirements.find((r) => r.requirementId === 'p2')?.prerequisites?.[0]?.why).toBe('the Q3 revenue table');
  });
});

describe('a discovery that fell back to a single pass says so on the ratify page', () => {
  it('the chain refuses (no factors), the saved run carries heldOutChecked=false, and the caveat renders', async () => {
    const { data, proj } = fresh();
    runM(data, proj, 'intake', corpus(proj, 8));
    await script({ byTool: { ...CHAIN.byTool, emit_factors: { factors: [] } } });
    const out = runM(data, proj, 'discover', '--no-contrast', ...MODEL());
    await script(CHAIN);
    expect(out).toMatch(/Falling back to a single pass/);
    expect(session(data).run.heldOutChecked).toBe(false);
    const page = join(proj, 'rulings.html');
    expect(runM(data, proj, 'ratify', '--page', page)).not.toMatch(/^EXIT:/);
    expect(readFileSync(page, 'utf8')).toMatch(/This run could not check its\s+proposals against work the proposer had not read/);
  });

  it('a run the chain validated renders no caveat (the polarity)', () => {
    const { data, proj } = fresh();
    runM(data, proj, 'intake', corpus(proj, 8));
    runM(data, proj, 'discover', '--no-contrast', ...MODEL());
    expect(session(data).run.heldOutChecked).toBe(true);
    const page = join(proj, 'rulings.html');
    runM(data, proj, 'ratify', '--page', page);
    expect(readFileSync(page, 'utf8')).not.toMatch(/Read these as proposals, not findings/);
  });
});

describe('a resumed fix pairs the candidate with a run of the same task, or not at all', () => {
  const COVERED = { coverage: 'COVERED', requirementIds: ['x1'], proposedRequirement: null, question: null, reasoning: 'x1 covers it' };
  const seeded = async (): Promise<{ data: string; proj: string }> => {
    const { data, proj } = fresh();
    runM(data, proj, 'add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL');
    runM(data, proj, 'ratify-close', '--work-type', 'writing');
    runM(data, proj, 'build', '--name', 'focus');
    await script({ byTool: { emit_piece: { piece: 'the original answer' } } });
    expect(runM(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the recommendation', ...MODEL())).not.toMatch(/^EXIT:/);
    await script({ byTool: { emit_coverage: COVERED, emit_piece: { piece: 'the improved answer' } } });
    expect(runM(data, proj, 'fix', 'the answer buried the recommendation', ...MODEL())).toContain('--pick a|b|same');
    return { data, proj };
  };

  it('a complaint about a DIFFERENT task is not shown beside the pending candidate\'s run; it is sent to promote/reject', async () => {
    const { data, proj } = await seeded();
    await script({ byTool: { emit_piece: { piece: 'the summary answer' } } });
    expect(runM(data, proj, 'invoke', '--skill', 'focus', '--task', 'write the summary', ...MODEL())).not.toMatch(/^EXIT:/);
    await script({ byTool: { emit_coverage: COVERED, emit_piece: { piece: 'unused' } } });
    const out = runM(data, proj, 'fix', 'the summary buried the point', ...MODEL());
    expect(out, 'a run of another task was paired with this one').not.toContain('──── A ────');
    expect(out).not.toContain('the improved answer');
    expect(out).toMatch(/already waiting for your decision/);
    expect(out).toMatch(/atelier promote --skill focus --candidate \S+ --why/);
    expect(out).toMatch(/atelier reject {2}--skill focus --candidate \S+ --why/);
    await script(CHAIN);
  }, 120_000);

  it('the same task resumes the pair as before (the polarity)', async () => {
    const { data, proj } = await seeded();
    await script({ byTool: { emit_coverage: COVERED, emit_piece: { piece: 'unused' } } });
    const out = runM(data, proj, 'fix', 'the answer buried the recommendation', ...MODEL());
    expect(out).toContain('──── A ────');
    expect(out).toContain('the improved answer');
    expect(out).toContain('the original answer');
    await script(CHAIN);
  }, 120_000);
});
