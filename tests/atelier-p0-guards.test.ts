// tests/atelier-p0-guards.test.ts — FOUR DEFECTS THAT SHIPPED, AND THE CHECKS THAT KEEP THEM FIXED.
//
// Each of these was found by an external audit rather than by this suite, and each was invisible to
// it for a different reason. That is the useful part: the gap was never "we forgot to write a test",
// it was four separate ways a check could not see the thing it was supposed to cover.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decide, NOTHING_EARNED } from '../core/convergence/state-machine.js';
import { assertNotAuthority } from '../core/coverage/standard-coverage.js';
import { evidenceFor } from '../core/measurement/longitudinal.js';
import type { Observation } from '../core/measurement/observation.js';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
  return [p];
});

describe('a candidate measured worse is refused, not promoted', () => {
  // The branch was missing entirely, so REGRESSED fell through to the promotion gates and was
  // authorised on the same terms as IMPROVED. `REJECT` was declared in the union and returned from
  // nowhere, which is what a missing branch looks like from outside the file.
  const obs = (o: Partial<Observation>): Observation => ({
    requirementId: 'g1', domain: 'BEHAVIOR', contextId: 'c1', invocationId: 'i1', generationIndex: 0,
    verdict: 'NO_VETO', producer: 'veto-sensor', producerVersion: 'v3',
    authority: 'OBSERVE_ONLY', evidence: null, at: '2026-08-22T00:00:00Z', ...o });

  const base = {
    evidence: evidenceFor('g1', [
      obs({ contextId: 'a', verdict: 'VETO' }), obs({ contextId: 'b', verdict: 'VETO' }),
    ], [], [], new Set(['VETO', 'VIOLATED'])),
    gates: NOTHING_EARNED,
    legalRepairAvailable: true,
    candidateEvaluated: true,
    deliveryValid: true,
  } as Parameters<typeof decide>[0];

  it('REGRESSED terminates as REJECT and never reaches the gates', () => {
    const r = decide({ ...base, comparison: 'REGRESSED' });
    expect(r.terminal).toBe('REJECT');
    expect(r.blockedBy).toEqual([]);
  });

  it('the other verdicts are unchanged, so the new branch did not swallow them', () => {
    expect(decide({ ...base, comparison: 'PLATEAU' }).terminal).toBe('PLATEAU');
    expect(decide({ ...base, comparison: 'UNDERPOWERED' }).terminal).toBe('UNDERPOWERED');
    expect(decide({ ...base, comparison: 'INCONCLUSIVE' }).terminal).toBe('UNDERPOWERED');
  });

  it('REJECT is reachable, having been declared and returned from nowhere', () => {
    const src = readFileSync('core/convergence/state-machine.ts', 'utf8');
    expect(src).toMatch(/terminal:\s*'REJECT'/);
  });
});

describe('no shipped source file is binary to a text tool', () => {
  // placement.ts carried a literal 0x00 as a sentinel. `file` called it data, `grep -r` skipped all
  // 249 lines in silence, and GitHub would not render its diff — so every text audit of this repo,
  // including the ones that were supposed to catch this, had a blind spot exactly there.
  it('contains no NUL byte, which would make grep skip the file without saying so', () => {
    const offenders = ['core', 'cli', 'renderers', 'adapters', 'providers', 'tests', 'scripts']
      .flatMap((d) => walk(d))
      .filter((f) => /\.(ts|mts)$/.test(f))
      .filter((f) => readFileSync(f).includes(0x00));
    expect(offenders, `write the escape '\\0' instead of a raw byte:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('the install command names a package that exists', () => {
  // Baked into capability-check.sh in both host trees and run on SessionStart, so it is the first
  // thing a user with a missing binary reads.
  it('every npm install -g in the plugin trees uses the published name', () => {
    const name = (JSON.parse(readFileSync('package.json', 'utf8')) as { name: string }).name;
    const offenders: string[] = [];
    for (const f of walk('plugins').filter((x) => /\.(sh|mts|json|md)$/.test(x))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/npm install -g ([@\w./-]+)/g)) {
        if (m[1] !== name) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders, `should be ${name}:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('coverage cannot claim to be authority, whatever the wording', () => {
  // The guard ANDed its regex with a substring test over the first token of each example, and those
  // tokens are 'this', 'this' and 'promotion'. So it fired only on claims containing "this" — and
  // its own test passed vacuously because every case it tried happened to contain the word.
  it('refuses the claims it exists to refuse, with and without the stopword', () => {
    for (const c of [
      'the requirement is authoritative',
      'coverage certifies the standard',
      'this StandardVersion is certified',
      'coverage authorises promotion',
      'the rule is ratified by observation',
    ]) {
      expect(() => { assertNotAuthority(c); }, c).toThrow(/COVERAGE AUTHORITY/);
    }
  });

  it('allows an ordinary statement about coverage', () => {
    expect(() => { assertNotAuthority('nine of twelve requirements have been observed'); }).not.toThrow();
  });
});
