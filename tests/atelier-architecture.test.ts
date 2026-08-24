// tests/atelier-architecture.test.ts — THE LAW, ASSERTED WHERE IT CAN FAIL.
//
//   STANDARD        what the expert means      stable
//   ARCHITECTURE    how a model realizes it    free to change
//
// Before this module existed, `architectureHash` was a hash of the standard's own requirement ids,
// so `SkillVersion` was a pure function of `StandardVersion` and the implementation could not move
// unless the standard did. The law was not merely unenforced — it was arithmetically impossible.
// The first test here is the one that would have caught that, and it is the reason the rest matter.

import { describe, it, expect } from 'vitest';
import {
  compileArchitecture, componentFor, observedBoundaries, assertArchitectureServesStandard,
  assertNothingRejectedIsServed, roleFor,
} from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { authorityStateOf } from '../core/state/canonical-state.js';
import type { Requirement, StandardVersion, Authority, RuleKind } from '../core/state/canonical-state.js';

const req = (id: string, kind: RuleKind, authority: Authority, statement = `rule ${id}`): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind, authority,
  provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: 'span', evidenceItemId: 'w1',
});

const std = (requirements: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: 'ev1', workType: 'writing',
  requirements, authorityState: 'RATIFIED', mintedAt: '2026-08-19T00:00:00Z', supersedes: null, reason: null,
});

describe('the implementation can move while the standard stands still', () => {
  it('ONE standard under TWO architectures produces TWO different skills', () => {
    const v = std([req('r1', 'GENERATIVE', 'EXPERT_RATIFIED')]);
    const asIs = compileArchitecture(v);

    // What an optimizer is allowed to do: re-arrange. Same requirement, carried differently.
    const rearranged = {
      ...asIs,
      architectureHash: 'arch-variant',
      components: asIs.components.map((c) => ({ ...c, carrier: 'SELF_CHECK' as const, id: `${c.id}-v2` })),
    };

    const a = renderAgentSkill(v, asIs, 'my-voice', 'd');
    const b = renderAgentSkill(v, rearranged, 'my-voice', 'd');

    expect(a.standardVersionHash).toBe(b.standardVersionHash);   // the target did not move
    expect(a.architectureHash).not.toBe(b.architectureHash);     // the arrangement did
  });

  it('the architecture hash is over COMPONENTS, not over the requirement list', () => {
    const v = std([req('r1', 'BOUNDARY', 'DERIVED_UNRATIFIED')]);
    const observed = compileArchitecture(v);
    // Same standard hash, same requirement ids, one authority change — and the arrangement differs,
    // because the rule moved from watched to enforced. A requirement-id hash could never see this.
    const confirmed = compileArchitecture(std([req('r1', 'BOUNDARY', 'EXPERT_RATIFIED')]));
    expect(observed.architectureHash).not.toBe(confirmed.architectureHash);
  });
});

describe('an inferred prohibition does not shape output until someone confirms it', () => {
  const unconfirmed = req('b1', 'BOUNDARY', 'DERIVED_UNRATIFIED', 'never polish out informal punctuation');
  const confirmed = req('b2', 'BOUNDARY', 'EXPERT_RATIFIED', 'never open with a rhetorical question');
  const positive = req('g1', 'GENERATIVE', 'DERIVED_UNRATIFIED', 'lead with the decision');

  it('unconfirmed BOUNDARY compiles to OBSERVE; confirmed BOUNDARY enforces', () => {
    expect(componentFor(unconfirmed).gateRole).toBe('OBSERVE');
    expect(componentFor(confirmed).gateRole).toBe('ENFORCE');
  });

  it('THE ASYMMETRY, CORRECTED: an unconfirmed POSITIVE rule is SHOWN, never instructed', () => {
    // The asymmetry was right about EVIDENCE and wrong about OBLIGATION. A positive rule is an
    // existence proof — the corpus contains the thing — so it deserves to reach the model, and a
    // prohibition inferred from absence proves nothing and stays in self-check.
    //
    // But an existence proof is not an obligation. Sixteen unconfirmed rules inferred from a third
    // party's public writing compiled as sixteen ENFORCE components and the model wrote "It MUST
    // Never change its own objective" — recurrence turned into law with nobody asked. Shown as an
    // example, the evidence still reaches the model and nothing binds until a person says so.
    expect(componentFor(positive).gateRole).toBe('OBSERVE');
    expect(componentFor(positive).carrier).toBe('EXAMPLE');
    expect(componentFor(unconfirmed).carrier).toBe('SELF_CHECK');   // prohibition, unchanged
  });

  it('nothing unconfirmed reaches the generation instructions', () => {
    const v = std([positive, unconfirmed, confirmed]);
    const md = renderAgentSkill(v, compileArchitecture(v), 'my-voice', 'd').files['SKILL.md'];

    const doSection = md.slice(md.indexOf('## What to do'), md.indexOf('## What not to do'));
    const avoidSection = md.slice(md.indexOf('## What not to do'), md.indexOf('## After you have written it'));
    const selfCheck = md.slice(md.indexOf('## After you have written it'));

    // the unconfirmed positive is SHOWN, in its own example file — not in the instructions
    expect(doSection).not.toContain('lead with the decision');
    const pkg = renderAgentSkill(v, compileArchitecture(v), 'my-voice', 'd');
    expect(pkg.runtime['examples/g1.md']).toContain('lead with the decision');
    expect(pkg.runtime['examples/g1.md']).toMatch(/NOT required/);

    expect(avoidSection).toContain('never open with a rhetorical question');

    // The load-bearing assertion: the unconfirmed prohibition instructs nothing.
    expect(doSection).not.toContain('never polish out informal punctuation');
    expect(avoidSection).not.toContain('never polish out informal punctuation');
    expect(selfCheck).toContain('never polish out informal punctuation');
    expect(selfCheck).toContain('leave the draft as it is');
  });

  it('a standard with nothing unconfirmed emits no self-check section at all', () => {
    const v = std([confirmed]);
    const md = renderAgentSkill(v, compileArchitecture(v), 'my-voice', 'd').files['SKILL.md'];
    expect(md).not.toContain('## After you have written it');
  });

  it('observedBoundaries names exactly what the post-build screen must ask about', () => {
    const v = std([positive, unconfirmed, confirmed]);
    const obs = observedBoundaries(compileArchitecture(v));
    expect(obs.map((c) => c.carries[0])).toEqual(['b1']);
  });
});

describe('the arrangement may move a requirement anywhere and may never change the set', () => {
  const v = std([req('r1', 'GENERATIVE', 'EXPERT_RATIFIED')]);

  it('refuses an architecture compiled for a different standard', () => {
    const foreign = { ...compileArchitecture(v), standardVersionHash: 'sv-other' };
    expect(() => { assertArchitectureServesStandard(foreign, v); }).toThrow(/ARCHITECTURE MISMATCH/);
  });

  it('refuses an architecture that INVENTED a requirement', () => {
    const a = compileArchitecture(v);
    const invented = { ...a, components: [...a.components, { ...a.components[0], id: 'x', carries: ['ghost'] }] };
    expect(() => { assertArchitectureServesStandard(invented, v); }).toThrow(/INVENTED REQUIREMENTS/);
  });

  it('refuses an architecture that DROPPED a requirement — silence is the dangerous failure', () => {
    const dropped = { ...compileArchitecture(v), components: [] };
    expect(() => { assertArchitectureServesStandard(dropped, v); }).toThrow(/DROPPED REQUIREMENTS/);
  });

  it('every component states why it landed where it did', () => {
    for (const c of compileArchitecture(std([req('r1', 'GENERATIVE', 'EXPERT_RATIFIED'), req('b1', 'BOUNDARY', 'DERIVED_UNRATIFIED')])).components) {
      expect(c.rationale.length).toBeGreaterThan(20);
      expect(c.carries.length).toBeGreaterThan(0);
    }
  });
});

describe('THE AUTHORITY SEAM — what an optimizer may not do', () => {
  const unconfirmed = req('b1', 'BOUNDARY', 'DERIVED_UNRATIFIED', 'never polish out informal punctuation');

  it('REFUSES promoting an unconfirmed prohibition from OBSERVE to ENFORCE', () => {
    // The attack this exists to stop: a transaction that invents nothing, drops nothing and serves
    // the same standard, but turns a machine guess into an active suppression rule because a search
    // process found it improved a score. Every other guard passes it.
    const v = std([unconfirmed]);
    const a = compileArchitecture(v);
    const escalated = { ...a, components: a.components.map((c) => ({ ...c, gateRole: 'ENFORCE' as const })) };
    expect(() => { assertArchitectureServesStandard(escalated, v); }).toThrow(/AUTHORITY ESCALATION/);
  });

  it('REFUSES it even when the component is also renamed to look like a confirmed one', () => {
    // Section routing used to key on an id prefix, so renaming `observe:b1` to `avoid:b1` while
    // escalating would have walked the rule into the instructions. Kind and authority cannot be
    // renamed; the id can.
    const v = std([unconfirmed]);
    const a = compileArchitecture(v);
    const disguised = { ...a, components: a.components.map((c) => ({ ...c, id: 'avoid:b1', gateRole: 'ENFORCE' as const })) };
    expect(() => { assertArchitectureServesStandard(disguised, v); }).toThrow(/AUTHORITY ESCALATION/);
    expect(() => renderAgentSkill(v, disguised, 'x', 'd')).toThrow(/AUTHORITY ESCALATION/);
  });

  it('ALLOWS the optimizer to change carrier and sensor freely — that is the whole point', () => {
    const v = std([req('r1', 'GENERATIVE', 'EXPERT_RATIFIED'), unconfirmed]);
    const a = compileArchitecture(v);
    const rearranged = { ...a, components: a.components.map((c) => ({ ...c, carrier: 'SELF_CHECK' as const, sensor: 'SELF_REPORT' as const })) };
    expect(() => { assertArchitectureServesStandard(rearranged, v); }).not.toThrow();
  });

  it('the role is DERIVED from authority, so there is one owner of the decision', () => {
    expect(roleFor(unconfirmed)).toBe('OBSERVE');
    expect(roleFor(req('b2', 'BOUNDARY', 'EXPERT_RATIFIED'))).toBe('ENFORCE');
    expect(roleFor(req('b3', 'BOUNDARY', 'EXPERT_AUTHORED'))).toBe('ENFORCE');
    // unconfirmed, in EITHER direction, never instructs — see the corrected asymmetry above
    expect(roleFor(req('g1', 'GENERATIVE', 'DERIVED_UNRATIFIED'))).toBe('OBSERVE');
    expect(roleFor(req('g2', 'GENERATIVE', 'EXPERT_RATIFIED'))).toBe('ENFORCE');
  });

  it('a REJECTED rule can never be compiled, let alone served', () => {
    const v = std([req('x1', 'GENERATIVE', 'EXPERT_REJECTED')]);
    expect(() => { assertNothingRejectedIsServed(v); }).toThrow(/REJECTED REQUIREMENT/);
    expect(() => compileArchitecture(v)).toThrow(/REJECTED REQUIREMENT/);
  });

  it('a standard carrying anything unconfirmed is DRAFT, and says so', () => {
    // The record must not claim authority it does not have. `ratifiedAt` on an object full of
    // machine proposals was exactly that claim.
    expect(authorityStateOf([unconfirmed])).toBe('DRAFT');
    expect(authorityStateOf([req('g1', 'GENERATIVE', 'DERIVED_UNRATIFIED')])).toBe('DRAFT');
    expect(authorityStateOf([req('r1', 'GENERATIVE', 'EXPERT_RATIFIED')])).toBe('RATIFIED');
  });
});

// ─── THE CARRIER MUST REACH THE MODEL, AND IT MUST ADD RATHER THAN REPLACE ────────────────────
//
// Both halves of this block would have passed vacuously before the renderer read `carrier`.
//
// HALF ONE — the carrier reaches served content. `architectureHash` folded `carrier` in, so a
// PROSE -> SELF_CHECK move changed the architecture id and therefore the SkillVersion id, while
// `render.ts` routed purely on gateRole x kind and emitted a BYTE-IDENTICAL SKILL.md. An autoloop
// built on that would hand a person two samples of one skill and call the difference a repair.
//
// HALF TWO — escalation is CUMULATIVE. The historical compiler is substitutive: `editFor` in
// The skill writer in the private predecessor returns METHODOLOGY_PROSE *or* SECTION_CONTRACT,
// never both. Inheriting that here would DELETE the generation-time instruction and leave only a
// post-hoc check — moving the rule from "shape the writing" to "notice afterwards", which is a
// weakening wearing an escalation's clothes. Atelier diverges deliberately:
//
//   PROSE       generation prose
//   SELF_CHECK  generation prose  +  an enforceable pre-finalize check
describe('escalating a carrier changes what the model is actually served', () => {
  const v = std([req('g1', 'GENERATIVE', 'EXPERT_RATIFIED', 'Open on the concrete moment, never on the reflection it produced.')]);
  const atProse = compileArchitecture(v);
  const escalated = {
    ...atProse,
    architectureHash: 'arch-selfcheck',
    components: atProse.components.map((c) => ({ ...c, carrier: 'SELF_CHECK' as const })),
  };

  // The footer stamps `architecture: <hash>` into a trailing HTML comment, so SKILL.md and
  // packageHash differ the instant the hash changes — for a provenance reason, not a behavioural
  // one. Asserting on the whole file would pass while the model still read identical instructions.
  // INSTRUCTIONS() is what the model is actually told.
  const INSTRUCTIONS = (md: string): string => md.split('\n---\n\n<!--')[0];

  it('POLARITY: what the MODEL IS TOLD differs — not merely the provenance stamp', () => {
    const before = renderAgentSkill(v, atProse, 'my-voice', 'd');
    const after = renderAgentSkill(v, escalated, 'my-voice', 'd');

    expect(after.standardVersionHash).toBe(before.standardVersionHash);   // the target did not move
    expect(after.architectureHash).not.toBe(before.architectureHash);     // the arrangement did
    expect(after.packageHash).not.toBe(before.packageHash);

    // this is the one that was vacuous, and the only one that means anything to the model
    expect(INSTRUCTIONS(after.files['SKILL.md'])).not.toBe(INSTRUCTIONS(before.files['SKILL.md']));
  });

  it('CUMULATIVE: the generation instruction survives the escalation, and a check is ADDED', () => {
    const before = renderAgentSkill(v, atProse, 'my-voice', 'd').files['SKILL.md'];
    const after = renderAgentSkill(v, escalated, 'my-voice', 'd').files['SKILL.md'];

    // it was shaping the writing before...
    expect(before).toContain('## What to do');
    expect(before).toContain('Open on the concrete moment');
    expect(before).not.toContain('Before you finalize');

    // ...and it still is. Substitution would have moved it out of the instructions entirely.
    expect(after).toContain('## What to do');
    expect(after).toContain('Open on the concrete moment');
    expect(after).toContain('Before you finalize');

    // the requirement is still the SAME requirement — an escalation may not invent one
    expect(after).toContain('g1');
    expect((after.match(/g1/g) ?? []).length).toBeGreaterThan((before.match(/g1/g) ?? []).length);
  });

  it('an ENFORCE self-check may revise the draft; an OBSERVE one may never', () => {
    // The two land in DIFFERENT sections, keyed on gateRole. One section could not hold both without
    // either licensing revision on an unconfirmed prohibition or forbidding it on a confirmed rule.
    const enforced = renderAgentSkill(v, escalated, 'my-voice', 'd').files['SKILL.md'];
    expect(enforced).toMatch(/Before you finalize[\s\S]*revise/i);

    const unconfirmedV = std([req('b1', 'BOUNDARY', 'DERIVED_UNRATIFIED', 'never polish out informal punctuation')]);
    const observed = renderAgentSkill(unconfirmedV, compileArchitecture(unconfirmedV), 'my-voice', 'd').files['SKILL.md'];
    expect(observed).toContain('After you have written it');
    expect(observed).toContain('leave the draft as it is');
    expect(observed).not.toContain('Before you finalize');
  });
});
