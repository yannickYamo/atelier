/**
 * W3 — the reviewable proposal, and the law that a compiler may only write where the host reads.
 *
 * The load-bearing tests: NO_CHANGE_JUSTIFIED must be reachable and must read as success, and a
 * placement into a reference file nothing points at must be REFUSED. The second is the
 * serve-nothing defect (a correct compile serving 0%) reproduced in a Claude Code skill, where
 * the polarity is reversed — SKILL.md is always loaded, references/ is dark until it is named.
 */
import { describe, it, expect } from 'vitest';
import { buildProposal, renderProposal, explainPlacement, unconfirmedIn } from '../core/compiler/proposal.js';
import { planPlacement, adapterFor, SkillMdSection, ReferenceDoc } from '../core/compiler/placement.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { compileArchitecture } from '../core/architecture/compile.js';

function req(id: string, statement: string, over: Partial<Requirement> = {}): Requirement {
  return { requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE',
    authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: null, evidenceItemId: null, ...over };
}

function standard(requirements: readonly Requirement[]): StandardVersion {
  return { standardVersionHash: 'sv1', evidenceId: 'ev1', workType: 'writing', requirements,
    authorityState: requirements.some((r) => r.authority === 'DERIVED_UNRATIFIED') ? 'DRAFT' : 'RATIFIED',
    mintedAt: '2026-08-20T00:00:00.000Z', supersedes: null, reason: null };
}

describe('buildProposal', () => {
  const rs = [req('p1', 'Open on the concrete moment.'), req('p2', 'Never use a rhetorical question.', { kind: 'BOUNDARY' })];
  const arch = compileArchitecture(standard(rs));

  it('NO_CHANGE_JUSTIFIED is reachable and is not an empty result', () => {
    const p = buildProposal('my-voice', 'sv1', rs, arch, new Set(['p1', 'p2']));
    expect(p.outcome).toBe('NO_CHANGE_JUSTIFIED');
    expect(p.changes).toHaveLength(0);
    expect(p.deliberatelyUnchanged).toHaveLength(2);
    const text = renderProposal(p);
    expect(text).toContain('That is a real');
    expect(text).toContain('No changes are justified');
  });

  it('what would NOT change is reported alongside what would', () => {
    const p = buildProposal('my-voice', 'sv1', rs, arch, new Set(['p1']));
    expect(p.outcome).toBe('CHANGES_PROPOSED');
    expect(p.changes.map((c) => c.requirementId)).toEqual(['p2']);
    expect(p.deliberatelyUnchanged.map((c) => c.requirementId)).toEqual(['p1']);
    const text = renderProposal(p);
    expect(text).toContain('deliberately NOT change');
    expect(text).toContain('has to earn its place');
  });

  it('a rejected requirement never reaches a proposal — the compiler refuses first', () => {
    // Not a filter in buildProposal: `assertNothingRejectedIsServed` throws at compile time, so no
    // architecture exists for a rejected rule. Asserting the real owner rather than adding a second.
    const withRejected = [...rs, req('p3', 'A rule you threw out.', { authority: 'EXPERT_REJECTED' })];
    expect(() => compileArchitecture(standard(withRejected))).toThrow(/REJECTED REQUIREMENT/);
  });

  it('carrier decides HOW a change lands, never WHETHER there is one', () => {
    // Both rules compile to different carriers; only alreadyHandled moves them between buckets.
    const p = buildProposal('my-voice', 'sv1', rs, arch, new Set());
    expect(p.changes).toHaveLength(2);
    expect(new Set(p.changes.map((c) => c.carrier)).size).toBeGreaterThan(0);
  });

  it('names the unconfirmed rules a user would be approving', () => {
    const guessed = [req('p1', 'Something we inferred.', { authority: 'DERIVED_UNRATIFIED' })];
    const p = buildProposal('my-voice', 'sv1', guessed, compileArchitecture(standard(guessed)), new Set());
    expect(unconfirmedIn(p)).toEqual(['Something we inferred.']);
    expect(renderProposal(p)).toContain('you have not confirmed it');
  });

  it('speaks the user\'s language, not the machinery\'s', () => {
    const p = buildProposal('my-voice', 'sv1', rs, arch, new Set());
    const text = renderProposal(p);
    for (const internal of ['SELF_CHECK', 'OUTPUT_CONTRACT', 'ENFORCE', 'OBSERVE', 'DERIVED_UNRATIFIED']) {
      expect(text, `leaked "${internal}"`).not.toContain(internal);
    }
    expect(explainPlacement(p.changes[0])).toMatch(/instruction|draft|example|shape/);
  });

  it('the footer states what actually happens next, and differs by whether it gates', () => {
    // "Nothing changes until you approve it" was true when a human promoted every candidate. That
    // was a temporary safety constraint; the human ratifies the STANDARD, and the implementation is
    // the machine's. On the routine path this is a record, and promising an approval would be false
    // in the one artifact whose whole job is to be inspectable.
    const p = buildProposal('my-voice', 'sv1', rs, arch, new Set());
    expect(renderProposal(p, { gated: true }).trimEnd().endsWith('Nothing changes until you approve it.')).toBe(true);
    const record = renderProposal(p);
    expect(record).not.toContain('until you approve');
    expect(record).toContain('record of what changed');
    expect(record).toContain('rollback');
  });
});

describe('placement — a compiler may only write where the host reads', () => {
  const base = {
    requirementId: 'p1', requirementText: 'Open on the concrete moment.',
    currentContent: '# My Skill\n\nSome prose.\n',
  };

  it('a section in SKILL.md is reachable — the host always loads the entry point', () => {
    const r = planPlacement('skill_methodology', { ...base, path: 'SKILL.md', entryContent: base.currentContent });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reachability.reachable).toBe(true);
      expect(r.companions).toHaveLength(0);
      // heading names the RULE, not the requirement id — see atelier-compiler-apply.test.ts
      expect(r.edit.replace).toContain('## Open on the concrete moment');
    }
  });

  it('POLARITY: a reference file nothing points at is REFUSED, not written', () => {
    // The serve-nothing defect in a Claude Code skill. Writing here would succeed, install
    // cleanly, and serve nothing — and would then read as a behavioural miss.
    const r = planPlacement('knowledge_unit', {
      ...base, path: 'references/voice.md', currentContent: '# Voice\n',
      entryContent: '# My Skill\n\nSome prose with no links.\n',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('never loads it');
      expect(r.reason).toContain('installed and dark');
    }
  });

  it('the same reference file IS allowed once the entry point names it', () => {
    const r = planPlacement('knowledge_unit', {
      ...base, path: 'references/voice.md', currentContent: '# Voice\n',
      entryContent: '# My Skill\n\nSee references/voice.md for the details.\n',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.companions).toHaveLength(0);
  });

  it('the reference probe reads the ENTRY, not the file it just wrote', () => {
    // Probing the file you edited always says yes. That is the mistake the law exists to prevent.
    const written = '# Voice\n\n## P1\n\nOpen on the concrete moment.\n';
    const v = ReferenceDoc.reachabilityProbe(written, {
      ...base, path: 'references/voice.md', currentContent: '# Voice\n', entryContent: '# My Skill\n' });
    expect(v.reachable).toBe(false);
  });

  it('refuses to add a second statement of a rule the file already carries', () => {
    // Collision is detected on the rule's own heading. The earlier form of this test used "## P1",
    // which stopped colliding the moment headings started naming rules instead of counters — it
    // would have gone on passing while testing nothing.
    const existing = '# My Skill\n\n## Open on the concrete moment\n\nAlready here.\n';
    const r = planPlacement('skill_methodology', {
      ...base, path: 'SKILL.md', currentContent: existing, entryContent: existing });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('drift apart');
  });

  it('a kind with no adapter is refused loudly, never written on a guess', () => {
    expect(adapterFor('evaluator')).toBeNull();
    const r = planPlacement('evaluator', { ...base, path: 'evals/rubric.yml', entryContent: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('cannot prove the host reads');
  });

  it('a mangled heading fails the probe even in the always-loaded file', () => {
    const v = SkillMdSection.reachabilityProbe('# My Skill\n\nsome text P1 inline\n',
      { ...base, path: 'SKILL.md', entryContent: '' });
    expect(v.reachable).toBe(false);
    expect(v.why).toContain('preceding section');
  });
});
