// atelier/adapters/install-tree.ts — how a package becomes a skill directory, for every host.
//
// Both adapters used to write the package's files over whatever the directory already held and never
// clear it. Installs were additive across builds: a rule the owner REJECTED at the second ratification
// kept its example file from the first build, sitting in examples/ as a complete statement with its
// condition, and any agent that read the directory read it. The verifier checked only the files the
// package names, so it was blind to exactly that addition and reported a match.
//
// The fix is one identity: the directory IS the package. Install replaces the tree whole; verify
// enumerates the tree and fails on anything the package does not name.
import { mkdirSync, readFileSync, existsSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { writeAtomic } from '../core/state/fs-atomic.js';
import type { InstallablePackage, InstallResult, VerificationResult } from './host-adapter.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

const walk = (root: string, d = root): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(root, p) : [relative(root, p).split('\\').join('/')];
});

/**
 * Write the package into a sibling staging directory, then swap it in. A failed write leaves the
 * previous installation untouched rather than half-replaced, and a successful one leaves nothing
 * behind that the package does not contain.
 */
export function installTree(dir: string, pkg: InstallablePackage): InstallResult {
  const staging = `${dir}.installing-${process.pid}`;
  try {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    // A package is a DIRECTORY TREE, not one file. examples/ and contracts/ are nested, and a flat
    // write silently loses them — the host would hold a skill missing exactly the components that
    // carry PREFERRED and REQUIRED-STRICT behaviour.
    for (const [rel, content] of Object.entries(pkg.files)) {
      const target = join(staging, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeAtomic(target, content);
    }
    mkdirSync(dirname(dir), { recursive: true });
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
    return { ok: true, installedAt: dir };
  } catch (e) {
    // Best effort: when the parent is not a directory the staging path cannot exist either, and a
    // cleanup failure must not replace the install failure the caller needs to report.
    try { rmSync(staging, { recursive: true, force: true }); } catch { /* nothing was staged */ }
    return { ok: false, reason: (e as Error).message };
  }
}

export function verifyTree(root: string, pkg: InstallablePackage): VerificationResult {
  const p = join(root, 'SKILL.md');
  if (!existsSync(p)) return { present: false, matchesPackage: false, detail: `not installed at ${p}` };
  // EVERY runtime file, not just SKILL.md. Hashing one file of a multi-file package would pass an
  // installation whose examples or output contract had been edited — and those carry the
  // PREFERRED and REQUIRED-STRICT behaviour, which is exactly what an editor would reach for.
  const onDisk: Record<string, string> = {};
  for (const rel of Object.keys(pkg.files)) {
    const t = join(root, rel);
    if (!existsSync(t)) return { present: true, matchesPackage: false, detail: `MISSING COMPONENT: ${rel} is in the compiled package and not on disk` };
    onDisk[rel] = readFileSync(t, 'utf8');
  }
  // And nothing ELSE. A file the package does not name is still read by a host that globs the
  // directory; the stale example of a rejected rule was exactly such a file.
  const extra = walk(root).filter((rel) => !(rel in pkg.files)).sort();
  if (extra.length) {
    return { present: true, matchesPackage: false,
      detail: `UNCOMPILED FILES IN THE SKILL: ${extra.join(', ')} — not part of the package built from the standard; rebuild or reinstall to remove them` };
  }
  const matches = sha(JSON.stringify(onDisk)) === pkg.packageHash;
  return { present: true, matchesPackage: matches, detail: matches ? 'matches the compiled package' : 'INSTALLED FILES EDITED — they no longer match what was compiled from the standard' };
}
