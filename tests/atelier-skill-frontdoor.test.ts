// tests/atelier-skill-frontdoor.test.ts — WHAT THE PERSON HAS DECIDES THE ROUTE. NOTHING ELSE.
//
// An earlier design routed on how ARTICULABLE a request seemed, and that was wrong twice: a
// standard's difficulty is not visible at the front door, and the contract-lift study then measured
// a rule someone could state perfectly being hard to EXECUTE. Acquisition and execution difficulty
// are different problems and only the first is knowable here.
//
// So the route reads the INPUTS and nothing about their meaning, which is what makes it testable
// without a model and impossible to get subtly wrong.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { routeFor } from '../cli/commands/skill.js';

const real = (): string => mkdtempSync(join(tmpdir(), 'atelier-front-'));

describe('the route is read off what was supplied', () => {
  it('a sentence and no work: they can state it', () => {
    const d = routeFor('answers should lead with the action', null);
    expect(d.route).toBe('DIRECT');
  });

  it('work and no sentence: the rules are read from it', () => {
    expect(routeFor(null, real()).route).toBe('DISCOVER');
  });

  it('both: state what they said, read the work for the rest', () => {
    expect(routeFor('make it sound like me', real()).route).toBe('HYBRID');
  });

  it('neither: one question, and nothing else', () => {
    const d = routeFor(null, null);
    expect(d.route).toBe('NEEDS_INPUT');
    expect(d.question).toBeTruthy();
  });

  it('a path that does not exist is a question, not a discovery run', () => {
    // Falling through to DIRECT here would silently treat the missing path as a prompt.
    const d = routeFor(null, '/definitely/not/here');
    expect(d.route).toBe('NEEDS_INPUT');
    expect(d.why).toMatch(/nothing at/);
  });

  it('whitespace is not a statement', () => {
    expect(routeFor('   \n  ', null).route).toBe('NEEDS_INPUT');
  });

  it('every route says why, because a route is a decision', () => {
    for (const d of [routeFor('x', null), routeFor(null, real()), routeFor('x', real()), routeFor(null, null)]) {
      expect(d.why).toBeTruthy();
    }
  });
});

describe('saying something is not ratifying it', () => {
  // Source-level: the property is which authority a proposed rule receives, and a behavioural test
  // would need a model. Comments stripped — prose describing the rule is not the rule.
  const code = readFileSync('cli/commands/skill.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('a faithful separation is the person\'s own rule', () => {
    expect(code).toMatch(/p\.faithful \? 'EXPERT_AUTHORED' : 'DERIVED_UNRATIFIED'/);
    expect(code).toMatch(/p\.faithful \? 'EXPERT_STATED' : 'MACHINE_DISCOVERED'/);
  });

  it('anything the model supplied cannot instruct until someone says so', () => {
    // `componentFor` serves a DERIVED_UNRATIFIED rule as an EXAMPLE under OBSERVE, so an invented
    // rule reaches the model as something it was shown and never as something it was told.
    expect(code).toContain('DERIVED_UNRATIFIED');
    expect(code, 'an unratified proposal was filed as the person\'s own authority')
      .not.toMatch(/faithful[^?]*\?\s*'DERIVED_UNRATIFIED'\s*:\s*'EXPERT_AUTHORED'/);
  });

  it('nothing compiles without an explicit yes', () => {
    expect(code).toMatch(/argv\.includes\('--yes'\)/);
    const beforeYes = code.slice(0, code.indexOf("argv.includes('--yes')"));
    expect(beforeYes, 'a standard was closed before the person answered').not.toMatch(/ratifyClose\(\)/);
    expect(beforeYes, 'a skill was built before the person answered').not.toMatch(/\bbuild\(/);
  });

  it('the proposer is told to keep the condition out of the statement', () => {
    // Otherwise the compiled rule says the condition twice: "When there are steps, number the steps
    // when there are steps." The statement is the behaviour; appliesWhen is the condition.
    expect(code).toMatch(/condition does NOT belong here/i);
  });
});
