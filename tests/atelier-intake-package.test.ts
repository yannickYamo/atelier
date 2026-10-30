/**
 * W1 — reading a skill that already exists.
 *
 * The load-bearing test here is the POLARITY one: before this wire, every file in a skill folder
 * that was not the SKILL.md fell through to GOLDEN, so Atelier induced the author's standard from
 * the skill's own templates. That test fails against the pre-W1 classifier, which is the only
 * reason to trust it.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyPackagePath, adaptSkillFolder, adaptPackage, mapComponentKind, IMPROVABLE_KINDS,
} from '../core/intake/package.js';

/** The real layout of one of our own skills, taken from src/skills/classification. */
const REAL_SKILL = [
  'SKILL.md', 'QUICK_REF.md', 'capabilities.ts', 'signals.ts',
  'templates/CLASSIFICATION.md', 'templates/RECLASSIFICATION.md',
  'evals/rubric.yml', 'evals/README.md',
  'evals/assertions/CLASSIFICATION.yml', 'evals/assertions/RECLASSIFICATION.yml',
];

describe('classifyPackagePath', () => {
  it('maps the layouts Atelier installs beside', () => {
    expect(classifyPackagePath('SKILL.md')).toBe('skill_methodology');
    expect(classifyPackagePath('QUICK_REF.md')).toBe('agent_instruction');
    expect(classifyPackagePath('AGENTS.md')).toBe('agent_instruction');
    expect(classifyPackagePath('CLAUDE.md')).toBe('agent_instruction');
    expect(classifyPackagePath('templates/CLASSIFICATION.md')).toBe('delivery_policy');
    expect(classifyPackagePath('references/pricing.md')).toBe('knowledge_unit');
    expect(classifyPackagePath('evals/rubric.yml')).toBe('evaluator');
    expect(classifyPackagePath('evals/assertions/X.yml')).toBe('evaluator');
  });

  it('returns UNKNOWN rather than guessing — a wrong kind is actionable, and silently so', () => {
    expect(classifyPackagePath('capabilities.ts')).toBe('UNKNOWN');
    expect(classifyPackagePath('signals.ts')).toBe('UNKNOWN');
    expect(classifyPackagePath('my-essay.md')).toBe('UNKNOWN');
    expect(classifyPackagePath('scripts/run.sh')).toBe('UNKNOWN');
  });

  it('a loose .md at the package root is NOT a component — that is what keeps goldens out', () => {
    // The ambiguous layout: SKILL.md beside the user's work. Position cannot separate them, so
    // convention does, and anything unrecognised is treated as the user's material.
    expect(classifyPackagePath('golden-essay.md')).toBe('UNKNOWN');
  });
});

describe('adaptSkillFolder on a real skill', () => {
  const pkg = adaptSkillFolder('classification', REAL_SKILL);

  it('POLARITY: templates are delivery policy, never examples of the author\'s finished work', () => {
    // Pre-W1 the CLI classified anything that was not SKILL.md as GOLDEN. Both templates would have
    // become goldens, and the standard would have been induced from the skill's own output shape.
    const templates = pkg.components.filter((c) => c.path.startsWith('templates/'));
    expect(templates).toHaveLength(2);
    for (const t of templates) expect(t.kind).toBe('delivery_policy');
  });

  it('the evaluator is outside the improvable surface BY TYPE', () => {
    const evals = pkg.components.filter((c) => c.kind === 'evaluator');
    expect(evals.length).toBeGreaterThan(0);
    for (const e of evals) expect(e.improvable).toBe(false);
    // and the rule is a property of the type, not of this fixture
    expect(IMPROVABLE_KINDS.has('evaluator')).toBe(false);
  });

  it('reports unknown components instead of blocking, and never assigns them a kind', () => {
    expect(pkg.portable).toBe(false);
    expect(pkg.blockReason).toContain('no guessing');
    expect([...pkg.unknownComponents].sort()).toEqual(['capabilities.ts', 'signals.ts']);
    expect(pkg.summary).toContain('left exactly as they are');
  });

  it('counts exactly the prose carriers as rewritable', () => {
    // SKILL.md + QUICK_REF.md + 2 templates. Not the 4 evaluator files, not the 2 .ts files.
    expect(pkg.improvableCount).toBe(4);
  });

  it('tells the user why the evaluator is untouched', () => {
    expect(pkg.summary).toContain('always pass it');
  });
});

describe('POLARITY — the defect this wire closed, pinned', () => {
  /**
   * The CLI's classifier as it stood before W1, copied verbatim from atelier.mts. A polarity test
   * that cannot fail against the old code proves nothing, and the new module did not exist then —
   * so the old RULE is reproduced here and the two are compared directly.
   */
  const preW1Classify = (f: string): string =>
    /(^|\/)SKILL\.md$/i.test(f) ? 'EXISTING_SKILL'
      : /methodolog|framework|process|playbook/i.test(f) ? 'METHODOLOGY'
        : /reject|bad|before/i.test(f) ? 'REJECTED' : 'GOLDEN';

  it('the OLD rule read a skill\'s own templates and quick-reference as goldens', () => {
    const asGolden = REAL_SKILL.filter((f) => preW1Classify(f) === 'GOLDEN');
    // this is the defect, stated as a fact rather than a worry
    expect(asGolden).toContain('templates/CLASSIFICATION.md');
    expect(asGolden).toContain('templates/RECLASSIFICATION.md');
    expect(asGolden).toContain('QUICK_REF.md');
    expect(asGolden.length).toBe(9); // every file except SKILL.md
  });

  it('the NEW rule recognises each of them as a component, so none can reach the corpus', () => {
    const pkg = adaptSkillFolder('classification', REAL_SKILL);
    for (const f of ['templates/CLASSIFICATION.md', 'templates/RECLASSIFICATION.md', 'QUICK_REF.md']) {
      const c = pkg.components.find((x) => x.path === f);
      expect(c, f).toBeDefined();
      expect(c?.kind, f).not.toBe('UNKNOWN');
    }
  });
});

describe('adaptPackage — ported verdict semantics', () => {
  it('a fully recognised package is portable with no block reason', () => {
    const pkg = adaptSkillFolder('clean', ['SKILL.md', 'references/a.md']);
    expect(pkg.portable).toBe(true);
    expect(pkg.blockReason).toBeUndefined();
    expect(pkg.improvableCount).toBe(2);
  });

  it('mapComponentKind fails closed on an unknown role', () => {
    expect(mapComponentKind('skill_methodology')).toBe('skill_methodology');
    expect(mapComponentKind('something_new')).toBe('UNKNOWN');
  });

  it('every component carries UNKNOWN_LEGACY provenance — a foreign package records no standard', () => {
    const pkg = adaptPackage('x', [{ id: 'SKILL.md', rawKind: 'skill_methodology', path: 'SKILL.md' }]);
    expect(pkg.components[0].standardDerivedFrom).toBe('UNKNOWN_LEGACY');
  });

  it('an empty package says so rather than reporting a healthy zero', () => {
    expect(adaptSkillFolder('empty', []).summary).toContain('no files Atelier can read');
  });
});
