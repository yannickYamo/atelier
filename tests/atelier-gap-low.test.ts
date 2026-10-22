// GAP AUDIT 2026-10-22, L1: a run on a standard minted before latitude existed carries no latitude on its record
// (core/eval/record.ts: "absent on a record of a standard minted before latitude existed"), whatever its certificate says.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRunEval } from '../cli/eval-run.js';
import type { InvocationRecord } from '../core/state/canonical-state.js';

describe('L1: no latitude on the record of a pre-latitude standard', () => {
  const L = { root: mkdtempSync(join(tmpdir(), 'atelier-l1-')), skillName: 'old' };
  const rec = (run: string) => ({ invocationId: 'i0000000011', skillVersionHash: 'sv', at: '2026-10-22T00:00:00Z', output: 'A plain note.',
    observedRuntime: { resolvedModel: 'm' }, runtimeBinding: { requestedModel: 'm' }, settings: { certificate: { latitude: { skill: 'GROUNDED', run, tightenedBy: null, setBy: 'default' } } } }) as unknown as InvocationRecord;
  const input = (std: object, run = 'GROUNDED') => ({ L, rec: rec(run), std: { standardVersionHash: 'h', requirements: [], ...std } as never, sensor: undefined, claimsOff: false, answers: false, profile: null,
    format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: 0, durationMs: 1, drafts: 1, applicability: [], contract: false,
    report: { skill: 'old', standardVersionHash: 'h', checked: [], unchecked: [], conditional: [], failed: false } });
  it('absent where the standard has none', () => {
    expect(buildRunEval(input({})).record?.latitude).toBeUndefined();
  });
  it('present, the run\'s level, where it has one', () => {
    expect(buildRunEval(input({ latitude: { level: 'CREATIVE', evidence: [], by: 'owner' } }, 'STRICT')).record?.latitude).toBe('STRICT');
  });
});

import { relationOf } from '../core/composite/traits.js';

describe('R1: whether a rule bans is the polarity reading\'s (the rule\'s kind), never a negative word found in it', () => {
  it('two things to do on one subject, one of them with "without" in it: the same trait', () => {
    const a = { statement: 'Open with a personal story from the week.', kind: 'GENERATIVE' as const };
    const b = { statement: 'Open with a story from the week, without the personal.', kind: 'GENERATIVE' as const };
    expect(relationOf(a, b)).toBe('SAME');
  });
  it('the reading says one is a prohibition: a conflict', () => {
    const a = { statement: 'Open with a personal story from the week.', kind: 'GENERATIVE' as const };
    const b = { statement: 'Open with a personal story from the week, never.', kind: 'BOUNDARY' as const };
    expect(relationOf(a, b)).toBe('CONFLICT');
  });
});

import { intentModeOf } from '../cli/intent.js';

describe('R3: what a skill is for is the intent reading\'s, wherever it is asked', () => {
  const said = (mode: string, quote: string) => ({ complete: () => Promise.resolve({ json: { mode, quote }, cost: { usd: 0 } }) }) as never;
  it('with no mode kept, the reading decides: "help our customers with their orders" answers people', async () => {
    expect(await intentModeOf({ text: 'Help our customers with their orders' }, said('RESPOND', 'Help our customers'), 'reader')).toBe('RESPOND');
  });
  it('a mode kept with the run is used as it is; nothing said is producing', async () => {
    expect(await intentModeOf({ text: 'anything', mode: 'GUARD' }, said('RESPOND', 'anything'), 'reader')).toBe('GUARD');
    expect(await intentModeOf(null, null, null)).toBe('GENERATE');
  });
});
