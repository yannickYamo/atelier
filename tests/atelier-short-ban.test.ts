// tests/atelier-short-ban.test.ts — A BAN BUILT FROM 1.1 ON IS READ AT ANY LENGTH; A 1.0 STORE'S BAN KEEPS ITS VERDICT.
import { describe, it, expect } from 'vitest';
import { measure } from '../core/observers/registry.js';
import type { Measurement } from '../core/state/canonical-state.js';

const SHORT_WITH = 'The ferry left late — again. Nobody on the pier was surprised, and the harbour master shrugged.';
const SHORT_WITHOUT = 'The ferry left late again. Nobody on the pier was surprised, and the harbour master shrugged.';
const ban = (anyLength: boolean): Measurement => ({ observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0, ...(anyLength ? { anyLength: 1 } : {}) } });

describe('a dash ban on a short post', () => {
  it('with anyLength: one dash breaks it and none meets it, under 150 words', () => {
    expect(measure(SHORT_WITH, ban(true)).verdict).toBe('VIOLATED');
    expect(measure(SHORT_WITHOUT, ban(true)).verdict).toBe('MET');
  });
  it('a ban a 1.0 store holds (no anyLength) keeps its 1.0 verdict under 150 words', () => {
    expect(measure(SHORT_WITH, ban(false)).verdict).toBe('NOT_APPLICABLE');
  });
});
