// tests/atelier-wiring.test.ts — WHAT THE DEFAULT RUN READS OF WHAT THE BUILD WROTE.
//
// 1. a release setting the owner turned on that only the compiled path runs (mode=deep) routes there, as the flag does;
// 2. the example-names check reads every piece the writer can be shown: the whole pieces and the kept ones;
// 3. a skill whose rule checks an earlier check reader read says so, until it is built again.
// (A method rebuild keeping its link to the version it replaces: tests/atelier-build-receipt.test.ts.)
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directWhyNot, releaseOnly } from '../cli/direct.js';
import { servedExamples, staleChecks } from '../cli/checks.js';
import { DEFAULT_SETTINGS } from '../core/fidelity/types.js';
import { argv, sha } from '../cli/runtime.js';
import { READER_KEY } from '../core/method/freeze.js';
import * as store from '../core/state/store.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { Voice } from '../core/compiler/voice.js';

const std = { requirements: [], latitude: { level: 'GROUNDED' } } as unknown as StandardVersion;
const voice = { wholePieces: [{ text: '# A\n\nbody', request: null }] } as unknown as Voice;
const base = { voice, std, contract: false, strict: false };

describe('1. a setting the owner turned on is asked as its flag is', () => {
  it('mode=deep, and every other opt-in the compiled path runs, takes the compiled path, said', () => {
    expect(directWhyNot({ ...base, settings: { ...DEFAULT_SETTINGS, mode: 'deep' } })).toBe('the skill\'s release sets mode=deep, which the compiled path runs');
    expect(releaseOnly({ ...DEFAULT_SETTINGS, voice: 'incontext' })).toBe('voice=incontext');
    expect(releaseOnly({ ...DEFAULT_SETTINGS, moves: 'serve' })).toBe('moves=serve');
  });
  it('--pipeline direct wins over a release setting; a rule the judgement reader earned the right to hold takes the compiled path', () => {
    argv.push('--pipeline', 'direct');
    try {
      expect(directWhyNot({ ...base, settings: { ...DEFAULT_SETTINGS, mode: 'deep' } })).toBeNull();
      expect(directWhyNot({ ...base, vetoEarned: true })).toBeNull();
    } finally { argv.splice(argv.length - 2, 2); }
    expect(directWhyNot({ ...base, vetoEarned: true })).toBe('a rule your labels qualified the judgement reader to hold is read on the compiled path');
    expect(directWhyNot({ ...base, vetoEarned: false })).toBeNull();
  });
  it('the release\'s own defaults stay direct: two drafts are the compiled path\'s default, not a choice', () => {
    expect(directWhyNot({ ...base, settings: DEFAULT_SETTINGS })).toBeNull();
    expect(directWhyNot({ ...base, settings: { ...DEFAULT_SETTINGS, moves: 'observe' } })).toBeNull();
    expect(directWhyNot({ ...base, settings: null })).toBeNull();
  });
});

const layout = (): store.StoreLayout => ({ root: mkdtempSync(join(tmpdir(), 'atelier-wiring-')), skillName: 's' });

describe('2. the example-names check reads what the writer can be shown', () => {
  it('the whole pieces and the kept ones, beside the served pieces and the exemplar', () => {
    const L = layout();
    store.setVoice(L, { pieces: ['Served piece about Acme.'], wholePieces: [{ text: 'Whole piece about Globex.', request: 'Write about Globex.' }] } as unknown as Voice);
    store.setKept(L, [{ id: 'k', at: '2026-11-08', request: null, text: 'Kept piece about Initech.', from: null, edits: [] }]);
    const ex = servedExamples(L);
    for (const t of ['Served piece about Acme.', 'Whole piece about Globex.', 'Write about Globex.', 'Kept piece about Initech.']) expect(ex).toContain(t);
  });
});

describe('3. checks read by an earlier check reader are said', () => {
  const METHOD = '1. Open on the problem.\n2. End on an idea.';
  const ledger = { methodHash: sha(METHOD), steps: 3, checked: 2, by: 'model' as const, failed: [], conflicts: [] };
  it('another reader\'s checks are stale; ones with no reader recorded may be; the current reader\'s are not', () => {
    const L = layout();
    store.setMethod(L, METHOD);
    expect(staleChecks(L)).toBeNull();
    store.putStepLedger(L, { ...ledger, reader: 'an earlier reader' });
    expect(staleChecks(L)).toBe('your rules\' checks were read by an earlier version of the check reader; they run as they were until the skill is built again with atelier new');
    store.putStepLedger(L, ledger);
    expect(staleChecks(L)).toBe('your rules\' checks were read before Atelier recorded which check reader read them; if this skill was built before 8 November 2026, build it again with atelier new to read them with the current one');
    store.putStepLedger(L, { ...ledger, reader: READER_KEY });
    expect(staleChecks(L)).toBeNull();
  });
  it('the ledger of a method the skill no longer holds says nothing: built again from its pieces alone, it is not stale', () => {
    const L = layout();
    store.putStepLedger(L, { ...ledger, reader: 'an earlier reader' });
    expect(staleChecks(L)).toBeNull();
    store.setMethod(L, 'another method');
    expect(staleChecks(L)).toBeNull();
  });
  it('checks no model read are read at any build: never stale', () => {
    const L = layout();
    store.putStepLedger(L, { ...ledger, by: 'floor' });
    expect(staleChecks(L)).toBeNull();
  });
});
