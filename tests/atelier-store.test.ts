import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initStore, putStandard, getStandard, putSkillVersion, setActive, history, appendEvent, readEvents, type StoreLayout } from '../core/state/store.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill, skillNameFrom } from '../renderers/agent-skill/render.js';
import type { StandardVersion, Requirement, SkillVersion } from '../core/state/canonical-state.js';

const req = (o: Partial<Requirement> & { requirementId: string }): Requirement => ({
  statement: 'Open with a concrete scene.', appliesWhen: 'GENERAL', kind: 'GENERATIVE',
  authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: 'e', evidenceItemId: 'i', ...o,
});
const std = (o: Partial<StandardVersion> = {}): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: 'ev1', workType: 'blog', authorityState: 'RATIFIED', mintedAt: '2026-08-19T00:00:00Z',
  supersedes: null, reason: null, requirements: [req({ requirementId: 'r1' })], ...o,
});
const sv = (h: string, standard: string, at: string): SkillVersion =>
  ({ skillVersionHash: h, skillName: 'my-voice', standardVersionHash: standard, architectureHash: 'a1', materializedHash: 'm1', builtAt: at });

let L: StoreLayout;
beforeEach(() => { L = { root: mkdtempSync(join(tmpdir(), 'atelier-')), skillName: 'my-voice' }; initStore(L); });

describe('the store is append-only; rollback is a pointer move', () => {
  it('refuses two different bodies under one version hash', () => {
    putStandard(L, std());
    expect(() => { putStandard(L, std()); }).not.toThrow();                       // idempotent
    expect(() => { putStandard(L, std({ workType: 'journal' })); }).toThrow(/two bodies cannot share one/);
  });

  it('keeps every version and rolls back by moving one pointer', () => {
    const v1 = std();
    const v2 = std({ standardVersionHash: 'sv2', supersedes: 'sv1', reason: 'expert added two boundaries' });
    for (const v of [v1, v2]) putStandard(L, v);
    putSkillVersion(L, sv('k1', 'sv1', '2026-08-01T00:00:00Z'));
    putSkillVersion(L, sv('k2', 'sv2', '2026-08-19T00:00:00Z'));

    setActive(L, 'k2');
    expect(history(L).map((h) => h.active)).toEqual([true, false]);          // newest first, newest active

    setActive(L, 'k1');                                                      // ROLLBACK
    const h = history(L);
    expect(h).toHaveLength(2);                                               // history intact
    expect(h[1].active).toBe(true);
    expect(getStandard(L, 'sv2')).not.toBeNull();                            // superseded standard still readable
  });

  it('cannot activate a version that was never built', () => {
    expect(() => { setActive(L, 'nope'); }).toThrow(/points at history; it does not create it/);
  });

  it('refuses a supersession with no reason', () => {
    expect(() => { putStandard(L, std({ standardVersionHash: 'sv9', supersedes: 'sv1', reason: null })); }).toThrow(/no recorded reason/);
  });

  it('events append and never rewrite', () => {
    appendEvent(L, { kind: 'FEEDBACK', at: 'T1', skillVersionHash: 'x', verdict: 'GOOD', note: null });
    appendEvent(L, { kind: 'FEEDBACK', at: 'T2', skillVersionHash: 'x', verdict: 'BAD', note: 'too formal' });
    const e = readEvents(L);
    expect(e).toHaveLength(2);
    expect(e[1]).toMatchObject({ verdict: 'BAD', note: 'too formal' });
  });
});

describe('skill identity survives the move between hosts', () => {
  it('normalises to kebab-case and refuses empty', () => {
    expect(skillNameFrom('My Voice! (v2)')).toBe('my-voice-v2');
    expect(() => skillNameFrom('!!!')).toThrow(/at least one alphanumeric/);
  });

  it('rendering is deterministic — the package hash proves what was installed', () => {
    const a = renderAgentSkill(std(), compileArchitecture(std()), 'my-voice', 'd');
    const b = renderAgentSkill(std(), compileArchitecture(std()), 'my-voice', 'd');
    expect(a.packageHash).toBe(b.packageHash);
  });

  it('there is NO inverse — no parser turns SKILL.md back into authority', async () => {
    const m = await import('../renderers/agent-skill/render.js');
    expect(Object.keys(m).some((k) => /parse|readSkill|loadSkill/i.test(k))).toBe(false);
  });
});
