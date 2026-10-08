// tests/atelier-learning-runs.test.ts — WHAT A SKILL LEARNS FROM ITS RUNS NEVER INCLUDES A RUN MARKED AS A TEST.
//
// A held-back case run by `atelier reproduce`, or a benchmark answer, is a measurement of the skill. Read back into
// recurrence mining, break rates, the learned tell list or the search over implementations, the next run of that
// case measures a skill that has seen it. The exclusion is made in one place (core/state/store.ts,
// `listLearningInvocations`), and this holds every reader of runs to a choice: the history, by name, or what may be
// learned from.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') || p.endsWith('.mts') ? [p] : []; });

/** Readers of the whole history, each with why a test run belongs in what it reads. */
const HISTORY: Readonly<Record<string, string>> = {
  'core/state/store.ts': 'defines both readings',
  'core/runtime/record.ts': 'numbers a run among every run of the same input',
  'cli/commands/invoke.ts': 'compares the model that answered with the one that answered before, on any run',
  'cli/commands/fix.ts': 'looks one named run up',
  'cli/commands/promote.ts': 'reads the runs of a candidate the owner named for a comparison',
  'cli/commands/eval.ts': 'names the test runs so that they can be left out of its counts',
};

describe('every reader of a skill\'s runs says whether it reads the history or what may be learned from', () => {
  it('only the named readers take the whole history', () => {
    const whole = [...files('cli'), ...files('core')].filter((f) => /\blistInvocations\(/.test(readFileSync(f, 'utf8')));
    expect(whole.sort()).toEqual(Object.keys(HISTORY).sort());
  });
  it('the readers that change what a skill does next read only what may be learned from', () => {
    for (const f of ['cli/commands/tend.ts', 'cli/commands/mine.ts', 'cli/commands/tells.ts', 'cli/commands/fidelity.ts', 'cli/commands/optimize.ts', 'cli/commands/improve.ts', 'cli/commands/build.ts']) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).toMatch(/listLearningInvocations\(/);
      expect(text, f).not.toMatch(/\blistInvocations\(/);
    }
  });
});
