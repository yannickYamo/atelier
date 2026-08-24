/**
 * W6 — writing a proposal into a skill the user already has.
 *
 * The assertions that carry weight: edits ACCUMULATE (two rules in one file must both survive), a
 * rule that cannot be placed is REFUSED and reported rather than dropped, and the undo captures the
 * bytes as they were before anything was written.
 */
import { describe, it, expect } from 'vitest';
import { planImprovement, describeImprovement, entryComponentOf } from '../core/compiler/apply.js';
import { titleFrom, applyEdit, PROVENANCE_PREFIX, SkillMdSection } from '../core/compiler/placement.js';
import type { ProposedRule } from '../core/compiler/proposal.js';
import type { AdaptedComponent } from '../core/intake/package.js';

const comp = (path: string, kind: AdaptedComponent['kind'], improvable = true): AdaptedComponent =>
  ({ id: path, path, kind, standardDerivedFrom: 'UNKNOWN_LEGACY', improvable });

const rule = (id: string, text: string): ProposedRule => ({
  requirementId: id, text, authority: 'EXPERT_RATIFIED', carrier: 'PROSE', sensor: 'NONE',
  gateRole: 'ENFORCE', rationale: 'because', alreadyHandled: false,
});

const PKG = [comp('SKILL.md', 'skill_methodology'), comp('templates/R.md', 'delivery_policy'), comp('caps.ts', 'UNKNOWN', false)];
const ORIGINAL = '# My Skill\n\nProse the author wrote themselves.\n';
const contents = () => new Map([['SKILL.md', ORIGINAL], ['templates/R.md', '# Template\n']]);

describe('titleFrom — headings name the rule, not our counter', () => {
  it('WITNESSED: ids like p1 produced "## P1" in a user\'s own file', () => {
    // The first version derived the heading from the requirement id. Every heading in the product
    // would have been "## P1".."## P4" — internal counters appended to someone's own skill.
    const t = titleFrom({ requirementId: 'p1', requirementText: 'Open on the concrete moment.' });
    expect(t).toBe('Open on the concrete moment');
    expect(t).not.toContain('P1');
  });

  it('takes the first sentence, and cuts long ones on a word boundary', () => {
    const t = titleFrom({ requirementId: 'p2', requirementText:
      'Always state the confidence level alongside any number you report, and never round it silently for readability.' });
    expect(t.length).toBeLessThanOrEqual(70);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\w…$/);   // not cut mid-word
  });

  it('falls back to the id when there is no text to name it with', () => {
    expect(titleFrom({ requirementId: 'p9', requirementText: '   ' })).toBe('p9');
  });
});

describe('planImprovement', () => {
  it('EDITS ACCUMULATE — two rules in one file both survive', () => {
    // Planned against the ORIGINAL each time, the second write silently discards the first: a build
    // that reports two changes and delivers one.
    const plan = planImprovement('my-skill', '/pkg', [rule('p1', 'First rule.'), rule('p2', 'Second rule.')], PKG, contents());
    expect(plan.edits).toHaveLength(2);
    const out = plan.resulting['SKILL.md'];
    expect(out).toContain('First rule');
    expect(out).toContain('Second rule');
    expect(out).toContain('Prose the author wrote themselves.');
  });

  it('the undo holds the bytes as they were BEFORE anything was written', () => {
    const plan = planImprovement('my-skill', '/pkg', [rule('p1', 'First rule.'), rule('p2', 'Second rule.')], PKG, contents());
    expect(plan.undo.before['SKILL.md']).toBe(ORIGINAL);
    expect(plan.undo.packageRoot).toBe('/pkg');
  });

  it('only touches files it actually edited', () => {
    const plan = planImprovement('my-skill', '/pkg', [rule('p1', 'First rule.')], PKG, contents());
    expect(Object.keys(plan.resulting)).toEqual(['SKILL.md']);
    expect(Object.keys(plan.undo.before)).toEqual(['SKILL.md']);
  });

  it('every added section is marked as ours', () => {
    const plan = planImprovement('my-skill', '/pkg', [rule('p1', 'First rule.')], PKG, contents());
    expect(plan.resulting['SKILL.md']).toContain(PROVENANCE_PREFIX);
    expect(plan.resulting['SKILL.md']).toContain('Delete this section');
  });

  it('a rule that cannot be placed is REFUSED and reported, never dropped', () => {
    // Silently skipping it produces a build claiming to serve a standard while omitting part of it,
    // and the omission surfaces later as a behavioural miss against a model that never received it.
    const already = new Map([['SKILL.md', '# My Skill\n\n## First rule\n\nalready stated\n']]);
    const plan = planImprovement('my-skill', '/pkg', [rule('p1', 'First rule.')], PKG, already);
    expect(plan.edits).toHaveLength(0);
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0].reason).toContain('drift apart');
    expect(describeImprovement(plan, 'my-skill')).toContain('could NOT be written');
    expect(describeImprovement(plan, 'my-skill')).toContain('still in your standard');
  });

  it('a package with no writable entry point refuses everything, with a reason', () => {
    const noEntry = [comp('templates/R.md', 'delivery_policy')];
    const plan = planImprovement('x', '/pkg', [rule('p1', 'First rule.')], noEntry, contents());
    expect(plan.edits).toHaveLength(0);
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0].reason).toContain('no entry point');
    expect(Object.keys(plan.undo.before)).toHaveLength(0);
  });

  it('never writes to a component held outside the improvable surface', () => {
    // The evaluator case: kind is excluded by type, so it can never be the entry.
    const withEvals = [...PKG, comp('evals/rubric.yml', 'evaluator', false)];
    expect(entryComponentOf(withEvals)?.path).toBe('SKILL.md');
  });

  it('reports nothing to do as a clean result, not an error', () => {
    const plan = planImprovement('my-skill', '/pkg', [], PKG, contents());
    expect(describeImprovement(plan, 'my-skill')).toContain('already carries everything');
  });

  it('groups the report by file — four rules in one file is one decision, not four', () => {
    const rules = [rule('p1', 'One.'), rule('p2', 'Two.'), rule('p3', 'Three.'), rule('p4', 'Four.')];
    const text = describeImprovement(planImprovement('s', '/p', rules, PKG, contents()), 's');
    expect(text.split('SKILL.md').length - 1).toBe(1);
    for (const t of ['One', 'Two', 'Three', 'Four']) expect(text).toContain(t);
  });
});

describe('applyEdit is the one owner of what an edit means', () => {
  it('the probe and the writer compute the same bytes', () => {
    const req = { requirementId: 'p1', requirementText: 'First rule.', path: 'SKILL.md',
      currentContent: ORIGINAL, entryContent: ORIGINAL };
    const planned = SkillMdSection.plan(req);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const post = applyEdit(ORIGINAL, planned.edit);
    // exactly what planPlacement probes, and exactly what the CLI writes
    expect(SkillMdSection.reachabilityProbe(post, req).reachable).toBe(true);
    expect(post.startsWith(ORIGINAL)).toBe(true);
  });

  it('does not double the blank line when the file already ends in one', () => {
    const plan = planImprovement('s', '/p', [rule('p1', 'One.')], PKG, contents());
    expect(plan.resulting['SKILL.md']).not.toContain('\n\n\n');
  });
});
