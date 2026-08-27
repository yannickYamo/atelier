// tests/atelier-general-scope.test.ts — ONE QUESTION, ONE ANSWER, THIRTEEN ASKERS.
//
// "Does this rule apply everywhere, or only under a stated condition?" was answered at thirteen
// call sites with two different rules. Twelve tested a trimmed case-insensitive prefix; the prose
// baseline in `cli/commands/reference.ts` tested exact case-sensitive equality; one of the twelve
// skipped the trim.
//
// The reason this is a defect and not untidiness: that baseline is the B3_STANDARD_AS_PROSE arm.
// Its purpose is to present the SAME standard stripped of the compiler's machinery, so that a
// comparison against the treatment isolates the compiler. A requirement written `general` was
// unconditional to the renderer and conditional to the baseline. The two arms would have described
// the same standard differently, and the comparison would have been reading a formatting
// disagreement as a difference between arms.
//
// So the behavioural cases below are the values that used to diverge, and the census is what stops
// a fourteenth site from quietly re-forking the rule.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isGeneralScope } from '../core/state/canonical-state.js';

describe('the values that used to be read two different ways', () => {
  it('the canonical spelling is general scope', () => {
    expect(isGeneralScope('GENERAL')).toBe(true);
  });

  it('lowercase is general scope, which the exact-equality site got wrong', () => {
    expect(isGeneralScope('general')).toBe(true);
    expect(isGeneralScope('General')).toBe(true);
  });

  it('surrounding whitespace is general scope, which the untrimmed site got wrong', () => {
    expect(isGeneralScope('  GENERAL  ')).toBe(true);
    expect(isGeneralScope('\tGENERAL\n')).toBe(true);
  });

  it('blank is general scope: a rule naming no condition applies always', () => {
    expect(isGeneralScope('')).toBe(true);
    expect(isGeneralScope('   ')).toBe(true);
  });

  it('a real condition is not general scope', () => {
    expect(isGeneralScope('when pricing enterprise deals')).toBe(false);
    expect(isGeneralScope('drafting a cold email')).toBe(false);
  });

  it('a word that merely starts with the letters is not general scope', () => {
    // The \b is load-bearing. Without it "generalise the claim" would read as unconditional.
    expect(isGeneralScope('generalise the claim before sending')).toBe(false);
    expect(isGeneralScope('GENERALLY_AVAILABLE customers only')).toBe(false);
  });

  it('GENERAL followed by a qualifier is still general scope, and stays a smell', () => {
    // Prefix, not equality: this is the twelve-site behaviour and it is the one kept.
    expect(isGeneralScope('GENERAL, all contexts')).toBe(true);
  });
});

const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
  return p.endsWith('.ts') ? [p] : [];
});

const shipped = (): string[] => ['core', 'cli', 'renderers', 'adapters', 'providers'].flatMap(walk);

/** Comments describe the old rule on purpose; only code counts. */
const codeOf = (f: string): string => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('nothing re-implements the question', () => {
  it('the census can see the tree it is policing', () => {
    expect(shipped().length).toBeGreaterThan(80);
    expect(shipped()).toContain(join('renderers', 'agent-skill', 'render.ts'));
  });

  it('only the owner tests the GENERAL pattern itself', () => {
    const owner = join('core', 'state', 'canonical-state.ts');
    const offenders = shipped()
      .filter((f) => f !== owner)
      .filter((f) => codeOf(f).includes('GENERAL\\b/i'));
    expect(offenders, `call isGeneralScope from ${owner} instead:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('nothing compares appliesWhen to the literal string', () => {
    const offenders = shipped()
      .filter((f) => /appliesWhen\s*[!=]==\s*'GENERAL'/.test(codeOf(f)));
    expect(offenders, `exact equality misses 'general' and ' GENERAL ':\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
