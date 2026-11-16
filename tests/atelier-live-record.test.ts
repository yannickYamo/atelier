// tests/atelier-live-record.test.ts — the release check: which records stand for a commit, and which do not.
import { describe, expect, it } from 'vitest';
import { MAY_DIFFER, whyNot, type LiveRecord } from '../scripts/check-live-record.mjs';

const good: LiveRecord = { commit: 'a'.repeat(40), dirty: false, scripted: false, pass: true, scenarios: [{ name: 'run', pass: true }] };

describe('a live-run record at a release', () => {
  it('stands when every scenario held on a commit that differs only in the record, the changelog and the version', () => {
    expect(whyNot(good, [])).toEqual([]);
    expect(whyNot(good, [...MAY_DIFFER])).toEqual([]);
  });
  it('does not stand when it is missing', () => { expect(whyNot(null, [])).toHaveLength(1); });
  it('does not stand when code changed after the run, and names the file', () => {
    const why = whyNot(good, ['CHANGELOG.md', 'cli/commands/run.ts']);
    expect(why).toHaveLength(1); expect(why[0]).toContain('cli/commands/run.ts'); expect(why[0]).not.toContain('CHANGELOG.md');
  });
  it('does not stand when its commit is no ancestor of the one released', () => { expect(whyNot(good, null)).toHaveLength(1); });
  it.each([
    ['a scripted run', { ...good, scripted: true }],
    ['a run on uncommitted changes', { ...good, dirty: true }],
    ['a scenario that did not hold', { ...good, scenarios: [{ name: 'run', pass: true }, { name: 'fix', pass: false }] }],
    ['a failed run', { ...good, pass: false }],
    ['no scenario', { ...good, scenarios: [] }],
    ['no commit', { ...good, commit: undefined }],
  ] as const)('does not stand for %s', (_what, record) => { expect(whyNot(record, []).length).toBeGreaterThan(0); });
  it('names the scenario that did not hold', () => {
    expect(whyNot({ ...good, pass: false, scenarios: [{ name: 'fix: handed back', pass: false }] }, []).join(' ')).toContain('fix: handed back');
  });
});
