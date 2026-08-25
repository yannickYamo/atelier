// tests/atelier-materialization-identity.test.ts — THE CHECKER WAS WRONG AND IT BLAMED THE USER.
//
// `inspect` re-rendered the package and compared the installed file against that re-render. The
// renderer takes the frontmatter description as an ARGUMENT, and `inspect` reconstructed it as a
// default instead of reading what was built. So any skill built with `--description` failed the
// comparison, and `inspect` reported:
//
//   MATERIALIZATION DRIFT: The installed file was edited by hand.
//
// Nothing had been edited. For a command whose entire job is to tell you whether you can trust the
// installed artifact, accusing the author of tampering because the checker rebuilt the artifact wrong
// is the worst available failure. `rollback` had the same defect with a worse consequence: it
// INSTALLED the reconstruction, so rolling back to a version handed you a package that version never
// built, and `materializedHash` — which records exactly what it did build — was never consulted.
//
// The fix is a reuse, not a new mechanism. The built package is in the store under `materializedHash`.
// Read it. These tests pin both the defect and the property that makes the fix sound.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAgentSkill, defaultDescription } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { initStore, putPackage, getPackage, type StoreLayout } from '../core/state/store.js';

const std = (workType = 'study-notes'): StandardVersion => ({
  standardVersionHash: 'std1', evidenceId: 'ev1', workType, authorityState: 'RATIFIED',
  mintedAt: '2026-08-24T00:00:00Z', reason: 'fixture', supersedes: null,
  requirements: [{
    requirementId: 'p1', statement: 'Name only the rulers whose actions moved a border.',
    appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
    provenance: 'MACHINE_DISCOVERED', wouldBeAbsentIf: null,
    evidence: 'the rulers who moved a border', evidenceItemId: 'i1',
    materiality: 'REQUIRED', realizationTolerance: 'FLEXIBLE', outputShape: null,
  }],
});

const render = (description: string) => {
  const v = std();
  return renderAgentSkill(v, compileArchitecture(v), 'study-notes', description);
};

describe('the description reaches the package hash, which is why re-deriving it was unsound', () => {
  it('two descriptions over ONE standard produce two different packages', () => {
    const built = render('Selects what belongs on a study sheet');
    const reconstructed = render(defaultDescription('study-notes'));
    expect(built.packageHash).not.toBe(reconstructed.packageHash);
  });

  it('the difference is in the frontmatter a host actually reads', () => {
    const line = (p: ReturnType<typeof render>) =>
      p.files['SKILL.md'].split('\n').find((l) => l.startsWith('description:'));
    expect(line(render('Selects what belongs on a study sheet')))
      .toBe('description: Selects what belongs on a study sheet');
    expect(line(render(defaultDescription('study-notes'))))
      .toBe('description: Writes in the author\'s own standard (study-notes)');
  });

  it('so a checker that reconstructs the description CANNOT verify a custom-described skill', () => {
    // This is the defect, stated as a property rather than as a story. Any comparison between the
    // installed bytes and a re-render is only as good as the re-render's inputs, and one of those
    // inputs was never stored.
    const installed = render('Selects what belongs on a study sheet');
    const whatInspectUsedToBuild = render(defaultDescription('study-notes'));
    expect(installed.files['SKILL.md']).not.toBe(whatInspectUsedToBuild.files['SKILL.md']);
  });
});

describe('a STORED package verifies and installs — no re-derivation anywhere', () => {
  const project = () => mkdtempSync(join(tmpdir(), 'atelier-mat-'));
  const layout = (): StoreLayout => {
    const L: StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-matstore-')), skillName: 'study-notes' };
    initStore(L);
    return L;
  };

  it('what came out of the store satisfies the installer contract', () => {
    const L = layout();
    const built = render('Selects what belongs on a study sheet');
    putPackage(L, built);
    const stored = getPackage(L, built.packageHash);
    expect(stored).not.toBeNull();

    const dir = project();
    const host = new ClaudeCodeAdapter();
    expect(host.install(stored!, dir).ok).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', built.skillId, 'SKILL.md'))).toBe(true);
  });

  it('verifying the stored package against its own installation MATCHES', () => {
    // The regression in one line: before the fix this comparison was made against a re-render and
    // returned matchesPackage:false for a file nobody had touched.
    const L = layout();
    const built = render('Selects what belongs on a study sheet');
    putPackage(L, built);
    const dir = project();
    const host = new ClaudeCodeAdapter();
    host.install(getPackage(L, built.packageHash)!, dir);

    const ver = host.verifyInstallation(getPackage(L, built.packageHash)!, dir);
    expect(ver.present).toBe(true);
    expect(ver.matchesPackage).toBe(true);
  });

  it('and a REAL hand edit is still caught — the fix did not blunt the check', () => {
    const L = layout();
    const built = render('Selects what belongs on a study sheet');
    putPackage(L, built);
    const dir = project();
    const host = new ClaudeCodeAdapter();
    host.install(getPackage(L, built.packageHash)!, dir);

    const f = join(dir, '.claude', 'skills', built.skillId, 'SKILL.md');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\nAlways open with a joke.\n`);

    const ver = host.verifyInstallation(getPackage(L, built.packageHash)!, dir);
    expect(ver.present).toBe(true);
    expect(ver.matchesPackage).toBe(false);
    expect(ver.detail).toContain('EDITED');
  });
});

describe('the commands no longer re-derive, and that is asserted where it could regress', () => {
  const src = readFileSync('cli/commands/inspect.ts', 'utf8');

  it('inspect and rollback do not import the renderer at all', () => {
    // The strongest available statement: they cannot rebuild a package because they cannot reach the
    // thing that builds one.
    expect(src).not.toContain('renderAgentSkill');
    expect(src).not.toContain('compileArchitecture');
  });

  it('both read the package the version recorded building', () => {
    expect([...src.matchAll(/getPackage\(L, sv\.materializedHash\)/g)]).toHaveLength(2);
  });

  it('rollback REFUSES rather than installing an approximation it cannot reproduce', () => {
    expect(src).toMatch(/getPackage\(L, sv\.materializedHash\)\s*\n\s*\?\? die\(/);
  });

  it('rollback moves the active pointer only after the package is in hand', () => {
    // It used to setActive first and install second, so a failed reinstall left the pointer moved and
    // the previous skill still on disk. Two versions live at once, and the store said the wrong one.
    expect(src.indexOf('const pkg = store.getPackage')).toBeLessThan(src.indexOf('store.setActive(L, to)'));
  });

  it('inspect distinguishes "I cannot check this" from "you edited it"', () => {
    expect(src).toContain('CANNOT CHECK');
  });
});

describe('the description has one owner and is inherited, not reconstructed', () => {
  it('the default exists in exactly one place', () => {
    const files = ['cli/commands/build.ts', 'cli/commands/improve.ts', 'cli/commands/amend.ts',
      'cli/commands/confirm.ts', 'cli/commands/inspect.ts'];
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), `${f} still writes the default inline`)
        .not.toContain("Writes in the author's own standard (${");
    }
  });

  it('every mint site records the description it built with', () => {
    for (const f of ['build', 'improve', 'amend', 'confirm']) {
      expect(readFileSync(`cli/commands/${f}.ts`, 'utf8'), `${f} does not store its description`)
        .toMatch(/description: desc/);
    }
  });

  it('the three follow-on mints inherit it before falling back', () => {
    for (const f of ['improve', 'amend', 'confirm']) {
      expect(readFileSync(`cli/commands/${f}.ts`, 'utf8'), `${f} does not inherit`)
        .toMatch(/\?\?\s*(store\.getSkillVersion\(L, inv\.skillVersionHash\)\?|sv)\.description\s*\?\?/);
    }
  });

  it('confirm can be given one, which it previously could not', () => {
    expect(readFileSync('cli/commands/confirm.ts', 'utf8')).toContain("flag('--description')");
  });
});
