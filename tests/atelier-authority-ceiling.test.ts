// P0: unconfirmed discovery may never become hard runtime authority, by ANY path.
import { describe, it, expect } from 'vitest';
import { componentFor, roleFor } from '../core/architecture/compile.js';
import { assertAuthorityCeiling } from '../core/state/canonical-state.js';
import type { Requirement, Authority } from '../core/state/canonical-state.js';

const req = (o: Partial<Requirement> = {}): Requirement => ({
  requirementId: 'p1', statement: 'I write imperatives in MUST/Never/Always caps.',
  appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED',
  provenance: 'MACHINE_DISCOVERED', evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...o });

describe('nothing unconfirmed shapes output', () => {
  it('an unconfirmed POSITIVE rule observes — the "MUST Never" defect, closed', () => {
    // 16 rules inferred from a third party compiled as 16 ENFORCE components, and the model wrote
    // "It MUST Never change its own objective". Recurrence cannot tell "they decided this" from
    // "it came up", so it may not instruct.
    expect(roleFor(req())).toBe('OBSERVE');
    expect(componentFor(req()).gateRole).toBe('OBSERVE');
  });

  it('and an unconfirmed prohibition still observes — unchanged', () => {
    expect(roleFor(req({ kind: 'BOUNDARY' }))).toBe('OBSERVE');
  });

  it('what unlocks instruction is the person\'s own words, or a confirmed rule its owner declared REQUIRED', () => {
    // Undeclared materiality is source-aware: the person's own sentence is enough authority to
    // instruct; a discovered rule they merely approved stays SHOWN until they say it matters.
    expect(roleFor(req({ authority: 'EXPERT_AUTHORED' }))).toBe('ENFORCE');
    for (const a of ['EXPERT_RATIFIED', 'USER_ADOPTED'] as Authority[]) {
      expect(roleFor(req({ authority: a })), `${a} + undeclared must be shown, not instructed`).toBe('OBSERVE');
      expect(roleFor(req({ authority: a, materiality: 'REQUIRED' }))).toBe('ENFORCE');
    }
  });

  it('NO PATH takes an unconfirmed rule to an enforcing carrier', () => {
    // every materiality, every tolerance, both kinds
    for (const m of ['REQUIRED', 'PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL', null] as const) {
      for (const t of ['STRICT', 'FUNCTIONALLY_EQUIVALENT', 'FLEXIBLE', null] as const) {
        for (const k of ['GENERATIVE', 'BOUNDARY'] as const) {
          const c = componentFor(req({ materiality: m, realizationTolerance: t, kind: k }));
          expect(c.gateRole, `${m}/${t}/${k} escaped`).toBe('OBSERVE');
        }
      }
    }
  });
});

describe('adopting someone else\'s behaviour is not ratifying their standard', () => {
  it('public work may be ADOPTED by a user', () => {
    expect(() => { assertAuthorityCeiling({ provenance: 'PUBLIC_BEHAVIOUR_INFERRED', authority: 'USER_ADOPTED' }); })
      .not.toThrow();
  });

  it('and may never be claimed as the author\'s ratified standard', () => {
    for (const a of ['EXPERT_RATIFIED', 'EXPERT_AUTHORED', 'EXPERT_REJECTED'] as Authority[]) {
      expect(() => { assertAuthorityCeiling({ provenance: 'PUBLIC_BEHAVIOUR_INFERRED', authority: a }); })
        .toThrow(/never asked and ratified nothing/);
    }
  });

  it('the two facts stay separable: adoption sets AUTHORITY and never rewrites PROVENANCE', () => {
    const adopted = req({ provenance: 'PUBLIC_BEHAVIOUR_INFERRED', authority: 'USER_ADOPTED', materiality: 'PREFERRED' });
    expect(adopted.provenance).toBe('PUBLIC_BEHAVIOUR_INFERRED');   // where it came from — immutable
    expect(roleFor(adopted)).toBe('OBSERVE');                        // PREFERRED still does not instruct
    expect(componentFor(adopted).carrier).toBe('EXAMPLE');
  });
});
