// tests/atelier-install-tree.test.ts — THE INSTALLED DIRECTORY IS THE PACKAGE, AND NOTHING ELSE.
//
// Found by an independent audit at d61cf7e: install() wrote the package's files over whatever the skill
// directory held and never cleared it, so installs were additive across builds. After a rebuild the
// directory held 16 example files against a package of 5, four of them rules the owner had REJECTED,
// and `atelier inspect` reported "installed file matches the package that was built" — the verifier
// iterated only the files the package names, so it could not see an added one.
//
// A rejected rule sitting in examples/ as a complete statement is read by any host that globs the
// directory. That contradicts the one promise the product makes, so both halves are pinned here, for
// both hosts.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { CodexAdapter } from '../adapters/codex/adapter.js';
import type { HostAdapter, InstallablePackage } from '../adapters/host-adapter.js';
import { packageHashOf, sha } from '../core/state/receipt.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const pkg = (files: Record<string, string>): InstallablePackage => ({ skillId: 'voice', files, packageHash: packageHashOf(files) });

const v1 = pkg({ 'SKILL.md': '# v1', 'examples/p1.md': 'kept', 'examples/p8.md': 'REJECTED LATER' });
const v2 = pkg({ 'SKILL.md': '# v2', 'examples/p1.md': 'kept' });

const hosts: readonly [string, HostAdapter, string][] = [
  ['claude-code', new ClaudeCodeAdapter(), '.claude/skills/voice'],
  ['codex', new CodexAdapter(), '.codex/skills/voice'],
];

describe.each(hosts)('%s: install replaces, verify enumerates', (_id, host, rel) => {
  it('a rebuild removes the example of a rule the second standard dropped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    expect(host.install(v1, dir).ok).toBe(true);
    expect(host.install(v2, dir).ok).toBe(true);
    expect(existsSync(join(dir, rel, 'examples', 'p8.md'))).toBe(false);
    expect(host.verifyInstallation(v2, dir).matchesPackage).toBe(true);
    // nothing staged is left where the host would load it as a second skill
    expect(readdirSync(join(dir, rel, '..'))).toEqual(['voice']);
  });

  it('a file Atelier never wrote is MOVED aside, never deleted, and the result says where', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    mkdirSync(join(dir, rel, 'scripts'), { recursive: true });
    writeFileSync(join(dir, rel, 'SKILL.md'), '# my own skill');
    writeFileSync(join(dir, rel, 'scripts', 'run.sh'), 'echo mine');
    const r = host.install(v2, dir);
    expect(r.ok).toBe(true);
    const moved = r.ok ? r.backedUp : null;
    expect(moved?.files).toEqual(['SKILL.md', 'scripts/run.sh']);
    expect(readFileSync(join(moved!.to, 'scripts', 'run.sh'), 'utf8')).toBe('echo mine');
    expect(readFileSync(join(moved!.to, 'SKILL.md'), 'utf8')).toBe('# my own skill');
    // and the backup is outside the skills directory, so the host never loads it
    expect(moved!.to.includes(`${join(dir, rel, '..')}/`)).toBe(false);
  });

  it('a hand-written SKILL.md alone is kept too — only a pristine Atelier install is discarded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    mkdirSync(join(dir, rel), { recursive: true });
    writeFileSync(join(dir, rel, 'SKILL.md'), '# mine');
    const r = host.install(v2, dir);
    expect(r.ok && r.backedUp?.files).toEqual(['SKILL.md']);
    // and an Atelier install followed by an edit is kept as well
    writeFileSync(join(dir, rel, 'SKILL.md'), '# v2, edited by hand');
    const r2 = host.install(v1, dir);
    expect(r2.ok && r2.backedUp?.files.length).toBeGreaterThan(0);
    // an untouched Atelier install is simply replaced
    const r3 = host.install(v2, dir);
    expect(r3.ok && r3.backedUp).toBeNull();
  });

  it('a file the package does not name fails verification, and says which', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    host.install(v2, dir);
    writeFileSync(join(dir, rel, 'examples', 'p13.md'), 'a rule nobody ratified');
    const ver = host.verifyInstallation(v2, dir);
    expect(ver.present).toBe(true);
    expect(ver.matchesPackage).toBe(false);
    expect(ver.detail).toContain('examples/p13.md');
  });
});

describe.each(hosts)('%s: backups never collide', (_id, host, rel) => {
  it('two installs over hand-edited files in the same millisecond both succeed, each with its own backup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    const now = Date.prototype.toISOString;
    Date.prototype.toISOString = () => '2026-01-01T00:00:00.000Z';   // freeze the clock: the same stamp twice
    try {
      mkdirSync(join(dir, rel), { recursive: true });
      writeFileSync(join(dir, rel, 'SKILL.md'), '# mine');
      const a = host.install(v2, dir);
      writeFileSync(join(dir, rel, 'SKILL.md'), '# edited again');
      const b = host.install(v1, dir);
      expect(a.ok && b.ok).toBe(true);
      expect(a.ok && b.ok && a.backedUp?.to !== b.backedUp?.to).toBe(true);
    } finally { Date.prototype.toISOString = now; }
  });
});

// THE PACKAGE HASH IS ONE HASH. The renderer hashed the files in the order it wrote them (SKILL.md, the examples, the
// exemplar) and the install marker re-hashed them by sorted name, so an untouched Atelier install never matched its own
// marker: every rebuild moved it aside as "not part of this package", 17 files at a time. One canonical hash, over the
// files by sorted name, is what the renderer, the marker and the verifier all compute.
const v: StandardVersion = {
  standardVersionHash: 'std1', evidenceId: 'ev1', workType: 'notes', authorityState: 'RATIFIED',
  mintedAt: '2026-08-24T00:00:00Z', reason: 'fixture', supersedes: null,
  requirements: [{ requirementId: 'p1', statement: 'Name only the rulers whose actions moved a border.', appliesWhen: 'GENERAL', kind: 'GENERATIVE',
    authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED', wouldBeAbsentIf: null, evidence: 'the rulers who moved a border', evidenceItemId: 'i1',
    materiality: 'REQUIRED', realizationTolerance: 'FLEXIBLE', outputShape: null }],
};
// An exemplar and a contrast file: the renderer writes them after SKILL.md, in that order; by name the contrast file
// comes first, so the writing order and the sorted order differ, which is the case the hash has to survive.
const rendered = renderAgentSkill(v, compileArchitecture(v), 'voice', 'd', { text: 'One whole piece by the author, served with the skill.' },
  [{ key: 'p1', check: 'c', before: 'We leverage A.', after: 'We use A.', statement: v.requirements[0].statement }]);

describe('the package hash is canonical: an untouched install is recognised as Atelier\'s own', () => {
  // sha256 of '{"a.md":"A","b.md":"B"}', first 16 hex digits, computed with sha256sum outside this suite.
  it('is over the files by sorted name, whatever order they were put in', () => {
    expect(packageHashOf({ 'b.md': 'B', 'a.md': 'A' })).toBe('656a50cc3ea3ebed');
    expect(packageHashOf({ 'a.md': 'A', 'b.md': 'B' })).toBe('656a50cc3ea3ebed');
    expect(packageHashOf({ 'a.md': 'A', 'b.md': 'C' })).not.toBe('656a50cc3ea3ebed');
  });

  it.each(hosts)('%s: a rendered package installed twice moves nothing aside, and no backup directory appears', (_id, host, rel) => {
    // The property only bites when the renderer's order is not the sorted one; a package where the two agree proves nothing.
    expect(Object.keys(rendered.files)).not.toEqual([...Object.keys(rendered.files)].sort());
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    expect(host.install(rendered, dir).ok).toBe(true);
    const again = host.install(rendered, dir);
    expect(again.ok && again.backedUp).toBeNull();
    expect(existsSync(join(dir, rel, '..', '..', '.atelier-backups'))).toBe(false);
    expect(host.verifyInstallation(rendered, dir).matchesPackage).toBe(true);
    // and a SKILL.md edited by hand is still foreign: moved aside, named
    writeFileSync(join(dir, rel, 'SKILL.md'), `${rendered.files['SKILL.md']}\nedited by hand\n`);
    const r3 = host.install(rendered, dir);
    expect(r3.ok && r3.backedUp?.files).toContain('SKILL.md');
    expect(existsSync(join(dir, rel, '..', '..', '.atelier-backups'))).toBe(true);
  });
});

describe('an install marked by the version before this one is recognised as Atelier\'s own', () => {
  it.each(hosts)('%s: a marker carrying the writing-order hash: the next rebuild moves nothing aside; a hand-edited file is still moved', (_id, host, rel) => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-tree-'));
    expect(host.install(rendered, dir).ok).toBe(true);
    // what a 1.0 install wrote: the hash over the files in writing order, the files listed by name
    const legacy = { packageHash: sha(JSON.stringify(rendered.files)), files: Object.keys(rendered.files).sort() };
    expect(legacy.packageHash).not.toBe(rendered.packageHash);
    writeFileSync(join(dir, rel, '.atelier-install.json'), JSON.stringify(legacy));
    const again = host.install(rendered, dir);
    expect(again.ok && again.backedUp).toBeNull();
    expect(existsSync(join(dir, rel, '..', '..', '.atelier-backups'))).toBe(false);
    // and under the old marker too, an edit is foreign
    writeFileSync(join(dir, rel, '.atelier-install.json'), JSON.stringify(legacy));
    writeFileSync(join(dir, rel, 'SKILL.md'), `${rendered.files['SKILL.md']}\nedited by hand\n`);
    const r3 = host.install(rendered, dir);
    expect(r3.ok && r3.backedUp?.files).toContain('SKILL.md');
  });
});
