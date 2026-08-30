// tests/atelier-cli-e2e.test.ts — DRIVE THE REAL BINARY, BECAUSE A SOURCE GUARD IS NOT A WITNESS.
//
// The judgement ledger and the materialization fix were both landed with tests that read the command
// files and matched patterns in them. Those guards are worth keeping — they catch a future edit that
// deletes a call — but they establish that the SOURCE SAYS something, never that the SYSTEM DOES it.
// This codebase's own standing rule is that a status report is a claim and not a fact, and a regex
// over a file is a status report.
//
// The command functions cannot be called in-process with different arguments: `cli/runtime.ts` parses
// argv once at module load. So the honest test is the built binary against a real store, which is what
// a user runs.
//
// BUILDS FOR ITSELF. CI runs `npm test` before `npm run build`, so a test depending on a prebuilt dist
// would pass locally and fail in CI — which is exactly the delivery confound this project is about,
// aimed at its own test suite.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import * as store from '../core/state/store.js';
import type { StandardVersion, InvocationRecord } from '../core/state/canonical-state.js';
import { A_BINDING } from './fixtures.js';
import { observeRuntime } from '../core/runtime/binding.js';

// ABSOLUTE. The CLI runs with cwd set to a temp project dir, so a relative path resolves there.
const CLI = resolve('dist/cli/atelier.mjs');
const SKILL = 'my-voice';
const CUSTOM = 'Selects what belongs on a study sheet';

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

const std = (): StandardVersion => ({
  standardVersionHash: 'std1', evidenceId: 'ev1', workType: 'study-notes', authorityState: 'RATIFIED',
  mintedAt: '2026-08-24T00:00:00Z', reason: 'fixture', supersedes: null,
  requirements: [{
    requirementId: 'p1', statement: 'Name only the rulers whose actions moved a border.',
    appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
    provenance: 'MACHINE_DISCOVERED', wouldBeAbsentIf: null,
    evidence: 'the rulers who moved a border', evidenceItemId: 'i1',
    materiality: 'REQUIRED', realizationTolerance: 'FLEXIBLE', outputShape: null,
  }],
});

/**
 * A store holding two versions of one skill, both built with a CUSTOM description.
 *
 * The description is the point. Every defect this file covers was invisible on a skill built with the
 * default, which is why nothing caught them.
 */
const seed = () => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'atelier-e2e-data-'));
  const projectDir = mkdtempSync(join(tmpdir(), 'atelier-e2e-proj-'));
  const L: store.StoreLayout = { root: dataRoot, skillName: SKILL };
  store.initStore(L);

  const v = std();
  const arch = compileArchitecture(v);
  store.putStandard(L, v);
  store.putArchitecture(L, arch);

  const mk = (description: string, tag: string) => {
    const pkg = renderAgentSkill(v, arch, SKILL, description);
    const sv = { skillVersionHash: `k-${tag}`, skillName: SKILL, standardVersionHash: v.standardVersionHash,
      architectureHash: arch.architectureHash, materializedHash: pkg.packageHash,
      builtAt: '2026-08-24T00:00:00Z', description };
    store.putPackage(L, pkg);
    store.putSkillVersion(L, sv);
    return { pkg, sv };
  };
  // two DIFFERENT descriptions, so champion and candidate have different package hashes
  const champ = mk(CUSTOM, 'champ');
  const cand = mk(`${CUSTOM}, tightened`, 'cand');
  store.setActive(L, champ.sv.skillVersionHash);

  const invocation = (id: string, svHash: string, pkgHash: string): InvocationRecord => ({
    invocationId: id, skillName: SKILL, standardVersionHash: v.standardVersionHash, skillVersionHash: svHash,
    architectureHash: arch.architectureHash, servedPackageHash: pkgHash, runtimeBinding: A_BINDING,
    observedRuntime: observeRuntime(A_BINDING, 'test-model', '2026-01-01T00:00:00.000Z'),
    invocationSurface: 'ATELIER_CLI',
    request: { resolvedTaskHash: 'th', servedTaskHash: 'th', source: 'POSITIONAL' },
    provenance: 'ORGANIC_USE', inputHash: 'ctx1', outputHash: 'o', at: '2026-08-24T00:10:00Z',
    delivery: { expectedPackageHash: pkgHash, servedPackageHash: pkgHash, matched: true, servedFiles: [], outputContract: null },
    input: 'task', output: 'out',
  });
  store.putInvocation(L, invocation('i-champ', champ.sv.skillVersionHash, champ.pkg.packageHash));
  store.putInvocation(L, invocation('i-cand', cand.sv.skillVersionHash, cand.pkg.packageHash));

  return { dataRoot, projectDir, L, champ, cand };
};

describe('E2E: promote demands a reason and records it', () => {
  it('refuses with no --why, and nothing moves', () => {
    const { dataRoot, projectDir, L } = seed();
    const before = store.getActive(L);
    const out = run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand');
    expect(out).toContain('EXIT:1');
    expect(out).toContain('--why');
    expect(store.getActive(L)).toBe(before);
    expect(store.readEvents(L).filter((e) => e.kind === 'JUDGEMENT_RECORDED')).toHaveLength(0);
  });

  it('with --why it promotes AND writes the reason into the ledger', () => {
    const { dataRoot, projectDir, L } = seed();
    const out = run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand',
      '--why', 'it kept the concrete noun', '--rule', 'p1');
    expect(out).not.toContain('EXIT:');
    expect(store.getActive(L)).toBe('k-cand');

    const judged = store.readEvents(L).filter((e) => e.kind === 'JUDGEMENT_RECORDED');
    expect(judged).toHaveLength(1);
    expect(judged[0].rationale).toBe('it kept the concrete noun');
    expect(judged[0].choice).toBe('CANDIDATE');
    expect(judged[0].requirementId).toBe('p1');
    expect(judged[0].championSkillVersionHash).toBe('k-champ');
  });

  it('and `judgements` reads that reason back out', () => {
    const { dataRoot, projectDir } = seed();
    run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand',
      '--why', 'it kept the concrete noun', '--rule', 'p1');
    const out = run(dataRoot, projectDir, 'judgements', '--skill', SKILL);
    expect(out).toContain('it kept the concrete noun');
    expect(out).toContain('you chose CANDIDATE');
    // no comparison was run on this pair, so the ledger must say so rather than imply agreement
    expect(out).toContain('you ruled alone     1');
    expect(out).not.toMatch(/\d+% agreement/);
  });

  it('promotion INSTALLS the promoted package — the host serves what the store claims', () => {
    const { dataRoot, projectDir, L, cand } = seed();
    run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand', '--why', 'better');
    expect(store.getActive(L)).toBe('k-cand');
    for (const [rel, content] of Object.entries(cand.pkg.files)) {
      expect(readFileSync(join(projectDir, '.claude', 'skills', cand.pkg.skillId, rel), 'utf8')).toBe(content);
    }
  });

  it('if the install fails, the pointer does NOT move — the store never claims what the host does not serve', () => {
    const { dataRoot, projectDir, L } = seed();
    // A regular file where the skills DIRECTORY must go makes every install fail.
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    writeFileSync(join(projectDir, '.claude', 'skills'), 'not a directory');
    const out = run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand', '--why', 'better');
    expect(out).toContain('EXIT:1');
    expect(out).toContain('install failed');
    expect(store.getActive(L), 'a failed install must not move the active pointer').toBe('k-champ');
  });

  it('a promotion with no rule named files no rule, and says why', () => {
    const { dataRoot, projectDir, L } = seed();
    const out = run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand', '--why', 'felt better');
    expect(out).toContain('not against any rule');
    expect(store.readEvents(L).filter((e) => e.kind === 'JUDGEMENT_RECORDED')).toHaveLength(0);
  });
});

describe('E2E: inspect checks against what was built', () => {
  it('a skill built with a CUSTOM description verifies clean — the false drift report is gone', () => {
    const { dataRoot, projectDir, champ } = seed();
    run(dataRoot, projectDir, 'rollback', '--skill', SKILL, '--to', 'k-champ');
    const out = run(dataRoot, projectDir, 'inspect', '--skill', SKILL);
    expect(out).toContain('installed file matches the package that was built');
    expect(out).not.toContain('MATERIALIZATION DRIFT');
    expect(out).not.toContain('edited by hand');
    expect(champ.sv.description).toBe(CUSTOM);
  });

  it('a REAL hand edit is still reported as drift', () => {
    const { dataRoot, projectDir, champ } = seed();
    run(dataRoot, projectDir, 'rollback', '--skill', SKILL, '--to', 'k-champ');
    const f = join(projectDir, '.claude', 'skills', champ.pkg.skillId, 'SKILL.md');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\nAlways open with a joke.\n`);
    const out = run(dataRoot, projectDir, 'inspect', '--skill', SKILL);
    expect(out).toContain('MATERIALIZATION DRIFT');
  });

  it('a version whose package is missing reports that it cannot check, not that you edited it', () => {
    const { dataRoot, projectDir, L } = seed();
    store.putSkillVersion(L, { skillVersionHash: 'k-old', skillName: SKILL, standardVersionHash: 'std1',
      architectureHash: 'a-gone', materializedHash: 'never-stored', builtAt: '2026-01-01T00:00:00Z' });
    store.setActive(L, 'k-old');
    const out = run(dataRoot, projectDir, 'inspect', '--skill', SKILL);
    expect(out).toContain('CANNOT CHECK');
    expect(out).not.toContain('edited by hand');
  });
});

describe('E2E: rollback reinstalls the bytes that version built', () => {
  it('the installed files equal the STORED package, byte for byte', () => {
    const { dataRoot, projectDir, champ } = seed();
    const out = run(dataRoot, projectDir, 'rollback', '--skill', SKILL, '--to', 'k-champ');
    expect(out).toContain(champ.pkg.packageHash);
    for (const [rel, content] of Object.entries(champ.pkg.files)) {
      expect(readFileSync(join(projectDir, '.claude', 'skills', champ.pkg.skillId, rel), 'utf8')).toBe(content);
    }
  });

  it('the installed description is the one that was BUILT, not a reconstruction', () => {
    const { dataRoot, projectDir, champ } = seed();
    run(dataRoot, projectDir, 'rollback', '--skill', SKILL, '--to', 'k-champ');
    const md = readFileSync(join(projectDir, '.claude', 'skills', champ.pkg.skillId, 'SKILL.md'), 'utf8');
    expect(md).toContain(`description: ${CUSTOM}`);
    expect(md).not.toContain("Writes in the author's own standard");
  });

  it('rolling back to a version with no stored package REFUSES and leaves the pointer alone', () => {
    const { dataRoot, projectDir, L } = seed();
    store.putSkillVersion(L, { skillVersionHash: 'k-old', skillName: SKILL, standardVersionHash: 'std1',
      architectureHash: 'a-gone', materializedHash: 'never-stored', builtAt: '2026-01-01T00:00:00Z' });
    const before = store.getActive(L);
    const out = run(dataRoot, projectDir, 'rollback', '--skill', SKILL, '--to', 'k-old');
    expect(out).toContain('EXIT:1');
    expect(out).toContain('cannot be reinstalled as it was built');
    expect(store.getActive(L)).toBe(before);
  });
});

describe('E2E: reject records the other half of the ledger', () => {
  it('a rejection with a reason lands as a CHAMPION judgement', () => {
    const { dataRoot, projectDir, L } = seed();
    store.appendEvent(L, { kind: 'REPAIR_PROPOSED', repairId: 'r1', skillName: SKILL, requirementId: 'p1',
      from: 'PROSE', to: 'SELF_CHECK', sourceSkillVersionHash: 'k-champ', candidateSkillVersionHash: 'k-cand',
      evidenceBasis: { missContexts: 1, invocationIds: [] }, at: '2026-08-24T00:20:00Z' });

    const out = run(dataRoot, projectDir, 'reject', '--skill', SKILL, '--candidate', 'k-cand',
      '--why', 'it hedged the rule into politeness');
    expect(out).not.toContain('EXIT:');

    const judged = store.readEvents(L).filter((e) => e.kind === 'JUDGEMENT_RECORDED');
    expect(judged).toHaveLength(1);
    expect(judged[0].choice).toBe('CHAMPION');
    expect(judged[0].rationale).toBe('it hedged the rule into politeness');
  });
});

describe('E2E: the two halves of the ledger join through the real binary', () => {
  /**
   * `compare` writes the observer half and needs a provider, so the observer reading is seeded here
   * exactly as `compare` writes it. What is under test is the JOIN and the report, which is the part
   * that decides whether a disagreement is ever visible to anyone.
   */
  const observed = (result: string, orderInvariant = true) => ({
    kind: 'COMPARISON_OBSERVED', requirementId: 'p1',
    championSkillVersionHash: 'k-champ', candidateSkillVersionHash: 'k-cand',
    result, orderInvariant, lengthRatio: 1.6, at: '2026-08-24T00:15:00Z',
  });

  it('observer preferred the champion, you promoted the candidate, and it reports DISAGREED', () => {
    const { dataRoot, projectDir, L } = seed();
    store.appendEvent(L, observed('CHAMPION_COMPLIES_BETTER'));
    run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand',
      '--why', 'the observer picked the longer one and it repeats itself');

    const out = run(dataRoot, projectDir, 'judgements', '--skill', SKILL);
    expect(out).toContain('DISAGREED');
    expect(out).toContain('the observer picked the longer one and it repeats itself');
    expect(out).toContain('len ×1.60');
    expect(out).toContain('disagreed           1');
  });

  it('the rule is JOINED from what was compared, with no --rule given', () => {
    const { dataRoot, projectDir, L } = seed();
    store.appendEvent(L, observed('CANDIDATE_COMPLIES_BETTER'));
    run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand', '--why', 'agreed with it');
    const judged = store.readEvents(L).filter((e) => e.kind === 'JUDGEMENT_RECORDED');
    expect(judged).toHaveLength(1);
    expect(judged[0].requirementId).toBe('p1');
    expect(run(dataRoot, projectDir, 'judgements', '--skill', SKILL)).toContain('AGREED');
  });

  it('an order-dependent verdict is never scored against your pick', () => {
    const { dataRoot, projectDir, L } = seed();
    store.appendEvent(L, observed('CANDIDATE_COMPLIES_BETTER', false));
    run(dataRoot, projectDir, 'promote', '--skill', SKILL, '--candidate', 'k-cand', '--why', 'ignored the flip');
    const out = run(dataRoot, projectDir, 'judgements', '--skill', SKILL);
    expect(out).toContain('ORDER_DEPENDENT');
    expect(out).toContain('order-dependent     1');
    expect(out).toContain('agreed              0');
    expect(out).toContain('disagreed           0');
  });
});
