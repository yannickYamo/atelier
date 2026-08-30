// tests/atelier-authority-decide.test.ts — ONE FUNCTION ASSIGNS AUTHORITY, AND IT HOLDS THE CEILING.
//
// Five surfaces let a person rule on a requirement, and before `decide()` they were five diverging
// implementations: `ratify-one` skipped the public-source branch and every obligation validation,
// `add` granted authorship directly, and the ceiling guard was called by tests alone. These tests
// pin the collapse: the census proves no other file can grant expert authority, and the matrix
// proves the one function refuses what every route used to be able to launder.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decide } from '../core/ratification/authority.js';
import { aRequirement } from './fixtures.js';

const shown = (o: Parameters<typeof aRequirement>[0] extends infer T ? Partial<T> : never = {}) =>
  aRequirement({ requirementId: 'p1', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED', ...o });

describe('the census: authority is granted in exactly one production file', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.mts') ? [p] : [];
  });

  it("no file but authority.ts ASSIGNS expert authority (`authority: 'EXPERT_AUTHORED' | 'EXPERT_RATIFIED' | 'USER_ADOPTED'`)", () => {
    const offenders: string[] = [];
    for (const dir of ['cli', 'core', 'renderers', 'adapters', 'providers']) {
      for (const f of walk(dir)) {
        // authority.ts IS the one place. boundary-answer.ts sits beside it in the ratification core —
        // the documented scope-decision applier, unwired this slice, next to be routed through decide.
        if (f.startsWith(join('core', 'ratification'))) continue;
        // MethodSpec.authority is a different type with its own provenance record, not a Requirement.
        if (f === join('core', 'discovery', 'chain', 'method-extraction.ts')) continue;
        const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/authority:\s*(?:[^,\n]*\?\s*)?'(?:EXPERT_AUTHORED|EXPERT_RATIFIED|USER_ADOPTED)'/.test(src)) offenders.push(f);
      }
    }
    expect(offenders, 'a second file grants expert authority — route it through decide()').toEqual([]);
  });

  it('the model-supplied faithful flag reaches no authority assignment', () => {
    const src = readFileSync('cli/commands/skill.ts', 'utf8');
    expect(src).not.toMatch(/faithful[^\n]*'EXPERT_AUTHORED'/);
  });
});

describe('the ceiling holds on every verb', () => {
  const publicShown = shown({ provenance: 'PUBLIC_BEHAVIOUR_INFERRED' });

  it('APPROVE / REWRITE / CONTEXTUAL on public-source work yields USER_ADOPTED, never EXPERT_RATIFIED', () => {
    for (const [verb, extra] of [
      ['APPROVE', {}], ['REWRITE', { statement: 'their words' }], ['CONTEXTUAL', { appliesWhen: 'in reviews' }],
    ] as const) {
      const out = decide(publicShown, { verb, ...extra });
      expect(out.requirement.authority, verb).toBe('USER_ADOPTED');
      expect(out.requirement.provenance, verb).toBe('PUBLIC_BEHAVIOUR_INFERRED');
    }
  });

  it('CONFIRM and AMEND refuse public-source work outright — the ceiling throws, it does not downgrade silently', () => {
    expect(() => decide(publicShown, { verb: 'CONFIRM' })).toThrow(/AUTHORITY CEILING/);
    expect(() => decide(publicShown, { verb: 'AMEND', statement: 'reworded' })).toThrow(/AUTHORITY CEILING/);
  });
});

describe('the verbs', () => {
  it('APPROVE keeps the words and records who ratified', () => {
    const out = decide(shown(), { verb: 'APPROVE', materiality: 'REQUIRED' });
    expect(out.requirement.authority).toBe('EXPERT_RATIFIED');
    expect(out.requirement.provenance).toBe('MACHINE_DISCOVERED');
    expect(out.requirement.materiality).toBe('REQUIRED');
    expect(out.ledgerDecision).toBe('APPROVE');
  });

  it('REWRITE without the words is refused; with them it is an EDIT in their words', () => {
    expect(() => decide(shown(), { verb: 'REWRITE' })).toThrow(/own wording/);
    const out = decide(shown(), { verb: 'REWRITE', statement: 'my version' });
    expect(out.requirement.statement).toBe('my version');
    expect(out.requirement.provenance).toBe('SUBSTANTIVELY_REWRITTEN');
    expect(out.ledgerDecision).toBe('EDIT');
  });

  it('CONTEXTUAL needs the condition and records it as an edit', () => {
    expect(() => decide(shown(), { verb: 'CONTEXTUAL' })).toThrow(/condition/);
    const out = decide(shown(), { verb: 'CONTEXTUAL', appliesWhen: 'when the reader is new' });
    expect(out.requirement.appliesWhen).toBe('when the reader is new');
    expect(out.rewritten).toBe(true);
  });

  it('REJECT survives as a record, not an absence', () => {
    const out = decide(shown(), { verb: 'REJECT' });
    expect(out.requirement.authority).toBe('EXPERT_REJECTED');
    expect(out.ledgerDecision).toBe('REJECT');
  });

  it('ADD and STATED are the only paths to EXPERT_AUTHORED', () => {
    const add = decide(shown({ provenance: 'EXPERT_ADDED' }), { verb: 'ADD' });
    expect(add.requirement.authority).toBe('EXPERT_AUTHORED');
    expect(add.requirement.provenance).toBe('EXPERT_ADDED');
    const stated = decide(shown(), { verb: 'STATED' });
    expect(stated.requirement.authority).toBe('EXPERT_AUTHORED');
    expect(stated.requirement.provenance).toBe('EXPERT_STATED');
  });

  it('a kept non-obligation is DECIDED_NOT_A_REQUIREMENT, not deferred', () => {
    expect(decide(shown(), { verb: 'APPROVE', materiality: 'EXEMPLAR_ONLY' }).ledgerDecision).toBe('DECIDED_NOT_A_REQUIREMENT');
    expect(decide(shown(), { verb: 'APPROVE', materiality: 'TOLERATED' }).ledgerDecision).toBe('DECIDED_NOT_A_REQUIREMENT');
  });
});

describe('obligation validation runs on every surface, because it runs inside decide', () => {
  it('unknown materiality and form are refused', () => {
    expect(() => decide(shown(), { verb: 'APPROVE', materiality: 'IMPORTANT' })).toThrow(/materiality must be one of/);
    expect(() => decide(shown(), { verb: 'APPROVE', form: 'LOOSE' })).toThrow(/form must be one of/);
  });

  it('a shape needs REQUIRED, and must be a real object', () => {
    expect(() => decide(shown(), { verb: 'APPROVE', materiality: 'PREFERRED', shape: { v: { type: 'string' } } }))
      .toThrow(/only enforceable on a REQUIRED rule/);
    expect(() => decide(shown(), { verb: 'APPROVE', materiality: 'REQUIRED', shape: 'not json{' })).toThrow(/not valid JSON/);
    const ok = decide(shown(), { verb: 'APPROVE', materiality: 'REQUIRED', shape: { v: { type: 'string' } } });
    expect(ok.requirement.outputShape).toEqual({ v: { type: 'string' } });
  });

  it('a realization carries no materiality of its own, and must point at a real rule', () => {
    const find = (id: string) => (id === 'p9' ? shown({ requirementId: 'p9' }) : undefined);
    expect(() => decide(shown(), { verb: 'APPROVE', realizes: 'p1', findRule: find })).toThrow(/cannot realize itself/);
    expect(() => decide(shown(), { verb: 'APPROVE', realizes: 'p404', findRule: find })).toThrow(/not a rule in this draft/);
    expect(() => decide(shown(), { verb: 'APPROVE', realizes: 'p9', materiality: 'REQUIRED', findRule: find }))
      .toThrow(/does not take a materiality/);
    expect(decide(shown(), { verb: 'APPROVE', realizes: 'p9', findRule: find }).requirement.realizes).toBe('p9');
  });
});

describe('the IMPROVE build writes only what may bind', () => {
  // Source-level, matching this repo's own pattern for ordering guards: the behavioural path needs a
  // full imported-package fixture, and the property is a filter's existence and position.
  const src = readFileSync('cli/commands/build.ts', 'utf8');

  it('changes are filtered to ENFORCE before placement, and the phantom already-handled file is gone', () => {
    const filterAt = src.indexOf("gateRole === 'ENFORCE'");
    const planAt = src.indexOf('planImprovement(');
    expect(filterAt, 'the ENFORCE filter is missing').toBeGreaterThan(-1);
    expect(filterAt, 'the filter must run before placement').toBeLessThan(planAt);
    expect(src).not.toContain('already-handled.json');
  });

  it('what the package already carries is read off the package, not off a file nothing writes', () => {
    expect(src).toMatch(/installedText\.includes\(c\.text\)/);
  });
});
