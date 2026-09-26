// tests/atelier-install-tree.test.ts — THE INSTALLED DIRECTORY IS THE PACKAGE, AND NOTHING ELSE.
//
// Found by an independent audit at e3b21f5: install() wrote the package's files over whatever the skill
// directory held and never cleared it, so installs were additive across builds. After a rebuild the
// directory held 16 example files against a package of 5, four of them rules the owner had REJECTED,
// and `atelier inspect` reported "installed file matches the package that was built" — the verifier
// iterated only the files the package names, so it could not see an added one.
//
// A rejected rule sitting in examples/ as a complete statement is read by any host that globs the
// directory. That contradicts the one promise the product makes, so both halves are pinned here, for
// both hosts.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { CodexAdapter } from '../adapters/codex/adapter.js';
import type { HostAdapter, InstallablePackage } from '../adapters/host-adapter.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const pkg = (files: Record<string, string>): InstallablePackage => ({ skillId: 'voice', files, packageHash: sha(JSON.stringify(files)) });

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
    // no staging directory is left beside the skill
    expect(readdirSync(join(dir, rel, '..'))).toEqual(['voice']);
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
