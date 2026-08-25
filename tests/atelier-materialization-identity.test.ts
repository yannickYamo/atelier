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
import { renderAgentSkill, defaultDescription, provenanceLabel } from '../renderers/agent-skill/render.js';
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
      .toBe(`description: ${defaultDescription('study-notes')}`);
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

// ─── THE AUTHORITY CEILING MUST REACH THE SERVED BYTES ─────────────────────────────────────────
//
// `assertAuthorityCeiling` stops us RECORDING a public-behaviour rule as EXPERT_RATIFIED. It had no
// reach into the artifact, and a grep for either value across `renderers/` returned zero. So the
// record was correct and the compiled file said, of a standard read off a named stranger's public
// work who was never contacted:
//
//   description: Writes in the author's own standard
//   Write as the author of the standard below.
//   <!-- p8 · rewritten by you -->        (p8 was adopted verbatim)
//
// That is the delivery confound at the authority layer: the guarantee holds where it is checked and
// evaporates where it is served. These tests pin the artifact, not the record.

describe('a package built from public-behaviour rules never claims authorship', () => {
  const publicStd = (): StandardVersion => ({
    ...std(),
    requirements: std().requirements.map((r) => ({
      ...r, authority: 'USER_ADOPTED' as const, provenance: 'PUBLIC_BEHAVIOUR_INFERRED' as const,
      materiality: 'REQUIRED' as const,
    })),
  });
  const text = (v: StandardVersion) => {
    const p = renderAgentSkill(v, compileArchitecture(v), 'someone-else', defaultDescription(v.workType));
    return Object.values(p.files).join('\n');
  };

  it('never says the standard is the author\'s own', () => {
    expect(text(publicStd())).not.toContain("author's own standard");
  });

  it('never instructs the model to write AS the author', () => {
    const t = text(publicStd());
    expect(t).not.toContain('Write as the author');
    expect(t).toContain('Apply the standard below');
  });

  it('never labels an unchanged public rule as rewritten by the reader', () => {
    // p8 was adopted verbatim. Telling the reader they rewrote it is the same error in miniature.
    expect(text(publicStd())).not.toContain('rewritten by you');
  });

  it('states the real origin, keeping provenance and authority distinct', () => {
    expect(text(publicStd())).toContain('inferred from public work; adopted for this skill');
  });

  it('and an ordinary first-party package still renders its own provenance correctly', () => {
    const t = text(std());   // MACHINE_DISCOVERED fixture
    expect(t).toContain('· discovered');
    expect(t).not.toContain('inferred from public work');
  });
});

describe('provenance rendering is exhaustive, not a fallback', () => {
  it('every provenance value has its own label and none share one', () => {
    const all = ['MACHINE_DISCOVERED', 'SUBSTANTIVELY_REWRITTEN', 'EXPERT_ADDED',
      'PUBLIC_BEHAVIOUR_INFERRED'] as const;
    const labels = all.map((p) => provenanceLabel(p));
    expect(new Set(labels).size).toBe(all.length);
  });

  it('only a SUBSTANTIVELY_REWRITTEN rule is described as rewritten', () => {
    expect(provenanceLabel('SUBSTANTIVELY_REWRITTEN')).toBe('rewritten by you');
    for (const p of ['MACHINE_DISCOVERED', 'EXPERT_ADDED', 'PUBLIC_BEHAVIOUR_INFERRED'] as const) {
      expect(provenanceLabel(p)).not.toBe('rewritten by you');
    }
  });

  it('the source file carries no catch-all branch for provenance', () => {
    // The `never` check makes a missing policy a compile error. This pins that the ternary that
    // caused the defect has not returned.
    const src = readFileSync('renderers/agent-skill/render.ts', 'utf8');
    expect(src).toContain('const _exhaustive: never = p');
    expect(src).not.toMatch(/provenance === 'EXPERT_ADDED' \? '[^']+' : '/);
  });
});

describe('a ratified condition is accommodated, never edited', () => {
  it('does not double the word when the author already wrote one', () => {
    const v = std();
    const w: StandardVersion = { ...v, requirements: v.requirements.map((r) => ({
      ...r, materiality: 'PREFERRED' as const, appliesWhen: 'when uncertainty is material' })) };
    const t = Object.values(renderAgentSkill(w, compileArchitecture(w), 's', 'd').files).join('\n');
    expect(t).not.toContain('when when');
    expect(t).toContain('when uncertainty is material');
  });

  it('and still prefixes a bare condition', () => {
    const v = std();
    const w: StandardVersion = { ...v, requirements: v.requirements.map((r) => ({
      ...r, materiality: 'PREFERRED' as const, appliesWhen: 'the topic has many mechanisms' })) };
    const t = Object.values(renderAgentSkill(w, compileArchitecture(w), 's', 'd').files).join('\n');
    expect(t).toContain('when the topic has many mechanisms');
  });
});

describe('observed is not generalized into how a person works', () => {
  const publicPkg = () => {
    const v = std();
    const w: StandardVersion = { ...v, requirements: v.requirements.map((r) => ({
      ...r, authority: 'USER_ADOPTED' as const, provenance: 'PUBLIC_BEHAVIOUR_INFERRED' as const,
      materiality: 'PREFERRED' as const })) };
    return Object.values(renderAgentSkill(w, compileArchitecture(w), 'someone-else', 'd').files).join('\n');
  };

  it('never claims to know how the source person works', () => {
    // We observed a behaviour in published work. That it DEFINES how they work is unobtainable from
    // any corpus, and asserting it is the authority inversion in its subtlest form.
    const t = publicPkg();
    expect(t).not.toMatch(/how the author works/i);
    expect(t).not.toMatch(/how (they|he|she) works?\b/i);
    expect(t).not.toContain('how the author actually did');
  });

  it('says exactly what is known — that it was observed in the source', () => {
    expect(publicPkg()).toContain('an observed realization from the source material');
  });

  it('and still says the rule does not bind', () => {
    const t = publicPkg();
    expect(t).toContain('This is NOT required');
    expect(t).toContain('reach for this when it fits, and do not force it');
  });
});
